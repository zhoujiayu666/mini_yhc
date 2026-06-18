const bleController = require('./utils/ble.js');
const { getUserInfo } = require('./utils/auth.js');
const { initCloud: initCloudEnv } = require('./utils/cloud-config.js');

/** 进入后台后延迟断开蓝牙，便于用户去系统设置授权后返回仍保持连接 */
const BG_BLE_DISCONNECT_DELAY_MS = 30000;

App({
  globalData: {
    bleController: bleController,
    currentDevice: null,
    isConnected: false,
    deviceHistory: [], // 连接历史记录
    /** 从连接引导页进入控制页时自动打开搜索设备 */
    openDeviceSearchOnControlShow: false,
    /** 调光页：切页后保留亮度、预设、色轮 */
    colorControlState: null,
    userInfo: null
  },

  onLaunch() {
    console.log('小程序启动');
    const userInfo = getUserInfo();
    if (userInfo) {
      this.globalData.userInfo = userInfo;
    }
    this.initCloud();
    this.getDeviceHistory();
    this._wrapBleDisconnectForHistory();
    // 初始化蓝牙适配器
    this.initBluetooth();
  },

  /** 任意路径断开蓝牙前，确保当前设备写入连接历史 */
  _wrapBleDisconnectForHistory() {
    const originalDisconnect = bleController.disconnect.bind(bleController);
    bleController.disconnect = () => {
      const device = this.globalData.currentDevice;
      if (device && device.deviceId) {
        this.saveDeviceHistory(device);
      }
      return originalDisconnect();
    };
  },

  onHide() {
    console.log('小程序进入后台');
    if (this._bgBleDisconnectTimer) {
      clearTimeout(this._bgBleDisconnectTimer);
      this._bgBleDisconnectTimer = null;
    }
    if (!this.globalData.isConnected) {
      return;
    }
    const device = this.globalData.currentDevice;
    if (device && device.deviceId) {
      this.saveDeviceHistory(device);
    }
    this._bgBleDisconnectTimer = setTimeout(() => {
      this._bgBleDisconnectTimer = null;
      if (!this.globalData.isConnected) {
        return;
      }
      console.log('后台超时，断开蓝牙连接');
      bleController.disconnect();
      this.globalData.isConnected = false;
      this.globalData.currentDevice = null;
    }, BG_BLE_DISCONNECT_DELAY_MS);
  },

  onShow() {
    console.log('小程序进入前台');
    if (this._bgBleDisconnectTimer) {
      clearTimeout(this._bgBleDisconnectTimer);
      this._bgBleDisconnectTimer = null;
    }
  },

  initCloud() {
    const result = initCloudEnv();
    if (result.ok) {
      console.log('云开发初始化完成，环境:', result.env);
    } else {
      console.warn('云开发不可用:', result.reason);
    }
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
   * 保存设备连接历史（先合并本地已存记录，避免冷启动后覆盖丢失）
   */
  saveDeviceHistory(device) {
    if (!device || !device.deviceId) {
      return;
    }

    const stored = this.getDeviceHistory() || [];
    const history = stored.slice();
    const index = history.findIndex((d) => d.deviceId === device.deviceId);

    const record = {
      deviceId: device.deviceId,
      name: device.name || device.localName || '',
      localName: device.localName || device.name || '',
      lastConnectTime: Date.now()
    };

    if (index >= 0) {
      history[index] = { ...history[index], ...record };
    } else {
      history.push(record);
    }

    history.sort((a, b) => (b.lastConnectTime || 0) - (a.lastConnectTime || 0));

    if (history.length > 10) {
      history.splice(10);
    }

    this.globalData.deviceHistory = history;
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
