# CLI NightWorkers Task Generation Implementation Plan

## Source Truth

ProjectValueEvaluator は、Hono サーバーを起動しなくても CLI から評価実行、focused improvement 生成、NightWorkers 向けタスク生成を実行できる必要がある。

CLI は Hono API の代替 HTTP クライアントではない。既存の `EvaluationService`、repository、SQLite 接続を直接使う実行面にする。Hono route は HTTP entrypoint として残すが、評価・改善案生成・保存の実体は共有 service 層に寄せる。

NightWorkers 連携の目的は「改善実装を ProjectEvaluator 内で実行すること」ではなく、「NightWorkers が実行できるタスク JSON を安定して生成すること」。実装 agent の orchestration、commit、verify closeout は NightWorkers 側の責務に残す。

## Current State

- `api/cli/evaluate.ts` はすでに Hono 非依存で `EvaluationService.evaluateProject()` を呼んでいる。
- `api/cli/reevaluate.ts` は現状 `evaluate.ts` と同じ実装で、再評価専用の追加契約は薄い。
- `api/cli/bundle.ts` は bundle 作成を CLI から実行できる。
- `api/routes/evaluations.route.ts` には focused improvement 生成 API があるが、対応する CLI entrypoint はない。
- SQLite には `project_profiles`、`project_evaluations`、`evaluation_bundles`、`improvement_requests`、`focused_improvement_ideas` がある。
- provider/API 設定専用テーブルは現状ない。`judge_settings_json` は評価結果に保存された実行時スナップショットであり、現在の active provider 設定ではない。
- UI の provider 設定は `web/src/judge-settings-context.tsx` の localStorage 管理で、CLI からは参照できない。

## Non-Negotiables

- CLI 実行に Hono server startup を要求しない。
- CLI と API で評価・改善案生成ロジックを二重実装しない。
- CLI の machine-readable output は安定 schema として扱う。
- stdout は原則として最終 JSON または NDJSON event に使う。人間向けログや警告は stderr に出す。
- NightWorkers export は task 生成までに限定し、ProjectEvaluator から実装・commit・verify を直接実行しない。
- provider 設定を SQLite 化する場合も、API key の実値は保存しない。保存するのは `apiKeyRef`、endpoint、model、active selection までにする。
- Codex 以外の provider adapter は、未実装なら明示的に失敗させる。暗黙 fallback はしない。

## Target CLI Contract

### 1. Evaluate

既存コマンドを正式な入口として維持する。

```bash
bun run evaluator:evaluate -- --project /path/to/repo --json
```

追加で許可する入力:

```bash
--profile <json-path>
--baseline-prompt <text>
--provider codex
--model <model>
--codex-mode review-only
--json
--events ndjson
```

`--events ndjson` は長時間実行を NightWorkers 側から監視しやすくするための追加候補。最初の実装では `--json` の安定化を優先し、NDJSON は後続フェーズに分けてもよい。

### 2. Generate Focused Improvements

新規 CLI entrypoint:

```bash
bun run evaluator:focused-improvements -- \
  --project /path/to/repo \
  --evaluation latest \
  --dimensions lowest:3 \
  --json
```

許可する入力:

```bash
--project <path>
--evaluation latest|<evaluation-id>
--dimensions lowest:<n>|all|<dimension-key[,dimension-key...]>
--provider codex
--model <model>
--codex-mode improvement-request
--json
```

出力:

```json
{
  "schemaVersion": "project-evaluator.focused-improvements/v1",
  "project": {
    "id": "uuid",
    "rootPath": "/path/to/repo",
    "name": "project"
  },
  "evaluation": {
    "id": "uuid",
    "score": 61,
    "createdAt": "2026-06-28T00:00:00.000Z"
  },
  "selectedDimensionKeys": ["testability", "operability"],
  "ideas": []
}
```

### 3. Export NightWorkers Tasks

新規 CLI entrypoint:

```bash
bun run evaluator:nightworkers-tasks -- \
  --project /path/to/repo \
  --evaluation latest \
  --source focused \
  --limit 3 \
  --json
```

許可する入力:

```bash
--project <path>
--evaluation latest|<evaluation-id>
--source focused|gap-requests
--limit <n>
--format json|jsonl
--json
```

出力 schema:

```json
{
  "schemaVersion": "project-evaluator.nightworkers-tasks/v1",
  "project": {
    "id": "uuid",
    "rootPath": "/path/to/repo",
    "name": "project"
  },
  "evaluation": {
    "id": "uuid",
    "score": 61,
    "createdAt": "2026-06-28T00:00:00.000Z"
  },
  "tasks": [
    {
      "id": "stable-export-id",
      "source": {
        "kind": "focused-improvement",
        "id": "uuid"
      },
      "title": "Improve evaluation evidence",
      "cwd": "/path/to/repo",
      "prompt": "NightWorkers に渡す実装依頼本文",
      "acceptanceCriteria": [
        "期待する変更が実装されている",
        "repo-native verify が成功している"
      ],
      "verificationCommands": [
        "bun run verify"
      ],
      "priority": 1,
      "metadata": {
        "targetDimensions": ["testability"],
        "expectedScoreGain": 8
      }
    }
  ]
}
```

