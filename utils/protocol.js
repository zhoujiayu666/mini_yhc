// utils/protocol.js
/**
 * 灯光设备集群控制系统通信协议工具类
 */

// ServiceID 和 CharacteristicID
const BLE_SERVICE_ID = '0000FFE0-0000-1000-8000-00805F9B34FB';
const BLE_CHARACTERISTIC_ID = '0000FFE1-0000-1000-8000-00805F9B34FB';

/**
 * 标准CRC32计算（小端模式）
 * 多项式: 0xEDB88320 (IEEE 802.3)
 */
function calculateCRC32(buffer) {
  // CRC32查找表（预计算）
  if (!calculateCRC32.table) {
    calculateCRC32.table = [];
    for (let i = 0; i < 256; i++) {
      let crc = i;
      for (let j = 0; j < 8; j++) {
        crc = (crc & 1) ? (crc >>> 1) ^ 0xEDB88320 : (crc >>> 1);
      }
      calculateCRC32.table[i] = crc >>> 0;
    }
  }
  
  let crc = 0xFFFFFFFF;
  const uint8Array = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  
  for (let i = 0; i < uint8Array.length; i++) {
    crc = (crc >>> 8) ^ calculateCRC32.table[(crc ^ uint8Array[i]) & 0xFF];
  }
  
  crc = (crc ^ 0xFFFFFFFF) >>> 0;
  
  return crc;
}

/**
 * 将数字转换为小端模式的字节数组
 */
function toLittleEndianBytes(value, byteLength) {
  const bytes = [];
  for (let i = 0; i < byteLength; i++) {
    bytes.push(value & 0xFF);
    value = value >>> 8;
  }
  return bytes;
}

/**
 * RGB转十六进制字符串
 */
function rgbToHex(r, g, b) {
  return ((r << 16) | (g << 8) | b).toString(16).padStart(6, '0');
}

/**
 * HSB转RGB
 */
function hsbToRgb(h, s, b) {
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
  
  return {
    r: Math.round((r + m) * 255),
    g: Math.round((g + m) * 255),
    b: Math.round((blue + m) * 255)
  };
}

/**
 * 构建静态模式数据帧
 * @param {Number} frameSeq 帧序号
 * @param {Number} r 红色值 0-255
 * @param {Number} g 绿色值 0-255
 * @param {Number} b 蓝色值 0-255
 */
function buildStaticFrame(frameSeq, r, g, b) {
  const frame = [];
  
  // 帧序号（4字节小端）
  frame.push(...toLittleEndianBytes(frameSeq, 4));
  
  // 应用层控制字：00（静态模式）
  frame.push(0x00);
  
  // RGB颜色（3字节）
  frame.push(r, g, b);
  
  // 计算CRC（4字节小端）- 只对帧序号+控制字+RGB计算CRC
  const crc = calculateCRC32(new Uint8Array(frame));
  frame.push(...toLittleEndianBytes(crc, 4));
  
  // 调试日志
  const hexString = frame.map(b => b.toString(16).padStart(2, '0')).join(' ');
  console.log('📦 构建静态模式数据帧:', {
    帧序号: `0x${frameSeq.toString(16).padStart(8, '0')}`,
    控制字: '0x00 (静态模式)',
    RGB: `R:${r.toString(16).padStart(2, '0')} G:${g.toString(16).padStart(2, '0')} B:${b.toString(16).padStart(2, '0')}`,
    CRC: `0x${crc.toString(16).padStart(8, '0')}`,
    数据长度: frame.length,
    十六进制: hexString
  });
  
  // 返回ArrayBuffer格式（微信小程序要求）
  const uint8Array = new Uint8Array(frame);
  return uint8Array.buffer.slice(uint8Array.byteOffset, uint8Array.byteOffset + uint8Array.byteLength);
}

/**
 * 构建闪烁模式数据帧
 * @param {Number} frameSeq 帧序号
 * @param {Number} r 红色值
 * @param {Number} g 绿色值
 * @param {Number} b 蓝色值
 * @param {Number} onMin 点亮最小时间（单位5ms）
 * @param {Number} onMax 点亮最大时间（单位5ms）
 * @param {Number} offMin 熄灭最小时间（单位5ms）
 * @param {Number} offMax 熄灭最大时间（单位5ms）
 */
