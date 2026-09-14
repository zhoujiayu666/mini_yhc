const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const {createRequire} = require('node:module');
const {connect,ENV} = require('./cloud-client.cjs');
const dir=path.join(__dirname,'../.private');
async function main(){
 fs.mkdirSync(dir,{recursive:true});
 const username=process.argv[2]||'topuyi_admin';if(!/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/.test(username))throw new Error('Invalid username');
 const role=username==='topuyi_admin'?'admin':'editor',name=role==='admin'?'运营管理员':'运营同事';
 const file=path.join(dir,username==='topuyi_admin'?'operator-bootstrap.json':`operator-${username}.json`);
 let user=fs.existsSync(file)?JSON.parse(fs.readFileSync(file,'utf8')):{username,uid:'ops_'+crypto.randomUUID().replaceAll('-',''),password:'Tp9!'+crypto.randomBytes(15).toString('base64url'),created:false};
 fs.writeFileSync(file,JSON.stringify(user,null,2));
 const req=createRequire('D:/Project/mini/mini_topuyi/package.json');
 const credential=await req('@cloudbase/toolbox').checkAndGetCredential({cwd:'D:/Project/mini/mini_topuyi'});
 const service=new (req('@cloudbase/cloud-api').CloudApiService)({service:'tcb',version:'2018-06-08',getCredential:async()=>credential});
 if(!user.created){await service.request('CreateUser',{EnvId:ENV,Name:user.username,Uid:user.uid,Password:user.password,Type:'externalUser',UserStatus:'ACTIVE',NickName:name,Description:'TOPUYI 独立首页运营后台应用账号'});user.created=true;fs.writeFileSync(file,JSON.stringify(user,null,2));}
 const app=await connect();
 for(const name of ['topuyi_operators_v1','topuyi_ops_content_v1']){
  try{await app.database().createCollection(name);}catch(e){if(!/exist/i.test(e.message))throw e;}
  await service.request('ModifyDatabaseACL',{EnvId:ENV,CollectionName:name,AclTag:'ADMINONLY'});
 }
 const existing=await app.database().collection('topuyi_operators_v1').where({_id:user.uid}).get();
 if(!existing.data.length)await app.database().collection('topuyi_operators_v1').doc(user.uid).set({name,username:user.username,role,active:true,createdAt:new Date().toISOString()});
 console.log(JSON.stringify({ready:true,username:user.username,collections:'independent/admin-only'}));
}
main().catch(e=>{console.error(e.code||e.name, String(e.message).replace(/Password[^,}]+/g,'Password:[redacted]'));process.exitCode=1;});
