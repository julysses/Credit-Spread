from fastapi import APIRouter

from app.services.health_service import HealthService

router = APIRouter()


@router.get('/health')
def health() -> dict:
    return {"status": "ok"}
