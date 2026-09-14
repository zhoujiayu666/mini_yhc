const { requireLogin } = require('../../utils/auth.js');
const { callShopService, showShopError } = require('../../utils/shop-cloud.js');
const {
  getCart,
  setCart,
  cartToOrderItems,
  formatFenYuan
} = require('../../utils/shop.js');

function requestShop(payload, timeout = 15000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('网络响应超时，请重试')), timeout);
    Promise.resolve().then(() => callShopService(payload)).then(resolve, reject).finally(() => clearTimeout(timer));
  });
}

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
    updatingQuantity: false,
    loginRequired: false,
    loadError: '',
    loading: true
  },

  onLoad(options) {
    this._mode = options.mode || 'cart';
    this._catalogSource = ['home_dev','home_live'].includes(options.source) ? options.source : '';
    this._buySku = options.sku || '';
    this._buyQty = Math.max(1, parseInt(options.qty, 10) || 1);
    this.setData({ mode: this._mode });
  },

  belongsToCatalog(item) { return this._catalogSource ? item.catalogSource === this._catalogSource : !['home_dev','home_live'].includes(item.catalogSource); },

  onShow() {
    if (!requireLogin({ silent: true })) {
      this.setData({ loading: false, loginRequired: true });
      this.onLogin();
      return;
    }
    this.setData({ loginRequired: false });
    let selectedId;
    try { selectedId = wx.getStorageSync('checkoutSelectedAddressId'); } catch (_) {}
    if (selectedId) {
      wx.removeStorageSync('checkoutSelectedAddressId');
      this._pendingAddressId = selectedId;
    }
    if (!this._initialized) {
      return this.bootstrap();
    }
    this.refreshAddresses();
  },

  onLogin() {
    if (requireLogin({ message: '登录后查看购物车并结算', onSuccess: () => this.onShow() })) return this.onShow();
  },

  onRetry() {
    if (!requireLogin({ silent: true })) return this.onLogin();
    return this.bootstrap();
  },

  onContinueShopping() {
    wx.reLaunch({ url: this._catalogSource ? '/pages/all-products/all-products' : '/pages/home/home' });
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
    const addrRes = await requestShop({ action: 'listAddresses' }, 8000).catch(() => ({ success: false }));
    if (!addrRes.success) return;
    const addresses = addrRes.addresses || [];
    this.setData({
      addresses,
      address: this.pickAddress(addresses)
    });
  },

  async bootstrap() {
    if (this._bootstrapping) return;
    this._bootstrapping = true;
    this._orderItems = [];
    this.setData({ loading: true, loadError: '', previewItems: [], loginRequired: false });
    try {
    let orderItems = [];
    if (this._mode === 'buy' && this._buySku) {
      orderItems = [{ sku: this._buySku, qty: this._buyQty }];
    } else {
      let cart = getCart();
      if (this._catalogSource === 'home_dev') {
        const isRetired = item => item.catalogSource === 'home_dev' && ['stick-01','stick-02','stick-03','stick-05'].includes(item.sku || item.id);
        if (cart.some(isRetired)) {
          const answer = await wx.showModal({title:'购物车商品已更新',content:'部分商品需要重新选择，是否移除原商品并继续结算？',confirmText:'移除并继续',cancelText:'返回选购'});
          if (!answer.confirm) { this.setData({ loadError: '请返回选购，重新添加最新商品。' }); return; }
          cart = cart.filter(item => !isRetired(item));
          wx.setStorageSync('shopCart', cart);
        }
      }
      orderItems = cartToOrderItems(cart.filter(item => this.belongsToCatalog(item)));
    }
    if (!orderItems.length) {
      this._initialized = true;
      this.setData({ items: [], totalYuan: '0.00', payYuan: '0.00', freightYuan: '0.00' });
      return;
    }

    const [preview, addrRes] = await Promise.all([
      requestShop({ action: 'previewOrder', items: orderItems, catalogSource: this._catalogSource }),
      requestShop({ action: 'listAddresses' }, 8000).catch(() => ({ success: false }))
    ]);

    if (!preview.success) {
      throw new Error(preview.message || '购物车加载失败，请重试');
    }

    const addresses = addrRes.success ? addrRes.addresses || [] : [];
    this.setData({
      addresses,
      address: this.pickAddress(addresses),
      loading: false
    });
    this.applyPreview(preview);
    this._initialized = true;
    } catch (error) {
      this._initialized = false;
      this.setData({ loadError: error.message || '购物车加载失败，请重试' });
    } finally {
      this._bootstrapping = false;
      this.setData({ loading: false });
    }
  },

  applyPreview(preview) {
    const previewItems = (preview.items || []).map((item) => ({
      ...item,
      lineYuan: formatFenYuan(item.lineAmount)
    }));
    this._orderItems = previewItems.map(({ sku, qty }) => ({ sku, qty }));
    this.setData({
      items: this._orderItems,
      previewItems,
      totalYuan: formatFenYuan(preview.totalAmount),
      payYuan: formatFenYuan(preview.payAmount),
      freightYuan: formatFenYuan(preview.freightAmount || 0)
    });
  },

  async onChangeQuantity(e) {
    if (this._mode !== 'cart' || this.data.loading || this.data.submitting || this.data.updatingQuantity) return;
    const { sku, step } = e.currentTarget.dataset;
    const delta = Number(step);
    const current = (this._orderItems || []).find((item) => item.sku === sku);
    if (!current || ![-1, 1].includes(delta)) return;
    const qty = Number(current.qty) + delta;
    if (qty < 1 || qty > 99) return;

    this.setData({ updatingQuantity: true });
    try {
      const items = this._orderItems.map((item) => item.sku === sku ? { ...item, qty } : item);
      const preview = await callShopService({ action: 'previewOrder', items, catalogSource: this._catalogSource });
      if (!preview.success) {
        showShopError('数量修改失败', preview.message);
        return;
      }
      const confirmed = (preview.items || []).find((item) => item.sku === sku);
      if (!confirmed) throw new Error('商品信息已变化，请返回购物车重试');
      // Commit only after the server has validated stock and recalculated all amounts.
      const cart = getCart().map((item) => {
        const sameSource = this.belongsToCatalog(item);
        return sameSource && (item.sku || item.id) === sku ? { ...item, qty: confirmed.qty } : item;
      });
      setCart(cart);
      this.applyPreview(preview);
    } catch (error) {
      showShopError('数量修改失败', error.message || '请稍后重试');
    } finally {
      this.setData({ updatingQuantity: false });
    }
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
    if (this.data.loading || this.data.submitting || this.data.updatingQuantity || !this._orderItems?.length) return;
    const address = this.data.address;
    if (!address || !address.id) {
      wx.showToast({ title: '请先添加收货地址', icon: 'none' });
      return;
    }

    this.setData({ submitting: true });
    const result = await callShopService({
      action: 'createOrder',
      items: this._orderItems,
      catalogSource: this._catalogSource,
      addressId: address.id,
      remark: this.data.remark
    });
    this.setData({ submitting: false });

    if (!result.success) {
      showShopError('下单失败', result.message);
      return;
    }

    if (this._mode === 'cart') {
      const remaining = getCart().filter(i => !this.belongsToCatalog(i));
      wx.setStorageSync('shopCart', remaining);
    }

    wx.showToast({ title: '订单已创建', icon: 'success' });
    setTimeout(() => {
      wx.redirectTo({
        url: `/pages/order-detail/order-detail?orderId=${result.orderId}&pay=1`
      });
    }, 500);
  }
});
