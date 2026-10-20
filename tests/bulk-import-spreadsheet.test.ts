import { describe, it, expect } from 'vitest';
import ExcelJS from 'exceljs';
import { buildWorkbook, parseCsv, readProductRows, MAX_IMPORT_BYTES } from '@/cms/tools/spreadsheet';

const toAB = (s: string | Uint8Array) => {
  const u = typeof s === 'string' ? new TextEncoder().encode(s) : s;
  return u.buffer.slice(u.byteOffset, u.byteOffset + u.byteLength) as ArrayBuffer;
};

describe('workbook writing / reading round trip', () => {
  const header = ['Name*', 'Price*', 'Stock*', 'Slug', 'Variants'];
  const rows = [
    header,
    ['Shringar Mukut — Peacock', 599, 25, '', 'Size 0;449;599;10 | Size 1;549;699;8'],
    ['Unicode देवता ₹ "quoted", comma', 0, 0, 'slug-x', 'multi\nline'],
  ];

  it('writes a valid xlsx with the template sheets and widths', async () => {
    const bytes = await buildWorkbook([
      { name: 'Products', rows, widths: [20, 10] },
      { name: 'Instructions', rows: [['Column', 'Required']], widths: [22, 10] },
      { name: 'Lists', rows: [['Category']], widths: [26] },
    ]);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(bytes);
    expect(wb.worksheets.map((w) => w.name)).toEqual(['Products', 'Instructions', 'Lists']);
    expect(wb.getWorksheet('Products')!.getColumn(1).width).toBe(20);
  });

  it('reads back header-keyed string rows, preserving numbers, unicode and newlines', async () => {
    const bytes = await buildWorkbook([{ name: 'Products', rows, widths: [] }]);
    const out = await readProductRows(bytes);
    expect(out).toHaveLength(2);
    expect(out[0]).toEqual({
      'Name*': 'Shringar Mukut — Peacock',
      'Price*': '599',
      'Stock*': '25',
      Slug: '',
      Variants: 'Size 0;449;599;10 | Size 1;549;699;8',
    });
    expect(out[1]['Name*']).toBe('Unicode देवता ₹ "quoted", comma');
    expect(out[1]['Price*']).toBe('0');
    expect(out[1].Variants).toBe('multi\nline');
  });

  it('prefers the "Products" sheet (case-insensitive) over the first sheet', async () => {
    const bytes = await buildWorkbook([
      { name: 'Instructions', rows: [['Column'], ['x']], widths: [] },
      { name: 'products', rows: [['Name*'], ['A']], widths: [] },
    ]);
    expect(await readProductRows(bytes)).toEqual([{ 'Name*': 'A' }]);
  });

  it('falls back to the first sheet when there is no Products sheet', async () => {
    const bytes = await buildWorkbook([{ name: 'Sheet1', rows: [['Name*'], ['B']], widths: [] }]);
    expect(await readProductRows(bytes)).toEqual([{ 'Name*': 'B' }]);
  });

  it('skips blank rows and ignores blank / duplicate headers', async () => {
    const bytes = await buildWorkbook([
      { name: 'Products', rows: [['Name*', '', 'Name*'], ['A', 'ignored', 'dup'], [], ['', '', ''], ['C']], widths: [] },
    ]);
    expect(await readProductRows(bytes)).toEqual([{ 'Name*': 'A' }, { 'Name*': 'C' }]);
  });

  it('reads formula results, dates and rich text as display text', async () => {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Products');
    ws.addRow(['Name*', 'Price*', 'When', 'Rich']);
    ws.addRow([
      'F',
      { formula: '1+2', result: 3 },
      new Date(Date.UTC(2026, 0, 2)),
      { richText: [{ text: 'a' }, { text: 'b' }] },
    ]);
    const bytes = toAB(new Uint8Array((await wb.xlsx.writeBuffer()) as ArrayBuffer));
    const [row] = await readProductRows(bytes);
    expect(row['Price*']).toBe('3');
    expect(row.Rich).toBe('ab');
    expect(row.When).toContain('2026');
  });

  it('returns no rows for a header-only sheet', async () => {
    const bytes = await buildWorkbook([{ name: 'Products', rows: [['Name*']], widths: [] }]);
    expect(await readProductRows(bytes)).toEqual([]);
  });
});

describe('CSV input', () => {
  it('parses quoted fields, escaped quotes, CRLF, BOM and embedded newlines', async () => {
    const csv = '\uFEFFName*,Price*,Long\r\n"A, B",599,"say ""hi""\nbye"\r\nC,1,\r\n';
    expect(await readProductRows(toAB(csv))).toEqual([
      { 'Name*': 'A, B', 'Price*': '599', Long: 'say "hi"\nbye' },
      { 'Name*': 'C', 'Price*': '1', Long: '' },
    ]);
  });
  it('handles a file with no trailing newline and short rows', async () => {
    expect(await readProductRows(toAB('Name*,Price*\nA'))).toEqual([{ 'Name*': 'A', 'Price*': '' }]);
  });
  it('returns [] for an empty file', async () => {
    expect(await readProductRows(toAB(''))).toEqual([]);
  });
  it('rejects an unterminated quoted value', () => {
    expect(() => parseCsv('a,"b\nc')).toThrow(/unterminated/);
  });
});

describe('malformed input handling', () => {
  it('rejects a corrupt file that looks like a zip', async () => {
    await expect(readProductRows(toAB(new Uint8Array([0x50, 0x4b, 3, 4, 1, 2, 3, 4, 5, 6])))).rejects.toThrow(
      'not a valid .xlsx',
    );
  });
  it('rejects a truncated real workbook', async () => {
    const good = new Uint8Array(await buildWorkbook([{ name: 'Products', rows: [['Name*'], ['A']], widths: [] }]));
    await expect(readProductRows(toAB(good.slice(0, Math.floor(good.length / 2))))).rejects.toThrow('not a valid .xlsx');
  });
  it('gives a clear message for legacy .xls (OLE) files', async () => {
    const ole = new Uint8Array([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1, 0, 0]);
    await expect(readProductRows(toAB(ole))).rejects.toThrow(/\.xls files are not supported/);
  });
  it('rejects files over the size limit', async () => {
    await expect(readProductRows(new ArrayBuffer(MAX_IMPORT_BYTES + 1))).rejects.toThrow('larger than 10 MB');
  });
  it('does not pollute Object.prototype from hostile header names', async () => {
    const csv = '__proto__,constructor,Name*\nx,y,A\n';
    const [row] = await readProductRows(toAB(csv));
    expect(({} as Record<string, unknown>).x).toBeUndefined();
    expect(Object.getPrototypeOf(row)).toBe(Object.prototype);
    expect(row['Name*']).toBe('A');
  });
});
