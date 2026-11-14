import type { LiveScaleReadingOutcome } from "@purosur/contracts";
import { formatWeight, LoadingPlaceholder, ScaleCard } from "@purosur/ui";
import { useLiveScaleReadingQuery } from "./sales-queries";
import type { ScaleReading } from "./weighing-card";

export type LiveScaleCardProps = {
  readScale: () => Promise<LiveScaleReadingOutcome>;
  weighingReading: ScaleReading | undefined;
};

export function LiveScaleCard({ readScale, weighingReading }: LiveScaleCardProps) {
  const live = useLiveScaleReadingQuery({
    read: readScale,
    enabled: weighingReading === undefined,
  });
  if (weighingReading !== undefined) {
    return (
      <ScaleCard
        reading={{
          value: formatWeight(weighingReading.weightThousandths),
          settled: weighingReading.settled,
        }}
      />
    );
  }
  if (live.status === "loading") {
    return <LoadingPlaceholder variant="card" lines={1} />;
  }
  if (live.status === "failed") {
    return <ScaleCard noReading />;
  }
  switch (live.value.kind) {
    case "not_configured":
      return null;
    case "no_reading":
      return <ScaleCard noReading />;
    case "settling":
      return <ScaleCard />;
    case "reading":
      return (
        <ScaleCard
          reading={{
            value: formatWeight(live.value.weight_thousandths),
            settled: live.value.settled,
          }}
        />
      );
  }
}
