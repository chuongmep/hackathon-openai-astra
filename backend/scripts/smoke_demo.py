"""Verify a running deployment with the supplied IFC and synthetic schedule."""
import argparse
import hashlib
from pathlib import Path

import httpx


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--url", default="http://localhost:3000")
    args = parser.parse_args()
    assets = Path(__file__).resolve().parents[2] / "assets"
    original = (assets / "racbasicsampleproject.ifc").read_bytes()
    with httpx.Client(base_url=args.url + "/api/v1", timeout=120) as client:
        response = client.get("/health")
        response.raise_for_status()
        response = client.post("/models", files={"file": ("racbasicsampleproject.ifc", original)})
        response.raise_for_status()
        model = response.json()
        assert model["model_revision"] == hashlib.sha256(original).hexdigest()
        response = client.get(f"/models/{model['id']}/file")
        response.raise_for_status()
        assert response.content == original
        response = client.get(f"/models/{model['id']}/entities", params={"ifc_class": "IfcDoor"})
        response.raise_for_status()
        assert response.json()["total"] == 16
        response = client.post("/workbooks", files={"file": ("demo-door-schedule.xlsx", (assets / "demo-door-schedule.xlsx").read_bytes())})
        response.raise_for_status()
        book = response.json()
        response = client.post("/validations", json={"model_id": model["id"], "model_revision": model["model_revision"],
                               "schedule": {"workbook_id": book["id"], "sheet": "Door Schedule",
                                            "guid_column": "GlobalId", "material_column": "ExpectedMaterial"}})
        response.raise_for_status()
        report = response.json()
        assert report["counts"] == {"pass": 13, "fail": 1, "unknown": 2}, report["counts"]
        assert len(report["uncovered_door_guids"]) == 1
        response = client.get(f"/validations/{report['id']}", params={"format": "csv"})
        response.raise_for_status()
        assert "material_mismatch" in response.text
        print(f"PASS: 16 doors; {report['counts']}; 1 uncovered; original IFC bytes and CSV verified")
        print(f"Report: {args.url}/api/v1/validations/{report['id']}")


if __name__ == "__main__":
    main()
