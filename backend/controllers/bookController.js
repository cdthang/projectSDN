const Book = require('../models/Book');
const Delivery = require('../models/Delivery');
const User = require('../models/User');
const fs = require('fs/promises');
const path = require('path');
const jwt = require('jsonwebtoken');
const analyzeImage = require('../services/geminiService');
const { hashImage, imagePath, isValidImage } = require('../utils/bookImage');
const calculateCreditValue = require('../utils/creditCalculator');
const calculateAssessmentCredits = require('../utils/assessmentCreditCalculator');

const validTypes = ['OWNED', 'WISHLIST'];
const validListingModes = ['SALE', 'TRADE'];
const validConditions = ['NEW', 'LIKE_NEW', 'USED', 'OLD'];
const validDamageLevels = ['LOW', 'MEDIUM', 'HIGH'];
const maintenanceFeeRate = 2;
const calculateMaintenanceFee = (price, type) => type === 'OWNED'
  ? Math.round((price * maintenanceFeeRate) / 100)
  : 0;
const pointValue = 1000;
const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const presentBook = (book, includePrivate = false) => {
  const result = book.toObject ? book.toObject() : { ...book };
  const assessment = result.aiAssessment;
  delete result.imagePath;
  delete result.aiAssessment;
  if (!includePrivate) {
    delete result.maintenanceFee;
    delete result.maintenanceFeeRate;
  }
  result.listingMode = result.listingMode || 'TRADE';
  if (result.listingMode === 'SALE' && result.stockQuantity === undefined) result.stockQuantity = 1;
  result.salePrice = result.salePrice ?? result.coverPrice;
  const assessedCredits = assessment
    ? calculateAssessmentCredits(assessment)
    : calculateAssessmentCredits({ estimatedPrice: result.salePrice, damageLevel: result.damageLevel || 'LOW' });
  if (assessment) {
    if (includePrivate) {
      result.condition = assessment.condition;
      result.damageLevel = assessment.damageLevel;
      result.damageNotes = assessment.damageNotes;
    } else {
      delete result.condition;
      delete result.damageLevel;
      delete result.damageNotes;
    }
  }
  if (result.type === 'OWNED') {
    if (result.listingMode === 'TRADE') result.tradePoints = assessedCredits;
    if (includePrivate) result.creditValue = assessedCredits;
    else delete result.creditValue;
  }
  result.imageUrl = result.imageMimeType ? `/api/books/${result._id}/image` : '';
  return result;
};

exports.listBooks = async (req, res, next) => {
  try {
    const filter = { type: 'OWNED', status: 'AVAILABLE' };
    if (req.query.listingMode === 'SALE') {
      filter.listingMode = 'SALE';
      filter.stockQuantity = { $gt: 0 };
    } else if (req.query.listingMode === 'TRADE') {
      filter.$or = [{ listingMode: 'TRADE' }, { listingMode: { $exists: false } }];
    } else {
      filter.$or = [
        { listingMode: 'TRADE' },
        { listingMode: 'SALE', stockQuantity: { $gt: 0 } },
        { listingMode: { $exists: false } }
      ];
    }
    const search = typeof req.query.search === 'string' ? req.query.search.trim() : '';
    if (search) {
      const searchPattern = escapeRegex(search);
      const searchClause = {
        $or: [
          { title: { $regex: searchPattern, $options: 'i' } },
          { author: { $regex: searchPattern, $options: 'i' } }
        ]
      };
      if (filter.$or) {
        filter.$and = [{ $or: filter.$or }, searchClause];
        delete filter.$or;
      } else {
        filter.$or = searchClause.$or;
      }
    }

    const books = await Book.find(filter)
      .select('-__v -maintenanceFee -maintenanceFeeRate -imagePath')
      .populate('owner', 'name')
      .sort({ createdAt: -1 })
      .limit(100);
    return res.json({ success: true, count: books.length, data: books.map((book) => presentBook(book)) });
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
      filter.$and = [
        { type: 'OWNED', status: 'AVAILABLE' },
        {
          $or: [
            { listingMode: 'TRADE' },
            { listingMode: 'SALE', stockQuantity: { $gt: 0 } },
            { listingMode: { $exists: false } }
          ]
        }
      ];
    }

    const books = await Book.find(filter).sort({ createdAt: -1 }).lean();
    const canSeePrivate = isOwner || req.user?.role === 'ADMIN';
    return res.json({ success: true, count: books.length, data: books.map((book) => presentBook(book, canSeePrivate)) });
  } catch (error) {
    return next(error);
  }
};

