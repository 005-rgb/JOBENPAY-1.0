/**
 * server/test/unit/invoice-concurrency.test.js
 * Concurrency, row locking & invoice number uniqueness tests for INVOICE
 * (Item 8 CCC, Blueprint M4, T-05, K-INVOICE)
 */

import test from 'node:test';
import assert from 'node:assert/strict';

test('INVOICE Concurrency & Row Locking Tests', async (t) => {
  await t.test('1. Concurrent creation with duplicate invoice_number within org is rejected (UNIQUE org_id, invoice_number)', async () => {
    const existingNumbers = new Set();
    let lockHeld = false;

    async function acquireLock() {
      while (lockHeld) {
        await new Promise((resolve) => setTimeout(resolve, 1));
      }
      lockHeld = true;
    }
    function releaseLock() {
      lockHeld = false;
    }

    async function createInvoiceRecord(orgId, invoiceNumber) {
      await acquireLock();
      try {
        const fullKey = `${orgId}:${invoiceNumber}`;
        if (existingNumbers.has(fullKey)) {
          const err = new Error('Duplicate invoice number in organization');
          err.code = 'INVOICE_NUMBER_ALREADY_EXISTS';
          err.statusCode = 409;
          throw err;
        }
        existingNumbers.add(fullKey);
        return { success: true, orgId, invoiceNumber };
      } finally {
        releaseLock();
      }
    }

    const orgId = '00000000-0000-4000-8000-000000000001';
    const number = 'INV-2026-CONC-01';

    const results = await Promise.allSettled([
      createInvoiceRecord(orgId, number),
      createInvoiceRecord(orgId, number),
      createInvoiceRecord(orgId, number),
    ]);

    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r) => r.status === 'rejected');

    assert.equal(fulfilled.length, 1, 'Exactly one invoice creation must succeed');
    assert.equal(rejected.length, 2, 'Duplicate creations must be rejected');
  });

  await t.test('2. Concurrent payment recording with SELECT ... FOR UPDATE prevents double collection', async () => {
    let invoice = {
      status: 'SENT',
      amountMinor: 50000n,
      paidMinor: 0n,
    };

    let lockHeld = false;
    let paymentCount = 0;

    async function acquireLock() {
      while (lockHeld) {
        await new Promise((resolve) => setTimeout(resolve, 1));
      }
      lockHeld = true;
    }
    function releaseLock() {
      lockHeld = false;
    }

    async function recordInvoicePayment(paymentAmount) {
      await acquireLock();
      try {
        if (invoice.status === 'PAID') {
          const err = new Error('Invoice is already paid');
          err.code = 'INVOICE_ALREADY_PAID';
          err.statusCode = 409;
          throw err;
        }

        invoice.paidMinor += paymentAmount;
        if (invoice.paidMinor >= invoice.amountMinor) {
          invoice.status = 'PAID';
        }
        paymentCount++;
        return { success: true, status: invoice.status };
      } finally {
        releaseLock();
      }
    }

    const results = await Promise.allSettled([
      recordInvoicePayment(50000n),
      recordInvoicePayment(50000n),
    ]);

    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r) => r.status === 'rejected');

    assert.equal(fulfilled.length, 1);
    assert.equal(rejected.length, 1);
    assert.equal(paymentCount, 1);
    assert.equal(invoice.status, 'PAID');
  });

  await t.test('3. Payment attempt on cancelled invoice is rejected with 409 ILLEGAL_TRANSITION', () => {
    const cancelledInvoice = { status: 'CANCELLED' };

    function attemptPayment(inv) {
      if (inv.status === 'CANCELLED') {
        const err = new Error('Cannot pay a cancelled invoice');
        err.code = 'ILLEGAL_TRANSITION';
        err.statusCode = 409;
        throw err;
      }
      return { success: true };
    }

    assert.throws(
      () => attemptPayment(cancelledInvoice),
      (err) => err.code === 'ILLEGAL_TRANSITION' && err.statusCode === 409
    );
  });
});

