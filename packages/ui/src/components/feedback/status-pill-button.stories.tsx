import type { Meta, StoryObj } from "@storybook/react-vite";
import {
  playHoverSetsDataHovered,
  playTabReachesFocusVisible,
} from "../../test-support/story-interactions";
import { StatusPillButton } from "./status-pill-button";

const thePill = (canvasElement: HTMLElement) =>
  canvasElement.querySelector("button") as HTMLElement;

const meta: Meta<typeof StatusPillButton> = {
  title: "Components/StatusPillButton",
  component: StatusPillButton,
  args: {
    tone: "warning",
    children: "4 avisos",
  },
};

export default meta;

type Story = StoryObj<typeof StatusPillButton>;

export const Warning: Story = {};

export const ErrorTone: Story = {
  args: { tone: "error", children: "1 aviso" },
};

export const Neutral: Story = {
  args: { tone: "neutral", children: "1 aviso" },
};

export const Hovered: Story = {
  play: playHoverSetsDataHovered(thePill),
};

export const FocusVisible: Story = {
  play: playTabReachesFocusVisible(thePill),
};
