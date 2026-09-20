const nodemailer = require('nodemailer');
require('dotenv').config();

async function runTest() {
  const smtpHost = process.env.SMTP_HOST;
  const smtpPort = process.env.SMTP_PORT;
  const smtpUser = process.env.SMTP_USER;
  const smtpPass = process.env.SMTP_PASS;
  const recipient = process.env.NOTIFICATION_EMAILS || 'koiralarijan8@gmail.com';

  console.log('📬 Checking SMTP configuration...');
  console.log(`SMTP Host: ${smtpHost || 'Not Set'}`);
  console.log(`SMTP Port: ${smtpPort || '587 (default)'}`);
  console.log(`SMTP User: ${smtpUser || 'Not Set'}`);
  console.log(`SMTP Pass: ${smtpPass ? '******' : 'Not Set'}`);
  console.log(`Recipient: ${recipient}`);

  if (!smtpHost || !smtpUser || !smtpPass) {
    console.error('❌ Error: Missing SMTP Host, SMTP User, or SMTP Password in environment. Please configure your .env file.');
    process.exit(1);
  }

  const transporter = nodemailer.createTransport({
    host: smtpHost,
    port: parseInt(smtpPort || '587'),
    secure: smtpPort === '465',
    auth: {
      user: smtpUser,
      pass: smtpPass
    },
    tls: {
      rejectUnauthorized: false
    }
  });

  console.log('⚡ Sending test email...');
  try {
    const info = await transporter.sendMail({
      from: `"FWCPL StockOS Testing" <${smtpUser}>`,
      to: recipient,
      subject: '🧪 [StockOS] Outgoing Mail Test',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 500px; margin: auto; padding: 20px; border: 1px solid #ddd; border-radius: 8px;">
          <h2 style="color: #4f46e5; border-bottom: 2px solid #eef2ff; padding-bottom: 8px;">Outbox Connection Test</h2>
          <p>This is a test email sent from <strong>FWCPL StockOS</strong> to verify your SMTP server connection.</p>
          <p>If you received this email, the SMTP setup is correct and ready for stock requests!</p>
          <hr style="border: 0; border-top: 1px solid #eee; margin: 20px 0;"/>
          <p style="font-size: 11px; color: #888; text-align: center;">FWCPL StockOS · Automated Test</p>
        </div>
      `
    });

    console.log(`✅ Success! Test email sent successfully.`);
    console.log(`Response Info: ${info.response}`);
    console.log(`Message ID: ${info.messageId}`);
  } catch (error) {
    console.error('❌ Test failed: Error while sending email:', error);
  }
}

runTest();
