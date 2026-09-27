import { expect, test } from "vitest";
import * as UI from "./index";

// T2 fills a story for each of these; the list shrinks as each one gets one and disappears once
// none are left, so adding a story without removing its name here fails just as loudly as adding
// a new component with no story at all.
const componentsPendingStoriesForT2 = [
  "AreaNavItem",
  "Checkbox",
  "ColumnChart",
  "DateField",
  "FieldGroup",
  "FieldSizeProvider",
  "Focusable",
  "HighlightedNotice",
  "IconButton",
  "InlineNotice",
  "ListFilter",
  "Modal",
  "NotificationCard",
  "OptionCardGroup",
  "Pagination",
  "ProportionBar",
  "PuroSurIsotype",
  "PuroSurLogo",
  "QuantityUnitField",
  "RadioGroup",
  "SearchField",
  "SectionNavItem",
  "SegmentedControl",
  "Select",
  "StatusIndicator",
  "SummaryRow",
  "SummaryRowGroup",
  "Table",
  "TableCellText",
  "Tag",
  "TextField",
  "Toggle",
  "Tooltip",
];

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

  expect(stillMissing.sort()).toEqual([...componentsPendingStoriesForT2].sort());
});
