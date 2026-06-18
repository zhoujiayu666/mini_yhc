const bleController = require('../../utils/ble.js');
const { requireLogin } = require('../../utils/auth.js');
const { DEVICE_CONNECT_DATA, attachDeviceConnect } = require('../../utils/device-connect.js');
const {
  MAX_NAME_LEN,
  getCustomName,
  setCustomName,
  getBleDefaultName,
  getDeviceDisplayName
} = require('../../utils/device-name.js');
const app = getApp();

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
      if (!connected && app.globalData.currentDevice) {
        app.saveDeviceHistory(app.globalData.currentDevice);
      }
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
    const history = app.getDeviceHistory() || [];
    let isConnected = app.globalData.isConnected || bleController.isConnected;
    let currentDevice = app.globalData.currentDevice;

    if (isConnected && !currentDevice && bleController.deviceId) {
      const fromHistory = history.find((d) => d.deviceId === bleController.deviceId);
      currentDevice = fromHistory || {
        deviceId: bleController.deviceId,
        name: '',
        localName: ''
      };
      app.globalData.currentDevice = currentDevice;
      app.globalData.isConnected = true;
    }

    const connectedId = (currentDevice && currentDevice.deviceId) || '';

    const myDevices = [];
    if (isConnected && currentDevice) {
      myDevices.push({
        ...currentDevice,
        displayName: getDeviceDisplayName(currentDevice),
        bleName: getBleDefaultName(currentDevice),
        customName: getCustomName(currentDevice.deviceId),
        statusText: '已连接'
      });
    }

    const historyDevices = history
      .filter((d) => d.deviceId !== connectedId)
      .map((d) => ({
        ...d,
        displayName: getDeviceDisplayName(d),
        bleName: getBleDefaultName(d),
        customName: getCustomName(d.deviceId),
        lastConnectText: formatLastConnect(d.lastConnectTime)
      }));

    this.setData({
      isConnected,
      currentDevice,
      myDevices,
      historyDevices
    });
  },

  findDeviceById(deviceId) {
    const { currentDevice, myDevices, historyDevices } = this.data;
    if (currentDevice && currentDevice.deviceId === deviceId) {
      return currentDevice;
    }
    const inMy = myDevices.find((d) => d.deviceId === deviceId);
    if (inMy) {
      return inMy;
    }
    const inHistory = historyDevices.find((d) => d.deviceId === deviceId);
    if (inHistory) {
      return inHistory;
    }
    return { deviceId };
  },

  onDeviceLongPress(e) {
    const deviceId = e.currentTarget.dataset.deviceid;
    if (!deviceId) {
      return;
    }

    const device = this.findDeviceById(deviceId);
    const custom = getCustomName(deviceId);
    const bleName = getBleDefaultName(device);
    const currentLabel = custom || bleName;

    wx.showModal({
      title: '重命名手灯',
      editable: true,
      placeholderText: `最多${MAX_NAME_LEN}字，留空恢复蓝牙名`,
      content: currentLabel,
      success: (res) => {
        if (!res.confirm) {
          return;
        }
        const next = String(res.content || '').trim();
        if (next.length > MAX_NAME_LEN) {
          wx.showToast({ title: `名称最多${MAX_NAME_LEN}字`, icon: 'none' });
          return;
        }
        setCustomName(deviceId, next);
        if (!next) {
          wx.showToast({ title: '已恢复蓝牙名称', icon: 'none' });
        } else {
          wx.showToast({ title: '名称已保存', icon: 'success' });
        }
        this.refreshDeviceLists();
      }
    });
  }
});
