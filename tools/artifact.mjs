// The pinned compiler, asked rather than trusted.
//
// Two tools here put bytes onto the module's memory and read bytes back, one
// to write `examples/index.json` and one to check that it is still true. Two
// copies of that sequence is two copies to get wrong, so it lives here, and
// it is the same sequence `assets/worker.js` runs in the browser.

import { readFile } from "node:fs/promises";

export async function open(path) {
  const { instance } = await WebAssembly.instantiate(await readFile(path), {});
  const wasm = instance.exports;
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();

  // `memory.buffer` is detached whenever the module grows its heap, so every
  // read takes a fresh view rather than holding one.
  const bytes = () => new Uint8Array(wasm.memory.buffer);

  function read() {
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
    const text = read();
    wasm.deed_free(ptr, input.length);
    return text;
  }

  const lines = (verb, source) =>
    call(verb, source)
      .split("\n")
      .filter((line) => line.trim() !== "")
      .map((line) => JSON.parse(line));

  function version() {
    wasm.deed_version();
    return read();
  }

  // The three things `examples/index.json` says about a file. Two of them are
  // answers from the module and the third is the file's own opening comment,
  // so none of it is a description written here.
  function describe(source) {
    // Asked rather than guessed. Looking for `fn main` in the text would be a
    // small parser written here, which is the thing this repository does not do.
    const runs = !lines("deed_run", source).some(
      (item) =>
        item.kind === "result" && item.ok === false && /no `main`/.test(item.message ?? ""),
    );
    const tests = lines("deed_test", source).filter((item) => item.kind === "test").length;
    return { summary: summaryOf(source), runs, tests };
  }

  return { call, lines, version, describe };
}

/// The opening comment, up to the first blank comment line or the first line
/// of code.
export function summaryOf(text) {
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
