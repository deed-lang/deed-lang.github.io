# No build step

- Status: Accepted
- Date: 2026-07-31
- Issue: [#2](https://github.com/deed-lang/deed-lang.github.io/issues/2)

## Decision

This site is plain HTML, CSS and JavaScript, served as files. There is no
bundler, no generator, no package manager and no `node_modules`. Cloning the
repository and opening a file in a browser is the whole development loop, and
what GitHub Pages serves is what is in the tree.

Documentation is generated in [deed-lang/deed](https://github.com/deed-lang/deed),
where the material already lives, and this repository only hosts the output.

## Why

The playground is one page whose job is to fetch a wasm module and call five
of its exports. That is a few hundred lines of JavaScript against an interface
that is four functions and two accessors. A toolchain to manage it would be
larger than it is.

The compiler's repository has no dependencies at all, and that turned out to
be the reason a wasm build was plausible at all. The same rule is worth less
here, because a website is not a compiler, but it is not worth nothing: a site
with no build step still works in two years, and one with a five-year-old
bundler in it is a weekend.

The real argument for a generator was the documentation, and that argument
belongs to the other repository. An error index with a page per diagnostic
should be generated where the diagnostics are, next to the tests that already
assert their wording, rather than copied here and left to drift. This
repository hosts what comes out.

## The wasm module is fetched, not vendored

The page fetches the artifact from a release asset URL with the tag written
into it, then calls `deed_version` and refuses to go on if what came back is
not the tag it asked for.

That check is not defensive habit. The compiler exports the version for this
exact reason: "the artifact carries its own version rather than trusting a
filename, because a filename is a copy away from being wrong and this is not."
A vendored copy is precisely that copy, and it would make this repository the
owner of a compiler build, which the epic says it is not.

## Drawbacks

Templating is by hand, so a shared header is repeated per page. With five
pages that is cheaper than the machinery to avoid it; at fifty it would not
be, and that is the number that should reopen this.

A fetch is a network round trip the page waits on, and a release that is
deleted takes the playground with it. Both are the price of not owning a
build of the compiler.

No minification. The artifact is 265,841 bytes gzipped and the rest of the
site is text, so the JavaScript is not what anyone is waiting for.

## Rejected ideas

**A static site generator.** Buys templating, markdown and navigation. The
documentation was the case for it, and moving generation to the compiler's
repository answers that case without a toolchain here. Reopen this if pages
written by hand start disagreeing with each other.

**A framework.** A site that is mostly text plus one interactive page. The
interactive page talks to linear memory, which no framework helps with.

**Vendoring the wasm.** Self-contained and fast, and it makes this repository
own a compiler build. It also means the file in the tree and the tag in the
URL can disagree, which is the failure `deed_version` exists to catch.

## Open questions

Whether the generated documentation is committed here or published by the
compiler's release workflow. Deferred until there is documentation to host.
