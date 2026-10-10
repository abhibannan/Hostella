import nodemailer, { type Transporter } from "nodemailer";

export async function sendPasswordEmail(to: string, newPassword: string, name?: string) {
  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT || 587);
  const user = process.env.SMTP_USER || process.env.EMAIL_USER;
  const pass = process.env.SMTP_PASS || process.env.EMAIL_PASS;
  const from = process.env.SMTP_FROM || user || '"Hostella Support" <noreply@hostella.com>';

  let transporter: Transporter;

  if (host && user && pass) {
    transporter = nodemailer.createTransport({
      host,
      port,
      secure: port === 465,
      auth: { user, pass },
    });
  } else if (user && pass) {
    // Gmail or standard service fallback
    transporter = nodemailer.createTransport({
      service: "gmail",
      auth: { user, pass },
    });
  } else {
    // Development fallback: ethereal or mock
    const testAccount = await nodemailer.createTestAccount();
    transporter = nodemailer.createTransport({
      host: "smtp.ethereal.email",
      port: 587,
      secure: false,
      auth: {
        user: testAccount.user,
        pass: testAccount.pass,
      },
    });
  }

  const subject = "Your New Hostella Account Password";
  const text = `Hello ${name || "Resident"},

Your password reset request has been processed.
Your new login password is:

${newPassword}

You can now log in to the Hostella mobile app using your registered email and this password.
For security, we recommend updating your password after logging in.

Best regards,
Hostella Team`;

  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 520px; margin: 0 auto; padding: 24px; border: 1px solid #e2e8f0; borderRadius: 12px; background: #ffffff;">
      <h2 style="color: #2563EB; margin-top: 0;">Hostella Password Reset</h2>
      <p style="color: #475569; font-size: 15px;">Hello ${name || "Resident"},</p>
      <p style="color: #475569; font-size: 15px;">Your password reset request has been processed. Here is your new password:</p>
      <div style="background: #F1F5F9; border: 1px dashed #2563EB; padding: 14px 20px; border-radius: 8px; font-size: 20px; font-weight: 700; color: #1E293B; letter-spacing: 2px; text-align: center; margin: 20px 0;">
        ${newPassword}
      </div>
      <p style="color: #475569; font-size: 14px;">Use this password along with your email address to log into the Hostella mobile application.</p>
      <p style="color: #94A3B8; font-size: 12px; margin-top: 30px; border-top: 1px solid #e2e8f0; padding-top: 12px;">If you did not request this password reset, please contact your hostel administrator immediately.</p>
    </div>
  `;

  try {
    const info = await transporter.sendMail({
      from,
      to,
      subject,
      text,
      html,
    });
    console.log(`[Hostella Mailer] Password reset email sent to ${to}. MessageId: ${info.messageId}`);
    const previewUrl = nodemailer.getTestMessageUrl(info);
    if (previewUrl) {
      console.log(`[Hostella Mailer] Preview URL: ${previewUrl}`);
    }
    return { success: true, messageId: info.messageId, previewUrl };
  } catch (error) {
    console.error(`[Hostella Mailer] Failed to send email to ${to}:`, error);
    // In case SMTP delivery fails, log it clearly so user/admin is never completely locked out
    return { success: false, error };
  }
}
