// ESLint for Task Desk. `npm run lint` checks, `npm run lint:fix` repairs what it can.
// Three worlds: the Electron main process and tests (Node), the renderer pages
// (browser, with the `desk` API that preload.js exposes), and preload (both).
const js = require('@eslint/js');
const globals = require('globals');

// Top-level helpers in src/renderer/ui.js that the page scripts use (see /* exported */ there).
const UI_HELPERS = [
  'icon',
  'h',
  'laneColor',
  'laneName',
  'TYPE_LABEL',
  'tileClass',
  'typeHint',
  'fmtMin',
  'toast',
  'actBtn',
  'popMenu',
  'placePopup',
  'applyLook',
  'lookPanel',
  'autosave',
  'saveStatus',
  'isDark',
  'LOOK',
  'THEMES',
  'MATERIALS',
  'MOVING',
];

module.exports = [
  { ignores: ['node_modules/**', 'data/**', 'test/shots/**', 'test-fixtures/**'] },
  js.configs.recommended,
  {
    files: ['src/main/**/*.js', 'src/mcp/**/*.js', 'eslint.config.js'],
    languageOptions: { ecmaVersion: 2024, sourceType: 'commonjs', globals: { ...globals.node } },
  },
  {
    // ui.js is loaded first on every page and shares these helpers with the page's own script.
    files: ['src/renderer/**/*.js'],
    languageOptions: { ecmaVersion: 2024, sourceType: 'script', globals: { ...globals.browser, desk: 'readonly' } },
  },
  {
    files: ['src/renderer/box.js', 'src/renderer/project.js', 'src/renderer/task.js'],
    languageOptions: { globals: Object.fromEntries(UI_HELPERS.map((n) => [n, 'readonly'])) },
  },
  {
    // Tests drive the pages with page.evaluate(), so browser code sits inside Node code.
    files: ['test/**/*.js'],
    languageOptions: { ecmaVersion: 2024, sourceType: 'commonjs', globals: { ...globals.node, ...globals.browser, desk: 'readonly' } },
  },
  {
    // task.html loads xterm.js and its fit addon as plain scripts.
    files: ['src/renderer/task.js'],
    languageOptions: { globals: { Terminal: 'readonly', FitAddon: 'readonly' } },
  },
  {
    files: ['src/preload.js'],
    languageOptions: { ecmaVersion: 2024, sourceType: 'commonjs', globals: { ...globals.node, ...globals.browser } },
  },
  {
    rules: {
      // The code deliberately swallows errors in a few "best effort" spots (see CONTRIBUTING.md).
      'no-empty': ['error', { allowEmptyCatch: true }],
      'no-unused-vars': ['error', { args: 'none', caughtErrors: 'none', varsIgnorePattern: '^_' }],
      // Terminal output is full of escape codes, and `let x = []; try { x = read() } catch { return }` is the house style.
      'no-control-regex': 'off',
      'no-useless-assignment': 'off',
    },
  },
];
