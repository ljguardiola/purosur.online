import type { Meta, StoryObj } from "@storybook/react-vite";
import { ShoppingBag } from "lucide-react";
import { LinkListCard, LinkListRow } from "./link-list-card";

const meta: Meta<typeof LinkListCard> = {
  title: "Components/LinkListCard",
  component: LinkListCard,
  decorators: [
    (Story) => (
      <div style={{ width: "480px" }}>
        <Story />
      </div>
    ),
  ],
};

export default meta;

type Story = StoryObj<typeof LinkListCard>;

export const WithTwoLinks: Story = {
  args: {
    title: "Ventas",
    icon: <ShoppingBag />,
    children: (
      <>
        <LinkListRow label="Ventas por día o por rango" href="/reports/sales-by-day" />
        <LinkListRow label="Ventas por medio de pago" href="/reports/sales-by-payment-method" />
      </>
    ),
  },
};

export const WithOneLink: Story = {
  args: {
    title: "Ventas",
    icon: <ShoppingBag />,
    children: <LinkListRow label="Ventas por día o por rango" href="/reports/sales-by-day" />,
  },
};
