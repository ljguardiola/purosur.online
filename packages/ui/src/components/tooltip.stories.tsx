import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, userEvent, waitFor, within } from "storybook/test";
import { Button } from "./Button";
import { Tooltip } from "./Tooltip";

const meta: Meta<typeof Tooltip> = {
  title: "Components/Tooltip",
  component: Tooltip,
  args: {
    description: "Anulado en caja por la encargada de turno.",
    children: <Button>Ver motivo</Button>,
  },
};

export default meta;

type Story = StoryObj<typeof Tooltip>;

export const Hidden: Story = {};

export const Shown: Story = {
  play: async ({ canvasElement }) => {
    const trigger = within(canvasElement).getByRole("button", { name: "Ver motivo" });
    await userEvent.hover(trigger);
    await waitFor(() => {
      expect(within(document.body).getByRole("tooltip")).toBeInTheDocument();
    });
  },
};

export const ShownOnFocus: Story = {
  play: async ({ canvasElement }) => {
    await userEvent.tab();
    const trigger = within(canvasElement).getByRole("button", { name: "Ver motivo" });
    await expect(trigger).toHaveFocus();
    await waitFor(() => {
      expect(within(document.body).getByRole("tooltip")).toBeInTheDocument();
    });
  },
};

export const LongDescription: Story = {
  args: {
    description:
      "El plazo de devolución para este producto venció a los catorce días de la compra y la " +
      "política de la tienda no permite que la encargada de turno lo extienda bajo ninguna " +
      "circunstancia.",
  },
  play: async ({ canvasElement }) => {
    const trigger = within(canvasElement).getByRole("button", { name: "Ver motivo" });
    await userEvent.hover(trigger);
    await waitFor(() => {
      expect(within(document.body).getByRole("tooltip")).toBeInTheDocument();
    });
  },
};
