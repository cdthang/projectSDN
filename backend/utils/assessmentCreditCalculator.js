const damageMultipliers = {
  LOW: 1,
  MEDIUM: 0.75,
  HIGH: 0.5
};

module.exports = (assessment) => {
  if (!assessment || !Number.isFinite(assessment.estimatedPrice) || assessment.estimatedPrice < 0) {
    return 0;
  }
  const multiplier = damageMultipliers[assessment.damageLevel];
  if (multiplier === undefined) return 0;
  return Math.floor((assessment.estimatedPrice * multiplier) / 1000);
};
