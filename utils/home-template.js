const KEY = 'topuyi_home_draft_v1';
const PREVIEW = 'topuyi_home_preview_v1';
const TYPES = ['轮播海报', '视频', '分类入口', '活动海报', '商品展示', '公司介绍'];
const KINDS = ['banner', 'video', 'links', 'poster', 'products', 'about'];
const TARGETS = ['不跳转', '所有商品', '演出', '设备管理', '连接指南', 'APP控制', '房间'];
const PATHS = ['', '/pages/all-products/all-products', '/pages/show/show', '/pages/product/product', '/pages/connect-guide/connect-guide', '/pages/control/control', '/pages/room/room'];
function clone(v) { return JSON.parse(JSON.stringify(v)); }
function item(title, target = 0) { return { title, subtitle: '', image: '', target }; }
function block(type) {
  const i = KINDS.indexOf(type);
  return { id: 'b' + Date.now() + Math.random().toString(36).slice(2, 7), type,
    title: TYPES[i], subtitle: '', visible: true, showHeading: false, height: type === 'banner' ? 540 : 340,
    background: '#f4f4f1', columns: 2, video: '', items: [item('点击编辑内容')] };
}
function defaults() {
  const list = KINDS.map(block);
  Object.assign(list[0], { title: '让每一束光，与热爱同频', subtitle: 'TOPUYI · 智能灯光', background: '#171b26', items: [item('让每一束光\n与热爱同频', 1), item('把现场的热爱\n握在手心', 2)] });
  Object.assign(list[1], { title: '光，连接每一个现场', subtitle: '活动现场 / 工厂影像' });
  Object.assign(list[2], { title: '', background: '#ffffff', columns: 4, height: 160, items: [item('所有商品', 1), item('APP控制', 5), item('演出', 2), item('房间', 6)] });
  Object.assign(list[3], { title: '为下一场热爱，准备好', subtitle: '探索 TOPUYI 产品与活动', background: '#eee9db', items: [item('')] });
  Object.assign(list[4], {title:'精选商品',items:[{...item('TOPUYI 明星同款15色演唱会荧光棒',1),sku:'stick-05'},{...item('TOPUYI 经典荧光棒',1),sku:'stick-01'},{...item('TOPUYI RGB 智能荧光棒',1),sku:'stick-02'},{...item('荧光棒 10支套装',1),sku:'stick-03'}]});
  list[5]=block('poster'); Object.assign(list[5], {id:'default-bottom-poster',title:'底部海报',items:[item('')]});
  const community = block('links');
  Object.assign(community, { id: 'default-community', title: '', background: '#ffffff', columns: 2, items: [item('微信公众号'), item('明星粉丝群')] });
  list.splice(3, 0, community);
  return { version: 1, blocks: list };
}
function read(key) {
  try { const v = wx.getStorageSync(key); return v && v.version === 1 && Array.isArray(v.blocks) ? v : defaults(); }
  catch (_) { return defaults(); }
}
function canEdit() {
  try { return wx.getAccountInfoSync().miniProgram.envVersion === 'develop'; }
  catch (_) { return false; }
}
function navigate(target) { const url = PATHS[Number(target)]; if (url) require('./tabs').open(url); }
module.exports = { KEY, PREVIEW, TYPES, KINDS, TARGETS, clone, item, block, defaults, read, canEdit, navigate };
