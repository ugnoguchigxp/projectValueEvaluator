import {
	AlertTriangle,
	BarChart3,
	BrainCircuit,
	CheckCircle2,
	Copy,
	FolderOpen,
	LoaderCircle,
	Plus,
	RefreshCw,
	Trash2,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import type {
	EvaluationActivityEvent,
	EvaluationBundle,
	EvaluationResponse,
	GenerateFocusedImprovementIdeasResponse,
	JudgeSelection,
	JudgeRun,
	ListFocusedImprovementIdeasResponse,
	ProjectValueEvaluation,
	SavedFocusedImprovementIdea,
} from "@shared/schemas/evaluation.schema";
import type {
	EvaluationDimensionKey,
	ProjectProfile,
	ProjectProfileInput,
} from "@shared/schemas/project.schema";
import { isExecutableJudge, useJudgeSettings } from "../judge-settings-context";
import { useUiLanguage } from "../ui-language-context";

async function parseJsonResponse<T>(response: Response): Promise<T> {
	if (!response.ok) {
		let message = `Request failed: ${response.status}`;
		try {
			const body = (await response.json()) as { message?: string };
			if (body.message) message = body.message;
		} catch {
			// Keep status-derived message for non-JSON responses.
		}
		throw new Error(message);
	}
	return (await response.json()) as T;
}

async function createProject(input: ProjectProfileInput) {
	return parseJsonResponse<{ project: ProjectProfile }>(
		await fetch("/api/projects", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(input),
		}),
	);
}

async function listProjects() {
	return parseJsonResponse<{ projects: ProjectProfile[] }>(
		await fetch("/api/projects"),
	);
}

async function listProjectEvaluations(projectId: string) {
	return parseJsonResponse<{ evaluations: ProjectValueEvaluation[] }>(
		await fetch(`/api/projects/${projectId}/evaluations`),
	);
}

async function fetchEvaluation(evaluationId: string) {
	const [detail, focused] = await Promise.all([
		parseJsonResponse<{
			evaluation: ProjectValueEvaluation;
			activityEvents: EvaluationActivityEvent[];
		}>(await fetch(`/api/evaluations/${evaluationId}`)),
		listFocusedImprovements(evaluationId),
	]);
	return {
		evaluation: detail.evaluation,
		activityEvents: detail.activityEvents,
		focusedImprovements: toDisplayedFocusedImprovements(focused.ideas),
	};
}

async function deleteProject(projectId: string) {
	return parseJsonResponse<{ project: ProjectProfile }>(
		await fetch(`/api/projects/${projectId}`, {
			method: "DELETE",
		}),
	);
}

async function generateFocusedImprovements(
	evaluationId: string,
	dimensionKeys: EvaluationDimensionKey[],
	judge: JudgeSelection,
) {
	return parseJsonResponse<GenerateFocusedImprovementIdeasResponse>(
		await fetch(`/api/evaluations/${evaluationId}/focused-improvements`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ dimensionKeys, judge }),
		}),
	);
}

async function listFocusedImprovements(evaluationId: string) {
	return parseJsonResponse<ListFocusedImprovementIdeasResponse>(
		await fetch(`/api/evaluations/${evaluationId}/focused-improvements`),
	);
}

type EvaluationStreamMessage =
	| { type: "activity"; activity: EvaluationActivityEvent }
	| { type: "result"; result: EvaluationResponse }
	| { type: "error"; message: string };

async function streamProjectEvaluation(
	mode: "evaluate" | "reevaluate",
	projectId: string,
	judge: JudgeSelection,
	onActivity: (event: EvaluationActivityEvent) => void,
) {
	const endpoint =
		mode === "reevaluate"
			? `/api/projects/${projectId}/reevaluate/stream`
			: `/api/projects/${projectId}/evaluations/stream`;
	const response = await fetch(endpoint, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ judge }),
	});
	if (!response.ok) {
		let message = `Request failed: ${response.status}`;
		try {
			const body = (await response.json()) as { message?: string };
			if (body.message) message = body.message;
		} catch {
			const text = await response.text().catch(() => "");
			if (text) message = text;
		}
		throw new Error(message);
	}
	if (!response.body) {
		return (await response.json()) as EvaluationResponse;
	}

	const reader = response.body.getReader();
	const decoder = new TextDecoder();
	let buffer = "";
	let result: EvaluationResponse | null = null;
	const handleLine = (line: string) => {
		const trimmed = line.trim();
		if (!trimmed) return;
		const message = JSON.parse(trimmed) as EvaluationStreamMessage;
		if (message.type === "activity") {
			onActivity(message.activity);
			return;
		}
		if (message.type === "result") {
			result = message.result;
			return;
		}
		throw new Error(message.message);
	};

	for (;;) {
		const { value, done } = await reader.read();
		if (done) break;
		buffer += decoder.decode(value, { stream: true });
		let newlineIndex = buffer.indexOf("\n");
		while (newlineIndex >= 0) {
			handleLine(buffer.slice(0, newlineIndex));
			buffer = buffer.slice(newlineIndex + 1);
			newlineIndex = buffer.indexOf("\n");
		}
	}
	buffer += decoder.decode();
	handleLine(buffer);
	if (!result) throw new Error("Evaluation stream completed without a result.");
	return result;
}

