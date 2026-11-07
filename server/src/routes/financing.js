/**
 * server/src/routes/financing.js
 * RESTful API endpoints for FINANCING transaction category (Tier C, PRD 1.3 §3, AD-17, B-F6)
 */

import { Router } from 'express';
import { z } from 'zod';
import { AppError } from '../lib/errors.js';
import { query } from '../db/pool.js';
import { withTx } from '../db/tx.js';
import { financingProposalSchema, calculateFinancingSchedule } from '../../../shared/financing.js';
import { PartnerSimulatorProvider } from '../services/partnerSimulator.js';

export const financingRouter = Router();

const repayBodySchema = z.object({
  cycleNumber: z.number().int().positive(),
  amountMinor: z.union([z.number().int().positive(), z.string().regex(/^[1-9]\d*$/)]),
  principalPortionMinor: z.union([z.number().int().min(0), z.string().regex(/^\d+$/)]).optional(),
  interestPortionMinor: z.union([z.number().int().min(0), z.string().regex(/^\d+$/)]).optional(),
  feePortionMinor: z.union([z.number().int().min(0), z.string().regex(/^\d+$/)]).optional(),
  currency: z.string().length(3).default('USD'),
});

financingRouter.post('/', async (req, res, next) => {
  try {
    const orgId = req.org?.id || req.session?.current_org_id || req.session?.org_id || req.user?.org_id || '00000000-0000-4000-8000-000000000001';
    if (!orgId) throw new AppError('UNAUTHORIZED', 'Organization context required', 401);

    const idempotencyKey = req.header('Idempotency-Key');
    if (!idempotencyKey) {
      throw new AppError('VALIDATION_FAILED', 'Idempotency-Key header is required', 400);
    }

    const parsed = financingProposalSchema.safeParse(req.body);
    if (!parsed.success) {
      const err = new AppError('VALIDATION_FAILED', 'Invalid financing proposal body', 400);
      err.details = parsed.error.issues;
      throw err;
    }

    const {
      facilityType,
      principalAmountMinor,
      collateralValueMinor,
      currency,
      tenorMonths,
      counterpartyId,
      counterpartyHistoryCount,
      interestBps,
    } = parsed.data;

    const subType = facilityType.toLowerCase() === 'po' ? 'po' : 'invoice';
    const principalBig = BigInt(principalAmountMinor);
    const collateralBig = BigInt(collateralValueMinor);

    // 1. Deterministic Rule-Based Underwriting via PartnerSimulatorProvider
    const underwriting = PartnerSimulatorProvider.underwrite({
      facilityType,
      principalAmountMinor: principalBig,
      collateralValueMinor: collateralBig,
      tenorMonths,
      counterpartyHistoryCount,
      interestBps,
    });

    if (underwriting.outcome === 'REJECTED') {
      const err = new AppError(
        underwriting.reasonCode,
        underwriting.detail || 'Financing proposal rejected by underwriting criteria',
        422
      );
      err.provider = 'simulated';
      throw err;
    }

    const schedule = underwriting.schedule;
    const adminFeeMinor = BigInt(underwriting.adminFeeMinor);

    // 2. Persist intent and financing_records atomically
    const result = await withTx(async (tx) => {
      // Check existing idempotency
      const existing = await tx.query(
        'SELECT * FROM transaction_intents WHERE org_id = $1 AND idempotency_key = $2 FOR UPDATE',
        [orgId, idempotencyKey]
      );

      if (existing.rows.length > 0) {
        const row = existing.rows[0];
        const reqHash = `fin_${facilityType}_${principalAmountMinor}_${counterpartyId}`;
        if (row.request_hash !== reqHash) {
          throw new AppError('IDEMPOTENCY_KEY_REUSED', 'Idempotency key reused with different payload', 422);
        }
        return { intent: row, cached: true };
      }

      const agentId = req.user?.id || req.agent?.id || '00000000-0000-4000-8000-000000000000';
      const mandateVersionId = req.mandate?.current_version_id || '00000000-0000-4000-8000-000000000001';
      const reqHash = `fin_${facilityType}_${principalAmountMinor}_${counterpartyId}`;

      // Insert transaction_intents (Tier C requires approval)
      const intentRes = await tx.query(
        `INSERT INTO transaction_intents (
          org_id, agent_id, category, sub_type, status, amount_minor, currency,
          counterparty_id, mandate_version_id, request_hash, idempotency_key, metadata
        ) VALUES ($1, $2, 'FINANCING', $3, 'NEEDS_APPROVAL', $4, $5, $6, $7, $8, $9, $10)
        RETURNING *`,
        [
          orgId,
          agentId,
          subType,
          principalBig.toString(),
          currency,
          counterpartyId,
          mandateVersionId,
          reqHash,
          idempotencyKey,
          JSON.stringify({
            facilityType,
            collateralValueMinor: collateralBig.toString(),
            tenorMonths,
            interestBps,
            provider: 'simulated',
          }),
        ]
      );
      const intent = intentRes.rows[0];

      // Insert financing_records
      const finRes = await tx.query(
        `INSERT INTO financing_records (
          org_id, intent_id, counterparty_id, facility_type,
          principal_amount_minor, interest_bps, admin_fee_minor, tenor_months,
          status, schedule
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'APPROVED', $9)
        RETURNING *`,
        [
          orgId,
          intent.intent_id,
          counterpartyId,
          facilityType.toUpperCase(),
          principalBig.toString(),
          interestBps,
          adminFeeMinor.toString(),
          tenorMonths,
          JSON.stringify(schedule),
        ]
      );

      return { intent, financing: finRes.rows[0], cached: false };
    });

    res.status(result.cached ? 200 : 201).json({
      success: true,
      provider: 'simulated',
      intentId: result.intent.intent_id,
      status: result.intent.status,
      category: 'FINANCING',
      subType,
      principalAmountMinor: principalBig.toString(),
      adminFeeMinor: adminFeeMinor.toString(),
      totalObligationMinor: underwriting.totalObligationMinor,
      tenorMonths,
      underwriting,
      cached: result.cached,
    });
  } catch (err) {
    next(err);
  }
});

