import type { Meta, StoryObj } from "@storybook/react-vite";
import { LifeBuoy } from "lucide-react";
import { expect, userEvent, within } from "storybook/test";
import { AreaNavItem } from "./AreaNavItem";

const meta: Meta<typeof AreaNavItem> = {
  title: "Components/AreaNavItem",
  component: AreaNavItem,
  args: {
    label: "Ayuda",
    icon: <LifeBuoy />,
    href: "/help",
  },
  decorators: [
    (Story) => (
      <div className="bg-brand-blue-strong p-2">
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
  play: async ({ canvasElement }) => {
    await userEvent.tab();
    const link = within(canvasElement).getByRole("link", { name: "Ayuda" });
    await expect(link).toHaveFocus();
  },
};
