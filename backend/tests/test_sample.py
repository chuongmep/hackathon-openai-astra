from pathlib import Path

import pytest


@pytest.mark.sample
def test_supplied_revit_model_and_demo_schedule(client):
    assets = Path(__file__).resolve().parents[2] / "assets"
    model = client.post("/api/v1/models", files={"file": ("sample.ifc", (assets / "racbasicsampleproject.ifc").read_bytes())})
    assert model.status_code == 201, model.text
    record = model.json()
    assert record["summary"]["schema"] == "IFC2X3"
    assert record["summary"]["counts"]["IfcDoor"] == 16
    book = client.post("/api/v1/workbooks", files={"file": ("demo.xlsx", (assets / "demo-door-schedule.xlsx").read_bytes())}).json()
    result = client.post("/api/v1/validations", json={"model_id": record["id"], "model_revision": record["revision"],
                        "schedule": {"workbook_id": book["id"], "sheet": "Door Schedule"}})
    assert result.status_code == 201, result.text
    report = result.json()
    assert report["counts"]["fail"] >= 1
    assert report["counts"]["unknown"] >= 2
    assert len(report["uncovered_door_guids"]) == 1
