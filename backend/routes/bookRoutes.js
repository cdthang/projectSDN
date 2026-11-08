const express = require('express');
const authMiddleware = require('../middlewares/authMiddleware');
const optionalAuthMiddleware = require('../middlewares/optionalAuthMiddleware');
const adminMiddleware = require('../middlewares/adminMiddleware');
const bookImageUpload = require('../middlewares/bookImageUpload');
const {
  listBooks,
  getUserBooks,
  getBookById,
  getBookImage,
  analyzeBookImage,
  createBook,
  updateBook,
  deleteBook,
  createBookOrder,
  listMyOrders,
  getMyOrder
} = require('../controllers/bookController');

const router = express.Router();

router.get('/', listBooks);
router.get('/orders/mine', authMiddleware, listMyOrders);
router.get('/orders/:orderId', authMiddleware, getMyOrder);
router.post('/analyze', authMiddleware, bookImageUpload, analyzeBookImage);
router.get('/user/:userId', authMiddleware, getUserBooks);
router.get('/:id/image', getBookImage);
router.get('/:id', optionalAuthMiddleware, getBookById);
router.post('/:id/orders', authMiddleware, createBookOrder);
router.post('/', authMiddleware, bookImageUpload, createBook);
router.patch('/:id', authMiddleware, updateBook);
router.delete('/:id', authMiddleware, adminMiddleware, deleteBook);

module.exports = router;