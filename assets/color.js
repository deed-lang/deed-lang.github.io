// The underlines, wearing the four accent colours at random.
//
// Every link on the page has a thick underline, and which of the four colours
// it wears is picked at random, again on every hover. The one rule is that
// the decoration and the text never have to match: the colour is the page
// being alive, not a meaning.
//
// The four are the stylesheet's, read from it rather than repeated here. A
// colour written in two files is a colour that gets changed in one.
const styles = getComputedStyle(document.documentElement);
const COLORS = ["--green", "--pink", "--blue", "--yellow"].map((name) =>
  styles.getPropertyValue(name).trim(),
);

function pick() {
  return COLORS[Math.floor(Math.random() * COLORS.length)];
}

function paint(link) {
  link.style.textDecorationColor = pick();
}

// Looking once at load was wrong on the page with the most links in it: the
// diagnostics index builds eighty-five of them out of the compiler after this
// file has run, and typing in the filter builds them again. Those were the
// only links on the site wearing no colour, so links are found as they arrive
// rather than counted at the start.
new MutationObserver((records) => {
  for (const record of records) {
    for (const node of record.addedNodes) {
      if (node.nodeType !== Node.ELEMENT_NODE) continue;
      if (node.matches("a")) paint(node);
      for (const link of node.querySelectorAll("a")) paint(link);
    }
  }
}).observe(document.body, { childList: true, subtree: true });

// Delegated for the same reason: something that was not there at load hovers
// like the rest.
document.addEventListener("mouseover", (event) => {
  const target = event.target.closest?.("a, button");
  if (target) paint(target);
});

for (const link of document.getElementsByTagName("a")) paint(link);
