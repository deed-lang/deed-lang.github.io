// The playground talks to a released compiler and renders what it says.
//
// Nothing here decides what a Deed program means. Every answer on this page
// came out of the wasm module loaded below, including the wording of the
// diagnostics and the layout `fmt` hands back. If this page ever shows
// something no release does, the page is wrong.

// The pin. Both halves are here rather than derived from each other, because
// the file names a release and the version is what the module reports, and
// the whole point of checking is that those two can disagree.
//
// The artifact is served from this repository rather than fetched from the
// release, because a release asset cannot be fetched from a browser at all:
// both the download URL and the API one redirect to a host that sends no
// `Access-Control-Allow-Origin`. See decisions/2026-07-31-no-build-step.md.
const TAG = "v0.2.4";
const VERSION = "0.2.4";
const WASM_URL = `../assets/deed-${TAG}-wasm32-unknown-unknown.wasm`;

const SOURCE = document.getElementById("source");
const OUTPUT = document.getElementById("output");
const STATUS = document.getElementById("status");
const EXAMPLE = document.getElementById("example");
const SUMMARY = document.getElementById("summary");
const STOP = document.getElementById("stop");
const VERBNOTE = document.getElementById("verbnote");
const HIGHLIGHT = document.getElementById("highlight");
const GUTTER = document.getElementById("gutter");
const CONTROLS = document.querySelector(".controls");
const CONSOLE = document.querySelector(".console");
const VERBS = Array.from(document.querySelectorAll("[data-verb]"));

const encoder = new TextEncoder();
const decoder = new TextDecoder();

// The module lives in a worker, so the thread that draws the page is never the
// thread doing the compiling. See assets/worker.js for why that matters.
let worker = null;
let pending = null;
let nextId = 1;
let ready = false;

// Long enough that nothing anyone types by hand hits it, short enough that a
// frozen page is not what a mistake looks like.
const PATIENCE = 10000;

function spawn() {
  const next = new Worker("../assets/worker.js");
  next.onmessage = ({ data }) => {
    if (data.ready !== undefined || data.failed !== undefined) {
      arrived(data);
      return;
    }
    if (pending && pending.id === data.id) {
      const settle = pending;
      pending = null;
      clearTimeout(settle.timer);
      running(false);
      if (data.error) settle.reject(new Error(data.error));
      else settle.resolve(data.text);
    }
  };
  return next;
}

// Ending the thread is the only way to stop something already running, so the
// worker is replaced rather than reused, and the next question waits for the
// replacement to load the module again.
function stop(why, deliberate = false) {
  worker.terminate();
  ready = false;
  if (pending) {
    const settle = pending;
    pending = null;
    clearTimeout(settle.timer);
    const ended = new Error(why);
    ended.stopped = deliberate;
    settle.reject(ended);
  }
  running(false);
  for (const button of VERBS) button.disabled = true;
  worker = spawn();
  worker.postMessage({ load: new URL(WASM_URL, location.href).href });
}

// Whether the question in flight is one somebody pressed a button for. The
// check and the colouring run on their own while you type, and they are quick,
// but dimming four buttons every keystroke reads as the row flickering.
let asked = false;

function ask(verb, source, byHand = false) {
  if (pending) return Promise.reject(new Error("one question at a time"));
  const id = nextId++;
  return new Promise((resolve, reject) => {
    pending = {
      id,
      resolve,
      reject,
      timer: setTimeout(() => {
        OUTPUT.innerHTML = span(
          "d-note",
          `This ran for ${PATIENCE / 1000} seconds without answering, so it was stopped. ` +
            `The compiler is being loaded again.`,
        );
        stop("ran too long", true);
      }, PATIENCE),
    };
    asked = byHand;
    running(true);
    worker.postMessage({ id, verb, source });
  });
}

function running(yes) {
  // Disabled rather than hidden. The row is centred, so a button appearing in
  // it slid every other button sideways, and the check that runs while you
  // type made that happen on its own.
  STOP.disabled = !(yes && asked);
  CONTROLS.classList.toggle("quiet", yes && !asked);
  CONSOLE.classList.toggle("working", yes && asked);
  for (const button of VERBS) {
    button.disabled = yes || worker === null || (button.dataset.verb === "deed_run" && !runnable);
  }
}

