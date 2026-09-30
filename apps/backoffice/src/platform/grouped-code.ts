export function groupedCode(code: string): string {
  return (code.match(/.{1,4}/g) ?? [code]).join(" ");
}
