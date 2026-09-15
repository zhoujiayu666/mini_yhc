const { createDecipheriv, createHash } = require('crypto');
const { parseStringPromise } = require('xml2js');
async function parse(xml, root) {
  if (/<!DOCTYPE|<!ENTITY/i.test(xml)) throw Error('XML declarations forbidden');
  const parsed = await parseStringPromise(xml, { explicitArray: false, trim: true, strict: true });
  const data = parsed[root];
  if (!data || typeof data !== 'object') throw Error('invalid refund XML');
  for (const value of Object.values(data)) if (typeof value !== 'string') throw Error('duplicate or nested XML fields');
  return data;
}
async function decodeRefundV2(xml, creds) {
  const envelope = await parse(xml, 'xml');
  if (envelope.return_code !== 'SUCCESS' || envelope.appid !== creds.appid || envelope.mch_id !== creds.mchid) {
    throw Error('refund XML merchant mismatch');
  }
  const key = String(process.env.WX_PAY_API_V2_KEY || '');
  if (key.length !== 32) { const error = Error('V2 refund callback key missing'); error.code = 'REFUND_V2_KEY_MISSING'; throw error; }
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(envelope.req_info || '')) throw Error('invalid refund ciphertext');
  const derived = createHash('md5').update(key).digest('hex');
  const cipher = createDecipheriv('aes-256-ecb', Buffer.from(derived), null);
  const plaintext = Buffer.concat([cipher.update(Buffer.from(envelope.req_info, 'base64')), cipher.final()]).toString('utf8');
  const data = await parse(plaintext, 'root');
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(data.out_refund_no || '')) throw Error('invalid refund number');
  return data;
}
module.exports = { decodeRefundV2 };
