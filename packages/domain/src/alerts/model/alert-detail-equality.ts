function isMemberSet(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function isSameAlertDetail(left: unknown, right: unknown): boolean {
  if (Array.isArray(left) && Array.isArray(right)) {
    return (
      left.length === right.length &&
      left.every((item, index) => isSameAlertDetail(item, right[index]))
    );
  }
  if (isMemberSet(left) && isMemberSet(right)) {
    const members = Object.entries(left);
    return (
      members.length === Object.keys(right).length &&
      members.every(
        ([name, value]) => Object.hasOwn(right, name) && isSameAlertDetail(value, right[name]),
      )
    );
  }
  return left === right;
}
