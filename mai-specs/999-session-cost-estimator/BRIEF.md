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

- 2026-11-11（Runhua Xue，技术设计阶段）：配置中的单价无效时，插件在加载时报错，遵循 AGENTS.md "fails loud"；PRD UI-01 的"错误"状态已同步，并新增 AC-15。窗口内推不出模型的步骤计入未定价。详见[技术方案](design/TECH_DESIGN.md#13-关键决策与-review-索引)。

## 上下文索引

- [素材索引](context/_INDEX.md)
- [PRD](spec/PRD.md)：有效需求来源，AC-01～AC-15；2026-11-13 已回写测试计划待确认项 A-01～A-11（A-08 记为 Q-05，待 T9 核对）
- [技术方案](design/TECH_DESIGN.md)（standard 模板，草案待评审）、[代码设计附录](design/CODE_DESIGN.md)、[HTML 审阅版](design/TECH_DESIGN.html)。T1～T9 共 9 项任务，已同步 PRD 的 AC-15；测试计划缺口已回传
- [方案评审](review/design_review.md)（2026-11-11）：有条件通过，P1 两项（分页代码重复、全局配置缺失时回退到内置价），P2 三项。P1 已在技术方案中修改（D-08、D-09），待编排者核对；P2 结论：D-06 接受，¥1.00 边界接受（已回写 PRD BR-07 与 AC-12），series 回溯延后
- [测试计划](test/TEST_PLAN.md)（2026-11-11，仅规划，未执行）：TC-01～TC-12 覆盖 AC-01～AC-15 的业务场景，补齐 AC-01、AC-09、AC-10、AC-14 的 Web 场景和 AC-15 的启动报错场景；歧义 A-01～A-11 待确认
