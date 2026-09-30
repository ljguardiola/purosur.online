import { formatNumber, plural } from "@purosur/ui";

export function discountsFooterText({
  shown,
  current,
}: {
  shown: number;
  current: number;
}): string {
  return [
    plural(shown, { one: "1 promoción", other: `${formatNumber(shown)} promociones` }),
    plural(current, { one: "1 vigente hoy", other: `${formatNumber(current)} vigentes hoy` }),
  ].join(" · ");
}