exports.getBookById = async (req, res, next) => {
  try {
    const book = await Book.findById(req.params.id).populate('owner', 'name');
    if (!book) return res.status(404).json({ success: false, message: 'Không tìm thấy sách.' });
    const includePrivate = req.user && (
      req.user.role === 'ADMIN' || (book.owner && req.user._id.toString() === book.owner._id.toString())
    );
    return res.json({ success: true, data: presentBook(book, includePrivate) });
  } catch (error) {
    return next(error);
  }
};

exports.getBookImage = async (req, res, next) => {
  try {
    const book = await Book.findById(req.params.id).select('imagePath imageMimeType');
    if (!book || !book.imagePath) return res.status(404).json({ success: false, message: 'Sách chưa có ảnh.' });
    res.type(book.imageMimeType);
    return res.sendFile(book.imagePath, (error) => {
      if (error && !res.headersSent) next(error);
    });
  } catch (error) {
    return next(error);
  }
};

exports.analyzeBookImage = async (req, res, next) => {
  try {
    if (req.body.photoConsent !== 'true') {
      return res.status(400).json({ success: false, message: 'Cần đồng ý gửi ảnh và thông tin sách đến Gemini trước khi phân tích.' });
    }
    if (!req.file || !isValidImage(req.file.buffer, req.file.mimetype)) {
      return res.status(400).json({ success: false, message: 'Vui lòng tải ảnh JPEG, PNG hoặc WebP hợp lệ.' });
    }
    const { title, author = '', coverPrice } = req.body;
    const normalizedTitle = typeof title === 'string' ? title.trim() : '';
    const normalizedAuthor = typeof author === 'string' ? author.trim() : '';
    const price = Number(coverPrice);
    if (!normalizedTitle || !Number.isSafeInteger(price) || price < 0) {
      return res.status(400).json({ success: false, message: 'Vui lòng nhập tên sách và giá bìa hợp lệ trước khi phân tích.' });
    }
    if (!process.env.JWT_SECRET) return next(new Error('JWT_SECRET is not configured'));

    const assessment = await analyzeImage({
      image: req.file.buffer,
      mimeType: req.file.mimetype,
      title: normalizedTitle,
      author: normalizedAuthor,
      coverPrice: price
    });
    const analysisToken = jwt.sign({
      sub: req.user._id.toString(),
      imageHash: hashImage(req.file.buffer),
      title: normalizedTitle,
      author: normalizedAuthor,
      coverPrice: price,
      assessment
    }, process.env.JWT_SECRET, { expiresIn: '15m' });
    return res.json({ success: true, data: { assessment, analysisToken } });
  } catch (error) {
    if (error.statusCode) return res.status(error.statusCode).json({ success: false, message: error.message });
    return next(error);
  }
};

