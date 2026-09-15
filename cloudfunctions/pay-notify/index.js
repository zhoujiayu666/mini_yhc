const cloud = require('wx-server-sdk');
const { verifyNotifySignature, decryptNotifyResource, getPayCredentials, queryRefund } = require('./pay-wx-v3');
const { markOrderPaid, markOrderRefunded } = require('./member-points');
const { paymentEvent, refundEvent } = require('./payment-events');
const { decodeRefundV2 } = require('./refund-v2');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
function response(xml, success, statusCode = success ? 200 : 500) {
  return { statusCode, headers: { 'Content-Type': xml ? 'application/xml; charset=utf-8' : 'application/json' },
    body: xml ? `<xml><return_code>${success ? 'SUCCESS' : 'FAIL'}</return_code><return_msg>${success ? 'OK' : 'RETRY'}</return_msg></xml>` :
      JSON.stringify({ code: success ? 'SUCCESS' : 'FAIL', message: success ? 'OK' : 'notification not processed' }) };
}
async function findOrder(orderNo, appId) {
  if (!orderNo) throw Error('missing order number');
  const result = await db.collection('orders').where({ orderNo, sourceAppId: appId }).limit(1).get();
  if (!result.data || !result.data[0]) throw Error('order not found');
  return result.data[0];
}
exports.main = async event => {
  if (!event || (!event.httpMethod && !event.headers)) return { code: 'FAIL', message: 'HTTP notification required' };
  let body = event.body || '';
  if (event.isBase64Encoded) body = Buffer.from(body, 'base64').toString('utf8');
  const xml = typeof body === 'string' && body.trim().startsWith('<');
  if (event.httpMethod && event.httpMethod !== 'POST') return response(xml, false, 405);
  if (typeof body !== 'string' || Buffer.byteLength(body) > 1024 * 1024) return response(xml, false, 400);
  try {
    const creds = getPayCredentials();
    if (xml) {
      const decoded = await decodeRefundV2(body, creds);
      if (decoded.refund_status !== 'SUCCESS') return response(true, true);
      // Confirm with WeChat before ledger writes; encrypted XML alone never changes points.
      const verified = await queryRefund(decoded.out_refund_no);
      if (verified.status !== 'SUCCESS' || verified.refund_id !== decoded.refund_id ||
        verified.transaction_id !== decoded.transaction_id || verified.out_trade_no !== decoded.out_trade_no ||
        verified.out_refund_no !== decoded.out_refund_no) throw Error('refund query mismatch');
      const refund = refundEvent({ ...verified, refund_status: verified.status, mchid: creds.mchid }, creds);
      await markOrderRefunded(db, await findOrder(refund.outTradeNo, refund.appId), refund);
      return response(true, true);
    }
    if (!await verifyNotifySignature(event.headers || {}, body)) return response(false, false, 401);
    const payload = JSON.parse(body);
    if (!payload.resource || payload.resource.algorithm !== 'AEAD_AES_256_GCM') throw Error('invalid resource');
    const data = decryptNotifyResource(payload.resource);
    if (payload.event_type === 'TRANSACTION.SUCCESS') {
      const payment = paymentEvent(data, creds);
      await markOrderPaid(db, await findOrder(payment.outTradeNo, payment.appId), payment);
    } else if (payload.event_type === 'REFUND.SUCCESS') {
      const refund = refundEvent(data, creds);
      await markOrderRefunded(db, await findOrder(refund.outTradeNo, refund.appId), refund);
    } else if (!['REFUND.CLOSED', 'REFUND.ABNORMAL'].includes(payload.event_type)) {
      throw Error('unsupported notification');
    }
    return response(false, true);
  } catch (error) {
    // Do not log decrypted payloads, payer identifiers, or key material.
    console.error('[pay-notify] processing failed', error.code || 'NOTIFY_RETRY');
    return response(xml, false);
  }
};
