'use client';
/* oxlint-disable next/no-img-element */
import {useState} from 'react';
import {ArrowDown,ArrowUp,ImagePlus,Plus,Trash2} from 'lucide-react';
import {Button} from '@/components/ui/button';
import {Input} from '@/components/ui/input';
import {ProductImageGallery} from './product-image-gallery';
import {uploadMedia} from '@/lib/ops-client';
import type {MemberProduct} from '@/lib/member';
import './member-product-detail-editor.css';

export function MemberProductDetail({product}:{product:MemberProduct}){
 const blocks=(product.detailBlocks||[]).filter(b=>b.type==='text'?b.text.trim():b.image);
 return <div className="member-detail-preview">
  <ProductImageGallery coverImage={product.image} images={product.detailImages||[]}/>
  <article><h2>{product.title||'商品标题'}</h2><b className="member-points">{product.points||0} 积分</b>
   {product.description&&<p>{product.description}</p>}
   {!!blocks.length&&<><h3>商品详情</h3>{blocks.map(b=>b.type==='text'?<p key={b.id}>{b.text}</p>:<img key={b.id} src={b.image} alt="商品详情图片"/>)}</>}
   {product.exchangeInstructions.trim()&&<><h3>兑换说明</h3><p>{product.exchangeInstructions}</p></>}
  </article>
  <div className="member-detail-preview-footer"><b>{product.points||0} 积分</b><span>立即兑换</span></div>
 </div>;
}

