/** 修复误写入 data 嵌套字段的商品记录 */
const cloudbase = require('@cloudbase/node-sdk');
const { checkAndGetCredential } = require('@cloudbase/toolbox');
const path = require('path');

const ENV_ID = 'cloud1-d4grfezxdaca540d6';

async function main() {
  const credential = await checkAndGetCredential({ cwd: path.join(__dirname, '..') });
  const app = cloudbase.init({
    env: ENV_ID,
    secretId: credential.secretId,
    secretKey: credential.secretKey,
    sessionToken: credential.token
  });
  const db = app.database();
  const res = await db.collection('products').get();
  let fixed = 0;
  for (const doc of res.data || []) {
    if (doc.sku || !doc.data || typeof doc.data !== 'object') continue;
    const flat = { ...doc.data, updatedAt: Date.now() };
    await db.collection('products').doc(doc._id).set(flat);
    console.log('已修复:', flat.sku, flat.name);
    fixed += 1;
  }
  console.log(fixed ? `共修复 ${fixed} 条` : '无需修复');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
