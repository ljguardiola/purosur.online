import type { Meta, StoryObj } from "@storybook/react-vite";
import { Eye } from "lucide-react";
import { within } from "storybook/test";
import { playTabReachesFocusVisible } from "../../test-support/story-interactions";
import { ModePill } from "./mode-pill";

const meta: Meta<typeof ModePill> = {
  title: "Components/ModePill",
  component: ModePill,
  args: { icon: <Eye />, label: "Consulta", onExit: () => {} },
};

export default meta;

type Story = StoryObj<typeof ModePill>;

export const Default: Story = {};

export const FocusVisible: Story = {
  play: playTabReachesFocusVisible((canvasElement) => within(canvasElement).getByRole("button")),
};
