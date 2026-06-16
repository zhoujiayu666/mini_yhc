const app = getApp();
const { requireLogin, getUserInfo, formatPhone, logout } = require('../../utils/auth.js');

Page({
  data: {
    phoneDisplay: '',
    avatarLetter: '我',
    localOnly: false
  },

  onShow() {
    if (!requireLogin()) return;
    this.loadProfile();
  },

  loadProfile() {
    const user = getUserInfo() || app.globalData.userInfo || {};
    const phone = user.phone || '';
    const avatarLetter = phone ? phone.slice(-1) : '我';
    this.setData({
      phoneDisplay: formatPhone(phone),
      avatarLetter,
      localOnly: !!user.localOnly
    });
  },

  onGoConnectGuide() {
    wx.navigateTo({ url: '/pages/connect-guide/connect-guide' });
  },

  onLogoutTap() {
    wx.showModal({
      title: '退出登录',
      content: '确定要退出当前账号吗？',
      confirmText: '退出',
      confirmColor: '#F44336',
      success: (res) => {
        if (!res.confirm) return;
        logout();
        wx.reLaunch({ url: '/pages/login/login' });
      }
    });
  }
});
