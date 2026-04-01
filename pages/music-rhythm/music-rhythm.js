// pages/music-rhythm/music-rhythm.js
const bleController = require('../../utils/ble.js');
const protocol = require('../../utils/protocol.js');
const app = getApp();

Page({
  /**
   * 页面的初始数据
   */
  data: {
    sensitivity: 100,
    isListening: false,
    audioLevel: 0,
    isConnected: false,
    hue: 0, // 从调色板获取的颜色
    saturation: 100,
    brightness: 100,
    recorderManager: null,
    audioTimer: null,
    // 音频分析相关
    audioHistory: [], // 音频历史数据（用于鼓点检测）
    lastBeatTime: 0, // 上次检测到鼓点的时间
    currentMode: 'normal', // 当前模式：silent, normal, beat, climax
    beatCooldown: 0, // 鼓点冷却时间（避免频繁触发）
    bpm: 0, // 当前BPM
    volumeHistory: [], // 音量历史（用于平滑处理）
    startWatchdogTimer: null, // 录音启动看门狗（用于定位start后无回调）
    audioStartTime: 0, // 本次监听开始时间（用于开场稳定期）
    recordingPending: false, // 已调用 start、尚未收到 onStart（用于避免未录音时 stop 报错）
    showHelpPopup: false
  },

  /**
   * 生命周期函数--监听页面加载
   */
  onLoad(options) {
    /** 用户点击停止时为 true；时长到点自动停时为 false，用于区分是否自动续录 */
    this._userRequestedStop = false;
    /** 防回黑保持窗口：颜色亮起后短时间内不回最低亮度 */
    this._darkHoldUntil = 0;
    /** 彩虹 7 色轮换索引（每次闪烁切换一次颜色） */
    this._rainbowIndex = 0;

    // 检查连接状态
    this.setData({
      isConnected: app.globalData.isConnected
    });
    
    // 监听连接状态变化
    bleController.onConnectionStateChange = (connected) => {
      this.setData({ isConnected: connected });
      app.globalData.isConnected = connected;
      if (!connected && (this.data.isListening || this.data.recordingPending)) {
        this.stopAudioListener();
      }
    };
    
    // 从调色板获取颜色（如果有）
    const pages = getCurrentPages();
    const colorControlPage = pages.find(p => p.route === 'pages/color-control/color-control');
    if (colorControlPage) {
      this.setData({
        hue: colorControlPage.data.hue || 0,
        saturation: colorControlPage.data.saturation || 100
      });
    }
    
    // 初始化音频监听
    this.initAudioListener();
  },

  /**
   * 生命周期函数--监听页面显示
   */
  onShow() {
    // 如果已连接且之前开启了监听，自动开启
    if (this.data.isConnected && !this.data.isListening) {
      // 可以选择自动开启或手动开启
    }
  },

  /**
   * 生命周期函数--监听页面隐藏
   */
  onHide() {
    // 进入后台时停止音频监听
    this.stopAudioListener();
  },

  /**
   * 生命周期函数--监听页面卸载
   */
  onUnload() {
    // 停止音频监听
    this.stopAudioListener();
  },

  /**
   * 初始化音频监听
   */
  initAudioListener() {
    const recorderManager = wx.getRecorderManager();
    this.setData({ recorderManager });
    console.log('🎤 录音管理器已初始化');
    
    // 监听录音开始
    recorderManager.onStart(() => {
      console.log('✅ 录音开始回调触发');
      this._darkHoldUntil = 0;
      this._rainbowIndex = 0;
      if (this.data.startWatchdogTimer) {
        clearTimeout(this.data.startWatchdogTimer);
      }
      this.setData({ 
        isListening: true,
        recordingPending: false,
        audioHistory: [],
        volumeHistory: [],
        lastBeatTime: 0,
        currentMode: 'normal',
        beatCooldown: 0,
        bpm: 0,
        startWatchdogTimer: null,
        audioStartTime: Date.now()
      });
      console.log('✅ isListening 已设置为 true');
      this.startAudioAnalysis();
    });
    
    // 监听录音帧数据（如果支持）
    if (recorderManager.onFrameRecorded) {
      recorderManager.onFrameRecorded((res) => {
        console.log('🎵 收到音频帧数据', {
          frameBufferLength: res.frameBuffer ? res.frameBuffer.byteLength : 0,
          isArrayBuffer: res.frameBuffer instanceof ArrayBuffer
        });
        // 处理音频帧数据
        if (res.frameBuffer) {
          this.processAudioFrame(res.frameBuffer);
        }
      });
    } else {
      console.warn('⚠️ 录音器不支持 onFrameRecorded 回调，将使用模拟数据');
    }
    
    // 监听录音错误
    recorderManager.onError((err) => {
      console.error('❌ 录音错误', {
        err,
        isListening: this.data.isListening,
        isConnected: this.data.isConnected
      });
      const errorMsg = err.errMsg || err.message || JSON.stringify(err);
      if (this.data.startWatchdogTimer) {
        clearTimeout(this.data.startWatchdogTimer);
      }
      this.setData({
        isListening: false,
        recordingPending: false,
        startWatchdogTimer: null
      });
      // 未在录音时误调 stop 会报 stop record fail，静默处理不弹窗
      const msg = String(errorMsg || '');
      if (msg.includes('stop record fail') || msg.includes('stopRecord')) {
        console.warn('⚠️ 录音器 stop 失败（通常可忽略）', errorMsg);
        return;
      }
      wx.showModal({
        title: '录音失败',
        content: `错误信息：${errorMsg}\n\n可能的原因：\n1. 录音权限未授权\n2. 设备不支持录音\n3. 麦克风被其他应用占用\n4. 录音参数不支持`,
        showCancel: false,
        confirmText: '知道了'
      });
    });
    
    // 监听录音停止
    recorderManager.onStop((res) => {
      if (this.data.startWatchdogTimer) {
        clearTimeout(this.data.startWatchdogTimer);
      }
      this.setData({ startWatchdogTimer: null });

      const userStop = this._userRequestedStop;
      this._userRequestedStop = false;

      console.log('🛑 录音停止', {
        res,
        userStop,
        isListening: this.data.isListening,
        isConnected: this.data.isConnected
      });

      if (userStop) {
        this.setData({
          isListening: false,
          recordingPending: false
        });
        return;
      }

      // 时长到点等系统结束：仍连接则自动续录（微信单次最长 600000ms）
      if (this.data.isConnected) {
        this.setData({
          isListening: false,
          recordingPending: false
        });
        setTimeout(() => {
          if (!this.data.isConnected || this._userRequestedStop) {
            return;
          }
          console.log('🔄 录音分段结束，自动续录');
          this.actuallyStartRecording();
        }, 200);
        return;
      }

      this.setData({
        isListening: false,
        recordingPending: false
      });
    });
  },

  /**
   * 开始录音
   */
  startRecording() {
    this._userRequestedStop = false;

    console.log('🎤 点击开始录音', {
      isConnected: this.data.isConnected,
      isListening: this.data.isListening,
      hasRecorderManager: !!this.data.recorderManager
    });
    
    const connected = app.globalData.isConnected || bleController.isConnected;
    if (!connected) {
      console.warn('⚠️ 设备未连接，跳转连接引导页');
      wx.navigateTo({
        url: '/pages/connect-guide/connect-guide'
      });
      return;
    }
    if (this.data.isConnected !== connected) {
      this.setData({ isConnected: connected });
    }
    
    if (this.data.isListening) {
      console.log('⚠️ 已在监听中，忽略重复点击');
      return;
    }
    
    const recorderManager = this.data.recorderManager;
    if (!recorderManager) {
      console.error('❌ 录音器未初始化');
      wx.showToast({
        title: '录音器未初始化',
        icon: 'none',
        duration: 2000
      });
      return;
    }
    
    // 检查录音权限状态
    wx.getSetting({
      success: (res) => {
        if (res.authSetting['scope.record'] === false) {
          // 用户之前拒绝过权限，需要引导到设置页面
          console.warn('⚠️ 录音权限已被拒绝，需要引导用户到设置页面');
          wx.showModal({
            title: '需要录音权限',
            content: '音乐律动功能需要录音权限，请在设置中开启',
            showCancel: true,
            confirmText: '去设置',
            success: (modalRes) => {
              if (modalRes.confirm) {
                wx.openSetting({
                  success: (settingRes) => {
                    if (settingRes.authSetting['scope.record']) {
                      // 用户授权了，重新尝试录音
                      this.startRecordingInternal();
                    }
                  }
                });
              }
            }
          });
          return;
        }
        
        // 请求录音权限或直接开始录音
        if (res.authSetting['scope.record'] === undefined) {
          // 未授权过，请求权限
          wx.authorize({
            scope: 'scope.record',
            success: () => {
              console.log('✅ 录音权限已授权，开始录音');
              this.startRecordingInternal();
            },
            fail: (err) => {
              console.error('❌ 录音权限被拒绝', err);
              wx.showModal({
                title: '需要录音权限',
                content: '音乐律动功能需要录音权限，请在设置中开启',
                showCancel: true,
                confirmText: '去设置',
                success: (modalRes) => {
                  if (modalRes.confirm) {
                    wx.openSetting();
                  }
                }
              });
            }
          });
        } else {
          // 已授权，直接开始录音
          this.startRecordingInternal();
        }
      },
      fail: (err) => {
        console.error('❌ 获取设置失败', err);
        // 如果获取设置失败，直接尝试录音
        this.startRecordingInternal();
      }
    });
  },

  /**
   * 内部录音启动方法
   */
  startRecordingInternal() {
    const recorderManager = this.data.recorderManager;
    if (!recorderManager) {
      console.error('❌ 录音器未初始化');
      wx.showToast({
        title: '录音器未初始化',
        icon: 'none',
        duration: 2000
      });
      return;
    }
    
    // 先确保停止之前的录音（如果正在录音）
    if (this.data.isListening) {
      console.log('⚠️ 检测到录音状态为true，先停止之前的录音');
      try {
        recorderManager.stop();
        // 等待录音器完全停止
        setTimeout(() => {
          this.actuallyStartRecording();
        }, 300);
        return;
      } catch (error) {
        console.warn('⚠️ 停止录音时出错（可能已经停止）', error);
        // 继续尝试启动录音
      }
    }
    
    // 直接启动录音
    this.actuallyStartRecording();
  },

  /**
   * 实际启动录音的方法
   */
  actuallyStartRecording() {
    const recorderManager = this.data.recorderManager;
    
    // 再次检查状态，避免重复启动
    if (this.data.isListening) {
      console.warn('⚠️ 录音状态仍为true，跳过启动');
      return;
    }
    
    try {
      // 使用PCM格式，支持实时音频数据
      this.setData({ recordingPending: true });
      recorderManager.start({
        // 微信单次最长 600000ms（10 分钟），到点会 onStop，由 onStop 内自动续录实现长时间监听
        duration: 600000,
        sampleRate: 16000, // 采样率16kHz
        numberOfChannels: 1, // 单声道
        encodeBitRate: 96000, // 编码比特率
        format: 'PCM', // 使用PCM格式（支持实时数据）
        frameSize: 50 // 每50ms返回一次数据
      });
      console.log('📢 recorderManager.start() 已调用，等待 onStart 回调');
      const watchdogTimer = setTimeout(() => {
        if (!this.data.isListening) {
          console.error('⏱️ 录音启动超时：start已调用，但未收到onStart', {
            isConnected: this.data.isConnected,
            hasRecorderManager: !!this.data.recorderManager
          });
        }
      }, 2500);
      this.setData({ startWatchdogTimer: watchdogTimer });
    } catch (error) {
      this.setData({ recordingPending: false });
      console.error('❌ recorderManager.start() 调用失败', error);
      const errorMsg = error.errMsg || error.message || JSON.stringify(error);
      
      // 如果是"正在录音"的错误，尝试先停止再启动
      if (errorMsg.includes('recording') || errorMsg.includes('录音')) {
        console.log('🔄 检测到录音冲突，尝试停止后重新启动');
        try {
          recorderManager.stop();
          setTimeout(() => {
            this.actuallyStartRecording();
          }, 500);
        } catch (stopError) {
          console.error('❌ 停止录音失败', stopError);
          wx.showModal({
            title: '启动录音失败',
            content: `错误信息：${errorMsg}\n\n录音器可能处于异常状态，请稍后重试`,
            showCancel: false,
            confirmText: '知道了'
          });
        }
      } else {
        wx.showModal({
          title: '启动录音失败',
          content: `错误信息：${errorMsg}\n\n请检查：\n1. 是否已授权录音权限\n2. 设备是否支持录音功能\n3. 是否在其他应用中使用麦克风`,
          showCancel: false,
          confirmText: '知道了'
        });
      }
    }
  },

  /**
   * 停止录音
   */
  stopRecording() {
    this.stopAudioListener();
  },

  /**
   * 停止音频监听
   */
  stopAudioListener() {
    this._userRequestedStop = true;
    this._darkHoldUntil = 0;
    this._rainbowIndex = 0;

    // 先停止定时器
    if (this.data.audioTimer) {
      clearInterval(this.data.audioTimer);
      this.setData({ audioTimer: null });
    }
    if (this.data.startWatchdogTimer) {
      clearTimeout(this.data.startWatchdogTimer);
      this.setData({ startWatchdogTimer: null });
    }
    
    // 停止录音器：未开始录音时不要 stop，否则会 onError: operateRecorder:fail:stop record fail
    const needStopRecorder = this.data.isListening || this.data.recordingPending;
    if (this.data.recorderManager && needStopRecorder) {
      try {
        this.data.recorderManager.stop();
        console.log('🛑 已调用录音器停止方法');
      } catch (error) {
        console.warn('⚠️ 停止录音器时出错（可能已经停止）', error);
      }
    }
    
    // 更新状态
    this.setData({ isListening: false, recordingPending: false });
    
    // 重置亮度和音频强度
    this.setData({ 
      audioLevel: 0, 
      brightness: 100,
      audioHistory: [],
      volumeHistory: [],
      currentMode: 'normal',
      bpm: 0,
      audioStartTime: 0
    });
    
    // 发送一次常亮数据，恢复默认状态
    if (this.data.isConnected) {
      try {
        const frame = protocol.buildConstantFrame(
          0,
          this.data.hue,
          this.data.saturation,
          100
        );
        bleController.sendFrame(frame, true).catch(err => {
          console.error('恢复默认状态失败', err);
        });
      } catch (error) {
        console.error('构建恢复数据帧失败', error);
      }
    }
  },

  /**
   * 处理音频帧数据
   */
  processAudioFrame(frameBuffer) {
    if (!frameBuffer || !frameBuffer.byteLength) {
      return;
    }
    
    try {
      // 将ArrayBuffer转换为Int16Array（PCM数据）
      const pcmData = new Int16Array(frameBuffer);
      
      // 计算RMS（均方根）音量
      let sum = 0;
      for (let i = 0; i < pcmData.length; i++) {
        sum += pcmData[i] * pcmData[i];
      }
      const rms = Math.sqrt(sum / pcmData.length);
      
      // 转换为0-100的音量级别
      const maxValue = 32767; // Int16最大值
      // 提高音量计算的灵敏度：使用对数缩放，让小音量也能被检测到
      const normalizedRms = rms / maxValue;
      // 使用对数缩放：log10(x * 9 + 1) * 100，让低音量也能有响应
      const logVolume = Math.log10(normalizedRms * 9 + 1) * 100;
      // 结合灵敏度设置（0-200）
      const volumeLevel = Math.min(100, logVolume * (this.data.sensitivity / 200) * 2.0); // 增加2.0倍放大
      
      // 保存到历史记录
      const history = this.data.volumeHistory || [];
      history.push(volumeLevel);
      if (history.length > 20) {
        history.shift(); // 只保留最近20个数据点
      }
      
      // 保存到音频历史（用于鼓点检测）
      const audioHistory = this.data.audioHistory || [];
      audioHistory.push({
        volume: volumeLevel,
        time: Date.now()
      });
      if (audioHistory.length > 50) {
        audioHistory.shift(); // 只保留最近50个数据点
      }
      
      // 添加调试日志（每10次记录一次，避免日志过多）
      if (Math.random() < 0.1) {
        console.log('🎵 音频分析:', {
          原始RMS: rms.toFixed(2),
          归一化: normalizedRms.toFixed(4),
          音量级别: volumeLevel.toFixed(1),
          灵敏度: this.data.sensitivity
        });
      }
      
      this.setData({
        audioLevel: volumeLevel,
        volumeHistory: history,
        audioHistory: audioHistory
      });
    } catch (error) {
      console.error('处理音频帧失败', error);
    }
  },

  /**
   * 检测鼓点（Beat Detection）
   */
  detectBeat(currentVolume) {
    const history = this.data.volumeHistory || [];
    if (history.length < 5) {
      return false;
    }
    
    // 计算平均音量
    const avgVolume = history.reduce((sum, v) => sum + v, 0) / history.length;
    
    // 检测瞬时峰值（当前音量比平均值高很多）
    const threshold = avgVolume * 2.5; // 阈值：平均值的2.5倍
    const isBeat = currentVolume > threshold && currentVolume > 60; // 同时要求音量>60
    
    // 鼓点冷却（避免频繁触发）
    const now = Date.now();
    if (isBeat && (now - this.data.lastBeatTime) > 200) { // 至少间隔200ms
      this.setData({
        lastBeatTime: now,
        beatCooldown: 200
      });
      return true;
    }
    
    return false;
  },

  /**
   * 计算BPM
   */
  calculateBPM() {
    const audioHistory = this.data.audioHistory || [];
    if (audioHistory.length < 10) {
      return 0;
    }
    
    // 找出所有峰值点
    const peaks = [];
    for (let i = 1; i < audioHistory.length - 1; i++) {
      if (audioHistory[i].volume > audioHistory[i-1].volume && 
          audioHistory[i].volume > audioHistory[i+1].volume &&
          audioHistory[i].volume > 50) {
        peaks.push(audioHistory[i].time);
      }
    }
    
    if (peaks.length < 2) {
      return 0;
    }
    
    // 计算峰值间隔的平均值
    let totalInterval = 0;
    for (let i = 1; i < peaks.length; i++) {
      totalInterval += peaks[i] - peaks[i-1];
    }
    const avgInterval = totalInterval / (peaks.length - 1);
    
    // 转换为BPM（每分钟节拍数）
    const bpm = Math.round(60000 / avgInterval);
    return Math.min(200, Math.max(60, bpm)); // 限制在60-200 BPM之间
  },

  /**
   * 根据音频特征选择灯光模式
   * 彩虹色映射（按文案）：
   * - 低能量：冷色（蓝/青）
   * - 中能量：青绿黄过渡
   * - 高能量：暖色爆发（红/橙/粉/紫）
   * 低音保底：音量很低时保持全黑
   * 亮度线性增加：5-100% 映射到 0-100% 亮度
   */
  selectLightMode(volumeLevel, hasBeat) {
    const now = Date.now();
    const silentThreshold = 5;
    const minBrightness = 0;
    const activeMinBrightness = 16; // 闪烁时最低亮度抬到视频体感区间（约14~18）
    const darkHoldMs = 200;

    // 有效音量达到静音阈值时，刷新防回黑保持窗口
    if (volumeLevel >= silentThreshold) {
      this._darkHoldUntil = now + darkHoldMs;
    }

    // 低于阈值但仍在保持窗口内：按阈值计算，避免颜色刚亮就回黑
    const effectiveVolume =
      volumeLevel < silentThreshold &&
      this._darkHoldUntil > 0 &&
      now < this._darkHoldUntil
        ? silentThreshold
        : volumeLevel;

    // 开场稳定期（前2秒）：禁用闪烁，避免“开场闪几下”
    const inStartupWindow =
      this.data.audioStartTime > 0 &&
      (now - this.data.audioStartTime) < 2000;

    // 彩虹 7 色轮换（每次闪烁切换到下一色）
    const rainbowHues = [0, 30, 60, 120, 180, 240, 285]; // 红橙黄绿青蓝紫
    if (typeof this._rainbowIndex !== 'number') {
      this._rainbowIndex = 0;
    }
    let hue = rainbowHues[this._rainbowIndex % rainbowHues.length];
    
    // 音量级别映射到亮度：0-100 -> 0(全黑) -> 100(最亮)
    // 低音量时保持全黑
    let brightness = minBrightness;
    if (effectiveVolume < silentThreshold) {
      brightness = minBrightness;
    } else {
      // 5-100% 映射到 0-100% 亮度
      brightness = Math.round(
        ((effectiveVolume - silentThreshold) / (100 - silentThreshold)) *
          (100 - minBrightness) +
          minBrightness
      );
      brightness = Math.min(100, Math.max(0, brightness));
    }
    
    // 按用户目标：静音全黑；普通段无鼓点按 BPM 慢闪；有鼓点即闪；强音快闪
    let lightMode = 'constant';
    let speed = 'slow';
    let outBrightness = minBrightness;
    
    if (effectiveVolume < silentThreshold) {
      // 最弱：全黑常亮，不闪烁
      return {
        mode: 'silent',
        brightness: minBrightness,
        lightMode: 'constant',
        color: { hue: hue, saturation: 100 },
        speed: 'slow'
      };
    } else if (!inStartupWindow && effectiveVolume > 70) {
      // 强音：爆闪（前2秒禁 quickFlash）
      lightMode = 'quickFlash';
      speed = 'bpm';
      outBrightness = Math.max(activeMinBrightness, brightness);
    } else if (!inStartupWindow && hasBeat) {
      // 正常段：只有判到鼓点时才闪一下（一拍一闪）
      lightMode = 'flash';
      speed = 'beat';
      outBrightness = Math.max(activeMinBrightness, brightness);
    } else {
      // 无鼓点：按 BPM 慢闪（1拍1闪）
      lightMode = 'bpmFlash';
      speed = 'bpm';
      outBrightness = Math.max(activeMinBrightness, brightness);
    }
    
    // 闪一次换一个颜色：仅在闪烁模式推进彩虹索引
    if (lightMode === 'flash' || lightMode === 'quickFlash' || lightMode === 'bpmFlash') {
      this._rainbowIndex = (this._rainbowIndex + 1) % rainbowHues.length;
      hue = rainbowHues[this._rainbowIndex];
    }

    return {
      mode: effectiveVolume < silentThreshold ? 'silent' : 
            lightMode === 'quickFlash' ? 'climax' :
            lightMode === 'flash' ? 'beat' : 'normal',
      brightness: outBrightness,
      lightMode: lightMode,
      color: {
        hue: hue,
        saturation: 100
      },
      speed: speed
    };
  },

  /**
   * 开始音频分析
   */
  startAudioAnalysis() {
    console.log('🎵 开始音频分析');
    
    const timer = setInterval(() => {
      if (!this.data.isListening || !this.data.isConnected) {
        console.log('🛑 停止音频分析：isListening=', this.data.isListening, 'isConnected=', this.data.isConnected);
        clearInterval(timer);
        this.setData({ audioTimer: null });
        return;
      }
      
      // 获取当前音量（优先使用真实数据）
      let currentVolume = this.data.audioLevel || 0;
      
      // 如果有历史数据，使用最新的音量值
      if (this.data.volumeHistory && this.data.volumeHistory.length > 0) {
        const history = this.data.volumeHistory;
        const latestVolume = history[history.length - 1];
        if (latestVolume > 0) {
          currentVolume = latestVolume;
        }
      }
      
      // 如果没有真实音频数据，使用模拟数据（用于测试和演示）
      // 模拟不同音量级别，让颜色有变化
      if (currentVolume === 0 || (this.data.volumeHistory && this.data.volumeHistory.length === 0)) {
        // 使用时间戳生成更平滑的模拟数据
        const time = Date.now();
        const baseVolume = 50 + Math.sin(time / 1000) * 30; // 50-80之间波动（提高基础音量）
        const randomVariation = (Math.random() - 0.5) * 20; // ±10的随机变化
        currentVolume = Math.max(0, Math.min(100, baseVolume + randomVariation));
        
        // 更新音量历史（模拟真实数据流）
        const history = this.data.volumeHistory || [];
        history.push(currentVolume);
        if (history.length > 20) {
          history.shift();
        }
        this.setData({ 
          audioLevel: currentVolume,
          volumeHistory: history
        });
        
        // 添加调试日志
        if (Math.random() < 0.1) {
          console.log('🎵 使用模拟音频数据:', { 音量: currentVolume.toFixed(1) });
        }
      }
      
      // 添加音量日志（每20次记录一次）
      if (Math.random() < 0.05) {
        console.log('🎵 当前音频状态:', {
          音量: currentVolume.toFixed(1),
          模式: this.data.currentMode,
          有鼓点: hasBeat,
          BPM: bpm || 0
        });
      }
      
      // 检测鼓点
      const hasBeat = this.detectBeat(currentVolume);
      
      // 计算BPM
      const bpm = this.calculateBPM();
      if (bpm > 0) {
        this.setData({ bpm });
      }
      
      // 根据音频特征选择灯光模式
      const lightConfig = this.selectLightMode(currentVolume, hasBeat);
      
      // 更新当前模式
      if (lightConfig.mode !== this.data.currentMode) {
        console.log('🎨 模式切换:', this.data.currentMode, '->', lightConfig.mode, {
          音量: currentVolume.toFixed(1),
          有鼓点: hasBeat,
          BPM: bpm
        });
        this.setData({ currentMode: lightConfig.mode });
      }
      
      // 更新颜色和亮度（强制更新，确保颜色变化）
      const newHue = lightConfig.color.hue;
      const newSaturation = lightConfig.color.saturation;
      const newBrightness = lightConfig.brightness;
      
      // 只有颜色或亮度真正改变时才更新
      if (this.data.hue !== newHue || 
          this.data.saturation !== newSaturation || 
          this.data.brightness !== newBrightness) {
        console.log('🎨 颜色更新:', {
          模式: lightConfig.mode,
          色相: newHue,
          饱和度: newSaturation,
          亮度: newBrightness,
          音量: currentVolume.toFixed(1)
        });
        
        this.setData({
          hue: newHue,
          saturation: newSaturation,
          brightness: newBrightness
        });
      }
      
      // 根据模式发送不同的数据帧
      this.sendLightModeData(lightConfig);
      
      // 更新鼓点冷却时间
      if (this.data.beatCooldown > 0) {
        this.setData({ beatCooldown: Math.max(0, this.data.beatCooldown - 50) });
      }
    }, 50); // 每50ms刷新一次，符合协议要求
    
    this.setData({ audioTimer: timer });
    console.log('✅ 音频分析定时器已启动');
  },

  /**
   * 灵敏度改变
   */
  onSensitivityChange(e) {
    const sensitivity = e.detail.value;
    this.setData({ sensitivity });
    this.sendSensitivityToDevice();
  },

  /**
   * 灵敏度减少
   */
  decreaseSensitivity() {
    const sensitivity = Math.max(0, this.data.sensitivity - 5);
    this.setData({ sensitivity });
    this.sendSensitivityToDevice();
  },

  /**
   * 灵敏度增加
   */
  increaseSensitivity() {
    const sensitivity = Math.min(200, this.data.sensitivity + 5);
    this.setData({ sensitivity });
    this.sendSensitivityToDevice();
  },

  /**
   * 根据灯光模式发送数据到设备
   */
  sendLightModeData(lightConfig) {
    if (!this.data.isConnected) {
      return;
    }
    
    try {
      let frame;
      const frameSeq = 0;
      const { lightMode, brightness, color } = lightConfig;
      
      // 慢闪由设备自循环；50ms 重复下发会重置相位，仅在参数实质变化时发送
      if (lightMode === 'slowFlash') {
        const bq = Math.round(brightness / 12) * 12;
        const hq = Math.round(color.hue / 15) * 15;
        const ambientSig = `slowFlash|${hq}|${bq}|2,5,28,48`;
        if (ambientSig === this._lastAmbientLightSig) {
          return;
        }
        this._lastAmbientLightSig = ambientSig;
      } else {
        this._lastAmbientLightSig = '';
      }
      
      // 将亮度百分比转换为0-255
      const brightnessValue = Math.round((brightness / 100) * 255);
      
      // 将HSB转换为RGB（用于需要RGB值的模式）
      const rgb = this.hsbToRgb(color.hue, color.saturation, brightness);
      
      // 确保RGB值是有效的数字
      if (!rgb || rgb.r === undefined || rgb.g === undefined || rgb.b === undefined) {
        console.error('❌ RGB转换失败', { color, brightness, rgb });
        return;
      }
      
      // 确保RGB值在0-255范围内
      const r = Math.max(0, Math.min(255, Math.round(rgb.r)));
      const g = Math.max(0, Math.min(255, Math.round(rgb.g)));
      const b = Math.max(0, Math.min(255, Math.round(rgb.b)));
      
      // 根据模式选择不同的数据帧
      switch (lightMode) {
        case 'slowFlash':
          // 短亮长熄（单位 5ms）：节拍感弱时保持亮暗交替，避免长亮
          frame = protocol.buildFlashFrame(frameSeq, r, g, b, 2, 5, 28, 48);
          break;
          
        case 'constant':
          // 常亮模式
          frame = protocol.buildConstantFrame(
            frameSeq,
            color.hue,
            color.saturation,
            brightness
          );
          break;
          
        case 'flash':
          // 闪烁模式：快速闪烁1次（短周期）
          frame = protocol.buildFlashFrame(
            frameSeq,
            r,
            g,
            b,
            1, 2, 1, 2 // 非常短的闪烁周期
          );
          break;
        
        case 'bpmFlash': {
          // 视频体感慢闪：亮得更久、灭得更稳（单位 5ms）
          frame = protocol.buildFlashFrame(frameSeq, r, g, b, 12, 25, 60, 85);
          break;
        }
          
        case 'quickFlash':
          // 快闪模式：根据BPM调整速度
          const bpm = this.data.bpm || 120;
          const flashInterval = Math.max(2, Math.min(12, Math.round(6000 / bpm / 5))); // 根据BPM计算闪烁间隔
          frame = protocol.buildFlashFrame(
            frameSeq,
            r,
            g,
            b,
            flashInterval, flashInterval + 2, flashInterval, flashInterval + 2
          );
          break;
          
        default:
          frame = protocol.buildFlashFrame(frameSeq, r, g, b, 2, 5, 28, 48);
      }
      
      // 高频刷新使用WriteNoResponse
      bleController.sendFrame(frame, true).catch(err => {
        console.error('音乐律动数据发送失败', err);
      });
    } catch (error) {
      console.error('构建音乐律动数据帧失败', error);
    }
  },

  /**
   * HSB转RGB（辅助方法）
   */
  hsbToRgb(h, s, b) {
    const rgb = protocol.hsbToRgb(h, s, b);
    // 确保返回有效的RGB对象
    if (!rgb || rgb.r === undefined || rgb.g === undefined || rgb.b === undefined) {
      console.error('❌ HSB转RGB失败', { h, s, b, rgb });
      return { r: 0, g: 0, b: 0 }; // 返回默认黑色
    }
    return { r: rgb.r, g: rgb.g, b: rgb.b };
  },

  /**
   * 发送灵敏度数据到设备（灵敏度改变时不需要立即发送，只在开启监听时生效）
   */
  sendSensitivityToDevice() {
    // 灵敏度改变时，如果正在监听，会通过定时器自动更新
    console.log('灵敏度已更新:', this.data.sensitivity);
  },

  /**
   * 显示帮助信息
   */
  showHelp() {
    this.setData({ showHelpPopup: true });
  },

  closeHelp() {
    this.setData({ showHelpPopup: false });
  },

  stopPropagation() {}

})