## Implementation Phases

### Phase 0: Baseline And Contract Freeze

Goal: 既存 CLI と DB の現在挙動を固定し、回帰判定できる状態にする。

Files:

- `api/cli/evaluate.ts`
- `api/cli/reevaluate.ts`
- `api/cli/evaluator-runtime.ts`
- `api/routes/evaluations.route.ts`
- `api/modules/evaluations/evaluation.service.ts`
- `api/modules/evaluations/evaluation.repository.ts`
- `shared/schemas/evaluation.schema.ts`

Tasks:

- `evaluator:evaluate` の現行 JSON 出力を保存する。
- focused improvement API が service 層経由で保存まで行うことを確認する。
- SQLite に provider 設定テーブルがないことを設計上の前提として記録する。
- NightWorkers export の v1 schema を shared schema として追加するか、まず CLI 内部 schema として追加するかを決める。

Verification:

```bash
bun run evaluator:evaluate -- --project /Users/y.noguchi/Code/projectEvaluator --json
sqlite3 sqlite.db ".tables"
bunx vitest run api/modules/evaluations/evaluation.service.test.ts api/routes/evaluations.route.test.ts
```

Stop condition:

- 評価 CLI が Hono 起動なしで動かない場合は、CLI runtime の DB/env 初期化を先に修正する。
- focused improvement が service 層に存在しない、または保存されない場合は、CLI 追加前に service/repository 境界を修正する。

### Phase 1: CLI Runtime Refactor

Goal: 既存 CLI の引数解析、DB 接続、project 解決、judge selection 作成を再利用可能にする。

Files:

- `api/cli/evaluator-runtime.ts`
- `api/cli/evaluate.ts`
- `api/cli/reevaluate.ts`
- `api/cli/bundle.ts`

Tasks:

- `parseEvaluatorArgs()` を用途別に分割する。
  - project/profile/baseline 共通 parser
  - judge selection parser
  - output mode parser
  - evaluation selector parser
- `withEvaluatorServices()` は維持し、Hono app composition へ依存させない。
- `findOrCreateCliProject()` と `loadProjectInput()` は評価系 CLI で共有する。
- CLI error は stderr に出し、終了コード `1` を返す契約を明文化する。

Verification:

```bash
bun run typecheck
bunx vitest run api/modules/evaluations/evaluation.service.test.ts
bun run evaluator:bundle -- --project /Users/y.noguchi/Code/projectEvaluator --json
```

Expected result:

- 既存 `evaluate` / `reevaluate` / `bundle` の挙動が変わらない。
- 新規 CLI が同じ runtime helper を使える。

### Phase 2: Evaluation Selection Support

Goal: `latest` または明示 ID で保存済み evaluation を CLI から選択できるようにする。

Files:

- `api/modules/evaluations/evaluation.service.ts`
- `api/modules/evaluations/evaluation.repository.ts`
- `api/cli/evaluator-runtime.ts`

Tasks:

- `resolveEvaluationForCli({ projectId, selector })` 相当の helper を追加する。
- `latest` の場合は `EvaluationService.getLatestEvaluation(projectId)` を使う。
- UUID の場合は `EvaluationService.getEvaluation(id)` を使い、project mismatch を検出する。
- project mismatch は非 0 終了にする。

Verification:

```bash
bunx vitest run api/modules/evaluations/evaluation.service.test.ts
bun run evaluator:evaluate -- --project /Users/y.noguchi/Code/projectEvaluator --json
```

Expected result:

- `latest` が対象 project の最新評価だけを指す。
- 別 project の evaluation id を渡した場合は明示エラーになる。

### Phase 3: Focused Improvements CLI

Goal: Hono route を使わずに focused improvement を生成・保存できる CLI を追加する。

Files:

- `api/cli/focused-improvements.ts`
- `api/cli/evaluator-runtime.ts`
- `package.json`
- `README.md`

Tasks:

- `evaluator:focused-improvements` script を追加する。
- CLI は `EvaluationService.generateFocusedImprovementIdeas()` を直接呼ぶ。
- `--dimensions` は次の順で実装する。
  - explicit list
  - `all`
  - `lowest:n`
- `lowest:n` は保存済み evaluation dimensions の score 昇順で選ぶ。
- 結果は `focused_improvement_ideas` に保存し、JSON 出力にも含める。
- default judge は Codex `improvement-request` mode にする。

