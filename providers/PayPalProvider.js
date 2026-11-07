/**
 * providers/PayPalProvider.js
 * PayPal Sandbox Provider Adapter (PRD-R §6.1 / BW-07)
 */

import { ProviderAdapter } from './ProviderAdapter.js';
import { PAYPAL_ENDPOINTS, PAYPAL_HOSTS } from './paypal/endpoints.js';
import { executePayout } from '../server/src/jobs/handlers/executeRequest.js';

export class PayPalProvider extends ProviderAdapter {
  constructor() {
    super('PayPalProvider');
  }

  async executeStep(request, step, params = {}) {
    // Wrap existing tested PayPal Sandbox client logic without rewriting payout logic
    if (request.category === 'PAYOUT' || step === 'payout') {
      return executePayout(request, params);
    }
    return {
      provider: 'paypal',
      status: 'SENT',
      paypal_ref: `pp_${request.intent_id ?? request.id}_${step}`,
      step,
    };
  }

  async queryStatus(providerRef) {
    return {
      provider: 'paypal',
      providerRef,
      status: 'SUCCEEDED',
    };
  }
}

export default PayPalProvider;
