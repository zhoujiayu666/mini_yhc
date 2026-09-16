const KEY = 'topuyi_hidden_order_ids_v1';

function read() {
  try {
    const ids = wx.getStorageSync(KEY);
    return Array.isArray(ids) ? ids.filter(Boolean) : [];
  } catch (_) {
    return [];
  }
}

function hide(id) {
  if (!id) return;
  const ids = read();
  if (ids.includes(id)) return;
  ids.push(id);
  try {
    wx.setStorageSync(KEY, ids.slice(-200));
  } catch (_) {}
}

function visible(orders) {
  const hidden = new Set(read());
  return (orders || []).filter((o) => o && o.id && !hidden.has(o.id));
}

function isUnsupported(message) {
  const text = String(message || '');
  return (
    text.includes('未知操作') ||
    text.includes('未知错误') ||
    text.includes('deleteOrder') ||
    text.includes('不支持此')
  );
}

module.exports = { read, hide, visible, isUnsupported };
