import { extractPropertiesOnDemand, type IfcDataStore } from "@ifc-lite/parser";
export type ModelRow = {
  id: number;
  name: string;
  type: string;
  globalId: string;
  level: string;
};
export function modelRows(store: IfcDataStore, ids: number[]): ModelRow[] {
  return [...new Set(ids)].map((id) => ({
    id,
    name: store.entities.getName(id) || `Element ${id}`,
    type: store.entities.getTypeName(id),
    globalId: store.entities.getGlobalId(id),
    level:
      store.spatialHierarchy
        ?.getPath(id)
        .filter((n) => n.elevation !== undefined)
        .map((n) => n.name)
        .join(" / ") || "Unassigned",
  }));
}
export function properties(store: IfcDataStore, id: number) {
  return extractPropertiesOnDemand(store, id);
}
export async function createWorkbook(rows: ModelRow[]) {
  const { default: ExcelJS } = await import("exceljs");
  const book = new ExcelJS.Workbook();
  const sheet = book.addWorksheet("Model elements", {
    views: [{ state: "frozen", ySplit: 1 }],
  });
  sheet.columns = [
    { header: "Express ID", key: "id", width: 14 },
    { header: "Element name", key: "name", width: 55 },
    { header: "IFC class", key: "type", width: 25 },
    { header: "Level", key: "level", width: 25 },
    { header: "Global ID", key: "globalId", width: 30 },
  ];
  sheet.addRows(rows);
  sheet.autoFilter = "A1:E1";
  sheet.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
  sheet.getRow(1).fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FF147D73" },
  };
  return book;
}
export async function exportWorkbook(rows: ModelRow[], name: string) {
  const book = await createWorkbook(rows);
  const buffer = await book.xlsx.writeBuffer();
  const url = URL.createObjectURL(
    new Blob([buffer], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    }),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = name.replace(/\.ifc$/i, "") + ".xlsx";
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
