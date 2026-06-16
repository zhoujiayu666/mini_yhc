const bleController = require('../../utils/ble.js');
const protocol = require('../../utils/protocol.js');
const { requireLogin } = require('../../utils/auth.js');
const {
  RHYTHM_INITIAL_DATA,
  attachRhythm,
  rhythmOnHide,
  rhythmOnUnload,
  rhythmOnConnectionLost
} = require('../../utils/rhythm-logic.js');
const { DEVICE_CONNECT_DATA, attachDeviceConnect } = require('../../utils/device-connect.js');
const app = getApp();

Page({
  /**
   * 页面的初始数据
   */
  data: {
    hue: 0,
    saturation: 95,
    brightness: 50,
    powerOn: false,
    lastMode: 'white',
    effectSpeed: 50,
    sliderTint: '#D8E8D0',
    displayModes: [
      { id: 'white', name: 'ON', icon: './images/modes/white.png', iconActive: './images/modes/white-active.png' },
      { id: 'flash', name: 'Flash', icon: './images/modes/flash.png', iconActive: './images/modes/flash-active.png' },
      { id: 'breath', name: 'Dimming', icon: './images/modes/breath.png', iconActive: './images/modes/breath-active.png' },
      { id: 'party', name: 'Party', icon: './images/modes/party.png', iconActive: './images/modes/party-active.png' },
      { id: 'rainbow', name: 'Rainbow', icon: './images/modes/rainbow.png', iconActive: './images/modes/rainbow-active.png' }
    ],
    selectedEffect: null,
    /** 随机模式：固定色相，仅调亮度时不再重抽 */
    randomHue: null,
    isConnected: false,
    sendTimer: null, // 防抖定时器
    /** 与 bindscroll 配合，setData 后保持列表滚动位置（避免 iOS 滚回顶部） */
    scrollTop: 0,
    ...RHYTHM_INITIAL_DATA,
    ...DEVICE_CONNECT_DATA
  },

  /**
   * 将当前调光 UI 状态写入全局，便于 redirect 切页后恢复
   */
  syncColorControlStateToGlobal() {
    app.globalData.colorControlState = {
      brightness: this.data.brightness,
      selectedEffect: this.data.selectedEffect,
      hue: this.data.hue,
      saturation: this.data.saturation,
      randomHue: this.data.randomHue,
      powerOn: this.data.powerOn,
      lastMode: this.data.lastMode,
      effectSpeed: this.data.effectSpeed
    };
  },

  updateSliderTint() {
    const { hue, saturation } = this.data;
    const tint = `hsl(${hue}, ${Math.round(saturation * 0.35)}%, 78%)`;
    if (tint !== this.data.sliderTint) {
      this.setData({ sliderTint: tint });
    }
  },

  getBreathTiming(speed) {
    const ratio = (typeof speed === 'number' ? speed : 50) / 100;
    const period = Math.round(4500 - ratio * 3700);
    const duty = Math.round(period * 0.25);
    return { period, duty };
  },

  getFlashTiming(speed) {
    const ratio = (typeof speed === 'number' ? speed : 50) / 100;
    const base = Math.round(20 - ratio * 14);
    return {
      onMin: Math.max(2, base - 4),
      onMax: base,
      offMin: Math.max(4, base - 2),
      offMax: base + 4
    };
  },

  /**
   * 生命周期函数--监听页面加载
   */
  onLoad(options) {
    this._mainScrollTop = 0;
    const saved = app.globalData.colorControlState;
    const patch = {
      isConnected: app.globalData.isConnected
    };
    if (saved && typeof saved.brightness === 'number') {
      patch.brightness = saved.brightness;
      patch.selectedEffect = saved.selectedEffect;
      patch.hue = typeof saved.hue === 'number' ? saved.hue : this.data.hue;
      patch.saturation =
        typeof saved.saturation === 'number' ? saved.saturation : this.data.saturation;
      if (typeof saved.effectSpeed === 'number') {
        patch.effectSpeed = saved.effectSpeed;
      }
      if (typeof saved.lastMode === 'string') {
        patch.lastMode = saved.lastMode;
      }
      if (typeof saved.powerOn === 'boolean') {
        patch.powerOn = saved.powerOn;
      } else {
        patch.powerOn = saved.selectedEffect !== 'black';
      }
      if (typeof saved.randomHue === 'number') {
        patch.randomHue = saved.randomHue;
      } else {
        patch.randomHue = null;
      }
    } else {
      const pages = getCurrentPages();
      const prevPage = pages[pages.length - 2];
      if (prevPage && prevPage.data.brightness) {
        patch.brightness = prevPage.data.brightness;
      }
    }

    const validModes = ['white', 'flash', 'breath', 'party', 'rainbow', 'black'];
    if (patch.selectedEffect && !validModes.includes(patch.selectedEffect)) {
      patch.selectedEffect = patch.powerOn === false ? 'black' : 'white';
      patch.lastMode = 'white';
    }

    this.setData(this.mergeScrollTop(patch), () => {
      this.updateSliderTint();
      if (this.data.isConnected && this.data.powerOn && this.data.selectedEffect) {
        this.sendEffectToDevice(this.data.selectedEffect);
      }
    });

    attachRhythm(this);
    attachDeviceConnect(this);

    bleController.onConnectionStateChange = (connected) => {
      this.setData(this.mergeScrollTop({ isConnected: connected }));
      app.globalData.isConnected = connected;
      rhythmOnConnectionLost.call(this);
    };
  },

  onShow() {
    if (!requireLogin()) return;
    this.setData(
      this.mergeScrollTop({
        isConnected: app.globalData.isConnected || bleController.isConnected
      })
    );
    if (app.globalData.openDeviceSearchOnControlShow) {
      app.globalData.openDeviceSearchOnControlShow = false;
      setTimeout(() => {
        this.searchDevices();
      }, 300);
    }
  },

  mergeScrollTop(patch) {
    const top = typeof this._mainScrollTop === 'number' ? this._mainScrollTop : 0;
    return { ...patch, scrollTop: top };
  },

  onMainScroll(e) {
    this._mainScrollTop = e.detail.scrollTop;
  },

  /**
   * 未连接时跳转连接引导页，已连接返回 true
   */
  ensureConnectedOrGoGuide() {
    const isConnected = app.globalData.isConnected || bleController.isConnected;
    if (isConnected) {
      this.setData(this.mergeScrollTop({ isConnected: true }));
      return true;
    }
    this.setData(this.mergeScrollTop({ isConnected: false }));
    wx.navigateTo({
      url: '/pages/connect-guide/connect-guide'
    });
    return false;
  },

  ensureConnectedOrToast() {
    const isConnected = app.globalData.isConnected || bleController.isConnected;
    if (isConnected) {
      this.setData(this.mergeScrollTop({ isConnected: true }));
      return true;
    }
    this.setData(this.mergeScrollTop({ isConnected: false }));
    wx.showToast({
      title: '未连接设备',
      icon: 'none',
      duration: 1500
    });
    return false;
  },
  
  /**
   * 生命周期函数--监听页面隐藏
   */
  onHide() {
    this.syncColorControlStateToGlobal();
    rhythmOnHide.call(this);
    // 清除所有定时器（进入后台时停止所有定时任务）
    if (this.data.sendTimer) {
      clearTimeout(this.data.sendTimer);
      this.data.sendTimer = null;
    }
    if (this.partyTimer) {
      clearInterval(this.partyTimer);
      this.partyTimer = null;
    }
    if (this.starTimer) {
      clearInterval(this.starTimer);
      this.starTimer = null;
    }
  },

  /**
   * 生命周期函数--监听页面卸载
   */
  onUnload() {
    this.syncColorControlStateToGlobal();
    rhythmOnUnload.call(this);
    // 清除所有定时器
    if (this.data.sendTimer) {
      clearTimeout(this.data.sendTimer);
      this.data.sendTimer = null;
    }
    if (this.partyTimer) {
      clearInterval(this.partyTimer);
      this.partyTimer = null;
    }
    if (this.starTimer) {
      clearInterval(this.starTimer);
      this.starTimer = null;
    }
  },

  /**
   * 色轮颜色改变
   */
  onColorChange(e) {
    if (!this.data.powerOn) return;
    const { hue, saturation, brightness } = e.detail;
    const patch = {
      hue,
      saturation,
      brightness: brightness || this.data.brightness
    };

    if (!this.data.selectedEffect) {
      this.setData(this.mergeScrollTop(patch), () => {
        this.updateSliderTint();
        this.syncColorControlStateToGlobal();
      });
      return;
    }

    this.setData(this.mergeScrollTop(patch), () => {
      this.updateSliderTint();
      this.syncColorControlStateToGlobal();
      this.sendEffectToDevice(this.data.selectedEffect);
    });
  },

  onColorAreaTap() {
    if (!this.data.powerOn) {
      wx.showToast({ title: '请先开启电源', icon: 'none' });
    }
  },

  onPowerChange(e) {
    const powerOn = !!e.detail.value;
    if (!powerOn) {
      const lastMode = this.data.selectedEffect && this.data.selectedEffect !== 'black'
        ? this.data.selectedEffect
        : this.data.lastMode || 'white';
      this.setData(this.mergeScrollTop({
        powerOn: false,
        lastMode,
        selectedEffect: 'black'
      }), () => {
        this.syncColorControlStateToGlobal();
        if (this.data.isConnected) {
          this.sendEffectToDevice('black');
        }
      });
      return;
    }

    if (!this.ensureConnectedOrGoGuide()) {
      this.setData(this.mergeScrollTop({ powerOn: false }));
      return;
    }

    const mode = this.data.lastMode || 'white';
    this.setData(this.mergeScrollTop({
      powerOn: true,
      selectedEffect: mode
    }), () => {
      this.syncColorControlStateToGlobal();
      this.sendEffectToDevice(mode);
    });
  },

  onSpeedChange(e) {
    if (!this.data.powerOn || !this.ensureConnectedOrToast()) return;
    const effectSpeed = e.detail.value;
    this.setData(this.mergeScrollTop({ effectSpeed }), () => {
      this.syncColorControlStateToGlobal();
      if (this.data.selectedEffect) {
        this.sendEffectToDevice(this.data.selectedEffect);
      }
    });
  },

  /**
   * 亮度改变
   */
  onBrightnessChange(e) {
    if (!this.data.powerOn || !this.ensureConnectedOrToast()) {
      return;
    }
    const brightness = e.detail.value;
    this.setData(this.mergeScrollTop({ brightness }), () => {
      this.syncColorControlStateToGlobal();
      if (this.data.selectedEffect) {
        this.sendEffectToDevice(this.data.selectedEffect);
      }
    });
  },

  /**
   * 亮度减少
   */
  /**
   * 选择模式
   */
  selectEffect(e) {
    if (!this.data.powerOn) {
      wx.showToast({ title: '请先开启电源', icon: 'none' });
      return;
    }
    if (!this.ensureConnectedOrGoGuide()) {
      return;
    }
    const { effect } = e.currentTarget.dataset;
    
    if (this.data.selectedEffect === effect.id) {
      return;
    }
    
    // 清除之前的定时器
    if (this.partyTimer) {
      clearInterval(this.partyTimer);
      this.partyTimer = null;
    }
    if (this.starTimer) {
      clearInterval(this.starTimer);
      this.starTimer = null;
    }
    
    const patch = {
      selectedEffect: effect.id,
      lastMode: effect.id,
      randomHue: null
    };

    this.setData(this.mergeScrollTop(patch), () => {
      this.syncColorControlStateToGlobal();
      this.sendEffectToDevice(effect.id);
    });
  },

  /**
   * 发送颜色数据到设备（常亮模式）
   */
  sendColorToDevice() {
    if (!this.data.isConnected) {
      console.warn('设备未连接，无法发送颜色数据');
      return;
    }
    
    // 防抖处理，避免频繁发送
    if (this.data.sendTimer) {
      clearTimeout(this.data.sendTimer);
    }
    
    this.data.sendTimer = setTimeout(() => {
      try {
        const frame = protocol.buildConstantFrame(
          0,
          this.data.hue,
          this.data.saturation,
          this.data.brightness
        );
        
        bleController.sendFrame(frame, true).then(() => {
          console.log('颜色数据发送成功');
        }).catch(err => {
          console.error('颜色数据发送失败', err);
        });
      } catch (error) {
        console.error('构建颜色数据帧失败', error);
      }
    }, 50); // 50ms防抖
  },

  /**
   * 发送效果数据到设备
   */
  sendEffectToDevice(effectId) {
    if (!this.data.isConnected) {
      console.warn('设备未连接，无法发送效果数据');
      wx.showToast({
        title: '设备未连接',
        icon: 'none',
        duration: 2000
      });
      return;
    }
    
    try {
      let frame;
      const frameSeq = 0;
      
      switch (effectId) {
        case 'black':
          // 黑场
          frame = protocol.buildBlackOutFrame(frameSeq);
          break;
          
        case 'white':
          // 常亮
          frame = protocol.buildConstantFrame(
            frameSeq,
            this.data.hue,
            this.data.saturation,
            this.data.brightness
          );
          break;
          
        case 'random': {
          // 随机色相仅在点选「随机」时重抽；调亮度只改亮度，不重抽
          const rh =
            typeof this.data.randomHue === 'number'
              ? this.data.randomHue
              : Math.floor(Math.random() * 360);
          frame = protocol.buildConstantFrame(frameSeq, rh, 100, this.data.brightness);
          break;
        }
          
        case 'flash': {
          const rgb = protocol.hsbToRgb(
            this.data.hue,
            this.data.saturation,
            this.data.brightness
          );
          const flashTiming = this.getFlashTiming(this.data.effectSpeed);
          frame = protocol.buildFlashFrame(
            frameSeq,
            rgb.r,
            rgb.g,
            rgb.b,
            flashTiming.onMin,
            flashTiming.onMax,
            flashTiming.offMin,
            flashTiming.offMax
          );
          break;
        }
          
        case 'breath': {
          const rgb = protocol.hsbToRgb(
            this.data.hue,
            this.data.saturation,
            this.data.brightness
          );
          const breathTiming = this.getBreathTiming(this.data.effectSpeed);
          frame = protocol.buildBreathFrame(
            frameSeq,
            rgb.r,
            rgb.g,
            rgb.b,
            breathTiming.period,
            breathTiming.duty
          );
          break;
        }
          
        case 'party':
          // 聚会（7色随机分布，闪烁模式）
          const partySeed = Math.floor(Math.random() * 256);
          console.log('🎉 聚会模式：初始种子', partySeed);
          frame = protocol.buildPartyFrame(frameSeq, partySeed);
          // 聚会效果需要循环刷新
          this.startPartyEffect();
          break;
          
        case 'rainbow':
          // 彩虹（暂时用聚会模式代替）
          const rainbowSeed = Math.floor(Math.random() * 256);
          console.log('🌈 彩虹模式：初始种子', rainbowSeed);
          frame = protocol.buildPartyFrame(frameSeq, rainbowSeed);
          this.startPartyEffect();
          break;
          
        case 'star':
          // 星空（闪烁、呼吸、静态随机分布）
          const starSeed = Math.floor(Math.random() * 256);
          console.log('⭐ 星空模式：初始种子', starSeed);
          frame = protocol.buildStarFrame(frameSeq, starSeed);
          // 星空效果需要循环刷新
          this.startStarEffect(starSeed);
          break;
          
        default:
          console.warn('未知的效果ID:', effectId);
          return;
      }
      
      bleController.sendFrame(frame, true).then(() => {
        console.log('效果数据发送成功:', effectId);
      }).catch(err => {
        console.error('效果数据发送失败', err);
        wx.showToast({
          title: '发送失败',
          icon: 'none',
          duration: 2000
        });
      });
    } catch (error) {
      console.error('构建效果数据帧失败', error);
      wx.showToast({
        title: '构建数据失败',
        icon: 'none',
        duration: 2000
      });
    }
  },
  
  /**
   * 启动聚会效果循环（需要定时刷新）
   * 根据开发指引：配置随机模式 -> 延时100ms -> 配置全场熄灭 -> 延时100ms -> 随机种子加一，循环
   */
  startPartyEffect() {
    if (this.partyTimer) {
      clearInterval(this.partyTimer);
      this.partyTimer = null;
    }
    
    let seed = Math.floor(Math.random() * 256);
    
    const sendPartyCycle = () => {
      if (this.data.selectedEffect !== 'party' && this.data.selectedEffect !== 'rainbow') {
        if (this.partyTimer) {
          clearInterval(this.partyTimer);
          this.partyTimer = null;
        }
        return;
      }
      
      if (!this.data.isConnected) {
        if (this.partyTimer) {
          clearInterval(this.partyTimer);
          this.partyTimer = null;
        }
        return;
      }
      
      try {
        // 测试版：仅发送随机模式数据帧，不发送黑场，方便确认0x40随机模式是否能点亮灯
        const frame = protocol.buildPartyFrame(0, seed);
        console.log('🎉 聚会效果（测试）：发送随机模式，种子:', seed);
        bleController.sendFrame(frame, true).then(() => {
          console.log('✅ 聚会效果随机模式发送成功');
        }).catch(err => {
          console.error('❌ 聚会效果随机模式失败', err);
        });
        // 随机种子加一，产生不同的随机效果
        seed = (seed + 1) % 256;
      } catch (error) {
        console.error('❌ 聚会效果发送失败', error);
      }
    };
    
    // 立即发送第一次（随机模式）
    sendPartyCycle();
    
    const interval = Math.max(120, Math.round(420 - (this.data.effectSpeed / 100) * 300));
    this.partyTimer = setInterval(sendPartyCycle, interval);
  },
  
  /**
   * 启动星空效果循环（需要定时刷新）
   * 根据开发指引：随机种子每次亮灭刷新
   */
  startStarEffect(initialSeed) {
    if (this.starTimer) {
      clearInterval(this.starTimer);
      this.starTimer = null;
    }
    
    let seed = initialSeed;
    this.starTimer = setInterval(() => {
      if (this.data.selectedEffect !== 'star') {
        if (this.starTimer) {
          clearInterval(this.starTimer);
          this.starTimer = null;
        }
        return;
      }
      
      if (!this.data.isConnected) {
        if (this.starTimer) {
          clearInterval(this.starTimer);
          this.starTimer = null;
        }
        return;
      }
      
      try {
        seed = (seed + 1) % 256;
        const frame = protocol.buildStarFrame(0, seed);
        console.log('⭐ 星空效果：刷新，种子:', seed);
        bleController.sendFrame(frame, true).then(() => {
          console.log('✅ 星空效果刷新成功');
        }).catch(err => {
          console.error('❌ 星空效果刷新失败', err);
        });
      } catch (error) {
        console.error('❌ 星空效果发送失败', error);
      }
    }, 200); // 每200ms刷新一次
  },

  /**
   * 显示帮助信息
   */
  showHelp() {
    wx.showModal({
      title: '照明控制',
      content: '• 开启电源后选择模式\n• 拖动色轮选择颜色\n• 调节速度与亮度控制灯光效果',
      showCancel: false,
      confirmText: '知道了'
    });
  }
})
