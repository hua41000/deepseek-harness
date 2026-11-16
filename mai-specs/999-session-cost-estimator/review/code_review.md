# 999 代码评审：会话花费估算插件

> 首轮评审：2026-11-14，范围 `50927f588e..592ad20746` | 复评：2026-11-15，范围 `df25c3b516..4916cdbf28`（分支 `homework-1-build-plugin`，工作区干净） | 需求来源：[PRD](../spec/PRD.md)（AC-01～AC-15） | 设计：[技术方案](../design/TECH_DESIGN.md)、[代码设计附录](../design/CODE_DESIGN.md) | 实现记录：[实现报告](../dev/IMPLEMENTATION_REPORT.md)

[返回需求简报](../BRIEF.md)

## 0. 复评（2026-11-15）

### 0.1 结论

**有条件合并**：P0 为 0 项。首轮的 P1-1、P1-2、P2-1 均已关闭；修复 P1-1 时新引入 **P1-3**（见 §0.4），合并前需要修复或由负责人接受。

P1-1 的修复方向正确：`series` header 的推断有日志写入规则作依据，按会话保存的回退记录也解决了"无 header → 有 header"的实时转变，回归测试覆盖了单元、视图、重新挂载与真实装配引擎四层。问题在于这条记录假定窗口只会向前（加载更早）或向后（实时追加）增长，没有处理窗口被整体替换的情况。

### 0.2 范围与证据

| 项 | 值 |
|---|---|
| 基线 | `df25c3b516`（首轮评审提交） |
| Head | `4916cdbf28e677b2d96972acf7833ccee170bac7`（`git rev-parse HEAD`） |
| 工作区 | `git status --short` 为空 |
| 提交 | `b1c72c69dd`（P1-1、P1-2 修复）、`ce3152bc88`（实现报告）、`4916cdbf28`（PRD FR-02） |
| 变更规模 | 16 个文件，+238 / −51 |
| 重点文件指纹（blob） | `cost-pricing.ts` `f3362a7b`、`CostView.tsx` `870686b6`、`cost-builder.ts` `5dcee801`、`README.md` `04fe31aa` |

上下游核对（静态）：

- header 写入规则：`packages/core/agent-loop/src/agent.ts:681-697`。`series` 只在 `headerEquals(baseline, header)` 为真时写入，V-16 ① 的推断成立。
- `lastUsed` 更新：`packages/core/agent/src/model-selection.ts:81-84`，每条 `request/header` 都会更新，与 V-16 ② 的前提一致。
- 注入结果缓存：`packages/client/ui-renderer/src/client/scoped-slots.tsx:161-168`，按 (entry × 会话 binding) 缓存，`windowModel` 的生命周期与之相同。
- 窗口整体替换：`packages/api/gateway/src/client/journal-stream.ts:288-300`、`:370-390`（打开页、断线续传或缺口修复时发布 `type: 'replace'`）→ `packages/api/session-controller/src/client/sessions/session.ts:737-783`（`installWindow` 清除已加载的更早页，换成新的尾页）→ `packages/client/ui-conversation/src/client/conversation/assembly.ts:107-115`（`replaceWindow`）。

本次实际执行（仓库根目录，HEAD `4916cdbf28`）：

| 命令 | 退出码 | 观察 |
|---|---|---|
| `pnpm exec vitest run packages/experimental/client-ui-cost --coverage --coverage.include='packages/experimental/client-ui-cost/src/**'` | 0 | 8 个文件、114 个用例通过；语句 196/196、分支 120/120、函数 54/54、行 169/169 |
| `pnpm exec tsx scripts/run-oxlint.ts packages/experimental/client-ui-cost` | 0 | 无问题 |
| `pnpm run typecheck` | 0 | 5 项通过 |
| `pnpm run verify-translation-pairing packages/experimental/client-ui-cost/README.md` | 0 | 中英文 README 一致 |
| 探针 `C:\Users\hua41\AppData\Local\Temp\claude\ba20098f78ab3678\0bf6a737-f4b5-4d30-94a9-807e6b554a37\scratchpad\probe-replace.ts`（`tsx`，只导入受审源码） | 0 | 复现 P1-3，见 §0.4 |

