// @ts-check
import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import pool from '../../src/db/pool.js';
import { VaultService } from '../../src/services/payment/vault_service.js';
import { PaymentRouter } from '../../src/services/payment/payment_router.js';
import { PaymentWebhookService } from '../../src/services/payment/webhook_service.js';

test('PRD 4.1: Adversarial Security & Invariant Audit Tests (§6.5)', async (t) => {
  let orgId;
  const testRunId = crypto.randomBytes(4).toString('hex');

  t.before(async () => {
    const orgRes = await pool.query('SELECT id FROM organizations LIMIT 1');
    if (orgRes.rows.length === 0) {
      orgId = crypto.randomUUID();
      await pool.query('INSERT INTO organizations (id, name, slug) VALUES ($1, $2, $3)', [orgId, 'POL Adv Org', `org-${orgId.slice(0, 8)}`]);
    } else {
      orgId = orgRes.rows[0].id;
    }
  });

  t.after(async () => {
    await pool.query('DELETE FROM payment_methods WHERE org_id = $1 AND token LIKE $2', [orgId, `%${testRunId}%`]);
    await pool.query('DELETE FROM payment_transactions WHERE org_id = $1 AND idempotency_key LIKE $2', [orgId, `%${testRunId}%`]);
    await pool.query('DELETE FROM payment_webhook_events WHERE org_id = $1 AND gateway_event_id LIKE $2', [orgId, `%${testRunId}%`]);
  });

  await t.test('(a) Zero Vendor Lock-in: No direct Stripe/PayPal SDK imports outside connectors/', async () => {
    const servicesDir = path.resolve('server/src/services');
    const violations = [];

    function scanDir(dir) {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          if (entry.name !== 'connectors' && entry.name !== 'node_modules') {
            scanDir(fullPath);
          }
        } else if (entry.isFile() && (entry.name.endsWith('.js') || entry.name.endsWith('.mjs'))) {
          const content = fs.readFileSync(fullPath, 'utf8');
          if (
            /from\s+['"]stripe['"]/.test(content) ||
            /require\(['"]stripe['"]\)/.test(content) ||
            /from\s+['"]@paypal\//.test(content) ||
            /require\(['"]@paypal\//.test(content)
          ) {
            violations.push(fullPath);
          }
        }
      }
    }

    scanDir(servicesDir);
    assert.deepEqual(violations, [], `Found prohibited SDK imports outside connectors/: ${violations.join(', ')}`);
  });

  await t.test('(b) Self-Owned Vault PCI DSS: Rejects raw PAN and CVV under all conditions', async () => {
    const customerId = crypto.randomUUID();
    const panAttacks = [
      '4111222233334444', // Visa 16 digits
      '5500000000000004', // Mastercard 16 digits
      '378282246310005',  // Amex 15 digits
      '30569309025904',   // Diners Club 14 digits
    ];

    for (const attackPan of panAttacks) {
      await assert.rejects(
        async () => VaultService.savePaymentMethod({
          orgId,
          environment: 'SANDBOX',
          customerId,
          gateway: 'STRIPE',
          token: attackPan,
        }),
        (err) => {
          assert.equal(err.code, 'PCI_DSS_VIOLATION');
          return true;
        },
      );
    }

    // Verify rawCardData payload is strictly rejected
    await assert.rejects(
      async () => VaultService.savePaymentMethod({
        orgId,
        environment: 'SANDBOX',
        customerId,
        gateway: 'STRIPE',
        token: 'tok_valid_token',
        // @ts-ignore
        rawCardData: { cvv: '123' },
      }),
      (err) => {
        assert.equal(err.code, 'PCI_DSS_VIOLATION');
        return true;
      },
    );

    // Verify DB table contains NO PAN numbers
    const dbCheck = await pool.query(
      `SELECT token FROM payment_methods WHERE org_id = $1 AND token ~ '^[0-9]{13,19}$'`,
      [orgId],
    );
    assert.equal(dbCheck.rows.length, 0, 'Database contains raw PAN card numbers!');
  });

  await t.test('(c) Hard Decline = Stop: System strictly stops and NEVER fails over to next gateway', async () => {
    let secondGatewayCalled = false;

    const router = new PaymentRouter();
    router.registerAdapter('GATEWAY_A', {
      authorize: async () => ({
        success: false,
        isHardDecline: true,
        errorCode: 'fraudulent',
        errorMessage: 'Fraudulent transaction detected',
      }),
    });
    router.registerAdapter('GATEWAY_B', {
      authorize: async () => {
        secondGatewayCalled = true;
        return { success: true };
      },
    });

    await assert.rejects(
      async () => router.routePayment(5000, 'USD', 'tok_attack', `idem_adv_hd_${testRunId}`, {}, {
        priority: ['GATEWAY_A', 'GATEWAY_B'],
      }),
      (err) => {
        assert.equal(err.code, 'HARD_DECLINE');
        return true;
      },
    );

    assert.equal(secondGatewayCalled, false, 'VIOLATION: Gateway B was called after hard decline on Gateway A!');
  });

  await t.test('(d) Smart Failover: Sends unique derived Idempotency-Key per gateway', async () => {
    const receivedKeys = [];

    const router = new PaymentRouter();
    router.registerAdapter('GW1', {
      authorize: async (amount, curr, tok, key) => {
        receivedKeys.push({ gw: 'GW1', key });
        return { success: false, isHardDecline: false, errorMessage: 'Soft timeout' };
      },
    });
    router.registerAdapter('GW2', {
      authorize: async (amount, curr, tok, key) => {
        receivedKeys.push({ gw: 'GW2', key });
        return { success: true, gatewayTxId: 'tx_gw2_success' };
      },
    });

    const rootIdemKey = `root_key_${testRunId}`;
    const result = await router.routePayment(1000, 'USD', 'tok_test', rootIdemKey, {}, {
      priority: ['GW1', 'GW2'],
    });

    assert.equal(result.success, true);
    assert.equal(result.gateway, 'GW2');
    assert.equal(receivedKeys.length, 2);
    assert.equal(receivedKeys[0].key, `${rootIdemKey}_gw1`);
    assert.equal(receivedKeys[1].key, `${rootIdemKey}_gw2`);
    assert.notEqual(receivedKeys[0].key, receivedKeys[1].key, 'Failover must use distinct idempotency keys per gateway');
  });

  await t.test('(e) Trigger DB: Enforces strict state transitions and rejects illegal modifications', async () => {
    const reqId = crypto.randomUUID();
    const txRes = await pool.query(
      `INSERT INTO payment_transactions (
         org_id, environment, request_id, gateway, amount_minor, currency, status, idempotency_key
       ) VALUES ($1, 'SANDBOX', $2, 'STRIPE', 1000, 'USD', 'INITIATED', $3)
       RETURNING tx_id`,
      [orgId, reqId, `idem_trg_adv_${testRunId}`],
    );
    const txId = txRes.rows[0].tx_id;

    // Direct jump INITIATED -> CAPTURED (illegal, must go via AUTHORIZED)
    await assert.rejects(
      async () => {
        await pool.query(`UPDATE payment_transactions SET status = 'CAPTURED' WHERE tx_id = $1`, [txId]);
      },
      (err) => {
        assert.match(err.message, /ILLEGAL_TRANSITION/);
        return true;
      },
    );

    // Valid: INITIATED -> AUTHORIZED
    await pool.query(`UPDATE payment_transactions SET status = 'AUTHORIZED' WHERE tx_id = $1`, [txId]);

    // Valid: AUTHORIZED -> CAPTURED
    await pool.query(`UPDATE payment_transactions SET status = 'CAPTURED' WHERE tx_id = $1`, [txId]);

    // Illegal jump: CAPTURED -> AUTHORIZED
    await assert.rejects(
      async () => {
        await pool.query(`UPDATE payment_transactions SET status = 'AUTHORIZED' WHERE tx_id = $1`, [txId]);
      },
      (err) => {
        assert.match(err.message, /ILLEGAL_TRANSITION/);
        return true;
      },
    );

    // Illegal jump: CAPTURED -> INITIATED
    await assert.rejects(
      async () => {
        await pool.query(`UPDATE payment_transactions SET status = 'INITIATED' WHERE tx_id = $1`, [txId]);
      },
      (err) => {
        assert.match(err.message, /ILLEGAL_TRANSITION/);
        return true;
      },
    );
  });

  await t.test('(f) Webhook Deduplication: Duplicate webhook deliveries are never processed twice', async () => {
    const webhookService = new PaymentWebhookService();
    const eventId = `evt_dedup_adv_${testRunId}`;
    const payload = {
      id: eventId,
      type: 'charge.captured',
      data: { object: { id: `ch_adv_${testRunId}` } },
    };

    // First delivery
    const res1 = await webhookService.handleWebhook({
      orgId,
      gateway: 'STRIPE',
      rawBody: JSON.stringify(payload),
      signature: 'valid_sig',
    });
    assert.equal(res1.duplicate, false);

    // Second delivery
    const res2 = await webhookService.handleWebhook({
      orgId,
      gateway: 'STRIPE',
      rawBody: JSON.stringify(payload),
      signature: 'valid_sig',
    });
    assert.equal(res2.duplicate, true);
    assert.equal(res2.eventId, res1.eventId);

    // Third delivery
    const res3 = await webhookService.handleWebhook({
      orgId,
      gateway: 'STRIPE',
      rawBody: JSON.stringify(payload),
      signature: 'valid_sig',
    });
    assert.equal(res3.duplicate, true);

    // Check DB count for this event ID
    const dbEvents = await pool.query(
      `SELECT count(*) FROM payment_webhook_events WHERE gateway = 'STRIPE' AND gateway_event_id = $1`,
      [eventId],
    );
    assert.equal(dbEvents.rows[0].count, '1', 'Webhook event must only exist once in database');
  });
});
