# ProjectValueEvaluator

ProjectValueEvaluator は、ソフトウェアプロジェクトの現在価値を多角的に評点し、前回評価との差分と次の改善案を比較可能な形で残すための Hono + TypeScript ベースの評価サービスです。

中心にある baseline prompt は次です。

```text
このプロジェクトの価値について評価をしてください、できるだけ多角的に評点してください
```

このプロジェクトの役割は、上記の評価依頼を Codex-first で実行し、prompt、rubric、schema、provider 設定、保存履歴、前回比較を固定化することです。Codex を現在の主 judge としつつ、OpenAI / Azure OpenAI / Local LLM などの provider 拡張点は残します。

## MVP

再設計後の MVP は次の流れを目標にします。

```text
ProjectProfile
  -> EvaluationPromptContext
  -> JudgeProviderAdapter
  -> ProjectEvaluationReport v1
  -> EvaluationDelta
  -> ImprovementIdeas
  -> Saved history
```

現在の実装は移行途中です。source truth は [Codex-First Multi-Agent Evaluation Implementation Plan](spec/codex-first-multi-agent-evaluation-implementation-plan.md) です。

## 評価で扱うもの

| Item | Purpose |
| --- | --- |
| `ProjectProfile` | Project Ideal、対象 workflow、non-goals、評価軸 |
| `EvaluationPromptContext` | baseline prompt、対象 repo 情報、前回評価 summary、judge 設定 |
| `ProjectEvaluationReport` | overall score、dimension score、confidence、根拠、弱点、改善案 |
| `EvaluationDelta` | 前回評価との差分、dimension delta、新規/解消された弱点 |
| `ImprovementIdea` | 評価結果から導かれた次の改善候補 |

## デフォルト評価軸

| Key | Label |
| --- | --- |
| `conceptValue` | コンセプト価値 |
| `implementationCompleteness` | 実装完成度 |
| `architectureQuality` | アーキテクチャ |
| `uiUx` | UI/UX |
| `testability` | テスト容易性 |
| `operability` | 運用性 |
| `security` | セキュリティ |
| `maintainability` | 保守性 |
| `extensibility` | 拡張性 |
| `ossProductValue` | OSS/外部提供価値 |
| `strategicFit` | 戦略適合 |

## Evidence Policy

baseline 評価は、Codex / LLMProvider に多角的な評点を依頼する経路です。アプリ側は、この経路で build、test、verify、source inspection を自動実行しません。

評価結果には、judge が確認できなかった事項を `notVerified` として残します。runtime verification や audit-grade evidence は、後続の明示的な evidence collector として追加します。

## 構成

| Path | Role |
| --- | --- |
| `api/app/hono.ts` | Hono app composition、API route 登録、`AppType` export |
| `api/routes/projects.route.ts` | ProjectProfile と project-scoped evaluation API |
| `api/routes/evaluations.route.ts` | Evaluation / Improvement lookup API |
| `api/modules/projects/` | ProjectProfile repository / service |
| `api/modules/evaluations/` | prompt context、repository、service、delta、improvement generator |
| `api/modules/llm/judge-client.ts` | Codex-first judge client。provider adapter 境界 |
| `api/cli/` | evaluate / reevaluate CLI |
| `shared/schemas/` | API / CLI / judge output 共有 Zod schema |
| `drizzle/` | SQLite migrations |
| `spec/` | 現行の実装計画 |

## セットアップ

```bash
bun install
cp .env.example .env
bun run db:migrate
```

## CLI

```bash
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

- [Codex-First Multi-Agent Evaluation Implementation Plan](spec/codex-first-multi-agent-evaluation-implementation-plan.md)
