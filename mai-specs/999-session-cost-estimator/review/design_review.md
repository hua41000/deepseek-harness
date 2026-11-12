# 技术方案评审：会话花费估算插件

> Feature：999 | 评审对象：[技术方案](../design/TECH_DESIGN.md)、[代码设计附录](../design/CODE_DESIGN.md) | 需求来源：[PRD](../spec/PRD.md)（AC-01～AC-15） | 代码基线：`homework-1-build-plugin` @ `4b74231e69` | 评审日期：2026-11-11

[返回需求简报](../BRIEF.md)

> 说明：本方案与本次评审都由同一个 AI 助手完成。为降低自我确认的偏差，评审中的每条关键假设都回到真实代码重新核对，下文"已核实"部分列出了证据。

## 总体结论：有条件通过

方案的问题定义准确，范围与 PRD 一致，复杂度与需求相称：只新增一个实验包，不改动事件、投影或服务，计价规则集中在纯函数中。几项关键技术假设已在代码中逐一核实。

有两处 **P1** 会在实施时直接引发问题，需要先修改方案再进入实施：

1. 照搬 stats 的分页代码会触发仓库的重复代码检查，而且这个页签用不到那部分复杂度。
2. 页面全局配置缺失时回退到内置价格，可能让 AC-15（配置无效时加载失败）被静默绕过。

这两处都是局部修改，改完后无需再做完整评审，由编排者核对修改即可。没有 P0。

## 已核实的关键假设

| 假设 | 结论 | 证据 |
|---|---|---|
| 只有 agent loop 写 `request/header`，并且写在同一步的 `assistant/message` 之前 | 成立 | `packages/core/agent-loop/src/agent.ts:683`、`:690`、`:696` 是仓库 `src` 中仅有的写入点（已排除 tests 和 lib）；该方法注释写明 "appended inside its step before dispatch"（`packages/core/session/src/types.ts` 中 `request/header` 的 JSDoc） |
| R6：会话窗口是日志的连续后缀 | 成立 | `packages/api/session-controller/src/client/contract/events.ts:108-170`：窗口为 "contiguous"，`prepend` 加载更早的页，`append` 追加实时事件，`hasMore` 只表示是否还有更早的历史 |
| 浏览器端能读到 `modelSelection` 投影 | 成立 | 已有客户端用法：`packages/client/ui-agent-team/src/client/TeamModeToggle.tsx:41`（`useProjection('modelSelection')`）；投影定义含 `wire.view`（`packages/core/agent/src/model-selection.ts`） |
| `inputTokens` 只是未命中缓存的输入，与缓存读写互不重叠 | 成立 | `packages/llm/token-meter/src/usage-projection.ts:22` 把 `inputTokens` 计为 `uncachedInputTokens`；`client-ui-stats/src/client/stats-usage.ts` 的注释也是同样的口径 |
| 需要 8 种语言 | 成立 | `scripts/shipped-locales.ts`、`scripts/locale-dictionary-parity.spec.ts` |

## 关键发现

### P1-1　照搬 stats 的分页代码会被重复代码检查拦下，而且没有必要

- **证据**：
  - 方案中多处写明照搬 stats 的分页实现：[TECH_DESIGN.md:105](../design/TECH_DESIGN.md)（"沿用 stats 的 `loadOlder` 实现"）、`:137`（"`loadOlder` 照搬 stats"），以及 [CODE_DESIGN.md:240](../design/CODE_DESIGN.md)。
  - 被照搬的代码是 `packages/experimental/client-ui-stats/src/client/index.ts:33-52`（`whenOpened`）和 `:95-120`（`loadOlder` 的 `grew` / `retry` / `exhausted` 判断）。
  - 仓库的 `pnpm run duplication` 对 `packages` 下所有非测试的 `.ts` / `.tsx` 文件运行 jscpd，配置为 `minTokens: 60`、`minLines: 6`、`exitCode: 1`（`.jscpd.json`）。上面两段代码照搬后都超过这个阈值。
- **影响**：任务 T7 的验收条件"`pnpm run duplication` 通过"会失败，要么回头改实现，要么加 `jscpd:ignore`，后者属于规避检查。
- **为什么没有必要**：stats 需要 `grew` 和 `retry` 的区分，是因为它在用户滚动到顶部时自动加载，还要保持滚动位置（stats README："offsets the scroll position by the height it prepended"）。本方案的区域 C 只是一个"加载更早"按钮，需要的只有三点：
  - 点击时调用 `session.loadOlder()`；
  - 用 `loadingOlder` 显示加载中状态；
  - 用 `hasMore` 决定是否显示提示条。

  `loadOlder` 的契约本身已保证请求正在进行时会返回同一个完成结果，见 `packages/api/session-controller/src/client/contract/session.ts` 中 `loadOlder` 的 JSDoc："return the in-flight completion"。
- **修改要求**：
  - 把 §2.1.2 第 4 点和 §2.3.1 的 `src/client/index.ts` 一行改为"按钮直接调用 `session.loadOlder()`，状态读取会话快照的 `loadingOlder` 和 `hasMore`"。
  - 删除"照搬 stats"的说法，同步修改 CODE_DESIGN §5。
  - 失败时的提示可以保留，文案在本包语言包中定义。
