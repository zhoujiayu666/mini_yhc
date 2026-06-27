const SOFTWARE_LIST = [
  {
    id: 'TPY-100',
    name: 'TPY-100',
    title: 'TPY-100 · 433MHz',
    desc: '433 无线方案，通信距离约 100 米，适合中小型场地手灯控制。'
  },
  {
    id: 'TPY-500',
    name: 'TPY-500',
    title: 'TPY-500 · 433MHz',
    desc: '433 无线方案，通信距离约 500 米，适合中大型活动与户外场地。'
  },
  {
    id: 'TPY-1000',
    name: 'TPY-1000',
    title: 'TPY-1000 · 433MHz',
    desc: '433 无线方案，通信距离约 1000 米，适合大型场馆与远距离群控。'
  },
  {
    id: 'TPY-X',
    name: 'TPY-X',
    title: 'TPY-X · 2.4GHz',
    desc: '2.4G 无线方案，低延迟500米距离控制，适合点控以及显示丰富图案等场景。'
  }
];

function getSoftwareById(id) {
  return SOFTWARE_LIST.find((item) => item.id === id) || null;
}

module.exports = {
  SOFTWARE_LIST,
  getSoftwareById
};
