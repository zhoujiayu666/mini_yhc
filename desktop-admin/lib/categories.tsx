'use client';
import {createContext,useCallback,useContext,useEffect,useState,type ReactNode} from 'react';
import {ops} from './ops-client';
import type {Config,Item} from './editor';
export type Category={id:string;name:string;aliases?:string[]};
export type Categories={items:Category[];revision:string|null;usage:Record<string,{draft:number;published:number;templates:number}>};
type CategoryAction={operation:'add'|'rename'|'delete'|'reorder';name?:string;id?:string;ids?:string[]};
const Context=createContext<{data:Categories|null;error:string;busy:boolean;refresh:()=>Promise<void>;mutate:(action:CategoryAction)=>Promise<Categories>}|null>(null);
export function CategoriesProvider({children}:{children:ReactNode}){
 const [data,setData]=useState<Categories|null>(null),[error,setError]=useState(''),[busy,setBusy]=useState(false);
 const refresh=useCallback(async()=>{setBusy(true);try{const r=await ops('categoriesLoad') as unknown as Categories;setData(r);setError('');}catch(e){setError(e instanceof Error?e.message:'分类读取失败，请重试。');}finally{setBusy(false);}},[]);
 useEffect(()=>{void refresh();},[refresh]);
 async function mutate(action:CategoryAction){if(!data)throw Error('请先读取商品分类。');setBusy(true);try{const r=await ops('categoriesUpdate',{...action,expectedRevision:data.revision}) as unknown as Categories;setData(r);setError('');return r;}catch(e){setError(e instanceof Error?e.message:'分类保存失败。');throw e;}finally{setBusy(false);}}
 return <Context.Provider value={{data,error,busy,refresh,mutate}}>{children}</Context.Provider>;
}
export function useCategories(){return useContext(Context);}
export function itemCategory(item:Item,items:Category[]){return item.categoryId?items.find(c=>c.id===item.categoryId):items.find(c=>[c.name,...(c.aliases||[])].some(n=>n.trim().toLowerCase()===(item.category?.trim()||'荧光棒').toLowerCase()));}
export function itemCategories(item:Item,items:Category[]){
 const ids=Array.isArray(item.categoryIds)?item.categoryIds.filter(Boolean).slice(0,2):[];
 const resolved:Category[]=[];
 const seen=new Set<string>();
 const push=(c?:Category)=>{if(c&&!seen.has(c.id)){seen.add(c.id);resolved.push(c);}};
 if(ids.length)ids.forEach(id=>push(items.find(c=>c.id===id)));
 else push(itemCategory(item,items));
 return resolved;
}
export function patchCategories(selected:Category[]):Partial<Item>{
 const unique=selected.filter((c,i,all)=>all.findIndex(x=>x.id===c.id)===i).slice(0,2);
 return {categoryIds:unique.map(c=>c.id),categories:unique.map(c=>c.name),categoryId:unique[0]?.id,category:unique[0]?.name};
}
export function withCategories(config:Config,data:Categories):Config{return {...config,categories:data.items.map(({id,name})=>({id,name})),categoryRevision:data.revision,blocks:config.blocks.map(b=>b.type!=='products'?b:{...b,items:b.items.map(i=>{const cats=itemCategories(i,data.items);return cats.length?{...i,...patchCategories(cats)}:i;})})};}
