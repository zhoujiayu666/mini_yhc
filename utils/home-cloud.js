const template=require('./home-template');
const CODE_KEY='topuyi_home_cloud_preview_code_v1',PREVIEW_CACHE='topuyi_home_cloud_preview_cache_v1',LIVE_CACHE='topuyi_home_published_cache_v1';
const empty=()=>({version:1,blocks:[]});
function getCode(){try{return wx.getStorageSync(CODE_KEY)||'';}catch(_){return '';}}
function setCode(code){if(!/^[a-f0-9]{32}$/.test(code))throw Error('预览码格式不正确');wx.setStorageSync(CODE_KEY,code);}
function clearCode(){wx.removeStorageSync(CODE_KEY);}
async function load(){
  // Trial/review/release never depend on a locally saved development code.
  const accessCode=template.canEdit()?getCode():'',preview=!!accessCode;
  const key=preview?PREVIEW_CACHE:LIVE_CACHE,catalogSource=preview?'home_dev':'home_live';
  try{
    const r=await wx.cloud.callFunction({name:preview?'topuyi-home-preview-v1':'topuyi-storefront-v1',data:preview?{action:'getPreview',accessCode}:{action:'getPublished'}});
    const value=r.result;
    if(!value?.ok)throw Error(value?.error==='PREVIEW_CODE_INVALID'?'预览码已失效，请重新连接':value?.error==='STOREFRONT_NOT_READY'?'商城内容尚未发布，请稍后再试':'商品加载失败，请下拉刷新重试');
    if(value.config?.version!==1||!Array.isArray(value.config.blocks)||!Array.isArray(value.products))throw Error('商品数据格式不正确，请刷新重试');
    try{wx.setStorageSync(key,{code:accessCode,time:Date.now(),config:value.config,products:value.products});}catch(_){}
    return {config:value.config,products:value.products,catalogSource,status:preview?'已同步电脑后台':'已加载已发布商城',revision:value.revision};
  }catch(error){
    let cached;try{cached=wx.getStorageSync(key);}catch(_){}
    const usable=cached&&cached.code===accessCode&&Date.now()-cached.time<20*60*1000;
    return {config:usable?cached.config:empty(),products:usable?cached.products||[]:[],catalogSource,status:'加载失败，请下拉刷新',error:error.message||'请检查网络后重试'};
  }
}
module.exports={getCode,setCode,clearCode,load};
