export type AvatarProps = {
  label: string;
};

function initialOf(label: string): string {
  return (Array.from(label)[0] ?? "").toLocaleUpperCase("es-AR");
}

export function Avatar({ label }: AvatarProps) {
  return (
    <span
      data-avatar
      className="flex size-9 shrink-0 items-center justify-center rounded-full bg-action-soft text-body font-bold text-text-accent"
    >
      {initialOf(label)}
    </span>
  );
}
