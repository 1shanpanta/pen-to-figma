import { PenNode, PenFill, PenStroke, PenEffect } from "./types";
import { parseHexColor, toSolidPaint, toGradientTransform } from "./colors";
import { loadFont } from "./fonts";

// -- Fill conversion --

function convertSingleFill(fill: PenFill): Paint | null {
  if (typeof fill === "string") {
    if (fill.length < 4) return null;
    var parsed = parseHexColor(fill);
    if (parsed.a === 0) return null;
    return { type: "SOLID", color: { r: parsed.r, g: parsed.g, b: parsed.b }, opacity: parsed.a } as SolidPaint;
  }

  if (typeof fill === "object" && fill !== null) {
    if (fill.type === "color") {
      if (fill.enabled === false) return null;
      var c = parseHexColor(fill.color);
      return { type: "SOLID", color: { r: c.r, g: c.g, b: c.b }, opacity: c.a } as SolidPaint;
    }

    if (fill.type === "gradient") {
      if (fill.enabled === false) return null;
      var stops: ColorStop[] = (fill.colors || []).map(function(cs) {
        var gc = parseHexColor(cs.color);
        return { color: { r: gc.r, g: gc.g, b: gc.b, a: gc.a }, position: cs.position };
      });
      var gradientType =
        fill.gradientType === "radial" ? "GRADIENT_RADIAL" :
        fill.gradientType === "angular" ? "GRADIENT_ANGULAR" : "GRADIENT_LINEAR";
      return {
        type: gradientType,
        gradientStops: stops,
        gradientTransform: toGradientTransform(fill.rotation || 0, fill.center, fill.size),
        opacity: fill.opacity != null ? fill.opacity : 1,
      } as GradientPaint;
    }

    if (fill.type === "image") {
      return { type: "SOLID", color: { r: 0.5, g: 0.5, b: 0.5 }, opacity: 0.3 } as SolidPaint;
    }
  }

  return null;
}

function convertFills(fill: PenFill | PenFill[] | undefined): Paint[] {
  if (!fill) return [];
  var fills = Array.isArray(fill) ? fill : [fill];
  return fills.map(convertSingleFill).filter(Boolean) as Paint[];
}

// -- Stroke conversion --

function applyStroke(node: any, stroke: PenStroke) {
  var paints = convertFills(stroke.fill);
  if (paints.length > 0) node.strokes = paints;

  if (typeof stroke.thickness === "number") {
    node.strokeWeight = stroke.thickness;
  } else if (typeof stroke.thickness === "object") {
    try {
      node.strokeTopWeight = stroke.thickness.top || 0;
      node.strokeRightWeight = stroke.thickness.right || 0;
      node.strokeBottomWeight = stroke.thickness.bottom || 0;
      node.strokeLeftWeight = stroke.thickness.left || 0;
    } catch (_e) {
      // Per-side strokes not supported on this node type
    }
  }

  if (stroke.align) {
    try {
      var alignMap: Record<string, string> = { inside: "INSIDE", center: "CENTER", outside: "OUTSIDE" };
      node.strokeAlign = alignMap[stroke.align] || "INSIDE";
    } catch (_e) { /* skip */ }
  }
}

// -- Effect conversion --

function convertEffects(effects: PenEffect | PenEffect[] | undefined): Effect[] {
  if (!effects) return [];
  var list = Array.isArray(effects) ? effects : [effects];
  var result: Effect[] = [];

  for (var i = 0; i < list.length; i++) {
    var e = list[i];
    if (e.enabled === false) continue;

    if (e.type === "shadow") {
      var sc = parseHexColor(e.color || "#00000040");
      result.push({
        type: e.shadowType === "inner" ? "INNER_SHADOW" : "DROP_SHADOW",
        color: { r: sc.r, g: sc.g, b: sc.b, a: sc.a },
        offset: { x: e.offset ? e.offset.x : 0, y: e.offset ? e.offset.y : 4 },
        radius: e.blur != null ? e.blur : 8,
        spread: e.spread || 0,
        visible: true,
        blendMode: "NORMAL",
      } as any);
    }
    if (e.type === "blur") {
      result.push({ type: "LAYER_BLUR", radius: e.radius || 10, visible: true } as BlurEffect);
    }
    if (e.type === "background_blur") {
      result.push({ type: "BACKGROUND_BLUR", radius: e.radius || 10, visible: true } as BlurEffect);
    }
  }
  return result;
}

// -- Corner radius --

