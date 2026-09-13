import csv
import io
from collections import Counter

from .config import AppError
from .schemas import ValidationRequest


def normalize(value):
    return " ".join(value.split()).casefold()


def csv_safe(value):
    text = str(value if value is not None else "")
    if text.lstrip("\ufeff \t\r\n").startswith(("=", "+", "-", "@")) or text.startswith(("\t", "\r", "\n")):
        return "'" + text
    return text


class ValidationService:
    def __init__(self, storage, ifc, workbooks):
        self.storage, self.ifc, self.workbooks = storage, ifc, workbooks

    def run(self, request: ValidationRequest):
        self.ifc.check(request)
        rows, duplicates = self.workbooks.schedule(request.schedule)
        findings = []
        seen = set()
        for record in rows:
            guid, expected = record["GlobalId"], record["expected"]
            seen.add(guid)
            actual, provenance, status, reason = [], None, "unknown", ""
            try:
                detail = self.ifc.details(request.model_id, guid)
                actual = detail["materials"]["names"]
                provenance = detail["materials"]
                if guid in duplicates:
                    reason = "duplicate_schedule_key"
                elif not expected.strip():
                    reason = "missing_expected_material"
                elif expected.startswith("="):
                    reason = "formula_not_supported"
                elif not actual:
                    reason = "missing_ifc_material"
                else:
                    status = "pass" if normalize(expected) in {normalize(m) for m in actual} else "fail"
                    reason = "material_matches" if status == "pass" else "material_mismatch"
            except AppError as exc:
                if exc.code != "entity_not_found":
                    raise
                reason = "entity_not_found" if guid else "missing_global_id"
            findings.append({"GlobalId": guid, "status": status, "reason": reason,
                             "actual": actual, "expected": expected, "material_provenance": provenance,
                             "source": {"workbook_id": request.schedule.workbook_id,
                                        "sheet": request.schedule.sheet, "row": record["row"]}})
        uncovered = sorted(set(self.ifc.all_guids(request.model_id)) - seen)
        return self.storage.save("validation", {**request.model_dump(), "findings": findings,
                                                "counts": dict(Counter(f["status"] for f in findings)),
                                                "uncovered_door_guids": uncovered})

    @staticmethod
    def csv(report):
        output = io.StringIO(newline="")
        writer = csv.writer(output)
        writer.writerow(["model_id", "model_revision", "GlobalId", "status", "reason", "actual", "expected",
                         "workbook_id", "sheet", "row"])
        for f in report["findings"]:
            writer.writerow([csv_safe(v) for v in [report["model_id"], report["model_revision"], f["GlobalId"],
                             f["status"], f["reason"], "; ".join(f["actual"]), f["expected"],
                             f["source"]["workbook_id"], f["source"]["sheet"], f["source"]["row"]]])
        for guid in report["uncovered_door_guids"]:
            writer.writerow([report["model_id"], report["model_revision"], csv_safe(guid), "unknown",
                             "uncovered_door", "", "", report["schedule"]["workbook_id"],
                             csv_safe(report["schedule"]["sheet"]), ""])
        return output.getvalue()
