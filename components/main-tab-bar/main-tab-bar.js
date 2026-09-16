const tabs = require('../../utils/tabs');

Component({
  properties: {
    current: {
      type: String,
      value: 'home'
    },
    docked: {
      type: Boolean,
      value: true
    }
  },

  data: {
    tabs: tabs.LIST
  },

  methods: {
    onTabTap(e) {
      const id = e.currentTarget.dataset.id;
      if (!id || id === this.properties.current) return;
      const tab = this.data.tabs.find((t) => t.id === id);
      if (tab) tabs.open(tab.path);
    }
  }
});
