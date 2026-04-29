const express = require('express');
const router = express.Router();
const { ImeiItem, Product } = require('../database');
const { sendStatusEmail } = require('../utils/email');

// Get all IMEI items with optional filters
router.get('/', async (req, res) => {
    try {
        const { search, status, product_id } = req.query;
        const qf = req.user.role === 'admin' ? {} : { user_id: req.user._id };
        
        if (search) {
            qf.$or = [
                { imei_number: new RegExp(search, 'i') },
                { customer_name: new RegExp(search, 'i') },
                { customer_phone: new RegExp(search, 'i') },
                { customer_nic: new RegExp(search, 'i') }
            ];
        }
        if (status) qf.status = status;
        if (product_id) qf.product_id = product_id;

        const items = await ImeiItem.find(qf)
            .populate('product_id', 'name category')
            .sort({ received_date: -1 })
            .limit(500);

        res.json(items.map(i => ({
            id: i._id.toString(),
            imei_number: i.imei_number,
            product_name: i.product_id ? i.product_id.name : 'Unknown',
            product_category: i.product_id ? i.product_id.category : '',
            product_id: i.product_id ? i.product_id._id.toString() : '',
            purchase_price: i.purchase_price,
            selling_price: i.selling_price,
            warranty_months: i.warranty_months,
            warranty_start_date: i.warranty_start_date,
            warranty_expiry_date: i.warranty_expiry_date,
            status: i.status,
            customer_name: i.customer_name,
            customer_phone: i.customer_phone,
            customer_address: i.customer_address,
            customer_nic: i.customer_nic,
            customer_email: i.customer_email,
            sold_date: i.sold_date,
            received_date: i.received_date,
            notes: i.notes,
            status_history: i.status_history
        })));
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
});

// Lookup single IMEI - for scanning
router.get('/lookup/:imei', async (req, res) => {
    try {
        const item = await ImeiItem.findOne({ imei_number: req.params.imei })
            .populate('product_id', 'name category price cost_price warranty_months');
        if (!item) return res.status(404).json({ error: 'IMEI not found' });
        res.json({
            id: item._id.toString(),
            imei_number: item.imei_number,
            product_name: item.product_id ? item.product_id.name : 'Unknown',
            product_id: item.product_id ? item.product_id._id.toString() : '',
            product_category: item.product_id ? item.product_id.category : '',
            purchase_price: item.purchase_price,
            selling_price: item.selling_price,
            warranty_months: item.warranty_months,
            warranty_start_date: item.warranty_start_date,
            warranty_expiry_date: item.warranty_expiry_date,
            status: item.status,
            customer_name: item.customer_name,
            customer_phone: item.customer_phone,
            customer_address: item.customer_address,
            customer_nic: item.customer_nic,
            customer_email: item.customer_email,
            sold_date: item.sold_date,
            received_date: item.received_date,
            notes: item.notes,
            status_history: item.status_history
        });
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
});

// Add IMEI items (bulk) - when receiving stock
router.post('/', async (req, res) => {
    const { product_id, imei_numbers, purchase_price, selling_price, warranty_months } = req.body;
    if (!product_id || !imei_numbers || !imei_numbers.length) {
        return res.status(400).json({ error: 'Product ID and IMEI numbers are required' });
    }
    try {
        const product = await Product.findById(product_id);
        if (!product) return res.status(404).json({ error: 'Product not found' });

        const results = [];
        const errors = [];
        for (const imei of imei_numbers) {
            const trimmed = imei.trim();
            if (!trimmed) continue;
            // Check duplicate
            const existing = await ImeiItem.findOne({ imei_number: trimmed });
            if (existing) {
                errors.push(`IMEI ${trimmed} already exists`);
                continue;
            }
            const item = await ImeiItem.create({
                user_id: req.user._id,
                product_id: product._id,
                imei_number: trimmed,
                purchase_price: purchase_price || product.cost_price || 0,
                selling_price: selling_price || product.price || 0,
                warranty_months: warranty_months || product.warranty_months || 12,
                status: 'In Stock',
                received_date: new Date(),
                status_history: [{
                    status: 'In Stock',
                    date: new Date(),
                    notes: 'Item received into inventory',
                    changed_by: req.user.business_name || 'System'
                }]
            });
            results.push(item);
        }

        // Update product quantity
        await Product.findByIdAndUpdate(product_id, { $inc: { quantity: results.length } });

        res.status(201).json({
            message: `${results.length} IMEI items added successfully`,
            added: results.length,
            errors
        });
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
});

// Update IMEI status (warranty claims, returns, etc.)
router.put('/:id/status', async (req, res) => {
    const { status, notes, send_email } = req.body;
    if (!status) return res.status(400).json({ error: 'Status is required' });
    try {
        const item = await ImeiItem.findById(req.params.id).populate('product_id', 'name');
        if (!item) return res.status(404).json({ error: 'IMEI item not found' });

        const oldStatus = item.status;
        item.status = status;
        if (notes) item.notes = notes;

        item.status_history.push({
            status,
            date: new Date(),
            notes: notes || `Status changed from ${oldStatus} to ${status}`,
            changed_by: req.user.business_name || 'System'
        });

        await item.save();

        // Send email notification if requested
        if (send_email && item.customer_email) {
            try {
                await sendStatusEmail({
                    to: item.customer_email,
                    customerName: item.customer_name,
                    imei: item.imei_number,
                    productName: item.product_id ? item.product_id.name : 'Unknown',
                    oldStatus,
                    newStatus: status,
                    notes: notes || ''
                });
            } catch (emailErr) {
                console.error('Email send failed:', emailErr.message);
            }
        }

        res.json({ message: 'Status updated successfully', item });
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
});

// Mark IMEI as sold (called during billing)
router.put('/:id/sell', async (req, res) => {
    const { customer_name, customer_phone, customer_address, customer_nic, customer_email, invoice_id, selling_price } = req.body;
    try {
        const item = await ImeiItem.findById(req.params.id);
        if (!item) return res.status(404).json({ error: 'IMEI item not found' });
        if (item.status !== 'In Stock') {
            return res.status(400).json({ error: `Cannot sell item with status: ${item.status}` });
        }

        const now = new Date();
        const warrantyExpiry = new Date(now);
        warrantyExpiry.setMonth(warrantyExpiry.getMonth() + (item.warranty_months || 12));

        item.status = 'Sold';
        item.customer_name = customer_name || '';
        item.customer_phone = customer_phone || '';
        item.customer_address = customer_address || '';
        item.customer_nic = customer_nic || '';
        item.customer_email = customer_email || '';
        item.invoice_id = invoice_id || null;
        item.sold_date = now;
        item.warranty_start_date = now;
        item.warranty_expiry_date = warrantyExpiry;
        if (selling_price !== undefined) item.selling_price = selling_price;

        item.status_history.push({
            status: 'Sold',
            date: now,
            notes: `Sold to ${customer_name || 'Customer'}`,
            changed_by: req.user.business_name || 'System'
        });

        await item.save();

        // Decrement product stock
        await Product.findByIdAndUpdate(item.product_id, { $inc: { quantity: -1 } });

        res.json({ message: 'IMEI marked as sold', item });
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
});

// Delete IMEI item
router.delete('/:id', async (req, res) => {
    try {
        const item = await ImeiItem.findByIdAndDelete(req.params.id);
        if (!item) return res.status(404).json({ error: 'IMEI item not found' });
        if (item.status === 'In Stock') {
            await Product.findByIdAndUpdate(item.product_id, { $inc: { quantity: -1 } });
        }
        res.json({ message: 'IMEI item deleted' });
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
});

module.exports = router;
