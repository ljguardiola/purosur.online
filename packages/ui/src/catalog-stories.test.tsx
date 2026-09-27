import { expect, test } from "vitest";
import type { AccessibilityRunOptions } from "./test/axe";
import { expectNoAccessibilityViolations } from "./test/axe";
import { catalogStories, renderCatalogStory } from "./test-support/catalog-runner";

// axe's "region" best practice expects every part of the page to sit inside a landmark; a story
// renders one isolated component, never a whole page, so it fails that check on content a real
// page would never flag. A story can still turn it back on through its own a11y parameter.
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
