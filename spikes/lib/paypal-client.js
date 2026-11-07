/**
 * spikes/lib/paypal-client.js
 * Klien HTTP Sandbox deterministik dengan perekaman kaset.
 */

import { PAYPAL_HOSTS } from '../../paypal/endpoints.js';
import { saveCassette } from './cassette-recorder.js';

export class SpikePayPalClient {
  constructor({ clientId, clientSecret, scenarioId }) {
    this.clientId = clientId;
    this.clientSecret = clientSecret;
    this.scenarioId = scenarioId;
    this.token = null;
    this.baseUrl = PAYPAL_HOSTS.SANDBOX;
  }

  async getAccessToken() {
    if (this.token) return this.token;
    const auth = Buffer.from(`${this.clientId}:${this.clientSecret}`).toString('base64');
    const res = await fetch(`${this.baseUrl}/v1/oauth2/token`, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${auth}`,
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: 'grant_type=client_credentials'
    });
    const data = await res.json();
    this.token = data.access_token;
    return this.token;
  }

  async request(method, path, body = null, headers = {}, step = 'call') {
    const token = await this.getAccessToken();
    const allHeaders = {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...headers
    };

    const res = await fetch(`${this.baseUrl}${path}`, {
      method,
      headers: allHeaders,
      body: body ? JSON.stringify(body) : undefined
    });

    let resBody = null;
    const contentType = res.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
      resBody = await res.json();
    } else {
      resBody = await res.text();
    }

    // Rekam kaset
    const cassette = saveCassette(this.scenarioId, step, {
      method,
      path,
      headers: allHeaders,
      body
    }, {
      status: res.status,
      headers: Object.fromEntries(res.headers.entries()),
      body: resBody
    });

    return { status: res.status, body: resBody, cassette };
  }
}

