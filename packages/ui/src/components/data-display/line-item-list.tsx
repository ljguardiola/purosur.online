export type LineItem = {
  id: string;
  name: string;
  quantity: string;
  amount: string;
};

export type LineItemListProps = {
  label: string;
  items: readonly LineItem[];
};

export function LineItemList({ label, items }: LineItemListProps) {
  return (
    <ul aria-label={label} className="grid grid-cols-[minmax(0,1fr)_auto_auto] gap-x-4 gap-y-2">
      {items.map(({ id, name, quantity, amount }) => (
        <li key={id} className="col-span-3 grid grid-cols-subgrid items-baseline">
          <span className="min-w-0 break-words text-body text-text">{name}</span>
          <span className="text-right font-mono text-detail text-text-subtle">{quantity}</span>
          <span className="text-right text-body font-bold text-text">{amount}</span>
        </li>
      ))}
    </ul>
  );
}
