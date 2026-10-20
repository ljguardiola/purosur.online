import { Button, Card, formatBytes } from "@purosur/ui";
import { FileText, Upload } from "lucide-react";
import { useRef } from "react";

type SupplierPriceListFilePickerProps = {
  file: File | null;
  onChange: (file: File) => void;
};

export function SupplierPriceListFilePicker({ file, onChange }: SupplierPriceListFilePickerProps) {
  const input = useRef<HTMLInputElement>(null);
  return (
    <>
      <input
        ref={input}
        type="file"
        accept="application/pdf,.pdf"
        aria-label="Archivo PDF"
        tabIndex={-1}
        className="sr-only"
        onChange={(event) => {
          const chosen = event.target.files?.[0];
          if (chosen) {
            onChange(chosen);
          }
        }}
      />
      {file === null ? (
        <Button variant="secondary" icon={<Upload />} onPress={() => input.current?.click()}>
          Elegir un archivo
        </Button>
      ) : (
        <Card variant="subtle">
          <div className="flex items-center gap-3">
            <FileText aria-hidden="true" className="size-icon-lg shrink-0 text-text-accent" />
            <div className="flex min-w-0 flex-1 flex-col">
              <p className="truncate text-body font-bold text-text">{file.name}</p>
              <p className="text-detail text-text-subtle">{formatBytes(file.size)}</p>
            </div>
            <Button variant="secondary" size="small" onPress={() => input.current?.click()}>
              Elegir otro archivo
            </Button>
          </div>
        </Card>
      )}
    </>
  );
}
