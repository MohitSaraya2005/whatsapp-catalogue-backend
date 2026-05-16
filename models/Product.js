const mongoose = require('mongoose');

// Main product info (Shared across variations)
const ProductSchema = new mongoose.Schema({
  name: { type: String, required: true },
  description: { type: String },
  createdAt: { type: Date, default: Date.now }
});

// Specific size/color variation with its own stock tracking
const VariantSchema = new mongoose.Schema({
  productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
  sku: { type: String, required: true, unique: true }, // e.g., HOOD-BLK-XL
  size: { type: String, required: true },
  color: { type: String, required: true },
  price: { type: Number, required: true },
  quantity: { type: Number, required: true, default: 0 }
});

const Product = mongoose.model('Product', ProductSchema);
const Variant = mongoose.model('Variant', VariantSchema);

module.exports = { Product, Variant };