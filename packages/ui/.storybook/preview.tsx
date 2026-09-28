import type { Preview } from "@storybook/react-vite";
import "../src/styles/tokens.css";

// A focus ring reaches 6px past its element (3px outline + 3px offset); a story mounted flush
// against the page's edge would have part of it painted off-screen.
const preview: Preview = {
  decorators: [
    (Story) => (
      <div style={{ padding: "1rem" }}>
        <Story />
      </div>
    ),
  ],
};

export default preview;
