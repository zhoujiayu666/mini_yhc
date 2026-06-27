/**
 * 订单支付成功落库（幂等）
 */
async function markOrderPaid(db, doc, { transactionId = '', totalFen } = {}) {
  if (!doc || !doc._id) {
    return { ok: false, error: 'invalid order' };
  }

  if (doc.status === 'paid' || doc.status === 'shipped' || doc.status === 'completed') {
    return { ok: true, alreadyPaid: true };
  }

  if (doc.status !== 'pending_pay') {
    return { ok: false, error: 'invalid order status' };
  }

  const amount = Math.round(Number(totalFen));
  if (Number.isFinite(amount) && amount > 0 && doc.payAmount !== amount) {
    return { ok: false, error: 'amount mismatch' };
  }

  const now = Date.now();
  await db.collection('orders').doc(doc._id).update({
    data: {
      status: 'paid',
      transactionId: transactionId || doc.transactionId || '',
      paidAt: now,
      updatedAt: now
    }
  });

  return { ok: true };
}

module.exports = {
  markOrderPaid
};
