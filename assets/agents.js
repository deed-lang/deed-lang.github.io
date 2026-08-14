// The agent page's transcripts, asked of the compiler rather than written here.
//
// Every JSON line this page shows is what the pinned artifact answered in this
// tab, for the program printed above it. That is the whole point of the page:
// a claim about what an agent gets back is worth nothing if the page is the
// one making it up.

const TAG = "v0.2.11";
const VERSION = "0.2.11";
const WASM_URL = `../assets/deed-${TAG}-wasm32-unknown-unknown.wasm`;
const REVIEW_DEMO_URL = "../assets/review-demo.json";

const STATUS = document.getElementById("status");
const REVIEW_BEFORE = document.getElementById("review-before");
const REVIEW_AFTER = document.getElementById("review-after");
const REVIEW_GOT = document.getElementById("review-got");

// Each one is a program and the verb an agent would send it to. The programs
// are short on purpose: this page is about the answer, not the program.
const ASKS = [
  {
    id: "tiers",
    verb: "deed_check",
    source: `module inventory

type InStock = Int where value > 0

fn take_one(count: InStock) -> Int
  ensures
    ok  => result >= 0,
{
    count - 1
}

fn restock(count: Int, delivered: Int) -> InStock
  where
    count > 0,
    delivered >= 0,
    count < 1000000000,
    delivered < 1000000000,
{
    count + delivered
}
`,
  },
  {
    id: "guarded",
    verb: "deed_check",
    source: `module inventory

type InStock = Int where value > 0

fn restock(count: Int, delivered: Int) -> InStock {
    count + delivered
}
`,
  },
  {
    id: "repair",
    verb: "deed_check",
    source: `module inventory

export fn restock(count: Int) -> Int {
    count + 1
}
`,
  },
  {
    id: "property",
    verb: "deed_test",
    source: `module inventory

fn twice(n: Int) -> Int
  where
    n > 0 - 1000000000,
    n < 1000000000,
  ensures
    ok  => result == n + n,
{
    n + n
}
`,
  },
];

function esc(text) {
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

async function load() {
  let wasm;
  try {
    const module = await WebAssembly.instantiateStreaming(fetch(WASM_URL), {});
    wasm = module.instance.exports;
  } catch (error) {
    STATUS.innerHTML = `<span class="d-error">The compiler did not load, so the answers below are missing. (${esc(error)})</span>`;
    return;
  }

  const encoder = new TextEncoder();
  const decoder = new TextDecoder();
  const bytes = () => new Uint8Array(wasm.memory.buffer);

  const read = () => {
    const ptr = wasm.deed_result_ptr();
    const len = wasm.deed_result_len();
    const text = decoder.decode(bytes().slice(ptr, ptr + len));
    wasm.deed_free(ptr, len);
    return text;
  };

  wasm.deed_version();
  const reported = read();
  if (reported !== VERSION) {
    STATUS.innerHTML = `<span class="d-error">This page pinned ${esc(VERSION)} and the module says ${esc(reported)}, so it is not being used.</span>`;
    return;
  }

  const ask = (verb, source) => {
    const input = encoder.encode(source);
    const ptr = wasm.deed_alloc(input.length);
    bytes().set(input, ptr);
    wasm[verb](ptr, input.length);
    const text = read();
    wasm.deed_free(ptr, input.length);
    return text
      .split("\n")
      .filter((line) => line.trim() !== "")
      .map((line) => JSON.parse(line));
  };

  const review = (before, after) => {
    if (typeof wasm.deed_review !== "function") {
      throw new Error("the pinned compiler has no deed_review export");
    }
    const beforeInput = encoder.encode(before);
    const afterInput = encoder.encode(after);
    let beforePtr = null;
    let afterPtr = null;
    try {
      beforePtr = wasm.deed_alloc(beforeInput.length);
      afterPtr = wasm.deed_alloc(afterInput.length);
      bytes().set(beforeInput, beforePtr);
      bytes().set(afterInput, afterPtr);
      wasm.deed_review(beforePtr, beforeInput.length, afterPtr, afterInput.length);
      return read()
        .split("\n")
        .filter((line) => line.trim() !== "")
        .map((line) => JSON.parse(line));
    } finally {
      if (beforePtr !== null) wasm.deed_free(beforePtr, beforeInput.length);
      if (afterPtr !== null) wasm.deed_free(afterPtr, afterInput.length);
    }
  };

  try {
    const response = await fetch(REVIEW_DEMO_URL);
    if (!response.ok) throw new Error(`the review demo returned HTTP ${response.status}`);
    const demo = await response.json();
    if (
      !Array.isArray(demo.before) ||
      !demo.before.every((line) => typeof line === "string") ||
      !Array.isArray(demo.after) ||
      !demo.after.every((line) => typeof line === "string")
    ) {
      throw new Error("the review demo does not contain before and after source lines");
    }
    const before = `${demo.before.join("\n")}\n`;
    const after = `${demo.after.join("\n")}\n`;
    REVIEW_BEFORE.textContent = before.trimEnd();
    REVIEW_AFTER.textContent = after.trimEnd();
    REVIEW_GOT.textContent = review(before, after)
      .map((line) => JSON.stringify(line, null, 2))
      .join("\n\n");
  } catch (error) {
    REVIEW_BEFORE.textContent = "The review demo did not load.";
    REVIEW_AFTER.textContent = "The review demo did not load.";
    REVIEW_GOT.textContent = `The receipt could not be produced. (${error})`;
  }

  for (const { id, verb, source } of ASKS) {
    const sent = document.getElementById(`${id}-sent`);
    const got = document.getElementById(`${id}-got`);
    if (!sent || !got) continue;
    sent.textContent = source.trimEnd();
    // Indented for reading. On the wire each of these is one line, which is
    // the only thing changed about it here.
    got.textContent = ask(verb, source)
      .map((line) => JSON.stringify(line, null, 2))
      .join("\n\n");
  }

  STATUS.innerHTML =
    `Deed ${esc(reported)}, ` +
    `<a href="https://github.com/deed-lang/deed/releases/tag/${TAG}">${TAG}</a>, ` +
    `asked in this tab. Every answer below came back just now.`;
}

load();
