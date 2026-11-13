// ============================================================
// LedgerAI — tiny, dependency-free PDF writer for test fixtures
// ------------------------------------------------------------
// This is NOT a production PDF generator. It writes a few absolutely
// positioned Helvetica text runs per page, which is exactly what the
// import extractor needs to exercise x/y band geometry. All content is
// synthetic: no real statement data is ever stored here.
// ============================================================

const PAGE_WIDTH = 700;
const PAGE_HEIGHT = 842;

export interface PdfTextRun {
  text: string;
  /** Left edge in points, from the left page edge. */
  x: number;
  /** Baseline in points, from the TOP page edge (converted internally). */
  y: number;
  size?: number;
}

function escapePdfText(text: string): string {
  return text
    .replace(/\\/g, "\\\\")
    .replace(/\(/g, "\\(")
    .replace(/\)/g, "\\)")
    // The base-14 Helvetica font is ASCII-only in this tiny writer.
    .replace(/[^\x20-\x7e]/g, "?");
}

function contentStream(lines: PdfTextRun[]): string {
  const commands = ["BT"];
  for (const line of lines) {
    const size = line.size ?? 8;
    const pdfY = PAGE_HEIGHT - line.y;
    commands.push(
      `/F1 ${size} Tf 1 0 0 1 ${line.x.toFixed(2)} ${pdfY.toFixed(2)} Tm (${escapePdfText(line.text)}) Tj`,
    );
  }
  commands.push("ET");
  return commands.join("\n");
}

/** Build a valid PDF from absolutely-positioned text runs, one array per page. */
export function buildSyntheticPdf(pages: PdfTextRun[][]): Uint8Array {
  const pageCount = Math.max(1, pages.length);
  const firstPageObject = 4;
  const objects: string[] = [];
  objects[1] = "<< /Type /Catalog /Pages 2 0 R >>";
  const kids = Array.from({ length: pageCount }, (_, index) => `${firstPageObject + index * 2} 0 R`);
  objects[2] = `<< /Type /Pages /Kids [${kids.join(" ")}] /Count ${pageCount} >>`;
  objects[3] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>";

  for (let index = 0; index < pageCount; index += 1) {
    const pageObject = firstPageObject + index * 2;
    const contentObject = pageObject + 1;
    const content = contentStream(pages[index] ?? []);
    objects[pageObject] =
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_WIDTH} ${PAGE_HEIGHT}] ` +
      `/Resources << /Font << /F1 3 0 R >> >> /Contents ${contentObject} 0 R >>`;
    objects[contentObject] = `<< /Length ${content.length} >>\nstream\n${content}\nendstream`;
  }

  const totalObjects = 3 + pageCount * 2;
  let pdf = "%PDF-1.4\n";
  const offsets: number[] = new Array(totalObjects + 1).fill(0);
  for (let object = 1; object <= totalObjects; object += 1) {
    offsets[object] = pdf.length;
    pdf += `${object} 0 obj\n${objects[object] ?? "<< >>"}\nendobj\n`;
  }
  const xrefOffset = pdf.length;
  pdf += `xref\n0 ${totalObjects + 1}\n`;
  pdf += "0000000000 65535 f \n";
  for (let object = 1; object <= totalObjects; object += 1) {
    pdf += `${String(offsets[object]).padStart(10, "0")} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${totalObjects + 1} /Root 1 0 R >>\n`;
  pdf += `startxref\n${xrefOffset}\n%%EOF\n`;
  return new TextEncoder().encode(pdf);
}
