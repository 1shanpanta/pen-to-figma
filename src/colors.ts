export function parseHexColor(hex: string): { r: number; g: number; b: number; a: number } {
  let clean = hex.replace("#", "");

  // Expand 3-digit hex: #ABC → AABBCC
  if (clean.length === 3) {
    clean = clean[0] + clean[0] + clean[1] + clean[1] + clean[2] + clean[2];
  }

  const r = parseInt(clean.slice(0, 2), 16) / 255;
  const g = parseInt(clean.slice(2, 4), 16) / 255;
  const b = parseInt(clean.slice(4, 6), 16) / 255;
  const a = clean.length >= 8 ? parseInt(clean.slice(6, 8), 16) / 255 : 1;

  return { r, g, b, a };
}

export function toFigmaColor(hex: string): { color: RGB; opacity: number } {
  const { r, g, b, a } = parseHexColor(hex);
  return { color: { r, g, b }, opacity: a };
}

export function toSolidPaint(hex: string): SolidPaint {
  const { color, opacity } = toFigmaColor(hex);
  return { type: "SOLID", color, opacity };
}

export function toGradientTransform(
  rotation: number,
  _center?: { x: number; y: number },
  _size?: { width?: number; height?: number }
): Transform {
  // Convert rotation degrees to a 2x3 affine matrix
  // Figma gradient transforms map from gradient space [0,1]x[0,1] to node space
  const radians = ((rotation || 0) * Math.PI) / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);

  // Default: top-to-bottom gradient (0° = top to bottom in .pen)
  // Figma gradient goes from (0,0) to (1,0) by default, rotated by the transform
  return [
    [cos, sin, 0.5 - cos * 0.5 - sin * 0.5],
    [-sin, cos, 0.5 + sin * 0.5 - cos * 0.5],
  ];
}
