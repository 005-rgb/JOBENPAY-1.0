const FOOTER_TEXT = '\n\n---\nJOBENPAY is not a PayPal product. Sandbox use only.';
const FOOTER_HTML = `
  <hr style="margin-top: 32px; border: none; border-top: 1px solid #e2e8f0;" />
  <p style="font-size: 12px; color: #64748b; margin-top: 12px;">
    JOBENPAY is not a PayPal product. Sandbox use only.
  </p>
`;

export function verifyEmail(link, expiresHours = 24) {
  const subject = 'Verify your JOBENPAY email address';

  const text = `Welcome to JOBENPAY!

Please verify your email address by visiting the following link:
${link}

This link will expire in ${expiresHours} hours.

If you did not request this account, you can safely ignore this email.${FOOTER_TEXT}`;

  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>${subject}</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.5; color: #0f172a; margin: 0; padding: 24px;">
  <div style="max-width: 560px; margin: 0 auto; background: #ffffff; padding: 24px; border-radius: 8px; border: 1px solid #e2e8f0;">
    <h2 style="margin-top: 0; color: #003087;">Verify your email address</h2>
    <p>Thank you for signing up for JOBENPAY. Please confirm your email address by clicking the button below:</p>
    <p style="margin: 24px 0;">
      <a href="${link}" style="background-color: #0070ba; color: #ffffff; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: 600; display: inline-block;">
        Verify Email Address
      </a>
    </p>
    <p style="font-size: 14px; color: #475569;">
      Or copy and paste this link into your browser:<br />
      <a href="${link}" style="color: #0070ba; word-break: break-all;">${link}</a>
    </p>
    <p style="font-size: 14px; color: #64748b;">This verification link will expire in ${expiresHours} hours.</p>
    <p style="font-size: 14px; color: #64748b;">If you did not create a JOBENPAY account, you can safely ignore this email.</p>
    ${FOOTER_HTML}
  </div>
</body>
</html>`;

  return { subject, text, html };
}

export function accountExistsNotice(loginLink) {
  const subject = 'JOBENPAY account registration notice';

  const text = `Hello,

A registration attempt was made using this email address on JOBENPAY.

However, an account with this email address already exists. If this was you, you can sign in directly at:
${loginLink}

If you did not make this request, someone may have entered your email address by mistake. Your account is secure and no action is needed.${FOOTER_TEXT}`;

  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>${subject}</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.5; color: #0f172a; margin: 0; padding: 24px;">
  <div style="max-width: 560px; margin: 0 auto; background: #ffffff; padding: 24px; border-radius: 8px; border: 1px solid #e2e8f0;">
    <h2 style="margin-top: 0; color: #003087;">Account Registration Notice</h2>
    <p>A registration attempt was made on JOBENPAY using this email address.</p>
    <p>Since an account is already associated with this email, no new account was created. You can sign in using your existing credentials:</p>
    <p style="margin: 24px 0;">
      <a href="${loginLink}" style="background-color: #0070ba; color: #ffffff; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: 600; display: inline-block;">
        Sign In to JOBENPAY
      </a>
    </p>
    <p style="font-size: 14px; color: #64748b;">If you did not attempt to register, no action is required.</p>
    ${FOOTER_HTML}
  </div>
</body>
</html>`;

  return { subject, text, html };
}

export function welcome() {
  const subject = 'Welcome to JOBENPAY';

  const text = `Welcome to JOBENPAY!

Your email address has been verified and your organization is now ready.

You can log in to access your dashboard, configure PayPal sandbox credentials, and manage automated payment workflows.${FOOTER_TEXT}`;

  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>${subject}</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.5; color: #0f172a; margin: 0; padding: 24px;">
  <div style="max-width: 560px; margin: 0 auto; background: #ffffff; padding: 24px; border-radius: 8px; border: 1px solid #e2e8f0;">
    <h2 style="margin-top: 0; color: #003087;">Welcome to JOBENPAY!</h2>
    <p>Your email address has been successfully verified, and your organization is ready in our sandbox environment.</p>
    <p>You can now sign in to your account, connect PayPal sandbox credentials, and test your payout workflows.</p>
    ${FOOTER_HTML}
  </div>
</body>
</html>`;

  return { subject, text, html };
}

export function approvalNeeded({
  requestId,
  amount,
  currency = 'USD',
  payeeName,
  mandateName,
  reviewUrl,
  expiresAt,
}) {
  const formattedAmount = `${currency} ${amount}`;
  const subject = `[ACTION REQUIRED] Payment Approval Needed: ${formattedAmount} - JOBENPAY`;

  const text = `Hello,

A payment request requires your review and approval in JOBENPAY.

Request Details:
- Request ID: ${requestId}
- Amount: ${formattedAmount}
- Payee: ${payeeName || 'N/A'}
- Mandate: ${mandateName || 'Payment Mandate'}
${expiresAt ? `- Approval Expires: ${new Date(expiresAt).toUTCString()}\n` : ''}
Review and decide on this payment request:
${reviewUrl}

This request was held for human approval in accordance with the active mandate policy.${FOOTER_TEXT}`;

  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>${subject}</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.5; color: #0f172a; margin: 0; padding: 24px; background-color: #f8fafc;">
  <div style="max-width: 560px; margin: 0 auto; background: #ffffff; padding: 28px; border-radius: 8px; border: 1px solid #e2e8f0;">
    <div style="border-bottom: 2px solid #003087; padding-bottom: 12px; margin-bottom: 20px;">
      <h2 style="margin: 0; color: #003087; font-size: 20px;">Payment Approval Required</h2>
    </div>
    <p style="margin: 0 0 16px; font-size: 15px;">A payment request has been submitted by an AI agent that requires human authorization before execution.</p>
    
    <div style="background-color: #f1f5f9; border-radius: 6px; padding: 16px; margin: 20px 0;">
      <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
        <tr>
          <td style="padding: 6px 0; color: #64748b; width: 120px;">Amount:</td>
          <td style="padding: 6px 0; font-weight: 700; color: #0f172a; font-size: 16px;">${formattedAmount}</td>
        </tr>
        <tr>
          <td style="padding: 6px 0; color: #64748b;">Payee:</td>
          <td style="padding: 6px 0; font-weight: 500; color: #0f172a;">${payeeName || 'N/A'}</td>
        </tr>
        <tr>
          <td style="padding: 6px 0; color: #64748b;">Mandate:</td>
          <td style="padding: 6px 0; color: #0f172a;">${mandateName || 'Payment Mandate'}</td>
        </tr>
        <tr>
          <td style="padding: 6px 0; color: #64748b;">Request ID:</td>
          <td style="padding: 6px 0; font-family: monospace; font-size: 13px; color: #334155;">${requestId}</td>
        </tr>
        ${expiresAt ? `<tr><td style="padding: 6px 0; color: #64748b;">Expires:</td><td style="padding: 6px 0; color: #e11d48; font-weight: 500;">${new Date(expiresAt).toUTCString()}</td></tr>` : ''}
      </table>
    </div>

    <p style="margin: 24px 0; text-align: center;">
      <a href="${reviewUrl}" style="background-color: #0070ba; color: #ffffff; padding: 12px 28px; text-decoration: none; border-radius: 24px; font-weight: 600; font-size: 14px; display: inline-block;">
        Review & Decide
      </a>
    </p>

    <p style="font-size: 13px; color: #64748b; line-height: 1.4;">
      Or open this link directly: <a href="${reviewUrl}" style="color: #0070ba; word-break: break-all;">${reviewUrl}</a>
    </p>
    ${FOOTER_HTML}
  </div>
</body>
</html>`;

  return { subject, text, html };
}

