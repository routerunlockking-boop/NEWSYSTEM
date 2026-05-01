const mongoose = require('mongoose');
const { connectDB, Product, ImeiItem } = require('./database');
(async () => {
    try {
        await connectDB();
        const products = await Product.find({ is_imei_tracked: true });
        console.log(`Found ${products.length} IMEI-tracked products to sync.`);
        for (const p of products) {
            const count = await ImeiItem.countDocuments({ product_id: p._id, status: 'In Stock' });
            if (p.quantity !== count) {
                console.log(`Syncing ${p.name}: was ${p.quantity}, now ${count}`);
                await Product.findByIdAndUpdate(p._id, { quantity: count });
            } else {
                console.log(`${p.name} is already synced (${count})`);
            }
        }
        console.log('Database sync complete!');
    } catch(err) {
        console.error(err);
    }
    process.exit(0);
})();
