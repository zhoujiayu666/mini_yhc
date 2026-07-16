const bleController = require('./ble.js');
const protocol = require('./protocol.js');
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
      return devices.map((d) => ({
        ...d,
        isConnectedDevice: !!(
          isLinked &&
          connectedId &&
          (d.deviceId || '').toUpperCase() === connectedId
        )
      }));
    },

    dedupeDevicesById(devices) {
      const map = {};
      (devices || []).forEach((d) => {
        const id = (d.deviceId || '').toUpperCase();
        if (!id) return;
        const prev = map[id];
        if (!prev) {
          map[id] = d;
          return;
        }
        const prevRssi = typeof prev.RSSI === 'number' ? prev.RSSI : -999;
        const nextRssi = typeof d.RSSI === 'number' ? d.RSSI : -999;
        const prevScore =
          (prev.name ? 1 : 0) + (prev.localName ? 1 : 0) + (prev.advertisData ? 1 : 0);
        const nextScore =
          (d.name ? 1 : 0) + (d.localName ? 1 : 0) + (d.advertisData ? 1 : 0);
        if (nextRssi > prevRssi || (nextRssi === prevRssi && nextScore > prevScore)) {
          map[id] = { ...prev, ...d };
        } else {
          map[id] = { ...d, ...prev };
        }
      });
      return Object.values(map);
    },

    normalizeUuid(uuid) {
      return String(uuid || '').replace(/-/g, '').toUpperCase();
    },

    arrayBufferToBytes(buffer) {
      if (!buffer) return [];
      if (buffer instanceof ArrayBuffer) return Array.from(new Uint8Array(buffer));
      if (buffer.buffer instanceof ArrayBuffer) {
        return Array.from(new Uint8Array(buffer.buffer, buffer.byteOffset || 0, buffer.byteLength));
      }
      return [];
    },

    advertisDataHasTargetService(advertisData) {
      const bytes = this.arrayBufferToBytes(advertisData);
      let index = 0;

      while (index < bytes.length) {
        const len = bytes[index];
        if (!len) break;
        const typeIndex = index + 1;
        const dataIndex = index + 2;
        const nextIndex = index + len + 1;
        if (typeIndex >= bytes.length || nextIndex > bytes.length) break;

        const type = bytes[typeIndex];
        const dataLen = len - 1;

        // Incomplete/complete list of 16-bit Service UUIDs.
        if ((type === 0x02 || type === 0x03) && dataLen >= 2) {
          for (let i = dataIndex; i + 1 < dataIndex + dataLen; i += 2) {
            if (bytes[i] === 0xe0 && bytes[i + 1] === 0xff) {
              return true;
            }
          }
        }

        // Incomplete/complete list of 128-bit Service UUIDs.
        if ((type === 0x06 || type === 0x07) && dataLen >= 16) {
          for (let i = dataIndex; i + 15 < dataIndex + dataLen; i += 16) {
            const isBaseUuid =
              bytes[i] === 0xfb &&
              bytes[i + 1] === 0x34 &&
              bytes[i + 2] === 0x9b &&
              bytes[i + 3] === 0x5f &&
              bytes[i + 4] === 0x80 &&
              bytes[i + 5] === 0x00 &&
              bytes[i + 6] === 0x00 &&
              bytes[i + 7] === 0x80 &&
              bytes[i + 8] === 0x00 &&
              bytes[i + 9] === 0x10 &&
              bytes[i + 10] === 0x00 &&
              bytes[i + 11] === 0x00 &&
              bytes[i + 12] === 0xe0 &&
              bytes[i + 13] === 0xff &&
              bytes[i + 14] === 0x00 &&
              bytes[i + 15] === 0x00;
            if (isBaseUuid) {
              return true;
            }
          }
        }

        index = nextIndex;
      }

      return false;
    },

    isTargetBleDevice(device) {
      const targetService = this.normalizeUuid(protocol.BLE_SERVICE_ID);
      const serviceUuids = device.advertisServiceUUIDs || device.serviceUUIDs || [];
      const hasServiceMatch = serviceUuids.some((u) => {
        const nu = this.normalizeUuid(u);
        return nu === targetService || nu.includes('FFE0');
      });
      if (hasServiceMatch) return true;
      if (this.advertisDataHasTargetService(device.advertisData)) return true;
      const deviceId = (device.deviceId || '').toUpperCase();
      return deviceId.startsWith('84:AA:A4');
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
            this.isTargetBleDevice(d)
          );
          if (existingDevices.length > 0) {
            const deduped = this.dedupeDevicesById(existingDevices);
            this.setData({ deviceList: this.annotateDeviceConnection(deduped) });
          }
        } catch (err) {
          console.log('获取已发现设备失败（可能没有）:', err);
        }

        await bleController.startBluetoothDevicesDiscovery();

        wx.onBluetoothDeviceFound((res) => {
          const foundDevices = (res.devices || []).filter((d) => this.isTargetBleDevice(d));
          const currentList = this.data.deviceList;
          const newList = [...currentList];
          foundDevices.forEach((device) => {
            const index = newList.findIndex((d) => d.deviceId === device.deviceId);
            if (index >= 0) {
              newList[index] = { ...newList[index], ...device };
            } else {
              newList.push(device);
            }
          });
          const uniqueList = this.dedupeDevicesById(newList);
          uniqueList.sort((a, b) => {
            const rssiA = a.RSSI || -100;
            const rssiB = b.RSSI || -100;
            return rssiA - rssiB;
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

      wx.showLoading({ title: '连接中...', mask: true });
      try {
        await bleController.connectDevice(deviceid);
        app.globalData.currentDevice = device;
        app.globalData.isConnected = true;
        app.saveDeviceHistory(device);
        this.setData({
          showDeviceList: false,
          currentDevice: device,
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
      wx.showLoading({ title: '连接中...', mask: true });
      try {
        await bleController.connectDevice(device.deviceId);
        app.globalData.currentDevice = device;
        app.globalData.isConnected = true;
        app.saveDeviceHistory(device);
        this.setData({
          showDeviceList: false,
          currentDevice: device,
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

    onReconnectHistory(e) {
      const { deviceid } = e.currentTarget.dataset;
      const device = (this.data.historyDevices || []).find((d) => d.deviceId === deviceid);
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
    }
  };

  Object.keys(handlers).forEach((key) => {
    page[key] = handlers[key].bind(page);
  });
}

module.exports = {
  DEVICE_CONNECT_DATA,
  attachDeviceConnect
};
