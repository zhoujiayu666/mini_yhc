const DEFAULT_SHARE = {
  title: 'TOPUYI 拓普依智能灯光',
  path: '/pages/control/control'
};

function showShareMenu() {
  if (!wx.showShareMenu) return;
  wx.showShareMenu({
    withShareTicket: true,
    menus: ['shareAppMessage', 'shareTimeline']
  });
}

function getShareMessage(options = {}) {
  return {
    title: options.title || DEFAULT_SHARE.title,
    path: options.path || DEFAULT_SHARE.path
  };
}

function getTimelineShare(options = {}) {
  return {
    title: options.title || DEFAULT_SHARE.title,
    query: options.query || ''
  };
}

module.exports = {
  showShareMenu,
  getShareMessage,
  getTimelineShare
};