exports.createBook = async (req, res, next) => {
  let savedImagePath = '';
  try {
    const {
      title,
      author = '',
      summary = '',
      coverPrice,
      salePrice,
      listingMode = 'TRADE',
      stockQuantity = 1,
      condition = 'LIKE_NEW',
      damageLevel = 'LOW',
      damageNotes = '',
      type = 'OWNED'
    } = req.body;
    if (typeof title !== 'string' || !title.trim()) {
      return res.status(400).json({ success: false, message: 'Tên sách không được để trống.' });
    }
    if (!validTypes.includes(type)) {
      return res.status(400).json({ success: false, message: 'Loại sách không hợp lệ.' });
    }
    if (!validListingModes.includes(listingMode)) {
      return res.status(400).json({ success: false, message: 'Hình thức đăng sách không hợp lệ.' });
    }
    if (type === 'WISHLIST' && !validConditions.includes(condition)) {
      return res.status(400).json({ success: false, message: 'Tình trạng sách không hợp lệ.' });
    }
    if (type === 'WISHLIST' && !validDamageLevels.includes(damageLevel)) {
      return res.status(400).json({ success: false, message: 'Mức độ hư hại không hợp lệ.' });
    }
    const price = Number(coverPrice);
    if (!Number.isSafeInteger(price) || price < 0) {
      return res.status(400).json({ success: false, message: 'Giá bìa phải là số không âm.' });
    }

    let assessment;
    if (type === 'OWNED') {
      const sellingPrice = Number(salePrice);
      if (!Number.isSafeInteger(sellingPrice) || sellingPrice < 0) {
        return res.status(400).json({ success: false, message: 'Vui lòng nhập giá tiền mặt là số nguyên không âm.' });
      }
      if (listingMode === 'SALE') {
        const quantity = Number(stockQuantity);
        if (!Number.isSafeInteger(quantity) || quantity < 1 || quantity > 10000) {
          return res.status(400).json({ success: false, message: 'Số lượng bán phải từ 1 đến 10.000 cuốn.' });
        }
      }
      if (!req.file || !isValidImage(req.file.buffer, req.file.mimetype)) {
        return res.status(400).json({ success: false, message: 'Sách cần có ảnh JPEG, PNG hoặc WebP hợp lệ để AI đánh giá.' });
      }
      if (!process.env.JWT_SECRET) return next(new Error('JWT_SECRET is not configured'));
      let verified;
      try {
        verified = jwt.verify(req.body.analysisToken, process.env.JWT_SECRET);
      } catch {
        return res.status(400).json({ success: false, message: 'Vui lòng phân tích lại ảnh sách trước khi đăng.' });
      }
      if (
        verified.sub !== req.user._id.toString() ||
        verified.imageHash !== hashImage(req.file.buffer) ||
        verified.title !== title.trim() ||
        verified.author !== (typeof author === 'string' ? author.trim() : '') ||
        verified.coverPrice !== price ||
        !verified.assessment
      ) {
        return res.status(400).json({ success: false, message: 'Thông tin hoặc ảnh đã thay đổi. Vui lòng phân tích lại ảnh sách.' });
      }
      assessment = verified.assessment;
      savedImagePath = imagePath(path.join(__dirname, '..', 'uploads', 'books'), req.file.mimetype);
      await fs.mkdir(path.dirname(savedImagePath), { recursive: true });
      await fs.writeFile(savedImagePath, req.file.buffer, { flag: 'wx' });
    } else if (req.file || req.body.analysisToken) {
      return res.status(400).json({ success: false, message: 'Ảnh AI chỉ áp dụng cho sách đang đăng.' });
    }

    const book = await Book.create({
      owner: req.user._id,
      title: title.trim(),
      author: typeof author === 'string' ? author.trim() : '',
      summary: typeof summary === 'string' ? summary.trim() : '',
      coverPrice: price,
      ...(type === 'OWNED' ? {
        listingMode,
        salePrice: Number(salePrice),
        stockQuantity: listingMode === 'SALE' ? Number(stockQuantity) : 1
      } : {}),
      ...(assessment ? { aiAssessment: assessment } : {}),
      ...(savedImagePath ? { imagePath: savedImagePath, imageMimeType: req.file.mimetype } : {}),
      maintenanceFee: calculateMaintenanceFee(price, type),
      maintenanceFeeRate: maintenanceFeeRate,
      condition: assessment?.condition || condition,
      damageLevel: assessment?.damageLevel || damageLevel,
      damageNotes: assessment?.damageNotes || (typeof damageNotes === 'string' ? damageNotes.trim() : ''),
      creditValue: assessment ? calculateAssessmentCredits(assessment) : calculateCreditValue(price, condition),
      type
    });
    return res.status(201).json({ success: true, data: presentBook(book, true) });
  } catch (error) {
    if (savedImagePath) {
      await fs.unlink(savedImagePath).catch((cleanupError) => {
        if (cleanupError.code !== 'ENOENT') console.error('Could not remove an unused book image:', cleanupError);
      });
    }
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

    const { title, author, summary, coverPrice, condition, damageLevel, damageNotes, type } = req.body;
    if (title !== undefined) {
      if (typeof title !== 'string' || !title.trim()) {
        return res.status(400).json({ success: false, message: 'Tên sách không được để trống.' });
      }
      book.title = title.trim();
    }
    if (author !== undefined) book.author = typeof author === 'string' ? author.trim() : '';
    if (summary !== undefined) book.summary = typeof summary === 'string' ? summary.trim() : '';
    if (damageNotes !== undefined) book.damageNotes = typeof damageNotes === 'string' ? damageNotes.trim() : '';
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
    if (damageLevel !== undefined) {
      if (!validDamageLevels.includes(damageLevel)) {
        return res.status(400).json({ success: false, message: 'Mức độ hư hại không hợp lệ.' });
      }
      book.damageLevel = damageLevel;
    }
    if (req.body.status !== undefined) {
      return res.status(403).json({ success: false, message: 'Chỉ quản trị viên mới có thể thay đổi trạng thái sách.' });
    }
    book.creditValue = calculateCreditValue(book.coverPrice, condition || book.condition);
    book.maintenanceFee = calculateMaintenanceFee(book.coverPrice, book.type);

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
    const book = await Book.findByIdAndDelete(req.params.id);
    if (!book) return res.status(404).json({ success: false, message: 'Không tìm thấy sách.' });
    return res.json({ success: true, message: 'Đã xóa sách khỏi tủ của bạn.' });
  } catch (error) {
    return next(error);
  }
};

