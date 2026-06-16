const bleController = require('../../utils/ble.js');
const { requireLogin } = require('../../utils/auth.js');
const { DEVICE_CONNECT_DATA, attachDeviceConnect } = require('../../utils/device-connect.js');
const app = getApp();

function formatDeviceName(device) {
  if (!device) return '未知设备';
  return device.name || device.localName || device.deviceId || '未知设备';
}

function formatLastConnect(time) {
  if (!time) return '';
  const diff = Date.now() - time;
  if (diff < 60000) return '刚刚连接';
  if (diff < 3600000) return `${Math.floor(diff / 60000)} 分钟前`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)} 小时前`;
  const d = new Date(time);
  return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

Page({
  data: {
    ...DEVICE_CONNECT_DATA,
    isConnected: false,
    myDevices: [],
    historyDevices: []
  },

  onLoad() {
    attachDeviceConnect(this);
    this._prevConnectionHandler = bleController.onConnectionStateChange;
    bleController.onConnectionStateChange = (connected) => {
      app.globalData.isConnected = connected;
      if (!connected) {
        app.globalData.currentDevice = null;
      }
      this.refreshDeviceLists();
      if (typeof this._prevConnectionHandler === 'function') {
        this._prevConnectionHandler(connected);
      }
    };
  },

  onShow() {
    if (!requireLogin()) return;
    this.refreshDeviceLists();
  },

  onUnload() {
    if (this._prevConnectionHandler) {
      bleController.onConnectionStateChange = this._prevConnectionHandler;
    }
  },

  refreshDeviceLists() {
    const isConnected = app.globalData.isConnected || bleController.isConnected;
    const currentDevice = app.globalData.currentDevice;
    const history = app.getDeviceHistory() || [];
    const connectedId = (currentDevice && currentDevice.deviceId) || '';

    const myDevices = [];
    if (isConnected && currentDevice) {
      myDevices.push({
        ...currentDevice,
        displayName: formatDeviceName(currentDevice),
        statusText: '已连接'
      });
    }

    const historyDevices = history
      .filter((d) => d.deviceId !== connectedId)
      .map((d) => ({
        ...d,
        displayName: formatDeviceName(d),
        lastConnectText: formatLastConnect(d.lastConnectTime)
      }));

    this.setData({
      isConnected,
      currentDevice,
      myDevices,
      historyDevices
    });
  }
});
