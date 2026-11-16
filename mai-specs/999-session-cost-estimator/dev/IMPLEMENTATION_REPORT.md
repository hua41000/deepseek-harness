# 999 实现报告

> 有效需求来源：[PRD](../spec/PRD.md)（AC-01～AC-15） | 设计：[技术方案](../design/TECH_DESIGN.md)、[代码设计附录](../design/CODE_DESIGN.md) | 分支：`homework-1-build-plugin`

[返回需求简报](../BRIEF.md)

本报告记录实施进度、实际验证结果，以及与已评审设计的偏差。按用户要求（2026-11-13），实施期间**不修改设计文档**，偏差集中记录在本报告，待实施结束后由编排者安排设计同步。

## 任务进度

| 任务 | 状态 | 提交 | 说明 |
|---|---|---|---|
| T1 包骨架与登记 | 完成 | `b4ebb6131d` | 见下文 |
| T2 计价与格式纯函数 | 完成 | `a1aa237c90` | 见下文 |
| T3 Definitions 与 builder | 完成 | `ca6a08fd72` | 见下文；两个注册函数的覆盖由 T5 插件测试补齐 |
| T4 配置注入 | 完成 | `0e3bfda5a2` | 见下文；"不注册页签"的断言已在 T5 补充 |
| T5 视图与语言包 | 完成 | `fcb6ad75ed` | 见下文；真实页面的浅色/深色与窄宽度检查未做，并入 T8 |
| T6 文档与生成产物 | 完成 | `292b0ffb0f` | 见下文；`doc-sync` 剩 2 项失败，均来自 `mai-specs/` |
| T7 覆盖率与构建 | 完成 | `d7e796fdd2` | 见下文；只改了本报告，无代码变更 |
| T8 人工验收 | 完成（2026-11-13～14） | — | 逐项结果见下文；T8-1b 空状态未在真实运行中观察到，由单元测试覆盖 |
| T9 核实 Q-02、Q-05 | 完成 | `abd5a82cc8` | 见下文 "T9 核实 Q-02、Q-05"；PRD 已回写（`79f0875a6b`） |
| 评审修复 P1-1、P1-2 | 完成 | `b1c72c69dd` | 见下文"代码评审修复"；按[代码评审](../review/code_review.md)方案 A 修复 P1-1，并修复 P1-2；待复评 |

## 与设计的偏差

