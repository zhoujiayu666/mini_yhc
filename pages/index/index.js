// pages/index/index.js
const bleController = require('../../utils/ble.js');
const protocol = require('../../utils/protocol.js');
const {
  isTargetBleDevice,
  enrichDeviceIdentity,
  dedupeDevicesByBindId
} = require('../../utils/ble-device-id.js');
const app = getApp();

Page({
  /**
   * 页面的初始数据
   */
  data: {
    deviceStatus: '未连接',
    controlMode: '手机控制模式',
    brightness: 100,
    musicRhythmEnabled: false,
    isConnected: false,
    isScanning: false,
    deviceList: [],
    showDeviceList: false,
    currentDevice: null,
    previewHue: 45,
    previewSaturation: 95,
    previewBrightness: 100,
    brandLogoSrc: './images/brand-logo.png'
  },

  /**
   * 生命周期函数--监听页面加载
   */
  onLoad(options) {
    // 检查连接状态
    this.updateConnectionStatus();
    
    // 监听连接状态变化
    bleController.onConnectionStateChange = (connected) => {
      this.updateConnectionStatus();
      app.globalData.isConnected = connected;
    };
    
    // 加载设备连接历史
    this.loadDeviceHistory();
  },

  /**
   * 生命周期函数--监听页面初次渲染完成
   */
  onReady() {

  },

  /**
   * 生命周期函数--监听页面显示
   */
  onShow() {
    // 更新连接状态
    this.updateConnectionStatus();
    this.syncColorPreview();
  },

  /**
   * 生命周期函数--监听页面隐藏
   */
  onHide() {

  },

  /**
   * 生命周期函数--监听页面卸载
   */
  onUnload() {

  },

  /**
   * 页面相关事件处理函数--监听用户下拉动作
   */
  onPullDownRefresh() {

  },

  /**
   * 页面上拉触底事件的处理函数
   */
  onReachBottom() {

  },

  /**
   * 用户点击右上角分享
   */
  onShareAppMessage() {

  },

  /**
   * 跳转到智能调光页
   */
  navigateToColorControl() {
    // 使用 redirectTo 实现无动画跳转
    wx.redirectTo({
      url: '/pages/color-control/color-control'
    });
  },

  /**
   * 跳转到音乐律动页
   */
  navigateToMusicRhythm() {
    // 使用 redirectTo 实现无动画跳转
    wx.redirectTo({
      url: '/pages/music-rhythm/music-rhythm'
    });
  },

  navigateToGroupMode() {
    wx.navigateTo({
      url: '/pages/group-mode/group-mode'
    });
  },

  /**
   * 更新连接状态
   */
  syncColorPreview() {
    const cc = app.globalData.colorControlState;
    if (!cc) return;
    const patch = {};
    if (typeof cc.hue === 'number') patch.previewHue = cc.hue;
    if (typeof cc.saturation === 'number') patch.previewSaturation = cc.saturation;
    if (typeof cc.brightness === 'number') {
      patch.previewBrightness = cc.brightness;
      patch.brightness = cc.brightness;
    }
    if (Object.keys(patch).length) this.setData(patch);
  },

  updateConnectionStatus() {
    const isConnected = app.globalData.isConnected || bleController.isConnected;
    const patch = {
      isConnected: isConnected,
      deviceStatus: isConnected ? '已连接' : '未连接',
      currentDevice: app.globalData.currentDevice
    };
    const cc = app.globalData.colorControlState;
    if (cc && typeof cc.brightness === 'number') {
      patch.brightness = cc.brightness;
    }
    if (cc && typeof cc.hue === 'number') {
      patch.previewHue = cc.hue;
      patch.previewSaturation = typeof cc.saturation === 'number' ? cc.saturation : 95;
      patch.previewBrightness = typeof cc.brightness === 'number' ? cc.brightness : 100;
    }
    if (this.data.deviceList && this.data.deviceList.length > 0) {
      patch.deviceList = this.annotateDeviceConnection(this.data.deviceList);
    }
    this.setData(patch);
  },

  /**
   * 为列表项标记是否与当前已连接设备为同一台（用于展示「已连接」）
   */
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

  /**
   * 按deviceId去重，优先保留RSSI更强或字段更完整的记录
   */
  dedupeDevicesById(devices) {
    const map = {};
    (devices || []).forEach((d) => {
      const id = (d.deviceId || '').toUpperCase();
      if (!id) {
        return;
      }
      const prev = map[id];
      if (!prev) {
        map[id] = d;
        return;
      }
      const prevRssi = typeof prev.RSSI === 'number' ? prev.RSSI : -999;
      const nextRssi = typeof d.RSSI === 'number' ? d.RSSI : -999;
      const prevScore = (prev.name ? 1 : 0) + (prev.localName ? 1 : 0) + (prev.advertisData ? 1 : 0);
      const nextScore = (d.name ? 1 : 0) + (d.localName ? 1 : 0) + (d.advertisData ? 1 : 0);
      if (nextRssi > prevRssi || (nextRssi === prevRssi && nextScore > prevScore)) {
        map[id] = { ...prev, ...d };
      } else {
        map[id] = { ...d, ...prev };
      }
    });
    return Object.values(map);
  },

  /**
   * 统一UUID格式用于比较
   */
  normalizeUuid(uuid) {
    return String(uuid || '').replace(/-/g, '').toUpperCase();
  },

  /**
   * 是否为目标设备（名称白名单 + FFE0 / 厂商 MAC）
   */
  isTargetBleDevice(device) {
    return isTargetBleDevice(device);
  },

  /**
   * 点击搜索/选择设备：先进入连接设备引导页
   */
  openConnectGuide() {
    wx.navigateTo({
      url: '/pages/connect-guide/connect-guide'
    });
  },

  /**
   * 搜索设备（由引导页「连接」回首页后触发，或内部调用）
   */
  async searchDevices() {
    if (this.data.isScanning) {
      return;
    }

    try {
      // 先确保蓝牙适配器已初始化，避免 getBluetoothAdapterState:fail:not init
      await bleController.initBluetoothAdapter().catch((err) => {
        console.warn('蓝牙适配器初始化失败，继续走状态检查兜底', err);
      });

      // 检查蓝牙适配器状态
      const adapterState = await this.checkBluetoothAdapter();
      if (!adapterState.available) {
        // 检查是否是 Windows 平台不支持的问题
        if (adapterState.message && adapterState.message.includes('Mac 以外的平台')) {
          wx.showModal({
            title: '平台限制',
            content: 'Windows 平台不支持蓝牙调试\n\n请使用以下方式测试：\n1. 点击"预览"或"真机调试"\n2. 用手机扫描二维码\n3. 在手机上测试蓝牙功能',
            showCancel: false,
            confirmText: '知道了'
          });
        } else {
          // available 为 false 不一定是系统蓝牙关着：常见还有微信未获蓝牙权限、Android 需定位/附近设备等
          const detail =
            adapterState.message ||
            [
              '请依次检查：',
              '1. 系统设置里蓝牙已打开',
              '2. 若曾在弹窗里点过「拒绝」，请到：设置 → 应用 → 微信 → 权限，重新允许「附近设备」和「位置信息」（Android 扫描蓝牙常需要）',
              '3. iPhone：设置 → 微信 → 打开「蓝牙」',
              '4. 打开系统「定位服务」总开关后，完全退出微信再进入重试'
            ].join('\n');
          wx.showModal({
            title: '无法使用蓝牙',
            content: detail,
            showCancel: false,
            confirmText: '知道了'
          });
        }
        return;
      }

      this.setData({ isScanning: true, showDeviceList: true, deviceList: [] });

      // 先获取已发现的设备列表（iOS 设备ID非MAC，不做MAC前缀过滤）
      try {
        console.log('========== 开始搜索设备 ==========');
        const existingDevices = (await bleController.getBluetoothDevices()).filter((d) =>
          this.isTargetBleDevice(d)
        );
        console.log('已缓存的设备:', existingDevices.length, '个');
        
        if (existingDevices.length > 0) {
          console.log('已缓存的设备列表:');
          existingDevices.forEach((device, index) => {
            console.log(`${index + 1}. ${device.name || '未知设备'}`, {
              MAC地址: device.deviceId,
              信号强度: device.RSSI ? `${device.RSSI} dBm` : '未知'
            });
          });
          // 添加到列表显示
          const deduped = dedupeDevicesByBindId(existingDevices);
          this.setData({ deviceList: this.annotateDeviceConnection(deduped) });
        } else {
          console.log('暂无已缓存的设备');
        }
      } catch (err) {
        console.log('获取已发现设备失败（可能没有）:', err);
      }

      // 开始搜索
      await bleController.startBluetoothDevicesDiscovery();
      console.log('开始搜索蓝牙设备...');

      // 监听设备发现
      wx.onBluetoothDeviceFound((res) => {
        const devices = res.devices || [];
        console.log('========== 发现设备 ==========');
        console.log('本次发现设备数量:', devices.length, '个');
        console.log('所有发现的设备（未过滤）:', devices.map(d => ({
          name: d.name || '未知',
          deviceId: d.deviceId,
          RSSI: d.RSSI
        })));

        const foundDevices = devices.filter((d) => this.isTargetBleDevice(d));
        if (foundDevices.length > 0) {
          console.log('✅ 本次发现设备:', foundDevices.length, '个');
          foundDevices.forEach((device, index) => {
            console.log(`设备 ${index + 1}:`, {
              name: device.name || '未知',
              deviceId: device.deviceId,
              RSSI: device.RSSI,
              '信号强度': device.RSSI ? `${device.RSSI} dBm` : '未知'
            });
          });
        } else if (devices.length > 0) {
          console.log('⚠️ 本次发现设备均非目标设备（按FFE0服务UUID过滤）');
        }
        console.log('============================');

        // 更新设备列表
        const currentList = this.data.deviceList;
        const newList = [...currentList];

        foundDevices.forEach(device => {
          const index = newList.findIndex(d => d.deviceId === device.deviceId);
          if (index >= 0) {
            // 更新现有设备信息
            newList[index] = { ...newList[index], ...device };
          } else {
            // 添加新设备
            newList.push(device);
          }
        });

        const uniqueList = dedupeDevicesByBindId(newList);
        uniqueList.sort((a, b) => {
          const rssiA = typeof a.RSSI === 'number' ? a.RSSI : -100;
          const rssiB = typeof b.RSSI === 'number' ? b.RSSI : -100;
          return rssiB - rssiA; // RSSI 越大信号越强
        });

        this.setData({ deviceList: this.annotateDeviceConnection(uniqueList) });
      });

      // 延长搜索时间到10秒
      setTimeout(async () => {
        await bleController.stopBluetoothDevicesDiscovery();
        console.log('========== 搜索结束 ==========');
        console.log('最终发现的设备数量:', this.data.deviceList.length, '个');
        if (this.data.deviceList.length > 0) {
          console.log('设备列表（按信号强度排序）:');
          this.data.deviceList.forEach((device, index) => {
            console.log(`${index + 1}. ${device.name || '未知设备'}`, {
              MAC地址: device.deviceId,
              信号强度: device.RSSI ? `${device.RSSI} dBm` : '未知'
            });
          });
        }
        console.log('============================');
        
        this.setData({ isScanning: false });
        
        if (this.data.deviceList.length === 0) {
          wx.showToast({
            title: '未发现设备',
            icon: 'none',
            duration: 3000
          });
        }
      }, 10000);
    } catch (error) {
      console.error('搜索设备失败', error);
      this.setData({ isScanning: false });
      
      let errorMsg = '搜索失败';
      if (error.errCode === 10001) {
        errorMsg = '蓝牙仍不可用。请开启系统蓝牙，并检查微信蓝牙权限后重试。';
      } else if (error.errCode === 10009) {
        errorMsg = '蓝牙适配器未初始化';
      } else if (error.errMsg) {
        errorMsg = error.errMsg;
      }
      
      wx.showModal({
        title: '搜索失败',
        content: errorMsg,
        showCancel: false
      });
    }
  },

  /**
   * 检查蓝牙适配器状态
   */
  checkBluetoothAdapter() {
    return new Promise((resolve) => {
      wx.getBluetoothAdapterState({
        success: (res) => {
          console.log('蓝牙适配器状态:', res);
          resolve({
            available: res.available,
            discovering: res.discovering,
            state: res.adapterState
          });
        },
        fail: (err) => {
          console.error('获取蓝牙适配器状态失败', err);
          const rawMsg = err.errMsg || '蓝牙未开启';
          const msg = String(rawMsg);

          // 常见场景：尚未初始化，自动补救一次后重查状态
          if (msg.includes('not init')) {
            bleController
              .initBluetoothAdapter()
              .then(() => {
                wx.getBluetoothAdapterState({
                  success: (retryRes) => {
                    console.log('蓝牙适配器状态（重试）:', retryRes);
                    resolve({
                      available: retryRes.available,
                      discovering: retryRes.discovering,
                      state: retryRes.adapterState
                    });
                  },
                  fail: (retryErr) => {
                    console.error('蓝牙状态重试失败', retryErr);
                    resolve({
                      available: false,
                      message: '蓝牙仍不可用。请开启系统蓝牙，并检查微信蓝牙权限后重试。',
                      errCode: retryErr.errCode
                    });
                  }
                });
              })
              .catch((initErr) => {
                console.error('蓝牙初始化失败', initErr);
                resolve({
                  available: false,
                  message: '蓝牙仍不可用。请开启系统蓝牙，并检查微信蓝牙权限后重试。',
                  errCode: initErr.errCode || err.errCode
                });
              });
            return;
          }

          resolve({
            available: false,
            message: rawMsg,
            errCode: err.errCode
          });
        }
      });
    });
  },

  /**
   * 连接设备
   */
  async connectDevice(e) {
    const { deviceid } = e.currentTarget.dataset;
    const device = this.data.deviceList.find(d => d.deviceId === deviceid);

    if (!device) {
      return;
    }

    wx.showLoading({
      title: '连接中...',
      mask: true
    });

    try {
      await bleController.connectDevice(deviceid);

      const enriched = enrichDeviceIdentity(device);
      app.globalData.currentDevice = enriched;
      app.globalData.isConnected = true;
      app.saveDeviceHistory(enriched);

      this.setData({
        showDeviceList: false,
        currentDevice: enriched
      });

      wx.hideLoading();
      wx.showToast({
        title: '连接成功',
        icon: 'success',
        duration: 2000
      });

      this.updateConnectionStatus();
    } catch (error) {
      console.error('连接设备失败', error);
      wx.hideLoading();
      
      // 显示更友好的错误提示
      const errorMsg = error.userMessage || 
        (error.errCode === 10003 ? '连接失败：请确保设备已开启且距离较近' : '连接失败');
      
      wx.showModal({
        title: '连接失败',
        content: errorMsg + '\n\n建议：\n1. 确保设备已开启\n2. 靠近设备（1米内）\n3. 关闭其他可能占用设备的应用\n4. 重新搜索设备后重试',
        showCancel: false,
        confirmText: '知道了'
      });
    }
  },

  /**
   * 断开连接
   */
  disconnectDevice() {
    wx.showModal({
      title: '断开连接',
      content: '确定要断开设备连接吗？',
      success: (res) => {
        if (res.confirm) {
          bleController.disconnect();
          app.globalData.currentDevice = null;
          this.updateConnectionStatus();
          wx.showToast({
            title: '已断开',
            icon: 'success',
            duration: 2000
          });
        }
      }
    });
  },

  /**
   * 关闭设备列表
   */
  closeDeviceList() {
    this.setData({ showDeviceList: false });
    if (this.data.isScanning) {
      bleController.stopBluetoothDevicesDiscovery();
      this.setData({ isScanning: false });
    }
  },

  /**
   * 阻止事件冒泡
   */
  stopPropagation() {
    // 空方法，用于阻止事件冒泡
  },

  /**
   * 加载设备连接历史
   */
  loadDeviceHistory() {
    const history = app.getDeviceHistory();
    if (history.length > 0) {
      // 可以显示历史记录供快速连接
      console.log('设备连接历史', history);
    }
  },

  /**
   * 显示帮助信息
   */
  showHelp() {
    wx.showModal({
      title: '帮助',
      content: 'MetaLumic 智能灯光控制系统\n\n• 点击设备状态卡片搜索并连接设备\n• 智能调光：选择颜色和灯光效果\n• 音乐律动：根据环境声音自动调节灯光',
      showCancel: false,
      confirmText: '知道了'
    });
  }
})
