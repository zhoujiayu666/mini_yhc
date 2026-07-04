Component({
  options: {
    multipleSlots: true
  },
  properties: {
    back: {
      type: Boolean,
      value: false
    }
  },

  lifetimes: {
    attached() {
      const pages = getCurrentPages();
      const page = pages[pages.length - 1];
      if (page) {
        page._loginSheetHost = this;
      }
    },
    detached() {
      const pages = getCurrentPages();
      const page = pages[pages.length - 1];
      if (page && page._loginSheetHost === this) {
        page._loginSheetHost = null;
      }
    }
  },

  methods: {
    openLoginSheet(options) {
      const sheet = this.selectComponent('#login-sheet');
      if (sheet && typeof sheet.open === 'function') {
        sheet.open(options);
      }
    }
  }
});
