/**
 * 将商品写入云数据库 products 集合（新建或按 sku 更新）
 * 用法：node scripts/upsert-product.js [json文件路径]
 */
const fs = require('fs');
const path = require('path');
const https = require('https');
const cloudbase = require('@cloudbase/node-sdk');
const { checkAndGetCredential } = require('@cloudbase/toolbox');

const ENV_ID = 'cloud1-d4grfezxdaca540d6';
const APP_ID = 'wx3610c3ef05d1131e';

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

function pickFullImages(urls, limit = 6) {
  const full = urls.filter((u) => /-cib\.jpg$/i.test(u) && !/\d+x\d+/.test(u));
  return [...new Set(full)].slice(0, limit);
}

async function uploadImages(app, sku, urls) {
  const fileIds = [];
  for (let i = 0; i < urls.length; i++) {
    const url = urls[i];
    try {
      const buf = await downloadBuffer(url);
      const res = await app.uploadFile({
        cloudPath: `shop/products/${sku}/${i + 1}.jpg`,
        fileContent: buf
      });
      if (res && res.fileID) {
        fileIds.push(res.fileID);
        console.log(`  图片 ${i + 1} 已上传`);
      }
    } catch (err) {
      console.warn(`  图片 ${i + 1} 上传失败，保留外链:`, err.message || err);
      fileIds.push(url);
    }
  }
  return fileIds;
}

async function main() {
  const jsonPath = process.argv[2] || path.join(__dirname, 'products', 'stick-05.json');
  const product = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));

  const credential = await checkAndGetCredential({ cwd: path.join(__dirname, '..') });
  if (!credential) {
    throw new Error('未登录，请先执行 tcb.cmd login');
  }

  const app = cloudbase.init({
    env: ENV_ID,
    secretId: credential.secretId,
    secretKey: credential.secretKey,
    sessionToken: credential.token
  });
  const db = app.database();
  const sku = String(product.sku || '').trim();
  if (!sku) throw new Error('缺少 sku');

  let images = product.images || [];
  const existing = await db
    .collection('products')
    .where({ sku, sourceAppId: APP_ID })
    .limit(1)
    .get();
  const hasExisting = existing.data && existing.data.length > 0;

  if (product.uploadImages !== false && images.length) {
    const sources = pickFullImages(images, product.imageLimit || 6);
    if (sources.length) {
      console.log(`上传 ${sources.length} 张商品图到云存储...`);
      images = await uploadImages(app, sku, sources);
    }
  } else if (hasExisting) {
    images = existing.data[0].images || images;
  }

  const now = Date.now();
  const doc = {
    sku,
    name: product.name,
    desc: product.desc || '',
    price: product.price,
    originalPrice: product.originalPrice || 0,
    category: product.category || 'stick',
    color: product.color || '#FFD100',
    tag: product.tag || '',
    stock: product.stock ?? 999,
    sort: product.sort ?? 50,
    status: product.status || 'on_sale',
    sourceAppId: APP_ID,
    images,
    specs: product.specs || '',
    detailContent: product.detailContent || '',
    updatedAt: now
  };

  if (hasExisting) {
    await db.collection('products').doc(existing.data[0]._id).update(doc);
    console.log(`已更新商品 ${sku}：${doc.name}`);
  } else {
    await db.collection('products').add({
      ...doc,
      createdAt: now
    });
    console.log(`已上架新商品 ${sku}：${doc.name}`);
  }

  console.log(`售价：¥${(doc.price / 100).toFixed(2)} · 状态：${doc.status}`);
}

main().catch((err) => {
  console.error('失败:', err.message || err);
  process.exit(1);
});
