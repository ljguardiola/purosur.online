import type { Meta, StoryObj } from "@storybook/react-vite";
import { CollapsibleSegmentedControl } from "./collapsible-segmented-control";
import type { Option } from "./option";

type SalesView = "byDay" | "byPaymentMethod" | "byCashier" | "averageTicket";

const options: [Option<SalesView>, ...Option<SalesView>[]] = [
  { value: "byDay", label: "Por día" },
  { value: "byPaymentMethod", label: "Por medio de pago" },
  { value: "byCashier", label: "Por cajero" },
  { value: "averageTicket", label: "Ticket promedio" },
];

const meta: Meta<typeof CollapsibleSegmentedControl<SalesView>> = {
  title: "Components/CollapsibleSegmentedControl",
  component: CollapsibleSegmentedControl<SalesView>,
  args: {
    name: "report",
    label: "Reporte",
    options,
    value: "byDay",
    onChange: () => {},
  },
};

export default meta;

type Story = StoryObj<typeof CollapsibleSegmentedControl<SalesView>>;

export const Fits: Story = {};

export const Collapsed: Story = {
  decorators: [
    (Story) => (
      <div style={{ width: "320px" }}>
        <Story />
      </div>
    ),
  ],
};
