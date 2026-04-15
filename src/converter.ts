import { PenNode, PenFill, PenStroke, PenEffect } from "./types";
import { parseHexColor, toSolidPaint, toGradientTransform } from "./colors";
import { loadFont } from "./fonts";

// -- Fill conversion --

function convertSingleFill(fill: PenFill): Paint | null {
  if (typeof fill === "string") {
    if (fill.length < 4) return null;
    const { r, g, b, a } = parseHexColor(fill);
    if (a === 0) return null;
    return { type: "SOLID", color: { r, g, b }, opacity: a } as SolidPaint;
  }

  if (fill.type === "color") {
    if (fill.enabled === false) return null;
    const { r, g, b, a } = parseHexColor(fill.color);
    return { type: "SOLID", color: { r, g, b }, opacity: a } as SolidPaint;
  }

  if (fill.type === "gradient") {
    if (fill.enabled === false) return null;
    const stops: ColorStop[] = (fill.colors || []).map((c) => {
      const { r, g, b, a } = parseHexColor(c.color);
      return { color: { r, g, b, a }, position: c.position };
    });

    const gradientType =
      fill.gradientType === "radial"
        ? "GRADIENT_RADIAL"
        : fill.gradientType === "angular"
          ? "GRADIENT_ANGULAR"
          : "GRADIENT_LINEAR";

    return {
      type: gradientType,
      gradientStops: stops,
      gradientTransform: toGradientTransform(fill.rotation || 0, fill.center, fill.size),
      opacity: fill.opacity ?? 1,
    } as GradientPaint;
  }

  // Image fills: create a placeholder solid
  if (fill.type === "image") {
    return { type: "SOLID", color: { r: 0.5, g: 0.5, b: 0.5 }, opacity: 0.3 } as SolidPaint;
  }

  return null;
}

function convertFills(fill: PenFill | PenFill[] | undefined): Paint[] {
  if (!fill) return [];
  const fills = Array.isArray(fill) ? fill : [fill];
  return fills.map(convertSingleFill).filter(Boolean) as Paint[];
}

// -- Stroke conversion --

function applyStroke(node: GeometryMixin & IndividualStrokesMixin, stroke: PenStroke) {
  const paints = convertFills(stroke.fill);
  if (paints.length > 0) {
    (node as any).strokes = paints;
  }

  if (typeof stroke.thickness === "number") {
    node.strokeWeight = stroke.thickness;
  } else if (typeof stroke.thickness === "object") {
    node.strokeTopWeight = stroke.thickness.top ?? 0;
    node.strokeRightWeight = stroke.thickness.right ?? 0;
    node.strokeBottomWeight = stroke.thickness.bottom ?? 0;
    node.strokeLeftWeight = stroke.thickness.left ?? 0;
  }

  if (stroke.align) {
    const alignMap: Record<string, "INSIDE" | "CENTER" | "OUTSIDE"> = {
      inside: "INSIDE",
      center: "CENTER",
      outside: "OUTSIDE",
    };
    node.strokeAlign = alignMap[stroke.align] || "INSIDE";
  }
}

// -- Effect conversion --

function convertEffects(effects: PenEffect | PenEffect[] | undefined): Effect[] {
  if (!effects) return [];
  const list = Array.isArray(effects) ? effects : [effects];

  return list
    .filter((e) => e.enabled !== false)
    .map((e): Effect | null => {
      if (e.type === "shadow") {
        const { r, g, b, a } = parseHexColor(e.color || "#00000040");
        return {
          type: e.shadowType === "inner" ? "INNER_SHADOW" : "DROP_SHADOW",
          color: { r, g, b, a },
          offset: { x: e.offset?.x ?? 0, y: e.offset?.y ?? 4 },
          radius: e.blur ?? 8,
          spread: e.spread ?? 0,
          visible: true,
          blendMode: "NORMAL",
        } as DropShadowEffect | InnerShadowEffect;
      }
      if (e.type === "blur") {
        return {
          type: "LAYER_BLUR",
          radius: e.radius ?? 10,
          visible: true,
        } as BlurEffect;
      }
      if (e.type === "background_blur") {
        return {
          type: "BACKGROUND_BLUR",
          radius: e.radius ?? 10,
          visible: true,
        } as BlurEffect;
      }
      return null;
    })
    .filter(Boolean) as Effect[];
}

// -- Corner radius --

