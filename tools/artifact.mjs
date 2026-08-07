// The pinned compiler, asked rather than trusted.
//
// Two tools here put bytes onto the module's memory and read bytes back, one
// to write `examples/index.json` and one to check that it is still true. Two
// copies of that sequence is two copies to get wrong, so it lives here, and
// it is the same sequence `assets/worker.js` runs in the browser.

import { readFile } from "node:fs/promises";

// What the picker offers, in this order.
//
// The corpus is twenty-nine files and it is not a menu: about half of it is
// one language feature at a time, written so the compiler's own tests have
// something to read, and a visitor scrolling past `sink`, `names` and
// `diverge` is being shown the inside of a test suite. So the picker is
// fourteen programs a person would recognise, and the rest stay on disk, still
// asked about here and still reachable by name.
//
// `hello` is first because it is the only one this page can start. The others
// have tests, which is the button that works for them.
//
// `transfer` is late rather than absent, which it was for four releases. It is
// the program every design document works through and the one the README
// opens with, and it is not a feature written down on its own: it is a ledger
// with an effect, a handler, a contract and a refinement in it. Leaving it out
// while offering `counter` was an oversight rather than a judgement.
//
// It lives beside the code that asks the compiler because both tools need it:
// one writes the order into the index and the other checks it is still there.
export const SHOWN = [
  "hello.deed",
  "tic_tac_toe.deed",
  "calculator.deed",
  "markdown.deed",
  "json.deed",
  "stack_machine.deed",
  "tree.deed",
  "counter.deed",
  "using_list.deed",
  "logs.deed",
  "todo.deed",
  "tasks.deed",
  "transfer.deed",
  "proven.deed",
];

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

  // What `examples/index.json` says about a file. All of it is either an
  // answer from the module or the file's own opening comment, so none of it is
  // a description written here.
  function describe(source) {
    // Asked rather than guessed. Looking for `fn main` in the text would be a
    // small parser written here, which is the thing this repository does not do.
    const run = lines("deed_run", source);
    const runs = !run.some(
      (item) =>
        item.kind === "result" && item.ok === false && /no `main`/.test(item.message ?? ""),
    );
    // The capabilities this page cannot offer. A `main` is not enough to press
    // Run on: the command line has a filesystem behind it and a page does not,
    // so six of these have an entry point and still cannot start here.
    const needs = run
      .filter((item) => item.kind === "capability")
      .map((item) => (item.message ?? "").match(/`([^`]+)`/)?.[1])
      .filter(Boolean);
    const tests = lines("deed_test", source).filter((item) => item.kind === "test").length;
    return { summary: summaryOf(source), runs, needs, tests };
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
