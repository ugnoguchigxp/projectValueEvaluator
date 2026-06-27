import {
	findOrCreateCliProject,
	parseEvaluatorArgs,
	printBundle,
	runEvaluatorCli,
	withEvaluatorServices,
} from "./evaluator-runtime";

await runEvaluatorCli(async () => {
	const args = parseEvaluatorArgs(Bun.argv.slice(2));
	await withEvaluatorServices(async ({ projectService, evaluationService }) => {
		const project = await findOrCreateCliProject(projectService, args);
		const bundle = await evaluationService.createBundle({
			projectId: project.id,
			projectRoot: args.project,
		});
		printBundle(bundle, args.json);
	});
});
