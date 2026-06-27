const { requireLogin } = require('../../utils/auth.js');
const { callShopService, showShopError } = require('../../utils/shop-cloud.js');
const { FALLBACK_PRODUCTS, addToCart } = require('../../utils/shop.js');

Page({
  data: {
    categories: [
      { id: 'all', label: '全部' },
      { id: 'stick', label: '荧光棒' },
      { id: 'ball', label: '发光球' }
    ],
    activeCategory: 'all',
    products: [],
    displayProducts: [],
    showDetail: false,
    detailProduct: null,
    loading: true,
    cloudReady: false,
    useFallback: false
  },

  onShow() {
    if (!requireLogin()) return;
    this.loadProducts();
  },

  filterByCategory(products, categoryId) {
    if (categoryId === 'all') return products;
    return products.filter((p) => p.category === categoryId);
  },

  async loadProducts(categoryId) {
    this.setData({ loading: true });
    const category = categoryId != null ? categoryId : this.data.activeCategory;
    const result = await callShopService({
      action: 'listProducts',
      category: category === 'all' ? undefined : category
    });

    if (result.success && Array.isArray(result.products) && result.products.length) {
      const products = result.products;
      this.setData({
        products,
        displayProducts: products,
        loading: false,
        cloudReady: true,
        useFallback: false
      });
      return;
    }

    const fallback = this.filterByCategory(FALLBACK_PRODUCTS, category);
    this.setData({
      products: FALLBACK_PRODUCTS,
      displayProducts: fallback,
      loading: false,
      cloudReady: false,
      useFallback: true
    });
    if (result.message && !result.success) {
      console.warn('[around] 云商品加载失败，使用本地数据', result.message);
    }
  },

  onCategoryTap(e) {
    const id = e.currentTarget.dataset.id;
    this.setData({ activeCategory: id });
    if (this.data.cloudReady) {
      this.loadProducts(id);
      return;
    }
    const products = this.data.products.length ? this.data.products : FALLBACK_PRODUCTS;
    this.setData({ displayProducts: this.filterByCategory(products, id) });
  },

  findProduct(id) {
    return (
      this.data.displayProducts.find((p) => p.id === id || p.sku === id) ||
      this.data.products.find((p) => p.id === id || p.sku === id) ||
      FALLBACK_PRODUCTS.find((p) => p.id === id)
    );
  },

  onProductTap(e) {
    const { id } = e.currentTarget.dataset;
    const product = this.findProduct(id);
    if (!product) return;
    this.setData({ showDetail: true, detailProduct: product });
  },

  closeDetail() {
    this.setData({ showDetail: false, detailProduct: null });
  },

  stopPropagation() {},

  onAddToCart(e) {
    const id = (e.currentTarget.dataset && e.currentTarget.dataset.id) || '';
    const product = this.findProduct(id) || this.data.detailProduct;
    if (!product) return;
    if (this.data.useFallback) {
      showShopError('提示', '商城云服务未就绪，暂无法加入购物车');
      return;
    }
    addToCart(product, 1);
    wx.showToast({ title: '已加入购物车', icon: 'success' });
  },

  onBuyNow() {
    const product = this.data.detailProduct;
    if (!product || this.data.useFallback) {
      showShopError('提示', '商城云服务未就绪');
      return;
    }
    const sku = product.sku || product.id;
    wx.navigateTo({
      url: `/pages/checkout/checkout?mode=buy&sku=${sku}&qty=1`
    });
  }
});
