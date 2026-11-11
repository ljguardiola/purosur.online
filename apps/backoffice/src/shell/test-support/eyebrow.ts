export function shownEyebrow(): string | null {
  const above = document.querySelector("h1")?.previousElementSibling;
  return above?.tagName === "P" ? above.textContent : null;
}