**未执行**：`build:artifacts` / `build:check`（实现报告记录已通过，本次未复跑）、`doc-sync`、干净检出上的 README 命令（TC-11 第 1 步）、真实浏览器复验。

### 0.3 首轮发现的关闭情况

| 发现 | 状态 | 复核依据 |
|---|---|---|
| P1-1 实时 header 使已计价步骤变为未定价 | **关闭**（但修复引入 P1-3） | `cost-pricing.ts:88-97` `rememberWindowModel`、`:114` 按 `fromSeq` 应用回退；`CostView.tsx:101-104`；`index.ts:80`；`cost-builder.ts:48-49`（`series`）。回归测试：`cost-pricing.client.spec.ts` "keeps already priced steps priced when a live header enters a header-free window" 断言合计单调增加、未定价为 0；`cost-view.client.spec.tsx` 覆盖实时到达与重新挂载；`cost-plugin.client.spec.ts` 在真实装配引擎中追加 `resume` header。首轮探针场景现在得到"已计价 3、未定价 0" |
| P1-2 README 缺少构建命令 | **关闭**（静态） | 中英文 README 第 38-42 行的命令块加入 `pnpm run build`（第 40 行），并说明拉取改动后需重新构建，与根 `README.md:36-41` 的启动规则一致。干净检出实测仍未做（§0.5） |
| P2-1 FR-02 的"已计价步数" | **关闭** | 负责人决定删除；`spec/PRD.md:52` 已不含该项，修订记录第 340 行登记。与 UI-01、文案表一致，无需改代码 |

### 0.4 新发现

#### P1-3 窗口被整体替换后，旧的回退记录会按错误的模型计价，且不提示

| 项 | 内容 |
|---|---|
| 位置 | `packages/experimental/client-ui-cost/src/client/cost-pricing.ts:94-96`（`rememberWindowModel`）、`:114`；记录保存在 `src/client/index.ts:80` 的按会话注入对象中 |
| 触发条件 | ① 打开"花费"页签时窗口没有 header，记录 `{ model: X, fromSeq: a }`；② 之后用户切换到模型 Y 并继续对话（写入 `change` header）；③ 断线重连、缺口修复或会话重新打开时，窗口被替换为新的尾页，且这一页不含 Y 的 header（切换后对话超过一页） |
| 机制 | `rememberWindowModel` 只处理两种窗口变化：加载更早（`first.messageSeq < fromSeq` 时下移）和出现 header（冻结）。窗口被替换为更晚的后缀时，`first.messageSeq > fromSeq`，函数原样返回旧记录。新窗口中所有步骤的 `messageSeq ≥ a`、模型为 null，于是全部按 X 计价。V-16 ② 的前提"窗口没有 header 时 `lastUsed` 变化，说明 header 还在路上"在窗口替换后不成立：header 已经在日志里，只是不在新窗口内。新窗口带有 header 时也有同样问题：第一条 header（`resume` / `change`）之前的步骤会按旧记录计价，而不是按 D-04 记为未定价 |
| 影响 | 金额错误且不显示"未定价"提示，用户无法察觉，违反 AC-02、AC-05（按每步实际模型计价）。修复前这一场景会用当时的 `lastUsed`（Y）计价，结果正确，因此属于修复引入的回归。在同一会话内长时间停留并遇到重连的用户才会触发，发生概率中低 |
| 复现（已执行） | 探针：窗口 `[100, 110]` 无 header、`lastUsed = deepseek-flash`，得到记录 `{ flash, 100 }`；再把窗口替换为 `[500, 510]` 无 header、`lastUsed = deepseek-v4-pro`。结果：记录仍为 `{ flash, 100 }`，模型 `['deepseek-flash']`、合计 **¥0.0316**、已计价 2；按实际模型 v4-pro 计价应为 **¥0.1440**（修复前的行为也是 ¥0.1440） |
| 证据状态 | 纯函数行为已复现。UI 路径为静态推断：替换链路见 §0.2；注入对象在重连期间保持不变，依据是缓存键为会话 binding（`scoped-slots.tsx:161-168`）。若重连会产生新的 binding，记录随之重置，问题不会出现，但现有代码中没有找到这种重置 |
| 归因 | 本次修复新增（`b1c72c69dd`） |
| 是否阻断 | 建议合并前修复，修复成本小；或由负责人接受，并在 README 已知限制中写明 |
| 最小修复 | 窗口起点只会在被替换时后移（更早的页只会让起点前移，实时追加不改变起点，节点不会被删除）。在 `rememberWindowModel` 开头加入：`previous !== null && first !== undefined && first.messageSeq > previous.fromSeq` 时，把 `previous` 视为 null。之后沿用现有逻辑：新窗口无 header 时按当前 `lastUsed` 重新记录；有 header 时返回 null，按 D-04 记为未定价 |
| 复验 | 单元测试：`rememberWindowModel({ model: 'deepseek-flash', fromSeq: 100 }, 无 header 且从 500 开始的窗口, 'deepseek-v4-pro')` 应得到 `{ model: 'deepseek-v4-pro', fromSeq: 500 }`；从 500 开始且含 header 的窗口应得到 null。视图测试：先挂载无 header 窗口，再 `set` 一个起点更晚的窗口，断言金额按新的 `lastUsed` 计价 |

