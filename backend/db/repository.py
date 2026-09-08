from __future__ import annotations

import json
import sqlite3
from pathlib import Path


DB_PATH = Path(__file__).resolve().parents[2] / "data" / "iwb_workbench.sqlite"


def initialize():
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    with sqlite3.connect(DB_PATH) as connection:
        connection.execute(
            "CREATE TABLE IF NOT EXISTS simulations (simulation_id TEXT PRIMARY KEY, created_at TEXT NOT NULL, payload TEXT NOT NULL)"
        )
        connection.execute(
            "CREATE TABLE IF NOT EXISTS audit_events (event_id INTEGER PRIMARY KEY AUTOINCREMENT, simulation_id TEXT NOT NULL, created_at TEXT NOT NULL, event_type TEXT NOT NULL, payload TEXT NOT NULL)"
        )


def save_simulation(payload: dict):
    initialize()
    with sqlite3.connect(DB_PATH) as connection:
        connection.execute(
            "INSERT OR REPLACE INTO simulations(simulation_id, created_at, payload) VALUES (?, ?, ?)",
            (payload["simulation_id"], payload["created_at_utc"], json.dumps(payload, default=str)),
        )


def get_simulation(simulation_id: str):
    initialize()
    with sqlite3.connect(DB_PATH) as connection:
        row = connection.execute("SELECT payload FROM simulations WHERE simulation_id = ?", (simulation_id,)).fetchone()
    return json.loads(row[0]) if row else None


def list_simulations(limit: int = 30):
    initialize()
    with sqlite3.connect(DB_PATH) as connection:
        rows = connection.execute("SELECT payload FROM simulations ORDER BY created_at DESC LIMIT ?", (limit,)).fetchall()
    return [json.loads(row[0]) for row in rows]


def add_audit_event(simulation_id: str, created_at: str, event_type: str, payload: dict):
    initialize()
    with sqlite3.connect(DB_PATH) as connection:
        connection.execute(
            "INSERT INTO audit_events(simulation_id, created_at, event_type, payload) VALUES (?, ?, ?, ?)",
            (simulation_id, created_at, event_type, json.dumps(payload, default=str)),
        )


def list_audit_events(limit: int = 100):
    initialize()
    with sqlite3.connect(DB_PATH) as connection:
        rows = connection.execute(
            "SELECT event_id, simulation_id, created_at, event_type, payload FROM audit_events ORDER BY event_id DESC LIMIT ?",
            (limit,),
        ).fetchall()
    return [{"event_id": row[0], "simulation_id": row[1], "created_at": row[2], "event_type": row[3], "payload": json.loads(row[4])} for row in rows]

