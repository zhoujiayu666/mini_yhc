// pages/index/index.js
const bleController = require('../../utils/ble.js');
const protocol = require('../../utils/protocol.js');
const {
  isTargetBleDevice,
  enrichDeviceIdentity,
  dedupeDevicesByBindId
} = require('../../utils/ble-device-id.js');
const { showShareMenu, getShareMessage, getTimelineShare } = require('../../utils/share.js');
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
    showShareMenu();
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
    showShareMenu();
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
    return getShareMessage();
  },

  onShareTimeline() {
    return getTimelineShare();
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

      // 定时清理：广播已消失（关机/断开）的设备自动从列表移除
      if (this._pruneTimer) {
        clearInterval(this._pruneTimer);
      }
      this._pruneTimer = setInterval(() => this._pruneStaleDevices(), 1000);

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
          // 添加到列表显示（带发现时间，便于超时清理）
          const withSeen = existingDevices.map((d) => ({ ...d, _lastSeen: Date.now() }));
          const deduped = dedupeDevicesByBindId(withSeen);
          this.setData({ deviceList: this.annotateDeviceConnection(deduped) });
        } else {
          console.log('暂无已缓存的设备');
        }
      } catch (err) {
        console.log('获取已发现设备失败（可能没有）:', err);
      }

      if (this._onBleDeviceFound) {
        wx.offBluetoothDeviceFound(this._onBleDeviceFound);
      }
      this._onBleDeviceFound = (res) => {
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
          console.log('⚠️ 本次发现设备均非目标设备');
        }
        console.log('============================');

        const currentList = this.data.deviceList;
        const newList = [...currentList];

        console.log('[回调] 本次设备:', foundDevices.map((d) => d.name || '未知'));
        foundDevices.forEach(device => {
          const index = newList.findIndex(d => d.deviceId === device.deviceId);
          const fresh = { ...device, _lastSeen: Date.now() };
          if (index >= 0) {
            newList[index] = { ...newList[index], ...fresh };
          } else {
            newList.push(fresh);
          }
        });

        const uniqueList = dedupeDevicesByBindId(newList);
        uniqueList.sort((a, b) => {
          const rssiA = typeof a.RSSI === 'number' ? a.RSSI : -100;
          const rssiB = typeof b.RSSI === 'number' ? b.RSSI : -100;
          return rssiB - rssiA;
        });

        this.setData({ deviceList: this.annotateDeviceConnection(uniqueList) });
      };
      wx.onBluetoothDeviceFound(this._onBleDeviceFound);

      await bleController.startBluetoothDevicesDiscovery();
      console.log('开始搜索蓝牙设备...');

      // 持续扫描：每 15 秒一轮，弹窗开着就一直扫，列表实时反映广播状态
      const keepScanning = async () => {
        try {
          await bleController.stopBluetoothDevicesDiscovery();
        } catch (e) {
          // 忽略停止失败
        }
        console.log('========== 一轮搜索结束 ==========');
        if (!this.data.showDeviceList) {
          this.setData({ isScanning: false });
          return;
        }
        try {
          await bleController.startBluetoothDevicesDiscovery();
          console.log('继续搜索蓝牙设备...');
        } catch (e) {
          console.log('继续搜索失败', e);
        }
        this._scanLoopTimer = setTimeout(keepScanning, 15000);
      };
      this._scanLoopTimer = setTimeout(keepScanning, 15000);
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
   * 清理广播已消失的设备：
   * 超过 2 秒没再收到新广播（关机/断开）就从列表移除，
   * 保证页面里出现的都是当前还在广播的设备。
   */
  _pruneStaleDevices() {
    const now = Date.now();
    const list = this.data.deviceList;
    const kept = list.filter((d) => now - (d._lastSeen || 0) <= 2000);
    if (kept.length !== list.length) {
      console.log('[清理] 移除失效设备:', list.map((d) => ({
        name: d.name,
        age: Math.round((now - (d._lastSeen || 0)) / 1000) + 's'
      })));
      this.setData({ deviceList: this.annotateDeviceConnection(kept) });
    }
  },

  /**
   * 关闭设备列表
   */
  closeDeviceList() {
    this.setData({ showDeviceList: false, deviceList: [] });
    if (this._scanLoopTimer) {
      clearTimeout(this._scanLoopTimer);
      this._scanLoopTimer = null;
    }
    if (this._pruneTimer) {
      clearInterval(this._pruneTimer);
      this._pruneTimer = null;
    }
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
