const style = document.createElement("style");
// A paused composited animation does not reliably reach a screenshot taken right after render, so
// every animation and transition is removed instead.
style.textContent = `
  *, *::before, *::after {
    animation: none !important;
    transition: none !important;
    caret-color: transparent !important;
  }
`;
document.head.appendChild(style);