financingRouter.get('/', async (req, res, next) => {
  try {
    const orgId = req.org?.id || req.session?.current_org_id || req.session?.org_id || req.user?.org_id || '00000000-0000-4000-8000-000000000001';
    const result = await query(
      `SELECT i.*, f.facility_type, f.principal_amount_minor, f.interest_bps,
              f.admin_fee_minor, f.tenor_months, f.repaid_amount_minor, f.status as facility_status
       FROM transaction_intents i
       LEFT JOIN financing_records f ON f.intent_id = i.intent_id AND f.org_id = i.org_id
       WHERE i.org_id = $1 AND i.category = 'FINANCING'
       ORDER BY i.created_at DESC LIMIT 100`,
      [orgId]
    );

    const rows = result.rows.map(r => ({
      ...r,
      amount_minor: r.amount_minor?.toString(),
      principal_amount_minor: r.principal_amount_minor?.toString(),
    }));

    res.json({
      success: true,
      provider: 'simulated',
      facilities: rows,
      transactions: rows,
    });
  } catch (err) {
    next(err);
  }
});

financingRouter.get('/:intentId', async (req, res, next) => {
  try {
    const orgId = req.org?.id || req.session?.current_org_id || req.session?.org_id || req.user?.org_id || '00000000-0000-4000-8000-000000000001';
    const { intentId } = req.params;

    const resFin = await query(
      `SELECT i.*, f.facility_type, f.principal_amount_minor, f.interest_bps,
              f.admin_fee_minor, f.tenor_months, f.repaid_amount_minor, f.schedule,
              f.status as facility_status
       FROM transaction_intents i
       JOIN financing_records f ON f.intent_id = i.intent_id AND f.org_id = i.org_id
       WHERE i.org_id = $1 AND i.intent_id = $2`,
      [orgId, intentId]
    );

    if (resFin.rows.length === 0) {
      throw new AppError('NOT_FOUND', 'Financing record not found', 404);
    }

    res.json({
      success: true,
      provider: 'simulated',
      data: resFin.rows[0],
    });
  } catch (err) {
    next(err);
  }
});

financingRouter.post('/:intentId/repay', async (req, res, next) => {
  try {
    const orgId = req.org?.id || req.session?.current_org_id || req.session?.org_id || req.user?.org_id || '00000000-0000-4000-8000-000000000001';
    const { intentId } = req.params;

    const parsed = repayBodySchema.safeParse(req.body);
    if (!parsed.success) {
      const err = new AppError('VALIDATION_FAILED', 'Invalid repayment body', 400);
      err.details = parsed.error.issues;
      throw err;
    }

    const { cycleNumber, amountMinor, currency } = parsed.data;
    const amtBig = BigInt(amountMinor);

    const result = await withTx(async (tx) => {
      const finRes = await tx.query(
        `SELECT * FROM financing_records WHERE org_id = $1 AND intent_id = $2 FOR UPDATE`,
        [orgId, intentId]
      );

      if (finRes.rows.length === 0) {
        throw new AppError('NOT_FOUND', 'Financing record not found', 404);
      }

      const fin = finRes.rows[0];
      const currentRepaid = BigInt(fin.repaid_amount_minor);
      const newRepaid = currentRepaid + amtBig;

      // Calculate total obligation
      const principal = BigInt(fin.principal_amount_minor);
      const adminFee = BigInt(fin.admin_fee_minor);
      const totalInterest = (principal * BigInt(fin.interest_bps) * BigInt(fin.tenor_months)) / 120000n;
      const totalObligation = principal + adminFee + totalInterest;

      if (newRepaid > totalObligation) {
        throw new AppError('REPAYMENT_EXCEEDS_OBLIGATION', 'Repayment amount exceeds total obligation', 422);
      }

      const newStatus = newRepaid >= totalObligation ? 'SETTLED' : 'REPAYING';

      await tx.query(
        `UPDATE financing_records
         SET repaid_amount_minor = $1, status = $2
         WHERE financing_id = $3 AND org_id = $4`,
        [newRepaid.toString(), newStatus, fin.financing_id, orgId]
      );

      // Record in financing_repayments
      const principalPortion = parsed.data.principalPortionMinor ? BigInt(parsed.data.principalPortionMinor) : amtBig;
      const interestPortion = parsed.data.interestPortionMinor ? BigInt(parsed.data.interestPortionMinor) : 0n;
      const feePortion = parsed.data.feePortionMinor ? BigInt(parsed.data.feePortionMinor) : 0n;

      await tx.query(
        `INSERT INTO financing_repayments (
          org_id, financing_id, intent_id, cycle_number, amount_minor,
          principal_portion_minor, interest_portion_minor, fee_portion_minor, currency
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [
          orgId,
          fin.financing_id,
          intentId,
          cycleNumber,
          amtBig.toString(),
          principalPortion.toString(),
          interestPortion.toString(),
          feePortion.toString(),
          currency,
        ]
      );

      return {
        financingId: fin.financing_id,
        repaidAmountMinor: newRepaid.toString(),
        totalObligationMinor: totalObligation.toString(),
        status: newStatus,
      };
    });

    res.json({
      success: true,
      provider: 'simulated',
      data: result,
    });
  } catch (err) {
    next(err);
  }
});

export default financingRouter;

