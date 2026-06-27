# ProjectValueEvaluator MVP Implementation Plan

## 目的

この計画書は、Hono Standard を起点に ProjectValueEvaluator の MVP を実装するための最小計画である。

対象は、評価 bundle の作成、LLM judge、評価結果保存、gap 分析、改善依頼生成、再評価比較までとする。

## MVP Scope

実装するもの:

```text
- ProjectProfile / ProjectIdeal の定義と保存
- surface + repo-structure evaluation bundle の生成
- LLM judge による structured evaluation
- score / dimension score / confidence / notVerified / nextEvidence の保存
- gap の分類
- ImprovementRequest の生成
- previous evaluation との scoreDelta / confidenceDelta 比較
- CLI と Hono API からの実行入口
```

実装しないもの:

```text
- 自動で改善実装を実行する agent orchestration
- audit-grade のコード監査
- runtime sandbox 実行
- 複数 LLM による voting
- 大きな dashboard
- SaaS 的な multi-tenant user management
```

既存テンプレートの auth は、MVP では積極的に拡張しない。必要になった時点で保護対象 API にだけ適用する。

## 推奨ディレクトリ構成

```text
api/
  routes/
    projects.route.ts
    evaluations.route.ts
    improvements.route.ts
  modules/
    projects/
      project.service.ts
      project.repository.ts
    evaluations/
      bundle-builder.ts
      evaluation.service.ts
      gap-analyzer.ts
      improvement-generator.ts
      evaluation.repository.ts
    llm/
      judge-client.ts
      prompts.ts
      structured-output.ts
  cli/
    evaluate.ts
    bundle.ts
    reevaluate.ts
shared/
  schemas/
    project.schema.ts
    evaluation.schema.ts
    improvement.schema.ts
prompts/
  project-evaluation.md
  improvement-generation.md
spec/
  project-value-evaluator-concept.md
  mvp-implementation-plan.md
```

## データモデル

最小の永続化対象は次の通り。

```ts
type ProjectProfile = {
  id: string
  name: string
  rootPath: string
  ideal: string
  primaryAudience: string
  targetWorkflow: string
  nonGoals: string[]
  dimensions: string[]
  createdAt: string
  updatedAt: string
}

type EvaluationBundle = {
  id: string
  projectId: string
  evidenceLevel: "surface" | "repo-structure"
  inputs: {
    readme?: string
    llmContext?: string
    packageJson?: unknown
    repoTree: string[]
    scripts: Record<string, string>
    previousEvaluation?: unknown
  }
  createdAt: string
}

type DimensionScore = {
  key: string
  score: number
  confidence: number
  rationale: string
  evidenceRefs: string[]
  caveats: string[]
}

type ProjectValueEvaluation = {
  id: string
  projectId: string
  bundleId: string
  score: number
  idealScore: 100
  overallConfidence: number
  evidenceLevel: string
  summary: string
  dimensions: DimensionScore[]
  strengths: string[]
  gapsTo100: Gap[]
  notVerified: string[]
  nextEvidenceToCollect: string[]
  previousScore?: number
  scoreDelta?: number
  previousConfidence?: number
  confidenceDelta?: number
  createdAt: string
}

type Gap = {
  id: string
  title: string
  kind: "value-gap" | "evidence-gap" | "implementation-gap" | "runtime-gap" | "documentation-gap"
  affectedDimensions: string[]
  currentEvidenceLevel: string
  expectedScoreGain: number
  expectedConfidenceGain: number
  rationale: string
}

type ImprovementRequest = {
  id: string
  evaluationId: string
  title: string
  reason: string
  sourceGapIds: string[]
  sourceDimensionKeys: string[]
  expectedScoreGain: number
  expectedConfidenceGain: number
  complexity: number
  priority: number
  taskType: "docs" | "test" | "feature" | "refactor" | "security" | "agent-usability" | "evidence"
  prompt: string
  acceptanceCriteria: string[]
  verificationCommands: string[]
  createdAt: string
}
```

SQLite / Drizzle では、JSON 配列や judge raw output は最初は text JSON として保存してよい。検索や集計が必要になった時点で正規化する。

## 実装ステップ

### 1. Shared Schema

`shared/schemas/` に project、evaluation、improvement の Zod schema を追加する。

完了条件:

```text
- API と CLI が同じ schema を参照できる
- LLM structured output を schema で検証できる
- score と confidence の範囲が検証される
```

検証:

```bash
bun run typecheck
```

### 2. Database

