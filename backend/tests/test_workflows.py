import csv
import io

from app.config import Settings
from app.main import create_app
from app.validation import csv_safe
from conftest import workbook_bytes
from fastapi.testclient import TestClient


def test_counts_properties_materials_and_filtering(client, loaded):
    model, guids = loaded
    base = f"/api/v1/models/{model['id']}/entities"
    result = client.get(base, params={"ifc_class": "IfcDoor", "limit": 1, "offset": 1}).json()
    assert result["total"] == 3
    assert result["model_revision"] == model["model_revision"]
    assert len(result["items"]) == 1
    inherited = client.get(f"{base}/{guids[0]}").json()
    assert inherited["materials"]["names"] == ["Steel"]
    assert inherited["materials"]["source"] == "type"
    own = client.get(f"{base}/{guids[1]}").json()
    assert own["materials"]["names"] == ["Timber"]
    assert own["materials"]["source"] == "occurrence"
    assert own["properties_and_quantities"]["Pset_DoorCommon"]["FireRating"] == "30"
    assert own["property_provenance"]["Pset_DoorCommon"]["IsExternal"] == "type"
    assert own["properties_and_quantities"]["Qto_DoorBaseQuantities"]["Width"] == 900.0
    assert own["property_provenance"]["Qto_DoorBaseQuantities"]["Width"] == "occurrence"
    assert client.get(base, params={"storey_guid": own["storey"]["GlobalId"]}).json()["total"] == 3
    assert model["summary"]["length_unit_to_metre"] == 0.001
    assert client.get(base, params={"search": "Door 0"}).json()["total"] == 1
    assert client.get(base, params={"ifc_class": "IfcDoor", "property_set": "Pset_DoorCommon",
                      "property_name": "FireRating", "property_value": "30"}).json()["total"] == 1
    assert client.get(base, params={"ifc_class": "IfcDoorType"}).json()["total"] == 0
    assert client.get(base, params={"ifc_class": "IfcBanana"}).status_code == 422
    assert client.get(base, params={"limit": 501}).status_code == 422


def test_validation_evidence_export_and_restart(client, loaded, tmp_path):
    model, guids = loaded
    rows = [(guids[0], "  STEEL  "), (guids[1], "Steel"), (guids[2], "Steel"), ("unknown", "=1+1")]
    workbook = client.post("/api/v1/workbooks", files={"file": ("schedule.xlsx", workbook_bytes(rows))}).json()
    body = {"model_id": model["id"], "model_revision": model["revision"],
            "schedule": {"workbook_id": workbook["id"], "sheet": "Door Schedule"}}
    result = client.post("/api/v1/validations", json=body)
    assert result.status_code == 201, result.text
    report = result.json()
    assert report["counts"] == {"pass": 1, "fail": 1, "unknown": 2}
    assert report["findings"][1]["source"]["row"] == 3
    assert report["findings"][1]["actual"] == ["Timber"]
    response = client.get(f"/api/v1/validations/{report['id']}?format=csv")
    parsed = list(csv.DictReader(io.StringIO(response.text)))
    assert parsed[-1]["expected"] == "'=1+1"
    assert client.post("/api/v1/validations", json={**body, "model_revision": "old"}).status_code == 409
    with TestClient(create_app(Settings(data_dir=tmp_path, api_key=""))) as restarted:
        assert restarted.get(f"/api/v1/models/{model['id']}/entities/{guids[0]}").json()["materials"]["names"] == ["Steel"]
        assert restarted.get(f"/api/v1/validations/{report['id']}").json() == report


def test_unknown_duplicate_missing_and_uncovered(client, loaded):
    model, guids = loaded
    rows = [(guids[0], "Steel"), (guids[0], "Timber"), (guids[1], None)]
    book = client.post("/api/v1/workbooks", files={"file": ("a.xlsx", workbook_bytes(rows))}).json()
    body = {"model_id": model["id"], "model_revision": model["revision"],
            "schedule": {"workbook_id": book["id"], "sheet": "Door Schedule"}}
    report = client.post("/api/v1/validations", json=body).json()
    assert [r["reason"] for r in report["findings"]] == ["duplicate_schedule_key", "duplicate_schedule_key", "missing_expected_material"]
    assert report["uncovered_door_guids"] == [guids[2]]
    body["schedule"]["guid_column"] = "Bad Header"
    assert client.post("/api/v1/validations", json=body).status_code == 422


def test_invalid_uploads_and_missing_credentials(client, loaded, app):
    for endpoint, name in [("models", "bad.ifc"), ("workbooks", "bad.xlsx")]:
        assert client.post(f"/api/v1/{endpoint}", files={"file": (name, b"not a model")}).status_code == 422
        assert client.post(f"/api/v1/{endpoint}", files={"file": (name, b"")}).status_code == 422
    model, _ = loaded
    context = {"model_id": model["id"], "model_revision": model["revision"]}
    assert client.post("/api/v1/chat", json={**context, "message": "How many doors?"}).status_code == 503
    assert client.post("/api/v1/voice/sessions", json={**context, "sdp": "offer"}).status_code == 503
    assert client.get("/api/v1/health").json()["status"] == "ok"


def test_size_limit(tmp_path):
    with TestClient(create_app(Settings(data_dir=tmp_path, api_key="", max_upload_bytes=16))) as client:
        assert client.post("/api/v1/models", files={"file": ("a.ifc", b"x" * 17)}).status_code == 413


def test_csv_sanitizes_bom_and_controls():
    for value in ["=1", "+1", "-1", "@a", "\ttext", "\rtext", "\ufeff=1", "  =1"]:
        assert csv_safe(value).startswith("'")
    assert csv_safe("Steel") == "Steel"


def test_schedule_header_normalization_and_actionable_errors(client, loaded):
    import openpyxl

    model, guids = loaded
    def validate(headers, guid_column="GlobalId", material_column="ExpectedMaterial"):
        book = openpyxl.Workbook()
        book.active.title = "Materials"
        book.active.append(["Schedule title"])
        book.active.append(headers)
        book.active.append([guids[0], "Steel", None])
        output = io.BytesIO()
        book.save(output)
        uploaded = client.post("/api/v1/workbooks", files={"file": ("schedule.xlsx", output.getvalue())}).json()
        return client.post("/api/v1/validations", json={"model_id": model["id"], "model_revision": model["revision"],
            "schedule": {"workbook_id": uploaded["id"], "sheet": "Materials", "header_row": 2,
                         "guid_column": guid_column, "material_column": material_column}})

    result = validate([" Global ID ", "Expected Material"])
    assert result.status_code == 201, result.text
    assert result.json()["findings"][0]["status"] == "pass"
    assert result.json()["findings"][0]["source"]["row"] == 3
    missing = validate(["Code", "Description"])
    assert missing.status_code == 422
    message = missing.json()["error"]["message"]
    assert "Materials" in message and "row 2" in message and "Code" in message
    duplicate = validate(["GlobalId", "ExpectedMaterial", "GLOBAL ID"])
    assert duplicate.status_code == 422
    assert "Duplicate" in duplicate.json()["error"]["message"]
