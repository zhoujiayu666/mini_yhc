const bleController = require('./ble.js');
const {
  isTargetBleDevice,
  enrichDeviceIdentity,
  dedupeDevicesByBindId,
  getDeviceBindId
} = require('./ble-device-id.js');
const app = getApp();

const DEVICE_CONNECT_DATA = {
  isScanning: false,
  deviceList: [],
  showDeviceList: false,
  currentDevice: null
};

function attachDeviceConnect(page) {
  const handlers = {
    stopPropagation() {},

    annotateDeviceConnection(devices) {
      if (!devices || !devices.length) {
        return devices || [];
      }
      const isLinked = app.globalData.isConnected || bleController.isConnected;
      const connectedId = (
        bleController.deviceId ||
        (app.globalData.currentDevice && app.globalData.currentDevice.deviceId) ||
        ''
      ).toUpperCase();
      const connectedBind = (
        (app.globalData.currentDevice && app.globalData.currentDevice.bindId) ||
        ''
      ).toUpperCase();
      return devices.map((d) => {
        const enriched = enrichDeviceIdentity(d);
        const sameDeviceId =
          connectedId && (enriched.deviceId || '').toUpperCase() === connectedId;
        const sameBind =
          connectedBind &&
          (enriched.bindId || '').toUpperCase() === connectedBind;
        return {
          ...enriched,
          isConnectedDevice: !!(isLinked && (sameDeviceId || sameBind))
        };
      });
    },

    dedupeDevicesById(devices) {
      return dedupeDevicesByBindId(devices);
    },

    isTargetBleDevice(device) {
      return isTargetBleDevice(device);
    },

    async searchDevices() {
      if (this.data.isScanning) return;
      try {
        await bleController.initBluetoothAdapter().catch(() => {});
        const adapterState = await this.checkBluetoothAdapter();
        if (!adapterState.available) {
          wx.showModal({
            title: '无法使用蓝牙',
            content: adapterState.message || '请先打开蓝牙并检查微信蓝牙权限',
            showCancel: false,
            confirmText: '知道了'
          });
          return;
        }

        this.setData({ isScanning: true, showDeviceList: true, deviceList: [] });

        try {
          const existingDevices = (await bleController.getBluetoothDevices()).filter((d) =>
            isTargetBleDevice(d)
          );
          if (existingDevices.length > 0) {
            const deduped = dedupeDevicesByBindId(existingDevices);
            this.setData({ deviceList: this.annotateDeviceConnection(deduped) });
          }
        } catch (err) {
          console.log('获取已发现设备失败（可能没有）:', err);
        }

        await bleController.startBluetoothDevicesDiscovery();

        wx.onBluetoothDeviceFound((res) => {
          const foundDevices = (res.devices || []).filter((d) => isTargetBleDevice(d));
          // 调试：确认微信返回的厂商数据长度（新固件应为 >=8）
          foundDevices.forEach((d) => {
            const bytes =
              d.advertisData instanceof ArrayBuffer
                ? Array.from(new Uint8Array(d.advertisData))
                : [];
            if (bytes.length) {
              console.log(
                '[BLE] advertisData len=',
                bytes.length,
                'head=',
                bytes
                  .slice(0, 10)
                  .map((b) => b.toString(16).padStart(2, '0'))
                  .join(' ')
              );
            }
          });
          const currentList = this.data.deviceList;
          const newList = [...currentList, ...foundDevices];
          const uniqueList = dedupeDevicesByBindId(newList);
          // RSSI 越大（越接近 0）信号越强，排前面
          uniqueList.sort((a, b) => {
            const rssiA = typeof a.RSSI === 'number' ? a.RSSI : -100;
            const rssiB = typeof b.RSSI === 'number' ? b.RSSI : -100;
            return rssiB - rssiA;
          });
          this.setData({ deviceList: this.annotateDeviceConnection(uniqueList) });
        });

        setTimeout(async () => {
          await bleController.stopBluetoothDevicesDiscovery();
          this.setData({ isScanning: false });
          if (this.data.deviceList.length === 0) {
            wx.showToast({ title: '未发现设备', icon: 'none', duration: 2500 });
          }
        }, 10000);
      } catch (error) {
        console.error('搜索设备失败', error);
        this.setData({ isScanning: false });
        wx.showModal({
          title: '搜索失败',
          content: error.errMsg || '请检查蓝牙状态后重试',
          showCancel: false
        });
      }
    },

    checkBluetoothAdapter() {
      return new Promise((resolve) => {
        wx.getBluetoothAdapterState({
          success: (res) => {
            resolve({
              available: res.available,
              discovering: res.discovering,
              state: res.adapterState
            });
          },
          fail: (err) => {
            resolve({
              available: false,
              message: err.errMsg || '蓝牙未开启',
              errCode: err.errCode
            });
          }
        });
      });
    },

    async connectDevice(e) {
      const { deviceid } = e.currentTarget.dataset;
      const device = this.data.deviceList.find((d) => d.deviceId === deviceid);
      if (!device) return;

      const enriched = enrichDeviceIdentity(device);
      wx.showLoading({ title: '连接中...', mask: true });
      try {
        await bleController.connectDevice(deviceid);
        app.globalData.currentDevice = enriched;
        app.globalData.isConnected = true;
        app.saveDeviceHistory(enriched);
        this.setData({
          showDeviceList: false,
          currentDevice: enriched,
          isConnected: true
        });
        wx.hideLoading();
        wx.showToast({ title: '连接成功', icon: 'success' });
        if (typeof this.refreshDeviceLists === 'function') {
          this.refreshDeviceLists();
        }
      } catch (error) {
        console.error('连接设备失败', error);
        wx.hideLoading();
        wx.showModal({
          title: '连接失败',
          content: error.userMessage || '请确认设备已开启并靠近后重试',
          showCancel: false
        });
      }
    },

    closeDeviceList() {
      this.setData({ showDeviceList: false });
      if (this.data.isScanning) {
        bleController.stopBluetoothDevicesDiscovery();
        this.setData({ isScanning: false });
      }
    },

    async connectDeviceRecord(device) {
      if (!device || !device.deviceId) return;
      const enriched = enrichDeviceIdentity(device);
      wx.showLoading({ title: '连接中...', mask: true });
      try {
        await bleController.connectDevice(device.deviceId);
        app.globalData.currentDevice = enriched;
        app.globalData.isConnected = true;
        app.saveDeviceHistory(enriched);
        this.setData({
          showDeviceList: false,
          currentDevice: enriched,
          isConnected: true
        });
        wx.hideLoading();
        wx.showToast({ title: '连接成功', icon: 'success' });
        if (typeof this.refreshDeviceLists === 'function') {
          this.refreshDeviceLists();
        }
      } catch (error) {
        console.error('连接设备失败', error);
        wx.hideLoading();
        // iOS deviceId 可能已变：提示用户重新添加
        wx.showModal({
          title: '连接失败',
          content:
            error.userMessage ||
            '设备可能已更换系统标识，请点击「添加手灯」重新搜索连接',
          showCancel: false
        });
      }
    },

    onReconnectHistory(e) {
      const { deviceid } = e.currentTarget.dataset;
      const device = (this.data.historyDevices || []).find(
        (d) => d.deviceId === deviceid || d.bindId === deviceid
      );
      if (!device) return;
      this.connectDeviceRecord(device);
    },

    disconnectDevice() {
      wx.showModal({
        title: '断开连接',
        content: '确定要断开当前手灯吗？',
        success: (res) => {
          if (!res.confirm) return;
          const device = app.globalData.currentDevice;
          if (device && device.deviceId) {
            app.saveDeviceHistory(device);
          }
          bleController.disconnect();
          app.globalData.currentDevice = null;
          app.globalData.isConnected = false;
          this.setData({ currentDevice: null, isConnected: false });
          wx.showToast({ title: '已断开', icon: 'success' });
          if (typeof this.refreshDeviceLists === 'function') {
            this.refreshDeviceLists();
          }
        }
      });
    },

    onAddDevice() {
      this.searchDevices();
    },

    onRemoveHistory(e) {
      const { deviceid } = e.currentTarget.dataset;
      if (!deviceid || typeof app.removeDeviceHistory !== 'function') return;
      wx.showModal({
        title: '删除记录',
        content: '从连接历史中删除该设备？',
        success: (res) => {
          if (!res.confirm) return;
          app.removeDeviceHistory(deviceid);
          if (typeof this.refreshDeviceLists === 'function') {
            this.refreshDeviceLists();
          }
          wx.showToast({ title: '已删除', icon: 'success' });
        }
      });
    }
  };

  Object.keys(handlers).forEach((key) => {
    page[key] = handlers[key].bind(page);
  });
}

module.exports = {
  DEVICE_CONNECT_DATA,
  attachDeviceConnect,
  getDeviceBindId
};
