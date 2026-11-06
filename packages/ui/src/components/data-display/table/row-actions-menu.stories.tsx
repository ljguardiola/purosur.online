import type { Meta, StoryObj } from "@storybook/react-vite";
import { Copy, Pencil, Trash2 } from "lucide-react";
import { within } from "storybook/test";
import {
  playClickExpandsTrigger,
  playHoverShowsNameTooltip,
  playTabShowsNameTooltip,
} from "../../../test-support/story-interactions";
import { RowActionsMenu } from "./row-actions-menu";

const trigger = (canvasElement: HTMLElement) =>
  within(canvasElement).getByRole("button", { name: "Más acciones" });

const meta: Meta<typeof RowActionsMenu> = {
  title: "Components/RowActionsMenu",
  component: RowActionsMenu,
  args: {
    actions: [
      { label: "Editar", icon: <Pencil />, onAction: () => {} },
      { label: "Duplicar", icon: <Copy />, onAction: () => {} },
    ],
  },
  decorators: [
    (Story) => (
      <div className="flex h-64 w-72 justify-end bg-surface p-4">
        <Story />
      </div>
    ),
  ],
};

export default meta;

type Story = StoryObj<typeof RowActionsMenu>;

export const Closed: Story = {};

export const Hovered: Story = {
  play: playHoverShowsNameTooltip(trigger, "Más acciones"),
};

export const FocusVisible: Story = {
  play: playTabShowsNameTooltip(trigger, "Más acciones"),
};

export const Open: Story = {
  play: playClickExpandsTrigger(trigger),
};

export const OpenWithDisabledAction: Story = {
  args: {
    actions: [
      { label: "Editar", icon: <Pencil />, onAction: () => {} },
      {
        label: "Duplicar",
        icon: <Copy />,
        onAction: () => {},
        disabledReason: "El producto ya tiene una copia pendiente",
      },
    ],
  },
  play: playClickExpandsTrigger(trigger),
};

export const OpenWithDestructiveAction: Story = {
  args: {
    actions: [
      { label: "Editar", icon: <Pencil />, onAction: () => {} },
      { label: "Eliminar", icon: <Trash2 />, onAction: () => {}, destructive: true },
    ],
  },
  play: playClickExpandsTrigger(trigger),
};
