import logging
from typing import Any

from modules.common import runtime
from modules.javbus_api import javbus_api_service


logger = logging.getLogger(__name__)

SUPPORTED_SCRAPER_PROVIDERS = tuple(runtime.SCRAPER_PROVIDER_NAMES)
IMPLEMENTED_SCRAPER_PROVIDERS = {"javbus"}


def _scraper_log(provider: str, message: str, level: str = "info") -> dict[str, str]:
    return {
        "provider": provider,
        "level": level,
        "message": message,
    }


class MetadataScraperService:
    async def get_movie_detail(self, movie_id: str) -> dict[str, Any]:
        config = runtime.get_scrapers_config()
        priority = config.get("priority")
        if not isinstance(priority, list) or not priority:
            priority = list(SUPPORTED_SCRAPER_PROVIDERS)

        logs: list[dict[str, str]] = []
        seen: set[str] = set()
        had_error = False
        last_error_message = ""
        for raw_provider in priority:
            provider = str(raw_provider or "").strip().lower()
            if provider in seen or provider not in SUPPORTED_SCRAPER_PROVIDERS:
                continue
            seen.add(provider)

            provider_config = config.get(provider)
            if not isinstance(provider_config, dict):
                provider_config = {}
            if not bool(provider_config.get("enabled")):
                logs.append(_scraper_log(provider, f"{provider} is disabled", "debug"))
                continue

            if provider != "javbus":
                logs.append(
                    _scraper_log(
                        provider,
                        f"{provider} is configured but not implemented in JavJaeger yet",
                        "warning",
                    )
                )
                continue

            try:
                metadata = await javbus_api_service.get_movie_detail(movie_id)
            except Exception as exc:
                had_error = True
                last_error_message = str(exc)
                logger.warning("Metadata scraper %s failed for %s: %s", provider, movie_id, exc)
                logs.append(_scraper_log(provider, f"{provider} failed: {exc}", "error"))
                continue

            if metadata and metadata.get("id"):
                logs.append(_scraper_log(provider, f"{provider} matched {movie_id}"))
                return {
                    "metadata": metadata,
                    "source": provider,
                    "logs": logs,
                }

            logs.append(_scraper_log(provider, f"{provider} did not match {movie_id}", "warning"))

        return {
            "metadata": None,
            "source": None,
            "logs": logs,
            "error": "metadata_fetch_failed" if had_error else None,
            "error_message": last_error_message,
        }


metadata_scraper_service = MetadataScraperService()
