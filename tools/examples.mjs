// Regenerates examples/index.json.
//
// Run this when the pin moves, after copying the corpus across. Everything in
// the file comes from somewhere else: the summary is the comment at the top of
// each example, and whether it can be run is what the pinned artifact answers.
// Nothing here is a description written by hand.
//
//   node tools/examples.mjs

import { readFile, readdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");

const play = await readFile(join(root, "assets", "play.js"), "utf8");
const tag = play.match(/const TAG = "([^"]+)"/)?.[1];
if (!tag) {
  console.error("assets/play.js has no TAG");
  process.exit(1);
}

const artifact = join(root, "assets", `deed-${tag}-wasm32-unknown-unknown.wasm`);
const { instance } = await WebAssembly.instantiate(await readFile(artifact), {});
const wasm = instance.exports;
const encoder = new TextEncoder();
const decoder = new TextDecoder();
const bytes = () => new Uint8Array(wasm.memory.buffer);

function call(verb, source) {
  const input = encoder.encode(source);
  const ptr = wasm.deed_alloc(input.length);
  bytes().set(input, ptr);
  wasm[verb](ptr, input.length);
  const out = wasm.deed_result_ptr();
  const len = wasm.deed_result_len();
  const text = decoder.decode(bytes().slice(out, out + len));
  wasm.deed_free(ptr, input.length);
  wasm.deed_free(out, len);
  return text;
}

/// The opening comment, up to the first blank comment line or the first line
/// of code.
function summaryOf(text) {
  const summary = [];
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (trimmed.startsWith("//")) {
      const body = trimmed.slice(2).trim();
      if (body === "" && summary.length) break;
      if (body) summary.push(body);
    } else if (trimmed !== "") {
      break;
    }
  }
  return summary.join(" ");
}

const names = (await readdir(join(root, "examples")))
  .filter((name) => name.endsWith(".deed"))
  .sort();

const examples = [];
for (const file of names) {
  const source = await readFile(join(root, "examples", file), "utf8");

  // Asked rather than guessed. Looking for `fn main` in the text would be a
  // small parser written here, which is the thing this repository does not do.
  const answer = call("deed_run", source)
    .split("\n")
    .filter((line) => line.trim() !== "")
    .map((line) => JSON.parse(line));
  const runs = !answer.some(
    (item) => item.kind === "result" && item.ok === false && /no `main`/.test(item.message ?? ""),
  );

  const tests = call("deed_test", source)
    .split("\n")
    .filter((line) => line.trim() !== "")
    .map((line) => JSON.parse(line))
    .filter((item) => item.kind === "test").length;

  examples.push({ file, summary: summaryOf(source), runs, tests });
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
