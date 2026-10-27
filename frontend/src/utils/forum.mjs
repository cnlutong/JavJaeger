export function filterForumMovies(movies, query = '', keywords = []) {
    const needle = query.trim().toLocaleLowerCase();
    return movies.filter(movie => {
        const title = String(movie.title || '').toLocaleLowerCase();
        return title.includes(needle) && keywords.every(keyword => title.includes(keyword.toLocaleLowerCase()));
    });
}

export function visibleForumSelection(movies, selected) {
    const actionable = new Set(movies.filter(movie => movie.status === 'ready' && movie.magnets?.length).map(movie => movie.thread_id));
    return selected.filter(key => actionable.has(key));
}

export function forumDispatchEntries(movies, selected) {
    const chosen = new Set(visibleForumSelection(movies, selected));
    return movies.filter(movie => chosen.has(movie.thread_id)).flatMap(movie => movie.magnets.map(magnet => ({
        movie_id: movie.movie_id, link: magnet.link, source: magnet.source || 'dmn12',
    })));
}

export function forumDispatchFeedback(movie, jobs = [], tool) {
    const key = { PikPak: 'pikpak', '115 网盘': 'pan115', Aria2: 'aria2' }[tool];
    const results = jobs.filter(job => job.type === 'dispatch-' + key && job.result)
        .sort((a, b) => String(a.created_at || '').localeCompare(String(b.created_at || ''))).reverse()
        .flatMap(job => job.result.results || []);
    const matches = (movie.magnets || []).map(magnet => results.find(row =>
        String(row.original_magnet || row.magnet || row.link || '').trim().toLowerCase() === magnet.link.trim().toLowerCase()));
    if (!matches.length || matches.some(row => !row)) return { handled: false, text: '' };
    if (matches.some(row => !row.success && !row.skipped)) return { handled: false, text: '下发失败，可重试' };
    return { handled: true, text: matches.every(row => row.skipped) ? '已跳过重复资源' : `已提交到 ${tool}` };
}
