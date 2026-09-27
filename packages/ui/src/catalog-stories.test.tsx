import { composeStories, setProjectAnnotations } from "@storybook/react-vite";
import type { ReactElement } from "react";
import { STORY_RENDERED } from "storybook/internal/core-events";
import { addons, mockChannel } from "storybook/preview-api";
import { expect, test } from "vitest";
import { render } from "vitest-browser-react";
import * as preview from "../.storybook/preview";
import type { AccessibilityRunOptions } from "./test/axe";
import { expectNoAccessibilityViolations } from "./test/axe";

// storybook-addon-pseudo-states drives its stylesheet rewriting off Storybook's own preview
// channel, captured once when its module first runs; installing a real (if inert) channel before
// that first import, rather than after, is what lets the channel event this file emits below reach
// it, instead of a throwaway channel of its own that nothing else ever sees.
addons.setChannel(mockChannel());
const pseudoStates = await import("storybook-addon-pseudo-states/preview");

// The addon looks for Storybook's own "#storybook-root"/"#root" by default, which only exists
// when a story runs inside Storybook itself; this runner mounts stories directly into
// document.body instead, so every story's pseudo-state root is pointed there.
const runnerAnnotations = { parameters: { pseudo: { rootSelector: "body" } } };

setProjectAnnotations([preview, pseudoStates, runnerAnnotations]);

interface StoryModule {
  default: { title?: string };
  [exportName: string]: unknown;
}

interface CatalogStory {
  (): ReactElement;
  id: string;
  storyName: string;
  play?: (context: { canvasElement: HTMLElement }) => Promise<void> | void;
  parameters: { a11y?: { options?: AccessibilityRunOptions } };
}

const storyModules = import.meta.glob<StoryModule>("./**/*.stories.tsx", { eager: true });

const catalogStories = Object.values(storyModules).flatMap((module) => {
  const title = module.default.title ?? "Untitled";
  const composed = composeStories(module) as unknown as Record<string, CatalogStory>;
  return Object.values(composed).map((story) => ({ title, story }));
});

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
    const screen = await render(<Story />);
    // Storybook-driven decorator effects, like the pseudo-states addon's own stylesheet rewrite,
    // only run once this event reaches them; nothing here emits it automatically outside Storybook.
    addons.getChannel().emit(STORY_RENDERED, Story.id);

    await Story.play?.({ canvasElement: screen.container });

    // react-aria-components portals overlay content (Modal, Tooltip, Select's popover, ...)
    // outside this render's own container, so the whole document is checked instead.
    await expectNoAccessibilityViolations(
      document.body,
      a11yOptions(Story.parameters.a11y?.options),
    );
  });
}
