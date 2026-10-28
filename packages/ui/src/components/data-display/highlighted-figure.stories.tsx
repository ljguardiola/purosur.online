import type { Meta, StoryObj } from "@storybook/react-vite";
import { HighlightedFigure } from "./highlighted-figure";

const meta: Meta<typeof HighlightedFigure> = {
  title: "Components/HighlightedFigure",
  component: HighlightedFigure,
  args: { label: "Margen con este precio", value: "45,6 %" },
  decorators: [
    (Story) => (
      <div style={{ width: "480px" }}>
        <Story />
      </div>
    ),
  ],
};

export default meta;

type Story = StoryObj<typeof HighlightedFigure>;

export const Default: Story = {};

export const WithDetail: Story = {
  args: { detail: "$ 8.200,00 − $ 4.460,00 sobre el precio" },
};

export const Loading: Story = {
  args: { loading: true, value: undefined },
};

export const Narrow: Story = {
  args: { detail: "$ 8.200,00 − $ 4.460,00 sobre el precio" },
  decorators: [
    (Story) => (
      <div style={{ width: "240px" }}>
        <Story />
      </div>
    ),
  ],
};
