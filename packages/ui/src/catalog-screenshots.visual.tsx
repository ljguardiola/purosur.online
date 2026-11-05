import { composeStory } from "@storybook/react-vite";
import { expect, test } from "vitest";
import { commands, page, server } from "vitest/browser";
import { cleanup } from "vitest-browser-react";
import {
  type CatalogStory,
  catalogStories,
  renderCatalogStory,
} from "./test-support/catalog-runner";

const SCREENSHOT_OPTIONS = { animations: "disabled", caret: "hide" } as const;

// react-aria-components portals overlay content (Modal, Tooltip, Select's popover, ...) outside
// the story's own container, so the whole body is captured instead.
for (const { title, story: Story } of catalogStories) {
  test(`${title} / ${Story.storyName}`, async () => {
    await renderCatalogStory(Story);

    await expect(page.elementLocator(document.body)).toMatchScreenshot(Story.id, {
      screenshotOptions: SCREENSHOT_OPTIONS,
    });
  });
}

function softPillStory(name: string, heightClass: string): CatalogStory {
  return composeStory(
    { name, render: () => <div className={`${heightClass} w-36 rounded-full bg-surface-soft`} /> },
    { title: "Harness" },
  );
}

const softPillAt40px = softPillStory("Soft pill at 40px", "h-10");
const softPillAt28px = softPillStory("Soft pill at 28px", "h-7");

test("a story whose low-contrast shape changed size no longer matches its approved screenshot", async () => {
  const name = "harness-soft-pill";
  await renderCatalogStory(softPillAt40px);
  const approved = await page.screenshot({
    element: document.body,
    path: `__screenshots__/catalog-screenshots.visual.tsx/${name}-chromium.png`,
    base64: true,
    ...SCREENSHOT_OPTIONS,
  });

  try {
    await cleanup();
    await renderCatalogStory(softPillAt28px);
    const matching = expect(page.elementLocator(document.body)).toMatchScreenshot(name, {
      screenshotOptions: SCREENSHOT_OPTIONS,
    });

    if (server.config.snapshotOptions.updateSnapshot === "all") {
      await matching;
      expect(await commands.readFile(approved.path, "base64")).not.toBe(approved.base64);
    } else {
      await expect(matching).rejects.toThrow("Screenshot does not match the stored reference.");
    }
  } finally {
    await commands.removeFile(approved.path);
  }
});
