import type { Meta, StoryObj } from "@storybook/react-vite";
import { Button } from "../forms/button";
import { DimmedPanel } from "./dimmed-panel";

const meta: Meta<typeof DimmedPanel> = {
  title: "Components/DimmedPanel",
  component: DimmedPanel,
};

export default meta;

type Story = StoryObj<typeof DimmedPanel>;

export const Default: Story = {
  args: {
    children: (
      <div className="flex w-80 flex-col gap-3">
        <p className="text-display text-text">$ 9.342,50</p>
        <Button size="large" fullWidth keycap="F12">
          Cobrar en efectivo
        </Button>
      </div>
    ),
  },
};
