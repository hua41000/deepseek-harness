# 素材索引 — 999

| 文件 | 类型 | 来源与原名 | 关键内容摘要 | 收集日期 | 派生自 |
|---|---|---|---|---|---|


## 关键发现

- DSH 已有上下文与 token 展示，但都不含花费：上下文用量条 ContextMeter（packages/client/ui-conversation）、每轮用量面板 TurnUsagePanel（packages/client/ui-chat）、实验插件 client-ui-stats 统计页签（packages/experimental/client-ui-stats）。
- 可参考 packages/experimental/client-ui-stats 的写法：它是只运行在浏览器端的实验插件，向会话视图贡献一个页签，并读取会话的 token 用量数据。
- 用户已确认：花费以人民币计价。

## 开放问题

- 单价从哪里来：内置默认价目表、用户配置，还是两者都支持？
