import uuid
from pathlib import Path

from fastapi import APIRouter, Response
from fastapi.responses import FileResponse
from starlette.datastructures import UploadFile

from . import db
from .config import settings
from .util import ApiError

router = APIRouter()

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
    # Stored in the database, not on disk: hosts like Render wipe the disk on every restart.
    await db.execute("INSERT INTO images (name, content_type, data) VALUES ($1, $2, $3)", name, file.content_type, data)
    return f"/uploads/{name}"


async def remove_image(url: str | None) -> None:
    if url and url.startswith("/uploads/"):
        name = Path(url).name
        await db.execute("DELETE FROM images WHERE name = $1", name)
        (UPLOAD_DIR / name).unlink(missing_ok=True)


@router.get("/uploads/{name}", include_in_schema=False)
async def get_image(name: str):
    row = await db.fetchrow("SELECT content_type, data FROM images WHERE name = $1", name)
    if row:
        # Names are never reused, so browsers can keep a photo for good.
        return Response(row["data"], media_type=row["content_type"],
                        headers={"Cache-Control": "public, max-age=31536000, immutable"})
    # Photos uploaded before they moved into the database.
    file = UPLOAD_DIR / Path(name).name
    if file.is_file():
        return FileResponse(file)
    raise ApiError(404, "Photo not found")
