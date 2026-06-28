import {
	createNightWorkersTasksExport,
	focusedImprovementToNightWorkersTask,
	improvementRequestToNightWorkersTask,
} from "../modules/evaluations/nightworkers-task-exporter";
import {
	getOrCreateCliProject,
	parseNightWorkersTaskArgs,
	printNightWorkersTasks,
	resolveEvaluationForCli,
	runEvaluatorCli,
	withEvaluatorServices,
} from "./evaluator-runtime";

await runEvaluatorCli(async () => {
	const args = parseNightWorkersTaskArgs(Bun.argv.slice(2));
	await withEvaluatorServices(async ({ projectService, evaluationService }) => {
		const project = await getOrCreateCliProject(projectService, args);
		const evaluation = await resolveEvaluationForCli(
			evaluationService,
			project,
			args.evaluation,
		);
		const tasks =
			args.source === "focused"
				? (await evaluationService.getFocusedImprovementIdeas(evaluation.id))
						.slice(0, args.limit)
						.map((idea, index) =>
							focusedImprovementToNightWorkersTask({
								project,
								evaluation,
								idea,
								priority: index + 1,
							}),
						)
				: (await evaluationService.getImprovements(evaluation.id))
						.slice(0, args.limit)
						.map((improvement, index) =>
							improvementRequestToNightWorkersTask({
								project,
								evaluation,
								improvement,
								priority: index + 1,
							}),
						);
		const exported = createNightWorkersTasksExport({
			project,
			evaluation,
			tasks,
		});
		printNightWorkersTasks(exported, args.format);
	});
});
