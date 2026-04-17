import backend.models.models  # noqa: F401 — registers all tables in Base.metadata
from backend.config.database import reset_database

if __name__ == "__main__":
    reset_database()
