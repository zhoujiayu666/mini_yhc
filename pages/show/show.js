const { requireLogin } = require('../../utils/auth.js');

const STORAGE_KEY = 'topuyi_show_seat';
const ZONE_LETTERS = Array.from({ length: 26 }, (_, i) => String.fromCharCode(65 + i));
const SEAT_NUMBERS = Array.from({ length: 99 }, (_, i) => String(i + 1));

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
    seatRange: [ZONE_LETTERS, SEAT_NUMBERS, SEAT_NUMBERS],
    seatPickerIndex: [0, 0, 0],
    zone: 'A',
    row: '1',
    seat: '1',
    binding: false
  },

  onShow() {
    if (!requireLogin()) return;
    this.syncSeatEnabled();
    this.loadSeat();
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
        selectedIndex: Number.isFinite(saved.selectedIndex) ? saved.selectedIndex : 0
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
