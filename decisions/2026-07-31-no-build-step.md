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

The playground is one page whose job is to load a wasm module and call a
handful of its exports. That is a few hundred lines of JavaScript against an
interface that is four verbs and a few accessors. A toolchain to manage it
would be larger than it is.

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

## The wasm module is vendored, because it cannot be fetched

This section said the opposite when it was written, and building the page
falsified it on the first try. A browser cannot fetch a GitHub release asset.
Both the download URL and the API asset URL redirect to
`release-assets.githubusercontent.com`, which sends no
`Access-Control-Allow-Origin` header, so the request is blocked before any
bytes arrive. Measured in a browser, not read about.

There is no version of the original plan that survives that. A proxy would
mean owning a server, which is a larger thing to own than a file. So the
artifact is committed here, at `assets/deed-<tag>-wasm32-unknown-unknown.wasm`,
copied from the release of that tag and never built here.

The argument against vendoring was that the file in the tree and the tag in
the name can disagree, which is exactly what `deed_version` exists to catch.
That argument was right, and it is now an argument for the check rather than
against the copy. The page calls `deed_version` and refuses to run if the
answer is not the version the filename claims. The compiler exports it for
this reason: "the artifact carries its own version rather than trusting a
filename, because a filename is a copy away from being wrong and this is not."
This repository is now holding that copy, so the check is load-bearing here in
a way it would not have been over a fetch.

Moving the pin means downloading the asset for the new tag, deleting the old
file, and changing the tag and version in `assets/play.js`. If someone changes
one and not the other, the page says so and stops.

## Drawbacks

Templating is by hand, so a shared header is repeated per page. With five
pages that is cheaper than the machinery to avoid it; at fifty it would not
be, and that is the number that should reopen this.

A compiler build sits in this repository's history, at roughly 800 KB a tag.
That is the price of the page working at all, and it is worth watching: if the
pin moves often enough for the history to matter, the answer is a branch that
holds the artifacts rather than going back to a fetch that cannot work.

No minification. The artifact is 265,841 bytes gzipped and the rest of the
site is text, so the JavaScript is not what anyone is waiting for.

## Rejected ideas

**A static site generator.** Buys templating, markdown and navigation. The
documentation was the case for it, and moving generation to the compiler's
repository answers that case without a toolchain here. Reopen this if pages
written by hand start disagreeing with each other.

**A framework.** A site that is mostly text plus one interactive page. The
interactive page talks to linear memory, which no framework helps with.

**Fetching the wasm from the release.** Rejected by measurement rather than by
argument, and it was the plan until then. See above.

**Building the wasm here.** Would need the Rust toolchain, a wasm target and a
build step, all three of which this decision is about not having, and it would
make this repository the owner of a compiler build rather than the holder of a
copy of one.

## Open questions

Whether the generated documentation is committed here or published by the
compiler's release workflow. Deferred until there is documentation to host.
