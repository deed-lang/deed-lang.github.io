# deed-lang.github.io

The Deed website and playground, served at <https://deed-lang.github.io>.

The language itself lives in [deed-lang/deed](https://github.com/deed-lang/deed).

## Where the boundary is

This repository owns pages. It does not own the compiler, the wasm artifact,
or anything that decides what a Deed program means.

The playground runs a released build of the compiler, pinned to a tag, and
asks it. If this site ever shows behaviour that no release has, that is a bug
here and not a feature: the fix is to correct the page, or to pin a different
tag, never to make the page answer on the compiler's behalf.

Concretely, that rules out a few things that would otherwise be tempting:

- No second formatter. `fmt` is one of the exports.
- No syntax highlighting that knows more than the grammar the compiler ships.
- No error messages written here. Diagnostics are rendered from what the
  compiler returns, carets and all.
- No compiler output typed out by hand. The landing page's program is short
  and was written for the page, but the refusal underneath it was produced by
  running that program through the pinned build, not written to look like one.

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

Opening `play/index.html` as a `file://` URL will not work, because the wasm
module is loaded with `fetch`. Serve the directory instead.

## The pinned compiler

`assets/deed-<tag>-wasm32-unknown-unknown.wasm` is copied from the release of
that tag. It is not built here and it is not edited here. A release asset
cannot be fetched from a browser, so it is committed rather than requested;
the measurement behind that is in the decision record.

Moving the pin is three steps:

```
$ gh release download vX.Y.Z --repo deed-lang/deed --pattern '*.wasm' --dir assets
$ git rm assets/deed-<old tag>-wasm32-unknown-unknown.wasm
$ $EDITOR assets/play.js    # TAG and VERSION
```

The page asks the module its version and refuses to run if the answer is not
the one `play.js` claims, so changing the file without changing the pin, or
the other way round, says so on the page instead of quietly serving the wrong
compiler.

## Layout

```
index.html          what the language is
play/               the playground
assets/             the stylesheet, the scripts, the brand files, the compiler
decisions/          why this repository is shaped the way it is
```

## Licence

Apache-2.0, matching the compiler.