- **验证方式**：实现后运行 `pnpm run duplication`。

### P1-2　全局配置缺失时回退到内置价格，可能静默绕过 AC-15

- **证据**：
  - [TECH_DESIGN.md:111](../design/TECH_DESIGN.md) 把"页面全局变量缺失时按空配置处理"定义为合法组合；任务 T4 的验收条件（`:189`）也写了"全局变量缺失时按空配置处理"。
  - 浏览器 bundle 是否下发，由 `packages/client/modules/src/index.ts:1046` 决定，它只排除 `entry.fiber === undefined || entry.disabled` 的条目。
- **触发条件**（待验证）：宿主入口因配置校验失败而加载失败后，如果该条目仍然有一个处于失败状态的 fiber，客户端 bundle 就仍会下发。此时页面上没有全局配置，客户端会按空配置处理，页签照常出现并使用内置价格。这正是 AC-15 明确禁止的行为（"不会以'未定价'的方式继续显示页签"），也违背 D-05 的 fails loud。
- **另一方面**：在 `cordis.yml` 中挂载这个包时，总会同时加载宿主入口，"只挂载 client 入口"在实际组合中并不存在。所以把全局配置缺失当作合法情况，既没有使用场景，又可能掩盖错误。
- **修改要求**：
  - 把"全局变量缺失"改为错误：客户端 `apply` 直接抛错，错误信息写明宿主入口未运行或配置无效，不再回退到内置价格。
  - 宿主入口加载成功时总会注入全局配置（`prices` 缺省为 `{}`），所以正常路径不受影响。
  - 同步修改 T4 的验收条件（增加"全局变量缺失时客户端抛错"）、§2.1.2 的失败路径，以及 CODE_DESIGN §4 中的 `?? {}`。
- **验证方式**：T4 增加一条单元测试；T8 的 AC-15 人工步骤要同时记录两件事：宿主日志中的错误，以及浏览器中页签是否出现。

### P2-1　确认 D-06（配置按模型整条提供）的使用成本

D-06 要求用户为一个模型写全两个时段的 6 个单价。AC-07 只想把一个单价改成 16，也要写 6 个数。这样实现简单、语义清楚，评审认为可以接受，但这属于用户体验上的取舍，请需求负责人确认。如不接受，可以改成字段级合并，代价是要定义合并规则，测试用例大约翻倍。

### P2-2　确认金额格式在 ¥1 附近的处理

[CODE_DESIGN.md §5](../design/CODE_DESIGN.md#5-视图要点costviewtsx) 规定 0.99995 到 1 之间的金额显示为 `¥1.00`。这是对 BR-07 边界的解释，PRD 中没有写明。请需求负责人确认后，回写 PRD 的 BR-07。

### P2-3　可选：减少"推不出模型"的情况

如果窗口内第一条 `request/header` 的 `reason` 是 `series`，说明它与之前的请求头相同（`agent.ts:696` 只在请求头相等时写入 `series`），那么它之前的步骤可以沿用同一个模型，不必计入未定价。这能缩小 D-04 的影响范围，但只有一处规则变化，收益有限。建议延后：只有用户实际反馈未定价步骤过多时，再加入并补充一条 builder 测试。

## 范围与复杂度检查

- **减法推演**：逐项检查新增内容，包括两个 Definition、builder、纯函数计价、宿主配置入口和 8 种语言，都对应当前 AC 或仓库硬约束，没有可以删掉的部分。P1-1 的修改本身就是一次减法。
- **没有过度设计**：没有新增投影、事件、服务、存储或通用框架，计价的金额也没有引入十进制库。
- **保持现状**：D-01～D-05、D-07，风险 R1～R5，以及任务拆分 T1～T9（除 P1 涉及的修改外）。

## 需求 → 设计 → 验证对应

| AC | 设计位置 | 验证 |
|---|---|---|
| AC-02～AC-08、AC-11、AC-12 | `cost-pricing.ts`、`cost-builder.ts`、`cost-format.ts` | T2、T3 单元测试 |
| AC-13 | `locales.ts` 与 8 种语言 | T5：i18n 检查与 locale 一致性测试 |
| AC-15 | `config.ts`；P1-2 修改后的客户端检查 | T4 单元测试、T8 人工步骤 |
| AC-01、AC-05、AC-09、AC-10、AC-14 | 视图与 overlay | T8 人工步骤 |

## 测试缺口（回传编排者）

与技术方案已登记的缺口相同，不重复列出：AC-01、AC-09 可以补一个 Web e2e，参照 `apps/web/tests/client-ui-stats-panel.e2e.ts`；recorded-session snapshot 规则是否适用于实验包，在 pre-push 阶段确认。P1-2 修改后，T8 中 AC-15 的人工步骤要多记录一项：浏览器中页签是否出现。

## 本次未覆盖

- 视图的视觉和交互细节，留给实现阶段按 `dsh-client-ui-ux` 审查。
- schemastery 对 `NaN`、`Infinity` 和字符串的实际校验行为，方案已列为待验证项，由 T4 的负例测试确认。
- 价格数值是否与官方页面一致：R-01 要求实现前再核对一次。
