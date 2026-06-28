import {
	getOrCreateCliProject,
	parseFocusedImprovementArgs,
	printFocusedImprovements,
	resolveEvaluationForCli,
	runEvaluatorCli,
	selectDimensionKeysForCli,
	withEvaluatorServices,
} from "./evaluator-runtime";

await runEvaluatorCli(async () => {
	const args = parseFocusedImprovementArgs(Bun.argv.slice(2));
	await withEvaluatorServices(async ({ projectService, evaluationService }) => {
		const project = await getOrCreateCliProject(projectService, args);
		const evaluation = await resolveEvaluationForCli(
			evaluationService,
			project,
			args.evaluation,
		);
		const dimensionKeys = selectDimensionKeysForCli(
			evaluation,
			args.dimensions,
		);
		const result = await evaluationService.generateFocusedImprovementIdeas({
			evaluationId: evaluation.id,
			dimensionKeys,
			judge: args.judge,
		});
		printFocusedImprovements(
			{
				schemaVersion: "project-evaluator.focused-improvements/v1",
				project: {
					id: project.id,
					rootPath: project.rootPath,
					name: project.name,
				},
				evaluation: {
					id: evaluation.id,
					score: evaluation.score,
					createdAt: evaluation.createdAt,
				},
				...result,
			},
			args.json,
		);
	});
});
