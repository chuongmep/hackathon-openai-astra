from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


class StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid")


class ModelContext(StrictModel):
    model_id: str
    model_revision: str


class Schedule(StrictModel):
    workbook_id: str
    sheet: str
    guid_column: str = "GlobalId"
    material_column: str = "ExpectedMaterial"
    header_row: int = Field(default=1, ge=1, le=1000)


class ValidationRequest(ModelContext):
    schedule: Schedule


class Message(StrictModel):
    role: Literal["user", "assistant"]
    content: str = Field(max_length=12000)


class TaskContext(ModelContext):
    selected_guids: list[str] = Field(default_factory=list, max_length=5000)
    schedule: Schedule | None = None
    history: list[Message] = Field(default_factory=list, max_length=50)


class ChatRequest(TaskContext):
    message: str = Field(min_length=1, max_length=12000)


class VoiceRequest(TaskContext):
    sdp: str = Field(min_length=1, max_length=100000)


class ViewerAction(ModelContext):
    action: Literal["select", "highlight", "isolate", "frame", "reset"]
    guids: list[str] = Field(default_factory=list)
    color: tuple[float, float, float, float] = (1, 0.25, 0.15, 1)
