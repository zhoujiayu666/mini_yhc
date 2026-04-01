// pages/color-control/color-control.js
const bleController = require('../../utils/ble.js');
const protocol = require('../../utils/protocol.js');
const app = getApp();

Page({
  /**
   * 页面的初始数据
   */
  data: {
    hue: 0,
    saturation: 95,
    brightness: 50,
    presetEffects: [
      { id: 'black', name: '黑场', icon: '⚫' },
      { id: 'white', name: '常亮', icon: '⚪' },
      { id: 'random', name: '随机', icon: '🎲' },
      { id: 'flash', name: '快闪', icon: '⚡' },
      { id: 'blink', name: '眨眼', icon: '👁️' },
      { id: 'breath', name: '呼吸', icon: '💨' },
      { id: 'party', name: '聚会', icon: '🎉' },
      { id: 'rainbow', name: '彩虹', icon: '🌈' },
      { id: 'star', name: '星空', icon: '⭐' }
    ],
    selectedEffect: null,
    /** 随机模式：固定色相，仅调亮度时不再重抽 */
    randomHue: null,
    isConnected: false,
    sendTimer: null, // 防抖定时器
    /** 与 bindscroll 配合，setData 后保持列表滚动位置（避免 iOS 滚回顶部） */
    scrollTop: 0
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
      randomHue: this.data.randomHue
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
      if (typeof saved.randomHue === 'number') {
        patch.randomHue = saved.randomHue;
      } else if (saved.selectedEffect === 'random') {
        const rh = Math.floor(Math.random() * 360);
        patch.randomHue = rh;
        patch.hue = rh;
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

    this.setData(this.mergeScrollTop(patch), () => {
      if (this.data.isConnected && this.data.selectedEffect) {
        this.sendEffectToDevice(this.data.selectedEffect);
      }
    });

    // 监听连接状态变化
    bleController.onConnectionStateChange = (connected) => {
      this.setData(this.mergeScrollTop({ isConnected: connected }));
      app.globalData.isConnected = connected;
    };
  },

  onShow() {
    this.setData(
      this.mergeScrollTop({
        isConnected: app.globalData.isConnected || bleController.isConnected
      })
    );
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
    const { hue, saturation, brightness } = e.detail;

    // 如果没有选中任何模式，只更新显示，不发送命令
    if (!this.data.selectedEffect) {
      this.setData(
        this.mergeScrollTop({
          hue,
          saturation,
          brightness: brightness || this.data.brightness
        }),
        () => this.syncColorControlStateToGlobal()
      );
      return;
    }

    // 已选中某个模式时：更新颜色，并按照当前模式重新发送效果数据（保持模式不变，例如常亮）
    this.setData(
      this.mergeScrollTop({
        hue,
        saturation,
        brightness: brightness || this.data.brightness
      }),
      () => {
        this.syncColorControlStateToGlobal();
        this.sendEffectToDevice(this.data.selectedEffect);
      }
    );
  },

  /**
   * 亮度改变
   */
  onBrightnessChange(e) {
    if (!this.ensureConnectedOrToast()) {
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
  decreaseBrightness() {
    if (!this.ensureConnectedOrToast()) {
      return;
    }
    const brightness = Math.max(0, this.data.brightness - 5);
    this.setData(this.mergeScrollTop({ brightness }), () => {
      this.syncColorControlStateToGlobal();
      if (this.data.selectedEffect) {
        this.sendEffectToDevice(this.data.selectedEffect);
      }
    });
  },

  /**
   * 亮度增加
   */
  increaseBrightness() {
    if (!this.ensureConnectedOrToast()) {
      return;
    }
    const brightness = Math.min(100, this.data.brightness + 5);
    this.setData(this.mergeScrollTop({ brightness }), () => {
      this.syncColorControlStateToGlobal();
      if (this.data.selectedEffect) {
        this.sendEffectToDevice(this.data.selectedEffect);
      }
    });
  },

  /**
   * 选择预设效果
   */
  selectEffect(e) {
    if (!this.ensureConnectedOrGoGuide()) {
      return;
    }
    const { effect } = e.currentTarget.dataset;
    
    // 如果选择的是同一个效果，不重复发送（随机模式除外，随机每次点击都要换颜色）
    if (this.data.selectedEffect === effect.id && effect.id !== 'random') {
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
    
    const patch = { selectedEffect: effect.id };
    if (effect.id === 'random') {
      const newHue = Math.floor(Math.random() * 360);
      patch.randomHue = newHue;
      patch.hue = newHue;
    } else {
      patch.randomHue = null;
    }

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
          
        case 'flash':
          // 快闪
          frame = protocol.buildQuickFlashFrame(
            frameSeq,
            this.data.hue,
            this.data.saturation,
            this.data.brightness
          );
          break;
          
        case 'blink':
          // 眨眼（呼吸灯，周期1000ms）
          frame = protocol.buildBlinkFrame(
            frameSeq,
            this.data.hue,
            this.data.saturation,
            this.data.brightness
          );
          break;
          
        case 'breath':
          // 呼吸
          frame = protocol.buildBreathEffectFrame(
            frameSeq,
            this.data.hue,
            this.data.saturation,
            this.data.brightness
          );
          break;
          
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
    
    // 每200ms循环一次，仅用于测试随机模式效果
    this.partyTimer = setInterval(sendPartyCycle, 200);
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
      title: '智能调光',
      content: '• 拖动色轮选择颜色\n• 调节亮度滑块控制灯光亮度\n• 点击预设效果快速切换灯光模式',
      showCancel: false,
      confirmText: '知道了'
    });
  }
})
