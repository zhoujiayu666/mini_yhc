/** 云商品加载失败时的本地兜底（与 seed-products 一致） */
const FALLBACK_PRODUCTS = [
  {
    id: 'stick-01',
    sku: 'stick-01',
    name: 'TOPUYI 经典荧光棒',
    desc: '单色常亮 · 演唱会必备',
    price: 12.9,
    category: 'stick',
    color: '#39FF14',
    tag: '热销'
  },
  {
    id: 'stick-02',
    sku: 'stick-02',
    name: 'TOPUYI RGB 智能荧光棒',
    desc: '蓝牙调光 · 256色',
    price: 89,
    category: 'stick',
    color: '#FF6B9D',
    tag: '新品'
  },
  {
    id: 'stick-03',
    sku: 'stick-03',
    name: '荧光棒 10支套装',
    desc: '混色组合 · 应援团建',
    price: 68,
    category: 'stick',
    color: '#00E5FF',
    tag: ''
  },
  {
    id: 'stick-04',
    sku: 'stick-04',
    name: '迷你荧光棒 5支装',
    desc: '便携轻巧 · 儿童友好',
    price: 29.9,
    category: 'stick',
    color: '#FFD100',
    tag: ''
  }
];

const CART_STORAGE_KEY = 'shopCart';

const ORDER_STATUS_LABEL = {
  pending_pay: '待付款',
  paid: '待发货',
  shipped: '待收货',
  completed: '已完成',
  cancelled: '已取消'
};

function getOrderStatusLabel(status) {
  return ORDER_STATUS_LABEL[status] || status || '未知';
}

function getOrderLogistics(order) {
  if (!order) {
    return {
      trackingNo: '',
      expressCompany: '',
      logisticsStatus: 'none',
      logisticsLabel: '',
      steps: []
    };
  }
  const ship = order.shipping || {};
  const trackingNo = String(order.trackingNo || ship.trackingNo || '').trim();
  const expressCompany = String(order.expressCompany || ship.carrier || ship.expressCompany || '').trim();
  const status = order.status;
  let logisticsStatus = 'pending_ship';
  let logisticsLabel = '待发货';
  if (status === 'pending_pay') {
    logisticsStatus = 'unpaid';
    logisticsLabel = '暂无物流';
  } else if (status === 'cancelled') {
    logisticsStatus = 'cancelled';
    logisticsLabel = '已取消';
  } else if (status === 'completed') {
    logisticsStatus = 'signed';
    logisticsLabel = trackingNo
      ? `已签收 · ${[expressCompany, trackingNo].filter(Boolean).join(' ')}`
      : '已签收';
  } else if (status === 'shipped' || trackingNo) {
    logisticsStatus = 'in_transit';
    logisticsLabel = trackingNo
      ? `运输中 · ${[expressCompany, trackingNo].filter(Boolean).join(' ')}`
      : '已发货，运输中';
  }
  const traces = Array.isArray(order.logisticsTraces) ? order.logisticsTraces : [];
  const paid = status !== 'pending_pay' && status !== 'cancelled';
  const shipped = status === 'shipped' || status === 'completed' || !!trackingNo;
  const signed = status === 'completed';
  return {
    trackingNo,
    expressCompany,
    logisticsStatus,
    logisticsLabel,
    logisticsDesc: order.logisticsDesc || '',
    traces,
    steps: [
      { id: 'created', label: '已下单', done: true },
      { id: 'paid', label: '已付款', done: paid },
      { id: 'shipped', label: '已发货', done: shipped },
      { id: 'transit', label: '运输中', done: shipped },
      { id: 'signed', label: '已签收', done: signed }
    ]
  };
}

function formatYuan(price) {
  const n = Number(price);
  if (!Number.isFinite(n)) return '0.00';
  return n.toFixed(2);
}

function formatFenYuan(fen) {
  const n = Number(fen);
  if (!Number.isFinite(n)) return '0.00';
  return (n / 100).toFixed(2);
}

function getCart() {
  try {
    return wx.getStorageSync(CART_STORAGE_KEY) || [];
  } catch (e) {
    return [];
  }
}

function setCart(cart) {
  wx.setStorageSync(CART_STORAGE_KEY, cart || []);
}

function getCartCount() {
  const cart = getCart();
  return cart.reduce((sum, item) => sum + (item.qty || 1), 0);
}

function addToCart(product, qty = 1) {
  if (!product) return;
  const sku = product.sku || product.id;
  const cart = getCart();
  const idx = cart.findIndex((item) => (item.sku || item.id) === sku);
  const addQty = Math.max(1, qty);
  if (idx >= 0) {
    cart[idx].qty = (cart[idx].qty || 1) + addQty;
  } else {
    cart.push({
      sku,
      id: sku,
      productId: product.productId || '',
      name: product.name,
      price: product.price,
      priceFen: product.priceFen,
      qty: addQty
    });
  }
  setCart(cart);
  return cart;
}

function clearCart() {
  wx.removeStorageSync(CART_STORAGE_KEY);
}

function updateCartQty(sku, qty) {
  const cart = getCart();
  const idx = cart.findIndex((item) => (item.sku || item.id) === sku);
  if (idx < 0) return cart;
  const nextQty = Math.max(0, parseInt(qty, 10) || 0);
  if (nextQty <= 0) {
    cart.splice(idx, 1);
  } else {
    cart[idx].qty = nextQty;
  }
  setCart(cart);
  return cart;
}

function removeFromCart(sku) {
  return updateCartQty(sku, 0);
}

function cartToOrderItems(cart) {
  return (cart || []).map((item) => ({
    sku: item.sku || item.id,
    qty: item.qty || 1
  }));
}

module.exports = {
  FALLBACK_PRODUCTS,
  CART_STORAGE_KEY,
  getOrderStatusLabel,
  getOrderLogistics,
  formatYuan,
  formatFenYuan,
  getCart,
  setCart,
  getCartCount,
  addToCart,
  clearCart,
  updateCartQty,
  removeFromCart,
  cartToOrderItems
};
