export class AiError extends Error {
  constructor(kind, message = 'AI processing is unavailable.', options = {}) {
    super(message, options);
    this.name = 'AiError';
    this.kind = kind;
    this.code = `AI_${kind}`;
  }
}

export function toAiError(error) {
  if (error instanceof AiError) return error;
  return new AiError('UNAVAILABLE', 'AI processing is unavailable.', { cause: error });
}
