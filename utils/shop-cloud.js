const { initCloud, CLOUD_ENV_ID } = require('./cloud-config.js');
const { formatErrorMessage } = require('./error-format.js');

const SHOP_SERVICE_NAME = 'shop-service';

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

function parseShopError(error) {
  const errMsg = formatErrorMessage(error, '');

  if (
    errMsg.includes('FunctionName') ||
    errMsg.includes('FUNCTION_NOT_FOUND') ||
    errMsg.includes('-501000') ||
    errMsg.includes('云函数不存在')
  ) {
    return [
      '云函数 shop-service 未部署到当前环境。',
      '',
      `请确认环境：${CLOUD_ENV_ID}`,
      'cloudfunctions/shop-service → 右键',
      '「上传并部署：云端安装依赖」'
    ].join('\n');
  }

  if (errMsg.includes('Environment not found') || errMsg.includes('env check invalid')) {
    return `云环境 ${CLOUD_ENV_ID} 不可用，请检查 cloud-config.js`;
  }

  if (
    errMsg.includes('collection not exists') ||
    errMsg.includes('-502005') ||
    errMsg.includes('Db or Table not exist')
  ) {
    return '请先在云开发控制台创建 products、orders、addresses 集合';
  }

  if (errMsg.includes('-504002') || errMsg.includes('functions execute fail')) {
    const detailMatch = errMsg.match(/errMsg:\s*([^|]+)/);
    const detail = detailMatch ? detailMatch[1].trim() : '';
    if (detail && !detail.startsWith('...')) {
      return detail.length > 120 ? `${detail.slice(0, 120)}…` : detail;
    }
    return [
      '云函数 shop-service 执行失败。',
      '请右键 shop-service → 上传并部署：云端安装依赖',
      '并在云开发控制台查看云函数日志'
    ].join('\n');
  }

  return errMsg.length > 80 ? `${errMsg.slice(0, 80)}…` : errMsg || '网络或服务异常';
}

async function callShopService(payload) {
  const ready = ensureCloud();
  if (!ready.ok) {
    return { success: false, message: ready.message };
  }

  try {
    const res = await wx.cloud.callFunction({
      name: SHOP_SERVICE_NAME,
      config: { env: CLOUD_ENV_ID },
      data: payload
    });
    const result = res.result || { success: false, message: '云函数无返回数据' };
    if (result.message != null) {
      result.message = formatErrorMessage(result.message);
    }
    return result;
  } catch (error) {
    console.error('[shop-cloud] failed', error);
    return { success: false, message: parseShopError(error) };
  }
}

function showShopError(title, message) {
  const text = formatErrorMessage(message);
  if (text.length > 28 || text.includes('\n')) {
    wx.showModal({ title, content: text, showCancel: false, confirmText: '知道了' });
    return;
  }
  wx.showToast({ title: text, icon: 'none', duration: 2800 });
}

module.exports = {
  ensureCloud,
  callShopService,
  parseShopError,
  showShopError
};
