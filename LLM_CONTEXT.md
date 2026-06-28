# LLM Context: ProjectValueEvaluator

このリポジトリは、Hono Standard を起点にした ProjectValueEvaluator の MVP です。目的は、普段の「このプロジェクトの価値について評価をしてください、できるだけ多角的に評点してください」という依頼を baseline prompt として固定し、Codex-first で評価を実行し、評点・改善案・前回差分を比較可能な形で保存することです。

## Repository Snapshot

- Backend は Bun + Hono。API composition は `api/app/hono.ts`。
- DB は local SQLite + Drizzle。schema は `api/db/schema.ts`、migration は `drizzle/`。
- MVP の主入口は CLI と評価ワークベンチ。`api/cli/evaluate.ts`、`api/cli/reevaluate.ts`、UI の Home/Settings が同じ評価 usecase を呼ぶ。
- API は CLI と同じ usecase を呼ぶ。route は `api/routes/projects.route.ts` と `api/routes/evaluations.route.ts`。
- 共有 schema は `shared/schemas/`。ProjectProfile、EvaluationPromptContext、ProjectEvaluationReport、EvaluationDelta、ImprovementIdea を Zod で定義する方向へ移行する。
- Judge は `api/modules/llm/judge-client.ts`。現在の主経路は Codex SDK。OpenAI / Azure OpenAI / Local LLM は provider 抽象に残すが、未実装 adapter は `adapter-not-implemented` として扱う。
- frontend は評価ワークベンチへ寄せる。Provider 設定は設定済み状態と実行可能状態を分けて表示する。

## Core Flow

```text
ProjectProfile
  -> build EvaluationPromptContext
  -> JudgeProviderAdapter
  -> save ProjectEvaluationReport
  -> compute EvaluationDelta
  -> show ImprovementIdeas
```

## Top-Level Map

| Path | Role |
| --- | --- |
| `api/app/hono.ts` | Hono middleware、API route、static fallback、`AppType` export |
| `api/routes/projects.route.ts` | ProjectProfile 作成/取得、評価実行、再評価 |
| `api/routes/evaluations.route.ts` | Evaluation / Improvement lookup |
| `api/modules/projects/` | Project repository / service |
| `api/modules/evaluations/bundle-builder.ts` | 移行対象。baseline 評価では EvaluationPromptContext builder に縮小する |
| `api/modules/evaluations/evaluation.service.ts` | prompt context 作成、judge、保存、delta、改善案生成を束ねる usecase |
| `api/modules/evaluations/evaluation.repository.ts` | prompt context / report / raw output / delta / improvement 永続化 |
| `api/modules/evaluations/improvement-generator.ts` | report の improvementIdeas を保存用 request に変換 |
| `api/modules/llm/judge-client.ts` | Codex-first judge client。provider adapter 境界 |
| `shared/schemas/project.schema.ts` | ProjectProfile と評価軸 |
| `shared/schemas/evaluation.schema.ts` | prompt context / report / delta / provider schema |
| `spec/` | Codex-first multi-agent evaluation implementation plan |

## Implementation Contracts

- 評価結果は `overallScore` だけで返さない。必ず dimension score、confidence、rationale、evidence、concerns、weaknesses、improvementIdeas を含める。
- baseline prompt は evaluation report と一緒に保存する。
- 前回比較は保存済み report から deterministic に計算する。
- Codex を現在の主 judge とするが、OpenAI / Azure OpenAI / Local LLM の provider 抽象は削らない。
- 未実装 provider は暗黙 fallback せず、`adapter-not-implemented` として扱う。
- CLI と API は同じ `EvaluationService` を使う。評価ロジックを二重実装しない。
- DB では JSON 配列を text JSON として保存してよい。検索や集計が必要になった時点で正規化する。
- Hono route の request / response shape は `shared/schemas/` を優先する。
- Auth はテンプレート由来で残っているが、MVP 評価 API の中心ではない。必要になるまで拡張しない。

## Commands

| Command | Purpose |
| --- | --- |
| `bun run db:migrate` | SQLite migration を適用 |
| `bun run evaluator:evaluate -- --project <path>` | 評価、gap 分析、改善依頼生成 |
| `bun run evaluator:reevaluate -- --project <path>` | 再評価して delta を表示 |
| `bun run typecheck` | TypeScript check |
| `bun run lint` | Biome lint |
| `bun run format:check` | Biome format check |
| `bun run test` | Vitest |
| `bun run build` | Vite production build |
| `bun run verify` | full verification pipeline |

## Verification Matrix

| Change type | Minimum useful verification |
| --- | --- |
| Schema / domain model | `bun run typecheck` and targeted Vitest |
| Prompt context / judge / improvement logic | `bunx vitest run api/modules/evaluations/evaluation.service.test.ts` |
| DB schema / migration | `DATABASE_URL=/tmp/project-evaluator.sqlite bun run db:migrate` |
| CLI flow | temp DB migration, then `evaluator:evaluate` and `evaluator:reevaluate` |
| API flow | Hono `app.request` against `/api/projects` and `/api/projects/:id/evaluations` |
| Broad change | `bun run verify` |

## MVP Non-goals

- Do not add automatic code improvement execution yet.
- Do not remove non-Codex provider settings or schema support.
- Do not run build/test/verify as part of baseline evaluation.
- Do not claim audit-grade evidence without a separate explicit evidence collector.
- Do not introduce a second API framework.
