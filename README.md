# ProjectValueEvaluator

ProjectValueEvaluator は、ソフトウェアプロジェクトの現在価値を評価し、100 点の理想状態との差分を次の改善タスクへ変換するための Hono + TypeScript ベースの評価サービスです。

評価結果は単なるスコアではなく、`evidenceLevel`、`confidence`、`notVerified`、`nextEvidenceToCollect` を含みます。これにより、README や repo tree からの表層評価と、runtime verified / audit grade の評価を混同せず、コーディングエージェントに渡せる改善依頼へ変換できます。

## MVP

現在の MVP は次の流れを実行できます。

```text
ProjectProfile
  -> EvaluationBundle
  -> deterministic fallback judge
  -> ProjectValueEvaluation
  -> Gap classification
  -> ImprovementRequest
  -> Re-evaluation delta
```

MVP では外部 LLM 接続は必須ではありません。`api/modules/llm/judge-client.ts` の deterministic fallback judge により、ローカル検証だけで評価フローを通せます。

## 評価で扱うもの

| Item | Purpose |
| --- | --- |
| `ProjectProfile` | Project Ideal、対象 workflow、non-goals、評価軸 |
| `EvaluationBundle` | README、LLM_CONTEXT、AGENTS、package.json、repo tree、previous evaluation |
| `ProjectValueEvaluation` | score、dimension score、confidence、gap、未確認事項 |
| `ImprovementRequest` | gap を coding agent が実行できる改善依頼へ変換したもの |

## Evidence Level

| Level | Meaning |
| --- | --- |
| `surface` | README、LLM_CONTEXT、package metadata などから評価 |
| `repo-structure` | directory tree、scripts、主要配置から評価 |
| `code-sampled` | 主要実装ファイルの一部を読んで評価 |
| `runtime-verified` | test、typecheck、build、起動、sample output を確認して評価 |
| `audit-grade` | security boundary、sandbox、実行経路まで監査して評価 |

現在の MVP は `repo-structure` 評価を生成し、未確認の runtime / audit 項目は `notVerified` と `nextEvidenceToCollect` に明示します。

## 構成

| Path | Role |
| --- | --- |
| `api/app/hono.ts` | Hono app composition、API route 登録、`AppType` export |
| `api/routes/projects.route.ts` | ProjectProfile と project-scoped evaluation API |
| `api/routes/evaluations.route.ts` | Evaluation / Improvement lookup API |
| `api/modules/projects/` | ProjectProfile repository / service |
| `api/modules/evaluations/` | bundle builder、repository、service、improvement generator |
| `api/modules/llm/judge-client.ts` | deterministic fallback judge。将来の LLM judge 差し替え点 |
| `api/cli/` | bundle / evaluate / reevaluate CLI |
| `shared/schemas/` | API / CLI / judge output 共有 Zod schema |
| `drizzle/` | SQLite migrations |
| `spec/` | コンセプトと MVP 実装計画 |

## セットアップ

```bash
bun install
cp .env.example .env
bun run db:migrate
```

## CLI

```bash
bun run evaluator:bundle -- --project /path/to/repo
bun run evaluator:evaluate -- --project /path/to/repo
bun run evaluator:reevaluate -- --project /path/to/repo
```

JSON 出力:

```bash
bun run evaluator:evaluate -- --project /path/to/repo --json
```

profile JSON を指定する場合:

```bash
bun run evaluator:evaluate -- --project /path/to/repo --profile project-profile.json
```

`project-profile.json` は `name`、`ideal`、`primaryAudience`、`targetWorkflow`、`nonGoals`、`dimensions` を上書きできます。`rootPath` は `--project` が優先されます。

## API

| Method | Path | Description |
| --- | --- | --- |
| `GET` | `/api/health` | health check |
| `POST` | `/api/projects` | ProjectProfile 作成 |
| `GET` | `/api/projects/:id` | ProjectProfile 取得 |
| `POST` | `/api/projects/:id/evaluations` | 評価実行 |
| `GET` | `/api/projects/:id/evaluations/latest` | 最新評価取得 |
| `POST` | `/api/projects/:id/reevaluate` | 再評価実行 |
| `GET` | `/api/evaluations/:id` | 評価取得 |
| `GET` | `/api/evaluations/:id/improvements` | 改善依頼取得 |

## 検証

```bash
bun run typecheck
bun run lint
bun run format:check
bun run test
bun run build
bun run verify
```

## MVP Non-goals

```text
- 自動で改善実装を実行する agent orchestration
- audit-grade のコード監査
- runtime sandbox 実行
- 複数 LLM による voting
- 大きな dashboard
- SaaS 的な multi-tenant user management
```

## 詳細仕様

- [ProjectValueEvaluator Concept](spec/project-value-evaluator-concept.md)
- [MVP Implementation Plan](spec/mvp-implementation-plan.md)