没有发现其他新问题。以下几项已核对：

- `series` 推断：只取窗口内**第一条** header，后续 header 照常逐条切换，`resume` / `change` 不沿用（`cost-builder.client.spec.ts` 两条用例）。
- `useMemo` 中写入 `windowModel.current`：对相同输入结果相同，React 严格模式重复执行不会改变结果。
- 首次挂载时若 `lastUsed` 尚未加载（null），不记录，之后窗口出现 header 时这些步骤按 D-04 记为未定价，与修复前一致。
- 测试夹具里 header 的 `reason` 已改为 `RequestHeaderReason` 的真实取值，新增的 `reason` 字段有类型约束。

### 0.5 待验证事项（复评后）

| 事项 | 状态 | 对合并判断的影响 | 完成条件 |
|---|---|---|---|
| P1-3 修复或负责人决定 | 未完成 | 前置条件 | 按 §0.4 修复并加入回归用例，或登记接受决定并更新 README 已知限制 |
| P1-1 真实运行复验 | 未执行 | 不阻断合并；AC-10 结项需要 | 重启 DSH 后打开有 `hasMore` 的长会话，停在"花费"页签发送一条消息，合计增加且不出现未定价 |
| P1-2 / TC-11 第 1 步：干净检出上执行 README 命令 | 未执行 | 不阻断合并；AC-14 结项需要 | 在新 worktree 中只执行 README 的三条命令，"花费"页签出现 |
| 设计同步 V-16、V-17 | 未完成（实现报告注明待编排者安排） | 不阻断 | TECH_DESIGN §2.1.2、§3 R1 与 CODE_DESIGN 对应小节更新；若修复 P1-3，一并写入"窗口替换后重新记录" |
| 首轮 §4 中 TC-06、TC-10、TC-12、keyless Web e2e 等 | 状态未变 | 同首轮 | 同首轮 |

---

以下为首轮评审内容（2026-11-14），保留作为记录；各发现的当前状态以 §0.3 为准。

## 1. 总体结论

**有条件合并**：P0 为 0 项，P1 为 2 项，P2 为 1 项。

代码结构清晰，与设计、仓库约定（Host / Client 编译面拆分、注册走 effect、配置校验 fails loud、语言包、导出 JSDoc）一致。计价、时段、格式、配置校验的单元测试扎实，本包 `src` 覆盖率 100%。T8 人工验收与 T9 实测数据可信。