function applyCornerRadius(node: any, radius: number | [number, number, number, number] | undefined) {
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

// -- Common visual properties (fills, strokes, effects, radius, opacity) --

function applyVisuals(node: any, pen: PenNode) {
  var fills = convertFills(pen.fill);
  node.fills = fills.length > 0 ? fills : [];

  if (pen.stroke) applyStroke(node, pen.stroke);
  if (pen.cornerRadius !== undefined) applyCornerRadius(node, pen.cornerRadius);
  if (pen.effect) node.effects = convertEffects(pen.effect);
  if (pen.opacity !== undefined) node.opacity = pen.opacity;
}

// -- Safe layout sizing setter --

function setSizing(node: SceneNode, axis: "horizontal" | "vertical", value: "FILL" | "HUG" | "FIXED") {
  var prop = axis === "horizontal" ? "layoutSizingHorizontal" : "layoutSizingVertical";
  try {
    (node as any)[prop] = value;
  } catch (_e) {
    // Parent isn't auto-layout, skip
  }
}

// -- Layout --

function applyLayout(node: FrameNode, pen: PenNode) {
  // .pen spec: frames default to horizontal, groups default to none
  var defaultLayout = pen.type === "group" ? "none" : "horizontal";
  var layoutValue = pen.layout || defaultLayout;

  if (layoutValue === "vertical") {
    node.layoutMode = "VERTICAL";
  } else if (layoutValue === "horizontal") {
    node.layoutMode = "HORIZONTAL";
  } else {
    node.layoutMode = "NONE";
    return;
  }

  if (pen.gap !== undefined) node.itemSpacing = pen.gap;

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

  var justifyMap: Record<string, string> = {
    start: "MIN", center: "CENTER", end: "MAX",
    space_between: "SPACE_BETWEEN", space_around: "SPACE_BETWEEN",
  };
  if (pen.justifyContent) {
    node.primaryAxisAlignItems = (justifyMap[pen.justifyContent] || "MIN") as any;
  }

  var alignMap: Record<string, string> = { start: "MIN", center: "CENTER", end: "MAX" };
  if (pen.alignItems) {
    node.counterAxisAlignItems = (alignMap[pen.alignItems] || "MIN") as any;
  }
}

// -- Sizing helpers --

function getSizingValue(value: number | string | undefined): "FILL" | "HUG" | "FIXED" | null {
  if (value === "fill_container") return "FILL";
  if (typeof value === "string" && value.startsWith("fit_content")) return "HUG";
  if (typeof value === "number") return "FIXED";
  return null; // undefined = use default
}

// -- Node creators --

async function createFrame(pen: PenNode, parent: BaseNode & ChildrenMixin): Promise<FrameNode> {
  var node = figma.createFrame();
  node.name = pen.name || pen.id || "Frame";
  var isTopLevel = parent === figma.currentPage;

  var widthSizing = getSizingValue(pen.width);
  var heightSizing = getSizingValue(pen.height);
  var numWidth = typeof pen.width === "number" ? pen.width : 0;
  var numHeight = typeof pen.height === "number" ? pen.height : 0;

  // Initial size: use explicit dimensions, or minimal placeholder for FILL, or auto for HUG
  node.resize(
    numWidth > 0 ? numWidth : 10,
    numHeight > 0 ? numHeight : 10
  );

  // Set layout mode (must happen before sizing)
  applyLayout(node, pen);

  // Apply visual properties
  applyVisuals(node, pen);

  // Clipping
  if (pen.clip) node.clipsContent = true;

  // STEP 1: Append to parent (MUST happen before setting FILL/HUG)
  parent.appendChild(node);

  // STEP 2: Set sizing AFTER append
  if (node.layoutMode !== "NONE") {
    if (isTopLevel) {
      // Top-level screens: always FIXED
      setSizing(node, "horizontal", "FIXED");
      setSizing(node, "vertical", "FIXED");
    }
  }

  if (!isTopLevel) {
    // Horizontal sizing
    if (widthSizing === "FILL") {
      setSizing(node, "horizontal", "FILL");
    } else if (widthSizing === "HUG" || widthSizing === null) {
      setSizing(node, "horizontal", "HUG");
    } else if (widthSizing === "FIXED") {
      setSizing(node, "horizontal", "FIXED");
    }

    // Vertical sizing
    if (heightSizing === "FILL") {
      setSizing(node, "vertical", "FILL");
    } else if (heightSizing === "HUG" || heightSizing === null) {
      setSizing(node, "vertical", "HUG");
    } else if (heightSizing === "FIXED") {
      setSizing(node, "vertical", "FIXED");
    }
  }

  // STEP 3: Handle absolute positioning
  if (pen.layoutPosition === "absolute") {
    try { (node as any).layoutPositioning = "ABSOLUTE"; } catch (_e) { /* skip */ }
    if (pen.x !== undefined) node.x = pen.x;
    if (pen.y !== undefined) node.y = pen.y;
  } else if (isTopLevel) {
    node.x = pen.x || 0;
    node.y = pen.y || 0;
  }

  // STEP 4: Build children
  if (pen.children) {
    for (var ci = 0; ci < pen.children.length; ci++) {
      var child = pen.children[ci];
      if (typeof child === "string") continue;
      await convertNode(child, node);
    }
  }

  return node;
}

async function createText(pen: PenNode, parent: BaseNode & ChildrenMixin): Promise<TextNode> {
  var node = figma.createText();
  node.name = pen.name || (pen.content ? pen.content.slice(0, 30) : "Text");

  // Load font
  var fontName = await loadFont(pen.fontFamily, pen.fontWeight, pen.fontStyle === "italic");
  node.fontName = fontName;
  node.characters = pen.content || "";

  if (pen.fontSize) node.fontSize = pen.fontSize;

  if (pen.letterSpacing !== undefined) {
    node.letterSpacing = { value: pen.letterSpacing, unit: "PIXELS" };
  }

  if (pen.lineHeight !== undefined) {
    node.lineHeight = { value: pen.lineHeight * 100, unit: "PERCENT" };
  }

  if (pen.textAlign) {
    var hAlignMap: Record<string, string> = { left: "LEFT", center: "CENTER", right: "RIGHT", justify: "JUSTIFIED" };
    node.textAlignHorizontal = (hAlignMap[pen.textAlign] || "LEFT") as any;
  }

  if (pen.textAlignVertical) {
    var vAlignMap: Record<string, string> = { top: "TOP", middle: "CENTER", bottom: "BOTTOM" };
    node.textAlignVertical = (vAlignMap[pen.textAlignVertical] || "TOP") as any;
  }

  // Text auto-resize: depends on textGrowth AND width
  var wantsFill = pen.width === "fill_container";
  if (pen.textGrowth === "fixed-width" || wantsFill) {
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
  var fills = convertFills(pen.fill);
  if (fills.length > 0) node.fills = fills;

  if (pen.opacity !== undefined) node.opacity = pen.opacity;

  // APPEND first, then set layout sizing
  parent.appendChild(node);

  if (wantsFill) {
    setSizing(node, "horizontal", "FILL");
  }

  return node;
}

function createRectangle(pen: PenNode, parent: BaseNode & ChildrenMixin): RectangleNode {
  var node = figma.createRectangle();
  node.name = pen.name || "Rectangle";

  node.resize(
    typeof pen.width === "number" ? pen.width : 100,
    typeof pen.height === "number" ? pen.height : 100
  );

  applyVisuals(node, pen);

  // Append first
  parent.appendChild(node);

  // Handle fill_container sizing
  if (pen.width === "fill_container") setSizing(node, "horizontal", "FILL");
  if (pen.height === "fill_container") setSizing(node, "vertical", "FILL");

  // Position (for absolute children)
  if (pen.x !== undefined) node.x = pen.x;
  if (pen.y !== undefined) node.y = pen.y;

  if (pen.rotation !== undefined) node.rotation = pen.rotation;

  return node;
}

function createEllipse(pen: PenNode, parent: BaseNode & ChildrenMixin): EllipseNode {
  var node = figma.createEllipse();
  node.name = pen.name || "Ellipse";

  node.resize(
    typeof pen.width === "number" ? pen.width : 40,
    typeof pen.height === "number" ? pen.height : 40
  );

  applyVisuals(node, pen);

  parent.appendChild(node);

  if (pen.width === "fill_container") setSizing(node, "horizontal", "FILL");
  if (pen.height === "fill_container") setSizing(node, "vertical", "FILL");

  if (pen.x !== undefined) node.x = pen.x;
  if (pen.y !== undefined) node.y = pen.y;

  if (pen.rotation !== undefined) node.rotation = pen.rotation;

  return node;
}

async function createIconPlaceholder(pen: PenNode, parent: BaseNode & ChildrenMixin): Promise<FrameNode> {
  var size = typeof pen.width === "number" ? pen.width : 24;
  var node = figma.createFrame();
  node.name = "icon/" + (pen.iconFontName || "unknown");
  node.resize(size, typeof pen.height === "number" ? pen.height : size);
  node.layoutMode = "VERTICAL";
  node.primaryAxisAlignItems = "CENTER";
  node.counterAxisAlignItems = "CENTER";

  var fills = convertFills(pen.fill);
  if (fills.length > 0) {
    var paint = fills[0];
    if (paint && paint.type === "SOLID") {
      var solid = paint as SolidPaint;
      node.fills = [{ type: "SOLID", color: solid.color, opacity: (solid.opacity || 1) * 0.15 }];
    }
  } else {
    node.fills = [];
  }

  node.cornerRadius = size / 2;
  node.clipsContent = true;
  if (pen.opacity !== undefined) node.opacity = pen.opacity;

  // Append first
  parent.appendChild(node);

  // Add icon name label
  var label = figma.createText();
  var labelFont = await loadFont("Inter", "400", false);
  label.fontName = labelFont;
  label.characters = pen.iconFontName || "?";
  label.fontSize = Math.max(7, Math.min(size * 0.3, 10));
  var textFills = convertFills(pen.fill);
  if (textFills.length > 0) label.fills = textFills;
  label.textAutoResize = "WIDTH_AND_HEIGHT";
  node.appendChild(label);

  // Handle positioning
  if (pen.layoutPosition === "absolute") {
    try { (node as any).layoutPositioning = "ABSOLUTE"; } catch (_e) { /* skip */ }
  }
  if (pen.x !== undefined) node.x = pen.x;
  if (pen.y !== undefined) node.y = pen.y;

  return node;
}

// -- Main dispatcher --

export async function convertNode(pen: PenNode, parent: BaseNode & ChildrenMixin): Promise<SceneNode | null> {
  if (pen.enabled === false) return null;
  if (typeof pen === "string") return null;

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
      return createRectangle(pen, parent);
    default:
      return null;
  }
}