async function selectProjectDirectory() {
	return parseJsonResponse<{ path: string | null }>(
		await fetch("/api/system/select-directory", {
			method: "POST",
		}),
	);
}

function toNonGoals(value: string): string[] {
	return value
		.split("\n")
		.map((item) => item.trim())
		.filter(Boolean);
}

function formatPercent(value: number): string {
	return `${Math.round(value * 100)}%`;
}

const generatedTextJa: Record<string, string> = {
	"Surface and repository-structure evidence were evaluated. Runtime and audit-grade claims remain provisional.":
		"表層情報とリポジトリ構成を根拠に評価しました。ランタイム挙動や監査級の主張は暫定扱いです。",
	"Project purpose and usage cannot be evaluated confidently without README.md.":
		"README.md がないため、プロジェクトの目的や使い方を十分な確度で評価できません。",
	"Agent-facing architecture and workflow context is missing.":
		"エージェント向けのアーキテクチャや作業手順の文脈が不足しています。",
	"Agents need a single verification gate to confirm improvements.":
		"改善後に確認できる単一の検証ゲートがエージェントに必要です。",
	"Score is provisional until tests or equivalent verification commands are executed.":
		"テストまたは同等の検証コマンドを実行するまで、スコアは暫定評価です。",
	"A sample output makes the value and downstream handoff easier to inspect.":
		"サンプル出力があると、価値や後続作業への引き渡しを確認しやすくなります。",
	"The gap is addressed with a minimal, reviewable change.":
		"ギャップが最小かつレビューしやすい変更で解消されている。",
	"Evidence is added or updated so the next evaluation can detect the improvement.":
		"次回評価で改善を検出できるように、根拠が追加または更新されている。",
	"Verification commands complete successfully or their failure is documented.":
		"検証コマンドが成功している、または失敗理由が記録されている。",
	"sample evaluation output が未確認": "サンプル評価出力が未確認",
	"local build": "ローカルビルド",
	"test execution": "テスト実行",
	"runtime behavior": "ランタイム挙動",
	"sample output quality": "サンプル出力の品質",
	"audit-grade security behavior": "監査級のセキュリティ挙動",
	"Run typecheck, tests, and build; attach command outcomes to the next evaluation.":
		"typecheck、テスト、ビルドを実行し、その結果を次回評価に添付する。",
	"Review the core implementation files for the evaluation pipeline.":
		"評価パイプラインの中核実装ファイルをレビューする。",
	"Generate and inspect a sample evaluation report.":
		"サンプル評価レポートを生成し、内容を確認する。",
};

const generatedDimensionLabelsJa: Record<string, string> = {
	"Concept Value": "コンセプト価値",
	"Implementation Completeness": "実装完成度",
	"Architecture Quality": "アーキテクチャ",
	Architecture: "アーキテクチャ",
	"UI / UX": "UI/UX",
	Operability: "運用性",
	Maintainability: "保守性",
	Security: "セキュリティ",
	Testability: "テスト容易性",
	Documentation: "ドキュメント",
	"Agent Usability": "エージェント利用性",
	Extensibility: "拡張性",
	Reliability: "信頼性",
	"Strategic Fit": "戦略適合",
	"Market Competitiveness": "市場競争力",
	"OSS / Product Value": "OSS / プロダクト価値",
	"OSS / External Value": "OSS/外部提供価値",
};

const generatedEvidenceRefsJa: Record<string, string> = {
	"README.md": "README.md",
	"LLM_CONTEXT.md": "LLM_CONTEXT.md",
	"AGENTS.md": "AGENTS.md",
	"package.json": "package.json",
	"repo tree": "リポジトリ構成",
};

function localizeGeneratedText(value: string, language: "en" | "ja"): string {
	if (language !== "ja") return value;
	if (generatedTextJa[value]) return generatedTextJa[value];

	const rationale = value.match(/^(.+) was evaluated from (.+)\.$/);
	if (rationale) {
		const label = generatedDimensionLabelsJa[rationale[1]] ?? rationale[1];
		const refs = rationale[2]
			.split(", ")
			.map((item) => generatedEvidenceRefsJa[item] ?? item)
			.join("、");
		return `${label}は${refs}を根拠に評価しました。`;
	}

	const missingInputs = value.match(/^Resolve missing inputs: (.+)\.$/);
	if (missingInputs) {
		return `不足している入力を解消する: ${missingInputs[1].replaceAll(", ", "、")}。`;
	}

	return value;
}

const DEFAULT_PROJECT_NAME = "New project";

type DisplayedEvaluation = {
	activityEvents?: EvaluationActivityEvent[];
	bundle?: EvaluationBundle;
	evaluation: ProjectValueEvaluation;
	judgeRun?: JudgeRun;
};

type DisplayedFocusedImprovement = SavedFocusedImprovementIdea & {
	key: string;
};

function toDisplayedFocusedImprovements(
	ideas: SavedFocusedImprovementIdea[],
): DisplayedFocusedImprovement[] {
	return ideas.map((idea) => ({
		...idea,
		key: idea.id,
	}));
}

type ProjectFolder = {
	rootPath: string;
	name: string;
	primaryProject: ProjectProfile;
	projects: ProjectProfile[];
};

