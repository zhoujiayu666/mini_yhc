const app = getApp();
const { CLOUD_ENV_ID, TOPUYI_APP_ID } = require('./cloud-config.js');
const { formatErrorMessage } = require('./error-format.js');

function saveLocalUser(phone, extra = {}) {
  const userInfo = { phone, ...extra };
  wx.setStorageSync('userInfo', userInfo);
  if (app && app.globalData) {
    app.globalData.userInfo = userInfo;
  }
  return userInfo;
}

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

async function callUserService(data) {
  const res = await wx.cloud.callFunction({
    name: 'user-service',
    config: { env: CLOUD_ENV_ID },
    data
  });
  const result = res.result || {};
  if (!result.success) {
    throw new Error(formatErrorMessage(result.message, '登录失败'));
  }
  return result.user;
}

async function loginViaCloudFunction(phone) {
  const user = await callUserService({ action: 'login', phone });
  return {
    phone: user.phone,
    openid: user.openid,
    isNew: user.isNew,
    loginType: user.loginType || 'manual',
    source: 'cloud-fn'
  };
}

async function loginViaCloudFunctionCode(code) {
  const user = await callUserService({ action: 'loginByCode', code });
  return {
    phone: user.phone,
    openid: user.openid,
    isNew: user.isNew,
    loginType: user.loginType || 'wechat',
    source: 'cloud-fn'
  };
}

function loginViaLocal(phone, extra = {}) {
  saveLocalUser(phone, { localOnly: true, ...extra });
  return { phone, isNew: true, source: 'local', localOnly: true, loginType: extra.loginType || 'manual' };
}

function attachFallbackError(local, lastError) {
  let errMsg = formatErrorMessage(lastError, '');
  local.fallbackError = errMsg;
  if (errMsg && (errMsg.includes('not exist') || errMsg.includes('不存在') || errMsg.includes('-502005'))) {
    local.fallbackError = '数据库 users 集合不存在，请在云开发控制台创建';
  } else if (errMsg && errMsg.includes('Environment not found')) {
    local.fallbackError = '环境ID不匹配，请修改 utils/cloud-config.js';
  } else if (errMsg && (errMsg.includes('FunctionName') || errMsg.includes('FUNCTION_NOT_FOUND'))) {
    local.fallbackError = '云函数 user-service 未部署';
  }
  return local;
}

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

  return attachFallbackError(loginViaLocal(phone), lastError);
}

async function loginWithPhoneCode(code) {
  if (!wx.cloud) {
    throw new Error('当前环境不支持微信手机号登录，请改用手动输入');
  }
  return loginViaCloudFunctionCode(code);
}

module.exports = {
  loginWithPhone,
  loginWithPhoneCode,
  saveLocalUser
};
