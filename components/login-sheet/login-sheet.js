const { initCloud } = require('../../utils/cloud-config.js');
const { runLoginFlow } = require('../../utils/login-flow.js');
const {
  ensureAgreed,
  openPrivacyPolicy,
  openUserAgreement
} = require('../../utils/login-agreement.js');

Component({
  data: {
    visible: false,
    hint: '登录后可同步订单与群组',
    phone: '',
    loading: false,
    showManual: false,
    agreed: false
  },

  lifetimes: {
    attached() {
      initCloud();
    }
  },

  methods: {
    noop() {},

    open(options = {}) {
      this._onSuccess = typeof options.onSuccess === 'function' ? options.onSuccess : null;
      this._onCancel = typeof options.onCancel === 'function' ? options.onCancel : null;
      this.setData({
        visible: true,
        hint: options.message || '登录后可同步订单与群组',
        phone: '',
        loading: false,
        showManual: false,
        agreed: false
      });
    },

    close() {
      this.setData({ visible: false, loading: false });
    },

    onClose() {
      this.close();
      if (this._onCancel) {
        this._onCancel();
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

    async onManualLogin() {
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
        wx.showToast({ title: '微信授权失败', icon: 'none' });
        return;
      }
      const code = detail.code;
      if (!code) {
        wx.showToast({ title: '未获取授权，请重试', icon: 'none' });
        return;
      }
      await this.doLogin({ code });
    },

    async doLogin(payload) {
      if (this.data.loading) return;
      this.setData({ loading: true });
      const ok = await runLoginFlow({
        ...payload,
        onSuccess: (result) => {
          this.close();
          if (this._onSuccess) {
            this._onSuccess(result);
          }
          this.triggerEvent('success', result);
        }
      });
      this.setData({ loading: false });
      if (!ok) return;
    }
  }
});
