import {
	createContext,
	useContext,
	useEffect,
	useMemo,
	useState,
	type ReactNode,
} from "react";

const STORAGE_KEY = "project-value-evaluator.judge-settings.v2";

export type LlmProvider =
	| "deterministic-fallback"
	| "openai"
	| "azure-openai"
	| "local-llm";

export type CodexMode = "review-only" | "improvement-request" | "reevaluation";
export type FallbackPolicy = "none" | "deterministic-only";
export type ActiveJudge = "llm-provider" | "codex-agent";

export type LlmProviderConfig = {
	id: string;
	name: string;
	provider: LlmProvider;
	model: string;
	endpoint: string;
	apiKeyRef: string;
	fallbackPolicy: FallbackPolicy;
};

export type CodexAgentConfig = {
	model: CodexModel;
	mode: CodexMode;
};

export type CodexModel =
	| "gpt-5.5"
	| "gpt-5.4"
	| "gpt-5.4-mini"
	| "gpt-5.3-codex-spark";

type JudgeSettingsState = {
	activeJudge: ActiveJudge;
	activeConfigId: string;
	configs: LlmProviderConfig[];
	codex: CodexAgentConfig;
};

type JudgeSettingsContextValue = JudgeSettingsState & {
	activeConfig: LlmProviderConfig;
	addConfig: () => void;
	updateConfig: (
		id: string,
		patch: Partial<Omit<LlmProviderConfig, "id">>,
	) => void;
	removeConfig: (id: string) => void;
	setActiveJudge: (judge: ActiveJudge) => void;
	setActiveConfigId: (id: string) => void;
	updateCodex: (patch: Partial<CodexAgentConfig>) => void;
	resetConfigs: () => void;
};

export const providerLabels: Record<LlmProvider, string> = {
	"deterministic-fallback": "Deterministic preflight",
	openai: "OpenAI",
	"azure-openai": "Azure OpenAI",
	"local-llm": "Local LLM",
};

export const providerOptions = (
	Object.entries(providerLabels) as Array<[LlmProvider, string]>
)
	.filter(([value]) => value !== "deterministic-fallback")
	.map(([value, label]) => ({
		value,
		label,
	}));

export const codexModelLabels: Record<CodexModel, string> = {
	"gpt-5.5": "GPT-5.5",
	"gpt-5.4": "GPT-5.4",
	"gpt-5.4-mini": "GPT-5.4 Mini",
	"gpt-5.3-codex-spark": "GPT-5.3 Codex Spark",
};

export const codexModelOptions = Object.entries(codexModelLabels).map(
	([value, label]) => ({
		value: value as CodexModel,
		label,
	}),
);

export const defaultJudgeConfig: LlmProviderConfig = {
	id: "openai-default",
	name: "OpenAI",
	provider: "openai",
	model: "gpt-5.5",
	endpoint: "https://api.openai.com/v1",
	apiKeyRef: "OPENAI_API_KEY",
	fallbackPolicy: "none",
};

const defaultCodexConfig: CodexAgentConfig = {
	model: "gpt-5.5",
	mode: "review-only",
};

const defaultState: JudgeSettingsState = {
	activeJudge: "codex-agent",
	activeConfigId: defaultJudgeConfig.id,
	configs: [defaultJudgeConfig],
	codex: defaultCodexConfig,
};

const JudgeSettingsContext = createContext<JudgeSettingsContextValue | null>(
	null,
);

export function JudgeSettingsProvider({ children }: { children: ReactNode }) {
	const [state, setState] = useState<JudgeSettingsState>(readStoredState);

	useEffect(() => {
		window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
	}, [state]);

	const activeConfig =
		state.configs.find((config) => config.id === state.activeConfigId) ??
		state.configs[0] ??
		defaultJudgeConfig;

	const value = useMemo<JudgeSettingsContextValue>(
		() => ({
			...state,
			activeConfig,
			addConfig: () =>
				setState((current) => {
					const next = createBlankConfig(current.configs.length + 1);
					return {
						...current,
						configs: [...current.configs, next],
					};
				}),
			updateConfig: (id, patch) =>
				setState((current) => ({
					...current,
					configs: current.configs.map((config) =>
						config.id === id ? { ...config, ...patch } : config,
					),
				})),
			removeConfig: (id) =>
				setState((current) => {
					const configs = current.configs.filter((config) => config.id !== id);
					if (configs.length === 0) {
						return { ...defaultState, codex: current.codex };
					}
					return {
						...current,
						activeConfigId:
							current.activeConfigId === id
								? configs[0].id
								: current.activeConfigId,
						configs,
					};
				}),
			setActiveConfigId: (id) =>
				setState((current) =>
					current.configs.some((config) => config.id === id)
						? { ...current, activeJudge: "llm-provider", activeConfigId: id }
						: current,
				),
			setActiveJudge: (judge) =>
				setState((current) => ({ ...current, activeJudge: judge })),
			updateCodex: (patch) =>
				setState((current) => ({
					...current,
					codex: { ...current.codex, ...patch },
				})),
			resetConfigs: () => setState(defaultState),
		}),
		[state, activeConfig],
	);

	return (
		<JudgeSettingsContext.Provider value={value}>
			{children}
		</JudgeSettingsContext.Provider>
	);
}

