const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  password: { type: String, required: true, select: false },
  bookCredits: { type: Number, default: 0 }, // Số điểm tích lũy
  address: { type: String, required: true, trim: true }
}, { timestamps: true });

module.exports = mongoose.model('User', userSchema);