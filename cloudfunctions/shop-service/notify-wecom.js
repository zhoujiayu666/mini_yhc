const https = require('https');
const { WECOM_ORDER_WEBHOOK_KEY } = require('./app-config');

const WECOM_WEBHOOK_BASE = 'https://qyapi.weixin.qq.com/cgi-bin/webhook/send';

function getWebhookKey() {
  return (
    process.env.WECOM_ORDER_WEBHOOK_KEY ||
    process.env.WECOM_WEBHOOK_KEY ||
    WECOM_ORDER_WEBHOOK_KEY ||
    ''
  ).trim();
}

function fenToYuan(fen) {
  const n = Number(fen);
  if (!Number.isFinite(n)) return '0.00';
  return (n / 100).toFixed(2);
}

function formatAddress(addr) {
  if (!addr || typeof addr !== 'object') return '（无地址）';
  const region = [addr.province, addr.city, addr.district].filter(Boolean).join('');
  const detail = addr.detail || '';
  const name = addr.name || '';
  const phone = addr.phone || '';
  return `${name} ${phone}\n${region}${detail}`.trim();
}

function formatOrderItems(items) {
  if (!Array.isArray(items) || !items.length) return '（无商品）';
  return items
    .map((it) => {
      const qty = it.qty || 1;
      const name = it.name || it.sku || '商品';
      return `- ${name} ×${qty}  ¥${fenToYuan(it.lineAmount != null ? it.lineAmount : (it.unitPrice || 0) * qty)}`;
    })
    .join('\n');
}

/**
 * 支付成功 → 待发货通知（推荐：在 pay-notify 或订单标 paid 后调用）
 */
function buildPaidOrderMarkdown(order) {
  const orderNo = order.orderNo || order._id || '-';
  const payAmount = fenToYuan(order.payAmount != null ? order.payAmount : order.totalAmount);
  const items = formatOrderItems(order.items);
  const address = formatAddress(order.addressSnapshot);
  const remark = (order.remark || '').trim();
  const paidAt = order.paidAt
    ? new Date(order.paidAt).toLocaleString('zh-CN', { hour12: false })
    : new Date().toLocaleString('zh-CN', { hour12: false });

  const lines = [
    '## 新订单 · 待发货',
    `> **订单号** ${orderNo}`,
    `> **实付** ¥${payAmount}`,
    `> **支付时间** ${paidAt}`,
    '',
    '**商品**',
    items,
    '',
    '**收货信息**',
    address
  ];
  if (remark) {
    lines.push('', `**备注** ${remark}`);
  }
  lines.push('', '请在云开发控制台 `orders` 集合发货，或打开管理后台处理。');
  return lines.join('\n');
}

/**
 * 仅创建未支付（可选，易刷屏，默认不用）
 */
function buildPendingPayMarkdown(order) {
  const orderNo = order.orderNo || order._id || '-';
  const payAmount = fenToYuan(order.payAmount != null ? order.payAmount : order.totalAmount);
  return [
    '## 新下单 · 待支付',
    `> **订单号** ${orderNo}`,
    `> **应付** ¥${payAmount}`,
    '',
    '用户尚未完成支付，请留意是否随后到账。'
  ].join('\n');
}

function postJson(url, body) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
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
        res.on('data', (chunk) => {
          chunks += chunk;
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
      reject(new Error('企业微信 webhook 请求超时'));
    });
    req.write(data);
    req.end();
  });
}

/**
 * @param {string} content markdown 正文
 * @param {string} [webhookKey] 不传则用环境变量 / app-config
 * @returns {Promise<{ok:boolean,skipped?:boolean,result?:object,error?:string}>}
 */
async function sendWecomMarkdown(content, webhookKey) {
  const key = (webhookKey || getWebhookKey()).trim();
  if (!key) {
    console.warn('[wecom] 未配置 WECOM_ORDER_WEBHOOK_KEY，跳过推送');
    return { ok: true, skipped: true };
  }

  const url = `${WECOM_WEBHOOK_BASE}?key=${encodeURIComponent(key)}`;
  try {
    const result = await postJson(url, {
      msgtype: 'markdown',
      markdown: { content }
    });
    if (result.errcode === 0) {
      return { ok: true, result };
    }
    console.error('[wecom] 推送失败', result);
    return { ok: false, error: result.errmsg || `errcode ${result.errcode}`, result };
  } catch (err) {
    console.error('[wecom] 请求异常', err);
    return { ok: false, error: (err && err.message) || String(err) };
  }
}

/**
 * 支付成功通知（运营发货用）
 */
async function notifyPaidOrder(order, webhookKey) {
  const content = buildPaidOrderMarkdown(order);
  return sendWecomMarkdown(content, webhookKey);
}

/**
 * 待支付通知（可选）
 */
async function notifyPendingPayOrder(order, webhookKey) {
  const content = buildPendingPayMarkdown(order);
  return sendWecomMarkdown(content, webhookKey);
}

module.exports = {
  getWebhookKey,
  buildPaidOrderMarkdown,
  buildPendingPayMarkdown,
  sendWecomMarkdown,
  notifyPaidOrder,
  notifyPendingPayOrder
};
