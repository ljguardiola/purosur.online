import type { Decorator, Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { MethodRefundTable, type MethodRefundTableProps } from "./method-refund-table";

const rows: MethodRefundTableProps["rows"] = [
  { id: "cash", method: "Efectivo", when: "En el acto", amount: "3.510,00" },
  { id: "debit", method: "Point débito", when: "Reembolso pendiente", amount: "5.000,00" },
];

const meta: Meta<typeof MethodRefundTable> = {
  title: "Components/MethodRefundTable",
  component: MethodRefundTable,
  args: {
    "aria-label": "Reintegro por medio de pago",
    headers: { method: "Medio", when: "Cuándo", amount: "Reintegro" },
    amountPrefix: "$",
    rows,
    selectedIndex: 0,
    onSelect: () => {},
    onAmountChange: () => {},
    legend: [
      { keyName: "ArrowUpDown", label: "Medio" },
      { keyName: "Enter", label: "Finalizar" },
    ],
  },
};

export default meta;

type Story = StoryObj<typeof MethodRefundTable>;

const inTallCard: Decorator = (Story) => (
  <div className="h-96 w-208">
    <Story />
  </div>
);

export const FirstSelected: Story = {
  decorators: [inTallCard],
};

export const SecondSelected: Story = {
  decorators: [inTallCard],
  args: { selectedIndex: 1 },
};

function TypingTable(props: MethodRefundTableProps) {
  const [selectedIndex, setSelectedIndex] = useState(props.selectedIndex);
  const [rows, setRows] = useState(props.rows);
  return (
    <MethodRefundTable
      {...props}
      selectedIndex={selectedIndex}
      onSelect={setSelectedIndex}
      rows={rows}
      onAmountChange={(id, amount) =>
        setRows((current) => current.map((row) => (row.id === id ? { ...row, amount } : row)))
      }
    />
  );
}

export const Editable: Story = {
  decorators: [inTallCard],
  render: (args) => <TypingTable {...args} />,
};
