// ESLint flat config. Run: npx eslint@10 "src-*.js"
// The modules are classic scripts that share one scope (build.py wraps them in a single
// closure), so names declared at the top level of any module are treated as globals here.
import { readFileSync, readdirSync } from "node:fs";

const MODULES = readdirSync(new URL(".", import.meta.url)).filter((f) =>
  /^src-\d\d-.*\.js$/.test(f)
);

// Top-level declarations: Prettier keeps them at column 0, and further declarators of a
// top-level `var` on lines indented by exactly two spaces.
function topLevelNames(code) {
  const names = new Set();
  let inVar = false;
  for (const line of code.split("\n")) {
    let m = /^(?:async\s+)?function\s*\*?\s*([A-Za-z_$][\w$]*)/.exec(line);
    if (m) names.add(m[1]);
    m = /^(?:var|let|const)\s+([A-Za-z_$][\w$]*)/.exec(line);
    if (m) {
      names.add(m[1]);
      inVar = !/;\s*$/.test(line);
      continue;
    }
    if (inVar) {
      m = /^ {2}([A-Za-z_$][\w$]*)(?: =|,|;)/.exec(line);
      if (m) names.add(m[1]);
      if (/^\S/.test(line) || /^ {2}\S.*;\s*$/.test(line)) inVar = false;
    }
  }
  return names;
}

const shared = {};
for (const f of MODULES) {
  for (const n of topLevelNames(readFileSync(new URL(f, import.meta.url), "utf8")))
    shared[n] = "writable";
}

// Browser APIs the app uses, and libraries it loads at runtime (Capacitor, CesiumJS, hls.js,
// TensorFlow COCO-SSD, Google Maps, MapLibre GL, satellite.js).
const BROWSER =
  `AbortController Blob DOMParser Event FormData Image SpeechSynthesisUtterance URL WebSocket btoa caches cancelAnimationFrame clearInterval clearTimeout document fetch indexedDB innerHeight innerWidth localStorage location navigator performance requestAnimationFrame setInterval setTimeout speechSynthesis window
  Capacitor Cesium Hls cocoSsd google maplibregl satellite`
    .split(/\s+/)
    .filter(Boolean);
const browser = Object.fromEntries(BROWSER.map((n) => [n, "readonly"]));

const RECOMMENDED = `constructor-super for-direction getter-return no-async-promise-executor
  no-case-declarations no-class-assign no-compare-neg-zero no-cond-assign no-const-assign
  no-constant-binary-expression no-constant-condition no-control-regex no-debugger no-delete-var
  no-dupe-args no-dupe-class-members no-dupe-else-if no-dupe-keys no-duplicate-case
  no-empty-character-class no-empty-pattern no-empty-static-block no-ex-assign
  no-extra-boolean-cast no-fallthrough no-func-assign no-global-assign no-invalid-regexp
  no-irregular-whitespace no-loss-of-precision no-misleading-character-class
  no-new-native-nonconstructor no-nonoctal-decimal-escape no-obj-calls no-octal
  no-prototype-builtins no-redeclare no-regex-spaces no-self-assign no-setter-return
  no-shadow-restricted-names no-sparse-arrays no-this-before-super no-undef
  no-unexpected-multiline no-unreachable no-unsafe-finally no-unsafe-negation
  no-unsafe-optional-chaining no-unused-labels no-unused-private-class-members
  no-useless-backreference no-useless-catch no-useless-escape no-with require-yield use-isnan
  valid-typeof`
  .split(/\s+/)
  .filter(Boolean);

export default [
  {
    files: ["src-*.js"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "script",
      globals: { ...browser, ...shared }
    },
    rules: {
      ...Object.fromEntries(RECOMMENDED.map((r) => [r, "error"])),
      "no-empty": ["error", { allowEmptyCatch: true }],
      // Modules are linted one at a time against the shared names, so a module may declare
      // a name that is also listed as shared.
      "no-redeclare": ["error", { builtinGlobals: false }],
      // Top-level names are shared between modules, so only local variables are checked.
      "no-unused-vars": ["error", { vars: "local", args: "none", caughtErrors: "none" }]
    }
  }
];
