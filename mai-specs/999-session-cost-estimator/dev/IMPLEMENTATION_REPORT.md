# 999 实现报告

> 有效需求来源：[PRD](../spec/PRD.md)（AC-01～AC-15） | 设计：[技术方案](../design/TECH_DESIGN.md)、[代码设计附录](../design/CODE_DESIGN.md) | 分支：`homework-1-build-plugin`

[返回需求简报](../BRIEF.md)

本报告记录实施进度、实际验证结果，以及与已评审设计的偏差。按用户要求（2026-11-13），实施期间**不修改设计文档**，偏差集中记录在本报告，待实施结束后由编排者安排设计同步。

## 任务进度

| 任务 | 状态 | 提交 | 说明 |
|---|---|---|---|
| T1 包骨架与登记 | 完成 | `b4ebb6131d` | 见下文 |
| T2 计价与格式纯函数 | 完成 | `a1aa237c90` | 见下文 |
| T3 Definitions 与 builder | 完成，待提交 | — | 见下文；两个注册函数的覆盖由 T5 插件测试补齐 |
| T4 配置注入 | 未开始 | — | |
| T5 视图与语言包 | 未开始 | — | |
| T6 文档与生成产物 | 未开始 | — | |
| T7 覆盖率与构建 | 未开始 | — | |
| T8 人工验收 | 未开始 | — | |
| T9 核实 Q-02、Q-05 | 未开始 | — | |

## 与设计的偏差

| 编号 | 设计原文 | 实际实现 | 原因 | 影响 | 需同步的文档 |
|---|---|---|---|---|---|
| V-01 | 包名 `@deepseek-ai/dsh-experimental-client-ui-cost`（TECH_DESIGN §1.2，CODE_DESIGN §4 overlay 示例） | 包名 `@deepseek-ai/dsh-client-ui-cost`，并在 `scripts/experimental-package-policy.ts` 的 `EXPERIMENTAL_PACKAGE_NAME_EXCEPTIONS` 中登记 | `packages/experimental/AGENTS.md` 禁止新包使用 `dsh-experimental-` 前缀，`pnpm run constraints` 会拒绝；用户 2026-11-13 指定该包名 | overlay 与 README 中的 `name` 使用新包名；目录仍为 `packages/experimental/client-ui-cost` | TECH_DESIGN §1.2、§2.3.1；CODE_DESIGN §4；TEST_PLAN 中引用包名处；PRD 如有引用 |
| V-02 | `tsconfig.json`、`tsdown.config.ts` 复制 stats（单一 client tsconfig），T1 修改 `tsconfig.client.json` 的 references（TECH_DESIGN §2.3.1、T1） | 按 Host / Client 两个编译面拆分：`tsconfig.host.json`（仅 `src/index.ts`）、`tsconfig.client.json`（`src/client`）和只做汇总的 `tsconfig.json`；根 `tsconfig.host.json` 与 `tsconfig.client.json` 各登记一个面 | 本包有宿主入口（T4 引用 `host/webserver` 类型、`schemastery`），AGENTS.md 要求 "Keep compiler faces explicit"；做法与同样有宿主配置注入的 `client-ui-sidebar-documentpreview`、`client-ui-cot-translation` 一致 | 无行为影响；T4 的 `src/config.ts` 需同时列入两个面 | TECH_DESIGN §2.3.1 文件表、T1 变更文件 |
| V-03 | `locale/*.json` 属于 T5 | T1 先新增 8 种语言的 `locale/*.json`，只含包元数据 `meta.title`、`meta.description` | `pnpm run hygiene` 的 `verify-locale-metadata` 要求每个插件包具备 8 种已发布语言的元数据，否则 T1 验收不通过 | T5 只补界面文案，不再新建这些文件 | TECH_DESIGN T1、T5 变更文件 |
| V-04 | T1 修改 `packages/experimental/README.md` 的包列表 | 包列表的中英文行移到 T6，与本包 README 一起新增 | 双语配对检查要求中英两侧链接目标一致；本包 `README.zh.md` 在 T6 前不存在，pre-commit 钩子 `translation pairing` 拒绝提交 | 无行为影响 | TECH_DESIGN T1、T6 变更文件 |
| V-05 | `CostSnapshot.steps` 的元素类型写作内联交叉类型 `CostStep & { model: string \| null }`（CODE_DESIGN §1） | 提取为具名接口 `AttributedCostStep extends CostStep`，字段相同 | 测试和 builder 都要构造这种对象，具名类型便于引用和写 JSDoc | 无行为影响 | CODE_DESIGN §1 |
| V-06 | `cost-step` 按 stats 的写法折叠状态：`step/start` 建立状态、`assistant/message` 更新，起点缺失时用 `fallbackState` 从 matches 重建（CODE_DESIGN §2） | State 只保存 `step/start` 的时间；`buildViewNode` 直接从 `context.matches` 取最后一条 `assistant/message` 读用量。起点不在窗口内时引擎不调用 `start`，State 为空，开始时间回退为消息时间 | 只需要两项数据，不必复制 stats 的折叠状态机；结果只取决于当前 matches，与分页、实时更新的到达顺序无关 | 行为与设计相同（含 R2 回退、BR-06） | CODE_DESIGN §2 |

