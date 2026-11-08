import type { Meta, StoryObj } from "@storybook/react-vite";
import { ClipboardCheck, PackageX } from "lucide-react";
import { within } from "storybook/test";
import { playClickExpandsTrigger } from "../../test-support/story-interactions";
import { MenuButton } from "./menu-button";

const trigger = (canvasElement: HTMLElement) =>
  within(canvasElement).getByRole("button", { name: "Registrar" });

const meta: Meta<typeof MenuButton> = {
  title: "Components/MenuButton",
  component: MenuButton,
  args: {
    label: "Registrar",
    actions: [
      { label: "Recuento", icon: <ClipboardCheck />, onAction: () => {} },
      { label: "Pérdida", icon: <PackageX />, onAction: () => {} },
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

type Story = StoryObj<typeof MenuButton>;

export const Closed: Story = {};

export const Open: Story = {
  play: playClickExpandsTrigger(trigger),
};
