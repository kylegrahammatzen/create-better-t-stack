import path from "node:path";
import fs from "fs-extra";
import type { ProjectConfig } from "../../types";
import { addPackageDependency } from "../../utils/add-package-deps";
import { setupAutumn } from "../payment-providers/autumn-setup";

export async function setupPayments(config: ProjectConfig) {
	const { payments, projectDir, frontend } = config;

	if (!payments || payments === "none") {
		return;
	}

	const clientDir = path.join(projectDir, "apps/web");
	const authDir = path.join(projectDir, "packages/auth");

	const clientDirExists = await fs.pathExists(clientDir);
	const authDirExists = await fs.pathExists(authDir);

	if (payments === "polar") {
		if (authDirExists) {
			await addPackageDependency({
				dependencies: ["@polar-sh/better-auth", "@polar-sh/sdk"],
				projectDir: authDir,
			});
		}

		if (clientDirExists) {
			const hasWebFrontend = frontend.some((f) =>
				[
					"react-router",
					"tanstack-router",
					"tanstack-start",
					"next",
					"nuxt",
					"svelte",
					"solid",
				].includes(f),
			);

			if (hasWebFrontend) {
				await addPackageDependency({
					dependencies: ["@polar-sh/better-auth"],
					projectDir: clientDir,
				});
			}
		}
	}

	if (payments === "autumn") {
		const { backend } = config;
		const serverDir = path.join(projectDir, "apps/server");
		const backendDir = path.join(projectDir, "packages/backend");

		const serverDirExists = await fs.pathExists(serverDir);
		const backendDirExists = await fs.pathExists(backendDir);

		if (backend === "convex" && backendDirExists) {
			await addPackageDependency({
				dependencies: ["@useautumn/convex"],
				projectDir: backendDir,
			});
		} else if (backend !== "self" && backend !== "convex" && serverDirExists) {
			await addPackageDependency({
				dependencies: ["autumn-js"],
				projectDir: serverDir,
			});
		}

		if (clientDirExists) {
			const hasWebFrontend = frontend.some((f) =>
				[
					"react-router",
					"tanstack-router",
					"tanstack-start",
					"next",
					"nuxt",
					"svelte",
					"solid",
				].includes(f),
			);

			if (hasWebFrontend) {
				await addPackageDependency({
					dependencies: ["autumn-js"],
					projectDir: clientDir,
				});
			}
		}

		await setupAutumn(config);
	}
}
