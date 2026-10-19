// The prebuilt bundle avoids the Node-only streaming reader (unzipper), which pulls optional
// cloud SDKs that the Next.js bundler cannot resolve. Only buffer-based load/write is used.
import ExcelJS from 'exceljs/dist/exceljs.min.js';

export type SheetRow = Record<string, string>;

export const MAX_IMPORT_BYTES = 10 * 1024 * 1024;

const isZip = (b: Uint8Array) => b.length > 3 && b[0] === 0x50 && b[1] === 0x4b;
const isOle = (b: Uint8Array) => b.length > 7 && b[0] === 0xd0 && b[1] === 0xcf && b[2] === 0x11 && b[3] === 0xe0;

/** Minimal RFC 4180 CSV parser (quoted fields, escaped quotes, CRLF/LF, embedded newlines). */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  const src = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i++;
        } else quoted = false;
      } else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') {
      row.push(field);
      field = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else field += ch;
  }
  if (quoted) throw new Error('The CSV has an unterminated quoted value.');
  if (field !== '' || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

const toObjects = (grid: string[][]): SheetRow[] => {
  const [head, ...body] = grid;
  if (!head) return [];
  const headers = head.map((h) => h.trim());
  return body
    .filter((cells) => cells.some((c) => c.trim() !== ''))
    .map((cells) => {
      const obj: SheetRow = {};
      headers.forEach((h, i) => {
        if (h && !(h in obj)) obj[h] = cells[i] ?? '';
      });
      return obj;
    });
};

/**
 * Reads the product sheet (the "Products" sheet, else the first one) of an .xlsx file, or a
 * .csv file, into header-keyed rows of strings. Blank rows are skipped.
 */
export async function readProductRows(data: ArrayBuffer): Promise<SheetRow[]> {
  if (data.byteLength > MAX_IMPORT_BYTES) throw new Error('The file is larger than 10 MB.');
  const bytes = new Uint8Array(data);
  if (isOle(bytes)) throw new Error('Legacy .xls files are not supported. Save the file as .xlsx or .csv and try again.');

  if (!isZip(bytes)) {
    return toObjects(parseCsv(new TextDecoder('utf-8').decode(bytes)));
  }

  const wb = new ExcelJS.Workbook();
  try {
    await wb.xlsx.load(data);
  } catch {
    throw new Error('The file is not a valid .xlsx workbook.');
  }
  const ws = wb.worksheets.find((s) => s.name.toLowerCase() === 'products') ?? wb.worksheets[0];
  if (!ws) return [];
  const grid: string[][] = [];
  const width = ws.columnCount;
  ws.eachRow({ includeEmpty: true }, (row, n) => {
    const cells: string[] = [];
    for (let c = 1; c <= width; c++) cells.push(row.getCell(c).text ?? '');
    grid[n - 1] = cells;
  });
  return toObjects(Array.from(grid, (r) => r ?? []));
}

export interface TemplateSheet {
  name: string;
  rows: (string | number)[][];
  widths: number[];
}

/** Builds an .xlsx workbook with the given sheets and returns its bytes. */
export async function buildWorkbook(sheets: TemplateSheet[]): Promise<ArrayBuffer> {
  const wb = new ExcelJS.Workbook();
  for (const s of sheets) {
    const ws = wb.addWorksheet(s.name);
    s.rows.forEach((r) => ws.addRow(r));
    s.widths.forEach((w, i) => {
      ws.getColumn(i + 1).width = w;
    });
  }
  const out = await wb.xlsx.writeBuffer();
  const u8 = new Uint8Array(out as ArrayBuffer);
  return u8.buffer.slice(u8.byteOffset, u8.byteOffset + u8.byteLength) as ArrayBuffer;
}
