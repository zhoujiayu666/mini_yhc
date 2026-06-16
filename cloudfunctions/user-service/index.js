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

    if (action === 'login') {
      const phone = normalizePhone(event.phone);
      if (!isValidPhone(phone)) {
        return { success: false, message: '请输入正确的11位手机号' };
      }

      const users = db.collection('users');
      const existing = await users.where({ openid }).limit(1).get();
      const now = Date.now();

      if (existing.data && existing.data.length > 0) {
        const userDoc = existing.data[0];
        const patch = { phone, updatedAt: now };
        if (!userDoc.sourceAppId) {
          patch.sourceAppId = appId;
        }
        await users.doc(userDoc._id).update({ data: patch });
        return {
          success: true,
          user: { openid, phone, isNew: false, sourceAppId: userDoc.sourceAppId || appId }
        };
      }

      await users.add({
        data: {
          openid,
          sourceAppId: appId,
          phone,
          createdAt: now,
          updatedAt: now
        }
      });

      return {
        success: true,
        user: { openid, phone, isNew: true, sourceAppId: appId }
      };
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
    return { success: false, message: msg };
  }
};
