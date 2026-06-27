export const APP_CONFIG_DEFAULTS = {
	nodeEnv: "development",
	host: "127.0.0.1",
	port: 5173,
	databaseUrl: "sqlite.db",
	jwtSecret: "project-value-evaluator-dev-jwt-secret-change-this",
	jwtAccessExpiresIn: "15m",
	jwtRefreshExpiresIn: "7d",
	appUrl: "http://localhost:5173",
	corsOrigins: ["http://localhost:5173"],
	trustProxy: true,
	cookieSameSite: "lax",
} as const;
