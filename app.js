// app.js
const bleController = require('./utils/ble.js');

App({
  globalData: {
    bleController: bleController,
    currentDevice: null,
    isConnected: false,
    deviceHistory: [] // 连接历史记录
  },

  onLaunch() {
    console.log('小程序启动');
    // 初始化蓝牙适配器
    this.initBluetooth();
  },

  onHide() {
    console.log('小程序进入后台，断开蓝牙连接');
    // 进入后台时断开蓝牙连接，避免连接状态异常影响下次连接
    if (this.globalData.isConnected) {
      bleController.disconnect();
      this.globalData.isConnected = false;
      this.globalData.currentDevice = null;
    }
  },

  onShow() {
    console.log('小程序进入前台');
  },

  /**
   * 初始化蓝牙
   */
  async initBluetooth() {
    try {
      await bleController.initBluetoothAdapter();
      console.log('蓝牙适配器初始化成功');
    } catch (error) {
      console.error('蓝牙适配器初始化失败', error);
      
      // Windows 平台不支持蓝牙调试，提示用户使用真机调试
      if (error.errMsg && error.errMsg.includes('Mac 以外的平台')) {
        console.warn('提示：Windows 平台不支持蓝牙调试，请使用真机调试功能');
        // 不显示错误提示，避免影响开发体验
      }
    }
  },

  /**
   * 保存设备连接历史
   */
  saveDeviceHistory(device) {
    const history = this.globalData.deviceHistory;
    const index = history.findIndex(d => d.deviceId === device.deviceId);
    
    if (index >= 0) {
      // 更新现有记录
      history[index] = {
        ...device,
        lastConnectTime: Date.now()
      };
    } else {
      // 添加新记录
      history.push({
        ...device,
        lastConnectTime: Date.now()
      });
    }
    
    // 按连接时间排序
    history.sort((a, b) => b.lastConnectTime - a.lastConnectTime);
    
    // 最多保存10条记录
    if (history.length > 10) {
      history.splice(10);
    }
    
    // 保存到本地存储
    wx.setStorageSync('deviceHistory', history);
  },

  /**
   * 获取设备连接历史
   */
  getDeviceHistory() {
    try {
      const history = wx.getStorageSync('deviceHistory') || [];
      this.globalData.deviceHistory = history;
      return history;
    } catch (error) {
      console.error('获取设备历史失败', error);
      return [];
    }
  }
})
