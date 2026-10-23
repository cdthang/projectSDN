const express = require('express');
const authMiddleware = require('../middlewares/authMiddleware');
const {
  listBooks,
  getUserBooks,
  createBook,
  updateBook,
  deleteBook
} = require('../controllers/bookController');

const router = express.Router();

router.get('/', listBooks);
router.get('/user/:userId', authMiddleware, getUserBooks);
router.post('/', authMiddleware, createBook);
router.patch('/:id', authMiddleware, updateBook);
router.delete('/:id', authMiddleware, deleteBook);

module.exports = router;