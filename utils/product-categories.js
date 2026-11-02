module.exports=function categoryNames(config,products){
 const used=[...new Set(products.flatMap(p=>Array.isArray(p.categories)&&p.categories.length?p.categories:[p.category].filter(Boolean)))];
 const ordered=(config.categories||[]).map(c=>c.name).filter(n=>used.includes(n));
 return ['全部商品',...[...new Set([...ordered,...used])].filter(n=>n!=='全部商品')];
};
