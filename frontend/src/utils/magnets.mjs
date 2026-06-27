export const buildMagnetDataMapFromResults = (magnetResults = [], movies = []) => {
    const nextMap = {};

    if (Array.isArray(movies)) {
        movies.forEach((movie) => {
            if (movie?.id) {
                nextMap[movie.id] = [];
            }
        });
    }

    if (!Array.isArray(magnetResults)) {
        return nextMap;
    }

    magnetResults.forEach((result) => {
        if (!result || !result.movie_id || !result.link) {
            return;
        }
        nextMap[result.movie_id] = [{
            link: result.link,
            title: result.title || `${result.movie_id} - 最佳资源`,
            size: result.size || "未知",
            shareDate: result.shareDate || null,
            hasSubtitle: !!result.hasSubtitle,
        }];
    });

    return nextMap;
};
