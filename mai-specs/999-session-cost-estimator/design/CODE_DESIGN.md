# 会话花费估算插件 代码设计（供评审）

[返回技术方案](TECH_DESIGN.md)

> 状态：已按实现同步（2026-11-14，代码基线 `a9f6f7694f`）。依据[实现报告](../dev/IMPLEMENTATION_REPORT.md)的偏差 V-05～V-08、V-10、V-12、V-13 和 T3、T4、T6、T8 的核实结论。
>
> 以下片段是**供评审的摘录与示意**，不是源码副本：已按实际实现改写关键类型与逻辑，省略了 import、JSDoc、lint 所需的写法调整和 React 样板，省略处已标明。实现与测试结果以 `packages/experimental/client-ui-cost/` 的源码和实现报告为准。

## 1. 类型（`cost-contract.ts`）

```ts
/** 元 / 百万 token。 */
export interface UnitPrices { readonly cacheHit: number; readonly cacheMiss: number; readonly output: number }
export interface ModelPrices { readonly peak: UnitPrices; readonly offPeak: UnitPrices }
export type PriceTable = Readonly<Record<string, ModelPrices>>
export type PricePeriod = 'peak' | 'offPeak'

/** 一个带 usage 的步骤；没有 usage 的步骤不产生节点（BR-06）。 */
export interface CostStep {
  readonly turn: number
  readonly step: number
  readonly startTime: number      // step/start.time；起点不在窗口内时为 assistant/message.time（R2）
  readonly messageSeq: number     // 用于与 request/header 比较先后
  readonly miss: number           // usage.inputTokens（与 cacheRead、cacheWrite 互不重叠，见 stats-usage.ts）
  readonly hit: number            // usage.cacheReadTokens ?? 0
  readonly write: number          // usage.cacheWriteTokens ?? 0
  readonly output: number         // usage.outputTokens
}

/** 带模型的步骤：model 为 null 表示窗口内推不出（V-05：由内联交叉类型提取为具名接口，字段相同）。 */
export interface AttributedCostStep extends CostStep {
  readonly model: string | null
}

/** builder 输出。 */
export interface CostSnapshot {
  readonly steps: readonly AttributedCostStep[]   // 按 messageSeq 排序
  readonly windowHasHeader: boolean
}

export interface CostTurnRow {
  readonly turn: number
  readonly input: number          // miss + hit + write（FR-03）
  readonly output: number
  readonly cost: number | null    // 整轮未定价时为 null
  readonly partial: boolean       // 有部分步骤未定价
  readonly unpricedSteps: number  // 该轮未定价步数；部分未定价标记的 C-07 文案需要 {count}（V-10）
}

export interface CostSummary {
  readonly total: number
  readonly savings: number
  readonly models: readonly string[]
  readonly pricedSteps: number
  readonly unpricedSteps: number
  readonly turns: readonly CostTurnRow[]
}
```

审查点：

- `CostStep` 把 usage 拆成四个非可选数字，后续计价不再处理 `undefined`。`inputTokens` 和 `outputTokens` 在 `TokenUsage` 中是必填字段，`cacheRead` 和 `cacheWrite` 是可选字段，缺省按 0。
- 没有引入 `Branded` 类型。`model` 是 LLM 路由 ID，仓库中的 `LlmCallConfig.model` 本身就是 `string`。
- `AttributedCostStep` 是具名接口，测试与 builder 都直接构造它（V-05）。
- `CostTurnRow.unpricedSteps` 与 `partial` 同时存在：`partial` 决定是否显示标记，`unpricedSteps` 提供标记 `title` / `aria-label` 中 C-07 的计数（V-10）。

## 2. 模型归属（`cost-builder.ts`）

Definitions（`cost-definition.ts`）只做事件到节点的映射。`cost-step` 不复制 stats 的折叠状态机：State 只保存 `step/start` 的时间，用量直接从 `context.matches` 中最后一条 `assistant/message` 读取（V-06）：

