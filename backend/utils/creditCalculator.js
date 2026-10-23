const conditionMultipliers = {
  NEW: 1,
  LIKE_NEW: 0.9,
  USED: 0.7,
  OLD: 0.5
};

module.exports = (coverPrice, condition) => {
  const multiplier = conditionMultipliers[condition];
  if (!Number.isFinite(coverPrice) || coverPrice < 0 || multiplier === undefined) {
    throw new Error('Giá bìa hoặc tình trạng sách không hợp lệ.');
  }
  return Math.max(1, Math.round((coverPrice / 100000) * multiplier));
};