// pages/settings/settings.js
Page({
  /**
   * 页面的初始数据
   */
  data: {
    deviceName: 'MetaLumic 设备',
    firmwareVersion: 'v1.0.0',
    autoConnect: true,
    notifications: true
  },

  /**
   * 生命周期函数--监听页面加载
   */
  onLoad(options) {

  },

  /**
   * 自动连接开关
   */
  toggleAutoConnect(e) {
    this.setData({
      autoConnect: e.detail.value
    });
    // TODO: 保存设置到本地存储
    wx.setStorageSync('autoConnect', e.detail.value);
  },

  /**
   * 通知开关
   */
  toggleNotifications(e) {
    this.setData({
      notifications: e.detail.value
    });
    // TODO: 保存设置到本地存储
    wx.setStorageSync('notifications', e.detail.value);
  },

  /**
   * 关于
   */
  showAbout() {
    wx.showModal({
      title: '关于 MetaLumic',
      content: 'MetaLumic 智能灯光控制系统\n\n版本：v1.0.0\n\n一款专业的智能灯光控制小程序',
      showCancel: false,
      confirmText: '知道了'
    });
  },

  /**
   * 清除缓存
   */
  clearCache() {
    wx.showModal({
      title: '清除缓存',
      content: '确定要清除所有缓存数据吗？',
      success: (res) => {
        if (res.confirm) {
          wx.clearStorageSync();
          wx.showToast({
            title: '缓存已清除',
            icon: 'success'
          });
        }
      }
    });
  }
})
