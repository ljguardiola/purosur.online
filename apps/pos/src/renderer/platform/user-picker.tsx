import type { SignInUser } from "@purosur/contracts";
import type { NarrowedOption } from "@purosur/ui";
import { AvatarOptionCardGroup, sortedItems, textOrder } from "@purosur/ui";

export type UserPickerProps = {
  users: readonly SignInUser[];
  value: string | null;
  onChange: (user: SignInUser) => void;
  labelledBy: string;
  disabled?: boolean;
};

export function UserPicker({
  users,
  value,
  onChange,
  labelledBy,
  disabled = false,
}: UserPickerProps) {
  const [first, ...rest] = sortedItems(users, {
    order: textOrder((user: SignInUser) => user.first_name),
    direction: "ascending",
  });
  if (first === undefined) {
    return null;
  }
  const options: [NarrowedOption<string>, ...NarrowedOption<string>[]] = [
    { value: first.id, label: first.first_name },
    ...rest.map((user) => ({ value: user.id, label: user.first_name })),
  ];

  return (
    <AvatarOptionCardGroup
      labelledBy={labelledBy}
      options={options}
      value={value}
      disabled={disabled}
      onChange={(id) => {
        const chosen = users.find((user) => user.id === id);
        if (chosen !== undefined) {
          onChange(chosen);
        }
      }}
    />
  );
}
