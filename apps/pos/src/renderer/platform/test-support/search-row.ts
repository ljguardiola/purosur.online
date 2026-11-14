function sideOfRow(element: Element, other: Element): Element {
  let side = element;
  while (side.parentElement !== null && !side.parentElement.contains(other)) {
    side = side.parentElement;
  }
  return side;
}

export function gapBetweenSearchFieldAndScaleCard(field: Element, scaleLabel: Element): number {
  const fieldSide = sideOfRow(field, scaleLabel).getBoundingClientRect();
  const cardSide = sideOfRow(scaleLabel, field).getBoundingClientRect();
  return cardSide.left - fieldSide.right;
}
