import { describe, expect, it } from "vitest";
import { judgeProjectValue } from "./judge-client";

describe("judgeProjectValue", () => {
	it("does not fabricate an evaluation for deterministic fallback", async () => {
		await expect(
			judgeProjectValue({
				project: {} as never,
				bundle: {} as never,
				judge: {
					type: "llm-provider",
					provider: "deterministic-fallback",
					model: "deterministic-mvp",
					fallbackPolicy: "deterministic-only",
				},
			}),
		).rejects.toThrow(
			"deterministic-fallback judge adapter is not implemented",
		);
	});
});
