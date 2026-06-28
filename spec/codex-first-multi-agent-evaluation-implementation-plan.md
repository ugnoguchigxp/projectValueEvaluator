# Codex-First Multi-Agent Evaluation Implementation Plan

## Source Truth

ProjectValueEvaluator exists to make this everyday prompt repeatable, comparable, and useful for the next improvement cycle:

```text
このプロジェクトの価値について評価をしてください、できるだけ多角的に評点してください
```

The core product is the rating report itself. The application must not replace the judge with local heuristics. It should stabilize the prompt, rubric, output schema, provider settings, saved history, and comparison with previous evaluations.

Codex is the primary judge for the current implementation. OpenAI, Azure OpenAI, and Local LLM providers remain first-class future provider paths and must not be removed from the domain model. They may be marked as not implemented until their adapters are real.

## What Was Deleted

The old concept and MVP plan were removed because they treated deterministic fallback and repo-structure inspection as the practical center of the product. That conflicts with the current concept:

- `spec/project-value-evaluator-concept.md`
- `spec/mvp-implementation-plan.md`

This document is the implementation source truth until a narrower follow-up spec replaces it.

## Non-Negotiables

- The baseline prompt is a first-class field and is stored with every evaluation.
- The output includes an overall 0-100 score and dimension-level 0-100 scores.
- Codex is implemented first through `@openai/codex-sdk`.
- Other providers stay in schemas, settings, and adapter interfaces.
- Provider UI must distinguish `ready`, `configured`, `not-configured`, and `adapter-not-implemented`.
- Previous comparison is deterministic and computed from stored reports, not guessed by the judge.
- The core path does not run build, test, verify, or source inspection automatically.
- Evidence collection can exist later as an explicit add-on, not inside baseline evaluation.

## Target Flow

```text
ProjectProfile
  -> EvaluationPromptContext
  -> JudgeProviderAdapter
       Codex adapter: ready
       OpenAI adapter: adapter-not-implemented
       Azure OpenAI adapter: adapter-not-implemented
       Local LLM adapter: adapter-not-implemented
  -> ProjectEvaluationReport v1
  -> EvaluationDelta
  -> ImprovementIdeas
  -> Saved history for next comparison
```

## Core Types

### Baseline Prompt

```ts
const DEFAULT_BASELINE_PROMPT =
  "このプロジェクトの価値について評価をしてください、できるだけ多角的に評点してください";
```

### Judge Settings

```ts
type JudgeProvider = "codex" | "openai" | "azure-openai" | "local-llm";

type ProviderRuntimeStatus =
  | "ready"
  | "configured"
  | "not-configured"
  | "adapter-not-implemented";

type JudgeSettings = {
  provider: JudgeProvider;
  model?: string;
  endpoint?: string;
  apiKeyRef?: string;
  codexMode?: "review-only" | "improvement-request" | "reevaluation";
  status: ProviderRuntimeStatus;
};
```

### Evaluation Prompt Context

```ts
type EvaluationPromptContext = {
  schemaVersion: "evaluation-prompt-context/v1";
  baselinePrompt: string;
  projectName: string;
  projectRoot: string;
  projectIdeal?: string;
  primaryAudience?: string;
  targetWorkflow?: string;
  nonGoals: string[];
  dimensions: EvaluationDimension[];
  previousEvaluation?: EvaluationComparisonInput;
};
```

### Evaluation Report

```ts
type ProjectEvaluationReport = {
  schemaVersion: "project-evaluation-report/v1";
  baselinePrompt: string;
  judge: {
    provider: JudgeProvider;
    model?: string;
    mode?: string;
  };
  overallScore: number;
  confidence: number;
  summary: string;
  dimensions: Array<{
    key: string;
    label: string;
    score: number;
    confidence: number;
    rationale: string;
    evidence: string[];
    concerns: string[];
  }>;
  strengths: string[];
  weaknesses: string[];
  improvementIdeas: Array<{
    title: string;
    reason: string;
    expectedScoreImpact: number;
    affectedDimensions: string[];
    suggestedPrompt: string;
    acceptanceCriteria: string[];
  }>;
  notVerified: string[];
};
```

### Evaluation Delta

