# 演出内容云端维护

【演出】页现在读取云数据库 `performances` 集合，不再使用前端写死的演出列表。

## 需要创建的集合

在云开发控制台创建集合：

- `performances`

建议权限：

- 所有人可读
- 仅管理员可写

## 字段

- `id`：演出编号，唯一，例如 `topuyi-live-2026`
- `name`：演出名称
- `date`：演出日期，例如 `2026-10-01`
- `time`：演出时间，例如 `19:30`
- `venue`：演出地点
- `description`：演出页展示说明
- `statusText`：展示状态，例如 `座位绑定开放中`
- `status`：发布状态，只有 `published` 会在小程序显示
- `sort`：排序，越大越靠前
- `sourceAppId`：固定为 `wx3610c3ef05d1131e`

## 快速上架一条演出

先确认已经登录 CloudBase：

```bash
tcb.cmd login
```

然后执行：

```bash
node scripts/upsert-performance.js
```

如果要上架其他演出，可以复制 `scripts/performances/topuyi-live-2026.json`，修改内容后执行：

```bash
node scripts/upsert-performance.js scripts/performances/你的演出.json
```
