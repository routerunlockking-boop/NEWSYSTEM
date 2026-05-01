const mongoose = require('mongoose');

// Global variable to cache the mongoose connection
let cachedDb = null;

const connectDB = async () => {
    if (cachedDb) {
        console.log('Using cached MongoDB connection');
        return cachedDb;
    }

    try {
        const uri = process.env.MONGO_URI || 'mongodb+srv://Admin:Admin%4012345@cluster0.czllghf.mongodb.net/myDatabase?retryWrites=true&w=majority';
        const db = await mongoose.connect(uri, {
            serverSelectionTimeoutMS: 5000
        });

        cachedDb = db;
        console.log('Connected to MongoDB database');
        return db;
    } catch (err) {
        console.error('Error connecting to MongoDB:', err.message);
        throw err;
    }
};

// -- SCHEMAS --

const UserSchema = new mongoose.Schema({
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    business_name: { type: String, required: true },
    whatsapp_number: { type: String },
    marketplace_enabled: { type: Boolean, default: false },
    role: { type: String, default: 'user' }, // admin, user, cashier
    is_active: { type: Boolean, default: false },
    delete_request: { type: Boolean, default: false },
    invoice_settings: {
        header_title: { type: String, default: 'SMARTZONE' },
        header_subtitle: { type: String, default: 'New Town Padaviya, Anuradhapura' },
        header_contact: { type: String, default: 'Mobile: 078-68000 86' },
        tax_invoice_text: { type: String, default: 'Tax Invoice' },
        label_bill_no: { type: String, default: 'Bill No:' },
        label_cashier: { type: String, default: 'Cashier:' },
        label_customer: { type: String, default: 'Customer:' },
        label_tel: { type: String, default: 'Tel:' },
        label_item: { type: String, default: 'Item' },
        label_qty: { type: String, default: 'Qty' },
        label_amount: { type: String, default: 'Amount' },
        label_subtotal: { type: String, default: 'Subtotal' },
        label_total: { type: String, default: 'TOTAL' },
        label_amount_paid: { type: String, default: 'Amount Paid' },
        label_balance: { type: String, default: 'Balance' },
        footer_message1: { type: String, default: 'Thank You! Come Again' },
        footer_message2: { type: String, default: 'Please keep this receipt for warranty claims.<br>Items with IMEI are subject to warranty conditions.' },
        footer_powered_by: { type: String, default: 'Powered by SmartZone' }
    }
});

const CategorySchema = new mongoose.Schema({
    user_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    name: { type: String, required: true }
});

const ProductSchema = new mongoose.Schema({
    user_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    name: { type: String, required: true },
    category: { type: String, default: 'General' },
    quantity: { type: Number, default: 0 },
    barcode: { type: String, default: '' },
    cost_price: { type: Number, default: 0.0 },
    price: { type: Number, default: 0.0 },
    is_imei_tracked: { type: Boolean, default: false },
    warranty_months: { type: Number, default: 0 },
    image: { type: String },
    supplier: { type: String, default: '' }
});

// Status history entry for IMEI items
const StatusHistorySchema = new mongoose.Schema({
    status: { type: String, required: true },
    date: { type: Date, default: Date.now },
    notes: { type: String, default: '' },
    changed_by: { type: String, default: 'System' }
}, { _id: true });

const ImeiItemSchema = new mongoose.Schema({
    user_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    product_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
    imei_number: { type: String, required: true, unique: true },
    purchase_price: { type: Number, default: 0 },
    selling_price: { type: Number, default: 0 },
    warranty_months: { type: Number, default: 12 },
    warranty_start_date: { type: Date },
    warranty_expiry_date: { type: Date },
    status: { 
        type: String, 
        default: 'In Stock',
        enum: ['In Stock', 'Sold', 'Returned', 'Under Repair', 'Replaced', 'Rejected', 'Cancelled', 'Sent to SLT', 'Received from SLT', 'Delivered to Customer']
    },
    customer_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer' },
    customer_name: { type: String, default: '' },
    customer_phone: { type: String, default: '' },
    customer_address: { type: String, default: '' },
    customer_nic: { type: String, default: '' },
    customer_email: { type: String, default: '' },
    invoice_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Invoice' },
    sold_date: { type: Date },
    received_date: { type: Date, default: Date.now },
    notes: { type: String, default: '' },
    status_history: [StatusHistorySchema]
});

// Index for fast lookups
ImeiItemSchema.index({ status: 1 });
ImeiItemSchema.index({ customer_nic: 1 });
ImeiItemSchema.index({ customer_phone: 1 });

