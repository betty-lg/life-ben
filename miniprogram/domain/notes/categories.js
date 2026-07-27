const CATEGORIES = ['美食', '美容', '健身', '存款', '学习'];

function isValidCategory(c) {
  return CATEGORIES.includes(c);
}

module.exports = {
  CATEGORIES,
  isValidCategory,
};
