#!/usr/bin/env node
import { execSync } from "node:child_process";
import path from "node:path";
import fs from "node:fs";

const projectName = process.argv[2] ?? "x402-app";
const target = path.resolve(process.cwd(), projectName);
if (fs.existsSync(target)) {
  console.error(`Folder ${projectName} already exists. Pick another name.`);
  process.exit(1);
}

execSync(`git clone https://github.com/dabit3/x402-starter-kit ${projectName}`, {
  stdio: "inherit"
});

// optional cleanup/bootstrapping
process.chdir(target);
execSync("rm -rf .git", { stdio: "inherit" });
execSync("npm install", { stdio: "inherit" });
console.log(`\nSuccess! cd ${projectName}, configure environment variables, & run npm run dev`);
