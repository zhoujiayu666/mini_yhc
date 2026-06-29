const WxPay = require('wechatpay-node-v3');
const { formatErrorMessage } = require('./error-format');

const { PAY_NOTIFY_URL_PLACEHOLDER } = require('./app-config');
const DEFAULT_APP_ID = 'wx3610c3ef05d1131e';
const DEFAULT_MCH_ID = '1747313210';

function normalizePem(value) {
  if (!value) return '';
  return String(value).replace(/\\n/g, '\n').trim();
}

function getPayCredentials() {
  const appid = String(process.env.WX_PAY_APP_ID || DEFAULT_APP_ID).trim();
  const mchid = String(
    process.env.WX_PAY_MCH_ID || process.env.WX_PAY_SUB_MCH_ID || DEFAULT_MCH_ID
  ).trim();
  const serialNo = String(process.env.WX_MCH_SERIAL_NO || '').trim();
  const apiV3Key = String(process.env.WX_API_V3_KEY || '').trim();
  const privateKey = normalizePem(process.env.WX_MCH_PRIVATE_KEY || '');
  const notifyUrl = String(process.env.PAY_NOTIFY_URL || '').trim();
  const platformPublicKey = normalizePem(process.env.WX_PLATFORM_PUBLIC_KEY || '');
  const platformPublicKeyId = String(process.env.WX_PLATFORM_PUBLIC_KEY_ID || '').trim();

  return {
    appid,
    mchid,
    serialNo,
    apiV3Key,
    privateKey,
    notifyUrl,
    platformPublicKey,
    platformPublicKeyId
  };
}

function missingPayCoreConfig(creds) {
  const missing = [];
  if (!creds.mchid) missing.push('WX_PAY_MCH_ID');
  if (!creds.serialNo) missing.push('WX_MCH_SERIAL_NO');
  if (!creds.apiV3Key) missing.push('WX_API_V3_KEY');
  if (!creds.privateKey) missing.push('WX_MCH_PRIVATE_KEY');
  if (!creds.platformPublicKey) missing.push('WX_PLATFORM_PUBLIC_KEY');
  if (!creds.platformPublicKeyId) missing.push('WX_PLATFORM_PUBLIC_KEY_ID');
  return missing;
}

function resolveNotifyUrl(creds) {
  if (creds.notifyUrl) {
    return creds.notifyUrl;
  }
  const placeholder = String(
    process.env.PAY_NOTIFY_URL_PLACEHOLDER || PAY_NOTIFY_URL_PLACEHOLDER || ''
  ).trim();
  return placeholder;
}

function missingPayConfig(creds) {
  return missingPayCoreConfig(creds);
}

function unwrapPayResult(result) {
  if (!result) return null;
  if (result.data && typeof result.data === 'object') return result.data;
  return result;
}

/**
 * wechatpay-node-v3 不同版本返回格式不一致：
 * - 有的返回 { prepay_id }
 * - 有的直接返回 wx.requestPayment 所需字段
 */
function normalizeWxPayment(data, pay) {
  if (!data || typeof data !== 'object') {
    return null;
  }

  const timeStamp = data.timeStamp || data.timestamp;
  const paySign = data.paySign || data.pay_sign;
  if (data.package && paySign && timeStamp) {
    return {
      appId: data.appId || data.appid,
      timeStamp: String(timeStamp),
      nonceStr: data.nonceStr || data.noncestr,
      package: data.package,
      signType: data.signType || data.sign_type || 'RSA',
      paySign
    };
  }

  let prepayId = data.prepay_id;
  if (!prepayId && typeof data.package === 'string' && data.package.indexOf('prepay_id=') === 0) {
    prepayId = data.package.slice('prepay_id='.length);
  }

  if (prepayId && pay && typeof pay.getPayParams === 'function') {
    return pay.getPayParams({ prepay_id: prepayId });
  }

  return null;
}

function createPayClient() {
  const creds = getPayCredentials();
  const missing = missingPayConfig(creds);
  if (missing.length) {
    const err = new Error(
      `微信支付 APIv3 未配置完整，缺少：${missing.join('、')}。见 scripts/SHOP_PAY_API_V3_SETUP.md`
    );
    err.code = 'PAY_CONFIG_MISSING';
    err.missing = missing;
    throw err;
  }

  const opts = {
    appid: creds.appid,
    mchid: creds.mchid,
    privateKey: creds.privateKey,
    key: creds.apiV3Key,
    serial_no: creds.serialNo,
    publicKey: creds.platformPublicKey,
    wxPayPublicKeyId: creds.platformPublicKeyId
  };

  return { pay: new WxPay(opts), creds };
}

async function createJsapiOrder({ openid, outTradeNo, description, totalFen }) {
  const { pay, creds } = createPayClient();
  const notifyUrl = resolveNotifyUrl(creds);
  if (!creds.notifyUrl) {
    console.warn('[pay-wx-v3] PAY_NOTIFY_URL 未配置，使用占位地址；支付结果依赖 syncPayment 查单');
  }
  const raw = await pay.transactions_jsapi({
    description: String(description || 'TOPUYI周边商品').slice(0, 127),
    out_trade_no: outTradeNo,
    notify_url: notifyUrl,
    amount: {
      total: totalFen,
      currency: 'CNY'
    },
    payer: { openid }
  });

  const data = unwrapPayResult(raw);
  const payment = normalizeWxPayment(data, pay);
  if (!payment) {
    const detail = (data && (data.message || data.code)) || JSON.stringify(raw || {});
    throw new Error(`未获取到支付参数：${detail}`);
  }

  let prepayId = data && data.prepay_id;
  if (!prepayId && payment.package && payment.package.indexOf('prepay_id=') === 0) {
    prepayId = payment.package.slice('prepay_id='.length);
  }

  return { payment, prepayId };
}

async function queryOrderByOutTradeNo(outTradeNo) {
  const { pay } = createPayClient();
  const raw = await pay.query({ out_trade_no: outTradeNo });
  return unwrapPayResult(raw) || {};
}

function getNotifyHeaders(headers) {
  const h = headers || {};
  return {
    timestamp: h['wechatpay-timestamp'] || h['Wechatpay-Timestamp'] || '',
    nonce: h['wechatpay-nonce'] || h['Wechatpay-Nonce'] || '',
    serial: h['wechatpay-serial'] || h['Wechatpay-Serial'] || '',
    signature: h['wechatpay-signature'] || h['Wechatpay-Signature'] || ''
  };
}

async function verifyNotifySignature(headers, body) {
  const { pay } = createPayClient();
  const sig = getNotifyHeaders(headers);
  return pay.verifySign({
    timestamp: sig.timestamp,
    nonce: sig.nonce,
    body,
    serial: sig.serial,
    signature: sig.signature
  });
}

function decryptNotifyResource(resource) {
  const { pay, creds } = createPayClient();
  const plaintext = pay.decipher_gcm(
    resource.ciphertext,
    resource.associated_data,
    resource.nonce,
    creds.apiV3Key
  );
  return typeof plaintext === 'string' ? JSON.parse(plaintext) : plaintext;
}

module.exports = {
  getPayCredentials,
  missingPayConfig,
  createPayClient,
  createJsapiOrder,
  queryOrderByOutTradeNo,
  verifyNotifySignature,
  decryptNotifyResource
};
