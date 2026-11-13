import type { Meta, StoryObj } from "@storybook/react-vite";
import { Eye } from "lucide-react";
import { ModePill } from "./mode-pill";

const meta: Meta<typeof ModePill> = {
  title: "Components/ModePill",
  component: ModePill,
  args: { icon: <Eye />, label: "Consulta", onExit: () => {} },
};

export default meta;

type Story = StoryObj<typeof ModePill>;

export const Default: Story = {};

export const Hovered: Story = { parameters: { pseudo: { hover: true } } };

export const Focused: Story = { parameters: { pseudo: { focusVisible: true } } };