合并前需要满足两个条件：

1. **P1-1**：实时更新时，已计价的步骤会被改成"未定价"，合计金额反而下降，违反 AC-10。已用探针复现。需要修复，或由负责人明确接受，并收窄 AC-10 的范围。
2. **P1-2**：插件 README 的启动步骤缺少构建命令。在干净检出上照做，"花费"页签不会出现，AC-14 / TC-11 不成立。改 README 一行即可。

## 2. 范围与证据

### 2.1 比较对象

| 项 | 值 |
|---|---|
| 基线 | `50927f588e`（实现开始前的最后一个规格提交） |
| Head | `592ad20746`（`git rev-parse HEAD`） |
| 工作区 | `git status --short` 为空；staged、unstaged、untracked 均无内容 |
| 变更规模 | 58 个文件，+3326 / −141（`git diff --stat 50927f588e..HEAD`） |
| 重点文件指纹（blob） | `CostView.tsx` `a35a20a5`、`cost-pricing.ts` `9d6c4c0c`、`README.md` `c17e9b22` |

审查对象：

- `packages/experimental/client-ui-cost/` 全部源码、测试与 README。
- 仓库登记：`scripts/experimental-package-policy.ts`、`scripts/verify-package-readme-model-experience.ts`、`tsconfig.base.json`、根 `tsconfig.host.json` / `tsconfig.client.json`、`apps/web/tests/client-ui-cost.overlay.yml`、`packages/experimental/README*`。
- 生成文件：`docs/config-catalog*.md`、`docs/event-producer-consumer*.md`、`slot-catalog.ts`、`packages.md`、`pnpm-lock.yaml`。
- `mai-specs/` 下的文档只作为需求与设计输入核对，不评其写作质量。

上下游核对：

- `request/header` 的写入时机：`packages/core/agent-loop/src/agent.ts:681-697`。
- `modelSelection.lastUsed` 的更新规则：`packages/core/agent/src/model-selection.ts:76-84`。
- `ConversationViewBuilder` 接口：`packages/client/ui-conversation/src/client/contract/conversation.ts:288-313`。
- stats 的步骤 id 方案：`packages/experimental/client-ui-stats/src/client/stats-definition.ts:86`。
- documentpreview 的双编译面配置。
- 根 `README.md:36-41` 与 `docs/development.md:191-196` 的启动约定。

### 2.2 本次实际执行的检查

均在仓库根目录、HEAD `592ad20746` 上执行。

| 命令 | 退出码 | 观察 |
|---|---|---|
| `pnpm exec vitest run packages/experimental/client-ui-cost --coverage --coverage.include='packages/experimental/client-ui-cost/src/**'` | 0 | 8 个文件、102 个用例通过；语句 189/189、分支 106/106、函数 53/53、行 163/163 |
| `pnpm exec tsx scripts/run-oxlint.ts packages/experimental/client-ui-cost` | 0 | 无问题 |
| `pnpm run verify-client-ui-i18n` | 0 | 1318 个文件通过 |
| `pnpm run duplication` | 0 | 0 处克隆 |
| `pnpm run typecheck` | 0 | 5 项通过 |
| `pnpm run gen-config-catalog -- --check` | 0 | 3 个产物为最新 |
| 探针 `scratchpad/probe-live-header.ts`（`tsx`，只导入受审源码，不改仓库） | 0 | 复现 P1-1，见 §3 |
| `grep "as unknown\|<unknown>\|as any"`（本包 `src`、`tests`） | — | 无新增 `unknown` / `any` 断言 |

**未执行**：

- `pnpm run build`、`build:check`、`hygiene`、`doc-sync`：实现报告 T7、T6 已记录结果，本次未复跑。
- 全仓 `test:coverage`。
- 任何真实浏览器或真实 API 验证。

### 2.3 AC 对应

