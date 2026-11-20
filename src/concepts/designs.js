const palettes = [
  ['sunrise', '晴空金', '品牌横幅', 'split', 'reels', 'cards', 'hero links ranking notice', '#fff9ed', '#14264b', '#ffdc6e', '#2755e8', '#fff4b1'],
  ['mint', '薄荷电蓝', '评分面板', 'score', 'orbit', 'table', 'hero ranking links notice', '#edfdf7', '#073c35', '#93f2d1', '#1252d7', '#d0ff72'],
  ['coral', '日落珊瑚', '公告先读', 'stack', 'prism', 'rows', 'notice hero ranking links', '#fff6f2', '#4b1930', '#ffb4a5', '#aa204e', '#ffe17c'],
  ['lemon', '柠檬钴蓝', '平台榜置顶', 'compact', 'reels', 'table', 'ranking hero links notice', '#f3f7ff', '#13265a', '#fff074', '#2346dc', '#cde2ff'],
  ['lilac', '紫晶云朵', '居中大标题', 'center', 'orbit', 'carousel', 'hero ranking notice links', '#f9f5ff', '#301661', '#e0caff', '#6740d5', '#ffdb76'],
  ['jade', '翡翠奶油', '入口宫格', 'editorial', 'coin', 'rows', 'links hero ranking notice', '#f5fbec', '#173e29', '#c3ef98', '#006f55', '#ffe69c'],
  ['ice', '冰川青', '横向卡片浏览', 'edge', 'prism', 'carousel', 'hero notice ranking links', '#effcff', '#0b3752', '#b7f7ff', '#006388', '#a9e9fd'],
  ['berry', '莓果奶昔', '主推平台聚焦', 'aside', 'orbit', 'spotlight', 'ranking notice hero links', '#fff2fa', '#49153e', '#ffc5ed', '#a82879', '#fbe2a5'],
  ['tangerine', '橘光海盐', '杂志图封', 'cover', 'photo', 'rows', 'hero links notice ranking', '#fff5e4', '#4c2b18', '#ffc181', '#963b1a', '#ffe179'],
  ['aqua', '海蓝荧绿', '入口栏与榜单', 'dock', 'reels', 'table', 'links ranking hero notice', '#effcff', '#123651', '#b4ebff', '#005a90', '#d5fb75'],
  ['rose', '玫瑰学院', '图文并列', 'split', 'prism', 'spotlight', 'hero ranking links notice', '#fff6f7', '#50172a', '#ffc9cf', '#a0284b', '#ffe28f'],
  ['lime', '青柠墨蓝', '数据优先', 'score', 'reels', 'rows', 'ranking links hero notice', '#f6fae9', '#27381a', '#e1fb92', '#435e12', '#cae999'],
  ['sky', '蔚蓝糖白', '轻量目录', 'compact', 'orbit', 'cards', 'hero links ranking notice', '#f0f8ff', '#17345b', '#cce8ff', '#1d5eb5', '#e0f3ff'],
  ['peach', '蜜桃香槟', '返利指南优先', 'stack', 'coin', 'spotlight', 'links notice hero ranking', '#fff7ed', '#4f2b22', '#ffd9bc', '#99472d', '#fff0a7'],
  ['orchid', '兰紫柚黄', '挑高海报', 'poster', 'reels', 'carousel', 'hero notice links ranking', '#f8f3ff', '#3d235e', '#e0cbff', '#6431b8', '#fce98b'],
  ['teal', '水绿珍珠', '双栏简报', 'editorial', 'orbit', 'table', 'notice ranking hero links', '#eefdff', '#123a3d', '#bbf0e3', '#00665f', '#fff5bc'],
  ['amber', '琥珀瓷白', '图封与双栏卡片', 'cover', 'shield', 'cards', 'hero ranking links notice', '#fffaf0', '#4a301f', '#ffe0a3', '#844713', '#fff1b7'],
  ['periwinkle', '长春花蓝', '短导航引导', 'dock', 'prism', 'carousel', 'links hero notice ranking', '#f4f5ff', '#23265d', '#ced6ff', '#454bbb', '#f9dda2'],
  ['melon', '西瓜冰沙', '平台卡片先看', 'edge', 'coin', 'cards', 'ranking hero notice links', '#fff4f3', '#59262b', '#ffb9b7', '#a33752', '#fbeca0'],
  ['magenta', '电光洋红', '中心舞台', 'center', 'prism', 'spotlight', 'hero links notice ranking', '#fff3fb', '#4d1852', '#ffc2fc', '#8f2297', '#fbe27c'],
]

export const designs = palettes.map(([id, name, layout, hero, art, list, order, paper, ink, tint, accent, spark], index) => {
  return {
    id, number: String(index + 1).padStart(2, '0'), name, layout, hero, art, list, sections: order.split(' '),
    style: {
      '--paper': paper, '--ink': ink, '--tint': tint, '--accent': accent, '--spark': spark,
    },
  }
})