| 编号 | 设计原文 | 实际实现 | 原因 | 影响 | 需同步的文档 |
|---|---|---|---|---|---|
| V-01 | 包名 `@deepseek-ai/dsh-experimental-client-ui-cost`（TECH_DESIGN §1.2，CODE_DESIGN §4 overlay 示例） | 包名 `@deepseek-ai/dsh-client-ui-cost`，并在 `scripts/experimental-package-policy.ts` 的 `EXPERIMENTAL_PACKAGE_NAME_EXCEPTIONS` 中登记 | `packages/experimental/AGENTS.md` 禁止新包使用 `dsh-experimental-` 前缀，`pnpm run constraints` 会拒绝；用户 2026-11-13 指定该包名 | overlay 与 README 中的 `name` 使用新包名；目录仍为 `packages/experimental/client-ui-cost` | TECH_DESIGN §1.2、§2.3.1；CODE_DESIGN §4；TEST_PLAN 中引用包名处；PRD 如有引用 |
| V-02 | `tsconfig.json`、`tsdown.config.ts` 复制 stats（单一 client tsconfig），T1 修改 `tsconfig.client.json` 的 references（TECH_DESIGN §2.3.1、T1） | 按 Host / Client 两个编译面拆分：`tsconfig.host.json`（仅 `src/index.ts`）、`tsconfig.client.json`（`src/client`）和只做汇总的 `tsconfig.json`；根 `tsconfig.host.json` 与 `tsconfig.client.json` 各登记一个面 | 本包有宿主入口（T4 引用 `host/webserver` 类型、`schemastery`），AGENTS.md 要求 "Keep compiler faces explicit"；做法与同样有宿主配置注入的 `client-ui-sidebar-documentpreview`、`client-ui-cot-translation` 一致 | 无行为影响；T4 的 `src/config.ts` 需同时列入两个面 | TECH_DESIGN §2.3.1 文件表、T1 变更文件 |
| V-03 | `locale/*.json` 属于 T5 | T1 先新增 8 种语言的 `locale/*.json`，只含包元数据 `meta.title`、`meta.description` | `pnpm run hygiene` 的 `verify-locale-metadata` 要求每个插件包具备 8 种已发布语言的元数据，否则 T1 验收不通过 | T5 只补界面文案，不再新建这些文件 | TECH_DESIGN T1、T5 变更文件 |
| V-04 | T1 修改 `packages/experimental/README.md` 的包列表 | 包列表的中英文行移到 T6，与本包 README 一起新增 | 双语配对检查要求中英两侧链接目标一致；本包 `README.zh.md` 在 T6 前不存在，pre-commit 钩子 `translation pairing` 拒绝提交 | 无行为影响 | TECH_DESIGN T1、T6 变更文件 |
| V-05 | `CostSnapshot.steps` 的元素类型写作内联交叉类型 `CostStep & { model: string \| null }`（CODE_DESIGN §1） | 提取为具名接口 `AttributedCostStep extends CostStep`，字段相同 | 测试和 builder 都要构造这种对象，具名类型便于引用和写 JSDoc | 无行为影响 | CODE_DESIGN §1 |
| V-06 | `cost-step` 按 stats 的写法折叠状态：`step/start` 建立状态、`assistant/message` 更新，起点缺失时用 `fallbackState` 从 matches 重建（CODE_DESIGN §2） | State 只保存 `step/start` 的时间；`buildViewNode` 直接从 `context.matches` 取最后一条 `assistant/message` 读用量。起点不在窗口内时引擎不调用 `start`，State 为空，开始时间回退为消息时间 | 只需要两项数据，不必复制 stats 的折叠状态机；结果只取决于当前 matches，与分页、实时更新的到达顺序无关 | 行为与设计相同（含 R2 回退、BR-06） | CODE_DESIGN §2 |
| V-07 | 单价用 `z.number().min(0).required()`，并注明"如不拒绝 NaN，改用自定义校验"（CODE_DESIGN §4 审查点） | 单价为 `z.number().min(0).max(Number.MAX_VALUE).required()`；`prices` 字典外包一层 `z.transform` 检查 NaN，由检查代码自己拼出字段路径后抛出 `z.ValidationError` | 实测 schemastery 的范围检查放过 NaN；`transform` 回调拿不到 `options`（`vendor/schemastery/src/index.ts` 只传入值），无法带出路径；把 `transform` 包在整个对象外会使内层 `default({})` 失效 | 错误信息与其他字段一致，形如 `$.prices.deepseek-flash.peak.output expected a finite number but got NaN` | CODE_DESIGN §4 |
| V-08 | 全局变量名直接写在宿主和浏览器代码里；浏览器端校验逻辑写在 `apply` 开头（CODE_DESIGN §4） | 变量名提取为 `config.ts` 导出的常量 `CONFIG_GLOBAL`；浏览器端的读取与校验提取为导出函数 `injectedPrices(injected)`，`apply` 第一行调用它；`cost-contract.ts`（纯类型）同时列入宿主编译面，因为 `config.ts` 引用其中的价目表类型 | 两端共用一个名字；读取逻辑可以不经全局变量单独测试 | 无行为影响 | CODE_DESIGN §4；TECH_DESIGN §2.3.1 文件表 |
| V-09 | 重新生成 `docs/config-catalog*.md` 属于 T6 | 在 T4 生成 | 新增 `Config` 后 `gen-config-catalog --check` 即报过期；生成内容只取自 `Config` 的类型与 JSDoc，与 README 无关 | T6 只需复查是否仍为最新 | TECH_DESIGN T4、T6 变更文件 |
| V-10 | `CostTurnRow` 只有 `partial` 布尔值（CODE_DESIGN §1） | 新增 `unpricedSteps`（该轮未定价步数）；`priceSummary` 同步填写 | 设计要求部分未定价标记的 `title` / `aria-label` 使用 C-07 文案，C-07 含 `{count}`，需要每轮的未定价步数 | T2 的类型与函数各加一个字段，测试同步更新 | CODE_DESIGN §1、§3 |
| V-11 | "不声明 `SessionEventMap` 或 `SessionProjectionMap` 合并"（TECH_DESIGN §2.1.3） | 在 `cost-builder.ts` 声明 `ConversationViewSnapshotMap` 的合并 `cost: CostSnapshot` | `ctx.uiConversation.binding(id).target(name)` 的类型参数只接受该映射中的键；stats 同样声明了 `stats` | 仍不涉及会话事件和投影；声明放在浏览器端文件，不进入宿主编译面 | TECH_DESIGN §2.1.3 |
| V-12 | 注入时把 SessionFace 作为 hook 注入，视图读 `hasMore`、`loadingOlder`（CODE_DESIGN §5） | 视图直接用槽位标准属性 `useSession` 读取 `hasMore`、`loadingOlder`，另读 `historyLoadStatus === 'error'`：会话报告历史请求失败时也显示 C-13 重试；注入对象只含 `hooks.cost`、`prices`、`loadOlder` | `conversation.view` 是 session 作用域槽位，`useSession` 已由 ui-session 提供，无需另注入；会话的 `loadOlder()` 在部分失败场景下不抛错而是把状态置为 `error` | 行为符合 D-08 | CODE_DESIGN §5 |
| V-13 | 空状态只显示 C-09（PRD UI-01） | 空状态下若会话还有更早轮次（`hasMore`），在 C-09 下方仍显示"加载更早"按钮，不显示 C-08（C-08 要求 count ≥ 1） | 窗口里恰好没有带用量的步骤时（如最近几轮都被取消），否则用户无法加载更早轮次 | 新增一种显示组合，未新增文案。**负责人已接受（2026-11-13），保留按钮；PRD UI-01 空状态稍后回写** | PRD UI-01 空状态 |
| V-14 | "加载更早"沿用统计页签的交互（TECH_DESIGN §1.1 复用） | 文案与状态沿用 stats；按钮改用 `ui-primitives` 的 `Button`（`size="sm"`、`variant="outline"`），不复制 stats 的本地 `.button` 样式 | UI 规范要求先复用共享组件；复制 stats 的样式也会触发重复检测 | 外观与 stats 的按钮略有不同（共享按钮的 H28/R8） | TECH_DESIGN §1.1 |
| V-15 | T6 只列出 README 三件套与 `docs/config-catalog*.md`（TECH_DESIGN T6；§2.3.1 提到 client catalog "如覆盖实验包则一并生成"） | 另外登记与生成：`scripts/verify-package-readme-model-experience.ts` 的 `SENTENCE_MODEL_EXPERIENCE` 新增本包（README 使用简短的 "None, as …" 形式时必须登记）；重新生成 `cordis-client-runner` 的 `slot-catalog.ts`、`docs/event-producer-consumer*.md`、`agent-preset` 的 `dsh-doc/references/packages.md` | `doc-sync` 的相应检查在新增包后报过期或缺登记 | 仅新增本包对应的一行；无行为影响 | TECH_DESIGN T6 变更文件、§2.3.1 仓库登记 |
| V-16 | 模型回退：窗口内没有任何 `request/header` 时才用 `modelSelection.lastUsed`，有 header 时，第一条 header 之前的步骤一律为 null（TECH_DESIGN §2.1.2 第 2、3 点，D-02、D-04） | ① route 节点带上 header 的 `reason`。窗口内第一条 header 为 `series` 时，它之前的步骤沿用它的模型。<br>② 新增纯函数 `rememberWindowModel`，视图按会话记录 `WindowFallback { model, fromSeq }`：窗口没有 header 时，记下第一次看到的 `lastUsed` 和窗口最早的步骤 seq；更早的无 header 页加载后，`fromSeq` 随之下移；窗口出现 header 后，记录不再变化。<br>③ `priceSummary` 的第三个参数由 `fallbackModel` 改为 `WindowFallback \| null`，只对 `messageSeq >= fromSeq` 且模型为 null 的步骤生效。<br>④ 这条记录放在插件为每个会话注入的对象 `windowModel` 中（slot 的 inject 结果按会话缓存，见 `packages/client/ui-renderer/src/client/scoped-slots.tsx:166-168`），切走页签再回来时不会丢失 | 代码评审 P1-1（已复现）：header 实时进入原本没有 header 的窗口后，原先已计价的步骤变为未定价，合计下降，违反 AC-10。DSH 重启后的第一次请求（`resume`）、压缩后开始新序列（`series`）和工具集变化（`change`）都会触发。用户 2026-11-14 选择方案 A | ① `series` header 与上一条相同（`agent.ts:695-696`），因此沿用是精确的，不是猜测。<br>② `lastUsed` 只会因新的 header 而改变；窗口仍没有 header 时 `lastUsed` 变化，说明有一条 header 还在路上，所以保留第一次的值。<br>③ 页面打开时窗口里已经有 `resume` 或 `change` header 的情况，仍按 D-04 计为未定价 | TECH_DESIGN §2.1.2、§3 R1；CODE_DESIGN §1（`WindowFallback`、route 数据）、§2、§3（`priceSummary` 签名）、§5（注入对象） |
| V-17 | README"安装与启动"只有 `pnpm install`、`pnpm dsh web …`（TECH_DESIGN T6，AC-14） | 中英文 README 在两条命令之间加入 `pnpm run build`，并说明拉取本包改动后需要重新构建；同时按 V-16 更新"实现原理"与已知限制中"未定价步骤"的说明，`README.i18n.yaml` 重新记录 | 代码评审 P1-2：`pnpm dsh web` 只提供已构建的产物（根 `README.md:36-41`），干净检出上照做不会出现页签 | 无行为影响 | TECH_DESIGN T6 |

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

