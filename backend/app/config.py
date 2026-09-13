import os
from dataclasses import dataclass, field
from pathlib import Path


@dataclass
class Settings:
    data_dir: Path = field(default_factory=lambda: Path(os.getenv("DATA_DIR", "data")))
    api_key: str = field(default_factory=lambda: os.getenv("OPENAI_API_KEY", ""))
    astra_model: str = field(default_factory=lambda: os.getenv("ASTRA_MODEL", "gpt-6-astra"))
    voice_model: str = field(default_factory=lambda: os.getenv("VOICE_MODEL", "gpt-live-1"))
    max_upload_bytes: int = 100 * 1024 * 1024


class AppError(Exception):
    def __init__(self, status: int, code: str, message: str):
        self.status, self.code, self.message = status, code, message
        super().__init__(message)
