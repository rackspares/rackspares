import os
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from database import Base, SessionLocal, engine
import models
from routers import auth, inventory
from routers.auth import hash_password


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Create tables
    Base.metadata.create_all(bind=engine)

    # Seed admin user
    db = SessionLocal()
    try:
        admin_username = os.getenv("ADMIN_USERNAME", "admin")
        admin_password = os.getenv("ADMIN_PASSWORD", "admin")
        if not db.query(models.User).filter(models.User.username == admin_username).first():
            db.add(models.User(
                username=admin_username,
                hashed_password=hash_password(admin_password),
                is_admin=True,
            ))
            db.commit()
            print(f"[rackspares] Created admin user: {admin_username}")
    finally:
        db.close()

    yield


app = FastAPI(title="RackSpares API", version="0.1.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router, prefix="/api/auth", tags=["auth"])
app.include_router(inventory.router, prefix="/api/inventory", tags=["inventory"])


@app.get("/api/health", tags=["health"])
def health():
    return {"status": "ok", "version": "0.1.0"}
