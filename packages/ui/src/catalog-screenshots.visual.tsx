import { expect, test } from "vitest";
import { page } from "vitest/browser";
import { catalogStories, renderCatalogStory } from "./test-support/catalog-runner";

// react-aria-components portals overlay content (Modal, Tooltip, Select's popover, ...) outside
// the rendered story's own container, so the whole body is captured instead of just that
// container.
for (const { title, story: Story } of catalogStories) {
  test(`${title} / ${Story.storyName}`, async () => {
    await renderCatalogStory(Story);

    await expect(page.elementLocator(document.body)).toMatchScreenshot(Story.id, {
      screenshotOptions: { animations: "disabled", caret: "hide" },
    });
  });
}