| AC | 实现位置 | 证据 | 评审判断 |
|---|---|---|---|
| AC-01 页签可见 | `src/client/index.ts:61-82` | 插件测试；T8-1a | 满足 |
| AC-02 高峰计价 | `cost-pricing.ts:33-67` | 单元测试；T8 反推 | 满足 |
| AC-03 时段与时区 | `cost-pricing.ts:33-39` | 单元测试（含边界与 `America/Los_Angeles`） | 满足 |
| AC-04 缓存节省 | `cost-pricing.ts:65` | 单元测试；T8-1c | 满足 |
| AC-05 多模型 | `cost-builder.ts:27-53` | 单元测试与装配引擎测试；T8-5 | 满足 |
| AC-06 未定价 | `cost-pricing.ts:84-128`；`CostView.tsx:35-78` | 单元测试与视图测试 | 满足 |
| AC-07 配置覆盖 | `cost-pricing.ts:46-48`；`config.ts` | 单元测试；T8-6 | 满足 |
| AC-08 明细与合计一致 | `cost-pricing.ts:120-127` | 单元测试；T8-2、T8-4 | 满足（显示取整误差属 AC 允许范围） |
| AC-09 部分加载 | `CostView.tsx:104-115` | 视图测试；T8-4 | 满足 |
| AC-10 实时更新 | `cost-definition.ts:56`；`CostView.tsx:89-95` | 视图测试与装配引擎测试；T8-2 | **不完全满足**（P1-1） |
| AC-11 空状态与无用量 | `cost-definition.ts:62-64`；`CostView.tsx:119-123` | 单元测试与视图测试；真实运行未观察到 | 满足（只有自动化证据） |
| AC-12 金额格式 | `cost-format.ts:14-17` | 单元测试；T8 中出现过 `¥1.00` | 满足 |
| AC-13 本地化 | `locales.ts` | i18n 门禁、parity 测试；T8 只看了英文 | 静态部分满足；中文界面切换未实测（§4） |
| AC-14 按 README 可运行 | `README.md:37-42` | T6、T8 在**已构建**的本机运行 | **不成立**（P1-2） |
| AC-15 配置无效 | `config.ts:19-55`；`src/client/index.ts:37-44` | host 与插件负例测试；T8-7①～④、T8-8 | 满足 |

另有一项 FR 条款未落地，见 P2-1（FR-02 的"已计价步数"）。

## 3. 关键发现

### P1-1 实时更新时，已计价步骤会变成"未定价"，合计下降（2026-11-15 复评：已关闭，见 §0.3）

