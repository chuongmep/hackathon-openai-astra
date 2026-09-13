"""Verify a running deployment with the supplied IFC and synthetic schedule."""
import argparse
import hashlib
import re
from pathlib import Path

import httpx


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--url", default="http://localhost:3000")
    parser.add_argument("--assets-dir", type=Path, default=Path(__file__).resolve().parents[2] / "assets")
    args = parser.parse_args()
    assets = args.assets_dir
    original = (assets / "racbasicsampleproject.ifc").read_bytes()
    base_url = args.url.rstrip("/")
    with httpx.Client(base_url=base_url, timeout=120) as web:
        response = web.get("/")
        response.raise_for_status()
        assert 'id="root"' in response.text, "Frontend application shell is missing"
        assert response.headers.get("cross-origin-opener-policy") == "same-origin"
        assert response.headers.get("cross-origin-embedder-policy") == "require-corp"
        scripts = re.findall(r'<script\b[^>]*\bsrc="([^"]+)"', response.text)
        assert scripts, "Frontend JavaScript bundle is missing"
        for source in scripts:
            bundle = web.get(source)
            bundle.raise_for_status()
            assert "javascript" in bundle.headers.get("content-type", ""), source
        response = web.get("/models/racbasicsampleproject.ifc")
        response.raise_for_status()
        assert response.content == original, "Frontend sample differs from the source IFC"
        response = web.get("/missing-runtime.wasm")
        assert response.status_code == 404, "Missing WASM must not return the HTML application shell"
        response = web.get("/api/openapi.json")
        response.raise_for_status()
        assert "/api/v1/models" in response.json()["paths"]
        print("PASS: frontend bundle, sample IFC, isolation headers, WASM 404, and API proxy")
    with httpx.Client(base_url=base_url + "/api/v1", timeout=120) as client:
        response = client.get("/health")
        response.raise_for_status()
        health = response.json()
        assert health["status"] == "ok"
        response = client.post("/models", files={"file": ("racbasicsampleproject.ifc", original)})
        response.raise_for_status()
        model = response.json()
        assert model["model_revision"] == hashlib.sha256(original).hexdigest()
        context = {"model_id": model["id"], "model_revision": model["model_revision"]}
        if not health["chat_configured"]:
            response = client.post("/chat", json={**context, "message": "How many doors?"})
            assert response.status_code == 503
            assert response.json()["error"]["code"] == "openai_not_configured"
        if not health["voice_configured"]:
            response = client.post("/voice/sessions", json={**context, "sdp": "v=0\r\n"})
            assert response.status_code == 503
            assert response.json()["error"]["code"] == "openai_not_configured"
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
