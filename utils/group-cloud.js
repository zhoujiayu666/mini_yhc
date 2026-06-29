const { initCloud, CLOUD_ENV_ID } = require('./cloud-config.js');
const { formatErrorMessage } = require('./error-format.js');

const GROUP_SERVICE_NAME = 'group-service';

function ensureCloud() {
  if (!wx.cloud) {
    return { ok: false, message: '当前微信版本不支持云开发，请升级微信' };
  }
  const result = initCloud();
  if (!result.ok) {
    return { ok: false, message: result.reason || '云开发未初始化' };
  }
  return { ok: true, env: result.env || CLOUD_ENV_ID };
}

function parseCloudError(error) {
  const errMsg = formatErrorMessage(error, '');

  if (
    errMsg.includes('FunctionName') ||
    errMsg.includes('FUNCTION_NOT_FOUND') ||
    errMsg.includes('-501000') ||
    errMsg.includes('云函数不存在')
  ) {
    return [
      '云函数 group-service 未部署到当前环境。',
      '',
      `请确认环境：${CLOUD_ENV_ID}`,
      '在微信开发者工具中：',
      'cloudfunctions/group-service → 右键',
      '「上传并部署：云端安装依赖」'
    ].join('\n');
  }

  if (errMsg.includes('Environment not found') || errMsg.includes('env check invalid')) {
    return `云环境 ${CLOUD_ENV_ID} 不可用，请检查 cloud-config.js 与开发者工具关联的云环境是否一致。`;
  }

  if (
    errMsg.includes('collection not exists') ||
    errMsg.includes('-502005') ||
    errMsg.includes('Db or Table not exist') ||
    errMsg.includes('集合不存在')
  ) {
    return [
      '云数据库集合未创建。',
      '',
      '请在云开发控制台 → 数据库新建：',
      '• groups',
      '• group_members'
    ].join('\n');
  }

  if (errMsg.includes('-404011') || errMsg.includes('没有权限')) {
    return '云开发权限不足，请检查数据库集合权限（建议 groups、group_members 设为「仅管理端可读写」）。';
  }

  return errMsg.length > 80 ? `${errMsg.slice(0, 80)}…` : errMsg || '网络或服务异常，请稍后重试';
}

/**
 * @param {object} payload 传给 group-service 的 data
 * @returns {Promise<{success:boolean,message?:string,[key:string]:any}>}
 */
async function callGroupService(payload) {
  const ready = ensureCloud();
  if (!ready.ok) {
    return { success: false, message: ready.message };
  }

  console.log('[group-cloud] call', GROUP_SERVICE_NAME, payload);

  try {
    const res = await wx.cloud.callFunction({
      name: GROUP_SERVICE_NAME,
      config: {
        env: CLOUD_ENV_ID
      },
      data: payload
    });
    const result = res.result || { success: false, message: '云函数无返回数据' };
    if (result.message != null) {
      result.message = formatErrorMessage(result.message);
    }
    console.log('[group-cloud] response', result);
    return result;
  } catch (error) {
    console.error('[group-cloud] callFunction failed', error);
    return { success: false, message: parseCloudError(error) };
  }
}

function showGroupError(title, message) {
  const text = formatErrorMessage(message);
  if (text.length > 28 || text.includes('\n')) {
    wx.showModal({
      title,
      content: text,
      showCancel: false,
      confirmText: '知道了'
    });
    return;
  }
  wx.showToast({ title: text, icon: 'none', duration: 2800 });
}

module.exports = {
  ensureCloud,
  callGroupService,
  parseCloudError,
  showGroupError
};