// Most of the corpus cannot be started here, for two different reasons, and
// pressing Run to find that out is a bad way to be told. Twenty-one are
// libraries with no `main` to enter through. Six more have one and want the
// filesystem, which this page does not have, so they would answer with a list
// of capabilities rather than with anything about the program.
//
// `examples/index.json` records both answers from the pinned artifact, so the
// button is off before it is reached for, and the note says which of the two
// it is.
//
// It goes back on the moment the text is edited, because then it is no longer
// the file that was asked about.
let runnable = true;

function thisIsRunnable(yes, why = "") {
  runnable = yes;
  VERBNOTE.textContent = why;
  if (ready) running(false);
}

function lines(text) {
  return text.split("\n").filter((line) => line.trim() !== "");
}

function esc(text) {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function span(cls, text) {
  return `<span class="${cls}">${esc(text)}</span>`;
}

// One diagnostic, in the shape `deed check` prints it: a heading, the line it
// happened on, a caret under the span, then the secondary labels and notes.
//
// The source comes from the editor rather than from the module, so a
// diagnostic about a shipped module (which this page never had the text of)
// renders its heading and message without a caret instead of guessing.
function renderDiagnostic(d, source) {
  const out = [];
  const severity = d.severity === "warning" ? "d-warning" : "d-error";
  out.push(`${span(severity, `${d.severity}[${d.code}]`)}: ${esc(d.message)}`);

  const label = (l, marker, cls) => {
    const at = `${l.file}:${l.span.startLine}:${l.span.startColumn}`;
    out.push(span("d-gutter", `  --> ${at}`));

    if (l.file !== "main.deed") return;

    const text = source.split("\n")[l.span.startLine - 1];
    if (text === undefined) return;

    const gutter = String(l.span.startLine);
    const pad = " ".repeat(gutter.length);
    const onOneLine = l.span.endLine === l.span.startLine;
    const width = onOneLine
      ? Math.max(1, l.span.endColumn - l.span.startColumn)
      : Math.max(1, text.length - l.span.startColumn + 1);

    out.push(span("d-gutter", `${pad} |`));
    out.push(`${span("d-gutter", `${gutter} |`)} ${esc(text)}`);
    out.push(
      `${span("d-gutter", `${pad} |`)} ` +
        " ".repeat(Math.max(0, l.span.startColumn - 1)) +
        span(cls, marker.repeat(width)) +
        (l.message ? ` ${span(cls, l.message)}` : ""),
    );
  };

  label(d.primary, "^", severity === "d-warning" ? "d-warning" : "d-caret");
  for (const s of d.secondary || []) label(s, "-", "d-gutter");
  for (const note of d.notes || []) {
    out.push(span("d-note", `  = note: ${note}`));
  }
  if (d.fix) {
    out.push(span("d-note", `  = help: ${d.fix.message}`));

    // The compiler already decided whether a repair is certain, and says so.
    // `maybe-incorrect` is a guess, and a button that applies a guess is a
    // button that edits your program for no reason, so only the certain ones
    // get one. `deed fix` draws the same line.
    const inThisFile = (d.fix.edits || []).length > 0 && d.primary.file === "main.deed";
    if (d.fix.applicability === "machine-applicable" && inThisFile) {
      const index = repairs.push(d.fix.edits) - 1;
      out.push(
        `  <button type="button" class="apply" data-repair="${index}">Apply it</button>`,
      );
    }
  }
  return out.join("\n");
}

// The repairs offered by whatever is currently on screen, and the exact text
// they were computed against. A span is a byte offset into that text, so a
// repair is only meaningful while the editor still holds it.
let repairs = [];
let repairedFrom = null;

// Spans are byte offsets and a JavaScript string is not bytes, so the edit
// happens on the encoded form and the result is decoded back.
function applyEdits(source, edits) {
  const bytes = encoder.encode(source);
  const ordered = [...edits].sort((a, b) => b.span.start - a.span.start);
  let out = bytes;
  for (const edit of ordered) {
    const replacement = encoder.encode(edit.replacement);
    const next = new Uint8Array(
      out.length - (edit.span.end - edit.span.start) + replacement.length,
    );
    next.set(out.subarray(0, edit.span.start), 0);
    next.set(replacement, edit.span.start);
    next.set(out.subarray(edit.span.end), edit.span.start + replacement.length);
    out = next;
  }
  return decoder.decode(out);
}

OUTPUT.addEventListener("click", (event) => {
  const instead = event.target.closest("button[data-instead]");
  if (instead) {
    run(instead.dataset.instead, true);
    return;
  }

  const button = event.target.closest("button.apply");
  if (!button) return;

  if (SOURCE.value !== repairedFrom) {
    button.replaceWith(
      Object.assign(document.createElement("span"), {
        className: "d-note",
        textContent: "the program changed since this was offered, so check again",
      }),
    );
    return;
  }

  SOURCE.value = applyEdits(SOURCE.value, repairs[Number(button.dataset.repair)]);
  run("deed_check", true);
});

function render(verb, json, source) {
  repairs = [];
  repairedFrom = source;
  const parsed = lines(json).map((line) => JSON.parse(line));

  if (parsed.length === 0) {
    const nothing = {
      deed_check: "no diagnostics",
      deed_test: "no tests in this program",
      deed_run: "nothing to report",
      deed_fmt: "nothing to format",
    };
    return span("d-ok", nothing[verb]);
  }

  const out = [];
  for (const item of parsed) {
    switch (item.kind) {
      case "diagnostic":
        out.push(renderDiagnostic(item.diagnostic, source));
        break;
      case "obligation":
        out.push(
          span("d-note", `${item.tier}: ${item.subject}`) +
            (item.reason ? span("d-note", `  (${item.reason})`) : ""),
        );
        break;
      case "output":
        out.push(esc(item.line));
        break;
      case "result":
        out.push(
          item.ok
            ? span("d-ok", "the program finished")
            : item.diagnostic
              ? renderDiagnostic(item.diagnostic, source)
              : span("d-error", item.message),
        );
        // Twenty-one of the twenty-eight examples are libraries: a `module` of
        // functions and `test` blocks, with no `main` to enter through. The
        // compiler is right and the page was unhelpful, offering Run for all
        // of them and then leaving the reader with a refusal and no next step.
        // This is the page talking, not the compiler.
        if (!item.ok && !item.diagnostic && /no `main`/.test(item.message ?? "")) {
          out.push(
            span("d-note", "  Nothing here is wrong: a file with no `main` is a library.") +
              `\n  <button type="button" class="apply" data-instead="deed_test">Run its tests instead</button>`,
          );
        }
        break;
      case "test":
        out.push(
          item.passed
            ? `${span("d-ok", "pass")} ${esc(item.name)}`
            : `${span("d-error", "fail")} ${esc(item.name)}\n` +
                renderDiagnostic(item.diagnostic, source),
        );
        break;
      // A property is generated from a contract rather than written by
      // somebody, so it says where it came from and carries its seed. A run
      // you cannot reproduce is a rumour, and the seed is how you reproduce it.
      case "property":
        out.push(
          (item.passed
            ? `${span("d-ok", "pass")} ${esc(item.function)}`
            : `${span("d-error", "fail")} ${esc(item.function)}`) +
            span("d-note", ` its contract, ${item.cases} cases, seed ${esc(item.seed)}`) +
            (item.passed ? "" : `\n${renderDiagnostic(item.diagnostic, source)}`),
        );
        break;
      // Silence means "well formed" on the check verb, so a test run says how
      // it came out rather than leaving an empty console to mean two things.
      case "summary":
        out.push(
          span(
            item.failed ? "d-error" : "d-ok",
            `${item.passed} passed, ${item.failed} failed`,
          ),
        );
        break;
      // The compiler refuses to run a program that does not check, because
      // running one answers a question nobody asked. Check is where the
      // reasons are, so the page offers it rather than repeating them here.
      case "refused":
        out.push(
          span("d-error", item.message) +
            `\n  <button type="button" class="apply" data-instead="deed_check">Show the ${item.errors === 1 ? "error" : `${item.errors} errors`}</button>`,
        );
        break;
      case "capability":
        out.push(span("d-warning", item.message));
        break;
      case "formatted":
        SOURCE.value = item.text;
        out.push(span("d-ok", "formatted"));
        break;
      default:
        out.push(esc(JSON.stringify(item)));
    }
  }
  return out.join("\n");
}

async function run(verb, byHand = false) {
  const source = SOURCE.value;
  try {
    const answer = await ask(verb, source, byHand);
    OUTPUT.innerHTML = render(verb, answer, source);
    if (verb === "deed_check" || verb === "deed_fmt") markLines(answer, SOURCE.value);
    if (verb === "deed_fmt") paint();
  } catch (error) {
    // A stop is an answer the reader asked for, not a failure to answer.
    if (error.stopped) return;
    OUTPUT.innerHTML = span("d-error", `the compiler could not answer: ${error.message}`);
  }
}

// The colouring, from the compiler's own lexer rather than from a grammar
// written here. `deed_tokens` classifies every byte range but whitespace, so
// the gaps between ranges are exactly the whitespace and get copied through.
//
// The textarea sits on top with transparent text, so what anyone reads is
// this layer and what anyone types is that one. They have to agree on every
// font property or the caret drifts, which is why the CSS sets both from the
// same block.
async function paint() {
  const source = SOURCE.value;
  let classified;
  try {
    classified = await ask("deed_tokens", source);
  } catch {
    // Colouring is the part that can be missing. The editor still works.
    return;
  }
  if (SOURCE.value !== source) return;

  let out = "";
  let at = 0;
  for (const line of classified.split("\n")) {
    if (line.trim() === "") continue;
    const { class: kind, start, end } = JSON.parse(line);
    out += esc(source.slice(at, start));
    out += `<span class="t-${kind}">${esc(source.slice(start, end))}</span>`;
    at = end;
  }
  out += esc(source.slice(at));

  // A trailing newline collapses in a `pre`, and the caret can sit after it.
  HIGHLIGHT.innerHTML = out + "\n";
  drawGutter(source);
}

// The line numbers, and which lines the compiler had something to say about.
let marked = new Map();

function drawGutter(source) {
  const lines = source.split("\n").length;
  let out = "";
  for (let n = 1; n <= lines; n++) {
    const severity = marked.get(n);
    out += severity ? `<b class="has-${severity}">${n}</b>\n` : `${n}\n`;
  }
  GUTTER.innerHTML = out;
}

function markLines(answer, source) {
  marked = new Map();
  for (const line of answer.split("\n")) {
    if (line.trim() === "") continue;
    const item = JSON.parse(line);
    if (item.kind !== "diagnostic") continue;
    const { file, span } = item.diagnostic.primary;
    if (file !== "main.deed") continue;
    // An error on a line beats a warning on the same one.
    const severity = item.diagnostic.severity === "warning" ? "warning" : "error";
    if (severity === "error" || !marked.has(span.startLine)) {
      marked.set(span.startLine, severity);
    }
  }
  drawGutter(source);
}

// Three layers scrolling as one. The gutter follows vertically only: it has
// no columns to scroll past.
SOURCE.addEventListener("scroll", () => {
  HIGHLIGHT.scrollTop = SOURCE.scrollTop;
  HIGHLIGHT.scrollLeft = SOURCE.scrollLeft;
  GUTTER.scrollTop = SOURCE.scrollTop;
});

// `check` is the fast one and the one the language is about, so it runs while
// you type rather than waiting to be asked. Only when nothing else is in
// flight: a `run` that is still going is a better use of the compiler than a
// `check` of a program that is being edited anyway.
//
// Colouring is on a shorter fuse than checking, because it is answering a
// question about the text rather than about the program, and text that stays
// grey while you type reads as broken.
let painting = null;
let typing = null;

// Both of these can find the compiler busy with the other one. Re-arming
// rather than returning is the difference between "later" and "never": an
// earlier version dropped the check whenever a paint was still in flight, so
// the output pane kept answering about the program before last.
//
// "Busy" and "not there" are separate questions for the same reason. The verbs
// are disabled in both cases, so reading the buttons would have made a
// temporary state look permanent.
function schedule(which, delay) {
  clearTimeout(which === paint ? painting : typing);
  const timer = setTimeout(() => {
    if (!ready) return;
    if (pending) return schedule(which, 100);
    which();
  }, delay);
  if (which === paint) painting = timer;
  else typing = timer;
}

const check = () => run("deed_check").then(paint);

SOURCE.addEventListener("input", () => {
  // Whatever was known about the example is now known about a different
  // program.
  if (!runnable) thisIsRunnable(true);
  drawGutter(SOURCE.value);
  schedule(paint, 150);
  schedule(check, 500);
});

STOP.addEventListener("click", () => {
  OUTPUT.innerHTML = span("d-note", "Stopped. The compiler is being loaded again.");
  stop("stopped", true);
});

function arrived(data) {
  if (data.failed !== undefined) {
    // The verbs stay disabled, so say why and say what still works, rather
    // than leaving four dead buttons and a browser exception.
    STATUS.innerHTML = span(
      "d-error",
      `The compiler did not load, so the four verbs are off. You can still read and edit, and the examples still open. (${data.failed})`,
    );
    return;
  }

  // #594: the artifact says which compiler it is, so the page checks that
  // against the tag it asked for rather than trusting the filename.
  const reported = data.ready;
  if (reported !== VERSION) {
    STATUS.innerHTML = span(
      "d-error",
      `this page pinned ${VERSION} and the module says ${reported}, so it is not being used`,
    );
    return;
  }

  STATUS.innerHTML =
    `Deed ${esc(reported)}, ` +
    `<a href="https://github.com/deed-lang/deed/releases/tag/${TAG}">${TAG}</a>, ` +
    `running in this tab.`;
  ready = true;
  running(false);
  paint();
}

function load() {
  STATUS.textContent = `loading the compiler, ${TAG}`;
  worker = spawn();
  worker.postMessage({ load: new URL(WASM_URL, location.href).href });
}

for (const button of VERBS) {
  button.addEventListener("click", () => {
    run(button.dataset.verb, true);
  });
}

// A link carries the program and the version it was written against, in the
// fragment, which a browser never sends to a server. There is no backend here
// and this is the reason there does not need to be one: nobody's program is
// stored anywhere they did not put it.
//
// The fragment is `#<version>/<z or u><base64url>`. `z` is deflate-raw, which
// the browser already has, and `u` is the same bytes without it, for anything
// that does not. The version is first so it is readable without decoding.

const SHARE = document.getElementById("share");
const SHARED = document.getElementById("shared");
const SHARE_LABEL = SHARE.textContent;
let saying = null;

function toBase64Url(bytes) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}

