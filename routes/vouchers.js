const express = require('express');
const router = express.Router();
const { Voucher } = require('../database');

router.get('/', async (req, res) => {
    try {
        const qf = req.user.role === 'admin' ? {} : { user_id: req.user._id };
        const vouchers = await Voucher.find(qf).sort({ code: 1 });
        res.json(vouchers.map(v => ({
            id: v._id.toString(), code: v.code, discount_type: v.discount_type,
            discount_value: v.discount_value, usage_limit: v.usage_limit,
            used_count: v.used_count, expiry_date: v.expiry_date, status: v.status
        })));
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
});

router.post('/', async (req, res) => {
    const { code, discount_type, discount_value, usage_limit, expiry_date, status } = req.body;
    if (!code || !discount_value) return res.status(400).json({ error: 'Code and value required' });
    try {
        const voucher = await Voucher.create({
            user_id: req.user._id, code: code.toUpperCase(),
            discount_type: discount_type || 'percentage',
            discount_value, usage_limit: usage_limit || null,
            expiry_date: expiry_date || '', status: status || 'active'
        });
        res.status(201).json({ id: voucher._id.toString(), code: voucher.code });
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
});

router.post('/validate', async (req, res) => {
    try {
        const { code } = req.body;
        const voucher = await Voucher.findOne({ code: code.toUpperCase(), status: 'active' });
        if (!voucher) return res.status(404).json({ error: 'Voucher not found or inactive' });
        if (voucher.usage_limit && voucher.used_count >= voucher.usage_limit) {
            return res.status(400).json({ error: 'Voucher usage limit reached' });
        }
        if (voucher.expiry_date && new Date(voucher.expiry_date) < new Date()) {
            return res.status(400).json({ error: 'Voucher expired' });
        }
        res.json({ discount_type: voucher.discount_type, discount_value: voucher.discount_value, code: voucher.code });
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
});

router.delete('/:id', async (req, res) => {
    try {
        await Voucher.findByIdAndDelete(req.params.id);
        res.json({ message: 'Voucher deleted' });
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
});

module.exports = router;
