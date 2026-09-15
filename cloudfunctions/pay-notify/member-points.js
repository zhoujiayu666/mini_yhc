// Shared by user-service, shop-service and pay-notify. Server-side only.
const { createHash } = require('crypto');
const ACCOUNTS = 'topuyi_member_accounts_v1';
const LEDGER = 'topuyi_member_points_ledger_v1';
const POLICY_VERSION = 1;
const id = (...parts) => createHash('sha256').update(JSON.stringify(parts)).digest('hex');
const accountId = (appId, openid) => id('member', appId, openid);
async function withTransaction(db, work) {
  // Explicit commit/rollback: older wx-server-sdk providers discard runTransaction's return value.
  for (let attempt = 0; attempt < 4; attempt++) {
    const tx = await db.startTransaction();
    try {
      const result = await work(tx);
      await tx.commit();
      return result;
    } catch (error) {
      await tx.rollback().catch(() => {});
      if (attempt < 3 && /transaction.?conflict|DATABASE_TRANSACTION_CONFLICT/i.test(String(error.code || '') + String(error.message || error.errMsg || ''))) continue;
      throw error;
    }
  }
}
function check(ok, message) { if (!ok) throw new Error(message); }
function fen(value, label) {
  check(Number.isSafeInteger(value) && value >= 0, `invalid ${label}`);
  return value;
}
async function read(ref) {
  try {
    const result = await ref.get();
    return Array.isArray(result.data) ? result.data[0] || null : result.data || null;
  } catch (error) {
    if (/document with _id .+ does not exist/.test(String(error.errMsg || error.message || error))) return null;
    throw error;
  }
}
function newAccount(appId, openid, now) {
  check(appId && openid, 'missing member identity');
  return { sourceAppId: appId, openid, isMember: true, joinedAt: now, balance: 0,
    earned: 0, reversed: 0, createdAt: now, updatedAt: now };
}
async function accountInTransaction(tx, appId, openid, now) {
  const ref = tx.collection(ACCOUNTS).doc(accountId(appId, openid));
  const existing = await read(ref);
  const account = existing || newAccount(appId, openid, now);
  check(account.sourceAppId === appId && account.openid === openid, 'member identity mismatch');
  check(Number.isSafeInteger(account.balance), 'invalid points balance');
  return { ref, account, exists: !!existing };
}
async function ensureMember(db, appId, openid) {
  return withTransaction(db, async tx => {
    const { ref, account, exists } = await accountInTransaction(tx, appId, openid, Date.now());
    if (!exists) await ref.set({ data: account });
    return { isMember: true, memberSince: account.joinedAt, points: account.balance };
  });
}
function validatePayment(order, payment) {
  check(order && order.openid && order.sourceAppId, 'order not found');
  check(payment.appId === order.sourceAppId && payment.openid === order.openid, 'payment identity mismatch');
  check(payment.outTradeNo === order.orderNo && payment.transactionId, 'payment order mismatch');
  check(!order.transactionId || order.transactionId === payment.transactionId, 'transaction mismatch');
  check(payment.currency === 'CNY', 'payment currency mismatch');
  check(fen(payment.totalFen, 'total') === order.payAmount && order.payAmount > 0, 'amount mismatch');
  check(fen(payment.payerTotalFen, 'payer total') <= payment.totalFen, 'payer amount mismatch');
}
async function applyPaidInTransaction(tx, order, payment, now) {
  validatePayment(order, payment);
  const alreadyPaid = ['paid', 'shipped', 'completed'].includes(order.status);
  check(alreadyPaid || order.status === 'pending_pay', 'invalid order status');
  const patch = alreadyPaid ? {} : { status: 'paid', transactionId: payment.transactionId,
    paidAt: now, updatedAt: now };
  if (order.pointsPolicyVersion !== POLICY_VERSION) return { patch, alreadyPaid };
  const payRef = tx.collection(LEDGER).doc(id('payment', order._id));
  const entry = await read(payRef);
  if (entry) {
    check(entry.transactionId === payment.transactionId && entry.payerTotalFen === payment.payerTotalFen,
      'recorded payment mismatch');
    return { patch, alreadyPaid };
  }
  const earned = Math.floor(payment.payerTotalFen / 100);
  const { ref, account } = await accountInTransaction(tx, order.sourceAppId, order.openid, now);
  const balance = account.balance + earned;
  check(Number.isSafeInteger(balance), 'points overflow');
  const { _id, ...accountData } = account;
  await ref.set({ data: { ...accountData, balance, earned: account.earned + earned, updatedAt: now } });
  await payRef.set({ data: { sourceAppId: order.sourceAppId, openid: order.openid,
    accountId: accountId(order.sourceAppId, order.openid), orderId: order._id, orderNo: order.orderNo,
    type: 'purchase', delta: earned, balanceAfter: balance, transactionId: payment.transactionId,
    payerTotalFen: payment.payerTotalFen, totalFen: payment.totalFen, createdAt: now } });
  Object.assign(patch, { pointsEarned: earned, pointsReversed: 0, pointsPaidFen: payment.payerTotalFen,
    pointsRefundedFen: 0, refundTotalFen: 0, pointsRecordedAt: now, updatedAt: now });
  return { patch, alreadyPaid };
}
async function markOrderPaid(db, doc, payment) {
  check(doc && doc._id, 'invalid order');
  return withTransaction(db, async tx => {
    const ref = tx.collection('orders').doc(doc._id);
    const order = await read(ref);
    const { patch, alreadyPaid } = await applyPaidInTransaction(tx, order, payment, Date.now());
    if (Object.keys(patch).length) await ref.update({ data: patch });
    return { ok: true, alreadyPaid };
  });
}
async function markOrderRefunded(db, doc, refund) {
  check(doc && doc._id, 'invalid order');
  return withTransaction(db, async tx => {
    const orderRef = tx.collection('orders').doc(doc._id);
    const original = await read(orderRef);
    check(original && original.orderNo === refund.outTradeNo, 'refund order mismatch');
    check(original.sourceAppId === refund.appId && refund.transactionId, 'refund identity mismatch');
    check(refund.refundId && refund.outRefundNo && refund.status === 'SUCCESS', 'refund not successful');
    check(refund.currency === 'CNY', 'refund currency mismatch');
    check(fen(refund.totalFen, 'total') === original.payAmount, 'refund total mismatch');
    check(fen(refund.payerTotalFen, 'payer total') <= original.payAmount, 'refund payer total mismatch');
    check(fen(refund.refundFen, 'refund') > 0 && refund.refundFen <= refund.totalFen, 'refund amount mismatch');
    check(fen(refund.payerRefundFen, 'cash refund') <= refund.refundFen, 'refund cash mismatch');
    const refundRef = tx.collection(LEDGER).doc(id('refund', refund.refundId));
    const entry = await read(refundRef);
    if (entry) {
      check(entry.orderId === doc._id && entry.refundFen === refund.refundFen &&
        entry.payerRefundFen === refund.payerRefundFen && entry.outRefundNo === refund.outRefundNo,
      'recorded refund mismatch');
      return { ok: true, alreadyRefunded: true };
    }
    const now = Date.now();
    // A verified successful refund also proves payment. Record both atomically when notifications arrive out of order.
    const paid = await applyPaidInTransaction(tx, original, {
      appId: refund.appId, openid: original.openid, outTradeNo: refund.outTradeNo,
      transactionId: refund.transactionId, currency: 'CNY', totalFen: refund.totalFen,
      payerTotalFen: refund.payerTotalFen
    }, now);
    const order = { ...original, ...paid.patch };
    const refundTotalFen = (order.refundTotalFen || 0) + refund.refundFen;
    check(refundTotalFen <= order.payAmount, 'refund exceeds order');
    const eligible = order.pointsPolicyVersion === POLICY_VERSION;
    const refundedFen = (order.pointsRefundedFen || 0) + refund.payerRefundFen;
    check(refundedFen <= refund.payerTotalFen, 'refund exceeds actual payment');
    let reversed = 0, balanceAfter = 0, totalReversed = 0;
    if (eligible) {
      check(order.pointsPaidFen === refund.payerTotalFen, 'refund payment mismatch');
      totalReversed = order.pointsEarned - Math.floor((order.pointsPaidFen - refundedFen) / 100);
      reversed = totalReversed - order.pointsReversed;
      check(reversed >= 0, 'invalid points reversal');
      const { ref, account } = await accountInTransaction(tx, order.sourceAppId, order.openid, now);
      balanceAfter = account.balance - reversed;
      const { _id, ...accountData } = account;
      await ref.set({ data: { ...accountData, balance: balanceAfter,
        reversed: account.reversed + reversed, updatedAt: now } });
    }
    await refundRef.set({ data: { sourceAppId: order.sourceAppId, openid: order.openid,
      accountId: accountId(order.sourceAppId, order.openid), orderId: order._id, orderNo: order.orderNo,
      type: 'refund', delta: -reversed, balanceAfter, refundId: refund.refundId,
      outRefundNo: refund.outRefundNo, transactionId: refund.transactionId,
      refundFen: refund.refundFen, payerRefundFen: refund.payerRefundFen, pointsEligible: eligible, createdAt: now } });
    await orderRef.update({ data: { ...paid.patch, refundTotalFen, pointsRefundedFen: refundedFen,
      pointsReversed: totalReversed, refundStatus: refundTotalFen === order.payAmount ? 'full' : 'partial',
      lastRefundAt: now, updatedAt: now } });
    return { ok: true, reversed };
  });
}
module.exports = { ACCOUNTS, LEDGER, POLICY_VERSION, accountId, ensureMember, markOrderPaid, markOrderRefunded };
