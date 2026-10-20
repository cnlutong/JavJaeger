from modules.common.tasks import BackgroundTaskManager
from . import local_library
from .local_scrape import apply_local_scrape, preview_local_scrape
from .schemas import LocalLibraryInformationDownloadRequest, LocalScrapeApplyRequest, LocalScrapePreviewRequest


class LocalScrapeTaskManager(BackgroundTaskManager):
    def _failure_message(self, error: Exception) -> str:
        return str(error)

    def start_preview_task(self, request: LocalScrapePreviewRequest) -> str:
        return self._start_task("preview", lambda progress: preview_local_scrape(request, progress_callback=progress))

    def start_apply_task(self, request: LocalScrapeApplyRequest) -> str:
        return self._start_task("apply", lambda progress: apply_local_scrape(request, progress_callback=progress))

    def start_information_check_task(self, fields: str | list[str] | None = None) -> str:
        async def run(progress):
            progress({"phase": "check", "message": "正在检查元数据与本地资料文件，可离开页面"})
            result = await local_library.get_local_library_information_check(
                local_library.parse_information_check_fields(fields), refresh_files=True,
            )
            result["message"] = f"资料检查完成：{result.get('incomplete_count', 0)} 部待补全"
            return result

        return self._start_task("information-check", run)

    def start_information_download_task(self, request: LocalLibraryInformationDownloadRequest) -> str:
        return self._start_task("information-download", lambda progress:
            local_library.download_missing_local_library_information(request, progress_callback=progress))

    def start_cleanup_task(self) -> str:
        return self._start_task("local-library-cleanup", lambda progress:
            local_library.clean_invalid_local_library_files(progress_callback=progress))


local_scrape_task_manager = LocalScrapeTaskManager()
