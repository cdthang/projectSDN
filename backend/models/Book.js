const mongoose = require('mongoose');

const bookSchema = new mongoose.Schema({
  owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  title: { type: String, required: true },
  author: String,
  summary: { type: String, default: '' },
  coverPrice: { type: Number, required: true, min: 0 },
  listingMode: { type: String, enum: ['SALE', 'TRADE'], default: 'TRADE' },
  salePrice: { type: Number, min: 0 },
  stockQuantity: { type: Number, min: 0, default: 1 },
  imagePath: { type: String, default: '' },
  imageMimeType: { type: String, default: '' },
  aiAssessment: {
    condition: { type: String, enum: ['NEW', 'LIKE_NEW', 'USED', 'OLD'] },
    damageLevel: { type: String, enum: ['LOW', 'MEDIUM', 'HIGH'] },
    damageNotes: { type: String, default: '' },
    estimatedPrice: { type: Number, min: 0 },
    confidence: { type: Number, min: 0, max: 1 },
    provider: { type: String, default: 'Gemini' },
    analyzedAt: { type: Date }
  },
  maintenanceFee: { type: Number, default: 0, min: 0 },
  maintenanceFeeRate: { type: Number, default: 2, min: 1, max: 3 },
  condition: { 
    type: String, 
    enum: ['NEW', 'LIKE_NEW', 'USED', 'OLD'], 
    default: 'LIKE_NEW' 
  },
  damageLevel: {
    type: String,
    enum: ['LOW', 'MEDIUM', 'HIGH'],
    default: 'LOW'
  },
  damageNotes: { type: String, default: '' },
  creditValue: { type: Number, default: 1 }, // Tự động tính theo Giá Bìa + Tình Trạng
  type: { 
    type: String, 
    enum: ['OWNED', 'WISHLIST'], // Sách đang có để cho đi HOẶC sách mong muốn
    required: true 
  },
  status: { 
    type: String, 
    enum: ['AVAILABLE', 'LOCKED_IN_LOOP', 'TRADED', 'OUT_OF_STOCK'],
    default: 'AVAILABLE' 
  }
}, { timestamps: true });

module.exports = mongoose.model('Book', bookSchema);