import type { Meta, StoryObj } from "@storybook/react-vite";
import { Bell, TriangleAlert } from "lucide-react";
import { Pill } from "./pill";

const meta: Meta<typeof Pill> = {
  title: "Components/Pill",
  component: Pill,
  args: {
    tone: "warning",
    icon: <Bell />,
    children: "3 alertas abiertas",
  },
};

export default meta;

type Story = StoryObj<typeof Pill>;

export const Warning: Story = {};

export const ErrorTone: Story = {
  args: { tone: "error", icon: <TriangleAlert />, children: "Sin conexión" },
};
