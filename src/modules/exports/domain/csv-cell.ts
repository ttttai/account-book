const FORMULA_PREFIX_PATTERN = /^[=+\-@\t\r]/;
const QUOTE_REQUIRED_PATTERN = /[",\r\n]/;

// 数式として解釈されうる先頭文字を'で無効化する（CSVインジェクション対策）
export function sanitizeCsvCell(value: string): string {
  return FORMULA_PREFIX_PATTERN.test(value) ? `'${value}` : value;
}

// カンマ・引用符・改行を含むセルをRFC 4180形式で引用符付きにエスケープする
export function encodeCsvField(value: string): string {
  return QUOTE_REQUIRED_PATTERN.test(value)
    ? `"${value.replaceAll('"', '""')}"`
    : value;
}

// 全セルを無害化・エスケープしてCRLF区切りのCSV文字列にする
export function toCsvContent(rows: readonly (readonly string[])[]): string {
  return rows
    .map((row) =>
      row.map((cell) => encodeCsvField(sanitizeCsvCell(cell))).join(","),
    )
    .map((line) => `${line}\r\n`)
    .join("");
}
