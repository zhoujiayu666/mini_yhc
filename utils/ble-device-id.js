/**
 * 手灯设备识别：过滤目标设备、从广播解析稳定 bindId（MAC）
 * 公司 ID 0x0642，与固件 ble_adv.c 厂商数据一致
 */
const protocol = require('./protocol.js');

const MFG_COMPANY_LO = 0x42;
const MFG_COMPANY_HI = 0x06;

/** 允许的蓝牙名（大小写不敏感） */
const ALLOWED_NAME_PREFIXES = ['TPY', 'AB2038P', 'TOPUYI', 'FEELIGHT', 'FEEL'];

function normalizeUuid(uuid) {
  return String(uuid || '').replace(/-/g, '').toUpperCase();
}

function arrayBufferToBytes(buffer) {
  if (!buffer) return [];
  if (buffer instanceof ArrayBuffer) return Array.from(new Uint8Array(buffer));
  if (buffer.buffer instanceof ArrayBuffer) {
    return Array.from(
      new Uint8Array(buffer.buffer, buffer.byteOffset || 0, buffer.byteLength)
    );
  }
  // 部分基础库 / setData 后可能变成普通数组
  if (Array.isArray(buffer)) {
    return buffer.map((n) => Number(n) & 0xff);
  }
  // 少数环境给 base64 字符串
  if (typeof buffer === 'string' && buffer.length > 0) {
    try {
      if (typeof wx !== 'undefined' && wx.base64ToArrayBuffer) {
        return Array.from(new Uint8Array(wx.base64ToArrayBuffer(buffer)));
      }
    } catch (e) {
      /* ignore */
    }
  }
  return [];
}

function formatMacBytes(bytes, offset) {
  const mac = [];
  for (let i = 0; i < 6; i++) {
    mac.push(bytes[offset + i].toString(16).padStart(2, '0').toUpperCase());
  }
  return mac.join(':');
}

function isMacBindId(id) {
  return /^([0-9A-F]{2}:){5}[0-9A-F]{2}$/.test(String(id || '').toUpperCase());
}

/**
 * 从字节里找 Company 0x0642 + MAC
 * 兼容：完整 AD 结构 / 仅厂商 payload（微信常见）/ 带 0xFF 头
 */
function extractMacFromBytes(bytes) {
  if (!bytes || bytes.length < 2) return '';

  // 1) 微信文档：advertisData 常为 ManufacturerData 数据段本身 → 42 06 + MAC[6]
  if (
    bytes.length >= 8 &&
    bytes[0] === MFG_COMPANY_LO &&
    bytes[1] === MFG_COMPANY_HI
  ) {
    return formatMacBytes(bytes, 2);
  }

  // 2) 带 AD type：09 FF 42 06 + MAC / 或 FF 42 06 + MAC
  for (let i = 0; i + 7 < bytes.length; i++) {
    if (
      bytes[i] === 0xff &&
      bytes[i + 1] === MFG_COMPANY_LO &&
      bytes[i + 2] === MFG_COMPANY_HI &&
      i + 8 < bytes.length
    ) {
      return formatMacBytes(bytes, i + 3);
    }
    if (
      bytes[i] === MFG_COMPANY_LO &&
      bytes[i + 1] === MFG_COMPANY_HI &&
      i + 7 < bytes.length
    ) {
      // 避免把随机数据误判：后面 6 字节不全为 0 或存在即可
      return formatMacBytes(bytes, i + 2);
    }
  }

  // 3) 完整广播 AD 结构遍历
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
    if (type === 0xff && dataLen >= 8) {
      if (
        bytes[dataIndex] === MFG_COMPANY_LO &&
        bytes[dataIndex + 1] === MFG_COMPANY_HI
      ) {
        return formatMacBytes(bytes, dataIndex + 2);
      }
    }
    index = nextIndex;
  }
  return '';
}

function getDeviceName(device) {
  return String((device && (device.name || device.localName)) || '').trim();
}

function isAllowedDeviceName(name) {
  const n = String(name || '').trim().toUpperCase();
  if (!n) return false;
  return ALLOWED_NAME_PREFIXES.some(
    (p) => n === p || n.startsWith(p) || n.includes(p)
  );
}

/**
 * 解析厂商数据中的 MAC（Company 0x0642 + 6 字节地址）
 * @returns {string} 形如 AA:BB:CC:DD:EE:FF，没有则空串
 */
