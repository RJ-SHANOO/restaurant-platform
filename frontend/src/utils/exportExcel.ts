import * as XLSX from 'xlsx';

/**
 * Row-of-objects to .xlsx helpers, shared by every screen that needs a
 * "download all data" button - keeps the sheet-building and file-naming
 * logic in one place instead of each page reaching for the library itself.
 */

function download(workbook: XLSX.WorkBook, filenamePrefix: string): void {
  const datedName = `${filenamePrefix}-${new Date().toISOString().slice(0, 10)}.xlsx`;
  XLSX.writeFile(workbook, datedName);
}

export function exportToExcel(rows: Record<string, unknown>[], filenamePrefix: string, sheetName = 'Sheet1'): void {
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(rows), sheetName);
  download(workbook, filenamePrefix);
}

/** One workbook, one sheet per entry - for reports that are really several related tables. */
export function exportSheetsToExcel(sheets: { name: string; rows: Record<string, unknown>[] }[], filenamePrefix: string): void {
  const workbook = XLSX.utils.book_new();

  for (const sheet of sheets) {
    // Sheet names are capped at 31 chars and can't repeat - trimmed so a long
    // section title doesn't throw at write time.
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(sheet.rows), sheet.name.slice(0, 31));
  }

  download(workbook, filenamePrefix);
}
