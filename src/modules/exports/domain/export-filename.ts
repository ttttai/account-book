const ASCII_SAFE_PATTERN = /[^A-Za-z0-9._-]+/g;
const UNSAFE_NAME_CHARACTER_PATTERN =
  // biome-ignore lint/suspicious/noControlCharactersInRegex: 制御文字をファイル名から除外するための明示的な指定
  /[\u0000-\u001F\u007F/\\:*?"<>|]+/g;
const FILENAME_FALLBACK = "group";

export type CsvExportFilename = Readonly<{
  asciiFilename: string;
  utf8Filename: string;
}>;

// ASCII英数字と一部記号以外を_に置換した、旧ブラウザ向けフォールバック名を作る
function toAsciiSafeName(groupName: string): string {
  const replaced = groupName
    .replace(ASCII_SAFE_PATTERN, "_")
    .replaceAll(/_{2,}/g, "_")
    .replaceAll(/^_+|_+$/g, "");
  return replaced === "" ? FILENAME_FALLBACK : replaced;
}

// 制御文字とパス区切り等の危険文字だけを除いた、日本語を保持するファイル名を作る
function toUtf8SafeName(groupName: string): string {
  const replaced = groupName
    .replace(UNSAFE_NAME_CHARACTER_PATTERN, "_")
    .replaceAll(/_{2,}/g, "_")
    .replaceAll(/^[\s_]+|[\s_]+$/g, "");
  return replaced === "" ? FILENAME_FALLBACK : replaced;
}

// filename*用にRFC 5987でencodeする（encodeURIComponentが残す記号も変換）
function encodeRfc5987(value: string): string {
  return encodeURIComponent(value).replaceAll(
    /[!'()*]/g,
    (character) =>
      `%${character.charCodeAt(0).toString(16).toUpperCase().padStart(2, "0")}`,
  );
}

// グループ名と期間から、ASCII版とUTF-8版の2種類のCSVファイル名を生成する
export function buildCsvExportFilename(
  groupName: string,
  periodLabel: string,
): CsvExportFilename {
  return {
    asciiFilename: `${toAsciiSafeName(groupName)}_transactions_${periodLabel}.csv`,
    utf8Filename: `${toUtf8SafeName(groupName)}_transactions_${periodLabel}.csv`,
  };
}

// filename（ASCII）とfilename*（UTF-8）を併記したContent-Dispositionヘッダー値を作る
export function buildCsvContentDisposition(
  groupName: string,
  periodLabel: string,
): string {
  const { asciiFilename, utf8Filename } = buildCsvExportFilename(
    groupName,
    periodLabel,
  );
  return `attachment; filename="${asciiFilename}"; filename*=UTF-8''${encodeRfc5987(utf8Filename)}`;
}
