import { beforeEach, expect, test } from "vitest";
import { cdp, page, userEvent } from "vitest/browser";
import { catalogStories, renderCatalogStory } from "./test-support/catalog-runner";

beforeEach(async () => {
  await page.viewport(1280, 900);
  await cdp().send("Input.dispatchMouseEvent", { type: "mouseMoved", x: 0, y: 0 });
  window.focus();
});

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

async function closeTooltip() {
  await cdp().send("Input.dispatchMouseEvent", { type: "mouseMoved", x: 0, y: 0 });
  await userEvent.keyboard("{Escape}");
  await expect.poll(shownTooltips).toEqual([]);
}

for (const { title, story: Story } of catalogStories) {
  test(`every icon-only button of ${title} / ${Story.storyName} shows its name as a tooltip`, async () => {
    await renderCatalogStory(Story);

    for (const button of iconOnlyButtons().filter(isReachable)) {
      await expectTooltipWhile(() => userEvent.hover(button), button, "hovered");
      await closeTooltip();

      const focusable = button.tabIndex >= 0 && button.getAttribute("disabled") === null;
      if (focusable) {
        await userEvent.keyboard("{Escape}");
        await expectTooltipWhile(
          async () => {
            button.focus();
          },
          button,
          "focused",
        );
        button.blur();
        await expect.poll(shownTooltips).toEqual([]);
      }
    }
  });
}
