const cloud = require('wx-server-sdk');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();
const { docInScope } = require('./app-scope');

function normalizePhone(phone) {
  return String(phone || '').replace(/\s/g, '').trim();
}

function isValidPhone(phone) {
  return /^1\d{10}$/.test(phone);
}

async function resolvePhoneFromCode(code) {
  const res = await cloud.openapi.phonenumber.getPhoneNumber({ code });
  const errCode = res.errCode != null ? res.errCode : res.errcode;
  if (errCode !== 0) {
    throw new Error(res.errMsg || res.errmsg || '获取手机号失败');
  }
  const info = res.phone_info || res.phoneInfo || {};
  const phone = normalizePhone(info.purePhoneNumber || info.phoneNumber || '');
  if (!isValidPhone(phone)) {
    throw new Error('未获取到有效手机号');
  }
  return phone;
}

async function upsertUserByPhone({ openid, appId, phone }) {
  const users = db.collection('users');
  const existing = await users.where({ openid }).limit(1).get();
  const now = Date.now();

  if (existing.data && existing.data.length > 0) {
    const userDoc = existing.data[0];
    const patch = { phone, updatedAt: now, loginType: 'phone' };
    if (!userDoc.sourceAppId) {
      patch.sourceAppId = appId;
    }
    await users.doc(userDoc._id).update({ data: patch });
    return {
      openid,
      phone,
      isNew: false,
      sourceAppId: userDoc.sourceAppId || appId
    };
  }

  await users.add({
    data: {
      openid,
      sourceAppId: appId,
      phone,
      loginType: 'phone',
      createdAt: now,
      updatedAt: now
    }
  });

  return {
    openid,
    phone,
    isNew: true,
    sourceAppId: appId
  };
}

exports.main = async (event) => {
  try {
    const wxContext = cloud.getWXContext();
    const openid = wxContext.OPENID;
    const appId = wxContext.APPID;
    const action = event.action || 'login';

    if (!openid) {
      return { success: false, message: '无法获取用户身份' };
    }
    if (!appId) {
      return { success: false, message: '无法识别小程序身份' };
    }

    if (action === 'loginByCode') {
      const code = String(event.code || '').trim();
      if (!code) {
        return { success: false, message: '缺少手机号授权凭证' };
      }

      let phone;
      try {
        phone = await resolvePhoneFromCode(code);
      } catch (err) {
        console.error('[user-service] loginByCode', err);
        const msg = (err && err.message) || '微信手机号授权失败';
        if (msg.includes('40029') || msg.includes('invalid code')) {
          return { success: false, message: '授权已过期，请重新点击授权' };
        }
        if (msg.includes('1400001')) {
          return { success: false, message: '手机号验证额度不足，请在公众平台付费管理充值' };
        }
        return { success: false, message: msg };
      }

      const user = await upsertUserByPhone({ openid, appId, phone });
      return { success: true, user: { ...user, loginType: 'wechat' } };
    }

    if (action === 'login') {
      const phone = normalizePhone(event.phone);
      if (!isValidPhone(phone)) {
        return { success: false, message: '请输入正确的11位手机号' };
      }

      const user = await upsertUserByPhone({ openid, appId, phone });
      return { success: true, user: { ...user, loginType: 'manual' } };
    }

    if (action === 'profile') {
      const res = await db.collection('users').where({ openid }).limit(1).get();
      if (!res.data || !res.data.length) {
        return { success: false, message: '用户未注册' };
      }
      const u = res.data[0];
      if (!docInScope(u, appId)) {
        return { success: false, message: '用户未注册' };
      }
      return {
        success: true,
        user: { openid, phone: u.phone, sourceAppId: u.sourceAppId || appId }
      };
    }

    return { success: false, message: '未知操作' };
  } catch (err) {
    console.error('[user-service]', err);
    const msg = (err && err.message) || '服务异常';
    if (msg.includes('collection not exists') || msg.includes('Db or Table not exist')) {
      return { success: false, message: '请先在云开发控制台创建 users 集合' };
    }
    if (msg.includes('openapi') || msg.includes('phonenumber')) {
      return {
        success: false,
        message: '云函数未开通手机号接口权限，请重新部署 user-service（含 config.json）'
      };
    }
    return { success: false, message: msg };
  }
};
