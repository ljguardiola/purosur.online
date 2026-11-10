import { Button } from "@purosur/ui";
import { useState } from "react";
import {
  useGoodConditionReturnDaysQuery,
  useSupplierPriceListDailyCapQuery,
} from "../branch/branch-queries";
import { type BackofficeAccess, canSeeBranchArea } from "./backoffice-access";
import type { BranchTermServices } from "./branch-term-services";
import { BRANCH_TERMS, type BranchTerm } from "./branch-terms";
import { ChangeBranchTermModal } from "./change-branch-term-modal";

type BranchTermChangeProps = {
  term: BranchTerm;
  value: number | undefined;
  access: BackofficeAccess;
  onSessionEnded: () => void;
  onChanged?: () => void;
  services: BranchTermServices;
};

export function BranchTermChange({
  term,
  value,
  access,
  onSessionEnded,
  onChanged,
  services,
}: BranchTermChangeProps) {
  const [changing, setChanging] = useState(false);
  const { label, shown } = BRANCH_TERMS[term];

  return (
    <>
      {value === undefined ? null : (
        <div className="flex items-center gap-1">
          <p className="text-text-subtle text-detail">{`${label}: ${shown(value)}`}</p>
          {canSeeBranchArea(access) ? (
            <Button variant="text" onPress={() => setChanging(true)}>
              Cambiar
            </Button>
          ) : null}
        </div>
      )}
      {changing ? (
        <ChangeBranchTermModal
          term={term}
          onClose={() => setChanging(false)}
          onChanged={() => {
            setChanging(false);
            onChanged?.();
          }}
          onSessionEnded={onSessionEnded}
          services={services}
        />
      ) : null}
    </>
  );
}

type ReadBranchTermChangeProps = Omit<BranchTermChangeProps, "term" | "value" | "onChanged"> & {
  term: "goodConditionReturnDays" | "supplierPriceListDailyExtractionCap";
};

function GoodConditionReturnDaysChange(props: Omit<ReadBranchTermChangeProps, "term">) {
  const data = useGoodConditionReturnDaysQuery({
    fetchGoodConditionReturnDays: props.services.fetchGoodConditionReturnDays,
    onSessionEnded: props.onSessionEnded,
  });
  return (
    <BranchTermChange
      {...props}
      term="goodConditionReturnDays"
      value={data.status === "loaded" ? data.value : undefined}
    />
  );
}

function SupplierPriceListDailyCapChange(props: Omit<ReadBranchTermChangeProps, "term">) {
  const data = useSupplierPriceListDailyCapQuery({
    fetchSupplierPriceListDailyCap: props.services.fetchSupplierPriceListDailyCap,
    onSessionEnded: props.onSessionEnded,
  });
  return (
    <BranchTermChange
      {...props}
      term="supplierPriceListDailyExtractionCap"
      value={data.status === "loaded" ? data.value : undefined}
    />
  );
}

export function ReadBranchTermChange({ term, ...props }: ReadBranchTermChangeProps) {
  return term === "goodConditionReturnDays" ? (
    <GoodConditionReturnDaysChange {...props} />
  ) : (
    <SupplierPriceListDailyCapChange {...props} />
  );
}
