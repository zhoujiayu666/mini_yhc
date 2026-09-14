function getPlatform() {
  try {
    const info = wx.getDeviceInfo ? wx.getDeviceInfo() : wx.getSystemInfoSync();
    return String(info.platform || '').toLowerCase();
  } catch (e) {
    return '';
  }
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function callWx(api, options = {}) {
  return new Promise((resolve, reject) => {
    if (!wx[api]) {
      reject({ errMsg: `${api}:fail api not supported` });
      return;
    }
    wx[api]({
      ...options,
      success: resolve,
      fail: reject
    });
  });
}

function isAndroid() {
  return getPlatform() === 'android';
}

function isIOS() {
  const platform = getPlatform();
  return platform === 'ios' || platform === 'devtools';
}

function getSetting() {
  return callWx('getSetting').catch(() => ({ authSetting: {} }));
}

function openPermissionSetting() {
  if (wx.openSetting) {
    wx.openSetting({});
  }
}

function normalizeBluetoothError(error) {
  const errMsg = String((error && error.errMsg) || error || '');
  const errCode = error && error.errCode;

  if (errMsg.includes('location permission is denied')) {
    return {
      title: '需要位置权限',
      content:
        '当前手机扫描蓝牙设备需要使用位置信息权限。\n\n请在系统设置里允许微信使用「位置信息」和「附近设备」，并确认手机定位服务已开启后重试。',
      canOpenSetting: true
    };
  }

  if (
    errMsg.includes('need open first') ||
    errMsg.includes('not available') ||
    errCode === 10001
  ) {
    if (isIOS()) {
      return {
        title: '无法使用蓝牙',
        content:
          '请确认手机蓝牙已开启，并在 iPhone 设置中允许微信使用蓝牙。\n\n路径：设置 → 微信 → 蓝牙。打开后请完全退出微信，再重新进入小程序重试。',
        canOpenSetting: true
      };
    }
    return {
      title: '无法使用蓝牙',
      content:
        '请确认手机蓝牙已开启，并允许微信使用「附近设备」权限。\n\n部分 Android 手机还需要打开系统定位服务后才能搜索蓝牙设备。',
      canOpenSetting: true
    };
  }

  if (errMsg.includes('unauthorized') || errMsg.includes('auth deny') || errMsg.includes('permission')) {
    return {
      title: '需要蓝牙权限',
      content:
        '请允许微信使用蓝牙相关权限后重试。\n\niPhone：设置 → 微信 → 蓝牙。\nAndroid：设置 → 应用 → 微信 → 权限，允许「附近设备」和「位置信息」。',
      canOpenSetting: true
    };
  }

  if (errCode === 10009 || errMsg.includes('not init')) {
    return {
      title: '蓝牙初始化失败',
      content: '蓝牙初始化未完成，请确认手机蓝牙已开启后，稍等几秒再重试。',
      canOpenSetting: false
    };
  }

  return {
    title: '搜索失败',
    content: errMsg || '请检查手机蓝牙权限和设备状态后重试',
    canOpenSetting: false
  };
}

function showBluetoothError(error, fallbackTitle) {
  const message = normalizeBluetoothError(error);
  wx.showModal({
    title: fallbackTitle || message.title,
    content: message.content,
    showCancel: !!message.canOpenSetting,
    cancelText: '知道了',
    confirmText: message.canOpenSetting ? '去设置' : '知道了',
    success: (res) => {
      if (res.confirm && message.canOpenSetting) {
        openPermissionSetting();
      }
    }
  });
}

async function ensureAndroidLocationPermission() {
  if (!isAndroid()) {
    return { ok: true };
  }

  const setting = await getSetting();
  const auth = (setting && setting.authSetting) || {};
  if (auth['scope.userLocation'] === true) {
    return { ok: true };
  }

  if (auth['scope.userLocation'] === false) {
    return {
      ok: false,
      error: {
        errMsg: 'location permission is denied'
      }
    };
  }

  try {
    await callWx('authorize', { scope: 'scope.userLocation' });
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      error: {
        ...error,
        errMsg: 'location permission is denied'
      }
    };
  }
}

async function getBluetoothAdapterStateWithRetry(initBluetoothAdapter) {
  try {
    return await callWx('getBluetoothAdapterState');
  } catch (firstError) {
    const msg = String(firstError.errMsg || '');
    if (msg.includes('not init') || msg.includes('need open first')) {
      if (typeof initBluetoothAdapter === 'function') {
        await initBluetoothAdapter();
      } else {
        await callWx('openBluetoothAdapter');
      }
      await wait(300);
      return await callWx('getBluetoothAdapterState');
    }
    throw firstError;
  }
}

async function ensureBluetoothReady(initBluetoothAdapter) {
  const location = await ensureAndroidLocationPermission();
  if (!location.ok) {
    return {
      available: false,
      message: normalizeBluetoothError(location.error).content,
      error: location.error
    };
  }

  try {
    if (typeof initBluetoothAdapter === 'function') {
      await initBluetoothAdapter();
    } else {
      await callWx('openBluetoothAdapter');
    }
  } catch (error) {
    return {
      available: false,
      message: normalizeBluetoothError(error).content,
      error
    };
  }

  try {
    const state = await getBluetoothAdapterStateWithRetry(initBluetoothAdapter);
    if (!state.available) {
      return {
        available: false,
        discovering: !!state.discovering,
        message: normalizeBluetoothError({ errCode: 10001, errMsg: 'bluetooth not available' }).content,
        error: { errCode: 10001, errMsg: 'bluetooth not available' }
      };
    }
    return {
      available: true,
      discovering: !!state.discovering,
      state: state.adapterState
    };
  } catch (error) {
    return {
      available: false,
      message: normalizeBluetoothError(error).content,
      error
    };
  }
}

module.exports = {
  ensureBluetoothReady,
  normalizeBluetoothError,
  showBluetoothError
};
