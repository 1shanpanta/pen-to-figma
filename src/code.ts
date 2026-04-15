import { PenNode } from "./types";
import { preloadFonts } from "./fonts";
import { convertNode } from "./converter";

figma.showUI(__html__, { width: 480, height: 520 });

figma.ui.onmessage = async (event: { type: string; data?: string }) => {
  if (event.type === "import") {
    if (!event.data) {
      figma.ui.postMessage({ type: "error", message: "No data provided" });
      return;
    }

    try {
      var inputData = event.data;
      var parsed = JSON.parse(inputData);

      // Handle both formats: array of nodes OR {children: [...]}
      var nodes: PenNode[] = Array.isArray(parsed)
        ? parsed
        : parsed.children || [];

      if (nodes.length === 0) {
        figma.ui.postMessage({ type: "error", message: "No nodes found in data" });
        return;
      }

      figma.ui.postMessage({ type: "status", message: "Loading fonts..." });

      // Pre-load all fonts
      await preloadFonts(nodes);

      figma.ui.postMessage({
        type: "status",
        message: "Creating " + nodes.length + " screens...",
      });

      // Convert each top-level node (continue on per-screen errors)
      var created: SceneNode[] = [];
      var errorCount = 0;
      for (var i = 0; i < nodes.length; i++) {
        var screenNode = nodes[i];
        figma.ui.postMessage({
          type: "status",
          message: "Creating screen " + (i + 1) + "/" + nodes.length + ": " + (screenNode.name || screenNode.id),
        });

        try {
          var figmaNode = await convertNode(screenNode, figma.currentPage);
          if (figmaNode) created.push(figmaNode);
        } catch (screenErr) {
          errorCount++;
          console.error("Failed screen " + (i + 1) + ":", screenErr);
        }
      }

      // Select and zoom to the created nodes
      if (created.length > 0) {
        figma.currentPage.selection = created;
        figma.viewport.scrollAndZoomIntoView(created);
      }

      var resultText = errorCount > 0
        ? "Imported " + created.length + " screens (" + errorCount + " had errors)"
        : "Imported " + created.length + " screens";
      figma.ui.postMessage({ type: "done", message: resultText });
    } catch (topErr) {
      var errText = topErr instanceof Error ? topErr.message : String(topErr);
      figma.ui.postMessage({ type: "error", message: errText });
    }
  }

  if (event.type === "cancel") {
    figma.closePlugin();
  }
};
