import type { Meta, StoryObj } from "@storybook/react-vite";
import { PuroSurIsotype } from "./puro-sur-isotype";

const meta: Meta<typeof PuroSurIsotype> = {
  title: "Components/PuroSurIsotype",
  component: PuroSurIsotype,
};

export default meta;

type Story = StoryObj<typeof PuroSurIsotype>;

export const Default: Story = {};

export const Sized: Story = {
  args: { className: "size-16" },
};
