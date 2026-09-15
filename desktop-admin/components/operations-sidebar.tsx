'use client';
import {useState} from 'react';
import {PanelsTopLeft,Users,FolderOpen,FolderTree,ChevronDown,Monitor} from 'lucide-react';
import {Button} from '@/components/ui/button';
import {Sidebar,SidebarHeader,SidebarContent,SidebarFooter,SidebarMenu,SidebarMenuItem,SidebarMenuButton,SidebarMenuSub,SidebarMenuSubItem,SidebarMenuSubButton,useSidebar} from '@/components/ui/sidebar';

export type OperationsPage='home'|'member'|'redemptions'|'categories'|'templates';
export default function OperationsSidebar({page,userName,onNavigate,onLogout}:{page:OperationsPage;userName:string;onNavigate:(page:OperationsPage)=>void;onLogout:()=>void}){
 const [memberExpanded,setMemberExpanded]=useState(true);
 const {isMobile,setOpenMobile}=useSidebar();
 function navigate(next:OperationsPage){onNavigate(next);if(isMobile)setOpenMobile(false);}
 return <Sidebar collapsible="offcanvas" className="brand-sidebar operations-sidebar"><SidebarHeader><div className="logo">TOPUYI<span>商家运营工作台</span></div></SidebarHeader><SidebarContent><nav aria-label="运营主菜单"><div className="nav-caption">店铺管理</div><SidebarMenu>
  <SidebarMenuItem><SidebarMenuButton isActive={page==='home'} aria-current={page==='home'?'page':undefined} onClick={()=>navigate('home')}><PanelsTopLeft/><span>首页装修</span></SidebarMenuButton></SidebarMenuItem>
  <SidebarMenuItem><SidebarMenuButton isActive={page==='member'||page==='redemptions'} aria-expanded={memberExpanded} aria-controls="operations-member-menu" onClick={()=>setMemberExpanded(v=>!v)}><Users/><span>会员中心</span><ChevronDown className={'member-menu-arrow '+(memberExpanded?'expanded':'')}/></SidebarMenuButton>
   {memberExpanded&&<SidebarMenuSub id="operations-member-menu"><SidebarMenuSubItem><SidebarMenuSubButton render={<button type="button"/>} isActive={page==='member'} aria-current={page==='member'?'page':undefined} onClick={()=>navigate('member')}><span>页面装修</span></SidebarMenuSubButton></SidebarMenuSubItem><SidebarMenuSubItem><SidebarMenuSubButton render={<button type="button"/>} isActive={page==='redemptions'} aria-current={page==='redemptions'?'page':undefined} onClick={()=>navigate('redemptions')}><span>积分兑换管理</span></SidebarMenuSubButton></SidebarMenuSubItem></SidebarMenuSub>}
  </SidebarMenuItem>
  <SidebarMenuItem><SidebarMenuButton isActive={page==='categories'} aria-current={page==='categories'?'page':undefined} onClick={()=>navigate('categories')}><FolderTree/><span>商品分类</span></SidebarMenuButton></SidebarMenuItem>
  <SidebarMenuItem><SidebarMenuButton isActive={page==='templates'} aria-current={page==='templates'?'page':undefined} onClick={()=>navigate('templates')}><FolderOpen/><span>我的模板</span></SidebarMenuButton></SidebarMenuItem>
 </SidebarMenu></nav></SidebarContent><SidebarFooter><div className="local-badge"><Monitor size={16}/>共享工作空间</div><p className="local-note">页面装修与商城发布</p><p className="local-note">{userName}</p><Button variant="outline" onClick={onLogout}>退出登录</Button></SidebarFooter></Sidebar>;
}