## T4 配置注入

**变更**

- 新增 `src/config.ts`：`Config` schema、`CONFIG_GLOBAL = '__DSH_UI_COST_CONFIG__'`（V-07、V-08）。
- `src/index.ts`（宿主入口）：导出 `Config`；监听 `webserver/index-inject`，把校验后的配置写为页面全局变量。
- `src/client/index.ts`：新增 `injectedPrices`；`apply` 在任何注册之前读取并校验页面全局变量，缺失时抛错（D-09），不回退内置价。页签等注册在 T5 加入，位于这一行之后。
- 新增 `apps/web/tests/client-ui-cost.overlay.yml`（不带 `config`，即使用内置价目表）。
- `package.json`：`dependencies` 新增 `@deepseek-ai/schemastery`（宿主与浏览器两端运行时都要用），devDependencies 新增 `@deepseek-ai/dsh-host-webserver`（仅类型）；两个编译面的 `tsconfig` 相应增加文件与 references。
- 重新生成 `docs/config-catalog.md`、`docs/config-catalog.zh.md`（V-09）。生成内容引用了 `ModelPrices.peak` 的 JSDoc，原文 "see `pricePeriod`" 指向内部函数，改为直接写明时段。
- 新增测试 `tests/config.host.spec.ts`、`tests/config.client.spec.ts`。

**CODE_DESIGN §4 待验证项的结论**

| 待验证项 | 结论（实测） |
|---|---|
| `z.number()` 能否拒绝 NaN、Infinity | Infinity 被 `max(Number.MAX_VALUE)` 拒绝；NaN 不会被拒绝，改为自定义检查（V-07） |
| YAML 字符串 `"abc"` 是否被强制转换 | 不转换：`"abc"`、`"16"` 都报 `expected number` |
| 两个产物能否都打包 `@deepseek-ai/schemastery` | `pnpm run build:artifacts` 与 `build:check` 通过 |
| 宿主入口加载失败后浏览器端代码是否仍下发 | 仍待 T8 实测；无论结果如何，浏览器端拿不到全局变量都会在注册前抛错 |

**AC-15 自动部分的覆盖**

| 场景 | 结果 |
|---|---|
| 负数、NaN、Infinity、字符串、数字字符串、缺少单价字段 | `Config()` 抛错，错误信息以字段路径开头，如 `$.prices.deepseek-flash.peak.output` |
| 模型条目缺少某个时段 | 抛错 `$.prices.deepseek-flash.offPeak missing required value` |
| 合法配置（含单价为 0、内置表外的新模型） | 原样通过；未配置时为 `{ prices: {} }` |
| 宿主入口以非法配置加载 | `ctx.plugin(host, …)` 的加载失败并带出字段路径，页面不注入任何内容 |
| 宿主入口以合法配置加载与卸载 | 注入一条全局变量；卸载后不再注入 |
| 浏览器端：全局变量缺失 | `apply` 抛错，错误信息含 `__DSH_UI_COST_CONFIG__` |
| 浏览器端：全局变量中的值非法 | 再次校验失败并带出字段路径 |
| 浏览器端：合法值 | 配置条目整条覆盖内置价，未配置的模型保留内置价 |

