/**
 * 从 1688 抓取主图 + 详情长图并写入商品
 * 用法：node scripts/sync-1688-images.js <offerId> <sku>
 */
const fs = require('fs');
const path = require('path');
const https = require('https');
const cloudbase = require('@cloudbase/node-sdk');
const { checkAndGetCredential } = require('@cloudbase/toolbox');

const ENV_ID = 'cloud1-d4grfezxdaca540d6';
const APP_ID = 'wx3610c3ef05d1131e';

function fetchText(url) {
  return new Promise((resolve, reject) => {
    https
      .get(url, { headers: { 'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X)' } }, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          fetchText(res.headers.location).then(resolve).catch(reject);
          return;
        }
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
      })
      .on('error', reject);
  });
}

function pickFullImages(urls) {
  return [...new Set(urls)].filter(
    (u) => /-cib\.(jpg|jpeg|png|webp)/i.test(u) && !/\.(220x220|310x310|search|summ)\./i.test(u)
  );
}

async function extract1688Images(offerId) {
  const html = await fetchText(`https://m.1688.com/offer/${offerId}.html`);
  const imgRe = /https:\/\/cbu01\.alicdn\.com\/[^"'\\]+/g;
  const all = [...html.matchAll(imgRe)].map((m) => m[0]);
  const carousel = pickFullImages(all.filter((u) => u.includes('/ibank/')));
  const descMatch = html.match(/"detailUrl"\s*:\s*"([^"]+)"/);
  let detail = [];
  if (descMatch) {
    const descUrl = descMatch[1].replace(/\\u002F/g, '/');
    const descHtml = await fetchText(descUrl);
    const descImgs = [...descHtml.matchAll(imgRe)].map((m) => m[0]);
    detail = pickFullImages(descImgs.filter((u) => u.includes('/ibank/')));
  }
  return { carousel, detail };
}

function downloadBuffer(url) {
  return new Promise((resolve, reject) => {
    https
      .get(url, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          downloadBuffer(res.headers.location).then(resolve).catch(reject);
          return;
        }
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => resolve(Buffer.concat(chunks)));
      })
      .on('error', reject);
  });
}

async function uploadList(app, sku, urls, prefix) {
  const fileIds = [];
  for (let i = 0; i < urls.length; i++) {
    const buf = await downloadBuffer(urls[i]);
    const res = await app.uploadFile({
      cloudPath: `shop/products/${sku}/${prefix}-${i + 1}.jpg`,
      fileContent: buf
    });
    fileIds.push(res.fileID);
    console.log(`  上传 ${prefix} ${i + 1}/${urls.length}`);
  }
  return fileIds;
}

async function main() {
  const offerId = process.argv[2] || '1002822308790';
  const sku = process.argv[3] || 'stick-05';
  console.log(`抓取 1688 offer ${offerId} ...`);
  const { carousel, detail } = await extract1688Images(offerId);
  console.log(`主图 ${carousel.length} 张，详情图 ${detail.length} 张`);

  const credential = await checkAndGetCredential({ cwd: path.join(__dirname, '..') });
  const app = cloudbase.init({
    env: ENV_ID,
    secretId: credential.secretId,
    secretKey: credential.secretKey,
    sessionToken: credential.token
  });
  const db = app.database();

  console.log('上传到云存储...');
  const images = await uploadList(app, sku, carousel, 'main');
  const detailImages = await uploadList(app, sku, detail, 'detail');

  const existing = await db.collection('products').where({ sku, sourceAppId: APP_ID }).limit(1).get();
  if (!existing.data || !existing.data.length) {
    throw new Error(`商品 ${sku} 不存在，请先上架商品`);
  }

  await db.collection('products').doc(existing.data[0]._id).update({
    images,
    detailImages,
    updatedAt: Date.now()
  });

  console.log(`已更新 ${sku}：主图 ${images.length} 张，详情图 ${detailImages.length} 张`);
}

main().catch((e) => {
  console.error('失败:', e.message || e);
  process.exit(1);
});