function applyCornerRadius(node: CornerMixin & RectangleCornerMixin, radius: number | [number, number, number, number] | undefined) {
  if (radius === undefined) return;
  if (typeof radius === "number") {
    node.cornerRadius = radius;
  } else if (Array.isArray(radius)) {
    node.topLeftRadius = radius[0];
    node.topRightRadius = radius[1];
    node.bottomRightRadius = radius[2];
    node.bottomLeftRadius = radius[3];
  }
}

// -- Layout --

function applyLayout(node: FrameNode, pen: PenNode) {
  if (pen.layout === "vertical") {
    node.layoutMode = "VERTICAL";
  } else if (pen.layout === "horizontal") {
    node.layoutMode = "HORIZONTAL";
  } else {
    node.layoutMode = "NONE";
    return;
  }

  if (pen.gap !== undefined) node.itemSpacing = pen.gap;

  // Padding
  if (pen.padding !== undefined) {
    if (typeof pen.padding === "number") {
      node.paddingTop = pen.padding;
      node.paddingRight = pen.padding;
      node.paddingBottom = pen.padding;
      node.paddingLeft = pen.padding;
    } else if (pen.padding.length === 2) {
      node.paddingTop = pen.padding[0] as number;
      node.paddingBottom = pen.padding[0] as number;
      node.paddingRight = pen.padding[1] as number;
      node.paddingLeft = pen.padding[1] as number;
    } else if (pen.padding.length === 4) {
      node.paddingTop = pen.padding[0] as number;
      node.paddingRight = pen.padding[1] as number;
      node.paddingBottom = pen.padding[2] as number;
      node.paddingLeft = pen.padding[3] as number;
    }
  }

  // Alignment
  const justifyMap: Record<string, "MIN" | "CENTER" | "MAX" | "SPACE_BETWEEN"> = {
    start: "MIN",
    center: "CENTER",
    end: "MAX",
    space_between: "SPACE_BETWEEN",
  };
  if (pen.justifyContent) {
    node.primaryAxisAlignItems = justifyMap[pen.justifyContent] || "MIN";
  }

  const alignMap: Record<string, "MIN" | "CENTER" | "MAX"> = {
    start: "MIN",
    center: "CENTER",
    end: "MAX",
  };
  if (pen.alignItems) {
    node.counterAxisAlignItems = alignMap[pen.alignItems] || "MIN";
  }
}

// -- Sizing --

function trySetLayoutSizing(node: SceneNode, prop: string, value: string) {
  try {
    (node as any)[prop] = value;
  } catch (_e) {
    // Node isn't in an auto-layout parent, skip
  }
}

function applySizing(node: FrameNode, pen: PenNode) {
  const applyAxis = (
    value: number | string | undefined,
    axis: "horizontal" | "vertical",
  ) => {
    const prop =
      axis === "horizontal" ? "layoutSizingHorizontal" : "layoutSizingVertical";

    if (typeof value === "string") {
      if (value === "fill_container") {
        trySetLayoutSizing(node, prop, "FILL");
        return;
      }
      if (value.startsWith("fit_content")) {
        trySetLayoutSizing(node, prop, "HUG");
        return;
      }
    }

    if (typeof value === "number") {
      if (axis === "horizontal") node.resize(value, node.height);
      else node.resize(node.width, value);
      trySetLayoutSizing(node, prop, "FIXED");
      return;
    }

    // Default: HUG for auto-layout frames
    if (node.layoutMode !== "NONE") {
      trySetLayoutSizing(node, prop, "HUG");
    }
  };

  if (node.layoutMode !== "NONE") {
    applyAxis(pen.width, "horizontal");
    applyAxis(pen.height, "vertical");
  } else {
    if (typeof pen.width === "number") node.resize(pen.width, node.height);
    if (typeof pen.height === "number") node.resize(node.width, pen.height as number);
  }
}

// -- Node creators --

