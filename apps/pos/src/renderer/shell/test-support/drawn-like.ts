import { expect } from "vitest";
import { userEvent } from "vitest/browser";

type StyleProperty = {
  [Key in keyof CSSStyleDeclaration]: CSSStyleDeclaration[Key] extends string ? Key : never;
}[keyof CSSStyleDeclaration];

export function expectDrawnLike(
  element: Element,
  reference: Element,
  properties: readonly StyleProperty[],
  context: string,
) {
  const drawn = getComputedStyle(element);
  const expected = getComputedStyle(reference);
  for (const property of properties) {
    expect(drawn[property], `${context} ${String(property)}`).toBe(expected[property]);
  }
}

export async function hoveredBackground(element: Element): Promise<string> {
  await userEvent.hover(element);
  await expect.poll(() => getComputedStyle(element).backgroundColor).not.toBe("rgba(0, 0, 0, 0)");
  await Promise.all(element.getAnimations().map((animation) => animation.finished));
  return getComputedStyle(element).backgroundColor;
}
