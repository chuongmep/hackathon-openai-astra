import threading
from collections import Counter, OrderedDict

import ifcopenshell
import ifcopenshell.util.element as element_util
import ifcopenshell.util.unit as unit_util

from .config import AppError
from .schemas import ModelContext
from .storage import Storage


def safe(value):
    """Keep IFC values serializable without discarding numeric/boolean types."""
    if isinstance(value, ifcopenshell.entity_instance):
        return {"express_id": value.id(), "ifc_class": value.is_a(),
                "Name": getattr(value, "Name", None)}
    if isinstance(value, dict):
        return {k: safe(v) for k, v in value.items()}
    if isinstance(value, (list, tuple)):
        return [safe(v) for v in value]
    return value


def material_data(entity) -> dict:
    direct = element_util.get_material(entity, should_inherit=False)
    effective = element_util.get_material(entity, should_inherit=True)
    materials = element_util.get_materials(entity, should_inherit=True)
    type_entity = element_util.get_type(entity)
    source = entity if direct else type_entity
    return {"names": [m.Name for m in materials if m.Name],
            "assignment_class": effective.is_a() if effective else None,
            "source": "occurrence" if direct else "type" if effective else None,
            "source_express_id": source.id() if effective and source else None,
            "source_GlobalId": getattr(source, "GlobalId", None) if effective else None}


def row(entity) -> dict:
    storey = element_util.get_container(entity)
    return {"GlobalId": getattr(entity, "GlobalId", None), "express_id": entity.id(),
            "ifc_class": entity.is_a(), "Name": getattr(entity, "Name", None),
            "storey": {"GlobalId": storey.GlobalId, "Name": storey.Name} if storey else None}


class IfcService:
    def __init__(self, storage: Storage):
        self.storage = storage
        self.cache = OrderedDict()
        self.lock = threading.RLock()

    def upload(self, filename: str, content: bytes) -> dict:
        if not filename.lower().endswith(".ifc"):
            raise AppError(422, "invalid_ifc", "Upload an uncompressed .ifc STEP file")
        try:
            text = content.decode("utf-8-sig")
            if not text.lstrip().startswith("ISO-10303-21;") or "END-ISO-10303-21;" not in text:
                raise ValueError("Missing STEP header or end marker")
            model = ifcopenshell.file.from_string(text)
            if not model.by_type("IfcProject"):
                raise ValueError("IFC file has no IfcProject")
            summary = self.summary_of(model)
        except Exception as exc:
            raise AppError(422, "invalid_ifc", "Unable to parse IFC STEP file; check its schema and contents") from exc
        record = self.storage.persist_file("model", filename, content, {"summary": summary})
        with self.lock:
            self._cache(record["id"], model)
        return self.public(record)

    def public(self, record):
        return {**self.storage.public(record), "model_id": record["id"], "model_revision": record["revision"]}

    def _cache(self, model_id, model):
        self.cache[model_id] = model
        self.cache.move_to_end(model_id)
        while len(self.cache) > 2:
            self.cache.popitem(last=False)

    def check(self, context: ModelContext) -> dict:
        record = self.storage.get("model", context.model_id)
        if record["revision"] != context.model_revision:
            raise AppError(409, "revision_mismatch", "Model revision changed; reload model context")
        return record

    def load(self, model_id):
        with self.lock:
            record = self.storage.get("model", model_id)
            if model_id not in self.cache:
                self._cache(model_id, ifcopenshell.open(str(self.storage.file(record))))
            self.cache.move_to_end(model_id)
            return self.cache[model_id]

    @staticmethod
    def summary_of(model):
        counts = Counter(e.is_a() for e in model.by_type("IfcElement"))
        return {"schema": model.schema, "counts": dict(sorted(counts.items())),
                "element_count": sum(counts.values()),
                "length_unit_to_metre": unit_util.calculate_unit_scale(model),
                "storeys": [{"GlobalId": e.GlobalId, "Name": e.Name,
                             "Elevation": e.Elevation} for e in model.by_type("IfcBuildingStorey")]}

    def entity(self, model, guid):
        try:
            return model.by_guid(guid)
        except RuntimeError as exc:
            raise AppError(404, "entity_not_found", f"IFC entity {guid} not found") from exc

    def query(self, model_id, ifc_class="IfcElement", search=None, storey_guid=None,
              offset=0, limit=100, guids=None, property_set=None, property_name=None, property_value=None):
        with self.lock:
            model = self.load(model_id)
            try:
                entities = model.by_type(ifc_class)
            except RuntimeError as exc:
                raise AppError(422, "invalid_ifc_class", f"Unknown IFC class: {ifc_class}") from exc
            # Return occurrences only, never count type definitions as physical objects.
            entities = [e for e in entities if e.is_a("IfcObject")]
            if guids is not None:
                wanted = set(guids)
                entities = [e for e in entities if e.GlobalId in wanted]
            if search:
                entities = [e for e in entities if search.casefold() in (e.Name or "").casefold()]
            if storey_guid:
                entities = [e for e in entities if (c := element_util.get_container(e)) and c.GlobalId == storey_guid]
            if property_name:
                if not property_set:
                    raise AppError(422, "property_filter", "property_set is required with property_name")
                entities = [e for e in entities if str(element_util.get_pset(e, property_set, property_name)) == property_value]
            return {"model_id": model_id, "model_revision": self.storage.get("model", model_id)["revision"],
                    "total": len(entities), "offset": offset, "limit": limit,
                    "items": [row(e) for e in entities[offset:offset + limit]]}

    def details(self, model_id, guid):
        with self.lock:
            entity = self.entity(self.load(model_id), guid)
            type_entity = element_util.get_type(entity)
            own = element_util.get_psets(entity, should_inherit=False)
            inherited = element_util.get_psets(type_entity, should_inherit=False) if type_entity else {}
            effective = element_util.get_psets(entity, should_inherit=True)
            provenance = {}
            for pset, properties in effective.items():
                provenance[pset] = {name: "occurrence" if name in own.get(pset, {}) else "type"
                                    for name in properties if name != "id"}
            return {**row(entity), "attributes": safe(entity.get_info()),
                    "properties_and_quantities": safe(effective), "property_provenance": provenance,
                    "occurrence_properties_and_quantities": safe(own),
                    "type_properties_and_quantities": safe(inherited),
                    "type": safe(type_entity), "materials": material_data(entity)}

    def all_guids(self, model_id, ifc_class="IfcDoor"):
        with self.lock:
            return [e.GlobalId for e in self.load(model_id).by_type(ifc_class)]

    def validate_guids(self, model_id, guids):
        with self.lock:
            model = self.load(model_id)
            for guid in guids:
                self.entity(model, guid)
