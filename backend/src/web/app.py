from fastapi import APIRouter

from services.elevation import router as elevation_router
from services.shares import router as shares_router

router = APIRouter()

api = APIRouter(prefix="/api")
api.include_router(elevation_router)
api.include_router(shares_router)

router.include_router(api)
