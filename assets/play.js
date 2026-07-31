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
const VERBS = Array.from(document.querySelectorAll("[data-verb]"));

const encoder = new TextEncoder();
const decoder = new TextDecoder();

let wasm = null;

// `memory.buffer` is detached whenever the module grows its heap, so every
// read takes a fresh view rather than holding one.
function bytes() {
  return new Uint8Array(wasm.memory.buffer);
}

function readResult() {
  const ptr = wasm.deed_result_ptr();
  const len = wasm.deed_result_len();
  const text = decoder.decode(bytes().slice(ptr, ptr + len));
  wasm.deed_free(ptr, len);
  return text;
}

// Allocate, write, call, read, free: the sequence the module's own docs
// describe, and the only way onto or off of its memory.
function call(verb, source) {
  const input = encoder.encode(source);
  const ptr = wasm.deed_alloc(input.length);
  bytes().set(input, ptr);
  wasm[verb](ptr, input.length);
  const result = readResult();
  wasm.deed_free(ptr, input.length);
  return result;
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
  }
  return out.join("\n");
}

function render(verb, json, source) {
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

function run(verb) {
  const source = SOURCE.value;
  try {
    OUTPUT.innerHTML = render(verb, call(verb, source), source);
  } catch (error) {
    OUTPUT.innerHTML = span("d-error", `the compiler could not answer: ${error}`);
  }
}

async function load() {
  STATUS.textContent = `loading the compiler, ${TAG}`;
  try {
    const module = await WebAssembly.instantiateStreaming(fetch(WASM_URL), {});
    wasm = module.instance.exports;

    // #594: the artifact says which compiler it is, so the page checks that
    // against the tag it asked for rather than trusting the filename.
    wasm.deed_version();
    const reported = readResult();
    if (reported !== VERSION) {
      STATUS.innerHTML = span(
        "d-error",
        `this page pinned ${VERSION} and the module says ${reported}, so it is not being used`,
      );
      wasm = null;
      return;
    }

    STATUS.innerHTML =
      `Deed ${esc(reported)}, ` +
      `<a href="https://github.com/deed-lang/deed/releases/tag/${TAG}">${TAG}</a>, ` +
      `running in this tab.`;
    for (const button of VERBS) button.disabled = false;
  } catch (error) {
    STATUS.innerHTML = span(
      "d-error",
      `could not load the compiler: ${error}`,
    );
  }
}

for (const button of VERBS) {
  button.addEventListener("click", () => run(button.dataset.verb));
}

load();
