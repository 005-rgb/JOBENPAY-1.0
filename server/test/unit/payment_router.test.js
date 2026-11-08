// @ts-check
import test from 'node:test';
import assert from 'node:assert/strict';
import { PaymentRouter, clearIdempotencyCache, routePayment } from '../../src/services/payment/payment_router.js';
import { VaultService } from '../../src/services/payment/vault_service.js';
import pool from '../../src/db/pool.js';
import crypto from 'node:crypto';

test('PRD 4.1: PaymentRouter Unit Tests (100% Coverage Target)', async (t) => {
  let orgId;
  t.before(async () => {
    const orgRes = await pool.query('SELECT id FROM organizations LIMIT 1');
    if (orgRes.rows.length === 0) {
      orgId = crypto.randomUUID();
      await pool.query('INSERT INTO organizations (id, name, slug) VALUES ($1, $2, $3)', [orgId, 'Router Test Org', `org-${orgId.slice(0, 8)}`]);
    } else {
      orgId = orgRes.rows[0].id;
    }
  });
  t.beforeEach(() => {
    clearIdempotencyCache();
  });

  t.afterEach(() => {
    clearIdempotencyCache();
  });

  await t.test('test_router_primary_success: Jika Stripe sukses, PayPal tidak dipanggil', async () => {
    let stripeCalls = 0;
    let paypalCalls = 0;

    const mockStripe = {
      authorize: async () => {
        stripeCalls++;
        return { success: true, gatewayTxId: 'ch_stripe_primary_123' };
      },
    };

    const mockPayPal = {
      authorize: async () => {
        paypalCalls++;
        return { success: true, gatewayTxId: 'auth_paypal_123' };
      },
    };

    const router = new PaymentRouter({
      adapters: { STRIPE: mockStripe, PAYPAL: mockPayPal },
      priority: ['STRIPE', 'PAYPAL'],
    });

    const result = await router.routePayment(5000, 'USD', 'tok_good_card', 'idem_primary_test');
    assert.equal(result.success, true);
    assert.equal(result.gateway, 'STRIPE');
    assert.equal(result.gatewayTxId, 'ch_stripe_primary_123');
    assert.equal(stripeCalls, 1);
    assert.equal(paypalCalls, 0);
  });

  await t.test('test_router_soft_decline_failover: Jika Stripe soft decline, PayPal dipanggil dan sukses', async () => {
    let stripeCalls = 0;
    let paypalCalls = 0;
    let derivedPaypalKey = null;

    const mockStripe = {
      authorize: async () => {
        stripeCalls++;
        return {
          success: false,
          isHardDecline: false,
          errorCode: 'insufficient_funds',
          errorMessage: 'Stripe soft decline',
        };
      },
    };

    const mockPayPal = {
      authorize: async (amount, currency, token, idempotencyKey) => {
        paypalCalls++;
        derivedPaypalKey = idempotencyKey;
        return { success: true, gatewayTxId: 'auth_paypal_failover_456' };
      },
    };

    const router = new PaymentRouter({
      adapters: { STRIPE: mockStripe, PAYPAL: mockPayPal },
      priority: ['STRIPE', 'PAYPAL'],
    });

    const result = await router.routePayment(5000, 'USD', 'tok_soft_card', 'idem_failover_test');
    assert.equal(result.success, true);
    assert.equal(result.gateway, 'PAYPAL');
    assert.equal(result.gatewayTxId, 'auth_paypal_failover_456');
    assert.equal(stripeCalls, 1);
    assert.equal(paypalCalls, 1);
    // Verifikasi idempotency key unik diturunkan per gateway
    assert.equal(derivedPaypalKey, 'idem_failover_test_paypal');
  });

  await t.test('test_router_hard_decline_stop: Jika Stripe hard decline, PayPal TIDAK dipanggil dan langsung gagal', async () => {
    let stripeCalls = 0;
    let paypalCalls = 0;

    const mockStripe = {
      authorize: async () => {
        stripeCalls++;
        return {
          success: false,
          isHardDecline: true,
          errorCode: 'stolen_card',
          errorMessage: 'Stripe reported stolen card',
        };
      },
    };

    const mockPayPal = {
      authorize: async () => {
        paypalCalls++;
        return { success: true, gatewayTxId: 'should_not_be_called' };
      },
    };

    const router = new PaymentRouter({
      adapters: { STRIPE: mockStripe, PAYPAL: mockPayPal },
      priority: ['STRIPE', 'PAYPAL'],
    });

    await assert.rejects(
      async () => router.routePayment(5000, 'USD', 'tok_stolen_card', 'idem_hard_decline_test'),
      (err) => {
        assert.equal(err.code, 'HARD_DECLINE');
        assert.ok(err.message.includes('Hard decline on STRIPE'));
        return true;
      },
    );

    assert.equal(stripeCalls, 1);
    assert.equal(paypalCalls, 0); // PayPal DILARANG dipanggil saat hard decline
  });

  await t.test('test_router_idempotency: Memanggil routePayment 2x dengan key sama -> gateway hanya dipanggil 1x', async () => {
    let callCount = 0;

    const mockStripe = {
      authorize: async () => {
        callCount++;
        return { success: true, gatewayTxId: 'ch_stripe_idem_1' };
      },
    };

    const router = new PaymentRouter({
      adapters: { STRIPE: mockStripe },
      priority: ['STRIPE'],
    });

    const res1 = await router.routePayment(2000, 'USD', 'tok_card', 'idem_key_same');
    const res2 = await router.routePayment(2000, 'USD', 'tok_card', 'idem_key_same');

    assert.equal(callCount, 1); // Gateway hanya dipanggil 1x
    assert.equal(res1.gatewayTxId, 'ch_stripe_idem_1');
    assert.deepEqual(res1, res2);
  });

  await t.test('test_vault_tokenization: Menyimpan token, bukan PAN (kartu mentah)', async () => {
    const customerId = crypto.randomUUID();

    // Pastikan kartu mentah ditolak
    await assert.rejects(
      async () => VaultService.savePaymentMethod({
        orgId,
        environment: 'SANDBOX',
        customerId,
        gateway: 'STRIPE',
        token: '4111222233334444',
      }),
      /PCI_DSS_VIOLATION/,
    );

    // Token network valid diterima
    const token = `tok_ntwk_${crypto.randomBytes(6).toString('hex')}`;
    const saved = await VaultService.savePaymentMethod({
      orgId,
      environment: 'SANDBOX',
      customerId,
      gateway: 'STRIPE',
      token,
      cardBrand: 'mastercard',
      cardLast4: '8888',
    });

    assert.equal(saved.token, token);
    assert.equal(saved.card_last4, '8888');
    await pool.query('DELETE FROM payment_methods WHERE pm_id = $1', [saved.pm_id]);
  });

  await t.test('test_webhook_dedup: Event webhook yang sama dikirim 2x -> hanya disimpan 1x secara unik', async () => {
    const eventId = `evt_${crypto.randomUUID()}`;

    // 1. First webhook insert
    await pool.query(
      `INSERT INTO payment_webhook_events (org_id, gateway, gateway_event_id, event_type, payload)
       VALUES ($1, 'STRIPE', $2, 'payment_intent.succeeded', $3)`,
      [orgId, eventId, JSON.stringify({ id: eventId, amount: 5000 })],
    );

    // 2. Duplicate webhook insert with same gateway and gateway_event_id -> ON CONFLICT UNIQUE rejected
    await assert.rejects(
      async () => {
        await pool.query(
          `INSERT INTO payment_webhook_events (org_id, gateway, gateway_event_id, event_type, payload)
           VALUES ($1, 'STRIPE', $2, 'payment_intent.succeeded', $3)`,
          [orgId, eventId, JSON.stringify({ id: eventId, amount: 5000 })],
        );
      },
      /duplicate key value violates unique constraint/i,
    );

    await pool.query('DELETE FROM payment_webhook_events WHERE gateway_event_id = $1', [eventId]);
  });

  await t.test('test_router_all_gateways_failed_and_edge_cases: validates validations and total failure', async () => {
    // Missing idempotencyKey
    const router = new PaymentRouter();
    await assert.rejects(
      // @ts-ignore
      async () => router.routePayment(100, 'USD', 'tok_test', null),
      /idempotencyKey is required/,
    );

    // Missing token
    await assert.rejects(
      // @ts-ignore
      async () => router.routePayment(100, 'USD', '', 'idem_valid'),
      /token is required/,
    );

    // Register adapter and test all gateways throwing unexpected errors
    router.registerAdapter('FAIL_GW_1', {
      authorize: async () => {
        throw new Error('Connection reset by peer');
      },
    });
    router.registerAdapter('FAIL_GW_2', {
      authorize: async () => {
        // Soft decline without errorMessage or errorCode to test fallback branches
        return { success: false, isHardDecline: false };
      },
    });

    await assert.rejects(
      async () => router.routePayment(100, 'USD', 'tok_test', 'idem_total_fail', {}, {
        priority: ['FAIL_GW_1', 'FAIL_GW_2', 'NON_EXISTENT_GW'],
      }),
      (err) => {
        assert.equal(err.code, 'ALL_GATEWAYS_FAILED');
        return true;
      },
    );

    // Hard decline without errorMessage to test fallback branch
    const hardDeclineRouter = new PaymentRouter();
    hardDeclineRouter.registerAdapter('NO_MSG_GW', {
      authorize: async () => ({ success: false, isHardDecline: true }),
    });
    await assert.rejects(
      async () => hardDeclineRouter.routePayment(100, 'USD', 'tok_test', 'idem_hard_nomsg', {}, {
        priority: ['NO_MSG_GW'],
      }),
      (err) => {
        assert.equal(err.code, 'HARD_DECLINE');
        assert.match(err.message, /Transaction refused/);
        return true;
      },
    );

    // Test getAdapter
    assert.ok(router.getAdapter('STRIPE'));
    assert.equal(router.getAdapter('UNKNOWN_GW'), null);
    assert.equal(router.getAdapter(''), null);

    // Test default exported routePayment function
    const resDefault = await routePayment(1000, 'USD', 'tok_test_default', 'idem_default_test');
    assert.equal(resDefault.success, true);
  });
});