function buildFlashFrame(frameSeq, r, g, b, onMin = 2, onMax = 12, offMin = 6, offMax = 16) {
  const frame = [];
  
  // 帧序号（4字节小端）
  frame.push(...toLittleEndianBytes(frameSeq, 4));
  
  // 应用层控制字：10（闪烁模式，根据开发指引）
  frame.push(0x10);
  
  // RGB颜色
  frame.push(r, g, b);
  
  // 闪烁参数（单位5ms）
  frame.push(onMin, onMax, offMin, offMax);
  
  // CRC
  const crc = calculateCRC32(new Uint8Array(frame));
  frame.push(...toLittleEndianBytes(crc, 4));
  
  // 调试日志
  const hexString = frame.map(b => b.toString(16).padStart(2, '0')).join(' ');
  console.log('📦 构建闪烁模式数据帧:', {
    帧序号: `0x${frameSeq.toString(16).padStart(8, '0')}`,
    控制字: '0x10 (闪烁模式)',
    RGB: `R:${r.toString(16).padStart(2, '0')} G:${g.toString(16).padStart(2, '0')} B:${b.toString(16).padStart(2, '0')}`,
    参数: `onMin:${onMin}(${onMin*5}ms) onMax:${onMax}(${onMax*5}ms) offMin:${offMin}(${offMin*5}ms) offMax:${offMax}(${offMax*5}ms)`,
    CRC: `0x${crc.toString(16).padStart(8, '0')}`,
    数据长度: frame.length,
    十六进制: hexString
  });
  
  // 返回ArrayBuffer格式（微信小程序要求）
  const uint8Array = new Uint8Array(frame);
  return uint8Array.buffer.slice(uint8Array.byteOffset, uint8Array.byteOffset + uint8Array.byteLength);
}

/**
 * 构建呼吸模式数据帧
 * @param {Number} frameSeq 帧序号
 * @param {Number} r 红色值
 * @param {Number} g 绿色值
 * @param {Number} b 蓝色值
 * @param {Number} period 周期（ms）
 * @param {Number} duty 占空比（ms）
 */
function buildBreathFrame(frameSeq, r, g, b, period = 2500, duty = 500) {
  const frame = [];
  
  // 帧序号（4字节小端）
  frame.push(...toLittleEndianBytes(frameSeq, 4));
  
  // 应用层控制字：20（呼吸模式，根据开发指引）
  frame.push(0x20);
  
  // RGB颜色
  frame.push(r, g, b);
  
  // 呼吸参数（周期和占空比，各2字节小端）
  frame.push(...toLittleEndianBytes(period, 2));
  frame.push(...toLittleEndianBytes(duty, 2));
  
  // CRC
  const crc = calculateCRC32(new Uint8Array(frame));
  frame.push(...toLittleEndianBytes(crc, 4));
  
  // 调试日志
  const hexString = frame.map(b => b.toString(16).padStart(2, '0')).join(' ');
  const periodBytes = toLittleEndianBytes(period, 2);
  const dutyBytes = toLittleEndianBytes(duty, 2);
  console.log('📦 构建呼吸模式数据帧:', {
    帧序号: `0x${frameSeq.toString(16).padStart(8, '0')}`,
    控制字: '0x20 (呼吸模式)',
    RGB: `R:${r.toString(16).padStart(2, '0')} G:${g.toString(16).padStart(2, '0')} B:${b.toString(16).padStart(2, '0')}`,
    周期: `${period}ms (0x${periodBytes.map(b => b.toString(16).padStart(2, '0')).join('')})`,
    占空比: `${duty}ms (0x${dutyBytes.map(b => b.toString(16).padStart(2, '0')).join('')})`,
    CRC: `0x${crc.toString(16).padStart(8, '0')}`,
    数据长度: frame.length,
    十六进制: hexString
  });
  
  // 返回ArrayBuffer格式（微信小程序要求）
  const uint8Array = new Uint8Array(frame);
  return uint8Array.buffer.slice(uint8Array.byteOffset, uint8Array.byteOffset + uint8Array.byteLength);
}

