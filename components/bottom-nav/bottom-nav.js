// components/bottom-nav/bottom-nav.js
Component({
  /**
   * 组件的属性列表
   */
  properties: {
    current: {
      type: String,
      value: 'index'
    }
  },

  /**
   * 组件的初始数据
   */
  data: {

  },

  /**
   * 组件的方法列表
   */
  methods: {
    navigateTo(e) {
      const { page } = e.currentTarget.dataset;
      const currentPage = this.properties.current;
      
      // 如果点击的是当前页面，不执行跳转
      if (page === currentPage) {
        return;
      }
      
      const pages = {
        'settings': '/pages/color-control/color-control',
        'index': '/pages/index/index',
        'music': '/pages/music-rhythm/music-rhythm'
      };
      
      const url = pages[page];
      if (url) {
        // 获取当前页面栈
        const currentPages = getCurrentPages();
        const currentPath = '/' + currentPages[currentPages.length - 1].route;
        
        if (currentPath === url) {
          return; // 已经在目标页面
        }
        
        // 使用 redirectTo 进行页面跳转（无动画）
        wx.redirectTo({
          url: url,
          fail: () => {
            // 如果 redirectTo 失败，尝试使用 navigateTo（作为后备方案）
            wx.navigateTo({
              url: url,
              fail: () => {
                // 如果还是失败，尝试返回首页再跳转
                if (url !== '/pages/index/index') {
                  wx.navigateBack({
                    delta: currentPages.length - 1,
                    success: () => {
                      setTimeout(() => {
                        wx.redirectTo({ url });
                      }, 100);
                    }
                  });
                }
              }
            });
          }
        });
      }
    }
  }
})
