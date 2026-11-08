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

test('Fase 1 Core Decision Engine Suite', async (t) => {
  let testOrgId;

  t.before(async () => {
    const orgRes = await pool.query('SELECT id FROM organizations LIMIT 1');
    if (orgRes.rows.length > 0) {
      testOrgId = orgRes.rows[0].id;
    } else {
      testOrgId = randomUUID();
      await pool.query(
        `INSERT INTO organizations (id, name, slug) VALUES ($1, 'Fase1 Org', 'fase1-org')`,
        [testOrgId],
      );
    }
  });

  t.after(async () => {
    await pool.end();
  });

  await t.test('test_tahap_a1_vlei', async () => {
    // Org without active vLEI
    const emptyOrgId = randomUUID();
    const active = await hasActiveVlei(emptyOrgId);
    assert.equal(active, false);

    const evalResult = await evaluateUnifiedDecision(emptyOrgId, {
      amount_minor: 1000n,
      require_vlei: true,
    });
    assert.equal(evalResult.decision, 'REJECT');
    assert.equal(evalResult.state, 'REJECTED');
    assert.ok(evalResult.reason_codes.includes('VLEI_INACTIVE'));
  });

  await t.test('test_tahap_a2_intent', async () => {
    // Intent missing or invalid
    const intentRes = await validateIntentMatch(testOrgId, null, {});
    assert.equal(intentRes.valid, false);
    assert.equal(intentRes.code, 'INTENT_MANDATE_MISSING');

    const evalResult = await evaluateUnifiedDecision(testOrgId, {
      require_vlei: false,
      require_intent: true,
      intent_mandate_id: null,
    });
    assert.equal(evalResult.decision, 'REJECT');
    assert.equal(evalResult.state, 'REJECTED');
    assert.ok(evalResult.reason_codes.includes('INTENT_MANDATE_MISSING'));
  });

  await t.test('test_tahap_a3_dip_reject', async () => {
    // DIP score < 50
    const dip = await computeDIP(testOrgId, { dip_score: 45 });
    assert.equal(dip.decision, 'REJECT');
    assert.equal(dip.code, 'DIP_CRITICAL');

    // Hard rule triggered
    const dipHard = await computeDIP(testOrgId, {
      dip_score: 85,
      hard_rule_triggered: 'DIP_EVIDENCE_INVALID',
    });
    assert.equal(dipHard.decision, 'REJECT');
    assert.equal(dipHard.code, 'DIP_EVIDENCE_INVALID');

    const evalResult = await evaluateUnifiedDecision(testOrgId, {
      require_vlei: false,
      require_intent: false,
      dip_score: 40,
    });
    assert.equal(evalResult.decision, 'REJECT');
    assert.equal(evalResult.state, 'REJECTED');
    assert.ok(evalResult.reason_codes.includes('DIP_CRITICAL'));
  });

  await t.test('test_tahap_a3_dip_escalate', async () => {
    // DIP score 50..79
    const dip = await computeDIP(testOrgId, { dip_score: 65 });
    assert.equal(dip.decision, 'REQUIRE_APPROVAL');
    assert.equal(dip.code, 'DIP_LOW_SCORE');

    const evalResult = await evaluateUnifiedDecision(testOrgId, {
      require_vlei: false,
      require_intent: false,
      dip_score: 75,
    });
    assert.equal(evalResult.decision, 'REQUIRE_APPROVAL');
    assert.equal(evalResult.state, 'NEEDS_APPROVAL');
    assert.ok(evalResult.reason_codes.includes('DIP_LOW_SCORE'));
  });

  await t.test('test_tahap_a3_dip_pass', async () => {
    // DIP score >= 80 -> lanjut
    const dip = await computeDIP(testOrgId, { dip_score: 85 });
    assert.equal(dip.decision, 'PASS');
  });

  await t.test('test_tahap_a4_cpl_reject', async () => {
    // CPL score < 70
    const cpl = await computeCPL(testOrgId, { cpl_score: 60 });
    assert.equal(cpl.decision, 'REJECT');
    assert.equal(cpl.code, 'CPL_CRITICAL');

    const evalResult = await evaluateUnifiedDecision(testOrgId, {
      require_vlei: false,
      require_intent: false,
      dip_score: 85,
      cpl_score: 55,
    });
    assert.equal(evalResult.decision, 'REJECT');
    assert.equal(evalResult.state, 'REJECTED');
    assert.ok(evalResult.reason_codes.includes('CPL_CRITICAL'));
  });

  await t.test('test_tahap_a4_cpl_escalate', async () => {
    // CPL score 70..89
    const cpl = await computeCPL(testOrgId, { cpl_score: 78 });
    assert.equal(cpl.decision, 'REQUIRE_APPROVAL');
    assert.equal(cpl.code, 'CPL_LOW_REPRODUCIBILITY');

    const evalResult = await evaluateUnifiedDecision(testOrgId, {
      require_vlei: false,
      require_intent: false,
      dip_score: 90,
      cpl_score: 82,
    });
    assert.equal(evalResult.decision, 'REQUIRE_APPROVAL');
    assert.equal(evalResult.state, 'NEEDS_APPROVAL');
    assert.ok(evalResult.reason_codes.includes('CPL_LOW_REPRODUCIBILITY'));
  });

  await t.test('test_tahap_a4_cpl_pass', async () => {
    // CPL score >= 90 -> lanjut
    const cpl = await computeCPL(testOrgId, { cpl_score: 95 });
    assert.equal(cpl.decision, 'PASS');

    const evalResult = await evaluateUnifiedDecision(testOrgId, {
      require_vlei: false,
      require_intent: false,
      dip_score: 95,
      cpl_score: 95,
    });
    assert.equal(evalResult.decision, 'APPROVE');
    assert.equal(evalResult.state, 'APPROVED');
  });

  await t.test('test_tahap_b_markers', () => {
    // Markers memicu REQUIRE_APPROVAL
    const markers1 = checkMarkers({ isNewPayee: true });
    assert.equal(markers1.requireApproval, true);
    assert.ok(markers1.markers.includes('NEW_PAYEE'));

    const markers2 = checkMarkers({ isHighVelocity: true, isUnusualTime: true });
    assert.equal(markers2.requireApproval, true);
    assert.ok(markers2.markers.includes('HIGH_VELOCITY'));
    assert.ok(markers2.markers.includes('UNUSUAL_TIME'));

    const markersEmpty = checkMarkers({});
    assert.equal(markersEmpty.requireApproval, false);
    assert.equal(markersEmpty.markers.length, 0);
  });

  await t.test('test_tahap_c_ai', () => {
    // AI hanya boleh memperketat
    // 1. AUTO_APPROVE diperketat jadi REQUIRE_APPROVAL
    const tightenToApproval = checkAIIntent({ ai_decision: 'REQUIRE_APPROVAL', ai_reason_codes: ['AI_SUSPICIOUS'] }, 'AUTO_APPROVE');
    assert.equal(tightenToApproval.decision, 'REQUIRE_APPROVAL');
    assert.ok(tightenToApproval.reason_codes.includes('AI_SUSPICIOUS'));

    // 2. REQUIRE_APPROVAL diperketat jadi REJECT
    const tightenToReject = checkAIIntent({ ai_decision: 'REJECT', ai_reason_codes: ['AI_HIGH_RISK'] }, 'REQUIRE_APPROVAL');
    assert.equal(tightenToReject.decision, 'REJECT');

    // 3. REJECT TIDAK BISA dilonggarkan oleh AI ke APPROVE
    const loosenAttempt = checkAIIntent({ ai_decision: 'AUTO_APPROVE' }, 'REJECT');
    assert.equal(loosenAttempt.decision, 'REJECT', 'AI must not loosen REJECT to AUTO_APPROVE');
  });

  await t.test('test_tahap_d_final', () => {
    // Final decision benar memetakan state
    // Case 1: Tahap A REJECT -> REJECTED
    const final1 = finalDecision({ decision: 'REJECT', code: 'VLEI_INACTIVE' }, null, null);
    assert.equal(final1.decision, 'REJECT');
    assert.equal(final1.state, 'REJECTED');

    // Case 2: Tahap A PASS, Tahap B Markers -> NEEDS_APPROVAL
    const final2 = finalDecision({ decision: 'PASS' }, { requireApproval: true, markers: ['NEW_PAYEE'] }, null);
    assert.equal(final2.decision, 'REQUIRE_APPROVAL');
    assert.equal(final2.state, 'NEEDS_APPROVAL');
    assert.ok(final2.reason_codes.includes('NEW_PAYEE'));

    // Case 3: Tahap A PASS, Tahap B None, Tahap C AI REJECT -> REJECTED
    const final3 = finalDecision(
      { decision: 'PASS' },
      { requireApproval: false, markers: [] },
      { ai_decision: 'REJECT', ai_reason_codes: ['AI_REJECT'] },
    );
    assert.equal(final3.decision, 'REJECT');
    assert.equal(final3.state, 'REJECTED');

    // Case 4: Tahap A PASS, Tahap B None, Tahap C None -> APPROVED
    const final4 = finalDecision({ decision: 'PASS' }, { requireApproval: false, markers: [] }, null);
    assert.equal(final4.decision, 'APPROVE');
    assert.equal(final4.state, 'APPROVED');
  });
});
