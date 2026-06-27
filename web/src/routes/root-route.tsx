import { createRootRoute, Link, Outlet } from "@tanstack/react-router";
import { Database, Home, LayoutGrid, LogOut, Shield } from "lucide-react";
import { AuthProvider, useAuth } from "../auth-context";
import { defaultShowcaseTableSearch } from "../showcase-table-search";

function AppLayout() {
	const { authUser, busy, errorText, logoutCurrentUser } = useAuth();

	return (
		<div className="app-root min-h-screen">
			<header className="topbar">
				<Link to="/" className="brand">
					<Database className="icon" />
					<span>hono-standard</span>
				</Link>
				<div className="topbar-actions">
					<nav className="menu-nav" aria-label="Primary">
						<Link
							to="/"
							className="menu-link"
							activeProps={{ className: "menu-link active" }}
						>
							<Home className="icon" />
							Home
						</Link>
						<Link
							to="/showcase"
							search={defaultShowcaseTableSearch}
							className="menu-link"
							activeProps={{ className: "menu-link active" }}
						>
							<LayoutGrid className="icon" />
							Showcase
						</Link>
						<Link
							to="/login"
							className="menu-link"
							activeProps={{ className: "menu-link active" }}
						>
							Login
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
								aria-label="Logout"
								title="Logout"
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
			<AppLayout />
		</AuthProvider>
	);
}

export const rootRoute = createRootRoute({
	component: AppShell,
});
