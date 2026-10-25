import asyncio
import contextlib
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from starlette.exceptions import HTTPException as StarletteHTTPException

from . import db, uploads
from .config import settings
from .routes import addresses, admin, auth, catalog, delivery, offers, orders
from .services.orders import expire_unpaid_orders
from .util import ApiError


async def _expire_loop():
    while True:
        await asyncio.sleep(5 * 60)
        try:
            await expire_unpaid_orders()
        except Exception as e:  # keep the loop alive
            print("expire_unpaid_orders failed:", e, flush=True)


@asynccontextmanager
async def lifespan(_app: FastAPI):
    await db.connect()
    await uploads.forget_lost_images()
    print(f"API ready (admin phone {settings.admin_phone}, OTP dev mode {settings.otp_dev_mode})", flush=True)
    task = asyncio.create_task(_expire_loop())
    yield
    task.cancel()
    with contextlib.suppress(asyncio.CancelledError):
        await task
    await db.close()


app = FastAPI(title=f"{settings.shop_name} API", lifespan=lifespan, docs_url="/api/docs", openapi_url="/api/openapi.json")

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Every error reaches the apps as {"error": "<message to show>"}.
@app.exception_handler(ApiError)
async def api_error(_req: Request, exc: ApiError):
    return JSONResponse({"error": exc.message}, status_code=exc.status)


@app.exception_handler(StarletteHTTPException)
async def http_error(_req: Request, exc: StarletteHTTPException):
    return JSONResponse({"error": str(exc.detail)}, status_code=exc.status_code)


@app.exception_handler(Exception)
async def unexpected_error(_req: Request, exc: Exception):
    import traceback
    traceback.print_exception(exc)
    return JSONResponse({"error": "Something went wrong. Please try again."}, status_code=500)


@app.exception_handler(RequestValidationError)
async def validation_error(_req: Request, exc: RequestValidationError):
    return JSONResponse({"error": "Some details are missing or not valid"}, status_code=422)


for module in (catalog, auth, addresses, orders, offers, admin, delivery):
    app.include_router(module.router)

app.include_router(uploads.router)

# Single-service hosting (Render): serve the built website, with index.html for every app route.
if settings.static_dir:
    STATIC_DIR = Path(settings.static_dir).resolve()
    app.mount("/assets", StaticFiles(directory=STATIC_DIR / "assets"), name="assets")

    @app.get("/{path:path}", include_in_schema=False)
    async def website(path: str):
        if path.startswith("api/"):
            raise StarletteHTTPException(404, "Not found")
        file = (STATIC_DIR / path).resolve()
        if path and file.is_file() and file.is_relative_to(STATIC_DIR):
            return FileResponse(file)
        return FileResponse(STATIC_DIR / "index.html", headers={"Cache-Control": "no-cache"})
