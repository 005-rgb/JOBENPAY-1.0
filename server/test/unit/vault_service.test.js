// @ts-check
import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import pool from '../../src/db/pool.js';
import { VaultService } from '../../src/services/payment/vault_service.js';

test('PRD 4.1: VaultService Unit Tests (100% Coverage Target)', async (t) => {
  let orgId;
  const customerId = crypto.randomUUID();

  t.before(async () => {
    const orgRes = await pool.query('SELECT id FROM organizations LIMIT 1');
    if (orgRes.rows.length === 0) {
      orgId = crypto.randomUUID();
      await pool.query('INSERT INTO organizations (id, name, slug) VALUES ($1, $2, $3)', [orgId, 'Vault Test Org', `org-${orgId.slice(0, 8)}`]);
    } else {
      orgId = orgRes.rows[0].id;
    }
  });

  t.after(async () => {
    await pool.query('DELETE FROM payment_methods WHERE org_id = $1', [orgId]);
  });

  await t.test('test_vault_tokenization: saves network token and prevents raw PAN', async () => {
    // 1. Success saving network token
    const token = `tok_visa_${crypto.randomBytes(8).toString('hex')}`;
    const saved = await VaultService.savePaymentMethod({
      orgId,
      environment: 'SANDBOX',
      customerId,
      gateway: 'STRIPE',
      token,
      cardBrand: 'visa',
      cardLast4: '4242',
      cardExpMonth: 12,
      cardExpYear: 2028,
      isDefault: true,
    });

    assert.ok(saved.pm_id);
    assert.equal(saved.token, token);
    assert.equal(saved.card_last4, '4242');
    assert.equal(saved.is_default, true);

    // 2. Retrieve method
    const fetched = await VaultService.getPaymentMethod(orgId, 'SANDBOX', saved.pm_id);
    assert.equal(fetched.pm_id, saved.pm_id);
    assert.equal(fetched.token, token);

    // 3. List methods
    const list = await VaultService.listPaymentMethods(orgId, 'SANDBOX', customerId);
    assert.ok(list.length >= 1);
    assert.equal(list[0].pm_id, saved.pm_id);

    // 4. Update on conflict with new details
    const updated = await VaultService.savePaymentMethod({
      orgId,
      environment: 'SANDBOX',
      customerId,
      gateway: 'STRIPE',
      token,
      cardBrand: 'visa',
      cardLast4: '4242',
      cardExpMonth: 11,
      cardExpYear: 2029,
      isDefault: false,
    });
    assert.equal(updated.pm_id, saved.pm_id);
    assert.equal(updated.card_exp_month, 11);

    // 5. Delete method
    const deleted = await VaultService.deletePaymentMethod(orgId, 'SANDBOX', saved.pm_id);
    assert.equal(deleted.success, true);

    await assert.rejects(
      async () => VaultService.getPaymentMethod(orgId, 'SANDBOX', saved.pm_id),
      /Payment method .* not found/,
    );
  });

  await t.test('test_vault_pci_dss_violation: rejects raw credit card numbers and sensitive data', async () => {
    // 16-digit credit card number as token
    await assert.rejects(
      async () => VaultService.savePaymentMethod({
        orgId,
        environment: 'SANDBOX',
        customerId,
        gateway: 'STRIPE',
        token: '4111111111114242',
      }),
      (err) => {
        assert.equal(err.code, 'PCI_DSS_VIOLATION');
        return true;
      },
    );

    // Explicit rawCardData passed
    await assert.rejects(
      async () => VaultService.savePaymentMethod({
        orgId,
        environment: 'SANDBOX',
        customerId,
        gateway: 'STRIPE',
        token: 'tok_test',
        // @ts-ignore
        rawCardData: { pan: '4111111111114242' },
      }),
      (err) => {
        assert.equal(err.code, 'PCI_DSS_VIOLATION');
        return true;
      },
    );
  });

  await t.test('test_vault_validations: verifies all parameter invariants and edge cases', async () => {
    // Missing orgId
    await assert.rejects(
      // @ts-ignore
      async () => VaultService.savePaymentMethod({ environment: 'SANDBOX', customerId }),
      /orgId is required/,
    );

    // Invalid environment
    await assert.rejects(
      async () => VaultService.savePaymentMethod({
        orgId,
        // @ts-ignore
        environment: 'UNKNOWN_ENV',
        customerId,
        gateway: 'STRIPE',
        token: 'tok_valid',
      }),
      /Invalid environment/,
    );

    // Missing customerId
    await assert.rejects(
      async () => VaultService.savePaymentMethod({
        orgId,
        environment: 'SANDBOX',
        // @ts-ignore
        customerId: null,
        gateway: 'STRIPE',
        token: 'tok_valid',
      }),
      /customerId is required/,
    );

    // Invalid gateway
    await assert.rejects(
      async () => VaultService.savePaymentMethod({
        orgId,
        environment: 'SANDBOX',
        customerId,
        // @ts-ignore
        gateway: 'BITCOIN_UNKNOWN',
        token: 'tok_valid',
      }),
      /Gateway must be one of/,
    );

    // Missing gateway
    await assert.rejects(
      async () => VaultService.savePaymentMethod({
        orgId,
        environment: 'SANDBOX',
        customerId,
        // @ts-ignore
        gateway: undefined,
        token: 'tok_valid',
      }),
      /Gateway must be one of/,
    );

    // Save with default environment and valid last4
    const savedDefaultEnv = await VaultService.savePaymentMethod({
      orgId,
      // @ts-ignore
      environment: undefined,
      customerId,
      gateway: 'STRIPE',
      token: 'tok_default_env',
      cardLast4: '9999',
    });
    assert.equal(savedDefaultEnv.environment, 'SANDBOX');
    assert.equal(savedDefaultEnv.card_last4, '9999');

    // Retrieve using default environment
    // @ts-ignore
    const fetchedDefault = await VaultService.getPaymentMethod(orgId, undefined, savedDefaultEnv.pm_id);
    assert.equal(fetchedDefault.pm_id, savedDefaultEnv.pm_id);

    // Missing token
    await assert.rejects(
      async () => VaultService.savePaymentMethod({
        orgId,
        environment: 'SANDBOX',
        customerId,
        gateway: 'STRIPE',
        token: '',
      }),
      /token is required/,
    );

    // Card last4 with invalid non-digit string
    const savedWithInvalidLast4 = await VaultService.savePaymentMethod({
      orgId,
      environment: 'SANDBOX',
      customerId,
      gateway: 'PAYPAL',
      token: 'tok_paypal_test',
      cardLast4: 'abcd',
    });
    assert.equal(savedWithInvalidLast4.card_last4, null);

    // getPaymentMethod missing pmId
    await assert.rejects(
      // @ts-ignore
      async () => VaultService.getPaymentMethod(orgId, 'SANDBOX', null),
      /pmId is required/,
    );

    // listPaymentMethods missing customerId
    await assert.rejects(
      // @ts-ignore
      async () => VaultService.listPaymentMethods(orgId, 'SANDBOX', null),
      /customerId is required/,
    );

    // deletePaymentMethod missing pmId
    await assert.rejects(
      // @ts-ignore
      async () => VaultService.deletePaymentMethod(orgId, 'SANDBOX', null),
      /pmId is required/,
    );

    // deletePaymentMethod not found
    await assert.rejects(
      async () => VaultService.deletePaymentMethod(orgId, 'SANDBOX', crypto.randomUUID()),
      /Payment method .* not found/,
    );
  });
});
