import type { LinkProps } from "@tanstack/react-router";
import type { PagePart } from "../platform/page-parts";
import type { BackofficeAccess } from "./backoffice-access";

type AreaTabTarget = NonNullable<LinkProps["to"]>;

export type AreaTab<Key extends string = string> = {
  key: Key;
  label: string;
  to: AreaTabTarget;
};

export type AreaTabPart<Key extends string> = PagePart<BackofficeAccess, Key> & AreaTab<Key>;

export function visibleAreaTabs<Key extends string>(
  parts: readonly AreaTabPart<Key>[],
  access: BackofficeAccess,
): AreaTab<Key>[] {
  return parts
    .filter((part) => part.isVisibleTo(access))
    .map(({ key, label, to }) => ({ key, label, to }));
}
