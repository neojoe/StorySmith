import sys
from datetime import datetime, timedelta
from pathlib import Path

from loguru import logger

from .config import get_settings

# Track last rotation time per handler
_last_rotation: dict[str, datetime] = {}


def _make_rotation_checker(handler_key: str):
    """Return a rotation function that rotates when file >= 5 MB or >= 7 days old."""

    def should_rotate(message, file) -> bool:
        # Size check: rotate if file exceeds 5 MB
        file.seek(0, 2)
        size_bytes = file.tell()
        if size_bytes >= 5 * 1024 * 1024:
            _last_rotation[handler_key] = datetime.now()
            return True

        # Time check: rotate if 7 days have passed since last rotation
        last = _last_rotation.get(handler_key, datetime.now())
        if datetime.now() - last >= timedelta(days=7):
            _last_rotation[handler_key] = datetime.now()
            return True

        return False

    return should_rotate


def setup_logging() -> None:
    settings = get_settings()
    log_dir = Path(settings.LOG_DIR)
    log_dir.mkdir(parents=True, exist_ok=True)

    logger.remove()

    # Console handler
    logger.add(
        sys.stdout,
        level=settings.LOG_LEVEL,
        colorize=True,
        format=(
            "<green>{time:YYYY-MM-DD HH:mm:ss}</green> | "
            "<level>{level:<8}</level> | "
            "<cyan>{name}</cyan>:<cyan>{function}</cyan>:<cyan>{line}</cyan> - "
            "<level>{message}</level>"
        ),
    )

    # App log: all levels, rotate by size or time
    logger.add(
        str(log_dir / "app.log"),
        level=settings.LOG_LEVEL,
        rotation=_make_rotation_checker("app"),
        retention="30 days",
        compression="zip",
        encoding="utf-8",
        format="{time:YYYY-MM-DD HH:mm:ss} | {level:<8} | {name}:{function}:{line} - {message}",
    )

    # Error log: ERROR and above only
    logger.add(
        str(log_dir / "error.log"),
        level="ERROR",
        rotation=_make_rotation_checker("error"),
        retention="30 days",
        compression="zip",
        encoding="utf-8",
        format="{time:YYYY-MM-DD HH:mm:ss} | {level:<8} | {name}:{function}:{line} - {message}",
    )
