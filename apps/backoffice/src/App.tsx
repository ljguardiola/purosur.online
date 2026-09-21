import { AreaNavItem } from "@purosur/ui";
import { LifeBuoy } from "lucide-react";
import { useEffect, useState } from "react";
import { AyudaContent, AyudaSectionColumn } from "./AyudaScreen";
import { parseAyudaRoute } from "./ayudaRoutes";
import { help } from "./help";
import { linkProps } from "./linkProps";
import { messages } from "./messages";
import { navigate, useRoute } from "./router";
import { Shell } from "./Shell";

// Ayuda is the only area this issue ships, pinned at the rail's foot per the design; later areas
// join it in the rail without touching this redirect or the shell's own layout.
export function App() {
  const route = useRoute();
  const [search, setSearch] = useState("");

  useEffect(() => {
    if (route === "/") {
      navigate("/ayuda");
    }
  }, [route]);

  const { categoryId, articleId } = parseAyudaRoute(route);

  return (
    <Shell
      areaRailLabel={messages.shell.areaRailLabel}
      rail={
        <AreaNavItem
          label={messages.ayuda.areaLabel}
          icon={<LifeBuoy />}
          active={route !== "/"}
          {...linkProps("/ayuda")}
        />
      }
      sectionColumn={<AyudaSectionColumn help={help} activeCategoryId={categoryId} />}
    >
      <AyudaContent
        help={help}
        categoryId={categoryId}
        articleId={articleId}
        search={search}
        onSearchChange={setSearch}
      />
    </Shell>
  );
}
