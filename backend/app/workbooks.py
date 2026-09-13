import io
import json
import zipfile
from collections import Counter

import openpyxl

from .config import AppError
from .schemas import Schedule


def open_book(content):
    try:
        with zipfile.ZipFile(io.BytesIO(content)) as archive:
            if sum(info.file_size for info in archive.infolist()) > 200 * 1024 * 1024:
                raise ValueError("Workbook expands beyond 200 MB")
        return openpyxl.load_workbook(io.BytesIO(content), read_only=True, data_only=False)
    except Exception as exc:
        raise AppError(422, "invalid_workbook", "Upload a valid .xlsx workbook under 200 MB uncompressed") from exc


def cell_value(value):
    if value is None or isinstance(value, (str, bool, int, float)):
        return value
    return str(value)


class WorkbookService:
    def __init__(self, storage):
        self.storage = storage

    def upload(self, filename, content):
        if not filename.lower().endswith(".xlsx"):
            raise AppError(422, "invalid_workbook", "Upload an .xlsx workbook")
        book = open_book(content)
        try:
            previews = [{"name": s.title, "rows": s.max_row, "columns": s.max_column,
                         "preview": [[cell_value(c) for c in r] for r in
                                     s.iter_rows(max_row=10, max_col=min(s.max_column or 1, 30), values_only=True)]}
                        for s in book]
        finally:
            book.close()
        return self.storage.public(self.storage.persist_file("workbook", filename, content, {"sheets": previews}))

    def summary(self, workbook_id):
        record = self.storage.get("workbook", workbook_id)
        public = self.storage.public(record)
        return {"workbook_id": workbook_id, "filename": public["filename"],
                "revision": public["revision"],
                "sheets": [{"name": s["name"], "rows": s["rows"], "columns": s["columns"],
                            "preview": [[v[:200] if isinstance(v, str) else v for v in row[:10]]
                                        for row in s["preview"][:3]]} for s in public["sheets"][:20]],
                "sheet_count": len(public["sheets"]), "previews_partial": True}

    def read_rows(self, workbook_id, sheet, offset=0, limit=30, search=None):
        if not 0 <= offset <= 100000 or not 1 <= limit <= 100:
            raise AppError(422, "invalid_page", "Use row offset 0–100000 and limit 1–100")
        record = self.storage.get("workbook", workbook_id)
        book = open_book(self.storage.file(record).read_bytes())
        try:
            if sheet not in book.sheetnames:
                raise AppError(422, "invalid_sheet", "Choose a worksheet returned by get_workbook_summary")
            ws = book[sheet]
            last = min(ws.max_row or 0, 100000)
            rows = []
            scanned = offset
            size = 0
            # Bound scans and provider input even on wide or very large workbooks.
            end = min(last, offset + 1000)
            for number, values in enumerate(ws.iter_rows(min_row=offset + 1, max_row=end,
                                                         max_col=min(ws.max_column or 1, 50), values_only=True), start=offset + 1):
                if number > end:
                    break
                scanned = number
                if search and not any(search.casefold() in str(v).casefold() for v in values if v is not None):
                    continue
                cells = [{"cell": f"{openpyxl.utils.get_column_letter(col)}{number}",
                          "value": cell_value(value) if not isinstance(value, str) else value[:300],
                          "truncated": isinstance(value, str) and len(value) > 300}
                         for col, value in enumerate(values, 1) if value is not None]
                row = {"row": number, "cells": cells}
                row_size = len(json.dumps(row))
                if rows and size + row_size > 30000:
                    scanned = number - 1
                    break
                size += row_size
                rows.append(row)
                if len(rows) >= limit:
                    break
            return {"workbook_id": workbook_id, "revision": record["revision"], "sheet": sheet,
                    "rows": rows, "next_offset": scanned if scanned < last else None,
                    "total_rows": ws.max_row, "columns_truncated": (ws.max_column or 0) > 50,
                    "rows_truncated": (ws.max_row or 0) > 100000,
                    "note": "Original cell values; formulas are strings, not evaluated results."}
        finally:
            book.close()

    def schedule(self, config: Schedule):
        record = self.storage.get("workbook", config.workbook_id)
        book = open_book(self.storage.file(record).read_bytes())
        try:
            if config.sheet not in book.sheetnames:
                raise AppError(422, "invalid_sheet", "Selected worksheet does not exist")
            sheet = book[config.sheet]
            if (sheet.max_row or 0) > 100000 or (sheet.max_column or 0) > 200:
                raise AppError(422, "schedule_too_large", "Schedule is limited to 100,000 rows and 200 columns")
            rows = sheet.iter_rows(min_row=config.header_row, values_only=True)
            headers = [str(x).strip() if x is not None else "" for x in next(rows, ())]
            # Header spelling is case/whitespace insensitive; entity GUIDs remain exact.
            def normalize(value):
                return "".join(value.split()).casefold()
            normalized = [normalize(header) for header in headers]
            columns = [normalize(config.guid_column), normalize(config.material_column)]
            for column, normalized_column in zip((config.guid_column, config.material_column), columns):
                count = normalized.count(normalized_column) if normalized_column else 0
                if count != 1:
                    reason = "Missing" if count == 0 else "Duplicate"
                    available = ", ".join(repr(h) for h in headers if h)[:500] or "(empty row)"
                    raise AppError(422, "invalid_columns", f"{reason} column {column!r} in worksheet {config.sheet!r}, header row {config.header_row}. Available headers: {available}. Choose the correct worksheet, header row and column mappings. Material validation requires IFC GlobalIds and expected materials.")
            if columns[0] == columns[1]:
                raise AppError(422, "invalid_columns", "GUID and material columns must be different")
            gi, mi = (normalized.index(column) for column in columns)
            result = []
            for number, cells in enumerate(rows, start=config.header_row + 1):
                guid, expected = cells[gi], cells[mi]
                if guid is None and expected is None:
                    continue
                result.append({"GlobalId": str(guid) if guid is not None else "",
                               "expected": str(expected) if expected is not None else "", "row": number})
            duplicates = {key for key, count in Counter(r["GlobalId"] for r in result).items() if count > 1}
            return result, duplicates
        finally:
            book.close()
