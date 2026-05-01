const express = require('express');
const router = express.Router();
const { User, Product, Invoice } = require('../database');

const adminOnly = (req, res, next) => {
    if (req.user && req.user.role === 'admin') return next();
    res.status(403).json({ error: 'Admins only' });
};

router.get('/users', adminOnly, async (req, res) => {
    try {
        const users = await User.find({ role: { $ne: 'admin' } });
        res.json(users.map(u => ({
            id: u._id.toString(), email: u.email, business_name: u.business_name,
            whatsapp_number: u.whatsapp_number || '', role: u.role,
            is_active: u.is_active, delete_request: u.delete_request
        })));
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
});

router.put('/users/:id', adminOnly, async (req, res) => {
    const { email, business_name, whatsapp_number, is_active, role, password } = req.body;
    try {
        const user = await User.findById(req.params.id);
        if (!user) return res.status(404).json({ error: 'User not found' });
        if (email) user.email = email;
        if (business_name) user.business_name = business_name;
        if (whatsapp_number !== undefined) user.whatsapp_number = whatsapp_number;
        if (is_active !== undefined) user.is_active = is_active;
        if (role) user.role = role;
        if (password && password.trim()) user.password = password;
        await user.save();
        res.json({ message: 'User updated' });
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
});

router.delete('/users/:id', adminOnly, async (req, res) => {
    try {
        const user = await User.findByIdAndDelete(req.params.id);
        if (!user) return res.status(404).json({ error: 'User not found' });
        await Product.deleteMany({ user_id: req.params.id });
        await Invoice.deleteMany({ user_id: req.params.id });
        res.json({ message: 'User and data deleted' });
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
});

module.exports = router;
