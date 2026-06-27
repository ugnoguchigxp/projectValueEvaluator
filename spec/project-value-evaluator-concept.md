# ProjectValueEvaluator Concept

## 目的

ProjectValueEvaluator は、ソフトウェアプロジェクトの現在価値を評価し、100 点の理想状態との差分を次の改善タスクへ変換するための評価・改善発案レイヤーである。

このプロジェクトの価値は、単に点数を出すことではない。評価結果を、コーディングエージェントが実行できる改善依頼へ変換し、改善後に同じ観点で再評価できる状態を作ることにある。

```text
Project State
  -> Evaluation Bundle
  -> LLM Judge
  -> Score + Confidence
  -> Gaps to Ideal
  -> Improvement Requests
  -> Re-evaluation
```

## 100 点の定義

ProjectValueEvaluator は、プロジェクトごとに `Project Ideal` を持つ。

`Project Ideal` は、そのプロジェクトが最も価値を発揮している理想状態を自然文で定義したものである。評価は常に、この理想状態に対する現在地として行う。

100 点の定義が曖昧な場合、評価は主観的な感想になり、改善タスクへ変換しにくくなる。そのため、評価前に最低限次の情報を持つ。

```text
- project id
- project name
- project ideal
- primary audience
- target workflow
- non-goals
- evaluation dimensions
```

## 評価の中心

評価結果は `score` だけでは完結しない。

同じ 82 点でも、README と repo tree だけを見た 82 点と、テスト実行・アプリ起動・生成物確認まで済ませた 82 点では意味が違う。そのため、ProjectValueEvaluator は必ず評価深度と確信度を併記する。

```text
Score: 82 / 100
Evidence Level: surface + repo-structure
Confidence: 0.68
Not Verified:
  - local build
  - test execution
  - runtime behavior
  - sample output quality
Next Evidence:
  - run verification commands
  - inspect core implementation files
  - review generated reports
```

## Evidence Level

評価には深度がある。MVP では、評価結果に次の evidence level を持たせる。

| Level | 意味 |
| --- | --- |
| `surface` | README、LLM_CONTEXT、package metadata、公開情報などから評価 |
| `repo-structure` | directory tree、scripts、主要ファイル配置から評価 |
| `code-sampled` | 主要実装ファイルの一部を読んで評価 |
| `runtime-verified` | install、test、typecheck、build、起動、sample output を確認して評価 |
| `audit-grade` | セキュリティ境界、例外処理、sandbox、実行経路まで監査して評価 |

MVP では `surface` と `repo-structure` を最初の対象にする。`runtime-verified` と `audit-grade` は後続拡張とし、未確認であることを評価結果に明示する。

## 評価軸

初期の評価軸は次の通りとする。

| Dimension | 見るもの |
| --- | --- |
| Concept Value | 目的、理想状態、対象ユーザー、価値の明確さ |
| Implementation Completeness | 機能の実装範囲、API、CLI、保存、再評価の存在 |
| Architecture Quality | 境界、責務分離、拡張点、依存関係 |
| Maintainability | コード配置、命名、変更しやすさ、局所性 |
| Security | 入力境界、秘密情報、外部コマンド、LLM 出力の扱い |
| Testability | テストしやすさ、検証コマンド、fixture、再現性 |
| Documentation | README、LLM_CONTEXT、spec、使用例 |
| Agent Usability | コーディングエージェントが理解・修正・検証しやすいか |
| Extensibility | 評価軸、judge、bundle、保存先を差し替えやすいか |
| Reliability | 同じ入力で安定した評価を得られるか |
| Strategic Fit | NightWorkers、vulnWorkbench、Quality Oracle、contextStill と接続できるか |
| OSS / Product Value | 第三者が理解し、試し、価値を判断できるか |

各 dimension は `score` と `confidence` を別々に持つ。

## Gap の種類

100 点との差分は、すべて同じ意味ではない。

ProjectValueEvaluator は、gap を少なくとも次の種類に分ける。

| Gap Kind | 意味 |
| --- | --- |
| `value-gap` | プロジェクト価値そのものを下げている不足 |
| `evidence-gap` | 評価に必要な証拠が足りない不足 |
| `implementation-gap` | 実装の欠落や未完成 |
| `runtime-gap` | 実行・検証・生成物確認が未完了 |
| `documentation-gap` | 利用者や agent の理解に必要な文書不足 |

これにより、「価値を上げるタスク」と「評価の確信度を上げるタスク」を分けて提案できる。

## Improvement Request

改善依頼は、評価結果から生成される実行可能なタスク候補である。

最低限、次の情報を持つ。

```text
- title
- reason
- source gaps
- affected dimensions
- expected score gain
- expected confidence gain
- task type
- acceptance criteria
- verification commands
```

改善依頼は、どの gap と dimension から生成されたかを追跡できなければならない。

## MVP の到達点

MVP の到達点は次の状態である。

```text
任意のローカルプロジェクトに対して、
surface + repo-structure の evaluation bundle を作成し、
Project Ideal に対する 100 点満点評価を行い、
score / confidence / not verified / next evidence を保存し、
gaps を ImprovementRequest に変換し、
次回評価で scoreDelta と confidenceDelta を比較できる。
```

MVP では、複雑な独自採点モデル、自動修正実行、重い監査機能、豪華な dashboard は作らない。
