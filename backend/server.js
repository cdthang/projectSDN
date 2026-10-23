const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const morgan = require('morgan');
const connectDB = require('./config/db');

dotenv.config();

const app = express();

app.use(cors({ origin: process.env.FRONTEND_URL || 'http://localhost:5173' }));
app.use(express.json());
app.use(morgan('dev'));

// API Routes
app.get('/api/health', (req, res) => res.json({ success: true, message: 'BookSwap API is running.' }));
app.use('/api/auth', require('./routes/authRoutes'));
app.use('/api/trades', require('./routes/tradeRoutes'));
app.use('/api/books', require('./routes/bookRoutes'));

app.use((req, res) => res.status(404).json({ success: false, message: 'Không tìm thấy đường dẫn API.' }));
app.use((error, req, res, next) => {
  console.error(error);
  if (res.headersSent) return next(error);
  return res.status(500).json({ success: false, message: 'Đã xảy ra lỗi máy chủ.' });
});

const PORT = process.env.PORT || 5000;
connectDB().then(() => {
  app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
});