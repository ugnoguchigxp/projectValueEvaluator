export const clampScore = (value: number): number =>
	Math.max(0, Math.min(100, Math.round(value)));

export const clampConfidence = (value: number): number =>
	Math.max(0, Math.min(1, Number(value.toFixed(3))));

export const confidenceToStored = (value: number): number =>
	Math.round(clampConfidence(value) * 1000);

export const storedToConfidence = (value: number): number =>
	clampConfidence(value / 1000);

export const ratioDeltaToStored = (value: number): number =>
	Math.round(Number(value.toFixed(3)) * 1000);

export const storedToRatioDelta = (value: number): number =>
	Number((value / 1000).toFixed(3));
