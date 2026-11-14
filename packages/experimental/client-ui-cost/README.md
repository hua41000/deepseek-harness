---
description: "Experimental conversation view estimating the RMB cost and cache savings of each turn and of the loaded Session from DeepSeek list prices or configured unit prices."
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-cost

English | [中文](README.zh.md)

## Summary

Adds a Cost tab beside Chat that estimates what the loaded turns cost in RMB and how much the prompt cache saved. Each step is priced on the model it ran on and on the DeepSeek peak or off-peak price of its Beijing start time. Built-in prices cover `deepseek-flash` and `deepseek-v4-pro`; a `prices` config replaces or adds models. The amounts are estimates from recorded token usage, not your bill, and only the turns loaded in the window are counted.

## Table of Contents

- [Use this package](#use-this-package)
- [Understand the implementation](#understand-the-implementation)
- [Further Exploration](#further-exploration)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

-----

<a id="use-this-package"></a>
## Use this package

Mount the package in a Web composition. No shipped profile mounts it, so a source checkout loads it through the test overlay.

### When to choose it

Choose it when you want a money figure for a conversation and want to see which turns cost the most. Choose `@deepseek-ai/dsh-experimental-client-ui-stats` when you need token counts, cache hit rate, and timing per step; the two tabs read the same Session and can be enabled together.

### Install and start

Run these commands from the repository root with Node 24.9 or later:

```sh
pnpm install
pnpm dsh web --patch apps/web/tests/client-ui-cost.overlay.yml
```

The overlay mounts the package with the built-in prices. A model call needs `DEEPSEEK_API_KEY` in the environment or the root `.env`.

### Minimal configuration

```yaml
- insert:
    - id: ui-client-ui-cost
      name: '@deepseek-ai/dsh-client-ui-cost'
```

| Field | Default | Meaning |
|---|---|---|
| `prices` | `{}` | Unit prices in yuan per million tokens, keyed by the model id recorded in the request header |

Each `prices` entry replaces the built-in prices of that model as a whole and must give `cacheHit`, `cacheMiss`, and `output` for both `peak` and `offPeak`. This example raises the `deepseek-flash` peak output price to 16:

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

A negative, non-numeric, or missing price stops this plugin from loading; DSH keeps running without the Cost tab, and the terminal names the field, for example `$.prices.deepseek-flash.peak.output expected number >= 0 but got -1`. After you change `prices`, restart `dsh web` and reload the page. The generated [configuration catalog](../../../docs/config-catalog.md#deepseek-aidsh-client-ui-cost) is the exhaustive source for every accepted field.

### Verify it

1. Open a Session in the Web UI and send one message.
2. Select the Cost tab: the summary card shows the estimated cost, cache savings, and models, and the table lists one row per turn.
3. Send another message while the tab is open: a new row appears and the total grows without a reload.
4. Run the package tests with `pnpm exec vitest run packages/experimental/client-ui-cost`.

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
<summary>Implementation internals — click to expand</summary>

The Host entry validates `prices` when the plugin loads and embeds the result in every served page. The browser entry validates that page value again and registers nothing when it is missing, so an invalid configuration cannot fall back to the built-in prices.

Two Conversation Definitions fold the Session window into nodes for one view target named `cost`. `cost-step` publishes one node per step whose `assistant/message` reported usage; `cost-route` publishes one node per `request/header`, which the Session logs only when the request model or header changes. The view target attributes each step to the latest header before its message. When the window holds no header at all, the View uses the model of the latest recorded request from the `modelSelection` projection. Pricing runs in the View because only the View can read that projection.

| File | Responsibility |
| --- | --- |
| `src/config.ts` | The `prices` schema shared by the Host and browser entries |
| `src/index.ts` | Host entry that embeds the validated configuration in pages |
| `src/client/cost-definition.ts` | The step and route Definitions |
| `src/client/cost-builder.ts` | The `cost` view target and model attribution |
| `src/client/cost-pricing.ts` | Built-in prices, price periods, step pricing, and totals |
| `src/client/cost-format.ts` | Yuan and token formatting |
| `src/client/CostView.tsx` | Summary card, partial-window notice, and turn table |
| `src/client/locales.ts` | Every visible string in all eight shipped languages |

A step costs (missed input × miss price + cache-hit input × hit price + cache-write input × miss price + output × output price) ÷ 1,000,000. Cache savings are cache-hit input × (miss price − hit price) ÷ 1,000,000. Monday to Friday 09:00–12:00 and 14:00–18:00 Beijing time use peak prices; all other times use off-peak prices, independent of the browser time zone.

</details>

-----

<a id="further-exploration"></a>
## Further Exploration

- [`@deepseek-ai/dsh-experimental-client-ui-stats`](../client-ui-stats/README.md) — the per-step token and timing view this tab sits beside.
- [`docs/subsystems/conversation.md`](../../../docs/subsystems/conversation.md) — how view targets and Definitions assemble.
- [DeepSeek pricing](https://api-docs.deepseek.com/zh-cn/quick_start/pricing) — the source of the built-in prices.

-----

<a id="model-experience"></a>
## Model Experience

None, as the tab only reads Session events and renders estimates in the browser; it registers no tool, prompt section, or model input.

#### KV Cache effect

No effect. The package never constructs a model request and never mutates a prompt.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

The figures are estimates with these known gaps:

- **Not mounted by the default product.** The Web bundle refuses experimental packages by rule; mount the package through an overlay or an explicit profile row.
- **Unpriced steps.** A step counts as unpriced when its model has no price, or when the loaded window cannot tell its model because the window starts before the first request header after a model switch. Loading earlier turns resolves the second case.
- **Model ids must match exactly.** A step is priced only when the recorded model id equals a `prices` or built-in key; DeepSeek still bills legacy ids such as `deepseek-v4-flash` at Flash prices, but this tab shows them as unpriced unless you configure them.
- **Some token use is not counted.** Compaction summary calls and failed retry attempts consume tokens but are not steps, so the total can be lower than the bill.
- **Holidays are not recognized.** A public holiday on a weekday is priced at peak rates, although DeepSeek bills it off-peak.
- **Window start time.** When a step's `step/start` is outside the loaded window, its message time stands in for the start time, which can pick the wrong period for a step that crossed a period boundary.
- **Cache writes use the miss price.** DeepSeek lists no separate cache-write price.
- **No Web end-to-end or recorded-session coverage yet.** Package tests cover pricing, attribution through the real conversation assembler, configuration, registration, and the jsdom View.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

Requirements, design decisions, and the implementation report live in `mai-specs/999-session-cost-estimator/`. The built-in prices were checked against the DeepSeek pricing page on 2026-11-13.

</details>
