import type { Meta, StoryObj } from "@storybook/react-vite";
import { LifeBuoy } from "lucide-react";
import { within } from "storybook/test";
import {
  playPseudoHoverPaintsBoneFill,
  playTabMatchesCssFocusVisible,
} from "../../test-support/story-interactions";
import { AreaNavItem } from "./area-nav-item";

const meta: Meta<typeof AreaNavItem> = {
  title: "Components/AreaNavItem",
  component: AreaNavItem,
  args: {
    label: "Ayuda",
    icon: <LifeBuoy />,
    href: "/help",
  },
  decorators: [
    (Story, { args }) => (
      <div className={args.rail === "light" ? "bg-surface p-2" : "bg-surface-nav p-2"}>
        <Story />
      </div>
    ),
  ],
};

export default meta;

type Story = StoryObj<typeof AreaNavItem>;

export const Inactive: Story = {
  args: { active: false },
};

export const Active: Story = {
  args: { active: true },
};

export const FocusVisible: Story = {
  args: { active: false },
  play: playTabMatchesCssFocusVisible((canvasElement) =>
    within(canvasElement).getByRole("link", { name: "Ayuda" }),
  ),
};

const theLink = (canvasElement: HTMLElement) =>
  within(canvasElement).getByRole("link", { name: "Ayuda" });

export const LightInactive: Story = {
  args: { rail: "light", active: false },
};

export const LightActive: Story = {
  args: { rail: "light", active: true },
};

export const LightHovered: Story = {
  args: { rail: "light", active: false },
  parameters: { pseudo: { hover: true } },
  play: playPseudoHoverPaintsBoneFill(theLink),
};

export const LightFocusVisible: Story = {
  args: { rail: "light", active: false },
  play: playTabMatchesCssFocusVisible(theLink),
};
