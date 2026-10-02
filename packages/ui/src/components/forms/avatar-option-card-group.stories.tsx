import type { Meta, StoryObj } from "@storybook/react-vite";
import { type ComponentProps, useId } from "react";
import { within } from "storybook/test";
import {
  playHoverSetsDataHovered,
  playTabReachesFocusVisible,
} from "../../test-support/story-interactions";
import { AvatarOptionCardGroup } from "./avatar-option-card-group";
import type { NarrowedOption } from "./option";

type PersonValue = "ada" | "bruno" | "carla";

const options: [
  NarrowedOption<PersonValue>,
  NarrowedOption<PersonValue>,
  NarrowedOption<PersonValue>,
] = [
  { value: "ada", label: "Ada" },
  { value: "bruno", label: "Bruno" },
  { value: "carla", label: "Carla" },
];

type GroupProps = ComponentProps<typeof AvatarOptionCardGroup<PersonValue>>;

function GroupUnderHeading(props: Omit<GroupProps, "labelledBy">) {
  const headingId = useId();
  return (
    <>
      <h2 id={headingId} className="mb-3 text-heading font-bold">
        ¿Quién abre la caja?
      </h2>
      <AvatarOptionCardGroup {...props} labelledBy={headingId} />
    </>
  );
}

const meta: Meta<typeof AvatarOptionCardGroup<PersonValue>> = {
  title: "Components/AvatarOptionCardGroup",
  component: AvatarOptionCardGroup<PersonValue>,
  args: { options, onChange: () => {} },
  render: ({ labelledBy: _, ...args }) => <GroupUnderHeading {...args} />,
  decorators: [
    (Story) => (
      <div style={{ width: "320px" }}>
        <Story />
      </div>
    ),
  ],
};

export default meta;

type Story = StoryObj<typeof AvatarOptionCardGroup<PersonValue>>;

function cardInput(canvasElement: HTMLElement, name: string): HTMLElement {
  return within(canvasElement).getByRole("radio", { name });
}

function cardRoot(canvasElement: HTMLElement, name: string): HTMLElement {
  return cardInput(canvasElement, name).closest("label") as HTMLElement;
}

export const NothingChosen: Story = {
  args: { value: null },
};

export const Chosen: Story = {
  args: { value: "ada" },
};

export const UnchosenHovered: Story = {
  args: { value: "ada" },
  play: playHoverSetsDataHovered((canvasElement) => cardRoot(canvasElement, "Bruno")),
};

export const FocusVisible: Story = {
  args: { value: "ada" },
  play: playTabReachesFocusVisible(
    (canvasElement) => cardInput(canvasElement, "Ada"),
    (canvasElement) => cardRoot(canvasElement, "Ada"),
  ),
};

export const Disabled: Story = {
  args: { value: "ada", disabled: true },
};

export const LongName: Story = {
  args: {
    value: null,
    options: [{ value: "ada", label: "Una persona con un nombre larguísimo que no entra" }],
  },
  decorators: [
    (Story) => (
      <div style={{ width: "200px" }}>
        <Story />
      </div>
    ),
  ],
};
