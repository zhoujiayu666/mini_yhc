const LIST = [
  { id: 'home', label: '首页', icon: '◇', path: '/pages/home/home' },
  { id: 'products', label: '全部商品', icon: '▣', path: '/pages/all-products/all-products' },
  { id: 'member', label: '会员中心', icon: '♔', path: '/pages/member/member' },
  { id: 'mine', label: '个人中心', icon: '○', path: '/pages/mine/mine' }
];
const PATH_ID = Object.fromEntries(LIST.map((t) => [t.path, t.id]));

function open(url) {
  const path = String(url || '').split('?')[0];
  if (PATH_ID[path]) {
    wx.switchTab({ url: path });
    return;
  }
  wx.navigateTo({
    url,
    fail: () => wx.redirectTo({ url })
  });
}

function sync(id) {
  const pages = getCurrentPages();
  const page = pages[pages.length - 1];
  if (!page || typeof page.getTabBar !== 'function') return;
  const bar = page.getTabBar();
  if (bar && bar.data.current !== id) bar.setData({ current: id });
}

module.exports = { LIST, PATH_ID, open, sync };
