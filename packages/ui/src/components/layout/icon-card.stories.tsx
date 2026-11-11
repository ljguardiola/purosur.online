import type { Meta, StoryObj } from "@storybook/react-vite";
import { Lock } from "lucide-react";
import { IconCard } from "./icon-card";

const meta: Meta<typeof IconCard> = {
  title: "Components/IconCard",
  component: IconCard,
  decorators: [
    (Story) => (
      <div style={{ display: "flex", flexDirection: "column", height: "480px" }}>
        <Story />
      </div>
    ),
  ],
  args: { icon: <Lock />, label: "Caja sin sesión abierta" },
};

export default meta;

type Story = StoryObj<typeof IconCard>;

export const Default: Story = {};
