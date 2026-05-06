const express = require('express');
const router = express.Router();
const { User } = require('../database');

// Register
router.post('/register', async (req, res) => {
    const { email, password, business_name, whatsapp_number } = req.body;
    if (!email || !password || !business_name) {
        return res.status(400).json({ error: 'Missing required fields' });
    }
    const lowerEmail = email.toLowerCase();
    try {
        const existingUser = await User.findOne({ email: lowerEmail });
        if (existingUser) return res.status(400).json({ error: 'User already exists' });
        await User.create({ email: lowerEmail, password, business_name, whatsapp_number, is_active: false });
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
        const user = await User.findOne({ email: { $regex: new RegExp(`^${email}$`, 'i') }, password });
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

// Get own profile — requires auth token
router.get('/profile', async (req, res) => {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader) return res.status(401).json({ error: 'Unauthorized' });
        const token = authHeader.split(' ')[1];
        if (!token) return res.status(401).json({ error: 'Unauthorized' });
        const user = await User.findById(token);
        if (!user) return res.status(401).json({ error: 'Unauthorized' });
        res.json({
            id: user._id.toString(),
            email: user.email,
            business_name: user.business_name,
            whatsapp_number: user.whatsapp_number || '',
            role: user.role,
            invoice_settings: user.invoice_settings || {},
            invoice_templates: user.invoice_templates || []
        });
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
});

// Update own profile
router.put('/profile', async (req, res) => {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader) return res.status(401).json({ error: 'Unauthorized' });
        const token = authHeader.split(' ')[1];
        if (!token) return res.status(401).json({ error: 'Unauthorized' });
        const user = await User.findById(token);
        if (!user) return res.status(401).json({ error: 'Unauthorized' });

        const { business_name, email, whatsapp_number, password, invoice_settings, invoice_templates } = req.body;
        if (business_name) user.business_name = business_name;
        if (email) user.email = email;
        if (whatsapp_number !== undefined) user.whatsapp_number = whatsapp_number;
        if (password && password.trim()) user.password = password;
        if (invoice_settings) {
            user.invoice_settings = { ...user.invoice_settings, ...invoice_settings };
        }
        if (invoice_templates) {
            user.invoice_templates = invoice_templates;
        }
        await user.save();
        
        res.json({ message: 'Profile updated successfully', business_name: user.business_name });
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
});

// Get active users (for cashier dropdown) — requires auth token in header
router.get('/cashiers', async (req, res) => {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader) return res.status(401).json({ error: 'Unauthorized' });
        const token = authHeader.split(' ')[1];
        if (!token) return res.status(401).json({ error: 'Unauthorized' });
        const requestingUser = await User.findById(token);
        if (!requestingUser) return res.status(401).json({ error: 'Unauthorized' });

        let allCashiers = [];
        if (requestingUser.role === 'admin') {
            const users = await User.find({ is_active: true }).select('business_name role email');
            const adminUser = await User.findOne({ role: 'admin' }).select('business_name role email');
            allCashiers = users.map(u => ({
                id: u._id.toString(),
                name: u.business_name,
                role: u.role
            }));
            // Ensure admin is in the list if not already
            if (adminUser && !allCashiers.find(c => c.id === adminUser._id.toString())) {
                allCashiers.unshift({ id: adminUser._id.toString(), name: adminUser.business_name, role: adminUser.role });
            }
        } else {
            // Non-admins only see themselves
            allCashiers = [{
                id: requestingUser._id.toString(),
                name: requestingUser.business_name,
                role: requestingUser.role
            }];
        }
        res.json(allCashiers);
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
});

module.exports = router;
