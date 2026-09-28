import { expect, test } from "vitest";
import * as UI from "./index";

interface StoryMeta {
  component?: unknown;
}

const storyModules = import.meta.glob<{ default: StoryMeta }>("./**/*.stories.tsx", {
  eager: true,
});

function exportedComponentNames(): string[] {
  return Object.keys(UI).filter((name) => /^[A-Z]/.test(name));
}

function componentsWithAStory(): Set<unknown> {
  return new Set(Object.values(storyModules).map((module) => module.default.component));
}

test("gives every design-system component its own Storybook story", () => {
  const storiedComponents = componentsWithAStory();
  const missing = exportedComponentNames().filter(
    (name) => !storiedComponents.has((UI as Record<string, unknown>)[name]),
  );

  expect(missing).toEqual([]);
});