function groupProjectFolders(projects: ProjectProfile[]): ProjectFolder[] {
	const folders = new Map<string, ProjectFolder>();
	for (const project of projects) {
		const existing = folders.get(project.rootPath);
		if (existing) {
			existing.projects.push(project);
			continue;
		}
		folders.set(project.rootPath, {
			rootPath: project.rootPath,
			name: project.name,
			primaryProject: project,
			projects: [project],
		});
	}
	return Array.from(folders.values());
}

async function listProjectFolderEvaluations(
	folder: ProjectFolder,
): Promise<ProjectValueEvaluation[]> {
	const histories = await Promise.all(
		folder.projects.map((item) => listProjectEvaluations(item.id)),
	);
	return histories
		.flatMap((history) => history.evaluations)
		.sort(
			(a, b) =>
				new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
		);
}

function inferProjectName(selectedPath: string): string | null {
	return selectedPath.split(/[\\/]/).filter(Boolean).at(-1) ?? null;
}

function formatHistoryDateTime(value: string, language: "en" | "ja"): string {
	const date = new Date(value);
	const elapsedMs = Date.now() - date.getTime();
	const absElapsedMs = Math.abs(elapsedMs);
	const locale = language === "ja" ? "ja-JP" : undefined;
	const threeDaysMs = 3 * 24 * 60 * 60 * 1000;

	if (absElapsedMs < threeDaysMs) {
		const formatter = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });
		const relativeAmount = (unitMs: number) =>
			-Math.sign(elapsedMs) * Math.max(1, Math.floor(absElapsedMs / unitMs));
		if (absElapsedMs < 60 * 1000) {
			return language === "ja" ? "たった今" : "just now";
		}
		if (absElapsedMs < 60 * 60 * 1000) {
			return formatter.format(relativeAmount(60 * 1000), "minute");
		}
		if (absElapsedMs < 24 * 60 * 60 * 1000) {
			return formatter.format(relativeAmount(60 * 60 * 1000), "hour");
		}
		return formatter.format(relativeAmount(24 * 60 * 60 * 1000), "day");
	}

	return new Intl.DateTimeFormat(locale, {
		year: "numeric",
		month: "short",
		day: "numeric",
		hour: "2-digit",
		minute: "2-digit",
	}).format(new Date(value));
}

function ActivityTimeline(params: {
	busy: boolean;
	emptyText: string;
	events: EvaluationActivityEvent[];
	runningText: string;
}) {
	if (params.events.length === 0) {
		return (
			<div className="empty-results compact">
				<BrainCircuit className="icon" />
				<h2>{params.busy ? params.runningText : params.emptyText}</h2>
			</div>
		);
	}
	return (
		<div className="activity-timeline">
			{params.events.map((event) => (
				<article
					className={`activity-event level-${event.level}`}
					key={event.id}
				>
					<div className="activity-event-header">
						<span className="demo-badge variant-outline">{event.phase}</span>
						<strong>{event.message}</strong>
						<small>
							#{event.seq} / {new Date(event.createdAt).toLocaleTimeString()}
						</small>
					</div>
					<div className="activity-event-meta">
						<span>{event.source}</span>
						{event.status ? <span>{event.status}</span> : null}
						<span>{event.level}</span>
					</div>
					{event.payload !== undefined ? (
						<details>
							<summary>payload</summary>
							<pre>{JSON.stringify(event.payload, null, 2)}</pre>
						</details>
					) : null}
				</article>
			))}
		</div>
	);
}

