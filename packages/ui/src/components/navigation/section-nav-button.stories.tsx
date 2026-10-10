import type { Meta, StoryObj } from "@storybook/react-vite";
import { Flag } from "lucide-react";
import { within } from "storybook/test";
import {
  playPseudoHoverPaintsBoneFill,
  playTabMatchesCssFocusVisible,
} from "../../test-support/story-interactions";
import { SectionNavButton } from "./section-nav-button";

function button(canvasElement: HTMLElement): HTMLElement {
  return within(canvasElement).getByRole("button");
}

const meta: Meta<typeof SectionNavButton> = {
  title: "Components/SectionNavButton",
  component: SectionNavButton,
  args: {
    label: "Primeros pasos",
    icon: <Flag />,
    onPress: () => {},
  },
};

export default meta;

type Story = StoryObj<typeof SectionNavButton>;

export const Inactive: Story = {
  args: { active: false },
};

export const Active: Story = {
  args: { active: true },
};

export const Hovered: Story = {
  args: { active: false },
  parameters: { pseudo: { hover: true } },
  play: playPseudoHoverPaintsBoneFill(button),
};

export const FocusVisible: Story = {
  args: { active: false },
  play: playTabMatchesCssFocusVisible(button),
};
