const { requireLogin, getUserInfo } = require('../../utils/auth.js');
const { callShopService, showShopError } = require('../../utils/shop-cloud.js');

Page({
  data: {
    id: '',
    name: '',
    phone: '',
    province: '',
    city: '',
    district: '',
    detail: '',
    isDefault: true,
    saving: false,
    from: ''
  },

  onLoad(options) {
    this.setData({
      id: options.id || '',
      from: options.from || ''
    });
    if (!options.id) {
      const user = getUserInfo();
      if (user && user.phone) {
        this.setData({ phone: user.phone });
      }
    }
  },

  onShow() {
    if (!requireLogin()) return;
    if (this.data.id) {
      this.loadAddress();
    }
  },

  async loadAddress() {
    const result = await callShopService({ action: 'listAddresses' });
    if (!result.success) return;
    const addr = (result.addresses || []).find((a) => a.id === this.data.id);
    if (!addr) return;
    this.setData({
      name: addr.name,
      phone: addr.phone,
      province: addr.province,
      city: addr.city,
      district: addr.district,
      detail: addr.detail,
      isDefault: !!addr.isDefault
    });
  },

  onInput(e) {
    const field = e.currentTarget.dataset.field;
    if (!field) return;
    this.setData({ [field]: e.detail.value || '' });
  },

  onDefaultChange(e) {
    this.setData({ isDefault: !!e.detail.value });
  },

  async onSave() {
    if (this.data.saving) return;
    const { id, name, phone, province, city, district, detail, isDefault } = this.data;
    if (!name.trim() || !/^1\d{10}$/.test(phone.replace(/\s/g, '')) || !detail.trim()) {
      wx.showToast({ title: '请填写完整信息', icon: 'none' });
      return;
    }

    this.setData({ saving: true });
    const result = await callShopService({
      action: 'saveAddress',
      address: { id, name, phone, province, city, district, detail, isDefault }
    });
    this.setData({ saving: false });

    if (!result.success) {
      showShopError('保存失败', result.message);
      return;
    }

    if (this.data.from === 'checkout' && result.addressId) {
      wx.setStorageSync('checkoutSelectedAddressId', result.addressId);
    }

    wx.showToast({ title: '已保存', icon: 'success' });
    setTimeout(() => wx.navigateBack(), 400);
  }
});
