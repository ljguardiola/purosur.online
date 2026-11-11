import type { Meta, StoryObj } from "@storybook/react-vite";
import { within } from "storybook/test";
import { playClickExpandsTrigger } from "../../test-support/story-interactions";
import type { NarrowedOption } from "./option";
import { UserSelect } from "./user-select";

type Person = "marta" | "lucas" | "ana";

const options: [NarrowedOption<Person>, NarrowedOption<Person>, NarrowedOption<Person>] = [
  { value: "marta", label: "Marta" },
  { value: "lucas", label: "Lucas" },
  { value: "ana", label: "Ana" },
];

const meta: Meta<typeof UserSelect<Person>> = {
  title: "Components/UserSelect",
  component: UserSelect<Person>,
  args: { label: "Usuario", options, onChange: () => {} },
  decorators: [
    (Story) => (
      <div className="h-72 w-110">
        <Story />
      </div>
    ),
  ],
};

export default meta;

type Story = StoryObj<typeof UserSelect<Person>>;

export const Chosen: Story = {
  args: { value: "marta" },
};

export const Placeholder: Story = {
  args: { value: null, placeholder: "Elegí una persona" },
};

export const Disabled: Story = {
  args: { value: "marta", disabled: true },
};

export const Open: Story = {
  args: { value: "marta" },
  play: playClickExpandsTrigger((canvasElement) =>
    within(canvasElement).getByRole("button", { name: /Usuario/ }),
  ),
};
