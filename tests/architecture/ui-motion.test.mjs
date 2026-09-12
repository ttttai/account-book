import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import test from "node:test";

const root = new URL("../../", import.meta.url);

async function read(path) {
  return readFile(new URL(path, root), "utf8");
}

// 各機能のpresentationディレクトリにあるCSS Modulesを列挙する
async function listModuleCss() {
  const modulesDirectory = new URL("src/modules/", root);
  const modules = await readdir(modulesDirectory);
  const files = [];
  for (const moduleName of modules) {
    const presentation = new URL(
      `${moduleName}/presentation/`,
      modulesDirectory,
    );
    let entries = [];
    try {
      entries = await readdir(presentation);
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (entry.endsWith(".module.css")) {
        files.push(`src/modules/${moduleName}/presentation/${entry}`);
      }
    }
  }
  return files;
}

// 先頭の宣言ブロック（selector { ... }）を、prettierの折り返しを空白1つへ正規化して返す
function readRule(css, selector) {
  const start = css.indexOf(`${selector} {`);
  assert.notEqual(start, -1, `${selector}の宣言が必要です`);
  const end = css.indexOf("}", start);
  return css.slice(start, end).replace(/\s+/g, " ");
}

// CSS値の中の時間リテラル（120ms、0.2sなど）
const literalDuration = /(^|[\s,])\d*\.?\d+m?s(?=[\s,;]|$)/;