## T1 包骨架与登记

**变更**

- 新增 `packages/experimental/client-ui-cost/`：`package.json`、`tsconfig.json`、`tsconfig.host.json`、`tsconfig.client.json`、`tsdown.config.ts`、`src/index.ts`、`src/client/index.ts`（两个入口均为空的 `apply`，按设计 T1 "暂为空实现"，由 T3～T5 补全）、`locale/*.json`（8 种语言的包元数据，V-03）。
- 修改：`tsconfig.base.json`（`paths`）、`tsconfig.client.json` 与 `tsconfig.host.json`（references，V-02）、`scripts/experimental-package-policy.ts`（V-01）、`pnpm-lock.yaml`（`pnpm install` 生成）。

**验证（2026-11-13 实际执行）**

| 命令 | 结果 |
|---|---|
| `pnpm install` | 通过 |
| `pnpm run typecheck` | 通过（5/5） |
| `pnpm run build:artifacts`，随后 `pnpm run build:check` | 通过；产出 `lib/index.js`、`lib/client.js` |
| `pnpm run hygiene` | 22/24 通过：`verify-locale-metadata` 在补充 V-03 后单独复跑通过；`publint` 在 `build:artifacts` 后单独复跑通过（exit 0）。**`rescope-vendor:check` 失败**，残留位于 `apps/web/tests/creator-persona.e2e.ts`、`docs/upgrade-guide/v0.2.2-rc.1/subagent-interrupt-default/guide*.md`、`packages/experimental/cua/tests/agent-scopes.spec.ts`，均非本次改动文件，属基线既有问题 |
| `pnpm run constraints` | 通过 |
| `vitest run scripts/check-workspace-constraints.spec.ts apps/cli/tests/profiles/web/tests/runtime-roster-isolation.spec.ts` | 通过（196 个用例，含新登记包名的保留与隔离用例） |
| 首次 `git commit` | pre-commit 钩子 `translation pairing` 失败：包列表新行的中英链接目标不一致（本包 `README.zh.md` 尚不存在）。按 V-04 撤回包列表改动后，`verify-translation-pairing packages/experimental/README.md` 通过 |

**遗留**

- T6：在 `packages/experimental/README.md` / `README.zh.md` 包列表中登记本包，并重新记录 `README.i18n.yaml`（V-04）。

## T2 计价与格式纯函数

**变更**

- 新增 `src/client/cost-contract.ts`（类型）、`src/client/cost-pricing.ts`（`BUILTIN_PRICES`、`pricePeriod`、`resolvePrices`、`priceStep`、`priceSummary`）、`src/client/cost-format.ts`（`formatYuan`、`formatTokens`）。
- 新增测试 `tests/cost-pricing.client.spec.ts`、`tests/cost-format.client.spec.ts`。
- 实现按 CODE_DESIGN §1、§3、§5 的示意代码，只做了以下写法调整：时段判断用区间表 `PEAK_MINUTES`；`priceStep` 去掉非空断言以满足 lint 规则 `no-non-null-assertion`；`formatTokens` 的输出与统计页签 `formatTokensShort` 一致（`0.52K`、`5.2K`、`10.0M`，PRD C-05），没有从 stats 包引入（stats 未导出该函数，D-01 已接受小量重复，`pnpm run duplication` 为 0 处克隆）。

**AC 覆盖（单元测试）**

| AC | 用例 |
|---|---|
| AC-02 | 周三 10:00 的 flash 步骤 ≈ 0.0316 |
| AC-03 | 周三 12:00:00、08:59:59 和周六 10:00 ≈ 0.0158；11:59:59 ≈ 0.0316；另测 09:00、14:00、17:59:59、18:00、周日，以及北京时间周一 00:30（UTC 仍是周日）；运行时区设为 `America/Los_Angeles` 时结果不变 |
| AC-04 | 缓存节省 ≈ 0.1764 |
| AC-05 | flash 与 v4-pro 各按自己的单价计价，合计为两者之和，模型列表含两个模型 |
| AC-06 | 部分未定价轮次显示已计价金额并标记 `partial`，整轮未定价时 `cost` 为 null；全部未定价时 `pricedSteps` 为 0，仍保留模型列表 |
| AC-07 | 配置把 flash 高峰输出单价改为 16 后 ≈ 0.0396；配置新增的模型可以计价；未配置的模型仍用内置价 |
| AC-08 | 轮次按序排列，各轮花费之和等于合计 |
| AC-12 | 12.3456、0.03164、0.00004、0.99995、0.99994 分别显示为 `¥12.35`、`¥0.0316`、`<¥0.0001`、`¥1.00`、`¥0.9999` |
| BR-01 写入单价 | 缓存写入按未命中单价计价 |
| BR-05 / D-04 | 模型为 null、模型无单价、`toString` 等原型链键都记为未定价；只有窗口内没有 `request/header` 时才使用 `lastUsed` 回退 |

**验证（2026-11-13 实际执行）**

