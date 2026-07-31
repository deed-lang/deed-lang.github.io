// The thirty seconds a recording would have shown, without the recording.
//
// A video of this page would go stale the moment the compiler said anything
// differently, and this page's whole claim is that it prints what the compiler
// prints. So the walkthrough moves through the page that is already here
// rather than a copy of it filmed in the past.
//
// No sound to turn off, and nothing that only works if you can see colour: the
// caption says what to look at and the section is scrolled to.

const BUTTON = document.getElementById("walk");
const CAPTION = document.getElementById("caption");
const STEPS = Array.from(document.querySelectorAll("[data-step]"));

const STILL = matchMedia("(prefers-reduced-motion: reduce)");
const PAUSE = 4500;

let at = -1;
let timer = null;

function show(index) {
  at = index;
  const step = STEPS[at];
  for (const other of STEPS) other.classList.toggle("here", other === step);
  CAPTION.textContent = `${at + 1} of ${STEPS.length}. ${step.dataset.step}`;
  step.scrollIntoView({
    block: "center",
    behavior: STILL.matches ? "auto" : "smooth",
  });
}

function stop() {
  clearTimeout(timer);
  timer = null;
  BUTTON.textContent = at + 1 < STEPS.length ? "Keep going" : "Start again";
}

function next() {
  if (at + 1 >= STEPS.length) {
    stop();
    return;
  }
  show(at + 1);
  // Someone who wants to read a step should be able to. Auto-advance is off
  // entirely when the reader has asked for less movement.
  if (!STILL.matches) timer = setTimeout(next, PAUSE);
  else stop();
}

BUTTON.addEventListener("click", () => {
  if (timer) {
    stop();
    return;
  }
  if (at + 1 >= STEPS.length) at = -1;
  BUTTON.textContent = "Pause";
  next();
});

// Anything that means "I am reading this myself" ends the tour rather than
// fighting it.
for (const event of ["wheel", "touchstart", "keydown"]) {
  addEventListener(event, () => {
    if (timer) stop();
  }, { passive: true });
}
