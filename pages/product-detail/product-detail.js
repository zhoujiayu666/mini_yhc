const { requireLogin } = require('../../utils/auth.js');
const { callShopService, showShopError } = require('../../utils/shop-cloud.js');
const { addToCart } = require('../../utils/shop.js');
const { enrichProductDetail, resolveImageUrls } = require('../../utils/product-images.js');

Page({
  data: {
    product: null,
    loading: true,
    cloudError: '',
    imageUrls: [],
    detailImageUrls: [],
    hasImages: false
  },

  onLoad(options) {
    this._sku = (options && (options.sku || options.id)) || '';
  },

  onShow() {
    if (!this._sku) {
      showShopError('提示', '缺少商品编号');
      this.setData({ loading: false, cloudError: '缺少商品编号' });
      return;
    }
    this.loadProduct();
  },

  async loadProduct() {
    this.setData({ loading: true, cloudError: '' });
    const result = await callShopService({
      action: 'getProduct',
      sku: this._sku
    });

    if (!result.success || !result.product) {
      const msg = result.message || '商品不存在或已下架';
      this.setData({ loading: false, cloudError: msg, product: null });
      showShopError('加载失败', msg);
      return;
    }

    const product = await enrichProductDetail(result.product);
    const imageUrls = product.images || [];
    const detailImageUrls = await resolveImageUrls(product.detailImages || []);
    this.setData({
      product,
      imageUrls,
      detailImageUrls,
      hasImages: imageUrls.length > 0,
      loading: false,
      cloudError: ''
    });
  },

  onAddToCart() {
    const product = this.data.product;
    if (!product) return;
    addToCart(product, 1);
    wx.showToast({ title: '已加入购物车', icon: 'success' });
  },

  onBuyNow() {
    if (!requireLogin({ message: '下单购买需要登录' })) return;
    const product = this.data.product;
    if (!product) return;
    const sku = product.sku || product.id;
    wx.navigateTo({
      url: `/pages/checkout/checkout?mode=buy&sku=${sku}&qty=1`
    });
  },

  onPreviewImage(e) {
    const index = Number(e.currentTarget.dataset.index) || 0;
    const urls = this.data.imageUrls;
    if (!urls.length) return;
    wx.previewImage({ current: urls[index], urls });
  },

  onPreviewDetailImage(e) {
    const index = Number(e.currentTarget.dataset.index) || 0;
    const urls = this.data.detailImageUrls;
    if (!urls.length) return;
    wx.previewImage({ current: urls[index], urls });
  }
});
