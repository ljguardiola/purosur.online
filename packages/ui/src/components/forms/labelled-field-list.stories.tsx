import type { Meta, StoryObj } from "@storybook/react-vite";
import { FieldSizeProvider } from "./field-size";
import { LabelledFieldList } from "./labelled-field-list";
import { TextField } from "./text-field";

function quantityField(label: string, value: string) {
  return (
    <TextField
      kind="quantity"
      suffix="kg"
      label={label}
      labelVisuallyHidden
      value={value}
      onChange={() => {}}
    />
  );
}

const meta: Meta<typeof LabelledFieldList> = {
  title: "Components/LabelledFieldList",
  component: LabelledFieldList,
  args: {
    items: [
      {
        id: "first",
        title: "L-2312",
        detail: "Vence el 14/10/2026 · saldo 4,400 kg",
        field: quantityField("Cantidad contada del lote L-2312", "4,300"),
      },
      {
        id: "second",
        title: "—",
        detail: "Sin vencimiento · saldo 8,000 kg",
        field: quantityField("Cantidad contada del lote sin número", ""),
      },
    ],
  },
  decorators: [
    (Story) => (
      <FieldSizeProvider size="backoffice">
        <div style={{ width: "480px" }}>
          <Story />
        </div>
      </FieldSizeProvider>
    ),
  ],
};

export default meta;

type Story = StoryObj<typeof LabelledFieldList>;

export const Default: Story = {};

export const LongDetail: Story = {
  args: {
    items: [
      {
        id: "first",
        title: "L-2312",
        detail:
          "Vence el 14/10/2026 · saldo 4,400 kg · recibido en la sucursal centro el 02/09/2026",
        field: quantityField("Cantidad contada del lote L-2312", "4,300"),
      },
    ],
  },
};

export const MonospaceTitles: Story = {
  args: { monospaceTitles: true },
};
