const Book = require('../models/Book');
const Delivery = require('../models/Delivery');
const TradeTransaction = require('../models/TradeTransaction');
const User = require('../models/User');
const bcrypt = require('bcryptjs');
const calculateAssessmentCredits = require('../utils/assessmentCreditCalculator');

const feeRate = 2;
const feeForBook = (book) => Math.round((book.coverPrice * feeRate) / 100);

exports.getDashboard = async (req, res, next) => {
  try {
    const [
      totalBooks,
      availableBooks,
      highDamageBooks,
      totalUsers,
      completedTrades,
      collectedFees,
      listedBookFees,
      pendingDeliveryFees,
      completedSaleValue,
      pendingCodAmount
    ] = await Promise.all([
      Book.countDocuments(),
      Book.countDocuments({ type: 'OWNED', status: 'AVAILABLE' }),
      Book.countDocuments({ type: 'OWNED', status: { $in: ['AVAILABLE', 'LOCKED_IN_LOOP'] }, damageLevel: 'HIGH' }),
      User.countDocuments({ $or: [{ role: 'USER' }, { role: { $exists: false } }] }),
      TradeTransaction.countDocuments(),
      TradeTransaction.aggregate([{ $group: { _id: null, total: { $sum: '$feeCollected' } } }]),
      Book.aggregate([
        { $match: { type: 'OWNED', status: { $in: ['AVAILABLE', 'LOCKED_IN_LOOP'] } } },
        {
          $group: {
            _id: null,
            total: {
              $sum: {
                $ifNull: [
                  '$maintenanceFee',
                  { $round: [{ $multiply: ['$coverPrice', feeRate / 100] }, 0] }
                ]
              }
            }
          }
        }
      ]),
      TradeTransaction.aggregate([
        { $match: { delivery: { $exists: true }, feeCollectedAt: { $exists: false } } },
        {
          $group: {
            _id: null,
            total: {
              $sum: {
                $round: [{ $multiply: ['$coverValue', { $divide: ['$feeRate', 100] }] }, 0]
              }
            }
          }
        }
      ]),
      Delivery.aggregate([
        { $match: { orderType: 'PURCHASE', status: 'COMPLETED' } },
        {
          $group: {
            _id: null,
            total: {
              $sum: {
                $multiply: ['$salePrice', { $ifNull: ['$quantity', 1] }]
              }
            }
          }
        }
      ]),
      Delivery.aggregate([
        { $match: { orderType: 'PURCHASE', codCollected: false, status: { $in: ['PENDING_ASSIGNMENT', 'ASSIGNED', 'IN_TRANSIT', 'DELIVERED'] } } },
        { $group: { _id: null, total: { $sum: '$cashToCollect' } } }
      ])
    ]);

    return res.json({
      success: true,
      data: {
        totalBooks,
        availableBooks,
        highDamageBooks,
        totalUsers,
        completedTrades,
        collectedFees: collectedFees[0]?.total || 0,
        expectedFees: (listedBookFees[0]?.total || 0) + (pendingDeliveryFees[0]?.total || 0),
        completedSaleValue: completedSaleValue[0]?.total || 0,
        pendingCodAmount: pendingCodAmount[0]?.total || 0,
        feeRate
      }
    });
  } catch (error) {
    return next(error);
  }
};

exports.listUsers = async (req, res, next) => {
  try {
    const users = await User.find({ $or: [{ role: 'USER' }, { role: { $exists: false } }] })
      .select('name email address bookCredits createdAt')
      .sort({ createdAt: -1 })
      .lean();
    const bookCounts = await Book.aggregate([
      { $group: { _id: '$owner', count: { $sum: 1 } } }
    ]);
    const countsByUser = new Map(bookCounts.map(({ _id, count }) => [_id.toString(), count]));
    return res.json({
      success: true,
      count: users.length,
      data: users.map((user) => ({ ...user, bookCount: countsByUser.get(user._id.toString()) || 0 }))
    });
  } catch (error) {
    return next(error);
  }
};

exports.listCouriers = async (req, res, next) => {
  try {
    const couriers = await User.find({ role: 'COURIER' })
      .select('name email phone address isActive createdAt')
      .sort({ createdAt: -1 })
      .lean();
    return res.json({ success: true, count: couriers.length, data: couriers });
  } catch (error) {
    return next(error);
  }
};

