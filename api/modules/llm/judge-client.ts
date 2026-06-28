import { randomUUID } from "node:crypto";
import {
	Codex,
	type ThreadEvent,
	type ThreadItem,
	type Usage,
} from "@openai/codex-sdk";
import {
	type CodexMode,
	defaultBaselinePrompt,
	evaluationDeltaSchema,
	focusedImprovementIdeasResultSchema,
	projectEvaluationReportSchema,
	projectValueEvaluationSchema,
	type EvaluationBundle,
	type EvaluationDelta,
	type FocusedImprovementIdea,
	type JudgeRun,
	type JudgeSelection,
	type ProjectEvaluationReport,
	type ProjectValueEvaluation,
} from "../../../shared/schemas/evaluation.schema";
import {
	defaultEvaluationDimensions,
	evaluationDimensionLabels,
	type EvaluationDimensionKey,
	type ProjectProfile,
} from "../../../shared/schemas/project.schema";
import { HttpError } from "../auth/errors";
import type { EvaluationActivityEmitter } from "../evaluations/evaluation.service";

export const defaultCodexJudgeSelection: Extract<
	JudgeSelection,
	{ type: "codex-agent" }
> = {
	type: "codex-agent",
	model: "gpt-5.5",
	mode: "review-only",
};

const SECRET_KEY_PATTERN =
	/(authorization|cookie|token|secret|api[_-]?key|password)/i;

function redactProviderEvent(value: unknown): unknown {
	if (Array.isArray(value))
		return value.map((item) => redactProviderEvent(item));
	if (!value || typeof value !== "object") return value;
	const redacted: Record<string, unknown> = {};
	for (const [key, child] of Object.entries(value)) {
		redacted[key] = SECRET_KEY_PATTERN.test(key)
			? "[REDACTED]"
			: redactProviderEvent(child);
	}
	return redacted;
}

function activityForCodexEvent(
	event: ThreadEvent,
): Parameters<EvaluationActivityEmitter>[0] {
	const base = {
		phase: "judge",
		level: "debug" as const,
		source: "codex",
		payload: { providerEvent: redactProviderEvent(event) },
	};

	if (event.type === "thread.started") {
		return {
			...base,
			level: "checkpoint",
			message: `Codex thread started: ${event.thread_id}.`,
			status: "started",
		};
	}
	if (event.type === "turn.started") {
		return {
			...base,
			level: "info",
			message: "Codex turn started.",
			status: "started",
		};
	}
	if (event.type === "turn.completed") {
		return {
			...base,
			level: "checkpoint",
			message: "Codex turn completed.",
			status: "completed",
			payload: {
				usage: normalizeUsage(event.usage),
				providerEvent: redactProviderEvent(event),
			},
		};
	}
	if (event.type === "turn.failed") {
		return {
			...base,
			level: "error",
			message: `Codex turn failed: ${event.error.message}`,
			status: "failed",
		};
	}
	if (event.type === "error") {
		return {
			...base,
			level: "error",
			message: `Codex stream error: ${event.message}`,
			status: "failed",
		};
	}

	const item = event.item;
	if (item.type === "agent_message") {
		return {
			...base,
			level: event.type === "item.completed" ? "checkpoint" : "debug",
			message:
				event.type === "item.completed"
					? "Codex assistant response completed."
					: "Codex assistant response updated.",
			status: event.type,
			payload: {
				itemType: item.type,
				text: item.text,
				providerEvent: redactProviderEvent(event),
			},
		};
	}
	if (item.type === "command_execution") {
		return {
			...base,
			level: "info",
			message: `Codex command ${event.type}: ${item.command}`,
			status: item.status,
			payload: {
				itemType: item.type,
				command: item.command,
				status: item.status,
				exitCode: item.exit_code,
				aggregatedOutput: item.aggregated_output,
				providerEvent: redactProviderEvent(event),
			},
		};
	}
	if (item.type === "mcp_tool_call") {
		return {
			...base,
			level: "info",
			message: `Codex MCP tool ${event.type}: ${item.server}.${item.tool}`,
			status: item.status,
			payload: {
				itemType: item.type,
				server: item.server,
				tool: item.tool,
				arguments: redactProviderEvent(item.arguments),
				result: redactProviderEvent(item.result),
				error: item.error?.message,
				status: item.status,
				providerEvent: redactProviderEvent(event),
			},
		};
	}
	if (item.type === "file_change") {
		return {
			...base,
			level: "info",
			message: `Codex file change ${item.status}: ${item.changes.length} file(s).`,
			status: item.status,
			payload: {
				itemType: item.type,
				changes: redactProviderEvent(item.changes),
				providerEvent: redactProviderEvent(event),
			},
		};
	}
	return {
		...base,
		message: `Codex activity ${event.type}: ${item.type}.`,
		status: event.type,
	};
}