| 项 | 内容 |
|---|---|
| 位置 | `packages/experimental/client-ui-cost/src/client/cost-pricing.ts:85`、`src/client/cost-builder.ts:52`、`src/client/CostView.tsx:90` |
| 触发条件 | 已加载窗口里没有任何 `request/header`（长会话、`hasMore` 为真时常见），然后会话**实时**追加一条 `request/header`。在以下三种常见情况下，即使模型没有变，也会写入这条 header：<br>① DSH 重启后的第一次请求，`agent.ts:681-688`，reason 为 `resume`，进程内第一次请求必写；<br>② 压缩后开始新的请求序列，`agent.ts:695-696`，reason 为 `series`，header 与上一条相同；<br>③ 工具集变化，`agent.ts:689-694`，reason 为 `change`，模型可能没变 |
| 机制 | `priceSummary` 只在 `!snapshot.windowHasHeader` 时使用 `lastUsed` 作为回退。新 header 一进入窗口，`windowHasHeader` 就变为 true，回退整体失效。新 header 之前的所有步骤在窗口内找不到更早的 header，`model` 为 null，于是按 D-04 记为未定价 |
| 影响 | 用户停在"花费"页签发一条消息后，原来已计价的步骤全部变成未定价，合计反而下降，并出现"不含 N 步未定价"。这与 AC-10 的"合计金额增加"、FR-08 相反。整个过程不需要切换模型，因此 D-04 当时的取舍理由（"模型切换前的步骤"，风险 R1）不能覆盖这一场景 |
| 复现（已执行） | 探针构造 3 个窗口内步骤（无 header），`lastUsed = deepseek-flash`：合计 ¥0.0474、已计价 3、未定价 0。追加 `route(350, 'deepseek-flash')` 与一步新步骤后：**合计 ¥0.0158、已计价 1、未定价 3** |
| 归因 | 本次新增。设计 §2.1.2 第 3 点按"窗口内是否有 header"做二值判断，实现与设计一致；问题出在设计没有分析实时追加 header 这一转变。现有测试（`cost-pricing.client.spec.ts` 中 "uses the last used model only when the window has no request header"，以及插件测试 "adds a live step"）都没有覆盖"无 header → 有 header"的转变。T8-2 是在全部加载、窗口内已有 `initial` header 的会话中做的，所以没有触发 |
| 是否阻断 | **阻断 AC-10 的结项**。是否阻断合并，由负责人在下面两个方案中选择 |
| 最小修复 | 方案 A（推荐，正确且只改浏览器端）：<br>① builder 记录窗口内第一条 header 的 seq，以及 header 的 `reason`；<br>② reason 为 `series` 的 header 与上一条 header 相同（`agent.ts:695` 的分支只在 `headerEquals` 时进入），它之前的步骤可以直接沿用它的模型；<br>③ 视图在 `windowHasHeader` 为 false 时记住当时的 `lastUsed`。之后有 header 实时到达时，把这个模型继续用于 seq 小于第一条 header 的步骤。依据是 R6 已核实窗口是日志的连续后缀，所以这样推断成立。<br>方案 B：负责人接受该行为，在 README 已知限制和 PRD AC-10 中写明"实时追加 header 后，窗口开头的步骤可能转为未定价，加载更早后恢复"，并登记决策 |
| 复验 | 增加单元测试：先 `replace` 一个无 header 的窗口，再 `apply` 一条 header 和一步新步骤，断言原有步骤仍按原模型计价、合计单调增加。另加一条 `series` header 的用例。人工复验：重启 DSH 后打开一个有 `hasMore` 的长会话，停在"花费"页签发送一条消息，合计应增加 |

### P1-2 README 的启动步骤缺少构建命令，干净检出上 AC-14 不成立（2026-11-15 复评：已关闭，见 §0.3）

| 项 | 内容 |
|---|---|
| 位置 | `packages/experimental/client-ui-cost/README.md:37-42`、`README.zh.md:37-42` |
| 触发条件 | 在干净检出，或在本包加入前已构建过的检出上，按插件 README 执行 `pnpm install` 和 `pnpm dsh web --patch apps/web/tests/client-ui-cost.overlay.yml` |
| 机制 | 根 `README.md:36-41` 写明 `pnpm dsh web` "uses those built artifacts without rebuilding"。`docs/development.md:191-195` 也说明 Web 的 Host 从源码运行，但浏览器加载的是已构建的 bundle。没有 `pnpm run build`（或 `build:artifacts`）时，`packages/experimental/client-ui-cost/lib/client.js` 不存在（`lib/` 被 `.gitignore:7` 忽略） |
| 影响 | AC-14 要求"按插件 README 的步骤**构建**、启用插件并启动"，TC-11 要求"README 中的每条命令无需额外步骤即可成功执行"。T6 与 T8 都是在本机已有构建产物的情况下运行的，不能证明这一点 |
| 证据状态 | 静态推断，依据仓库文档写明的启动规则；没有删除构建产物做实测 |
| 是否阻断 | 阻断 AC-14 结项；修复成本为一行 |
| 最小修复 | 在中英文 README 的两条命令之间加入 `pnpm run build`（或 `pnpm run build:artifacts`），或改为 `pnpm run dev:web --patch apps/web/tests/client-ui-cost.overlay.yml`。改后运行 `verify-translation-pairing` |
| 复验 | 在新 worktree 中只执行 README 中的命令，确认"花费"页签出现（即 TC-11 第 1 步） |

