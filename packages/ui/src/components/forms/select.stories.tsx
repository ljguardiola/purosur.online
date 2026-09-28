import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, userEvent, within } from "storybook/test";
import {
  playArrowKeyFocusesListboxOption,
  playClickExpandsTrigger,
  playHoverListboxOption,
  playHoverSetsDataHovered,
} from "../../test-support/story-interactions";
import { Select, type SelectOption } from "./select";

type Role = "administrator" | "shift-lead" | "cashier";

const options: [SelectOption<Role>, SelectOption<Role>, SelectOption<Role>] = [
  { value: "administrator", label: "Administrador" },
  { value: "shift-lead", label: "Responsable de turno" },
  { value: "cashier", label: "Atención de caja" },
];

const meta: Meta<typeof Select<Role>> = {
  title: "Components/Select",
  component: Select<Role>,
  args: {
    label: "Rol",
    options,
    onChange: () => {},
  },
  decorators: [
    (Story) => (
      <div className="w-80">
        <Story />
      </div>
    ),
  ],
};

export default meta;

type Story = StoryObj<typeof Select<Role>>;

function trigger(canvasElement: HTMLElement): HTMLElement {
  return within(canvasElement).getByRole("button", { name: /Rol/ });
}

export const Selected: Story = {
  args: { value: "shift-lead" },
};

export const Placeholder: Story = {
  args: { value: null, placeholder: "Elegí un rol" },
};

export const Hovered: Story = {
  args: { value: "shift-lead" },
  play: playHoverSetsDataHovered(trigger),
};

// Select's own border reacts to react-aria's data-focused, not data-focus-visible: it draws no
// separate outline ring, so the resting-vs-focused border swap alone has to carry that state.
export const Focused: Story = {
  args: { value: "shift-lead" },
  play: async ({ canvasElement }) => {
    await userEvent.tab();
    await expect(trigger(canvasElement)).toHaveAttribute("data-focused", "true");
  },
};

export const Open: Story = {
  args: { value: "shift-lead" },
  play: playClickExpandsTrigger(trigger),
};

export const OptionHovered: Story = {
  args: { value: "shift-lead" },
  play: playHoverListboxOption(trigger, "Atención de caja"),
};

export const OptionFocusVisible: Story = {
  args: { value: "shift-lead" },
  play: playArrowKeyFocusesListboxOption(trigger, "Atención de caja"),
};

export const Required: Story = {
  args: { value: "shift-lead", required: true },
};

export const Invalid: Story = {
  args: { value: "shift-lead", invalid: true, errorMessage: "Elegí un rol." },
};

export const Disabled: Story = {
  args: { value: "shift-lead", disabled: true },
};

export const HelperText: Story = {
  args: { value: "shift-lead", helperText: "Define qué puede hacer esta persona." },
};
