import { PenNode } from "./types";
import { preloadFonts } from "./fonts";
import { convertNode } from "./converter";

figma.showUI(__html__, { width: 480, height: 520 });

figma.ui.onmessage = async (msg: { type: string; data?: string }) => {
  if (msg.type === "import") {
    if (!msg.data) {
      figma.ui.postMessage({ type: "error", message: "No data provided" });
      return;
    }

    try {
      const parsed = JSON.parse(msg.data);

      // Handle both formats: array of nodes OR {children: [...]}
      const nodes: PenNode[] = Array.isArray(parsed)
        ? parsed
        : parsed.children || [];

      if (nodes.length === 0) {
        figma.ui.postMessage({ type: "error", message: "No nodes found in data" });
        return;
      }

      figma.ui.postMessage({ type: "status", message: `Loading fonts...` });

      // Pre-load all fonts
      await preloadFonts(nodes);

      figma.ui.postMessage({
        type: "status",
        message: `Creating ${nodes.length} screens...`,
      });

      // Convert each top-level node
      const created: SceneNode[] = [];
      for (let i = 0; i < nodes.length; i++) {
        const node = nodes[i];
        figma.ui.postMessage({
          type: "status",
          message: `Creating screen ${i + 1}/${nodes.length}: ${node.name || node.id}`,
        });

        const figmaNode = await convertNode(node, figma.currentPage);
        if (figmaNode) created.push(figmaNode);
      }

      // Select and zoom to the created nodes
      if (created.length > 0) {
        figma.currentPage.selection = created;
        figma.viewport.scrollAndZoomIntoView(created);
      }

      figma.ui.postMessage({
        type: "done",
        message: `Imported ${created.length} screens`,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      figma.ui.postMessage({ type: "error", message });
    }
  }

  if (msg.type === "cancel") {
    figma.closePlugin();
  }
};
