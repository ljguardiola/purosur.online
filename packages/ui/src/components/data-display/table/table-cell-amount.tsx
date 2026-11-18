export type TableCellAmountProps = {
  amount: string;
  unit?: string | undefined;
};

export function TableCellAmount({ amount, unit }: TableCellAmountProps) {
  return (
    <span className="text-body whitespace-normal">
      <span className="whitespace-nowrap">{amount}</span>
      {unit === undefined ? null : (
        <>
          {" "}
          <span className="whitespace-nowrap">{unit}</span>
        </>
      )}
    </span>
  );
}