async function createFrame(pen: PenNode, parent: BaseNode & ChildrenMixin): Promise<FrameNode> {
  const node = figma.createFrame();
  node.name = pen.name || pen.id || "Frame";

  var isTopLevel = parent === figma.currentPage;
  var hasFixedWidth = typeof pen.width === "number";
  var hasFixedHeight = typeof pen.height === "number";

  // Set explicit size first
  node.resize(
    hasFixedWidth ? (pen.width as number) : 100,
    hasFixedHeight ? (pen.height as number) : 100
  );

  // Fills
  var fills = convertFills(pen.fill);
  node.fills = fills.length > 0 ? fills : [];

  // Stroke
  if (pen.stroke) applyStroke(node, pen.stroke);

  // Corner radius
  applyCornerRadius(node, pen.cornerRadius);

  // Effects
  if (pen.effect) node.effects = convertEffects(pen.effect);

  // Clip
  if (pen.clip) node.clipsContent = true;

  // Opacity
  if (pen.opacity !== undefined) node.opacity = pen.opacity;

  // Layout mode
  applyLayout(node, pen);

  // For top-level frames or frames with explicit dimensions, lock sizing to FIXED
  if (node.layoutMode !== "NONE") {
    if (hasFixedWidth) {
      node.layoutSizingHorizontal = "FIXED";
    }
    if (hasFixedHeight) {
      node.layoutSizingVertical = "FIXED";
    }
  }

  // Position (only for absolute or top-level)
  if (pen.layoutPosition === "absolute" || isTopLevel) {
    node.x = pen.x || 0;
    node.y = pen.y || 0;
  }

  parent.appendChild(node);

  // Build children
  if (pen.children) {
    for (var ci = 0; ci < pen.children.length; ci++) {
      var child = pen.children[ci];
      if (typeof child === "string") continue; // Skip "..." truncation markers
      await convertNode(child, node);
    }
  }

  // Apply dynamic sizing (fill_container, fit_content) AFTER children exist
  // But don't override fixed dimensions on top-level screens
  if (node.layoutMode !== "NONE" && !isTopLevel) {
    if (!hasFixedWidth && pen.width !== undefined) {
      trySetLayoutSizing(node, "layoutSizingHorizontal",
        pen.width === "fill_container" ? "FILL" :
        typeof pen.width === "string" && pen.width.startsWith("fit_content") ? "HUG" : "FIXED"
      );
    }
    if (!hasFixedHeight && pen.height !== undefined) {
      trySetLayoutSizing(node, "layoutSizingVertical",
        pen.height === "fill_container" ? "FILL" :
        typeof pen.height === "string" && pen.height.startsWith("fit_content") ? "HUG" : "FIXED"
      );
    }
  }

  return node;
}

async function createText(pen: PenNode, parent: BaseNode & ChildrenMixin): Promise<TextNode> {
  const node = figma.createText();
  node.name = pen.name || pen.content?.slice(0, 20) || "Text";

  // Load font
  const fontName = await loadFont(
    pen.fontFamily,
    pen.fontWeight,
    pen.fontStyle === "italic"
  );
  node.fontName = fontName;

  // Set content
  node.characters = pen.content || "";

  // Font size
  if (pen.fontSize) node.fontSize = pen.fontSize;

  // Letter spacing
  if (pen.letterSpacing !== undefined) {
    node.letterSpacing = { value: pen.letterSpacing, unit: "PIXELS" };
  }

  // Line height
  if (pen.lineHeight !== undefined) {
    node.lineHeight = { value: pen.lineHeight * 100, unit: "PERCENT" };
  }

  // Text alignment
  if (pen.textAlign) {
    const alignMap: Record<string, "LEFT" | "CENTER" | "RIGHT" | "JUSTIFIED"> = {
      left: "LEFT",
      center: "CENTER",
      right: "RIGHT",
      justify: "JUSTIFIED",
    };
    node.textAlignHorizontal = alignMap[pen.textAlign] || "LEFT";
  }

  if (pen.textAlignVertical) {
    const vAlignMap: Record<string, "TOP" | "CENTER" | "BOTTOM"> = {
      top: "TOP",
      middle: "CENTER",
      bottom: "BOTTOM",
    };
    node.textAlignVertical = vAlignMap[pen.textAlignVertical] || "TOP";
  }

  // Text auto-resize (textGrowth)
  if (pen.textGrowth === "fixed-width") {
    node.textAutoResize = "HEIGHT";
    if (typeof pen.width === "number") node.resize(pen.width, node.height);
  } else if (pen.textGrowth === "fixed-width-height") {
    node.textAutoResize = "NONE";
    if (typeof pen.width === "number" && typeof pen.height === "number") {
      node.resize(pen.width, pen.height);
    }
  } else {
    node.textAutoResize = "WIDTH_AND_HEIGHT";
  }

  // Fill (text color)
  const fills = convertFills(pen.fill);
  if (fills.length > 0) node.fills = fills;

  // Opacity
  if (pen.opacity !== undefined) node.opacity = pen.opacity;

  // Handle fill_container width in auto-layout parents
  if (pen.width === "fill_container") {
    trySetLayoutSizing(node, "layoutSizingHorizontal", "FILL");
  }

  parent.appendChild(node);
  return node;
}

