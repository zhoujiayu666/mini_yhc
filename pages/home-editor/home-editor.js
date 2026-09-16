const t = require('../../utils/home-template');
Page({
  data: { config: { blocks: [] }, types: t.TYPES, targets: t.TARGETS, selected: 0, colors: ['#f4f4f1','#ffffff','#eee9db','#171b26','#202733'], dirty: false },
  onLoad() { if (!t.canEdit()) { require('../../utils/tabs').open('/pages/home/home'); return; } this.setData({ config: t.read(t.KEY) }); },
  select(e) { this.setData({ selected: Number(e.currentTarget.dataset.index) }); },
  update(blocks, selected = this.data.selected) { this.setData({ 'config.blocks': blocks, selected, dirty: true }); },
  field(e) {
    const blocks = t.clone(this.data.config.blocks), b = blocks[this.data.selected];
    if (!b) return;
    const field = e.currentTarget.dataset.field;
    if (!['title', 'subtitle', 'height', 'columns', 'video', 'visible', 'showHeading'].includes(field)) return;
    let value = e.detail.value;
    if (field === 'height') value = Math.max(b.type === 'links' ? 40 : 160, Math.min(900, Number(value) || b.height));
    if (field === 'columns') value = [1, 2, 4][Number(value)] || 2;
    b[field] = value; this.update(blocks);
  },
  color(e) { const blocks = t.clone(this.data.config.blocks); blocks[this.data.selected].background = e.currentTarget.dataset.color; this.update(blocks); },
  itemField(e) {
    const blocks = t.clone(this.data.config.blocks), b = blocks[this.data.selected], i = Number(e.currentTarget.dataset.index), f = e.currentTarget.dataset.field;
    if (!b || !b.items[i] || !['title','subtitle','image','target'].includes(f)) return;
    b.items[i][f] = f === 'target' ? Number(e.detail.value) : e.detail.value; this.update(blocks);
  },
  move(e) { const blocks = t.clone(this.data.config.blocks), i = this.data.selected, j = i + Number(e.currentTarget.dataset.step); if (j < 0 || j >= blocks.length) return; [blocks[i], blocks[j]] = [blocks[j], blocks[i]]; this.update(blocks, j); },
  add(e) { const blocks = t.clone(this.data.config.blocks); if (blocks.length >= 30) return wx.showToast({ title: '最多 30 个模块', icon: 'none' }); blocks.push(t.block(t.KINDS[Number(e.detail.value)])); this.update(blocks, blocks.length - 1); },
  duplicate() { const blocks = t.clone(this.data.config.blocks); if (blocks.length >= 30) return; const b = t.clone(blocks[this.data.selected]); b.id = t.block(b.type).id; blocks.splice(this.data.selected + 1, 0, b); this.update(blocks, this.data.selected + 1); },
  remove() { wx.showModal({ title: '删除模块', content: '从本机草稿中删除这个模块？', success: r => { if (!r.confirm) return; const blocks = t.clone(this.data.config.blocks); blocks.splice(this.data.selected, 1); this.update(blocks, Math.max(0, this.data.selected - 1)); } }); },
  addItem() { const blocks = t.clone(this.data.config.blocks), block = blocks[this.data.selected]; if (!block) return; const limit = block.type === 'products' ? 100 : 20; if (block.items.length >= limit) return wx.showToast({ title: `最多 ${limit} ${block.type === 'products' ? '个商品' : '项内容'}`, icon: 'none' }); block.items.push(t.item('新内容')); this.update(blocks); },
  removeItem(e) { const blocks = t.clone(this.data.config.blocks); const items = blocks[this.data.selected].items; if (items.length <= 1) return wx.showToast({ title: '至少保留一项', icon: 'none' }); items.splice(Number(e.currentTarget.dataset.index), 1); this.update(blocks); },
  save() { if (!t.canEdit()) return false; try { wx.setStorageSync(t.KEY, this.data.config); this.setData({ dirty: false }); wx.showToast({ title: '本机草稿已保存' }); return true; } catch (_) { wx.showToast({ title: '保存失败，请检查存储空间', icon: 'none' }); return false; } },
  preview() { if (!this.save()) return; try { wx.setStorageSync(t.PREVIEW, this.data.config); wx.setStorageSync('topuyi_home_open_preview_v1', 1); require('../../utils/tabs').open('/pages/home/home'); } catch (_) { wx.showToast({ title: '预览保存失败', icon: 'none' }); } },
  reset() { wx.showModal({ title: '恢复默认模板', content: '替换当前编辑内容，保存后覆盖本机草稿。', success: r => { if (r.confirm) this.update(t.defaults().blocks, 0); } }); }
});
