const {createRequire}=require('node:module');
const req=createRequire('D:/Project/mini/mini_topuyi/package.json');
const {checkAndGetCredential}=req('@cloudbase/toolbox');
const {CloudApiService}=req('@cloudbase/cloud-api');
const EnvId='cloud1-d4grfezxdaca540d6',ServerName='topuyi-operations-cn';
function safe(v){if(Array.isArray(v))return v.map(safe);if(!v||typeof v!=='object')return v;return Object.fromEntries(Object.entries(v).filter(([k])=>!/secret|token|credential|password|envparam|envvariable|webshell|image|repo|upload|download|keyid/i.test(k)).map(([k,x])=>[k,safe(x)]));}
(async()=>{
 const c=await checkAndGetCredential({cwd:'D:/Project/mini/mini_topuyi'});if(!c)throw Error('CLOUD_LOGIN_REQUIRED');
 const service=new CloudApiService({service:'tcbr',version:'2022-02-17',region:'ap-shanghai',credential:{secretId:c.secretId,secretKey:c.secretKey,token:c.token}});
 const jobs=[['pods','DescribeCloudRunPodList',{EnvId,ServerName,PageSize:10,PageNum:1}],['deployments','DescribeCloudRunDeployRecord',{EnvId,ServerName}],['version','DescribeVersionDetail',{EnvId,ServerName,VersionName:ServerName+'-019'}]];
 for(const [name,action,args] of jobs){try{const result=await service.request(action,args);if(result.DeployRecords)result.DeployRecords=result.DeployRecords.sort((a,b)=>b.DeployTime.localeCompare(a.DeployTime)).slice(0,4);console.log(JSON.stringify({name,result:safe(result)},null,2));}catch(e){console.log(JSON.stringify({name,error:e.code||'',message:e.message?.slice(0,240)}));}}
})().catch(e=>{console.error(e.code||e.message);process.exitCode=1;});
