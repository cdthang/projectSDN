const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  password: { type: String, required: true, select: false },
  role: { type: String, enum: ['USER', 'ADMIN', 'COURIER'], default: 'USER' },
  isActive: { type: Boolean, default: true },
  phone: { type: String, trim: true, default: '' },
  bookCredits: { type: Number, default: 0 },
  bookCreditTransactions: [{ type: mongoose.Schema.Types.ObjectId, ref: 'TradeTransaction' }],
  address: { type: String, required: true, trim: true }
}, { timestamps: true });

module.exports = mongoose.model('User', userSchema);