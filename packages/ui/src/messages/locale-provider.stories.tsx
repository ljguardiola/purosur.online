import type { Meta, StoryObj } from "@storybook/react-vite";
import { ComboBox } from "../components/forms/combo-box";
import { LocaleProvider } from "./locale-provider";

const meta: Meta<typeof LocaleProvider> = {
  title: "Components/LocaleProvider",
  component: LocaleProvider,
};

export default meta;

type Story = StoryObj<typeof LocaleProvider>;

export const AroundAComboBox: Story = {
  render: () => (
    <LocaleProvider>
      <ComboBox
        label="Producto"
        options={[{ value: "miel", label: "Miel de abeja" }]}
        value={null}
        onChange={() => {}}
      />
    </LocaleProvider>
  ),
};
