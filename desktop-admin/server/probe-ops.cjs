const fs=require('node:fs');
const {ENV}=require('./cloud-client.cjs');
(async()=>{
 const user=JSON.parse(fs.readFileSync(require('node:path').join(__dirname,'../.private/operator-bootstrap.json'),'utf8'));
 const base=`https://${ENV}.api.tcloudbasegateway.com`;
 const r=await fetch(base+'/auth/v1/signin',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({username:user.username,password:user.password})});const auth=await r.json();
 if(!auth.access_token)throw new Error('Login failed '+r.status+' '+auth.error);
 fs.writeFileSync(require('node:path').join(__dirname,'../.private/test-session.json'),JSON.stringify(auth));
 const f=await fetch(base+'/v1/functions/topuyi-ops-v1',{method:'POST',headers:{'content-type':'application/json',Authorization:'Bearer '+auth.access_token},body:JSON.stringify({action:'whoami'})});
 console.log('Login',r.status,'Function',f.status,await f.text());
})().catch(e=>{console.error(e.message);process.exitCode=1;});
