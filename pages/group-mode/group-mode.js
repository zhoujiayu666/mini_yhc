const bleController = require('../../utils/ble.js');
const protocol = require('../../utils/protocol.js');
const app = getApp();

Page({
  data: {
    isConnected: false,
    groups: [],
    filteredGroups: [],
    activeGroup: null,
    activeUserRole: '',
    activeUserNickname: '',
    groupTab: 'mine',
    showCreateGroupModal: false,
    showJoinGroupModal: false,
    groupServiceFunctionName: 'group-service',
    createGroupForm: {
      name: '',
      id: '',
      password: ''
    },
    joinGroupForm: {
      id: '',
      nickname: '',
      password: ''
    },
    groupControlEffect: '常亮',
    groupControlBrightness: 80
  },

  onLoad() {
    this.updateConnectionStatus();
    bleController.onConnectionStateChange = (connected) => {
      app.globalData.isConnected = connected;
      this.updateConnectionStatus();
    };
    this.loadGroups();
  },

  onShow() {
    this.updateConnectionStatus();
    this.loadGroups();
    this.applyGroupControlToDeviceIfNeeded();
    this.startGroupSyncTimer();
  },

  onHide() {
    this.stopGroupSyncTimer();
  },

  onUnload() {
    this.stopGroupSyncTimer();
  },

  updateConnectionStatus() {
    const isConnected = app.globalData.isConnected || bleController.isConnected;
    this.setData({ isConnected });
    if (!isConnected) {
      this._lastAppliedGroupControlSignature = '';
      return;
    }
    this.applyGroupControlToDeviceIfNeeded();
  },

  startGroupSyncTimer() {
    if (this._groupSyncTimer) {
      return;
    }
    this._groupSyncTimer = setInterval(() => {
      if (this.data.activeUserRole === 'member' || this.data.activeGroup) {
        this.loadGroups();
      }
    }, 3000);
  },

  stopGroupSyncTimer() {
    if (this._groupSyncTimer) {
      clearInterval(this._groupSyncTimer);
      this._groupSyncTimer = null;
    }
  },

  stopPropagation() {},

  async callGroupService(payload) {
    const functionName = this.data.groupServiceFunctionName;
    console.log('[group] call function request', {
      name: functionName,
      data: payload
    });
    const res = await wx.cloud.callFunction({
      name: functionName,
      data: payload
    });
    const result = res.result || {};
    console.log('[group] call function response', result);
    return result;
  },

  async loadGroups() {
    if (!wx.cloud) {
      return;
    }
    try {
      const localActiveGroupId = wx.getStorageSync('activeGroupId') || '';
      const result = await this.callGroupService({ action: 'listGroups' });
      if (!result.success) {
        wx.showToast({ title: result.message || '加载群组失败', icon: 'none' });
        return;
      }
      const groups = result.groups || [];
      const activeGroup =
        groups.find((g) => g.id === localActiveGroupId) ||
        groups.find((g) => g.id === result.activeGroupId) ||
        groups[0] ||
        null;
      if (activeGroup) {
        wx.setStorageSync('activeGroupId', activeGroup.id);
      }
      this.setData({
        groups,
        activeGroup,
        activeUserRole: activeGroup ? activeGroup.activeUserRole : '',
        activeUserNickname: activeGroup ? activeGroup.activeUserNickname : '',
        groupControlEffect: activeGroup && activeGroup.controlState ? activeGroup.controlState.effect : '常亮',
        groupControlBrightness: activeGroup && activeGroup.controlState ? activeGroup.controlState.brightness : 80
      });
      this.applyGroupTab();
      this.applyGroupControlToDeviceIfNeeded();
    } catch (error) {
      console.error('加载群组失败', error);
    }
  },

  applyGroupTab() {
    const groupTab = this.data.groupTab;
    const groups = this.data.groups || [];
    const filteredGroups = groups.filter((g) => {
      if (groupTab === 'mine') {
        return g.activeUserRole === 'admin';
      }
      return g.activeUserRole === 'member';
    });
    let activeGroup = this.data.activeGroup;
    if (!activeGroup || !filteredGroups.some((g) => g.id === activeGroup.id)) {
      activeGroup = filteredGroups[0] || null;
      if (activeGroup) {
        wx.setStorageSync('activeGroupId', activeGroup.id);
      }
    }
    this.setData({
      filteredGroups,
      activeGroup,
      activeUserRole: activeGroup ? activeGroup.activeUserRole : '',
      activeUserNickname: activeGroup ? activeGroup.activeUserNickname : '',
      groupControlEffect: activeGroup && activeGroup.controlState ? activeGroup.controlState.effect : '常亮',
      groupControlBrightness: activeGroup && activeGroup.controlState ? activeGroup.controlState.brightness : 80
    });
  },

  switchGroupTab(e) {
    const tab = e.currentTarget.dataset.tab;
    if (!tab || tab === this.data.groupTab) {
      return;
    }
    this.setData({ groupTab: tab }, () => {
      this.applyGroupTab();
      this.applyGroupControlToDeviceIfNeeded();
    });
  },

  openCreateGroupModal() {
    this.setData({
      showCreateGroupModal: true,
      createGroupForm: { name: '', id: '', password: '' }
    });
  },

  openJoinGroupModal() {
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
    const value = (e.detail.value || '').trim();
    this.setData({
      [`createGroupForm.${field}`]: value
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
    const form = this.data.createGroupForm;
    if (!form.name || !form.id || !form.password) {
      wx.showToast({ title: '请完整填写信息', icon: 'none' });
      return;
    }
    if (!/^\d{4}$/.test(form.password)) {
      wx.showToast({ title: '密码需为4位数字', icon: 'none' });
      return;
    }

    try {
      wx.showLoading({ title: '创建中...', mask: true });
      const result = await this.callGroupService({
        action: 'createGroup',
        name: form.name,
        groupId: form.id,
        password: form.password
      });
      wx.hideLoading();
      if (!result.success) {
        wx.showToast({ title: result.message || '创建失败', icon: 'none' });
        return;
      }
      this.setData({ showCreateGroupModal: false });
      await this.loadGroups();
      this.setData({ groupTab: 'mine' });
      this.applyGroupTab();
      wx.showToast({ title: '群组创建成功', icon: 'success' });
    } catch (error) {
      wx.hideLoading();
      wx.showToast({ title: '创建失败', icon: 'none' });
      console.error('创建群组失败', error);
    }
  },

  async joinGroup() {
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
      this.setData({ groupTab: 'joined' });
      this.applyGroupTab();
      wx.showToast({ title: '已加入群组', icon: 'success' });
    } catch (error) {
      wx.hideLoading();
      wx.showToast({ title: '加入失败', icon: 'none' });
      console.error('加入群组失败', error);
    }
  },

  selectGroup(e) {
    const id = e.currentTarget.dataset.id;
    const group = this.data.groups.find((item) => item.id === id);
    if (!group) {
      return;
    }
    wx.setStorageSync('activeGroupId', id);
    this.setData({
      activeGroup: group,
      activeUserRole: group.activeUserRole || '',
      activeUserNickname: group.activeUserNickname || '',
      groupControlEffect: group.controlState ? group.controlState.effect : '常亮',
      groupControlBrightness: group.controlState ? group.controlState.brightness : 80
    });
    this.applyGroupControlToDeviceIfNeeded();
  },

  onControlEffectChange(e) {
    this.setData({
      groupControlEffect: e.currentTarget.dataset.effect
    });
  },

  onControlBrightnessChange(e) {
    this.setData({
      groupControlBrightness: Number(e.detail.value || 0)
    });
  },

  async applyGroupControl() {
    const active = this.data.activeGroup;
    if (!active) {
      wx.showToast({ title: '请先创建或加入群组', icon: 'none' });
      return;
    }
    if (this.data.activeUserRole !== 'admin') {
      wx.showToast({ title: '当前用户不是管理员', icon: 'none' });
      return;
    }

    try {
      wx.showLoading({ title: '下发中...', mask: true });
      const result = await this.callGroupService({
        action: 'applyControl',
        groupId: active.id,
        effect: this.data.groupControlEffect,
        brightness: this.data.groupControlBrightness
      });
      wx.hideLoading();
      if (!result.success) {
        wx.showToast({ title: result.message || '下发失败', icon: 'none' });
        return;
      }
      await this.loadGroups();
      wx.showToast({ title: '已统一下发灯光效果', icon: 'success' });
    } catch (error) {
      wx.hideLoading();
      wx.showToast({ title: '下发失败', icon: 'none' });
      console.error('[group] apply error', error);
    }
  },

  async applyGroupControlToDeviceIfNeeded() {
    const activeGroup = this.data.activeGroup;
    if (!activeGroup || this.data.activeUserRole !== 'member') {
      return;
    }
    const connected = app.globalData.isConnected || bleController.isConnected;
    if (!connected || !activeGroup.controlState) {
      return;
    }

    const effect = activeGroup.controlState.effect || '常亮';
    const brightness = Number(activeGroup.controlState.brightness || 80);
    const signature = `${activeGroup.id}|${effect}|${brightness}`;
    if (this._lastAppliedGroupControlSignature === signature) {
      return;
    }

    try {
      let frame;
      const hue = 50;
      const saturation = 95;
      switch (effect) {
        case '闪烁':
          frame = protocol.buildQuickFlashFrame(0, hue, saturation, brightness);
          break;
        case '呼吸':
          frame = protocol.buildBreathEffectFrame(0, hue, saturation, brightness);
          break;
        case '常亮':
        default:
          frame = protocol.buildConstantFrame(0, hue, saturation, brightness);
          break;
      }
      await bleController.sendFrame(frame, true);
      this._lastAppliedGroupControlSignature = signature;
      console.log('[group] device apply success', {
        groupId: activeGroup.id,
        effect,
        brightness
      });
    } catch (error) {
      console.error('[group] device apply failed', error);
    }
  }
});
