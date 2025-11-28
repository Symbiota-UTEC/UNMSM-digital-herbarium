from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from backend.config.database import engine
from backend.models import models as models_module

from backend.routers import occurrence as occurrence_router
from backend.routers import institutions as institutions_router
from backend.routers import auth as auth_router
from backend.routers import users as users_router
from backend.routers import admin as admin_router
from backend.routers import collections as collections_router
from backend.routers import upload as upload_router
from backend.routers import taxon as taxon_router
from backend.routers import autocomplete

models_module.Base.metadata.create_all(bind=engine)

app = FastAPI(
    title="UNMSM Digital Herbarium API",
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(occurrence_router.router, prefix="/api")
app.include_router(auth_router.router, prefix="/api")
app.include_router(institutions_router.router, prefix="/api")
app.include_router(users_router.router, prefix="/api")
app.include_router(admin_router.router, prefix="/api")
app.include_router(collections_router.router, prefix="/api")
app.include_router(upload_router.router, prefix="/api")
app.include_router(taxon_router.router, prefix="/api")
app.include_router(autocomplete.router, prefix="/api")

@app.get("/", tags=["meta"])
def root():
    return {"ok": True, "service": "UNMSM Digital Herbarium API"}
