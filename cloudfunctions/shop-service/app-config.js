/**
 * TOPUYI 商城云函数配置（独立云环境）。
 * 企业微信 Webhook Key 建议写在云函数环境变量 WECOM_ORDER_WEBHOOK_KEY，勿提交到公开仓库。
 */
module.exports = {
  TOPUYI_APP_ID: 'wx3610c3ef05d1131e',
  CLOUD_ENV_ID: 'cloud1-d4grfezxdaca540d6',
  /**
   * 支付测试：true 时把 TEST_PAY_SKU 同步为 0.01 元；测完改 false 并重新部署可恢复原价
   */
  TEST_PAY_ENABLED: true,
  TEST_PAY_SKU: 'stick-01',
  TEST_PAY_PRICE_FEN: 1,
  TEST_PAY_NORMAL_PRICE_FEN: 1290,
  /**
   * 微信支付商户号（10 位数字），APIv3 直连 JSAPI 下单使用。
   * 建议写在云函数环境变量 WX_PAY_MCH_ID，勿把真实商户号提交到公开仓库。
   */
  WX_PAY_MCH_ID: '1747313210',
  /** @deprecated 兼容旧变量名，请改用 WX_PAY_MCH_ID */
  WX_PAY_SUB_MCH_ID: '1747313210',
  /**
   * 未配置 PAY_NOTIFY_URL 时，下单传给微信的占位回调地址。
   * 订单状态改由小程序 syncPayment 主动查单更新；后续配好 HTTP 访问后填真实 URL 即可。
   */
  PAY_NOTIFY_URL_PLACEHOLDER: 'https://www.topuyi.com/pay-notify',
  /** 留空则从环境变量读取；两者都空则跳过推送 */
  WECOM_ORDER_WEBHOOK_KEY: ''
};