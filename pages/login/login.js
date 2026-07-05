const { initCloud } = require('../../utils/cloud-config.js');
const { runLoginFlow } = require('../../utils/login-flow.js');
const {
  ensureAgreed,
  openPrivacyPolicy,
  openUserAgreement
} = require('../../utils/login-agreement.js');

Page({
  data: {
    phone: '',
    loading: false,
    hint: '登录后可同步订单与群组，也可先体验功能',
    showManual: false,
    agreed: false
  },

  onLoad(options) {
    initCloud();
    if (options && options.hint) {
      this.setData({ hint: decodeURIComponent(options.hint) });
    }
    const user = wx.getStorageSync('userInfo');
    if (user && user.phone) {
      this.goMain();
    }
  },

  onToggleManual() {
    this.setData({ showManual: !this.data.showManual });
  },

  onToggleAgree() {
    this.setData({ agreed: !this.data.agreed });
  },

  onNeedAgree() {
    ensureAgreed(false);
  },

  onOpenPrivacy() {
    openPrivacyPolicy();
  },

  onOpenUserAgreement() {
    openUserAgreement();
  },

  onPhoneInput(e) {
    this.setData({ phone: (e.detail.value || '').replace(/\D/g, '').slice(0, 11) });
  },

  async onLogin() {
    if (!ensureAgreed(this.data.agreed)) return;
    const phone = this.data.phone;
    if (!/^1\d{10}$/.test(phone)) {
      wx.showToast({ title: '请输入正确手机号', icon: 'none' });
      return;
    }
    await this.doLogin({ phone });
  },

  async onGetPhoneNumber(e) {
    if (!ensureAgreed(this.data.agreed)) return;
    const detail = e.detail || {};
    if (detail.errMsg && !detail.errMsg.includes(':ok')) {
      if (detail.errMsg.includes('deny') || detail.errMsg.includes('cancel')) {
        return;
      }
      wx.showToast({ title: '手机号验证失败', icon: 'none' });
      return;
    }
    const code = detail.code;
    if (!code) {
      wx.showToast({ title: '未获取手机号，请重试', icon: 'none' });
      return;
    }
    await this.doLogin({ code });
  },

  async doLogin(payload) {
    if (this.data.loading) return;
    this.setData({ loading: true });
    const ok = await runLoginFlow({ ...payload });
    this.setData({ loading: false });
    if (ok) {
      setTimeout(() => this.goMain(), 400);
    }
  },

  onSkipLogin() {
    wx.navigateBack({
      fail: () => this.goMain()
    });
  },

  goMain() {
    wx.reLaunch({ url: '/pages/control/control' });
  }
});
