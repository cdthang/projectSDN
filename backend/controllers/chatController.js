const mongoose = require('mongoose');
const Book = require('../models/Book');
const Conversation = require('../models/Conversation');
const Delivery = require('../models/Delivery');
const Message = require('../models/Message');
const User = require('../models/User');

const idOf = (value) => String(value?._id || value);
const isMember = (conversation, userId) => conversation.participants.some((id) => idOf(id) === idOf(userId));

async function findSharedDelivery(first, second) {
  const involvedBookIds = await Book.find({ owner: first._id }).distinct('_id');
  const deliveries = await Delivery.find({
    $or: [{ buyer: first._id }, { courier: first._id }, { book: { $in: involvedBookIds } }]
  }).populate('book', 'owner').limit(1000);
  return deliveries.some((delivery) => {
    const userIds = [delivery.buyer, delivery.book?.owner].filter(Boolean).map(idOf);
    if (first.role === 'COURIER' || second.role === 'COURIER') {
      const courier = first.role === 'COURIER' ? first : second;
      const user = first.role === 'USER' ? first : second;
      return idOf(delivery.courier) === idOf(courier._id) && userIds.includes(idOf(user._id));
    }
    return userIds.includes(idOf(first._id)) && userIds.includes(idOf(second._id));
  });
}

async function authorizeConversation(user, conversationId) {
  if (!mongoose.isValidObjectId(conversationId)) return null;
  const conversation = await Conversation.findById(conversationId);
  return conversation && isMember(conversation, user._id) ? conversation : null;
}

exports.listContacts = async (req, res, next) => {
  try {
    if (req.user.role === 'ADMIN') {
      const contacts = await User.find({ _id: { $ne: req.user._id }, role: { $in: ['USER', 'COURIER'] }, isActive: { $ne: false } })
        .select('name email role')
        .sort({ name: 1 })
        .lean();
      return res.json({ success: true, data: contacts });
    }

    const ownBooks = await Book.find({ owner: req.user._id }).distinct('_id');
    const deliveries = await Delivery.find({
      $or: [{ buyer: req.user._id }, { courier: req.user._id }, { book: { $in: ownBooks } }]
    }).populate('book', 'owner').limit(1000);
    const ids = new Set();
    for (const delivery of deliveries) {
      [delivery.buyer, delivery.courier, delivery.book?.owner].filter(Boolean).forEach((id) => {
        if (idOf(id) !== idOf(req.user._id)) ids.add(idOf(id));
      });
    }
    const contacts = await User.find({ _id: { $in: [...ids] }, isActive: { $ne: false }, role: { $in: ['USER', 'COURIER'] } })
      .select('name email role')
      .sort({ name: 1 })
      .lean();
    return res.json({ success: true, data: contacts });
  } catch (error) {
    return next(error);
  }
};

exports.listConversations = async (req, res, next) => {
  try {
    const conversations = await Conversation.find({ participants: req.user._id })
      .populate('participants', 'name email role')
      .populate({ path: 'lastMessage', populate: { path: 'sender', select: 'name' } })
      .sort({ updatedAt: -1 })
      .limit(100)
      .lean();
    return res.json({ success: true, data: conversations });
  } catch (error) {
    return next(error);
  }
};

exports.openConversation = async (req, res, next) => {
  try {
    const { recipientId } = req.body;
    if (!mongoose.isValidObjectId(recipientId) || idOf(recipientId) === idOf(req.user._id)) {
      return res.status(400).json({ success: false, message: 'Người nhận không hợp lệ.' });
    }
    const recipient = await User.findById(recipientId).select('name email role isActive');
    if (!recipient || recipient.isActive === false || !['USER', 'COURIER'].includes(recipient.role)) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy người nhận đang hoạt động.' });
    }
    if (req.user.role !== 'ADMIN') {
      if (!['USER', 'COURIER'].includes(req.user.role) || !await findSharedDelivery(req.user, recipient)) {
        return res.status(403).json({ success: false, message: 'Chỉ có thể nhắn tin với người liên quan đến đơn vận chuyển của bạn.' });
      }
    }
    let conversation = await Conversation.findOne({ participants: { $all: [req.user._id, recipient._id], $size: 2 } });
    if (!conversation) {
      conversation = await Conversation.create({ participants: [req.user._id, recipient._id] });
    }
    await conversation.populate('participants', 'name email role');
    return res.status(200).json({ success: true, data: conversation });
  } catch (error) {
    return next(error);
  }
};

exports.listMessages = async (req, res, next) => {
  try {
    const conversation = await authorizeConversation(req.user, req.params.conversationId);
    if (!conversation) return res.status(404).json({ success: false, message: 'Không tìm thấy cuộc trò chuyện.' });
    const messages = await Message.find({ conversation: conversation._id })
      .populate('sender', 'name role')
      .sort({ createdAt: -1 })
      .limit(200)
      .lean();
    return res.json({ success: true, data: messages.reverse() });
  } catch (error) {
    return next(error);
  }
};

exports.saveMessage = async (req, res, next) => {
  try {
    const conversation = await authorizeConversation(req.user, req.params.conversationId);
    if (!conversation) return res.status(404).json({ success: false, message: 'Không tìm thấy cuộc trò chuyện.' });
    if (typeof req.body.text !== 'string' || !req.body.text.trim() || req.body.text.trim().length > 2000) {
      return res.status(400).json({ success: false, message: 'Tin nhắn cần có từ 1 đến 2.000 ký tự.' });
    }
    const message = await Message.create({
      conversation: conversation._id,
      sender: req.user._id,
      text: req.body.text.trim()
    });
    conversation.lastMessage = message._id;
    await conversation.save();
    await message.populate('sender', 'name role');
    const result = message.toObject();
    req.app.get('io')?.to(idOf(conversation._id)).emit('chat:new-message', result);
    return res.status(201).json({ success: true, data: result });
  } catch (error) {
    return next(error);
  }
};

exports.authorizeConversation = authorizeConversation;
