"""Keep every test's decision history separate from the local demonstration."""

import pytest


@pytest.fixture(autouse=True)
def isolated_database(tmp_path, monkeypatch):
    """A test may override this path, but never inherits the user's SQLite file."""
    monkeypatch.setattr("backend.db.repository.DB_PATH", tmp_path / "workbench.sqlite")


@pytest.fixture
def client():
    """Run FastAPI's lifespan around each API test using the isolated store."""
    from fastapi.testclient import TestClient

    from backend.api.main import app

    with TestClient(app) as test_client:
        yield test_client
