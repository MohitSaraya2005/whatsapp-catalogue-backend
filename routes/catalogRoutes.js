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



// Dynamic CSV Data Feed for Meta Commerce Manager
// Dynamic CSV Data Feed for Meta Commerce Manager (With Explicit Sizing Fields)
router.get('/meta-feed', async (req, res) => {
  try {
    // Find all variants and pull details from their parent products
    const variants = await Variant.find().populate('productId');

    // 💡 FIX: Added 'size' and 'color' to Meta's official CSV column header string row
    let csvContent = "id,title,description,availability,condition,price,link,image_link,brand,item_group_id,size,color\n";

    // Loop through variants and build individual text rows
    variants.forEach((v) => {
      // Keep titles clean and unified so they match across variants
      const cleanTitle = `${v.productId.name}`.replace(/,/g, ' '); 
      const cleanDescription = (v.productId.description || 'High-quality clothing item.').replace(/,/g, ' ').replace(/\n/g, ' ');
      const availability = v.quantity > 0 ? 'in stock' : 'out of stock';
      const cleanImageLink = v.image || 'https://placehold.co/600x600.png';

      // 💡 FIX: Appended explicit size and color variables to the end of the text row data mapping line
      csvContent += `"${v.sku}","${cleanTitle}","${cleanDescription}","${availability}","new","${v.price} INR","https://example-placeholder-store.com","${cleanImageLink}","StoreBrand","${v.productId._id.toString()}","${v.size}","${v.color}"\n`;
    });

    // Set content response headers telling Meta it is downloading a real CSV document
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename=meta-feed.csv');

    // Send the raw CSV spreadsheet string text directly out
    res.status(200).send(csvContent);

  } catch (error) {
    console.error("Meta feed creation crashed:", error);
    res.status(500).send(`Error generating feed: ${error.message}`);
  }
});



// 🔒 CHOOSE A UNIQUE SECURITY KEY STRING
const VERIFY_TOKEN = "my_super_secret_verify_token_12345";

/**
 * 1. THE HANDSHAKE (GET Route)
 * Meta knocks on this door to verify that your server is real and secure.
 */
router.get('/webhook', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  // Check if mode and token match your secret string
  if (mode && token) {
    if (mode === 'subscribe' && token === VERIFY_TOKEN) {
      console.log('🎉 Webhook verified successfully by Meta!');
      return res.status(200).send(challenge); // Return challenge code to complete handshake
    } else {
      return res.sendStatus(403); // Security mismatch error
    }
  }
});

/**
 * 2. THE ORDER PROCESSING ENGINE (POST Route)
 * Triggers every single time a customer interacts with your catalog.
 */
router.post('/webhook', async (req, res) => {
  try {
    const body = req.body;

    // Direct return out if the ping is a placeholder or system status ping
    if (!body.object || !body.entry?.[0]?.changes?.[0]?.value?.messages) {
      return res.status(200).send('EVENT_RECEIVED'); // Always reply 200 OK fast so Meta doesn't retry
    }

    const message = body.entry[0].changes[0].value.messages[0];

    // Check if the message is a user placing a product order cart item bundle
    if (message.type === 'order') {
      const orderDetails = message.order;
      const productItems = orderDetails.product_items; // Array of item variants inside the order cart
      
      console.log(`🛒 Incoming order caught! Order ID: ${orderDetails.catalog_id}`);

      // Loop through each product variant stacked inside the customer's cart selection
      for (const item of productItems) {
        const itemSku = item.product_retailer_id; // e.g., "TOP-F-GREEN-L"
        const orderedQuantity = Number(item.quantity);

        console.log(`Decrementing inventory: SKU: ${itemSku} | Qty: ${orderedQuantity}`);

        // ⚡ AUTOMATIC MONGODB UPDATE: Decrement stock using the negative incremental operator
        const updatedVariant = await Variant.findOneAndUpdate(
          { sku: itemSku },
          { $inc: { quantity: -orderedQuantity } },
          { new: true } // Returns the newly modified variant document
        );

        if (updatedVariant && updatedVariant.quantity < 0) {
          console.warn(`⚠️ Warning: SKU ${itemSku} dropped into negative inventory territory (${updatedVariant.quantity})!`);
          // Optional code: Trigger a re-order alert, switch availability to out-of-stock etc.
        }
      }
    }

    // Always tell Meta the event landed safely so it stops hammering your API route loop
    res.status(200).send('EVENT_RECEIVED');

  } catch (error) {
    console.error("❌ Webhook execution process failure:", error);
    // Even if it fails, send a 200 out so Meta doesn't blacklist or suspend your webhook path
    res.status(200).send('EVENT_RECEIVED'); 
  }
});



module.exports = router;