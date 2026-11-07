/**
 * providers/PartnerSimulatorProvider.js
 * Partner Simulator Provider Adapter (PRD-R §6.1 / BW-07)
 * Strictly flags all outputs with provider: "simulated".
 */

import { ProviderAdapter } from './ProviderAdapter.js';
import { simulatePartnerDisbursement } from '../server/src/services/partnerSimulator.js';

export class PartnerSimulatorProvider extends ProviderAdapter {
  constructor() {
    super('PartnerSimulatorProvider');
  }

  async executeStep(request, step, params = {}) {
    return {
      provider: 'simulated',
      status: 'SUCCEEDED',
      partnerRef: `sim_${request.intent_id ?? request.id}_${step}`,
      step,
      simulated: true,
      label: 'SIMULATED',
    };
  }

  async queryStatus(providerRef) {
    return {
      provider: 'simulated',
      providerRef,
      status: 'SUCCEEDED',
      simulated: true,
      label: 'SIMULATED',
    };
  }
}

export default PartnerSimulatorProvider;
