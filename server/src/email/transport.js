import nodemailer from 'nodemailer';
import { env } from '../config.js';
import { logger } from '../lib/logger.js';

let activeTransport = null;
let mockOutbox = [];

export const mockSinkTransport = {
  sendMail: async (options) => {
    const messageId = `<mock-${Date.now()}-${mockOutbox.length + 1}@jobenpay.test>`;
    mockOutbox.push({ ...options, messageId, date: new Date() });
    return {
      messageId,
      status: 'SENT',
    };
  },
};

export function setTransport(transport) {
  activeTransport = transport;
}

export function resetTransport() {
  activeTransport = null;
  mockOutbox = [];
}

export function getMockOutbox() {
  return [...mockOutbox];
}

export function clearMockOutbox() {
  mockOutbox = [];
}

export function createSmtpTransport(options = {}) {
  const host = options.host || env.SMTP_HOST;
  const port = Number(options.port || env.SMTP_PORT || 587);
  const user = options.user || env.SMTP_USER;
  const pass = options.pass || env.SMTP_PASS;
  const servername = options.servername || env.SMTP_TLS_SERVERNAME || host;

  const isImplicitTls = port === 465;

  return nodemailer.createTransport({
    host,
    port,
    secure: isImplicitTls,
    requireTLS: !isImplicitTls,
    auth: user && pass ? { user, pass } : undefined,
    tls: {
      rejectUnauthorized: true,
      servername: servername || undefined,
    },
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 20_000,
  });
}

export function getTransport() {
  if (activeTransport) {
    return activeTransport;
  }

  if (process.env.NODE_ENV === 'test') {
    return mockSinkTransport;
  }

  if (env.SMTP_HOST) {
    activeTransport = createSmtpTransport();
    return activeTransport;
  }

  return null;
}

export async function sendMail({ to, subject, text, html }) {
  const from = env.SMTP_FROM || 'JOBENPAY <noreply@jobenpay.test>';
  const transport = getTransport();

  if (transport) {
    const info = await transport.sendMail({
      from,
      to,
      subject,
      text,
      html,
    });
    return {
      messageId: info.messageId || `smtp-${Date.now()}`,
      status: 'SENT',
    };
  }

  // When no SMTP is configured:
  if (env.NODE_ENV === 'development') {
    // Development fallback: do not send over network, print link to console
    // In production we never print tokens or links.
    const linkMatch = (text || html || '').match(/https?:\/\/[^\s"'<>]+/);
    const link = linkMatch ? linkMatch[0] : null;
    logger.info({ toMasked: maskEmail(to), subject, devVerificationLink: link }, 'Development SMTP fallback: link generated');
    return {
      messageId: `dev-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      status: 'SENT',
    };
  }

  if (env.NODE_ENV === 'test') {
    const messageId = `test-${Date.now()}-${mockOutbox.length + 1}`;
    mockOutbox.push({ to, subject, text, html, messageId, date: new Date() });
    return {
      messageId,
      status: 'SENT',
    };
  }

  throw new Error('SMTP is not configured in production.');
}

function maskEmail(email) {
  if (!email || typeof email !== 'string') return '***';
  const [local, domain] = email.split('@');
  if (!domain) return '***';
  const maskedLocal = local.length > 2 ? `${local[0]}***${local.slice(-1)}` : '***';
  return `${maskedLocal}@${domain}`;
}