```ts
export const costStepDefinition: ConversationNodeDefinition<number> = {
  kind: 'cost-step',
  target: TARGET,
  match: (event) => {
    if (event.type !== 'step/start' && event.type !== 'assistant/message') return null
    return { id: `${event.data.turn}:${event.data.step}`, role: event.type === 'step/start' ? 'start' : 'update' }
  },
  start: (_context, match) => match.event.time,      // State = step/start 的时间
  update: context => context.state,
  publication: match => (match.event.type === 'step/start' ? 'none' : 'immediate'),   // FR-08
  buildViewNode: (context) => {
    // 取 context.matches 中最后一条 assistant/message（循环省略）
    const usage = message?.data.usage
    if (message === undefined || usage === undefined) return null   // BR-06：取消、失败或未完成的步骤不计价
    return costNode(context, { kind: 'step', step: {
      turn: message.data.turn, step: message.data.step,
      startTime: context.state ?? message.time,   // R2：起点不在窗口内时引擎不调用 start，State 为空
      messageSeq: message.seq,
      miss: usage.inputTokens, hit: usage.cacheReadTokens ?? 0,
      write: usage.cacheWriteTokens ?? 0, output: usage.outputTokens,
    } })
  },
}

// cost-route：match request/header → { id: `${event.seq}`, role: 'start' }；
// start 保存 { seq, model: header.config.model }，buildViewNode 产出 { kind: 'route', seq, model }。
```

决定正确性的代码在 builder 中：

```ts
/** 为每步确定模型：取该步 assistant/message 之前最近一条 request/header。 */
export function attributeModels(nodes: Iterable<CostViewNode>): CostSnapshot {
  const routes: { seq: number; model: string }[] = []
  const steps: CostStep[] = []
  for (const node of nodes) {
    switch (node.data.kind) {
      case 'route': routes.push(node.data); break
      case 'step': steps.push(node.data.step); break
      default: assertNever(node.data)
    }
  }
  routes.sort((a, b) => a.seq - b.seq)
  steps.sort((a, b) => a.messageSeq - b.messageSeq)
  let cursor = -1
  const attributed = steps.map((step) => {
    // 两个序列都已按 seq 递增排序，用单指针推进，整体 O(n log n)。
    while (cursor + 1 < routes.length && routes[cursor + 1]!.seq < step.messageSeq) cursor++
    return { ...step, model: cursor >= 0 ? routes[cursor]!.model : null }
  })
  return { steps: attributed, windowHasHeader: routes.length > 0 }
}
```

builder 沿用 `StatsSnapshotBuilder` 的 `replace` / `apply` 接口：维护 `Map<key, node>`，每次变化后调用 `attributeModels(map.values())`。只沿用接口，不复制代码；`pnpm run duplication` 为 0 处克隆。实际实现中两个指针访问去掉了非空断言（lint 规则 `no-non-null-assertion`），封闭联合的 `default` 分支调用 `assertNever`。

`cost-builder.ts` 另外声明类型合并，使 `ctx.uiConversation.binding(id).target('cost')` 能取得 `CostSnapshot`（TECH_DESIGN §2.1.3，V-11）：

```ts
declare module '@deepseek-ai/dsh-client-ui-conversation/client' {
  interface ConversationViewSnapshotMap {
    cost: CostSnapshot
  }
}
```

审查点：

- **为什么用 `<` 而不是 `≤`**：`request/header` 在同一步内先于 `assistant/message` 写入，两者 seq 不会相等。
- **不变量**：同一 seq 前缀下，结果只取决于节点集合，与 `prepend` 或 `apply` 的顺序无关，所以分页和实时更新不会造成错配。T3 用打乱顺序的输入、T5 用真实 `ConversationNodeAssembler` 的 `prepend` 验证。
- **R6 已核实**（T3）：`ui-conversation` 的 `replaceWindow` 参数为 "complete contiguous window"，`prepend` 只加入更早的事件，窗口总是日志的连续后缀；视图层的 `lastUsed` 回退保留。

## 3. 计价与汇总（`cost-pricing.ts`）

