/**
 * 打开当前页挂载的半屏登录弹层；找不到时跳转登录页
 */
function showLoginSheet(options = {}) {
  const pages = getCurrentPages();
  const page = pages[pages.length - 1];
  if (page && page._loginSheetHost && typeof page._loginSheetHost.openLoginSheet === 'function') {
    page._loginSheetHost.openLoginSheet(options);
    return true;
  }
  const query = options.message ? `?hint=${encodeURIComponent(options.message)}` : '';
  wx.navigateTo({ url: `/pages/login/login${query}` });
  return false;
}

module.exports = {
  showLoginSheet
};
