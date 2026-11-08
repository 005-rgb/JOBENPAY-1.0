// @ts-check
import { defaultRouter, routePayment } from './payment/payment_router.js';
import { defaultOrchestrator } from './payment/orchestrator.js';

/**
 * Execution Service (PRD 4.1 WP8)
 * Mengalihkan eksekusi pembayaran langsung ke Payment Orchestration Layer (PaymentRouter & Orchestrator)
 */
export class ExecutionService {
  /**
   * @param {object} [options]
   * @param {import('./payment/payment_router.js').PaymentRouter} [options.router]
   * @param {import('./payment/orchestrator.js').PaymentOrchestrator} [options.orchestrator]
   */
  constructor({ router = defaultRouter, orchestrator = defaultOrchestrator } = {}) {
    this.router = router;
    this.orchestrator = orchestrator;
  }

  /**
   * Eksekusi pembayaran multi-gateway dengan smart failover
   * @param {object} params
   */
  async executePayment(params) {
    if (params.requestId && params.orgId) {
      return this.orchestrator.createPayment(params);
    }
    return this.router.routePayment(
      params.amount,
      params.currency,
      params.token,
      params.idempotencyKey,
      params.metadata,
      params.options,
    );
  }
}

export const defaultExecutionService = new ExecutionService();
export { routePayment };