exports.setCourierStatus = async (req, res, next) => {
  try {
    if (typeof req.body.isActive !== 'boolean') {
      return res.status(400).json({ success: false, message: 'Trạng thái nhân viên không hợp lệ.' });
    }
    const courier = await User.findOneAndUpdate(
      { _id: req.params.courierId, role: 'COURIER' },
      { $set: { isActive: req.body.isActive } },
      { new: true, runValidators: true }
    ).select('name email isActive');
    if (!courier) return res.status(404).json({ success: false, message: 'Không tìm thấy nhân viên vận chuyển.' });
    if (!courier.isActive) {
      const io = req.app.get('io');
      if (io) {
        for (const socket of io.sockets.sockets.values()) {
          if (socket.data.user?._id.toString() === courier._id.toString()) socket.disconnect(true);
        }
      }
    }
    return res.json({
      success: true,
      data: courier,
      message: courier.isActive ? 'Đã mở khóa tài khoản nhân viên.' : 'Đã khóa tài khoản nhân viên.'
    });
  } catch (error) {
    return next(error);
  }
};

exports.createCourier = async (req, res, next) => {
  try {
    const { name, email, password, phone, address = '' } = req.body;
    if (![name, email, password, phone].every((value) => typeof value === 'string' && value.trim())) {
      return res.status(400).json({ success: false, message: 'Vui lòng nhập tên, email, số điện thoại và mật khẩu.' });
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      return res.status(400).json({ success: false, message: 'Email nhân viên không hợp lệ.' });
    }
    if (password.length < 8) {
      return res.status(400).json({ success: false, message: 'Mật khẩu nhân viên cần ít nhất 8 ký tự.' });
    }
    if (!/^\+?[0-9\s()-]{8,20}$/.test(phone.trim())) {
      return res.status(400).json({ success: false, message: 'Số điện thoại không hợp lệ.' });
    }
    const courier = await User.create({
      name: name.trim(),
      email: email.trim().toLowerCase(),
      password: await bcrypt.hash(password, 12),
      phone: phone.trim(),
      address: typeof address === 'string' ? address.trim() : '',
      role: 'COURIER'
    });
    return res.status(201).json({
      success: true,
      data: { id: courier._id, name: courier.name, email: courier.email, phone: courier.phone, role: courier.role }
    });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({ success: false, message: 'Email này đã được sử dụng.' });
    }
    return next(error);
  }
};

exports.listDeliveries = async (req, res, next) => {
  try {
    const deliveries = await Delivery.find()
      .populate({ path: 'book', select: 'title author coverPrice salePrice maintenanceFee status owner', populate: { path: 'owner', select: 'name email phone' } })
      .populate('buyer', 'name email')
      .populate('courier', 'name email phone')
      .populate('assignedBy', 'name')
      .sort({ createdAt: -1 })
      .limit(500)
      .lean();
    const safeDeliveries = deliveries.map(({ proofPath, ...delivery }) => ({
      ...delivery,
      hasProof: Boolean(proofPath)
    }));
    return res.json({ success: true, count: safeDeliveries.length, data: safeDeliveries });
  } catch (error) {
    return next(error);
  }
};

exports.getDeliveryProof = async (req, res, next) => {
  try {
    const delivery = await Delivery.findById(req.params.deliveryId).select('proofPath proofMimeType');
    if (!delivery || !delivery.proofPath) return res.status(404).json({ success: false, message: 'Chưa có ảnh bằng chứng giao hàng.' });
    res.type(delivery.proofMimeType);
    return res.sendFile(delivery.proofPath, (error) => {
      if (error && !res.headersSent) next(error);
    });
  } catch (error) {
    return next(error);
  }
};