function normalizeUsage(usage: Usage | null) {
	if (!usage) return null;
	return {
		inputTokens: usage.input_tokens,
		cachedInputTokens: usage.cached_input_tokens,
		outputTokens: usage.output_tokens,
		reasoningOutputTokens: usage.reasoning_output_tokens,
	};
}

const dimensionKeys = [...defaultEvaluationDimensions];
const codexJudgeTimeoutMs = 300_000;

const codexOutputJsonSchema = {
	type: "object",
	additionalProperties: false,
	required: [
		"schemaVersion",
		"baselinePrompt",
		"judge",
		"overallScore",
		"confidence",
		"summary",
		"dimensions",
		"strengths",
		"weaknesses",
	],
	properties: {
		schemaVersion: { type: "string", enum: ["project-evaluation-report/v1"] },
		baselinePrompt: { type: "string", minLength: 1 },
		judge: {
			type: "object",
			additionalProperties: false,
			required: ["provider", "model", "mode"],
			properties: {
				provider: { type: "string", enum: ["codex"] },
				model: { type: "string" },
				mode: { type: "string" },
			},
		},
		overallScore: { type: "number", minimum: 0, maximum: 100 },
		confidence: { type: "number", minimum: 0, maximum: 1 },
		summary: { type: "string", minLength: 1 },
		dimensions: {
			type: "array",
			minItems: 1,
			items: {
				type: "object",
				additionalProperties: false,
				required: [
					"key",
					"label",
					"score",
					"confidence",
					"rationale",
					"evidence",
					"concerns",
				],
				properties: {
					key: { type: "string", enum: dimensionKeys },
					label: { type: "string", minLength: 1 },
					score: { type: "number", minimum: 0, maximum: 100 },
					confidence: { type: "number", minimum: 0, maximum: 1 },
					rationale: { type: "string", minLength: 1 },
					evidence: {
						type: "array",
						items: { type: "string" },
					},
					concerns: {
						type: "array",
						items: { type: "string" },
					},
				},
			},
		},
		strengths: {
			type: "array",
			items: { type: "string" },
		},
		weaknesses: {
			type: "array",
			items: { type: "string" },
		},
	},
};

const focusedImprovementIdeasOutputJsonSchema = {
	type: "object",
	additionalProperties: false,
	required: ["schemaVersion", "ideas"],
	properties: {
		schemaVersion: {
			type: "string",
			enum: ["focused-improvement-ideas/v3"],
		},
		ideas: {
			type: "array",
			minItems: 1,
			maxItems: 12,
			items: {
				type: "object",
				additionalProperties: false,
				required: [
					"title",
					"targetDimensions",
					"summary",
					"agentPrompt",
					"implementationFocus",
					"expectedOutcome",
					"scoreImpacts",
				],
				properties: {
					title: { type: "string", minLength: 1 },
					targetDimensions: {
						type: "array",
						minItems: 1,
						items: { type: "string", enum: dimensionKeys },
					},
					summary: { type: "string", minLength: 1 },
					agentPrompt: { type: "string", minLength: 1 },
					implementationFocus: {
						type: "array",
						minItems: 1,
						maxItems: 4,
						items: { type: "string", minLength: 1 },
					},
					expectedOutcome: { type: "string", minLength: 1 },
					scoreImpacts: {
						type: "array",
						minItems: 1,
						items: {
							type: "object",
							additionalProperties: false,
							required: [
								"dimensionKey",
								"currentScore",
								"expectedScoreGain",
								"expectedScoreAfter",
								"rationale",
							],
							properties: {
								dimensionKey: { type: "string", enum: dimensionKeys },
								currentScore: {
									type: "integer",
									minimum: 0,
									maximum: 100,
								},
								expectedScoreGain: {
									type: "integer",
									minimum: 0,
									maximum: 100,
								},
								expectedScoreAfter: {
									type: "integer",
									minimum: 0,
									maximum: 100,
								},
								rationale: { type: "string", minLength: 1 },
							},
						},
					},
				},
			},
		},
	},
};

