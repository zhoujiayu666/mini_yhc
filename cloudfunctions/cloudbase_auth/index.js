const cloud = require('wx-server-sdk');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const { TOPUYI_APP_ID } = require('./app-config');

/**
 * 环境共享鉴权云函数（名称必须为 cloudbase_auth，不可改名）。
 * 有米（资源方）部署后，同主体下 TOPUYI 才能跨 App 访问本环境。
 * @see https://developers.weixin.qq.com/miniprogram/dev/wxcloudservice/wxcloud/guide/resource-sharing/guidance.html
 */
exports.main = async (event) => {
  const wxContext = cloud.getWXContext();
  const fromAppId = wxContext.FROM_APPID || '';

  const allowed = !TOPUYI_APP_ID || fromAppId === TOPUYI_APP_ID || fromAppId === wxContext.APPID;

  if (!allowed) {
    return {
      errCode: -1,
      errMsg: `未授权的小程序: ${fromAppId || 'unknown'}`
    };
  }

  return {
    errCode: 0,
    errMsg: '',
    auth: JSON.stringify({
      fromAppId,
      allowed: true
    })
  };
};
