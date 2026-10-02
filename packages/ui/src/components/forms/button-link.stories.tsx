import type { Meta, StoryObj } from "@storybook/react-vite";
import { ArrowLeft } from "lucide-react";
import { within } from "storybook/test";
import {
  playPseudoHoverPaintsBoneFill,
  playTabMatchesCssFocusVisible,
} from "../../test-support/story-interactions";
import { ButtonLink } from "./button-link";

const theLink = (canvasElement: HTMLElement) => within(canvasElement).getByRole("link");

const meta: Meta<typeof ButtonLink> = {
  title: "Components/ButtonLink",
  component: ButtonLink,
  args: {
    variant: "text",
    href: "/sign-in",
    children: "Volver",
  },
};

export default meta;

type Story = StoryObj<typeof ButtonLink>;

export const Text: Story = {};

export const TextWithIcon: Story = {
  args: { icon: <ArrowLeft /> },
};

export const TextLarge: Story = {
  args: { size: "large", icon: <ArrowLeft /> },
};

export const TextHovered: Story = {
  args: { icon: <ArrowLeft /> },
  parameters: { pseudo: { hover: true } },
  play: playPseudoHoverPaintsBoneFill(theLink),
};

export const TextFocusVisible: Story = {
  args: { icon: <ArrowLeft /> },
  play: playTabMatchesCssFocusVisible(theLink),
};