exports.createBookOrder = async (req, res, next) => {
  try {
    const { recipientName, recipientPhone, address } = req.body;
    const pointsUsed = Number(req.body.pointsUsed ?? 0);
    const quantity = Number(req.body.quantity ?? 1);
    if (![recipientName, recipientPhone, address].every((value) => typeof value === 'string' && value.trim())) {
      return res.status(400).json({ success: false, message: 'Vui lòng nhập tên, số điện thoại và địa chỉ nhận sách.' });
    }
    if (!/^\+?[0-9\s()-]{8,20}$/.test(recipientPhone.trim())) {
      return res.status(400).json({ success: false, message: 'Số điện thoại người nhận không hợp lệ.' });
    }
    if (!Number.isSafeInteger(pointsUsed) || pointsUsed < 0) {
      return res.status(400).json({ success: false, message: 'Số điểm cần dùng phải là số nguyên không âm.' });
    }
    if (!Number.isSafeInteger(quantity) || quantity < 1 || quantity > 10000) {
      return res.status(400).json({ success: false, message: 'Số lượng mua phải từ 1 đến 10.000 cuốn.' });
    }
    if (req.user.role !== 'USER') {
      return res.status(403).json({ success: false, message: 'Chỉ tài khoản người dùng mới có thể đặt mua sách.' });
    }

    const listing = await Book.findOne({
      _id: req.params.id,
      owner: { $ne: req.user._id },
      type: 'OWNED',
      status: 'AVAILABLE'
    }).select('listingMode stockQuantity');
    if (!listing) {
      return res.status(409).json({ success: false, message: 'Sách không còn sẵn sàng hoặc bạn không thể tự mua sách của mình.' });
    }

    const isSaleListing = listing.listingMode === 'SALE';
    const checkoutMethod = req.body.paymentMethod;
    if (!isSaleListing && quantity !== 1) {
      return res.status(400).json({ success: false, message: 'Sách trao đổi chỉ có một cuốn trong tin đăng.' });
    }
    if (!isSaleListing && !['POINTS', 'CASH'].includes(checkoutMethod)) {
      return res.status(400).json({ success: false, message: 'Hãy chọn thanh toán bằng điểm hoặc tiền mặt.' });
    }
    const book = isSaleListing
      ? await Book.findOneAndUpdate(
        {
          _id: req.params.id,
          owner: { $ne: req.user._id },
          type: 'OWNED',
          listingMode: 'SALE',
          status: 'AVAILABLE',
          stockQuantity: { $gte: quantity }
        },
        [{
          $set: {
            stockQuantity: { $subtract: ['$stockQuantity', quantity] },
            status: {
              $cond: [
                { $eq: [{ $subtract: ['$stockQuantity', quantity] }, 0] },
                'OUT_OF_STOCK',
                'AVAILABLE'
              ]
            }
          }
        }],
        { new: true, runValidators: true }
      )
      : await Book.findOneAndUpdate(
        {
          _id: req.params.id,
          owner: { $ne: req.user._id },
          type: 'OWNED',
          status: 'AVAILABLE',
          $or: [{ listingMode: 'TRADE' }, { listingMode: { $exists: false } }]
        },
        { $set: { status: 'LOCKED_IN_LOOP' } },
        { new: true, runValidators: true }
      );
    if (!book) return res.status(409).json({ success: false, message: 'Sách đã hết số lượng, không còn sẵn sàng hoặc bạn không thể tự mua sách của mình.' });

    const salePrice = book.salePrice ?? book.coverPrice;
    const totalPrice = salePrice * quantity;
    const restoreStock = async () => {
      if (isSaleListing) {
        await Book.updateOne(
          { _id: book._id },
          [{ $set: {
            stockQuantity: { $add: [{ $ifNull: ['$stockQuantity', 0] }, quantity] },
            status: 'AVAILABLE'
          } }]
        );
      } else {
        await Book.updateOne({ _id: book._id, status: 'LOCKED_IN_LOOP' }, { $set: { status: 'AVAILABLE' } });
      }
    };
    const assessedPoints = calculateAssessmentCredits(book.aiAssessment || {
      estimatedPrice: salePrice,
      damageLevel: book.damageLevel
    });
    if (!isSaleListing && checkoutMethod === 'POINTS' && assessedPoints < 1) {
      await restoreStock();
      return res.status(400).json({ success: false, message: 'Giá trị điểm của sách quá thấp; vui lòng chọn thanh toán tiền mặt.' });
    }
    if (!isSaleListing && checkoutMethod === 'POINTS' && pointsUsed !== assessedPoints) {
      await restoreStock();
      return res.status(400).json({ success: false, message: `Đơn này cần đúng ${assessedPoints} điểm theo giá trị và tình trạng sách.` });
    }
    if (!isSaleListing && checkoutMethod === 'CASH' && pointsUsed !== 0) {
      await restoreStock();
      return res.status(400).json({ success: false, message: 'Đơn thanh toán tiền mặt không sử dụng điểm.' });
    }
    const pointsValueLimit = isSaleListing ? totalPrice : checkoutMethod === 'POINTS' ? assessedPoints * pointValue : 0;
    if (pointsUsed * pointValue > pointsValueLimit) {
      await restoreStock();
      return res.status(400).json({ success: false, message: 'Số điểm dùng không được vượt quá tổng giá trị đơn hàng.' });
    }

    let creditsDebited = false;
    try {
      if (pointsUsed > 0) {
        const debit = await User.updateOne(
          { _id: req.user._id, bookCredits: { $gte: pointsUsed } },
          { $inc: { bookCredits: -pointsUsed } }
        );
        if (!debit.modifiedCount) {
          await restoreStock();
          return res.status(409).json({ success: false, message: 'Bạn không có đủ điểm để đặt sách này.' });
        }
        creditsDebited = true;
      }

      const delivery = await Delivery.create({
        book: book._id,
        buyer: req.user._id,
        orderType: 'PURCHASE',
        salePrice,
        quantity,
        paymentMethod: isSaleListing ? 'MIXED' : checkoutMethod,
        pointsUsed,
        cashToCollect: isSaleListing ? totalPrice - pointsUsed * pointValue : checkoutMethod === 'CASH' ? totalPrice : 0,
        status: 'PENDING_ASSIGNMENT',
        recipientName: recipientName.trim(),
        recipientPhone: recipientPhone.trim(),
        address: address.trim()
      });
      return res.status(201).json({
        success: true,
        data: {
          id: delivery._id,
          status: delivery.status,
          salePrice: delivery.salePrice,
          quantity: delivery.quantity,
          pointsUsed: delivery.pointsUsed,
          cashToCollect: delivery.cashToCollect
        },
        message: 'Đã nhận đơn mua sách. Nhân viên vận chuyển sẽ chọn nhận đơn.'
      });
    } catch (error) {
      if (creditsDebited) {
        await User.updateOne({ _id: req.user._id }, { $inc: { bookCredits: pointsUsed } });
      }
      await restoreStock();
      if (error.code === 11000) return res.status(409).json({ success: false, message: 'Sách này đã có đơn mua.' });
      throw error;
    }
  } catch (error) {
    return next(error);
  }
};

