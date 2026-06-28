import { execFile } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";
import { Hono } from "hono";

const execFileAsync = promisify(execFile);

type CommandResult = {
	ok: boolean;
	stdout: string;
	stderr: string;
	error?: string;
};

async function runCodex(args: string[]): Promise<CommandResult> {
	const codexBin = path.resolve(process.cwd(), "node_modules/.bin/codex");
	try {
		const { stdout, stderr } = await execFileAsync(codexBin, args, {
			timeout: 15_000,
		});
		return { ok: true, stdout: stdout.trim(), stderr: stderr.trim() };
	} catch (error) {
		const commandError = error as {
			stdout?: string;
			stderr?: string;
			message?: string;
		};
		return {
			ok: false,
			stdout: commandError.stdout?.trim() ?? "",
			stderr: commandError.stderr?.trim() ?? "",
			error: commandError.message ?? String(error),
		};
	}
}

export function createCodexRoute() {
	return new Hono().get("/status", async (c) => {
		const [version, login] = await Promise.all([
			runCodex(["--version"]),
			runCodex(["login", "status"]),
		]);
		const loginText = login.stdout || login.stderr || login.error || "";
		return c.json({
			sdkInstalled: version.ok,
			cliVersion: version.stdout || undefined,
			authenticated: login.ok && /logged in/i.test(loginText),
			detail: loginText || "Codex login status is unavailable.",
		});
	});
}
