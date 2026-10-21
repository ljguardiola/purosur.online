import type { Meta, StoryObj } from "@storybook/react-vite";
import { SummaryRowGroup } from "./summary-row-group";
import { Tag } from "./tag";

const meta: Meta<typeof SummaryRowGroup> = {
  title: "Components/SummaryRowGroup",
  component: SummaryRowGroup,
};

export default meta;

type Story = StoryObj<typeof SummaryRowGroup>;

export const Default: Story = {
  args: {
    rows: [
      { label: "Artículos", value: "3" },
      { label: "Subtotal", value: "$120.000" },
      { label: "Total", value: "$120.000", strong: true },
    ],
  },
};

export const WithTagValue: Story = {
  args: {
    rows: [
      { label: "Total", value: "$120.000" },
      { label: "Modo fiscal", value: <Tag tone="warning">Contingencia con CAEA</Tag> },
    ],
  },
};

export const WithSaving: Story = {
  args: {
    rows: [
      { label: "Subtotal", value: "$130.000" },
      { label: "Descuento", value: "-$10.000", saving: true },
      { label: "Total", value: "$120.000", strong: true },
    ],
  },
};

export const WithTones: Story = {
  args: {
    rows: [
      { label: "Precio de lista", value: "$ 2.380,00" },
      { label: "Descuento", value: "− $ 476,00", tone: "error" },
      { label: "Queda la línea en", value: "$ 4.284,00", strong: true, tone: "info" },
    ],
  },
};

export const DetailWithTones: Story = {
  args: {
    rows: [
      { label: "Precio de lista", value: "$ 8.400,00", detail: true },
      { label: "Descuento", value: "− $ 840,00", detail: true, tone: "error" },
      { label: "Queda la línea en", value: "$ 7.560,00", detail: true, tone: "info" },
    ],
  },
};

export const Filled: Story = {
  decorators: [
    (Story) => (
      <div className="bg-surface p-6">
        <Story />
      </div>
    ),
  ],
  args: {
    variant: "filled",
    rows: [
      { label: "Precio de lista", value: "$ 8.400,00", detail: true },
      { label: "Descuento", value: "− $ 840,00", detail: true, tone: "error" },
      { label: "Queda la línea en", value: "$ 7.560,00", detail: true, tone: "info" },
    ],
  },
};

export const Plain: Story = {
  args: {
    variant: "plain",
    rows: [
      { label: "Saldo esperado", value: "12 u", detail: true },
      { label: "Diferencia", value: "− 2 u", detail: true, tone: "error" },
    ],
  },
};

export const FilledHorizontal: Story = {
  decorators: [
    (Story) => (
      <div className="bg-surface p-6">
        <Story />
      </div>
    ),
  ],
  args: {
    variant: "filled",
    orientation: "horizontal",
    rows: [
      { label: "Total contado", value: "10 u" },
      { label: "Saldo esperado", value: "12 u", subtle: true },
      { label: "Diferencia", value: "− 2 u", tone: "error" },
    ],
  },
};

export const SingleRow: Story = {
  args: {
    rows: [{ label: "Total", value: "$120.000", strong: true }],
  },
};
