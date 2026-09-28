import { expect, test } from "vitest";
import type { AccessibilityRunOptions } from "./test/axe";
import { expectNoAccessibilityViolations } from "./test/axe";
import { catalogStories, renderCatalogStory } from "./test-support/catalog-runner";

// axe's "region" rule expects every part of the page inside a landmark, which an isolated story
// never provides; a story can turn it back on through its own a11y parameter.
function a11yOptions(storyOptions: AccessibilityRunOptions | undefined): AccessibilityRunOptions {
  return {
    ...storyOptions,
    rules: { region: { enabled: false }, ...storyOptions?.rules },
  };
}

test("discovers at least one catalog story to run", () => {
  expect(catalogStories.length).toBeGreaterThan(0);
});

for (const { title, story: Story } of catalogStories) {
  test(`${title} / ${Story.storyName}`, async () => {
    await renderCatalogStory(Story);

    // react-aria-components portals overlay content (Modal, Tooltip, Select's popover, ...)
    // outside this render's own container, so the whole document is checked instead.
    await expectNoAccessibilityViolations(
      document.body,
      a11yOptions(Story.parameters.a11y?.options),
    );
  });
}
