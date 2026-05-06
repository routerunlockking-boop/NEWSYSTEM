const express = require('express');
const router = express.Router();
const { Invoice, ImeiItem } = require('../database');
const XLSX = require('xlsx');

// Sales report
router.get('/sales', async (req, res) => {
    try {
        const qm = req.user.role === 'admin' ? {} : { user_id: req.user._id };
        const result = await Invoice.aggregate([
            { $match: qm },
            { $group: { _id: "$date", total_sales: { $sum: "$total_amount" }, total_profit: { $sum: "$total_profit" } } },
            { $project: { date: "$_id", total_sales: 1, total_profit: 1, _id: 0 } },
            { $sort: { date: -1 } }
        ]);
        res.json(result);
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
});

// Product sales report
router.get('/product-sales', async (req, res) => {
    try {
        const qm = req.user.role === 'admin' ? {} : { user_id: req.user._id };
        const result = await Invoice.aggregate([
            { $match: qm },
            { $unwind: "$items" },
            { $group: {
                _id: "$items.product_name",
                quantity_sold: { $sum: "$items.quantity" },
                revenue: { $sum: "$items.subtotal" },
                profit: { $sum: "$items.profit" }
            }},
            { $project: { product_name: "$_id", quantity_sold: 1, revenue: 1, profit: 1, _id: 0 } },
            { $sort: { quantity_sold: -1 } }
        ]);
        res.json(result);
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
});

// SLT Report - Monthly IMEI report
router.get('/slt', async (req, res) => {
    try {
        const { month, from, to } = req.query;
        const qf = req.user.role === 'admin' ? {} : { user_id: req.user._id };
        qf.status = 'Sold';

        if (month) {
            // month format: YYYY-MM
            const startDate = new Date(month + '-01');
            const endDate = new Date(startDate);
            endDate.setMonth(endDate.getMonth() + 1);
            qf.sold_date = { $gte: startDate, $lt: endDate };
        } else if (from && to) {
            qf.sold_date = { $gte: new Date(from), $lte: new Date(to + 'T23:59:59') };
        }

        const items = await ImeiItem.find(qf)
            .populate('product_id', 'name category')
            .sort({ sold_date: -1 });

        res.json(items.map(i => ({
            id: i._id.toString(),
            imei_number: i.imei_number,
            sim_serial_number: i.sim_serial_number || '',
            slt_number: i.slt_number || '',
            sim_type: i.sim_type || '',
            sim_payment_type: i.sim_payment_type || '',
            router_model: i.router_model || (i.product_id ? i.product_id.name : 'Unknown'),
            product_name: i.product_id ? i.product_id.name : 'Unknown',
            product_category: i.product_id ? i.product_id.category : '',
            customer_name: i.customer_name,
            customer_address: i.customer_address,
            customer_phone: i.customer_phone,
            customer_nic: i.customer_nic,
            purchase_date: i.sold_date,
            warranty_months: i.warranty_months,
            warranty_expiry_date: i.warranty_expiry_date,
            selling_price: i.selling_price,
            status: i.status
        })));
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
});

// SLT Report Export to Excel
router.get('/slt/export', async (req, res) => {
    try {
        const { month, from, to } = req.query;
        const qf = req.user.role === 'admin' ? {} : { user_id: req.user._id };
        qf.status = 'Sold';

        if (month) {
            const startDate = new Date(month + '-01');
            const endDate = new Date(startDate);
            endDate.setMonth(endDate.getMonth() + 1);
            qf.sold_date = { $gte: startDate, $lt: endDate };
        } else if (from && to) {
            qf.sold_date = { $gte: new Date(from), $lte: new Date(to + 'T23:59:59') };
        }

        const items = await ImeiItem.find(qf)
            .populate('product_id', 'name category')
            .sort({ sold_date: -1 });

        const data = items.map((i, idx) => ({
            'No.': idx + 1,
            'Date': i.sold_date ? new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Colombo' }).format(i.sold_date) : '',
            'Customer Name': i.customer_name,
            'Phone Number': i.customer_phone,
            'NIC Number': i.customer_nic,
            'SIM Type': i.sim_type || '',
            'SIM Serial': i.sim_serial_number || '',
            'SLT Number': i.slt_number || '',
            'Router Model': i.router_model || (i.product_id ? i.product_id.name : 'Unknown'),
            'IMEI Number': i.imei_number,
            'Category': i.product_id ? i.product_id.category : '',
            'Address': i.customer_address,
            'Warranty (Months)': i.warranty_months,
            'Warranty Expiry': i.warranty_expiry_date ? new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Colombo' }).format(i.warranty_expiry_date) : '',
            'Selling Price': i.selling_price,
            'Status': i.status
        }));

        const wb = XLSX.utils.book_new();
        const ws = XLSX.utils.json_to_sheet(data);

        // Set column widths
        ws['!cols'] = [
            { wch: 5 }, { wch: 20 }, { wch: 25 }, { wch: 15 },
            { wch: 25 }, { wch: 30 }, { wch: 15 }, { wch: 15 },
            { wch: 15 }, { wch: 12 }, { wch: 15 }, { wch: 12 }, { wch: 12 }
        ];

        const sheetName = month ? `SLT Report ${month}` : 'SLT Report';
        XLSX.utils.book_append_sheet(wb, ws, sheetName);

        const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename=SLT_Report_${month || 'custom'}.xlsx`);
        res.send(buffer);
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
});

module.exports = router;
