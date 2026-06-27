# 微信支付 APIv3 直连（云函数方案）

> 实物电商无法使用云开发 `cloudPay.unifiedOrder`，改为 **微信支付 APIv3 JSAPI** + **HTTP 访问服务** 接收回调。  
> 无需自建 `api.topuyi.com` 服务器，全部在云函数内完成。

---

## 架构

```
小程序 createPayment → shop-service（APIv3 下单）→ wx.requestPayment
微信支付成功 → HTTP 访问 pay-notify → 更新 orders 为 paid
```

---

## 第一步 · 商户平台准备凭证

登录 [pay.weixin.qq.com](https://pay.weixin.qq.com)（商户号 `1747313210`）：

### 1. APIv3 密钥

**账户中心 → API 安全 → 设置 APIv3 密钥**（32 位字母数字，仅显示一次，请保存）

### 2. 商户 API 证书

**账户中心 → API 安全 → API 证书 → 下载**

保留：
- `apiclient_key.pem` 全文（商户私钥）
- **证书序列号**（40 位十六进制）

### 3. 微信支付公钥（推荐）

**账户中心 → API 安全 → 微信支付公钥 → 下载**

保留：
- `wxp_pub.pem` 全文
- **公钥 ID**（形如 `PUB_KEY_ID_0114...`）

### 4. 开通订单发货管理

实物商品需在微信商户平台开通 **订单发货管理**（小程序电商要求）。  
发货后需调用微信「上传发货信息」API（后续在管理端对接）。

---

## 第二步 · 配置 HTTP 支付回调（可选，推荐）

> **找不到 HTTP 访问服务？** 可先跳过本步直接测支付。未配 `PAY_NOTIFY_URL` 时，下单会用占位地址，订单状态由小程序 **`syncPayment` 主动查单** 更新（付完款等 1～2 秒刷新即可）。

### 方式 A：腾讯云控制台（微信开发者工具里往往没有入口）

1. 打开 [腾讯云云开发控制台](https://console.cloud.tencent.com/tcb/env/index)
2. 选择环境 **`cloud1-d4grfezxdaca540d6`**
3. 左侧 **HTTP 访问服务** → **添加路由**
   - 关联云函数：`pay-notify`
   - 路径：`/pay-notify`
   - 鉴权：**免鉴权**（微信服务器回调不带 token）
4. 复制完整 URL，填入 `PAY_NOTIFY_URL`

或直接访问（登录后）：  
`https://console.cloud.tencent.com/tcb/env/http-access?envId=cloud1-d4grfezxdaca540d6`

### 方式 B：cloud.weixin.qq.com

[cloud.weixin.qq.com](https://cloud.weixin.qq.com) → 环境 `cloud1-d4grfezxdaca540d6` → 找 **HTTP 访问服务** / **网关**

---

## 第三步 · 云函数环境变量

在 **`shop-service`** 和 **`pay-notify`** 两个云函数中，分别添加相同的环境变量：

| 变量名 | 说明 | 示例 |
|--------|------|------|
| `WX_PAY_MCH_ID` | 商户号 | `1747313210` |
| `WX_PAY_APP_ID` | 小程序 AppID（可省略，默认已填） | `wx3610c3ef05d1131e` |
| `WX_API_V3_KEY` | APIv3 密钥 | 32 位字符串 |
| `WX_MCH_SERIAL_NO` | 商户证书序列号 | `36048761817F...` |
| `WX_MCH_PRIVATE_KEY` | `apiclient_key.pem` 全文 | 可用 `\n` 表示换行 |
| `WX_PLATFORM_PUBLIC_KEY` | `wxp_pub.pem` 全文 | 同上 |
| `WX_PLATFORM_PUBLIC_KEY_ID` | 微信支付公钥 ID | `PUB_KEY_ID_...` |
| `PAY_NOTIFY_URL` | HTTP 访问完整 URL（**可先不填**） | `https://.../pay-notify` |

**私钥 / 公钥写入环境变量示例**（单行，`\n` 代替换行）：

```
-----BEGIN PRIVATE KEY-----\nMIIE...\n-----END PRIVATE KEY-----
```

> 切勿把密钥提交到 Git。`app-config.js` 仅保留商户号等非敏感项。

---

## 第四步 · 部署

微信开发者工具中 **上传并部署：云端安装依赖**：

| 云函数 | 说明 |
|--------|------|
| `shop-service` | `createPayment`（APIv3 下单）、`syncPayment`（主动查单） |
| `pay-notify` | HTTP 支付回调验签解密 |

---

## 第五步 · 真机测试

1. 确认 `shop-service/app-config.js` 中 **`TEST_PAY_ENABLED: true`**（经典荧光棒 ¥0.01）
2. 重新部署 `shop-service`
3. 手机预览 → **周边** → 立即购买 → 提交订单并支付
4. **我的订单** 应变为 **待发货**

测完后：`TEST_PAY_ENABLED` 改为 `false`，再部署 `shop-service`。

---

## 常见问题

| 现象 | 处理 |
|------|------|
| 提示 APIv3 未配置完整 | 检查两个云函数环境变量是否都已填写 |
| 统一下单失败 / 签名错误 | 核对证书序列号、私钥 PEM、APIv3 密钥 |
| 付了款仍待付款 | 看 `pay-notify` 日志；确认 `PAY_NOTIFY_URL` 与 HTTP 访问一致 |
| 回调验签失败 | 检查 `WX_PLATFORM_PUBLIC_KEY` 与公钥 ID 是否匹配 |
| 模拟器无法支付 | 必须真机预览 / 体验版 |

---

## 与旧方案区别

| 项目 | 旧 cloudPay | 新 APIv3 |
|------|-------------|----------|
| 下单 | `cloud.cloudPay.unifiedOrder` | `wechatpay-node-v3` JSAPI |
| 回调 | 云函数直接触发 | HTTP 访问 `pay-notify` |
| 实物电商 | 平台限制不可用 | 可用（需发货管理） |
| 小程序 signType | MD5 | **RSA** |

旧文档 `SHOP_PAY_SETUP.md` 中的云开发授权、服务商 1800008281 步骤 **不再适用** 本方案。
