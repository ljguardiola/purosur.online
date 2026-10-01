import { z } from "zod";

// A strict content security policy reports the `new Function` probe Zod runs when it builds its
// first object schema, and the <style> react-aria injects unless an element with its id is already
// in the page. tokens.css carries the rule react-aria would inject.
z.config({ jitless: true });

const pressableStylePlaceholder = document.createElement("template");
pressableStylePlaceholder.id = "react-aria-pressable-style";
document.head.append(pressableStylePlaceholder);
