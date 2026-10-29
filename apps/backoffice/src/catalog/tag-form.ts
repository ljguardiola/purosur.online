import { formatNumber, plural } from "@purosur/ui";

export const EMPTY_TAG_EDIT_FORM = { name: "", version: 1 };

export const TAG_EDIT_FIELDS = { name: "name", version: null } as const;

export function tagEditRequestFrom({ name, version }: { name: string; version: number }) {
  return { name: name.trim(), version };
}

export function renameReachText(productCount: number): string | undefined {
  if (productCount === 0) {
    return undefined;
  }
  return plural(productCount, {
    one: "El nombre nuevo se ve en su producto.",
    other: `El nombre nuevo se ve en sus ${formatNumber(productCount)} productos.`,
  });
}
