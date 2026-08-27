const bleController = require('../../utils/ble.js');
const protocol = require('../../utils/protocol.js');
const { requireLogin } = require('../../utils/auth.js');
const { initCloud } = require('../../utils/cloud-config.js');
const { callGroupService: invokeGroupService, showGroupError } = require('../../utils/group-cloud.js');
const app = getApp();

const MODE_TO_EFFECT = {
  white: '常亮',
  flash: '快闪',
  breath: '呼吸',
  party: '聚会',
  rainbow: '彩虹'
};

const EFFECT_TO_MODE_ID = {
  常亮: 'white',
  快闪: 'flash',
  呼吸: 'breath',
  聚会: 'party',
  彩虹: 'rainbow',
  随机: 'white',
  眨眼: 'breath',
  星空: 'party'
};

Page({
  data: {
    deviceStatus: '未连接',
    isConnected: false,
    isScanning: false,
    deviceList: [],
    showDeviceList: false,
    currentDevice: null,
    groups: [],
    mineGroups: [],
    allGroups: [],
    filteredGroups: [],
    groupDetailMode: false,
    activeGroup: null,
    activeUserRole: '',
    activeUserNickname: '',
    groupTab: 'mine',
    previewHue: 0,
    previewSaturation: 100,
    previewBrightness: 80,
    showCreateGroupModal: false,
    showJoinGroupModal: false,
    showEnterPasswordModal: false,
    enterPassword: '',
    pendingEnterGroupId: '',
    memberAwaitingNewDispatch: false,
    groupServiceFunctionName: 'group-service',
    createGroupForm: {
      name: '',
      id: '',
      password: '',
      needPassword: true
    },
    joinGroupForm: {
      id: '',
      nickname: '',
      password: ''
    },
    groupControlEffect: '常亮',
    groupControlBrightness: 80,
    powerOn: true,
    lastMode: 'white',
    selectedModeId: 'white',
    effectSpeed: 50,
    sliderTint: '#D8E8D0',
    displayModes: [
      { id: 'white', name: 'ON', icon: './images/modes/white.png', iconActive: './images/modes/white-active.png' },
      { id: 'flash', name: 'Flash', icon: './images/modes/flash.png', iconActive: './images/modes/flash-active.png' },
      { id: 'breath', name: 'Dimming', icon: './images/modes/breath.png', iconActive: './images/modes/breath-active.png' },
      { id: 'party', name: 'Party', icon: './images/modes/party.png', iconActive: './images/modes/party-active.png' },
      { id: 'rainbow', name: 'Rainbow', icon: './images/modes/rainbow.png', iconActive: './images/modes/rainbow-active.png' }
    ]
  },

  onLoad() {
    initCloud();
    this.updateConnectionStatus();
    bleController.onConnectionStateChange = (connected) => {
      app.globalData.isConnected = connected;
      this.updateConnectionStatus();
    };
    // 首次进入页面由 onLoad 拉取一次，避免 onShow 紧跟再拉一次
    this._skipOnShowLoadOnce = true;
    this.loadGroups();
  },

  onShow() {
    this.updateConnectionStatus();
    if (this._skipOnShowLoadOnce) {
      this._skipOnShowLoadOnce = false;
    } else {
      this.loadGroups();
    }
    this.applyGroupControlToDeviceIfNeeded();
    if (this.data.groupDetailMode) {
      this.startGroupWatch(this.data.activeGroup && this.data.activeGroup.id);
    }
  },

  onHide() {
    this.stopGroupWatch();
    if (this._autoApplyTimer) {
      clearTimeout(this._autoApplyTimer);
      this._autoApplyTimer = null;
    }
    this.stopDynamicEffectLoop();
    if (this.data.groupDetailMode && this.data.activeUserRole === 'admin') {
      this.stopAdminPresenceHeartbeat();
    }
  },

  onUnload() {
    this.stopGroupWatch();
    if (this._autoApplyTimer) {
      clearTimeout(this._autoApplyTimer);
      this._autoApplyTimer = null;
    }
    this.stopDynamicEffectLoop();
    if (this.data.groupDetailMode && this.data.activeUserRole === 'admin') {
      this.stopAdminPresenceHeartbeat();
    }
  },

  updateConnectionStatus() {
    const isConnected = app.globalData.isConnected || bleController.isConnected;
    const patch = {
      isConnected,
      deviceStatus: isConnected ? '已连接' : '未连接',
      currentDevice: app.globalData.currentDevice
    };
    if (this.data.deviceList && this.data.deviceList.length > 0) {
      patch.deviceList = this.annotateDeviceConnection(this.data.deviceList);
    }
    this.setData(patch);
    if (!isConnected) {
      this._lastAppliedGroupControlSignature = '';
      this.stopDynamicEffectLoop();
      return;
    }
    this.applyGroupControlToDeviceIfNeeded();
  },

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

  dedupeDevicesById(devices) {
    const map = {};
    (devices || []).forEach((d) => {
      const id = (d.deviceId || '').toUpperCase();
      if (!id) {
        return;
      }
      const prev = map[id];
      if (!prev) {
        map[id] = d;
        return;
      }
      const prevRssi = typeof prev.RSSI === 'number' ? prev.RSSI : -999;
      const nextRssi = typeof d.RSSI === 'number' ? d.RSSI : -999;
      const prevScore = (prev.name ? 1 : 0) + (prev.localName ? 1 : 0) + (prev.advertisData ? 1 : 0);
      const nextScore = (d.name ? 1 : 0) + (d.localName ? 1 : 0) + (d.advertisData ? 1 : 0);
      if (nextRssi > prevRssi || (nextRssi === prevRssi && nextScore > prevScore)) {
        map[id] = { ...prev, ...d };
      } else {
        map[id] = { ...d, ...prev };
      }
    });
    return Object.values(map);
  },

  normalizeUuid(uuid) {
    return String(uuid || '').replace(/-/g, '').toUpperCase();
  },

  isTargetBleDevice(device) {
    const targetService = this.normalizeUuid(protocol.BLE_SERVICE_ID);
    const serviceUuids = device.advertisServiceUUIDs || device.serviceUUIDs || [];
    const hasServiceMatch = serviceUuids.some((u) => {
      const nu = this.normalizeUuid(u);
      return nu === targetService || nu.includes('FFE0');
    });
    if (hasServiceMatch) {
      return true;
    }
    const deviceId = (device.deviceId || '').toUpperCase();
    return deviceId.startsWith('84:AA:A4');
  },

  openDeviceConnectPanel() {
    this.searchDevices();
  },

  async searchDevices() {
    if (this.data.isScanning) {
      return;
    }
    try {
      await bleController.initBluetoothAdapter().catch(() => {});
      const adapterState = await this.checkBluetoothAdapter();
      if (!adapterState.available) {
        wx.showModal({
          title: '无法使用蓝牙',
          content: adapterState.message || '请先打开蓝牙并检查微信蓝牙权限',
          showCancel: false,
          confirmText: '知道了'
        });
        return;
      }

      this.setData({ isScanning: true, showDeviceList: true, deviceList: [] });

      try {
        const existingDevices = (await bleController.getBluetoothDevices()).filter((d) =>
          this.isTargetBleDevice(d)
        );
        if (existingDevices.length > 0) {
          const deduped = this.dedupeDevicesById(existingDevices);
          this.setData({ deviceList: this.annotateDeviceConnection(deduped) });
        }
      } catch (err) {
        console.log('获取已发现设备失败（可能没有）:', err);
      }

      await bleController.startBluetoothDevicesDiscovery();

      wx.onBluetoothDeviceFound((res) => {
        const foundDevices = (res.devices || []).filter((d) => this.isTargetBleDevice(d));
        const currentList = this.data.deviceList;
        const newList = [...currentList];
        foundDevices.forEach((device) => {
          const index = newList.findIndex((d) => d.deviceId === device.deviceId);
          if (index >= 0) {
            newList[index] = { ...newList[index], ...device };
          } else {
            newList.push(device);
          }
        });
        const uniqueList = this.dedupeDevicesById(newList);
        uniqueList.sort((a, b) => {
          const rssiA = a.RSSI || -100;
          const rssiB = b.RSSI || -100;
          return rssiA - rssiB;
        });
        this.setData({ deviceList: this.annotateDeviceConnection(uniqueList) });
      });

      setTimeout(async () => {
        await bleController.stopBluetoothDevicesDiscovery();
        this.setData({ isScanning: false });
        if (this.data.deviceList.length === 0) {
          wx.showToast({ title: '未发现设备', icon: 'none', duration: 2500 });
        }
      }, 10000);
    } catch (error) {
      console.error('搜索设备失败', error);
      this.setData({ isScanning: false });
      wx.showModal({
        title: '搜索失败',
        content: error.errMsg || '请检查蓝牙状态后重试',
        showCancel: false
      });
    }
  },

  checkBluetoothAdapter() {
    return new Promise((resolve) => {
      wx.getBluetoothAdapterState({
        success: (res) => {
          resolve({
            available: res.available,
            discovering: res.discovering,
            state: res.adapterState
          });
        },
        fail: (err) => {
          resolve({
            available: false,
            message: err.errMsg || '蓝牙未开启',
            errCode: err.errCode
          });
        }
      });
    });
  },

  async connectDevice(e) {
    const { deviceid } = e.currentTarget.dataset;
    const device = this.data.deviceList.find((d) => d.deviceId === deviceid);
    if (!device) {
      return;
    }
    wx.showLoading({ title: '连接中...', mask: true });
    try {
      await bleController.connectDevice(deviceid);
      app.globalData.currentDevice = device;
      app.globalData.isConnected = true;
      app.saveDeviceHistory(device);
      this.setData({
        showDeviceList: false,
        currentDevice: device
      });
      wx.hideLoading();
      wx.showToast({ title: '连接成功', icon: 'success' });
      this.updateConnectionStatus();
    } catch (error) {
      console.error('连接设备失败', error);
      wx.hideLoading();
      wx.showModal({
        title: '连接失败',
        content: (error.userMessage || '请确认设备已开启并靠近后重试'),
        showCancel: false
      });
    }
  },

  closeDeviceList() {
    this.setData({ showDeviceList: false });
    if (this.data.isScanning) {
      bleController.stopBluetoothDevicesDiscovery();
      this.setData({ isScanning: false });
    }
  },

  stopDynamicEffectLoop() {
    if (this._partyTimer) {
      clearInterval(this._partyTimer);
      this._partyTimer = null;
    }
    if (this._starTimer) {
      clearInterval(this._starTimer);
      this._starTimer = null;
    }
    this._dynamicEffectMeta = null;
  },

  applyGroupDocFromWatch(doc, source = 'watch') {
    if (!doc || !this.data.groupDetailMode || !this.data.activeGroup) {
      return;
    }
    const currentId = this.data.activeGroup.id;
    if (String(doc.groupId || '') !== String(currentId || '')) {
      return;
    }
    const adminIsInGroupDetail = !!Number(doc.adminInDetailAt || 0);
    const nextGroup = {
      ...this.data.activeGroup,
      name: doc.name || this.data.activeGroup.name,
      needPassword: doc.needPassword !== false,
      adminIsInGroupDetail,
      controlState: doc.controlState || this.data.activeGroup.controlState || {}
    };
    const cs = nextGroup.controlState || {};
    const patch = { activeGroup: nextGroup };
    if (this.data.activeUserRole !== 'admin') {
      patch.groupControlEffect = cs.effect != null ? cs.effect : this.data.groupControlEffect;
      patch.groupControlBrightness =
        typeof cs.brightness === 'number' ? cs.brightness : this.data.groupControlBrightness;
      patch.previewHue = typeof cs.hue === 'number' ? cs.hue : this.data.previewHue;
      patch.previewSaturation =
        typeof cs.saturation === 'number' ? cs.saturation : this.data.previewSaturation;
      patch.previewBrightness =
        typeof cs.brightness === 'number' ? cs.brightness : this.data.previewBrightness;
    }
    this.setData(patch, () => {
      if (this.data.activeUserRole === 'member') {
        this.applyGroupControlToDeviceIfNeeded();
      }
    });
    console.log('[group-watch] applied', {
      source,
      groupId: currentId,
      effect: cs.effect,
      brightness: cs.brightness,
      dispatchId: cs.dispatchId
    });
  },

  startGroupWatch(groupId) {
    const gid = String(groupId || '').trim();
    if (!gid || !wx.cloud || !wx.cloud.database) {
      console.warn('[group-watch] skip start: invalid groupId or cloud unavailable', { groupId: gid });
      return;
    }
    if (this._groupWatch && this._groupWatchGroupId === gid) {
      console.log('[group-watch] already watching', gid);
      return;
    }
    this.stopGroupWatch();
    try {
      const db = wx.cloud.database();
      console.log('[group-watch] start', gid);
      this._groupWatchGroupId = gid;
      this._groupWatch = db.collection('groups').where({ groupId: gid }).watch({
        onChange: (snapshot) => {
          const doc = snapshot && snapshot.docs && snapshot.docs[0] ? snapshot.docs[0] : null;
          const cs = doc && doc.controlState ? doc.controlState : null;
          console.log('[group-watch] onChange', {
            groupId: gid,
            type: snapshot && snapshot.type,
            docCount: snapshot && snapshot.docs ? snapshot.docs.length : 0,
            effect: cs && cs.effect,
            brightness: cs && cs.brightness,
            dispatchId: cs && cs.dispatchId
          });
          if (snapshot && snapshot.docs && snapshot.docs.length === 0) {
            console.log('[group-watch] group removed', gid);
            this.stopGroupWatch();
            const wasMemberInDetail = this.data.activeUserRole === 'member';
            this._memberDispatchBaselineSignature = '';
            this.setData({
              groupDetailMode: false,
              activeGroup: null,
              activeUserRole: '',
              activeUserNickname: '',
              memberAwaitingNewDispatch: false
            });
            this.applyGroupTab();
            wx.showToast({
              title: wasMemberInDetail ? '该群已被管理员解散' : '群组已被解散',
              icon: 'none'
            });
            return;
          }
          if (doc) {
            this.applyGroupDocFromWatch(doc, snapshot && snapshot.type ? snapshot.type : 'watch');
          }
        },
        onError: (error) => {
          console.error('[group-watch] onError', {
            groupId: gid,
            errMsg: error && error.errMsg,
            error
          });
        }
      });
    } catch (error) {
      console.error('[group-watch] start failed', { groupId: gid, error });
    }
  },

  stopGroupWatch() {
    if (this._groupWatch && typeof this._groupWatch.close === 'function') {
      try {
        this._groupWatch.close();
        console.log('[group-watch] closed', this._groupWatchGroupId || '');
      } catch (error) {
        console.error('[group-watch] close failed', error);
      }
    }
    this._groupWatch = null;
    this._groupWatchGroupId = '';
  },

  /** 从云端 controlState 解析同步参数（兼容旧数据嵌套 sync + 新数据平铺字段） */
  getSyncFromControlState(cs) {
    if (!cs) {
      return null;
    }
    if (cs.sync && typeof cs.sync === 'object') {
      const seed = Number(cs.sync.seed);
      const startAt = Number(cs.sync.startAt);
      const stepMs = Number(cs.sync.stepMs);
      if (Number.isFinite(seed) && Number.isFinite(startAt) && Number.isFinite(stepMs) && stepMs > 0) {
        return { seed, startAt, stepMs };
      }
    }
    const seed = Number(cs.syncSeed);
    const startAt = Number(cs.syncStartAt);
    const stepMs = Number(cs.syncStepMs);
    if (Number.isFinite(seed) && Number.isFinite(startAt) && Number.isFinite(stepMs) && stepMs > 0) {
      return { seed, startAt, stepMs };
    }
    return null;
  },

  buildControlSignature(groupId, cs) {
    const state = cs || {};
    const effect = state.effect || '常亮';
    const brightness = Number(state.brightness || 80);
    const hue = typeof state.hue === 'number' ? state.hue : 0;
    const saturation = typeof state.saturation === 'number' ? state.saturation : 100;
    const dispatchId = Number(state.dispatchId || 0);
    const syncObj = this.getSyncFromControlState(state);
    const sigSync = syncObj
      ? `${syncObj.seed}|${syncObj.startAt}|${syncObj.stepMs}`
      : '0|0|0';
    return `${groupId || ''}|${effect}|${brightness}|${hue}|${saturation}|${dispatchId}|${sigSync}`;
  },

  resolveSeedBySync(sync) {
    const seed = Number(sync && sync.seed);
    const startAt = Number(sync && sync.startAt);
    const stepMs = Number(sync && sync.stepMs);
    if (!Number.isFinite(seed) || !Number.isFinite(startAt) || !Number.isFinite(stepMs) || stepMs <= 0) {
      return Math.floor(Math.random() * 256);
    }
    const elapsed = Math.max(0, Date.now() - startAt);
    const step = Math.floor(elapsed / stepMs);
    return ((Math.round(seed) + step) % 256 + 256) % 256;
  },

  startDynamicEffectLoop(effect, sync) {
    const isPartyLike = effect === '聚会' || effect === '彩虹';
    const isStar = effect === '星空';
    if (!isPartyLike && !isStar) {
      return;
    }
    const stepMsRaw = Number(sync && sync.stepMs);
    const stepMs = Number.isFinite(stepMsRaw) && stepMsRaw > 0 ? stepMsRaw : 200;
    if (isPartyLike) {
      this._partyTimer = setInterval(async () => {
        const connected = app.globalData.isConnected || bleController.isConnected;
        if (!connected || !this._dynamicEffectMeta || !this.data.groupDetailMode) {
          this.stopDynamicEffectLoop();
          return;
        }
        if (this._dynamicEffectMeta.effect !== effect) {
          this.stopDynamicEffectLoop();
          return;
        }
        try {
          const seed = this.resolveSeedBySync(sync);
          const frame = protocol.buildPartyFrame(0, seed);
          await bleController.sendFrame(frame, true);
        } catch (error) {
          console.error('[group] party/rainbow loop send failed', error);
        }
      }, stepMs);
      return;
    }

    this._starTimer = setInterval(async () => {
      const connected = app.globalData.isConnected || bleController.isConnected;
      if (!connected || !this._dynamicEffectMeta || !this.data.groupDetailMode) {
        this.stopDynamicEffectLoop();
        return;
      }
      if (this._dynamicEffectMeta.effect !== '星空') {
        this.stopDynamicEffectLoop();
        return;
      }
      try {
        const seed = this.resolveSeedBySync(sync);
        const frame = protocol.buildStarFrame(0, seed);
        await bleController.sendFrame(frame, true);
      } catch (error) {
        console.error('[group] star loop send failed', error);
      }
    }, stepMs);
  },

  stopPropagation() {},

  goBackPage() {
    if (getCurrentPages().length > 1) {
      wx.navigateBack({ delta: 1 });
      return;
    }
    wx.redirectTo({
      url: '/pages/index/index'
    });
  },

  async callGroupService(payload) {
    return invokeGroupService(payload);
  },

  async loadGroups() {
    if (!wx.cloud) {
      return;
    }
    try {
      const result = await this.callGroupService({ action: 'listGroups' });
      if (!result.success) {
        wx.showToast({ title: result.message || '加载群组失败', icon: 'none' });
        return;
      }
      const mineGroups = result.mineGroups || [];
      const allGroups = result.allGroups || [];
      const groups = this.data.groupTab === 'mine' ? mineGroups : allGroups;
      let activeGroup = null;

      if (this.data.groupDetailMode && this.data.activeGroup) {
        const curId = this.data.activeGroup.id;
        const fresh = groups.find((g) => g.id === curId) || null;
        if (!fresh) {
          this.stopGroupWatch();
          this.stopAdminPresenceHeartbeat();
          this.stopDynamicEffectLoop();
          const wasMemberInDetail = this.data.activeUserRole === 'member';
          this.setData({
            groups,
            mineGroups,
            allGroups,
            groupDetailMode: false,
            activeGroup: null,
            activeUserRole: '',
            activeUserNickname: '',
            memberAwaitingNewDispatch: false
          });
          this._memberDispatchBaselineSignature = '';
          this.applyGroupTab();
          if (wasMemberInDetail) {
            wx.showToast({ title: '该群已被管理员解散', icon: 'none' });
          }
          return;
        }
        wx.setStorageSync('activeGroupId', fresh.id);
        if (this.data.activeUserRole === 'admin') {
          const fcs = fresh.controlState || {};
          activeGroup = {
            ...fresh,
            controlState: {
              effect: this.data.groupControlEffect,
              brightness: this.data.groupControlBrightness,
              hue: this.data.previewHue,
              saturation: this.data.previewSaturation,
              dispatchId: Number(fcs.dispatchId || 0),
              syncSeed: fcs.syncSeed,
              syncStartAt: fcs.syncStartAt,
              syncStepMs: fcs.syncStepMs,
              sync: fcs.sync
            }
          };
        } else {
          activeGroup = fresh;
        }
      } else {
        const localActiveGroupId = wx.getStorageSync('activeGroupId') || '';
        activeGroup =
          groups.find((g) => g.id === localActiveGroupId) ||
          groups.find((g) => g.id === result.activeGroupId) ||
          groups[0] ||
          null;
        if (activeGroup) {
          wx.setStorageSync('activeGroupId', activeGroup.id);
        }
      }

      const cs = activeGroup && activeGroup.controlState ? activeGroup.controlState : {};
      const patch = {
        groups,
        mineGroups,
        allGroups,
        activeGroup,
        activeUserRole: activeGroup ? activeGroup.activeUserRole : '',
        activeUserNickname: activeGroup ? activeGroup.activeUserNickname : '',
        groupControlEffect: cs.effect != null ? cs.effect : '常亮',
        groupControlBrightness: typeof cs.brightness === 'number' ? cs.brightness : 80
      };
      if (!(this.data.groupDetailMode && this.data.activeUserRole === 'admin')) {
        patch.previewHue = typeof cs.hue === 'number' ? cs.hue : 0;
        patch.previewSaturation = typeof cs.saturation === 'number' ? cs.saturation : 100;
        patch.previewBrightness =
          typeof cs.brightness === 'number' ? cs.brightness : patch.groupControlBrightness;
      }
      this.setData(patch);
      this.applyGroupTab();
      this.applyGroupControlToDeviceIfNeeded();
    } catch (error) {
      console.error('加载群组失败', error);
    }
  },

  applyGroupTab() {
    const groupTab = this.data.groupTab;
    const groups = groupTab === 'mine' ? (this.data.mineGroups || []) : (this.data.allGroups || []);
    const filteredGroups = groupTab === 'mine'
      ? groups.filter((g) => g.activeUserRole === 'admin')
      : groups.filter((g) => g.activeUserRole !== 'admin');

    if (this.data.groupDetailMode) {
      this.setData({ filteredGroups });
      return;
    }

    let activeGroup = this.data.activeGroup;
    if (!activeGroup || !filteredGroups.some((g) => g.id === activeGroup.id)) {
      activeGroup = filteredGroups[0] || null;
      if (activeGroup) {
        wx.setStorageSync('activeGroupId', activeGroup.id);
      }
    }
    const cs = activeGroup && activeGroup.controlState ? activeGroup.controlState : {};
    this.setData({
      filteredGroups,
      activeGroup,
      activeUserRole: activeGroup ? activeGroup.activeUserRole : '',
      activeUserNickname: activeGroup ? activeGroup.activeUserNickname : '',
      groupControlEffect: cs.effect != null ? cs.effect : '常亮',
      groupControlBrightness: typeof cs.brightness === 'number' ? cs.brightness : 80,
      previewHue: typeof cs.hue === 'number' ? cs.hue : 0,
      previewSaturation: typeof cs.saturation === 'number' ? cs.saturation : 100,
      previewBrightness: typeof cs.brightness === 'number' ? cs.brightness : 80
    });
  },

  switchGroupTab(e) {
    const tab = e.currentTarget.dataset.tab;
    if (!tab || tab === this.data.groupTab) {
      return;
    }
    this.setData({ groupTab: tab });
    this.applyGroupTab();
    this.applyGroupControlToDeviceIfNeeded();
    // 先本地秒切列表，再异步拉云刷新，避免切换体感延迟
    this.loadGroups();
  },

  openCreateGroupModal() {
    if (!requireLogin({ message: '创建设备分组需要登录' })) return;
    this.setData({
      showCreateGroupModal: true,
      createGroupForm: { name: '', id: '', password: '', needPassword: true }
    });
  },

  openJoinGroupModal() {
    if (!requireLogin({ message: '加入群组需要登录' })) return;
    this.setData({
      showJoinGroupModal: true,
      joinGroupForm: { id: '', nickname: '', password: '' }
    });
  },

  closeCreateGroupModal() {
    this.setData({ showCreateGroupModal: false });
  },

  closeJoinGroupModal() {
    this.setData({ showJoinGroupModal: false });
  },

  onCreateGroupInput(e) {
    const field = e.currentTarget.dataset.field;
    const raw = (e.detail.value || '').trim();
    const value = field === 'id' ? raw.replace(/\D/g, '') : raw;
    this.setData({
      [`createGroupForm.${field}`]: value
    });
  },

  onCreateNeedPasswordChange(e) {
    const needPassword = !!e.detail.value;
    this.setData({
      'createGroupForm.needPassword': needPassword,
      'createGroupForm.password': needPassword ? this.data.createGroupForm.password : ''
    });
  },

  onJoinGroupInput(e) {
    const field = e.currentTarget.dataset.field;
    const value = (e.detail.value || '').trim();
    this.setData({
      [`joinGroupForm.${field}`]: value
    });
  },

  async createGroup() {
    if (!requireLogin({ message: '创建设备分组需要登录', silent: true })) return;
    const form = this.data.createGroupForm;
    if (!form.name || !form.id) {
      wx.showToast({ title: '请完整填写信息', icon: 'none' });
      return;
    }
    if (!/^\d+$/.test(form.id)) {
      wx.showToast({ title: '分组ID仅支持数字', icon: 'none' });
      return;
    }
    if (form.needPassword && !/^\d{4}$/.test(form.password)) {
      wx.showToast({ title: '密码需为4位数字', icon: 'none' });
      return;
    }

    try {
      wx.showLoading({ title: '创建中...', mask: true });
      const result = await this.callGroupService({
        action: 'createGroup',
        name: form.name,
        groupId: form.id,
        password: form.password,
        needPassword: !!form.needPassword
      });
      wx.hideLoading();
      if (!result.success) {
        showGroupError('创建设备分组失败', result.message || '创建失败');
        return;
      }
      this.setData({ showCreateGroupModal: false });
      await this.loadGroups();
      this.setData({ groupTab: 'mine' });
      this.applyGroupTab();
      wx.showToast({ title: '群组创建成功', icon: 'success' });
    } catch (error) {
      wx.hideLoading();
      const { parseCloudError } = require('../../utils/group-cloud.js');
      showGroupError('创建设备分组失败', parseCloudError(error));
      console.error('创建设备分组失败', error);
    }
  },

  async joinGroup() {
    if (!requireLogin({ message: '加入群组需要登录', silent: true })) return;
    const form = this.data.joinGroupForm;
    if (!form.id || !form.nickname || !form.password) {
      wx.showToast({ title: '请完整填写信息', icon: 'none' });
      return;
    }
    if (!/^\d{4}$/.test(form.password)) {
      wx.showToast({ title: '密码需为4位数字', icon: 'none' });
      return;
    }

    try {
      wx.showLoading({ title: '加入中...', mask: true });
      const result = await this.callGroupService({
        action: 'joinGroup',
        groupId: form.id,
        nickname: form.nickname,
        password: form.password
      });
      wx.hideLoading();
      if (!result.success) {
        wx.showToast({ title: result.message || '加入失败', icon: 'none' });
        return;
      }
      this.setData({ showJoinGroupModal: false });
      wx.setStorageSync('activeGroupId', form.id);
      await this.loadGroups();
      this.setData({ groupTab: 'all' });
      this.applyGroupTab();
      wx.showToast({ title: '已加入群组', icon: 'success' });
    } catch (error) {
      wx.hideLoading();
      wx.showToast({ title: '加入失败', icon: 'none' });
      console.error('加入群组失败', error);
    }
  },

  openGroupDetail(e) {
    const id = e.currentTarget.dataset.id;
    const group = this.data.filteredGroups.find((item) => item.id === id);
    if (!group) {
      return;
    }
    if (!group.activeUserRole) {
      // 仅在「所有群组」里点到未加入群组时，按是否有密码处理进入
      if (group.needPassword) {
        this.setData({
          showEnterPasswordModal: true,
          pendingEnterGroupId: id,
          enterPassword: ''
        });
      } else {
        this.joinAndEnterGroup(id, '');
      }
      return;
    }
    wx.setStorageSync('activeGroupId', id);
    const cc = app.globalData.colorControlState;
    const gcs = group.controlState || {};
    const previewHue =
      typeof gcs.hue === 'number'
        ? gcs.hue
        : cc && typeof cc.hue === 'number'
          ? cc.hue
          : 0;
    const previewSaturation =
      typeof gcs.saturation === 'number'
        ? gcs.saturation
        : cc && typeof cc.saturation === 'number'
          ? cc.saturation
          : 100;
    const br =
      group.controlState && typeof group.controlState.brightness === 'number'
        ? group.controlState.brightness
        : 80;
    const isMemberDetail = (group.activeUserRole || '') === 'member';
    this._memberDispatchBaselineSignature = isMemberDetail
      ? this.buildControlSignature(id, gcs)
      : '';
    const savedEffect = group.controlState ? group.controlState.effect : '常亮';
    const uiPatch = this.getControlUiPatchFromEffect(savedEffect, 'white');
    this.setData({
      groupDetailMode: true,
      activeGroup: group,
      activeUserRole: group.activeUserRole || '',
      activeUserNickname: group.activeUserNickname || '',
      memberAwaitingNewDispatch: isMemberDetail,
      groupControlBrightness: br,
      previewHue,
      previewSaturation,
      previewBrightness: br,
      ...uiPatch
    }, () => this.updateSliderTint());
    this.applyGroupTab();
    if (group.activeUserRole === 'admin') {
      this.startAdminPresenceHeartbeat(id);
    }
    this.startGroupWatch(id);
  },

  onEnterPasswordInput(e) {
    this.setData({ enterPassword: (e.detail.value || '').trim() });
  },

  closeEnterPasswordModal() {
    this.setData({
      showEnterPasswordModal: false,
      pendingEnterGroupId: '',
      enterPassword: ''
    });
  },

  async confirmEnterWithPassword() {
    const groupId = this.data.pendingEnterGroupId;
    const password = (this.data.enterPassword || '').trim();
    if (!/^\d{4}$/.test(password)) {
      wx.showToast({ title: '请输入4位数字密码', icon: 'none' });
      return;
    }
    await this.joinAndEnterGroup(groupId, password);
  },

  async joinAndEnterGroup(groupId, password) {
    if (!groupId) {
      return;
    }
    try {
      wx.showLoading({ title: '进入中...', mask: true });
      const result = await this.callGroupService({
        action: 'joinGroup',
        groupId,
        password
      });
      wx.hideLoading();
      if (!result.success) {
        wx.showToast({ title: result.message || '进入失败', icon: 'none' });
        return;
      }
      this.closeEnterPasswordModal();
      wx.setStorageSync('activeGroupId', groupId);
      await this.loadGroups();
      this.setData({ groupTab: 'all' });
      this.applyGroupTab();
      const target = (this.data.allGroups || []).find((g) => g.id === groupId);
      if (target) {
        this.openGroupDetail({ currentTarget: { dataset: { id: groupId } } });
      }
    } catch (error) {
      wx.hideLoading();
      wx.showToast({ title: '进入失败', icon: 'none' });
      console.error('进入群组失败', error);
    }
  },

  exitGroupDetail() {
    this.stopGroupWatch();
    if (this._autoApplyTimer) {
      clearTimeout(this._autoApplyTimer);
      this._autoApplyTimer = null;
    }
    this.stopAdminPresenceHeartbeat();
    this.stopDynamicEffectLoop();
    this._memberDispatchBaselineSignature = '';
    this.setData({ groupDetailMode: false, memberAwaitingNewDispatch: false });
    this.applyGroupTab();
  },

  async confirmDismissGroup() {
    const active = this.data.activeGroup;
    if (!active || this.data.activeUserRole !== 'admin') {
      return;
    }
    const modal = await wx.showModal({
      title: '解散群组',
      content: `确认解散「${active.name}」？解散后成员将无法继续使用该群。`,
      confirmText: '确认解散',
      confirmColor: '#FF6B6B'
    });
    if (!modal.confirm) {
      return;
    }
    try {
      wx.showLoading({ title: '解散中...', mask: true });
      const result = await this.callGroupService({
        action: 'dismissGroup',
        groupId: active.id
      });
      wx.hideLoading();
      if (!result.success) {
        wx.showToast({ title: result.message || '解散失败', icon: 'none' });
        return;
      }
      this.stopAdminPresenceHeartbeatQuiet();
      this.stopGroupWatch();
      this.stopDynamicEffectLoop();
      this.setData({
        groupDetailMode: false,
        activeGroup: null,
        activeUserRole: '',
        activeUserNickname: '',
        memberAwaitingNewDispatch: false
      });
      this._memberDispatchBaselineSignature = '';
      await this.loadGroups();
      this.applyGroupTab();
      wx.showToast({ title: '群组已解散', icon: 'success' });
    } catch (error) {
      wx.hideLoading();
      wx.showToast({ title: '解散失败', icon: 'none' });
      console.error('解散群组失败', error);
    }
  },

  async confirmLeaveGroup() {
    const active = this.data.activeGroup;
    if (!active || this.data.activeUserRole !== 'member') {
      return;
    }
    const modal = await wx.showModal({
      title: '退出群组',
      content: `确认退出「${active.name}」？`,
      confirmText: '确认退出',
      confirmColor: '#FF6B6B'
    });
    if (!modal.confirm) {
      return;
    }
    try {
      wx.showLoading({ title: '退出中...', mask: true });
      const result = await this.callGroupService({
        action: 'leaveGroup',
        groupId: active.id
      });
      wx.hideLoading();
      if (!result.success) {
        wx.showToast({ title: result.message || '退出失败', icon: 'none' });
        return;
      }
      this.stopGroupWatch();
      this.stopDynamicEffectLoop();
      this.setData({
        groupDetailMode: false,
        activeGroup: null,
        activeUserRole: '',
        activeUserNickname: '',
        memberAwaitingNewDispatch: false
      });
      this._memberDispatchBaselineSignature = '';
      await this.loadGroups();
      this.applyGroupTab();
      wx.showToast({ title: '已退出群组', icon: 'success' });
    } catch (error) {
      wx.hideLoading();
      wx.showToast({ title: '退出失败', icon: 'none' });
      console.error('退出群组失败', error);
    }
  },

  startAdminPresenceHeartbeat(groupId) {
    this._adminPresenceGroupId = groupId;
    this.callGroupService({
      action: 'adminDetailPresence',
      groupId,
      inDetail: true
    }).catch(() => {});
  },

  stopAdminPresenceHeartbeatQuiet() {},

  stopAdminPresenceHeartbeat() {
    const gid = this._adminPresenceGroupId;
    this._adminPresenceGroupId = null;
    if (gid) {
      this.callGroupService({
        action: 'adminDetailPresence',
        groupId: gid,
        inDetail: false
      }).catch(() => {});
    }
  },

  getControlUiPatchFromEffect(effect, lastMode) {
    const e = (effect || '常亮').trim();
    const prevLast = lastMode || this.data.lastMode || 'white';
    if (e === '黑场') {
      return {
        powerOn: false,
        selectedModeId: '',
        lastMode: EFFECT_TO_MODE_ID[prevLast] ? prevLast : 'white',
        groupControlEffect: '黑场'
      };
    }
    const modeId = EFFECT_TO_MODE_ID[e] || 'white';
    return {
      powerOn: true,
      selectedModeId: modeId,
      lastMode: modeId,
      groupControlEffect: e
    };
  },

  updateSliderTint() {
    const { previewHue, previewSaturation } = this.data;
    const tint = `hsl(${previewHue}, ${Math.round(previewSaturation * 0.35)}%, 78%)`;
    if (tint !== this.data.sliderTint) {
      this.setData({ sliderTint: tint });
    }
  },

  getStepMsFromSpeed(speed) {
    const ratio = (typeof speed === 'number' ? speed : 50) / 100;
    return Math.max(120, Math.round(420 - ratio * 300));
  },

  onAdminPowerChange(e) {
    const powerOn = !!e.detail.value;
    if (this._autoApplyTimer) {
      clearTimeout(this._autoApplyTimer);
      this._autoApplyTimer = null;
    }
    if (!powerOn) {
      const lastMode = this.data.selectedModeId || this.data.lastMode || 'white';
      this.setData({
        powerOn: false,
        lastMode,
        selectedModeId: '',
        groupControlEffect: '黑场'
      }, () => {
        this.applyGroupControl({ silent: true }).catch(() => {});
      });
      return;
    }
    const modeId = this.data.lastMode || 'white';
    const effect = MODE_TO_EFFECT[modeId] || '常亮';
    this.setData({
      powerOn: true,
      selectedModeId: modeId,
      groupControlEffect: effect
    }, () => {
      this.applyGroupControl({ silent: true }).catch(() => {});
    });
  },

  onAdminModeChange(e) {
    if (!this.data.powerOn) {
      wx.showToast({ title: '请先开启电源', icon: 'none' });
      return;
    }
    const modeId = e.currentTarget.dataset.mode;
    if (!modeId || modeId === this.data.selectedModeId) {
      return;
    }
    const effect = MODE_TO_EFFECT[modeId];
    if (!effect) {
      return;
    }
    if (this._autoApplyTimer) {
      clearTimeout(this._autoApplyTimer);
      this._autoApplyTimer = null;
    }
    this.setData({
      selectedModeId: modeId,
      lastMode: modeId,
      groupControlEffect: effect
    });
    this.applyGroupControl({ silent: true }).catch(() => {});
  },

  onAdminSpeedChange(e) {
    if (!this.data.powerOn) {
      return;
    }
    this.setData({ effectSpeed: Number(e.detail.value || 0) });
    this.applyGroupControl({ silent: true }).catch(() => {});
  },

  onPreviewColorChange(e) {
    if (!this.data.powerOn) {
      return;
    }
    const { hue, saturation, brightness } = e.detail;
    this.setData({
      previewHue: hue,
      previewSaturation: saturation,
      previewBrightness: brightness,
      groupControlBrightness: brightness
    }, () => this.updateSliderTint());
    if (this.data.groupControlEffect === '随机') {
      if (this._autoApplyTimer) {
        clearTimeout(this._autoApplyTimer);
        this._autoApplyTimer = null;
      }
      return;
    }
    if (this._autoApplyTimer) {
      clearTimeout(this._autoApplyTimer);
    }
    // 调色盘拖动频繁，做轻度防抖后自动下发
    this._autoApplyTimer = setTimeout(() => {
      this.applyGroupControl({ silent: true }).catch(() => {});
    }, 160);
  },

  onControlBrightnessChange(e) {
    if (!this.data.powerOn) {
      return;
    }
    const v = Number(e.detail.value || 0);
    this.setData({
      groupControlBrightness: v,
      previewBrightness: v
    });
    this.applyGroupControl({ silent: true }).catch(() => {});
  },

  async applyGroupControl(options = {}) {
    const silent = !!options.silent;
    const active = this.data.activeGroup;
    if (!active) {
      if (!silent) {
        wx.showToast({ title: '请先创建或加入群组', icon: 'none' });
      }
      return;
    }
    if (this.data.activeUserRole !== 'admin') {
      if (!silent) {
        wx.showToast({ title: '当前用户不是管理员', icon: 'none' });
      }
      return;
    }

    try {
      const dispatchId = Date.now();
      const effect = this.data.groupControlEffect;
      let dispatchHue = this.data.previewHue;
      let dispatchSaturation = this.data.previewSaturation;
      // 随机模式：每次下发都重抽一次色相，确保二次点击也能明显变色
      if (effect === '随机') {
        dispatchHue = Math.floor(Math.random() * 360);
        dispatchSaturation = 100;
        this.setData({
          previewHue: dispatchHue,
          previewSaturation: dispatchSaturation
        });
      }
      const dynamicSeed = Math.floor(Math.random() * 256);
      const dynamicStepMs = this.getStepMsFromSpeed(this.data.effectSpeed);
      if (!silent) {
        wx.showLoading({ title: '下发中...', mask: true });
      }
      const result = await this.callGroupService({
        action: 'applyControl',
        groupId: active.id,
        effect,
        brightness: this.data.groupControlBrightness,
        hue: dispatchHue,
        saturation: dispatchSaturation,
        dispatchId,
        seed: dynamicSeed,
        stepMs: dynamicStepMs
      });
      if (!silent) {
        wx.hideLoading();
      }
      if (!result.success) {
        if (!silent) {
          wx.showToast({ title: result.message || '下发失败', icon: 'none' });
        }
        return;
      }
      const syncStartAt = Date.now();
      const nextControlState = {
        effect,
        brightness: this.data.groupControlBrightness,
        hue: dispatchHue,
        saturation: dispatchSaturation,
        dispatchId,
        syncSeed: isNaN(dynamicSeed) ? null : dynamicSeed,
        syncStartAt: ['聚会', '彩虹', '星空'].includes(effect) ? syncStartAt : null,
        syncStepMs: ['聚会', '彩虹', '星空'].includes(effect) ? dynamicStepMs : null
      };
      if (this.data.activeGroup) {
        this.setData({
          activeGroup: {
            ...this.data.activeGroup,
            adminIsInGroupDetail: true,
            controlState: nextControlState
          }
        });
      }
      // 管理员下发成功后，本机若已连接也立即应用相同效果
      await this.sendGroupControlFrameToDevice(
        nextControlState.effect,
        Number(nextControlState.brightness || this.data.groupControlBrightness),
        this.data.activeGroup && this.data.activeGroup.id,
        {
          hue: typeof nextControlState.hue === 'number' ? nextControlState.hue : this.data.previewHue,
          saturation:
            typeof nextControlState.saturation === 'number'
              ? nextControlState.saturation
              : this.data.previewSaturation,
          dispatchId: Number(nextControlState.dispatchId || dispatchId),
          sync: this.getSyncFromControlState(nextControlState)
        }
      );
      if (!silent) {
        wx.showToast({ title: '已统一下发灯光效果', icon: 'success' });
      }
    } catch (error) {
      if (!silent) {
        wx.hideLoading();
        wx.showToast({ title: '下发失败', icon: 'none' });
      }
      console.error('[group] apply error', error);
    }
  },

  async applyGroupControlToDeviceIfNeeded() {
    const activeGroup = this.data.activeGroup;
    if (!activeGroup || this.data.activeUserRole !== 'member' || !this.data.groupDetailMode) {
      return;
    }
    const connected = app.globalData.isConnected || bleController.isConnected;
    if (!connected || !activeGroup.controlState) {
      return;
    }

    const cs = activeGroup.controlState || {};
    const effect = cs.effect || '常亮';
    const brightness = Number(cs.brightness || 80);
    const hue = typeof cs.hue === 'number' ? cs.hue : 0;
    const saturation = typeof cs.saturation === 'number' ? cs.saturation : 100;
    const dispatchId = Number(cs.dispatchId || 0);
    const syncObj = this.getSyncFromControlState(cs);
    const signature = this.buildControlSignature(activeGroup.id, cs);
    if (this.data.memberAwaitingNewDispatch) {
      if (signature === this._memberDispatchBaselineSignature) {
        return;
      }
      this._memberDispatchBaselineSignature = '';
      this.setData({ memberAwaitingNewDispatch: false });
    }
    if (this._lastAppliedGroupControlSignature === signature) {
      return;
    }

    try {
      await this.sendGroupControlFrameToDevice(effect, brightness, activeGroup.id, {
        hue,
        saturation,
        dispatchId,
        sync: syncObj
      });
      this._lastAppliedGroupControlSignature = signature;
      console.log('[group] device apply success', {
        groupId: activeGroup.id,
        effect,
        brightness
      });
    } catch (error) {
      console.error('[group] device apply failed', error);
    }
  },

  async sendGroupControlFrameToDevice(effect, brightness, groupId, colorOverride) {
    const connected = app.globalData.isConnected || bleController.isConnected;
    if (!connected) {
      return;
    }
    const hue =
      colorOverride && Number.isFinite(colorOverride.hue)
        ? colorOverride.hue
        : Number.isFinite(this.data.previewHue)
          ? this.data.previewHue
          : 0;
    const saturation =
      colorOverride && Number.isFinite(colorOverride.saturation)
        ? colorOverride.saturation
        : Number.isFinite(this.data.previewSaturation)
          ? this.data.previewSaturation
          : 100;
    const dispatchId = colorOverride && Number(colorOverride.dispatchId || 0);
    const sync = (colorOverride && colorOverride.sync) || null;
    const baseSeed = this.resolveSeedBySync(sync);

    this.stopDynamicEffectLoop();
    let frame;
    switch (effect) {
      case '黑场':
        frame = protocol.buildBlackOutFrame(0);
        break;
      case '随机':
        frame = protocol.buildConstantFrame(0, hue, 100, brightness);
        break;
      case '快闪':
        frame = protocol.buildQuickFlashFrame(0, hue, saturation, brightness);
        break;
      case '眨眼':
        frame = protocol.buildBlinkFrame(0, hue, saturation, brightness);
        break;
      case '呼吸':
        frame = protocol.buildBreathEffectFrame(0, hue, saturation, brightness);
        break;
      case '聚会':
      case '彩虹': {
        frame = protocol.buildPartyFrame(0, baseSeed);
        this._dynamicEffectMeta = { effect, groupId: groupId || '', dispatchId };
        this.startDynamicEffectLoop(effect, sync);
        break;
      }
      case '星空':
        frame = protocol.buildStarFrame(0, baseSeed);
        this._dynamicEffectMeta = { effect: '星空', groupId: groupId || '', dispatchId };
        this.startDynamicEffectLoop('星空', sync);
        break;
      case '常亮':
      default:
        frame = protocol.buildConstantFrame(0, hue, saturation, brightness);
        break;
    }
    await bleController.sendFrame(frame, true);
    if (groupId) {
      this._lastAppliedGroupControlSignature = `${groupId}|${effect}|${brightness}|${hue}|${saturation}|${dispatchId}`;
    }
  }
});
