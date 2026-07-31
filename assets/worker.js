// The compiler, off the thread that draws the page.
//
// A program does not have to run forever to freeze a tab. `repeat(1, 20000000)`
// summed in a `for` takes eight seconds in this artifact, and eight seconds of
// a frozen tab is indistinguishable from a broken page. Recursion is capped at
// 128 deep by the interpreter, so a program cannot spin here forever, but it
// can take longer than anyone will wait, and the only way to stop something
// already running is to end the thread it is on.
//
// This file knows nothing about Deed. It moves bytes in and moves bytes out.

let wasm = null;

const encoder = new TextEncoder();
const decoder = new TextDecoder();

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

onmessage = async ({ data }) => {
  if (data.load) {
    try {
      const module = await WebAssembly.instantiateStreaming(fetch(data.load), {});
      wasm = module.instance.exports;
      wasm.deed_version();
      postMessage({ ready: readResult() });
    } catch (error) {
      postMessage({ failed: String(error) });
    }
    return;
  }

  try {
    postMessage({ id: data.id, text: call(data.verb, data.source) });
  } catch (error) {
    postMessage({ id: data.id, error: String(error) });
  }
};
