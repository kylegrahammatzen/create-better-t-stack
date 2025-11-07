import path from "node:path";
import { isCancel, log, select, spinner } from "@clack/prompts";
import { consola } from "consola";
import { execa } from "execa";
import fs from "fs-extra";
import pc from "picocolors";
import type { PackageManager, ProjectConfig } from "../../types";
import { exitCancelled } from "../../utils/errors";
import { getPackageExecutionCommand } from "../../utils/package-runner";
import { addEnvVariablesToFile, type EnvVariable } from "../core/env-setup";

async function writeEnvFile(
	projectDir: string,
	backend: ProjectConfig["backend"],
	secretKey?: string,
) {
	const targetApp = backend === "self" ? "apps/web" : "apps/server";
	const envPath = path.join(projectDir, targetApp, ".env");
	const variables: EnvVariable[] = [
		{
			key: "AUTUMN_SECRET_KEY",
			value: secretKey ?? "",
			condition: true,
			comment: "Get from https://app.useautumn.com or run 'npx atmn init'",
		},
	];
	await addEnvVariablesToFile(envPath, variables);
}

async function writeConvexEnvInstructions(
	projectDir: string,
	packageManager: PackageManager,
) {
	const convexBackendDir = path.join(projectDir, "packages/backend");
	const envLocalPath = path.join(convexBackendDir, ".env.local");

	// Only write if file doesn't exist or doesn't already have Autumn instructions
	if (
		!(await fs.pathExists(envLocalPath)) ||
		!(await fs.readFile(envLocalPath, "utf8")).includes("AUTUMN_SECRET_KEY")
	) {
		const convexCmd = getPackageExecutionCommand(
			packageManager,
			"convex env set AUTUMN_SECRET_KEY=am_sk_xxx",
		);
		const autumnCommands = `
# Set Autumn environment variables for Convex
# Run: ${convexCmd}
`;
		await fs.appendFile(envLocalPath, autumnCommands);
	}
}

function displayManualSetupInstructions(
	backend: ProjectConfig["backend"],
	packageManager: PackageManager,
) {
	const atmnCmd = getPackageExecutionCommand(packageManager, "atmn init");
	const convexCmd = getPackageExecutionCommand(
		packageManager,
		"convex env set AUTUMN_SECRET_KEY=<your_key>",
	);
	log.info(
		`${pc.bold("Manual Autumn Setup Instructions:")}\n\n${pc.cyan("1.")} Visit ${pc.underline("https://app.useautumn.com")} and create an account\n${pc.cyan("2.")} Run: ${pc.bold(atmnCmd)} to authenticate and generate config\n${pc.cyan("3.")} The CLI will create ${pc.bold("autumn.config.ts")} and add ${pc.bold("AUTUMN_SECRET_KEY")} to .env${backend === "convex" ? `\n${pc.cyan("4.")} For Convex: Run ${pc.bold(convexCmd)}` : ""}`,
	);
}

async function runAtmnInit(
	projectDir: string,
	packageManager: PackageManager,
	backend: ProjectConfig["backend"],
) {
	try {
		const s = spinner();
		s.start("Running Autumn CLI initialization...");

		const targetApp = backend === "self" ? "apps/web" : "apps/server";
		const targetDir = path.join(projectDir, targetApp);
		await fs.ensureDir(targetDir);

		const packageCmd = getPackageExecutionCommand(packageManager, "atmn init");

		// Run with inherit so user sees the OTP prompt and auth flow
		await execa(packageCmd, {
			shell: true,
			cwd: targetDir,
			stdio: "inherit",
		});

		s.stop(pc.green("Autumn initialized successfully!"));

		// For Convex backend, add instructions for convex env set
		if (backend === "convex") {
			await writeConvexEnvInstructions(projectDir, packageManager);
			const convexCmd = getPackageExecutionCommand(
				packageManager,
				"convex env set AUTUMN_SECRET_KEY=<your_key>",
			);
			log.info(
				`\n${pc.yellow("Note:")} For Convex backend, don't forget to run:\n${pc.bold(convexCmd)}\n`,
			);
		}

		return true;
	} catch (error) {
		consola.error(pc.red("Failed to initialize Autumn"));
		throw error;
	}
}

export async function setupAutumn(
	config: ProjectConfig,
	cliInput?: { manualAutumn?: boolean },
) {
	const { projectDir, backend, packageManager } = config;
	const manualMode = cliInput?.manualAutumn ?? false;

	try {
		if (manualMode) {
			await writeEnvFile(projectDir, backend);
			if (backend === "convex") {
				await writeConvexEnvInstructions(projectDir, packageManager);
			}
			displayManualSetupInstructions(backend, packageManager);
			return;
		}

		const mode = await select({
			message: "Autumn setup: choose mode",
			options: [
				{
					label: "Automatic",
					value: "auto",
					hint: "Run 'atmn init' now (opens browser for auth)",
				},
				{
					label: "Manual",
					value: "manual",
					hint: "Run 'npx atmn init' yourself later",
				},
			],
			initialValue: "auto",
		});

		if (isCancel(mode)) return exitCancelled("Operation cancelled");

		if (mode === "manual") {
			await writeEnvFile(projectDir, backend);
			if (backend === "convex") {
				await writeConvexEnvInstructions(projectDir, packageManager);
			}
			displayManualSetupInstructions(backend, packageManager);
			return;
		}

		// Automatic mode - run atmn init
		await runAtmnInit(projectDir, packageManager, backend);
	} catch (_error) {
		consola.error(pc.red("Failed to set up Autumn"));
		await writeEnvFile(projectDir, backend);
		if (backend === "convex") {
			await writeConvexEnvInstructions(projectDir, packageManager);
		}
		displayManualSetupInstructions(backend, packageManager);
	}
}
