// Regenerates examples/index.json.
//
// Run this when the pin moves, after copying the corpus across. Everything in
// the file comes from somewhere else: the summary is the comment at the top of
// each example, and whether it can be run is what the pinned artifact answers.
// Nothing here is a description written by hand.
//
//   node tools/examples.mjs
//
// `tools/check.mjs` derives the same answers from the same artifact and fails
// if what is committed disagrees, so forgetting this step is caught rather
// than shipped.

import { readFile, readdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { open } from "./artifact.mjs";

const root = resolve(import.meta.dirname, "..");

const play = await readFile(join(root, "assets", "play.js"), "utf8");
const tag = play.match(/const TAG = "([^"]+)"/)?.[1];
if (!tag) {
  console.error("assets/play.js has no TAG");
  process.exit(1);
}

const deed = await open(join(root, "assets", `deed-${tag}-wasm32-unknown-unknown.wasm`));

const names = (await readdir(join(root, "examples")))
  .filter((name) => name.endsWith(".deed"))
  .sort();

const examples = [];
for (const file of names) {
  const source = await readFile(join(root, "examples", file), "utf8");
  examples.push({ file, ...deed.describe(source) });
}

await writeFile(
  join(root, "examples", "index.json"),
  `${JSON.stringify({ tag, examples }, null, 2)}\n`,
  "utf8",
);

const programs = examples.filter((e) => e.runs).length;
console.log(
  `${examples.length} examples at ${tag}: ${programs} with a \`main\`, ` +
    `${examples.length - programs} libraries.`,
);
