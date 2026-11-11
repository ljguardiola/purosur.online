import type { Meta, StoryObj } from "@storybook/react-vite";
import { ShieldCheck } from "lucide-react";
import { Button } from "../forms/button";
import type { NarrowedOption } from "../forms/option";
import { PinDotsField } from "../forms/pin-dots-field";
import { UserSelect } from "../forms/user-select";
import { CardModal } from "./card-modal";

type Person = "marta" | "lucas";

const people: [NarrowedOption<Person>, NarrowedOption<Person>] = [
  { value: "marta", label: "Marta" },
  { value: "lucas", label: "Lucas" },
];

const meta: Meta<typeof CardModal> = {
  title: "Components/CardModal",
  component: CardModal,
  args: { open: true, onOpenChange: () => {} },
};

export default meta;

type Story = StoryObj<typeof CardModal>;

export const Authorization: Story = {
  args: {
    icon: <ShieldCheck />,
    title: "Autorizar",
    subtitle: "Falta de cambio",
    closable: true,
    children: (
      <>
        <UserSelect label="Usuario" options={people} value="marta" onChange={() => {}} />
        <PinDotsField label="PIN" value="1234" onChange={() => {}} />
      </>
    ),
    action: (
      <Button fullWidth icon={<ShieldCheck />} iconPosition="start" keycap="Enter">
        Autorizar
      </Button>
    ),
  },
};
