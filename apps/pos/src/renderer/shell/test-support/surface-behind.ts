export function surfaceBehind(element: HTMLElement): string {
  let surface: HTMLElement | null = element;
  while (surface !== null && getComputedStyle(surface).backgroundColor === "rgba(0, 0, 0, 0)") {
    surface = surface.parentElement;
  }
  return surface === null ? "none" : getComputedStyle(surface).backgroundColor;
}
