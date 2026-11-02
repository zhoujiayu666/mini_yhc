const cloud = require('wx-server-sdk');
const https = require('https');
const { WX_PAY_MCH_ID, TOPUYI_APP_ID } = require('./app-config');

const EXPRESS_NAMES = {
  ZTO: '中通快递',
  YTO: '圆通速递',
  YD: '韵达快递',
  STO: '申通快递',
  SF: '顺丰速运',
  EMS: 'EMS',
  YZPY: '邮政快递包裹',
  JD: '京东快递',
  JTSD: '极兔速递',
  CNSD: '菜鸟速递',
  DB: '德邦快递',
  DBKD: '德邦快递',
  HTKY: '百世快递',
  HHTT: '天天快递',
  ANEKY: '安能物流'
};

function expressName(code) {
  const id = String(code || '').trim();
  if (!id) return '';
  if (/[\u4e00-\u9fa5]/.test(id)) return id;
  return EXPRESS_NAMES[id.toUpperCase()] || id;
}

function postJson(url, body) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body || {});
    const u = new URL(url);
    const req = https.request(
      {
        hostname: u.hostname,
        path: `${u.pathname}${u.search}`,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(data)
        },
        timeout: 8000
      },
      (res) => {
        let chunks = '';
        res.on('data', (c) => {
          chunks += c;
        });
        res.on('end', () => {
          try {
            resolve(JSON.parse(chunks));
          } catch (e) {
            resolve({ errcode: -1, errmsg: chunks || 'invalid json' });
          }
        });
      }
    );
    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('物流查询超时'));
    });
    req.write(data);
    req.end();
  });
}

function getJson(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { timeout: 8000 }, (res) => {
      let chunks = '';
      res.on('data', (c) => {
        chunks += c;
      });
      res.on('end', () => {
        try {
          resolve(JSON.parse(chunks));
        } catch (e) {
          resolve({ errcode: -1, errmsg: chunks || 'invalid json' });
        }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('token 超时'));
    });
  });
}

async function pickToken(res) {
  if (!res) return '';
  return res.accessToken || res.access_token || (res.token && res.token.accessToken) || '';
}

async function getAccessToken() {
  const openapi = cloud.openapi || {};
  const calls = [];
  if (openapi.auth && typeof openapi.auth.getAccessToken === 'function') {
    calls.push(() => openapi.auth.getAccessToken({}));
  }
  if (typeof openapi.getAccessToken === 'function') {
    calls.push(() => openapi.getAccessToken({}));
  }
  for (const fn of calls) {
    try {
      const token = await pickToken(await fn());
      if (token) return token;
    } catch (err) {
      console.error('[wx-shipping] token', err && (err.errMsg || err.message));
    }
  }
  const secret = process.env.WX_APP_SECRET || process.env.APP_SECRET || process.env.APPSECRET || '';
  const appId = process.env.WX_APPID || process.env.APPID || TOPUYI_APP_ID || '';
  if (secret && appId) {
    const data = await getJson(
      `https://api.weixin.qq.com/cgi-bin/token?grant_type=client_credential&appid=${encodeURIComponent(appId)}&secret=${encodeURIComponent(secret)}`
    );
    if (data && data.access_token) return data.access_token;
  }
  return '';
}

async function callOpenApiGetOrder(payload) {
  const openapi = cloud.openapi || {};
  const nested = openapi.wxa && openapi.wxa.sec && openapi.wxa.sec.order && openapi.wxa.sec.order.getOrder;
  const tries = [];
  if (typeof nested === 'function') tries.push(() => nested(payload));
  if (openapi.order && typeof openapi.order.getOrder === 'function') tries.push(() => openapi.order.getOrder(payload));
  if (openapi.sec && openapi.sec.order && typeof openapi.sec.order.getOrder === 'function') {
    tries.push(() => openapi.sec.order.getOrder(payload));
  }
  if (typeof openapi.request === 'function') {
    tries.push(() =>
      openapi.request({
        method: 'POST',
        path: '/wxa/sec/order/get_order',
        data: payload
      })
    );
  }
  for (const fn of tries) {
    try {
      const res = await fn();
      if (res && (!res.errcode || res.errcode === 0)) return res;
      console.error('[wx-shipping] openapi', res && (res.errmsg || res.errcode));
    } catch (err) {
      console.error('[wx-shipping] openapi', err && (err.errMsg || err.message));
    }
  }
  return null;
}