function createRectangle(pen: PenNode, parent: BaseNode & ChildrenMixin): RectangleNode {
  const node = figma.createRectangle();
  node.name = pen.name || "Rectangle";

  node.resize(
    typeof pen.width === "number" ? pen.width : 100,
    typeof pen.height === "number" ? pen.height : 100
  );

  const fills = convertFills(pen.fill);
  node.fills = fills.length > 0 ? fills : [];

  if (pen.stroke) applyStroke(node, pen.stroke);
  applyCornerRadius(node, pen.cornerRadius);

  if (pen.opacity !== undefined) node.opacity = pen.opacity;

  if (pen.x !== undefined) node.x = pen.x;
  if (pen.y !== undefined) node.y = pen.y;

  parent.appendChild(node);
  return node;
}

function createEllipse(pen: PenNode, parent: BaseNode & ChildrenMixin): EllipseNode {
  const node = figma.createEllipse();
  node.name = pen.name || "Ellipse";

  node.resize(
    typeof pen.width === "number" ? pen.width : 40,
    typeof pen.height === "number" ? pen.height : 40
  );

  const fills = convertFills(pen.fill);
  node.fills = fills.length > 0 ? fills : [];

  if (pen.stroke) applyStroke(node, pen.stroke as any);

  if (pen.opacity !== undefined) node.opacity = pen.opacity;

  if (pen.x !== undefined) node.x = pen.x;
  if (pen.y !== undefined) node.y = pen.y;

  parent.appendChild(node);
  return node;
}

async function createIconPlaceholder(pen: PenNode, parent: BaseNode & ChildrenMixin): Promise<FrameNode> {
  const size = typeof pen.width === "number" ? pen.width : 24;
  const node = figma.createFrame();
  node.name = `icon/${pen.iconFontName || "unknown"}`;
  node.resize(size, typeof pen.height === "number" ? pen.height : size);
  node.layoutMode = "VERTICAL";
  node.primaryAxisAlignItems = "CENTER";
  node.counterAxisAlignItems = "CENTER";

  // Use the fill color as background tint
  const fills = convertFills(pen.fill);
  if (fills.length > 0) {
    // Create a subtle background from the icon color
    const paint = fills[0] as SolidPaint;
    if (paint.type === "SOLID") {
      node.fills = [{ ...paint, opacity: (paint.opacity ?? 1) * 0.15 }];
    }
  } else {
    node.fills = [];
  }

  node.cornerRadius = size / 2;
  node.clipsContent = true;

  // Add icon name as tiny label
  const label = figma.createText();
  const fontName = await loadFont("Inter", "400", false);
  label.fontName = fontName;
  label.characters = pen.iconFontName || "?";
  label.fontSize = Math.max(7, Math.min(size * 0.3, 10));
  const textFills = convertFills(pen.fill);
  if (textFills.length > 0) label.fills = textFills;
  label.textAutoResize = "WIDTH_AND_HEIGHT";
  node.appendChild(label);

  if (pen.opacity !== undefined) node.opacity = pen.opacity;
  if (pen.x !== undefined) node.x = pen.x;
  if (pen.y !== undefined) node.y = pen.y;

  parent.appendChild(node);
  return node;
}

// -- Main dispatcher --

export async function convertNode(pen: PenNode, parent: BaseNode & ChildrenMixin): Promise<SceneNode | null> {
  if (pen.enabled === false) return null;
  if (typeof pen === "string") return null; // Skip "..." truncation

  switch (pen.type) {
    case "frame":
    case "group":
      return createFrame(pen, parent);
    case "text":
    case "note":
    case "context":
    case "prompt":
      return createText(pen, parent);
    case "rectangle":
    case "line":
      return createRectangle(pen, parent);
    case "ellipse":
      return createEllipse(pen, parent);
    case "icon_font":
      return createIconPlaceholder(pen, parent);
    case "path":
    case "polygon":
      // Placeholder for complex shapes
      return createRectangle(pen, parent);
    default:
      console.log(`Skipping unknown node type: ${pen.type}`);
      return null;
  }
}
