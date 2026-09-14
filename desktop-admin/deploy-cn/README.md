# 国内运营后台部署

线上地址：https://admin.topuyi.com

构建：在 desktop-admin 目录运行 `node deploy-cn/build.mjs`。
部署产物：`outputs/cloudrun`，包含静态页面、Node HTTP 服务、打包后的 API 和 Dockerfile。
运行：`node outputs/cloudrun/server.mjs`，默认端口 8080。
生产环境设置 `PUBLIC_ORIGIN=https://admin.topuyi.com`，用于同源校验和 Secure 会话 Cookie。HTTPS 由托管入口终止。

沿用原 CloudBase 运营账号、独立首页配置和素材；服务器不携带腾讯云管理员密钥。不要把 .private 目录放入部署包。

## 上线验证（2026-09-10）

- 云托管服务 `topuyi-operations-cn` 部署正常。
- `admin.topuyi.com` 已绑定 HTTP 网关，HTTPS 证书和 DNSPod CNAME 均已生效。
- 页面、账号登录、配置读取、状态读取、商品读取和退出均通过线上验证。
- 原站点保持现状；本次未发布新版小程序。

## 后续维护

- 保持云开发套餐和云托管资源可用。
- SSL 证书到期前完成续签并在 HTTP 网关更新关联证书。
- 后台版本更新后重新构建并部署 `outputs/cloudrun`。
