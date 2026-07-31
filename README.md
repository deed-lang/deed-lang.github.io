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
- No examples written here. The playground's are the compiler's corpus at the
  pinned tag, and the summary under each one is the comment at the top of the
  file. The landing page's program is the exception, and it is short and its
  refusal was still produced by running it.

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

`examples/` moves with it, since a program and the compiler that reads it are
not separately pinned:

```
$ git -C ../deed archive -o /tmp/ex.tar vX.Y.Z examples
$ tar -xf /tmp/ex.tar
$ rm examples/greeting.deed examples/todo.txt
```

`examples/index.json` is the list the picker reads, with each file's opening
comment as its summary. It is data rather than build output, so it is written
by hand when the pin moves.

`greeting.deed` is left out because it imports two other modules and this page
hands the compiler one file. That is the only one: the other twenty-nine were
checked through the pinned artifact and every one of them is clean.

## Layout

```
index.html          what the language is
play/               the playground
install/            how to get a binary running
examples/           the compiler's corpus at the pinned tag
assets/             the stylesheet, the scripts, the brand files, the compiler
decisions/          why this repository is shaped the way it is
```

## Licence

Apache-2.0, matching the compiler.

