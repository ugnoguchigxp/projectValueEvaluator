# LLM Context: ProjectValueEvaluator

このリポジトリは、Hono Standard を起点にした ProjectValueEvaluator の MVP です。目的は、プロジェクトの現在価値を 100 点の理想状態に対して評価し、gap を ImprovementRequest に変換し、次回評価で score / confidence delta を比較できるようにすることです。

## Repository Snapshot

- Backend は Bun + Hono。API composition は `api/app/hono.ts`。
- DB は local SQLite + Drizzle。schema は `api/db/schema.ts`、migration は `drizzle/`。
- MVP の主入口は CLI。`api/cli/bundle.ts`、`api/cli/evaluate.ts`、`api/cli/reevaluate.ts`。
- API は CLI と同じ usecase を呼ぶ。route は `api/routes/projects.route.ts` と `api/routes/evaluations.route.ts`。
- 共有 schema は `shared/schemas/`。ProjectProfile、EvaluationBundle、ProjectValueEvaluation、ImprovementRequest を Zod で定義する。
- Judge は `api/modules/llm/judge-client.ts`。現状は deterministic fallback で、外部 LLM なしに MVP を検証できる。
- frontend は Hono Standard の既存 React shell が残っている。MVP の主機能はまだ CLI/API 中心。

## Core Flow

```text
ProjectProfile
  -> buildEvaluationBundle
  -> judgeProjectValue
  -> save ProjectValueEvaluation
  -> generateImprovementRequests
  -> re-evaluate with previous evaluation
```

## Top-Level Map

| Path | Role |
| --- | --- |
| `api/app/hono.ts` | Hono middleware、API route、static fallback、`AppType` export |
| `api/routes/projects.route.ts` | ProjectProfile 作成/取得、評価実行、再評価 |
| `api/routes/evaluations.route.ts` | Evaluation / Improvement lookup |
| `api/modules/projects/` | Project repository / service |
| `api/modules/evaluations/bundle-builder.ts` | README、LLM_CONTEXT、AGENTS、package.json、repo tree から bundle を作成 |
| `api/modules/evaluations/evaluation.service.ts` | bundle 作成、judge、保存、改善依頼生成を束ねる usecase |
| `api/modules/evaluations/evaluation.repository.ts` | evaluation bundle / evaluation / improvement 永続化 |
| `api/modules/evaluations/improvement-generator.ts` | gap から ImprovementRequest を生成 |
| `api/modules/llm/judge-client.ts` | deterministic fallback judge。将来の LLM judge 差し替え点 |
| `shared/schemas/project.schema.ts` | ProjectProfile と評価軸 |
| `shared/schemas/evaluation.schema.ts` | bundle / evaluation / gap / improvement schema |
| `spec/` | コンセプトと MVP 実装計画 |

## Implementation Contracts

- 評価結果は `score` だけで返さない。必ず `evidenceLevel`、`overallConfidence`、`notVerified`、`nextEvidenceToCollect` を含める。
- 表層評価と audit-grade 評価を混同しない。MVP の evidence level は基本的に `repo-structure`。
- gap は `value-gap` と `evidence-gap` / `runtime-gap` を分ける。
- ImprovementRequest は `sourceGapIds` と `sourceDimensionKeys` を持ち、なぜ提案されたか追跡可能にする。
- CLI と API は同じ `EvaluationService` を使う。評価ロジックを二重実装しない。
- DB では JSON 配列を text JSON として保存してよい。検索や集計が必要になった時点で正規化する。
- Hono route の request / response shape は `shared/schemas/` を優先する。
- Auth はテンプレート由来で残っているが、MVP 評価 API の中心ではない。必要になるまで拡張しない。

## Commands

| Command | Purpose |
| --- | --- |
| `bun run db:migrate` | SQLite migration を適用 |
| `bun run evaluator:bundle -- --project <path>` | evaluation bundle を作成して保存 |
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
| Bundle / judge / improvement logic | `bunx vitest run api/modules/evaluations/evaluation.service.test.ts` |
| DB schema / migration | `DATABASE_URL=/tmp/project-evaluator.sqlite bun run db:migrate` |
| CLI flow | temp DB migration, then `evaluator:evaluate` and `evaluator:reevaluate` |
| API flow | Hono `app.request` against `/api/projects` and `/api/projects/:id/evaluations` |
| Broad change | `bun run verify` |

## MVP Non-goals

- Do not add automatic agent execution yet.
- Do not claim runtime verified or audit-grade confidence without executing those evidence collectors.
- Do not add a large dashboard before CLI/API evaluation flow is stable.
- Do not introduce a second API framework.
