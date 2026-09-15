const CACHE='topuyi_member_published_cache_v1';
async function load(){
 try{
  const response=await wx.cloud.callFunction({name:'topuyi-storefront-v1',data:{action:'getMember'}}),value=response.result;
  if(!value||!value.ok)throw Error('会员中心暂时无法加载，请稍后重试');
  if(!value.published){try{wx.removeStorageSync(CACHE);}catch(_){}return {config:null,published:false};}
  const c=value.config;
  if(c?.version!==1||!c.hero||!c.banner||!Array.isArray(c.entries?.items)||!Array.isArray(c.products?.items))throw Error('会员内容加载失败，请重试');
  try{wx.setStorageSync(CACHE,{time:Date.now(),config:c});}catch(_){}
  return {config:c,published:true,revision:value.revision};
 }catch(e){let cached;try{cached=wx.getStorageSync(CACHE);}catch(_){}return {config:cached&&Date.now()-cached.time<20*60*1000?cached.config:null,error:e.message||'请检查网络后重试'};}
}
module.exports={load};
