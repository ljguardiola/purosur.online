export type PagePart<Access, Key extends string> = {
  key: Key;
  isVisibleTo: (access: Access) => boolean;
};

export type ShownPageParts<Key extends string> = {
  kind: "shown";
  visible: readonly Key[];
  defaultPart: Key;
};

export type PageParts<Key extends string> = { kind: "hidden" } | ShownPageParts<Key>;

export function pagePartsFor<Access, Key extends string>(
  access: Access,
  parts: readonly PagePart<Access, Key>[],
): PageParts<Key> {
  const visible = parts.filter((part) => part.isVisibleTo(access)).map((part) => part.key);
  const [defaultPart] = visible;
  if (defaultPart === undefined) {
    return { kind: "hidden" };
  }
  return { kind: "shown", visible, defaultPart };
}

export function landingPart<Key extends string>(
  shown: ShownPageParts<Key>,
  requested?: string,
): Key {
  return shown.visible.find((key) => key === requested) ?? shown.defaultPart;
}
