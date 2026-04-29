const express = require('express');
const router = express.Router();
const { Customer } = require('../database');

router.get('/', async (req, res) => {
    try {
        const { search } = req.query;
        const qf = req.user.role === 'admin' ? {} : { user_id: req.user._id };
        if (search) {
            qf.$or = [
                { name: new RegExp(search, 'i') },
                { phone: new RegExp(search, 'i') },
                { nic_number: new RegExp(search, 'i') }
            ];
        }
        const customers = await Customer.find(qf).sort({ name: 1 });
        res.json(customers.map(c => ({
            id: c._id.toString(), name: c.name, phone: c.phone,
            email: c.email || '', address: c.address || '',
            nic_number: c.nic_number || '',
            created_date: c.created_date
        })));
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
});

router.post('/', async (req, res) => {
    const { name, phone, email, address, nic_number } = req.body;
    if (!name || !phone) return res.status(400).json({ error: 'Name and phone required' });
    try {
        const customer = await Customer.create({
            user_id: req.user._id, name, phone,
            email: email || '', address: address || '',
            nic_number: nic_number || ''
        });
        res.status(201).json({
            id: customer._id.toString(), name: customer.name, phone: customer.phone,
            email: customer.email, address: customer.address,
            nic_number: customer.nic_number, created_date: customer.created_date
        });
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
});

router.put('/:id', async (req, res) => {
    const { name, phone, email, address, nic_number } = req.body;
    try {
        const qf = req.user.role === 'admin' ? { _id: req.params.id } : { _id: req.params.id, user_id: req.user._id };
        const customer = await Customer.findOneAndUpdate(qf, {
            name, phone, email: email || '', address: address || '', nic_number: nic_number || ''
        }, { new: true });
        if (!customer) return res.status(404).json({ error: 'Customer not found' });
        res.json({ message: 'Customer updated' });
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
});

router.delete('/:id', async (req, res) => {
    try {
        const qf = req.user.role === 'admin' ? { _id: req.params.id } : { _id: req.params.id, user_id: req.user._id };
        const customer = await Customer.findOneAndDelete(qf);
        if (!customer) return res.status(404).json({ error: 'Customer not found' });
        res.json({ message: 'Customer deleted' });
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
});

module.exports = router;
