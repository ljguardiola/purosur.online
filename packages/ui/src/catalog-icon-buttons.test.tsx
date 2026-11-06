import { expect, test } from "vitest";
import { cdp, userEvent } from "vitest/browser";
import { catalogStories, renderCatalogStory } from "./test-support/catalog-runner";

function isShown(element: HTMLElement): boolean {
  const rect = element.getBoundingClientRect();
  if (rect.width === 0 || rect.height === 0) {
    return false;
  }
  const style = getComputedStyle(element);
  return style.visibility !== "hidden" && style.display !== "none";
}

function iconOnlyButtons(): HTMLElement[] {
  return [...document.querySelectorAll<HTMLElement>("button, [role='button']")].filter(
    (button) =>
      isShown(button) &&
      !button.closest("[aria-hidden='true']") &&
      (button.textContent ?? "").trim() === "" &&
      button.querySelector("svg") !== null,
  );
}

function shownTooltips(): string[] {
  return [...document.querySelectorAll("[role='tooltip']")].map(
    (tooltip) => tooltip.textContent?.trim() ?? "",
  );
}

function isReachable(element: HTMLElement): boolean {
  element.scrollIntoView({ block: "center", inline: "center" });
  const rect = element.getBoundingClientRect();
  const topmost = document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2);
  return topmost !== null && element.contains(topmost);
}

function expectedText(button: HTMLElement): string | undefined {
  return button.getAttribute("aria-disabled") === "true"
    ? undefined
    : (button.getAttribute("aria-label") ?? undefined);
}

async function expectTooltipWhile(open: () => Promise<void>, button: HTMLElement, how: string) {
  await open();
  await expect
    .poll(shownTooltips, { message: `${how}: ${button.outerHTML}` })
    .toEqual([expect.stringMatching(/\S/)]);
  const expected = expectedText(button);
  if (expected !== undefined) {
    expect(shownTooltips()).toEqual([expected]);
  }
}

// A story's own play function hovers with synthetic events, which a real mouse move never undoes.
async function settle() {
  if (document.activeElement instanceof HTMLElement) {
    document.activeElement.blur();
  }
  for (const hovered of document.querySelectorAll("[data-hovered]")) {
    hovered.dispatchEvent(new PointerEvent("pointerleave", { pointerType: "mouse" }));
  }
  await cdp().send("Input.dispatchMouseEvent", { type: "mouseMoved", x: 0, y: 0 });
  await expect.poll(shownTooltips).toEqual([]);
}

function enterKeyboardModality() {
  document.dispatchEvent(new KeyboardEvent("keydown", { key: "a", bubbles: true }));
}

for (const { title, story: Story } of catalogStories) {
  test(`every icon-only button of ${title} / ${Story.storyName} shows its name as a tooltip`, async () => {
    await renderCatalogStory(Story);
    window.focus();

    for (const button of iconOnlyButtons().filter(isReachable)) {
      await settle();
      await expectTooltipWhile(() => userEvent.hover(button), button, "hovered");

      const focusable = button.tabIndex >= 0 && button.getAttribute("disabled") === null;
      if (focusable) {
        await settle();
        await expectTooltipWhile(
          async () => {
            enterKeyboardModality();
            button.blur();
            button.focus();
          },
          button,
          "focused",
        );
      }
    }
  });
}
