const multer = require('multer');

const mimeExtensions = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp'
};

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024, files: 1 },
  fileFilter: (req, file, callback) => {
    if (!mimeExtensions[file.mimetype]) {
      return callback(new Error('Chỉ chấp nhận ảnh JPEG, PNG hoặc WebP.'));
    }
    return callback(null, true);
  }
});

module.exports = (req, res, next) => {
  upload.single('image')(req, res, (error) => {
    if (!error) return next();
    if (error instanceof multer.MulterError && error.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ success: false, message: 'Ảnh sách không được lớn hơn 5 MB.' });
    }
    if (error.message === 'Chỉ chấp nhận ảnh JPEG, PNG hoặc WebP.') {
      return res.status(400).json({ success: false, message: error.message });
    }
    return next(error);
  });
};
