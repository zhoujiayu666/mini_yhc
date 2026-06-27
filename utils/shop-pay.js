const { callShopService } = require('./shop-cloud.js');

/**
 * 调起微信支付（需已部署 createPayment + pay-notify）
 * @param {string} orderId
 * @returns {Promise<{success:boolean,message?:string,cancelled?:boolean}>}
 */
async function requestOrderPayment(orderId) {
  const result = await callShopService({
    action: 'createPayment',
    orderId
  });

  if (!result.success || !result.payment) {
    return { success: false, message: result.message || '获取支付参数失败' };
  }

  const payment = result.payment;

  return new Promise((resolve) => {
    wx.requestPayment({
      timeStamp: payment.timeStamp,
      nonceStr: payment.nonceStr,
      package: payment.package,
      signType: payment.signType || 'RSA',
      paySign: payment.paySign,
      success: () => resolve({ success: true }),
      fail: (err) => {
        const errMsg = (err && err.errMsg) || '支付失败';
        const cancelled = errMsg.includes('cancel') || errMsg.includes('取消');
        resolve({
          success: false,
          cancelled,
          message: cancelled ? '已取消支付' : errMsg
        });
      }
    });
  });
}

/**
 * 支付后轮询订单状态（等待 pay-notify 回调）
 */
async function waitOrderPaid(orderId, maxTry = 10, intervalMs = 800) {
  for (let i = 0; i < maxTry; i += 1) {
    await callShopService({ action: 'syncPayment', orderId });
    const res = await callShopService({ action: 'getOrder', orderId });
    if (res.success && res.order && res.order.status === 'paid') {
      return true;
    }
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  return false;
}

module.exports = {
  requestOrderPayment,
  waitOrderPaid
};
