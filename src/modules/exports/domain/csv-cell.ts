const FORMULA_PREFIX_PATTERN = /^[=+\-@\t\r]/;
const QUOTE_REQUIRED_PATTERN = /[",\r\n]/;

export function sanitizeCsvCell(value: string): string {
  return FORMULA_PREFIX_PATTERN.test(value) ? `'${value}` : value;
}

export function encodeCsvField(value: string): string {
  return QUOTE_REQUIRED_PATTERN.test(value)
    ? `"${value.replaceAll('"', '""')}"`
    : value;
}

export function toCsvContent(rows: readonly (readonly string[])[]): string {
  return rows
    .map((row) =>
      row.map((cell) => encodeCsvField(sanitizeCsvCell(cell))).join(","),
    )
    .map((line) => `${line}\r\n`)
    .join("");
}
