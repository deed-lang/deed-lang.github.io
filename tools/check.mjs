// Everything about this site that a broken commit could break silently.
//
// There is no build step here, so what is in the tree is what gets served,
// and a bad relative path or a pin that points at a file nobody added is
// live the moment it merges. This is the check that runs before that.
//
// Node with no dependencies, matching the rest of the repository.

import { readFile, readdir, stat } from "node:fs/promises";
import { join, dirname, resolve, relative } from "node:path";
import { open, SHOWN } from "./artifact.mjs";

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

// Every page wears the mark, in the tab and in its own header. The playground
// was the one with no favicon, which showed up as the only 404 in the server
// log; the header is five hand-written copies of the same markup, so a page
// can lose the mark there without anything else on it changing.
for (const path of files.filter((f) => f.endsWith(".html"))) {
  const html = await readFile(path, "utf8");
  if (!/rel="icon"/.test(html)) complain(relative(root, path), "has no favicon");
  if (!/class="mark"/.test(html)) complain(relative(root, path), "has no mark in its header");
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

// The artifact is committed rather than built, so nothing in this repository
// has ever compiled it, and a file that is present is not a file that answers.
// A truncated copy, or the artifact of a different build wearing the right
// name, passes every check above: the filename is still spelled correctly.
//
// So it is loaded and asked its version, which is the check the page makes at
// load time, made before the commit instead of in front of a reader.
let deed = null;
if (tag) {
  const artifact = join(root, "assets", `deed-${tag}-wasm32-unknown-unknown.wasm`);
  if (!(await exists(artifact))) {
    complain("assets/", `the pin says ${tag}, and deed-${tag}-wasm32-unknown-unknown.wasm is not here`);
  } else {
    try {
      deed = await open(artifact);
    } catch (error) {
      complain("assets/", `the pinned artifact does not load: ${error.message}`);
    }
  }
}

if (deed) {
  const reported = deed.version();
  if (`v${reported}` !== tag) {
    complain("assets/", `the file named ${tag} says it is ${reported}`);
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

// `summary`, `runs`, `needs` and `tests` are answers rather than descriptions,
// and the page reads all four: Run is turned off from `runs` and `needs`, and
// the note beside it counts `tests` and names the capabilities. They are
// derived again here, from the same artifact and the same code that wrote
// them, because a generated file that somebody edited by hand looks exactly
// like a generated file.
if (deed) {
  for (const entry of index.examples) {
    if (!present.has(entry.file)) continue;
    const answer = deed.describe(await readFile(join(root, "examples", entry.file), "utf8"));
    for (const field of ["summary", "runs", "needs", "tests"]) {
      if (JSON.stringify(entry[field]) !== JSON.stringify(answer[field])) {
        complain(
          "examples/index.json",
          `${entry.file} says ${field} is ${JSON.stringify(entry[field])} and the artifact ` +
            `says ${JSON.stringify(answer[field])}. Regenerate with \`node tools/examples.mjs\`.`,
        );
      }
    }
  }
}

// The picker's dozen. `shown` is the position in `SHOWN` and -1 for the rest,
// so a file leaving the corpus takes its place in the picker with it and says
// so here rather than shortening the menu quietly.
for (const file of SHOWN) {
  if (!present.has(file)) complain("tools/artifact.mjs", `the picker names ${file}, which is not here`);
}
for (const entry of index.examples) {
  const expected = SHOWN.indexOf(entry.file);
  if (entry.shown !== expected) {
    complain(
      "examples/index.json",
      `${entry.file} says shown is ${entry.shown} and the picker's list says ${expected}. ` +
        "Regenerate with `node tools/examples.mjs`.",
    );
  }
}

// This site names one release, and the pin is which one. Everything else that
// says a version is prose: the filenames on the install page, the `deed 0.2.2`
// under each `--version`, and the version a share link carries.
//
// The pin moved to v0.2.2 and the install page kept telling people to download
// v0.2.1, which is not in the latest release any more, so the page's own
// instructions could not be followed. Nothing here noticed, because the pin
// was only ever compared against other pins.
//
// Any three-part number counts. A version that belongs to something else
// (Rust 1.85, and the rest of the page's prose) does not look like one.
for (const path of files.filter((f) => f.endsWith(".html"))) {
  const html = await readFile(path, "utf8");
  const said = new Set([...html.matchAll(/(\d+\.\d+\.\d+)/g)].map((m) => m[1]));
  for (const version of said) {
    if (`v${version}` !== tag) {
      complain(relative(root, path), `says ${version}, and the pin is ${tag}`);
    }
  }
}

if (problems.length) {
  for (const problem of problems) console.error(problem);
  console.error(`\n${problems.length} problem${problems.length === 1 ? "" : "s"}.`);
  process.exit(1);
}

console.log(
  `${files.length} files, every link resolves, and ${tag} loaded and answered ` +
    `about all ${index.examples.length} examples.`,
);
