/** 与 utils/error-format.js 保持一致，供云函数侧使用 */
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