Drizzle schema に `project_profiles`、`evaluation_bundles`、`project_evaluations`、`improvement_requests` を追加する。

完了条件:

```text
- evaluation bundle と evaluation result を別々に保存できる
- previous evaluation を projectId で取得できる
- raw LLM output を再確認できる
```

検証:

```bash
bun run db:generate
bun run typecheck
```

### 3. Bundle Builder

ローカル project root から surface + repo-structure bundle を作る。

最初に読むもの:

```text
- README.md
- LLM_CONTEXT.md
- AGENTS.md
- package.json
- directory tree
- previous latest evaluation
```

完了条件:

```text
- 存在しないファイルは missing input として扱う
- bundle に inspectedInputs / notVerified の材料が入る
- node_modules、dist、coverage、.git は含めない
```

検証:

```bash
bun run typecheck
bun run test
```

### 4. LLM Judge

bundle と ProjectProfile を prompt に渡し、structured evaluation を返す。

完了条件:

```text
- score だけでなく dimension score と confidence を返す
- notVerified と nextEvidenceToCollect を返す
- surface 評価を audit-grade と誤表現しない
- schema validation に失敗した場合は保存しない
```

検証:

```bash
bun run typecheck
bun run test
```

### 5. Gap Analyzer / Improvement Generator

評価結果から gap を分類し、改善依頼を生成する。

完了条件:

```text
- value-gap と evidence-gap を分ける
- expectedScoreGain と expectedConfidenceGain を分ける
- ImprovementRequest が sourceGapIds を保持する
- acceptanceCriteria と verificationCommands が空にならない
```

検証:

```bash
bun run typecheck
bun run test
```

### 6. CLI

最初の利用入口は CLI とする。

```bash
bun run api/cli/bundle.ts --project /path/to/repo --profile project.json
bun run api/cli/evaluate.ts --project /path/to/repo --profile project.json
bun run api/cli/reevaluate.ts --project /path/to/repo --profile project.json
```

完了条件:

```text
- evaluation id を出力する
- score / confidence / evidence level を表示する
- top gaps と next improvements を表示する
- JSON 出力 option を持つ
```

検証:

```bash
bun run typecheck
```

### 7. Hono API

CLI と同じ usecase を Hono route から呼ぶ。

最小 API:

```text
POST /api/projects
GET  /api/projects/:id
POST /api/projects/:id/evaluations
GET  /api/projects/:id/evaluations/latest
GET  /api/evaluations/:id
GET  /api/evaluations/:id/improvements
POST /api/projects/:id/reevaluate
```

完了条件:

```text
- shared schema を route validation に使う
- frontend 専用の型を backend に重複定義しない
- CLI と API で評価ロジックを二重実装しない
```

検証:

```bash
bun run typecheck
bun run test
```

## MVP 完了ゲート

MVP は、次を満たした時点で完了とする。

```text
1. ローカル project root から evaluation bundle を保存できる
2. Project Ideal に対する評価を保存できる
3. score と overallConfidence が両方出る
4. dimension ごとの score と confidence が出る
5. notVerified と nextEvidenceToCollect が出る
6. gap が value-gap / evidence-gap などに分類される
7. ImprovementRequest が生成される
8. 2回目の評価で scoreDelta / confidenceDelta が出る
9. CLI と API が同じ usecase を使う
10. `bun run verify` が通る
```

## 初期プロンプト要件

`prompts/project-evaluation.md` には、最低限次の制約を含める。

```text
- 与えられた bundle に含まれない事実を断定しない
- evidence level を超えた評価をしない
- not verified を明示する
- score と confidence を分ける
- gap は value gap と evidence gap を分ける
- next improvements は acceptance criteria と verification commands を持つ
```

## リスクと対策

| Risk | 対策 |
| --- | --- |
| LLM が未確認の実装品質を断定する | evidence level と notVerified を prompt と schema の必須項目にする |
| score が毎回ぶれる | bundle 形式を固定し、previous evaluation を明示して比較させる |
| 改善提案が一般論になる | sourceGapIds、affected dimensions、acceptance criteria を必須にする |
| MVP が大きくなりすぎる | runtime verification と audit-grade evaluation を非対象に固定する |
| CLI と API のロジックが分岐する | usecase 層を共通化する |

## 次の実装着手順

最初の着手順は次の通り。

```text
1. shared schema を作る
2. Drizzle schema と migration を作る
3. bundle builder を作る
4. judge prompt と structured output validation を作る
5. evaluation service を作る
6. improvement generator を作る
7. CLI を作る
8. Hono route を作る
```
