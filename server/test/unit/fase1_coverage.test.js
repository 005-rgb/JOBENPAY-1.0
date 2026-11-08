import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { pool } from '../../src/db/pool.js';
import {
  hasActiveVlei,
  validateIntentMatch,
  computeDIP,
  computeCPL,
  checkMarkers,
  checkAIIntent,
  finalDecision,
  evaluateUnifiedDecision,
} from '../../src/services/decision_engine.js';
import { isValidTransition, transition } from '../../../shared/state-machine.js';

test('Fase 1 100% Coverage Suite', async (t) => {
  let testOrgId;

  t.before(async () => {
    const orgRes = await pool.query('SELECT id FROM organizations LIMIT 1');
    if (orgRes.rows.length > 0) {
      testOrgId = orgRes.rows[0].id;
    } else {
      testOrgId = randomUUID();
      await pool.query(
        `INSERT INTO organizations (id, name, slug) VALUES ($1, 'Fase1 Coverage Org', 'fase1-cov-org')`,
        [testOrgId],
      );
    }
  });

  t.after(async () => {
    await pool.end();
  });

  await t.test('state-machine isValidTransition and transition full branches', () => {
    assert.equal(isValidTransition('DRAFT', 'SUBMITTED'), true);
    assert.equal(isValidTransition('DRAFT', 'SUBMITTED', 'agent'), true);
    assert.equal(isValidTransition('DRAFT', 'SUBMITTED', 'wrong_actor'), false);
    assert.equal(isValidTransition('DRAFT', 'RECONCILED'), false);

    // transition() with actor in error message
    assert.throws(
      () => transition('DRAFT', 'EXECUTED', 'system'),
      (err) => err.code === 'ILLEGAL_TRANSITION' && err.message.includes('by system'),
    );
    // transition() without actor in error message
    assert.throws(
      () => transition('DRAFT', 'EXECUTED'),
      (err) => err.code === 'ILLEGAL_TRANSITION' && !err.message.includes('by'),
    );
  });

  await t.test('hasActiveVlei branches', async () => {
    assert.equal(await hasActiveVlei(null), false);

    // Mock client returning entity
    const mockVleiClient = {
      query: async (sql) => {
        if (sql.includes('FROM entities')) {
          return { rowCount: 1, rows: [{ 1: 1 }] };
        }
        return { rowCount: 0, rows: [] };
      },
    };
    assert.equal(await hasActiveVlei(testOrgId, mockVleiClient), true);

    // Table empty fallback to legacy
    const mockEmptyClient = {
      query: async () => ({ rowCount: 0, rows: [] }),
    };
    const emptyRes = await hasActiveVlei(testOrgId, mockEmptyClient);
    assert.equal(typeof emptyRes, 'boolean');

    // Invalid UUID triggers catch block in query & checkVleiLegacy
    const invalidUuidRes = await hasActiveVlei('not-a-valid-uuid');
    assert.equal(invalidUuidRes, false);
  });

  await t.test('validateIntentMatch full branches', async () => {
    // 1. Missing mandate id
    const missing = await validateIntentMatch(testOrgId, null, {});
    assert.equal(missing.valid, false);
    assert.equal(missing.code, 'INTENT_MANDATE_MISSING');

    // 2. Service error branch
    const errorClient = {
      query: async () => {
        throw new Error('service error');
      },
    };
    const resErr = await validateIntentMatch(testOrgId, randomUUID(), {}, errorClient);
    assert.equal(resErr.valid, false);
    assert.equal(resErr.code, 'INTENT_SERVICE_UNAVAILABLE');

    // 3. Not found branch
    const notFoundClient = {
      query: async () => ({ rows: [] }),
    };
    const resNotFound = await validateIntentMatch(testOrgId, randomUUID(), {}, notFoundClient);
    assert.equal(resNotFound.valid, false);
    assert.equal(resNotFound.code, 'INTENT_NOT_FOUND');

    // 4. Mandate found but mismatch
    const mandateId = randomUUID();
    const activeMandate = {
      intent_id: mandateId,
      org_id: testOrgId,
      status: 'ACTIVE',
      valid_from: new Date(Date.now() - 60000).toISOString(),
      valid_to: new Date(Date.now() + 60000).toISOString(),
      structured_intent: {
        purpose: 'PAYMENT',
        amount_range: { min: 0, max: 100000 },
        vendor_categories: ['SUPPLIES'],
      },
    };
    const mandateClient = {
      query: async () => ({ rows: [activeMandate] }),
    };
    const resMismatch = await validateIntentMatch(
      testOrgId,
      mandateId,
      { purpose: 'DIFFERENT_PURPOSE' },
      mandateClient,
    );
    assert.equal(resMismatch.valid, false);
    assert.equal(resMismatch.code, 'INTENT_MISMATCH');

    // 5. Valid mandate match
    const resValid = await validateIntentMatch(
      testOrgId,
      mandateId,
      {
        purpose: 'PAYMENT',
        amount_minor: 50000n,
        vendor_category: 'SUPPLIES',
      },
      mandateClient,
    );
    assert.equal(resValid.valid, true);
  });

  await t.test('computeDIP full calculation branches', async () => {
    // 1. Default passthrough
    const def = await computeDIP(testOrgId, {});
    assert.equal(def.score, 100);
    assert.equal(def.decision, 'PASS');

    // 2. Direct score branches
    const dipPass = await computeDIP(testOrgId, { dip_score: 90 });
    assert.equal(dipPass.decision, 'PASS');

    const dipLow = await computeDIP(testOrgId, { dis_score: 70 });
    assert.equal(dipLow.decision, 'REQUIRE_APPROVAL');
    assert.equal(dipLow.code, 'DIP_LOW_SCORE');

    const dipCrit = await computeDIP(testOrgId, { dip_score: 40 });
    assert.equal(dipCrit.decision, 'REJECT');
    assert.equal(dipCrit.code, 'DIP_CRITICAL');

    const dipIndetDirect = await computeDIP(testOrgId, {
      dip_score: 0,
      hard_rule_triggered: 'DIP_INDETERMINATE',
    });
    assert.equal(dipIndetDirect.decision, 'REQUIRE_APPROVAL');
    assert.equal(dipIndetDirect.code, 'DIP_INDETERMINATE');

    const dipRejectDirect = await computeDIP(testOrgId, {
      dip_score: 90,
      hard_rule_triggered: 'DIP_EVIDENCE_INVALID',
    });
    assert.equal(dipRejectDirect.decision, 'REJECT');
    assert.equal(dipRejectDirect.code, 'DIP_EVIDENCE_INVALID');

    // 3. Calculation with intent anchor without reasoning trace (triggers DIP_INDETERMINATE)
    const indetLive = await computeDIP(testOrgId, {
      intent_anchor: { intent_hash: 'sha256:abc' },
      reasoning_trace: null,
    });
    assert.equal(indetLive.decision, 'REQUIRE_APPROVAL');
    assert.equal(indetLive.code, 'DIP_INDETERMINATE');

    // 4. Valid reasoning trace & valid intent anchor (score calculation pass)
    const validTrace = {
      request_id: 'req_dip_cov_1',
      reasons: [
        { claim: 'Claim 1', evidence_ref: 'record:rec_1', data_source: 'invoice', extracted_attributes: { matched: true } },
        { claim: 'Claim 2', evidence_ref: 'record:rec_2', data_source: 'invoice', extracted_attributes: { matched: true } },
        { claim: 'Claim 3', evidence_ref: 'record:rec_3', data_source: 'invoice', extracted_attributes: { matched: true } },
      ],
    };
    const validAnchor = {
      intent_hash: 'sha256:anchor_cov_1',
      structured_intent: {
        purpose: 'TEST_PURPOSE',
        constraints: {
          amount_range: { min: 0, max: 100000 },
          vendor_categories: ['SUPPLIES'],
        },
      },
    };
    const evaluatedPass = await computeDIP(testOrgId, {
      intent_id: 'req_dip_cov_1',
      category: 'TEST_PURPOSE',
      amount_minor: 5000n,
      vendor_category: 'SUPPLIES',
      intent_anchor: validAnchor,
      reasoning_trace: validTrace,
    });
    assert.equal(evaluatedPass.decision, 'PASS');
    assert.ok(evaluatedPass.score >= 80);

    // 4b. Live calculation resulting in DIP low score (50..79)
    const evaluatedLow = await computeDIP(testOrgId, {
      intent_id: 'req_dip_cov_1',
      category: 'TEST_PURPOSE',
      amount_minor: 5000n,
      vendor_category: 'DIFFERENT_VENDOR', // fails vendor check
      intent_anchor: validAnchor,
      reasoning_trace: validTrace,
    });
    assert.equal(evaluatedLow.decision, 'REQUIRE_APPROVAL');
    assert.equal(evaluatedLow.code, 'DIP_LOW_SCORE');

    // 4c. Live calculation resulting in DIP critical (< 50)
    const evaluatedCrit = await computeDIP(testOrgId, {
      intent_id: 'req_dip_cov_1',
      category: 'WRONG_PURPOSE', // fails purpose
      amount_minor: 999999999n,  // fails amount
      vendor_category: 'DIFFERENT_VENDOR', // fails vendor
      intent_anchor: validAnchor,
      reasoning_trace: validTrace,
    });
    assert.equal(evaluatedCrit.decision, 'REJECT');
    assert.equal(evaluatedCrit.code, 'DIP_CRITICAL');

    // 5. Error during calculation
    const indeterminateTx = {
      intent_anchor: {
        get structured_intent() {
          throw new Error('dip error');
        },
      },
      reasoning_trace: validTrace,
    };
    const errDip = await computeDIP(testOrgId, indeterminateTx);
    assert.equal(errDip.decision, 'REQUIRE_APPROVAL');
    assert.equal(errDip.code, 'DIP_INDETERMINATE');
  });

  await t.test('computeCPL full calculation branches', async () => {
    // 1. Default passthrough
    const def = await computeCPL(testOrgId, {});
    assert.equal(def.score, 100);
    assert.equal(def.decision, 'PASS');

    // 2. Direct score branches
    const passCpl = await computeCPL(testOrgId, { rs_score: 95 });
    assert.equal(passCpl.decision, 'PASS');
    const medCpl = await computeCPL(testOrgId, { cpl_score: 80 });
    assert.equal(medCpl.decision, 'REQUIRE_APPROVAL');
    const lowCpl = await computeCPL(testOrgId, { cpl_score: 50 });
    assert.equal(lowCpl.decision, 'REJECT');

    // 3. Live calculation with replay and snapshot (PASS)
    const mockReplay = {
      decision: 'APPROVE',
      reasoning_trace_hash: 'sha256:abc',
      raw_output_hash: 'sha256:def',
    };
    const mockSnapshot = {
      outputs: {
        decision: 'APPROVE',
        reasoning_trace_hash: 'sha256:abc',
        raw_output_hash: 'sha256:def',
      },
    };
    const validCpl = await computeCPL(testOrgId, {
      replay: mockReplay,
      snapshot: mockSnapshot,
    });
    assert.ok(validCpl.score >= 90);
    assert.equal(validCpl.decision, 'PASS');

    // 4. Live calculation with decision mismatch (REJECT)
    const mismatchReplay = {
      decision: 'REJECT',
      reasoning_trace_hash: 'sha256:xyz',
      raw_output_hash: 'sha256:uvw',
    };
    const rejectCpl = await computeCPL(testOrgId, {
      replay: mismatchReplay,
      snapshot: mockSnapshot,
    });
    assert.ok(rejectCpl.score < 70);
    assert.equal(rejectCpl.decision, 'REJECT');
    assert.equal(rejectCpl.code, 'CPL_CRITICAL');

    // 5. Live calculation with partial match (70..89)
    const partialReplay = {
      decision: 'APPROVE',
      reasoning_trace_hash: 'sha256:different',
      raw_output_hash: 'sha256:def',
    };
    const partialCpl = await computeCPL(testOrgId, {
      replay: partialReplay,
      snapshot: mockSnapshot,
    });
    assert.ok(partialCpl.score >= 70 && partialCpl.score < 90);
    assert.equal(partialCpl.decision, 'REQUIRE_APPROVAL');
    assert.equal(partialCpl.code, 'CPL_LOW_REPRODUCIBILITY');

    // 6. Error branch
    const errCpl = await computeCPL(testOrgId, {
      replay: {},
      snapshot: {
        get outputs() {
          throw new Error('cpl error');
        },
      },
    });
    assert.equal(errCpl.decision, 'REQUIRE_APPROVAL');
    assert.equal(errCpl.code, 'CPL_REPLAY_UNAVAILABLE');
  });

  await t.test('checkMarkers full branches', () => {
    // All boolean markers
    const b1 = checkMarkers({ isNewPayee: true });
    assert.ok(b1.markers.includes('NEW_PAYEE'));

    const b2 = checkMarkers({ isHighVelocity: true });
    assert.ok(b2.markers.includes('HIGH_VELOCITY'));

    const b3 = checkMarkers({ isUnusualTime: true });
    assert.ok(b3.markers.includes('UNUSUAL_TIME'));

    const b4 = checkMarkers({ isLargeAmount: true });
    assert.ok(b4.markers.includes('LARGE_AMOUNT'));

    // Markers array and flags
    const res = checkMarkers({
      markers: ['NEW_PAYEE', 'HIGH_VELOCITY', 'UNUSUAL_TIME', 'LARGE_AMOUNT'],
      flags: ['FLAG_SUSPICIOUS', { code: 'FLAG_OBJECT' }],
    });
    assert.equal(res.requireApproval, true);
    assert.ok(res.markers.includes('NEW_PAYEE'));
    assert.ok(res.markers.includes('HIGH_VELOCITY'));
    assert.ok(res.markers.includes('UNUSUAL_TIME'));
    assert.ok(res.markers.includes('LARGE_AMOUNT'));
    assert.ok(res.markers.includes('FLAG_SUSPICIOUS'));
    assert.ok(res.markers.includes('FLAG_OBJECT'));

    // Empty context
    const emptyMarkers = checkMarkers();
    assert.equal(emptyMarkers.requireApproval, false);
    assert.equal(emptyMarkers.markers.length, 0);
  });

  await t.test('checkAIIntent full branch coverage', () => {
    // 1. Default fallback
    const def = checkAIIntent();
    assert.equal(def.decision, 'APPROVE');

    // 2. Unknown decision string
    const unk = checkAIIntent({ ai_decision: 'UNKNOWN' }, 'AUTO_APPROVE');
    assert.equal(unk.decision, 'APPROVE');

    // 3. Different reason code shapes
    const r1 = checkAIIntent({ reasonCodes: ['R1'] });
    assert.deepEqual(r1.reason_codes, ['R1']);

    const r2 = checkAIIntent({ ai_reason_codes: ['R2'] });
    assert.deepEqual(r2.reason_codes, ['R2']);

    const r3 = checkAIIntent({ ai: { reason_codes: ['R3'], decision: 'APPROVE' } });
    assert.deepEqual(r3.reason_codes, ['R3']);

    // 4. AI monotonic tightening ranks
    assert.equal(checkAIIntent({ decision: 'APPROVE' }, 'REQUIRE_APPROVAL').decision, 'REQUIRE_APPROVAL');
    assert.equal(checkAIIntent({ decision: 'REJECT' }, 'REQUIRE_APPROVAL').decision, 'REJECT');
    assert.equal(checkAIIntent({ decision: 'AUTO_APPROVE' }, 'REJECT').decision, 'REJECT');
    assert.equal(checkAIIntent({ decision: 'APPROVE' }, 'UNKNOWN_PRIOR').decision, 'APPROVE');
  });

  await t.test('finalDecision full branch coverage', () => {
    // 1. Tahap A REJECT with reason_codes and code
    const fdReject1 = finalDecision(
      { decision: 'REJECT', code: 'CODE_1', reason_codes: ['RC_1'] },
      null,
      null,
    );
    assert.equal(fdReject1.decision, 'REJECT');
    assert.equal(fdReject1.state, 'REJECTED');
    assert.ok(fdReject1.reason_codes.includes('CODE_1'));
    assert.ok(fdReject1.reason_codes.includes('RC_1'));

    // 2. Tahap A REJECT without code or reason_codes
    const fdReject2 = finalDecision({ decision: 'REJECT' }, null, null);
    assert.equal(fdReject2.decision, 'REJECT');
    assert.equal(fdReject2.state, 'REJECTED');

    // 3. Tahap A REQUIRE_APPROVAL without code
    const fdAppr1 = finalDecision({ decision: 'REQUIRE_APPROVAL' }, null, null);
    assert.equal(fdAppr1.decision, 'REQUIRE_APPROVAL');
    assert.equal(fdAppr1.state, 'NEEDS_APPROVAL');

    // 3b. Tahap A REQUIRE_APPROVAL with code and reason_codes
    const fdAppr2 = finalDecision(
      { decision: 'REQUIRE_APPROVAL', code: 'DIP_SCORE', reason_codes: ['DIP_RC'] },
      null,
      null,
    );
    assert.equal(fdAppr2.decision, 'REQUIRE_APPROVAL');
    assert.ok(fdAppr2.reason_codes.includes('DIP_RC'));

    // 4. Tahap B requireApproval without markers
    const fdB1 = finalDecision(
      { decision: 'PASS' },
      { requireApproval: true, markers: [] },
      null,
    );
    assert.equal(fdB1.decision, 'REQUIRE_APPROVAL');
    assert.equal(fdB1.state, 'NEEDS_APPROVAL');

    // 5. Tahap C with reason_codes
    const fdC1 = finalDecision(
      { decision: 'PASS' },
      { requireApproval: false },
      { ai_decision: 'REQUIRE_APPROVAL', ai_reason_codes: ['AI_NOTE'] },
    );
    assert.equal(fdC1.decision, 'REQUIRE_APPROVAL');
    assert.ok(fdC1.reason_codes.includes('AI_NOTE'));
  });

  await t.test('evaluateUnifiedDecision all paths', async () => {
    const mockFullClient = {
      query: async (sql) => {
        if (sql.includes('FROM entities')) {
          return { rowCount: 1, rows: [{ 1: 1 }] };
        }
        return { rowCount: 0, rows: [] };
      },
    };

    // 1. Successful pass through all stages
    const fullPass = await evaluateUnifiedDecision(
      testOrgId,
      {
        require_vlei: true,
        require_intent: false,
        dip_score: 95,
        cpl_score: 95,
      },
      {
        isNewPayee: false,
      },
      mockFullClient,
    );
    assert.equal(fullPass.decision, 'APPROVE');
    assert.equal(fullPass.state, 'APPROVED');

    // 2. Full pass with markers leading to NEEDS_APPROVAL
    const markerPass = await evaluateUnifiedDecision(
      testOrgId,
      {
        require_vlei: false,
        require_intent: false,
        dip_score: 95,
        cpl_score: 95,
      },
      {
        isNewPayee: true,
      },
    );
    assert.equal(markerPass.decision, 'REQUIRE_APPROVAL');
    assert.equal(markerPass.state, 'NEEDS_APPROVAL');

    // 3. Full pass with AI tightening to REJECT
    const aiTighten = await evaluateUnifiedDecision(
      testOrgId,
      {
        require_vlei: false,
        require_intent: false,
        dip_score: 95,
        cpl_score: 95,
      },
      {
        ai: { decision: 'REJECT', reason_codes: ['AI_RISK'] },
      },
    );
    assert.equal(aiTighten.decision, 'REJECT');
    assert.equal(aiTighten.state, 'REJECTED');

    // 4. DIP escalation with markers and AI tightening
    const dipEscalate = await evaluateUnifiedDecision(
      testOrgId,
      {
        require_vlei: false,
        require_intent: false,
        dip_score: 65,
      },
      {
        isLargeAmount: true,
        ai: { decision: 'REQUIRE_APPROVAL', reason_codes: ['AI_NOTIFY'] },
      },
    );
    assert.equal(dipEscalate.decision, 'REQUIRE_APPROVAL');
    assert.equal(dipEscalate.state, 'NEEDS_APPROVAL');

    // 5. DIP escalation without AI
    const dipEscalateNoAi = await evaluateUnifiedDecision(
      testOrgId,
      {
        require_vlei: false,
        require_intent: false,
        dip_score: 65,
      },
      {
        isLargeAmount: false,
      },
    );
    assert.equal(dipEscalateNoAi.decision, 'REQUIRE_APPROVAL');

    // 6. CPL escalation without AI
    const cplEscalateNoAi = await evaluateUnifiedDecision(
      testOrgId,
      {
        require_vlei: false,
        require_intent: false,
        dip_score: 90,
        cpl_score: 80,
      },
      {},
    );
    assert.equal(cplEscalateNoAi.decision, 'REQUIRE_APPROVAL');

    // 6b. CPL escalation with AI
    const cplEscalateWithAi = await evaluateUnifiedDecision(
      testOrgId,
      {
        require_vlei: false,
        require_intent: false,
        dip_score: 90,
        cpl_score: 80,
      },
      {
        ai: { decision: 'REQUIRE_APPROVAL', reason_codes: ['AI_CPL_CHECK'] },
      },
    );
    assert.equal(cplEscalateWithAi.decision, 'REQUIRE_APPROVAL');

    // 7. Intent mandate validation pass
    const mandateId = randomUUID();
    const activeMandate = {
      intent_id: mandateId,
      org_id: testOrgId,
      status: 'ACTIVE',
      valid_from: new Date(Date.now() - 60000).toISOString(),
      valid_to: new Date(Date.now() + 60000).toISOString(),
      structured_intent: {
        purpose: 'TEST_TX',
        amount_range: { min: 0, max: 100000 },
        vendor_categories: ['SUPPLIES'],
      },
    };
    const intentMatchClient = {
      query: async (sql) => {
        if (sql.includes('FROM entities')) {
          return { rowCount: 1, rows: [{ 1: 1 }] };
        }
        if (sql.includes('FROM intent_mandates')) {
          return { rows: [activeMandate] };
        }
        return { rowCount: 0, rows: [] };
      },
    };
    const intentPass = await evaluateUnifiedDecision(
      testOrgId,
      {
        require_vlei: false,
        require_intent: true,
        intent_mandate_id: mandateId,
        purpose: 'TEST_TX',
        amount_minor: 1000n,
        vendor_category: 'SUPPLIES',
        dip_score: 95,
        cpl_score: 95,
      },
      {},
      intentMatchClient,
    );
    assert.equal(intentPass.decision, 'APPROVE');

    // 8. Intent validation with require_intent omitted (infers from intent_mandate_id)
    const intentInferredPass = await evaluateUnifiedDecision(
      testOrgId,
      {
        require_vlei: false,
        intent_mandate_id: mandateId,
        purpose: 'TEST_TX',
        amount_minor: 1000n,
        vendor_category: 'SUPPLIES',
        dip_score: 95,
        cpl_score: 95,
      },
      {},
      intentMatchClient,
    );
    assert.equal(intentInferredPass.decision, 'APPROVE');

    // 9. Tahap B REJECT branches (lines 454-456, 473-475, 487-489)
    // 9a. DIP REQUIRE_APPROVAL + Tahap B REJECT
    const dipReqApprBReject = await evaluateUnifiedDecision(
      testOrgId,
      {
        require_vlei: false,
        require_intent: false,
        dip_score: 65,
      },
      {
        policy: 'INVALID JPL SYNTAX POLICY ERROR',
      },
    );
    assert.equal(dipReqApprBReject.decision, 'REJECT');

    // 9b. CPL REQUIRE_APPROVAL + Tahap B REJECT
    const cplReqApprBReject = await evaluateUnifiedDecision(
      testOrgId,
      {
        require_vlei: false,
        require_intent: false,
        dip_score: 90,
        cpl_score: 80,
      },
      {
        policy: 'INVALID JPL SYNTAX POLICY ERROR',
      },
    );
    assert.equal(cplReqApprBReject.decision, 'REJECT');

    // 9c. Tahap A PASS + Tahap B REJECT
    const passBReject = await evaluateUnifiedDecision(
      testOrgId,
      {
        require_vlei: false,
        require_intent: false,
        dip_score: 95,
        cpl_score: 95,
      },
      {
        policy: 'INVALID JPL SYNTAX POLICY ERROR',
      },
    );
    assert.equal(passBReject.decision, 'REJECT');

    // 9d. finalDecision directly with tahapB.code and distinct reason_code
    const bRejectDirect = finalDecision(
      { decision: 'PASS' },
      { decision: 'REJECT', code: 'JPL_ERR_CODE', reason_code: 'JPL_DISTINCT_REASON' },
      null,
    );
    assert.equal(bRejectDirect.decision, 'REJECT');
    assert.ok(bRejectDirect.reason_codes.includes('JPL_ERR_CODE'));
    assert.ok(bRejectDirect.reason_codes.includes('JPL_DISTINCT_REASON'));
  });
});
