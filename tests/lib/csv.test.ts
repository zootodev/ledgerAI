import { describe, expect, it } from "vitest";
import { csvEscape, neutralizeFormula, numericCell, toCsv, type CsvCell } from "@/lib/csv";

describe("csvEscape", () => {
  it("leaves plain fields untouched", () => {
    expect(csvEscape("Revenue")).toBe("Revenue");
    expect(csvEscape("12000.00")).toBe("12000.00");
  });

  it("neutralizes text cells that would be read as spreadsheet formulas", () => {
    expect(csvEscape("=SUM(A1:A2)")).toBe("'=SUM(A1:A2)");
    expect(csvEscape("+123")).toBe("'+123");
    expect(csvEscape("-123")).toBe("'-123");
    expect(csvEscape("@user")).toBe("'@user");
  });

  it("neutralizes formula text even when it also needs RFC 4180 quoting", () => {
    expect(csvEscape("=1+1, next")).toBe('"' + "'=1+1, next" + '"');
  });

  it("quotes fields containing commas", () => {
    expect(csvEscape("a, b")).toBe('"a, b"');
  });

  it("quotes fields containing embedded double quotes and doubles them", () => {
    expect(csvEscape('say "hi"')).toBe('"say ""hi"""');
  });

  it("quotes fields containing line breaks so rows never break early", () => {
    expect(csvEscape("line1\nline2")).toBe('"line1\nline2"');
    expect(csvEscape("a\r\nb")).toBe('"a\r\nb"');
  });
});

describe("toCsv", () => {
  it("writes a header row and data rows joined with CRLF, ending in a newline", () => {
    expect(toCsv(["A", "B"], [["1", "x"], [2, null]])).toBe(
      "A,B\r\n1,x\r\n2,\r\n",
    );
  });

  it("writes only headers when there are no data rows", () => {
    expect(toCsv(["Month", "Revenue"], [])).toBe("Month,Revenue\r\n");
  });

  it("escapes every cell defensively, not just special-cased ones", () => {
    expect(
      toCsv(["Meta"], [["a, b", 'quote " here', "next\nline", null]]),
    ).toBe(
      'Meta\r\n"a, b","quote "" here","next\nline",\r\n',
    );
  });

  it("serializes numbers without locale formatting", () => {
    expect(toCsv(["Amount"], [[12000.5], [-0.01]])).toBe(
      "Amount\r\n12000.5\r\n-0.01\r\n",
    );
  });

  it("does NOT neutralize numeric cells that legitimately start with - or +", () => {
    expect(toCsv(["Amount"], [[-123.45], [12000.5]])).toBe(
      "Amount\r\n-123.45\r\n12000.5\r\n",
    );
  });

  it("emits numericCell() tagged values verbatim, even negative figures", () => {
    expect(
      toCsv(["Amount"], [[numericCell("-123.45")], [numericCell("12000.50")]]),
    ).toBe("Amount\r\n-123.45\r\n12000.50\r\n");

    expect(-123.45).toBe(-123.45);
    expect(numericCell("-123.45").kind).toBe("numeric");
  });

  it("neutralizes formula-looking TEXT cells inside full CSV rows", () => {
    const rows: ReadonlyArray<ReadonlyArray<CsvCell>> = [
      ["=SUM(A1:A2)"],
      ["+123"],
      ["-123"],
      ["@user"],
    ];
    expect(toCsv(["Note"], rows)).toBe(
      "Note\r\n'=SUM(A1:A2)\r\n'+123\r\n'-123\r\n'@user\r\n",
    );
  });

  it("neutralizes formula-looking text mixed with untouched numbers and blank cells", () => {
    const rows: ReadonlyArray<ReadonlyArray<CsvCell>> = [
      ["=HYPERLINK(\"https://evil.example\")", -50, ""],
    ];
    expect(toCsv(["Note", "Amount", "Empty"], rows)).toBe(
      'Note,Amount,Empty\r\n"\'=HYPERLINK(""https://evil.example"")",-50,\r\n',
    );
  });

  it("treats digits-first text (e.g. phone numbers, ids) as plain text", () => {
    expect(toCsv(["Id"], [["12000.50"]])).toBe("Id\r\n12000.50\r\n");
  });
});

describe("neutralizeFormula", () => {
  it("prefixes a guard only for the four formula-start characters", () => {
    expect(neutralizeFormula("=A1")).toBe("'=A1");
    expect(neutralizeFormula("+A1")).toBe("'+A1");
    expect(neutralizeFormula("-A1")).toBe("'-A1");
    expect(neutralizeFormula("@A1")).toBe("'@A1");
    expect(neutralizeFormula("plain text")).toBe("plain text");
    expect(neutralizeFormula("3.14")).toBe("3.14");
    expect(neutralizeFormula("")).toBe("");
  });
});