const cloud = require('wx-server-sdk');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();
const _ = db.command;
const { withScope, docInScope } = require('./app-scope');
const {
  TEST_PAY_ENABLED,
  TEST_PAY_SKU,
  TEST_PAY_PRICE_FEN,
  TEST_PAY_NORMAL_PRICE_FEN
} = require('./app-config');
const { SEED_PRODUCTS } = require('./seed-products');
const { notifyPaidOrder } = require('./notify-wecom');
const { createJsapiOrder, queryOrderByOutTradeNo } = require('./pay-wx-v3');
const { markOrderPaid } = require('./order-paid');

function resolveCaller(wxContext) {
  const openid = wxContext.OPENID;
  const appId = wxContext.APPID;
  if (!openid) {
    return { error: '无法获取用户身份' };
  }
  if (!appId) {
    return { error: '无法识别小程序身份' };
  }
  return { openid, appId };
}

function fenToYuan(fen) {
  const n = Number(fen);
  if (!Number.isFinite(n)) return 0;
  return Math.round(n) / 100;
}

function formatProduct(doc) {
  if (!doc) return null;
  return {
    id: doc.sku,
    productId: doc._id,
    sku: doc.sku,
    name: doc.name,
    desc: doc.desc || '',
    category: doc.category || 'stick',
    color: doc.color || '#39FF14',
    tag: doc.tag || '',
    price: fenToYuan(doc.price),
    priceFen: doc.price,
    stock: doc.stock,
    status: doc.status
  };
}

function formatAddress(doc) {
  if (!doc) return null;
  return {
    id: doc._id,
    name: doc.name,
    phone: doc.phone,
    province: doc.province,
    city: doc.city,
    district: doc.district,
    detail: doc.detail,
    isDefault: !!doc.isDefault,
    fullText: [doc.province, doc.city, doc.district, doc.detail].filter(Boolean).join('')
  };
}

function formatOrder(doc) {
  if (!doc) return null;
  return {
    id: doc._id,
    orderNo: doc.orderNo,
    status: doc.status,
    items: doc.items || [],
    totalAmount: doc.totalAmount,
    freightAmount: doc.freightAmount || 0,
    payAmount: doc.payAmount,
    totalYuan: fenToYuan(doc.totalAmount),
    payYuan: fenToYuan(doc.payAmount),
    addressSnapshot: doc.addressSnapshot,
    remark: doc.remark || '',
    trackingNo: doc.trackingNo || '',
    expressCompany: doc.expressCompany || '',
    createdAt: doc.createdAt,
    paidAt: doc.paidAt || 0,
    shippedAt: doc.shippedAt || 0,
    completedAt: doc.completedAt || 0,
    cancelledAt: doc.cancelledAt || 0
  };
}