/**
 * 构建随机模式数据帧（使用文档示例中的原始字节值）
 * @param {Number} frameSeq 帧序号
 * @param {Number} randomSeed 随机种子
 * @param {Number} totalBrightness 总调光 0-255
 * @param {Array} colorGroupBytes 颜色组字节数组，每组3字节（直接使用文档示例值）
 */
function buildRandomFrame(frameSeq, randomSeed, totalBrightness, colorGroupBytes) {
  const frame = [];
  
  // 帧序号（4字节小端）
  frame.push(...toLittleEndianBytes(frameSeq, 4));
  
  // 应用层控制字：40（随机预置颜色模式）
  frame.push(0x40);
  
  // 随机种子
  frame.push(randomSeed);
  
  // 总调光
  frame.push(totalBrightness);
  
  // 颜色组配置（直接使用文档示例中的原始字节值，每组3字节）
  colorGroupBytes.forEach(groupBytes => {
    if (groupBytes.length === 3) {
      frame.push(groupBytes[0], groupBytes[1], groupBytes[2]);
    }
  });
  
  // CRC
  const crc = calculateCRC32(new Uint8Array(frame));
  frame.push(...toLittleEndianBytes(crc, 4));
  
  // 调试日志
  const hexString = frame.map(b => b.toString(16).padStart(2, '0')).join(' ');
  console.log('📦 构建随机模式数据帧:', {
    帧序号: `0x${frameSeq.toString(16).padStart(8, '0')}`,
    控制字: '0x40 (随机预置颜色模式)',
    随机种子: `0x${randomSeed.toString(16).padStart(2, '0')}`,
    总调光: `0x${totalBrightness.toString(16).padStart(2, '0')}`,
    颜色组数: colorGroupBytes.length,
    颜色组详情: colorGroupBytes.map((g, i) => ({
      组: i + 1,
      字节值: `0x${g.map(b => b.toString(16).padStart(2, '0')).join(' ')}`
    })),
    CRC: `0x${crc.toString(16).padStart(8, '0')}`,
    数据长度: frame.length,
    十六进制: hexString
  });
  
  // 返回ArrayBuffer格式（微信小程序要求）
  const uint8Array = new Uint8Array(frame);
  return uint8Array.buffer.slice(uint8Array.byteOffset, uint8Array.byteOffset + uint8Array.byteLength);
}

/**
 * 构建黑场数据帧
 */
function buildBlackOutFrame(frameSeq) {
  return buildStaticFrame(frameSeq, 0, 0, 0);
}

/**
 * 构建常亮数据帧（根据色盘颜色）
 */
function buildConstantFrame(frameSeq, hue, saturation, brightness) {
  const rgb = hsbToRgb(hue, saturation, brightness);
  return buildStaticFrame(frameSeq, rgb.r, rgb.g, rgb.b);
}

/**
 * 构建随机颜色数据帧（每次调用都会重新随机色相；若需固定色相仅调亮度，请用 buildConstantFrame）
 */
function buildRandomColorFrame(frameSeq) {
  const hue = Math.floor(Math.random() * 360);
  const rgb = hsbToRgb(hue, 100, 100);
  return buildStaticFrame(frameSeq, rgb.r, rgb.g, rgb.b);
}

/**
 * 构建快闪数据帧
 */
function buildQuickFlashFrame(frameSeq, hue, saturation, brightness) {
  const rgb = hsbToRgb(hue, saturation, brightness);
  return buildFlashFrame(frameSeq, rgb.r, rgb.g, rgb.b, 2, 12, 6, 16);
}

/**
 * 构建眨眼数据帧（呼吸灯，周期1000ms）
 * 根据协议：周期1000ms，period: 600ms，duty: 400ms
 * period应该是点亮时间，duty是占空比时间
 */