```ts
type EvaluationDelta = {
  previousEvaluationId: string;
  scoreDelta: number;
  confidenceDelta: number;
  dimensionDeltas: Array<{
    key: string;
    previousScore: number;
    currentScore: number;
    delta: number;
  }>;
  newWeaknesses: string[];
  resolvedWeaknesses: string[];
};
```

## Implementation Phases

### Phase 0: Baseline Capture

Goal: record the current behavior before changing the runtime path.

Tasks:

- Run the current Codex evaluation once against this repository.
- Save the JSON result under `spec/baselines/` or record the command and output path in the implementation PR.
- Record current failure modes if the run cannot complete.

Verification:

```bash
bun run evaluator:evaluate -- --project /Users/y.noguchi/Code/projectEvaluator --json
```

Expected result:

- Either a saved evaluation JSON exists, or a concrete runtime/auth/schema error is recorded.

Stop condition:

- Do not start runtime rewrites without a baseline or a recorded blocker.

### Phase 1: Shared Schema Replacement

Goal: make the rating report the primary output contract.

Files:

- `shared/schemas/evaluation.schema.ts`
- `shared/schemas/project.schema.ts`

Tasks:

- Add `baselinePrompt`.
- Add `judgeProviderSchema`, `providerRuntimeStatusSchema`, and provider-preserving `judgeSettingsSchema`.
- Add `evaluationPromptContextSchema`.
- Add `projectEvaluationReportSchema`.
- Add `evaluationDeltaSchema`.
- Keep compatibility types only where needed for the next phase.

Verification:

```bash
bun run typecheck
bunx vitest run shared api/modules/llm/judge-client.test.ts
```

Expected result:

- Schemas validate score and confidence ranges.
- Codex remains an allowed provider.
- OpenAI, Azure OpenAI, and Local LLM remain allowed providers.

### Phase 2: Prompt Context Builder

Goal: replace the oversized bundle path with a simple prompt context.

Files:

- `api/modules/evaluations/bundle-builder.ts`
- or new `api/modules/evaluations/prompt-context-builder.ts`

Tasks:

- Build `EvaluationPromptContext` from `ProjectProfile`, selected `JudgeSettings`, and previous evaluation summary.
- Include only stable project inputs: README, LLM_CONTEXT, AGENTS, package metadata, repo tree, and optional previous report summary.
- Remove automatic source file sampling from the core path.
- Remove automatic verification command execution from the core path.
- Rename `SystemContext` concepts to `EvaluationPromptContext`.

Verification:

```bash
bunx vitest run api/modules/evaluations/evaluation.service.test.ts
bun run typecheck
```

Expected result:

- Evaluation startup does not execute build/test/verify.
- Prompt context contains the baseline prompt and previous comparison input.

### Phase 3: Provider Adapter Boundary

Goal: implement Codex now while preserving future providers.

Files:

- `api/modules/llm/judge-client.ts`
- new `api/modules/llm/provider-adapters.ts`
- new `api/modules/llm/prompts.ts`

Tasks:

- Define `JudgeProviderAdapter`.
- Implement `CodexJudgeProviderAdapter` using `@openai/codex-sdk`.
- Keep OpenAI, Azure OpenAI, and Local LLM adapters as explicit `adapter-not-implemented` implementations.
- Return provider status without pretending an adapter can execute.
- Use read-only Codex execution:
  - `sandboxMode: "read-only"`
  - `approvalPolicy: "never"`
  - network disabled unless the user explicitly adds a later feature.
- Ask Codex for JSON matching `ProjectEvaluationReport v1`.

Verification:

```bash
bunx vitest run api/modules/llm/judge-client.test.ts
bun run typecheck
```

Expected result:

- Codex adapter can run when authenticated.
- Non-Codex providers fail with `adapter-not-implemented`, not with silent fallback.
- Provider settings are included in the saved report snapshot.

### Phase 4: Evaluation Service and Delta

Goal: save reports and compute deterministic comparison.

Files:

- `api/modules/evaluations/evaluation.service.ts`
- `api/modules/evaluations/evaluation.repository.ts`
- `api/modules/evaluations/improvement-generator.ts`
- `api/db/schema.ts`
- `drizzle/`

Tasks:

- Persist the prompt context, judge settings snapshot, raw judge output, parsed report, and computed delta.
- Compute `EvaluationDelta` from current and previous saved reports.
- Generate improvement requests from `report.improvementIdeas` and preserve source dimension links.
- Keep previous API response compatibility only if needed by the UI during migration.

