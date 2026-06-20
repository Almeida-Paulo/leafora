from fastapi import APIRouter

from app.api.routes import evidence, health, projects, supports

api_router = APIRouter()
api_router.include_router(health.router, tags=["health"])
api_router.include_router(projects.router, prefix="/projects", tags=["projects"])
api_router.include_router(evidence.router, tags=["evidence"])
api_router.include_router(supports.router, tags=["supports"])

