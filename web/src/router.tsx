import { createRouter } from "@tanstack/react-router";
import { homeRoute } from "./routes/home-route";
import { loginRoute } from "./routes/login-route";
import { rootRoute } from "./routes/root-route";
import { showcaseRoute } from "./routes/showcase-route";

const routeTree = rootRoute.addChildren([homeRoute, showcaseRoute, loginRoute]);

export const router = createRouter({ routeTree });

declare module "@tanstack/react-router" {
	interface Register {
		router: typeof router;
	}
}
