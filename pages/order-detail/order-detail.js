const { requireLogin } = require('../../utils/auth.js');
const { callShopService, showShopError } = require('../../utils/shop-cloud.js');
const { getOrderStatusLabel, formatFenYuan } = require('../../utils/shop.js');
const { payOrderOnDetail } = require('../../utils/shop-pay-flow.js');

function formatTime(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

Page({
  data: {
    order: null,
    loading: true,
    acting: false
  },

  onLoad(options) {
    this._orderId = options.orderId || '';
    this._orderNo = options.orderNo || options['商品订单号'] || '';
    this._autoPay = options.pay === '1';
  },

  onShow() {
    if (!requireLogin({ message: '查看订单需要登录', backOnCancel: true })) return;
    this.loadOrder();
  },

  async loadOrder() {
    if (!this._orderId && !this._orderNo) return;
    this.setData({ loading: true });
    const payload = { action: 'getOrder' };
    if (this._orderId) {
      payload.orderId = this._orderId;
    } else {
      payload.orderNo = this._orderNo;
    }
    const result = await callShopService(payload);
    if (!result.success || !result.order) {
      showShopError('加载失败', result.message || '订单不存在');
      this.setData({ loading: false });
      return;
    }
    if (!this._orderId && result.order.id) {
      this._orderId = result.order.id;
    }
    const o = result.order;
    const addr = o.addressSnapshot || {};
    this.setData({
      loading: false,
      order: {
        ...o,
        statusLabel: getOrderStatusLabel(o.status),
        payYuan: o.payYuan || formatFenYuan(o.payAmount),
        createdText: formatTime(o.createdAt),
        paidText: formatTime(o.paidAt),
        shippedText: formatTime(o.shippedAt),
        addressText: [addr.province, addr.city, addr.district, addr.detail].filter(Boolean).join(''),
        contactText: `${addr.name || ''} ${addr.phone || ''}`.trim(),
        itemLines: (o.items || []).map((it) => ({
          ...it,
          lineYuan: formatFenYuan(it.lineAmount)
        }))
      }
    });

    if (this._autoPay && o.status === 'pending_pay') {
      this._autoPay = false;
      payOrderOnDetail(this, this._orderId);
    }
  },

  onPayTap() {
    payOrderOnDetail(this, this._orderId);
  },

  async onCancel() {
    if (this.data.acting) return;
    const res = await wx.showModal({ title: '取消订单', content: '确定取消该订单吗？' });
    if (!res.confirm) return;
    this.setData({ acting: true });
    const result = await callShopService({
      action: 'cancelOrder',
      orderId: this._orderId
    });
    this.setData({ acting: false });
    if (!result.success) {
      showShopError('取消失败', result.message);
      return;
    }
    wx.showToast({ title: '已取消', icon: 'success' });
    this.loadOrder();
  },

  async onConfirmReceive() {
    if (this.data.acting) return;
    const res = await wx.showModal({ title: '确认收货', content: '确认已收到商品吗？' });
    if (!res.confirm) return;
    this.setData({ acting: true });
    const result = await callShopService({
      action: 'confirmReceive',
      orderId: this._orderId
    });
    this.setData({ acting: false });
    if (!result.success) {
      showShopError('操作失败', result.message);
      return;
    }
    wx.showToast({ title: '已完成', icon: 'success' });
    this.loadOrder();
  }
});
