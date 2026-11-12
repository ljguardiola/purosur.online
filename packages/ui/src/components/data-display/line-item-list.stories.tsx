import type { Meta, StoryObj } from "@storybook/react-vite";
import { LineItemList } from "./line-item-list";

const meta: Meta<typeof LineItemList> = {
  title: "Components/LineItemList",
  component: LineItemList,
  decorators: [
    (Story) => (
      <div style={{ width: "360px" }}>
        <Story />
      </div>
    ),
  ],
};

export default meta;

type Story = StoryObj<typeof LineItemList>;

export const Default: Story = {
  args: {
    label: "Productos",
    items: [
      { id: "1", name: "Almendras peladas", quantity: "0,325 kg", amount: "$ 6.142,50" },
      { id: "2", name: "Avena arrollada", quantity: "1,000 kg", amount: "$ 3.200,00" },
      { id: "3", name: "Yerba mate orgánica 1 kg", quantity: "2 u", amount: "$ 13.900,00" },
      { id: "4", name: "Pasas de uva", quantity: "0,250 kg", amount: "$ 1.950,00" },
    ],
  },
};
