module.exports = (req, res, next) => {
  if (!req.user || req.user.role !== 'COURIER') {
    return res.status(403).json({ success: false, message: 'Chỉ nhân viên vận chuyển mới có quyền thực hiện thao tác này.' });
  }
  return next();
};
