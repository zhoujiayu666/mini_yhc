import type { Plugin } from 'vite';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { createHash, randomBytes } from 'node:crypto';
import { createRequire } from 'node:module';
import path from 'node:path';
import { validateConfig, type Config } from '../lib/editor';
const require = createRequire(path.join(process.cwd(), 'server', 'bridge.cjs'));
const { connect, COLLECTION, ENV, PREFIX } = require('./cloud-client.cjs');
const allowedOrigin = 'http://localhost:5188';
const hash = (v: string | Buffer) => createHash('sha256').update(v).digest('hex');
type CloudApp = {database:()=>{collection:(name:string)=>{where:(query:object)=>{limit:(n:number)=>{get:()=>Promise<{data:Array<{revision:string;updatedAt:string}>}>}};doc:(id:string)=>{set:(value:object)=>Promise<unknown>}}};uploadFile:(value:{cloudPath:string;fileContent:Buffer})=>Promise<{fileID?:string}>};
const codeValid = (v: unknown): v is string => typeof v === 'string' && /^[a-f0-9]{32}$/.test(v);
let syncing = false;
function send(res: ServerResponse, status: number, value: object) { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(value)); }
async function body(req: IncomingMessage) { const chunks: Buffer[] = []; let size = 0; for await (const c of req) { size += c.length; if (size > 110 * 1024 * 1024) throw new Error('BODY_LIMIT'); chunks.push(c); } return JSON.parse(Buffer.concat(chunks).toString('utf8')); }
async function current(app: CloudApp) { const r = await app.database().collection(COLLECTION).where({ _id: 'active' }).limit(1).get(); return r.data[0] || null; }
async function uploadConfig(app: CloudApp, config: Config) {
  const memo = new Map<string,string>();
  async function media(value: string) {
    if (!value) return '';
    const match = /^data:(image\/(?:png|jpeg|webp)|video\/(?:mp4|webm));base64,([A-Za-z0-9+/=]+)$/.exec(value);
    if (!match) throw new Error('INVALID_MEDIA');
    const bytes = Buffer.from(match[2], 'base64');
    if (bytes.length > (match[1].startsWith('video') ? 30 : 8) * 1024 * 1024) throw new Error('BODY_LIMIT');
    const id = hash(bytes), ext = match[1].split('/')[1];
    if (memo.has(id)) return memo.get(id)!;
    const result = await app.uploadFile({ cloudPath: `${PREFIX}${id}.${ext}`, fileContent: bytes });
    if (!result.fileID) throw new Error('UPLOAD_FAILED');
    memo.set(id,result.fileID); return result.fileID as string;
  }
  const result = structuredClone(config);
  for (const b of result.blocks) { b.video = await media(b.video); for (const i of b.items) i.image = await media(i.image); }
  return result;
}
export function homePreviewPlugin(): Plugin {
  return { name: 'topuyi-local-home-preview', apply: 'serve', configureServer(server) {
    server.middlewares.use(async (req,res,next) => {
      if (!req.url?.startsWith('/api/home-preview/')) return next();
      const host = req.headers.host, origin = req.headers.origin;
      if (host !== 'localhost:5188' || (origin && origin !== allowedOrigin) || req.headers['x-topuyi-preview'] !== '1' || !['127.0.0.1','::1','::ffff:127.0.0.1'].includes(req.socket.remoteAddress || '')) return send(res,403,{error:'仅允许本机装修后台访问。'});
      const endpoint = req.url.split('?')[0];
      if (!['/api/home-preview/status','/api/home-preview/sync'].includes(endpoint)) return send(res,404,{error:'接口不存在'});
      if ((endpoint.endsWith('/status') && req.method !== 'GET') || (endpoint.endsWith('/sync') && req.method !== 'POST')) return send(res,405,{error:'请求方式不正确'});
      let ownsLock=false;
      try {
        if (endpoint.endsWith('/status')) { const app=await connect(); const existing=await current(app); return send(res,200,{connected:true,env:ENV,revision:existing?.revision||null,updatedAt:existing?.updatedAt||null}); }
        if (syncing) return send(res,409,{error:'另一个同步正在进行，请稍后重试。'});
        syncing=true; ownsLock=true;
        const payload=await body(req), config=validateConfig(payload.config);
        const app=await connect(), before=await current(app);
        if ((before?.revision||null) !== (payload.expectedRevision||null)) return send(res,409,{error:'云端草稿已更新，请先检查连接，再确认同步当前页面。'});
        const accessCode=codeValid(payload.accessCode) ? payload.accessCode : randomBytes(16).toString('hex');
        const uploaded=await uploadConfig(app,config), revision=randomBytes(12).toString('hex'), updatedAt=new Date().toISOString();
        // Only this isolated document is written. Asset uploads finish before the pointer changes.
        await app.database().collection(COLLECTION).doc('active').set({config:uploaded,revision,updatedAt,accessHash:hash(accessCode),scope:'development-preview',schemaVersion:1});
        send(res,200,{synced:true,revision,updatedAt,accessCode,env:ENV});
      } catch(e: unknown) {
        const failure=e as {message?:string;code?:string};
        const message=failure?.message||'', code=failure?.code||'';
        console.error('[home-preview]', code || (e instanceof Error ? e.name : 'unknown'), /Cannot find module/.test(message) ? message.split('\n')[0] : 'Cloud operation failed');
        const error=message==='CLOUD_LOGIN_REQUIRED' ? '云开发登录已失效，请在电脑上运行 tcb login 后重试。' : /collection|DATABASE_COLLECTION_NOT_EXIST/i.test(message+code) ? '首页预览集合尚未准备好，请完成独立预览服务部署。' : /BODY_LIMIT/.test(message) ? '素材过大：图片上限 8MB，视频 30MB，总请求 110MB。' : /Invalid template|INVALID_MEDIA|JSON/.test(message) ? '页面或素材格式不正确，请检查后重试。' : '云端连接或同步失败，已保留原草稿。请检查云开发登录和网络后重试。';
        send(res,400,{error});
      } finally { if(ownsLock) syncing=false; }
    });
  }};
}
