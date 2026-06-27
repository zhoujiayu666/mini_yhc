# 新订单推送到企业微信

运营在**企业微信群**里收到「待发货」提醒，无需单独做管理后台。代码已放在 `cloudfunctions/shop-service/notify-wecom.js`，等 `shop-service` / `pay-notify` 上线后接入即可。

---

## 1. 企业微信侧配置（约 5 分钟）

1. 电脑打开 **企业微信**，进入用于收订单的群（如「TOPUYI 发货群」）
2. 群设置 → **群机器人** → **添加机器人**
3. 名称填：`TOPUYI订单`，复制 **Webhook 地址**  
   形如：`https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx`
4. 只保存 **`key=` 后面那一串**（不要整段 URL 提交到 Git）

---

## 2. 云函数环境变量（推荐）

不要把 Key 写进小程序代码或公开仓库。

1. 微信开发者工具 → **云开发** → **云函数**
2. 选中 **`shop-service`**（以及若有 **`pay-notify`** 也配一份）
3. **配置** → **环境变量** → 新增：

| 变量名 | 值 |
|--------|-----|
| `WECOM_ORDER_WEBHOOK_KEY` | 上一步复制的 key |

保存后**重新部署**该云函数。

本地调试也可在 `cloudfunctions/shop-service/app-config.js` 临时填写 `WECOM_ORDER_WEBHOOK_KEY`（勿提交）。

---

## 3. 何时推送（推荐策略）

| 时机 | 是否推送 | 说明 |
|------|----------|------|
| 用户 **支付成功** → `paid` | **是** | 运营只需处理已付款单，推荐 |
| 仅 **创建订单** `pending_pay` | 否 | 未付款单多，易刷屏 |
| 用户 **取消** | 否 | 一般不需要 |
| **发货** `shipped` | 可选 | 给买家客服群用，运营群通常不需要 |

**接入位置**（商城云函数写好后在对应位置加一行）：

```javascript
const { notifyPaidOrder } = require('./notify-wecom');

// pay-notify 验签成功、订单更新为 paid 之后：
await notifyPaidOrder(orderDoc);
// 推送失败不应阻断支付回调，仅打日志即可
```

---

## 4. 群消息示例

```markdown
## 新订单 · 待发货
> **订单号** 20260610143022001
> **实付** ¥25.80
> **支付时间** 2026/6/10 14:30:22

**商品**
- TOPUYI 经典荧光棒 ×2  ¥25.80

**收货信息**
张三 13800138000
广东省深圳市南山区xx路xx号

请在云开发控制台 orders 集合发货，或打开管理后台处理。
```

---

## 5. 测试

在云函数 **云端测试** 中临时执行（需先部署并配置 Key）：

```json
{
  "action": "testWecomNotify",
  "order": {
    "orderNo": "TEST001",
    "payAmount": 1290,
    "paidAt": 1718000000000,
    "items": [{ "name": "测试荧光棒", "qty": 1, "unitPrice": 1290, "lineAmount": 1290 }],
    "addressSnapshot": {
      "name": "测试",
      "phone": "13800138000",
      "province": "广东省",
      "city": "深圳市",
      "district": "南山区",
      "detail": "测试地址"
    }
  }
}
```

或在 `shop-service/index.js` 实现 `testWecomNotify` action 调用 `notifyPaidOrder(event.order)`。

群里收到测试消息后，删除测试单即可。

---

## 6. 常见问题

| 现象 | 处理 |
|------|------|
| 没收到消息 | 检查环境变量 Key、云函数是否重新部署、机器人是否被移出群 |
| `errcode 93000` | Key 无效，重新添加机器人复制新 Key |
| 支付成功但没推送 | 看云函数日志 `[wecom]`；推送失败不影响订单状态 |
| 想用飞书 | 同样用群机器人 Webhook，另写 `notify-feishu.js` 即可 |

---

## 7. 开发工作量

| 项 | 谁做 | 工作量 |
|----|------|--------|
| 企业微信建群 + 机器人 | 运营 | 5 分钟 |
| 环境变量配置 | 运营/开发 | 5 分钟 |
| `notify-wecom.js` | **已完成** | — |
| 在 `pay-notify` 里调用 | 开发商城时顺带 | 约 10 行 |
| 单独管理后台 | **不需要** | — |