function fromBase64Url(text) {
  // The padding is dropped on the way out because it is noise in a URL. Some
  // browsers accept it missing and some do not, so it is put back rather than
  // depended on.
  const padded = text.replaceAll("-", "+").replaceAll("_", "/");
  const binary = atob(padded.padEnd(Math.ceil(padded.length / 4) * 4, "="));
  return Uint8Array.from(binary, (c) => c.charCodeAt(0));
}

async function through(stream, bytes) {
  const response = new Response(new Blob([bytes]).stream().pipeThrough(stream));
  return new Uint8Array(await response.arrayBuffer());
}

async function encodeProgram(source) {
  const raw = encoder.encode(source);
  if (typeof CompressionStream === "function") {
    try {
      return "z" + toBase64Url(await through(new CompressionStream("deflate-raw"), raw));
    } catch {
      // Fall through to the uncompressed form rather than lose the link.
    }
  }
  return "u" + toBase64Url(raw);
}

async function decodeProgram(payload) {
  const bytes = fromBase64Url(payload.slice(1));
  if (payload.startsWith("z")) {
    return decoder.decode(await through(new DecompressionStream("deflate-raw"), bytes));
  }
  return decoder.decode(bytes);
}

SHARE.addEventListener("click", async () => {
  const payload = await encodeProgram(SOURCE.value);
  const link = `${location.origin}${location.pathname}#${VERSION}/${payload}`;
  location.hash = `${VERSION}/${payload}`;
  ours = location.hash;

  // In the button, not under the editor: a line of text appearing to report
  // one word pushes everything below it down, and the thing below it is the
  // editor. It still says when it could not, because a page served over
  // `file://` has no clipboard permission and neither does an old browser.
  let said;
  try {
    await navigator.clipboard.writeText(link);
    said = "Copied";
  } catch {
    said = "In the address bar";
  }
  SHARE.textContent = said;
  clearTimeout(saying);
  saying = setTimeout(() => {
    SHARE.textContent = SHARE_LABEL;
  }, 2500);
});