**验证（2026-11-13 实际执行）**

| 命令 | 结果 |
|---|---|
| `vitest run packages/experimental/client-ui-cost` | 81 个用例全部通过。首轮 2 个失败：NaN 用例（`transform` 回调没有 `options`）与缺字段用例（外包 `transform` 后 `required` 失效），按 V-07 修改后通过 |
| 覆盖率（范围 `src/**`） | 分支 100%；`config.ts`、`index.ts`、`client/index.ts` 全覆盖；仍只差 T3 的两个注册函数 |
| `pnpm run typecheck` | 首次失败（测试中缺字段输入的类型断言），修正后通过（5/5） |
| `tsx scripts/run-oxlint.ts packages/experimental/client-ui-cost` | 首次报 3 个问题（动态 `delete`、两处返回 void 表达式的箭头函数），修正后通过 |
| `verify-cordis-config`、`verify-package-dependencies`、`verify-export-jsdoc`、`verify-locale-metadata`、`constraints` | 全部通过 |
| `pnpm run build:artifacts`，随后 `build:check` | 通过 |
| `pnpm run gen-config-catalog -- --check` | 生成后为最新 |
| `pnpm run duplication` | 0 处克隆 |

## T5 视图与语言包

**变更**

- 新增 `src/client/CostView.tsx`：合计卡（区域 A，`<section>` + `<dl>`）、部分加载提示（区域 C）、每轮明细表（区域 B，`<th scope="col">`，NFR-03）、空状态。计价在 `useMemo` 中调用 `priceSummary`（D-07），回退模型取 `useProjection('modelSelection')` 的 `lastUsed.model`。
- 新增 `src/client/cost.module.css`：布局与表格沿用 stats 的 token；合计卡使用 `docs/ui-radius.md` 的设置卡片材质（`--dsw-radius-xl`、`--dsw-alias-settings-card-fill` / `-stroke`）；字重不超过 500。
- 新增 `src/client/locales.ts`：命名空间 `cost`，8 种语言，中文为键集来源；PRD C-01～C-13 全部进入语言包。模型分隔符也放在语言包（中文、日文用顿号，其余用逗号，PRD C-04）。
- `src/client/index.ts`：在 T4 的配置检查之后注册语言包、两个 Definition、view target 和 `conversation.view` 页签（`id: 'cost'`、`order: 45`）；向视图注入快照源、生效价目表和 `loadOlder`；客户端入口导出 `Config`、`CostSnapshot`、`CostKey` 类型。
- `cost-builder.ts` 增加 `ConversationViewSnapshotMap` 合并（V-11）；`cost-contract.ts` / `cost-pricing.ts` 增加每轮未定价步数（V-10）。
- 新增 `src/css-modules.d.ts`（与 stats 相同）；`package.json` 与 `tsconfig.client.json` 补齐视图所需依赖和 references。
- 新增测试 `tests/cost-plugin.client.spec.ts`、`tests/cost-view.client.spec.tsx`；T4 的 `config.client.spec.ts` 中两条 `apply()` 用例移入插件测试（改用真实 Cordis 上下文）。

**用例覆盖**

| 设计要求 / AC | 用例 |
|---|---|
| FR-01 / AC-01 自动部分 | 注册后槽位中出现 `id: 'cost'`、`order: 45` 的条目，标签为"花费"；卸载插件后条目消失，语言包注销 |
| D-09 / AC-15 自动部分 | 页面无全局配置、或配置中单价非法时，插件加载失败；槽位、Definition、语言包都没有注册 |
| 真实装配引擎（`ConversationNodeAssembler`） | 两个 header 切换模型时每步归属正确；实时追加一步（FR-08）；窗口先缺起点和 header，`prepend` 更早页后开始时间和模型都恢复（R2、D-04） |
| UI-01 空状态 / AC-11 | 只显示 C-09，无合计卡、明细表和按钮 |
| UI-01 默认 / AC-05 | 合计 ¥0.1756、节省 ¥0.9594、模型"deepseek-flash、deepseek-v4-pro"、C-06 |
| AC-06 | 部分未定价轮次金额后有 `*`，可访问名称为"不含 1 步未定价"；整轮未定价显示"未定价"；合计卡"不含 2 步未定价" |
| AC-06 / PRD B-01 全部未定价 | 显示 C-10 与模型列表，不显示金额 |
| D-02 回退 | 窗口无 header 时按 `lastUsed` 计价 |
| AC-08 明细 | 表头与 `scope="col"`；每轮一行，token 列为 `100.0K` / `1.0K` |
| AC-10 自动部分 | 快照更新后金额与行数随之更新 |
| AC-13 | 英文词典渲染时标签、分隔符随之变化；locale parity 测试通过 |
| FR-07 / D-08 | C-08 计数；点击调用 `loadOlder`；`loadingOlder` 时显示状态且无按钮；`loadOlder` 被拒绝后显示 C-13 并可重试（控制台记录原因）；会话 `historyLoadStatus` 为 `error` 时显示 C-13；全部加载后提示消失 |

**验证（2026-11-13 实际执行）**

| 命令 | 结果 |
|---|---|
| `vitest run packages/experimental/client-ui-cost`（v8 覆盖率，范围 `src/**`） | 102 个用例全部通过；所有文件语句、分支、函数、行覆盖率均为 100%（T3 的两个注册函数已由插件测试覆盖） |
| `vitest run scripts/locale-dictionary-parity.spec.ts packages/client/ui-theme/tests` | 25 个文件、185 个用例通过（语言包对齐、主题样式规则） |
| `pnpm run typecheck` | 首次失败（测试中读取槽位 `inject` 的类型断言），修正后通过（5/5） |
| `tsx scripts/run-oxlint.ts packages/experimental/client-ui-cost` | 首次报 1 处超长行，修正后通过 |
| `verify-client-ui-i18n`、`verify-export-jsdoc`、`verify-package-dependencies`、`verify-locale-metadata` | 全部通过 |
| `pnpm run duplication` | 0 处克隆 |
| `pnpm run build:artifacts`，随后 `build:check` | 通过 |
| `pnpm run gen-config-catalog -- --check` | 最新 |

