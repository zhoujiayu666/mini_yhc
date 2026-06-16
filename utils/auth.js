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

function requireLogin() {
  if (isLoggedIn()) return true;
  wx.reLaunch({ url: '/pages/login/login' });
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
  formatPhone,
  logout
};
