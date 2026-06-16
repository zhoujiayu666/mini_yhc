const cloud = require('wx-server-sdk');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();
const _ = db.command;

const { YOUMI_APP_ID } = require('./app-config');

const COLLECTIONS = ['groups', 'group_members', 'users'];
const BATCH_SIZE = 100;
const DEFAULT_SECRET = 'topuyi-migrate-app-scope-change-me';

function missingSourceAppIdFilter() {
  return _.or([
    { sourceAppId: _.exists(false) },
    { sourceAppId: '' },
    { sourceAppId: null }
  ]);
}

async function countMissing(collectionName) {
  const res = await db.collection(collectionName).where(missingSourceAppIdFilter()).count();
  return res.total || 0;
}

async function backfillCollection(collectionName, youmiAppId, dryRun) {
  let updated = 0;
  let scanned = 0;
  let hasMore = true;

  while (hasMore) {
    const res = await db
      .collection(collectionName)
      .where(missingSourceAppIdFilter())
      .limit(BATCH_SIZE)
      .get();
    const docs = res.data || [];
    if (!docs.length) {
      hasMore = false;
      break;
    }

    scanned += docs.length;
    for (const doc of docs) {
      if (!dryRun) {
        await db.collection(collectionName).doc(doc._id).update({
          data: { sourceAppId: youmiAppId }
        });
      }
      updated += 1;
    }

    if (docs.length < BATCH_SIZE) {
      hasMore = false;
    }
  }

  return { collection: collectionName, scanned, updated };
}

exports.main = async (event) => {
  const action = event.action || 'status';
  const secret = event.secret || '';
  const youmiAppId = (event.youmiAppId || '').trim();
  const expectedSecret = process.env.MIGRATE_SECRET || DEFAULT_SECRET;

  if (secret !== expectedSecret) {
    return { success: false, message: '未授权：secret 不正确' };
  }

  if (action === 'status') {
    const counts = {};
    for (const name of COLLECTIONS) {
      counts[name] = await countMissing(name);
    }
    return {
      success: true,
      message: '统计完成',
      counts,
      hint: '确认后使用 action=backfill 且 dryRun=true 试跑，再 dryRun=false 正式写入'
    };
  }

  if (action === 'verify') {
    const counts = {};
    const youmiTagged = {};
    for (const name of COLLECTIONS) {
      counts[name] = await countMissing(name);
      const tagged = await db.collection(name).where({ sourceAppId: YOUMI_APP_ID }).count();
      youmiTagged[name] = tagged.total || 0;
    }
    const ok = Object.values(counts).every((n) => n === 0);
    return {
      success: true,
      ok,
      counts,
      youmiTagged,
      message: ok ? '全部文档已带 sourceAppId' : '仍有文档缺少 sourceAppId，请执行 backfill'
    };
  }

  if (action === 'backfill') {
    const targetAppId = youmiAppId || YOUMI_APP_ID;
    if (!targetAppId) {
      return { success: false, message: '请传入 youmiAppId 或在 app-config.js 配置 YOUMI_APP_ID' };
    }

    const dryRun = event.dryRun !== false;
    const results = [];
    for (const name of COLLECTIONS) {
      results.push(await backfillCollection(name, targetAppId, dryRun));
    }

    return {
      success: true,
      dryRun,
      youmiAppId: targetAppId,
      results,
      message: dryRun
        ? '试跑完成，未写入数据库。确认无误后传 dryRun:false 正式执行。'
        : 'backfill 完成，请在有米与 TOPUYI 双端做群控冒烟。'
    };
  }

  return { success: false, message: '未知 action，支持 status / backfill' };
};
