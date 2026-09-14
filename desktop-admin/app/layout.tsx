import type {Metadata} from 'next';
import './globals.css';
export const metadata:Metadata={title:'TOPUYI 首页装修工作台',description:'TOPUYI 运营账号登录、共享首页装修、素材上传与开发版预览'};
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="zh-CN"><body>{children}</body></html>;}
