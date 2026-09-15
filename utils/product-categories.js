// Use the published category order; older storefront snapshots keep their existing order.
module.exports=function categoryNames(config,products){const used=[...new Set(products.map(p=>p.category))],ordered=(config.categories||[]).map(c=>c.name).filter(n=>used.includes(n));return ['全部商品',...[...new Set([...ordered,...used])].filter(n=>n!=='全部商品')];};
