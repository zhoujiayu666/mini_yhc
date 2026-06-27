const { getSoftwareById } = require('../../utils/software-center.js');

Page({
  data: {
    software: null
  },

  onLoad(options) {
    const id = options.id || '';
    const software = getSoftwareById(id);
    if (!software) {
      wx.showToast({ title: '软件不存在', icon: 'none' });
      setTimeout(() => wx.navigateBack(), 800);
      return;
    }
    this.setData({ software });
  }
});