function genOrderNo() {
  const d = new Date();
  const pad = (n, len = 2) => String(n).padStart(len, '0');
  const ts = `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
  const rand = String(Math.floor(Math.random() * 1000)).padStart(3, '0');
  return ts + rand;
}

function isValidPhone(phone) {
  return /^1\d{10}$/.test(String(phone || '').replace(/\s/g, ''));
}

function normalizeItemsInput(items) {
  if (!Array.isArray(items) || !items.length) {
    return { error: '请选择商品' };
  }
  const normalized = [];
  for (const it of items) {
    const sku = String(it.sku || it.id || '').trim();
    const qty = Math.max(1, Math.min(99, Math.round(Number(it.qty) || 1)));
    if (!sku) {
      return { error: '商品信息无效' };
    }
    normalized.push({ sku, qty });
  }
  return { items: normalized };
}

async function loadProductsBySkus(appId, skus) {
  const unique = [...new Set(skus)];
  const res = await db
    .collection('products')
    .where(
      withScope(appId, {
        sku: _.in(unique),
        status: 'on_sale'
      })
    )
    .get();
  const map = {};
  (res.data || []).forEach((doc) => {
    if (docInScope(doc, appId)) {
      map[doc.sku] = doc;
    }
  });
  return map;
}

function buildOrderLines(items, productMap) {
  const lines = [];
  let totalAmount = 0;
  for (const it of items) {
    const product = productMap[it.sku];
    if (!product) {
      return { error: `商品 ${it.sku} 不存在或已下架` };
    }
    if ((product.stock || 0) < it.qty) {
      return { error: `${product.name} 库存不足` };
    }
    const unitPrice = product.price;
    const lineAmount = unitPrice * it.qty;
    totalAmount += lineAmount;
    lines.push({
      productId: product._id,
      sku: product.sku,
      name: product.name,
      category: product.category,
      color: product.color,
      qty: it.qty,
      unitPrice,
      lineAmount
    });
  }
  return { lines, totalAmount };
}

async function ensureSeedProducts(appId) {
  const countRes = await db.collection('products').where(scopeFilterOnly(appId)).count();
  if (countRes.total > 0) {
    return { seeded: false, count: countRes.total };
  }
  const now = Date.now();
  for (const p of SEED_PRODUCTS) {
    await db.collection('products').add({
      data: {
        ...p,
        sourceAppId: appId,
        status: 'on_sale',
        createdAt: now,
        updatedAt: now
      }
    });
  }
  return { seeded: true, count: SEED_PRODUCTS.length };
}

function scopeFilterOnly(appId) {
  return { sourceAppId: appId };
}

async function seedProducts(appId, force) {
  if (force) {
    const existing = await db.collection('products').where(scopeFilterOnly(appId)).get();
    for (const doc of existing.data || []) {
      await db.collection('products').doc(doc._id).remove();
    }
  }
  return ensureSeedProducts(appId);
}

async function applyTestPayPrice(appId) {
  if (!TEST_PAY_SKU) {
    return;
  }
  const price = TEST_PAY_ENABLED ? TEST_PAY_PRICE_FEN : TEST_PAY_NORMAL_PRICE_FEN;
  if (!Number.isFinite(price) || price < 1) {
    return;
  }
  try {
    await db
      .collection('products')
      .where(withScope(appId, { sku: TEST_PAY_SKU }))
      .update({
        data: {
          price,
          updatedAt: Date.now()
        }
      });
  } catch (err) {
    console.warn('[shop-service] applyTestPayPrice', err);
  }
}

async function listProducts(appId, event) {
  const category = event.category;
  const autoSeed = event.autoSeed !== false;
  if (autoSeed) {
    await ensureSeedProducts(appId);
  }
  await applyTestPayPrice(appId);
  let query = withScope(appId, { status: 'on_sale' });
  if (category && category !== 'all') {
    query = withScope(appId, { status: 'on_sale', category });
  }
  const res = await db.collection('products').where(query).get();
  const products = (res.data || [])
    .sort((a, b) => (b.sort || 0) - (a.sort || 0))
    .map(formatProduct);
  return { success: true, products };
}

async function getProduct(appId, event) {
  const sku = String(event.sku || event.id || '').trim();
  if (!sku) {
    return { success: false, message: '缺少商品编号' };
  }
  const res = await db
    .collection('products')
    .where(withScope(appId, { sku, status: 'on_sale' }))
    .limit(1)
    .get();
  if (!res.data || !res.data.length) {
    return { success: false, message: '商品不存在或已下架' };
  }
  return { success: true, product: formatProduct(res.data[0]) };
}

async function listAddresses(openid, appId) {
  const res = await db
    .collection('addresses')
    .where(withScope(appId, { openid }))
    .get();
  const addresses = (res.data || [])
    .sort((a, b) => {
      if (!!b.isDefault !== !!a.isDefault) return b.isDefault ? 1 : -1;
      return (b.updatedAt || 0) - (a.updatedAt || 0);
    })
    .map(formatAddress);
  return { success: true, addresses };
}

async function saveAddress(openid, appId, event) {
  const payload = event.address || event;
  const name = String(payload.name || '').trim();
  const phone = String(payload.phone || '').replace(/\s/g, '');
  const province = String(payload.province || '').trim();
  const city = String(payload.city || '').trim();
  const district = String(payload.district || '').trim();
  const detail = String(payload.detail || '').trim();
  const isDefault = !!payload.isDefault;
  const addressId = payload.id || payload._id || event.addressId;

  if (!name || !isValidPhone(phone) || !detail) {
    return { success: false, message: '请填写完整的收货信息' };
  }

  const now = Date.now();
  const data = {
    openid,
    sourceAppId: appId,
    name,
    phone,
    province,
    city,
    district,
    detail,
    isDefault,
    updatedAt: now
  };

  if (isDefault) {
    await db
      .collection('addresses')
      .where(withScope(appId, { openid }))
      .update({ data: { isDefault: false, updatedAt: now } });
  }

  if (addressId) {
    const docRes = await db.collection('addresses').doc(addressId).get();
    const doc = docRes.data;
    if (!doc || doc.openid !== openid || !docInScope(doc, appId)) {
      return { success: false, message: '地址不存在' };
    }
    await db.collection('addresses').doc(addressId).update({ data });
    return { success: true, addressId, address: formatAddress({ ...doc, ...data, _id: addressId }) };
  }

  data.createdAt = now;
  if (!payload.skipDefaultCheck) {
    const countRes = await db.collection('addresses').where(withScope(appId, { openid })).count();
    if (countRes.total === 0) {
      data.isDefault = true;
    }
  }
  const addRes = await db.collection('addresses').add({ data });
  return {
    success: true,
    addressId: addRes._id,
    address: formatAddress({ ...data, _id: addRes._id })
  };
}

async function deleteAddress(openid, appId, event) {
  const addressId = event.addressId || event.id;
  if (!addressId) {
    return { success: false, message: '缺少地址 ID' };
  }
  const docRes = await db.collection('addresses').doc(addressId).get();
  const doc = docRes.data;
  if (!doc || doc.openid !== openid || !docInScope(doc, appId)) {
    return { success: false, message: '地址不存在' };
  }
  await db.collection('addresses').doc(addressId).remove();
  return { success: true };
}

async function getAddressForOrder(openid, appId, addressId) {
  const docRes = await db.collection('addresses').doc(addressId).get();
  const doc = docRes.data;
  if (!doc || doc.openid !== openid || !docInScope(doc, appId)) {
    return { error: '请选择收货地址' };
  }
  return {
    addressSnapshot: {
      addressId: doc._id,
      name: doc.name,
      phone: doc.phone,
      province: doc.province,
      city: doc.city,
      district: doc.district,
      detail: doc.detail
    }
  };
}

async function previewOrder(openid, appId, event) {
  const parsed = normalizeItemsInput(event.items);
  if (parsed.error) {
    return { success: false, message: parsed.error };
  }
  const productMap = await loadProductsBySkus(
    appId,
    parsed.items.map((i) => i.sku)
  );
  const built = buildOrderLines(parsed.items, productMap);
  if (built.error) {
    return { success: false, message: built.error };
  }
  const freightAmount = 0;
  const payAmount = built.totalAmount + freightAmount;
  return {
    success: true,
    items: built.lines,
    totalAmount: built.totalAmount,
    freightAmount,
    payAmount,
    totalYuan: fenToYuan(built.totalAmount),
    payYuan: fenToYuan(payAmount)
  };
}

async function createOrder(openid, appId, event) {
  const parsed = normalizeItemsInput(event.items);
  if (parsed.error) {
    return { success: false, message: parsed.error };
  }
  const addressId = event.addressId;
  if (!addressId) {
    return { success: false, message: '请选择收货地址' };
  }
  const addr = await getAddressForOrder(openid, appId, addressId);
  if (addr.error) {
    return { success: false, message: addr.error };
  }

  const productMap = await loadProductsBySkus(
    appId,
    parsed.items.map((i) => i.sku)
  );
  const built = buildOrderLines(parsed.items, productMap);
  if (built.error) {
    return { success: false, message: built.error };
  }

  for (const line of built.lines) {
    const product = productMap[line.sku];
    const updated = await db
      .collection('products')
      .where(
        withScope(appId, {
          _id: product._id,
          stock: _.gte(line.qty)
        })
      )
      .update({
        data: {
          stock: _.inc(-line.qty),
          updatedAt: Date.now()
        }
      });
    if (!updated.stats || updated.stats.updated === 0) {
      return { success: false, message: `${line.name} 库存不足，请重试` };
    }
  }

  const freightAmount = 0;
  const payAmount = built.totalAmount + freightAmount;
  const now = Date.now();
  const orderNo = genOrderNo();
  const orderDoc = {
    orderNo,
    sourceAppId: appId,
    openid,
    status: 'pending_pay',
    items: built.lines,
    totalAmount: built.totalAmount,
    freightAmount,
    payAmount,
    addressSnapshot: addr.addressSnapshot,
    remark: String(event.remark || '').slice(0, 200),
    payChannel: 'wxpay',
    transactionId: '',
    paidAt: 0,
    shippedAt: 0,
    completedAt: 0,
    cancelledAt: 0,
    cancelReason: '',
    trackingNo: '',
    expressCompany: '',
    createdAt: now,
    updatedAt: now
  };

  const addRes = await db.collection('orders').add({ data: orderDoc });
  return {
    success: true,
    orderId: addRes._id,
    orderNo,
    order: formatOrder({ ...orderDoc, _id: addRes._id }),
    paymentReady: true
  };
}

async function listOrders(openid, appId, event) {
  const status = event.status;
  let query = withScope(appId, { openid });
  if (status && status !== 'all') {
    query = withScope(appId, { openid, status });
  }
  const res = await db
    .collection('orders')
    .where(query)
    .limit(50)
    .get();
  const orders = (res.data || [])
    .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))
    .map(formatOrder);
  return { success: true, orders };
}

async function loadOrderDoc(openid, appId, orderId) {
  if (!orderId) {
    return { error: '缺少订单 ID' };
  }
  const res = await db.collection('orders').doc(orderId).get();
  const doc = res.data;
  if (!doc || doc.openid !== openid || !docInScope(doc, appId)) {
    return { error: '订单不存在' };
  }
  return { doc };
}

async function createPayment(openid, appId, event) {
  const orderId = event.orderId;
  const loaded = await loadOrderDoc(openid, appId, orderId);
  if (loaded.error) {
    return { success: false, message: loaded.error };
  }
  const doc = loaded.doc;

  if (doc.status !== 'pending_pay') {
    return { success: false, message: '订单状态不可支付' };
  }

  const payAmount = Math.round(Number(doc.payAmount));
  if (!Number.isFinite(payAmount) || payAmount < 1) {
    return { success: false, message: '订单金额无效' };
  }

  const names = (doc.items || []).map((it) => it.name).filter(Boolean);
  const description = (`TOPUYI-${names.join('、')}` || 'TOPUYI周边商品').slice(0, 127);

  try {
    const { payment } = await createJsapiOrder({
      openid,
      outTradeNo: doc.orderNo,
      description,
      totalFen: payAmount
    });

    return {
      success: true,
      payment,
      orderNo: doc.orderNo,
      payAmount
    };
  } catch (err) {
    console.error('[shop-service] createPayment', err);
    const msg = (err && err.message) || String(err);
    if (err && err.code === 'PAY_CONFIG_MISSING') {
      return {
        success: false,
        message: msg
      };
    }
    return { success: false, message: msg };
  }
}

async function syncPayment(openid, appId, event) {
  const orderId = event.orderId;
  const loaded = await loadOrderDoc(openid, appId, orderId);
  if (loaded.error) {
    return { success: false, message: loaded.error };
  }
  const doc = loaded.doc;

  if (doc.status === 'paid' || doc.status === 'shipped' || doc.status === 'completed') {
    return { success: true, synced: false, order: formatOrder(doc) };
  }

  if (doc.status !== 'pending_pay') {
    return { success: false, message: '订单状态不可同步' };
  }

  try {
    const wxOrder = await queryOrderByOutTradeNo(doc.orderNo);
    const tradeState = wxOrder.trade_state || '';
    if (tradeState !== 'SUCCESS') {
      return {
        success: true,
        synced: false,
        tradeState: tradeState || 'UNKNOWN',
        order: formatOrder(doc)
      };
    }

    const transactionId = wxOrder.transaction_id || '';
    const totalFen = wxOrder.amount && wxOrder.amount.total;
    const marked = await markOrderPaid(db, doc, { transactionId, totalFen });
    if (!marked.ok) {
      return { success: false, message: marked.error || '同步失败' };
    }

    const updated = await db.collection('orders').doc(doc._id).get();
    return {
      success: true,
      synced: !marked.alreadyPaid,
      order: formatOrder(updated.data)
    };
  } catch (err) {
    console.error('[shop-service] syncPayment', err);
    const msg = (err && err.message) || String(err);
    if (err && err.code === 'PAY_CONFIG_MISSING') {
      return { success: false, message: msg };
    }
    return { success: false, message: msg };
  }
}

async function getOrder(openid, appId, event) {
  const orderId = event.orderId;
  const orderNo = event.orderNo;
  if (!orderId && !orderNo) {
    return { success: false, message: '缺少订单号' };
  }
  let doc;
  if (orderId) {
    const res = await db.collection('orders').doc(orderId).get();
    doc = res.data;
  } else {
    const res = await db
      .collection('orders')
      .where(withScope(appId, { openid, orderNo }))
      .limit(1)
      .get();
    doc = res.data && res.data[0];
  }
  if (!doc || doc.openid !== openid || !docInScope(doc, appId)) {
    return { success: false, message: '订单不存在' };
  }
  return { success: true, order: formatOrder(doc) };
}

async function cancelOrder(openid, appId, event) {
  const orderId = event.orderId;
  if (!orderId) {
    return { success: false, message: '缺少订单 ID' };
  }
  const res = await db.collection('orders').doc(orderId).get();
  const doc = res.data;
  if (!doc || doc.openid !== openid || !docInScope(doc, appId)) {
    return { success: false, message: '订单不存在' };
  }
  if (doc.status !== 'pending_pay') {
    return { success: false, message: '当前订单不可取消' };
  }

  const now = Date.now();
  await db.collection('orders').doc(orderId).update({
    data: {
      status: 'cancelled',
      cancelledAt: now,
      updatedAt: now,
      cancelReason: '用户取消'
    }
  });

  for (const line of doc.items || []) {
    if (line.productId && line.qty) {
      await db
        .collection('products')
        .doc(line.productId)
        .update({
          data: {
            stock: _.inc(line.qty),
            updatedAt: now
          }
        })
        .catch(() => {});
    }
  }

  return { success: true };
}

async function confirmReceive(openid, appId, event) {
  const orderId = event.orderId;
  if (!orderId) {
    return { success: false, message: '缺少订单 ID' };
  }
  const res = await db.collection('orders').doc(orderId).get();
  const doc = res.data;
  if (!doc || doc.openid !== openid || !docInScope(doc, appId)) {
    return { success: false, message: '订单不存在' };
  }
  if (doc.status !== 'shipped') {
    return { success: false, message: '订单状态不可确认收货' };
  }
  const now = Date.now();
  await db.collection('orders').doc(orderId).update({
    data: {
      status: 'completed',
      completedAt: now,
      updatedAt: now
    }
  });
  return { success: true };
}

exports.main = async (event) => {
  try {
    const wxContext = cloud.getWXContext();
    const caller = resolveCaller(wxContext);
    if (caller.error) {
      return { success: false, message: caller.error };
    }
    const { openid, appId } = caller;
    const action = event.action || '';

    switch (action) {
      case 'seedProducts':
        return { success: true, ...(await seedProducts(appId, !!event.force)) };
      case 'listProducts':
        return await listProducts(appId, event);
      case 'getProduct':
        return await getProduct(appId, event);
      case 'listAddresses':
        return await listAddresses(openid, appId);
      case 'saveAddress':
        return await saveAddress(openid, appId, event);
      case 'deleteAddress':
        return await deleteAddress(openid, appId, event);
      case 'previewOrder':
        return await previewOrder(openid, appId, event);
      case 'createOrder':
        return await createOrder(openid, appId, event);
      case 'createPayment':
        return await createPayment(openid, appId, event);
      case 'syncPayment':
        return await syncPayment(openid, appId, event);
      case 'listOrders':
        return await listOrders(openid, appId, event);
      case 'getOrder':
        return await getOrder(openid, appId, event);
      case 'cancelOrder':
        return await cancelOrder(openid, appId, event);
      case 'confirmReceive':
        return await confirmReceive(openid, appId, event);
      case 'testWecomNotify': {
        const order = event.order || {
          orderNo: 'TEST' + Date.now(),
          payAmount: 2580,
          paidAt: Date.now(),
          items: [{ name: '测试商品', qty: 1, lineAmount: 2580 }],
          addressSnapshot: { name: '测试', phone: '13800138000', province: '广东省', city: '深圳市', district: '南山区', detail: '测试地址' }
        };
        const notify = await notifyPaidOrder(order);
        return {
          success: notify.ok,
          skipped: !!notify.skipped,
          message: notify.skipped ? '未配置企业微信 Webhook' : notify.ok ? '已推送' : notify.error,
          notify
        };
      }
      default:
        return { success: false, message: `未知操作: ${action}` };
    }
  } catch (err) {
    console.error('[shop-service]', err);
    const msg = (err && err.message) || '服务异常';
    if (msg.includes('collection not exists') || msg.includes('Db or Table not exist')) {
      return {
        success: false,
        message: '请先在云开发控制台创建 products、orders、addresses 集合（仅管理端可读写）'
      };
    }
    return { success: false, message: msg };
  }
};
