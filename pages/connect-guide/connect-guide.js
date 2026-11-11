// pages/connect-guide/connect-guide.js
const app = getApp();

Page({
  goConnect() {
    app.globalData.openDeviceSearchOnControlShow = true;
    wx.navigateTo({
      url: '/pages/control/control',
      fail: () => wx.redirectTo({ url: '/pages/control/control' })
    });
  }
});