function payloadsFor(order) {
  const mchId = String(WX_PAY_MCH_ID || process.env.WX_PAY_MCH_ID || '');
  const orderNo = String(order.orderNo || '');
  const transactionId = String(order.transactionId || '').trim();
  const list = [];
  if (mchId && orderNo) list.push({ merchant_id: mchId, merchant_trade_no: orderNo });
  if (transactionId) list.push({ transaction_id: transactionId });
  return list;
}

async function queryWxOrderShipping(order) {
  for (const payload of payloadsFor(order)) {
    let res = await callOpenApiGetOrder(payload);
    if (!res || (res.errcode && res.errcode !== 0)) {
      try {
        const token = await getAccessToken();
        if (token) {
          res = await postJson(
            `https://api.weixin.qq.com/wxa/sec/order/get_order?access_token=${encodeURIComponent(token)}`,
            payload
          );
        }
      } catch (err) {
        console.error('[wx-shipping] http', err && err.message);
      }
    }
    if (res && (!res.errcode || res.errcode === 0) && (res.order || res.shipping || res.order_state || res.orderState)) {
      return res.order || res;
    }
  }
  return null;
}

function parseWxShipping(wxOrder) {
  if (!wxOrder) return null;
  const shipping = wxOrder.shipping || {};
  const list = shipping.shipping_list || shipping.shippingList || [];
  const first = list[0] || {};
  const trackingNo = String(first.tracking_no || first.trackingNo || wxOrder.tracking_no || '').trim();
  const expressCompany = expressName(first.express_company || first.expressCompany || wxOrder.express_company || '');
  const state = Number(wxOrder.order_state || wxOrder.orderState || 0);
  const rawTraces = first.path || first.trace_list || shipping.trace_list || [];
  const traces = (Array.isArray(rawTraces) ? rawTraces : [])
    .map((t) => ({
      time: t.time || t.accept_time || t.acceptTime || '',
      desc: t.desc || t.accept_station || t.acceptStation || t.status || ''
    }))
    .filter((t) => t.desc);
  if (!trackingNo && !state && !traces.length) return null;
  return {
    trackingNo,
    expressCompany,
    state,
    traces,
    lastDesc: traces.length ? traces[0].desc : ''
  };
}

async function syncOrderShipping(db, doc) {
  if (!doc || !doc._id) return doc;
  if (doc.status !== 'paid' && doc.status !== 'shipped') return doc;
  const parsed = parseWxShipping(await queryWxOrderShipping(doc));
  if (!parsed) return doc;
  const now = Date.now();
  const patch = {};
  if (parsed.trackingNo && parsed.trackingNo !== doc.trackingNo) patch.trackingNo = parsed.trackingNo;
  if (parsed.expressCompany && parsed.expressCompany !== doc.expressCompany) {
    patch.expressCompany = parsed.expressCompany;
  }
  if (parsed.lastDesc && parsed.lastDesc !== doc.logisticsDesc) patch.logisticsDesc = parsed.lastDesc;
  if (parsed.traces && parsed.traces.length) patch.logisticsTraces = parsed.traces.slice(0, 10);
  const shipped = parsed.state >= 2 && parsed.state !== 5;
  if (parsed.state >= 3 && parsed.state !== 5 && doc.status !== 'completed') {
    patch.status = 'completed';
    if (!doc.completedAt) patch.completedAt = now;
  } else if ((shipped || parsed.trackingNo) && (doc.status === 'paid' || doc.status === 'shipped')) {
    if (doc.status === 'paid') patch.status = 'shipped';
    if (!doc.shippedAt) patch.shippedAt = now;
  }
  const next = { ...doc, ...patch };
  if (!Object.keys(patch).length) return next;
  patch.updatedAt = now;
  try {
    await db.collection('orders').doc(doc._id).update({ data: patch });
  } catch (err) {
    console.error('[wx-shipping] update', err && err.message);
  }
  return { ...next, updatedAt: now };
}

async function syncOrdersShipping(db, docs) {
  const need = (docs || []).filter((d) => d && (d.status === 'paid' || d.status === 'shipped'));
  const map = new Map();
  await Promise.all(
    need.slice(0, 8).map(async (d) => {
      map.set(d._id, await syncOrderShipping(db, d));
    })
  );
  return (docs || []).map((d) => map.get(d._id) || d);
}

module.exports = { syncOrderShipping, syncOrdersShipping };
