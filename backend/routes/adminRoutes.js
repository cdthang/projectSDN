const express = require('express');
const authMiddleware = require('../middlewares/authMiddleware');
const adminMiddleware = require('../middlewares/adminMiddleware');
const {
  getDashboard,
  listUsers,
  listBooks,
  listTransactions,
  listCouriers,
  createCourier,
  listDeliveries,
  createDelivery,
  assignCourier,
  getDeliveryProof,
  collectDeliveryFee
} = require('../controllers/adminController');

const router = express.Router();

router.use(authMiddleware, adminMiddleware);
router.get('/dashboard', getDashboard);
router.get('/users', listUsers);
router.get('/couriers', listCouriers);
router.post('/couriers', createCourier);
router.get('/books', listBooks);
router.get('/transactions', listTransactions);
router.get('/deliveries', listDeliveries);
router.post('/deliveries', createDelivery);
router.post('/deliveries/:deliveryId/assign', assignCourier);
router.get('/deliveries/:deliveryId/proof', getDeliveryProof);
router.post('/deliveries/:deliveryId/collect-fee', collectDeliveryFee);

module.exports = router;