async function loadFromLink() {
  const hash = location.hash.slice(1);
  const slash = hash.indexOf("/");
  if (slash < 1) return false;

  const version = hash.slice(0, slash);
  try {
    SOURCE.value = await decodeProgram(hash.slice(slash + 1));
  } catch {
    SHARED.textContent = "That link does not decode. It may have been cut short by whatever carried it.";
    return false;
  }

  if (version !== VERSION) {
    SHARED.textContent = `This program was written against ${version} and the page is running ${VERSION}, so it may not say the same thing.`;
  }
  marked = new Map();
  thisIsRunnable(true);
  paint();
  return true;
}

// The examples are the compiler's corpus at the pinned tag, not programs
// written for this page. Every one of them is checked by that repository's own
// tests, and the summary under the picker is the comment at the top of the
// file rather than a description written here.
//
// The picker shows twelve of the twenty-eight. The rest are the corpus doing
// its other job, one language feature at a time so the compiler's tests have
// something to read, and a menu of those is a menu of somebody else's test
// suite. `shown` in the index carries the choice and its order; every file is
// still here and still opens by name.
//
// One file is missing entirely: `greeting.deed` imports two other modules, and
// this page hands the compiler one file. It is left out rather than shown
// failing.
async function loadExamples() {
  let index;
  try {
    const response = await fetch("../examples/index.json");
    index = await response.json();
  } catch {
    // A picker that is not there is better than one that is empty and enabled.
    return;
  }

  const summaries = new Map();
  for (const entry of index.examples) summaries.set(entry.file, entry);

  for (const entry of index.examples
    .filter((entry) => entry.shown >= 0)
    .sort((a, b) => a.shown - b.shown)) {
    const option = document.createElement("option");
    option.value = entry.file;
    option.textContent = entry.file.replace(/\.deed$/, "");
    EXAMPLE.append(option);
  }
  EXAMPLE.disabled = false;

  EXAMPLE.addEventListener("change", async () => {
    const file = EXAMPLE.value;
    if (!file) {
      thisIsRunnable(true);
      return;
    }
    const entry = summaries.get(file);
    SUMMARY.textContent = entry?.summary ?? "";
    SHARED.textContent = "";
    OUTPUT.textContent = "Press Check, Run, Test or Format.";
    const response = await fetch(`../examples/${encodeURIComponent(file)}`);
    SOURCE.value = await response.text();
    marked = new Map();
    thisIsRunnable(entry ? entry.runs && entry.needs.length === 0 : true, whyNot(entry));
    paint();
  });
}

// What to say instead of Run, which is two different sentences: a library has
// no way in, and a program that wants the filesystem has one and cannot use it
// here.
function whyNot(entry) {
  if (!entry || (entry.runs && entry.needs.length === 0)) return "";
  if (!entry.runs) return `A library: no \`main\` to run, ${entry.tests} tests to press Test on.`;
  return (
    `Wants ${entry.needs.join(", ")}, which this page has no filesystem for. ` +
    `Its ${entry.tests} tests still run.`
  );
}

load();
loadExamples();
loadFromLink();

// Pasting a link into a tab that is already open changes only the fragment,
// which is not a page load. Without this the address bar would say one thing
// and the editor another.
let ours = location.hash;
addEventListener("hashchange", () => {
  if (location.hash === ours) return;
  ours = location.hash;
  loadFromLink();
});
