const style = document.createElement("style");
// A paused composited animation does not reliably reach a screenshot taken right after render;
// removing every animation and transition instead means there is none left to reach a stable
// state for.
style.textContent = `
  *, *::before, *::after {
    animation: none !important;
    transition: none !important;
    caret-color: transparent !important;
  }
`;
document.head.appendChild(style);