**未验证（按 `dsh-client-ui-ux` 的最低检查要求，交 T8）**

- 本会话没有浏览器工具，没有打开真实页面。尚未检查：浅色与深色主题下合计卡、表格、标记的颜色；窄宽度下合计卡换行与表格列宽；按钮的焦点、禁用与加载状态的实际渲染。T8 人工验收时按 README 启动后一并检查。
- 仓库要求用户可见的 GUI 改动在 PR 中附真实运行的 GIF（`record-browser-gif`），以及设计或产品评审；在提交 PR 前处理。

## T6 文档与生成产物

**变更**

- 新增 `packages/experimental/client-ui-cost/README.md`、`README.zh.md`（按 `dsh-doc-writing` 的 `package-reference` 模板，中英逐行对齐，均 149 行）与 `README.i18n.yaml`（`verify-translation-pairing --write` 生成）。内容覆盖 AC-14 要求的安装、配置、启动、验证命令，并在已知限制中写明 D-04 的"未定价"含义、R3 的低估、R2 的开始时间回退、节假日、旧模型 ID（T2 复核价目页的发现）和缓存写入单价。
- `packages/experimental/README.md` / `README.zh.md` 包列表新增本包一行，并重新记录 `README.i18n.yaml`（补完 V-04）。
- V-15 所列的登记与生成文件。

**事实核对（按 `dsh-doc-writing` 的要求实际运行）**

| README 中的说法 | 核对方式与结果 |
|---|---|
| `pnpm dsh web --patch apps/web/tests/client-ui-cost.overlay.yml` 可启动 | 加上 `pin-browse-picker` overlay、`--no-open --port 0` 实际启动：终端只输出 `dsh web: http://127.0.0.1:<port>/?token=…`，没有警告。用本地 curl（带登录 cookie）取首页：页面含 `__DSH_UI_COST_CONFIG__ = {"prices":{}}`，并加载 `client-ui-cost/client.js`。随后停止进程 |
| 单价非法时本插件不加载、DSH 照常运行、终端写明字段 | 用 scratchpad 中把 `deepseek-flash.peak.output` 设为 -1 的 overlay 实际启动：终端输出 `dsh: warning: 1 entry did not activate` 和 `ui-client-ui-cost (@deepseek-ai/dsh-client-ui-cost): ValidationError: invalid config: - $.prices.deepseek-flash.peak.output expected number >= 0 but got -1`，随后仍打印 `dsh web: http://…`，首页可正常取得。随后停止进程 |
| 本包测试命令 | `pnpm exec vitest run packages/experimental/client-ui-cost` 已在 T2～T5 多次实际运行 |
| 验证步骤 1～3（发送消息、切换页签、实时更新） | **未运行**：本机未设置 `DEEPSEEK_API_KEY`，也没有浏览器工具。交 T8 人工验收 |
| `DEEPSEEK_API_KEY` 可放在环境变量或根目录 `.env` | 依据仓库根 `AGENTS.md` 的说明，未在本次实际调用模型 |

**T8 待实测项的新结论**（来自上面的非法配置启动）：

- AC-15 ①：终端报错带字段路径，已观察到。
- AC-15 ③的一部分：DSH 整体启动成功，首页可取得；"对话"能完成一次真实对话、"统计"等页签可用，仍需 T8 在浏览器中确认。
- D-09 / CODE_DESIGN §4 的待验证项：宿主入口因配置无效未激活时，页面**没有**注入全局变量，但**仍然**加载 `client-ui-cost/client.js`。因此浏览器端"拿不到配置就抛错"这一检查是必要的；页签不出现、控制台有报错，需 T8 在浏览器中确认。

**验证（2026-11-13 实际执行）**

| 命令 | 结果 |
|---|---|
| `pnpm run verify-translation-pairing packages/experimental/README.md packages/experimental/client-ui-cost/README.md` | `--write` 后检查通过 |
| `pnpm run test:docs` | 首次 3 项失败：Model Experience 缺登记（已按 V-15 修正）、`mai-specs/README.md` 无中文对应页、`mai-specs/` 中的提交哈希引用 |
| `pnpm run doc-sync` | 首次 5 项失败：另有 client catalog、doc graphs、skill plugin package list 三项生成文件过期，重新生成后通过。**最终 41 项通过，2 项失败**：① `translation pairing`：`mai-specs/README.md` 缺少中文对应页，该文件来自初始化提交 `4f19dda33d`，与本次改动无关；② `repository references`：`mai-specs/` 下的文档引用提交哈希，包括已有的 TECH_DESIGN、design_review、TEST_PLAN，以及本报告任务进度表中的提交号 |
| `pnpm run typecheck`；`run-oxlint`（本包、改动的脚本与生成文件）；`git diff --check` | 通过 |

**负责人决定（2026-11-13）**：接受 `mai-specs/` 引起的这 2 项 `doc-sync` 失败，在根 README 的作业说明中注明，不改检查脚本。

## T7 覆盖率与构建

T7 的测试文件已随 T2～T5 交付，本任务只做整体复核，没有代码变更。

**验证（2026-11-13 实际执行，基线 `292b0ffb0f`）**

