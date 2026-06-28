import {
	KeyRound,
	Plus,
	RotateCcw,
	Settings2,
	Trash2,
	UserCircle,
} from "lucide-react";
import { useEffect, useState } from "react";
import { useAuth } from "../auth-context";
import {
	codexModelOptions,
	providerOptions,
	useJudgeSettings,
	type CodexMode,
	type FallbackPolicy,
	type LlmProvider,
} from "../judge-settings-context";
import { useUiLanguage, type UiLanguage } from "../ui-language-context";

type CodexRuntimeStatus = {
	sdkInstalled: boolean;
	cliVersion?: string;
	authenticated: boolean;
	detail: string;
};

export function SettingsView() {
	const {
		activeJudge,
		activeConfigId,
		activeConfig,
		codex,
		configs,
		addConfig,
		updateConfig,
		updateCodex,
		removeConfig,
		setActiveJudge,
		setActiveConfigId,
		resetConfigs,
	} = useJudgeSettings();
	const { language, setLanguage, t } = useUiLanguage();
	const { authUser, authLoading } = useAuth();
	const [codexStatus, setCodexStatus] = useState<CodexRuntimeStatus | null>(
		null,
	);
	const [codexStatusError, setCodexStatusError] = useState<string | null>(null);
	const isCodexActive = activeJudge === "codex-agent";
	const codexRuntimeReady =
		Boolean(codexStatus?.sdkInstalled) && Boolean(codexStatus?.authenticated);

	useEffect(() => {
		let cancelled = false;
		async function loadCodexStatus() {
			try {
				const response = await fetch("/api/codex/status");
				const body = (await response.json()) as CodexRuntimeStatus;
				if (!cancelled) {
					setCodexStatus(body);
					setCodexStatusError(null);
				}
			} catch (error) {
				if (!cancelled) {
					setCodexStatus(null);
					setCodexStatusError(
						error instanceof Error ? error.message : String(error),
					);
				}
			}
		}
		void loadCodexStatus();
		return () => {
			cancelled = true;
		};
	}, []);

	return (
		<main className="evaluator-shell settings-shell">
			<section className="evaluator-header">
				<div className="showcase-kicker">
					<Settings2 className="icon" />
					<span>{t.settings.kicker}</span>
				</div>
				<div>
					<h1>{t.settings.title}</h1>
					<p>{t.settings.subtitle}</p>
				</div>
			</section>

			<section
				className="settings-workbench"
				aria-label={t.settings.workbenchLabel}
			>
				<div className="evaluator-panel settings-summary-panel">
					<div className="evaluator-panel-header">
						<div>
							<h2>{t.settings.providerProfiles}</h2>
							<p>{t.settings.configuredProfiles(configs.length)}</p>
						</div>
						<div className="evaluator-actions">
							<button
								type="button"
								className="demo-button variant-outline"
								onClick={resetConfigs}
							>
								<RotateCcw className="icon" />
								{t.settings.reset}
							</button>
							<button
								type="button"
								className="demo-button primary"
								onClick={addConfig}
							>
								<Plus className="icon" />
								{t.settings.addProvider}
							</button>
						</div>
					</div>
					<div className="provider-stack">
						{configs.map((config) => {
							const isActive =
								activeJudge === "llm-provider" && config.id === activeConfigId;
							return (
								<article
									className={`provider-card${isActive ? " active" : ""}`}
									key={config.id}
								>
									<div className="provider-card-header">
										<label className="provider-active-button">
											<input
												type="radio"
												name="active-provider"
												checked={isActive}
												onChange={() => setActiveConfigId(config.id)}
											/>
											<span>
												{isActive ? t.settings.active : t.settings.setActive}
											</span>
										</label>
										<span className="demo-badge variant-outline">
											{t.providers[config.provider]}
										</span>
										<button
											type="button"
											className="demo-icon-button provider-delete-button"
											onClick={() => removeConfig(config.id)}
											disabled={configs.length === 1}
											aria-label={t.settings.removeProvider(config.name)}
											title={t.settings.removeTitle}
										>
											<Trash2 className="icon" />
										</button>
									</div>

									<div className="settings-grid provider-form-grid">
										<label className="settings-field">
											<span>{t.settings.profileName}</span>
											<input
												className="demo-input"
												value={config.name}
												onChange={(event) =>
													updateConfig(config.id, {
														name: event.target.value,
													})
												}
											/>
										</label>
										<label className="settings-field">
											<span>{t.settings.provider}</span>
											<select
												value={config.provider}
												onChange={(event) =>
													updateConfig(config.id, {
														provider: event.target.value as LlmProvider,
													})
												}
											>
												{providerOptions.map((option) => (
													<option key={option.value} value={option.value}>
														{t.providers[option.value]}
													</option>
												))}
											</select>
										</label>
										<label className="settings-field">
											<span>{t.settings.model}</span>
											<input
												className="demo-input"
												value={config.model}
												onChange={(event) =>
													updateConfig(config.id, {
														model: event.target.value,
													})
												}
												placeholder="gpt-5.4"
											/>
										</label>
										<label className="settings-field">
											<span>{t.settings.endpoint}</span>
											<input
												className="demo-input"
												value={config.endpoint}
												onChange={(event) =>
													updateConfig(config.id, {
														endpoint: event.target.value,
													})
												}
												placeholder="https://api.openai.com/v1"
											/>
										</label>
										<label className="settings-field">
											<span>{t.settings.apiKeyRef}</span>
											<input
												className="demo-input"
												value={config.apiKeyRef}
												onChange={(event) =>
													updateConfig(config.id, {
														apiKeyRef: event.target.value,
													})
												}
												placeholder="OPENAI_API_KEY"
											/>
										</label>
										<label className="settings-field">
											<span>{t.settings.fallbackPolicy}</span>
											<select
												value={config.fallbackPolicy}
												onChange={(event) =>
													updateConfig(config.id, {
														fallbackPolicy: event.target
															.value as FallbackPolicy,
													})
												}
											>
												<option value="deterministic-only">
													{t.settings.deterministicOnly}
												</option>
												<option value="none">{t.settings.none}</option>
											</select>
										</label>
									</div>
								</article>
							);
						})}

						<article
							className={`provider-card codex-provider-card${isCodexActive ? " active" : ""}`}
						>
							<div className="provider-card-header">
								<label className="provider-active-button">
									<input
										type="radio"
										name="active-provider"
										checked={isCodexActive}
										onChange={() => setActiveJudge("codex-agent")}
									/>
									<span>
										{isCodexActive ? t.settings.active : t.settings.setActive}
									</span>
								</label>
								<span className="demo-badge variant-outline">
									{t.settings.codexAgent}
								</span>
								<span
									className={`demo-badge ${codexRuntimeReady ? "success" : "destructive"}`}
								>
									{codexStatus
										? codexRuntimeReady
											? t.settings.codexReady
											: t.settings.codexNotReady
										: codexStatusError
											? t.settings.codexNotReady
											: t.settings.codexChecking}
								</span>
							</div>
							<div className="evaluator-panel-header codex-card-intro">
								<div>
									<h2>{t.settings.codexAgent}</h2>
									<p>{t.settings.codexAgentHelp}</p>
								</div>
							</div>
							<dl className="judge-snapshot">
								<dt>{t.settings.codexRuntime}</dt>
								<dd>{codexStatus?.detail ?? codexStatusError ?? "-"}</dd>
								<dt>{t.settings.cliVersion}</dt>
								<dd>{codexStatus?.cliVersion ?? "-"}</dd>
							</dl>
							<div className="settings-grid codex-form-grid">
								<label className="settings-field">
									<span>{t.settings.codexModel}</span>
									<select
										value={codex.model}
										onChange={(event) =>
											updateCodex({
												model: event.target.value as typeof codex.model,
											})
										}
									>
										{codexModelOptions.map((option) => (
											<option key={option.value} value={option.value}>
												{option.label}
											</option>
										))}
									</select>
								</label>
								<label className="settings-field">
									<span>{t.settings.codexMode}</span>
									<select
										value={codex.mode}
										onChange={(event) =>
											updateCodex({
												mode: event.target.value as CodexMode,
											})
										}
									>
										<option value="review-only">{t.settings.reviewOnly}</option>
										<option value="improvement-request">
											{t.settings.improvementRequest}
										</option>
										<option value="reevaluation">
											{t.settings.reevaluation}
										</option>
									</select>
								</label>
							</div>
						</article>
					</div>
				</div>

				<aside className="evaluator-panel settings-side-panel">
					<div className="settings-side-section">
						<UserCircle className="icon" />
						<h2>{t.settings.loginStatus}</h2>
						<dl className="judge-snapshot">
							<dt>{t.settings.status}</dt>
							<dd>
								{authLoading
									? t.settings.loginLoading
									: authUser
										? t.settings.signedIn
										: t.settings.signedOut}
							</dd>
							{authUser ? (
								<>
									<dt>{t.settings.account}</dt>
									<dd>{authUser.displayName}</dd>
									<dt>{t.settings.email}</dt>
									<dd>{authUser.email}</dd>
									<dt>{t.settings.role}</dt>
									<dd>{authUser.role}</dd>
								</>
							) : null}
						</dl>
					</div>
					<div className="settings-side-section">
						<h2>{t.settings.uiPreferences}</h2>
						<label className="settings-field">
							<span>{t.settings.uiLanguage}</span>
							<select
								value={language}
								onChange={(event) =>
									setLanguage(event.target.value as UiLanguage)
								}
							>
								<option value="en">{t.settings.english}</option>
								<option value="ja">{t.settings.japanese}</option>
							</select>
						</label>
					</div>
					<KeyRound className="icon" />
					<h2>{t.settings.selectedProvider}</h2>
					<dl className="judge-snapshot">
						<dt>{t.settings.name}</dt>
						<dd>
							{activeJudge === "codex-agent"
								? t.settings.codexAgent
								: activeConfig.name}
						</dd>
						<dt>{t.settings.provider}</dt>
						<dd>
							{activeJudge === "codex-agent"
								? t.settings.codexAgent
								: t.providers[activeConfig.provider]}
						</dd>
						<dt>{t.settings.model}</dt>
						<dd>
							{activeJudge === "codex-agent" ? codex.model : activeConfig.model}
						</dd>
						<dt>{t.settings.status}</dt>
						<dd>
							{activeJudge === "codex-agent" && codexRuntimeReady
								? t.settings.executableStatus
								: t.settings.pendingStatus}
						</dd>
					</dl>
				</aside>
			</section>
		</main>
	);
}
