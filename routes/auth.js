const express = require('express');
const router = express.Router();
const { User } = require('../database');

// Register
router.post('/register', async (req, res) => {
    const { email, password, business_name, whatsapp_number } = req.body;
    if (!email || !password || !business_name) {
        return res.status(400).json({ error: 'Missing required fields' });
    }
    try {
        const existingUser = await User.findOne({ email });
        if (existingUser) return res.status(400).json({ error: 'User already exists' });
        await User.create({ email, password, business_name, whatsapp_number, is_active: false });
        res.status(201).json({ message: 'Account creation successful. Pending admin approval.' });
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
});

// Login
router.post('/login', async (req, res) => {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'Missing required fields' });
    try {
        const user = await User.findOne({ email, password });
        if (!user) return res.status(401).json({ error: 'Invalid credentials' });
        if (!user.is_active && user.role !== 'admin') {
            return res.status(403).json({ error: 'Account pending admin approval' });
        }
        res.json({ token: user._id.toString(), business_name: user.business_name, role: user.role });
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
});

// Reset Password
router.post('/reset-password', async (req, res) => {
    const { email, business_name, new_password } = req.body;
    if (!email || !business_name || !new_password) return res.status(400).json({ error: 'Missing required fields' });
    try {
        const user = await User.findOne({ email, business_name });
        if (!user) return res.status(404).json({ error: 'Account not found' });
        user.password = new_password;
        await user.save();
        res.json({ message: 'Password reset successful.' });
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
});

module.exports = router;
