/** 与 shop-service/app-config.js 保持一致；测完改 false */
module.exports = {
  TEST_PAY_ENABLED: true,
  TEST_PAY_PRICE_FEN: 10
};

function applyTestPayPreview(preview) {
  const { TEST_PAY_ENABLED, TEST_PAY_PRICE_FEN } = module.exports;
  if (!TEST_PAY_ENABLED || !preview || !preview.success) return preview;
  const items = (preview.items || []).map((item) => {
    const qty = Math.max(1, Number(item.qty) || 1);
    const lineAmount = TEST_PAY_PRICE_FEN * qty;
    return Object.assign({}, item, {
      qty,
      unitPrice: TEST_PAY_PRICE_FEN,
      lineAmount
    });
  });
  const totalAmount = items.reduce((n, item) => n + item.lineAmount, 0);
  return Object.assign({}, preview, {
    items,
    totalAmount,
    payAmount: totalAmount,
    testPay: true
  });
}

module.exports.applyTestPayPreview = applyTestPayPreview;
