const express = require('express');
const router = express.Router();
const { Invoice, Product, ImeiItem, Customer } = require('../database');

// Helper to strictly synchronize Product stock count with actual "In Stock" IMEI items
async function syncProductStock(product_id) {
    if (!product_id) return;
    try {
        const count = await ImeiItem.countDocuments({ product_id: product_id, status: 'In Stock' });
        await Product.findByIdAndUpdate(product_id, { quantity: count });
    } catch (err) {
        console.error('Error syncing stock:', err);
    }
}

// Get invoices
router.get('/', async (req, res) => {
    const { date, month } = req.query;
    let query = req.user.role === 'admin' ? {} : { user_id: req.user._id };
    if (date) query.date = date;
    else if (month) query.date = new RegExp('^' + month);

    try {
        const invoices = await Invoice.find(query).populate('user_id', 'business_name').sort({ date: -1, time: -1 });
        res.json(invoices.map(inv => ({
            id: inv._id.toString(),
            invoice_number: inv.invoice_number,
            customer_name: inv.customer_name || '',
            customer_phone: inv.customer_phone || '',
            customer_nic: inv.customer_nic || '',
            cashier_name: inv.cashier_name || 'System',
            payment_method: inv.payment_method || 'Cash',
            date: inv.date, time: inv.time,
            total_amount: inv.total_amount,
            total_profit: inv.total_profit || 0,
            owner_name: inv.user_id ? inv.user_id.business_name : 'Unknown'
        })));
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
});

// Get single invoice
router.get('/:id', async (req, res) => {
    try {
        const qf = req.user.role === 'admin' ? { _id: req.params.id } : { _id: req.params.id, user_id: req.user._id };
        const invoice = await Invoice.findOne(qf).populate('user_id', 'business_name');
        if (!invoice) return res.status(404).json({ error: 'Invoice not found' });
        res.json({
            id: invoice._id.toString(),
            invoice_number: invoice.invoice_number,
            customer_name: invoice.customer_name || '',
            customer_phone: invoice.customer_phone || '',
            customer_address: invoice.customer_address || '',
            customer_nic: invoice.customer_nic || '',
            cashier_name: invoice.cashier_name || 'System',
            payment_method: invoice.payment_method || 'Cash',
            date: invoice.date, time: invoice.time,
            total_amount: invoice.total_amount,
            owner_name: invoice.user_id ? invoice.user_id.business_name : 'Unknown',
            items: invoice.items.map(item => ({
                product_name: item.product_name, quantity: item.quantity,
                price: item.price, subtotal: item.subtotal,
                is_imei_item: item.is_imei_item || false,
                imei_number: item.imei_number || ''
            }))
        });
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
});

// Create invoice
router.post('/', async (req, res) => {
    const { items, total_amount, amount_paid, cashier_name, customer_name, customer_phone, customer_address, customer_nic, customer_email, payment_method, imei_items } = req.body;
    const parsedTotal = parseFloat(total_amount) || 0;
    const parsedPaid = parseFloat(amount_paid) || 0;
    if (!items || items.length === 0) return res.status(400).json({ error: 'Invalid invoice data' });

    const today = new Date();
    const date = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Colombo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(today);
    const time = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Colombo', hour: '2-digit', minute: '2-digit' }).format(today);
    const invoice_number = 'INV-' + today.getTime().toString().slice(-6);

    try {
        let total_profit = 0;
        const formattedItems = [];

        for (const item of items) {
            const product = await Product.findOne({ name: item.name, user_id: req.user._id });
            const item_cost_price = product ? product.cost_price || 0 : 0;
            const quantity = parseFloat(item.quantity) || 0;
            const price = parseFloat(item.price) || 0;
            const item_profit = (price - item_cost_price) * quantity;
            total_profit += item_profit;

            formattedItems.push({
                product_name: item.name, quantity, cost_price: item_cost_price,
                price, subtotal: quantity * price, profit: item_profit,
                is_imei_item: item.is_imei_item || false,
                imei_number: item.imei_number || '',
                imei_id: item.imei_id || null,
                // SIM Specific Fields
                sim_serial_number: item.sim_serial_number || '',
                slt_number: item.slt_number || '',
                sim_type: item.sim_type || '',
                sim_payment_type: item.sim_payment_type || '',
                router_model: item.router_model || ''
            });
        }

        const invoice = await Invoice.create({
            user_id: req.user._id, invoice_number,
            customer_name, customer_phone,
            customer_address: customer_address || '',
            customer_nic: customer_nic || '',
            cashier_name: cashier_name || 'System',
            payment_method: payment_method || 'Cash',
            date, time,
            total_amount: parsedTotal, amount_paid: parsedPaid,
            total_profit, items: formattedItems
        });

        // Save or update customer
        if (customer_name && customer_phone) {
            let customer = await Customer.findOne({ user_id: req.user._id, phone: customer_phone });
            if (!customer) {
                await Customer.create({
                    user_id: req.user._id,
                    name: customer_name,
                    phone: customer_phone,
                    address: customer_address || '',
                    nic_number: customer_nic || '',
                    email: customer_email || ''
                });
            } else {
                customer.name = customer_name;
                if (customer_address) customer.address = customer_address;
                if (customer_nic) customer.nic_number = customer_nic;
                if (customer_email) customer.email = customer_email;
                await customer.save();
            }
        }

        // Update normal product stock
        for (const item of items) {
            if (!item.is_imei_item) {
                const quantity = parseFloat(item.quantity) || 0;
                await Product.findOneAndUpdate(
                    { name: item.name, user_id: req.user._id },
                    { $inc: { quantity: -quantity } }
                );
            }
        }

        // Process IMEI items - mark as sold
        if (imei_items && imei_items.length > 0) {
            for (const imeiData of imei_items) {
                const imeiItem = await ImeiItem.findById(imeiData.imei_id);
                if (imeiItem && imeiItem.status === 'In Stock') {
                    const now = new Date();
                    const warrantyExpiry = new Date(now);
                    warrantyExpiry.setMonth(warrantyExpiry.getMonth() + (imeiItem.warranty_months || 12));

                    imeiItem.status = 'Sold';
                    imeiItem.customer_name = customer_name || '';
                    imeiItem.customer_phone = customer_phone || '';
                    imeiItem.customer_address = customer_address || '';
                    imeiItem.customer_nic = customer_nic || '';
                    imeiItem.customer_email = customer_email || '';
                    imeiItem.invoice_id = invoice._id;
                    imeiItem.sold_date = now;
                    imeiItem.warranty_start_date = now;
                    imeiItem.warranty_expiry_date = warrantyExpiry;
                    if (imeiData.selling_price) imeiItem.selling_price = imeiData.selling_price;
                    
                    // SIM Specific Fields from the bill item
                    const billItem = items.find(bi => bi.imei_id === imeiData.imei_id);
                    if (billItem) {
                        if (billItem.sim_type) imeiItem.sim_type = billItem.sim_type;
                        if (billItem.sim_payment_type) imeiItem.sim_payment_type = billItem.sim_payment_type;
                        if (billItem.router_model) imeiItem.router_model = billItem.router_model;
                        if (billItem.slt_number) imeiItem.slt_number = billItem.slt_number;
                        if (billItem.sim_serial_number) imeiItem.sim_serial_number = billItem.sim_serial_number;
                    }

                    imeiItem.status_history.push({
                        status: 'Sold', date: now,
                        notes: `Sold to ${customer_name || 'Customer'} - Invoice: ${invoice_number}`,
                        changed_by: req.user.business_name || 'System'
                    });

                    await imeiItem.save();
                    await syncProductStock(imeiItem.product_id);
                }
            }
        }

        res.status(201).json({
            message: 'Invoice created successfully',
            invoice: {
                id: invoice._id.toString(), invoice_number,
                cashier_name: invoice.cashier_name || 'System',
                customer_name, customer_phone, date, time,
                total_amount: parsedTotal, amount_paid: parsedPaid,
                items: formattedItems
            }
        });
    } catch (err) {
        console.error("INVOICE SAVE ERROR:", err);
        return res.status(500).json({ error: err.message });
    }
});

// Delete invoice
router.delete('/:id', async (req, res) => {
    try {
        const qf = req.user.role === 'admin' ? { _id: req.params.id } : { _id: req.params.id, user_id: req.user._id };
        const invoice = await Invoice.findOneAndDelete(qf);
        if (!invoice) return res.status(404).json({ error: 'Invoice not found' });
        if (invoice.user_id) {
            for (const item of invoice.items) {
                if (!item.is_imei_item) {
                    await Product.findOneAndUpdate(
                        { name: item.product_name, user_id: invoice.user_id },
                        { $inc: { quantity: item.quantity } }
                    );
                }
            }
        }
        res.json({ message: 'Invoice deleted. Inventory restocked.' });
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
});

module.exports = router;
