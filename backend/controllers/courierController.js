const fs = require('fs/promises');
const Book = require('../models/Book');
const Delivery = require('../models/Delivery');
const TradeTransaction = require('../models/TradeTransaction');

exports.listMyDeliveries = async (req, res, next) => {
  try {
    const deliveries = await Delivery.find({
      $or: [
        { courier: req.user._id },
        {
          status: 'PENDING_ASSIGNMENT',
          $or: [{ courier: null }, { courier: { $exists: false } }]
        }
      ]
    })
      .populate({ path: 'book', select: 'title author coverPrice status owner', populate: { path: 'owner', select: 'name phone' } })
      .populate('assignedBy', 'name')
      .sort({ createdAt: -1 })
      .limit(200)
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

exports.claimDelivery = async (req, res, next) => {
  try {
    const delivery = await Delivery.findOneAndUpdate(
      {
        _id: req.params.deliveryId,
        status: 'PENDING_ASSIGNMENT',
        $or: [{ courier: null }, { courier: { $exists: false } }]
      },
      { $set: { courier: req.user._id, status: 'ASSIGNED' } },
      { new: true, runValidators: true }
    );
    if (!delivery) {
      return res.status(409).json({ success: false, message: 'Đơn này đã được nhân viên khác nhận hoặc không còn khả dụng.' });
    }
    return res.json({ success: true, data: delivery, message: 'Bạn đã nhận đơn vận chuyển.' });
  } catch (error) {
    return next(error);
  }
};

exports.startDelivery = async (req, res, next) => {
  try {
    const delivery = await Delivery.findOneAndUpdate(
      { _id: req.params.deliveryId, courier: req.user._id, status: 'ASSIGNED' },
      { $set: { status: 'IN_TRANSIT' } },
      { new: true }
    );
    if (!delivery) return res.status(409).json({ success: false, message: 'Đơn không tồn tại hoặc không còn ở trạng thái chờ lấy hàng.' });
    return res.json({ success: true, data: delivery, message: 'Đã cập nhật trạng thái đang vận chuyển.' });
  } catch (error) {
    return next(error);
  }
};

exports.confirmDelivered = async (req, res, next) => {
  const uploadedFile = req.file;
  if (!uploadedFile) return res.status(400).json({ success: false, message: 'Vui lòng tải ảnh xác nhận giao hàng.' });

  let delivery;
  let transaction;
  let bookMarkedDelivered = false;
  try {
    const header = await fs.readFile(uploadedFile.path).then((content) => content.subarray(0, 12));
    const validImage = uploadedFile.mimetype === 'image/jpeg'
      ? header[0] === 0xff && header[1] === 0xd8 && header[2] === 0xff
      : uploadedFile.mimetype === 'image/png'
        ? header.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
        : header.toString('ascii', 0, 4) === 'RIFF' && header.toString('ascii', 8, 12) === 'WEBP';
    if (!validImage) {
      await fs.unlink(uploadedFile.path);
      return res.status(400).json({ success: false, message: 'Tệp không phải ảnh JPEG, PNG hoặc WebP hợp lệ.' });
    }

    const assignedDelivery = await Delivery.findOne({
      _id: req.params.deliveryId,
      courier: req.user._id,
      status: { $in: ['ASSIGNED', 'IN_TRANSIT'] }
    }).select('orderType');
    if (!assignedDelivery) {
      await fs.unlink(uploadedFile.path);
      return res.status(409).json({ success: false, message: 'Đơn không tồn tại, không thuộc về bạn hoặc đã được xác nhận.' });
    }
    if (assignedDelivery.orderType === 'PURCHASE' && req.body.codCollected !== 'true') {
      await fs.unlink(uploadedFile.path);
      return res.status(400).json({ success: false, message: 'Hãy xác nhận đã hoàn tất thanh toán COD trước khi gửi ảnh giao hàng.' });
    }

    delivery = await Delivery.findOneAndUpdate(
      { _id: req.params.deliveryId, courier: req.user._id, status: { $in: ['ASSIGNED', 'IN_TRANSIT'] } },
      {
        $set: {
          status: 'DELIVERED',
          proofPath: uploadedFile.path,
          proofMimeType: uploadedFile.mimetype,
          deliveredAt: new Date(),
          ...(assignedDelivery.orderType === 'PURCHASE' ? { codCollected: true, codCollectedAt: new Date() } : {})
        }
      },
      { new: true, runValidators: true }
    );
    if (!delivery) {
      await fs.unlink(uploadedFile.path);
      return res.status(409).json({ success: false, message: 'Đơn không tồn tại, không thuộc về bạn hoặc đã được xác nhận.' });
    }

    let book;
    if (delivery.orderType === 'PURCHASE') {
      const listing = await Book.findById(delivery.book).select('listingMode');
      book = listing?.listingMode === 'SALE'
        ? await Book.findOne({ _id: delivery.book, listingMode: 'SALE', status: { $in: ['AVAILABLE', 'OUT_OF_STOCK'] } })
        : await Book.findOneAndUpdate(
          { _id: delivery.book, status: 'LOCKED_IN_LOOP', type: 'OWNED' },
          { $set: { status: 'TRADED' } },
          { new: true, runValidators: true }
        );
    } else {
      book = await Book.findOneAndUpdate(
        { _id: delivery.book, status: 'LOCKED_IN_LOOP', type: 'OWNED' },
        { $set: { status: 'TRADED' } },
        { new: true, runValidators: true }
      );
    }
    if (!book) {
      const error = new Error('Trạng thái sách không còn khớp với đơn. Đơn đã được mở lại để thử xác nhận sau khi cập nhật.');
      error.statusCode = 409;
      throw error;
    }
    bookMarkedDelivered = true;

    transaction = await TradeTransaction.create({
      book: book._id,
      owner: book.owner,
      completedBy: req.user._id,
      delivery: delivery._id,
      coverValue: book.coverPrice * (delivery.quantity || 1),
      feeRate: book.maintenanceFeeRate || 2,
      feeCollected: 0
    });
    delivery.transaction = transaction._id;
    await delivery.save();

    return res.json({
      success: true,
      data: { id: delivery._id, status: delivery.status, deliveredAt: delivery.deliveredAt },
      message: 'Đã xác nhận giao sách và gửi ảnh bằng chứng cho admin duyệt phí.'
    });
  } catch (error) {
    if (transaction) await TradeTransaction.deleteOne({ _id: transaction._id });
    if (bookMarkedDelivered && delivery) {
      await Book.updateOne({ _id: delivery.book, status: 'TRADED' }, { $set: { status: 'LOCKED_IN_LOOP' } });
    }
    if (delivery) {
      await Delivery.updateOne(
        { _id: delivery._id, courier: req.user._id, status: 'DELIVERED' },
        { $set: { status: 'ASSIGNED' }, $unset: { proofPath: 1, proofMimeType: 1, deliveredAt: 1, transaction: 1 } }
      );
    }
    await fs.unlink(uploadedFile.path).catch((cleanupError) => {
      if (cleanupError.code !== 'ENOENT') console.error('Could not remove an unused delivery proof:', cleanupError);
    });
    if (error.statusCode) {
      return res.status(error.statusCode).json({ success: false, message: error.message });
    }
    return next(error);
  }
};

exports.getMyDeliveryProof = async (req, res, next) => {
  try {
    const delivery = await Delivery.findOne({ _id: req.params.deliveryId, courier: req.user._id }).select('proofPath proofMimeType');
    if (!delivery || !delivery.proofPath) return res.status(404).json({ success: false, message: 'Chưa có ảnh bằng chứng giao hàng.' });
    res.type(delivery.proofMimeType);
    return res.sendFile(delivery.proofPath, (error) => {
      if (error && !res.headersSent) next(error);
    });
  } catch (error) {
    return next(error);
  }
};
