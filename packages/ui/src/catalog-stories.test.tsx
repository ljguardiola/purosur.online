import { composeStories, setProjectAnnotations } from "@storybook/react-vite";
import type { ReactElement } from "react";
import { expect, test } from "vitest";
import { render } from "vitest-browser-react";
import * as preview from "../.storybook/preview";
import type { AccessibilityRunOptions } from "./test/axe";
import { expectNoAccessibilityViolations } from "./test/axe";

setProjectAnnotations(preview);

interface StoryModule {
  default: { title?: string };
  [exportName: string]: unknown;
}

// A minimal, locally-owned view of what composeStories actually returns per story: callable as a
// component, plus what this runner needs to drive and check it. Bridging into it with one cast
// keeps the loop below free of the library's own deep generics.
interface CatalogStory {
  (): ReactElement;
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

test("discovers at least one catalog story to run", () => {
  expect(catalogStories.length).toBeGreaterThan(0);
});

for (const { title, story: Story } of catalogStories) {
  test(`${title} / ${Story.storyName}`, async () => {
    const screen = await render(<Story />);

    await Story.play?.({ canvasElement: screen.container });

    await expectNoAccessibilityViolations(screen.container, Story.parameters.a11y?.options);
  });
}
