type TokenStyleProperty = "width" | "fontSize" | "fontWeight";

export function tokenStyle(property: TokenStyleProperty, token: string): string {
  const probe = document.createElement("div");
  probe.style[property] = `var(--${token})`;
  document.body.appendChild(probe);
  const value = getComputedStyle(probe)[property];
  probe.remove();
  return value;
}
