'use client';
import {useEffect,useState} from 'react';
import useEmblaCarousel from 'embla-carousel-react';
import {ChevronLeft,ChevronRight,ImagePlus} from 'lucide-react';

export function ProductImageGallery({images,coverImage=''}:{images:string[];coverImage?:string}){
 const slides=[...new Set([coverImage,...images].filter(src=>typeof src==='string'&&src.trim()).map(src=>src.trim()))];
 const [ref,api]=useEmblaCarousel({loop:slides.length>1});
 const [current,setCurrent]=useState(0);
 useEffect(()=>{
  if(!api)return;
  const update=()=>setCurrent(api.selectedScrollSnap());
  update();api.on('select',update);api.on('reInit',update);
  return()=>{api.off('select',update);api.off('reInit',update);};
 },[api]);
 if(!slides.length)return <div className="empty-media h-[360px] w-full"><ImagePlus/><span>添加图片</span></div>;
 return <section className="relative min-w-0 bg-white" aria-label="商品主图" aria-roledescription="轮播图">
  <div ref={ref} className="overflow-hidden">
   <div className="flex touch-pan-y cursor-grab active:cursor-grabbing">
    {slides.map((src,index)=><div key={src+index} className="min-w-0 shrink-0 grow-0 basis-full"><img src={src} draggable={false} className="h-[360px] w-full select-none object-contain" alt={`商品主图 ${index+1}`}/></div>)}
   </div>
  </div>
  {slides.length>1&&<>
   <button type="button" aria-label="上一张商品主图" className="absolute top-1/2 left-3 flex size-10 -translate-y-1/2 items-center justify-center rounded-full bg-black/45 text-white" onClick={()=>api?.scrollPrev()}><ChevronLeft/></button>
   <button type="button" aria-label="下一张商品主图" className="absolute top-1/2 right-3 flex size-10 -translate-y-1/2 items-center justify-center rounded-full bg-black/45 text-white" onClick={()=>api?.scrollNext()}><ChevronRight/></button>
   <div className="pointer-events-none absolute right-3 bottom-3 left-3 flex items-center justify-between text-xs text-white"><span className="rounded-full bg-black/50 px-3 py-1.5">左右拖动查看</span><output aria-live="polite" className="rounded-full bg-black/50 px-3 py-1.5">{Math.min(current+1,slides.length)} / {slides.length}</output></div>
  </>}
 </section>;
}
