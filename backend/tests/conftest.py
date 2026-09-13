import io

import ifcopenshell
import ifcopenshell.api
import openpyxl
import pytest
from app.config import Settings
from app.main import create_app
from fastapi.testclient import TestClient


@pytest.fixture
def model_bytes():
    model = ifcopenshell.file(schema="IFC4")
    run = ifcopenshell.api.run
    run("root.create_entity", model, ifc_class="IfcProject", name="Fixture")
    run("unit.assign_unit", model)
    storey = run("root.create_entity", model, ifc_class="IfcBuildingStorey", name="Ground")
    door_type = run("root.create_entity", model, ifc_class="IfcDoorType", name="Type A")
    steel = run("material.add_material", model, name="Steel")
    run("material.assign_material", model, products=[door_type], material=steel)
    type_pset = run("pset.add_pset", model, product=door_type, name="Pset_DoorCommon")
    run("pset.edit_pset", model, pset=type_pset, properties={"FireRating": "60", "IsExternal": True})
    doors = [run("root.create_entity", model, ifc_class="IfcDoor", name=f"Door {i}") for i in range(3)]
    run("type.assign_type", model, related_objects=doors[:2], relating_type=door_type)
    timber = run("material.add_material", model, name="Timber")
    run("material.assign_material", model, products=[doors[1]], material=timber)
    own = run("pset.add_pset", model, product=doors[1], name="Pset_DoorCommon")
    run("pset.edit_pset", model, pset=own, properties={"FireRating": "30"})
    quantities = run("pset.add_qto", model, product=doors[1], name="Qto_DoorBaseQuantities")
    run("pset.edit_qto", model, qto=quantities, properties={"Width": 900.0, "Height": 2100.0})
    run("spatial.assign_container", model, products=doors, relating_structure=storey)
    return model.to_string().encode(), [d.GlobalId for d in doors]


def workbook_bytes(rows, sheet="Door Schedule"):
    book = openpyxl.Workbook()
    ws = book.active
    ws.title = sheet
    ws.append(["GlobalId", "ExpectedMaterial"])
    for row in rows:
        ws.append(row)
    output = io.BytesIO()
    book.save(output)
    return output.getvalue()


@pytest.fixture
def app(tmp_path):
    return create_app(Settings(data_dir=tmp_path, api_key=""))


@pytest.fixture
def client(app):
    with TestClient(app) as client:
        yield client


@pytest.fixture
def loaded(client, model_bytes):
    content, guids = model_bytes
    response = client.post("/api/v1/models", files={"file": ("fixture.ifc", content)})
    assert response.status_code == 201, response.text
    return response.json(), guids