| 命令 | 结果 |
|---|---|
| `vitest run packages/experimental/client-ui-cost --coverage --coverage.include='packages/experimental/client-ui-cost/src/**'` | 8 个测试文件、102 个用例全部通过；语句 189/189、分支 106/106、函数 53/53、行 163/163，均为 100%；仓库配置的逐文件 100% 阈值没有报错 |
| `pnpm run build:artifacts`，随后 `pnpm run build:check` | 8/8、2/2 通过 |
| `pnpm run duplication` | 0 处克隆 |
| `pnpm run hygiene` | 23/24 通过；唯一失败为 `vendor rescope`，残留文件与 T1 记录的 4 个完全相同，本分支从 `50927f588e` 起的提交都没有改动它们 |

**未运行**：全仓的 `pnpm run test:coverage`（CI 的覆盖率门槛）。按仓库 `AGENTS.md`"不默认跑全量、由 CI 负责穷尽覆盖"的规则，本地只跑了本包范围；推送后以 CI 结果为准。

## 负责人决定（2026-11-13）

- 本作业不向上游提交 PR，因此仓库对 GUI PR 的 GIF 录制和设计 / 产品评审要求不适用，不执行。
- `doc-sync` 中由 `mai-specs/` 引起的 2 项失败接受，在根 README 的作业说明中注明（见 T6）。
- V-13 接受，PRD UI-01 空状态稍后回写。

## T8 人工验收

在负责人本机，以 `pnpm dsh web --patch apps/web/tests/client-ui-cost.overlay.yml --patch apps/web/tests/pin-browse-picker.overlay.yml` 启动，已配置 `DEEPSEEK_API_KEY`。逐项记录负责人的实际观察。

