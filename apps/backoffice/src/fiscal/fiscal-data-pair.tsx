type DataPairProps = { label: string; value: string | null };

export function DataPair({ label, value }: DataPairProps) {
  return (
    <div className="flex flex-col gap-1">
      <p className="font-bold text-text-subtle text-detail">{label}</p>
      <p
        className={
          value === null ? "text-body text-text-subtle" : "font-semibold text-body text-text"
        }
      >
        {value ?? "Sin cargar"}
      </p>
    </div>
  );
}

export function FixedPair({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-1">
      <p className="font-bold text-text-subtle text-detail">{label}</p>
      <p className="font-semibold text-body text-text">{value}</p>
    </div>
  );
}
