export type TextPreviewProps = {
  text: string;
};

export function TextPreview({ text }: TextPreviewProps) {
  return (
    <pre className="whitespace-pre-wrap break-words rounded-lg bg-surface-subtle p-4 font-mono text-detail text-text">
      {text}
    </pre>
  );
}
