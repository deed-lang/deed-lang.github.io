# Deployment, and no custom domain

- Status: Accepted
- Date: 2026-07-31
- Issue: [#11](https://github.com/deed-lang/deed-lang.github.io/issues/11)

## Decision

GitHub Pages, serving the default branch at its root. No build, no deploy
workflow, no custom domain.

## How it is served

The repository is named `deed-lang.github.io`, so Pages publishes it at the
organisation root with no configuration. `main` is the site. There is no
artifact and no intermediate step, which is the same decision as
[no build step](2026-07-31-no-build-step.md) seen from the other end.

## The content type, measured

Streaming instantiation refuses anything that is not `application/wasm`, and
this was the thing most likely to be wrong. It is not:

```
$ curl -I https://deed-lang.github.io/assets/deed-v0.2.1-wasm32-unknown-unknown.wasm
content-type: application/wasm

$ curl -I https://deed-lang.github.io/assets/worker.js
content-type: application/javascript; charset=utf-8
```

## Caching, which is not ours to set

Everything comes back `cache-control: max-age=600`, pages and artifact alike.
Pages does not offer per-path headers, so the artifact cannot be cached hard
even though its name contains the tag and its contents can never change.

Ten minutes with an `ETag` is not the cost it looks like. A revalidation of an
unchanged file is a 304 and no bytes, and the artifact is 816 KB fetched once
per visit at worst. If that ever matters, the answer is a CDN in front, which
is a server to own, and the measurement that would justify it does not exist
yet.

## A broken deploy

Serving from a branch means there is no half-updated state to worry about:
either the commit is on `main` or it is not. What there is instead is a
commit that is fully deployed and wrong, which is the same risk with better
manners.

So `tools/check.mjs` runs on every pull request. It parses every JSON file,
resolves every local `href` and `src` against the tree, checks that the tag
and version in `assets/play.js` agree and that the artifact they name is
actually committed, and checks the example index against the files on disk.

That is not a test suite. It is the set of mistakes that would otherwise reach
the site silently, because nothing here fails to compile.

## No custom domain

Not now, and this is a decision rather than a delay.

There is nothing to gain. `deed-lang.github.io` is already the name, the
certificate is already there, and a domain would add a thing to own, renew and
point correctly, with a failure mode nobody would notice until the site
stopped resolving.

There is also something specific to lose. GitHub's own documentation says a
custom domain left configured while a Pages site is disabled is a domain
takeover waiting to happen: somebody else can serve a site on that name. That
risk arrives with the domain and is worth nothing until there is a reason for
the name.

## What would reopen this

A reason for a particular name: the project outgrowing being an organisation
on GitHub, or wanting an address that survives leaving.

The argument that moving later splits the links is the one to check first, not
to assume. Pages does redirect from the old address in at least some
configurations, and if that holds then moving later costs a redirect rather
than an audience, which makes waiting cheap. I did not confirm it, so this
decision does not lean on it either way.

## Rejected ideas

**Deploying from a workflow instead of the branch.** Buys a build step, which
is the thing already decided against, and adds a state where the site and the
branch disagree.

**Buying the domain now to hold the name.** Reasonable if the name were
contested. It is not, and holding a name is a subscription with a takeover
risk attached.