exports.collectDeliveryFee = async (req, res, next) => {
  try {
    const delivery = await Delivery.findOne({
      _id: req.params.deliveryId,
      status: { $in: ['DELIVERED', 'COMPLETED'] },
      transaction: { $exists: true }
    });
    if (!delivery) {
      return res.status(409).json({ success: false, message: 'Đơn chưa được nhân viên xác nhận giao hoặc phí đã được ghi nhận.' });
    }

    const book = await Book.findById(delivery.book).select('coverPrice salePrice aiAssessment owner damageLevel');
    if (!book) {
      return res.status(409).json({ success: false, message: 'Không tìm thấy sách của đơn vận chuyển.' });
    }
    try {
      let transaction = await TradeTransaction.findOne({ _id: delivery.transaction, delivery: delivery._id });
      if (!transaction) return res.status(409).json({ success: false, message: 'Không tìm thấy giao dịch của đơn.' });
      const feeCollected = Math.round((transaction.coverValue * transaction.feeRate) / 100);
      if (!transaction.feeCollectedAt) {
        transaction = await TradeTransaction.findOneAndUpdate(
          { _id: transaction._id, feeCollectedAt: { $exists: false } },
          { $set: { feeCollected, feeCollectedAt: new Date() } },
          { new: true, runValidators: true }
        );
        if (!transaction) transaction = await TradeTransaction.findById(delivery.transaction);
      }
      if (!transaction || !transaction.feeCollectedAt) throw new Error('Không thể cập nhật khoản phí giao dịch.');

      const creditAmount = book.aiAssessment
        ? calculateAssessmentCredits(book.aiAssessment) * (delivery.quantity || 1)
        : calculateAssessmentCredits({ estimatedPrice: book.salePrice ?? book.coverPrice, damageLevel: book.damageLevel || 'LOW' }) * (delivery.quantity || 1);
      if (creditAmount > 0 && !transaction.creditsAwardedAt) {
        const owner = await User.findById(book.owner).select('_id');
        if (!owner) throw new Error('Không tìm thấy người đăng để cộng điểm.');
        await User.updateOne(
          { _id: owner._id, bookCreditTransactions: { $ne: transaction._id } },
          { $inc: { bookCredits: creditAmount }, $addToSet: { bookCreditTransactions: transaction._id } }
        );
        await TradeTransaction.updateOne(
          { _id: transaction._id, creditsAwardedAt: { $exists: false } },
          { $set: { creditsAwarded: creditAmount, creditsAwardedAt: new Date() } }
        );
      }

      const completedDelivery = await Delivery.findOneAndUpdate(
        { _id: delivery._id, status: 'DELIVERED' },
        { $set: { status: 'COMPLETED', completedAt: new Date() } },
        { new: true }
      );
      if (!completedDelivery && delivery.status !== 'COMPLETED') {
        return res.status(409).json({ success: false, message: 'Đơn đã được admin khác xử lý.' });
      }
      transaction = await TradeTransaction.findById(transaction._id);
      const safeDelivery = delivery.toObject();
      delete safeDelivery.proofPath;
      return res.json({
        success: true,
        data: { delivery: safeDelivery, transaction },
        message: `Đã duyệt ảnh, ghi nhận ${feeCollected.toLocaleString('vi-VN')} đ phí duy trì và cộng ${transaction.creditsAwarded || 0} điểm cho người đăng theo giá trị AI và mức hư hại.`
      });
    } catch (error) {
      throw error;
    }
  } catch (error) {
    return next(error);
  }
};

exports.listBooks = async (req, res, next) => {
  try {
    const filter = {};
    if (['LOW', 'MEDIUM', 'HIGH'].includes(req.query.damageLevel)) {
      if (req.query.damageLevel === 'LOW') {
        filter.$or = [{ damageLevel: 'LOW' }, { damageLevel: { $exists: false } }];
      } else {
        filter.damageLevel = req.query.damageLevel;
      }
    }
    if (['AVAILABLE', 'TRADED', 'LOCKED_IN_LOOP', 'OUT_OF_STOCK'].includes(req.query.status)) {
      filter.status = req.query.status;
    }
    const books = await Book.find(filter)
      .populate('owner', 'name email')
      .sort({ createdAt: -1 })
      .limit(500)
      .lean();
    return res.json({ success: true, count: books.length, data: books });
  } catch (error) {
    return next(error);
  }
};

exports.listTransactions = async (req, res, next) => {
  try {
    const transactions = await TradeTransaction.find()
      .populate('book', 'title author')
      .populate('owner', 'name email')
      .populate('completedBy', 'name email')
      .sort({ completedAt: -1 })
      .limit(500)
      .lean();
    return res.json({ success: true, count: transactions.length, data: transactions });
  } catch (error) {
    return next(error);
  }
};
