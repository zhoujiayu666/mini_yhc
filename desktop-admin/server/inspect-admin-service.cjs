const {createRequire} = require('node:module');
const req = createRequire('D:/Project/mini/mini_topuyi/package.json');
const {checkAndGetCredential} = req('@cloudbase/toolbox');
const {CloudApiService} = req('@cloudbase/cloud-api');
const ENV='cloud1-d4grfezxdaca540d6', SERVER='topuyi-operations-cn';
(async()=>{
  const credential=await checkAndGetCredential({cwd:'D:/Project/mini/mini_topuyi'});
  if(!credential) throw Error('CLOUD_LOGIN_REQUIRED');
  const service=new CloudApiService({service:'tcbr',version:'2022-02-17',region:'ap-shanghai',credential:{secretId:credential.secretId,secretKey:credential.secretKey,token:credential.token}});
  const result=await service.request('DescribeCloudRunServerDetail',{EnvId:ENV,ServerName:SERVER});
  function sanitize(value) {
    if(Array.isArray(value))return value.map(sanitize);
    if(!value||typeof value!=='object')return value;
    return Object.fromEntries(Object.entries(value).filter(([key])=>!/secret|token|credential|password|envparams|envvariables|image|repo|upload|download/i.test(key)).map(([key,value])=>[key,sanitize(value)]));
  }
  console.log(JSON.stringify(sanitize(result),null,2));
})().catch(error=>{console.error(JSON.stringify({error:error.code||'',message:String(error.message||'').replace(/(AKID|secret|token)\S+/gi,'[redacted]').slice(0,300)}));process.exitCode=1;});
