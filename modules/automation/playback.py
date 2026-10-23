"""Session-owned selection, cloud completion, and playback handoff."""
import asyncio
import base64
import re
import time
from urllib.parse import parse_qs, urlsplit

from fastapi import HTTPException, Request

from modules.common import runtime
from modules.common.tasks import background_tasks, job_owner
from modules.history.service import download_history_service
from modules.magnets.service import get_best_magnet_payload
from modules.pan115 import service as pan115


PLAYBACK_WAIT_SECONDS = 30 * 60
poll_delay = asyncio.sleep


def _magnet_hash(link: str) -> str:
    parsed = urlsplit(link)
    hashes = [value[9:] for value in parse_qs(parsed.query).get('xt', [])
              if value.lower().startswith('urn:btih:')]
    value = hashes[0] if parsed.scheme == 'magnet' and hashes else ''
    if re.fullmatch(r'[0-9a-fA-F]{40}', value):
        return value.lower()
    if re.fullmatch(r'[A-Za-z2-7]{32}', value):
        return base64.b32decode(value.upper()).hex()
    raise ValueError('未找到有效的磁力资源，请稍后重试')


def playback_runner(movie_id: str):
    config = runtime.get_pan115_config()
    if not config.get('enabled') or not config.get('cookie'):
        raise ValueError('请先在设置中登录 115 网盘')
    client = pan115.Pan115Client(str(config['cookie']))
    save_dir_id = str(config.get('save_dir_id') or '0')
    magnet, info_hash = None, ''
    submitted = recorded = ready = False

    async def run(progress):
        nonlocal magnet, info_hash, submitted, recorded, ready

        def failed(message):
            return {'success': False, 'movie_id': movie_id, 'message': message}

        async def record():
            nonlocal recorded
            if not recorded:
                await download_history_service.record_dispatch_results([{
                    'movie_id': movie_id, 'magnet': magnet['link'],
                    'source': magnet.get('source') or 'javbus', 'success': True}], 'pan115')
                recorded = True

        try:
            deadline = time.monotonic() + PLAYBACK_WAIT_SECONDS
            if magnet is None:
                progress({'phase': 'magnets', 'message': '正在选择最佳影片资源', 'result': {'movie_id': movie_id}})
                selected = await get_best_magnet_payload(movie_id, exclude_history_links=False)
                progress({'phase': 'magnets', 'message': '正在核对 115 网盘中的影片任务'})
                if not selected or not selected.get('link'):
                    return failed('没有找到可用磁力，请稍后重试')
                info_hash = _magnet_hash(selected['link'])
                magnet = selected

            while True:
                progress({'phase': 'waiting', 'message': '正在核对网盘离线任务'})
                task = await client.get_offline_task(info_hash)
                if task is None and not submitted:
                    progress({'phase': 'dispatch', 'message': '正在将最佳资源添加到 115 网盘'})
                    # Keep this before the write: a lost acknowledgement must only be queried on retry.
                    submitted = True
                    try:
                        results = await client.add_offline_tasks([magnet['link']], save_dir_id=save_dir_id)
                    except Exception:
                        return failed('提交结果未确认，请重试以核对网盘任务；不会重复提交')
                    if not results or not results[0].get('success'):
                        if results and results[0].get('rejected') is True:
                            submitted = False
                            return failed('115 已拒绝离线任务，请在网盘处理后重试')
                        return failed('115 未确认接受离线任务，请在网盘核对后重试')
                    await record()
                    progress({'phase': 'waiting', 'message': '资源已提交，正在等待网盘下载完成'})
                elif task is not None:
                    submitted = True
                    await record()
                    if task.get('status') == 'failed':
                        return failed('115 离线下载失败，请在网盘检查任务后重试')
                    if task.get('status') == 'completed':
                        progress({'phase': 'resolve', 'message': '下载已完成，正在确认可播放视频'})
                        video = await client.find_playable_file(task)
                        if video and video.get('pick_code'):
                            progress({'phase': 'ready', 'message': '视频已就绪，可以播放'})
                            ready = True
                            return {'success': True, 'movie_id': movie_id, 'file_name': video['name'],
                                    'pick_code': video['pick_code'], 'account_id': client.user_id,
                                    'message': '视频已就绪，可以播放'}
                    else:
                        percent = max(0, min(99, int(float(task.get('progress') or 0))))
                        progress({'phase': 'waiting', 'message': f'115 正在下载：{percent}%',
                                  'completed': percent, 'total': 100})
                remaining = deadline - time.monotonic()
                if remaining <= 0:
                    return failed('等待超时，网盘任务仍会继续；重试可继续等待')
                await poll_delay(min(3, remaining))
        except Exception:
            return failed('播放准备失败，请检查 115 连接后重试')

    run.can_retry = lambda: not ready
    return run


async def playback_stream(task_id: str, request: Request):
    task = background_tasks.get_task(task_id, job_owner(request))
    if task is None or task.get('type') != 'browse-play':
        raise HTTPException(status_code=404, detail='playback_job_not_found')
    result = task.get('result') or {}
    if task.get('status') != 'success' or not result.get('success') or not result.get('pick_code'):
        raise HTTPException(status_code=409, detail='playback_not_ready')
    try:
        return await pan115.stream_playback(result['pick_code'], result['account_id'],
                                            range_header=request.headers.get('range'))
    except pan115.Pan115Error as exc:
        status = {'pan115_account_changed': 409, 'pan115_cookie_invalid': 409,
                  'pan115_range_invalid': 416, 'pan115_not_configured': 400}.get(exc.code, 502)
        message = {409: '115 账号已变更，请重新点击播放', 416: '播放范围无效',
                   400: '请先登录 115 网盘', 502: '视频暂时无法读取，请稍后重试'}[status]
        raise HTTPException(status_code=status, detail=message) from None
