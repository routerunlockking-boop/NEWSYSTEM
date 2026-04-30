const nodemailer = require('nodemailer');

// Configure email transporter
// Update these credentials for info@smartzonelk.lk
const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port: parseInt(process.env.SMTP_PORT || '587'),
    secure: false,
    auth: {
        user: process.env.SMTP_USER || 'info@smartzonelk.lk',
        pass: process.env.SMTP_PASS || 'Smart12345@'
    }
});

async function sendStatusEmail({ to, customerName, imei, productName, oldStatus, newStatus, notes }) {
    const subject = `SmartZone - Status Update for your ${productName}`;
    const html = `
    <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #f8fafc; padding: 0;">
        <div style="background: linear-gradient(135deg, #10b981 0%, #059669 100%); padding: 32px; text-align: center;">
            <h1 style="color: white; margin: 0; font-size: 24px;">SmartZone</h1>
            <p style="color: rgba(255,255,255,0.9); margin: 8px 0 0; font-size: 14px;">Status Update Notification</p>
        </div>
        <div style="padding: 32px; background: white;">
            <p style="font-size: 16px; color: #1e293b;">Dear <strong>${customerName}</strong>,</p>
            <p style="font-size: 14px; color: #475569; line-height: 1.6;">
                We are writing to inform you about a status update regarding your device.
            </p>
            <div style="background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 12px; padding: 20px; margin: 20px 0;">
                <table style="width: 100%; border-collapse: collapse;">
                    <tr><td style="padding: 8px 0; color: #64748b; font-size: 13px;">Product</td>
                        <td style="padding: 8px 0; font-weight: 600; color: #1e293b; text-align: right;">${productName}</td></tr>
                    <tr><td style="padding: 8px 0; color: #64748b; font-size: 13px;">IMEI Number</td>
                        <td style="padding: 8px 0; font-weight: 600; color: #1e293b; text-align: right; font-family: monospace;">${imei}</td></tr>
                    <tr><td style="padding: 8px 0; color: #64748b; font-size: 13px;">Previous Status</td>
                        <td style="padding: 8px 0; font-weight: 600; color: #ef4444; text-align: right;">${oldStatus}</td></tr>
                    <tr><td style="padding: 8px 0; color: #64748b; font-size: 13px;">New Status</td>
                        <td style="padding: 8px 0; font-weight: 600; color: #10b981; text-align: right;">${newStatus}</td></tr>
                </table>
            </div>
            ${notes ? `<div style="background: #fffbeb; border: 1px solid #fde68a; border-radius: 8px; padding: 16px; margin: 16px 0;">
                <p style="margin: 0; font-size: 13px; color: #92400e;"><strong>Notes:</strong> ${notes}</p>
            </div>` : ''}
            <p style="font-size: 14px; color: #475569; line-height: 1.6;">
                If you have any questions, please visit our store or contact us.
            </p>
        </div>
        <div style="background: #f1f5f9; padding: 20px; text-align: center; border-top: 1px solid #e2e8f0;">
            <p style="margin: 0; font-size: 12px; color: #94a3b8;">SmartZone | info@smartzonelk.lk</p>
        </div>
    </div>`;

    const mailOptions = {
        from: `"SmartZone" <${process.env.SMTP_USER || 'info@smartzonelk.lk'}>`,
        to, subject, html
    };

    return transporter.sendMail(mailOptions);
}

module.exports = { sendStatusEmail };
