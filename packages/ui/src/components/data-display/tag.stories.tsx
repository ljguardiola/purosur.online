import type { Meta, StoryObj } from "@storybook/react-vite";
import { CreditCard, TagIcon } from "lucide-react";
import { Tag } from "./tag";

const meta: Meta<typeof Tag> = {
  title: "Components/Tag",
  component: Tag,
};

export default meta;

type Story = StoryObj<typeof Tag>;

export const Neutral: Story = {
  args: { tone: "neutral", children: "Caja" },
};

export const Info: Story = {
  args: { tone: "info", children: "PIN" },
};

export const WithIcon: Story = {
  args: {
    tone: "info",
    icon: <CreditCard aria-hidden="true" />,
    children: "PIN",
  },
};

export const Status: Story = {
  args: { tone: "neutral", variant: "status", children: "Inactiva" },
};

export const StatusInfo: Story = {
  args: { tone: "info", variant: "status", children: "Nueva" },
};

export const Success: Story = {
  args: {
    tone: "success",
    icon: <TagIcon aria-hidden="true" />,
    children: "10 % de descuento",
  },
};

export const StatusSuccess: Story = {
  args: { tone: "success", variant: "status", children: "Vigente" },
};
