---
description: "实验性会话视图：按 DeepSeek 官方价目或配置的单价，估算每轮和已加载会话的人民币花费与缓存节省。"
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-cost

[English](README.md) | 中文

## 概述

在「对话」旁边加一个「花费」页签，估算已加载轮次花了多少人民币、提示词缓存省了多少钱。每一步按它使用的模型、以及开始时间（北京时间）所在的 DeepSeek 高峰或空闲时段单价计价。内置价目覆盖 `deepseek-flash` 和 `deepseek-v4-pro`；`prices` 配置可以替换或新增模型。金额是按记录的 token 用量做的估算，不是实际账单，并且只统计窗口里已加载的轮次。

## 目录

- [使用本包](#use-this-package)
- [理解实现](#understand-the-implementation)
- [进一步探索](#further-exploration)
- [模型体验](#model-experience)
- [已知限制与延期工作](#known-limitations-and-deferred-work)
- [开发备注](#dev-note)

-----

<a id="use-this-package"></a>
## 使用本包

把本包挂到 Web 组合里。已发布的 profile 都不挂载它，源码检出时通过测试 overlay 加载。

### 何时选择它

想知道一次对话大概花了多少钱、哪几轮最贵时选它。需要每步的 token 数、缓存命中率和耗时时选 `@deepseek-ai/dsh-experimental-client-ui-stats`；两个页签读同一份会话，可以同时启用。

### 安装与启动

在仓库根目录执行以下命令，需要 Node 24.9 或更高版本：

```sh
pnpm install
pnpm run build
pnpm dsh web --patch apps/web/tests/client-ui-cost.overlay.yml
```

`pnpm run build` 生成 `pnpm dsh web` 提供给浏览器的 bundle；拉取本包的改动后需要重新运行。这个 overlay 使用内置价目挂载本包。调用模型需要在环境变量或根目录 `.env` 中设置 `DEEPSEEK_API_KEY`。

### 最小配置

```yaml
- insert:
    - id: ui-client-ui-cost
      name: '@deepseek-ai/dsh-client-ui-cost'
```

| 字段 | 默认值 | 含义 |
|---|---|---|
| `prices` | `{}` | 单价，单位为元 / 百万 token，键为请求头中记录的模型 ID |

`prices` 的每个条目整条替换该模型的内置单价，`peak` 和 `offPeak` 两个时段都必须给出 `cacheHit`、`cacheMiss`、`output`。下例把 `deepseek-flash` 的高峰输出单价提高到 16：

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

单价为负数、不是数字或缺少字段时，本插件不会加载；DSH 照常运行但没有「花费」页签，终端会写明出错字段，例如 `$.prices.deepseek-flash.peak.output expected number >= 0 but got -1`。修改 `prices` 后需要重启 `dsh web` 并刷新页面。生成的[配置目录](../../../docs/config-catalog.zh.md#deepseek-aidsh-client-ui-cost)是全部可用字段的完整来源。

### 验证

1. 在 Web 界面打开一个会话并发送一条消息。
2. 切换到「花费」页签：合计卡显示估算花费、缓存节省和模型，明细表每轮一行。
3. 停留在该页签再发送一条消息：不刷新页面即出现新的一行，合计随之增加。
4. 用 `pnpm exec vitest run packages/experimental/client-ui-cost` 运行本包测试。

-----

<a id="understand-the-implementation"></a>
## 理解实现

<details>
<summary>实现细节——点击展开</summary>

宿主入口在插件加载时校验 `prices`，并把结果写入每个页面。浏览器入口再次校验页面里的值；值不存在时不注册任何内容，因此无效配置不会退回到内置价。

两个会话 Definition 把会话窗口折叠成节点，发布到名为 `cost` 的视图目标。`cost-step` 为每个 `assistant/message` 报告了用量的步骤发布一个节点；`cost-route` 为每条 `request/header` 发布一个节点，会话在请求的模型或请求头变化时、循环重启后的第一次请求时（`resume`），以及请求头不变但开始新的请求序列时（`series`）记录这条事件。视图目标把每一步归到它的消息之前最近的一条请求头；窗口里第一条请求头为 `series` 时，它之前的步骤沿用它的模型，因为这种请求头与上一条相同。窗口里没有请求头时，视图按会话记下 `modelSelection` 投影中最近一次请求的模型及其覆盖的最早步骤，之后有请求头实时到达，这些步骤仍按该模型计价。断线重连、缺口修复或重新打开把窗口替换为更晚的页时，视图丢弃这条记录，按新窗口重新记录。计价放在视图里，因为只有视图能读取这个投影。

| 文件 | 职责 |
| --- | --- |
| `src/config.ts` | 宿主与浏览器入口共用的 `prices` 校验规则 |
| `src/index.ts` | 把校验后的配置写入页面的宿主入口 |
| `src/client/cost-definition.ts` | 步骤与请求头两个 Definition |
| `src/client/cost-builder.ts` | `cost` 视图目标与模型归属 |
| `src/client/cost-pricing.ts` | 内置价目、计价时段、单步计价与汇总 |
| `src/client/cost-format.ts` | 金额与 token 数的格式 |
| `src/client/CostView.tsx` | 合计卡、部分加载提示与每轮明细表 |
| `src/client/locales.ts` | 八种已发布语言的全部界面文字 |

单步花费 =（未命中输入 × 未命中单价 + 缓存命中输入 × 命中单价 + 缓存写入 × 未命中单价 + 输出 × 输出单价）÷ 1,000,000。缓存节省 = 缓存命中输入 ×（未命中单价 − 命中单价）÷ 1,000,000。北京时间周一至周五 09:00–12:00 和 14:00–18:00 按高峰价，其余时间按空闲价，与浏览器时区无关。

</details>

-----

<a id="further-exploration"></a>
## 进一步探索

- [`@deepseek-ai/dsh-experimental-client-ui-stats`](../client-ui-stats/README.zh.md)——本页签旁边按步骤展示 token 与耗时的视图。
- [`docs/subsystems/conversation.zh.md`](../../../docs/subsystems/conversation.zh.md)——视图目标与 Definition 如何装配。
- [DeepSeek 价格](https://api-docs.deepseek.com/zh-cn/quick_start/pricing)——内置价目的来源。

-----

<a id="model-experience"></a>
## 模型体验

无直接影响，因为页签只读会话事件并在浏览器里显示估算，不注册工具、提示词段落或模型输入。

#### KV Cache 影响

没有影响。本包不构造模型请求，也不修改提示词。

## 已知限制与延期工作

<a id="known-limitations-and-deferred-work"></a>

金额是估算，存在以下已知偏差：

- **默认产品不挂载。** Web bundle 按规则拒绝实验包；请通过 overlay 或在 profile 中显式加一行挂载。
- **未定价步骤。** 模型没有单价，或者窗口从第一条请求头之前开始、该请求头为 `resume` 或 `change`、且页面没有看到它实时到达或它在窗口被替换为更晚的页之前到达，因而无法判断该步模型时，该步记为未定价。加载更早的轮次可以消除第二种情况。
- **模型 ID 必须完全一致。** 只有记录的模型 ID 与 `prices` 或内置价目的键完全相同时才计价；DeepSeek 仍按 Flash 价对 `deepseek-v4-flash` 等旧 ID 计费，但除非你为它们配置单价，本页签会显示为未定价。
- **部分 token 不计入。** 压缩摘要调用和失败的重试也消耗 token，但它们不是步骤，因此合计可能低于账单。
- **不识别节假日。** 落在工作日的法定节假日按高峰价计算，而 DeepSeek 实际按空闲价计费。
- **窗口起点的开始时间。** 步骤的 `step/start` 不在已加载窗口里时，用消息时间代替开始时间；跨越时段边界的那一步可能用错时段。
- **缓存写入按未命中单价。** DeepSeek 价目没有单列缓存写入价。
- **尚无 Web 端到端或录制会话覆盖。** 本包测试覆盖计价、经真实会话装配器的模型归属、配置、注册和 jsdom 视图。

<a id="dev-note"></a>
### 开发备注

<details>
<summary>维护者工作背景——点击展开</summary>

需求、设计决策和实现报告位于 `mai-specs/999-session-cost-estimator/`。内置价目已于 2026-11-13 按 DeepSeek 价格页面核对。

</details>
