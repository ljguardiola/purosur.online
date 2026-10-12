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
    const names = Object.keys(left);
    return (
      names.length === Object.keys(right).length &&
      names.every(
        (name) => Object.hasOwn(right, name) && isSameAlertDetail(left[name], right[name]),
      )
    );
  }
  return left === right;
}
