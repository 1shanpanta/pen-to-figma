// Validates that the .pen JSON data is well-formed and the converter
// won't crash on any node. Runs WITHOUT Figma's runtime.

import { readFileSync, readdirSync } from "fs";
import { join, resolve } from "path";

const RED = "\x1b[31m";
const GREEN = "\x1b[32m";
const YELLOW = "\x1b[33m";
const RESET = "\x1b[0m";

let passed = 0;
let failed = 0;

function assert(condition, label) {
  if (condition) {
    passed++;
  } else {
    failed++;
    console.error(`${RED}FAIL${RESET} ${label}`);
  }
}

// -- Test 1: JSON parses correctly --
const jsonPath = process.argv[2];
if (!jsonPath) {
  console.error("Usage: node test/validate-json.mjs <path-to-screens.json>");
  process.exit(1);
}

let screens;
try {
  const raw = readFileSync(resolve(jsonPath), "utf-8");
  screens = JSON.parse(raw);
  assert(true, "JSON parses");
} catch (e) {
  console.error(`${RED}FAIL${RESET} JSON parse: ${e.message}`);
  process.exit(1);
}

// -- Test 2: Top-level is an array --
assert(Array.isArray(screens), "Top-level is array");
console.log(`Found ${screens.length} screens`);

// -- Test 3: Each screen has required fields --
const VALID_TYPES = new Set([
  "frame", "group", "text", "rectangle", "ellipse", "line",
  "polygon", "path", "icon_font", "note", "context", "prompt", "ref",
]);

function validateNode(node, path) {
  if (typeof node === "string") return; // "..." truncation marker

  assert(typeof node === "object" && node !== null, `${path}: is object`);
  if (typeof node !== "object" || node === null) return;

  assert(typeof node.type === "string", `${path}: has type`);
  assert(VALID_TYPES.has(node.type), `${path}: valid type "${node.type}"`);
  assert(typeof node.id === "string", `${path}: has id`);

  // Validate fills are proper format
  if (node.fill) {
    const fills = Array.isArray(node.fill) ? node.fill : [node.fill];
    for (const fill of fills) {
      if (typeof fill === "string") {
        assert(
          fill.match(/^#[0-9a-fA-F]{3,8}$/),
          `${path}: valid hex color "${fill}"`
        );
      } else if (typeof fill === "object") {
        assert(
          ["color", "gradient", "image", "mesh_gradient"].includes(fill.type),
          `${path}: valid fill type "${fill.type}"`
        );
      }
    }
  }

  // Validate font weight is a string number (not "bold", "semibold" etc)
  if (node.fontWeight) {
    const isNumeric = /^\d+$/.test(node.fontWeight);
    const isNamed = ["normal", "bold"].includes(node.fontWeight);
    assert(
      isNumeric || isNamed,
      `${path}: fontWeight "${node.fontWeight}" is numeric or named`
    );
  }

  // Validate layout values
  if (node.layout) {
    assert(
      ["none", "vertical", "horizontal"].includes(node.layout),
      `${path}: valid layout "${node.layout}"`
    );
  }

  // Validate justifyContent
  if (node.justifyContent) {
    assert(
      ["start", "center", "end", "space_between", "space_around"].includes(node.justifyContent),
      `${path}: valid justifyContent "${node.justifyContent}"`
    );
  }

  // Validate alignItems
  if (node.alignItems) {
    assert(
      ["start", "center", "end"].includes(node.alignItems),
      `${path}: valid alignItems "${node.alignItems}"`
    );
  }

  // Validate width/height types
  if (node.width !== undefined) {
    const validWidth =
      typeof node.width === "number" ||
      node.width === "fill_container" ||
      (typeof node.width === "string" && node.width.startsWith("fit_content"));
    assert(validWidth, `${path}: valid width "${node.width}"`);
  }

  if (node.height !== undefined) {
    const validHeight =
      typeof node.height === "number" ||
      node.height === "fill_container" ||
      (typeof node.height === "string" && node.height.startsWith("fit_content"));
    assert(validHeight, `${path}: valid height "${node.height}"`);
  }

  // Validate stroke
  if (node.stroke && typeof node.stroke === "object") {
    if (node.stroke.align) {
      assert(
        ["inside", "center", "outside"].includes(node.stroke.align),
        `${path}: valid stroke align "${node.stroke.align}"`
      );
    }
  }

  // Recurse into children
  if (node.children && Array.isArray(node.children)) {
    for (let i = 0; i < node.children.length; i++) {
      validateNode(node.children[i], `${path}[${i}]`);
    }
  }
}

for (let i = 0; i < screens.length; i++) {
  const screen = screens[i];
  const name = screen.name || screen.id || `screen-${i}`;
  console.log(`\nValidating: ${name}`);
  validateNode(screen, name);
}

// -- Test 4: No variable shadowing in compiled output --
try {
  const compiled = readFileSync(
    resolve(join(jsonPath, "../../pen-to-figma/dist/code.js")),
    "utf-8"
  );
  // This is a heuristic check, not exhaustive
  const hasTDZBug = /var \w+2 =/.test(compiled) && /\w+2\.data/.test(compiled);
  if (hasTDZBug) {
    console.warn(`${YELLOW}WARN${RESET} Possible TDZ variable shadowing in compiled output`);
  }
} catch (_e) {
  // Can't find compiled output, skip
}

// -- Summary --
console.log(`\n${"=".repeat(40)}`);
if (failed === 0) {
  console.log(`${GREEN}ALL ${passed} CHECKS PASSED${RESET}`);
} else {
  console.log(`${RED}${failed} FAILED${RESET}, ${GREEN}${passed} passed${RESET}`);
  process.exit(1);
}
