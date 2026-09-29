import type { Meta, StoryObj } from "@storybook/react-vite";
import { FieldGroup } from "./field-group";
import { FieldSizeProvider } from "./field-size";

const meta: Meta<typeof FieldGroup> = {
  title: "Components/FieldGroup",
  component: FieldGroup,
  args: {
    label: "Categoría",
    children: <p>Miel</p>,
  },
};

export default meta;

type Story = StoryObj<typeof FieldGroup>;

export const Default: Story = {};

export const Required: Story = {
  args: { required: true },
};

export const MultipleChildren: Story = {
  args: {
    label: "Códigos de barras",
    children: (
      <>
        <p>7791234567890</p>
        <p>7799876543210</p>
      </>
    ),
  },
};

export const Backoffice: Story = {
  decorators: [
    (Story) => (
      <FieldSizeProvider size="backoffice">
        <Story />
      </FieldSizeProvider>
    ),
  ],
};
