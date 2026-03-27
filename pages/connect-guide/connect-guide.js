// pages/connect-guide/connect-guide.js
const app = getApp();

Page({
  goConnect() {
    app.globalData.openDeviceSearchOnIndexShow = true;
    wx.redirectTo({
      url: '/pages/index/index',
      fail: () => {
        wx.reLaunch({ url: '/pages/index/index' });
      }
    });
  }
});
