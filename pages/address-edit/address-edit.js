const { requireLogin, getUserInfo } = require('../../utils/auth.js');
const { callShopService, showShopError } = require('../../utils/shop-cloud.js');
const { parseAddress } = require('../../utils/parse-address.js');

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
    from: '',
    pasteText: '',
    locating: false
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

  onUnload() {
    if (this._parseTimer) clearTimeout(this._parseTimer);
  },

  onShow() {
    if (!requireLogin({ message: '编辑地址需要登录', backOnCancel: true })) return;
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

  onPasteInput(e) {
    const pasteText = e.detail.value || '';
    this.setData({ pasteText });
    this.scheduleParse(pasteText);
  },

  onPasteClipboard() {
    wx.getClipboardData({
      success: (res) => {
        const pasteText = (res.data || '').trim();
        if (!pasteText) {
          wx.showToast({ title: '剪贴板是空的', icon: 'none' });
          return;
        }
        this.setData({ pasteText });
        this.applyParsed(pasteText, true);
      },
      fail: () => wx.showToast({ title: '无法读取剪贴板', icon: 'none' })
    });
  },

  scheduleParse(text) {
    if (this._parseTimer) clearTimeout(this._parseTimer);
    this._parseTimer = setTimeout(() => this.applyParsed(text, false), 280);
  },

  applyParsed(text, toast) {
    const parsed = parseAddress(text);
    const patch = {};
    ['name', 'phone', 'province', 'city', 'district', 'detail'].forEach((key) => {
      if (parsed[key]) patch[key] = parsed[key];
    });
    if (!Object.keys(patch).length) {
      if (toast) wx.showToast({ title: '未能识别地址', icon: 'none' });
      return false;
    }
    this.setData(patch);
    if (toast) wx.showToast({ title: '已识别填写', icon: 'success' });
    return true;
  },

  onDefaultChange(e) {
    this.setData({ isDefault: !!e.detail.value });
  },

  onLocate() {
    if (this.data.locating) return;
    this.setData({ locating: true });
    wx.chooseLocation({
      success: (res) => {
        const parsed = parseAddress(res.address || '');
        const patch = {};
        if (parsed.province) patch.province = parsed.province;
        if (parsed.city) patch.city = parsed.city;
        if (parsed.district) patch.district = parsed.district;
        const poi = String(res.name || '').trim();
        let detail = parsed.detail || '';
        if (poi && poi !== '我的位置' && detail.indexOf(poi) < 0) {
          detail = detail ? detail + ' ' + poi : poi;
        }
        if (detail) patch.detail = detail;
        if (!Object.keys(patch).length) {
          wx.showToast({ title: '未识别到地址，请手动填写', icon: 'none' });
          return;
        }
        this.setData(patch);
        wx.showToast({ title: '已填入选中位置', icon: 'success' });
      },
      fail: (err) => {
        const msg = String((err && err.errMsg) || '');
        if (msg.indexOf('cancel') >= 0 || msg.indexOf('canceled') >= 0) return;
        wx.showToast({ title: '请允许定位后在地图上选择', icon: 'none' });
      },
      complete: () => this.setData({ locating: false })
    });
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

    if (this.data.from === 'redemption' && result.addressId) wx.setStorageSync('redemptionSelectedAddressId', result.addressId);
    if (this.data.from === 'checkout' && result.addressId) {
      wx.setStorageSync('checkoutSelectedAddressId', result.addressId);
    }

    wx.showToast({ title: '已保存', icon: 'success' });
    setTimeout(() => wx.navigateBack(), 400);
  }
});
