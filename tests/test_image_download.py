import asyncio
import base64
import os
import stat
import threading
from pathlib import Path

import pytest

from modules.common.image_download import download_image


def data_url(content):
    return 'data:image/png;base64,' + base64.b64encode(content).decode()


def intercept_writes(monkeypatch, handler):
    open_file = Path.open

    class WritingFile:
        def __init__(self, file):
            self.file = file

        def __enter__(self):
            return self

        def __exit__(self, *args):
            return self.file.__exit__(*args)

        def write(self, content):
            return handler(self.file, content)

    def instrumented_open(path, mode='r', *args, **kwargs):
        file = open_file(path, mode, *args, **kwargs)
        return WritingFile(file) if mode in ('wb', 'xb') else file

    monkeypatch.setattr(Path, 'open', instrumented_open)


def test_concurrent_downloads_to_one_target_publish_complete_images(tmp_path, monkeypatch):
    target = tmp_path / 'shared-avatar.jpg'
    first_content, second_content = b'A' * 100000, b'B' * 100000
    first_started, second_written = threading.Event(), threading.Event()

    def interleaved_write(file, content):
        if content == first_content:
            file.write(content[:50000])
            file.flush()
            first_started.set()
            assert second_written.wait(5)
            file.write(content[50000:])
        else:
            file.write(content)
            file.flush()
            second_written.set()
        return len(content)

    intercept_writes(monkeypatch, interleaved_write)

    async def exercise():
        first = asyncio.create_task(download_image(data_url(first_content), target, True))
        assert await asyncio.to_thread(first_started.wait, 5)
        second = asyncio.create_task(download_image(data_url(second_content), target, True))
        assert await asyncio.gather(first, second) == [target.name, target.name]
        assert target.read_bytes() in (first_content, second_content)
        assert list(tmp_path.iterdir()) == [target]
    asyncio.run(exercise())


@pytest.mark.parametrize('failure', ['write', 'replace'])
def test_failed_image_publication_preserves_the_previous_file_and_cleans_temporary_files(tmp_path, monkeypatch, failure):
    target = tmp_path / 'poster.jpg'
    target.write_bytes(b'previous complete image')

    if failure == 'write':
        def failed_write(file, content):
            file.write(b'partial')
            file.flush()
            raise OSError('disk write failed')
        intercept_writes(monkeypatch, failed_write)
    else:
        def failed_replace(path, destination):
            raise OSError('publication failed')
        monkeypatch.setattr(Path, 'replace', failed_replace)

    async def exercise():
        with pytest.raises(OSError):
            await download_image(data_url(b'new image'), target, True)
        assert target.read_bytes() == b'previous complete image'
        assert list(tmp_path.iterdir()) == [target]
    asyncio.run(exercise())


@pytest.mark.skipif(os.name == 'nt', reason='POSIX file permissions')
@pytest.mark.parametrize('existing_mode', [None, 0o640])
def test_atomic_image_publication_preserves_normal_file_permissions(tmp_path, existing_mode):
    reference = tmp_path / 'normal-open.jpg'
    with reference.open('wb') as file:
        file.write(b'reference')
    target = tmp_path / 'poster.jpg'
    if existing_mode is not None:
        target.write_bytes(b'old image')
        target.chmod(existing_mode)
    expected_mode = existing_mode if existing_mode is not None else stat.S_IMODE(reference.stat().st_mode)

    asyncio.run(download_image(data_url(b'new image'), target, True))
    assert stat.S_IMODE(target.stat().st_mode) == expected_mode
