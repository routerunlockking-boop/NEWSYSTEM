const express = require('express');
const cors = require('cors');
const path = require('path');
const { connectDB, initializeDatabase, User } = require('./database');

const app = express();
const PORT = process.env.PORT || 3000;

// Connect to MongoDB
if (process.env.NODE_ENV !== 'production') {
    connectDB().then(() => { initializeDatabase(); });
}

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// Auth routes (public)
app.use('/api/auth', require('./routes/auth'));

// Auth middleware
const authMiddleware = async (req, res, next) => {
    const authHeader = req.headers.authorization;
    if (!authHeader) return res.status(401).json({ error: 'Unauthorized' });
    const token = authHeader.split(' ')[1];
    if (!token) return res.status(401).json({ error: 'Unauthorized' });
    try {
        const user = await User.findById(token);
        if (!user) return res.status(401).json({ error: 'Unauthorized' });
        req.user = user;
        next();
    } catch (err) {
        return res.status(401).json({ error: 'Unauthorized' });
    }
};

app.use('/api', (req, res, next) => {
    if (req.path.startsWith('/auth') || req.path.startsWith('/public')) return next();
    return authMiddleware(req, res, next);
});

// Protected routes
app.use('/api/dashboard', require('./routes/dashboard'));
app.use('/api/products', require('./routes/products'));
app.use('/api/imei', require('./routes/imei'));
app.use('/api/invoices', require('./routes/invoices'));
app.use('/api/customers', require('./routes/customers'));
app.use('/api/suppliers', require('./routes/suppliers'));
app.use('/api/vouchers', require('./routes/vouchers'));
app.use('/api/reports', require('./routes/reports'));
app.use('/api/admin', require('./routes/admin'));

// User disconnect request
app.post('/api/user/request-disconnect', async (req, res) => {
    try {
        await User.findByIdAndUpdate(req.user._id, { delete_request: true });
        res.json({ message: 'Disconnect request sent' });
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
});

// Marketplace
app.post('/api/marketplace/enable', async (req, res) => {
    try {
        await User.findByIdAndUpdate(req.user._id, { marketplace_enabled: true });
        res.json({ message: 'Marketplace enabled' });
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
});

// Serve SPA
app.get('/{*path}', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Start server
if (process.env.NODE_ENV !== 'production') {
    app.listen(PORT, () => { console.log(`Server running on http://localhost:${PORT}`); });
}
module.exports = app;