function modeInstruction(mode: CodexMode): string {
	if (mode === "improvement-request") {
		return "ギャップを実装可能な改善依頼へ変換することに集中してください。ファイルは変更しないでください。";
	}
	if (mode === "reevaluation") {
		return "前回評価からのスコアと信頼度の差分に集中してください。ファイルは変更しないでください。";
	}
	return "レビューのみ行ってください。bundle を評価し、ファイルは変更しないでください。";
}

function createCodexPrompt(params: {
	project: ProjectProfile;
	bundle: EvaluationBundle;
	previousEvaluation?: ProjectValueEvaluation | null;
	mode: CodexMode;
}): string {
	const promptContext =
		params.bundle.inputs.promptContext ??
		({
			schemaVersion: "evaluation-prompt-context/v1",
			baselinePrompt: defaultBaselinePrompt,
			projectName: params.project.name,
			projectRoot: params.bundle.projectRoot,
			projectIdeal: params.project.ideal,
			primaryAudience: params.project.primaryAudience,
			targetWorkflow: params.project.targetWorkflow,
			nonGoals: params.project.nonGoals,
			dimensions: params.project.dimensions.map((key) => ({
				key,
				label: evaluationDimensionLabels[key],
			})),
			judgeSettings: {
				provider: "codex",
				model: "gpt-5.5",
				codexMode: params.mode,
				status: "ready",
			},
			inputs: {
				readme: params.bundle.inputs.readme,
				llmContext: params.bundle.inputs.llmContext,
				agents: params.bundle.inputs.agents,
				packageJson: params.bundle.inputs.packageJson,
				repoTree: params.bundle.inputs.repoTree,
				scripts: params.bundle.inputs.scripts,
			},
		} as const);
	return [
		"提供された出力スキーマに一致する JSON だけを返してください。",
		modeInstruction(params.mode),
		`評価対象ディレクトリ: ${params.bundle.projectRoot}`,
		`評価対象プロジェクト名: ${promptContext.projectName}`,
		"この ProjectValueEvaluator 実行環境は評価器であり、評価対象ではありません。評価対象は EvaluationPromptContext.projectRoot / projectName のプロジェクトだけです。",
		"projectIdeal が評価対象名や repository 内容と矛盾する場合は、projectRoot の README、package metadata、repoTree、baselinePrompt を優先してください。",
		"baselinePrompt を評価依頼の中心として扱ってください。",
		"overallScore と各 dimensions.score を 0-100 で評点してください。",
		"Market Competitiveness / 市場競争力は、既存の競合・類似OSS・代替手段と比べて選ばれる理由があるかを評価してください。提供コンテキスト上で似たOSSや圧倒的競合が読み取れる場合は、その点を市場競争力の減点理由と rationale / concerns に明記してください。",
		"OSSや外部提供の訴求力、差別化、導入理由は独立軸ではなく市場競争力の下位観点として扱ってください。",
		"前回評価がある場合でも、比較は補助情報として扱い、今回の評点を独立して出してください。",
		"追加のコマンド実行は必須ではありません。まず提供された EvaluationPromptContext から簡潔に評価してください。",
		"weaknesses は最大 6 件にしてください。",
		"summary、rationale、strengths、weaknesses は日本語で書いてください。",
		"",
		"EvaluationPromptContext:",
		JSON.stringify(promptContext, null, 2),
	].join("\n");
}

