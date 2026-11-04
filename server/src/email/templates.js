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