Verification:

```bash
DATABASE_URL=/tmp/project-evaluator-plan.sqlite bun run db:migrate
bunx vitest run api/modules/evaluations/evaluation.service.test.ts api/routes/projects.route.test.ts api/routes/evaluations.route.test.ts
bun run typecheck
```

Expected result:

- First run has no delta.
- Second run has score, confidence, and dimension deltas.
- Improvement ideas remain traceable to report dimensions.

### Phase 5: CLI and API Contract

Goal: make the runtime usable before UI polish.

Files:

- `api/cli/evaluator-runtime.ts`
- `api/cli/evaluate.ts`
- `api/cli/reevaluate.ts`
- `api/routes/projects.route.ts`
- `api/routes/evaluations.route.ts`
- `api/routes/codex.route.ts`

Tasks:

- Add CLI flags for `--provider`, `--model`, `--baseline-prompt`, and Codex mode.
- Default provider to Codex.
- Keep non-Codex provider inputs accepted but return clear adapter status when selected.
- Return `ProjectEvaluationReport` and `EvaluationDelta` from API.

Verification:

```bash
bun run evaluator:evaluate -- --project /Users/y.noguchi/Code/projectEvaluator --json
bun run evaluator:reevaluate -- --project /Users/y.noguchi/Code/projectEvaluator --json
bunx vitest run api/routes/projects.route.test.ts api/routes/codex.route.ts
```

Expected result:

- CLI can produce a report with Codex.
- Re-evaluation prints deterministic deltas.
- API streams activity without requiring source inspection events.

### Phase 6: Settings and Workbench UI

Goal: show provider truth and report comparison without misleading the user.

Files:

- `web/src/judge-settings-context.tsx`
- `web/src/views/settings-view.tsx`
- `web/src/views/home-view.tsx`
- `web/src/api.ts`
- `web/src/ui-language-context.tsx`

Tasks:

- Keep provider settings for Codex, OpenAI, Azure OpenAI, and Local LLM.
- Show runtime status separately from configuration.
- Make Codex the default active provider.
- Show `adapter-not-implemented` for unfinished providers.
- Show overall score, dimension scores, weaknesses, improvement ideas, and previous deltas.
- Remove source inspection and verification panels from the baseline result view.

Verification:

```bash
bun run typecheck
bun run build:web
```

Expected result:

- Settings do not imply unfinished providers are executable.
- Home view centers on rating, comparison, and improvement ideas.

### Phase 7: Remove Obsolete Core Concepts

Goal: finish the cleanup after the new path is working.

Delete or retire:

- `EvaluationSystemContext`
- `sourceInspectionPlan` in the baseline evaluation path
- automatic `sourceFiles` evidence in the baseline evaluation path
- automatic `verificationRuns` in the baseline evaluation path
- deterministic fallback judge as a product path

Keep:

- Provider abstraction
- ProjectProfile
- dimensions
- improvement requests
- Codex activity events if they help debug real judge execution

Verification:

```bash
rg -n "SystemContext|sourceInspectionPlan|verificationRuns|deterministic fallback|deterministic-fallback" api shared web README.md LLM_CONTEXT.md spec
bun run verify
```

Expected result:

- Remaining matches are either compatibility tests scheduled for deletion or explicit migration notes.
- `bun run verify` passes, or the failure is unrelated and documented.

## Implementation Order

1. Baseline capture.
2. Schema replacement.
3. Prompt context builder.
4. Codex provider adapter boundary.
5. Evaluation persistence and delta.
6. CLI/API migration.
7. UI migration.
8. Obsolete concept removal.
9. Full verification.

## Review Gates

Each gate should be reviewable independently:

- Gate A: docs and source truth only.
- Gate B: schema and prompt context.
- Gate C: Codex adapter and provider statuses.
- Gate D: persistence and delta.
- Gate E: CLI/API execution.
- Gate F: UI.
- Gate G: final cleanup.

## Non-Goals

- Do not build automatic code improvement execution.
- Do not implement provider voting in this pass.
- Do not remove non-Codex provider settings or schema support.
- Do not run target project verification as part of baseline evaluation.
- Do not claim audit-grade evidence without a separate explicit evidence collector.
- Do not preserve old design docs that conflict with this source truth.
