import { composeStories, setProjectAnnotations } from "@storybook/react-vite";
import type { ReactElement } from "react";
import { STORY_RENDERED } from "storybook/internal/core-events";
import { addons, mockChannel } from "storybook/preview-api";
import { render } from "vitest-browser-react";
import * as preview from "../../.storybook/preview";
import type { AccessibilityRunOptions } from "../test/axe";

// storybook-addon-pseudo-states drives its stylesheet rewriting off Storybook's own preview
// channel, captured once when its module first runs; installing a real (if inert) channel before
// that first import, rather than after, is what lets the channel event renderCatalogStory emits
// below reach it, instead of a throwaway channel of its own that nothing else ever sees.
addons.setChannel(mockChannel());
const pseudoStates = await import("storybook-addon-pseudo-states/preview");

// The addon looks for Storybook's own "#storybook-root"/"#root" by default, which only exists
// when a story runs inside Storybook itself; every runner built on this module mounts stories
// directly into document.body instead, so every story's pseudo-state root is pointed there.
const runnerAnnotations = { parameters: { pseudo: { rootSelector: "body" } } };

setProjectAnnotations([preview, pseudoStates, runnerAnnotations]);

interface StoryModule {
  default: { title?: string };
  [exportName: string]: unknown;
}

export interface CatalogStory {
  (): ReactElement;
  id: string;
  storyName: string;
  play?: (context: { canvasElement: HTMLElement }) => Promise<void> | void;
  parameters: { a11y?: { options?: AccessibilityRunOptions } };
}

export interface CatalogStoryEntry {
  title: string;
  story: CatalogStory;
}

const storyModules = import.meta.glob<StoryModule>("../**/*.stories.tsx", { eager: true });

export const catalogStories: CatalogStoryEntry[] = Object.values(storyModules).flatMap((module) => {
  const title = module.default.title ?? "Untitled";
  const composed = composeStories(module) as unknown as Record<string, CatalogStory>;
  return Object.values(composed).map((story) => ({ title, story }));
});

export async function renderCatalogStory(Story: CatalogStory): Promise<HTMLElement> {
  const screen = await render(<Story />);
  // Storybook-driven decorator effects, like the pseudo-states addon's own stylesheet rewrite,
  // only run once this event reaches them; nothing here emits it automatically outside Storybook.
  addons.getChannel().emit(STORY_RENDERED, Story.id);

  await Story.play?.({ canvasElement: screen.container });

  return screen.container;
}