```ts
/** PRD R-01 内置价目表；业务数据，部署方通过 config.prices 覆盖（BR-04）。 */
export const BUILTIN_PRICES: PriceTable = {
  'deepseek-flash': { peak: { cacheHit: 0.04, cacheMiss: 2, output: 8 }, offPeak: { cacheHit: 0.02, cacheMiss: 1, output: 4 } },
  'deepseek-v4-pro': { peak: { cacheHit: 0.30, cacheMiss: 9, output: 27 }, offPeak: { cacheHit: 0.15, cacheMiss: 4.5, output: 13.5 } },
}

const BEIJING_OFFSET_MS = 8 * 3_600_000 // 协议常量：DeepSeek 时段按北京时间定义

/** BR-02：周一至周五 [09:00,12:00) ∪ [14:00,18:00) 为高峰；不识别节假日。与浏览器时区无关。 */
export function pricePeriod(epochMs: number): PricePeriod {
  const beijing = new Date(epochMs + BEIJING_OFFSET_MS)
  const day = beijing.getUTCDay()                 // 0 = 周日
  if (day === 0 || day === 6) return 'offPeak'
  const minute = beijing.getUTCHours() * 60 + beijing.getUTCMinutes()
  const peak = (minute >= 540 && minute < 720) || (minute >= 840 && minute < 1080)
  return peak ? 'peak' : 'offPeak'
}

/** BR-04：整条替换（D-06），配置优先。 */
export function resolvePrices(configured: PriceTable): PriceTable {
  return { ...BUILTIN_PRICES, ...configured }
}

/** BR-01 + BR-03；单价未知时返回 null（BR-05）。 */
export function priceStep(step: CostStep, model: string | null, table: PriceTable): { cost: number; savings: number } | null {
  if (model === null || !Object.hasOwn(table, model)) return null   // hasOwn：防止 'toString' 等原型链上的键被当成模型
  const unit = table[model]![pricePeriod(step.startTime)]
  const cost = (step.miss * unit.cacheMiss + step.hit * unit.cacheHit + step.write * unit.cacheMiss + step.output * unit.output) / 1_000_000
  const savings = step.hit * (unit.cacheMiss - unit.cacheHit) / 1_000_000
  return { cost, savings }
}

/**
 * 汇总一个快照（在 CostView 的 useMemo 中调用）。
 * @param fallbackModel - modelSelection.lastUsed?.model；仅当窗口内没有任何 request/header 时使用。
 */
export function priceSummary(snapshot: CostSnapshot, table: PriceTable, fallbackModel: string | null): CostSummary {
  const fallback = snapshot.windowHasHeader ? null : fallbackModel   // D-02 / D-04
  const turns = new Map<number, { input: number; output: number; cost: number; priced: number; unpriced: number }>()
  const models = new Set<string>()
  let total = 0, savings = 0, pricedSteps = 0, unpricedSteps = 0
  for (const step of snapshot.steps) {
    const model = step.model ?? fallback
    if (model !== null) models.add(model)
    const row = turns.get(step.turn) ?? { input: 0, output: 0, cost: 0, priced: 0, unpriced: 0 }
    row.input += step.miss + step.hit + step.write
    row.output += step.output
    const priced = priceStep(step, model, table)
    if (priced === null) { row.unpriced++; unpricedSteps++ }
    else { row.cost += priced.cost; row.priced++; total += priced.cost; savings += priced.savings; pricedSteps++ }
    turns.set(step.turn, row)
  }
  return {
    total, savings, models: [...models], pricedSteps, unpricedSteps,
    turns: [...turns].sort(([a], [b]) => a - b).map(([turn, r]) => ({
      turn, input: r.input, output: r.output,
      cost: r.priced === 0 ? null : r.cost,
      partial: r.priced > 0 && r.unpriced > 0,
      unpricedSteps: r.unpriced,               // V-10
    })),
  }
}
```

对照 PRD 验算（单元测试将使用这些数据）：

- AC-02：flash 高峰。10 000×2 + 90 000×0.04 + 1 000×8 = 31 600，÷10⁶ 得 0.0316。
- AC-04：90 000×(2−0.04)/10⁶ = 0.1764。
- AC-07：输出单价 16 时为 0.0316 + 1 000×8/10⁶ = 0.0396。

审查点：

- 实际实现中 `pricePeriod` 用区间表 `PEAK_MINUTES` 判断时段，`priceStep` 去掉了非空断言；行为与上面的示意相同，AC-02～AC-07、AC-12 由 `tests/cost-pricing.client.spec.ts`、`tests/cost-format.client.spec.ts` 覆盖（实现报告 T2）。
- 模型列表包含未定价但模型已知的模型，PRD C-04 未区分这两种情况。
- 金额用 `number` 累加。单步误差在 1e-15 量级，远低于 BR-07 的显示精度，不引入十进制库。

## 4. 配置与宿主入口（`config.ts`、`index.ts`）

