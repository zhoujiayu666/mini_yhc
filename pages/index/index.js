// pages/index/index.js
const bleController = require('../../utils/ble.js');
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
    currentDevice: null
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
    // 从连接引导页「连接」进入：等同点击「搜索设备」
    if (app.globalData.openDeviceSearchOnIndexShow) {
      app.globalData.openDeviceSearchOnIndexShow = false;
      setTimeout(() => {
        this.searchDevices();
      }, 0);
    }
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

  /**
   * 更新连接状态
   */
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
          wx.showModal({
            title: '蓝牙未开启',
            content: adapterState.message || '请先开启手机蓝牙功能',
            showCancel: false
          });
        }
        return;
      }

      this.setData({ isScanning: true, showDeviceList: true, deviceList: [] });

      // 先获取已发现的设备列表（过滤MAC前缀）
      try {
        console.log('========== 开始搜索设备 ==========');
        const existingDevices = await bleController.getBluetoothDevices(true);
        console.log('已缓存的设备（已过滤MAC前缀）:', existingDevices.length, '个');
        
        if (existingDevices.length > 0) {
          console.log('已缓存的设备列表:');
          existingDevices.forEach((device, index) => {
            console.log(`${index + 1}. ${device.name || '未知设备'}`, {
              MAC地址: device.deviceId,
              信号强度: device.RSSI ? `${device.RSSI} dBm` : '未知'
            });
          });
          // 添加到列表显示
          this.setData({ deviceList: this.annotateDeviceConnection(existingDevices) });
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

        // 过滤MAC地址前缀为84:AA:A4的设备
        const filteredDevices = devices.filter(device => {
          const deviceId = (device.deviceId || '').toUpperCase();
          const matches = deviceId.startsWith('84:AA:A4');
          if (!matches && deviceId) {
            console.log('❌ 设备不符合MAC前缀:', deviceId, '设备名称:', device.name || '未知');
          }
          return matches;
        });

        if (filteredDevices.length > 0) {
          console.log('✅ 符合MAC前缀的设备:', filteredDevices.length, '个');
          filteredDevices.forEach((device, index) => {
            console.log(`设备 ${index + 1}:`, {
              name: device.name || '未知',
              deviceId: device.deviceId,
              RSSI: device.RSSI,
              '信号强度': device.RSSI ? `${device.RSSI} dBm` : '未知'
            });
          });
        } else {
          console.log('⚠️ 本次未发现符合MAC前缀(84:AA:A4)的设备');
        }
        console.log('============================');

        // 更新设备列表（只显示符合MAC前缀的设备）
        const currentList = this.data.deviceList;
        const newList = [...currentList];

        // 只添加符合MAC前缀的设备
        filteredDevices.forEach(device => {
          const index = newList.findIndex(d => d.deviceId === device.deviceId);
          if (index >= 0) {
            // 更新现有设备信息
            newList[index] = { ...newList[index], ...device };
          } else {
            // 添加新设备
            newList.push(device);
          }
        });

        // 按RSSI降序排列（信号越强，绝对值越小，排前面）
        newList.sort((a, b) => {
          const rssiA = a.RSSI || -100;
          const rssiB = b.RSSI || -100;
          return rssiA - rssiB; // RSSI值越小（绝对值越大），信号越强，排前面
        });

        this.setData({ deviceList: this.annotateDeviceConnection(newList) });
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
        } else {
          console.log('⚠️ 未发现任何符合MAC前缀(84:AA:A4)的设备');
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
        errorMsg = '蓝牙未开启，请先开启手机蓝牙';
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
          resolve({
            available: false,
            message: err.errMsg || '蓝牙未开启',
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
      
      // 保存设备信息
      app.globalData.currentDevice = device;
      app.saveDeviceHistory(device);
      
      this.setData({
        showDeviceList: false,
        currentDevice: device
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
