const express = require('express');
const router = express.Router();
const { Supplier } = require('../database');

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
        const suppliers = await Supplier.find(qf).sort({ name: 1 });
        res.json(suppliers.map(c => ({
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
        const supplier = await Supplier.create({
            user_id: req.user._id, name, phone,
            email: email || '', address: address || '',
            nic_number: nic_number || ''
        });
        res.status(201).json({
            id: supplier._id.toString(), name: supplier.name, phone: supplier.phone,
            email: supplier.email, address: supplier.address,
            nic_number: supplier.nic_number, created_date: supplier.created_date
        });
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
});

router.put('/:id', async (req, res) => {
    const { name, phone, email, address, nic_number } = req.body;
    try {
        const qf = req.user.role === 'admin' ? { _id: req.params.id } : { _id: req.params.id, user_id: req.user._id };
        const supplier = await Supplier.findOneAndUpdate(qf, {
            name, phone, email: email || '', address: address || '', nic_number: nic_number || ''
        }, { new: true });
        if (!supplier) return res.status(404).json({ error: 'Supplier not found' });
        res.json({ message: 'Supplier updated' });
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
});

router.delete('/:id', async (req, res) => {
    try {
        const qf = req.user.role === 'admin' ? { _id: req.params.id } : { _id: req.params.id, user_id: req.user._id };
        const supplier = await Supplier.findOneAndDelete(qf);
        if (!supplier) return res.status(404).json({ error: 'Supplier not found' });
        res.json({ message: 'Supplier deleted' });
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
});

module.exports = router;