export function HomeView() {
	const { activeJudge, activeConfig, codex } = useJudgeSettings();
	const { language, t } = useUiLanguage();
	const [project, setProject] = useState<ProjectProfile | null>(null);
	const [projects, setProjects] = useState<ProjectProfile[]>([]);
	const [evaluations, setEvaluations] = useState<ProjectValueEvaluation[]>([]);
	const [selectedEvaluationId, setSelectedEvaluationId] = useState<
		string | null
	>(null);
	const [result, setResult] = useState<DisplayedEvaluation | null>(null);
	const [busy, setBusy] = useState(false);
	const [historyBusy, setHistoryBusy] = useState(false);
	const [browseBusy, setBrowseBusy] = useState(false);
	const [errorText, setErrorText] = useState<string | null>(null);
	const [resultViewTab, setResultViewTab] = useState<"result" | "activity">(
		"result",
	);
	const [activityEvents, setActivityEvents] = useState<
		EvaluationActivityEvent[]
	>([]);
	const [activityStreamStatus, setActivityStreamStatus] = useState<
		"idle" | "connecting" | "receiving" | "completed" | "error"
	>("idle");
	const [lastActivityAt, setLastActivityAt] = useState<string | null>(null);
	const [selectedDimensionKeys, setSelectedDimensionKeys] = useState<
		Set<EvaluationDimensionKey>
	>(() => new Set());
	const [focusedImprovements, setFocusedImprovements] = useState<
		DisplayedFocusedImprovement[]
	>([]);
	const [improvementBusy, setImprovementBusy] = useState(false);
	const [improvementErrorText, setImprovementErrorText] = useState<
		string | null
	>(null);
	const [copiedImprovementKey, setCopiedImprovementKey] = useState<
		string | null
	>(null);

	const adapterReady = isExecutableJudge(activeJudge, activeConfig);
	const activeJudgeIsCodex = activeJudge === "codex-agent";
	const judgeSelection: JudgeSelection = activeJudgeIsCodex
		? {
				type: "codex-agent",
				model: codex.model,
				mode: codex.mode,
			}
		: {
				type: "llm-provider",
				provider: activeConfig.provider,
				model: activeConfig.model || undefined,
				endpoint: activeConfig.endpoint || undefined,
				apiKeyRef: activeConfig.apiKeyRef || undefined,
				fallbackPolicy: activeConfig.fallbackPolicy,
			};
	const sortedDimensions = useMemo(
		() =>
			result?.evaluation.dimensions.slice().sort((a, b) => a.score - b.score) ??
			[],
		[result],
	);
	const dimensionDeltaByKey = useMemo(
		() =>
			new Map(
				(result?.evaluation.delta?.dimensionDeltas ?? []).map((delta) => [
					delta.key,
					delta.delta,
				]),
			),
		[result],
	);
	const scoreDelta =
		result?.evaluation.delta?.scoreDelta ?? result?.evaluation.scoreDelta;
	const selectedDimensionKeyList = useMemo(
		() =>
			sortedDimensions
				.map((dimension) => dimension.key)
				.filter((key) => selectedDimensionKeys.has(key)),
		[sortedDimensions, selectedDimensionKeys],
	);
	const visibleActivityEvents =
		busy || activityEvents.length > 0
			? activityEvents
			: (result?.activityEvents ?? []);
	const canShowResultTabs =
		result !== null || visibleActivityEvents.length > 0 || busy;
	const activityDiagnosticSuppressed =
		activityEvents.length > visibleActivityEvents.length;
	const activityStreamStatusLabel =
		language === "ja"
			? {
					idle: "未接続",
					connecting: "接続中",
					receiving: "受信中",
					completed: "完了",
					error: "エラー",
				}[activityStreamStatus]
			: {
					idle: "idle",
					connecting: "connecting",
					receiving: "receiving",
					completed: "completed",
					error: "error",
				}[activityStreamStatus];
	const selectedProject = project;
	const projectFolders = useMemo(
		() => groupProjectFolders(projects),
		[projects],
	);

	function toggleSelectedDimension(key: EvaluationDimensionKey) {
		setSelectedDimensionKeys((current) => {
			const next = new Set(current);
			if (next.has(key)) {
				next.delete(key);
			} else {
				next.add(key);
			}
			return next;
		});
	}

	const clearSelectedDimensions = useCallback(() => {
		setSelectedDimensionKeys(new Set());
	}, []);

	const clearFocusedImprovements = useCallback(() => {
		setFocusedImprovements([]);
		setImprovementErrorText(null);
		setCopiedImprovementKey(null);
	}, []);

	async function copyFocusedImprovementPrompt(
		idea: DisplayedFocusedImprovement,
	) {
		try {
			await navigator.clipboard.writeText(idea.agentPrompt);
			setCopiedImprovementKey(idea.key);
			window.setTimeout(() => {
				setCopiedImprovementKey((current) =>
					current === idea.key ? null : current,
				);
			}, 1800);
		} catch {
			setImprovementErrorText(t.home.copyAgentPromptFailed);
		}
	}

	async function generateSelectedDimensionImprovements() {
		if (!result || selectedDimensionKeyList.length === 0) return;
		setImprovementBusy(true);
		setImprovementErrorText(null);
		try {
			const response = await generateFocusedImprovements(
				result.evaluation.id,
				selectedDimensionKeyList,
				judgeSelection,
			);
			setFocusedImprovements(toDisplayedFocusedImprovements(response.ideas));
		} catch (error) {
			setImprovementErrorText(
				error instanceof Error ? error.message : String(error),
			);
		} finally {
			setImprovementBusy(false);
		}
	}

	function dimensionLabel(key: EvaluationDimensionKey): string {
		return t.dimensions[key] ?? key;
	}

	async function refreshProjects() {
		const response = await listProjects();
		setProjects(response.projects);
		return response.projects;
	}

	function loadProjectForm(nextProject: ProjectProfile) {
		setProject(nextProject);
	}

	async function selectProjectFolder(folder: ProjectFolder) {
		loadProjectForm(folder.primaryProject);
		setHistoryBusy(true);
		setErrorText(null);
		try {
			const history = await listProjectFolderEvaluations(folder);
			setEvaluations(history);
			const latest = history[0];
			if (latest) {
				const detail = await fetchEvaluation(latest.id);
				setSelectedEvaluationId(latest.id);
				setResult(detail);
				clearSelectedDimensions();
				setFocusedImprovements(detail.focusedImprovements);
				setActivityEvents([]);
				setActivityStreamStatus("idle");
				setLastActivityAt(null);
				setResultViewTab("result");
			} else {
				setSelectedEvaluationId(null);
				setResult(null);
				clearSelectedDimensions();
				clearFocusedImprovements();
				setActivityEvents([]);
				setActivityStreamStatus("idle");
				setLastActivityAt(null);
			}
		} catch (error) {
			setErrorText(error instanceof Error ? error.message : String(error));
		} finally {
			setHistoryBusy(false);
		}
	}

	async function selectEvaluation(evaluation: ProjectValueEvaluation) {
		setHistoryBusy(true);
		setErrorText(null);
		try {
			const detail = await fetchEvaluation(evaluation.id);
			setSelectedEvaluationId(evaluation.id);
			setResult(detail);
			clearSelectedDimensions();
			setFocusedImprovements(detail.focusedImprovements);
			setActivityEvents([]);
			setActivityStreamStatus("idle");
			setLastActivityAt(null);
			setResultViewTab("result");
		} catch (error) {
			setErrorText(error instanceof Error ? error.message : String(error));
		} finally {
			setHistoryBusy(false);
		}
	}

	async function selectInitialProjectFolder(nextProjects: ProjectProfile[]) {
		const folders = groupProjectFolders(nextProjects);
		let initialFolder = folders[0];
		let initialHistory: ProjectValueEvaluation[] = [];
		for (const candidate of folders) {
			const history = await listProjectFolderEvaluations(candidate);
			if (history.length > 0 || candidate === initialFolder) {
				initialFolder = candidate;
				initialHistory = history;
			}
			if (history.length > 0) break;
		}
		if (!initialFolder) {
			setProject(null);
			setEvaluations([]);
			setSelectedEvaluationId(null);
			setResult(null);
			clearSelectedDimensions();
			clearFocusedImprovements();
			setActivityEvents([]);
			setActivityStreamStatus("idle");
			setLastActivityAt(null);
			return;
		}
		loadProjectForm(initialFolder.primaryProject);
		setEvaluations(initialHistory);
		const latest = initialHistory[0];
		if (latest) {
			const detail = await fetchEvaluation(latest.id);
			setSelectedEvaluationId(latest.id);
			setResult(detail);
			clearSelectedDimensions();
			setFocusedImprovements(detail.focusedImprovements);
			setActivityEvents([]);
			setActivityStreamStatus("idle");
			setLastActivityAt(null);
			setResultViewTab("result");
		} else {
			setSelectedEvaluationId(null);
			setResult(null);
			clearSelectedDimensions();
			clearFocusedImprovements();
			setActivityEvents([]);
			setActivityStreamStatus("idle");
			setLastActivityAt(null);
		}
	}

	async function deleteProjectFolder(folder: ProjectFolder) {
		const confirmed = window.confirm(`${folder.name} を削除しますか？`);
		if (!confirmed) return;
		setHistoryBusy(true);
		setErrorText(null);
		try {
			await Promise.all(folder.projects.map((item) => deleteProject(item.id)));
			const nextProjects = await refreshProjects();
			await selectInitialProjectFolder(nextProjects);
		} catch (error) {
			setErrorText(error instanceof Error ? error.message : String(error));
		} finally {
			setHistoryBusy(false);
		}
	}

	useEffect(() => {
		let canceled = false;
		async function loadInitialProjects() {
			setHistoryBusy(true);
			try {
				const response = await listProjects();
				if (canceled) return;
				setProjects(response.projects);
				const folders = groupProjectFolders(response.projects);
				let initialFolder = folders[0];
				let initialHistory: ProjectValueEvaluation[] = [];
				for (const candidate of folders) {
					const history = await listProjectFolderEvaluations(candidate);
					if (canceled) return;
					if (history.length > 0 || candidate === initialFolder) {
						initialFolder = candidate;
						initialHistory = history;
					}
					if (history.length > 0) break;
				}
				if (initialFolder) {
					const initialProject = initialFolder.primaryProject;
					setProject(initialProject);
					setEvaluations(initialHistory);
					const latest = initialHistory[0];
					if (latest) {
						const detail = await fetchEvaluation(latest.id);
						if (canceled) return;
						setSelectedEvaluationId(latest.id);
						setResult(detail);
						clearSelectedDimensions();
						setFocusedImprovements(detail.focusedImprovements);
						setActivityEvents([]);
						setActivityStreamStatus("idle");
						setLastActivityAt(null);
						setResultViewTab("result");
					}
				}
			} catch (error) {
				if (!canceled) {
					setErrorText(error instanceof Error ? error.message : String(error));
				}
			} finally {
				if (!canceled) setHistoryBusy(false);
			}
		}
		void loadInitialProjects();
		return () => {
			canceled = true;
		};
	}, [clearSelectedDimensions]);

	async function runEvaluation(mode: "evaluate" | "reevaluate") {
		if (!adapterReady || !selectedProject) return;
		setBusy(true);
		setErrorText(null);
		setResultViewTab("activity");
		setActivityEvents([]);
		setActivityStreamStatus("connecting");
		setLastActivityAt(null);
		try {
			const currentProject = selectedProject;
			let runActivityEvents: EvaluationActivityEvent[] = [];
			const nextResult = await streamProjectEvaluation(
				mode,
				currentProject.id,
				judgeSelection,
				(event) => {
					runActivityEvents = [...runActivityEvents, event].sort(
						(a, b) => a.seq - b.seq,
					);
					setActivityEvents(runActivityEvents);
					setActivityStreamStatus("receiving");
					setLastActivityAt(event.createdAt);
				},
			);
			const displayedResult = {
				...nextResult,
				activityEvents: runActivityEvents,
			};
			setResult(displayedResult);
			clearSelectedDimensions();
			clearFocusedImprovements();
			setActivityStreamStatus("completed");
			setResultViewTab("activity");
			setSelectedEvaluationId(nextResult.evaluation.id);
			const nextProjects = await refreshProjects();
			const refreshedFolder = groupProjectFolders(nextProjects).find(
				(folder) => folder.rootPath === currentProject.rootPath,
			);
			const nextHistory = refreshedFolder
				? await listProjectFolderEvaluations(refreshedFolder)
				: await listProjectEvaluations(currentProject.id).then(
						(history) => history.evaluations,
					);
			setEvaluations(nextHistory);
			const refreshedProject =
				nextProjects.find((item) => item.id === currentProject.id) ??
				currentProject;
			loadProjectForm(refreshedProject);
		} catch (error) {
			setActivityStreamStatus("error");
			setErrorText(error instanceof Error ? error.message : String(error));
		} finally {
			setBusy(false);
		}
	}

	async function addProjectFromDirectory() {
		setBrowseBusy(true);
		setErrorText(null);
		try {
			const selected = await selectProjectDirectory();
			if (!selected.path) return;

			const saved = await createProject({
				name: inferProjectName(selected.path) ?? DEFAULT_PROJECT_NAME,
				rootPath: selected.path,
				ideal: t.home.defaultIdeal,
				primaryAudience: t.home.defaultPrimaryAudience,
				targetWorkflow: t.home.defaultTargetWorkflow,
				nonGoals: toNonGoals(t.home.defaultNonGoals),
			});
			const nextProjects = await refreshProjects();
			const selectedFolder = groupProjectFolders(nextProjects).find(
				(folder) => folder.rootPath === saved.project.rootPath,
			);
			if (selectedFolder) {
				await selectProjectFolder(selectedFolder);
				return;
			}
			loadProjectForm(saved.project);
			setEvaluations([]);
			setSelectedEvaluationId(null);
			setResult(null);
			clearSelectedDimensions();
			clearFocusedImprovements();
			setActivityEvents([]);
			setActivityStreamStatus("idle");
			setLastActivityAt(null);
			setResultViewTab("result");
		} catch (error) {
			setErrorText(error instanceof Error ? error.message : String(error));
		} finally {
			setBrowseBusy(false);
		}
	}

	return (
		<main className="evaluator-shell">
			<div className="evaluator-layout">
				<section
					className="evaluator-controls"
					aria-label={t.home.evaluationControls}
				>
					<div className="evaluator-sidebar-section">
						<div className="evaluator-section-heading">
							<div className="evaluator-section-title">
								<FolderOpen className="icon" />
								<h2>{t.home.projects}</h2>
							</div>
							<button
								type="button"
								className="demo-icon-button project-new-button"
								onClick={() => void addProjectFromDirectory()}
								disabled={busy || browseBusy}
								title={t.home.newProject}
								aria-label={t.home.newProject}
							>
								{browseBusy ? (
									<LoaderCircle className="icon evaluator-spin" />
								) : (
									<Plus className="icon" />
								)}
							</button>
						</div>
						<ul className="project-list" aria-label={t.home.projects}>
							{projectFolders.length > 0 ? (
								projectFolders.map((folder) => {
									const isActive =
										selectedProject?.rootPath === folder.rootPath;
									return (
										<li className="project-folder" key={folder.rootPath}>
											<div
												className={`project-folder-row ${
													isActive ? "active" : ""
												}`}
											>
												<button
													type="button"
													className="project-list-item"
													onClick={() => void selectProjectFolder(folder)}
												>
													<span>
														<strong>{folder.name}</strong>
														<small>{folder.rootPath}</small>
													</span>
													{folder.projects.length > 1 ? (
														<span className="project-duplicate-count">
															{folder.projects.length}
														</span>
													) : null}
												</button>
												<span className="project-folder-meta">
													<button
														type="button"
														className="project-delete-button"
														onClick={() => void deleteProjectFolder(folder)}
														title="Delete project"
														aria-label="Delete project"
													>
														<Trash2 className="icon" />
													</button>
												</span>
											</div>
											{isActive ? (
												<ul
													className="history-list project-history-list"
													aria-label={t.home.evaluationHistory}
												>
													{historyBusy ? (
														<li className="sidebar-empty">
															<LoaderCircle className="icon evaluator-spin" />
															{t.home.loadingHistory}
														</li>
													) : evaluations.length > 0 ? (
														evaluations.map((evaluation) => (
															<li key={evaluation.id}>
																<button
																	type="button"
																	className={`history-list-item ${
																		selectedEvaluationId === evaluation.id
																			? "active"
																			: ""
																	}`}
																	onClick={() =>
																		void selectEvaluation(evaluation)
																	}
																>
																	<strong>
																		{evaluation.score}
																		<small> / {evaluation.idealScore}</small>
																	</strong>
																	<small>
																		{formatHistoryDateTime(
																			evaluation.createdAt,
																			language,
																		)}
																	</small>
																</button>
															</li>
														))
													) : (
														<li className="sidebar-empty">
															{t.home.noHistory}
														</li>
													)}
												</ul>
											) : null}
										</li>
									);
								})
							) : (
								<li className="sidebar-empty">{t.home.noProjects}</li>
							)}
						</ul>
					</div>
				</section>

				<section className="evaluator-results" aria-label={t.home.resultsLabel}>
					<div className="evaluator-workspace-header">
						<div className="workspace-title-block">
							<span className="showcase-kicker">{t.home.kicker}</span>
							<h1>{selectedProject?.name ?? t.home.newProject}</h1>
							<p>{selectedProject?.rootPath ?? t.home.subtitle}</p>
						</div>
						<div className="workspace-actions">
							{adapterReady ? (
								<span className="evaluator-note ready">
									<CheckCircle2 className="icon" />
									{t.home.activeJudgeReady}
								</span>
							) : (
								<span className="evaluator-note blocked">
									<AlertTriangle className="icon" />
									{t.home.activeJudgeBlocked}
								</span>
							)}
							<button
								type="button"
								className="demo-button primary"
								onClick={() => void runEvaluation("evaluate")}
								disabled={
									busy || browseBusy || !adapterReady || !selectedProject
								}
							>
								{busy ? (
									<LoaderCircle className="icon evaluator-spin" />
								) : (
									<BrainCircuit className="icon" />
								)}
								{selectedProject ? t.home.evaluateSelected : t.home.evaluate}
							</button>
							<button
								type="button"
								className="demo-button variant-outline"
								onClick={() => void runEvaluation("reevaluate")}
								disabled={busy || browseBusy || !adapterReady || !project}
							>
								<RefreshCw className="icon" />
								{t.home.reevaluate}
							</button>
						</div>
					</div>

					{errorText ? (
						<div className="evaluator-alert">
							<AlertTriangle className="icon" />
							<span>{errorText}</span>
						</div>
					) : null}

					{canShowResultTabs ? (
						<div className="result-view-switcher" role="tablist">
							<button
								type="button"
								className={resultViewTab === "result" ? "active" : ""}
								role="tab"
								aria-selected={resultViewTab === "result"}
								onClick={() => setResultViewTab("result")}
								disabled={!result}
							>
								<BarChart3 className="icon" />
								<span>{t.home.resultsTab}</span>
							</button>
							<button
								type="button"
								className={resultViewTab === "activity" ? "active" : ""}
								role="tab"
								aria-selected={resultViewTab === "activity"}
								onClick={() => setResultViewTab("activity")}
							>
								<BrainCircuit className="icon" />
								<span>{t.home.activityTab}</span>
							</button>
						</div>
					) : null}

					{resultViewTab === "activity" && canShowResultTabs ? (
						<div className="evaluator-panel activity-panel">
							<div className="evaluator-panel-header">
								<div>
									<h2>{t.home.activityTimeline}</h2>
									<p>{busy ? t.home.runningEvaluation : t.home.noActivity}</p>
								</div>
								<BrainCircuit className="icon" />
							</div>
							<div className="activity-diagnostics">
								<span>
									<strong>{t.home.streamStatus}</strong>
									{activityStreamStatusLabel}
								</span>
								<span>
									<strong>{t.home.receivedEvents}</strong>
									{activityEvents.length}
								</span>
								<span>
									<strong>{t.home.displayedEvents}</strong>
									{visibleActivityEvents.length}
								</span>
								<span>
									<strong>{t.home.lastActivity}</strong>
									{lastActivityAt
										? new Date(lastActivityAt).toLocaleTimeString()
										: t.home.notSet}
								</span>
								{activityDiagnosticSuppressed ? (
									<span className="activity-diagnostic-warning">
										{t.home.activitySuppressed}
									</span>
								) : null}
							</div>
							<ActivityTimeline
								busy={busy}
								emptyText={t.home.noActivity}
								events={visibleActivityEvents}
								runningText={t.home.runningEvaluation}
							/>
						</div>
					) : result ? (
						<>
							<div className="score-grid">
								<div className="score-tile primary">
									<span>{t.home.score}</span>
									<strong>
										{result.evaluation.score}
										<small> / {result.evaluation.idealScore}</small>
									</strong>
								</div>
								<div className="score-tile">
									<span>{t.home.confidence}</span>
									<strong>
										{formatPercent(result.evaluation.overallConfidence)}
									</strong>
								</div>
								<div className="score-tile">
									<span>{t.home.delta}</span>
									<strong>
										{scoreDelta === undefined ? t.home.newResult : scoreDelta}
									</strong>
								</div>
							</div>

							<div className="evaluator-panel">
								<div className="evaluator-panel-header">
									<div>
										<h2>{t.home.dimensionScores}</h2>
										<p>
											{localizeGeneratedText(
												result.evaluation.summary,
												language,
											)}
										</p>
									</div>
									<BarChart3 className="icon" />
								</div>
								<div className="dimension-list">
									{sortedDimensions.map((dimension) => {
										const dimensionDelta = dimensionDeltaByKey.get(
											dimension.key,
										);
										const selected = selectedDimensionKeys.has(dimension.key);
										const selectLabel =
											language === "ja"
												? `${t.dimensions[dimension.key]}を選択`
												: `Select ${t.dimensions[dimension.key]}`;
										return (
											<div
												className={`dimension-row${selected ? " selected" : ""}`}
												key={dimension.key}
											>
												<label className="dimension-select">
													<input
														aria-label={selectLabel}
														checked={selected}
														onChange={() =>
															toggleSelectedDimension(dimension.key)
														}
														type="checkbox"
													/>
												</label>
												<div className="dimension-copy">
													<strong>{t.dimensions[dimension.key]}</strong>
													<span>
														{localizeGeneratedText(
															dimension.rationale,
															language,
														)}
													</span>
												</div>
												<div className="dimension-metrics">
													<b>{dimension.score}</b>
													<small>{formatPercent(dimension.confidence)}</small>
													{dimensionDelta === undefined ? null : (
														<small>
															{dimensionDelta >= 0 ? "+" : ""}
															{dimensionDelta}
														</small>
													)}
												</div>
											</div>
										);
									})}
								</div>
							</div>

							<div className="evaluator-panel improvement-action-panel">
								<div className="evaluator-panel-header">
									<div>
										<h2>{t.home.improvementActionTitle}</h2>
										<p>{t.home.improvementActionHelp}</p>
									</div>
									<BrainCircuit className="icon" />
								</div>
								<div className="improvement-action-row">
									<div className="selected-dimension-summary">
										{selectedDimensionKeyList.length > 0
											? selectedDimensionKeyList
													.map((key) => t.dimensions[key])
													.join(" / ")
											: t.home.selectDimensionForImprovements}
									</div>
									<button
										type="button"
										className="demo-button primary"
										onClick={() => void generateSelectedDimensionImprovements()}
										disabled={
											improvementBusy ||
											!adapterReady ||
											selectedDimensionKeyList.length === 0
										}
									>
										{improvementBusy ? (
											<LoaderCircle className="icon evaluator-spin" />
										) : (
											<BrainCircuit className="icon" />
										)}
										{improvementBusy
											? t.home.generatingImprovementIdeas
											: t.home.generateSelectedImprovements}
									</button>
								</div>
								{improvementErrorText ? (
									<div className="evaluator-alert">
										<AlertTriangle className="icon" />
										<span>{improvementErrorText}</span>
									</div>
								) : null}
							</div>

							{focusedImprovements.length > 0 ? (
								<div className="focused-improvement-list">
									<div className="evaluator-panel-header">
										<div>
											<h2>{t.home.focusedImprovementIdeas}</h2>
										</div>
									</div>
									{focusedImprovements.map((idea) => (
										<article
											className="focused-improvement-card"
											key={idea.key}
										>
											<div className="focused-improvement-card-header">
												<div>
													<div className="focused-improvement-dimensions">
														{idea.targetDimensions.map((key) => (
															<span
																className="demo-badge variant-outline"
																key={key}
															>
																{t.dimensions[key]}
															</span>
														))}
													</div>
													<h3>{idea.title}</h3>
													<p>{idea.summary}</p>
												</div>
											</div>
											<section className="focused-improvement-agent-request">
												<div className="focused-improvement-section-header">
													<h4>{t.home.agentPrompt}</h4>
													<button
														type="button"
														className="demo-button secondary"
														onClick={() =>
															void copyFocusedImprovementPrompt(idea)
														}
													>
														{copiedImprovementKey === idea.key ? (
															<CheckCircle2 className="icon" />
														) : (
															<Copy className="icon" />
														)}
														{copiedImprovementKey === idea.key
															? t.home.copiedAgentPrompt
															: t.home.copyAgentPrompt}
													</button>
												</div>
												<pre>{idea.agentPrompt}</pre>
											</section>
											<div className="focused-improvement-lower">
												<div className="focused-improvement-lower-main">
													<section>
														<h4>{t.home.implementationFocus}</h4>
														<ul className="focused-improvement-focus-list">
															{idea.implementationFocus.map((item) => (
																<li key={item}>{item}</li>
															))}
														</ul>
													</section>
													<section>
														<h4>{t.home.expectedOutcome}</h4>
														<p>{idea.expectedOutcome}</p>
													</section>
												</div>
												<section className="focused-improvement-effect">
													<h4>{t.home.implementationEffect}</h4>
													{idea.scoreImpacts.length > 0 ? (
														<div className="focused-improvement-score-list">
															{idea.scoreImpacts.map((impact) => (
																<div
																	className="focused-improvement-score-impact"
																	key={impact.dimensionKey}
																>
																	<strong>
																		{dimensionLabel(impact.dimensionKey)}
																	</strong>
																	<span>
																		{impact.currentScore} {"->"}{" "}
																		{impact.expectedScoreAfter}
																	</span>
																	<small>
																		{t.home.scoreGain} +
																		{impact.expectedScoreGain}
																	</small>
																	<p>{impact.rationale}</p>
																</div>
															))}
														</div>
													) : (
														<p>{t.home.notSet}</p>
													)}
												</section>
											</div>
										</article>
									))}
								</div>
							) : null}
						</>
					) : (
						<div className="empty-results">
							<BrainCircuit className="icon" />
							<h2>{t.home.noEvaluation}</h2>
							<p>
								{selectedProject ? t.home.noHistory : t.home.noEvaluationHelp}
							</p>
						</div>
					)}
				</section>
			</div>
		</main>
	);
}
