const { requireLogin } = require('../../utils/auth.js');
const { callShopService, showShopError } = require('../../utils/shop-cloud.js');
const { getOrderStatusLabel, formatFenYuan } = require('../../utils/shop.js');

function formatTime(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

Page({
  data: {
    tabs: [
      { id: 'all', label: '全部' },
      { id: 'pending_pay', label: '待付款' },
      { id: 'paid', label: '待发货' },
      { id: 'shipped', label: '待收货' },
      { id: 'completed', label: '已完成' }
    ],
    activeTab: 'all',
    orders: [],
    loading: true
  },

  onShow() {
    if (!requireLogin()) return;
    this.loadOrders();
  },

  onTabTap(e) {
    const id = e.currentTarget.dataset.id;
    this.setData({ activeTab: id });
    this.loadOrders();
  },

  async loadOrders() {
    this.setData({ loading: true });
    const status = this.data.activeTab;
    const result = await callShopService({
      action: 'listOrders',
      status: status === 'all' ? undefined : status
    });
    if (!result.success) {
      showShopError('加载失败', result.message);
      this.setData({ loading: false, orders: [] });
      return;
    }
    const orders = (result.orders || []).map((o) => ({
      ...o,
      statusLabel: getOrderStatusLabel(o.status),
      payYuan: o.payYuan || formatFenYuan(o.payAmount),
      createdText: formatTime(o.createdAt),
      itemSummary: (o.items || []).map((it) => `${it.name}×${it.qty}`).join('、')
    }));
    this.setData({ orders, loading: false });
  },

  onOrderTap(e) {
    const id = e.currentTarget.dataset.id;
    wx.navigateTo({ url: `/pages/order-detail/order-detail?orderId=${id}` });
  }
});