test("motionのdesign tokenをglobalだけで定義し、200ms以下に限定する (NFR-UI-009, 03 §14)", async () => {
  const styles = await read("src/app/styles.css");
  const rootRule = readRule(styles, ":root");
  const short = rootRule.match(/--motion-duration-short: (\d+)ms/);
  const medium = rootRule.match(/--motion-duration-medium: (\d+)ms/);
  assert.ok(short, "--motion-duration-shortを:rootで定義する");
  assert.ok(medium, "--motion-duration-mediumを:rootで定義する");
  assert.ok(Number(short[1]) <= 200, "shortは200ms以下にする");
  assert.ok(Number(medium[1]) <= 200, "mediumは200ms以下にする");
  assert.ok(Number(short[1]) < Number(medium[1]), "shortはmediumより短くする");
  assert.match(rootRule, /--motion-ease-out: cubic-bezier\(/);

  for (const path of await listModuleCss()) {
    const css = await read(path);
    assert.doesNotMatch(
      css,
      /--motion-[a-z-]+:/,
      `${path}でmotion tokenを再定義しない`,
    );
  }
});

test("module CSSのtransition・animationは時間・easingをtokenで参照する (03 §14)", async () => {
  const declaration =
    /(?:^|\s)(transition|animation|transition-duration|animation-duration|transition-timing-function|animation-timing-function)\s*:\s*([^;]+);/g;
  let declarations = 0;
  for (const path of await listModuleCss()) {
    const css = await read(path);
    for (const match of css.matchAll(declaration)) {
      const [, property, rawValue] = match;
      const value = rawValue.replace(/\s+/g, " ");
      declarations += 1;
      assert.doesNotMatch(
        value,
        literalDuration,
        `${path}の${property}: ${value} は時間を直書きせずtokenを使う`,
      );
      if (property === "transition" || property === "animation") {
        assert.match(
          value,
          /var\(--motion-duration-(short|medium)\)/,
          `${path}の${property}: ${value}`,
        );
        assert.match(
          value,
          /var\(--motion-ease-out\)/,
          `${path}の${property}: ${value}`,
        );
      }
      if (property.endsWith("-duration")) {
        assert.match(
          value,
          /^var\(--motion-duration-(short|medium)\)$/,
          `${path}の${property}: ${value}`,
        );
      }
      if (property.endsWith("-timing-function")) {
        assert.equal(
          value,
          "var(--motion-ease-out)",
          `${path}の${property}: ${value}`,
        );
      }
    }
  }
  assert.ok(declarations > 0, "module CSSにmotionの宣言が必要です");
});

test("選択状態・現在地の変化に短いtransitionを付ける (NFR-UI-009)", async () => {
  const targets = [
    [
      "src/modules/groups/presentation/groups.module.css",
      ".group-navigation-link",
    ],
    ["src/modules/history/presentation/history.module.css", ".history-chip"],
    [
      "src/modules/calendar/presentation/calendar.module.css",
      ".calendar-scope-nav > a,\n.calendar-member-picker > summary",
    ],
    ["src/modules/calendar/presentation/calendar.module.css", ".calendar-cell"],
    [
      "src/modules/transactions/presentation/transactions.module.css",
      ".segmented-control span",
    ],
    [
      "src/modules/transactions/presentation/transactions.module.css",
      ".category-option-content",
    ],
    [
      "src/modules/analytics/presentation/analytics.module.css",
      ".analytics-scope-nav > a,\n.analytics-member-picker > summary",
    ],
    [
      "src/modules/analytics/presentation/analytics.module.css",
      ".analytics-chart-toggle button",
    ],
  ];
  for (const [path, selector] of targets) {
    const rule = readRule(await read(path), selector);
    assert.match(
      rule,
      /transition-property: [a-z-]+(, [a-z-]+)*;/,
      `${selector}にtransition-propertyが必要です`,
    );
    assert.match(
      rule,
      /transition-duration: var\(--motion-duration-short\);/,
      `${selector}はshortのtokenを使う`,
    );
    assert.match(
      rule,
      /transition-timing-function: var\(--motion-ease-out\);/,
      `${selector}はease-outのtokenを使う`,
    );
    // 色・枠・影だけを対象にし、layoutを動かすtransitionは付けない
    assert.doesNotMatch(
      rule,
      /transition-property:[^;]*(height|width|transform|all)/,
      `${selector}のtransitionは色・枠・影に限る`,
    );
  }
});

test("prefers-reduced-motionでtransition・animationを無効化する (NFR-A11Y-007, 03 §15)", async () => {
  const styles = await read("src/app/styles.css");
  const start = styles.indexOf("@media (prefers-reduced-motion: reduce)");
  assert.notEqual(start, -1, "reduced motionのmedia queryが必要です");
  const block = styles
    .slice(start, styles.indexOf("}\n}", start))
    .replace(/\s+/g, " ");
  assert.match(block, /\*, \*::before, \*::after \{/);
  assert.match(block, /animation: none !important;/);
  assert.match(block, /transition: none !important;/);

  for (const path of await listModuleCss()) {
    assert.doesNotMatch(
      await read(path),
      /prefers-reduced-motion/,
      `${path}: reduced motionの判定はglobalへ一元化する`,
    );
  }

  // motionの終了を待つClient側の処理は設定を確認し、reduce時は待たない
  const explorer = await read(
    "src/modules/calendar/presentation/calendar-day-explorer.tsx",
  );
  assert.match(explorer, /matchMedia\("\(prefers-reduced-motion: reduce\)"\)/);
});

test("日別取引sheetはスライドで開閉し、退場中は操作対象から外す (CAL-005, CAL-011, NFR-UI-009)", async () => {
  const css = await read(
    "src/modules/calendar/presentation/calendar.module.css",
  );
  const panel = readRule(css, ".calendar-day-panel");
  assert.match(
    panel,
    /animation: calendar-sheet-in var\(--motion-duration-medium\) var\(--motion-ease-out\) both;/,
  );
  const closing = readRule(css, '.calendar-day-panel[data-closing="true"]');
  assert.match(closing, /animation-name: calendar-sheet-out;/);
  assert.match(closing, /pointer-events: none;/);
  for (const name of [
    "calendar-sheet-in",
    "calendar-sheet-out",
    "calendar-panel-fade-in",
    "calendar-panel-fade-out",
  ]) {
    assert.match(
      css,
      new RegExp(`@keyframes ${name} \\{`),
      `@keyframes ${name}が必要です`,
    );
  }
  assert.match(
    readRule(css, "@keyframes calendar-sheet-in"),
    /transform: translateY\(100%\)/,
  );
  // 900px以上のside panelはスライドせずfadeにする
  const desktop = css.slice(css.indexOf("@media (min-width: 900px)"));
  assert.match(desktop, /animation-name: calendar-panel-fade-in;/);
  assert.match(desktop, /animation-name: calendar-panel-fade-out;/);

  const explorer = await read(
    "src/modules/calendar/presentation/calendar-day-explorer.tsx",
  );
  assert.match(explorer, /data-closing=/);
  assert.match(explorer, /aria-hidden=/);
  assert.match(explorer, /onAnimationEnd=/);
});

test("入力ドックは高さだけをtransitionし、内容を下端へ寄せる (TXN-014, TXN-015, NFR-UI-009)", async () => {
  const css = await read(
    "src/modules/transactions/presentation/transactions.module.css",
  );
  const dock = readRule(css, ".input-dock");
  assert.match(dock, /position: fixed;/);
  assert.match(dock, /height: var\(--input-dock-target-height, auto\);/);
  assert.match(dock, /align-content: end;/);
  assert.match(dock, /overflow: clip;/);
  assert.match(
    dock,
    /transition: height var\(--motion-duration-medium\) var\(--motion-ease-out\);/,
  );
  assert.match(readRule(css, ".input-dock-content"), /display: grid;/);
  // PC幅ではドックを固定しないため、中身のwrapperも2カラムへ流し込む
  const desktop = css.slice(css.indexOf("@media (min-width: 900px)"));
  const flattened = desktop.replace(/\s+/g, " ");
  assert.match(flattened, /\.input-dock \{ display: contents; \}/);
  assert.match(flattened, /\.input-dock-content \{ display: contents; \}/);

  const form = await read(
    "src/modules/transactions/presentation/expense-form.tsx",
  );
  assert.match(form, /--input-dock-target-height/);
  assert.match(form, /styles\["input-dock-content"\]/);
});

test("仕様にmotionのtoken・reduced motion・E2Eシナリオを定義している", async () => {
  const screen = await read("specs/03-screen-specification.md");
  for (const token of [
    "--motion-duration-short",
    "--motion-duration-medium",
    "--motion-ease-out",
  ]) {
    assert.match(screen, new RegExp(token), `03 §14に${token}が必要です`);
  }
  assert.match(screen, /prefers-reduced-motion: reduce/);
  const nonFunctional = await read("specs/06-non-functional-requirements.md");
  assert.match(nonFunctional, /`NFR-UI-009`/);
  assert.match(nonFunctional, /`NFR-A11Y-007`/);
  assert.match(await read("specs/15-e2e-testing.md"), /`E2E-013`/);
  assert.match(await read("tests/e2e/reduced-motion.spec.ts"), /E2E-013/);
});
