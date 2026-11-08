const mongoose = require('mongoose');

const tradeTransactionSchema = new mongoose.Schema({
  book: { type: mongoose.Schema.Types.ObjectId, ref: 'Book', required: true },
  owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  completedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  delivery: { type: mongoose.Schema.Types.ObjectId, ref: 'Delivery' },
  coverValue: { type: Number, required: true, min: 0 },
  feeRate: { type: Number, required: true, min: 1, max: 3 },
  feeCollected: { type: Number, default: 0, min: 0 },
  feeCollectedAt: { type: Date },
  creditsAwarded: { type: Number, default: 0, min: 0 },
  creditsAwardedAt: { type: Date },
  completedAt: { type: Date, default: Date.now }
}, { timestamps: true });

module.exports = mongoose.model('TradeTransaction', tradeTransactionSchema);
