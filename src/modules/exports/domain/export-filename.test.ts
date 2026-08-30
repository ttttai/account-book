import { describe, expect, it } from "vitest";

import {
  buildCsvContentDisposition,
  buildCsvExportFilename,
} from "./export-filename";

describe("buildCsvExportFilename", () => {
  it("ASCIIグループ名と期間をそのまま含める", () => {
    expect(buildCsvExportFilename("Family-2026", "2026-08")).toEqual({
      asciiFilename: "Family-2026_transactions_2026-08.csv",
      utf8Filename: "Family-2026_transactions_2026-08.csv",
    });
  });

  it("日本語グループ名はASCII fallbackへ置き換えUTF-8名を保持する", () => {
    expect(buildCsvExportFilename("わが家の家計簿", "all")).toEqual({
      asciiFilename: "group_transactions_all.csv",
      utf8Filename: "わが家の家計簿_transactions_all.csv",
    });
  });

  it("引用符・区切り・制御文字を安全な形式へ変換する", () => {
    const { asciiFilename, utf8Filename } = buildCsvExportFilename(
      'a/b\\c"d\r\n:e',
      "2026-01",
    );
    expect(asciiFilename).toBe("a_b_c_d_e_transactions_2026-01.csv");
    expect(utf8Filename).toBe("a_b_c_d_e_transactions_2026-01.csv");
    expect(asciiFilename).not.toMatch(/["\\/\r\n:]/);
  });

  it("安全な文字が残らない名前はfallbackする", () => {
    expect(buildCsvExportFilename('"""', "all")).toEqual({
      asciiFilename: "group_transactions_all.csv",
      utf8Filename: "group_transactions_all.csv",
    });
  });
});

describe("buildCsvContentDisposition", () => {
  it("ASCII fallbackとRFC 5987 filename*を併記する", () => {
    expect(buildCsvContentDisposition("わが家", "2026-08")).toBe(
      'attachment; filename="group_transactions_2026-08.csv"; ' +
        "filename*=UTF-8''%E3%82%8F%E3%81%8C%E5%AE%B6_transactions_2026-08.csv",
    );
  });

  it("RFC 5987のattr-char以外をpercent-encodeする", () => {
    const header = buildCsvContentDisposition("a'b(c)", "all");
    expect(header).toContain(
      "filename*=UTF-8''a%27b%28c%29_transactions_all.csv",
    );
  });
});
