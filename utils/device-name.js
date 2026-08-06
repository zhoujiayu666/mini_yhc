const STORAGE_KEY = 'deviceCustomNames';
const MAX_NAME_LEN = 20;

function getCustomNameMap() {
  try {
    return wx.getStorageSync(STORAGE_KEY) || {};
  } catch (error) {
    console.warn('[device-name] 读取自定义名称失败', error);
    return {};
  }
}

function nameKeys(deviceOrId) {
  if (!deviceOrId) return [];
  if (typeof deviceOrId === 'string') {
    return [deviceOrId];
  }
  const keys = [];
  if (deviceOrId.bindId) keys.push(deviceOrId.bindId);
  if (deviceOrId.deviceId) keys.push(deviceOrId.deviceId);
  return keys;
}

function getCustomName(deviceOrId) {
  const map = getCustomNameMap();
  const keys = nameKeys(deviceOrId);
  for (let i = 0; i < keys.length; i++) {
    const v = String(map[keys[i]] || '').trim();
    if (v) return v;
  }
  return '';
}

function setCustomName(deviceOrId, name) {
  const keys = nameKeys(deviceOrId);
  if (!keys.length) {
    return false;
  }
  const trimmed = String(name || '').trim().slice(0, MAX_NAME_LEN);
  const map = getCustomNameMap();
  // 主 key 优先 bindId
  const primary = keys[0];
  if (!trimmed) {
    keys.forEach((k) => {
      delete map[k];
    });
  } else {
    map[primary] = trimmed;
    // 同步清掉旧 deviceId 上的别名，避免分裂
    keys.slice(1).forEach((k) => {
      delete map[k];
    });
  }
  wx.setStorageSync(STORAGE_KEY, map);
  return true;
}

function getBleDefaultName(device) {
  if (!device) {
    return '未知设备';
  }
  return device.name || device.localName || device.bindId || device.deviceId || '未知设备';
}

function getDeviceDisplayName(device) {
  if (!device) {
    return '未知设备';
  }
  const custom = getCustomName(device);
  if (custom) {
    return custom;
  }
  return getBleDefaultName(device);
}

module.exports = {
  MAX_NAME_LEN,
  getCustomName,
  setCustomName,
  getBleDefaultName,
  getDeviceDisplayName
};
