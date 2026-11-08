// @ts-check
import test from 'node:test';
import assert from 'node:assert/strict';
import { BaseConnector } from '../../src/services/payment/connectors/base_connector.js';
import { StripeAdapter } from '../../src/services/payment/connectors/stripe_adapter.js';
import { PayPalAdapter } from '../../src/services/payment/connectors/paypal_adapter.js';

test('PRD 4.1: Connectors & Adapters Unit Tests', async (t) => {
  await t.test('BaseConnector: raises Not Implemented on base methods', async () => {
    const base = new BaseConnector();
    await assert.rejects(async () => base.authorize(100, 'USD', 'tok', 'k'), /Not implemented: authorize/);
    await assert.rejects(async () => base.capture('tx', 100, 'k'), /Not implemented: capture/);
    await assert.rejects(async () => base.refund('tx', 100, 'k'), /Not implemented: refund/);
    await assert.rejects(async () => base.verifyWebhook('{}', 'sig'), /Not implemented: verifyWebhook/);
  });

  await t.test('StripeAdapter: standard flows, declines, and injected client', async () => {
    const stripe = new StripeAdapter({ apiKey: 'sk_test_123' });

    // Standard authorization
    const authRes = await stripe.authorize(1000, 'USD', 'tok_visa_valid', 'idem_1');
    assert.equal(authRes.success, true);
    assert.equal(authRes.gateway, 'STRIPE');
    assert.match(authRes.gatewayTxId, /^ch_stripe_/);

    // Capture
    const capRes = await stripe.capture(authRes.gatewayTxId, 1000, 'idem_cap_1');
    assert.equal(capRes.success, true);
    assert.equal(capRes.status, 'CAPTURED');

    // Refund
    const refRes = await stripe.refund(authRes.gatewayTxId, 500, 'idem_ref_1');
    assert.equal(refRes.success, true);
    assert.equal(refRes.status, 'REFUNDED');
    assert.match(refRes.refundId, /^re_stripe_/);

    // Hard decline simulation
    const hardToken = await stripe.authorize(1000, 'USD', 'tok_hard_decline', 'idem_hd');
    assert.equal(hardToken.success, false);
    assert.equal(hardToken.isHardDecline, true);

    const hardMeta = await stripe.authorize(1000, 'USD', 'tok_any', 'idem_hd2', { simulateHardDecline: true });
    assert.equal(hardMeta.isHardDecline, true);

    // Soft decline simulation
    const softToken = await stripe.authorize(1000, 'USD', 'tok_soft_decline', 'idem_sd');
    assert.equal(softToken.success, false);
    assert.equal(softToken.isHardDecline, false);

    const softMeta = await stripe.authorize(1000, 'USD', 'tok_any', 'idem_sd2', { simulateSoftDecline: true });
    assert.equal(softMeta.isHardDecline, false);

    // Webhook verification
    const validHook = await stripe.verifyWebhook('{"type":"payment_intent.succeeded"}', 'valid_sig');
    assert.equal(validHook.isValid, true);
    assert.equal(validHook.event.type, 'payment_intent.succeeded');

    const objHook = await stripe.verifyWebhook({ type: 'charge.captured' }, 'sig_obj');
    assert.equal(objHook.isValid, true);

    const invalidHook = await stripe.verifyWebhook('{}', 'invalid_signature');
    assert.equal(invalidHook.isValid, false);

    const missingSigHook = await stripe.verifyWebhook('{}', '');
    assert.equal(missingSigHook.isValid, false);

    // Injected client
    const mockClient = {
      authorize: async () => ({ success: true, custom: true }),
      capture: async () => ({ success: true, captured: true }),
      refund: async () => ({ success: true, refunded: true }),
      verifyWebhook: async () => ({ isValid: true, injected: true }),
    };
    const injectedStripe = new StripeAdapter({ client: mockClient });
    assert.equal((await injectedStripe.authorize(1, 'USD', 't', 'k')).custom, true);
    assert.equal((await injectedStripe.capture('tx', 1, 'k')).captured, true);
    assert.equal((await injectedStripe.refund('tx', 1, 'k')).refunded, true);
    assert.equal((await injectedStripe.verifyWebhook('b', 's')).injected, true);

    // Error handling in authorize (hard vs soft)
    const errClientHard = {
      authorize: async () => {
        const err = new Error('Card stolen');
        // @ts-ignore
        err.decline_code = 'stolen_card';
        throw err;
      },
    };
    const stripeWithHardErr = new StripeAdapter({ client: errClientHard });
    const errHardRes = await stripeWithHardErr.authorize(100, 'USD', 'tok', 'k');
    assert.equal(errHardRes.isHardDecline, true);

    const errClientSoft = {
      authorize: async () => {
        const err = new Error('Network glitch');
        // @ts-ignore
        err.code = 'rate_limit';
        throw err;
      },
    };
    const stripeWithSoftErr = new StripeAdapter({ client: errClientSoft });
    const errSoftRes = await stripeWithSoftErr.authorize(100, 'USD', 'tok', 'k');
    assert.equal(errSoftRes.isHardDecline, false);
  });

  await t.test('PayPalAdapter: standard flows, declines, and injected client', async () => {
    const paypal = new PayPalAdapter();

    // Standard authorization
    const authRes = await paypal.authorize(2500, 'USD', 'tok_ba_paypal_valid', 'idem_pp_1');
    assert.equal(authRes.success, true);
    assert.equal(authRes.gateway, 'PAYPAL');
    assert.match(authRes.gatewayTxId, /^auth_paypal_/);

    // Capture
    const capRes = await paypal.capture(authRes.gatewayTxId, 2500, 'idem_pp_cap_1');
    assert.equal(capRes.success, true);
    assert.equal(capRes.status, 'CAPTURED');

    // Refund
    const refRes = await paypal.refund(authRes.gatewayTxId, 2500, 'idem_pp_ref_1');
    assert.equal(refRes.success, true);
    assert.equal(refRes.status, 'REFUNDED');
    assert.match(refRes.refundId, /^re_paypal_/);

    // Hard decline simulation
    const hardToken = await paypal.authorize(1000, 'USD', 'tok_hard_decline', 'idem_pp_hd');
    assert.equal(hardToken.success, false);
    assert.equal(hardToken.isHardDecline, true);

    const hardMeta = await paypal.authorize(1000, 'USD', 'tok_any', 'idem_pp_hd2', { simulateHardDecline: true });
    assert.equal(hardMeta.isHardDecline, true);

    // Soft decline simulation
    const softToken = await paypal.authorize(1000, 'USD', 'tok_soft_decline', 'idem_pp_sd');
    assert.equal(softToken.success, false);
    assert.equal(softToken.isHardDecline, false);

    const softMeta = await paypal.authorize(1000, 'USD', 'tok_any', 'idem_pp_sd2', { simulateSoftDecline: true });
    assert.equal(softMeta.isHardDecline, false);

    // Webhook verification
    const validHook = await paypal.verifyWebhook('{"event_type":"PAYMENT.CAPTURE.COMPLETED"}', 'valid_sig');
    assert.equal(validHook.isValid, true);
    assert.equal(validHook.event.event_type, 'PAYMENT.CAPTURE.COMPLETED');

    const objHook = await paypal.verifyWebhook({ event_type: 'PAYMENT.CAPTURE.DENIED' }, 'sig_obj');
    assert.equal(objHook.isValid, true);

    const invalidHook = await paypal.verifyWebhook('{}', 'invalid_signature');
    assert.equal(invalidHook.isValid, false);

    const missingSigHook = await paypal.verifyWebhook('{}', '');
    assert.equal(missingSigHook.isValid, false);

    // Injected client
    const mockClient = {
      authorize: async () => ({ success: true, custom: true }),
      capture: async () => ({ success: true, captured: true }),
      refund: async () => ({ success: true, refunded: true }),
      verifyWebhook: async () => ({ isValid: true, injected: true }),
    };
    const injectedPP = new PayPalAdapter({ client: mockClient });
    assert.equal((await injectedPP.authorize(1, 'USD', 't', 'k')).custom, true);
    assert.equal((await injectedPP.capture('tx', 1, 'k')).captured, true);
    assert.equal((await injectedPP.refund('tx', 1, 'k')).refunded, true);
    assert.equal((await injectedPP.verifyWebhook('b', 's')).injected, true);

    // Error handling in authorize (hard vs soft)
    const errClientHard = {
      authorize: async () => {
        const err = new Error('Suspected fraud');
        // @ts-ignore
        err.issue = 'SUSPECTED_FRAUD';
        throw err;
      },
    };
    const ppWithHardErr = new PayPalAdapter({ client: errClientHard });
    const errHardRes = await ppWithHardErr.authorize(100, 'USD', 'tok', 'k');
    assert.equal(errHardRes.isHardDecline, true);

    const errClientSoft = {
      authorize: async () => {
        const err = new Error('Timeout');
        // @ts-ignore
        err.code = 'SOCKET_TIMEOUT';
        throw err;
      },
    };
    const ppWithSoftErr = new PayPalAdapter({ client: errClientSoft });
    const errSoftRes = await ppWithSoftErr.authorize(100, 'USD', 'tok', 'k');
    assert.equal(errSoftRes.isHardDecline, false);
  });
});
