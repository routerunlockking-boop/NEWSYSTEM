const { connectDB, User } = require('./database');
require('dotenv').config();

async function check() {
    try {
        console.log('Connecting to DB...');
        await connectDB();
        console.log('Connected!');
        const admin = await User.findOne({ role: 'admin' });
        console.log('Admin user found:', admin ? admin.email : 'NOT FOUND');
        process.exit(0);
    } catch (err) {
        console.error('DB Error:', err.message);
        process.exit(1);
    }
}
check();
