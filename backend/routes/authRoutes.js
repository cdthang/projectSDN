const express = require('express');
const { register, login, adminLogin, courierLogin, getMe } = require('../controllers/authController');
const authMiddleware = require('../middlewares/authMiddleware');

const router = express.Router();

router.post('/register', register);
router.post('/login', login);
router.post('/admin/login', adminLogin);
router.post('/courier/login', courierLogin);
router.get('/me', authMiddleware, getMe);

module.exports = router;