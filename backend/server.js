const express = require('express');
const http = require('http');
const cors = require('cors');
const dotenv = require('dotenv');
const morgan = require('morgan');
const connectDB = require('./config/db');
const mongoose = require('mongoose');
const Delivery = require('./models/Delivery');
const TradeTransaction = require('./models/TradeTransaction');
const jwt = require('jsonwebtoken');
const { Server } = require('socket.io');
const User = require('./models/User');
const Message = require('./models/Message');
const Conversation = require('./models/Conversation');
const { authorizeConversation } = require('./controllers/chatController');

dotenv.config();

const app = express();
const httpServer = http.createServer(app);
const io = new Server(httpServer, {
  cors: { origin: process.env.FRONTEND_URL || 'http://localhost:5173' }
});
app.set('io', io);

io.use(async (socket, next) => {
  try {
    if (!process.env.JWT_SECRET) throw new Error('JWT_SECRET is not configured');
    const token = socket.handshake.auth?.token;
    if (typeof token !== 'string' || !token) return next(new Error('Vui lòng đăng nhập để kết nối chat.'));
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(payload.id).select('name role isActive');
    if (!user || user.isActive === false) return next(new Error('Tài khoản không còn quyền truy cập.'));
    socket.data.user = user;
    return next();
  } catch (error) {
    return next(new Error(error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError'
      ? 'Phiên đăng nhập không hợp lệ hoặc đã hết hạn.'
      : error.message));
  }
});

io.on('connection', (socket) => {
  socket.on('chat:join', async (conversationId, callback = () => {}) => {
    try {
      const conversation = await authorizeConversation(socket.data.user, conversationId);
      if (!conversation) return callback({ success: false, message: 'Không có quyền vào cuộc trò chuyện này.' });
      await socket.join(String(conversation._id));
      return callback({ success: true });
    } catch (error) {
      console.error('Could not join chat room:', error);
      return callback({ success: false, message: 'Không thể tham gia cuộc trò chuyện.' });
    }
  });

  socket.on('chat:send', async ({ conversationId, text } = {}, callback = () => {}) => {
    try {
      const conversation = await authorizeConversation(socket.data.user, conversationId);
      if (!conversation) return callback({ success: false, message: 'Không có quyền gửi tin trong cuộc trò chuyện này.' });
      if (typeof text !== 'string' || !text.trim() || text.trim().length > 2000) {
        return callback({ success: false, message: 'Tin nhắn cần có từ 1 đến 2.000 ký tự.' });
      }
      const message = await Message.create({
        conversation: conversation._id,
        sender: socket.data.user._id,
        text: text.trim()
      });
      conversation.lastMessage = message._id;
      await conversation.save();
      await message.populate('sender', 'name role');
      const result = message.toObject();
      io.to(String(conversation._id)).emit('chat:new-message', result);
      return callback({ success: true, data: result });
    } catch (error) {
      console.error('Could not send chat message:', error);
      return callback({ success: false, message: 'Không thể gửi tin nhắn.' });
    }
  });

  socket.on('call:signal', async ({ conversationId, signal } = {}) => {
    try {
      const conversation = await authorizeConversation(socket.data.user, conversationId);
      if (!conversation || !signal || !['offer', 'answer', 'ice-candidate', 'end'].includes(signal.type)) return;
      socket.to(String(conversation._id)).emit('call:signal', {
        conversationId: String(conversation._id),
        from: String(socket.data.user._id),
        signal
      });
    } catch (error) {
      console.error('Could not relay call signal:', error);
      socket.emit('chat:error', { message: 'Không thể chuyển tín hiệu cuộc gọi.' });
    }
  });
});

app.use(cors({ origin: process.env.FRONTEND_URL || 'http://localhost:5173' }));
app.use(express.json());
app.use(morgan('dev'));

// API Routes
app.get('/api/health', (req, res) => res.json({ success: true, message: 'BookSwap API is running.' }));
app.use('/api/auth', require('./routes/authRoutes'));
app.use('/api/chat', require('./routes/chatRoutes'));
app.use('/api/admin', require('./routes/adminRoutes'));
app.use('/api/courier', require('./routes/courierRoutes'));
app.use('/api/trades', require('./routes/tradeRoutes'));
app.use('/api/books', require('./routes/bookRoutes'));

app.use((req, res) => res.status(404).json({ success: false, message: 'Không tìm thấy đường dẫn API.' }));
app.use((error, req, res, next) => {
  console.error(error);
  if (res.headersSent) return next(error);
  return res.status(500).json({ success: false, message: 'Đã xảy ra lỗi máy chủ.' });
});

const PORT = process.env.PORT || 5000;
const removeLegacyUniqueBookIndexes = async () => {
  for (const model of [Delivery, TradeTransaction]) {
    const collectionExists = await mongoose.connection.db
      .listCollections({ name: model.collection.collectionName }, { nameOnly: true })
      .hasNext();
    if (!collectionExists) continue;
    const indexes = await model.collection.indexes();
    for (const index of indexes) {
      if (index.unique && index.key.book === 1) {
        await model.collection.dropIndex(index.name);
        console.log(`Removed legacy unique index ${model.collection.collectionName}.${index.name}`);
      }
    }
  }
};

connectDB().then(async () => {
  await removeLegacyUniqueBookIndexes();
  httpServer.listen(PORT, () => console.log(`Server running on port ${PORT}`));
});