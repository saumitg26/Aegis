"""Bounded, ephemeral guest workspaces for the single-process hackathon demo."""
from contextvars import ContextVar
from dataclasses import dataclass, field
from pathlib import Path
import secrets
import shutil
import tempfile
import time
from sqlalchemy import create_engine
from fastapi import HTTPException

COOKIE = 'aegis_demo_session'
TTL = 2 * 60 * 60
ROOT = tempfile.TemporaryDirectory(prefix='aegis-guests-')
current = ContextVar('aegis_guest', default=None)
sessions = {}
provider_calls = []
creation_times = []

@dataclass
class Workspace:
    token: str
    directory: Path
    engine: object
    expires: float
    calls: list = field(default_factory=list)
    active: int = 0
    revoked: bool = False
    user: dict = None

    @property
    def artifacts(self): return self.directory / 'artifacts'

def clean():
    now = time.monotonic()
    for token, space in list(sessions.items()):
        if (space.expires <= now or space.revoked) and not space.active:
            space.engine.dispose()
            shutil.rmtree(space.directory, ignore_errors=True)
            del sessions[token]

def lookup(token):
    space = sessions.get(token)
    return space if space and not space.revoked and space.expires > time.monotonic() else None

def create(metadata):
    clean()
    now = time.monotonic()
    creation_times[:] = [t for t in creation_times if now-t < 3600]
    if len(sessions) >= 50 or len(creation_times) >= 100:
        raise HTTPException(429, 'Demo capacity reached. Please try again later.')
    creation_times.append(now)
    token = secrets.token_urlsafe(32)
    directory = Path(ROOT.name) / secrets.token_hex(16)
    (directory/'artifacts').mkdir(parents=True)
    engine = create_engine('sqlite:///'+str(directory/'demo.db'))
    metadata.create_all(engine)
    space = Workspace(token, directory, engine, now + TTL)
    sessions[token] = space
    return space

def charge_provider(space):
    now = time.monotonic()
    provider_calls[:] = [t for t in provider_calls if now-t < 3600]
    space.calls[:] = [t for t in space.calls if now-t < 3600]
    if len(provider_calls) >= 40 or len(space.calls) >= 10:
        raise HTTPException(429, 'Demo AI allowance reached. Recording, editing and reports still work. Try again in an hour.')
    provider_calls.append(now)
    space.calls.append(now)
