if (!process.env.UV_THREADPOOL_SIZE) {
  process.env.UV_THREADPOOL_SIZE = '2';
}

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { parseArgs } from 'node:util';

const appDir = path.resolve('.');
const envPath = path.resolve(appDir, '.env');
if (fs.existsSync(envPath) && typeof process.loadEnvFile === 'function') {
  try {
    process.loadEnvFile(envPath);
  } catch {}
}

const GLOBAL_ORG_ID = '00000000-0000-4000-8000-000000000000';

async function main() {
  const { default: pool } = await import('../../server/src/db/pool.js');
  const { withTx } = await import('../../server/src/db/tx.js');
  const { env } = await import('../../server/src/config.js');
  const { encrypt } = await import('../../server/src/lib/crypto.js');
  const { preparePayeeIdentifier } = await import('../../server/src/lib/payeeIdentifiers.js');
  const { createPayee } = await import('../../server/src/repositories/payees.js');
  const { createMandate, activateMandate } = await import('../../server/src/services/mandates.js');
  const { savePaypalConnection, updatePaypalConnectionStatus } = await import('../../server/src/repositories/paypalConnections.js');
  const { paypalFor } = await import('../../server/src/paypal/client.js');
  const { runRealPreflight } = await import('../../server/src/services/realPreflight.js');

  const options = {
    org: { type: 'string' },
    'client-id': { type: 'string' },
    'client-secret': { type: 'string' },
    'webhook-id': { type: 'string' },
    'payee-email': { type: 'string', default: 'sb-receiver@jobenpay.test' },
    'retry-dead': { type: 'boolean', default: true },
    help: { type: 'boolean', default: false },
  };

  let values;
  try {
    const parsed = parseArgs({ options, allowPositionals: true });
    values = parsed.values;
  } catch (err) {
    console.error('Invalid CLI options:', err.message);
    process.exit(1);
  }

  if (values.help) {
    console.log(`
JOBENPAY Preflight Setup Helper

Sets up and validates all prerequisites for 100% PASS real preflight:
1. Active Agent & API key
2. TRUSTED email Payee
3. ACTIVE 24/7 USD Mandate with Ed25519 signature & budget
4. (Optional) Encrypted PayPal Sandbox credentials & test connection
5. Resets DEAD queue jobs

Usage:
  node scripts/real/setup-preflight.js [options]
  npm run real:setup -- [options]

Options:
  --org <id|slug>           Target organization (default: first active org)
  --client-id <id>          PayPal Sandbox Client ID
  --client-secret <secret>  PayPal Sandbox Client Secret
  --webhook-id <whId>       PayPal Webhook ID (from PayPal Developer Portal)
  --payee-email <email>     Email for trusted payee (default: sb-receiver@jobenpay.test)
  --retry-dead              Reset DEAD jobs in queue (default: true)
  --help                    Show this help message
`);
    process.exit(0);
  }

  let orgId = values.org;
  let orgRow = null;
  if (orgId) {
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(orgId);
    const orgRes = isUuid
      ? await pool.query('SELECT id, name, slug FROM organizations WHERE id = $1 LIMIT 1', [orgId])
      : await pool.query('SELECT id, name, slug FROM organizations WHERE slug = $1 OR name ILIKE $1 LIMIT 1', [orgId]);
    orgRow = orgRes.rows[0];
    if (!orgRow) {
      console.error(`Error: Organization '${values.org}' not found.`);
      await pool.end();
      process.exit(1);
    }
    orgId = orgRow.id;
  } else {
    const orgRes = await pool.query('SELECT id, name, slug FROM organizations ORDER BY created_at ASC LIMIT 1');
    orgRow = orgRes.rows[0];
    orgId = orgRow?.id || GLOBAL_ORG_ID;
  }

  console.log(`\n======================================================`);
  console.log(` JOBENPAY Real-Payout Setup Helper`);
  console.log(` Target Organization: ${orgId} (${orgRow?.name || 'Default'} [${orgRow?.slug || 'default'}])`);
  console.log(`======================================================\n`);

  // 1. Reset dead jobs if requested
  if (values['retry-dead']) {
    const deadRes = await pool.query(
      "UPDATE jobs SET status = 'PENDING', attempts = 0, run_at = now(), locked_until = NULL WHERE status = 'DEAD' RETURNING id",
    );
    if (deadRes.rowCount > 0) {
      console.log(`[PASS] Queue: Reset ${deadRes.rowCount} DEAD job(s) back to PENDING.`);
    } else {
      console.log(`[PASS] Queue: 0 dead jobs.`);
    }
  }

  // 2. Check or create active Agent
  let agentRow = (await pool.query(
    "SELECT id, name FROM agents WHERE org_id = $1 AND status = 'ACTIVE' ORDER BY created_at ASC LIMIT 1",
    [orgId],
  )).rows[0];

  if (!agentRow) {
    console.log('[SETUP] Creating active agent...');
    const agentRes = await pool.query(
      "INSERT INTO agents (org_id, name, description, status) VALUES ($1, 'telo', 'Production agent for automated payouts', 'ACTIVE') RETURNING id, name",
      [orgId],
    );
    agentRow = agentRes.rows[0];

    const rawApiKey = `jp_${crypto.randomBytes(24).toString('hex')}`;
    const keyPrefix = rawApiKey.slice(0, 10);
    const keyHmac = crypto.createHmac('sha256', env.JOBENPAY_HMAC_PEPPER).update(rawApiKey).digest('hex');

    await pool.query(
      'INSERT INTO agent_api_keys (org_id, agent_id, key_prefix, key_hmac, name) VALUES ($1, $2, $3, $4, $5)',
      [orgId, agentRow.id, keyPrefix, keyHmac, 'Default API Key'],
    );
    console.log(`[PASS] Agent: Created active agent '${agentRow.name}' with new API key (${keyPrefix}...).`);
  } else {
    // Ensure agent has active API key
    const keyCountRes = await pool.query(
      'SELECT count(*)::integer AS count FROM agent_api_keys WHERE org_id = $1 AND agent_id = $2 AND revoked_at IS NULL',
      [orgId, agentRow.id],
    );
    if (keyCountRes.rows[0].count === 0) {
      const rawApiKey = `jp_${crypto.randomBytes(24).toString('hex')}`;
      const keyPrefix = rawApiKey.slice(0, 10);
      const keyHmac = crypto.createHmac('sha256', env.JOBENPAY_HMAC_PEPPER).update(rawApiKey).digest('hex');
      await pool.query(
        'INSERT INTO agent_api_keys (org_id, agent_id, key_prefix, key_hmac, name) VALUES ($1, $2, $3, $4, $5)',
        [orgId, agentRow.id, keyPrefix, keyHmac, 'Generated API Key'],
      );
      console.log(`[PASS] Agent: Generated active API key for agent '${agentRow.name}'.`);
    } else {
      console.log(`[PASS] Agent: Active agent '${agentRow.name}' ready (${keyCountRes.rows[0].count} active key).`);
    }
  }

  // 3. Check or create TRUSTED email payee
  let trustedPayee = (await pool.query(
    "SELECT id, display_name, identifier_masked FROM payees WHERE org_id = $1 AND kind = 'EMAIL' AND trust = 'TRUSTED' LIMIT 1",
    [orgId],
  )).rows[0];

  if (!trustedPayee) {
    const payeeEmail = values['payee-email'] || 'sb-receiver@jobenpay.test';
    console.log(`[SETUP] Creating TRUSTED email payee (${payeeEmail})...`);
    const protectedId = preparePayeeIdentifier(orgId, payeeEmail, 'EMAIL', {
      encryptionKey: env.JOBENPAY_ENC_KEY,
      pepper: env.JOBENPAY_HMAC_PEPPER,
    });
    trustedPayee = await createPayee(orgId, {
      displayName: 'Sandbox Test Recipient',
      kind: 'EMAIL',
      identifierEnc: protectedId.identifierEnc,
      identifierHmac: protectedId.identifierHmac,
      identifierMasked: protectedId.identifierMasked,
      trust: 'TRUSTED',
    });
    console.log(`[PASS] Payee: Created TRUSTED payee '${trustedPayee.display_name}' (${trustedPayee.identifier_masked}).`);
  } else {
    console.log(`[PASS] Payee: Found TRUSTED payee '${trustedPayee.display_name}' (${trustedPayee.identifier_masked}).`);
  }

  // 4. Check or create ACTIVE 24/7 USD mandate for agent
  let activeMandate = (await pool.query(
    "SELECT m.id, m.name FROM mandates m WHERE m.org_id = $1 AND m.agent_id = $2 AND m.status = 'ACTIVE' LIMIT 1",
    [orgId, agentRow.id],
  )).rows[0];

  if (!activeMandate) {
    console.log(`[SETUP] Creating & activating 24/7 USD mandate for agent '${agentRow.name}'...`);
    await withTx(pool, async (tx) => {
      const now = new Date();
      const validFrom = new Date(now.getTime() - 60_000).toISOString();
      const validTo = new Date(now.getTime() + 365 * 86400 * 1000).toISOString();

      const policy = {
        currency: 'USD',
        validFrom,
        validTo,
        purpose: 'Sandbox real-payout validation policy',
        requireInvoice: false,
        invoiceAmountToleranceMinor: '0',
        allowNewPayees: true,
        perTransactionLimitMinor: '2500', // $25.00
        budget: {
          limitMinor: '10000', // $100.00
          period: 'MONTH',
        },
        schedule: {
          timezone: 'UTC',
          days: [0, 1, 2, 3, 4, 5, 6],
          startHour: 0,
          endHour: 24,
        },
        velocity: {
          maxRequestsPerHour: 50,
          maxPayoutPerPayeePerDay: 5000,
        },
        payees: {
          mode: 'ALLOWLIST',
          ids: [trustedPayee.id],
        },
      };

      const created = await createMandate(tx, {
        orgId,
        agentId: agentRow.id,
        name: 'Sandbox 24/7 USD Mandate',
        policy,
        purposeText: policy.purpose,
      });

      await activateMandate(tx, {
        orgId,
        mandateId: created.mandate.id,
        versionId: created.version.id,
        actorId: null,
        systemActor: 'real-setup',
      });

      activeMandate = created.mandate;
    });
    console.log(`[PASS] Mandate: Created and activated 24/7 USD mandate for agent '${agentRow.name}'.`);
  } else {
    console.log(`[PASS] Mandate: Found ACTIVE mandate '${activeMandate.name}'.`);
  }

  // 5. PayPal Sandbox credentials
  const clientId = values['client-id'] || process.env.PAYPAL_CLIENT_ID;
  const clientSecret = values['client-secret'] || process.env.PAYPAL_CLIENT_SECRET;
  const webhookId = values['webhook-id'] || process.env.PAYPAL_WEBHOOK_ID || 'WH-SANDBOX-SETUP';

  if (clientId && clientSecret) {
    console.log('[SETUP] Storing & testing PayPal Sandbox credentials...');
    const clientIdEnc = encrypt({
      key: env.JOBENPAY_ENC_KEY,
      plaintext: clientId.trim(),
      aad: `paypal_connections:client_id_enc:${orgId}`,
    });
    const clientSecretEnc = encrypt({
      key: env.JOBENPAY_ENC_KEY,
      plaintext: clientSecret.trim(),
      aad: `paypal_connections:client_secret_enc:${orgId}`,
    });
    const webhookToken = crypto.randomBytes(16).toString('hex');

    await savePaypalConnection(orgId, {
      clientIdEnc,
      clientSecretEnc,
      webhookId,
      webhookToken,
    });

    try {
      const client = await paypalFor(orgId, { db: pool, encryptionKey: env.JOBENPAY_ENC_KEY });
      await client.testConnection();
      await updatePaypalConnectionStatus(orgId, { status: 'CONNECTED' });
      console.log('[PASS] PayPal: Credentials stored and OAuth Sandbox connection verified successfully!');
    } catch (err) {
      await updatePaypalConnectionStatus(orgId, { status: 'ERROR', lastErrorCode: err.message });
      console.warn(`[WARN] PayPal: Credentials saved but test connection failed: ${err.message}`);
    }
  } else {
    const existingConn = (await pool.query(
      'SELECT status, webhook_id, client_id_enc FROM paypal_connections WHERE org_id = $1 LIMIT 1',
      [orgId],
    )).rows[0];

    if (existingConn?.client_id_enc && existingConn.status === 'CONNECTED') {
      console.log(`[PASS] PayPal: Existing connection status is CONNECTED (webhook_id: ${existingConn.webhook_id}).`);
    } else {
      console.log('[NOTE] PayPal credentials not provided in command line or .env.');
      console.log('       To connect PayPal Sandbox, configure via Web UI (/settings/paypal) or run:');
      console.log(`       npm run real:setup -- --org ${orgId} --client-id <ID> --client-secret <SECRET> --webhook-id <WH-ID>\n`);
    }
  }

  // 6. Run preflight verification
  console.log('\nRunning real-payout preflight checks now...');
  const result = await runRealPreflight(orgId);

  console.log(`\n======================================================`);
  console.log(` JOBENPAY Real-Payout Preflight Checks`);
  console.log(` Target Organization: ${orgId}`);
  console.log(` Overall Status:      ${result.ready ? 'READY (PASS)' : 'NOT READY (FAIL)'}`);
  console.log(`======================================================\n`);

  for (const check of result.checks) {
    const badge = check.status === 'PASS' ? '[PASS]' : (check.status === 'WARN' ? '[WARN]' : '[FAIL]');
    console.log(`${badge} ${check.id}: ${check.detail}`);
  }

  console.log(`\nSummary: ${result.ready ? 'All critical checks passed! Ready for real PayPal Sandbox payout.' : 'Address any remaining FAIL items before running a real payout.'}\n`);

  await pool.end();
  process.exit(result.ready ? 0 : 1);
}

main().catch(async (err) => {
  console.error('Setup failed with error:', err);
  await pool.end();
  process.exit(1);
});

