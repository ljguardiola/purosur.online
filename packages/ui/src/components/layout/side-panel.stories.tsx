import type { Meta, StoryObj } from "@storybook/react-vite";
import { Button } from "../forms/button";
import { SidePanel } from "./side-panel";

const meta: Meta<typeof SidePanel> = {
  title: "Components/SidePanel",
  component: SidePanel,
  decorators: [
    (Story) => (
      <div style={{ display: "flex", justifyContent: "flex-end", height: "480px" }}>
        <Story />
      </div>
    ),
  ],
};

export default meta;

type Story = StoryObj<typeof SidePanel>;

const content = (
  <>
    <p className="text-caption font-bold uppercase text-text-eyebrow">Total a cobrar</p>
    <p className="text-display text-text-accent">$ 12.500,00</p>
  </>
);

export const WithoutFooter: Story = {
  args: { children: content },
};

export const WithFooter: Story = {
  args: {
    label: "Panel de cobro",
    children: content,
    footer: (
      <Button variant="secondary" fullWidth>
        Cancelar venta
      </Button>
    ),
  },
};
