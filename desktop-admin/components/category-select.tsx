'use client';
import {useState} from 'react';
import {Button} from '@/components/ui/button';
import {Input} from '@/components/ui/input';
import {Dialog,DialogContent,DialogTitle,DialogDescription} from '@/components/ui/dialog';
import {Combobox,ComboboxInput,ComboboxContent,ComboboxList,ComboboxItem,ComboboxEmpty} from '@/components/ui/combobox';
import {itemCategory,useCategories,type Category} from '@/lib/categories';
import type {Item} from '@/lib/editor';
export default function CategorySelect({item,onChange}:{item:Item;onChange:(patch:Partial<Item>)=>void}){
 const state=useCategories(),[open,setOpen]=useState(false),[name,setName]=useState(''),[error,setError]=useState('');
 if(!state)return <Input aria-label="商品分类" maxLength={20} value={item.category||'荧光棒'} onChange={e=>onChange({category:e.target.value})}/>;
 const selected=itemCategory(item,state.data?.items||[]);
 async function add(){setError('');try{const r=await state!.mutate({operation:'add',name}),c=r.items.find(c=>c.name===name.trim());if(c){onChange({categoryId:c.id,category:c.name});setOpen(false);setName('');}}catch(e){setError(e instanceof Error?e.message:'新增失败，请重试。');}}
 return <div className="category-select"><Combobox items={state.data?.items||[]} value={selected||null} itemToStringLabel={(c:Category)=>c.name} isItemEqualToValue={(a:Category,b:Category)=>a.id===b.id} onValueChange={c=>{if(c)onChange({categoryId:c.id,category:c.name});}}><ComboboxInput aria-label="商品分类" placeholder={state.data?'搜索或选择分类':'正在读取分类…'} disabled={!state.data||state.busy}/><ComboboxContent><ComboboxEmpty>没有匹配分类，可点击新增分类</ComboboxEmpty><ComboboxList>{(c:Category)=><ComboboxItem key={c.id} value={c}>{c.name}</ComboboxItem>}</ComboboxList></ComboboxContent></Combobox><Button type="button" variant="outline" disabled={!state.data||state.busy} onClick={()=>{setOpen(true);setError('');}}>＋新增分类</Button>{!selected&&state.data&&<small>当前分类“{item.category||'荧光棒'}”未匹配，请选择或新增分类。</small>}{state.error&&<small role="alert">{state.error}<button type="button" onClick={()=>void state.refresh()}>刷新分类</button></small>}<Dialog open={open} onOpenChange={setOpen}><DialogContent><DialogTitle>新增商品分类</DialogTitle><DialogDescription>保存后自动选中，当前商品的其他编辑会保留。</DialogDescription><Input aria-label="新分类名称" placeholder="例如：手环" maxLength={20} value={name} onChange={e=>setName(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'&&name.trim()&&!state.busy){e.preventDefault();void add();}}}/>{error&&<p role="alert">{error}</p>}<Button disabled={state.busy||!name.trim()} onClick={()=>void add()}>{state.busy?'保存中…':'保存并选中'}</Button></DialogContent></Dialog></div>;
}
