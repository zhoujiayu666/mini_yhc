/**
 * 将 Error / 微信 API 响应 / 云函数返回值转为可读字符串，避免界面出现 [object Object]
 */
function formatErrorMessage(value, fallback = '操作失败') {
  if (value == null || value === '') {
    return fallback;
  }
  if (typeof value === 'string') {
    return value;
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  if (value instanceof Error) {
    return formatErrorMessage(value.message, fallback);
  }
  if (value.response && value.response.data) {
    return formatErrorMessage(value.response.data, fallback);
  }

  const msg = value.message;
  if (typeof msg === 'string' && msg) {
    return msg;
  }
  if (typeof msg === 'object' && msg != null) {
    const nested = formatErrorMessage(msg, '');
    if (nested) {
      return nested;
    }
  }

  const errMsg = value.errMsg;
  if (typeof errMsg === 'string' && errMsg) {
    return errMsg;
  }

  const code = value.code;
  const detail = value.detail || value.reason || value.errmsg;
  if (code != null && detail) {
    return `${code}: ${detail}`;
  }
  if (typeof code === 'string' && code) {
    return code;
  }

  try {
    const json = JSON.stringify(value);
    if (json && json !== '{}') {
      return json.length > 160 ? `${json.slice(0, 160)}…` : json;
    }
  } catch (e) {
    // ignore
  }

  return fallback;
}

module.exports = {
  formatErrorMessage
};