function buildBlinkFrame(frameSeq, hue, saturation, brightness) {
  const rgb = hsbToRgb(hue, saturation, brightness);
  // 协议文档：period: 600ms, duty: 400ms
  // 总周期 = period + duty = 600 + 400 = 1000ms
  return buildBreathFrame(frameSeq, rgb.r, rgb.g, rgb.b, 600, 400);
}

/**
 * 构建呼吸数据帧
 */
function buildBreathEffectFrame(frameSeq, hue, saturation, brightness) {
  const rgb = hsbToRgb(hue, saturation, brightness);
  return buildBreathFrame(frameSeq, rgb.r, rgb.g, rgb.b, 2500, 500);
}

/**
 * 构建聚会效果数据帧
 * 直接使用文档示例中的原始字节值：ff4110 ff4120 ff4130 ff4140 ff4150 ff4160 ff4170
 */
function buildPartyFrame(frameSeq, randomSeed) {
  // 直接使用文档示例中的原始字节值（每组3字节）
  const colorGroupBytes = [
    [0xFF, 0x41, 0x10], // 第1组：ff4110
    [0xFF, 0x41, 0x20], // 第2组：ff4120
    [0xFF, 0x41, 0x30], // 第3组：ff4130
    [0xFF, 0x41, 0x40], // 第4组：ff4140
    [0xFF, 0x41, 0x50], // 第5组：ff4150
    [0xFF, 0x41, 0x60], // 第6组：ff4160
    [0xFF, 0x41, 0x70]  // 第7组：ff4170
  ];
  
  return buildRandomFrame(frameSeq, randomSeed, 0xFF, colorGroupBytes);
}

/**
 * 构建星空效果数据帧
 * 直接使用协议表格中的原始字节值（每组3字节：调光+比例+配置/颜色索引）
 * 表格值：3c4f00 804f00 ffd905 c8d404 80ca03 3cc502 ff0a00
 */
function buildStarFrame(frameSeq, randomSeed) {
  // 直接使用协议表格中的原始字节值（每组3字节）
  const colorGroupBytes = [
    [0x3C, 0x4F, 0x00], // 第1组：调光3c(60) + 比例4f(15) + 配置00(颜色索引0)
    [0x80, 0x4F, 0x00], // 第2组：调光80(128) + 比例4f(15) + 配置00(颜色索引0)
    [0xFF, 0xD9, 0x05], // 第3组：调光ff(255) + 比例d9(25) + 配置05(颜色索引0)
    [0xC8, 0xD4, 0x04], // 第4组：调光c8(200) + 比例d4(20) + 配置04(颜色索引0)
    [0x80, 0xCA, 0x03], // 第5组：调光80(128) + 比例ca(10) + 配置03(颜色索引0)
    [0x3C, 0xC5, 0x02], // 第6组：调光3c(60) + 比例c5(5) + 配置02(颜色索引0)
    [0xFF, 0x0A, 0x00]  // 第7组：调光ff(255) + 比例0a(10) + 配置00(颜色索引0)
  ];
  
  return buildRandomFrame(frameSeq, randomSeed, 0xFF, colorGroupBytes);
}

/**
 * 构建音乐律动数据帧（静态模式，亮度随音乐变化）
 */
function buildMusicRhythmFrame(frameSeq, hue, saturation, brightness) {
  const rgb = hsbToRgb(hue, saturation, brightness);
  return buildStaticFrame(frameSeq, rgb.r, rgb.g, rgb.b);
}

module.exports = {
  BLE_SERVICE_ID,
  BLE_CHARACTERISTIC_ID,
  calculateCRC32, // 导出CRC32函数供ble.js使用
  buildBlackOutFrame,
  buildConstantFrame,
  buildRandomColorFrame,
  buildQuickFlashFrame,
  buildBlinkFrame,
  buildBreathEffectFrame,
  buildBreathFrame, // 导出呼吸模式函数（支持自定义周期和占空比）
  buildFlashFrame, // 导出闪烁模式函数（支持自定义参数）
  buildPartyFrame,
  buildStarFrame,
  buildMusicRhythmFrame,
  hsbToRgb
};
