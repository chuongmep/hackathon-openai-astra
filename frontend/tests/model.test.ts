import { beforeAll, expect, test } from "bun:test";
import { IfcParser, type IfcDataStore } from "@ifc-lite/parser";
import { createWorkbook, modelRows, properties } from "../src/lib/model";
import { assistantAPI } from "../src/mock-api";
let store: IfcDataStore;
beforeAll(async () => {
  store = await new IfcParser().parseColumnar(
    await Bun.file(
      new URL("../public/models/racbasicsampleproject.ifc", import.meta.url),
    ).arrayBuffer(),
  );
});
test("sample exposes real spatial structure, element identity, and property sets", () => {
  expect(store.schemaVersion).toBe("IFC2X3");
  expect(store.spatialHierarchy?.project.children.length).toBeGreaterThan(0);
  const rows = modelRows(store, [3808, 3808, 3862]);
  expect(rows).toHaveLength(2);
  expect(rows[0].type).toBe("IfcSlab");
  expect(rows[0].level).toBe("Level 1");
  expect(properties(store, 3862).length).toBeGreaterThan(0);
});
test("mock count understands IFC wall subclasses", async () => {
  const response = await assistantAPI.chat({
    message: "How many walls are there?",
    modelName: "Sample",
    elements: modelRows(store, [3808, 3862]),
    selected: undefined,
  });
  expect(response.text).toContain("IfcWallStandardCase: 1");
  expect(response.text).not.toContain("IfcSlab:");
});
test("mock selection without a selected element asks for one", async () => {
  const response = await assistantAPI.chat({
    message: "Tell me about the selected element",
    modelName: "Sample",
    elements: modelRows(store, [3808]),
    selected: undefined,
  });
  expect(response.text).toContain("Select an element");
});

test("XLSX round trip preserves model metadata and filter headers", async () => {
  const book = await createWorkbook(modelRows(store, [3808, 3862]));
  const { default: ExcelJS } = await import("exceljs");
  const restored = new ExcelJS.Workbook();
  await restored.xlsx.load(await book.xlsx.writeBuffer());
  const sheet = restored.getWorksheet("Model elements")!;
  expect(sheet.rowCount).toBe(3);
  expect(sheet.getCell("B2").value).toBe("Floor:Generic 150mm:176804");
  expect(sheet.getCell("C3").value).toBe("IfcWallStandardCase");
  expect(sheet.autoFilter).toBe("A1:E1");
});
