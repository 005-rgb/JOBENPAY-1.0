import { z } from 'zod';

import { buildSystemPrompt, escapeUntrustedDocument } from './shared.js';

export const PROMPT_VERSION = 'extract-invoice-v1';

export const extractInvoiceSchema = z.object({
  payeeName: z.string().max(200).nullable(),
  invoiceNumber: z.string().max(200).nullable(),
  amountMinor: z.string().regex(/^\d+$/).nullable(),
  currency: z.string().regex(/^[A-Z]{3}$/).nullable(),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
  items: z.array(z.object({
    description: z.string().max(500),
    amountMinor: z.string().regex(/^\d+$/).nullable(),
  })).max(200),
  notes: z.string().max(2000).nullable(),
  confidence: z.number().min(0).max(1),
});

export function buildExtractInvoicePrompt({ documentText }) {
  return {
    system: buildSystemPrompt(
      'Extract invoice facts only. Use null for unknown optional scalar values. amountMinor is an integer string in minor currency units; do not calculate or approve a transfer.',
    ),
    user: [
      'Extract the invoice into this exact JSON shape:',
      '{"payeeName":string|null,"invoiceNumber":string|null,"amountMinor":string|null,"currency":string|null,"dueDate":"YYYY-MM-DD"|null,"items":[{"description":string,"amountMinor":string|null}],"notes":string|null,"confidence":number}',
      '<untrusted_document>',
      escapeUntrustedDocument(documentText),
      '</untrusted_document>',
    ].join('\n'),
  };
}
