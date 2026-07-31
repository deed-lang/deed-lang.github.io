# deed-lang.github.io

The Deed website and playground, served at <https://deed-lang.github.io>.

The language itself lives in [deed-lang/deed](https://github.com/deed-lang/deed).

## Where the boundary is

This repository owns pages. It does not own the compiler, the wasm artifact,
or anything that decides what a Deed program means.

The playground fetches a released build of the compiler, pinned to a tag, and
asks it. If this site ever shows behaviour that no release has, that is a bug
here and not a feature: the fix is to correct the page, or to pin a different
tag, never to make the page answer on the compiler's behalf.

Concretely, that rules out a few things that would otherwise be tempting:

- No second formatter. `fmt` is one of the exports.
- No syntax highlighting that knows more than the grammar the compiler ships.
- No error messages written here. Diagnostics are rendered from what the
  compiler returns, carets and all.
- No examples typed out by hand. They are loaded from the corpus.

The split exists because the two repositories have different constraints. The
compiler's has no dependencies on purpose and its tests are strict in ways
that suit a compiler and would suit no website. And a page changes for reasons
that have nothing to do with the language, which is history the language
should not carry.

## Running it

Open `index.html` in a browser, or serve the directory:

```
$ python3 -m http.server
```

There is no build step, no package manager and nothing to install. See
[decisions/2026-07-31-no-build-step.md](decisions/2026-07-31-no-build-step.md)
for why, and for what would change the answer.

The playground fetches the compiler over the network, so that page needs a
connection even when the rest of the site does not.

## Layout

```
index.html          what the language is
play/               the playground
assets/             one stylesheet, and a script per page that needs one
decisions/          why this repository is shaped the way it is
```

## Licence

Apache-2.0, matching the compiler.

