/**

 * TOPUYI 独立云环境（方案 C：与有米分开，不共用云、不打通群数据）

 *

 * 1. 用 TOPUYI 项目打开微信开发者工具 → 云开发 → 创建新环境

 * 2. 云开发控制台 → 设置 → 环境设置 → 复制环境 ID，替换下方 CLOUD_ENV_ID

 * 3. 勿再使用有米环境 cloud1-3g4lff0x2b1fbba7

 */

const CLOUD_ENV_ID = 'cloud1-d4grfezxdaca540d6';



/** 本小程序 AppID */

const TOPUYI_APP_ID = 'wx3610c3ef05d1131e';



function initCloud() {

  if (!wx.cloud) {

    return { ok: false, reason: '当前基础库不支持云开发' };

  }

  if (!CLOUD_ENV_ID || CLOUD_ENV_ID === 'REPLACE_WITH_TOPUYI_ENV_ID') {

    return { ok: false, reason: '请先在 utils/cloud-config.js 填写 TOPUYI 独立云环境 ID' };

  }

  try {

    wx.cloud.init({

      env: CLOUD_ENV_ID,

      traceUser: true

    });

    return { ok: true, env: CLOUD_ENV_ID };

  } catch (error) {

    console.error('云开发初始化失败', error);

    return { ok: false, reason: error.message || '初始化失败' };

  }

}



module.exports = {

  CLOUD_ENV_ID,

  TOPUYI_APP_ID,

  initCloud

};


