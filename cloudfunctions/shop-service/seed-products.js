/** 首批商品（价格单位：分） */
const SEED_PRODUCTS = [
  {
    sku: 'stick-01',
    name: 'TOPUYI 经典荧光棒',
    desc: '单色常亮 · 演唱会必备',
    price: 1290,
    category: 'stick',
    color: '#39FF14',
    tag: '热销',
    stock: 999,
    sort: 100
  },
  {
    sku: 'stick-02',
    name: 'TOPUYI RGB 智能荧光棒',
    desc: '蓝牙调光 · 256色',
    price: 8900,
    category: 'stick',
    color: '#FF6B9D',
    tag: '新品',
    stock: 999,
    sort: 90
  },
  {
    sku: 'stick-03',
    name: '荧光棒 10支套装',
    desc: '混色组合 · 应援团建',
    price: 6800,
    category: 'stick',
    color: '#00E5FF',
    tag: '',
    stock: 999,
    sort: 80
  },
  {
    sku: 'stick-04',
    name: '迷你荧光棒 5支装',
    desc: '便携轻巧 · 儿童友好',
    price: 2990,
    category: 'stick',
    color: '#FFD100',
    tag: '',
    stock: 999,
    sort: 70
  }
];

module.exports = { SEED_PRODUCTS };
