import {createServer} from 'node:http';
import {readFile,stat} from 'node:fs/promises';
import {resolve,extname,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {Readable} from 'node:stream';
import {GET,POST} from './api.mjs';
const port=Number(process.env.PORT||8080);
const origin=new URL(process.env.PUBLIC_ORIGIN||`http://localhost:${port}`).origin;
const root=fileURLToPath(new URL('./client/',import.meta.url));
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.ico':'image/x-icon','.woff2':'font/woff2'};
createServer(async(req,res)=>{
 try{
  const url=new URL(req.url,origin);
  res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','same-origin');res.setHeader('X-Frame-Options','DENY');
  if(url.pathname==='/healthz'){res.writeHead(200,{'content-type':'text/plain'});res.end('ok');return;}
  if(url.pathname.startsWith('/api/ops/')){
   if(!['GET','POST'].includes(req.method)){res.writeHead(405);res.end();return;}
   const headers=new Headers();for(const [k,v] of Object.entries(req.headers)){if(v!==undefined)headers.set(k,Array.isArray(v)?v.join(','):v);}
   const request=new Request(origin+url.pathname+url.search,{method:req.method,headers,...(req.method==='POST'?{body:Readable.toWeb(req),duplex:'half'}:{})});
   const response=await (req.method==='GET'?GET:POST)(request,{params:Promise.resolve({path:url.pathname.slice('/api/ops/'.length).split('/')})});
   res.writeHead(response.status,Object.fromEntries(response.headers));if(response.body)Readable.fromWeb(response.body).pipe(res);else res.end();return;
  }
  if(!['GET','HEAD'].includes(req.method)){res.writeHead(405);res.end();return;}
  const path=resolve(root,'.'+decodeURIComponent(url.pathname==='/'?'/index.html':url.pathname));
  if(!path.startsWith(resolve(root)+sep)){res.writeHead(404);res.end();return;}
  try{if(!(await stat(path)).isFile())throw Error();}catch{res.writeHead(404);res.end('Not found');return;}
  res.writeHead(200,{'content-type':mime[extname(path)]||'application/octet-stream','cache-control':path.endsWith('.html')?'no-store':'public, max-age=3600'});res.end(req.method==='HEAD'?undefined:await readFile(path));
 }catch{if(!res.headersSent){res.writeHead(500,{'content-type':'application/json','cache-control':'no-store'});res.end(JSON.stringify({error:'服务暂不可用，请稍后重试。'}));}else res.destroy();}
}).listen(port,'0.0.0.0',()=>console.log(`TOPUYI operations listening on ${port}`));
