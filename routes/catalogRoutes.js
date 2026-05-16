const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { Product, Variant } = require('../models/Product');

const uploadDir = 'uploads/';
if (!fs.existsSync(uploadDir)){
    fs.mkdirSync(uploadDir, { recursive: true });
}

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
router.post('/create-product',upload.single('productImage'), async (req, res) => {
  const { name, description, price, variants } = req.body;
try {
  const parsedVariants=JSON.parse(variants); // Convert the stringified variants back to an array of objects

  let imageUrl = '';

  if (req.file) {
      // Constructs a URL like: https://your-backend.onrender.com/uploads/171829381-file.jpg
      imageUrl = `${req.protocol}://${req.get('host')}/uploads/${req.file.filename}`;
    }

  
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
// Dynamic CSV Data Feed for Meta Commerce Manager
router.get('/meta-feed', async (req, res) => {
  try {
    // Find all variants and pull details from their parent products
    const variants = await Variant.find().populate('productId');

    // 1. Define your CSV Header Columns (Meta's required naming schema)
    let csvContent = "id,title,description,availability,condition,price,link,image_link,brand,item_group_id\n";

    // 2. Loop through variants and build individual text rows
    variants.forEach((v) => {
      // Clean string inputs to prevent broken rows from commas or newlines
      const cleanTitle = `${v.productId.name} - ${v.color} (${v.size})`.replace(/,/g, ' ');
      const cleanDescription = (v.productId.description || 'High-quality clothing item.').replace(/,/g, ' ').replace(/\n/g, ' ');
      const availability = v.quantity > 0 ? 'in stock' : 'out of stock';
      const cleanImageLink = v.image || 'https://placehold.co/600x600.png';

      // Append row line to your data string sheet
      csvContent += `"${v.sku}","${cleanTitle}","${cleanDescription}","${availability}","new","${v.price} INR","https://example-placeholder-store.com","${cleanImageLink}","StoreBrand","${v.productId._id.toString()}"\n`;
    });

    // 3. Set content response headers telling Meta it is downloading a real CSV document
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename=meta-feed.csv');

    // Send the raw CSV spreadsheet string text directly out
    res.status(200).send(csvContent);

  } catch (error) {
    console.error("Meta feed creation crashed:", error);
    res.status(500).send(`Error generating feed: ${error.message}`);
  }
});

module.exports = router;