import { createRoute } from "@tanstack/react-router";
import { SettingsView } from "../views/settings-view";
import { rootRoute } from "./root-route";

export const settingsRoute = createRoute({
	getParentRoute: () => rootRoute,
	path: "/settings",
	component: SettingsView,
});
