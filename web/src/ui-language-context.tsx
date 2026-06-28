import {
	createContext,
	useContext,
	useEffect,
	useMemo,
	useState,
	type ReactNode,
} from "react";
import type {
	EvidenceLevel,
	GapKind,
	ImprovementRequest,
	JudgeRun,
	SourceInspectionResult,
} from "@shared/schemas/evaluation.schema";
import type { EvaluationDimensionKey } from "@shared/schemas/project.schema";
import type { LlmProvider } from "./judge-settings-context";

const STORAGE_KEY = "project-value-evaluator.ui-language.v2";
const DEFAULT_LANGUAGE: UiLanguage = "ja";

export type UiLanguage = "en" | "ja";

type UiLanguageContextValue = {
	language: UiLanguage;
	setLanguage: (language: UiLanguage) => void;
	t: UiCopy;
};

type UiCopy = {
	nav: {
		home: string;
		showcase: string;
		settings: string;
		login: string;
		logout: string;
		primary: string;
	};
	home: {
		kicker: string;
		subtitle: string;
		projects: string;
		noProjects: string;
		newProject: string;
		projectProfile: string;
		projectName: string;
		rootPath: string;
		browse: string;
		projectIdeal: string;
		primaryAudience: string;
		targetWorkflow: string;
		nonGoals: string;
		activeJudgeReady: string;
		activeJudgeBlocked: string;
		evaluate: string;
		evaluateSelected: string;
		reevaluate: string;
		evaluationHistory: string;
		loadingHistory: string;
		noHistory: string;
		selectProjectForHistory: string;
		savedEvaluation: string;
		judgeSettings: string;
		resultsLabel: string;
		resultsTab: string;
		activityTab: string;
		activityTimeline: string;
		runningEvaluation: string;
		noActivity: string;
		streamStatus: string;
		receivedEvents: string;
		displayedEvents: string;
		lastActivity: string;
		activitySuppressed: string;
		score: string;
		confidence: string;
		evidence: string;
		delta: string;
		newResult: string;
		dimensionScores: string;
		gaps: string;
		improvements: string;
		sourceChecks: string;
		notVerified: string;
		nextEvidence: string;
		verificationRuns: string;
		duration: string;
		files: string;
		name: string;
		provider: string;
		model: string;
		apiKeyRef: string;
		fallback: string;
		priority: string;
		complexity: string;
		notSet: string;
		noEvaluation: string;
		noEvaluationHelp: string;
		evaluationControls: string;
		improvementActionTitle: string;
		improvementActionHelp: string;
		generateSelectedImprovements: string;
		selectDimensionForImprovements: string;
		generatingImprovementIdeas: string;
		focusedImprovementIdeas: string;
		agentPrompt: string;
		implementationFocus: string;
		expectedOutcome: string;
		copyAgentPrompt: string;
		copiedAgentPrompt: string;
		copyAgentPromptFailed: string;
		implementationEffect: string;
		scoreGain: string;
		defaultIdeal: string;
		defaultPrimaryAudience: string;
		defaultTargetWorkflow: string;
		defaultNonGoals: string;
	};
	settings: {
		kicker: string;
		title: string;
		subtitle: string;
		workbenchLabel: string;
		uiPreferences: string;
		uiLanguage: string;
		english: string;
		japanese: string;
		providerProfiles: string;
		configuredProfiles: (count: number) => string;
		reset: string;
		addProvider: string;
		active: string;
		setActive: string;
		selectedProvider: string;
		loginStatus: string;
		loginLoading: string;
		signedIn: string;
		signedOut: string;
		account: string;
		email: string;
		role: string;
		removeProvider: (name: string) => string;
		removeTitle: string;
		profileName: string;
		provider: string;
		model: string;
		endpoint: string;
		apiKeyRef: string;
		fallbackPolicy: string;
		codexAgent: string;
		codexAgentHelp: string;
		codexModel: string;
		codexMode: string;
		codexRuntime: string;
		codexReady: string;
		codexNotReady: string;
		codexChecking: string;
		cliVersion: string;
		reviewOnly: string;
		improvementRequest: string;
		reevaluation: string;
		deterministicOnly: string;
		none: string;
		activeJudge: string;
		name: string;
		status: string;
		executableStatus: string;
		pendingStatus: string;
	};
	dimensions: Record<EvaluationDimensionKey, string>;
	providers: Record<LlmProvider, string>;
	evidenceLevels: Record<EvidenceLevel, string>;
	gapKinds: Record<GapKind, string>;
	improvementTaskTypes: Record<ImprovementRequest["taskType"], string>;
	sourceInspectionStatuses: Record<SourceInspectionResult["status"], string>;
	judges: Record<JudgeRun["judge"], string>;
};

