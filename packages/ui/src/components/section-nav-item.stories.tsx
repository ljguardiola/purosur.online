import type { Meta, StoryObj } from "@storybook/react-vite";
import { Flag } from "lucide-react";
import { expect, userEvent, within } from "storybook/test";
import { playPseudoHoverPaintsBoneFill } from "../test-support/story-interactions";
import { SectionNavItem } from "./SectionNavItem";

function link(canvasElement: HTMLElement): HTMLElement {
  return within(canvasElement).getByRole("link");
}

const meta: Meta<typeof SectionNavItem> = {
  title: "Components/SectionNavItem",
  component: SectionNavItem,
  args: {
    label: "Primeros pasos",
    icon: <Flag />,
    href: "/help/getting_started",
  },
};

export default meta;

type Story = StoryObj<typeof SectionNavItem>;

export const Inactive: Story = {
  args: { active: false },
};

export const Active: Story = {
  args: { active: true },
};

export const Hovered: Story = {
  args: { active: false },
  parameters: { pseudo: { hover: true } },
  play: playPseudoHoverPaintsBoneFill(link),
};

export const FocusVisible: Story = {
  args: { active: false },
  play: async ({ canvasElement }) => {
    await userEvent.tab();
    await expect(link(canvasElement)).toHaveFocus();
  },
};
