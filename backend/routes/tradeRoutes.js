const express = require('express');
const router = express.Router();
const { findTradeLoops } = require('../controllers/tradeController');
const authMiddleware = require('../middlewares/authMiddleware');

router.get('/find-loops', authMiddleware, findTradeLoops);
router.get('/find-loops/:userId', authMiddleware, findTradeLoops);

module.exports = router;