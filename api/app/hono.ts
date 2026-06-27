import fs from "node:fs/promises";
import path from "node:path";
import { serveStatic } from "hono/bun";
import { csrf } from "hono/csrf";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { HTTPException } from "hono/http-exception";
import { secureHeaders } from "hono/secure-headers";
import type { DbConnection } from "../db";
import { createDbConnection } from "../db";
import { requireAuth } from "../middleware/auth";
import { AuthService } from "../modules/auth/auth.service";
import { HttpError } from "../modules/auth/errors";
import { createAuthRoute } from "../routes/auth.route";
import { createHealthRoute } from "../routes/health.route";
import { readAppEnv, type AppEnv } from "./env";

type AppRuntime = {
	env: AppEnv;
	dbConnection: DbConnection;
	authService: AuthService;
};

declare global {
	var __honoStandardRuntime__: Promise<AppRuntime> | undefined;
}

async function createRuntime(): Promise<AppRuntime> {
	const env = readAppEnv();
	const dbConnection = createDbConnection(env.databaseUrl);
	const authService = new AuthService(dbConnection.db, env);
	return { env, dbConnection, authService };
}

export async function getAppRuntime(): Promise<AppRuntime> {
	if (!globalThis.__honoStandardRuntime__) {
		globalThis.__honoStandardRuntime__ = createRuntime().catch((error) => {
			globalThis.__honoStandardRuntime__ = undefined;
			throw error;
		});
	}
	return globalThis.__honoStandardRuntime__;
}

const runtime = await getAppRuntime();
const app = new Hono();
const distWebRoot = path.resolve(process.cwd(), "dist-web");
const distWebIndex = path.resolve(distWebRoot, "index.html");
const useHttpsSecurityHeaders =
	runtime.env.securityHeadersMode === "https" ||
	(runtime.env.securityHeadersMode === "auto" && runtime.env.secureCookie);
const secureHeaderOptions = useHttpsSecurityHeaders
	? { contentSecurityPolicy: undefined }
	: {
			contentSecurityPolicy: undefined,
			crossOriginOpenerPolicy: false,
			originAgentCluster: false,
			strictTransportSecurity: false,
		};

app.use("*", logger());
app.use("*", secureHeaders(secureHeaderOptions));
app.use(
	"/api/*",
	cors({
		origin: (origin) => {
			if (!origin) return undefined;
			if (runtime.env.corsOrigins.includes(origin)) return origin;
			return null;
		},
		credentials: true,
		allowMethods: ["GET", "POST", "OPTIONS"],
		allowHeaders: ["Content-Type", "Authorization"],
	}),
);
app.use("/api/*", csrf());

app.onError(async (error, c) => {
	console.error(error);
	if (error instanceof HttpError) {
		return c.json(
			{ message: error.message },
			error.status as 400 | 401 | 403 | 404 | 409 | 500,
		);
	}
	if (error instanceof HTTPException) {
		const response = error.getResponse();
		const message =
			(await response
				.clone()
				.text()
				.catch(() => "")) ||
			error.message ||
			response.statusText ||
			"Request failed";
		return c.json(
			{ message },
			error.status as 400 | 401 | 403 | 404 | 409 | 500,
		);
	}
	const message =
		runtime.env.nodeEnv === "production"
			? "Internal server error"
			: error instanceof Error
				? error.message
				: "Internal server error";
	return c.json({ message }, 500);
});

const apiRoutes = new Hono()
	.route("/health", createHealthRoute())
	.use(
		"/auth/me",
		requireAuth({
			env: runtime.env,
			authService: runtime.authService,
		}),
	)
	.route(
		"/auth",
		createAuthRoute({
			authService: runtime.authService,
			env: runtime.env,
		}),
	);

app.route("/api", apiRoutes);

app.use("/assets/*", serveStatic({ root: "./dist-web" }));
app.use("/favicon.ico", serveStatic({ root: "./dist-web" }));
app.get("*", async (c) => {
	if (c.req.path.startsWith("/api/")) {
		return c.notFound();
	}
	try {
		const html = await fs.readFile(distWebIndex, "utf8");
		return c.html(html);
	} catch {
		return c.text(
			"Frontend is not built. Run `bun run build:web` or `bun run dev`.",
			404,
		);
	}
});

export default app;
export type AppType = typeof apiRoutes;
