import logging

from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from starlette.middleware.sessions import SessionMiddleware

from modules.common.runtime import SESSION_SECRET, VERSION_INFO
from modules.history.router import router as history_router
from modules.history.service import download_history_service
from modules.javbus_api import javbus_api_service
from modules.javbus_api.router import router as javbus_api_router
from modules.magnets.router import router as magnets_router
from modules.movies.router import router as movies_router
from modules.pikpak.router import router as pikpak_router
from modules.proxy.router import router as proxy_router
from modules.system.router import router as system_router
from modules.ui.router import router as ui_router
from modules.webdav.router import router as webdav_router
from modules.webdav.session_state import session_store as webdav_session_store


logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(levelname)s - %(message)s",
    handlers=[logging.StreamHandler()],
)
logger = logging.getLogger(__name__)
logger.info("应用版本信息: %s", VERSION_INFO)


app = FastAPI(title="JavJaeger", description="基于JavBus的高效影片系统")
app.add_middleware(SessionMiddleware, secret_key=SESSION_SECRET, same_site="lax", https_only=False)
app.mount("/static", StaticFiles(directory="static"), name="static")

app.include_router(ui_router)
app.include_router(system_router)
app.include_router(history_router)
app.include_router(movies_router)
app.include_router(magnets_router)
app.include_router(javbus_api_router)
app.include_router(pikpak_router)
app.include_router(webdav_router)
app.include_router(proxy_router)


@app.on_event("startup")
async def startup_event():
    logger.info("JavJaeger 应用启动中...")
    await javbus_api_service.startup()
    await download_history_service.load_records()
    logger.info("JavJaeger 应用启动完成")


@app.on_event("shutdown")
async def shutdown_event():
    await javbus_api_service.shutdown()
    await webdav_session_store.close_all()


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=5000)
