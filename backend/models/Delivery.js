const mongoose = require('mongoose');

const deliverySchema = new mongoose.Schema({
  book: { type: mongoose.Schema.Types.ObjectId, ref: 'Book', required: true },
  courier: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  assignedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  buyer: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  orderType: { type: String, enum: ['TRADE', 'PURCHASE'], default: 'TRADE' },
  salePrice: { type: Number, min: 0 },
  quantity: { type: Number, min: 1, default: 1 },
  pointsUsed: { type: Number, min: 0, default: 0 },
  cashToCollect: { type: Number, min: 0 },
  codCollected: { type: Boolean, default: false },
  codCollectedAt: { type: Date },
  recipientName: { type: String, required: true, trim: true },
  recipientPhone: { type: String, required: true, trim: true },
  address: { type: String, required: true, trim: true },
  status: {
    type: String,
    enum: ['PENDING_ASSIGNMENT', 'ASSIGNED', 'IN_TRANSIT', 'DELIVERED', 'COMPLETED'],
    default: 'ASSIGNED'
  },
  proofPath: { type: String, default: '' },
  proofMimeType: { type: String, default: '' },
  deliveredAt: { type: Date },
  completedAt: { type: Date },
  transaction: { type: mongoose.Schema.Types.ObjectId, ref: 'TradeTransaction' }
}, { timestamps: true });

module.exports = mongoose.model('Delivery', deliverySchema);
