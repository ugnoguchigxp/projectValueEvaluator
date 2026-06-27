import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { Database } from "bun:sqlite";
import { readAppEnv } from "../app/env";

type MigrationRecord = {
	filename: string;
	applied_at: string;
};

const MIGRATIONS_TABLE = "hono_standard_schema_migrations";

async function listSqlMigrations(dir: string): Promise<string[]> {
	const entries = await readdir(dir, { withFileTypes: true });
	return entries
		.filter((entry) => entry.isFile() && entry.name.endsWith(".sql"))
		.map((entry) => entry.name)
		.sort((a, b) => a.localeCompare(b));
}

async function ensureMigrationsTable(client: Database): Promise<void> {
	client.run(`
		CREATE TABLE IF NOT EXISTS ${MIGRATIONS_TABLE} (
			filename text PRIMARY KEY,
			applied_at text NOT NULL DEFAULT CURRENT_TIMESTAMP
		)
	`);
}

async function appliedMigrations(client: Database): Promise<Set<string>> {
	const rows = client
		.query(`SELECT filename, applied_at FROM ${MIGRATIONS_TABLE}`)
		.all() as MigrationRecord[];
	return new Set(rows.map((row) => row.filename));
}

async function applyMigrationFile(
	client: Database,
	migrationsDir: string,
	filename: string,
): Promise<void> {
	const fullPath = path.resolve(migrationsDir, filename);
	const sqlText = await readFile(fullPath, "utf8");
	client.run("BEGIN");
	try {
		client.run(sqlText);
		client
			.query(`INSERT INTO ${MIGRATIONS_TABLE} (filename) VALUES (?)`)
			.run(filename);
		client.run("COMMIT");
	} catch (error) {
		client.run("ROLLBACK");
		throw error;
	}
}

async function main() {
	const env = readAppEnv();
	const client = new Database(env.databaseUrl, { create: true });
	const migrationsDir = path.resolve(process.cwd(), "drizzle");

	try {
		await ensureMigrationsTable(client);
		const allMigrations = await listSqlMigrations(migrationsDir);
		const applied = await appliedMigrations(client);
		const pending = allMigrations.filter((filename) => !applied.has(filename));

		for (const filename of pending) {
			await applyMigrationFile(client, migrationsDir, filename);
			console.log(`applied: ${filename}`);
		}

		console.log(
			JSON.stringify(
				{
					ok: true,
					total: allMigrations.length,
					applied: pending.length,
					skipped: allMigrations.length - pending.length,
				},
				null,
				2,
			),
		);
	} finally {
		client.close();
	}
}

await main();