| 编号 | 检查项 | 关联 | 结果 |
|---|---|---|---|
| T8-1a | 页签出现 | AC-01 | **通过**。负责人截图（2026-11-13 21:28，英文界面，深色主题）：页签栏为 Chat、Trajectory、Cost，点开后显示合计卡与明细表 |
| T8-1b | 新会话空状态 | AC-11 | **真实运行中未观察到**。DSH 的新会话在发送首条消息前没有视图页签；负责人在回复流式输出期间停留在 Chat（截图 21:31:45），未看到 Cost 的空状态。该状态由单元测试 `shows only the empty state when no step recorded usage` 覆盖 |
| T8-1e | 第二个会话的金额 | AC-02、AC-03 | **通过**。新会话「介绍北京三段话」（截图 21:31:55）：输入 10.1K、输出 0.46K、¥0.0029，节省 ¥0.0090，模型 `deepseek-flash`。按空闲价反推：命中约 9.2K、其余输入约 0.9K，花费 ≈ 0.9K × 1 + 9.2K × 0.02 + 0.46K × 4 ≈ ¥0.0029，一致；输出不足 1K 显示为 `0.46K`，与统计页签格式一致（C-05） |
| T8-1c | 已有一轮的会话 | AC-02、AC-03、AC-04 | **通过**。合计 ¥0.0771、缓存节省 ¥0.6568、模型 `deepseek-flash`、C-06 说明在场，无未定价提示；明细 1 行：输入 703.7K、输出 7.6K、¥0.0771。按空闲价（北京时间周五 21:28）反推：节省 0.6568 = 命中 × (1 − 0.02) ÷ 10⁶，命中约 670.2K；其余输入约 33.5K；花费 ≈ 33.5K × 1 + 670.2K × 0.02 + 7.6K × 4 = ¥0.0773，与显示的 ¥0.0771 在取整误差内一致 |
| T8-2 | 实时更新与明细合计一致 | AC-10、AC-08 | **通过**。同一会话发送第二条消息后，负责人一直停留在 Cost 页签、未刷新，Turn 2 行自动出现（负责人口头确认；结束状态截图 21:33:38）。明细 ¥0.0029 + ¥0.0019 = ¥0.0048，合计卡 ¥0.0049：差 0.0001 来自每行先取整再显示，合计按未取整值累加，属 AC-08 允许的显示取整误差。缓存节省由 ¥0.0090 增至 ¥0.0192；按空闲价反推 Turn 2（命中约 10.4K、其余输入约 0.2K、输出 0.38K）≈ ¥0.0019，一致 |
| T8-1d | 深色主题外观 | UI 规范 | 合计卡材质、表头分隔线、金额字重（`--dsw-font-m-18`，500）在深色主题下可读 |
| T8-4 | 部分加载提示与加载更早 | AC-09、FR-07、D-08、BR-07 | **通过**。新会话「依次执行15条echo命令」共 4 轮（每轮 15 次 bash 调用），刷新页面后重开：Cost 显示"Only the 3 loaded turns are counted."与 Load earlier 按钮，明细为 Turn 2～4，¥0.0127 + ¥0.0251 + ¥0.0187 = 合计 ¥0.0565，无未定价（截图 21:44:21）。点击 Load earlier 后：出现 Turn 1（173.1K / 1.3K / ¥0.0126），提示与按钮消失，合计增至 ¥0.0692（各行和 ¥0.0691，差额为显示取整），Turn 2～4 的数值不变（截图 21:45:42）。缓存节省达到 ¥1 后显示为两位小数 `¥1.00`，符合 BR-07。"加载中"状态与 Chat 页签同步显示 Turn 1 未单独记录 |
| T8-5 | 一个会话用了两个模型 | AC-05、Q-05 | **通过**。会话「介绍北京三段话」第 4 轮切换到 V4-Pro（截图 21:47:57）：Models 显示 `deepseek-flash, deepseek-v4-pro`（英文逗号分隔，C-04）；Turn 4 计价 ¥0.0582，未显示未定价。按 v4-pro 空闲价、几乎无缓存命中反推：11.5K × 4.5 + 0.47K × 13.5 ≈ ¥0.0581，一致（切换模型后缓存未复用）。各行和 ¥0.0649，合计卡 ¥0.0650（显示取整） |
| T8-6 | 配置覆盖内置价格 | AC-07、D-06、BR-02 | **通过**。以把 `deepseek-flash` 空闲输出单价由 4 改为 8 的 overlay 重启（当前为空闲时段，故改空闲价而非 PRD 样例中的高峰价），2026-11-14 截图 20:02:22：Flash 三轮由 ¥0.0029 / ¥0.0019 / ¥0.0019 变为 ¥0.0048 / ¥0.0034 / ¥0.0034（增量 = 输出 token × 4 ÷ 10⁶）；V4-Pro 一轮仍为 ¥0.0582（未配置的模型保留内置价）；缓存节省仍为 ¥0.0299（只取决于输入单价）；合计 ¥0.0650 → ¥0.0699。重启日为周六，这些步骤仍按各自开始时间（周五 21:30 前后）计为空闲时段 |
| T8-7① | 单价非法：终端报错 | AC-15、D-05 | **通过**（2026-11-14 截图 20:08:41）：终端输出 `dsh: warning: 1 entry did not activate`、`ui-client-ui-cost (@deepseek-ai/dsh-client-ui-cost): ValidationError: invalid config:` 与 `- $.prices.deepseek-flash.peak.output expected number >= 0 but got -1 (at prices.deepseek-flash.peak.output)`，随后照常打印 `dsh web: http://127.0.0.1:3080/…`，服务启动 |
| T8-7② | 单价非法：页签不出现 | AC-15、D-09 | **通过**。以 `deepseek-flash.peak.output: -1` 的 overlay 重启（截图 20:04:50、20:07:17）：会话「介绍北京三段话」页签栏只有 Chat、Trajectory 和 \"…\"，页面无额外提示；\"…\" 菜单中只有 \"Browse other plugins\" 与 \"Create your plugin\"，没有 Cost（截图 20:09:14） |
| T8-7③ | 单价非法：浏览器控制台 | AC-15、PRD B-02、D-09 | **通过**（截图 20:05:52）：控制台出现黄色警告 `web boot: warning: 1 entry did not activate`，正文为 `@deepseek-ai/dsh-client-ui-cost: failed: Error: client-ui-cost: the page carries no __DSH_UI_COST_CONFIG__; the Host entry is not loaded or its price configuration is invalid`。说明宿主入口被拒后浏览器端代码仍下发并执行，在注册前抛错，由客户端启动流程捕获，只有本插件失败；D-09 的检查确有必要（与 T6 的 curl 观察一致）。同屏的 `[deepseek-account] account read failed` 来自账号插件，与本插件无关 |
| T8-7④ | 单价非法：DSH 其余功能 | AC-15 | **通过**（截图 20:07:17）：同一会话 20:06 发送「你好」，2 秒内正常回复；页签栏仍无 Cost |
| T8-8 | 改回合法配置后恢复 | AC-15 | **通过**（2026-11-14 截图 20:12:04）：以原 overlay 重启后 Cost 页签恢复，会话「介绍北京三段话」显示 5 行。Turn 1～3 恢复内置价 ¥0.0029 / ¥0.0019 / ¥0.0019，Turn 4 仍为 ¥0.0582；配置非法期间发送的 Turn 5（V4-Pro，周六 20:06 空闲时段）为 12.1K / 0.05K / ¥0.0033：缓存节省由 ¥0.0299 增至 ¥0.0816，按 V4-Pro 空闲价反推命中约 11.9K，花费 ≈ 0.2K × 4.5 + 11.9K × 0.15 + 0.05K × 13.5 ≈ ¥0.0034，一致；合计 ¥0.0650 + ¥0.0033 = ¥0.0683，与合计卡相同。插件失效期间的步骤仍在会话日志中，恢复后照常计价 |
| T8-3a | 浅色主题外观 | UI 规范 | **通过**（截图 21:36:44）：合计卡边框与底色、灰色表头与标签、表格分隔线、金额文字均可辨认；卡片边框较浅，与 DSH 设置卡片材质一致 |
| T8-3b | 窄宽度（约手机宽度，浅色） | UI 规范、NFR-03 | **通过**（截图 21:37:15）：C-06 说明换成两行且未截断；四列表格完整放下，无横向滚动；底部输入框不遮挡内容。合计卡三项在该宽度下仍在一行，换行（`flex-wrap`）未被触发 |

**T9 初步证据（来自 T8-1c）**：真实对话中该步模型被归为 `deepseek-flash` 且已计价（未显示"未定价"），说明记录的模型 ID 与内置价目表键 `deepseek-flash` 一致（Q-05）。`deepseek-v4-pro` 由 T8-5 确认（真实请求记录的模型 ID 为 `deepseek-v4-pro`，已计价）；**Q-05 对两个内置模型均已确认**。Q-02（`cacheWriteTokens` 实际值）需在 T9 中查看事件。

## T9 核实 Q-02、Q-05

**方法**：只读解码负责人本机 `~/.dsh/sessions/` 下 4 个会话的日志（`session.v4.jsonl.zstd`，多个 Zstandard 帧拼接）。Node 的 `zstdDecompressSync` 和流式解码都只读出第一帧（会话头），因此脚本改为调用仓库 `packages/session/session-persistence-jsonl/src/zstd.ts` 的 `scanZstdFrames` 与 `decompressZstdFrame` 逐帧解码。脚本位于会话 scratchpad，不进入仓库，不写会话文件。

**结果（2026-11-13）**

