export function ownEntry<Value>(
  table: Readonly<Record<string, Value>>,
  key: string | null,
): Value | undefined {
  return key !== null && Object.hasOwn(table, key) ? table[key] : undefined;
}
