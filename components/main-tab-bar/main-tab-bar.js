Component({
  properties: {
    current: {
      type: String,
      value: 'control'
    }
  },

  data: {
    tabs: [
      { id: 'home', label: '首页', icon: '◇', path: '/pages/home/home' },
      { id: 'products', label: '全部商品', icon: '▣', path: '/pages/all-products/all-products' },
      { id: 'mine', label: '个人中心', icon: '○', path: '/pages/mine/mine' }
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