function createFocusedImprovementIdeasPrompt(params: {
	project: ProjectProfile;
	bundle: EvaluationBundle;
	evaluation: ProjectValueEvaluation;
	dimensionKeys: EvaluationDimensionKey[];
}): string {
	const promptContext = params.bundle.inputs.promptContext;
	const selectedDimensionSet = new Set(params.dimensionKeys);
	const selectedDimensions = (
		params.evaluation.report?.dimensions ?? params.evaluation.dimensions
	).filter((dimension) => selectedDimensionSet.has(dimension.key));
	const evaluationSnapshot = {
		evaluationId: params.evaluation.id,
		bundleId: params.evaluation.bundleId,
		createdAt: params.evaluation.createdAt,
		score: params.evaluation.score,
		confidence: params.evaluation.overallConfidence,
		summary: params.evaluation.summary,
		strengths: params.evaluation.strengths,
		weaknesses: params.evaluation.report?.weaknesses,
		selectedDimensions,
		delta: params.evaluation.delta,
	};
	return [
		"提供された出力スキーマに一致する JSON だけを返してください。",
		"保存済み評価セッションと EvaluationPromptContext を引き継ぎ、選択された評価軸だけを対象に改善案を生成してください。",
		"ファイルは変更しないでください。必要なら読むだけにしてください。",
		"改善案はできるだけ多角的に出してください。重複を避け、選択軸の数とギャップの数に応じて 6-12 件を目安にしてください。",
		"改善案は、別のコーディングエージェントへそのまま貼り付けられる短い実行依頼として書いてください。",
		"agentPrompt は 350-700 字程度の日本語にし、何をどう実装するか、守る範囲、最低限確認する観点を誤解なく含めてください。",
		"agentPrompt は実装計画書ほど細かくしないでください。長い完了条件、リスク、検証コマンド、確認ファイルの列挙は禁止です。",
		"implementationFocus は agentPrompt の補助として、実装の焦点を最大 4 件の短い日本語フレーズで書いてください。",
		"scoreImpacts は実施効果の概算です。選択された評価軸ごとに currentScore、expectedScoreGain、expectedScoreAfter、rationale を書いてください。",
		"expectedScoreAfter は currentScore + expectedScoreGain を 100 上限で丸めた整数にしてください。根拠が弱い場合は expectedScoreGain を控えめにしてください。",
		"targetDimensions には、依頼された selectedDimensionKeys の中に含まれる key だけを入れてください。未選択の評価軸は対象に含めないでください。",
		"scoreImpacts.dimensionKey も selectedDimensionKeys の中に含まれる key だけを入れてください。",
		"title、summary、agentPrompt、implementationFocus、expectedOutcome、scoreImpacts.rationale は日本語で書いてください。",
		`評価対象ディレクトリ: ${params.bundle.projectRoot}`,
		`評価対象プロジェクト名: ${promptContext?.projectName ?? params.project.name}`,
		"",
		"selectedDimensionKeys:",
		JSON.stringify(params.dimensionKeys, null, 2),
		"",
		"EvaluationPromptContext:",
		JSON.stringify(promptContext ?? params.bundle.inputs, null, 2),
		"",
		"SavedEvaluationSession:",
		JSON.stringify(evaluationSnapshot, null, 2),
	].join("\n");
}

function parseJsonFromCodexResponse(value: string): unknown {
	try {
		return JSON.parse(value);
	} catch {
		const fenced = value.match(/```(?:json)?\s*([\s\S]*?)```/);
		if (fenced?.[1]) {
			return JSON.parse(fenced[1]);
		}
		const start = value.indexOf("{");
		const end = value.lastIndexOf("}");
		if (start >= 0 && end > start) {
			return JSON.parse(value.slice(start, end + 1));
		}
		throw new Error("Codex did not return parseable JSON.");
	}
}

function computeDelta(params: {
	report: ProjectEvaluationReport;
	previousEvaluation?: ProjectValueEvaluation | null;
}): EvaluationDelta | undefined {
	const previous = params.previousEvaluation;
	if (!previous) return undefined;
	const previousScore = previous.report?.overallScore ?? previous.score;
	const previousConfidence =
		previous.report?.confidence ?? previous.overallConfidence;
	const previousDimensions = new Map(
		(previous.report?.dimensions ?? previous.dimensions).map((dimension) => [
			dimension.key,
			dimension.score,
		]),
	);
	const previousWeaknesses = new Set(
		previous.report?.weaknesses ?? previous.gapsTo100.map((gap) => gap.title),
	);
	const currentWeaknesses = new Set(params.report.weaknesses);
	return evaluationDeltaSchema.parse({
		previousEvaluationId: previous.id,
		scoreDelta: params.report.overallScore - previousScore,
		confidenceDelta: Number(
			(params.report.confidence - previousConfidence).toFixed(3),
		),
		dimensionDeltas: params.report.dimensions
			.filter((dimension) => previousDimensions.has(dimension.key))
			.map((dimension) => {
				const previousDimensionScore =
					previousDimensions.get(dimension.key) ?? 0;
				return {
					key: dimension.key,
					previousScore: previousDimensionScore,
					currentScore: dimension.score,
					delta: dimension.score - previousDimensionScore,
				};
			}),
		newWeaknesses: params.report.weaknesses.filter(
			(weakness) => !previousWeaknesses.has(weakness),
		),
		resolvedWeaknesses: [...previousWeaknesses].filter(
			(weakness) => !currentWeaknesses.has(weakness),
		),
	});
}

