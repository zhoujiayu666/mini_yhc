const { loginWithPhone, loginWithPhoneCode, saveLocalUser } = require('./user-login.js');
const { formatErrorMessage } = require('./error-format.js');
const { CLOUD_ENV_ID } = require('./cloud-config.js');

/**
 * 统一处理登录结果：写本地、toast/modal、触发回调
 * @returns {Promise<boolean>} 是否登录成功（含本地兜底）
 */
async function runLoginFlow(options = {}) {
  const { phone, code, onSuccess } = options;
  try {
    let result;
    if (code) {
      result = await loginWithPhoneCode(code);
    } else if (phone) {
      result = await loginWithPhone(phone);
    } else {
      throw new Error('缺少登录信息');
    }

    saveLocalUser(result.phone, {
      openid: result.openid,
      localOnly: result.localOnly,
      loginType: result.loginType
    });

    if (result.localOnly) {
      const hint = result.fallbackError || '';
      console.warn('[login] 云端登录失败，已本地登录。环境ID:', CLOUD_ENV_ID, hint);
      await new Promise((resolve) => {
        wx.showModal({
          title: '已本地登录',
          content:
            '云数据库/云函数未就绪，本次仅保存在本机。\n\n请检查：\n1. utils/cloud-config.js 环境ID\n2. users 集合\n3. user-service 已部署',
          showCancel: false,
          confirmText: '知道了',
          complete: resolve
        });
      });
    } else {
      wx.showToast({
        title: result.isNew ? '注册成功' : '登录成功',
        icon: 'success'
      });
    }

    if (typeof onSuccess === 'function') {
      onSuccess(result);
    }
    return true;
  } catch (err) {
    console.error('[login-flow]', err);
    const msg = formatErrorMessage(err, '登录失败，请重试');
    wx.showToast({
      title: msg.length > 22 ? '登录失败，请重试' : msg,
      icon: 'none',
      duration: 2800
    });
    return false;
  }
}

module.exports = {
  runLoginFlow
};
