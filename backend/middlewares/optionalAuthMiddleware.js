const jwt = require('jsonwebtoken');
const User = require('../models/User');

module.exports = async (req, res, next) => {
  const authorization = req.headers.authorization;
  if (!authorization) return next();
  if (!authorization.startsWith('Bearer ')) {
    return next();
  }
  if (!process.env.JWT_SECRET) return next();

  try {
    const payload = jwt.verify(authorization.slice(7), process.env.JWT_SECRET);
    req.user = await User.findById(payload.id);
    return next();
  } catch (error) {
    if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError') {
      return next();
    }
    return next(error);
  }
};
