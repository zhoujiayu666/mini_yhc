const app = getApp();
const { TOPUYI_APP_ID } = require('./cloud-config.js');

function saveLocalUser(phone, extra = {}) {
  const userInfo = { phone, ...extra };
  wx.setStorageSync('userInfo', userInfo);
  if (app && app.globalData) {
    app.globalData.userInfo = userInfo;
  }
  return userInfo;
}

/**
 * 云数据库登录（无需部署云函数，集合 users 权限设为「仅创建者可读写」）
 */
async function loginViaDatabase(phone) {
  const db = wx.cloud.database();
  const users = db.collection('users');
  const now = Date.now();
  const existing = await users.limit(1).get();

  if (existing.data && existing.data.length > 0) {
    const patch = { phone, updatedAt: now };
    if (!existing.data[0].sourceAppId && TOPUYI_APP_ID) {
      patch.sourceAppId = TOPUYI_APP_ID;
    }
    await users.doc(existing.data[0]._id).update({ data: patch });
    return { phone, isNew: false, source: 'cloud-db' };
  }

  await users.add({
    data: {
      phone,
      sourceAppId: TOPUYI_APP_ID || undefined,
      createdAt: now,
      updatedAt: now
    }
  });
  return { phone, isNew: true, source: 'cloud-db' };
}

/**
 * 云函数登录（需部署 user-service）
 */
async function loginViaCloudFunction(phone) {
  const res = await wx.cloud.callFunction({
    name: 'user-service',
    data: { action: 'login', phone }
  });
  const result = res.result || {};
  if (!result.success) {
    throw new Error(result.message || '登录失败');
  }
  return {
    phone: result.user.phone,
    openid: result.user.openid,
    isNew: result.user.isNew,
    source: 'cloud-fn'
  };
}

/**
 * 本地登录（云开发不可用时的兜底，便于开发调试）
 */
function loginViaLocal(phone) {
  saveLocalUser(phone, { localOnly: true });
  return { phone, isNew: true, source: 'local', localOnly: true };
}

/**
 * @returns {Promise<{phone:string,isNew:boolean,source:string,localOnly?:boolean}>}
 */
async function loginWithPhone(phone) {
  if (!wx.cloud) {
    return loginViaLocal(phone);
  }

  let lastError = null;

  try {
    return await loginViaCloudFunction(phone);
  } catch (err) {
    lastError = err;
    console.warn('[login] 云函数登录失败，尝试云数据库', err);
  }

  try {
    return await loginViaDatabase(phone);
  } catch (err) {
    lastError = err;
    console.warn('[login] 云数据库登录失败，使用本地登录', err);
  }

  const local = loginViaLocal(phone);
  const errMsg = lastError && (lastError.message || lastError.errMsg || String(lastError));
  local.fallbackError = errMsg;
  if (errMsg && (errMsg.includes('not exist') || errMsg.includes('不存在') || errMsg.includes('-502005'))) {
    local.fallbackError = '数据库 users 集合不存在，请在云开发控制台创建';
  } else if (errMsg && errMsg.includes('Environment not found')) {
    local.fallbackError = '环境ID不匹配，请修改 utils/cloud-config.js';
  } else if (errMsg && errMsg.includes('FunctionName')) {
    local.fallbackError = '云函数 user-service 未部署';
  }
  return local;
}

module.exports = {
  loginWithPhone,
  saveLocalUser
};
