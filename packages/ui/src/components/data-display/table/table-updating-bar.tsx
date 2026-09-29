export function TableUpdatingBar() {
  return (
    <div
      aria-hidden="true"
      // Without pointer-events-none, this purely visual bar would also physically catch
      // pointer events meant for the header underneath it.
      className="pointer-events-none absolute inset-x-0 top-0 z-raised h-0.75 overflow-hidden bg-data-subtle"
    >
      <div className="h-full w-1/3 animate-table-loading-bar bg-data motion-reduce:animate-none" />
    </div>
  );
}
