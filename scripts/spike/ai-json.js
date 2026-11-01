import { z } from 'zod';

const requiredEnv = ['AI_PROVIDER', 'AI_MODEL', 'AI_API_KEY'];

for (const key of requiredEnv) {
  if (!process.env[key] || !process.env[key].trim()) {
    console.error('env belum diisi');
    process.exit(1);
  }
}

const provider = process.env.AI_PROVIDER.trim().toLowerCase();
if (!['anthropic', 'openai'].includes(provider)) {
  console.error('env belum diisi');
  process.exit(1);
}

const schema = z.object({
  vendor: z.string().min(1),
  invoiceNumber: z.string().min(1),
  currency: z.string().length(3),
  totalMinor: z.string().regex(/^(0|[1-9]\d*)$/),
  dueDate: z.string().min(1),
  items: z.array(
    z.object({
      description: z.string().min(1),
      amountMinor: z.string().regex(/^(0|[1-9]\d*)$/),
    }),
  ),
});

const prompt = `Extract the invoice fields from the sample below and return only valid JSON matching this schema:
{
  "vendor": "string",
  "invoiceNumber": "string",
  "currency": "3-letter ISO code",
  "totalMinor": "1234",
  "dueDate": "YYYY-MM-DD",
  "items": [{ "description": "string", "amountMinor": "1234" }]
}

Sample invoice:
INVOICE #INV-1042
Acme Studio
Due: 2026-11-20
Currency: USD
Line items:
- Design retainer: $950.00
- QA review: $320.00
Subtotal: $1270.00
Tax: $89.00
Total: $1359.00
`;

async function requestModel(url, requestBody, headers) {
  const response = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(requestBody),
    signal: AbortSignal.timeout(20000),
  });

  const text = await response.text();
  if (!response.ok) {
    throw new Error(`provider request failed: ${response.status} ${text.slice(0, 200)}`);
  }

  return text;
}

function extractText(payload) {
  if (provider === 'anthropic') {
    const content = payload.content ?? [];
    return content.map((part) => part.text).join('\n');
  }

  return payload.choices?.[0]?.message?.content ?? '';
}

function parseJsonContent(text) {
  const candidate = text.match(/```json\s*([\s\S]*?)```/i)?.[1] ?? text;
  const fixed = candidate.trim();
  return JSON.parse(fixed);
}

async function main() {
  const start = Date.now();
  const model = process.env.AI_MODEL.trim();
  const apiKey = process.env.AI_API_KEY.trim();
  const baseUrl = (process.env.AI_BASE_URL || (provider === 'anthropic' ? 'https://api.anthropic.com' : 'https://api.openai.com/v1')).trim();

  let providerResponseText;
  if (provider === 'anthropic') {
    providerResponseText = await requestModel(
      `${baseUrl.replace(/\/$/, '')}/v1/messages`,
      {
        model,
        max_tokens: 512,
        temperature: 0,
        messages: [{ role: 'user', content: prompt }],
      },
      {
        'content-type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
    );
  } else {
    providerResponseText = await requestModel(
      `${baseUrl.replace(/\/$/, '')}/chat/completions`,
      {
        model,
        temperature: 0,
        messages: [{ role: 'user', content: prompt }],
      },
      {
        'content-type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
    );
  }

  const payload = JSON.parse(providerResponseText);
  const rawText = extractText(payload);
  const parsed = parseJsonContent(rawText);
  const validation = schema.safeParse(parsed);

  const responseTimeMs = Date.now() - start;
  console.log(`response_time_ms: ${responseTimeMs}`);

  if (!validation.success) {
    console.log('validation: failed');
    console.log(JSON.stringify(validation.error.issues, null, 2));
    process.exit(1);
  }

  console.log('validation: ok');
  console.log(JSON.stringify(validation.data, null, 2));
}

main().catch((error) => {
  console.error('ai-json request failed');
  if (error instanceof Error) {
    console.error(error.message);
  }
  process.exit(1);
});
