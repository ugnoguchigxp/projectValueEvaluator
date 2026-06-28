import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Hono } from "hono";
import { afterEach, describe, expect, it } from "vitest";
import { createSystemRoute } from "./system.route";

const tempPaths: string[] = [];

async function makeTempDir(): Promise<string> {
	const dir = await mkdtemp(path.join(os.tmpdir(), "project-picker-test-"));
	tempPaths.push(dir);
	return dir;
}

afterEach(async () => {
	await Promise.all(
		tempPaths.splice(0).map((tempPath) =>
			rm(tempPath, { recursive: true, force: true }),
		),
	);
});

describe("system route", () => {
	it("returns the selected directory path", async () => {
		const selectedDir = await makeTempDir();
		const app = new Hono().route(
			"/system",
			createSystemRoute({
				selectDirectory: async () => selectedDir,
			}),
		);

		const res = await app.request("/system/select-directory", {
			method: "POST",
		});

		expect(res.status).toBe(200);
		await expect(res.json()).resolves.toEqual({ path: selectedDir });
	});

	it("returns null when selection is canceled", async () => {
		const app = new Hono().route(
			"/system",
			createSystemRoute({
				selectDirectory: async () => null,
			}),
		);

		const res = await app.request("/system/select-directory", {
			method: "POST",
		});

		expect(res.status).toBe(200);
		await expect(res.json()).resolves.toEqual({ path: null });
	});

	it("rejects selected paths that are not directories", async () => {
		const selectedDir = await makeTempDir();
		const selectedFile = path.join(selectedDir, "README.md");
		await writeFile(selectedFile, "# sample");
		const app = new Hono().route(
			"/system",
			createSystemRoute({
				selectDirectory: async () => selectedFile,
			}),
		);

		const res = await app.request("/system/select-directory", {
			method: "POST",
		});

		expect(res.status).toBe(400);
		await expect(res.text()).resolves.toBe("Selected path is not a directory.");
	});
});
