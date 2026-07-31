# Nothing on this site watches anybody

- Status: Accepted
- Date: 2026-07-31
- Issue: [#12](https://github.com/deed-lang/deed-lang.github.io/issues/12)

## Decision

No analytics, no third-party scripts, no fonts from anybody else's server, no
cookies, no local storage, and nothing about a visitor's program leaving their
browser.

The playground runs the compiler in the tab. A program typed into it is
compiled a few centimetres from where it was typed, and the only way one
travels is if somebody presses the link button, which puts it in the fragment
of a URL they then choose to paste somewhere.

## Measured

Loading the three pages and opening an example, in a browser rather than by
reading the source:

```
/          localhost
/play/     localhost
/install/  localhost
```

Every request is same-origin. `document.cookie` is empty, and `localStorage`
and `sessionStorage` are both empty after using the page.

Anyone can check this again the same way: open the network panel, use the
site, and look at the list of hosts. It should have one thing in it.

## Why

A page selling a capability model that quietly loads four trackers is making
an argument against itself. The language's whole claim is that authority is
visible in the signature; a site that reaches for things it never mentioned
would be the counterexample.

There is also less to go wrong. A static site with no backend cannot leak what
it never collected, cannot go down separately from the pages, and cannot
become a place where somebody's code is stored without them expecting it.

## What this gives up

There will be no way to know how many people opened the playground, which
examples they picked, or whether anybody typed anything of their own. That is
a real cost and it lands exactly where it hurts most: the point of the
playground is to find out whether people write Deed, and this is the decision
not to find out.

The honest replacement is worse and slower. A link somebody shares, an issue
somebody opens, a program somebody pastes into a conversation. Those are the
signal, and there will not be many of them at first.

That trade is worth naming rather than discovering later, because the moment
this feels expensive is the moment somebody adds a "privacy-friendly"
counter, and this is the paragraph that should be read first.

## What would reopen this

Nothing about volume. Wanting the number is not new information.

Something would have to be answerable only by measurement and worth the cost,
for example a reproducible failure that only some browsers hit, and even then
the first thing to try is asking, not counting.

## Rejected ideas

**Self-hosted analytics.** Removes the third party and keeps the collection.
The objection was never only about who else gets the data.

**Counting page loads at the CDN.** GitHub Pages already logs requests and
that is not a decision this repository gets to make. What it can decide is
that nothing here adds to it, and that no page reports anything about what a
visitor did once it loaded.

**A "do you consent" banner.** A banner is what a site puts up when it wants
to do the thing anyway.
