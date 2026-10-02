import type { Meta, StoryObj } from "@storybook/react-vite";
import { LogOut } from "lucide-react";
import { within } from "storybook/test";
import {
  playPseudoHoverPaintsBoneFill,
  playTabMatchesCssFocusVisible,
} from "../../test-support/story-interactions";
import { AreaNavButton } from "./area-nav-button";

const theButton = (canvasElement: HTMLElement) =>
  within(canvasElement).getByRole("button", { name: "Salir" });

const meta: Meta<typeof AreaNavButton> = {
  title: "Components/AreaNavButton",
  component: AreaNavButton,
  args: {
    label: "Salir",
    icon: <LogOut />,
    active: false,
    onPress: () => {},
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

type Story = StoryObj<typeof AreaNavButton>;

export const Inactive: Story = {};

export const Active: Story = {
  args: { active: true },
};

export const FocusVisible: Story = {
  play: playTabMatchesCssFocusVisible(theButton),
};

export const LightInactive: Story = {
  args: { rail: "light" },
};

export const LightActive: Story = {
  args: { rail: "light", active: true },
};

export const LightHovered: Story = {
  args: { rail: "light" },
  parameters: { pseudo: { hover: true } },
  play: playPseudoHoverPaintsBoneFill(theButton),
};

export const LightFocusVisible: Story = {
  args: { rail: "light" },
  play: playTabMatchesCssFocusVisible(theButton),
};
