import { execFile } from "node:child_process";
import { stat } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";

const execFileAsync = promisify(execFile);

type DirectoryPicker = () => Promise<string | null>;

type CommandError = Error & {
	code?: string | number;
	stdout?: string;
	stderr?: string;
};

const isCancelError = (error: CommandError): boolean => {
	const text = `${error.message ?? ""}\n${error.stderr ?? ""}`.toLowerCase();
	return (
		text.includes("user canceled") ||
		text.includes("user cancelled") ||
		text.includes("cancelled") ||
		text.includes("canceled")
	);
};

async function runPickerCommand(
	command: string,
	args: string[],
): Promise<string | null> {
	try {
		const { stdout } = await execFileAsync(command, args, {
			timeout: 120_000,
		});
		return stdout.trim() || null;
	} catch (error) {
		const commandError = error as CommandError;
		if (isCancelError(commandError)) return null;
		if (process.platform === "linux" && commandError.code === 1) return null;
		throw commandError;
	}
}

export async function selectDirectoryWithNativeDialog(): Promise<
	string | null
> {
	if (process.platform === "darwin") {
		return runPickerCommand("osascript", [
			"-e",
			'POSIX path of (choose folder with prompt "Select project folder to evaluate")',
		]);
	}

	if (process.platform === "win32") {
		return runPickerCommand("powershell.exe", [
			"-NoProfile",
			"-Command",
			[
				"Add-Type -AssemblyName System.Windows.Forms",
				"$dialog = New-Object System.Windows.Forms.FolderBrowserDialog",
				'$dialog.Description = "Select project folder to evaluate"',
				"if ($dialog.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) { $dialog.SelectedPath }",
			].join("; "),
		]);
	}

	return runPickerCommand("zenity", [
		"--file-selection",
		"--directory",
		"--title=Select project folder to evaluate",
	]);
}

async function normalizeDirectory(selectedPath: string): Promise<string> {
	const resolvedPath = path.resolve(selectedPath);
	const stats = await stat(resolvedPath);
	if (!stats.isDirectory()) {
		throw new HTTPException(400, {
			message: "Selected path is not a directory.",
		});
	}
	return resolvedPath;
}

export function createSystemRoute(
	deps: { selectDirectory?: DirectoryPicker } = {},
) {
	const selectDirectory =
		deps.selectDirectory ?? selectDirectoryWithNativeDialog;

	return new Hono().post("/select-directory", async (c) => {
		let selectedPath: string | null;
		try {
			selectedPath = await selectDirectory();
		} catch (error) {
			throw new HTTPException(501, {
				message:
					error instanceof Error
						? `Directory picker is unavailable: ${error.message}`
						: "Directory picker is unavailable.",
			});
		}

		if (!selectedPath) {
			return c.json({ path: null });
		}

		return c.json({ path: await normalizeDirectory(selectedPath) });
	});
}
