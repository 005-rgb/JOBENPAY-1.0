// @ts-check
import { AppError } from '../lib/errors.js';
import { createIntentAnchor, getIntentAnchor } from '../services/intent_service.js';
import {
  computeDecisionIntegrityScore,
  getDecisionIntegrityScore,
  getReasoningTrace,
  storeDecisionIntegrityScore,
  storeReasoningTrace,
} from '../services/dip_service.js';
import { query } from '../db/pool.js';
import { withTx } from '../db/tx.js';
import { generateSar } from '../services/sar.js';
import { createAndSaveCognitiveSnapshot } from '../services/snapshot_service.js';
import { evaluateCplForRequest } from '../services/cpl_service.js';
import crypto from 'node:crypto';

function resolveOrgId(req) {
  return req.org?.id || req.session?.current_org_id || req.user?.org_id;
}

function resolveUserId(req) {
  return req.user?.id || req.session?.user_id;
}

/**
 * POST /intents or /api/v1/intents
 * Creates human-signed Intent Anchor per PRD 1.6 §3 / §9.1.
 */
export async function createIntentAnchorHandler(req, res, next) {
  try {
    const orgId = resolveOrgId(req);
    const userId = resolveUserId(req);

    if (!orgId) {
      throw new AppError('UNAUTHORIZED', 401, 'Organization authentication required');
    }
    if (!userId) {
      throw new AppError('UNAUTHORIZED', 401, 'User authentication required');
    }

    const anchor = await createIntentAnchor(orgId, userId, req.body);
    res.status(201).json({
      intent_id: anchor.intent_id,
      intent_hash: anchor.intent_hash || anchor.intent_hash_v2,
      signature: anchor.signature,
      status: anchor.status || 'ACTIVE',
      structured_intent: anchor.structured_intent,
      natural_language_input: anchor.natural_language_input,
      valid_from: anchor.valid_from,
      valid_to: anchor.valid_to,
      created_at: anchor.created_at,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /intents/:id or /api/v1/intents/:id
 */
export async function getIntentAnchorHandler(req, res, next) {
  try {
    const orgId = resolveOrgId(req);
    if (!orgId) {
      throw new AppError('UNAUTHORIZED', 401, 'Organization authentication required');
    }

    const anchor = await getIntentAnchor(orgId, req.params.id);
    res.json(anchor);
  } catch (err) {
    next(err);
  }
}

/**
 * GET /requests/:id/dip or /api/v1/requests/:id/dip
 * Returns DIS score, component breakdown, trace, and anchor per PRD 1.6 §9.3.
 */
export async function getDipHandler(req, res, next) {
  try {
    const orgId = resolveOrgId(req);
    if (!orgId) {
      throw new AppError('UNAUTHORIZED', 401, 'Organization authentication required');
    }

    const requestId = req.params.id;
    const disRecord = await getDecisionIntegrityScore(orgId, requestId);
    const traceRecord = await getReasoningTrace(orgId, requestId);

    // Retrieve request for intent anchor link
    let intentAnchor = null;
    const { rows: txRows } = await query(
      `SELECT intent_id, intent_mandate_id FROM transaction_intents WHERE org_id = $1 AND intent_id = $2`,
      [orgId, requestId]
    );

    if (txRows.length > 0 && txRows[0].intent_mandate_id) {
      try {
        intentAnchor = await getIntentAnchor(orgId, txRows[0].intent_mandate_id);
      } catch {
        // ignore if not found
      }
    }

    if (!disRecord && !traceRecord) {
      throw new AppError('NOT_FOUND', 404, 'DIP record not found for this request');
    }

    res.json({
      request_id: requestId,
      score: disRecord?.score ?? 0,
      components: disRecord?.components ?? {
        purpose: 0,
        amount: 0,
        vendor: 0,
        brand: 0,
        attributes: 0,
        evidence: 0,
      },
      hard_rule_triggered: disRecord?.hard_rule_triggered ?? null,
      decision: disRecord?.decision ?? 'REQUIRE_APPROVAL',
      reasoning_trace: traceRecord ? {
        trace_id: traceRecord.trace_id,
        reasons: traceRecord.reasons,
        trace_hash: traceRecord.trace_hash,
        created_at: traceRecord.created_at,
      } : null,
      intent_anchor: intentAnchor,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /agent/v1/transactions
 * Agent transaction submission with DIP reasoning trace verification (PRD 1.6 §9.2).
 */
export async function handleAgentTransaction(req, res, next) {
  try {
    const orgId = req.org?.id || req.agent?.orgId || req.session?.current_org_id || req.body?.org_id;
    if (!orgId) {
      throw new AppError('UNAUTHORIZED', 401, 'Organization authentication required');
    }

    const {
      category = 'SALE',
      sub_type = 'standard',
      amount_minor,
      currency = 'USD',
      counterparty_id = null,
      intent_mandate_id = null,
      reasoning_trace = null,
      metadata = {},
    } = req.body || {};

    if (!amount_minor) {
      throw new AppError('VALIDATION_FAILED', 400, 'amount_minor is required');
    }

    // Per PRD 1.6 §0 Rule 3:
    // Reasoning Trace wajib disertakan untuk setiap transaksi yang memiliki intent_mandate_id.
    // Jika tidak ada -> REJECTED dengan kode REASONING_TRACE_MISSING.
    if (intent_mandate_id && !reasoning_trace) {
      return res.status(200).json({
        intent_id: null,
        status: 'REJECTED',
        decision: 'REJECT',
        reason_codes: ['REASONING_TRACE_MISSING'],
        dis_score: 0,
        sar_id: null,
      });
    }

    let intentAnchor = null;
    let dip = null;

    if (intent_mandate_id) {
      intentAnchor = await getIntentAnchor(orgId, intent_mandate_id);
    }

    const txPayload = {
      category,
      sub_type,
      amount_minor: String(amount_minor),
      currency,
      counterparty_id,
      intent_mandate_id,
      reasoning_trace,
      metadata,
    };

    if (intentAnchor && reasoning_trace) {
      dip = await computeDecisionIntegrityScore({
        orgId,
        transaction: txPayload,
        intentAnchor,
        reasoningTrace: reasoning_trace,
      });
    }

    let status = 'APPROVED';
    let decision = 'AUTO_APPROVE';
    let reasonCodes = [];
    const disScore = dip ? dip.score : null;

    if (dip) {
      if (dip.hard_rule_triggered === 'DIP_EVIDENCE_INVALID') {
        status = 'REJECTED';
        decision = 'REJECT';
        reasonCodes = ['DIP_EVIDENCE_INVALID'];
      } else if (
        dip.hard_rule_triggered === 'DIP_BRAND_MISMATCH' ||
        dip.hard_rule_triggered === 'DIP_ATTRIBUTES_MISMATCH'
      ) {
        status = 'PENDING_APPROVAL';
        decision = 'REQUIRE_APPROVAL';
        reasonCodes = [dip.hard_rule_triggered];
      } else if (dip.score < 50) {
        status = 'REJECTED';
        decision = 'REJECT';
        reasonCodes = ['DIP_CRITICAL'];
      } else if (dip.score < 80) {
        status = 'PENDING_APPROVAL';
        decision = 'REQUIRE_APPROVAL';
        reasonCodes = ['DIP_LOW_SCORE'];
      } else {
        status = 'APPROVED';
        decision = 'AUTO_APPROVE';
      }
    }

    const idempotencyKey =
      req.header('Idempotency-Key') ||
      req.body?.idempotency_key ||
      `tx_idemp_${crypto.randomUUID()}`;
    const agentId = req.agent?.id || '00000000-0000-4000-8000-000000000001';
    const mandateVersionId = req.mandate?.versionId || '00000000-0000-4000-8000-000000000001';
    const requestHash = `sha256:${crypto.createHash('sha256').update(JSON.stringify(txPayload)).digest('hex')}`;

    const txResult = await withTx(async (tx) => {
      const inserted = await tx.query(
        `INSERT INTO transaction_intents (
           org_id, agent_id, category, sub_type, status,
           amount_minor, currency, counterparty_id,
           mandate_version_id, request_hash, idempotency_key, metadata, intent_mandate_id
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
         RETURNING *`,
        [
          orgId,
          agentId,
          category,
          sub_type,
          status,
          BigInt(amount_minor),
          currency,
          counterparty_id,
          mandateVersionId,
          requestHash,
          idempotencyKey,
          JSON.stringify({ ...metadata, dip }),
          intent_mandate_id,
        ]
      );
      return inserted.rows[0];
    });

    let snapshot = null;
    let cplResult = null;

    if (dip && reasoning_trace && txResult.intent_id) {
      await storeReasoningTrace({
        orgId,
        requestId: txResult.intent_id,
        trace: reasoning_trace,
      }).catch(() => {});

      await storeDecisionIntegrityScore({
        orgId,
        requestId: txResult.intent_id,
        dipResult: dip,
      }).catch(() => {});

      // CPL Cognitive Snapshot capture (PRD 1.7 §3.3)
      const promptHash = `sha256:${crypto.createHash('sha256').update(JSON.stringify(txPayload)).digest('hex')}`;
      const contextHash = intentAnchor?.intent_hash || `sha256:${crypto.createHash('sha256').update(orgId).digest('hex')}`;
      const rawHash = `sha256:${crypto.createHash('sha256').update(JSON.stringify(txPayload)).digest('hex')}`;

      snapshot = await createAndSaveCognitiveSnapshot({
        requestId: txResult.intent_id,
        orgId,
        model: {
          provider: 'openai',
          model_id: 'gpt-4o',
          model_version: '2024-08-06',
          temperature: 0,
          top_p: 1,
          seed: 42,
          max_tokens: 2000,
        },
        inputs: {
          user_prompt_hash: promptHash,
          context_hash: contextHash,
          document_hashes: [],
          tool_calls: [],
        },
        outputs: {
          decision: decision === 'AUTO_APPROVE' ? 'APPROVED' : (decision === 'REJECT' ? 'REJECTED' : 'REQUIRE_APPROVAL'),
          reasoning_trace_hash: dip.trace_hash,
          raw_output_hash: rawHash,
          decision_integrity_score: disScore || 0,
        },
      }).catch(() => null);

      if (snapshot) {
        cplResult = await evaluateCplForRequest(txResult.intent_id, orgId, {
          originalReasons: reasoning_trace.reasons,
        }).catch(() => null);

        if (cplResult) {
          if (cplResult.reproducibility_score < 70) {
            status = 'REJECTED';
            decision = 'REJECT';
            reasonCodes.push('CPL_CRITICAL');
          } else if (cplResult.reproducibility_score < 90) {
            status = 'PENDING_APPROVAL';
            decision = 'REQUIRE_APPROVAL';
            reasonCodes.push('CPL_LOW_REPRODUCIBILITY');
          }
        }
      }
    }

    let sarId = null;
    let sarObj = null;
    if (status === 'APPROVED' && dip) {
      const sar = generateSar({
        intent: txResult,
        legs: [],
        decision_integrity: dip,
        cognitive_provenance: (cplResult && snapshot) ? {
          snapshot_hash: snapshot.snapshot_hash,
          replay_hash: cplResult.replay_hash,
          reproducibility_score: cplResult.reproducibility_score,
          components: cplResult.components,
          model_id: snapshot.model.model_id,
          model_version: snapshot.model.model_version,
          seed: snapshot.model.seed,
        } : null,
      });
      sarId = sar.sar_hash;
      sarObj = sar;
    }

    return res.status(200).json({
      intent_id: txResult.intent_id,
      status,
      decision,
      reason_codes: reasonCodes,
      dis_score: disScore,
      reproducibility_score: cplResult?.reproducibility_score ?? null,
      sar_id: sarId,
      sar: sarObj,
    });
  } catch (err) {
    console.error('[handleAgentTransaction ERROR]', err);
    next(err);
  }
}

