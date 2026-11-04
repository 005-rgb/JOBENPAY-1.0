import { parseArgs } from 'node:util';
import { createSmtpTransport } from '../../server/src/email/transport.js';
import { env } from '../../server/src/config.js';

function classifyError(err) {
  const code = String(err?.code || '').toUpperCase();
  const msg = String(err?.message || '').toLowerCase();

  if (code === 'EAUTH' || msg.includes('authentication') || msg.includes('credentials') || msg.includes('535') || msg.includes('auth')) {
    return 'EAUTH';
  }
  if (code === 'ETIMEDOUT' || msg.includes('timeout') || msg.includes('timed out')) {
    return 'ETIMEDOUT';
  }
  if (
    code.includes('CERT') ||
    code === 'DEPTH_ZERO_SELF_SIGNED_CERT' ||
    code === 'ERR_TLS_CERT_ALTNAME_INVALID' ||
    msg.includes('cert') ||
    msg.includes('certificate') ||
    msg.includes('hostname')
  ) {
    return 'CERT_MISMATCH';
  }
  if (
    code === 'ECONNREFUSED' ||
    code === 'ECONNRESET' ||
    code === 'ENOTFOUND' ||
    code === 'ESOCKET' ||
    msg.includes('connection') ||
    msg.includes('connect')
  ) {
    return 'ECONNECTION';
  }
  return 'LAINNYA';
}

async function main() {
  const options = {
    to: { type: 'string' },
  };

  let values;
  try {
    const parsed = parseArgs({ options, allowPositionals: true });
    values = parsed.values;
  } catch (err) {
    console.error('Invalid CLI options:', err.message);
    process.exit(1);
  }

  const to = values.to;
  if (!to || !to.includes('@')) {
    console.error('Usage: npm run real:smtp-test -- --to alamat@contoh.com');
    process.exit(1);
  }

  console.log(`Testing SMTP delivery to: ${to}`);
  console.log(`Using host: ${env.SMTP_HOST || '(not set)'}, port: ${env.SMTP_PORT || 587}, user: ${env.SMTP_USER || '(not set)'}`);

  if (!env.SMTP_HOST) {
    console.error('Error: SMTP_HOST environment variable is not configured.');
    process.exit(1);
  }

  try {
    const transport = createSmtpTransport();
    const from = env.SMTP_FROM || 'JOBENPAY <noreply@jobenpay.test>';

    const info = await transport.sendMail({
      from,
      to,
      subject: 'JOBENPAY SMTP Test Message',
      text: 'This is a test message from JOBENPAY SMTP verification test script.',
      html: '<p>This is a test message from <strong>JOBENPAY</strong> SMTP verification test script.</p>',
    });

    console.log('Result: OK');
    console.log(`Message ID: ${info.messageId || 'unknown'}`);
    process.exit(0);
  } catch (err) {
    const classification = classifyError(err);
    console.error(`Result: ${classification}`);
    console.error(`Detail: ${err.message}`);
    process.exit(1);
  }
}

main();
