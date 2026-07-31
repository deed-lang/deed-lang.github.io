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
const TAG = "v0.2.1";
const VERSION = "0.2.1";
const WASM_URL = `../assets/deed-${TAG}-wasm32-unknown-unknown.wasm`;

const SOURCE = document.getElementById("source");
const OUTPUT = document.getElementById("output");
const STATUS = document.getElementById("status");
const EXAMPLE = document.getElementById("example");
const SUMMARY = document.getElementById("summary");
const STOP = document.getElementById("stop");
const VERBS = Array.from(document.querySelectorAll("[data-verb]"));

const encoder = new TextEncoder();
const decoder = new TextDecoder();

// The module lives in a worker, so the thread that draws the page is never the
// thread doing the compiling. See assets/worker.js for why that matters.
let worker = null;
let pending = null;
let nextId = 1;

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

function ask(verb, source) {
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
    running(true);
    worker.postMessage({ id, verb, source });
  });
}

function running(yes) {
  STOP.hidden = !yes;
  for (const button of VERBS) button.disabled = yes || worker === null;
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
  run("deed_check");
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
        break;
      case "test":
        out.push(
          item.passed
            ? `${span("d-ok", "pass")} ${esc(item.name)}`
            : `${span("d-error", "fail")} ${esc(item.name)}\n` +
                renderDiagnostic(item.diagnostic, source),
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

async function run(verb) {
  const source = SOURCE.value;
  try {
    OUTPUT.innerHTML = render(verb, await ask(verb, source), source);
  } catch (error) {
    // A stop is an answer the reader asked for, not a failure to answer.
    if (error.stopped) return;
    OUTPUT.innerHTML = span("d-error", `the compiler could not answer: ${error.message}`);
  }
}

// `check` is the fast one and the one the language is about, so it runs while
// you type rather than waiting to be asked. Only when nothing else is in
// flight: a `run` that is still going is a better use of the compiler than a
// `check` of a program that is being edited anyway.
let typing = null;
SOURCE.addEventListener("input", () => {
  clearTimeout(typing);
  typing = setTimeout(() => {
    if (!pending && worker && !VERBS[0].disabled) run("deed_check");
  }, 500);
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
  running(false);
}

function load() {
  STATUS.textContent = `loading the compiler, ${TAG}`;
  worker = spawn();
  worker.postMessage({ load: new URL(WASM_URL, location.href).href });
}

for (const button of VERBS) {
  button.addEventListener("click", () => run(button.dataset.verb));
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

  // The button says what it did, including when it could not: a page served
  // over `file://` has no clipboard permission and neither does an old
  // browser, and silently doing nothing is worse than saying so.
  try {
    await navigator.clipboard.writeText(link);
    SHARED.textContent = `Copied. ${link.length} characters, and the address bar has it too.`;
  } catch {
    SHARED.textContent = `The address bar has the link, ${link.length} characters. Copying it needs a permission this page does not have here.`;
  }
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
  return true;
}

// The examples are the compiler's corpus at the pinned tag, not programs
// written for this page. Every one of them is checked by that repository's own
// tests, and the summary under the picker is the comment at the top of the
// file rather than a description written here.
//
// One file is missing: `greeting.deed` imports two other modules, and this
// page hands the compiler one file. It is left out rather than shown failing.
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
  for (const entry of index.examples) {
    summaries.set(entry.file, entry.summary);
    const option = document.createElement("option");
    option.value = entry.file;
    option.textContent = entry.file.replace(/\.deed$/, "");
    EXAMPLE.append(option);
  }
  EXAMPLE.disabled = false;

  EXAMPLE.addEventListener("change", async () => {
    const file = EXAMPLE.value;
    if (!file) return;
    SUMMARY.textContent = summaries.get(file) ?? "";
    SHARED.textContent = "";
    OUTPUT.textContent = "Press Check, Run, Test or Format.";
    const response = await fetch(`../examples/${encodeURIComponent(file)}`);
    SOURCE.value = await response.text();
  });
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
