import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import test from "node:test";

const root = new URL("../../", import.meta.url);

async function read(path) {
  return readFile(new URL(path, root), "utf8");
}

// 各機能のpresentationディレクトリにあるCSS Modules（src/modules/uiを含む）を列挙する
async function listModuleCss() {
  const modulesDirectory = new URL("src/modules/", root);
  const files = [];
  for (const moduleName of await readdir(modulesDirectory)) {
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

// 03 §14の表で定義する色のdesign token。ライトとダークの両方で同じ名前を定義する
const COLOR_TOKENS = [
  "--background",
  "--background-glow",
  "--surface",
  "--surface-strong",
  "--surface-muted",
  "--text",
  "--muted",
  "--text-faint",
  "--border",
  "--field-border",
  "--shadow-rgb",
  "--backdrop",
  "--skeleton-base",
  "--skeleton-highlight",
  "--accent",
  "--accent-surface",
  "--accent-surface-end",
  "--accent-soft",
  "--accent-faint",
  "--accent-strong",
  "--accent-border",
  "--on-accent",
  "--on-accent-muted",
  "--income-on-accent",
  "--negative-on-accent",
  "--income",
  "--income-soft",
  "--danger",
  "--danger-soft",
  "--danger-border",
  "--danger-surface",
  "--warning",
  "--warning-soft",
  "--warning-bar",
  "--neutral",
  "--chart-expense",
  "--chart-income",
  "--weekend-saturday",
  "--weekend-sunday",
  "--weekend-saturday-faint",
  "--weekend-sunday-faint",
  "--focus-ring",
  "--focus-ring-soft",
];

const CATEGORY_TOKENS = [
  "food",
  "daily",
  "home",
  "utilities",
  "transport",
  "leisure",
  "other",
  "salary",
  "extra",
  "orange",
  "olive",
  "mint",
  "sky",
  "indigo",
  "navy",
  "rose",
  "wine",
  "charcoal",
];

// 色リテラル（HEX、rgb()/hsl()、白黒の色名）。white-spaceなどのプロパティ名と、
// tokenの色成分を使うrgb(var(--shadow-rgb) / n%)は除く
const COLOR_LITERAL =
  /#[0-9a-fA-F]{3,8}\b|\b(?:rgba?|hsla?)\((?!var\()|(?<![-\w])(?:white|black)(?![-\w])/;

// `start`にあるブロック開始位置から、対応する閉じ括弧までを返す（media queryの入れ子に対応）
function readBlock(css, start) {
  const open = css.indexOf("{", start);
  let depth = 0;
  for (let index = open; index < css.length; index += 1) {
    if (css[index] === "{") depth += 1;
    if (css[index] === "}") {
      depth -= 1;
      if (depth === 0) return css.slice(start, index + 1);
    }
  }
  assert.fail("CSSブロックが閉じていません");
}

// OSに従う場合のダーク規則（media内）と、アプリで明示選択した場合のダーク規則のセレクタ (03 §14)
const MEDIA_DARK_SELECTOR = ':root:not([data-theme="light"]) {';
const EXPLICIT_DARK_SELECTOR = ':root[data-theme="dark"] {';

// ライトの:rootブロック、prefers-color-scheme: dark内の:rootブロック、明示選択のダークブロックを返す
function readThemeBlocks(styles) {
  const lightStart = styles.indexOf(":root {");
  assert.notEqual(lightStart, -1, ":rootのtoken定義が必要");
  const light = readBlock(styles, lightStart);
  const mediaStart = styles.indexOf("@media (prefers-color-scheme: dark)");
  assert.notEqual(mediaStart, -1, "prefers-color-scheme: darkの定義が必要");
  const media = readBlock(styles, mediaStart);
  const darkRootStart = media.indexOf(MEDIA_DARK_SELECTOR);
  assert.notEqual(
    darkRootStart,
    -1,
    `dark media内に${MEDIA_DARK_SELECTOR}が必要（ライト固定時はOSのダークを無効にする）`,
  );
  const explicitStart = styles.indexOf(EXPLICIT_DARK_SELECTOR);
  assert.notEqual(
    explicitStart,
    -1,
    `${EXPLICIT_DARK_SELECTOR}（アプリで選んだダーク）の定義が必要`,
  );
  return {
    light,
    media,
    dark: readBlock(media, darkRootStart),
    explicitDark: readBlock(styles, explicitStart),
  };
}

// ブロックの宣言部分を、空白を正規化した文字列で返す
function readDeclarations(block) {
  return block
    .slice(block.indexOf("{") + 1, block.lastIndexOf("}"))
    .replace(/\s+/g, " ")
    .trim();
}

// ブロック内のcustom property値を読む
function readToken(block, token) {
  const match = block.match(
    new RegExp(`${token.replace(/-/g, "\\-")}:\\s*([^;]+);`),
  );
  assert.ok(match, `${token}の定義が必要`);
  return match[1].trim();
}

// カテゴリ色tokenの値を、ブロック内の[data-category-color="token"]規則から読む
function readCategoryColor(block, token) {
  const match = block.match(
    new RegExp(
      `\\[data-category-color="${token}"\\]\\s*\\{[^}]*--category-color:\\s*(#[0-9a-f]{6})`,
      "i",
    ),
  );
  return match ? match[1].toLowerCase() : null;
}

// WCAG 2.xの相対輝度
function luminance(hex) {
  assert.match(hex, /^#[0-9a-f]{6}$/i, `${hex}は6桁HEXで定義する`);
  const [r, g, b] = [1, 3, 5]
    .map((index) => Number.parseInt(hex.slice(index, index + 2), 16) / 255)
    .map((value) =>
      value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4,
    );
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

// WCAG 2.xのコントラスト比（明るい方 + 0.05）/（暗い方 + 0.05）
function contrast(foreground, background) {
  const [high, low] = [luminance(foreground), luminance(background)].sort(
    (a, b) => b - a,
  );
  return (high + 0.05) / (low + 0.05);
}

// NFR-A11Y-008: 文字と背景は4.5:1、意味を持つ非テキストの塗りは3:1
const CONTRAST_PAIRS = [
  ["--text", "--background", 4.5],
  ["--text", "--surface", 4.5],
  ["--text", "--surface-strong", 4.5],
  ["--text", "--surface-muted", 4.5],
  ["--muted", "--background", 4.5],
  ["--muted", "--surface", 4.5],
  ["--muted", "--surface-strong", 4.5],
  ["--accent", "--background", 4.5],
  ["--accent", "--surface", 4.5],
  ["--accent", "--surface-strong", 4.5],
  ["--accent", "--accent-soft", 4.5],
  ["--accent-strong", "--accent-soft", 4.5],
  ["--on-accent", "--accent-surface", 4.5],
  ["--on-accent", "--accent-surface-end", 4.5],
  ["--on-accent", "--danger-surface", 4.5],
  ["--on-accent", "--neutral", 3],
  ["--income-on-accent", "--accent-surface", 4.5],
  ["--negative-on-accent", "--accent-surface", 4.5],
  ["--income", "--surface", 4.5],
  ["--income", "--surface-strong", 4.5],
  ["--income", "--income-soft", 4.5],
  ["--danger", "--surface", 4.5],
  ["--danger", "--surface-strong", 4.5],
  ["--danger", "--danger-soft", 4.5],
  ["--warning", "--surface", 4.5],
  ["--warning", "--warning-soft", 4.5],
  ["--weekend-saturday", "--surface", 4.5],
  ["--weekend-sunday", "--surface", 4.5],
  ["--chart-expense", "--surface", 3],
  ["--chart-income", "--surface", 3],
  ["--accent-surface", "--surface", 3],
];

test("色のdesign tokenをライトとダークの:rootで同じ名前で定義し、color-schemeを切り替える (NFR-UI-010, 03 §14)", async () => {
  const styles = await read("src/app/styles.css");
  const { light, dark } = readThemeBlocks(styles);

  assert.match(light, /color-scheme:\s*light;/);
  assert.match(dark, /color-scheme:\s*dark;/);
  for (const token of COLOR_TOKENS) {
    readToken(light, token);
    readToken(dark, token);
  }
  // 影は色成分だけを持ち、rgb(var(--shadow-rgb) / n%)で使う
  assert.match(readToken(light, "--shadow-rgb"), /^\d+ \d+ \d+$/);
  assert.match(readToken(dark, "--shadow-rgb"), /^\d+ \d+ \d+$/);
});

test("両テーマのtoken値がWCAG AAのコントラスト比を満たす (NFR-A11Y-008)", async () => {
  const styles = await read("src/app/styles.css");
  const { light, dark } = readThemeBlocks(styles);

  for (const [name, block] of [
    ["ライト", light],
    ["ダーク", dark],
  ]) {
    for (const [foreground, background, minimum] of CONTRAST_PAIRS) {
      const ratio = contrast(
        readToken(block, foreground),
        readToken(block, background),
      );
      assert.ok(
        ratio >= minimum,
        `${name}: ${foreground} on ${background} は ${ratio.toFixed(2)}:1 で ${minimum}:1 未満`,
      );
    }
  }
});

test("ダークテーマのカテゴリ色はsurfaceに対して3:1以上で、明度を上げる4色以外はライトと同じ値にする (NFR-A11Y-008, AC-CAT-002-7)", async () => {
  const styles = await read("src/app/styles.css");
  const { media, dark } = readThemeBlocks(styles);
  const darkSurface = readToken(dark, "--surface");
  const lightOnly = styles.slice(0, styles.indexOf(media));
  const overridden = [];

  for (const token of CATEGORY_TOKENS) {
    const lightColor = readCategoryColor(lightOnly, token);
    assert.ok(lightColor, `${token}のライトの色が必要`);
    const darkColor = readCategoryColor(media, token) ?? lightColor;
    if (darkColor !== lightColor) overridden.push(token);
    const ratio = contrast(darkColor, darkSurface);
    assert.ok(
      ratio >= 3,
      `ダークの${token}（${darkColor}）は ${ratio.toFixed(2)}:1 で 3:1 未満`,
    );
  }
  assert.deepEqual(overridden.sort(), ["charcoal", "indigo", "navy", "wine"]);
  // 未知のtokenの既定値も--neutralに追従する
  assert.match(
    styles,
    /\[data-category-color\]\s*\{[^}]*--category-color:\s*var\(--neutral\)/,
  );
});

test("CSS Modulesとstyles.cssのtoken定義以外に色リテラルを書かない (NFR-UI-010, NFR-MNT-010)", async () => {
  const styles = await read("src/app/styles.css");
  const { light, media, explicitDark } = readThemeBlocks(styles);
  let remainder = styles
    .replace(light, "")
    .replace(media, "")
    .replace(explicitDark, "");
  // カテゴリ色tokenの定義ブロックも色値の置き場として除く
  remainder = remainder.replace(
    /\[data-category-color(?:="[a-z]+")?\]\s*\{[^}]*\}/g,
    "",
  );
  const stray = remainder.match(COLOR_LITERAL);
  assert.equal(
    stray,
    null,
    `styles.cssのtoken定義以外に色リテラルがあります: ${stray?.[0]}`,
  );

  const moduleFiles = await listModuleCss();
  assert.ok(moduleFiles.length >= 10, "CSS Modulesの列挙に失敗");
  for (const path of moduleFiles) {
    const css = await read(path);
    const literal = css.match(COLOR_LITERAL);
    assert.equal(
      literal,
      null,
      `${path} に色リテラルがあります: ${literal?.[0]}。styles.cssのtokenを参照する`,
    );
    // カテゴリ色の既定値も直書きせず--neutralへ寄せる
    assert.doesNotMatch(css, /var\(--category-color,\s*#/);
  }
});

test("OSに従うダーク規則とアプリで選んだダーク規則は同じ宣言を持つ (NFR-UI-010, 03 §14)", async () => {
  const styles = await read("src/app/styles.css");
  const { media, dark, explicitDark } = readThemeBlocks(styles);

  assert.equal(readDeclarations(explicitDark), readDeclarations(dark));
  // 明度を上げるカテゴリ色4件も両方の経路で同じ値にする
  for (const token of ["indigo", "navy", "wine", "charcoal"]) {
    const inMedia = readCategoryColor(media, token);
    assert.ok(inMedia, `media内に${token}のダーク値が必要`);
    const explicitRule = styles.match(
      new RegExp(
        `:root\\[data-theme="dark"\\] \\[data-category-color="${token}"\\]\\s*\\{[^}]*--category-color:\\s*(#[0-9a-f]{6})`,
        "i",
      ),
    );
    assert.ok(
      explicitRule,
      `:root[data-theme="dark"]配下に${token}のダーク値が必要`,
    );
    assert.equal(explicitRule[1].toLowerCase(), inMedia);
  }
  // media内のカテゴリ色の上書きは、ライト固定時に効かないよう:root:not([data-theme="light"])配下に置く
  assert.doesNotMatch(
    media,
    /\n\s*\[data-category-color="[a-z]+"\]\s*\{/,
    'media内のカテゴリ色は:root:not([data-theme="light"])を前置する',
  );
});

test("theme-colorは配色の選択に追従し、manifestはライトの値に固定する (NFR-PWA-002, NFR-UI-010)", async () => {
  const styles = await read("src/app/styles.css");
  const { light, dark } = readThemeBlocks(styles);
  const lightBackground = readToken(light, "--background");
  const darkBackground = readToken(dark, "--background");
  assert.notEqual(lightBackground, darkBackground);

  // 両テーマの--backgroundはthemeモジュールの定数と一致し、layoutはcookieの選択からthemeColorとdata-themeを決める
  const preference = await read("src/modules/theme/domain/theme-preference.ts");
  assert.match(preference, new RegExp(`light:\\s*"${lightBackground}"`));
  assert.match(preference, new RegExp(`dark:\\s*"${darkBackground}"`));
  assert.match(preference, /"\(prefers-color-scheme: light\)"/);
  assert.match(preference, /"\(prefers-color-scheme: dark\)"/);

  const layout = await read("src/app/layout.tsx");
  assert.match(layout, /export async function generateViewport\(/);
  assert.match(layout, /themeColor:\s*resolveThemeColor\(/);
  assert.match(layout, /data-theme=\{resolveDocumentTheme\(/);
  assert.match(layout, /from "@\/modules\/theme\/server"/);
  assert.doesNotMatch(layout, /themeColor:\s*"#/);

  const manifest = await read("src/app/manifest.ts");
  assert.match(manifest, new RegExp(`theme_color:\\s*"${lightBackground}"`));
  assert.match(
    manifest,
    new RegExp(`background_color:\\s*"${lightBackground}"`),
  );
});

test("仕様がダークテーマのtoken表とコントラスト条件を定義する (NFR-UI-010, NFR-A11Y-008)", async () => {
  const screen = await read("specs/03-screen-specification.md");
  const nfr = await read("specs/06-non-functional-requirements.md");
  const plan = await read("specs/07-acceptance-test-plan.md");

  assert.match(screen, /### 色のdesign tokenとダークテーマ/);
  for (const token of COLOR_TOKENS) {
    assert.match(
      screen,
      new RegExp(`\\| \`${token}\`\\s+\\|`),
      `${token}を§14の表へ載せる`,
    );
  }
  assert.match(nfr, /^- `NFR-UI-010` .*prefers-color-scheme/m);
  assert.match(nfr, /^- `NFR-UI-010` .*OSに従う.*cookie/m);
  assert.match(nfr, /^- `NFR-A11Y-008` .*4\.5:1.*3:1/m);
  assert.match(
    nfr,
    /^- `NFR-PWA-002` .*viewport\.themeColor.*prefers-color-scheme/m,
  );
  assert.match(plan, /NFR-UI-010/);
  assert.match(screen, /「画面の配色」/);
  assert.match(await read("specs/15-e2e-testing.md"), /`E2E-015`/);
  assert.match(await read("tests/e2e/theme-preference.spec.ts"), /E2E-015/);
});

test("配色の選択はthemeモジュールに閉じ、cookieの許可値だけを設定画面のchipとdata-themeへ反映する (NFR-UI-010, 03 §9)", async () => {
  const index = await read("src/modules/theme/index.ts");
  assert.match(index, /ThemePreferenceChips/);
  assert.match(index, /parseThemePreference/);

  // サーバー側の読み取りはserver-onlyに置き、cookieを読むだけで書かない
  const server = await read("src/modules/theme/server.ts");
  assert.match(server, /^import "server-only";/m);
  assert.match(server, /getThemePreference/);
  const serverRead = await read(
    "src/modules/theme/application/get-theme-preference.ts",
  );
  assert.match(serverRead, /cookies\(\)/);
  assert.match(serverRead, /parseThemePreference\(/);
  assert.doesNotMatch(serverRead, /\.set\(|\.delete\(/);

  // 設定画面はServer Actionではなく、Client側でdata-theme・cookie・metaを即時に書き換える
  const chips = await read(
    "src/modules/theme/presentation/theme-preference-chips.tsx",
  );
  assert.match(chips, /^"use client";/m);
  assert.match(chips, /from "@\/modules\/ui"/);
  assert.match(chips, /ChoiceChip/);
  assert.doesNotMatch(chips, /"use server"|useActionState|<form/);
  const apply = await read(
    "src/modules/theme/presentation/apply-theme-preference.ts",
  );
  assert.match(apply, /dataset\.theme/);
  assert.match(apply, /document\.cookie\s*=\s*buildThemeCookie\(/);
  assert.match(apply, /meta\[name="theme-color"\]/);

  const settings = await read("src/app/groups/[groupId]/settings/page.tsx");
  assert.match(
    settings,
    /import \{ ThemePreferenceChips \} from "@\/modules\/theme";/,
  );
  assert.match(
    settings,
    /import \{ getThemePreference \} from "@\/modules\/theme\/server";/,
  );
  assert.match(settings, /<ThemePreferenceChips initialPreference=\{/);
});
