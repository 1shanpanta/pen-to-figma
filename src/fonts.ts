// Map .pen fontWeight strings to Figma font style names
const WEIGHT_STYLE_MAP: Record<string, string[]> = {
  "100": ["Thin"],
  "200": ["ExtraLight", "Extra Light", "UltraLight"],
  "300": ["Light"],
  "400": ["Regular"],
  "500": ["Medium"],
  "600": ["SemiBold", "Semi Bold", "DemiBold"],
  "700": ["Bold"],
  "800": ["ExtraBold", "Extra Bold", "UltraBold"],
  "900": ["Black", "Heavy"],
};

const FALLBACK_FONT: FontName = { family: "Inter", style: "Regular" };

function getStyleName(weight?: string, italic?: boolean): string[] {
  const base = WEIGHT_STYLE_MAP[weight || "400"] || ["Regular"];
  if (italic) {
    // Try "Light Italic", "LightItalic", "Italic" etc.
    const italicVariants = base.flatMap((s) =>
      s === "Regular"
        ? ["Italic", "Regular Italic"]
        : [`${s} Italic`, `${s}Italic`]
    );
    return [...italicVariants, ...base, "Italic", "Regular"];
  }
  return [...base, "Regular"];
}

export async function loadFont(
  family?: string,
  weight?: string,
  italic?: boolean
): Promise<FontName> {
  const targetFamily = family || "Inter";
  const styleNames = getStyleName(weight, italic);

  // Try each style variation
  for (const style of styleNames) {
    try {
      const fontName = { family: targetFamily, style };
      await figma.loadFontAsync(fontName);
      return fontName;
    } catch {
      // Style not available, try next
    }
  }

  // Fallback: try the family with "Regular"
  try {
    const fontName = { family: targetFamily, style: "Regular" };
    await figma.loadFontAsync(fontName);
    return fontName;
  } catch {
    // Family not available at all, fall back to Inter
  }

  await figma.loadFontAsync(FALLBACK_FONT);
  return FALLBACK_FONT;
}

// Pre-scan all nodes and load all unique fonts upfront
export async function preloadFonts(nodes: any[]): Promise<void> {
  const seen = new Set<string>();

  function collectFonts(node: any) {
    if (node.type === "text" || node.type === "icon_font") {
      const key = `${node.fontFamily || "Inter"}::${node.fontWeight || "400"}::${node.fontStyle || "normal"}`;
      seen.add(key);
    }
    if (node.children) {
      for (const child of node.children) {
        if (typeof child === "object") collectFonts(child);
      }
    }
  }

  for (const node of nodes) collectFonts(node);

  for (const key of seen) {
    const [family, weight, style] = key.split("::");
    await loadFont(family, weight, style === "italic");
  }

  // Always load Inter Regular as the ultimate fallback
  try {
    await figma.loadFontAsync(FALLBACK_FONT);
  } catch {
    // If even Inter isn't available, we're in trouble
  }
}
