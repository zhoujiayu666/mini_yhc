const cloud = require('wx-server-sdk');
const { verifyNotifySignature, decryptNotifyResource } = require('./pay-wx-v3');
const { markOrderPaid } = require('./order-paid');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();

function isHttpEvent(event) {
  return !!(event && (event.httpMethod || event.headers));
}

function v3HttpResponse(event, code, message, statusCode) {
  const payload = { code, message };
  if (isHttpEvent(event)) {
    return {
      statusCode: statusCode || (code === 'SUCCESS' ? 200 : 500),
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    };
  }
  return payload;
}

async function handlePaidOrder(outTradeNo, transactionId, totalFen) {
  if (!outTradeNo) {
    return { ok: false, error: 'missing out_trade_no' };
  }

  const found = await db.collection('orders').where({ orderNo: outTradeNo }).limit(1).get();
  const doc = found.data && found.data[0];
  if (!doc) {
    console.error('[pay-notify] order not found', outTradeNo);
    return { ok: false, error: 'order not found' };
  }

  const marked = await markOrderPaid(db, doc, { transactionId, totalFen });
  if (!marked.ok) {
    console.error('[pay-notify] mark failed', outTradeNo, marked.error);
    return { ok: false, error: marked.error };
  }

  console.log('[pay-notify] order paid', outTradeNo, transactionId);
  return { ok: true };
}

async function handleApiV3HttpNotify(event) {
  if (event.httpMethod && event.httpMethod !== 'POST') {
    return v3HttpResponse(event, 'FAIL', 'method not allowed', 405);
  }

  const headers = event.headers || {};
  let body = event.body || '';
  if (event.isBase64Encoded && body) {
    body = Buffer.from(body, 'base64').toString('utf8');
  }

  try {
    const verified = await verifyNotifySignature(headers, body);
    if (!verified) {
      console.error('[pay-notify] signature verify failed');
      return v3HttpResponse(event, 'FAIL', 'signature verify failed', 401);
    }

    const payload = JSON.parse(body || '{}');
    const resource = payload.resource;
    if (!resource) {
      return v3HttpResponse(event, 'FAIL', 'missing resource', 400);
    }

    const decrypted = decryptNotifyResource(resource);
    const tradeState = decrypted.trade_state || '';
    const outTradeNo = decrypted.out_trade_no || '';
    const transactionId = decrypted.transaction_id || '';
    const totalFen = decrypted.amount && decrypted.amount.total;

    if (tradeState !== 'SUCCESS') {
      return v3HttpResponse(event, 'SUCCESS', 'ignored non-success');
    }

    const result = await handlePaidOrder(outTradeNo, transactionId, totalFen);
    if (!result.ok) {
      return v3HttpResponse(event, 'FAIL', result.error || 'handle failed', 500);
    }

    return v3HttpResponse(event, 'SUCCESS', '成功');
  } catch (err) {
    console.error('[pay-notify] v3 http error', err);
    return v3HttpResponse(event, 'FAIL', (err && err.message) || 'error', 500);
  }
}

/**
 * 微信支付 APIv3 结果通知（HTTP 访问服务触发）
 */
exports.main = async (event) => {
  console.log('[pay-notify] event keys', event && Object.keys(event));

  if (isHttpEvent(event)) {
    return handleApiV3HttpNotify(event);
  }

  return { code: 'FAIL', message: '请通过 HTTP 访问服务配置支付回调 URL' };
};
