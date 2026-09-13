import { expect, test } from "bun:test";
import { mappingError, suggestSchedule } from "../src/lib/schedule";
import type { Workbook } from "../src/lib/api";
const book = (preview: (string | number | null)[][]): Workbook => ({
  id: "b",
  sheets: [{ name: "Doors", preview }],
});
test("detects actual spaced headers below a title row", () => {
  const b = book([
    ["Door schedule"],
    [" Global ID ", "Expected Material"],
    ["abc", "Steel"],
  ]);
  const s = suggestSchedule(b);
  expect(s.header_row).toBe(2);
  expect(s.guid_column).toBe("Global ID");
  expect(s.material_column).toBe("Expected Material");
  expect(mappingError(b, s)).toBeNull();
});
test("export and classification workbooks cannot silently become material schedules", () => {
  for (const b of [
    book([["Global ID", "Element name"]]),
    book([["Code", "Description"]]),
  ]) {
    expect(mappingError(b, suggestSchedule(b))).toContain("expected-material");
  }
});
test("ambiguous equivalent headers remain invalid", () => {
  const b = book([["GlobalId", "Global ID", "ExpectedMaterial"]]);
  expect(
    mappingError(b, { ...suggestSchedule(b), guid_column: "GlobalId" }),
  ).toContain("Duplicate");
});
test("chooses compatible sheet and re-detects mappings when sheet changes", () => {
  const b = {
    ...book([["GlobalId", "ExpectedMaterial"]]),
    sheets: [
      { name: "Instructions", preview: [["Read me"]] },
      ...book([["GlobalId", "ExpectedMaterial"]]).sheets,
    ],
  };
  expect(suggestSchedule(b).sheet).toBe("Doors");
  expect(suggestSchedule(b, "Instructions").guid_column).toBe("");
});