Verification:

```bash
bun run typecheck
bunx vitest run api/modules/evaluations/evaluation.service.test.ts api/routes/evaluations.route.test.ts
bun run evaluator:focused-improvements -- --project /Users/y.noguchi/Code/projectEvaluator --evaluation latest --dimensions lowest:3 --json
sqlite3 sqlite.db "SELECT COUNT(*) FROM focused_improvement_ideas;"
```

Expected result:

- Hono 起動なしで focused improvements が生成される。
- 保存済み rows が増える。
- JSON output が `project-evaluator.focused-improvements/v1` として parse できる。

Stop condition:

- Codex auth/runtime 問題の場合は実装失敗扱いにせず、エラー文と確認コマンドを記録する。
- schema validation failure の場合は prompt/schema/client 境界を修正してから進む。

### Phase 4: NightWorkers Task Export Schema

Goal: ProjectEvaluator の改善案を NightWorkers がそのまま読める task JSON に変換する。

Files:

- `shared/schemas/nightworkers-task.schema.ts`
- or `shared/schemas/evaluation.schema.ts`
- `api/modules/evaluations/nightworkers-task-exporter.ts`
- `api/modules/evaluations/nightworkers-task-exporter.test.ts`

Tasks:

- `project-evaluator.nightworkers-tasks/v1` schema を定義する。
- focused improvement から task へ deterministic に変換する。
- `cwd` は ProjectProfile の `rootPath` を使う。
- `prompt` は `SavedFocusedImprovementIdea.agentPrompt` を主入力にする。
- `acceptanceCriteria` は focused idea の `expectedOutcome` と `implementationFocus` から生成する。
- `verificationCommands` はまず repo-native default として `bun run verify` を使う。
- `priority` は export 順で採番する。
- `id` は `evaluationId + source kind + source id` から安定生成する。

Verification:

```bash
bunx vitest run api/modules/evaluations/nightworkers-task-exporter.test.ts
bun run typecheck
```

Expected result:

- 同じ入力から同じ task id と同じ task JSON が生成される。
- task JSON に cwd、prompt、acceptanceCriteria、verificationCommands が必ず含まれる。

### Phase 5: NightWorkers Tasks CLI

Goal: 保存済み改善案を NightWorkers task JSON として CLI から出力する。

Files:

- `api/cli/nightworkers-tasks.ts`
- `api/cli/evaluator-runtime.ts`
- `package.json`
- `README.md`

Tasks:

- `evaluator:nightworkers-tasks` script を追加する。
- `--source focused` は `focused_improvement_ideas` を使う。
- `--source gap-requests` は既存 `improvement_requests` を使う。v1 では optional にしてもよい。
- `--format json` は配列をまとめて出す。
- `--format jsonl` は 1 task 1 line で出す。
- stdout には task payload だけを出す。

Verification:

```bash
bun run evaluator:nightworkers-tasks -- --project /Users/y.noguchi/Code/projectEvaluator --evaluation latest --source focused --limit 3 --json
bun run evaluator:nightworkers-tasks -- --project /Users/y.noguchi/Code/projectEvaluator --evaluation latest --source focused --limit 3 --format jsonl
bun run typecheck
bunx vitest run api/modules/evaluations/nightworkers-task-exporter.test.ts
```

Expected result:

- Hono 起動なしで NightWorkers task JSON が出る。
- JSON/JSONL が parse できる。
- focused improvement がない場合は空配列を返すか、`--require-tasks` 指定時だけ非 0 終了にする。

### Phase 6: One-Shot Pipeline CLI

Goal: NightWorkers から単一コマンドで「評価 → focused improvement → task export」を実行できるようにする。

Files:

- `api/cli/run.ts`
- `api/cli/evaluator-runtime.ts`
- `package.json`
- `README.md`

Command:

```bash
bun run evaluator:run -- \
  --project /path/to/repo \
  --dimensions lowest:3 \
  --export nightworkers \
  --json
```

Tasks:

- 既存評価がない場合は evaluate を実行する。
- `--force-evaluate` がある場合は常に新規評価する。
- `--skip-evaluate` がある場合は latest evaluation を使う。
- focused improvements を生成する。
- NightWorkers task export を出力する。
- 中間成果の ids を JSON に含める。

Output:

```json
{
  "schemaVersion": "project-evaluator.run/v1",
  "project": {},
  "evaluation": {},
  "focusedImprovements": {},
  "nightworkersTasks": {}
}
```

Verification:

```bash
bun run evaluator:run -- --project /Users/y.noguchi/Code/projectEvaluator --dimensions lowest:3 --export nightworkers --json
bun run typecheck
bun run test
```

Stop condition:

- one-shot が複雑化する場合は Phase 3 と Phase 5 の個別 CLI を先に安定させ、Phase 6 は延期する。

