const { createHash } = require('node:crypto');

// Identity belongs to the content item, not its title or former demo SKU.
function normalizeProducts(input, catalog = []) {
  const config = JSON.parse(JSON.stringify(input));
  const previous = new Map(catalog.map(p => [p.sku, p]));
  for (const block of config.blocks) {
    if (block.type !== 'products') continue;
    for (const item of block.items) {
      const old = previous.get(item.sku);
      item.sku = 'ops-' + createHash('sha256').update(JSON.stringify([block.id, item.id])).digest('hex').slice(0, 32);
      if (!item.title && old) item.title = old.name || '';
      if (item.price === undefined && old) item.price = Number(old.price);
      if (item.originalPrice === undefined && old) item.originalPrice = Number(old.originalPrice || 0);
    }
  }
  return config;
}

function productRecords(config, scope = 'development-only') {
  return config.blocks.filter(b => b.type === 'products').flatMap(block => block.items.map(item => ({
    sku: item.sku,
    name: item.title,
    price: Number.isFinite(item.price) ? Math.round(item.price * 100) / 100 : 0,
    originalPrice: Number.isFinite(item.originalPrice) ? Math.round(item.originalPrice * 100) / 100 : 0,
    category: item.category || '荧光棒',
    color: '',
    image: item.image || '',
    subtitle: item.subtitle || '',
    detailImages: item.detailImages || [],
    detailBlocks: item.detailBlocks || [],
    active: block.visible && !!item.title.trim() && Number.isFinite(item.price) && item.price >= 0.01,
    manageStock: false,
    scope,
    owner: 'ops-content-v1',
    blockId: block.id,
    itemId: item.id
  })));
}

async function writeProducts(tx, collection, config, previousConfig, updatedAt, scope = 'development-only') {
  const records = productRecords(config, scope);
  const current = new Set(records.map(p => p.sku));
  const previous = previousConfig ? productRecords(normalizeProducts(previousConfig), scope) : [];
  for (const p of previous) {
    if (!current.has(p.sku)) await tx.collection(collection).doc(p.sku).set({ ...p, active: false, updatedAt });
  }
  for (const p of records) await tx.collection(collection).doc(p.sku).set({ ...p, updatedAt });
  return records;
}

module.exports = { normalizeProducts, productRecords, writeProducts };
