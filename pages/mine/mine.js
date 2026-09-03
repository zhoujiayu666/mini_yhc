const app = getApp();
const { isLoggedIn, getUserInfo, formatPhone, logout, goLoginPage } = require('../../utils/auth.js');
const { SOFTWARE_LIST } = require('../../utils/software-center.js');
const { showShareMenu, getShareMessage, getTimelineShare } = require('../../utils/share.js');

Page({
  data: {
    loggedIn: false,
    phoneDisplay: '',
    avatarLetter: '我',
    localOnly: false,
    softwareList: SOFTWARE_LIST
  },

  onShow() {
    showShareMenu();
    if (isLoggedIn()) {
      this.loadProfile();
    } else {
      this.setData({
        loggedIn: false,
        phoneDisplay: '未登录',
        avatarLetter: '我',
        localOnly: false
      });
    }
  },

  onShareAppMessage() {
    return getShareMessage({
      title: 'TOPUYI 拓普依智能灯光',
      path: '/pages/mine/mine'
    });
  },

  onShareTimeline() {
    return getTimelineShare({
      title: 'TOPUYI 拓普依智能灯光'
    });
  },

  loadProfile() {
    const user = getUserInfo() || app.globalData.userInfo || {};
    const phone = user.phone || '';
    const avatarLetter = phone ? phone.slice(-1) : '我';
    this.setData({
      loggedIn: true,
      phoneDisplay: formatPhone(phone),
      avatarLetter,
      localOnly: !!user.localOnly
    });
  },

  onGoLogin() {
    goLoginPage('登录后可查看订单与收货地址');
  },

  onGoConnectGuide() {
    wx.navigateTo({ url: '/pages/connect-guide/connect-guide' });
  },

  onGoOrders() {
    if (!isLoggedIn()) {
      goLoginPage('登录后查看订单');
      return;
    }
    wx.navigateTo({ url: '/pages/orders/orders' });
  },

  onGoAddresses() {
    if (!isLoggedIn()) {
      goLoginPage('登录后管理收货地址');
      return;
    }
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
        wx.reLaunch({ url: '/pages/control/control' });
      }
    });
  }
});
