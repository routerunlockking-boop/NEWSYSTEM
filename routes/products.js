const express = require('express');
const router = express.Router();
const { Product, Category } = require('../database');

// Get all products
router.get('/', async (req, res) => {
    try {
        const { lite } = req.query;
        const qf = req.user.role === 'admin' ? {} : { user_id: req.user._id };
        let query = Product.find(qf).populate('user_id', 'business_name').sort({ name: 1 });
        if (lite === 'true') query = query.select('-image');
        const products = await query;
        const mapped = products.map(p => {
            const r = {
                id: p._id.toString(), name: p.name, barcode: p.barcode || '',
                category: p.category || 'General',
                quantity: p.quantity, cost_price: p.cost_price, price: p.price,
                is_imei_tracked: p.is_imei_tracked || false,
                warranty_months: p.warranty_months || 0,
                supplier: p.supplier || '',
                owner_name: p.user_id ? p.user_id.business_name : 'Unknown'
            };
            if (lite !== 'true') r.image = p.image;
            return r;
        });
        res.json(mapped);
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
});

// Get next available barcode
router.get('/next-barcode', async (req, res) => {
    try {
        const existingBarcodes = await Product.find({ user_id: req.user._id, barcode: /^\d+$/ }).select('barcode');
        let maxNum = 0;
        existingBarcodes.forEach(p => {
            const num = parseInt(p.barcode);
            if (!isNaN(num) && num > maxNum) maxNum = num;
        });
        
        let candidate = maxNum + 1;
        let nextBarcode = candidate.toString().padStart(3, '0');
        
        // Safety check: ensure it doesn't collide with ANY existing barcode (even if not strictly sequential)
        let exists = await Product.findOne({ user_id: req.user._id, barcode: nextBarcode });
        while (exists) {
            candidate++;
            nextBarcode = candidate.toString().padStart(3, '0');
            exists = await Product.findOne({ user_id: req.user._id, barcode: nextBarcode });
        }
        
        res.json({ nextBarcode });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Get product image
router.get('/:id/image', async (req, res) => {
    try {
        const qf = req.user.role === 'admin' ? { _id: req.params.id } : { _id: req.params.id, user_id: req.user._id };
        const product = await Product.findOne(qf).select('image');
        if (!product) return res.status(404).json({ error: 'Product not found' });
        res.json({ image: product.image });
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
});

// Create product
router.post('/', async (req, res) => {
    let { name, barcode, quantity, cost_price, price, image, category, is_imei_tracked, warranty_months, supplier } = req.body;
    if (!name || price === undefined) return res.status(400).json({ error: 'Missing required fields' });
    
    // Auto-generate barcode for non-IMEI products if not provided
    const isImei = String(is_imei_tracked) === 'true';
    if (!isImei && (!barcode || barcode.trim() === '')) {
        try {
            const existingBarcodes = await Product.find({ user_id: req.user._id, barcode: /^\d+$/ }).select('barcode');
            let maxNum = 0;
            existingBarcodes.forEach(p => {
                const num = parseInt(p.barcode);
                if (!isNaN(num) && num > maxNum) maxNum = num;
            });
            let candidate = maxNum + 1;
            barcode = candidate.toString().padStart(3, '0');
            let collides = await Product.findOne({ user_id: req.user._id, barcode });
            while (collides) {
                candidate++;
                barcode = candidate.toString().padStart(3, '0');
                collides = await Product.findOne({ user_id: req.user._id, barcode });
            }
        } catch (e) {
            barcode = '001';
        }
    } else if (barcode && barcode.trim() !== '') {
        // Validation: Check if manually entered barcode exists
        const exists = await Product.findOne({ user_id: req.user._id, barcode: barcode.trim() });
        if (exists) return res.status(400).json({ error: 'This barcode is already assigned to another product' });
    }

    try {
        const product = await Product.create({
            user_id: req.user._id, name, barcode: barcode || '',
            category: category || 'General',
            quantity: is_imei_tracked ? 0 : (quantity || 0),
            cost_price: cost_price || 0, price,
            is_imei_tracked: is_imei_tracked || false,
            warranty_months: warranty_months || 0,
            image, supplier: supplier || ''
        });
        res.status(201).json({
            id: product._id.toString(), name, barcode: product.barcode,
            category: product.category,
            quantity: product.quantity, cost_price: product.cost_price, price,
            is_imei_tracked: product.is_imei_tracked,
            warranty_months: product.warranty_months,
            supplier: product.supplier
        });
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
});

router.put('/:id', async (req, res) => {
    const { name, barcode, quantity, cost_price, price, image, category, is_imei_tracked, warranty_months, supplier } = req.body;
    try {
        const qf = req.user.role === 'admin' ? { _id: req.params.id } : { _id: req.params.id, user_id: req.user._id };
        
        // Validation: Check if updated barcode collides with another product
        if (barcode && barcode.trim() !== '') {
            const collision = await Product.findOne({ user_id: req.user._id, barcode: barcode.trim(), _id: { $ne: req.params.id } });
            if (collision) return res.status(400).json({ error: 'This barcode is already assigned to another product' });
        }
        const updateData = {
            name, barcode: barcode || '', cost_price: cost_price || 0, price, image,
            category: category || 'General',
            is_imei_tracked: is_imei_tracked || false,
            warranty_months: warranty_months || 0,
            supplier: supplier || ''
        };
        if (quantity !== undefined) updateData.quantity = quantity;

        const product = await Product.findOneAndUpdate(qf, updateData, { new: true });
        if (!product) return res.status(404).json({ error: 'Product not found' });
        res.json({ message: 'Product updated successfully' });
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
});

// Delete product
router.delete('/:id', async (req, res) => {
    try {
        const qf = req.user.role === 'admin' ? { _id: req.params.id } : { _id: req.params.id, user_id: req.user._id };
        const product = await Product.findOneAndDelete(qf);
        if (!product) return res.status(404).json({ error: 'Product not found' });
        res.json({ message: 'Product deleted successfully' });
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
});

// Categories
router.get('/categories', async (req, res) => {
    try {
        const qf = req.user.role === 'admin' ? {} : { user_id: req.user._id };
        const cats = await Category.find(qf).sort({ name: 1 });
        res.json(cats.map(c => ({ id: c._id.toString(), name: c.name })));
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
});

router.post('/categories', async (req, res) => {
    try {
        const cat = await Category.create({ user_id: req.user._id, name: req.body.name });
        res.status(201).json({ id: cat._id.toString(), name: cat.name });
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
});

module.exports = router;
