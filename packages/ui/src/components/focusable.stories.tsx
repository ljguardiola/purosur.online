import type { Meta, StoryObj } from "@storybook/react-vite";
import { Focusable } from "react-aria-components";
import { expect, userEvent, within } from "storybook/test";
import { Tag } from "./Tag";
import { Tooltip } from "./Tooltip";

const meta: Meta<typeof Focusable> = {
  title: "Components/Focusable",
  component: Focusable,
};

export default meta;

type Story = StoryObj<typeof Focusable>;

// Tag is a plain <span>: on its own it can neither be tabbed to nor trigger a Tooltip. Wrapping it
// in Focusable is what makes a non-button element into a working keyboard-reachable trigger.
export const TooltipOnANonButtonTrigger: Story = {
  render: () => (
    <Tooltip description="Se usa en la caja.">
      <Focusable>
        <Tag tone="neutral" role="img" aria-label="Caja">
          Caja
        </Tag>
      </Focusable>
    </Tooltip>
  ),
};

export const ReachedByKeyboardOpensItsTooltip: Story = {
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
    const trigger = within(canvasElement).getByRole("img", { name: "Caja" });

    await userEvent.tab();

    await expect(trigger).toHaveFocus();
    await expect(within(document.body).getByRole("tooltip")).toHaveTextContent(
      "Se usa en la caja.",
    );
  },
};
