Component({
  properties: {
    current: {
      type: String,
      value: 'control'
    }
  },

  data: {
    tabs: [
      { id: 'product', label: '产品', icon: '◇', path: '/pages/product/product' },
      { id: 'show', label: '演出', icon: '◎', path: '/pages/show/show' },
      { id: 'control', label: '控制', icon: '◉', path: '/pages/control/control' },
      { id: 'room', label: '房间', icon: '▣', path: '/pages/room/room' },
      { id: 'around', label: '周边', icon: '◈', path: '/pages/around/around' },
      { id: 'mine', label: '我的', icon: '○', path: '/pages/mine/mine' }
    ]
  },

  methods: {
    onTabTap(e) {
      const id = e.currentTarget.dataset.id;
      if (!id || id === this.properties.current) return;
      const tab = this.data.tabs.find((t) => t.id === id);
      if (!tab) return;
      wx.reLaunch({ url: tab.path });
    }
  }
});