| 会话 | 事件行数 | `request/header` 中的模型 | 带用量的步骤 | `cacheWriteTokens` | 缓存命中合计 | 未命中输入合计 |
|---|---|---|---|---|---|---|
| `ffd415f5`（检查插件是否加载成功） | 185 | `deepseek-flash` | 19 | 全部为 0 | 670,208 | 33,466 |
| `2a830770`（介绍北京三段话） | 56 | `deepseek-flash`、`deepseek-v4-pro` | 4 | 全部为 0 | 30,464 | 12,848 |
| `6fcebc70` | 575 | `deepseek-flash` | 70 | 全部为 0 | 1,021,312 | 14,633 |
| `09c41e13` | 147 | `deepseek-flash` | 16 | 全部为 0 | 358,272 | 31,570 |

- **Q-02**：109 个带用量的步骤中，`cacheWriteTokens` 字段都存在且都为 0。DeepSeek 适配器映射了这个字段，但当前 DeepSeek API 不报告缓存写入量。BR-01 "写入按未命中单价"的规则实际不起作用，计价结果不受影响；README 中"缓存写入按未命中单价"的限制说明仍然成立。
- **Q-05**：`request/header` 的 `header.config.model` 实际值只有 `deepseek-flash` 和 `deepseek-v4-pro`，与 `BUILTIN_PRICES` 的键完全一致，与 T8-1c、T8-5 中这些步骤都已计价的观察一致。**Q-05 通过**，不需要模型 ID 映射。
- **交叉核对**：会话 `ffd415f5` 的命中合计 670,208、未命中输入 33,466，与 T8-1c 根据界面金额反推的"命中约 670.2K、其余约 33.5K"一致；会话 `2a830770` 的 12,848 + 30,464 = 43,312，与界面四行输入之和 10.1K + 10.6K + 11.1K + 11.5K = 43.3K 一致。

**PRD 回写**：Q-02、Q-05 的结论与 V-13 已由 `my-create-prd` 回写 PRD（2026-11-14，提交 `79f0875a6b`）。

**T8 结论**：AC-01、AC-02～AC-10、AC-15 的人工步骤全部通过；AC-11 的空状态只由单元测试覆盖（DSH 新会话在首条消息前没有视图页签，回复期间未切到 Cost）；AC-12 的金额格式在真实界面出现过 `¥1.00` 与四位小数两种形式；AC-13 只验证了英文界面（负责人界面为英文），其余 7 种语言由 locale parity 测试覆盖；AC-14 的 README 命令已在 T6 与 T8 中实际运行。

## 代码评审修复（P1-1、P1-2）

依据：[代码评审](../review/code_review.md)（2026-11-14，结论"有条件合并"）。用户选择 P1-1 方案 A。设计偏差见 V-16、V-17，设计文档未改，待编排者安排设计同步。

**变更（提交 `b1c72c69dd`）**

- `src/client/cost-contract.ts`：新增 `WindowFallback`。
- `src/client/cost-definition.ts`：route 的 State 和节点数据增加 `reason`（`RequestHeaderReason`）。
- `src/client/cost-builder.ts`：窗口内第一条 header 为 `series` 时，它之前的步骤沿用它的模型。
- `src/client/cost-pricing.ts`：新增 `rememberWindowModel`；`priceSummary` 改为接收 `WindowFallback | null`。
- `src/client/CostView.tsx`、`src/client/index.ts`：注入对象新增按会话的 `windowModel`；视图在 `useMemo` 中先更新这条记录，再计价。对相同输入重复执行会得到相同记录。
- README 中英文与 `README.i18n.yaml`：见 V-17。
- 测试：
  - 测试夹具中 header 的 `reason` 改为真实取值（原先写成对象 `{ kind: 'initial' }`）。
  - builder：`series` 沿用模型；`resume`、`change` 不沿用。
  - pricing：`rememberWindowModel` 的 5 种情况；按 `fromSeq` 应用回退；"无 header → 有 header"回归测试（合计单调增加，未定价为 0）。
  - 视图："无 header → 有 header"回归测试；切走页签再回来（重新挂载）后记录仍在。
  - 插件：真实装配引擎中实时追加 `resume` header 后两步都已计价；`series` header 使其之前的步骤得到模型；注入对象含 `windowModel`。

**验证（2026-11-14 实际执行）**

| 命令 | 结果 |
|---|---|
| `pnpm exec vitest run packages/experimental/client-ui-cost --coverage --coverage.include='packages/experimental/client-ui-cost/src/**'` | 8 个文件、114 个用例通过（原 102 个）；语句 196/196、分支 120/120、函数 54/54、行 169/169，均为 100% |
| `tsx scripts/run-oxlint.ts packages/experimental/client-ui-cost` | 首次报 1 处超长行（`rememberWindowModel` 签名），改为多行后无错误 |
| `pnpm run typecheck` | 通过（5/5） |
| `pnpm run verify-export-jsdoc`、`verify-client-ui-i18n`、`duplication` | 全部通过；0 处克隆 |
| `pnpm run build:artifacts`，随后 `pnpm run build:check` | 8/8、2/2 通过；`lib/client.js` 已包含新逻辑 |
| `pnpm run verify-translation-pairing packages/experimental/client-ui-cost/README.md` | 改动后报 3 节未同步，`--write` 重新记录后通过 |
| `pnpm run test:docs`、`pnpm run doc-sync` | 仍为原有 2 项失败（`mai-specs/README.md` 缺中文对应页、`mai-specs/` 中的提交哈希引用），负责人已于 2026-11-13 接受；README 相关检查通过 |

**未验证**

- P1-2：未在干净检出上执行 README 命令（TC-11 第 1 步）。需要新的 worktree，完成全量 `pnpm install` 和 `pnpm run build`，并在浏览器中观察页签，留待负责人或复评时执行。
- P1-1 的真实运行复验：重启 DSH 后，打开一个有 `hasMore` 的长会话，停在"花费"页签发送一条消息，合计应增加、不出现未定价。只有自动化证据，未做人工复验。
