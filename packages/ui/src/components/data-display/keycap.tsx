type FunctionKeyNumber = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12;
type Letter =
  | "A"
  | "B"
  | "C"
  | "D"
  | "E"
  | "F"
  | "G"
  | "H"
  | "I"
  | "J"
  | "K"
  | "L"
  | "M"
  | "N"
  | "O"
  | "P"
  | "Q"
  | "R"
  | "S"
  | "T"
  | "U"
  | "V"
  | "W"
  | "X"
  | "Y"
  | "Z";
type Digit = "0" | "1" | "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9";

export type KeyName =
  | "Escape"
  | "Enter"
  | "Delete"
  | "Space"
  | `F${FunctionKeyNumber}`
  | "ArrowUpDown"
  | "ArrowLeftRight"
  | "Digits"
  | Letter
  | Digit;

export type KeycapProps = {
  keyName: KeyName;
  variant?: "default" | "onPrimary";
};

const specialLabel: Partial<Record<KeyName, string>> = {
  Escape: "Esc",
  Delete: "Supr",
  Space: "Espacio",
  ArrowUpDown: "↑↓",
  ArrowLeftRight: "←→",
  Digits: "0-9",
};

const keycapClassName =
  "inline-flex h-6 min-w-6 shrink-0 items-center justify-center rounded-md border px-1.5 " +
  "font-mono text-caption font-bold whitespace-nowrap";

const variantClassName = {
  default: "border-border bg-surface text-text",
  onPrimary: "border-transparent bg-surface-inverse/25 text-text-inverse",
} as const;

export function Keycap({ keyName, variant = "default" }: KeycapProps) {
  return (
    <kbd className={`${keycapClassName} ${variantClassName[variant]}`}>
      {specialLabel[keyName] ?? keyName}
    </kbd>
  );
}
