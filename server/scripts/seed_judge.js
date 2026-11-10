// @ts-check
import fs from 'node:fs';
import crypto from 'node:crypto';
import pool from '../src/db/pool.js';
import { env } from '../src/config.js';
import { withTx } from '../src/db/tx.js';
import { hashPassword } from '../src/lib/crypto.js';
import { preparePayeeIdentifier } from '../src/lib/payeeIdentifiers.js';
import { createAgentApiKey, hashAgentApiKey } from '../src/lib/agentApiKeys.js';
import { createAgentKey, createAgent } from '../src/repositories/agents.js';
import { createMandate, activateMandate } from '../src/services/mandates.js';
import { createIntent } from '../src/services/intent_service.js';
import { submitPaymentRequest } from '../src/services/requests.js';
import { LEDGER_RULES } from '../../shared/ledger-rules.js';

// Fallback load environment variables if node was run without --env-file
if (typeof process.loadEnvFile === 'function' && fs.existsSync('.env')) {
  try {
    process.loadEnvFile('.env');
  } catch {}
}

const JUDGE_CONFIG = {
  orgName: 'JOBENPAY Demo',
  orgSlug: 'jobenpay-demo',
  judgeEmail: 'judge@jobenpay.io',
  judgePassword: 'Password123!',
  environment: 'SANDBOX',
};

const DEMO_VENDORS = [
  {
    name: 'Acme Office Supplies',
    email: 'billing@acme-supplies.test',
    trust: 'TRUSTED',
  },
  {
    name: 'Northwind Studio',
    email: 'finance@northwind-studio.test',
    trust: 'PENDING_REVIEW',
  },
  {
    name: 'Hacker Corp',
    email: 'drain@hacker-corp.test',
    trust: 'BLOCKED',
  },
];

