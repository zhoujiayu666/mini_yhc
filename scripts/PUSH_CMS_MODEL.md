# 一键创建 CMS 商品模型（products）

> 模型定义已写在项目 `database-schemas/products.json`，含枚举、多图、富文本字段。  
> 环境：`cloud1-d4grfezxdaca540d6`

---

## 方式一：一键脚本（已为你创建）

前提：已执行过 `tcb.cmd login` 登录。

```bash
node scripts/create-products-model.js
```

脚本会读取 `database-schemas/products.json`，在云端创建并发布 **products** 模型。

---

## 方式二：全局 tcb 命令（仅更新已有模型）

PowerShell 下 `npx` 常被脚本策略拦截，且 `@cloudbase/cli@2.5` 与新版 npm 不兼容。请先**全局安装**（只需一次）：

```bash
npm install -g @cloudbase/cli --registry=https://mirrors.cloud.tencent.com/npm/
```

安装后**关闭并重新打开**微信开发者工具终端，在项目根目录执行：

```bash
tcb.cmd login
tcb.cmd db model push -n products
```

> PowerShell 请用 `tcb.cmd`；若终端是 CMD，可直接写 `tcb`。

登录时选 **【小程序公众号】**，用管理员微信扫码。环境 ID 已写在项目 `cloudbaserc.json`。

成功后在 **云后台 → CMS 内容管理** 或 **模型管理** 中应看到 **商品 / products**。

---

## 方式二：npx（仅 CMD 终端可用）

```bash
cmd /c "npm install -g @cloudbase/cli --registry=https://mirrors.cloud.tencent.com/npm/"
cmd /c "tcb login"
cmd /c "tcb db model push -n products"
```

---

## 方式三：继续在网页手填（不用 CLI）

若 CLI 推送失败，你当前页面已填好字段时：

1. **权限设置** → 选 **仅管理端可读写**
2. 点 **创建**
3. `category` / `status` 枚举见下表

| 字段 | 枚举值 |
|------|--------|
| category | `stick`、`ball` |
| status | `on_sale`、`off_sale` |

---

## 推送后验证

1. 云后台 → 模型管理 → 应有 **products**  
2. 内容管理 → 商品 → 应能看到已有种子数据（若 `products` 集合非空）  
3. 编辑一条：上传 `images`、填写 `detailContent` → 发布  
4. 手机：周边 → 点商品 → 详情页查看

---

## 首次创建：必须用网页（CLI 无法新建）

若 `tcb db model push` 报错：

```text
数据模型[products]不存在。请在控制台查看对应标识是否存在。
```

说明云端**还没有**该数据模型。微信云开发环境下，**第一次**须在云后台网页创建，CLI 只能**更新**已有模型。

### 网页创建步骤

1. 微信开发者工具 → **云开发** → **云后台**（或 CMS）  
2. **数据模型** → **新建模型**（或 **从已有集合导入** → 选 `products`）  
3. 模型标识填 **`products`**，字段按 `database-schemas/products.json` 或 `scripts/SHOP_CMS_SETUP.md`  
4. **权限** → **仅管理端可读写** → **创建**

创建成功后，以后改字段可用：

```bash
tcb.cmd db model push -n products
```

同步本地 JSON 到云端。

---

## 常见问题

**提示集合已存在**  
正常。模型会关联已有 `products` 集合，不会清空数据。

**推送失败：未登录**  
先执行 `tcb login`，选小程序公众号登录。

**npx / PSSecurityException**  
不要用 `npx`，改全局安装后用 `tcb.cmd login`（见方式一）。

**could not determine executable to run**  
`@cloudbase/cli@2.5` 与新版 npm 不兼容，请安装最新版：`npm install -g @cloudbase/cli`。

**模型有了但 CMS 无菜单**  
云后台 → 内置应用 → **CMS 内容管理** → 去使用 → 刷新。
