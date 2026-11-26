from fastapi import APIRouter

from services.elevation import router as elevation_router

router = APIRouter()

api = APIRouter(prefix="/api")
api.include_router(elevation_router)

router.include_router(api)