```ts
// src/config.ts —— 宿主与浏览器共用（同时列入两个编译面，TECH_DESIGN §2.3.1）
export const CONFIG_GLOBAL = '__DSH_UI_COST_CONFIG__'          // 两端共用的全局变量名（V-08）

// 范围检查拒绝负数；max(Number.MAX_VALUE) 拒绝 Infinity
const price = z.number().min(0).max(Number.MAX_VALUE).required()
const unitPrices: z<UnitPrices> = z.object({ cacheHit: price, cacheMiss: price, output: price })
const modelPrices: z<ModelPrices> = z.object({ peak: unitPrices.required(), offPeak: unitPrices.required() })

/** NaN 能通过所有范围检查，transform 回调又拿不到字段路径，因此整表检查一次并自行拼出路径（V-07）。 */
function rejectNaN(table: PriceTable): PriceTable {
  for (const [model, prices] of Object.entries(table))
    for (const period of ['peak', 'offPeak'] as const)
      for (const field of ['cacheHit', 'cacheMiss', 'output'] as const)
        if (Number.isNaN(prices[period][field]))
          throw new z.ValidationError('expected a finite number but got NaN', { path: ['prices', model, period, field] })
  return table
}

export interface Config { prices: PriceTable }
export const Config: z<Partial<Config>, Config> = z.object({
  // transform 只包住 prices 字典；包在整个对象外会使内层 default({}) 与 required 失效
  prices: z.transform(z.dict(modelPrices), rejectNaN).default({}),
})

// src/index.ts —— 宿主入口：只写入页面，不提供服务
export function apply(ctx: Context, config: Config): void {
  ctx.on('webserver/index-inject', (table) => {
    table.push({ kind: 'global', name: CONFIG_GLOBAL, value: config })
  })
}

// src/client/index.ts —— 读取与校验提取为导出函数，可不经全局变量单独测试（V-08）
export function injectedPrices(injected: Partial<Config> | undefined): PriceTable {
  if (injected === undefined) {
    // D-09：宿主入口加载成功时总会注入配置；拿不到配置说明宿主入口未运行或配置无效，
    // 不回退到内置价，否则会静默绕过 AC-15。
    throw new Error(`client-ui-cost: the page carries no ${CONFIG_GLOBAL}; the Host entry is not loaded or its price configuration is invalid`)
  }
  return resolvePrices(Config(injected).prices)   // 跨进程边界的输入，用同一 schema 再校验一次
}

export function apply(ctx: Context): void {
  // 第一行：抛错发生在任何注册之前，页签不会出现
  const prices = injectedPrices((globalThis as { [CONFIG_GLOBAL]?: Partial<Config> })[CONFIG_GLOBAL])
  // …注册语言包、Definitions、view target 与 conversation.view 页签（§5）
}
```

错误信息与其他字段一致，形如 `$.prices.deepseek-flash.peak.output expected a finite number but got NaN`。

示例 overlay（`apps/web/tests/client-ui-cost.overlay.yml` 本身不带 `config`，即使用内置价目表；带 `prices` 的写法见 README）：

```yaml
- insert:
    - id: ui-client-ui-cost
      name: '@deepseek-ai/dsh-client-ui-cost'
      config:
        prices:
          deepseek-flash:
            peak: { cacheHit: 0.04, cacheMiss: 2, output: 16 }
            offPeak: { cacheHit: 0.02, cacheMiss: 1, output: 4 }
```

审查点：

设计阶段的待验证项与实测结论（实现报告 T4、T6、T8）：

| 待验证项 | 结论 |
|---|---|
| `z.number()` 能否拒绝 `NaN`、`Infinity` | **已验证（T4）**：Infinity 被 `max(Number.MAX_VALUE)` 拒绝；NaN 不会被任何范围检查拒绝，改用上面的 `rejectNaN`（V-07）。负数、NaN、Infinity、字符串、数字字符串、缺少单价字段与缺少时段的负例均在 `tests/config.host.spec.ts` 中断言错误信息以字段路径开头 |
| YAML 字符串 `"abc"` 是否被强制转换 | **已验证（T4）**：不转换，`"abc"`、`"16"` 都报 `expected number` |
| tsdown 两个产物能否都打包 `@deepseek-ai/schemastery` | **已验证（T4）**：`pnpm run build:artifacts` 与 `build:check` 通过 |
| 宿主入口因配置无效加载失败后，浏览器端代码是否仍下发（`packages/client/modules/src/index.ts:1046`） | **已验证（T6、T8-7③）**：页面没有全局变量，但仍加载 `client-ui-cost/client.js`；浏览器端在注册前抛错，由客户端启动流程捕获，控制台出现 `web boot: warning: 1 entry did not activate`，只有本插件失败。因此 D-09 的检查是必要的 |

其他审查点：

- 全局变量名 `__DSH_UI_COST_CONFIG__` 是协议常量，提取为 `CONFIG_GLOBAL` 供两端共用（V-08）。
- `cost-contract.ts` 是纯类型文件，因 `config.ts` 引用价目表类型而同时列入宿主编译面。

## 5. 视图要点（`CostView.tsx`）

只列出与正确性相关的部分；JSX 样板和样式省略。

