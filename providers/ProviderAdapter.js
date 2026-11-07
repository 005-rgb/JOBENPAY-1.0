/**
 * providers/ProviderAdapter.js
 * Abstract Base Provider Adapter Contract (PRD-R §6.1 / BW-07)
 */

export class ProviderAdapter {
  constructor(name) {
    if (new.target === ProviderAdapter) {
      throw new TypeError('Cannot construct ProviderAdapter instances directly.');
    }
    this.name = name;
  }

  async executeStep(request, step, params = {}) {
    throw new Error(`executeStep not implemented on ${this.name}.`);
  }

  async queryStatus(providerRef) {
    throw new Error(`queryStatus not implemented on ${this.name}.`);
  }
}

export default ProviderAdapter;
