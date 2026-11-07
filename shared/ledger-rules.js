/**
 * shared/ledger-rules.js
 * Double-entry ledger rules per transaction category (PRD 1.3 §8, AD-02, AD-03).
 */

import { splitFee, mulBpsFloor } from './money.js';

export const LEDGER_RULES = Object.freeze({
  PAYOUT: {
    standard: {
      ruleId: 'RULE_PAYOUT_STANDARD',
      description: 'Payout cash settlement from organization cash to payee',
      legs: (intent) => [
        {
          legType: 'DEBIT',
          accountRef: 'org:main',
          amountMinor: BigInt(intent.amountMinor ?? intent.amount_minor),
          currency: intent.currency,
        },
        {
          legType: 'CREDIT',
          accountRef: `payee:${intent.counterpartyId ?? intent.counterparty_id ?? intent.payeeId ?? intent.payee_id}`,
          amountMinor: BigInt(intent.amountMinor ?? intent.amount_minor),
          currency: intent.currency,
        },
      ],
    },
  },
  SALE: {
    standard: {
      ruleId: 'RULE_SALE_STANDARD',
      description: 'Customer sale settlement from buyer to organization merchant cash',
      legs: (intent) => [
        {
          legType: 'DEBIT',
          accountRef: `buyer:${intent.counterpartyId ?? intent.counterparty_id ?? intent.buyerId ?? intent.buyer_id ?? 'customer'}`,
          amountMinor: BigInt(intent.amountMinor ?? intent.amount_minor),
          currency: intent.currency,
        },
        {
          legType: 'CREDIT',
          accountRef: 'org:main',
          amountMinor: BigInt(intent.amountMinor ?? intent.amount_minor),
          currency: intent.currency,
        },
      ],
    },
  },
  REFUND: {
    full: {
      ruleId: 'RULE_REFUND_FULL',
      description: 'Full refund reversing original capture from organization cash to buyer',
      legs: (intent) => [
        {
          legType: 'DEBIT',
          accountRef: 'org:main',
          amountMinor: BigInt(intent.amountMinor ?? intent.amount_minor),
          currency: intent.currency,
        },
        {
          legType: 'CREDIT',
          accountRef: `buyer:${intent.counterpartyId ?? intent.counterparty_id ?? intent.buyerId ?? intent.buyer_id ?? 'customer'}`,
          amountMinor: BigInt(intent.amountMinor ?? intent.amount_minor),
          currency: intent.currency,
        },
      ],
    },
    partial: {
      ruleId: 'RULE_REFUND_PARTIAL',
      description: 'Partial refund from organization cash to buyer',
      legs: (intent) => [
        {
          legType: 'DEBIT',
          accountRef: 'org:main',
          amountMinor: BigInt(intent.amountMinor ?? intent.amount_minor),
          currency: intent.currency,
        },
        {
          legType: 'CREDIT',
          accountRef: `buyer:${intent.counterpartyId ?? intent.counterparty_id ?? intent.buyerId ?? intent.buyer_id ?? 'customer'}`,
          amountMinor: BigInt(intent.amountMinor ?? intent.amount_minor),
          currency: intent.currency,
        },
      ],
    },
  },
  VOID: {
    authorization: {
      ruleId: 'RULE_VOID_AUTHORIZATION',
      description: 'Release authorized payment hold back to buyer',
      legs: (intent) => [
        {
          legType: 'DEBIT',
          accountRef: `buyer:${intent.counterpartyId ?? intent.counterparty_id ?? intent.buyerId ?? intent.buyer_id ?? 'customer'}`,
          amountMinor: BigInt(intent.amountMinor ?? intent.amount_minor),
          currency: intent.currency,
        },
        {
          legType: 'CREDIT',
          accountRef: 'org:authorized_holds',
          amountMinor: BigInt(intent.amountMinor ?? intent.amount_minor),
          currency: intent.currency,
        },
      ],
    },
    order: {
      ruleId: 'RULE_VOID_ORDER',
      description: 'Internal cancellation of unpaid order',
      legs: (intent) => [
        {
          legType: 'DEBIT',
          accountRef: `buyer:${intent.counterpartyId ?? intent.counterparty_id ?? intent.buyerId ?? intent.buyer_id ?? 'customer'}`,
          amountMinor: BigInt(intent.amountMinor ?? intent.amount_minor),
          currency: intent.currency,
        },
        {
          legType: 'CREDIT',
          accountRef: 'org:pending_orders',
          amountMinor: BigInt(intent.amountMinor ?? intent.amount_minor),
          currency: intent.currency,
        },
      ],
    },
  },
  PARTIAL: {
    payment: {
      ruleId: 'RULE_PARTIAL_PAYMENT',
      description: 'Partial capture from buyer authorized funds to organization cash',
      legs: (intent) => [
        {
          legType: 'DEBIT',
          accountRef: `buyer:${intent.counterpartyId ?? intent.counterparty_id ?? intent.buyerId ?? intent.buyer_id ?? 'customer'}`,
          amountMinor: BigInt(intent.amountMinor ?? intent.amount_minor),
          currency: intent.currency,
        },
        {
          legType: 'CREDIT',
          accountRef: 'org:main',
          amountMinor: BigInt(intent.amountMinor ?? intent.amount_minor),
          currency: intent.currency,
        },
      ],
    },
    refund: {
      ruleId: 'RULE_PARTIAL_REFUND',
      description: 'Partial refund from organization cash to buyer',
      legs: (intent) => [
        {
          legType: 'DEBIT',
          accountRef: 'org:main',
          amountMinor: BigInt(intent.amountMinor ?? intent.amount_minor),
          currency: intent.currency,
        },
        {
          legType: 'CREDIT',
          accountRef: `buyer:${intent.counterpartyId ?? intent.counterparty_id ?? intent.buyerId ?? intent.buyer_id ?? 'customer'}`,
          amountMinor: BigInt(intent.amountMinor ?? intent.amount_minor),
          currency: intent.currency,
        },
      ],
    },
  },
  DOWN_PAYMENT: {
    initial: {
      ruleId: 'RULE_DOWN_PAYMENT_INITIAL',
      description: 'Initial down payment capture into escrow',
      legs: (intent) => [
        {
          legType: 'DEBIT',
          accountRef: `buyer:${intent.counterpartyId ?? intent.counterparty_id ?? intent.buyerId ?? intent.buyer_id ?? 'customer'}`,
          amountMinor: BigInt(intent.amountMinor ?? intent.amount_minor),
          currency: intent.currency,
        },
        {
          legType: 'CREDIT',
          accountRef: 'org:down_payment_escrow',
          amountMinor: BigInt(intent.amountMinor ?? intent.amount_minor),
          currency: intent.currency,
        },
      ],
    },
    settlement: {
      ruleId: 'RULE_DOWN_PAYMENT_SETTLEMENT',
      description: 'Final settlement payment to organization main cash',
      legs: (intent) => [
        {
          legType: 'DEBIT',
          accountRef: `buyer:${intent.counterpartyId ?? intent.counterparty_id ?? intent.buyerId ?? intent.buyer_id ?? 'customer'}`,
          amountMinor: BigInt(intent.amountMinor ?? intent.amount_minor),
          currency: intent.currency,
        },
        {
          legType: 'CREDIT',
          accountRef: 'org:main',
          amountMinor: BigInt(intent.amountMinor ?? intent.amount_minor),
          currency: intent.currency,
        },
      ],
    },
    forfeit: {
      ruleId: 'RULE_DOWN_PAYMENT_FORFEIT',
      description: 'Forfeited down payment transferred from escrow to organization main revenue',
      legs: (intent) => [
        {
          legType: 'DEBIT',
          accountRef: 'org:down_payment_escrow',
          amountMinor: BigInt(intent.amountMinor ?? intent.amount_minor),
          currency: intent.currency,
        },
        {
          legType: 'CREDIT',
          accountRef: 'org:main',
          amountMinor: BigInt(intent.amountMinor ?? intent.amount_minor),
          currency: intent.currency,
        },
      ],
    },
  },
  INVOICE: {
    standard: {
      ruleId: 'RULE_INVOICE_STANDARD',
      description: 'Client invoice paid, funds recognized into organization cash',
      legs: (intent) => [
        {
          legType: 'DEBIT',
          accountRef: `buyer:${intent.counterpartyId ?? intent.counterparty_id ?? intent.buyerId ?? intent.buyer_id ?? 'customer'}`,
          amountMinor: BigInt(intent.amountMinor ?? intent.amount_minor),
          currency: intent.currency,
        },
        {
          legType: 'CREDIT',
          accountRef: 'org:main',
          amountMinor: BigInt(intent.amountMinor ?? intent.amount_minor),
          currency: intent.currency,
        },
      ],
    },
  },
  DISPUTE: {
    chargeback: {
      ruleId: 'RULE_DISPUTE_CHARGEBACK',
      description: 'Chargeback lost deduction from organization cash to buyer',
      legs: (intent) => [
        {
          legType: 'DEBIT',
          accountRef: 'org:main',
          amountMinor: BigInt(intent.amountMinor ?? intent.amount_minor),
          currency: intent.currency,
        },
        {
          legType: 'CREDIT',
          accountRef: `buyer:${intent.counterpartyId ?? intent.counterparty_id ?? intent.buyerId ?? intent.buyer_id ?? 'customer'}`,
          amountMinor: BigInt(intent.amountMinor ?? intent.amount_minor),
          currency: intent.currency,
        },
      ],
    },
    inquiry: {
      ruleId: 'RULE_DISPUTE_INQUIRY',
      description: 'Pre-claim inquiry zero-movement balanced record',
      legs: (intent) => [
        {
          legType: 'DEBIT',
          accountRef: 'org:main',
          amountMinor: BigInt(intent.amountMinor ?? intent.amount_minor),
          currency: intent.currency,
        },
        {
          legType: 'CREDIT',
          accountRef: 'org:main',
          amountMinor: BigInt(intent.amountMinor ?? intent.amount_minor),
          currency: intent.currency,
        },
      ],
    },
  },
  SCHEDULED: {
    payout: {
      ruleId: 'RULE_SCHEDULED_PAYOUT',
      description: 'Scheduled payout execution to counterparty/payee',
      legs: (intent) => [
        {
          legType: 'DEBIT',
          accountRef: 'org:main',
          amountMinor: BigInt(intent.amountMinor ?? intent.amount_minor),
          currency: intent.currency,
        },
        {
          legType: 'CREDIT',
          accountRef: `payee:${intent.counterpartyId ?? intent.counterparty_id ?? intent.payeeId ?? intent.payee_id ?? 'customer'}`,
          amountMinor: BigInt(intent.amountMinor ?? intent.amount_minor),
          currency: intent.currency,
        },
      ],
    },
    charge: {
      ruleId: 'RULE_SCHEDULED_CHARGE',
      description: 'Scheduled incoming customer charge recognized to organization cash',
      legs: (intent) => [
        {
          legType: 'DEBIT',
          accountRef: `buyer:${intent.counterpartyId ?? intent.counterparty_id ?? intent.buyerId ?? intent.buyer_id ?? 'customer'}`,
          amountMinor: BigInt(intent.amountMinor ?? intent.amount_minor),
          currency: intent.currency,
        },
        {
          legType: 'CREDIT',
          accountRef: 'org:main',
          amountMinor: BigInt(intent.amountMinor ?? intent.amount_minor),
          currency: intent.currency,
        },
      ],
    },
  },
  BULK: {
    payout: {
      ruleId: 'RULE_BULK_PAYOUT',
      description: 'Bulk batch individual payout item execution',
      legs: (intent) => [
        {
          legType: 'DEBIT',
          accountRef: 'org:main',
          amountMinor: BigInt(intent.amountMinor ?? intent.amount_minor),
          currency: intent.currency,
        },
        {
          legType: 'CREDIT',
          accountRef: `payee:${intent.counterpartyId ?? intent.counterparty_id ?? intent.payeeId ?? intent.payee_id ?? 'customer'}`,
          amountMinor: BigInt(intent.amountMinor ?? intent.amount_minor),
          currency: intent.currency,
        },
      ],
    },
  },
  TRANSFER: {
    p2p: {
      ruleId: 'RULE_TRANSFER_P2P',
      description: 'Peer-to-peer transfer debiting sender source and crediting receiver',
      legs: (intent) => [
        {
          legType: 'DEBIT',
          accountRef: `payee:${intent.senderCounterpartyId ?? intent.sender_counterparty_id ?? 'sender'}`,
          amountMinor: BigInt(intent.amountMinor ?? intent.amount_minor),
          currency: intent.currency,
        },
        {
          legType: 'CREDIT',
          accountRef: `payee:${intent.receiverCounterpartyId ?? intent.receiver_counterparty_id ?? intent.counterpartyId ?? intent.counterparty_id ?? 'receiver'}`,
          amountMinor: BigInt(intent.amountMinor ?? intent.amount_minor),
          currency: intent.currency,
        },
      ],
    },
  },
  SPLIT: {
    collect: {
      ruleId: 'RULE_SPLIT_COLLECT',
      description: 'Customer payment collection into split escrow holding',
      legs: (intent) => [
        {
          legType: 'DEBIT',
          accountRef: 'org:main',
          amountMinor: BigInt(intent.amountMinor ?? intent.amount_minor),
          currency: intent.currency,
        },
        {
          legType: 'CREDIT',
          accountRef: 'org:split_escrow',
          amountMinor: BigInt(intent.amountMinor ?? intent.amount_minor),
          currency: intent.currency,
        },
      ],
    },
    split: {
      ruleId: 'RULE_SPLIT_SPLIT',
      description: 'Partition split escrow into platform fee revenue and net payee share',
      legs: (intent) => {
        const total = BigInt(intent.amountMinor ?? intent.amount_minor);
        const bps = parseInt(String(intent.platformFeeBps ?? intent.platform_fee_bps ?? 0), 10);
        const { fee, payee } = splitFee(total, bps);
        const legs = [
          {
            legType: 'DEBIT',
            accountRef: 'org:split_escrow',
            amountMinor: total,
            currency: intent.currency,
          },
        ];
        if (fee > 0n) {
          legs.push({
            legType: 'CREDIT',
            accountRef: 'org:main',
            amountMinor: fee,
            currency: intent.currency,
          });
        }
        legs.push({
          legType: 'CREDIT',
          accountRef: `payee:${intent.counterpartyId ?? intent.counterparty_id ?? intent.payeeId ?? intent.payee_id ?? 'recipient'}`,
          amountMinor: payee,
          currency: intent.currency,
        });
        return legs;
      },
    },
    hold: {
      ruleId: 'RULE_SPLIT_HOLD',
      description: 'Hold payee share in escrow awaiting milestone completion',
      legs: (intent) => [
        {
          legType: 'DEBIT',
          accountRef: `payee:${intent.counterpartyId ?? intent.counterparty_id ?? intent.payeeId ?? intent.payee_id ?? 'recipient'}`,
          amountMinor: BigInt(intent.amountMinor ?? intent.amount_minor),
          currency: intent.currency,
        },
        {
          legType: 'CREDIT',
          accountRef: 'org:split_escrow',
          amountMinor: BigInt(intent.amountMinor ?? intent.amount_minor),
          currency: intent.currency,
        },
      ],
    },
    payout: {
      ruleId: 'RULE_SPLIT_PAYOUT',
      description: 'Disburse held share from split escrow to payee payout',
      legs: (intent) => [
        {
          legType: 'DEBIT',
          accountRef: 'org:split_escrow',
          amountMinor: BigInt(intent.amountMinor ?? intent.amount_minor),
          currency: intent.currency,
        },
        {
          legType: 'CREDIT',
          accountRef: `payee:${intent.counterpartyId ?? intent.counterparty_id ?? intent.payeeId ?? intent.payee_id ?? 'recipient'}`,
          amountMinor: BigInt(intent.amountMinor ?? intent.amount_minor),
          currency: intent.currency,
        },
      ],
    },
  },
  RECURRING: {
    init: {
      ruleId: 'RULE_RECURRING_INIT',
      description: 'Setup recurring subscription agreement',
      legs: (intent) => [
        {
          legType: 'DEBIT',
          accountRef: 'org:main',
          amountMinor: BigInt(intent.amountMinor ?? intent.amount_minor),
          currency: intent.currency,
        },
        {
          legType: 'CREDIT',
          accountRef: `payee:${intent.counterpartyId ?? intent.counterparty_id ?? intent.payeeId ?? intent.payee_id ?? 'subscriber'}`,
          amountMinor: BigInt(intent.amountMinor ?? intent.amount_minor),
          currency: intent.currency,
        },
      ],
    },
    charge: {
      ruleId: 'RULE_RECURRING_CHARGE',
      description: 'Recurring subscription cycle charge collection',
      legs: (intent) => [
        {
          legType: 'DEBIT',
          accountRef: 'org:main',
          amountMinor: BigInt(intent.amountMinor ?? intent.amount_minor),
          currency: intent.currency,
        },
        {
          legType: 'CREDIT',
          accountRef: `payee:${intent.counterpartyId ?? intent.counterparty_id ?? intent.payeeId ?? intent.payee_id ?? 'subscriber'}`,
          amountMinor: BigInt(intent.amountMinor ?? intent.amount_minor),
          currency: intent.currency,
        },
      ],
    },
    cancel: {
      ruleId: 'RULE_RECURRING_CANCEL',
      description: 'Cancellation of recurring subscription agreement',
      legs: (intent) => [
        {
          legType: 'DEBIT',
          accountRef: `payee:${intent.counterpartyId ?? intent.counterparty_id ?? intent.payeeId ?? intent.payee_id ?? 'subscriber'}`,
          amountMinor: BigInt(intent.amountMinor ?? intent.amount_minor),
          currency: intent.currency,
        },
        {
          legType: 'CREDIT',
          accountRef: 'org:main',
          amountMinor: BigInt(intent.amountMinor ?? intent.amount_minor),
          currency: intent.currency,
        },
      ],
    },
  },
  FINANCING: {
    po: {
      ruleId: 'RULE_FINANCING_PO_DISBURSE',
      description: 'PO Financing loan principal disbursement net of admin fee',
      legs: (intent) => {
        const principal = BigInt(intent.amountMinor ?? intent.amount_minor);
        const adminFee = intent.adminFeeMinor ?? intent.admin_fee_minor
          ? BigInt(intent.adminFeeMinor ?? intent.admin_fee_minor)
          : mulBpsFloor(principal, 150);
        const netDisbursed = principal - adminFee;
        const ref = intent.intentId ?? intent.intent_id ?? 'fin';

        return [
          {
            legType: 'DEBIT',
            accountRef: 'org:main',
            amountMinor: netDisbursed,
            currency: intent.currency,
          },
          {
            legType: 'DEBIT',
            accountRef: `loan:fee:${ref}`,
            amountMinor: adminFee,
            currency: intent.currency,
          },
          {
            legType: 'CREDIT',
            accountRef: `loan:principal:${ref}`,
            amountMinor: principal,
            currency: intent.currency,
          },
        ];
      },
    },
    invoice: {
      ruleId: 'RULE_FINANCING_INVOICE_DISBURSE',
      description: 'Invoice Financing loan principal disbursement net of admin fee',
      legs: (intent) => {
        const principal = BigInt(intent.amountMinor ?? intent.amount_minor);
        const adminFee = intent.adminFeeMinor ?? intent.admin_fee_minor
          ? BigInt(intent.adminFeeMinor ?? intent.admin_fee_minor)
          : mulBpsFloor(principal, 150);
        const netDisbursed = principal - adminFee;
        const ref = intent.intentId ?? intent.intent_id ?? 'fin';

        return [
          {
            legType: 'DEBIT',
            accountRef: 'org:main',
            amountMinor: netDisbursed,
            currency: intent.currency,
          },
          {
            legType: 'DEBIT',
            accountRef: `loan:fee:${ref}`,
            amountMinor: adminFee,
            currency: intent.currency,
          },
          {
            legType: 'CREDIT',
            accountRef: `loan:principal:${ref}`,
            amountMinor: principal,
            currency: intent.currency,
          },
        ];
      },
    },
  },
  DEBIT: {
    direct: {
      ruleId: 'RULE_DEBIT_DIRECT',
      description: 'Direct debit collection from counterparty to organization cash',
      legs: (intent) => [
        {
          legType: 'DEBIT',
          accountRef: 'org:main',
          amountMinor: BigInt(intent.amountMinor ?? intent.amount_minor),
          currency: intent.currency,
        },
        {
          legType: 'CREDIT',
          accountRef: `counterparty:debit:${intent.counterpartyId ?? intent.counterparty_id ?? 'direct'}`,
          amountMinor: BigInt(intent.amountMinor ?? intent.amount_minor),
          currency: intent.currency,
        },
      ],
    },
  },
});

export function getLedgerRule(category, subType = 'standard') {
  const rule = LEDGER_RULES[category]?.[subType];
  if (!rule) {
    throw new Error(`Ledger rule not found for category=${category}, subType=${subType}`);
  }
  return rule;
}

export function generateLedgerLegs(intent) {
  const rule = getLedgerRule(intent.category, intent.subType || intent.sub_type || 'standard');
  const legs = rule.legs(intent);

  // Validate balanced double-entry
  let debitSum = 0n;
  let creditSum = 0n;
  for (const leg of legs) {
    if (leg.legType === 'DEBIT') debitSum += leg.amountMinor;
    else if (leg.legType === 'CREDIT') creditSum += leg.amountMinor;
  }
  if (debitSum !== creditSum) {
    throw new Error(`Unbalanced generated legs for category ${intent.category}: debit=${debitSum}, credit=${creditSum}`);
  }
  return legs;
}

export default LEDGER_RULES;

