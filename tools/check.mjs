// Everything about this site that a broken commit could break silently.
//
// There is no build step here, so what is in the tree is what gets served,
// and a bad relative path or a pin that points at a file nobody added is
// live the moment it merges. This is the check that runs before that.
//
// Node with no dependencies, matching the rest of the repository.

import { readFile, readdir, stat } from "node:fs/promises";
import { join, dirname, resolve, relative } from "node:path";

const root = resolve(import.meta.dirname, "..");
const problems = [];

function complain(where, what) {
  problems.push(`${where}: ${what}`);
}

async function exists(path) {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

async function walk(dir) {
  const found = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (entry.name.startsWith(".") || entry.name === "node_modules") continue;
    const path = join(dir, entry.name);
    if (entry.isDirectory()) found.push(...(await walk(path)));
    else found.push(path);
  }
  return found;
}

const files = await walk(root);

// Every JSON file parses. `examples/index.json` is the picker's whole list.
for (const path of files.filter((f) => f.endsWith(".json"))) {
  try {
    JSON.parse(await readFile(path, "utf8"));
  } catch (error) {
    complain(relative(root, path), `does not parse: ${error.message}`);
  }
}

// Every local href and src resolves to a file that is here.
for (const path of files.filter((f) => f.endsWith(".html"))) {
  const html = await readFile(path, "utf8");
  const references = [...html.matchAll(/(?:href|src|srcset)="([^"]+)"/g)].map((m) => m[1]);

  for (const reference of references) {
    if (/^(https?:|mailto:|#|data:)/.test(reference)) continue;
    const target = reference.split("#")[0];
    if (target === "") continue;

    // A directory reference is served by its index.html.
    const asPath = resolve(dirname(path), target);
    const candidates = target.endsWith("/") ? [join(asPath, "index.html")] : [asPath];
    if (!(await Promise.all(candidates.map(exists))).some(Boolean)) {
      complain(relative(root, path), `points at ${reference}, which is not here`);
    }
  }
}

// The pin names a file, and the file has to be one somebody added. More than
// one script carries it now, and two pins that disagree is the failure the
// version check exists to catch, so they are compared here before shipping.
const pins = new Map();
for (const path of files.filter((f) => f.endsWith(".js"))) {
  const text = await readFile(path, "utf8");
  const tag = text.match(/const TAG = "([^"]+)"/)?.[1];
  const version = text.match(/const VERSION = "([^"]+)"/)?.[1];
  if (tag || version) pins.set(relative(root, path).replaceAll("\\", "/"), { tag, version });
}

if (pins.size === 0) {
  complain("assets/", "no script pins a release");
}

const [first] = pins.values();
for (const [where, { tag, version }] of pins) {
  if (!tag || !version) {
    complain(where, "has a TAG without a VERSION, or the other way round");
    continue;
  }
  if (`v${version}` !== tag) {
    complain(where, `pins ${tag} and ${version}, which are not the same release`);
  }
  if (tag !== first.tag) {
    complain(where, `pins ${tag} while another script pins ${first.tag}`);
  }
}

const tag = first?.tag;
if (tag) {
  const artifact = join(root, "assets", `deed-${tag}-wasm32-unknown-unknown.wasm`);
  if (!(await exists(artifact))) {
    complain("assets/", `the pin says ${tag}, and deed-${tag}-wasm32-unknown-unknown.wasm is not here`);
  }
}

// The picker's list and the files on disk are the same list.
const index = JSON.parse(await readFile(join(root, "examples", "index.json"), "utf8"));
const listed = new Set(index.examples.map((e) => e.file));
const present = new Set(
  (await readdir(join(root, "examples"))).filter((n) => n.endsWith(".deed")),
);

for (const name of listed) {
  if (!present.has(name)) complain("examples/index.json", `lists ${name}, which is not here`);
}
for (const name of present) {
  if (!listed.has(name)) complain("examples/index.json", `does not list ${name}, which is here`);
}
if (index.tag !== tag) {
  complain("examples/index.json", `says ${index.tag} and the page pins ${tag}`);
}

if (problems.length) {
  for (const problem of problems) console.error(problem);
  console.error(`\n${problems.length} problem${problems.length === 1 ? "" : "s"}.`);
  process.exit(1);
}

console.log(`${files.length} files, every link resolves, the pin names a file that is here.`);