exports.getMyOrder = async (req, res, next) => {
  try {
    const order = await Delivery.findOne({
      _id: req.params.orderId,
      buyer: req.user._id,
      orderType: 'PURCHASE'
    }).populate('book', 'title author');
    if (!order) return res.status(404).json({ success: false, message: 'Không tìm thấy đơn hàng.' });
    const safeOrder = order.toObject();
    delete safeOrder.proofPath;
    delete safeOrder.proofMimeType;
    return res.json({ success: true, data: safeOrder });
  } catch (error) {
    return next(error);
  }
};

exports.listMyOrders = async (req, res, next) => {
  try {
    const orders = await Delivery.find({ buyer: req.user._id, orderType: 'PURCHASE' })
      .populate('book', 'title author salePrice coverPrice imageMimeType')
      .sort({ createdAt: -1 })
      .limit(100)
      .lean();
    return res.json({
      success: true,
      count: orders.length,
      data: orders.map(({ proofPath, proofMimeType, ...order }) => ({
        ...order,
        book: order.book ? {
          ...order.book,
          salePrice: order.book.salePrice ?? order.book.coverPrice,
          imageUrl: order.book.imageMimeType ? `/api/books/${order.book._id}/image` : ''
        } : null
      }))
    });
  } catch (error) {
    return next(error);
  }
};
