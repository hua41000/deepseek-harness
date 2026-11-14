# 999 实现报告

> 有效需求来源：[PRD](../spec/PRD.md)（AC-01～AC-15） | 设计：[技术方案](../design/TECH_DESIGN.md)、[代码设计附录](../design/CODE_DESIGN.md) | 分支：`homework-1-build-plugin`

[返回需求简报](../BRIEF.md)

本报告记录实施进度、实际验证结果，以及与已评审设计的偏差。按用户要求（2026-11-13），实施期间**不修改设计文档**，偏差集中记录在本报告，待实施结束后由编排者安排设计同步。

## 任务进度

| 任务 | 状态 | 提交 | 说明 |
|---|---|---|---|
| T1 包骨架与登记 | 完成，待提交 | — | 见下文 |
| T2 计价与格式纯函数 | 未开始 | — | |
| T3 Definitions 与 builder | 未开始 | — | |
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