| 命令 | 结果 |
|---|---|
| `vitest run packages/experimental/client-ui-cost`（带 v8 覆盖率，范围为 `src/client/cost-*.ts`） | 42 个用例通过；语句、分支、函数、行覆盖率均为 100% |
| `pnpm run typecheck` | 通过（5/5） |
| `tsx scripts/run-oxlint.ts packages/experimental/client-ui-cost` | 首次报 5 个问题（非空断言、类型分隔符、2 处超长行、`expect.closeTo` 的 `any` 赋值），修正后通过（exit 0） |
| `pnpm run verify-export-jsdoc` | 通过 |
| `pnpm run duplication` | 0 处克隆 |
| R-01 价格复核：读取 https://api-docs.deepseek.com/zh-cn/quick_start/pricing | 四组单价与 PRD 内置价目表一致；时段为北京时间周一至周五 9:00–12:00、14:00–18:00，与 BR-02 一致；页面仍未标注更新日期 |

**复核价目页时的发现（交负责人判断，未改实现）**

- 价目页说明旧模型 ID `deepseek-v4-flash`、`deepseek-v4-flash-vision-exp` 仍可调用，并按 Flash 价格计费。如果 DSH 的 `request/header` 记录的是这些旧 ID，相应步骤会显示为"未定价"。这与 Q-05 相关：T9 核对实际记录的模型 ID；如果不一致，按设计 T9 由负责人决定是改内置价目表还是加模型 ID 映射，实现中不自行添加。
- 价目页注明法定节假日按空闲价计费。PRD BR-02 已接受不识别节假日造成的误差，实现与 PRD 一致，未改。

## T3 Definitions 与 builder

**变更**

- 新增 `src/client/cost-definition.ts`：`TARGET = 'cost'`、`CostViewNode` / `CostNodeData`、`costStepDefinition`、`costRouteDefinition`、`registerCostDefinitions`。`step/start` 不触发发布（`none`），`assistant/message` 立即发布（FR-08）。
- 新增 `src/client/cost-builder.ts`：`attributeModels`（按 seq 排序后单指针归属模型）、`EMPTY_COST_SNAPSHOT`、`costViewDefinition`（`replace` / `apply` 接口同 stats 的 builder）、`registerCostView`。封闭联合的 `default` 分支按仓库约定调用 `assertNever`。
- `package.json` 新增 devDependency `@deepseek-ai/dsh-util-values`（`assertNever`）；`tsconfig.client.json` 增加对 session-controller、ui-conversation、core/session、llm、util/values 的 references。
- 新增测试 `tests/cost-definition.client.spec.ts`、`tests/cost-builder.client.spec.ts`。

**R6 核对结果（风险关闭）**：`packages/client/ui-conversation/src/client/conversation/assembler.ts` 中，`replaceWindow` 的参数说明为 "complete contiguous window"，`prepend` 只加入更早的事件。因此已加载窗口总是会话日志的连续后缀，D-02 的 `lastUsed` 回退前提成立，不需要去掉回退。

**用例覆盖**

| 设计要求 / AC | 用例 |
|---|---|
| 模型归属：无 header | 全部步骤 `model` 为 null，`windowHasHeader` 为 false |
| 模型归属：header 在开头 / 在中间 | 开头时全部归属；中间时之前的步骤为 null（D-04），之后的归属该模型 |
| 模型切换 | 多个 header 时每步取它之前最近的一个 |
| 不变量：与到达顺序无关 | 打乱节点顺序输入，结果相同；加载更早页后，原先未知的步骤得到模型 |
| AC-08 多轮排序 | 步骤按 `messageSeq` 排序，跨轮次 |
| AC-11 / BR-06 无用量步骤 | `assistant/message` 无 `usage`，或该步还没有消息时，不产生节点 |
| R2 起点缺失回退 | 无 State 时开始时间取消息时间 |
| 用量映射 | `inputTokens` → miss，`cacheReadTokens` / `cacheWriteTokens` 缺省为 0 |
| 增量更新 | `apply` 在 `replace` 结果上追加；空 upserts 时返回同一快照；同 key 覆盖；`replace` 丢弃旧节点 |

**验证（2026-11-13 实际执行）**

| 命令 | 结果 |
|---|---|
| `vitest run packages/experimental/client-ui-cost`（v8 覆盖率，范围 `src/client/cost-*.ts`） | 63 个用例全部通过。分支覆盖 100%；`registerCostDefinitions`、`registerCostView` 两个注册函数未覆盖（语句 97.41%）。直接测试需要把假对象断言为 `Context`，会违反 "No new assertions to unknown"，因此留给 T5 用真实客户端运行时的插件测试覆盖，T7 统一核对 100% |
| `pnpm run typecheck` | 首次失败：测试中 route 上下文的 State 被推断为 `undefined`，补显式类型后通过（5/5） |
| `tsx scripts/run-oxlint.ts packages/experimental/client-ui-cost` | 首次报 `no-unnecessary-type-arguments`，修正后通过 |
| `pnpm run verify-export-jsdoc` | 通过 |
| `pnpm run verify-package-dependencies` | 通过 |
| `pnpm run duplication` | 0 处克隆 |
