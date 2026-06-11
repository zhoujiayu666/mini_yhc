Component({
  properties: {
    type: {
      type: String,
      value: ''
    },
    active: {
      type: Boolean,
      value: false
    },
    dimmed: {
      type: Boolean,
      value: false
    },
    size: {
      type: Number,
      value: 48
    }
  },

  observers: {
    'active, dimmed': function (active, dimmed) {
      this.updateColors(active, dimmed);
    }
  },

  data: {
    stroke: '#4A4A4A',
    fill: '#4A4A4A',
    accent: '#666666'
  },

  lifetimes: {
    attached() {
      this.updateColors(this.properties.active, this.properties.dimmed);
    }
  },

  methods: {
    updateColors(active, dimmed) {
      const stroke = active ? '#1A1A1A' : dimmed ? '#C8C8C8' : '#4A4A4A';
      const fill = active ? '#1A1A1A' : dimmed ? '#D8D8D8' : '#4A4A4A';
      const accent = active ? '#1A1A1A' : dimmed ? '#C8C8C8' : '#666666';
      this.setData({ stroke, fill, accent });
    }
  }
});
