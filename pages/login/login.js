const app = getApp();
const { loginWithPhone, saveLocalUser } = require('../../utils/user-login.js');
const { initCloud, CLOUD_ENV_ID } = require('../../utils/cloud-config.js');

Page({
  data: {
    phone: '',
    loading: false
  },

  onLoad() {
    this.ensureCloudReady();
    const user = wx.getStorageSync('userInfo');
    if (user && user.phone) {
      this.goMain();
    }
  },

  ensureCloudReady() {
    initCloud();
  },

  onPhoneInput(e) {
    this.setData({ phone: (e.detail.value || '').replace(/\D/g, '').slice(0, 11) });
  },

  async onLogin() {
    const phone = this.data.phone;
    if (!/^1\d{10}$/.test(phone)) {
      wx.showToast({ title: '请输入正确手机号', icon: 'none' });
      return;
    }
    await this.registerPhone(phone);
  },

  async registerPhone(phone) {
    this.setData({ loading: true });
    try {
      const result = await loginWithPhone(phone);
      saveLocalUser(result.phone, {
        openid: result.openid,
        localOnly: result.localOnly
      });

      let toastTitle = result.isNew ? '注册成功' : '登录成功';
      if (result.localOnly) {
        const hint = result.fallbackError || '';
        console.warn('[login] 云端登录失败，已本地登录。环境ID:', CLOUD_ENV_ID, hint);
        wx.showModal({
          title: '已本地登录',
          content:
            '云数据库/云函数未就绪，本次仅保存在本机。\n\n请检查：\n1. utils/cloud-config.js 环境ID是否与云开发控制台一致\n2. 数据库已建 users 集合（仅创建者可读写）\n3. 已部署 user-service 云函数',
          showCancel: false,
          confirmText: '知道了'
        });
      } else {
        wx.showToast({ title: toastTitle, icon: 'success' });
      }
      if (!result.localOnly) {
        setTimeout(() => this.goMain(), 500);
      } else {
        setTimeout(() => this.goMain(), 300);
      }
    } catch (err) {
      console.error('[login] 登录失败', err);
      const msg =
        (err && (err.message || err.errMsg)) ||
        '登录失败，请检查云开发环境或网络';
      wx.showToast({
        title: msg.length > 20 ? '登录失败，请重试' : msg,
        icon: 'none',
        duration: 2500
      });
    } finally {
      this.setData({ loading: false });
    }
  },

  goMain() {
    wx.reLaunch({ url: '/pages/control/control' });
  }
});
