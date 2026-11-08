module.exports = (req, res, next) => {
  if (!req.user || req.user.role !== 'ADMIN') {
    return res.status(403).json({ success: false, message: 'Chỉ quản trị viên mới có quyền thực hiện thao tác này.' });
  }
  return next();
};
