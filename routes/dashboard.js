const express = require('express');
const router = express.Router();
const { Product, Invoice, ImeiItem } = require('../database');

router.get('/', async (req, res) => {
    const todayDate = new Date();
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Colombo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(todayDate);
    const currentMonth = today.slice(0, 7);
    const qf = req.user.role === 'admin' ? {} : { user_id: req.user._id };

    try {
        const dailyInvoices = await Invoice.find({ ...qf, date: today });
        const totalBillsToday = dailyInvoices.length;
        const dailyIncome = dailyInvoices.reduce((s, i) => s + i.total_amount, 0);
        const dailyProfit = dailyInvoices.reduce((s, i) => s + (i.total_profit || 0), 0);

        const monthlyInvoices = await Invoice.find({ ...qf, date: new RegExp('^' + currentMonth) });
        const totalBillsMonth = monthlyInvoices.length;
        const monthlyIncome = monthlyInvoices.reduce((s, i) => s + i.total_amount, 0);
        const monthlyProfit = monthlyInvoices.reduce((s, i) => s + (i.total_profit || 0), 0);

        const totalProducts = await Product.countDocuments(qf);
        const lowStockProducts = await Product.countDocuments({ ...qf, quantity: { $lte: 10 } });

        // IMEI stats
        const totalImeiItems = await ImeiItem.countDocuments(qf);
        const imeiInStock = await ImeiItem.countDocuments({ ...qf, status: 'In Stock' });
        const imeiSold = await ImeiItem.countDocuments({ ...qf, status: 'Sold' });
        const imeiReturned = await ImeiItem.countDocuments({ ...qf, status: { $in: ['Returned', 'Under Repair', 'Sent to SLT'] } });

        res.json({
            totalBillsToday, dailyIncome, dailyProfit,
            totalBillsMonth, monthlyIncome, monthlyProfit,
            totalProducts, lowStockProducts,
            totalImeiItems, imeiInStock, imeiSold, imeiReturned
        });
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
});

router.get('/low-stock', async (req, res) => {
    try {
        const qf = req.user.role === 'admin' ? {} : { user_id: req.user._id };
        const products = await Product.find({ ...qf, quantity: { $lte: 10 } }).sort({ quantity: 1 }).limit(20);
        res.json(products.map(p => ({
            id: p._id.toString(), name: p.name, quantity: p.quantity, price: p.price,
            is_imei_tracked: p.is_imei_tracked
        })));
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
});

module.exports = router;
