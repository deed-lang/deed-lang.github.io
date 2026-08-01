// The underlines, wearing the four accent colours at random.
//
// Every link on the page has a thick underline, and which of the four colours
// it wears is picked at random, again on every hover. The one rule is that
// the decoration and the text never have to match: the colour is the page
// being alive, not a meaning.

const COLORS = ["#24d05a", "#eb4888", "#10a2f5", "#e9bc3f"];

function pick() {
  return COLORS[Math.floor(Math.random() * COLORS.length)];
}

function paint() {
  for (const element of document.getElementsByTagName("a")) {
    element.style.textDecorationColor = pick();
  }
}

for (const element of document.querySelectorAll("a, button")) {
  element.addEventListener("mouseover", () => {
    element.style.textDecorationColor = pick();
  });
}

paint();
