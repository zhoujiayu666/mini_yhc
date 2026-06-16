const { requireLogin } = require('../../utils/auth.js');

const PRODUCTS = [
  {
    id: 'stick-01',
    name: 'TOPUYI 经典荧光棒',
    desc: '单色常亮 · 演唱会必备',
    price: 12.9,
    category: 'stick',
    color: '#39FF14',
    tag: '热销'
  },
  {
    id: 'stick-02',
    name: 'TOPUYI RGB 智能荧光棒',
    desc: '蓝牙调光 · 256色',
    price: 89,
    category: 'stick',
    color: '#FF6B9D',
    tag: '新品'
  },
  {
    id: 'stick-03',
    name: '荧光棒 10支套装',
    desc: '混色组合 · 应援团建',
    price: 68,
    category: 'stick',
    color: '#00E5FF',
    tag: ''
  },
  {
    id: 'stick-04',
    name: '迷你荧光棒 5支装',
    desc: '便携轻巧 · 儿童友好',
    price: 29.9,
    category: 'stick',
    color: '#FFD100',
    tag: ''
  },
  {
    id: 'ball-01',
    name: 'TOPUYI 发光弹跳球',
    desc: '落地闪光 · 派对互动',
    price: 45,
    category: 'ball',
    color: '#7C4DFF',
    tag: '热销'
  },
  {
    id: 'ball-02',
    name: '七彩闪光球 中号',
    desc: '自动变色 · 氛围营造',
    price: 36.8,
    category: 'ball',
    color: '#FF4081',
    tag: ''
  },
  {
    id: 'ball-03',
    name: '手持发光球 大号',
    desc: '高亮柔光 · 舞台手持',
    price: 58,
    category: 'ball',
    color: '#00BFA5',
    tag: '新品'
  },
  {
    id: 'ball-04',
    name: '氛围灯球 3件套',
    desc: '桌摆/挂饰 · 多场景',
    price: 99,
    category: 'ball',
    color: '#FF9100',
    tag: ''
  }
];

Page({
  data: {
    categories: [
      { id: 'all', label: '全部' },
      { id: 'stick', label: '荧光棒' },
      { id: 'ball', label: '发光球' }
    ],
    activeCategory: 'all',
    products: PRODUCTS,
    displayProducts: PRODUCTS,
    cartCount: 0,
    showDetail: false,
    detailProduct: null
  },

  onShow() {
    if (!requireLogin()) return;
    this.loadCartCount();
  },

  loadCartCount() {
    const cart = wx.getStorageSync('demoCart') || [];
    const count = cart.reduce((sum, item) => sum + (item.qty || 1), 0);
    this.setData({ cartCount: count });
  },

  onCategoryTap(e) {
    const id = e.currentTarget.dataset.id;
    const displayProducts =
      id === 'all' ? PRODUCTS : PRODUCTS.filter((p) => p.category === id);
    this.setData({ activeCategory: id, displayProducts });
  },

  onProductTap(e) {
    const { id } = e.currentTarget.dataset;
    const product = PRODUCTS.find((p) => p.id === id);
    if (!product) return;
    this.setData({ showDetail: true, detailProduct: product });
  },

  closeDetail() {
    this.setData({ showDetail: false, detailProduct: null });
  },

  stopPropagation() {},

  addToCart(e) {
    const id = (e.currentTarget.dataset && e.currentTarget.dataset.id) || '';
    const product =
      PRODUCTS.find((p) => p.id === id) || this.data.detailProduct;
    if (!product) return;

    const cart = wx.getStorageSync('demoCart') || [];
    const idx = cart.findIndex((item) => item.id === product.id);
    if (idx >= 0) {
      cart[idx].qty = (cart[idx].qty || 1) + 1;
    } else {
      cart.push({
        id: product.id,
        name: product.name,
        price: product.price,
        qty: 1
      });
    }
    wx.setStorageSync('demoCart', cart);
    this.loadCartCount();
    wx.showToast({ title: '已加入购物车', icon: 'success' });
  },

  onCartTap() {
    const cart = wx.getStorageSync('demoCart') || [];
    if (!cart.length) {
      wx.showToast({ title: '购物车是空的', icon: 'none' });
      return;
    }
    const total = cart.reduce((sum, item) => sum + item.price * (item.qty || 1), 0);
    const lines = cart.map((item) => `${item.name} x${item.qty || 1}`).join('\n');
    wx.showModal({
      title: `购物车（${this.data.cartCount}件）`,
      content: `${lines}\n\n合计：¥${total.toFixed(2)}\n\n演示商城，暂不支持下单`,
      showCancel: true,
      cancelText: '清空',
      confirmText: '知道了',
      success: (res) => {
        if (res.cancel) {
          wx.removeStorageSync('demoCart');
          this.setData({ cartCount: 0 });
          wx.showToast({ title: '已清空', icon: 'none' });
        }
      }
    });
  }
});
