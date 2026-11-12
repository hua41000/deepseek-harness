# 999: 会话花费估算插件

| 项 | 值 |
|---|---|
| Phase | draft |
| Profile | standard |
| 优先级 | P1 |
| 负责人 | Runhua Xue |
| 目标日期 | 待填 |
| 涉及子系统 | 待补充 |

## 一句话描述

在 DSH 会话中按模型单价估算花费，并显示缓存节省了多少

## 背景

DSH 只显示 token 用量，看不到花了多少钱

## 关键决策

- 2026-11-11（Runhua Xue，技术设计阶段）：配置中的单价无效时，插件在加载时报错，遵循 AGENTS.md "fails loud"；PRD UI-01 的"错误"状态待回改。窗口内推不出模型的步骤计入未定价。详见[技术方案](design/TECH_DESIGN.md#13-关键决策与-review-索引)。

## 上下文索引

- [素材索引](context/_INDEX.md)
- [PRD](spec/PRD.md)：有效需求来源，AC-01～AC-14
- [技术方案](design/TECH_DESIGN.md)（standard 模板，草案待评审）、[代码设计附录](design/CODE_DESIGN.md)、[HTML 审阅版](design/TECH_DESIGN.html)。T1～T9 共 9 项任务；PRD 需回改 UI-01"错误"状态；测试计划缺口已回传
