import { build as esbuild } from "esbuild";
import { build as viteBuild } from "vite";
import { rm, readFile } from "fs/promises";

const allowlist = [
  "@google/generative-ai",
  "axios",
  "connect-pg-simple",
  "cors",
  "date-fns",
  "drizzle-orm",
  "drizzle-zod",
  "express",
  "express-session",
  "jsonwebtoken",
  "memorystore",
  "multer",
  "passport",
  "passport-local",
  "pg",
  "ws",
  "xlsx",
  "zod",
  "zod-validation-error",
];

async function buildAll() {
  const skipClient = process.argv.includes("--skip-client");

  if (!skipClient) {
    console.log("cleaning dist...");
    await rm("dist", { recursive: true, force: true });
    console.log("building client...");

    // Sem InlineConfig — usa o vite.config.ts da raiz do projeto
    await viteBuild();
  } else {
    console.log("skipping client build, dist folder preserved.");
  }

  console.log("building server...");
  const pkg = JSON.parse(await readFile("package.json", "utf-8"));
  const externals = Object.keys(pkg.dependencies || {}).filter(
    (dep) => !allowlist.includes(dep)
  );

  await esbuild({
    entryPoints: ["server/index.ts"],
    platform: "node",
    bundle: true,
    format: "cjs",
    target: "node20",
    outfile: "dist/index.cjs",
    define: {
      "process.env.NODE_ENV": '"production"',
    },
    minify: true,
    external: externals,
    sourcemap: false,
    logLevel: "info",
  });

  console.log("build finished successfully");
}

buildAll().catch((err) => {
  console.error("build failed:", err);
  process.exit(1);
});
