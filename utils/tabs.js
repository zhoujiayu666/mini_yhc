const HOME = '/pages/home/home';

const LIST = [
  { id: 'home', label: '首页', icon: '◇', path: HOME },
  { id: 'products', label: '全部商品', icon: '▣', path: '/pages/all-products/all-products' },
  { id: 'member', label: '会员中心', icon: '♔', path: '/pages/member/member' },
  { id: 'mine', label: '个人中心', icon: '○', path: '/pages/mine/mine' }
];
const PATH_ID = Object.fromEntries(LIST.map((t) => [t.path, t.id]));

/**
 * 无底部 Tab：首页入口用 navigateTo；回首页用 reLaunch，保证只能从主页再进其他模式。
 */
function open(url) {
  const raw = String(url || '');
  const path = raw.split('?')[0];
  if (!path) return;

  if (path === HOME) {
    wx.reLaunch({ url: raw || HOME });
    return;
  }

  wx.navigateTo({
    url: raw,
    fail: () => {
      wx.redirectTo({
        url: raw,
        fail: () => wx.reLaunch({ url: raw })
      });
    }
  });
}

function sync() {
  // 已移除自定义 Tab，保留空实现避免旧调用报错
}

module.exports = { LIST, PATH_ID, HOME, open, sync };
