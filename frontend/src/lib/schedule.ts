import type { Schedule, Workbook } from "./api";

const key = (value: unknown) =>
  String(value ?? "")
    .replace(/\s+/g, "")
    .toLowerCase();
export function suggestSchedule(book: Workbook, sheetName?: string): Schedule {
  const sheets = sheetName
    ? book.sheets.filter((s) => s.name === sheetName)
    : book.sheets;
  let best: Schedule = {
    workbook_id: book.id,
    sheet: sheets[0]?.name ?? "",
    header_row: 1,
    guid_column: "",
    material_column: "",
  };
  let score = 0;
  for (const sheet of sheets)
    for (const [index, row] of sheet.preview.entries()) {
      const guid = row.filter((v) => key(v) === "globalid");
      const material = row.filter((v) => key(v) === "expectedmaterial");
      const found = Number(guid.length === 1) + Number(material.length === 1);
      if (found > score) {
        score = found;
        best = {
          ...best,
          sheet: sheet.name,
          header_row: index + 1,
          guid_column: guid.length === 1 ? String(guid[0]).trim() : "",
          material_column:
            material.length === 1 ? String(material[0]).trim() : "",
        };
      }
    }
  return best;
}
export function scheduleHeaders(book: Workbook, schedule: Schedule): string[] {
  return (
    book.sheets.find((s) => s.name === schedule.sheet)?.preview[
      schedule.header_row - 1
    ] ?? []
  )
    .map((v) => String(v ?? "").trim())
    .filter(Boolean);
}
export function mappingError(
  book: Workbook | undefined,
  schedule: Schedule | null,
): string | null {
  if (!book || !schedule) return "Upload a schedule first.";
  if (book.id !== schedule.workbook_id)
    return "Choose mappings for the current workbook.";
  const sheet = book.sheets.find((s) => s.name === schedule.sheet);
  if (!sheet) return "Choose a worksheet from this workbook.";
  if (
    !Number.isInteger(schedule.header_row) ||
    schedule.header_row < 1 ||
    schedule.header_row > 1000
  )
    return "Choose a header row between 1 and 1000.";
  if (!schedule.guid_column.trim() || !schedule.material_column.trim())
    return "Choose the Global ID and expected-material columns. Material checks need one row per IFC GlobalId and an expected material; a classification workbook or model export alone is not a material schedule.";
  if (key(schedule.guid_column) === key(schedule.material_column))
    return "Global ID and expected material must use different columns.";
  // Rows beyond the upload preview are checked by the backend.
  if (schedule.header_row <= sheet.preview.length) {
    const headers = scheduleHeaders(book, schedule);
    for (const column of [schedule.guid_column, schedule.material_column]) {
      const count = headers.filter((h) => key(h) === key(column)).length;
      if (count !== 1)
        return `${count ? "Duplicate" : "Missing"} column “${column}” in “${schedule.sheet}”, row ${schedule.header_row}. Choose the correct header row and column.`;
    }
  }
  return null;
}
