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

// === SUPPLIER PAYMENTS ===
const { SupplierPayment } = require('../database');

router.get('/payments', async (req, res) => {
    try {
        const qf = req.user.role === 'admin' ? {} : { user_id: req.user._id };
        const { supplier, status } = req.query;
        if (supplier) qf.supplier_name = supplier;
        if (status === 'paid') qf.is_paid = true;
        else if (status === 'unpaid') qf.is_paid = false;
        const payments = await SupplierPayment.find(qf).sort({ sale_date: -1 });
        res.json(payments.map(p => ({
            id: p._id.toString(),
            supplier_name: p.supplier_name,
            invoice_number: p.invoice_number || '',
            product_name: p.product_name,
            quantity: p.quantity,
            cost_price: p.cost_price,
            total_amount: p.total_amount,
            selling_price: p.selling_price,
            sale_date: p.sale_date,
            is_paid: p.is_paid,
            paid_date: p.paid_date || '',
            notes: p.notes || ''
        })));
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
});

router.put('/payments/:id/pay', async (req, res) => {
    try {
        const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Colombo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
        const payment = await SupplierPayment.findByIdAndUpdate(req.params.id, {
            is_paid: true, paid_date: today, notes: req.body.notes || ''
        }, { new: true });
        if (!payment) return res.status(404).json({ error: 'Payment not found' });
        res.json({ message: 'Payment marked as paid' });
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
});

module.exports = router;
