require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');


const app = express();
app.use('/uploads', express.static(path.join(__dirname, 'uploads'))); // Serve images from the 'uploads' directory)
const catalogRoutes = require('./routes/catalogRoutes');

// Middleware
app.use(cors());
app.use(express.json());
app.use('/api/v1/catalog', catalogRoutes);

// Database Connection
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log('Successfully connected to MongoDB.'))
  .catch((err) => console.error('MongoDB connection error:', err));

// Root test route
app.get('/', (req, res) => {
  res.send('Inventory Management Engine is Running...');
});

// Start Server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});