// The error index, asked of the compiler rather than written here.
//
// `deed-explain` generates a page per diagnostic code from the doc comment
// above it and an example taken out of a test that already had to exist. The
// artifact carries all of them, so this page cannot document a code the
// compiler does not have, or miss one it does.

const TAG = "v0.2.5";
const VERSION = "0.2.5";
const WASM_URL = `../assets/deed-${TAG}-wasm32-unknown-unknown.wasm`;

const STATUS = document.getElementById("status");
const FILTER = document.getElementById("filter");
const COUNT = document.getElementById("count");
const CODES = document.getElementById("codes");

// Quotes as well as the angle brackets, because a code goes into an `id` and
// an `href` on this page and not only into text.
function esc(text) {
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function span(cls, text) {
  return `<span class="${cls}">${esc(text)}</span>`;
}

function render(pages) {
  CODES.innerHTML = pages
    .map(
      (page) => `
      <section class="diagnostic" id="${esc(page.code)}">
        <h2><a href="#${esc(page.code)}">${esc(page.code)}</a> ${span("d-gutter", page.name)}</h2>
        <p>${esc(page.text).replace(/\n\n/g, "</p><p>").replace(/\n/g, " ")}</p>
        ${
          page.example
            ? `<pre class="code"><code>${esc(page.example)}</code></pre>
               <p class="from d-gutter">from ${esc(page.example_source ?? "")}</p>`
            : `<p class="from d-gutter">No example could be lifted from a test for this one.</p>`
        }
      </section>`,
    )
    .join("");
}

async function load() {
  let wasm;
  try {
    const module = await WebAssembly.instantiateStreaming(fetch(WASM_URL), {});
    wasm = module.instance.exports;
  } catch (error) {
    STATUS.innerHTML = span(
      "d-error",
      `The compiler did not load, so there is nothing to list. (${error})`,
    );
    return;
  }

  const decoder = new TextDecoder();
  const read = () => {
    const ptr = wasm.deed_result_ptr();
    const len = wasm.deed_result_len();
    const text = decoder.decode(new Uint8Array(wasm.memory.buffer).slice(ptr, ptr + len));
    wasm.deed_free(ptr, len);
    return text;
  };

  wasm.deed_version();
  const reported = read();
  if (reported !== VERSION) {
    STATUS.innerHTML = span(
      "d-error",
      `This page pinned ${VERSION} and the module says ${reported}, so it is not being used.`,
    );
    return;
  }

  wasm.deed_explain();
  const pages = read()
    .split("\n")
    .filter((line) => line.trim() !== "")
    .map((line) => JSON.parse(line));

  STATUS.innerHTML =
    `Deed ${esc(reported)}, ` +
    `<a href="https://github.com/deed-lang/deed/releases/tag/${TAG}">${TAG}</a>, ` +
    `asked in this tab.`;

  FILTER.disabled = false;
  const show = () => {
    const wanted = FILTER.value.trim().toLowerCase();
    const shown = wanted
      ? pages.filter((page) =>
          `${page.code} ${page.name} ${page.text}`.toLowerCase().includes(wanted),
        )
      : pages;
    COUNT.textContent = wanted
      ? `${shown.length} of ${pages.length} codes`
      : `${pages.length} codes`;
    render(shown);
  };

  FILTER.addEventListener("input", show);
  show();

  // A link to a code should land on it, and the list did not exist when the
  // browser tried the first time.
  if (location.hash) {
    document.getElementById(location.hash.slice(1))?.scrollIntoView();
  }
}

load();
