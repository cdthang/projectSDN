const Book = require('../models/Book');
const calculateCreditValue = require('../utils/creditCalculator');

const validTypes = ['OWNED', 'WISHLIST'];
const validConditions = ['NEW', 'LIKE_NEW', 'USED', 'OLD'];
const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

exports.listBooks = async (req, res, next) => {
  try {
    const filter = { type: 'OWNED', status: 'AVAILABLE' };
    const search = typeof req.query.search === 'string' ? req.query.search.trim() : '';
    if (search) {
      const searchPattern = escapeRegex(search);
      filter.$or = [
        { title: { $regex: searchPattern, $options: 'i' } },
        { author: { $regex: searchPattern, $options: 'i' } }
      ];
    }

    const books = await Book.find(filter)
      .select('-__v')
      .populate('owner', 'name')
      .sort({ createdAt: -1 })
      .limit(100);
    return res.json({ success: true, count: books.length, data: books });
  } catch (error) {
    return next(error);
  }
};

exports.getUserBooks = async (req, res, next) => {
  try {
    const userId = req.params.userId;
    const isOwner = req.user && req.user._id.toString() === userId;
    const filter = { owner: userId };
    if (!isOwner) {
      filter.type = 'OWNED';
      filter.status = 'AVAILABLE';
    }

    const books = await Book.find(filter).sort({ createdAt: -1 });
    return res.json({ success: true, count: books.length, data: books });
  } catch (error) {
    return next(error);
  }
};

exports.createBook = async (req, res, next) => {
  try {
    const { title, author = '', coverPrice, condition = 'LIKE_NEW', type = 'OWNED' } = req.body;
    if (typeof title !== 'string' || !title.trim()) {
      return res.status(400).json({ success: false, message: 'Tên sách không được để trống.' });
    }
    if (!validTypes.includes(type)) {
      return res.status(400).json({ success: false, message: 'Loại sách không hợp lệ.' });
    }
    if (!validConditions.includes(condition)) {
      return res.status(400).json({ success: false, message: 'Tình trạng sách không hợp lệ.' });
    }
    const price = Number(coverPrice);
    if (!Number.isFinite(price) || price < 0) {
      return res.status(400).json({ success: false, message: 'Giá bìa phải là số không âm.' });
    }

    const book = await Book.create({
      owner: req.user._id,
      title: title.trim(),
      author: typeof author === 'string' ? author.trim() : '',
      coverPrice: price,
      condition,
      creditValue: calculateCreditValue(price, condition),
      type
    });
    return res.status(201).json({ success: true, data: book });
  } catch (error) {
    if (error.name === 'ValidationError') {
      return res.status(400).json({ success: false, message: error.message });
    }
    return next(error);
  }
};

exports.updateBook = async (req, res, next) => {
  try {
    const book = await Book.findOne({ _id: req.params.id, owner: req.user._id });
    if (!book) return res.status(404).json({ success: false, message: 'Không tìm thấy sách.' });

    const { title, author, coverPrice, condition, type } = req.body;
    if (title !== undefined) {
      if (typeof title !== 'string' || !title.trim()) {
        return res.status(400).json({ success: false, message: 'Tên sách không được để trống.' });
      }
      book.title = title.trim();
    }
    if (author !== undefined) book.author = typeof author === 'string' ? author.trim() : '';
    if (coverPrice !== undefined) {
      const price = Number(coverPrice);
      if (!Number.isFinite(price) || price < 0) {
        return res.status(400).json({ success: false, message: 'Giá bìa phải là số không âm.' });
      }
      book.coverPrice = price;
    }
    if (condition !== undefined) book.condition = condition;
    if (!validConditions.includes(book.condition)) {
      return res.status(400).json({ success: false, message: 'Tình trạng sách không hợp lệ.' });
    }
    if (type !== undefined) {
      if (!validTypes.includes(type)) {
        return res.status(400).json({ success: false, message: 'Loại sách không hợp lệ.' });
      }
      book.type = type;
    }
    if (req.body.status !== undefined) book.status = req.body.status;
    book.creditValue = calculateCreditValue(book.coverPrice, condition || book.condition);

    try {
      await book.save();
    } catch (error) {
      if (error.name === 'ValidationError') {
        return res.status(400).json({ success: false, message: error.message });
      }
      throw error;
    }
    return res.json({ success: true, data: book });
  } catch (error) {
    return next(error);
  }
};

exports.deleteBook = async (req, res, next) => {
  try {
    const book = await Book.findOneAndDelete({ _id: req.params.id, owner: req.user._id });
    if (!book) return res.status(404).json({ success: false, message: 'Không tìm thấy sách.' });
    return res.json({ success: true, message: 'Đã xóa sách khỏi tủ của bạn.' });
  } catch (error) {
    return next(error);
  }
};