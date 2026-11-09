const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const express = require('express');
const multer = require('multer');
const authMiddleware = require('../middlewares/authMiddleware');
const courierMiddleware = require('../middlewares/courierMiddleware');
const {
  listMyDeliveries,
  claimDelivery,
  startDelivery,
  confirmDelivered,
  getMyDeliveryProof
} = require('../controllers/courierController');

const proofDirectory = path.join(__dirname, '..', 'uploads', 'delivery-proofs');
fs.mkdirSync(proofDirectory, { recursive: true });

const mimeExtensions = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp'
};

const upload = multer({
  storage: multer.diskStorage({
    destination: proofDirectory,
    filename: (req, file, callback) => callback(null, `${crypto.randomUUID()}${mimeExtensions[file.mimetype] || ''}`)
  }),
  limits: { fileSize: 5 * 1024 * 1024, files: 1 },
  fileFilter: (req, file, callback) => {
    if (!mimeExtensions[file.mimetype]) {
      return callback(new Error('Chỉ chấp nhận ảnh JPEG, PNG hoặc WebP.'));
    }
    return callback(null, true);
  }
});

const handleUploadError = (error, req, res, next) => {
  if (!error) return next();
  if (error instanceof multer.MulterError && error.code === 'LIMIT_FILE_SIZE') {
    return res.status(400).json({ success: false, message: 'Ảnh bằng chứng không được lớn hơn 5 MB.' });
  }
  if (error.message === 'Chỉ chấp nhận ảnh JPEG, PNG hoặc WebP.') {
    return res.status(400).json({ success: false, message: error.message });
  }
  return next(error);
};

const uploadProof = (req, res, next) => {
  upload.single('proof')(req, res, (error) => {
    if (error) return handleUploadError(error, req, res, next);
    return next();
  });
};

const router = express.Router();

router.use(authMiddleware, courierMiddleware);
router.get('/deliveries', listMyDeliveries);
router.post('/deliveries/:deliveryId/claim', claimDelivery);
router.post('/deliveries/:deliveryId/start', startDelivery);
router.post('/deliveries/:deliveryId/proof', uploadProof, confirmDelivered);
router.get('/deliveries/:deliveryId/proof', getMyDeliveryProof);

module.exports = router;
