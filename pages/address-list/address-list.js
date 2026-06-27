const { requireLogin } = require('../../utils/auth.js');
const { callShopService, showShopError } = require('../../utils/shop-cloud.js');

Page({
  data: {
    addresses: [],
    from: '',
    loading: true
  },

  onLoad(options) {
    this.setData({ from: options.from || '' });
  },

  onShow() {
    if (!requireLogin()) return;
    this.loadAddresses();
  },

  async loadAddresses() {
    this.setData({ loading: true });
    const result = await callShopService({ action: 'listAddresses' });
    this.setData({
      loading: false,
      addresses: result.success ? result.addresses || [] : []
    });
    if (!result.success) {
      showShopError('加载失败', result.message);
    }
  },

  onSelect(e) {
    const id = e.currentTarget.dataset.id;
    if (this.data.from === 'checkout') {
      wx.setStorageSync('checkoutSelectedAddressId', id);
      wx.navigateBack();
      return;
    }
    wx.navigateTo({ url: `/pages/address-edit/address-edit?id=${id}` });
  },

  onEdit(e) {
    const id = e.currentTarget.dataset.id;
    wx.navigateTo({ url: `/pages/address-edit/address-edit?id=${id}` });
  },

  async onDelete(e) {
    const id = e.currentTarget.dataset.id;
    const res = await wx.showModal({
      title: '删除地址',
      content: '确定删除该收货地址吗？'
    });
    if (!res.confirm) return;
    const result = await callShopService({ action: 'deleteAddress', addressId: id });
    if (!result.success) {
      showShopError('删除失败', result.message);
      return;
    }
    wx.showToast({ title: '已删除', icon: 'success' });
    this.loadAddresses();
  },

  onAdd() {
    wx.navigateTo({
      url: `/pages/address-edit/address-edit${this.data.from ? '?from=' + this.data.from : ''}`
    });
  },

  stopPropagation() {}
});