export function useJudgeSettings() {
	const context = useContext(JudgeSettingsContext);
	if (!context) {
		throw new Error(
			"useJudgeSettings must be used within JudgeSettingsProvider",
		);
	}
	return context;
}

export function isExecutableConfig(_config: LlmProviderConfig): boolean {
	return false;
}

export function isExecutableJudge(
	activeJudge: ActiveJudge,
	config: LlmProviderConfig,
): boolean {
	return activeJudge === "codex-agent" || isExecutableConfig(config);
}

function readStoredState(): JudgeSettingsState {
	if (typeof window === "undefined") {
		return defaultState;
	}
	try {
		const raw = window.localStorage.getItem(STORAGE_KEY);
		if (!raw) {
			return defaultState;
		}
		return normalizeState(JSON.parse(raw));
	} catch {
		return defaultState;
	}
}

function normalizeState(value: unknown): JudgeSettingsState {
	if (!isRecord(value) || !Array.isArray(value.configs)) {
		return defaultState;
	}

	const codex = normalizeCodex(value.codex, value.configs);
	const configs = value.configs
		.map(normalizeConfig)
		.filter((config): config is LlmProviderConfig => Boolean(config));

	if (configs.length === 0) {
		return { ...defaultState, codex };
	}

	const activeConfigId =
		typeof value.activeConfigId === "string" &&
		configs.some((config) => config.id === value.activeConfigId)
			? value.activeConfigId
			: configs[0].id;
	const activeJudge = isActiveJudge(value.activeJudge)
		? value.activeJudge
		: "llm-provider";

	return { activeJudge, activeConfigId, configs, codex };
}

function normalizeConfig(value: unknown): LlmProviderConfig | null {
	if (!isRecord(value)) {
		return null;
	}

	if (
		value.provider === "codex" ||
		value.provider === "deterministic-fallback"
	) {
		return null;
	}

	const provider = isLlmProvider(value.provider) ? value.provider : "openai";

	return {
		id: typeof value.id === "string" && value.id ? value.id : createId(),
		name:
			typeof value.name === "string" && value.name
				? value.name
				: providerLabels[provider],
		provider,
		model: typeof value.model === "string" ? value.model : "",
		endpoint: typeof value.endpoint === "string" ? value.endpoint : "",
		apiKeyRef: typeof value.apiKeyRef === "string" ? value.apiKeyRef : "",
		fallbackPolicy: isFallbackPolicy(value.fallbackPolicy)
			? value.fallbackPolicy
			: "none",
	};
}

function normalizeCodex(
	value: unknown,
	legacyConfigs: unknown[],
): CodexAgentConfig {
	if (isRecord(value)) {
		return {
			model: isCodexModel(value.model) ? value.model : defaultCodexConfig.model,
			mode: isCodexMode(value.mode) ? value.mode : defaultCodexConfig.mode,
		};
	}

	const legacyCodexConfig = legacyConfigs.find(
		(config) => isRecord(config) && config.provider === "codex",
	);
	if (isRecord(legacyCodexConfig)) {
		return {
			model: isCodexModel(legacyCodexConfig.model)
				? legacyCodexConfig.model
				: defaultCodexConfig.model,
			mode: isCodexMode(legacyCodexConfig.codexMode)
				? legacyCodexConfig.codexMode
				: defaultCodexConfig.mode,
		};
	}

	return defaultCodexConfig;
}

function createBlankConfig(index: number): LlmProviderConfig {
	return {
		id: createId(),
		name: `Provider ${index}`,
		provider: "openai",
		model: "",
		endpoint: "",
		apiKeyRef: "OPENAI_API_KEY",
		fallbackPolicy: "none",
	};
}

function createId(): string {
	if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
		return crypto.randomUUID();
	}
	return `provider-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null;
}

function isLlmProvider(value: unknown): value is LlmProvider {
	return providerOptions.some((option) => option.value === value);
}

function isCodexMode(value: unknown): value is CodexMode {
	return (
		value === "review-only" ||
		value === "improvement-request" ||
		value === "reevaluation"
	);
}

function isCodexModel(value: unknown): value is CodexModel {
	return codexModelOptions.some((option) => option.value === value);
}

function isFallbackPolicy(value: unknown): value is FallbackPolicy {
	return value === "none" || value === "deterministic-only";
}

function isActiveJudge(value: unknown): value is ActiveJudge {
	return value === "llm-provider" || value === "codex-agent";
}
