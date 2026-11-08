// @ts-check
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { SLI_DEFINITIONS } from '../../../shared/sli-definitions.js';
import { SLO_DEFINITIONS } from '../../../shared/slo-definitions.js';
import {
  getErrorBudget,
  computeBurnRate,
  getAllSLOs,
  getSLOById,
} from '../../src/services/slo_service.js';

describe('WP1: SLO & SLI Service Unit Tests', () => {
  it('test_sli_definition_valid: Semua 6 SLI valid dan memiliki field wajib', () => {
    assert.strictEqual(SLI_DEFINITIONS.length, 6, 'Harus ada tepat 6 SLI');
    for (const sli of SLI_DEFINITIONS) {
      assert.ok(sli.id, 'SLI id wajib ada');
      assert.ok(sli.name, 'SLI name wajib ada');
      assert.ok(sli.description, 'SLI description wajib ada');
      assert.ok(sli.metric, 'SLI metric wajib ada');
      assert.ok(sli.unit, 'SLI unit wajib ada');
      assert.ok(sli.good_event, 'SLI good_event wajib ada');
      assert.ok(sli.valid_event, 'SLI valid_event wajib ada');
    }
  });

  it('test_slo_definition_valid: Semua 6 SLO valid dan target sesuai spesifikasi', () => {
    assert.strictEqual(SLO_DEFINITIONS.length, 6, 'Harus ada tepat 6 SLO');
    const expectedIds = [
      'slo_decision_latency',
      'slo_decision_availability',
      'slo_payout_success',
      'slo_double_payout',
      'slo_webhook_processing',
      'slo_ledger_verification',
    ];

    for (const id of expectedIds) {
      const slo = SLO_DEFINITIONS.find((s) => s.id === id);
      assert.ok(slo, `SLO ${id} harus terdefinisi`);
      assert.ok(slo.target >= 0 && slo.target <= 1.0, 'Target harus di antara 0 dan 1');
      assert.ok(slo.window, 'Window wajib ada');
      assert.ok(slo.burn_rate_threshold > 0, 'Burn rate threshold harus > 0');
    }
  });

  it('test_error_budget_calculation: Error budget = 1 - target atau 0 jika target 1.0', () => {
    const latencyBudget = getErrorBudget('slo_decision_latency');
    assert.strictEqual(latencyBudget, 0.05);

    const doublePayoutBudget = getErrorBudget('slo_double_payout');
    assert.strictEqual(doublePayoutBudget, 0);

    assert.throws(
      () => getErrorBudget('non_existent_slo'),
      /SLO not found/,
      'Throws 404 for unknown SLO ID'
    );
  });

  it('test_burn_rate_calculation: Burn rate dihitung dengan benar terhadap error budget', () => {
    // Normal burn rate
    const burnRate = computeBurnRate('slo_decision_latency', 0.01);
    assert.strictEqual(burnRate, 0.2); // 0.01 / 0.05 = 0.2

    // Zero budget with zero error rate -> 0
    const zeroRate = computeBurnRate('slo_double_payout', 0);
    assert.strictEqual(zeroRate, 0);

    // Zero budget with > 0 error rate -> Infinity
    const infRate = computeBurnRate('slo_double_payout', 1);
    assert.strictEqual(infRate, Infinity);

    assert.throws(
      () => computeBurnRate('unknown_slo', 0.05),
      /SLO not found/,
      'Throws 404 for unknown SLO ID'
    );
  });

  it('test_get_all_slos_and_by_id: Mengambil seluruh SLO dan SLO detail per ID', () => {
    const all = getAllSLOs();
    assert.strictEqual(all.slos.length, 6);
    assert.ok(all.generated_at);

    const single = getSLOById('slo_decision_latency');
    assert.strictEqual(single.id, 'slo_decision_latency');
    assert.strictEqual(single.status, 'healthy');
    assert.ok(Array.isArray(single.history));
    assert.strictEqual(single.history.length, 2);

    const doublePayout = getSLOById('slo_double_payout');
    assert.strictEqual(doublePayout.id, 'slo_double_payout');
    assert.strictEqual(doublePayout.burn_rate, 0);

    assert.throws(
      () => getSLOById('invalid_id'),
      /SLO not found/
    );
  });
});
