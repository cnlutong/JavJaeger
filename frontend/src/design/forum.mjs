import { filterForumMovies, forumDispatchEntries, forumDispatchFeedback, visibleForumSelection } from '../utils/forum.mjs';
export { forumStyles, forumTemplate } from './forumView.mjs';

const storageKey = 'javjaeger.forum';
const active = task => task && ['running', 'queued'].includes(task.status);
export function initialForumState() {
    let saved = {};
    try { saved = JSON.parse(window.sessionStorage.getItem(storageKey) || '{}'); } catch {}
    return { foSource: [36, 103].includes(saved?.source) ? saved.source : 36, foPage: Number(saved?.page) || 1,
        foPageInput: String(Number(saved?.page) || 1), foTitle: String(saved?.query || '').slice(0, 200),
        foKeywords: saved?.keywords?.includes('LTX') ? ['LTX'] : [], foTaskId: /^[A-Za-z0-9_-]{1,80}$/.test(saved?.taskId || '') ? saved.taskId : null,
        foMovies: [], foSelected: [], foTask: null, foCache: null, foCacheLoading: false, foStarting: false, foDetail: null, foError: '' };
}

export const forumMethods = {
    async loadForumCache() {
        const st = this.state;
        if (st.foTaskId || st.foTask || st.foStarting || st.foCacheLoading) return;
        const token = this._forumCacheRequest = (this._forumCacheRequest || 0) + 1;
        const source = st.foSource, page = st.foPage;
        this.setState({ foCacheLoading: true });
        try {
            const response = await this.request(`/api/movies/forum/cache?forum_id=${source}&page=${page}`);
            if (this._disposed || token !== this._forumCacheRequest || this.state.foTaskId || this.state.foSource !== source || this.state.foPage !== page) return;
            if (response.cached && response.result) this.setState({ foCache: response.result, foMovies: response.result.movies || [], foSelected: [], foError: '' });
        } catch { /* Cache reads are optional; fetching remains available. */ }
        finally { if (!this._disposed && token === this._forumCacheRequest) this.setState({ foCacheLoading: false }); }
    },
    persistForum() {
        const st = this.state;
        try { window.sessionStorage.setItem(storageKey, JSON.stringify({ source: st.foSource, page: st.foPage, query: st.foTitle, keywords: st.foKeywords, taskId: st.foTaskId })); } catch {}
    },
    setForumFilter(patch) {
        const st = { ...this.state, ...patch };
        const visible = filterForumMovies(st.foMovies, st.foTitle, st.foKeywords);
        this.setState({ ...patch, foSelected: visibleForumSelection(visible, st.foSelected) }, () => this.persistForum());
    },
    applyForumTask(task, force = false) {
        if (!force && task.task_id !== this.state.foTaskId) return;
        const result = task.result;
        const patch = { foTaskId: task.task_id, foTask: task, foError: '' };
        if (force) {
            this._forumCacheRequest = (this._forumCacheRequest || 0) + 1;
            Object.assign(patch, { foMovies: [], foSelected: [], foDetail: null, foCache: null, foCacheLoading: false });
        }
        if (result) Object.assign(patch, { foSource: result.forum_id, foPage: result.page, foPageInput: String(result.page), foMovies: result.movies || [] });
        const st = { ...this.state, ...patch };
        patch.foSelected = visibleForumSelection(filterForumMovies(st.foMovies, st.foTitle, st.foKeywords), st.foSelected);
        this.setState(patch, () => this.persistForum());
    },
    syncForumJobs(tasks) {
        if (!this._forumRestored) {
            this._forumRestored = true;
            const latest = tasks.filter(task => task.type === 'forum-fetch' && task.result?.forum_id === this.state.foSource && task.result?.page === this.state.foPage).sort((a, b) => String(a.created_at).localeCompare(String(b.created_at))).at(-1);
            const task = tasks.find(task => task.task_id === this.state.foTaskId) || (!this.state.foTaskId && latest);
            if (task) this.applyForumTask(task, true);
            else if (this.state.foTaskId) this.setState({ foTaskId: null, foError: '上一次获取任务已失效，请重新获取影片' }, () => {
                if (this.state.route === 'forum') void this.loadForumCache();
            });
        }
        const task = tasks.find(task => task.task_id === this.state.foTaskId);
        if (task && task !== this.state.foTask) this.applyForumTask(task);
        const seen = this._forumDispatchSeen || (this._forumDispatchSeen = new Map());
        const changed = tasks.filter(job => job.type.startsWith('dispatch-') && job.result && seen.get(job.task_id) !== job);
        for (const job of changed) seen.set(job.task_id, job);
        const handled = new Set(this.state.foMovies.filter(movie => forumDispatchFeedback(movie, changed, this.state.tool).handled).map(movie => movie.thread_id));
        if (this.state.foSelected.some(key => handled.has(key))) this.setState({ foSelected: this.state.foSelected.filter(key => !handled.has(key)) });
    },
    async startForum(page, forceRefresh = false) {
        if (this.state.foStarting || active(this.state.foTask)) return;
        const target = Number(page ?? this.state.foPageInput);
        if (!Number.isInteger(target) || target < 1 || target > 10000) { this.setState({ foError: '页码需为 1 至 10000 的整数' }); return; }
        this.setState({ foStarting: true, foError: '' });
        try {
            const payload = { forum_id: this.state.foSource, page: target };
            if (forceRefresh) payload.force_refresh = true;
            const task = await this.startBackgroundJob('/api/movies/forum/jobs', payload);
            if (!this._disposed) { this._forumRestored = true; this.applyForumTask(task, true); }
        } catch { if (!this._disposed) this.setState({ foError: '获取任务未能启动，请稍后重试' }); }
        finally { if (!this._disposed) this.setState({ foStarting: false }); }
    },
    async forumTaskAction(action) {
        const task = this.state.foTask;
        if (!task) return;
        await this.perform(async () => {
            const updated = await this.request(`/api/system/jobs/${encodeURIComponent(task.task_id)}/${action}`, 'POST');
            this.applyForumTask(updated);
        });
    },
    dispatchForum(selected) {
        const st = this.state, visible = filterForumMovies(st.foMovies, st.foTitle, st.foKeywords);
        const entries = forumDispatchEntries(visible, selected);
        if (!entries.length) return;
        if (!this.toolStates().find(tool => tool.name === st.tool)?.connected) {
            this.setState({ toolCfg: st.tool });
            this.toast('请先连接所选下载工具，再下发影片');
            return;
        }
        return this.confirmDispatch(entries.map(entry => entry.movie_id), entries, st.tool);
    },
    vForum(imageURL) {
        const st = this.state, task = st.foTask, result = task?.result || st.foCache;
        const movies = filterForumMovies(st.foMovies, st.foTitle, st.foKeywords);
        const selected = visibleForumSelection(movies, st.foSelected);
        const ready = movies.filter(movie => movie.status === 'ready' && movie.magnets?.length);
        const busy = st.foStarting || st.foCacheLoading || active(task);
        const toggle = key => this.setState({ foSelected: selected.includes(key) ? selected.filter(value => value !== key) : [...selected, key] });
        const detail = st.foMovies.find(movie => movie.thread_id === st.foDetail);
        const connection = this.toolStates().find(tool => tool.name === st.tool);
        const statusText = { pending: '正在获取', ready: '资源就绪', failed: '获取失败', no_resources: '暂无公开磁力' };
        const percent = Math.max(0, Math.min(100, Number(task?.percent || 0)));
        const savedAt = result?.cache?.saved_at ? new Date(result.cache.saved_at) : null;
        const cacheText = savedAt && Number.isFinite(savedAt.getTime()) ?
            (result.cache.hit ? '已使用缓存 · ' : result.cache.reused_posts ? `已复用 ${result.cache.reused_posts} 条帖子缓存 · ` : '') +
            '列表更新于 ' + savedAt.toLocaleString(undefined, { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '';
        return {
            source: st.foSource, pageInput: st.foPageInput, query: st.foTitle, ltx: st.foKeywords.includes('LTX'), tool: st.tool,
            setSource: event => {
                this._forumRestored = true;
                this._forumCacheRequest = (this._forumCacheRequest || 0) + 1;
                this.setState({ foSource: Number(event.target.value), foPage: 1, foPageInput: '1', foMovies: [], foTask: null, foTaskId: null, foCache: null, foCacheLoading: false, foSelected: [], foDetail: null, foError: '' }, () => { this.persistForum(); void this.loadForumCache(); });
            },
            setPage: event => this.setState({ foPageInput: event.target.value }), setQuery: event => this.setForumFilter({ foTitle: event.target.value }),
            toggleKeyword: () => this.setForumFilter({ foKeywords: st.foKeywords.length ? [] : ['LTX'] }),
            setTool: event => this.setState({ tool: event.target.value }), configure: () => this.setState({ toolCfg: st.tool }),
            connection: connection?.connected ? '已连接' : '未连接', fetch: () => this.startForum(), refresh: () => this.startForum(undefined, true), busy, cacheText,
            openCacheSettings: () => {
                this.go('settings')();
                this.setState({ seTab: '论坛缓存' });
                return this.perform(() => this.loadForumCacheSettings());
            },
            message: task?.status === 'cancelled' ? '已停止获取，已读取的影片仍可下发' : result?.message || task?.message || '',
            hasTask: !!task || !!result, percent, running: active(task),
            cancel: () => this.forumTaskAction('cancel'), canCancel: !!task?.can_cancel,
            retry: () => this.forumTaskAction('retry'), canRetry: !!task?.can_retry,
            error: st.foError || (task?.status === 'failed' ? result?.message || task.message : ''),
            hasRows: movies.length > 0, initial: !task && !st.foMovies.length,
            empty: !movies.length && !!result && !busy, emptyText: st.foTitle || st.foKeywords.length ? '本页没有匹配标题，可调整筛选或查看下一页。' : '本页没有可显示的影片，可重试或查看下一页。',
            summary: `本页 ${st.foMovies.length} 条 · 显示 ${movies.length} 条 · ${ready.length} 条可下发`,
            allSelected: ready.length > 0 && ready.every(movie => selected.includes(movie.thread_id)), noReady: !ready.length,
            toggleAll: () => this.setState({ foSelected: ready.every(movie => selected.includes(movie.thread_id)) ? [] : ready.map(movie => movie.thread_id) }),
            selectedCount: selected.length, hasSelection: selected.length > 0, clearSelection: () => this.setState({ foSelected: [] }),
            dispatch: () => this.dispatchForum(selected),
            page: st.foPage, showPager: !!result, prevDisabled: busy || st.foPage <= 1, nextDisabled: busy || !result?.has_next,
            prev: () => this.startForum(st.foPage - 1), next: () => this.startForum(st.foPage + 1),
            imageError: event => { event.currentTarget.hidden = true; },
            rows: movies.map(movie => {
                const feedback = forumDispatchFeedback(movie, st.backgroundJobs, st.tool);
                return { ...movie, cover: imageURL(movie.cover_url), label: movie.code || movie.movie_id,
                selected: selected.includes(movie.thread_id), disabled: movie.status !== 'ready' || !movie.magnets?.length,
                hasLtx: /ltx/i.test(movie.title), statusText: statusText[movie.status] || '待获取',
                resourceText: feedback.text || (movie.magnets?.length ? `${movie.magnets.length} 条磁力` : statusText[movie.status]),
                dispatchText: feedback.handled ? '再次下发' : '下发',
                meta: [movie.code, movie.size, movie.actors].filter(Boolean).join(' · '),
                open: () => this.setState({ foDetail: movie.thread_id }), toggle: () => toggle(movie.thread_id),
                dispatch: () => this.dispatchForum([movie.thread_id]),
                };
            }),
            detail: detail ? { ...detail, label: detail.code || detail.movie_id,
                images: (detail.images || []).map(url => ({ url: imageURL(url) })),
                magnets: (detail.magnets || []).map(magnet => ({ ...magnet, copy: () => this.perform(async () => { await this.copyText(magnet.link); this.toast('已复制磁力链接'); }) })),
                canDispatch: detail.status === 'ready', dispatch: () => this.dispatchForum([detail.thread_id]) } : null,
            closeDetail: () => this.setState({ foDetail: null }),
        };
    },
};
