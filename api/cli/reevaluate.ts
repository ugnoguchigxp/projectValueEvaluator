import {
	findOrCreateCliProject,
	parseEvaluatorArgs,
	printEvaluation,
	runEvaluatorCli,
	withEvaluatorServices,
} from "./evaluator-runtime";

await runEvaluatorCli(async () => {
	const args = parseEvaluatorArgs(Bun.argv.slice(2));
	await withEvaluatorServices(async ({ projectService, evaluationService }) => {
		const project = await findOrCreateCliProject(projectService, args);
		const result = await evaluationService.evaluateProject({
			projectId: project.id,
			projectRoot: args.project,
			baselinePrompt: args.baselinePrompt,
			judge: args.judge,
		});
		printEvaluation(result, args.json);
	});
});
