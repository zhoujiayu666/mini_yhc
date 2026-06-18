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

function getCustomName(deviceId) {
  if (!deviceId) {
    return '';
  }
  const map = getCustomNameMap();
  return String(map[deviceId] || '').trim();
}

function setCustomName(deviceId, name) {
  if (!deviceId) {
    return false;
  }
  const trimmed = String(name || '').trim().slice(0, MAX_NAME_LEN);
  const map = getCustomNameMap();
  if (!trimmed) {
    delete map[deviceId];
  } else {
    map[deviceId] = trimmed;
  }
  wx.setStorageSync(STORAGE_KEY, map);
  return true;
}

function getBleDefaultName(device) {
  if (!device) {
    return '未知设备';
  }
  return device.name || device.localName || device.deviceId || '未知设备';
}

function getDeviceDisplayName(device) {
  if (!device) {
    return '未知设备';
  }
  const custom = getCustomName(device.deviceId);
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
