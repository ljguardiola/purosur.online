import type { Meta, StoryObj } from "@storybook/react-vite";
import { LinkListRow } from "./link-list-card";

const meta: Meta<typeof LinkListRow> = {
  title: "Components/LinkListRow",
  component: LinkListRow,
  decorators: [
    (Story) => (
      <ul style={{ width: "480px" }}>
        <Story />
      </ul>
    ),
  ],
};

export default meta;

type Story = StoryObj<typeof LinkListRow>;

export const Default: Story = {
  args: { label: "Ventas por día o por rango", href: "/reports/sales-by-day" },
};
