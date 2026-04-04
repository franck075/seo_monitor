import asyncio
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from app.config import settings

# Import all models so SQLAlchemy can resolve all relationship references
import app.models.user  # noqa: F401
import app.models.website  # noqa: F401
import app.models.keyword  # noqa: F401
import app.models.monitoring  # noqa: F401
import app.models.alert  # noqa: F401

_engine = None
_session_factory = None

def get_sync_session():
    global _engine, _session_factory
    if _session_factory is None:
        _engine = create_async_engine(settings.DATABASE_URL, pool_pre_ping=True)
        _session_factory = async_sessionmaker(_engine, class_=AsyncSession, expire_on_commit=False)
    return _session_factory

def run_async(coro):
    try:
        loop = asyncio.get_event_loop()
        if loop.is_running():
            import concurrent.futures
            with concurrent.futures.ThreadPoolExecutor() as pool:
                future = pool.submit(asyncio.run, coro)
                return future.result()
        return loop.run_until_complete(coro)
    except RuntimeError:
        return asyncio.run(coro)
