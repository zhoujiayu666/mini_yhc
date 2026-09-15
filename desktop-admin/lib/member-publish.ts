import type {MemberConfig} from './member';

export type MemberPublishIssue={section:'hero'|'entries'|'banner'|'products';label:string;message:string};

// Check the current editor content before asking the server to publish the saved draft.
// The server remains authoritative for uploaded assets, permissions and draft revisions.
export function memberPublishIssues(config:MemberConfig):MemberPublishIssue[]{
 const issues:MemberPublishIssue[]=[];
 const filled=(value:string)=>!!value.trim();
 for(const section of ['hero','banner'] as const){
  const poster=config[section],label=section==='hero'?'顶部海报':'横幅海报';
  if(poster.visible&&!filled(poster.image))issues.push({section,label,message:'尚未上传图片。请上传图片，或关闭该区域的显示开关。'});
 }
 if(config.entries.visible)config.entries.items.forEach((entry,index)=>{
  const missing:string[]=[];
  if(!filled(entry.image))missing.push('海报图片');
  if(entry.enabled){if(!filled(entry.title))missing.push('二级页标题');if(!entry.content.some(block=>block.type==='text'?filled(block.text):filled(block.image)))missing.push('二级页图文内容');}
  if(missing.length)issues.push({section:'entries',label:'双列海报 · '+(index===0?'左侧海报':'右侧海报'),message:`缺少${missing.join('、')}。请补齐内容，或关闭“双列海报”的显示开关；不需要二级页时可关闭“点击打开二级页”。`});
 });
 if(config.products.visible)config.products.items.forEach((product,index)=>{
  if(!product.visible)return;
  const missing:string[]=[];
  if(!filled(product.title))missing.push('商品标题');
  if(!filled(product.image))missing.push('商品图片');
  if(!Number.isInteger(product.points)||product.points<=0||product.points>99999999)missing.push('有效积分（1–99999999 的整数）');
  if(missing.length)issues.push({section:'products',label:`积分商品 · 第 ${index+1} 个${product.title?'（'+product.title+'）':''}`,message:`缺少${missing.join('、')}。请补齐，或关闭该商品的“展示商品”开关；也可关闭整个积分商品区域。`});
 });
 if(!config.hero.visible&&!config.banner.visible&&!config.entries.visible&&(!config.products.visible||!config.products.items.some(p=>p.visible)))issues.push({section:'hero',label:'页面内容',message:'目前没有可展示的内容。请至少开启并完善一个区域后再发布。'});
 return issues;
}