function parseMacFromAdvertisData(advertisData) {
  return extractMacFromBytes(arrayBufferToBytes(advertisData));
}

function hasOurManufacturer(advertisData) {
  const bytes = arrayBufferToBytes(advertisData);
  if (bytes.length >= 2) {
    if (bytes[0] === MFG_COMPANY_LO && bytes[1] === MFG_COMPANY_HI) {
      return true;
    }
  }
  for (let i = 0; i + 1 < bytes.length; i++) {
    if (bytes[i] === MFG_COMPANY_LO && bytes[i + 1] === MFG_COMPANY_HI) {
      return true;
    }
    if (
      bytes[i] === 0xff &&
      i + 2 < bytes.length &&
      bytes[i + 1] === MFG_COMPANY_LO &&
      bytes[i + 2] === MFG_COMPANY_HI
    ) {
      return true;
    }
  }
  return false;
}

function advertisDataHasTargetService(advertisData) {
  const bytes = arrayBufferToBytes(advertisData);
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

    if ((type === 0x02 || type === 0x03) && dataLen >= 2) {
      for (let i = dataIndex; i + 1 < dataIndex + dataLen; i += 2) {
        if (bytes[i] === 0xe0 && bytes[i + 1] === 0xff) return true;
      }
    }

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
        if (isBaseUuid) return true;
      }
    }
    index = nextIndex;
  }
  return false;
}

function hasFfe0Service(device) {
  const targetService = normalizeUuid(protocol.BLE_SERVICE_ID);
  const serviceUuids =
    (device && (device.advertisServiceUUIDs || device.serviceUUIDs)) || [];
  const hasServiceMatch = serviceUuids.some((u) => {
    const nu = normalizeUuid(u);
    return nu === targetService || nu.includes('FFE0');
  });
  if (hasServiceMatch) return true;
  return advertisDataHasTargetService(device && device.advertisData);
}

/**
 * 是否为本产品手灯
 * - 厂商数据含 0x0642 → 直接认
 * - 或 FFE0 + 名称在白名单（排除 LTFC73 等）
 * - 名称尚未报到：仅 FFE0 暂留，后续非白名单名会剔除
 * - 兼容旧安卓 MAC 前缀
 */
function isTargetBleDevice(device) {
  if (!device) return false;
  if (hasOurManufacturer(device.advertisData)) return true;

  const name = getDeviceName(device);
  if (isAllowedDeviceName(name)) return true;

  const deviceId = String(device.deviceId || '').toUpperCase();
  if (deviceId.startsWith('84:AA:A4')) return true;

  if (!hasFfe0Service(device)) return false;
  if (!name) return true;
  return isAllowedDeviceName(name);
}

/**
 * 稳定业务 ID：优先广播 MAC，其次已有 MAC 形 bindId，再安卓 MAC，最后 deviceId
 */
function getDeviceBindId(device) {
  if (!device) return '';
  const fromAdv = parseMacFromAdvertisData(device.advertisData);
  if (fromAdv) return fromAdv;

  if (device.bindId && isMacBindId(device.bindId)) {
    return String(device.bindId).toUpperCase();
  }

  const deviceId = String(device.deviceId || '').toUpperCase();
  if (isMacBindId(deviceId)) {
    return deviceId;
  }

  if (device.bindId) {
    return String(device.bindId).toUpperCase();
  }
  return deviceId;
}

/** 给扫描到的设备补上 bindId；去掉 advertisData 避免 setData 丢二进制后把 MAC 弄丢 */
function enrichDeviceIdentity(device) {
  if (!device) return device;
  const bindId = getDeviceBindId(device);
  const hasStableMac = isMacBindId(bindId);
  let shortId = '';
  if (hasStableMac) {
    shortId = bindId.split(':').slice(-3).join(':');
  } else if (bindId.length > 12) {
    shortId = `${bindId.slice(0, 8)}…${bindId.slice(-4)}`;
  } else {
    shortId = bindId;
  }
  const next = {
    ...device,
    bindId,
    shortId,
    hasStableMac
  };
  // ArrayBuffer 经 setData 会坏，解析完即丢弃
  delete next.advertisData;
  return next;
}