注入对象只含 `hooks.cost`、`prices`、`loadOlder`（`src/client/index.ts`）。会话状态不另行注入：`conversation.view` 是 session 作用域槽位，视图直接用 ui-session 提供的槽位标准属性 `useSession` 读取（V-12）。

```tsx
// src/client/index.ts 中 conversation.view 条目的 inject（id: 'cost'，order: 45）
inject: (sessionId: SessionId): CostViewInjected => {
  const session = ctx.sessions.binding(sessionId)?.session
  if (session === undefined) throw new Error(`client-ui-cost: session "${sessionId}" is unavailable`)
  const target = ctx.uiConversation.binding(sessionId).target(TARGET)
  return {
    hooks: { cost: { getSnapshot: () => target.getSnapshot() ?? EMPTY_COST_SNAPSHOT, subscribe: l => target.subscribe(l) } },
    prices,
    loadOlder: () => session.loadOlder(),
  }
}

// CostView.tsx
const { useCost, useSession, useProjection, prices, loadOlder, t } = props
const snapshot = useCost(value => value)
const lastUsed = useProjection('modelSelection', value => value?.lastUsed?.model ?? null)
const hasMore = useSession(session => session.hasMore)
const loadingOlder = useSession(session => session.loadingOlder)
// 会话的 loadOlder() 在部分失败场景下不抛错，而是把 historyLoadStatus 置为 'error'
const historyFailed = useSession(session => session.historyLoadStatus === 'error')
const [rejected, setRejected] = useState(false)
const summary = useMemo(() => priceSummary(snapshot, prices, lastUsed), [snapshot, prices, lastUsed])
const requestOlder = (): void => {
  setRejected(false)
  // loadOlder() 在请求进行中时返回同一个完成结果，重复点击不会发出第二个请求
  loadOlder().catch((error: unknown) => {
    console.warn('client-ui-cost: loading earlier turns failed', error)
    setRejected(true)
  })
}
// 区域 C：只在 hasMore 时渲染。有步骤时显示 C-08 t('partial', { count: summary.turns.length })；
//         步骤为空时不显示 C-08（count 须 ≥ 1，V-13）。
//         loadingOlder 时显示 <span role="status">C-12</span>，不显示按钮；
//         否则显示共享 <Button size="sm" variant="outline">（V-14），rejected || historyFailed 时文案为 C-13，可重试
const older = !hasMore ? null : (/* 见上 */)
if (snapshot.steps.length === 0) return <>{/* C-09 */}{older}</>   // V-13：空状态下仍可加载更早轮次
// 区域 A（SummaryCard）：allUnpriced = summary.pricedSteps === 0
//         allUnpriced ? C-10 : formatYuan(summary.total) / formatYuan(summary.savings)
//         两种情况都显示模型列表 summary.models（C-04；全部未定价时也显示，PRD B-01）
//         !allUnpriced && unpricedSteps > 0 时追加 C-07
// 渲染顺序：区域 A → 区域 C → 区域 B
// 区域 B：<table><thead><tr><th scope="col">… 每行 cost === null ? C-11 : formatYuan(cost)；
//         partial 时追加 <span role="img" aria-label={C-07(row.unpricedSteps)} title={同上}>*</span>（V-10）
```

`formatYuan`（BR-07）：

```ts
export function formatYuan(value: number): string {
  if (value > 0 && value < 0.00005) return '<¥0.0001'
  // 以四舍五入后的值判断位数，避免 0.99996 显示成 ¥1.0000
  return value >= 0.99995 ? `¥${value.toFixed(2)}` : `¥${value.toFixed(4)}`
}
```

审查点：

- `0.99995 ≤ value < 1` 时按 4 位四舍五入会得到 `1.0000`，因此改按 2 位显示为 `¥1.00`。这是对 BR-07"< ¥1 保留 4 位"的边界解释，已在评审 P2-2 中被负责人接受（2026-11-11），并已回写 PRD 的 BR-07 与 AC-12（含 0.99995 和 0.99994 两个样例）。
- `toFixed` 对 `x.xx5` 这类二进制表示的值可能向下舍入，AC-12 的样例不受影响（T2 单元测试：12.3456、0.03164、0.00004、0.99995、0.99994）。
- 视图分支由 `tests/cost-view.client.spec.tsx` 覆盖：空状态、全部未定价、部分未定价标记、C-08 计数、加载中、`loadOlder` 被拒绝与 `historyLoadStatus === 'error'` 时的 C-13；V-13 的空状态加按钮组合同样由单元测试覆盖，T8 真实运行中未观察到空状态（实现报告 T8-1b）。