const copy: Record<UiLanguage, UiCopy> = {
	en: {
		nav: {
			home: "Home",
			showcase: "Showcase",
			settings: "Settings",
			login: "Login",
			logout: "Logout",
			primary: "Primary",
		},
		home: {
			kicker: "Project Value Workbench",
			subtitle: "Score, confidence, gaps, and improvement requests in one run.",
			projects: "Projects",
			noProjects: "No saved projects",
			newProject: "New project",
			projectProfile: "Project Profile",
			projectName: "Project name",
			rootPath: "Root path",
			browse: "Browse",
			projectIdeal: "Project Ideal",
			primaryAudience: "Primary audience",
			targetWorkflow: "Target workflow",
			nonGoals: "Non-goals",
			activeJudgeReady: "Active judge ready",
			activeJudgeBlocked: "Active judge is not executable yet",
			evaluate: "Evaluate",
			evaluateSelected: "Evaluate selected",
			reevaluate: "Re-evaluate",
			evaluationHistory: "Evaluation History",
			loadingHistory: "Loading history",
			noHistory: "No evaluations yet",
			selectProjectForHistory: "Select a project to view history",
			savedEvaluation: "Saved evaluation",
			judgeSettings: "Judge settings",
			resultsLabel: "Evaluation results",
			resultsTab: "Result",
			activityTab: "LLM activity",
			activityTimeline: "LLM Activity",
			runningEvaluation: "Evaluation is running",
			noActivity: "No activity captured",
			streamStatus: "Stream",
			receivedEvents: "Received",
			displayedEvents: "Displayed",
			lastActivity: "Last event",
			activitySuppressed:
				"Received events are currently hidden by result state",
			score: "Score",
			confidence: "Confidence",
			evidence: "Evidence",
			delta: "Delta",
			newResult: "new",
			dimensionScores: "Dimension Scores",
			gaps: "Gaps",
			improvements: "Improvements",
			sourceChecks: "Source checks",
			notVerified: "Not Verified",
			nextEvidence: "Next Evidence",
			verificationRuns: "Verification runs",
			duration: "Duration",
			files: "files",
			name: "Name",
			provider: "Provider",
			model: "Model",
			apiKeyRef: "API key ref",
			fallback: "Fallback",
			priority: "priority",
			complexity: "complexity",
			notSet: "not set",
			noEvaluation: "No evaluation yet",
			noEvaluationHelp: "Configure the project profile and run an evaluation.",
			evaluationControls: "Evaluation controls",
			improvementActionTitle: "Next Action",
			improvementActionHelp:
				"Select score dimensions, then ask the LLM to design concrete improvement ideas from this saved evaluation context.",
			generateSelectedImprovements: "Create ideas for checked dimensions",
			selectDimensionForImprovements: "Select at least one score dimension",
			generatingImprovementIdeas: "Generating improvement ideas",
			focusedImprovementIdeas: "Focused Improvement Ideas",
			agentPrompt: "Agent-ready request",
			implementationFocus: "Implementation focus",
			expectedOutcome: "Expected outcome",
			copyAgentPrompt: "Copy request",
			copiedAgentPrompt: "Copied",
			copyAgentPromptFailed: "Could not copy the request.",
			implementationEffect: "Implementation effect",
			scoreGain: "gain",
			defaultIdeal:
				"This project provides clear value to its target users, with its primary workflow implemented, verified, documented, and maintainable.",
			defaultPrimaryAudience: "coding agents",
			defaultTargetWorkflow: "run and improve the primary user workflow",
			defaultNonGoals:
				"audit-grade runtime verification\nautomatic agent execution",
		},
		settings: {
			kicker: "Settings",
			title: "Judge Provider Settings",
			subtitle: "Manage reusable LLM provider profiles for evaluations.",
			workbenchLabel: "Judge provider settings",
			uiPreferences: "UI Preferences",
			uiLanguage: "UI language",
			english: "English",
			japanese: "Japanese",
			providerProfiles: "Provider Profiles",
			configuredProfiles: (count) => `${count} configured profiles`,
			reset: "Reset",
			addProvider: "Add provider",
			active: "Active",
			setActive: "Set active",
			selectedProvider: "Selected provider",
			loginStatus: "Login status",
			loginLoading: "checking session",
			signedIn: "signed in",
			signedOut: "not signed in",
			account: "Account",
			email: "Email",
			role: "Role",
			removeProvider: (name) => `Remove ${name}`,
			removeTitle: "Remove provider",
			profileName: "Profile name",
			provider: "Provider",
			model: "Model",
			endpoint: "Endpoint",
			apiKeyRef: "API key ref",
			fallbackPolicy: "Fallback policy",
			codexAgent: "Codex agent",
			codexAgentHelp:
				"Codex is configured separately from LLM providers because it can act as a coding agent.",
			codexModel: "Codex model",
			codexMode: "Codex scope",
			codexRuntime: "Codex runtime",
			codexReady: "ready",
			codexNotReady: "not ready",
			codexChecking: "checking",
			cliVersion: "CLI version",
			reviewOnly: "Review only",
			improvementRequest: "Improvement request",
			reevaluation: "Re-evaluation",
			deterministicOnly: "Deterministic only",
			none: "None",
			activeJudge: "Active Judge",
			name: "Name",
			status: "Status",
			executableStatus: "executable",
			pendingStatus: "adapter pending",
		},
		dimensions: {
			conceptValue: "Concept Value",
			implementationCompleteness: "Implementation",
			architectureQuality: "Architecture",
			uiUx: "UI / UX",
			testability: "Testability",
			operability: "Operability",
			security: "Security",
			maintainability: "Maintainability",
			extensibility: "Extensibility",
			marketCompetitiveness: "Market Competitiveness",
			ossProductValue: "OSS / External Value",
			strategicFit: "Strategic Fit",
			documentation: "Documentation",
			agentUsability: "Agent Usability",
			reliability: "Reliability",
		},
		providers: {
			"deterministic-fallback": "Deterministic preflight",
			openai: "OpenAI",
			"azure-openai": "Azure OpenAI",
			"local-llm": "Local LLM",
		},
		evidenceLevels: {
			surface: "Surface",
			"repo-structure": "Repository structure",
			"code-sampled": "Code sampled",
			"runtime-verified": "Runtime verified",
			"audit-grade": "Audit grade",
		},
		gapKinds: {
			"value-gap": "Value gap",
			"evidence-gap": "Evidence gap",
			"implementation-gap": "Implementation gap",
			"runtime-gap": "Runtime gap",
			"documentation-gap": "Documentation gap",
		},
		improvementTaskTypes: {
			docs: "Docs",
			test: "Test",
			feature: "Feature",
			refactor: "Refactor",
			security: "Security",
			"agent-usability": "Agent usability",
			evidence: "Evidence",
		},
		sourceInspectionStatuses: {
			passed: "Passed",
			partial: "Partial",
			failed: "Failed",
			"not-inspected": "Not inspected",
		},
		judges: {
			"deterministic-fallback": "Deterministic preflight",
			"codex-agent": "Codex agent",
		},
	},
	ja: {
		nav: {
			home: "ホーム",
			showcase: "ショーケース",
			settings: "設定",
			login: "ログイン",
			logout: "ログアウト",
			primary: "主要ナビゲーション",
		},
		home: {
			kicker: "プロジェクト価値ワークベンチ",
			subtitle: "スコア、信頼度、ギャップ、改善依頼を一度に確認します。",
			projects: "プロジェクト",
			noProjects: "保存済みプロジェクトはありません",
			newProject: "新規プロジェクト",
			projectProfile: "プロジェクトプロファイル",
			projectName: "プロジェクト名",
			rootPath: "ルートパス",
			browse: "選択",
			projectIdeal: "理想状態",
			primaryAudience: "主な利用者",
			targetWorkflow: "対象ワークフロー",
			nonGoals: "対象外",
			activeJudgeReady: "有効な判定設定を利用できます",
			activeJudgeBlocked: "有効な判定設定はまだ実行できません",
			evaluate: "評価する",
			evaluateSelected: "選択中を評価",
			reevaluate: "再評価",
			evaluationHistory: "評価履歴",
			loadingHistory: "履歴を読み込み中",
			noHistory: "まだ評価履歴がありません",
			selectProjectForHistory: "プロジェクトを選ぶと履歴を表示します",
			savedEvaluation: "保存済み評価",
			judgeSettings: "判定設定",
			resultsLabel: "評価結果",
			resultsTab: "結果",
			activityTab: "LLMアクティビティ",
			activityTimeline: "LLMアクティビティ",
			runningEvaluation: "評価を実行中",
			noActivity: "アクティビティはまだありません",
			streamStatus: "ストリーム",
			receivedEvents: "受信",
			displayedEvents: "表示",
			lastActivity: "最終イベント",
			activitySuppressed: "受信済みイベントが結果状態に隠されています",
			score: "スコア",
			confidence: "信頼度",
			evidence: "根拠",
			delta: "差分",
			newResult: "新規",
			dimensionScores: "評価軸スコア",
			gaps: "ギャップ",
			improvements: "改善案",
			sourceChecks: "ソース検査",
			notVerified: "未検証",
			nextEvidence: "次に集める証拠",
			verificationRuns: "検証コマンド",
			duration: "実行時間",
			files: "ファイル",
			name: "名前",
			provider: "プロバイダー",
			model: "モデル",
			apiKeyRef: "API キー参照",
			fallback: "フォールバック",
			priority: "優先度",
			complexity: "複雑度",
			notSet: "未設定",
			noEvaluation: "まだ評価がありません",
			noEvaluationHelp:
				"プロジェクトプロファイルを設定して評価を実行してください。",
			evaluationControls: "評価コントロール",
			improvementActionTitle: "次に行うこと",
			improvementActionHelp:
				"チェックした評価軸を対象に、この保存済み評価セッションとコンテキストを引き継いで具体的な改善案を生成します。",
			generateSelectedImprovements: "チェックされた評価軸の改善案を考案",
			selectDimensionForImprovements: "評価軸を1つ以上選択してください",
			generatingImprovementIdeas: "改善案を生成中",
			focusedImprovementIdeas: "選択軸の改善案",
			agentPrompt: "エージェント向け依頼文",
			implementationFocus: "実装の焦点",
			expectedOutcome: "期待する変化",
			copyAgentPrompt: "依頼文をコピー",
			copiedAgentPrompt: "コピー済み",
			copyAgentPromptFailed: "依頼文をコピーできませんでした。",
			implementationEffect: "実施効果",
			scoreGain: "上昇見込み",
			defaultIdeal:
				"このプロジェクトが、対象ユーザーに明確な価値を提供し、主要ワークフローが実装・検証・文書・保守性で支えられている状態。",
			defaultPrimaryAudience: "コーディングエージェント",
			defaultTargetWorkflow: "主要ユーザーワークフローの実行と改善",
			defaultNonGoals: "監査級のランタイム検証\n自動エージェント実行",
		},
		settings: {
			kicker: "設定",
			title: "判定プロバイダー設定",
			subtitle: "評価で使う LLM プロバイダー設定を管理します。",
			workbenchLabel: "判定プロバイダー設定",
			uiPreferences: "UI 設定",
			uiLanguage: "UI 言語",
			english: "英語",
			japanese: "日本語",
			providerProfiles: "プロバイダー設定",
			configuredProfiles: (count) => `${count} 件の設定`,
			reset: "リセット",
			addProvider: "プロバイダーを追加",
			active: "有効",
			setActive: "有効にする",
			selectedProvider: "選択中のプロバイダー",
			loginStatus: "ログイン状態",
			loginLoading: "セッション確認中",
			signedIn: "ログイン中",
			signedOut: "未ログイン",
			account: "アカウント",
			email: "メールアドレス",
			role: "権限",
			removeProvider: (name) => `${name} を削除`,
			removeTitle: "プロバイダーを削除",
			profileName: "設定名",
			provider: "プロバイダー",
			model: "モデル",
			endpoint: "エンドポイント",
			apiKeyRef: "API キー参照",
			fallbackPolicy: "フォールバック方針",
			codexAgent: "Codex エージェント",
			codexAgentHelp:
				"Codex は修正も実行できるコーディングエージェントのため、LLM プロバイダーとは別に設定します。",
			codexModel: "Codex モデル",
			codexMode: "Codex 実行範囲",
			codexRuntime: "Codex ランタイム",
			codexReady: "利用可能",
			codexNotReady: "利用不可",
			codexChecking: "確認中",
			cliVersion: "CLI バージョン",
			reviewOnly: "レビューのみ",
			improvementRequest: "改善依頼",
			reevaluation: "再評価",
			deterministicOnly: "決定的評価のみ",
			none: "なし",
			activeJudge: "有効な判定設定",
			name: "名前",
			status: "状態",
			executableStatus: "実行可能",
			pendingStatus: "アダプター未実装",
		},
		dimensions: {
			conceptValue: "コンセプト価値",
			implementationCompleteness: "実装完成度",
			architectureQuality: "アーキテクチャ",
			uiUx: "UI/UX",
			testability: "テスト容易性",
			operability: "運用性",
			security: "セキュリティ",
			maintainability: "保守性",
			extensibility: "拡張性",
			marketCompetitiveness: "市場競争力",
			ossProductValue: "OSS/外部提供価値",
			strategicFit: "戦略適合",
			documentation: "ドキュメント",
			agentUsability: "エージェント利用性",
			reliability: "信頼性",
		},
		providers: {
			"deterministic-fallback": "非LLM事前確認",
			openai: "OpenAI",
			"azure-openai": "Azure OpenAI",
			"local-llm": "ローカル LLM",
		},
		evidenceLevels: {
			surface: "表層情報",
			"repo-structure": "リポジトリ構成",
			"code-sampled": "コード抽出",
			"runtime-verified": "ランタイム検証済み",
			"audit-grade": "監査級",
		},
		gapKinds: {
			"value-gap": "価値ギャップ",
			"evidence-gap": "根拠ギャップ",
			"implementation-gap": "実装ギャップ",
			"runtime-gap": "ランタイムギャップ",
			"documentation-gap": "ドキュメントギャップ",
		},
		improvementTaskTypes: {
			docs: "ドキュメント",
			test: "テスト",
			feature: "機能",
			refactor: "リファクタリング",
			security: "セキュリティ",
			"agent-usability": "エージェント利用性",
			evidence: "根拠",
		},
		sourceInspectionStatuses: {
			passed: "合格",
			partial: "一部確認",
			failed: "問題あり",
			"not-inspected": "未検査",
		},
		judges: {
			"deterministic-fallback": "非LLM事前確認",
			"codex-agent": "Codex エージェント",
		},
	},
};

const UiLanguageContext = createContext<UiLanguageContextValue | null>(null);

export function UiLanguageProvider({ children }: { children: ReactNode }) {
	const [language, setLanguageState] = useState<UiLanguage>(readStoredLanguage);

	useEffect(() => {
		window.localStorage.setItem(STORAGE_KEY, language);
		document.documentElement.lang = language;
	}, [language]);

	const value = useMemo<UiLanguageContextValue>(
		() => ({
			language,
			setLanguage: setLanguageState,
			t: copy[language],
		}),
		[language],
	);

	return (
		<UiLanguageContext.Provider value={value}>
			{children}
		</UiLanguageContext.Provider>
	);
}

export function useUiLanguage() {
	const context = useContext(UiLanguageContext);
	if (!context) {
		throw new Error("useUiLanguage must be used within UiLanguageProvider");
	}
	return context;
}

function readStoredLanguage(): UiLanguage {
	if (typeof window === "undefined") {
		return DEFAULT_LANGUAGE;
	}
	const value = window.localStorage.getItem(STORAGE_KEY);
	if (value === "en" || value === "ja") return value;
	return DEFAULT_LANGUAGE;
}