function reportToEvaluation(params: {
	project: ProjectProfile;
	bundle: EvaluationBundle;
	report: ProjectEvaluationReport;
	delta?: EvaluationDelta;
	previousEvaluation?: ProjectValueEvaluation | null;
}): ProjectValueEvaluation {
	const previousScore = params.previousEvaluation?.score;
	const previousConfidence = params.previousEvaluation?.overallConfidence;
	return projectValueEvaluationSchema.parse({
		id: randomUUID(),
		projectId: params.project.id,
		bundleId: params.bundle.id,
		score: params.report.overallScore,
		idealScore: 100,
		overallConfidence: params.report.confidence,
		evidenceLevel: params.bundle.evidenceLevel,
		summary: params.report.summary,
		dimensions: params.report.dimensions.map((dimension) => ({
			key: dimension.key,
			score: dimension.score,
			confidence: dimension.confidence,
			rationale: dimension.rationale,
			evidenceRefs: dimension.evidence,
			caveats: dimension.concerns,
		})),
		strengths: params.report.strengths,
		gapsTo100: [],
		sourceInspections: [],
		notVerified: [],
		nextEvidenceToCollect: [],
		previousScore,
		scoreDelta:
			previousScore === undefined
				? undefined
				: params.report.overallScore - previousScore,
		previousConfidence,
		confidenceDelta:
			previousConfidence === undefined
				? undefined
				: Number((params.report.confidence - previousConfidence).toFixed(3)),
		baselinePrompt: params.report.baselinePrompt,
		judgeSettings: params.bundle.inputs.promptContext?.judgeSettings,
		report: params.report,
		delta: params.delta,
		createdAt: new Date().toISOString(),
	});
}

async function judgeProjectValueWithCodex(params: {
	project: ProjectProfile;
	bundle: EvaluationBundle;
	previousEvaluation?: ProjectValueEvaluation | null;
	judge: Extract<JudgeSelection, { type: "codex-agent" }>;
	emitActivity?: EvaluationActivityEmitter;
}): Promise<{
	evaluation: ProjectValueEvaluation;
	rawOutput: unknown;
	judgeRun: JudgeRun;
}> {
	try {
		const abortController = new AbortController();
		const timeout = setTimeout(() => {
			abortController.abort();
		}, codexJudgeTimeoutMs);
		const codex = new Codex();
		const thread = codex.startThread({
			model: params.judge.model,
			workingDirectory: params.bundle.projectRoot,
			sandboxMode: "read-only",
			approvalPolicy: "never",
			skipGitRepoCheck: true,
			networkAccessEnabled: false,
			webSearchMode: "disabled",
		});
		const streamed = await thread.runStreamed(
			createCodexPrompt({
				project: params.project,
				bundle: params.bundle,
				previousEvaluation: params.previousEvaluation,
				mode: params.judge.mode,
			}),
			{
				outputSchema: codexOutputJsonSchema,
				signal: abortController.signal,
			},
		);
		const items: ThreadItem[] = [];
		let finalResponse = "";
		let usage: Usage | null = null;
		let turnFailure: string | null = null;
		try {
			for await (const event of streamed.events) {
				await params.emitActivity?.(activityForCodexEvent(event));
				if (event.type === "item.completed") {
					if (event.item.type === "agent_message") {
						finalResponse = event.item.text;
					}
					items.push(event.item);
				} else if (event.type === "turn.completed") {
					usage = event.usage;
				} else if (event.type === "turn.failed") {
					turnFailure = event.error.message;
					break;
				} else if (event.type === "error") {
					turnFailure = event.message;
					break;
				}
			}
		} finally {
			clearTimeout(timeout);
		}
		if (turnFailure) {
			throw new Error(turnFailure);
		}
		const report = projectEvaluationReportSchema.parse(
			parseJsonFromCodexResponse(finalResponse),
		);
		const delta = computeDelta({
			report,
			previousEvaluation: params.previousEvaluation,
		});
		const evaluation = reportToEvaluation({
			project: params.project,
			bundle: params.bundle,
			report,
			delta,
			previousEvaluation: params.previousEvaluation,
		});
		return {
			evaluation,
			rawOutput: {
				judge: "codex-agent",
				model: params.judge.model,
				mode: params.judge.mode,
				threadId: thread.id,
				usage,
				finalResponse,
				report,
				delta,
				items,
			},
			judgeRun: {
				judge: "codex-agent",
				status: "completed",
				model: params.judge.model,
				mode: params.judge.mode,
				threadId: thread.id,
				usage,
			},
		};
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		throw new HttpError(
			502,
			`Codex judge failed: ${message}. Run "bunx codex login status" or "bunx codex doctor --summary" to verify Codex authentication and runtime health.`,
		);
	}
}

