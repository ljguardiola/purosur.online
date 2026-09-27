import { expect, test } from "vitest";
import * as UI from "./index";

const componentsWithoutStoriesYet = ["Modal", "Pagination", "Table", "TableCellText", "Tooltip"];

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

test("tracks every design-system component still missing a Storybook story", () => {
  const storiedComponents = componentsWithAStory();
  const stillMissing = exportedComponentNames().filter(
    (name) => !storiedComponents.has((UI as Record<string, unknown>)[name]),
  );

  expect(stillMissing.sort()).toEqual([...componentsWithoutStoriesYet].sort());
});