### Phase 7: SQLite Provider Settings

Goal: CLI と UI が同じ active judge 設定を参照できるようにする。ただし、これは CLI 化の必須前提ではなく後続改善として扱う。

Files:

- `api/db/schema.ts`
- `drizzle/0009_judge_settings.sql`
- `shared/schemas/evaluation.schema.ts`
- `api/modules/settings/` or `api/modules/judge-settings/`
- `api/routes/settings.route.ts`
- `web/src/judge-settings-context.tsx`
- `api/cli/evaluator-runtime.ts`

Proposed table:

```sql
CREATE TABLE judge_settings (
  id text PRIMARY KEY,
  name text NOT NULL,
  active integer NOT NULL DEFAULT 0,
  kind text NOT NULL,
  provider text NOT NULL,
  model text,
  endpoint text,
  api_key_ref text,
  codex_mode text,
  fallback_policy text NOT NULL DEFAULT 'none',
  created_at integer NOT NULL,
  updated_at integer NOT NULL
);
```

Tasks:

- API key の実値は保存しない。
- `apiKeyRef` は env var 名として扱う。
- active setting を CLI の default judge selection に使う。
- CLI 引数がある場合は CLI 引数を優先する。
- 未実装 provider は `adapter-not-implemented` として失敗する。

Verification:

```bash
DATABASE_URL=/tmp/project-evaluator-settings.sqlite bun run db:migrate
bunx vitest run api/modules/**/**/*.test.ts api/routes/**/*.test.ts
bun run evaluator:evaluate -- --project /Users/y.noguchi/Code/projectEvaluator --json
```

Stop condition:

- UI localStorage から DB 移行すると scope が広がるため、CLI v1 完了前には着手しない。

## Implementation Order

1. Phase 0: baseline and contract freeze
2. Phase 1: CLI runtime refactor
3. Phase 2: evaluation selector
4. Phase 3: focused improvements CLI
5. Phase 4: NightWorkers task export schema
6. Phase 5: NightWorkers tasks CLI
7. Phase 6: one-shot pipeline CLI
8. Phase 7: SQLite provider settings

Phase 7 は後続扱いにする。最初の価値は Phase 5 までで成立する。

## Test Plan

Focused tests:

```bash
bunx vitest run api/modules/evaluations/evaluation.service.test.ts
bunx vitest run api/routes/evaluations.route.test.ts
bunx vitest run api/modules/evaluations/nightworkers-task-exporter.test.ts
```

CLI smoke:

```bash
bun run evaluator:evaluate -- --project /Users/y.noguchi/Code/projectEvaluator --json
bun run evaluator:focused-improvements -- --project /Users/y.noguchi/Code/projectEvaluator --evaluation latest --dimensions lowest:3 --json
bun run evaluator:nightworkers-tasks -- --project /Users/y.noguchi/Code/projectEvaluator --evaluation latest --source focused --limit 3 --json
```

DB verification:

```bash
sqlite3 sqlite.db "SELECT COUNT(*) FROM project_evaluations;"
sqlite3 sqlite.db "SELECT COUNT(*) FROM focused_improvement_ideas;"
```

Final gate:

```bash
bun run verify
```

## Acceptance Criteria

- 評価実行、focused improvement 生成、NightWorkers task export が Hono server startup なしで実行できる。
- CLI と Hono API が同じ service/repository 層を使う。
- `focused_improvement_ideas` への保存が CLI から確認できる。
- NightWorkers task export が stable schema で JSON/JSONL 出力できる。
- stdout/stderr/exit code の契約が README に記載される。
- Codex 以外の provider は未実装状態で暗黙 fallback しない。
- `bun run verify` が成功するか、外部要因の失敗が具体的に記録される。

## Explicit Non-Goals

- ProjectEvaluator から NightWorkers の実装処理を直接起動すること。
- ProjectEvaluator から commit や PR 作成を行うこと。
- provider adapter を Codex 以外まで実装すること。
- API key の実値を SQLite に保存すること。
- UI の provider 設定を Phase 5 までに完全 DB 移行すること。
- baseline evaluation の中で build/test/verify/source inspection を自動実行すること。

## Review Checklist

- CLI entrypoint が `api/app/hono.ts` または Hono route を import していない。
- CLI output schema が tests で固定されている。
- Project mismatch の evaluation id を拒否している。
- `latest` selector が rootPath ではなく project id に対して解決されている。
- focused improvement の保存件数を DB で確認できる。
- NightWorkers task に `cwd`、`prompt`、`acceptanceCriteria`、`verificationCommands` が含まれる。
- provider/API key ref の扱いが UI 表示や過去評価 snapshot と混ざっていない。
- README の CLI 例が実際に実行可能なコマンドになっている。
