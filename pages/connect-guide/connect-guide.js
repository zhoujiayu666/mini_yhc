// pages/connect-guide/connect-guide.js
const app = getApp();

Page({
  goConnect() {
    app.globalData.openDeviceSearchOnControlShow = true;
    wx.reLaunch({ url: '/pages/control/control' });
  }
});
