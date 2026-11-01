import { env } from '../config.js';
import { AiError } from './errors.js';
import { fetchJson } from './providerHttp.js';

const DEFAULT_BASE_URL = 'https://api.anthropic.com';
const ANTHROPIC_VERSION = '2023-06-01';
const MAX_OUTPUT_TOKENS = 2048;

function endpoint(baseUrl) {
  return `${baseUrl.replace(/\/+$/, '')}/v1/messages`;
}

export async function generateAnthropic(prompt, {
  fetchImpl = fetch,
  apiKey = env.AI_API_KEY,
  model = env.AI_MODEL,
  baseUrl = env.AI_BASE_URL || DEFAULT_BASE_URL,
} = {}) {
  if (!apiKey || !model) {
    throw new AiError('CONFIG', 'Live AI provider configuration is incomplete.');
  }
  const response = await fetchJson(endpoint(baseUrl), {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': ANTHROPIC_VERSION,
    },
    body: JSON.stringify({
      model,
      max_tokens: MAX_OUTPUT_TOKENS,
      temperature: 0,
      system: prompt.system,
      messages: [{ role: 'user', content: prompt.user }],
    }),
  }, { fetchImpl });

  const content = Array.isArray(response.content)
    ? response.content.filter((block) => block.type === 'text').map((block) => block.text).join('')
    : '';
  if (!content) throw new AiError('INVALID_OUTPUT', 'AI provider returned no structured output.');
  return {
    content,
    usage: {
      inputTokens: Number(response.usage?.input_tokens || 0),
      outputTokens: Number(response.usage?.output_tokens || 0),
    },
  };
}
