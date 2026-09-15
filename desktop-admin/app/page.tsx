'use client';
import {useEffect,useState,type SubmitEvent} from 'react';
import {LockKeyhole,PanelsTopLeft,ImagePlus,Users,ArrowRight,ShieldCheck} from 'lucide-react';
import {Button} from '@/components/ui/button';
import {Input} from '@/components/ui/input';
import HomeEditor from '@/components/home-editor';
import MemberEditor from '@/components/member-editor';
import {ops} from '@/lib/ops-client';
type User={name:string;username:string;role:string};
export default function Operations(){
 const [user,setUser]=useState<User|null>(null),[checking,setChecking]=useState(true),[busy,setBusy]=useState(false),[error,setError]=useState(''),[username,setUsername]=useState(''),[password,setPassword]=useState(''),[expired,setExpired]=useState(false);
 useEffect(()=>{void ops('session').then(v=>setUser(v.user)).catch(()=>{}).finally(()=>setChecking(false));const h=()=>{setExpired(true);setError('登录已过期，请重新登录。未保存的编辑会保留在当前页面。');};window.addEventListener('ops-session-expired',h);return()=>window.removeEventListener('ops-session-expired',h);},[]);
 async function login(e:SubmitEvent<HTMLFormElement>){e.preventDefault();setBusy(true);setError('');try{const value=await ops('login',{username,password});setUser(value.user);setPassword('');setExpired(false);}catch(e){setError(e instanceof Error?e.message:'登录失败。');}finally{setBusy(false);}}
 async function logout(){try{await ops('logout',{});setUser(null);setExpired(false);setPassword('');setError('');}catch(e){setError(e instanceof Error?e.message:'退出失败。');}}
 if(checking)return <div className="login-loading">正在连接运营工作台…</div>;
 return <>{user&&<EditorWorkspace userName={user.name} onLogout={()=>void logout()}/>}{(!user||expired)&&<div className={'login-page '+(user?'session-overlay':'')}><aside className="login-story"><div className="login-brand">TOPUYI<span>商家运营工作台</span></div><div><span className="login-eyebrow">让品牌首页，常看常新</span><h1>好内容，<br/>从这里上场。</h1><p>一处管理页面、图片与品牌素材。<br/>把更多时间留给创意和运营。</p><div className="login-features"><span><PanelsTopLeft/>自由组合页面</span><span><ImagePlus/>上传品牌素材</span><span><Users/>团队共享草稿</span></div></div><small>TOPUYI · 让热爱发光</small></aside><main className="login-side"><form className="login-card" onSubmit={login}><span className="login-icon"><LockKeyhole/></span><h2>{user?'重新登录':'登录运营后台'}</h2><p>使用管理员为你开通的运营账号</p><label htmlFor="ops-user">运营账号<Input id="ops-user" autoComplete="username" required value={username} onChange={e=>setUsername(e.target.value)} placeholder="请输入账号" maxLength={64}/></label><label htmlFor="ops-password">登录密码<Input id="ops-password" type="password" autoComplete="current-password" required value={password} onChange={e=>setPassword(e.target.value)} placeholder="请输入密码" maxLength={64}/></label>{error&&<p className="login-error" role="alert">{error}</p>}<Button type="submit" disabled={busy}>{busy?'正在登录…':'进入工作台'}<ArrowRight/></Button><div className="login-help">账号开通或密码重置，请联系后台管理员。</div><div className="login-scope"><ShieldCheck size={18}/><span>管理首页与会员中心<br/>保存草稿后，按需发布页面内容</span></div></form></main></div>}</>;
}

function EditorWorkspace({userName,onLogout}:{userName:string;onLogout:()=>void}){
 const [page,setPage]=useState<'home'|'member'>('home'),[memberOpened,setMemberOpened]=useState(false),[homeDirty,setHomeDirty]=useState(false),[memberDirty,setMemberDirty]=useState(false);
 const exit=()=>{if((homeDirty||memberDirty)&&!window.confirm('有未保存的首页或会员中心修改，确定退出登录？'))return;onLogout();};
 return <><div style={{display:page==='home'?'block':'none'}}><HomeEditor online userName={userName} onLogout={exit} onDirtyChange={setHomeDirty} onMember={()=>{setMemberOpened(true);setPage('member');}}/></div>{memberOpened&&<div style={{display:page==='member'?'block':'none'}}><MemberEditor userName={userName} onHome={()=>setPage('home')} onLogout={exit} onDirtyChange={setMemberDirty}/></div>}</>;
}
