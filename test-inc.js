const mongoose = require('mongoose');
const { connectDB, Product } = require('./database');
(async () => {
  await connectDB();
  const product = await Product.findOne({ is_imei_tracked: true });
  if (product) {
    console.log('Before quantity:', product.quantity);
    await Product.findByIdAndUpdate(product._id, { $inc: { quantity: 1 } });
    const after = await Product.findById(product._id);
    console.log('After quantity:', after.quantity);
  } else {
    console.log('No IMEI product found');
  }
  process.exit(0);
})();