export async function judgeProjectValue(params: {
	project: ProjectProfile;
	bundle: EvaluationBundle;
	previousEvaluation?: ProjectValueEvaluation | null;
	judge?: JudgeSelection;
	emitActivity?: EvaluationActivityEmitter;
}): Promise<{
	evaluation: ProjectValueEvaluation;
	rawOutput: unknown;
	judgeRun: JudgeRun;
}> {
	const judge = params.judge ?? defaultCodexJudgeSelection;

	if (judge.type === "codex-agent") {
		return judgeProjectValueWithCodex({
			project: params.project,
			bundle: params.bundle,
			previousEvaluation: params.previousEvaluation,
			judge,
			emitActivity: params.emitActivity,
		});
	}

	throw new HttpError(
		501,
		`${judge.provider} judge adapter is not implemented. Select Codex agent for evaluation.`,
	);
}

export async function generateFocusedImprovementIdeasWithCodex(params: {
	project: ProjectProfile;
	bundle: EvaluationBundle;
	evaluation: ProjectValueEvaluation;
	dimensionKeys: EvaluationDimensionKey[];
	judge?: JudgeSelection;
}): Promise<{
	ideas: FocusedImprovementIdea[];
	rawOutput: unknown;
	judgeRun: JudgeRun;
}> {
	const judge =
		params.judge?.type === "codex-agent"
			? { ...params.judge, mode: "improvement-request" as const }
			: (params.judge ?? {
					...defaultCodexJudgeSelection,
					mode: "improvement-request" as const,
				});
	if (judge.type !== "codex-agent") {
		throw new HttpError(
			501,
			`${judge.provider} judge adapter is not implemented. Select Codex agent for improvement idea generation.`,
		);
	}

	try {
		const abortController = new AbortController();
		const timeout = setTimeout(() => {
			abortController.abort();
		}, codexJudgeTimeoutMs);
		const codex = new Codex();
		const thread = codex.startThread({
			model: judge.model,
			workingDirectory: params.bundle.projectRoot,
			sandboxMode: "read-only",
			approvalPolicy: "never",
			skipGitRepoCheck: true,
			networkAccessEnabled: false,
			webSearchMode: "disabled",
		});
		const streamed = await thread.runStreamed(
			createFocusedImprovementIdeasPrompt({
				project: params.project,
				bundle: params.bundle,
				evaluation: params.evaluation,
				dimensionKeys: params.dimensionKeys,
			}),
			{
				outputSchema: focusedImprovementIdeasOutputJsonSchema,
				signal: abortController.signal,
			},
		);
		const items: ThreadItem[] = [];
		let finalResponse = "";
		let usage: Usage | null = null;
		let turnFailure: string | null = null;
		try {
			for await (const event of streamed.events) {
				if (event.type === "item.completed") {
					if (event.item.type === "agent_message") {
						finalResponse = event.item.text;
					}
					items.push(event.item);
				} else if (event.type === "turn.completed") {
					usage = event.usage;
				} else if (event.type === "turn.failed") {
					turnFailure = event.error.message;
					break;
				} else if (event.type === "error") {
					turnFailure = event.message;
					break;
				}
			}
		} finally {
			clearTimeout(timeout);
		}
		if (turnFailure) {
			throw new Error(turnFailure);
		}
		const parsed = focusedImprovementIdeasResultSchema.parse(
			parseJsonFromCodexResponse(finalResponse),
		);
		return {
			ideas: parsed.ideas,
			rawOutput: {
				judge: "codex-agent",
				model: judge.model,
				mode: judge.mode,
				threadId: thread.id,
				usage,
				finalResponse,
				ideas: parsed.ideas,
				items,
			},
			judgeRun: {
				judge: "codex-agent",
				status: "completed",
				model: judge.model,
				mode: judge.mode,
				threadId: thread.id,
				usage,
			},
		};
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		throw new HttpError(
			502,
			`Codex improvement idea generation failed: ${message}. Run "bunx codex login status" or "bunx codex doctor --summary" to verify Codex authentication and runtime health.`,
		);
	}
}
