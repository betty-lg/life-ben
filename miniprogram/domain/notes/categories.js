const CATEGORIES = ['美食', '美容', '学习'];

const FOOD_TAGS = [
  '面条',
  '甜汤',
  '咸汤',
  '馒头',
  '甜点',
  '蛋糕',
  '家常菜',
  '拿手菜',
  '春生',
  '夏长',
  '秋收',
  '冬藏',
];

const LEARN_TAGS = ['口才', '英语', 'Idea'];

const LEARN_TAG_ICON = {
  口才: '🎤',
  英语: '🇬🇧',
  Idea: '💡',
};

const CATEGORY_META = {
  美食: {
    listFields: ['image', 'title', 'intro'],
    detailFields: ['image', 'title', 'intro', 'materials', 'steps', 'tips', 'reviews'],
    editFields: ['title', 'image', 'intro', 'tags', 'materials', 'steps', 'tips'],
  },
  美容: {
    listFields: ['title', 'intro'],
    detailFields: ['title', 'materials', 'steps', 'tips'],
    editFields: ['title', 'intro', 'materials', 'steps', 'tips'],
  },
  学习: {
    listFields: ['summary'],
    detailFields: ['title', 'body', 'tags'],
    editFields: ['title', 'body', 'tags'],
  },
};

function isValidCategory(c) {
  return CATEGORIES.includes(c);
}

module.exports = {
  CATEGORIES,
  FOOD_TAGS,
  LEARN_TAGS,
  LEARN_TAG_ICON,
  CATEGORY_META,
  isValidCategory,
};
