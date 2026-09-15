const app = getApp();
const { CLOUD_ENV_ID } = require('../../utils/cloud-config.js');
const { isLoggedIn, getUserInfo, formatPhone, logout, goLoginPage } = require('../../utils/auth.js');
const { SOFTWARE_LIST } = require('../../utils/software-center.js');
const { showShareMenu, getShareMessage, getTimelineShare } = require('../../utils/share.js');

Page({
  data: {
    memberReady: false,
    points: null,
    pointsLoading: false,
    pointsError: '',
    historyOpen: false,
    historyLoading: false,
    historyError: '',
    pointEntries: [],
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
      this._profileRequest = (this._profileRequest || 0) + 1;
      this.setData({ memberReady: false, points: null, pointsLoading: false, historyOpen: false,
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

  async loadProfile() {
    const user = getUserInfo() || app.globalData.userInfo || {};
    const phone = user.phone || '';
    const avatarLetter = phone ? phone.slice(-1) : '我';
    this.setData({
      loggedIn: true,
      phoneDisplay: formatPhone(phone),
      avatarLetter,
      localOnly: !!user.localOnly, pointsLoading: true, pointsError: '', points: null, memberReady: false
    });
    const request = this._profileRequest = (this._profileRequest || 0) + 1;
    try {
      const result = await this.callMember('profile');
      if (request !== this._profileRequest || !isLoggedIn()) return;
      const profile = result.user || {};
      if (!profile.isMember || !Number.isSafeInteger(profile.points)) throw Error('积分暂未获取，请重试');
      this.setData({ memberReady: true, points: profile.points, pointsLoading: false, localOnly: false });
    } catch (error) {
      if (request !== this._profileRequest || !isLoggedIn()) return;
      this.setData({ pointsLoading: false, pointsError: error.message || '积分暂未获取，请重试' });
    }
  },

  async callMember(action) {
    if (!wx.cloud) throw Error('请更新微信后重试');
    let timer;
    try {
      const response = await Promise.race([
        wx.cloud.callFunction({ name: 'user-service', config: { env: CLOUD_ENV_ID }, data: { action } }),
        new Promise((_, reject) => { timer = setTimeout(() => reject(Error('网络连接超时，请重试')), 15000); })
      ]);
      const result = response.result || {};
      if (!result.success) throw Error(result.message || '积分暂未获取，请重试');
      return result;
    } finally { clearTimeout(timer); }
  },

  async onPointsHistory() {
    if (!isLoggedIn()) { this.onGoLogin(); return; }
    const request = this._historyRequest = (this._historyRequest || 0) + 1;
    this.setData({ historyOpen: true, historyLoading: true, historyError: '', pointEntries: [] });
    try {
      const result = await this.callMember('pointsHistory');
      if (request !== this._historyRequest || !isLoggedIn()) return;
      this.setData({ historyLoading: false, pointEntries: (result.entries || []).map(row => ({
        ...row, title: row.type === 'redemption' ? '兑换商品' : (row.type === 'refund' ? '退款扣回' : '购物获得'),
        deltaText: row.delta > 0 ? '+' + row.delta : String(row.delta),
        dateText: new Date(row.createdAt).toLocaleDateString()
      })) });
    } catch (error) {
      if (request !== this._historyRequest || !isLoggedIn()) return;
      this.setData({ historyLoading: false, historyError: error.message || '明细暂未获取，请重试' });
    }
  },
  onCloseHistory() { this._historyRequest = (this._historyRequest || 0) + 1; this.setData({ historyOpen: false }); },
  onUnload() { this._profileRequest = (this._profileRequest || 0) + 1; this._historyRequest = (this._historyRequest || 0) + 1; },
  onGoLogin() {
    goLoginPage('注册即成为会员，购物可获得积分');
  },

  onGoDevices() { wx.navigateTo({ url: '/pages/product/product' }); },

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

  onGoRedemptions() {
    if (!isLoggedIn()) { goLoginPage('登录后查看积分兑换订单'); return; }
    wx.navigateTo({url:'/pages/redemption-orders/redemption-orders'});
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
        this.onUnload();
        logout();
        wx.reLaunch({ url: '/pages/control/control' });
      }
    });
  }
});
