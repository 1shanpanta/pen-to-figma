export interface PenNode {
  type: string;
  id: string;
  name?: string;
  x?: number;
  y?: number;
  width?: number | string;
  height?: number | string;
  fill?: PenFill | PenFill[];
  stroke?: PenStroke;
  cornerRadius?: number | [number, number, number, number];
  layout?: "none" | "vertical" | "horizontal";
  gap?: number;
  padding?: number | [number, number] | [number, number, number, number];
  justifyContent?: "start" | "center" | "end" | "space_between" | "space_around";
  alignItems?: "start" | "center" | "end";
  clip?: boolean;
  opacity?: number;
  rotation?: number;
  enabled?: boolean;
  layoutPosition?: "auto" | "absolute";
  children?: PenNode[];

  // Text props
  content?: string;
  fontFamily?: string;
  fontSize?: number;
  fontWeight?: string;
  fontStyle?: string;
  letterSpacing?: number;
  lineHeight?: number;
  textAlign?: "left" | "center" | "right" | "justify";
  textAlignVertical?: "top" | "middle" | "bottom";
  textGrowth?: "auto" | "fixed-width" | "fixed-width-height";

  // Icon props
  iconFontFamily?: string;
  iconFontName?: string;

  // Ellipse props
  innerRadius?: number;
  startAngle?: number;
  sweepAngle?: number;

  // Effect props
  effect?: PenEffect | PenEffect[];
}

export type PenFill =
  | string
  | { type: "color"; color: string; enabled?: boolean; blendMode?: string }
  | {
      type: "gradient";
      gradientType?: "linear" | "radial" | "angular";
      rotation?: number;
      center?: { x: number; y: number };
      size?: { width?: number; height?: number };
      colors: { color: string; position: number }[];
      opacity?: number;
      enabled?: boolean;
    }
  | { type: "image"; url: string; mode?: string; opacity?: number; enabled?: boolean };

export interface PenStroke {
  align?: "inside" | "center" | "outside";
  thickness?: number | { top?: number; right?: number; bottom?: number; left?: number };
  fill?: PenFill | PenFill[];
  join?: string;
  cap?: string;
  dashPattern?: number[];
}

export interface PenEffect {
  type: "shadow" | "blur" | "background_blur";
  enabled?: boolean;
  shadowType?: "inner" | "outer";
  offset?: { x: number; y: number };
  spread?: number;
  blur?: number;
  color?: string;
  radius?: number;
}

export interface PenDocument {
  children: PenNode[];
}
