const { initCloud, CLOUD_ENV_ID, TOPUYI_APP_ID } = require('../../utils/cloud-config.js');
const { showShareMenu, getShareMessage, getTimelineShare } = require('../../utils/share.js');

const STORAGE_KEY = 'topuyi_show_seat';
const ZONE_LETTERS = Array.from({ length: 26 }, (_, i) => String.fromCharCode(65 + i));
const SEAT_NUMBERS = Array.from({ length: 99 }, (_, i) => String(i + 1));
const PERFORMANCE_COLLECTION = 'performances';
const FALLBACK_PERFORMANCES = [
  {
    id: 'topuyi-live-2026',
    name: 'TOPUYI 星光应援互动场',
    date: '2026-10-01',
    time: '19:30',
    venue: '广州星光音乐空间',
    status: '座位绑定开放中',
    description: '现场观众可绑定座位号，连接 TOPUYI 手灯后参与统一灯光互动。',
    sort: 100
  }
];

function toNumberIndex(value) {
  const num = parseInt(value, 10);
  if (!Number.isFinite(num) || num < 1 || num > 99) {
    return 0;
  }
  return num - 1;
}

function toZoneIndex(value) {
  const letter = String(value || 'A').toUpperCase();
  const code = letter.charCodeAt(0);
  if (code >= 65 && code <= 90) {
    return code - 65;
  }
  return 0;
}

function indexToNumber(index) {
  const i = Math.max(0, Math.min(98, Number(index) || 0));
  return SEAT_NUMBERS[i];
}

function indexToZone(index) {
  const i = Math.max(0, Math.min(25, Number(index) || 0));
  return ZONE_LETTERS[i];
}

Page({
  data: {
    performances: [],
    selectedIndex: 0,
    seatEnabled: false,
    loadingPerformances: false,
    performanceError: '',
    seatRange: [ZONE_LETTERS, SEAT_NUMBERS, SEAT_NUMBERS],
    seatPickerIndex: [0, 0, 0],
    zone: 'A',
    row: '1',
    seat: '1',
    binding: false
  },

  onLoad() {
    showShareMenu();
    this.loadPerformances();
  },

  onShow() {
    showShareMenu();
    if (!this.data.performances.length && !this.data.loadingPerformances) {
      this.loadPerformances();
      return;
    }
    this.loadSeat();
  },

  onShareAppMessage() {
    return getShareMessage({
      title: 'TOPUYI 演出座位绑定',
      path: '/pages/show/show'
    });
  },

  onShareTimeline() {
    return getTimelineShare({
      title: 'TOPUYI 演出座位绑定'
    });
  },

  normalizePerformance(item) {
    return {
      id: item.id || item.performanceId || item._id || '',
      name: item.name || '未命名演出',
      date: item.date || '',
      time: item.time || '',
      venue: item.venue || '',
      status: item.statusText || item.status || '座位绑定开放中',
      description: item.description || '',
      sort: Number(item.sort || 0)
    };
  },

  applyPerformanceList(list) {
    const performances = (list || [])
      .map((item) => this.normalizePerformance(item))
      .sort((a, b) => {
        if (b.sort !== a.sort) return b.sort - a.sort;
        return `${a.date} ${a.time}`.localeCompare(`${b.date} ${b.time}`);
      });
    const selectedIndex = performances.length
      ? Math.min(this.data.selectedIndex || 0, performances.length - 1)
      : 0;
    this.setData(
      {
        performances,
        selectedIndex,
        seatEnabled: performances.length > 0,
        loadingPerformances: false,
        performanceError: ''
      },
      () => this.loadSeat()
    );
  },

  async loadPerformances() {
    const cloud = initCloud();
    if (!cloud.ok || !wx.cloud) {
      console.warn('云开发未初始化，使用演出兜底数据:', cloud.reason);
      this.applyPerformanceList(FALLBACK_PERFORMANCES);
      return;
    }

    this.setData({ loadingPerformances: true, performanceError: '' });
    try {
      const db = wx.cloud.database();
      const res = await db
        .collection(PERFORMANCE_COLLECTION)
        .where({
          sourceAppId: TOPUYI_APP_ID,
          status: 'published'
        })
        .limit(20)
        .get();
      const list = res.data || [];
      this.applyPerformanceList(list.length ? list : FALLBACK_PERFORMANCES);
    } catch (error) {
      console.error('加载云端演出失败，使用演出兜底数据', error);
      this.applyPerformanceList(FALLBACK_PERFORMANCES);
    }
  },

  syncSeatEnabled() {
    const seatEnabled = (this.data.performances || []).length > 0;
    this.setData({ seatEnabled });
  },

  applySeatIndices(indices) {
    const zone = indexToZone(indices[0]);
    const row = indexToNumber(indices[1]);
    const seat = indexToNumber(indices[2]);
    this.setData({
      seatPickerIndex: indices,
      zone,
      row,
      seat
    });
  },

  loadSeat() {
    if (!this.data.seatEnabled) return;
    try {
      const saved = wx.getStorageSync(STORAGE_KEY);
      if (!saved || typeof saved !== 'object') return;
      const indices = [
        toZoneIndex(saved.zone),
        toNumberIndex(saved.row),
        toNumberIndex(saved.seat)
      ];
      this.applySeatIndices(indices);
      this.setData({
        selectedIndex: Math.min(
          Number.isFinite(saved.selectedIndex) ? saved.selectedIndex : 0,
          Math.max(0, this.data.performances.length - 1)
        )
      });
    } catch (e) {
      /* ignore */
    }
  },

  onPerformanceChange(e) {
    this.setData({ selectedIndex: Number(e.detail.value) || 0 });
  },

  onSeatPickerChange(e) {
    if (!this.data.seatEnabled) return;
    const indices = e.detail.value || [0, 0, 0];
    this.applySeatIndices(indices);
  },

  onBindSeat() {
    if (!this.data.seatEnabled) {
      wx.showToast({ title: '请先选择演出', icon: 'none' });
      return;
    }

    const { zone, row, seat } = this.data;

    this.setData({ binding: true });
    try {
      wx.setStorageSync(STORAGE_KEY, {
        zone,
        row,
        seat,
        selectedIndex: this.data.selectedIndex,
        performanceId: this.data.performances[this.data.selectedIndex]
          ? this.data.performances[this.data.selectedIndex].id
          : '',
        updatedAt: Date.now()
      });
      wx.showToast({ title: '座位已绑定', icon: 'success' });
    } catch (err) {
      wx.showToast({ title: '保存失败', icon: 'none' });
    } finally {
      this.setData({ binding: false });
    }
  }
});
