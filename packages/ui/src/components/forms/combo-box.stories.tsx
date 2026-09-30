import type { Meta, StoryObj } from "@storybook/react-vite";
import { useId } from "react";
import { expect, userEvent, within } from "storybook/test";
import {
  playClickExpandsTrigger,
  playHoverListboxOption,
  playHoverSetsDataHovered,
} from "../../test-support/story-interactions";
import { ComboBox, type ComboBoxOption } from "./combo-box";
import { fieldErrorClassName } from "./field-styles";

type ProductId = "yerba" | "yerba-mini" | "cafe" | "miel";

type Options = [ComboBoxOption<ProductId>, ...ComboBoxOption<ProductId>[]];

const options: Options = [
  { value: "yerba", label: "Yerba mate" },
  { value: "yerba-mini", label: "Yerba mate compuesta" },
  { value: "cafe", label: "Café molido" },
  { value: "miel", label: "Miel de abeja" },
];

const optionsWithDescriptions: Options = [
  {
    value: "yerba",
    label: "Yerba mate",
    description: "Playadito · 1 kg",
    searchKeywords: ["7790001000101"],
  },
  {
    value: "yerba-mini",
    label: "Yerba mate",
    description: "Taragüí · 500 g",
    searchKeywords: ["7790001000102"],
  },
  { value: "cafe", label: "Café molido", description: "La Virginia · 250 g" },
  { value: "miel", label: "Miel de abeja" },
];

const optionsWithStatus: Options = [
  { value: "yerba", label: "Yerba mate", description: "Playadito · 1 kg" },
  { value: "cafe", label: "Café molido", description: "La Virginia · 250 g", status: "Inactivo" },
];

const meta: Meta<typeof ComboBox<ProductId>> = {
  title: "Components/ComboBox",
  component: ComboBox<ProductId>,
  args: {
    label: "Producto",
    options,
    value: null,
    onChange: () => {},
  },
  decorators: [
    (Story) => (
      <div className="h-96 w-96">
        <Story />
      </div>
    ),
  ],
};

export default meta;

type Story = StoryObj<typeof ComboBox<ProductId>>;

function input(canvasElement: HTMLElement): HTMLElement {
  return within(canvasElement).getByRole("combobox", { name: /Producto/ });
}

function playTyping(text: string) {
  return async ({ canvasElement }: { canvasElement: HTMLElement }) => {
    await userEvent.type(input(canvasElement), text);
    await expect(input(canvasElement)).toHaveAttribute("aria-expanded", "true");
  };
}

export const Placeholder: Story = {
  args: { placeholder: "Buscá por nombre o código de barras" },
};

export const Selected: Story = {
  args: { value: "cafe" },
};

export const Hovered: Story = {
  args: { value: "cafe" },
  play: playHoverSetsDataHovered(input),
};

export const Focused: Story = {
  args: { value: "cafe" },
  play: async ({ canvasElement }) => {
    await userEvent.tab();
    await expect(input(canvasElement)).toHaveFocus();
  },
};

export const Open: Story = {
  args: { value: "cafe" },
  play: playClickExpandsTrigger(input),
};

export const OptionHovered: Story = {
  args: { value: "cafe" },
  play: playHoverListboxOption(input, "Miel de abeja"),
};

export const OptionFocused: Story = {
  args: { value: "cafe" },
  play: async ({ canvasElement }) => {
    await userEvent.click(input(canvasElement));
    await userEvent.keyboard("{ArrowDown}");
    await expect(input(canvasElement)).toHaveAttribute("aria-activedescendant");
  },
};

export const Filtered: Story = {
  args: { options: optionsWithDescriptions },
  play: playTyping("yerba"),
};

export const FilteredByKeyword: Story = {
  args: { options: optionsWithDescriptions },
  play: playTyping("7790001000102"),
};

export const NoResults: Story = {
  args: { options: optionsWithDescriptions },
  play: playTyping("zzz"),
};

export const WithDescriptions: Story = {
  args: { options: optionsWithDescriptions, value: "yerba" },
  play: playClickExpandsTrigger(input),
};

export const SelectedWithStatus: Story = {
  args: { options: optionsWithStatus, value: "cafe" },
};

export const OpenWithStatus: Story = {
  args: { options: optionsWithStatus, value: "cafe" },
  play: playClickExpandsTrigger(input),
};

export const Required: Story = {
  args: { value: "cafe", required: true },
};

export const HelperText: Story = {
  args: { value: "cafe", description: "Solo aparecen los productos activos." },
};

export const Invalid: Story = {
  args: { errorMessage: "Elegí un producto." },
};

function ComboBoxWithMessageElsewhere() {
  const messageId = useId();
  return (
    <div className="flex flex-col gap-1.5">
      <ComboBox
        label="Producto"
        options={options}
        value={null}
        onChange={() => {}}
        errorMessageId={messageId}
      />
      <p id={messageId} className={fieldErrorClassName}>
        Elegí un producto.
      </p>
    </div>
  );
}

export const InvalidMessageElsewhere: Story = {
  render: () => <ComboBoxWithMessageElsewhere />,
};

export const Disabled: Story = {
  args: { value: "cafe", disabled: true },
};
