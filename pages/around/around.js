const { requireLogin } = require('../../utils/auth.js');
const { callShopService, showShopError } = require('../../utils/shop-cloud.js');
const { FALLBACK_PRODUCTS, addToCart } = require('../../utils/shop.js');
const { enrichProductsForList } = require('../../utils/product-images.js');

const PRODUCT_CACHE_KEY = 'topuyi_shop_products_v2';
const PRODUCT_CACHE_MAX_AGE_MS = 10 * 60 * 1000;
const SKELETON_ITEMS = [1, 2, 3, 4];

function readProductCache() {
  try {
    const cached = wx.getStorageSync(PRODUCT_CACHE_KEY);
    if (!cached || !Array.isArray(cached.products) || !cached.products.length) {
      return null;
    }
    return {
      products: cached.products,
      stale: Date.now() - (cached.at || 0) > PRODUCT_CACHE_MAX_AGE_MS
    };
  } catch (e) {
    return null;
  }
}

function saveProductCache(products) {
  try {
    wx.setStorageSync(PRODUCT_CACHE_KEY, { products, at: Date.now() });
  } catch (e) {
    console.warn('[around] 缓存商品失败', e);
  }
}

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
    loading: true,
    refreshing: false,
    cloudReady: false,
    useFallback: false,
    cloudError: '',
    skeletonItems: SKELETON_ITEMS
  },

  onShow() {
    if (!requireLogin()) return;
    const cached = readProductCache();
    if (cached) {
      enrichProductsForList(cached.products).then((enriched) => {
        const displayProducts = this.filterByCategory(enriched, this.data.activeCategory);
        this.setData({
          products: enriched,
          displayProducts,
          loading: false,
          refreshing: true,
          cloudReady: true,
          useFallback: false,
          cloudError: ''
        });
        this.loadProducts({ silent: true, skipSeed: true });
      });
      return;
    }
    this.loadProducts();
  },

  filterByCategory(products, categoryId) {
    if (categoryId === 'all') return products;
    return products.filter((p) => p.category === categoryId);
  },

  applyProductList(products, categoryId) {
    const category = categoryId != null ? categoryId : this.data.activeCategory;
    enrichProductsForList(products).then((enriched) => {
      const displayProducts = this.filterByCategory(enriched, category);
      this.setData({
        products: enriched,
        displayProducts,
        loading: false,
        refreshing: false,
        cloudReady: true,
        useFallback: false,
        cloudError: ''
      });
      saveProductCache(enriched);
    });
  },

  async loadProducts(options = {}) {
    const { silent = false, skipSeed = false } = options;
    if (!silent) {
      this.setData({ loading: true, refreshing: false });
    } else {
      this.setData({ refreshing: true });
    }

    const result = await callShopService({
      action: 'listProducts',
      autoSeed: !skipSeed
    });

    if (result.success && Array.isArray(result.products) && result.products.length) {
      this.applyProductList(result.products);
      return;
    }

    const cloudError =
      result.message ||
      (result.success ? '云端商品列表为空' : '云函数 shop-service 调用失败');

    if (silent && this.data.products.length) {
      this.setData({ refreshing: false, cloudError });
      console.warn('[around] 后台刷新失败，继续展示缓存', cloudError);
      return;
    }

    const category = this.data.activeCategory;
    const fallback = this.filterByCategory(FALLBACK_PRODUCTS, category);
    this.setData({
      products: FALLBACK_PRODUCTS,
      displayProducts: fallback,
      loading: false,
      refreshing: false,
      cloudReady: false,
      useFallback: true,
      cloudError
    });
    console.warn('[around] 云商品加载失败，使用本地数据', cloudError);
  },

  onRetryCloud() {
    this.loadProducts();
  },

  onCategoryTap(e) {
    const id = e.currentTarget.dataset.id;
    const products = this.data.products.length ? this.data.products : FALLBACK_PRODUCTS;
    this.setData({
      activeCategory: id,
      displayProducts: this.filterByCategory(products, id)
    });
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
    const sku = product.sku || product.id;
    wx.navigateTo({
      url: `/pages/product-detail/product-detail?sku=${sku}`
    });
  },

  onAddToCart(e) {
    const id = (e.currentTarget.dataset && e.currentTarget.dataset.id) || '';
    const product = this.findProduct(id);
    if (!product) return;
    if (this.data.useFallback) {
      showShopError('商城云服务未就绪', this.data.cloudError || '暂无法加入购物车');
      return;
    }
    addToCart(product, 1);
    wx.showToast({ title: '已加入购物车', icon: 'success' });
  }
});
