let movedFocus = false;

const personActions = ["keydown", "pointerdown", "click", "input"] as const;

function personActs() {
  movedFocus = false;
  for (const action of personActions) {
    document.removeEventListener(action, personActs, true);
  }
}

// A field focused here was not focused by the person, so it reacts as if nothing asked for it: a
// combobox does not open its list. It still counts as such after the focus event, when the list's
// opening reaches the screen, and until the person presses a key or a pointer, clicks, even through
// assistive technology, which clicks without pressing a pointer, or enters text.
export function moveFocus(move: () => void) {
  movedFocus = true;
  for (const action of personActions) {
    document.addEventListener(action, personActs, true);
  }
  move();
}

export function focusMovedWithoutThePerson(): boolean {
  return movedFocus;
}
