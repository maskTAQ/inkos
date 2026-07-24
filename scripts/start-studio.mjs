#!/usr/bin/env node
/**
 * One-shot starter for InkOS Studio (production-style single process).
 *
 * Usage (from repo root):
 *   pnpm start
 *   pnpm start -- --port 8080
 *   pnpm start -- --project /path/to/project
 *
 * Env:
 *   INKOS_STUDIO_PORT   default 4567
 *   INKOS_PROJECT_ROOT  project data root (inkos.json, books/, pwd.txt)
 *   INKOS_STUDIO_HOST   optional bind host (if supported by runtime)
 */
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { access } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "..");

function parseArgs(argv) {
  const out = {
    port: process.env.INKOS_STUDIO_PORT ?? "4567",
    project: process.env.INKOS_PROJECT_ROOT ?? repoRoot,
    build: true,
    open: false,
    help: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--help" || arg === "-h") {
      out.help = true;
      continue;
    }
    if (arg === "--no-build") {
      out.build = false;
      continue;
    }
    if (arg === "--open") {
      out.open = true;
      continue;
    }
    if (arg === "--port" || arg === "-p") {
      out.port = argv[++i] ?? out.port;
      continue;
    }
    if (arg === "--project" || arg === "--root") {
      out.project = resolve(argv[++i] ?? out.project);
      continue;
    }
    if (arg.startsWith("--port=")) {
      out.port = arg.slice("--port=".length);
      continue;
    }
    if (arg.startsWith("--project=")) {
      out.project = resolve(arg.slice("--project=".length));
      continue;
    }
  }

  return out;
}

function printHelp() {
  console.log(`InkOS Studio starter

Usage:
  pnpm start
  pnpm start -- --port 8080
  pnpm start -- --project /data/my-novel
  pnpm start -- --no-build
  pnpm start -- --open

Options:
  -p, --port <n>         Port (default: 4567 or INKOS_STUDIO_PORT)
  --project, --root <p>  Project data directory (default: repo root)
  --no-build             Skip build even if dist is missing
  --open                 Open browser after start (best effort)
  -h, --help             Show help
`);
}

async function pathExists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

function run(command, args, opts = {}) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(command, args, {
      stdio: "inherit",
      shell: process.platform === "win32",
      ...opts,
    });
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) resolvePromise();
      else reject(new Error(`${command} ${args.join(" ")} exited with ${code}`));
    });
  });
}

async function ensureBuilt() {
  const studioDistIndex = join(repoRoot, "packages", "studio", "dist", "index.html");
  const studioApiEntry = join(repoRoot, "packages", "studio", "dist", "api", "index.js");
  const coreDist = join(repoRoot, "packages", "core", "dist", "index.js");

  if (await pathExists(studioDistIndex) && await pathExists(studioApiEntry) && await pathExists(coreDist)) {
    return;
  }

  console.log("[inkos] Build artifacts missing — running pnpm build (first run may take a while)…");
  await run("pnpm", ["build"], { cwd: repoRoot });
}

function resolveStudioEntry() {
  const built = join(repoRoot, "packages", "studio", "dist", "api", "index.js");
  if (existsSync(built)) return { type: "node", entry: built };

  const source = join(repoRoot, "packages", "studio", "src", "api", "index.ts");
  if (existsSync(source)) return { type: "tsx", entry: source };

  return null;
}

function openBrowser(url) {
  const platform = process.platform;
  let command;
  let args;
  if (platform === "darwin") {
    command = "open";
    args = [url];
  } else if (platform === "win32") {
    command = "cmd";
    args = ["/c", "start", "", url];
  } else {
    command = "xdg-open";
    args = [url];
  }
  const child = spawn(command, args, { stdio: "ignore", detached: true });
  child.unref?.();
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.help) {
    printHelp();
    process.exit(0);
  }

  const projectRoot = resolve(opts.project);
  const port = String(opts.port);

  if (opts.build) {
    try {
      await ensureBuilt();
    } catch (error) {
      console.error("[inkos] Build failed:", error instanceof Error ? error.message : error);
      console.error("[inkos] Fix the build error, or retry with: pnpm start -- --no-build (if dist already exists)");
      process.exit(1);
    }
  }

  const launch = resolveStudioEntry();
  if (!launch) {
    console.error("[inkos] Studio entry not found. Expected packages/studio/dist/api/index.js after build.");
    process.exit(1);
  }

  const url = `http://localhost:${port}`;
  console.log(`[inkos] Project root : ${projectRoot}`);
  console.log(`[inkos] Studio URL   : ${url}`);
  if (existsSync(join(projectRoot, "pwd.txt"))) {
    console.log("[inkos] Password gate: pwd.txt present (login required)");
  } else {
    console.log("[inkos] Password gate: off (create pwd.txt in project root to enable)");
  }
  console.log("[inkos] Starting… (Ctrl+C to stop)\n");

  const env = {
    ...process.env,
    INKOS_STUDIO_PORT: port,
    INKOS_PROJECT_ROOT: projectRoot,
  };

  let command;
  let args;
  if (launch.type === "node") {
    command = process.execPath;
    args = [launch.entry, projectRoot];
  } else {
    const tsxBin = join(repoRoot, "packages", "studio", "node_modules", ".bin", "tsx");
    if (existsSync(tsxBin)) {
      command = tsxBin;
      args = [launch.entry, projectRoot];
    } else {
      command = process.execPath;
      const loader = join(repoRoot, "node_modules", "tsx", "dist", "loader.mjs");
      if (existsSync(loader)) {
        args = ["--import", pathToFileURL(loader).href, launch.entry, projectRoot];
      } else {
        console.error("[inkos] Neither dist build nor tsx loader found. Run: pnpm install && pnpm build");
        process.exit(1);
      }
    }
  }

  if (opts.open) {
    setTimeout(() => openBrowser(url), 1200);
  }

  const child = spawn(command, args, {
    cwd: projectRoot,
    env,
    stdio: "inherit",
  });

  const shutdown = (signal) => {
    if (!child.killed) child.kill(signal);
  };
  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));

  child.on("error", (error) => {
    console.error("[inkos] Failed to start Studio:", error.message);
    process.exit(1);
  });
  child.on("exit", (code) => {
    process.exit(code ?? 0);
  });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
