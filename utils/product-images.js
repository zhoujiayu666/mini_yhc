/**
 * 将 cloud:// fileID 转为可展示的 https 临时链接
 */
function resolveImageUrl(url) {
  const src = String(url || '').trim();
  if (!src) return Promise.resolve('');
  if (!src.startsWith('cloud://')) return Promise.resolve(src);
  if (!wx.cloud || !wx.cloud.getTempFileURL) return Promise.resolve(src);
  return wx.cloud
    .getTempFileURL({ fileList: [src] })
    .then((res) => {
      const item = (res.fileList && res.fileList[0]) || {};
      return item.tempFileURL || item.download_url || src;
    })
    .catch(() => src);
}

async function resolveImageUrls(urls) {
  const list = (Array.isArray(urls) ? urls : [urls])
    .map((u) => String(u || '').trim())
    .filter(Boolean);
  if (!list.length) return [];

  const cloudIds = list.filter((u) => u.startsWith('cloud://'));
  const direct = list.filter((u) => !u.startsWith('cloud://'));
  if (!cloudIds.length || !wx.cloud || !wx.cloud.getTempFileURL) {
    return list;
  }

  try {
    const res = await wx.cloud.getTempFileURL({ fileList: cloudIds });
    const map = {};
    (res.fileList || []).forEach((item) => {
      if (item.fileID) {
        map[item.fileID] = item.tempFileURL || item.download_url || item.fileID;
      }
    });
    return list.map((u) => map[u] || u);
  } catch (e) {
    console.warn('[product-images] getTempFileURL failed', e);
    return list;
  }
}

/** 为周边列表补充 listImage */
async function enrichProductsForList(products) {
  if (!Array.isArray(products) || !products.length) return products;
  return Promise.all(
    products.map(async (p) => {
      const raw = p.coverImage || (p.images && p.images[0]) || '';
      const listImage = await resolveImageUrl(raw);
      return { ...p, listImage };
    })
  );
}

/** 详情页多图 */
async function enrichProductDetail(product) {
  if (!product) return product;
  const imageUrls = await resolveImageUrls(product.images || []);
  return {
    ...product,
    images: imageUrls,
    coverImage: imageUrls[0] || ''
  };
}

module.exports = {
  resolveImageUrl,
  resolveImageUrls,
  enrichProductsForList,
  enrichProductDetail
};
