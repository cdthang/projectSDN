const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/User');

const createToken = (userId) => {
  if (!process.env.JWT_SECRET) {
    throw new Error('JWT_SECRET is not configured');
  }

  return jwt.sign({ id: userId }, process.env.JWT_SECRET, { expiresIn: '7d' });
};

const toPublicUser = (user) => ({
  id: user._id,
  name: user.name,
  email: user.email,
  address: user.address,
  bookCredits: user.bookCredits
});

exports.register = async (req, res, next) => {
  try {
    const { name, email, password, address } = req.body;
    if (![name, email, password, address].every((value) => typeof value === 'string' && value.trim())) {
      return res.status(400).json({ success: false, message: 'Vui lòng điền đầy đủ thông tin.' });
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      return res.status(400).json({ success: false, message: 'Email không hợp lệ.' });
    }
    if (password.length < 8) {
      return res.status(400).json({ success: false, message: 'Mật khẩu cần có ít nhất 8 ký tự.' });
    }

    const normalizedEmail = email.trim().toLowerCase();
    const existingUser = await User.findOne({ email: normalizedEmail });
    if (existingUser) {
      return res.status(409).json({ success: false, message: 'Email này đã được sử dụng.' });
    }

    const user = await User.create({
      name: name.trim(),
      email: normalizedEmail,
      password: await bcrypt.hash(password, 12),
      address: address.trim()
    });

    return res.status(201).json({
      success: true,
      token: createToken(user._id),
      data: toPublicUser(user)
    });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({ success: false, message: 'Email này đã được sử dụng.' });
    }
    return next(error);
  }
};

exports.login = async (req, res, next) => {
  try {
    const { email, password } = req.body;
    if (typeof email !== 'string' || typeof password !== 'string' || !email.trim() || !password) {
      return res.status(400).json({ success: false, message: 'Vui lòng nhập email và mật khẩu.' });
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      return res.status(400).json({ success: false, message: 'Email không hợp lệ.' });
    }

    const user = await User.findOne({ email: email.trim().toLowerCase() }).select('+password');
    if (!user || !(await bcrypt.compare(password, user.password))) {
      return res.status(401).json({ success: false, message: 'Email hoặc mật khẩu không chính xác.' });
    }

    return res.status(200).json({
      success: true,
      token: createToken(user._id),
      data: toPublicUser(user)
    });
  } catch (error) {
    return next(error);
  }
};

exports.getMe = async (req, res) => res.json({ success: true, data: toPublicUser(req.user) });