export default function MemberProductDetailEditor({product,onChange,busy,onBusyChange}:{product:MemberProduct;onChange:(update:(current:MemberProduct)=>MemberProduct)=>void;busy:boolean;onBusyChange:(busy:boolean)=>void}){
 const [error,setError]=useState('');
 const images=product.detailImages||[],blocks=product.detailBlocks||[];
 const patch=(value:Partial<MemberProduct>)=>onChange(p=>({...p,...value}));
 function move<T,>(rows:T[],index:number,step:number){const next=[...rows],to=index+step;if(to<0||to>=next.length)return next;[next[index],next[to]]=[next[to],next[index]];return next;}
 async function upload(files:FileList|null,blockId?:string){
  if(!files?.length||busy)return;
  const selected=Array.from(files);setError('');
  if(!blockId&&selected.length+images.length>10){setError(`最多添加 10 张补充主图，目前还可添加 ${10-images.length} 张。`);return;}
  if(selected.some(f=>!['image/jpeg','image/png','image/webp'].includes(f.type)||f.size>8*1024*1024)){setError('请选择 JPG、PNG 或 WebP 图片，每张最大 8MB。');return;}
  onBusyChange(true);
  try{for(const file of selected){const image=await uploadMedia(file);onChange(p=>blockId?{...p,detailBlocks:(p.detailBlocks||[]).map(b=>b.id===blockId?{...b,image}:b)}:{...p,detailImages:[...(p.detailImages||[]),image]});}}
  catch(e){setError((e instanceof Error?e.message:'图片上传失败')+'；已成功上传的图片会保留，请重试未完成的图片。');}
  finally{onBusyChange(false);}
 }
 return <div className="member-detail-layout">
  <fieldset disabled={busy} className="member-detail-fields">
   {error&&<p role="alert" className="member-detail-error">{error}</p>}
   <label className="field"><span>商品标题</span><Input value={product.title} maxLength={80} onChange={e=>patch({title:e.target.value})}/></label>
   <label className="field"><span>商品介绍（选填）</span><textarea maxLength={3000} value={product.description} placeholder="简短介绍商品特点" onChange={e=>patch({description:e.target.value})}/></label>
   <section><h3>详情页轮播图 <small>{images.length}/10 张补充图片</small></h3><p className="member-field-help">列表主图会作为第一张图片。这里可以添加补充图片，手机上支持左右滑动和点击放大。</p>
    <label className="upload-zone"><ImagePlus/><strong>{busy?'正在上传…':'添加轮播图片'}</strong><span>支持一次选择多张，每张最大 8MB</span><input aria-label="添加轮播图片" type="file" multiple accept="image/jpeg,image/png,image/webp" disabled={images.length>=10} onChange={e=>{void upload(e.target.files);e.target.value='';}}/></label>
    <div className="member-detail-images">{images.map((src,index)=><div className="member-detail-image" key={src+index}><img src={src} alt={`补充主图 ${index+1}`}/><div>
     <Button type="button" variant="ghost" size="icon" aria-label={`补充主图 ${index+1} 上移`} disabled={!index} onClick={()=>patch({detailImages:move(images,index,-1)})}><ArrowUp/></Button>
     <Button type="button" variant="ghost" size="icon" aria-label={`补充主图 ${index+1} 下移`} disabled={index===images.length-1} onClick={()=>patch({detailImages:move(images,index,1)})}><ArrowDown/></Button>
     <Button type="button" variant="ghost" size="icon" aria-label={`删除补充主图 ${index+1}`} onClick={()=>patch({detailImages:images.filter((_,i)=>i!==index)})}><Trash2/></Button>
    </div></div>)}</div>
   </section>
   <section><h3>商品详情图文 <small>{blocks.length}/30 项</small></h3><p className="member-field-help">按顺序展示商品介绍、规格、尺寸和详情长图。添加后请填好内容，也可删除不需要的空白项。</p>
    {blocks.map((b,index)=><div className="member-content-block" key={b.id}><div className="item-top"><b>{b.type==='text'?'文字':'图片'} {index+1}</b><div>
     <Button type="button" variant="ghost" size="icon" aria-label={`详情 ${index+1} 上移`} disabled={!index} onClick={()=>patch({detailBlocks:move(blocks,index,-1)})}><ArrowUp/></Button>
     <Button type="button" variant="ghost" size="icon" aria-label={`详情 ${index+1} 下移`} disabled={index===blocks.length-1} onClick={()=>patch({detailBlocks:move(blocks,index,1)})}><ArrowDown/></Button>
     <Button type="button" variant="ghost" size="icon" aria-label={`删除详情 ${index+1}`} onClick={()=>patch({detailBlocks:blocks.filter(x=>x.id!==b.id)})}><Trash2/></Button>
    </div></div>
     {b.type==='text'?<label className="field"><span>详情文字 {index+1}</span><textarea value={b.text} maxLength={3000} placeholder="输入商品介绍、规格说明等" onChange={e=>patch({detailBlocks:blocks.map(x=>x.id===b.id?{...x,text:e.target.value}:x)})}/></label>:<label className={'upload-zone '+(b.image?'has-image':'')}>{b.image?<img src={b.image} alt={`详情图片 ${index+1}`}/>:<ImagePlus/>}<strong>{b.image?'替换详情图片':'上传详情图片'}</strong><span>JPG / PNG / WebP，最大 8MB</span><input aria-label={`上传详情图片 ${index+1}`} type="file" accept="image/jpeg,image/png,image/webp" onChange={e=>{void upload(e.target.files,b.id);e.target.value='';}}/></label>}
    </div>)}
    <div className="member-inline-actions"><Button type="button" variant="outline" disabled={blocks.length>=30} onClick={()=>patch({detailBlocks:[...blocks,{id:crypto.randomUUID(),type:'text',text:'',image:''}]})}><Plus/>添加详情文字</Button><Button type="button" variant="outline" disabled={blocks.length>=30} onClick={()=>patch({detailBlocks:[...blocks,{id:crypto.randomUUID(),type:'image',text:'',image:''}]})}><ImagePlus/>添加详情图片</Button></div>
   </section>
   <label className="field"><span>兑换说明（选填）</span><textarea value={product.exchangeInstructions} maxLength={3000} placeholder="参与条件、领取安排等，不填写时不会显示" onChange={e=>patch({exchangeInstructions:e.target.value})}/></label>
  </fieldset>
  <aside className="member-detail-preview-column"><h3>详情页实时预览</h3><MemberProductDetail product={product}/><p className="member-field-help">预览展示排版，实际兑换时会校验用户积分和库存。</p></aside>
 </div>;
}