### P2-1 FR-02 要求的"已计价步数"没有显示，PRD 内部不一致（2026-11-15 复评：已关闭，见 §0.3）

| 项 | 内容 |
|---|---|
| 位置 | `src/client/CostView.tsx:35-66`；PRD FR-02（`spec/PRD.md` 第 4.1 节） |
| 现象 | FR-02 的预期行为列有"已计价步数"。但 UI-01 区域 A、线框和文案表 C-01～C-13 都没有这一项，设计也没有规划它的显示。实现只计算 `pricedSteps`，用来判断"全部未定价"，没有显示出来 |
| 归因 | 需求文档前后不一致。实现跟随 UI-01 与文案表，不算代码缺陷 |
| 建议 | 由负责人决定：从 FR-02 删除"已计价步数"，或补充文案 ID 并显示。前者不需要改代码 |

没有发现 P0 问题。以下几项已经检查过，没有发现问题：

- 配置校验对负数、NaN、Infinity、字符串、缺字段都会报错。
- 浏览器端拿不到全局配置时直接抛错，不回退到内置价（D-09）。
- 原型链键（如 `toString`）不会被当成模型 ID 匹配。
- 模型归属与事件到达顺序无关。
- 注册都走 effect，卸载后页签和语言包都会清除。
- 步骤 id 方案与 stats 相同。
- `ConversationViewBuilder` 接口没有删除节点的通道。本包的节点一旦发布就不会变成 null，所以只处理 upserts 是安全的。

## 4. 待验证事项

| 事项 | 状态 | 对合并判断的影响 | 完成条件 |
|---|---|---|---|
| P1-1 修复或负责人决定 | 未完成 | 前置条件 | 采用方案 A 并加上 §3 中的回归用例，或按方案 B 登记决策并修订 AC-10 |
| P1-2 README 修复后，在干净检出上运行 | 未执行 | 前置条件（AC-14） | 完成 TC-11 第 1 步 |
| TC-06：窗口内有模型切换，加载更早后未定价减少（R1 的业务证据） | 未执行。T8 没有覆盖"部分窗口 + 模型切换" | 不阻断，但 D-04 的"加载更早后自动消失"没有真实证据 | 人工执行或用 keyless Web e2e |
| TC-10 / AC-13：中文界面切换 | 未执行。T8 只看了英文界面 | 不阻断 | 切换到中文界面查看各状态 |
| TC-12 / NFR-02：断网计价 | 未执行 | 不阻断。代码中没有网络调用（静态确认） | 断网后打开页签 |
| keyless Web e2e（TC-05～TC-07） | 没有建立 | 不阻断。README 已在已知限制中说明 | 是否补充由编排者交 `my-create-test-plan` 决定 |
| recorded-session 快照、GIF、设计评审 | 负责人 2026-11-13 决定不向上游提交 PR，不执行 | 只在决定提交上游时才影响 | — |
| `doc-sync` 有 2 项失败（来自 `mai-specs/`）、`hygiene` 的 `vendor rescope` 失败（基线既有问题） | 负责人已接受；本次未复跑 | 只在上游 CI 才影响 | — |
| 全仓 `test:coverage` | 未执行（由 CI 负责） | 本包已达到逐文件 100% | 以 CI 结果为准 |

## 5. 其他建议

- 英文文案 C-07、C-08 在 count 为 1 时读作 "Excludes 1 unpriced steps"、"Only the 1 loaded turns are counted."。文案由 PRD 维护，如需改用复数形式，应先改 PRD 的文案表，再改语言包。
- BRIEF 的 Phase 仍为 `draft`。本评审不修改 BRIEF，由编排者按结论更新。
- （2026-11-15 复评）英文 C-07、C-08 的单复数建议仍然有效，状态未变。
