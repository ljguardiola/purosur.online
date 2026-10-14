import { formatNumber, formatWeight } from "@purosur/ui";

export function soldQuantityText({
  units,
  thousandths,
}: {
  units: number;
  thousandths: number;
}): string {
  const parts = [
    ...(units > 0 ? [`${formatNumber(units)} u`] : []),
    ...(thousandths > 0 ? [formatWeight(thousandths)] : []),
  ];
  return parts.length === 0 ? "0 u" : parts.join(" · ");
}
