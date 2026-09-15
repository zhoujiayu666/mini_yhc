const WxPay = require('wechatpay-node-v3');

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

function createPayClient() {
  const creds = getPayCredentials();
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
  const creds = getPayCredentials();
  const normalized = Object.fromEntries(Object.entries(headers || {}).map(([key, value]) => [key.toLowerCase(), value]));
  const sig = getNotifyHeaders(normalized);
  if (!sig.timestamp || !sig.nonce || !sig.serial || !sig.signature) return false;
  if (sig.serial.startsWith('PUB_KEY_ID_')) {
    if (sig.serial !== creds.platformPublicKeyId || !creds.platformPublicKey) return false;
    return require('crypto').verify('RSA-SHA256', Buffer.from(sig.timestamp + '\n' + sig.nonce + '\n' + body + '\n'),
      creds.platformPublicKey, Buffer.from(sig.signature, 'base64'));
  }
  const { pay } = createPayClient();
  return pay.verifySign({ ...sig, body });
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

async function queryRefund(outRefundNo) {
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(outRefundNo || '')) throw Error('invalid refund number');
  const { pay } = createPayClient();
  const raw = await pay.find_refunds(outRefundNo);
  return raw && raw.data && typeof raw.data === 'object' ? raw.data : raw;
}
module.exports = {
  getPayCredentials,
  queryRefund,
  verifyNotifySignature,
  decryptNotifyResource
};
