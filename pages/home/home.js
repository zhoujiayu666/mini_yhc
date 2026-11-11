const tabs = require('../../utils/tabs');
const app = getApp();

/** 设计稿六个入口：透明热区覆盖主视觉底部按钮 */
const MENUS = [
  { id: 'connect', label: '连接设备', url: '/pages/connect-guide/connect-guide' },
  { id: 'seat', label: '座位绑定', url: '/pages/show/show' },
  { id: 'control', label: '控制颜色', url: '/pages/control/control' },
  { id: 'group', label: '设备分组', url: '/pages/room/room' },
  { id: 'shop', label: '线上商城', url: '/pages/all-products/all-products' },
  { id: 'points', label: '积分商城', url: '/pages/member/member' }
];

Page({
  data: {
    menus: MENUS,
    showCommunityPopup: false
  },

  onShow() {
    tabs.sync('home');
    // 每次冷启动进小程序弹一次；同一次会话内切 Tab 回来不再弹
    if (!app.globalData.communityPopupShown) {
      app.globalData.communityPopupShown = true;
      this.setData({ showCommunityPopup: true });
    }
  },

  onCloseCommunityPopup() {
    this.setData({ showCommunityPopup: false });
  },

  noop() {},

  onMenuTap(e) {
    const id = e.currentTarget.dataset.id;
    const item = MENUS.find((m) => m.id === id);
    if (!item) return;
    tabs.open(item.url);
  },

  onShareAppMessage() {
    return {
      title: 'TOPUYI 拓普依 · 专业定制',
      path: '/pages/home/home'
    };
  }
});
