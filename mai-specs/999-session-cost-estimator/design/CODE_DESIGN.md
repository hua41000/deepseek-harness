# 会话花费估算插件 代码设计（供评审）

[返回技术方案](TECH_DESIGN.md)

> 以下片段均为**设计示意**，未写入源码，也未编译或运行。它们沿用仓库的 TypeScript 写法和 `client-ui-stats` 的抽象。省略了 import、JSDoc 和 React 样板，省略处已标明。所有文件都位于拟新增的 `packages/experimental/client-ui-cost/` 下。

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

/** builder 输出：model 为 null 表示窗口内推不出。 */
export interface CostSnapshot {
  readonly steps: readonly (CostStep & { readonly model: string | null })[]
  readonly windowHasHeader: boolean
}

export interface CostTurnRow {
  readonly turn: number
  readonly input: number          // miss + hit + write（FR-03）
  readonly output: number
  readonly cost: number | null    // 整轮未定价时为 null
  readonly partial: boolean       // 有部分步骤未定价
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

## 2. 模型归属（`cost-builder.ts`）

Definitions（`cost-definition.ts`）只做事件到节点的映射，结构与 `stats-definition.ts` 的 `stepDefinition` 相同：

```ts
// cost-step：id = `${turn}:${step}`，start 来自 step/start，update 来自 assistant/message；
// 起点缺失时由 assistant/message 建立状态（与 stats 的 fallbackState 同理）。
// buildViewNode：state.usage 为空时返回 null（BR-06）；否则产出 { kind: 'step', step: CostStep }。
// publication：assistant/message 为 'immediate'，step/start 为 'none'。
//
// cost-route：match request/header → { id: `${event.seq}`, role: 'start' }；
// buildViewNode 产出 { kind: 'route', seq: event.seq, model: event.data.header.config.model }。
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

`StatsSnapshotBuilder` 的 `replace` / `apply` 结构照搬：维护 `Map<key, node>`，每次变化后调用 `attributeModels(map.values())`。

审查点：

- **为什么用 `<` 而不是 `≤`**：`request/header` 在同一步内先于 `assistant/message` 写入，两者 seq 不会相等。
- **不变量**：同一 seq 前缀下，结果只取决于节点集合，与 `prepend` 或 `apply` 的顺序无关，所以分页和实时更新不会造成错配。
- **待核实（R6）**：窗口是否一定是日志的连续后缀。视图层的 `lastUsed` 回退依赖这一点。

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
    })),
  }
}
```

对照 PRD 验算（单元测试将使用这些数据）：

- AC-02：flash 高峰。10 000×2 + 90 000×0.04 + 1 000×8 = 31 600，÷10⁶ 得 0.0316。
- AC-04：90 000×(2−0.04)/10⁶ = 0.1764。
- AC-07：输出单价 16 时为 0.0316 + 1 000×8/10⁶ = 0.0396。

审查点：

- 模型列表包含未定价但模型已知的模型，PRD C-04 未区分这两种情况。
- 金额用 `number` 累加。单步误差在 1e-15 量级，远低于 BR-07 的显示精度，不引入十进制库。

## 4. 配置与宿主入口（`config.ts`、`index.ts`）

```ts
// src/config.ts —— 宿主与浏览器共用
const unit = z.object({
  cacheHit: z.number().min(0).required(),
  cacheMiss: z.number().min(0).required(),
  output: z.number().min(0).required(),
})
export interface Config { prices: PriceTable }
export const Config: z<Partial<Config>, Config> = z.object({
  prices: z.dict(z.object({ peak: unit.required(), offPeak: unit.required() })).default({}),
})

// src/index.ts —— 宿主入口：只写入页面，不提供服务
export function apply(ctx: Context, config: Config): void {
  ctx.on('webserver/index-inject', (table) => {
    table.push({ kind: 'global', name: '__DSH_UI_COST_CONFIG__', value: config })
  })
}

// src/client/index.ts 中（进程边界输入，用同一 schema 再校验一次）
const config = Config((globalThis as { __DSH_UI_COST_CONFIG__?: Partial<Config> }).__DSH_UI_COST_CONFIG__ ?? {})
const prices = resolvePrices(config.prices)
```

示例 overlay（`apps/web/tests/client-ui-cost.overlay.yml`，也写入 README）：

```yaml
- insert:
    - id: ui-cost
      name: '@deepseek-ai/dsh-experimental-client-ui-cost'
      config:
        prices:
          deepseek-flash:
            peak: { cacheHit: 0.04, cacheMiss: 2, output: 16 }
            offPeak: { cacheHit: 0.02, cacheMiss: 1, output: 4 }
```

审查点：

- 待验证：schemastery 的 `z.number()` 能否拒绝 `NaN` 和 `Infinity`，以及 YAML 中的字符串 `"abc"` 是否会被强制转换。实现时写负例测试（对应 PRD AC-15，并断言错误信息包含字段路径）；如不拒绝，改用 `z.natural()` 风格的自定义校验。
- 待验证：host 入口与 client 入口共享 `config.ts`，需要确认 tsdown 的两个产物都能打包 `@deepseek-ai/schemastery`。documentpreview 已有相同做法。
- 全局变量名 `__DSH_UI_COST_CONFIG__` 是协议常量。

## 5. 视图要点（`CostView.tsx`）

只列出与正确性相关的部分；JSX 样板和样式省略。

```tsx
const snapshot = useCost(value => value)
const lastUsed = useProjection('modelSelection')?.lastUsed?.model ?? null
const summary = useMemo(() => priceSummary(snapshot, prices, lastUsed), [snapshot, prices, lastUsed])
const { hasMore } = useSession(s => ({ hasMore: s.hasMore }))   // 实际取法按 ui-session 标准 props 核对
if (snapshot.steps.length === 0) return <Empty text={t('empty')} />           // C-09
const allUnpriced = summary.pricedSteps === 0                                   // C-10
// 区域 A：allUnpriced ? t('allUnpriced') : formatYuan(summary.total) / formatYuan(summary.savings)
//         unpricedSteps > 0 时追加 t('excludesUnpriced', { count })            // C-07
// 区域 C：hasMore 时显示 t('partial', { count: summary.turns.length }) + 加载按钮（loadOlder 状态照搬 StatsView）
// 区域 B：<table><thead><tr><th scope="col">… 每行 cost === null ? t('unpriced') : formatYuan(cost) + (partial ? 标记 : '')
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

- `0.99995 ≤ value < 1` 时按 4 位四舍五入会得到 `1.0000`，因此改按 2 位显示为 `¥1.00`。这是对 BR-07"< ¥1 保留 4 位"的边界解释，评审时请确认。
- `toFixed` 对 `x.xx5` 这类二进制表示的值可能向下舍入，AC-12 的三个样例不受影响。