const InvoiceItemSchema = new mongoose.Schema({
    product_name: { type: String, required: true },
    quantity: { type: Number, required: true },
    cost_price: { type: Number, default: 0.0 },
    price: { type: Number, required: true },
    subtotal: { type: Number, required: true },
    profit: { type: Number, default: 0.0 },
    is_imei_item: { type: Boolean, default: false },
    imei_number: { type: String, default: '' },
    imei_id: { type: mongoose.Schema.Types.ObjectId, ref: 'ImeiItem' }
});

const InvoiceSchema = new mongoose.Schema({
    user_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    invoice_number: { type: String, required: true },
    date: { type: String, required: true }, // Format: YYYY-MM-DD
    time: { type: String, required: true }, // Format: HH:MM
    customer_name: { type: String, default: '' },
    customer_phone: { type: String, default: '' },
    customer_address: { type: String, default: '' },
    customer_nic: { type: String, default: '' },
    cashier_name: { type: String, default: 'System' },
    payment_method: { type: String, default: 'Cash' },
    subtotal_amount: { type: Number, default: 0.0 },
    voucher_code: { type: String, default: '' },
    voucher_discount: { type: Number, default: 0.0 },
    total_amount: { type: Number, default: 0.0 },
    amount_paid: { type: Number, default: 0.0 },
    total_profit: { type: Number, default: 0.0 },
    items: [InvoiceItemSchema]
});

const CustomerSchema = new mongoose.Schema({
    user_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    name: { type: String, required: true },
    phone: { type: String, required: true },
    email: { type: String, default: '' },
    address: { type: String, default: '' },
    nic_number: { type: String, default: '' },
    created_date: { type: String, default: () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Colombo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date()) }
});

CustomerSchema.index({ nic_number: 1 });
CustomerSchema.index({ phone: 1 });

const SupplierSchema = new mongoose.Schema({
    user_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    name: { type: String, required: true },
    phone: { type: String, required: true },
    email: { type: String, default: '' },
    address: { type: String, default: '' },
    nic_number: { type: String, default: '' },
    created_date: { type: String, default: () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Colombo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date()) }
});

const VoucherSchema = new mongoose.Schema({
    user_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    code: { type: String, required: true, unique: true },
    discount_type: { type: String, enum: ['percentage', 'fixed'], default: 'percentage' },
    discount_value: { type: Number, required: true },
    usage_limit: { type: Number, default: null },
    used_count: { type: Number, default: 0 },
    expiry_date: { type: String },
    status: { type: String, enum: ['active', 'inactive'], default: 'active' }
});

// -- MODELS --
const User = mongoose.model('User', UserSchema);
const Category = mongoose.model('Category', CategorySchema);
const Product = mongoose.model('Product', ProductSchema);
const ImeiItem = mongoose.model('ImeiItem', ImeiItemSchema);
const Invoice = mongoose.model('Invoice', InvoiceSchema);
const Customer = mongoose.model('Customer', CustomerSchema);
const Supplier = mongoose.model('Supplier', SupplierSchema);
const Voucher = mongoose.model('Voucher', VoucherSchema);

// Create default admin user
const initializeDatabase = async () => {
    try {
        const adminExists = await User.findOne({ role: 'admin' });
        if (!adminExists) {
            await User.create({
                email: 'smartzonelk101@gmail.com',
                password: 'admin',
                business_name: 'SMART ZONE',
                role: 'admin',
                is_active: true
            });
            console.log('Admin user created.');
        } else {
            await User.updateOne(
                { _id: adminExists._id },
                {
                    email: 'smartzonelk101@gmail.com',
                    password: 'admin',
                    business_name: 'SMART ZONE',
                    role: 'admin',
                    is_active: true
                }
            );
            console.log('Admin credentials updated for existing admin user.');
        }

        // Create default categories
        const admin = await User.findOne({ role: 'admin' });
        if (admin) {
            const defaultCategories = ['Routers', 'Accessories', 'Cables', 'SIM Cards', 'Other'];
            for (const catName of defaultCategories) {
                const exists = await Category.findOne({ user_id: admin._id, name: catName });
                if (!exists) {
                    await Category.create({ user_id: admin._id, name: catName });
                }
            }
            console.log('Default categories initialized.');
        }
    } catch (err) {
        console.error('Error initializing default user:', err.message);
    }
};

module.exports = {
    connectDB,
    initializeDatabase,
    User,
    Category,
    Product,
    ImeiItem,
    Invoice,
    Customer,
    Supplier,
    Voucher
};
