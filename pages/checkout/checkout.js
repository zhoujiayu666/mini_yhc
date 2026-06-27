const { requireLogin } = require('../../utils/auth.js');
const { callShopService, showShopError } = require('../../utils/shop-cloud.js');
const {
  getCart,
  clearCart,
  cartToOrderItems,
  formatFenYuan
} = require('../../utils/shop.js');

Page({
  data: {
    mode: 'cart',
    items: [],
    previewItems: [],
    address: null,
    addresses: [],
    remark: '',
    totalYuan: '0.00',
    payYuan: '0.00',
    freightYuan: '0.00',
    submitting: false,
    loading: true
  },

  onLoad(options) {
    this._mode = options.mode || 'cart';
    this._buySku = options.sku || '';
    this._buyQty = Math.max(1, parseInt(options.qty, 10) || 1);
    this.setData({ mode: this._mode });
  },

  onShow() {
    if (!requireLogin()) return;
    const selectedId = wx.getStorageSync('checkoutSelectedAddressId');
    if (selectedId) {
      wx.removeStorageSync('checkoutSelectedAddressId');
      this._pendingAddressId = selectedId;
    }
    if (!this._initialized) {
      this._initialized = true;
      this.bootstrap();
      return;
    }
    this.refreshAddresses();
  },

  pickAddress(addresses) {
    const list = addresses || [];
    if (this._pendingAddressId) {
      const found = list.find((a) => a.id === this._pendingAddressId);
      this._pendingAddressId = null;
      if (found) return found;
    }
    if (this.data.address && this.data.address.id) {
      return list.find((a) => a.id === this.data.address.id) || this.data.address;
    }
    return list.find((a) => a.isDefault) || list[0] || null;
  },

  async refreshAddresses() {
    const addrRes = await callShopService({ action: 'listAddresses' });
    if (!addrRes.success) return;
    const addresses = addrRes.addresses || [];
    this.setData({
      addresses,
      address: this.pickAddress(addresses)
    });
  },

  async bootstrap() {
    this.setData({ loading: true });
    let orderItems = [];
    if (this._mode === 'buy' && this._buySku) {
      orderItems = [{ sku: this._buySku, qty: this._buyQty }];
    } else {
      orderItems = cartToOrderItems(getCart());
    }
    if (!orderItems.length) {
      wx.showToast({ title: '没有可结算商品', icon: 'none' });
      setTimeout(() => wx.navigateBack(), 800);
      return;
    }

    const [preview, addrRes] = await Promise.all([
      callShopService({ action: 'previewOrder', items: orderItems }),
      callShopService({ action: 'listAddresses' })
    ]);

    if (!preview.success) {
      showShopError('结算失败', preview.message);
      this.setData({ loading: false });
      return;
    }

    const addresses = addrRes.success ? addrRes.addresses || [] : [];
    this._orderItems = orderItems;
    const previewItems = (preview.items || []).map((it) => ({
      ...it,
      lineYuan: formatFenYuan(it.lineAmount)
    }));

    this.setData({
      items: orderItems,
      previewItems,
      addresses,
      address: this.pickAddress(addresses),
      totalYuan: formatFenYuan(preview.totalAmount),
      payYuan: formatFenYuan(preview.payAmount),
      freightYuan: formatFenYuan(preview.freightAmount || 0),
      loading: false
    });
  },

  onRemarkInput(e) {
    this.setData({ remark: (e.detail.value || '').slice(0, 200) });
  },

  onChooseAddress() {
    wx.navigateTo({
      url: '/pages/address-list/address-list?from=checkout'
    });
  },

  onAddAddress() {
    wx.navigateTo({ url: '/pages/address-edit/address-edit?from=checkout' });
  },

  async onSubmit() {
    if (this.data.submitting) return;
    const address = this.data.address;
    if (!address || !address.id) {
      wx.showToast({ title: '请先添加收货地址', icon: 'none' });
      return;
    }

    this.setData({ submitting: true });
    const result = await callShopService({
      action: 'createOrder',
      items: this._orderItems,
      addressId: address.id,
      remark: this.data.remark
    });
    this.setData({ submitting: false });

    if (!result.success) {
      showShopError('下单失败', result.message);
      return;
    }

    if (this._mode === 'cart') {
      clearCart();
    }

    wx.showToast({ title: '订单已创建', icon: 'success' });
    setTimeout(() => {
      wx.redirectTo({
        url: `/pages/order-detail/order-detail?orderId=${result.orderId}&pay=1`
      });
    }, 500);
  }
});
