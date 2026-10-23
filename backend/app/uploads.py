import uuid
from pathlib import Path

from starlette.datastructures import UploadFile

from .config import settings
from .util import ApiError

UPLOAD_DIR = Path(settings.upload_dir)
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)

TYPES = {"image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp"}
MAX_BYTES = 3 * 1024 * 1024


async def save_image(file) -> str | None:
    """Saves an uploaded product photo and returns its public URL, or None when no file was sent."""
    if not isinstance(file, UploadFile) or not file.filename:
        return None
    ext = TYPES.get(file.content_type or "")
    if not ext:
        raise ApiError(400, "Upload a JPG, PNG or WebP photo")
    data = await file.read(MAX_BYTES + 1)
    if len(data) > MAX_BYTES:
        raise ApiError(400, "Photo must be under 3 MB")
    name = f"{uuid.uuid4()}{ext}"
    (UPLOAD_DIR / name).write_bytes(data)
    return f"/uploads/{name}"


def remove_image(url: str | None) -> None:
    if url and url.startswith("/uploads/"):
        (UPLOAD_DIR / Path(url).name).unlink(missing_ok=True)
