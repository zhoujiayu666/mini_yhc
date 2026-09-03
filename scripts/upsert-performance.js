/**
 * 将演出写入云数据库 performances 集合（新建或按 id 更新）
 * 用法：node scripts/upsert-performance.js [json文件路径]
 */
const fs = require('fs');
const path = require('path');
const cloudbase = require('@cloudbase/node-sdk');
const { checkAndGetCredential } = require('@cloudbase/toolbox');

const ENV_ID = 'cloud1-d4grfezxdaca540d6';
const APP_ID = 'wx3610c3ef05d1131e';

async function main() {
  const jsonPath = process.argv[2] || path.join(__dirname, 'performances', 'topuyi-live-2026.json');
  const performance = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
  const id = String(performance.id || '').trim();
  if (!id) throw new Error('缺少演出 id');

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
  await db.createCollection('performances').catch((err) => {
    const msg = String(err && (err.message || err.errMsg || err));
    if (!msg.includes('already exists') && !msg.includes('collection exists')) {
      console.warn('创建 performances 集合失败，继续尝试写入:', msg);
    }
  });
  const now = Date.now();
  const doc = {
    id,
    name: performance.name,
    date: performance.date,
    time: performance.time,
    venue: performance.venue,
    description: performance.description || '',
    statusText: performance.statusText || '座位绑定开放中',
    status: performance.status || 'published',
    sort: performance.sort ?? 100,
    sourceAppId: APP_ID,
    updatedAt: now
  };

  const existing = await db
    .collection('performances')
    .where({ id, sourceAppId: APP_ID })
    .limit(1)
    .get();
  const hasExisting = existing.data && existing.data.length > 0;

  if (hasExisting) {
    await db.collection('performances').doc(existing.data[0]._id).update(doc);
    console.log(`已更新演出 ${id}：${doc.name}`);
  } else {
    await db.collection('performances').add({
      ...doc,
      createdAt: now
    });
    console.log(`已新增演出 ${id}：${doc.name}`);
  }
}

main().catch((err) => {
  console.error('失败:', err.message || err);
  process.exit(1);
});
