// Convert authenticated WeChat API results to the internal ledger format.
function paymentEvent(value, creds) {
  if (!value || value.trade_state !== 'SUCCESS' || value.mchid !== creds.mchid || value.appid !== creds.appid) {
    throw Error('payment merchant or status mismatch');
  }
  const amount = value.amount || {};
  return { appId: value.appid, openid: value.payer && value.payer.openid,
    outTradeNo: value.out_trade_no, transactionId: value.transaction_id,
    totalFen: amount.total, payerTotalFen: amount.payer_total, currency: amount.currency };
}
function refundEvent(value, creds) {
  if (!value || value.refund_status !== 'SUCCESS' || value.mchid !== creds.mchid) {
    throw Error('refund merchant or status mismatch');
  }
  const amount = value.amount || {};
  return { appId: creds.appid, outTradeNo: value.out_trade_no, transactionId: value.transaction_id,
    refundId: value.refund_id, outRefundNo: value.out_refund_no, status: value.refund_status,
    totalFen: amount.total, payerTotalFen: amount.payer_total, refundFen: amount.refund,
    // Domestic refund notifications omit currency; this API only supports CNY.
    payerRefundFen: amount.payer_refund, currency: amount.currency || 'CNY' };
}
module.exports = { paymentEvent, refundEvent };
