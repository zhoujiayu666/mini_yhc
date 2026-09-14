Page({
 data:{content:null},
 onLoad(options){const saved=wx.getStorageSync('topuyi_home_content_detail_v1');this.setData({content:saved&&saved.id===(options.id||'')?saved:null});},
 previewImage(){const src=this.data.content&&this.data.content.image;if(src)wx.previewImage({current:src,urls:[src]});}
});
