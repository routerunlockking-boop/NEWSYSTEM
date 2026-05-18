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
            paid_amount: p.paid_amount || 0,
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
        const payment = await SupplierPayment.findById(req.params.id);
        if (!payment) return res.status(404).json({ error: 'Payment not found' });
        
        const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Colombo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
        
        let newPaid = payment.paid_amount;
        if (req.body.amount !== undefined) {
            newPaid += parseFloat(req.body.amount) || 0;
        } else {
            newPaid = payment.total_amount; // fallback to full payment
        }
        
        payment.paid_amount = newPaid;
        if (payment.paid_amount >= payment.total_amount) {
            payment.is_paid = true;
            payment.paid_date = today;
        }
        if (req.body.notes) payment.notes = req.body.notes;
        
        await payment.save();
        res.json({ message: 'Payment updated', payment });
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
});

// Manually add a supplier payment record
router.post('/payments', async (req, res) => {
    try {
        const { supplier_name, product_name, quantity, cost_price, total_amount, paid_amount, notes } = req.body;
        if (!supplier_name) return res.status(400).json({ error: 'Supplier Name is required' });
        
        const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Colombo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
        
        const payment = await SupplierPayment.create({
            user_id: req.user._id,
            supplier_name,
            product_name: product_name || 'Manual Entry',
            quantity: quantity || 1,
            cost_price: cost_price || 0,
            total_amount: total_amount || 0,
            paid_amount: paid_amount || 0,
            is_paid: (paid_amount || 0) >= (total_amount || 0) && (total_amount || 0) > 0,
            paid_date: (paid_amount || 0) >= (total_amount || 0) && (total_amount || 0) > 0 ? today : '',
            sale_date: today,
            notes: notes || 'Manually added record'
        });
        res.status(201).json({ message: 'Payment record added', payment });
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
});

// Update a supplier payment record (Edit)
router.put('/payments/:id', async (req, res) => {
    try {
        const { supplier_name, product_name, quantity, cost_price, total_amount, paid_amount, notes } = req.body;
        const payment = await SupplierPayment.findById(req.params.id);
        if (!payment) return res.status(404).json({ error: 'Payment not found' });
        
        if (supplier_name) payment.supplier_name = supplier_name;
        if (product_name) payment.product_name = product_name;
        if (quantity !== undefined) payment.quantity = quantity;
        if (cost_price !== undefined) payment.cost_price = cost_price;
        if (total_amount !== undefined) payment.total_amount = total_amount;
        if (paid_amount !== undefined) payment.paid_amount = paid_amount;
        if (notes !== undefined) payment.notes = notes;
        
        if (payment.paid_amount >= payment.total_amount && payment.total_amount > 0) {
            payment.is_paid = true;
            if (!payment.paid_date) {
                payment.paid_date = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Colombo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
            }
        } else {
            payment.is_paid = false;
            payment.paid_date = '';
        }
        
        await payment.save();
        res.json({ message: 'Payment updated', payment });
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
});

// Delete a supplier payment record
router.delete('/payments/:id', async (req, res) => {
    try {
        const payment = await SupplierPayment.findByIdAndDelete(req.params.id);
        if (!payment) return res.status(404).json({ error: 'Payment not found' });
        res.json({ message: 'Payment record deleted' });
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
});

module.exports = router;
