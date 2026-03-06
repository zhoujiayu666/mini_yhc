// components/color-wheel/color-wheel.js
Component({
  /**
   * 组件的属性列表
   */
  properties: {
    hue: {
      type: Number,
      value: 0,
      observer: 'updateSelectorPosition'
    },
    saturation: {
      type: Number,
      value: 100,
      observer: 'updateSelectorPosition'
    },
    brightness: {
      type: Number,
      value: 100,
      observer: 'updatePreviewColor'
    }
  },

  /**
   * 组件的初始数据
   */
  data: {
    wheelSize: 506,
    wheelRadius: 253,
    selectorSize: 40,
    selectorX: 253,
    selectorY: 0,
    previewColor: '#FFD100'
  },

  lifetimes: {
    attached() {
      // 在 attached 阶段就开始初始化，提前准备
      this.updateSelectorPosition();
      this.updatePreviewColor();
    }
  },

  methods: {

    /**
     * HSB转RGB（返回数组格式，用于ImageData）
     */
    hsbToRgbArray(h, s, b) {
      h = h % 360;
      s = s / 100;
      b = b / 100;
      
      const c = b * s;
      const x = c * (1 - Math.abs((h / 60) % 2 - 1));
      const m = b - c;
      
      let r, g, blue;
      
      if (h >= 0 && h < 60) {
        r = c; g = x; blue = 0;
      } else if (h >= 60 && h < 120) {
        r = x; g = c; blue = 0;
      } else if (h >= 120 && h < 180) {
        r = 0; g = c; blue = x;
      } else if (h >= 180 && h < 240) {
        r = 0; g = x; blue = c;
      } else if (h >= 240 && h < 300) {
        r = x; g = 0; blue = c;
      } else {
        r = c; g = 0; blue = x;
      }
      
      return [
        Math.round((r + m) * 255),
        Math.round((g + m) * 255),
        Math.round((blue + m) * 255)
      ];
    },

    /**
     * HSB转RGB（返回字符串格式，用于CSS）
     */
    hsbToRgb(h, s, b) {
      const rgb = this.hsbToRgbArray(h, s, b);
      return `rgb(${rgb[0]}, ${rgb[1]}, ${rgb[2]})`;
    },

    /**
     * 更新选择器位置
     */
    updateSelectorPosition() {
      const hue = this.properties.hue;
      const saturation = this.properties.saturation;
      // 中心半径约11rpx，外半径253rpx（506/2）
      const centerRadius = 11;
      const outerRadius = 253;
      const radius = outerRadius - centerRadius;
      const distance = centerRadius + (saturation / 100) * radius;
      
      // 角度计算需要和 handleTouch 保持一致
      // 在 handleTouch 中，我们加了 90° 偏移来匹配 CSS 渐变
      // 所以这里需要减去 90° 偏移，将 hue 转换回 atan2 坐标系
      // atan2 坐标系：0°=右侧, 90°=下方, 180°=左侧, 270°=上方
      let angle = ((hue - 90 + 360) % 360) * Math.PI / 180;
      
      // 计算选择器位置（相对于圆心）
      const x = this.data.wheelRadius + distance * Math.cos(angle);
      const y = this.data.wheelRadius + distance * Math.sin(angle);
      
      this.setData({
        selectorX: x,
        selectorY: y
      });
      
      this.updatePreviewColor();
    },

    /**
     * 更新预览颜色
     */
    updatePreviewColor() {
      const h = this.properties.hue;
      const s = this.properties.saturation;
      const b = this.properties.brightness;
      
      const rgb = this.hsbToRgb(h, s, b);
      this.setData({ previewColor: rgb });
    },

    /**
     * 触摸开始
     */
    onTouchStart(e) {
      this.handleTouch(e);
    },

    /**
     * 触摸移动
     */
    onTouchMove(e) {
      this.handleTouch(e);
    },

    /**
     * 处理触摸事件
     */
    handleTouch(e) {
      const touch = e.touches[0] || e.changedTouches[0];
      const query = wx.createSelectorQuery().in(this);
      query.select('.color-wheel-container').boundingClientRect((rect) => {
        if (!rect) return;

        // 获取 rpx 与 px 的换算比例，统一单位
        let rpxRatio = 1;
        try {
          // 使用新的 API 替代已废弃的 wx.getSystemInfoSync
          const windowInfo = wx.getWindowInfo();
          // 小程序设计稿通常以 750rpx 为宽度
          rpxRatio = windowInfo.windowWidth / 750;
        } catch (error) {
          console.warn('获取系统信息失败，使用默认比例', error);
        }
        
        const centerX = rect.left + rect.width / 2;
        const centerY = rect.top + rect.height / 2;
        const x = touch.clientX - centerX;
        const y = touch.clientY - centerY;
        const distance = Math.sqrt(x * x + y * y);

        // 使用与样式一致的尺寸（506rpx 外径，22rpx 内径）并转换为 px
        const outerRadius = (506 * rpxRatio) / 2;
        const centerRadius = (22 * rpxRatio) / 2;
        
        // 确保在色轮范围内
        if (distance <= outerRadius && distance >= centerRadius) {
          // 计算角度：atan2(y, x) 数学坐标系
          // atan2: 0°=右侧, 90°=下方, 180°=左侧, 270°=上方
          let angle = Math.atan2(y, x) * 180 / Math.PI;
          angle = (angle + 360) % 360;
          
          // CSS conic-gradient: 0deg=红(右侧), 顺时针旋转
          // 但实际显示中，CSS 渐变可能被旋转了
          // 根据测试：点击顶部偏左红色区域，atan2 计算出 275°，但应该是 330°-360° 或 0°-30°
          // 275° + 90° = 365° = 5°（红色区域），说明需要加 90° 偏移
          // 或者 CSS 渐变被逆时针旋转了 90°
          angle = (angle + 90) % 360;
          
          // 计算饱和度（从中心到边缘，饱和度从0到100）
          const ratio = (distance - centerRadius) / (outerRadius - centerRadius);
          const saturation = Math.min(100, Math.max(0, ratio * 100));
          
          // 计算色相（角度）
          const hue = Math.round(angle);
          
          this.triggerEvent('change', {
            hue: hue,
            saturation: Math.round(saturation),
            brightness: this.properties.brightness
          });
        }
      }).exec();
    },

    /**
     * 点击色轮
     */
    onTap(e) {
      this.handleTouch(e);
    }
  }
})
