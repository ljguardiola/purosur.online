import { Tag } from "@purosur/ui";
import { TriangleAlert } from "lucide-react";

export function IncompleteCostTag() {
  return (
    <Tag tone="warning" icon={<TriangleAlert aria-hidden="true" />}>
      Costo incompleto
    </Tag>
  );
}
