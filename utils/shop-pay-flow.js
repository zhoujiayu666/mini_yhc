const { callShopService, showShopError } = require('./shop-cloud.js');
const { requestOrderPayment, waitOrderPaid } = require('./shop-pay.js');

/**
 * 订单详情页发起支付并刷新状态
 */
async function payOrderOnDetail(page, orderId) {
  if (!orderId || page.data.acting) {
    return;
  }

  page.setData({ acting: true });
  const pay = await requestOrderPayment(orderId);
  page.setData({ acting: false });

  if (!pay.success) {
    if (!pay.cancelled) {
      showShopError('支付失败', pay.message);
    }
    return;
  }

  wx.showLoading({ title: '确认支付结果...', mask: true });
  const paid = await waitOrderPaid(orderId);
  wx.hideLoading();

  if (paid) {
    wx.showToast({ title: '支付成功', icon: 'success' });
    if (typeof page.loadOrder === 'function') {
      page.loadOrder();
    }
    return;
  }

  wx.showModal({
    title: '支付处理中',
    content: '支付已提交，订单状态稍后更新。请下拉刷新或稍后在「我的订单」查看。',
    showCancel: false,
    confirmText: '知道了',
    success: () => {
      if (typeof page.loadOrder === 'function') {
        page.loadOrder();
      }
    }
  });
}

module.exports = {
  payOrderOnDetail
};
