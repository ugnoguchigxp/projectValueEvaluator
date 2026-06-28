import { createRootRoute, Link, Outlet } from "@tanstack/react-router";
import {
	BrainCircuit,
	Home,
	LayoutGrid,
	LogOut,
	Settings,
	Shield,
} from "lucide-react";
import { AuthProvider, useAuth } from "../auth-context";
import { JudgeSettingsProvider } from "../judge-settings-context";
import { defaultShowcaseTableSearch } from "../showcase-table-search";
import { UiLanguageProvider, useUiLanguage } from "../ui-language-context";

function AppLayout() {
	const { authUser, busy, errorText, logoutCurrentUser } = useAuth();
	const { t } = useUiLanguage();

	return (
		<div className="app-root min-h-screen">
			<header className="topbar">
				<Link to="/" className="brand">
					<BrainCircuit className="icon" />
					<span>ProjectValueEvaluator</span>
				</Link>
				<div className="topbar-actions">
					<nav className="menu-nav" aria-label={t.nav.primary}>
						<Link
							to="/"
							className="menu-link"
							activeProps={{ className: "menu-link active" }}
						>
							<Home className="icon" />
							{t.nav.home}
						</Link>
						<Link
							to="/showcase"
							search={defaultShowcaseTableSearch}
							className="menu-link"
							activeProps={{ className: "menu-link active" }}
						>
							<LayoutGrid className="icon" />
							{t.nav.showcase}
						</Link>
						<Link
							to="/settings"
							className="menu-link"
							activeProps={{ className: "menu-link active" }}
						>
							<Settings className="icon" />
							{t.nav.settings}
						</Link>
						<Link
							to="/login"
							className="menu-link"
							activeProps={{ className: "menu-link active" }}
						>
							{t.nav.login}
						</Link>
					</nav>
					{authUser ? (
						<>
							<div className="auth-chip">
								<Shield className="icon" />
								<span>
									{authUser.displayName} ({authUser.role})
								</span>
							</div>
							<button
								type="button"
								className="icon-button"
								onClick={() => void logoutCurrentUser()}
								disabled={busy}
								aria-label={t.nav.logout}
								title={t.nav.logout}
							>
								<LogOut className="icon" />
							</button>
						</>
					) : null}
				</div>
			</header>

			{errorText ? <div className="status error">{errorText}</div> : null}

			<Outlet />
		</div>
	);
}

function AppShell() {
	return (
		<AuthProvider>
			<UiLanguageProvider>
				<JudgeSettingsProvider>
					<AppLayout />
				</JudgeSettingsProvider>
			</UiLanguageProvider>
		</AuthProvider>
	);
}

export const rootRoute = createRootRoute({
	component: AppShell,
});
