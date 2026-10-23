const mongoose = require('mongoose');

const bookSchema = new mongoose.Schema({
  owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  title: { type: String, required: true },
  author: String,
  coverPrice: { type: Number, required: true, min: 0 },
  condition: { 
    type: String, 
    enum: ['NEW', 'LIKE_NEW', 'USED', 'OLD'], 
    default: 'LIKE_NEW' 
  },
  creditValue: { type: Number, default: 1 }, // Tự động tính theo Giá Bìa + Tình Trạng
  type: { 
    type: String, 
    enum: ['OWNED', 'WISHLIST'], // Sách đang có để cho đi HOẶC sách mong muốn
    required: true 
  },
  status: { 
    type: String, 
    enum: ['AVAILABLE', 'LOCKED_IN_LOOP', 'TRADED'], 
    default: 'AVAILABLE' 
  }
}, { timestamps: true });

module.exports = mongoose.model('Book', bookSchema);