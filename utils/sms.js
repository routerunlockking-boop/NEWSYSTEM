const https = require('https');

async function sendSMS(phone, message) {
    // Notify.lk integration for Sri Lanka or placeholder
    const userId = process.env.NOTIFY_USER_ID;
    const apiKey = process.env.NOTIFY_API_KEY;
    const senderId = process.env.NOTIFY_SENDER_ID || 'NotifyDEMO';

    if (!userId || !apiKey) {
        console.log(`[SMS Simulation] To: ${phone} | Message: ${message}`);
        return true;
    }

    try {
        const url = `https://app.notify.lk/api/v1/send?user_id=${userId}&api_key=${apiKey}&sender_id=${senderId}&to=${phone}&message=${encodeURIComponent(message)}`;
        const res = await fetch(url);
        const data = await res.json();
        console.log('SMS sent via Notify.lk:', data);
        return data;
    } catch (err) {
        console.error('SMS Error:', err.message);
        return false;
    }
}

module.exports = { sendSMS };
