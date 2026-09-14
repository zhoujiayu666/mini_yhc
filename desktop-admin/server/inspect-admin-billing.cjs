const {createRequire} = require('node:module');
const req = createRequire('D:/Project/mini/mini_topuyi/package.json');
const {checkAndGetCredential} = req('@cloudbase/toolbox');
const {CloudApiService} = req('@cloudbase/cloud-api');
const ENV='cloud1-d4grfezxdaca540d6';
function sanitize(value) {
  if(Array.isArray(value))return value.map(sanitize);
  if(!value||typeof value!=='object')return value;
  return Object.fromEntries(Object.entries(value).filter(([key])=>!/secret|token|credential|password|envparams|envvariables|image|repo|upload|download|openid|uin|appid|payurl|orderid/i.test(key)).map(([key,value])=>[key,sanitize(value)]));
}
(async()=>{
  const credential=await checkAndGetCredential({cwd:'D:/Project/mini/mini_topuyi'});
  if(!credential)throw Error('CLOUD_LOGIN_REQUIRED');
  const auth={secretId:credential.secretId,secretKey:credential.secretKey,token:credential.token};
  const tcb=new CloudApiService({service:'tcb',region:'ap-shanghai',credential:auth});
  const tcbr=new CloudApiService({service:'tcbr',region:'ap-shanghai',credential:auth});
  const jobs=[['billing',()=>tcb.request('DescribeBillingInfo',{EnvId:ENV})],['hostingEnvironment',()=>tcbr.request('DescribeCloudRunEnvs',{EnvId:ENV})]];
  await Promise.all(jobs.map(async([name,run])=>{
    try { console.log(JSON.stringify({name,result:sanitize(await run())},null,2)); }
    catch(error) { console.log(JSON.stringify({name,error:error.code||'',message:String(error.message||'').replace(/(AKID|secret|token)\S+/gi,'[redacted]').slice(0,250)})); }
  }));
})().catch(error=>{console.error(String(error.message||'').slice(0,200));process.exitCode=1;});
