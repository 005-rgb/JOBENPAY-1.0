import { env } from '../config.js';
import { AiError } from './errors.js';
import { fetchJson } from './providerHttp.js';

const DEFAULT_BASE_URL = 'https://api.openai.com';

function endpoint(baseUrl) {
  return `${baseUrl.replace(/\/+$/, '')}/v1/chat/completions`;
}

function requestBody(prompt, withJsonMode, model) {
  return {
    model,
    max_tokens: 2048,
    temperature: 0,
    messages: [
      { role: 'system', content: prompt.system },
      { role: 'user', content: prompt.user },
    ],
    ...(withJsonMode ? { response_format: { type: 'json_object' } } : {}),
  };
}

export async function generateOpenAI(prompt, {
  fetchImpl = fetch,
  apiKey = env.AI_API_KEY,
  model = env.AI_MODEL,
  baseUrl = env.AI_BASE_URL || DEFAULT_BASE_URL,
} = {}) {
  if (!apiKey || !model) {
    throw new AiError('CONFIG', 'Live AI provider configuration is incomplete.');
  }
  const url = endpoint(baseUrl);
  const options = {
    method: 'POST',
    headers: {
      authorization: `Bearer ${apiKey}`,
      'content-type': 'application/json',
    },
  };
  let response;
  try {
    response = await fetchJson(url, {
      ...options,
      body: JSON.stringify(requestBody(prompt, true, model)),
    }, { fetchImpl });
  } catch (error) {
    if (!(error instanceof AiError)
      || error.kind !== 'PROVIDER'
      || !error.unsupportedJsonMode) {
      throw error;
    }
    response = await fetchJson(url, {
      ...options,
      body: JSON.stringify(requestBody(prompt, false, model)),
    }, { fetchImpl });
  }

  const choice = response.choices?.[0];
  if (choice?.finish_reason === 'length') {
    throw new AiError('INVALID_OUTPUT', 'AI provider returned incomplete structured output.');
  }
  const content = choice?.message?.content;
  if (typeof content !== 'string' || !content.trim()) {
    throw new AiError('INVALID_OUTPUT', 'AI provider returned no structured output.');
  }
  return {
    content,
    usage: {
      inputTokens: Number(response.usage?.prompt_tokens || 0),
      outputTokens: Number(response.usage?.completion_tokens || 0),
    },
  };
}