export async function seedJudgeDemoData(db = pool, { write = (msg) => process.stdout.write(msg) } = {}) {
  write('=== JOBENPAY Devpost Demo Seed (Target: SANDBOX) ===\n');

  if (!env.JOBENPAY_ENC_KEY) {
    throw new Error('JOBENPAY_ENC_KEY is required to seed payees.');
  }
  if (!env.JOBENPAY_HMAC_PEPPER) {
    throw new Error('JOBENPAY_HMAC_PEPPER is required to seed agent keys and payees.');
  }

  const output = [];

  // 1. Ensure Organization
  write('1. Ensuring Organization...\n');
  const orgResult = await db.query(
    `INSERT INTO organizations (name, slug)
     VALUES ($1, $2)
     ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name
     RETURNING id`,
    [JUDGE_CONFIG.orgName, JUDGE_CONFIG.orgSlug]
  );
  const orgId = orgResult.rows[0].id;

  // 2. Ensure Judge User
  write('2. Ensuring Judge Account (judge@jobenpay.io)...\n');
  const passwordHash = await hashPassword(JUDGE_CONFIG.judgePassword);
  let userId;
  const existingUser = await db.query(
    'SELECT id FROM users WHERE lower(email) = lower($1) LIMIT 1',
    [JUDGE_CONFIG.judgeEmail]
  );

  if (existingUser.rowCount) {
    userId = existingUser.rows[0].id;
    await db.query(
      `UPDATE users
       SET password_hash = $1, display_name = 'Devpost Judge', email_verified_at = COALESCE(email_verified_at, now())
       WHERE id = $2`,
      [passwordHash, userId]
    );
  } else {
    const createdUser = await db.query(
      `INSERT INTO users (email, password_hash, display_name, locale, email_verified_at)
       VALUES ($1, $2, 'Devpost Judge', 'en', now())
       RETURNING id`,
      [JUDGE_CONFIG.judgeEmail, passwordHash]
    );
    userId = createdUser.rows[0].id;
  }

  // Ensure Membership
  await db.query(
    `INSERT INTO memberships (org_id, user_id, role, is_judge)
     VALUES ($1, $2, 'OWNER', true)
     ON CONFLICT (org_id, user_id)
     DO UPDATE SET role = 'OWNER', is_judge = true`,
    [orgId, userId]
  );

  // 3. Ensure Payees (Vendors)
  write('3. Ensuring Synthetic Payees (Acme, Northwind, Hacker Corp)...\n');
  const payeeMap = new Map();

  for (const vendor of DEMO_VENDORS) {
    const fields = preparePayeeIdentifier(orgId, vendor.email, 'EMAIL', {
      encryptionKey: env.JOBENPAY_ENC_KEY,
      pepper: env.JOBENPAY_HMAC_PEPPER,
    });

    const existingPayee = await db.query(
      `SELECT id FROM payees
       WHERE org_id = $1 AND identifier_hmac = $2 AND environment = $3
       LIMIT 1`,
      [orgId, fields.identifierHmac, JUDGE_CONFIG.environment]
    );

    let payeeId;
    if (existingPayee.rowCount) {
      payeeId = existingPayee.rows[0].id;
      await db.query(
        `UPDATE payees
         SET display_name = $1, trust = $2
         WHERE org_id = $3 AND id = $4 AND environment = $5`,
        [vendor.name, vendor.trust, orgId, payeeId, JUDGE_CONFIG.environment]
      );
    } else {
      const created = await db.query(
        `INSERT INTO payees (
           org_id, display_name, kind, identifier_enc, identifier_hmac, identifier_masked, trust, environment
         )
         VALUES ($1, $2, 'EMAIL', $3, $4, $5, $6, $7)
         RETURNING id`,
        [
          orgId,
          vendor.name,
          fields.identifierEnc,
          fields.identifierHmac,
          fields.identifierMasked,
          vendor.trust,
          JUDGE_CONFIG.environment,
        ]
      );
      payeeId = created.rows[0].id;
    }
    payeeMap.set(vendor.name, payeeId);
  }

  // 4. Ensure AI Agents
  write('4. Ensuring AI Agents (Procurement Agent & Rogue Agent)...\n');
  const agentMap = new Map();
  const agentConfigs = [
    {
      name: 'Procurement Agent',
      description: 'Autonomous corporate procurement and supply chain agent',
      status: 'ACTIVE',
    },
    {
      name: 'Rogue Agent',
      description: 'Untrusted rogue simulation agent for adversarial stress-testing',
      status: 'ACTIVE',
    },
  ];

  for (const cfg of agentConfigs) {
    const existing = await db.query(
      `SELECT id FROM agents
       WHERE org_id = $1 AND name = $2 AND environment = $3
       LIMIT 1`,
      [orgId, cfg.name, JUDGE_CONFIG.environment]
    );

    let agentId;
    if (existing.rowCount) {
      agentId = existing.rows[0].id;
      await db.query(
        `UPDATE agents
         SET description = $1, status = $2
         WHERE org_id = $3 AND id = $4 AND environment = $5`,
        [cfg.description, cfg.status, orgId, agentId, JUDGE_CONFIG.environment]
      );
    } else {
      const created = await createAgent(
        orgId,
        {
          name: cfg.name,
          description: cfg.description,
          status: cfg.status,
          environment: JUDGE_CONFIG.environment,
        },
        db
      );
      agentId = created.id;
    }
    agentMap.set(cfg.name, agentId);

    // Ensure API Key exists for agent
    const existingKey = await db.query(
      `SELECT id FROM agent_api_keys
       WHERE org_id = $1 AND agent_id = $2 AND revoked_at IS NULL
       LIMIT 1`,
      [orgId, agentId]
    );
    if (!existingKey.rowCount) {
      const { prefix, apiKey } = createAgentApiKey();
      await createAgentKey(
        orgId,
        agentId,
        {
          prefix,
          keyHash: hashAgentApiKey(env.JOBENPAY_HMAC_PEPPER, apiKey),
        },
        db
      );
      output.push({ label: `${cfg.name} API Key`, value: apiKey });
    }
  }

  const procurementAgentId = agentMap.get('Procurement Agent');
  const rogueAgentId = agentMap.get('Rogue Agent');
  const acmePayeeId = payeeMap.get('Acme Office Supplies');
  const northwindPayeeId = payeeMap.get('Northwind Studio');
  const hackerPayeeId = payeeMap.get('Hacker Corp');

  // 5. Ensure Mandates & Cryptographic Intent Anchors
  write('5. Ensuring Mandates and Cryptographic Intent Anchors...\n');
  const now = new Date();
  const validTo = new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000);

  // Mandate 1: Procurement Agent
  const procMandateName = 'Procurement Operations Mandate';
  const existingProcMandate = await db.query(
    `SELECT id, status, current_version_id FROM mandates
     WHERE org_id = $1 AND agent_id = $2 AND name = $3 AND environment = $4
     LIMIT 1`,
    [orgId, procurementAgentId, procMandateName, JUDGE_CONFIG.environment]
  );

  let procMandate = existingProcMandate.rows[0];
  if (!procMandate) {
    const policy = {
      schemaVersion: 1,
      purpose: 'Pembelian alat tulis kantor',
      allowedActions: ['PAYOUT'],
      currency: 'USD',
      perTransactionCapMinor: 20000, // $200 per transaction cap
      budget: { period: 'MONTH', limitMinor: 100000 }, // $1,000 / month
      autoApproveBelowMinor: 10000, // $100 auto-approval threshold ($150 requires approval)
      payees: { mode: 'ALLOWLIST', ids: [acmePayeeId, northwindPayeeId] },
      allowNewPayees: true,
      schedule: { timezone: 'UTC', days: [1, 2, 3, 4, 5, 6, 7], startHour: 0, endHour: 24 },
      velocity: { maxRequestsPerHour: 50, maxPayoutPerPayeePerDay: 20 },
      duplicateWindowHours: 24,
      requireInvoice: false,
      invoiceAmountToleranceMinor: 0,
      ai: { intentCheck: false, escalateOnRiskAtOrAbove: 40, blockOnRiskAtOrAbove: 80 },
      stepUpApprovalAboveMinor: 50000,
      fourEyesAboveMinor: 50000,
      approvalTtlHours: 72,
      validFrom: now.toISOString(),
      validTo: validTo.toISOString(),
    };

    const created = await withTx((tx) =>
      createMandate(tx, {
        orgId,
        agentId: procurementAgentId,
        name: procMandateName,
        policy,
        purposeText: policy.purpose,
        environment: JUDGE_CONFIG.environment,
      })
    );
    procMandate = created.mandate;

    await withTx((tx) =>
      activateMandate(tx, {
        orgId,
        mandateId: procMandate.id,
        versionId: created.version.id,
        systemActor: 'seed_judge',
      })
    );
  }

  // Create Intent Mandate Anchor for Procurement Agent
  const existingProcIntent = await db.query(
    `SELECT intent_id FROM intent_mandates
     WHERE org_id = $1 AND natural_language_input = $2
     LIMIT 1`,
    [orgId, 'Pembelian alat tulis kantor']
  );
  if (!existingProcIntent.rowCount) {
    await createIntent(orgId, userId, {
      natural_language_input: 'Pembelian alat tulis kantor',
      structured_intent: {
        purpose: 'Pembelian alat tulis kantor',
        amount_range: { min: 0, max: 100000 },
        vendor_categories: ['office_supplies', 'stationery'],
      },
    });
  }

  // Mandate 2: Rogue Agent
  const rogueMandateName = 'Rogue Security Testing Mandate';
  const existingRogueMandate = await db.query(
    `SELECT id, status, current_version_id FROM mandates
     WHERE org_id = $1 AND agent_id = $2 AND name = $3 AND environment = $4
     LIMIT 1`,
    [orgId, rogueAgentId, rogueMandateName, JUDGE_CONFIG.environment]
  );

  let rogueMandate = existingRogueMandate.rows[0];
  if (!rogueMandate) {
    const policy = {
      schemaVersion: 1,
      purpose: 'Pembelian software lisensi',
      allowedActions: ['PAYOUT'],
      currency: 'USD',
      perTransactionCapMinor: 50000, // $500 cap
      budget: { period: 'MONTH', limitMinor: 50000 }, // $500 / month
      autoApproveBelowMinor: 10000,
      payees: { mode: 'ALLOWLIST', ids: [] },
      allowNewPayees: false,
      schedule: { timezone: 'UTC', days: [1, 2, 3, 4, 5, 6, 7], startHour: 0, endHour: 24 },
      velocity: { maxRequestsPerHour: 10, maxPayoutPerPayeePerDay: 5 },
      duplicateWindowHours: 24,
      requireInvoice: false,
      invoiceAmountToleranceMinor: 0,
      ai: { intentCheck: false, escalateOnRiskAtOrAbove: 40, blockOnRiskAtOrAbove: 80 },
      stepUpApprovalAboveMinor: 50000,
      fourEyesAboveMinor: 50000,
      approvalTtlHours: 72,
      validFrom: now.toISOString(),
      validTo: validTo.toISOString(),
    };

    const created = await withTx((tx) =>
      createMandate(tx, {
        orgId,
        agentId: rogueAgentId,
        name: rogueMandateName,
        policy,
        purposeText: policy.purpose,
        environment: JUDGE_CONFIG.environment,
      })
    );
    rogueMandate = created.mandate;

    await withTx((tx) =>
      activateMandate(tx, {
        orgId,
        mandateId: rogueMandate.id,
        versionId: created.version.id,
        systemActor: 'seed_judge',
      })
    );
  }

  // Create Intent Mandate Anchor for Rogue Agent
  const existingRogueIntent = await db.query(
    `SELECT intent_id FROM intent_mandates
     WHERE org_id = $1 AND natural_language_input = $2
     LIMIT 1`,
    [orgId, 'Pembelian software lisensi']
  );
  if (!existingRogueIntent.rowCount) {
    await createIntent(orgId, userId, {
      natural_language_input: 'Pembelian software lisensi',
      structured_intent: {
        purpose: 'Pembelian software lisensi',
        amount_range: { min: 0, max: 50000 },
        vendor_categories: ['software', 'cloud_services'],
      },
    });
  }

  // 6. Ensure 3 Demo Transactions via submitPaymentRequest
  write('6. Executing 3 Demo Transaction Scenarios via Decision Engine...\n');

  // Scenario 1 (Success - AUTO_APPROVE): Procurement Agent pays Acme $50
  write('   - Scenario 1: Procurement Agent pays Acme Office Supplies $50 (Auto-Approve)...\n');
  const scn1Key = 'judge-demo-scn-01-auto-approve';
  const existingScn1 = await db.query(
    'SELECT id, status, decision FROM payment_requests WHERE org_id = $1 AND agent_idempotency_key = $2',
    [orgId, scn1Key]
  );
  if (!existingScn1.rowCount) {
    await submitPaymentRequest({
      orgId,
      agentId: procurementAgentId,
      action: 'PAYOUT',
      amountMinor: 5000, // $50
      currency: 'USD',
      payeeId: acmePayeeId,
      idempotencyKey: scn1Key,
      reason: 'Pembelian alat tulis kantor - Perlengkapan ATK Q4',
    });
  } else {
    await db.query(
      'UPDATE payment_requests SET agent_reason = $1 WHERE id = $2 AND agent_reason IS NULL',
      ['Pembelian alat tulis kantor - Perlengkapan ATK Q4', existingScn1.rows[0].id]
    );
  }

  // Scenario 2 (Requires Human Approval - PENDING_APPROVAL): Procurement Agent pays Northwind $150
  write('   - Scenario 2: Procurement Agent pays Northwind Studio $150 (Requires Approval)...\n');
  const scn2Key = 'judge-demo-scn-02-needs-approval';
  const existingScn2 = await db.query(
    'SELECT id, status, decision FROM payment_requests WHERE org_id = $1 AND agent_idempotency_key = $2',
    [orgId, scn2Key]
  );
  if (!existingScn2.rowCount) {
    await submitPaymentRequest({
      orgId,
      agentId: procurementAgentId,
      action: 'PAYOUT',
      amountMinor: 15000, // $150
      currency: 'USD',
      payeeId: northwindPayeeId,
      idempotencyKey: scn2Key,
      reason: 'Desain visual presentasi quarterly review',
    });
  } else {
    await db.query(
      'UPDATE payment_requests SET agent_reason = $1 WHERE id = $2 AND agent_reason IS NULL',
      ['Desain visual presentasi quarterly review', existingScn2.rows[0].id]
    );
  }

  // Scenario 3 (Attack Simulation - REJECTED): Rogue Agent pays Hacker Corp $400
  write('   - Scenario 3: Rogue Agent attempts to pay Hacker Corp $400 (Rejected: PAYEE_BLOCKED)...\n');
  const scn3Key = 'judge-demo-scn-03-rejected-attack';
  const existingScn3 = await db.query(
    'SELECT id, status, decision FROM payment_requests WHERE org_id = $1 AND agent_idempotency_key = $2',
    [orgId, scn3Key]
  );
  if (!existingScn3.rowCount) {
    await submitPaymentRequest({
      orgId,
      agentId: rogueAgentId,
      action: 'PAYOUT',
      amountMinor: 40000, // $400
      currency: 'USD',
      payeeId: hackerPayeeId,
      idempotencyKey: scn3Key,
      reason: 'Emergency zero-day exploit toolkit transfer',
    });
  } else {
    await db.query(
      'UPDATE payment_requests SET agent_reason = $1 WHERE id = $2 AND agent_reason IS NULL',
      ['Emergency zero-day exploit toolkit transfer', existingScn3.rows[0].id]
    );
  }

  // 7. Mirror into transaction_intents for Universal Transaction Engine & Dashboard
  write('7. Mirroring into transaction_intents & double-entry ledger...\n');

  const intentScenarios = [
    {
      idempotencyKey: scn1Key,
      agentId: procurementAgentId,
      counterpartyId: acmePayeeId,
      category: 'PAYOUT',
      subType: 'standard',
      status: 'APPROVED',
      reconciliationStatus: 'RECONCILED',
      amountMinor: 5000n,
      mandateVersionId: procMandate.current_version_id,
      metadata: {
        decision: 'AUTO_APPROVE',
        payeeName: 'Acme Office Supplies',
        agentReason: 'Pembelian alat tulis kantor - Perlengkapan ATK Q4',
        scenario: 'SCENARIO_1_SUCCESS',
      },
      hasLegs: true,
    },
    {
      idempotencyKey: scn2Key,
      agentId: procurementAgentId,
      counterpartyId: northwindPayeeId,
      category: 'PAYOUT',
      subType: 'standard',
      status: 'NEEDS_APPROVAL',
      reconciliationStatus: 'PENDING',
      amountMinor: 15000n,
      mandateVersionId: procMandate.current_version_id,
      metadata: {
        decision: 'REQUIRE_APPROVAL',
        reasonCodes: ['AMOUNT_REQUIRES_APPROVAL', 'PAYEE_NEW'],
        payeeName: 'Northwind Studio',
        agentReason: 'Desain visual presentasi quarterly review',
        scenario: 'SCENARIO_2_PENDING_APPROVAL',
      },
      hasLegs: false,
    },
    {
      idempotencyKey: scn3Key,
      agentId: rogueAgentId,
      counterpartyId: hackerPayeeId,
      category: 'PAYOUT',
      subType: 'standard',
      status: 'REJECTED',
      reconciliationStatus: 'PENDING',
      amountMinor: 40000n,
      mandateVersionId: rogueMandate.current_version_id,
      metadata: {
        decision: 'REJECT',
        reasonCodes: ['PAYEE_BLOCKED'],
        payeeName: 'Hacker Corp',
        agentReason: 'Emergency zero-day exploit toolkit transfer',
        scenario: 'SCENARIO_3_ROGUE_ATTACK_BLOCKED',
      },
      hasLegs: false,
    },
  ];

  for (const item of intentScenarios) {
    const existingIntent = await db.query(
      `SELECT intent_id FROM transaction_intents
       WHERE org_id = $1 AND idempotency_key = $2 AND environment = $3
       LIMIT 1`,
      [orgId, item.idempotencyKey, JUDGE_CONFIG.environment]
    );

    let intentId;
    if (existingIntent.rowCount) {
      intentId = existingIntent.rows[0].intent_id;
      await db.query(
        `UPDATE transaction_intents
         SET status = $1, reconciliation_status = $2, metadata = $3, updated_at = now()
         WHERE intent_id = $4`,
        [item.status, item.reconciliationStatus, JSON.stringify(item.metadata), intentId]
      );
    } else {
      const hashPayload = `${orgId}:${item.category}:${item.subType}:${item.amountMinor.toString()}:USD:${item.counterpartyId}:${item.idempotencyKey}`;
      const requestHash = crypto.createHash('sha256').update(hashPayload, 'utf8').digest('hex');

      await withTx(async (tx) => {
        const ins = await tx.query(
          `INSERT INTO transaction_intents (
             org_id, agent_id, category, sub_type, status,
             amount_minor, currency, counterparty_id,
             mandate_version_id, request_hash, idempotency_key,
             reconciliation_status, metadata, environment
           )
           VALUES ($1, $2, $3, $4, $5, $6, 'USD', $7, $8, $9, $10, $11, $12, $13)
           RETURNING intent_id`,
          [
            orgId,
            item.agentId,
            item.category,
            item.subType,
            item.status,
            item.amountMinor.toString(),
            item.counterpartyId,
            item.mandateVersionId,
            requestHash,
            item.idempotencyKey,
            item.reconciliationStatus,
            JSON.stringify(item.metadata),
            JUDGE_CONFIG.environment,
          ]
        );
        intentId = ins.rows[0].intent_id;

        // Post balanced double-entry ledger legs for approved payout
        if (item.hasLegs) {
          const rule = LEDGER_RULES[item.category]?.[item.subType];
          if (rule) {
            const legs = rule.legs({
              amountMinor: item.amountMinor,
              counterpartyId: item.counterpartyId,
            });
            for (const leg of legs) {
              await tx.query(
                `INSERT INTO transaction_legs (
                   intent_id, leg_type, amount_minor, currency, account_ref, status, environment
                 )
                 VALUES ($1, $2, $3, $4, $5, 'POSTED', $6)`,
                [intentId, leg.legType, leg.amountMinor.toString(), leg.currency, leg.accountRef, JUDGE_CONFIG.environment]
              );
            }
          }
        }
      });
    }
  }

  write('\n=== DEMO SEED COMPLETED SUCCESSFULLY ===\n');
  write(`Organization: ${JUDGE_CONFIG.orgName} (slug: ${JUDGE_CONFIG.orgSlug})\n`);
  write(`Judge Login:  ${JUDGE_CONFIG.judgeEmail}\n`);
  write(`Password:     ${JUDGE_CONFIG.judgePassword}\n`);
  write(`Environment:  ${JUDGE_CONFIG.environment}\n`);
  write('---------------------------------------------------\n');
  write(`Scenario 1:   $50.00  -> AUTO_APPROVE (Status: APPROVED / RECONCILED)\n`);
  write(`Scenario 2:   $150.00 -> REQUIRE_APPROVAL (Status: PENDING_APPROVAL)\n`);
  write(`Scenario 3:   $400.00 -> REJECT (Status: REJECTED - PAYEE_BLOCKED)\n`);
  write('---------------------------------------------------\n');

  for (const cred of output) {
    write(`${cred.label}: ${cred.value}\n`);
  }
}

async function main() {
  try {
    await seedJudgeDemoData();
  } catch (err) {
    console.error('\nSeed failed:', err);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/'))) {
  main();
}
