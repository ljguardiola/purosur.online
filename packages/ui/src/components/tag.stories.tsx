import type { Meta, StoryObj } from "@storybook/react-vite";
import { CreditCard } from "lucide-react";
import { Focusable } from "react-aria-components";
import { expect, userEvent, within } from "storybook/test";
import { Tag } from "./Tag";
import { Tooltip } from "./Tooltip";

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

export const TooltipTrigger: Story = {
  render: () => (
    <Tooltip description="Se usa en la caja.">
      <Focusable>
        <Tag tone="neutral" role="img" aria-label="Caja">
          Caja
        </Tag>
      </Focusable>
    </Tooltip>
  ),
  play: async ({ canvasElement }) => {
    await userEvent.tab();
    const tag = within(canvasElement).getByRole("img", { name: "Caja" });
    await expect(tag).toHaveFocus();
    await expect(within(document.body).getByRole("tooltip")).toBeInTheDocument();
  },
};
