const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const { Product, Variant } = require('../models/Product');

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'uploads/'); // Images will save inside an 'uploads' folder
  },
  filename: (req, file, cb) => {
    // Generates a unique filename using timestamp (e.g., 171829381-tshirt.jpg)
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({ storage: storage });

// API Endpoint to receive product details from Frontend Admin Panel
router.post('/create-product', async (req, res) => {
  const { name, description, price, variants } = req.body;

  const parsedVariants=JSON.parse(variants); // Convert the stringified variants back to an array of objects

  let imageUrl = '';

  if (req.file) {
      // Constructs a URL like: https://your-backend.onrender.com/uploads/171829381-file.jpg
      imageUrl = `${req.protocol}://${req.get('host')}/uploads/${req.file.filename}`;
    }

  try {
    // 1. Create and save the primary product
    const newProduct = new Product({ name, description });
    await newProduct.save();

    // 2. Format variants by assigning the new ProductId and generating an automated SKU
    const formattedVariants = parsedVariants.map((v) => {
      // Create a clean slug-style SKU (e.g., "DENIM-BLACK-M")
      const nameSlug = name.replace(/\s+/g, '-').substring(0, 5).toUpperCase();
      const generatedSku = `${nameSlug}-${v.color.toUpperCase()}-${v.size.toUpperCase()}`;

      return {
        productId: newProduct._id,
        sku: generatedSku,
        size: v.size,
        color: v.color,
        price: Number(price),
        quantity: Number(v.quantity),
        image:imageUrl
      };
    });

    // 3. Batch save all variants directly to MongoDB
    await Variant.insertMany(formattedVariants);

    res.status(201).json({ success: true, message: 'Product and variants successfully published.' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});


// Dynamic JSON Data Feed for Meta Commerce Manager
router.get('/meta-feed', async (req, res) => {
  try {
    // Find all variants and pull details from their parent products
    const variants = await Variant.find().populate('productId');

    const metaItems = variants.map((v) => ({
      id: v.sku, // The retailer ID Meta tracks
      title: `${v.productId.name} - ${v.color} (${v.size})`,
      description: v.productId.description || 'High-quality clothing item.',
      availability: v.quantity > 0 ? 'in stock' : 'out of stock',
      condition: 'new',
      price: `${v.price} INR`, // Adjust currency code as per store location
      link: 'https://example-placeholder-store.com', // Meta requires a URL fallback link
      image_link: v.image || 'https://placehold.co/600x600.png', // Temporary placeholder image link
      brand: 'StoreBrand',
      item_group_id: v.productId._id.toString() // Groups identical clothing pieces together
    }));

    res.status(200).json(metaItems);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;