import type { SignInUser } from "@purosur/contracts";
import { sortedItems, textOrder } from "@purosur/ui";
import { Check } from "lucide-react";
import { useId } from "react";

export type UserPickerProps = {
  users: readonly SignInUser[];
  value: string | null;
  onChange: (user: SignInUser) => void;
  labelledBy: string;
  disabled?: boolean;
};

const rowClassName =
  "flex h-15 cursor-pointer items-center gap-3 rounded-lg bg-surface p-3 inset-ring-1 inset-ring-border " +
  "hover:bg-surface-subtle " +
  "has-checked:bg-action-subtle has-checked:inset-ring-2 has-checked:inset-ring-action " +
  "has-focus-visible:focus-ring " +
  "has-disabled:cursor-default has-disabled:opacity-disabled";

function initialOf(firstName: string): string {
  return (Array.from(firstName)[0] ?? "").toLocaleUpperCase("es-AR");
}

export function UserPicker({
  users,
  value,
  onChange,
  labelledBy,
  disabled = false,
}: UserPickerProps) {
  const groupName = useId();
  const ordered = sortedItems(users, {
    order: textOrder((user: SignInUser) => user.first_name),
    direction: "ascending",
  });

  return (
    <div role="radiogroup" aria-labelledby={labelledBy} className="flex flex-col gap-2">
      {ordered.map((user) => (
        <label key={user.id} className={rowClassName}>
          <input
            type="radio"
            name={groupName}
            value={user.id}
            checked={value === user.id}
            disabled={disabled}
            onChange={() => onChange(user)}
            className="sr-only"
          />
          <span
            aria-hidden="true"
            className="flex size-9 shrink-0 items-center justify-center rounded-full bg-action-soft text-body font-bold text-text-accent"
          >
            {initialOf(user.first_name)}
          </span>
          <span className="min-w-0 flex-1 truncate text-body text-text">{user.first_name}</span>
          {value === user.id ? (
            <span aria-hidden="true" className="inline-flex size-icon-lg shrink-0 text-text-accent">
              <Check className="size-full" />
            </span>
          ) : null}
        </label>
      ))}
    </div>
  );
}
