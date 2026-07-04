function getUserInfo() {
  try {
    return wx.getStorageSync('userInfo') || null;
  } catch (e) {
    return null;
  }
}

function isLoggedIn() {
  const user = getUserInfo();
  return !!(user && user.phone);
}

const { showLoginSheet } = require('./login-sheet-host.js');

/** 主动登录：跳转全屏登录页，避免与「我的」页内容叠在一起 */
function goLoginPage(message) {
  const query = message ? `?hint=${encodeURIComponent(message)}` : '';
  wx.navigateTo({ url: `/pages/login/login${query}` });
}

/** 需要登录时调用：半屏弹层（用于下单、结算等场景） */
function requireLogin(options = {}) {
  if (isLoggedIn()) return true;

  const { message = '登录后可使用完整功能', silent = false, backOnCancel = false } = options;
  if (silent) return false;

  showLoginSheet({
    message,
    onCancel: backOnCancel
      ? () => {
          wx.navigateBack({
            fail: () => wx.reLaunch({ url: '/pages/control/control' })
          });
        }
      : null
  });
  return false;
}

function formatPhone(phone) {
  const p = String(phone || '').replace(/\D/g, '');
  if (p.length === 11) {
    return `${p.slice(0, 3)} ${p.slice(3, 7)} ${p.slice(7)}`;
  }
  return phone || '';
}

function logout() {
  try {
    wx.removeStorageSync('userInfo');
  } catch (e) {
    console.warn('[auth] 清除登录信息失败', e);
  }
  const app = getApp();
  if (app && app.globalData) {
    app.globalData.userInfo = null;
  }
}

module.exports = {
  getUserInfo,
  isLoggedIn,
  requireLogin,
  goLoginPage,
  formatPhone,
  logout
};
