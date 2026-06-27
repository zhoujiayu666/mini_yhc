const app = getApp();
const { requireLogin, getUserInfo, formatPhone, logout } = require('../../utils/auth.js');

const { SOFTWARE_LIST } = require('../../utils/software-center.js');

Page({
  data: {
    phoneDisplay: '',
    avatarLetter: '我',
    localOnly: false,
    softwareList: SOFTWARE_LIST
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

  onGoOrders() {
    wx.navigateTo({ url: '/pages/orders/orders' });
  },

  onGoAddresses() {
    wx.navigateTo({ url: '/pages/address-list/address-list' });
  },

  onGoSoftware(e) {
    const id = e.currentTarget.dataset.id;
    if (!id) return;
    wx.navigateTo({ url: `/pages/software/software?id=${id}` });
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