/** 列表展示用短 ID */
function getShortDeviceId(device) {
  if (!device) return '';
  if (device.shortId) return device.shortId;
  const bindId = getDeviceBindId(device);
  if (!bindId) return '';
  if (isMacBindId(bindId)) {
    return bindId.split(':').slice(-3).join(':');
  }
  if (bindId.length > 12) {
    return `${bindId.slice(0, 8)}…${bindId.slice(-4)}`;
  }
  return bindId;
}

/** 历史是否算本产品（清理杂项如 LTFC73） */
function isTargetHistoryRecord(record) {
  if (!record) return false;
  const bindId = String(record.bindId || '').toUpperCase();
  if (bindId && bindId.indexOf(':') >= 0) return true;

  const name = getDeviceName(record);
  if (name && isAllowedDeviceName(name)) return true;
  if (name && !isAllowedDeviceName(name)) return false;

  const deviceId = String(record.deviceId || '').toUpperCase();
  if (deviceId.startsWith('84:AA:A4')) return true;
  if (!name && deviceId.indexOf('-') >= 0) return true;
  if (!name && /^([0-9A-F]{2}:){5}[0-9A-F]{2}$/.test(deviceId)) return true;
  return !name;
}

function pickBetterDevice(prev, next) {
  const prevRssi = typeof prev.RSSI === 'number' ? prev.RSSI : -999;
  const nextRssi = typeof next.RSSI === 'number' ? next.RSSI : -999;
  const prevScore =
    (prev.name ? 1 : 0) + (prev.localName ? 1 : 0) + (prev.hasStableMac ? 2 : 0);
  const nextScore =
    (next.name ? 1 : 0) + (next.localName ? 1 : 0) + (next.hasStableMac ? 2 : 0);
  let merged;
  if (nextRssi > prevRssi || (nextRssi === prevRssi && nextScore > prevScore)) {
    merged = { ...prev, ...next };
  } else {
    merged = { ...next, ...prev };
  }
  // MAC 形 bindId 优先保留
  if (isMacBindId(prev.bindId) && !isMacBindId(next.bindId)) {
    merged.bindId = prev.bindId;
    merged.hasStableMac = true;
    merged.shortId = prev.shortId || getShortDeviceId(prev);
  } else if (isMacBindId(next.bindId)) {
    merged.bindId = next.bindId;
    merged.hasStableMac = true;
    merged.shortId = next.shortId || getShortDeviceId(next);
  }
  return enrichDeviceIdentity(merged);
}

/**
 * 扫描列表去重：同一 deviceId 合并；MAC bindId 也合并
 */
function dedupeDevicesByBindId(devices) {
  const byDeviceId = {};
  (devices || []).forEach((raw) => {
    const d = enrichDeviceIdentity(raw);
    const deviceKey = String(d.deviceId || '').toUpperCase();
    if (!deviceKey) return;
    if (!byDeviceId[deviceKey]) {
      byDeviceId[deviceKey] = d;
    } else {
      byDeviceId[deviceKey] = pickBetterDevice(byDeviceId[deviceKey], d);
    }
  });

  // 再按稳定 MAC 合并（防止同 MAC 不同 deviceId 的残留）
  const byBind = {};
  Object.values(byDeviceId).forEach((d) => {
    const key = isMacBindId(d.bindId)
      ? String(d.bindId).toUpperCase()
      : String(d.deviceId || '').toUpperCase();
    if (!key) return;
    if (!byBind[key]) {
      byBind[key] = d;
    } else {
      byBind[key] = pickBetterDevice(byBind[key], d);
    }
  });

  return Object.values(byBind).filter((d) => {
    // enrich 后已无 advertisData，用名称/厂商标记判断
    if (d.hasStableMac) return true;
    return isTargetBleDevice({
      ...d,
      // 无 advertisData 时靠名称 + 服务字段
      advertisData: null
    });
  });
}

module.exports = {
  ALLOWED_NAME_PREFIXES,
  normalizeUuid,
  arrayBufferToBytes,
  getDeviceName,
  isAllowedDeviceName,
  parseMacFromAdvertisData,
  hasOurManufacturer,
  advertisDataHasTargetService,
  hasFfe0Service,
  isTargetBleDevice,
  getDeviceBindId,
  enrichDeviceIdentity,
  getShortDeviceId,
  isMacBindId,
  isTargetHistoryRecord,
  dedupeDevicesByBindId
};
