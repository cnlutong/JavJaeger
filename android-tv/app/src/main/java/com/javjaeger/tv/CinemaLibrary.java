package com.javjaeger.tv;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collection;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import org.json.JSONObject;

public final class CinemaLibrary {
    public static final List<String> DIMENSIONS = Collections.unmodifiableList(Arrays.asList("actor", "studio", "res", "flag"));
    public final List<Movie> movies;
    private final List<Actor> actorMetadata;

    public CinemaLibrary(List<Movie> movies) { this(movies, Collections.emptyList()); }
    public CinemaLibrary(List<Movie> movies, List<Actor> actors) {
        this.movies = Collections.unmodifiableList(new ArrayList<>(movies));
        actorMetadata = new ArrayList<>(actors);
    }

    public List<Movie> browse(String query, String actor, Map<String, ? extends Collection<String>> filters, String sort) {
        return browse(query, actor, filters, sort, false);
    }

    public List<Movie> browse(String query, String actor, Map<String, ? extends Collection<String>> filters, String sort, boolean allTags) {
        List<Movie> result = new ArrayList<>();
        String needle = query == null ? "" : query.trim().toLowerCase(Locale.ROOT);
        for (Movie movie : movies) {
            if (actor != null && !actor.isEmpty() && !movie.actors.contains(actor)) continue;
            StringBuilder searchable = new StringBuilder(movie.id).append(' ').append(movie.title);
            for (String name : movie.actors) searchable.append(' ').append(name);
            if (!searchable.toString().toLowerCase(Locale.ROOT).contains(needle)) continue;
            boolean matches = true;
            for (String dimension : DIMENSIONS) {
                if ("actor".equals(dimension) && actor != null && !actor.isEmpty()) continue;
                Collection<String> selected = filters == null ? null : filters.get(dimension);
                if (selected == null || selected.isEmpty()) continue;
                List<String> values = values(movie, dimension);
                if (allTags && "flag".equals(dimension) ? !values.containsAll(selected) : Collections.disjoint(values, selected)) { matches = false; break; }
            }
            if (matches) result.add(movie);
        }
        Collections.sort(result, (left, right) -> "番号".equals(sort) ? left.id.compareTo(right.id)
                : "体积".equals(sort) ? Long.compare(right.totalSize, left.totalSize)
                : "发行日期".equals(sort) ? right.date.compareTo(left.date) : right.added.compareTo(left.added));
        return result;
    }

    public Map<String, Integer> facetCounts(String dimension, String actor, String optionQuery) {
        if (!DIMENSIONS.contains(dimension)) throw new IllegalArgumentException("筛选维度无效。");
        String needle = optionQuery == null ? "" : optionQuery.trim().toLowerCase(Locale.ROOT);
        Map<String, Integer> counts = new LinkedHashMap<>();
        for (Movie movie : movies) {
            if (actor != null && !actor.isEmpty() && !movie.actors.contains(actor)) continue;
            for (String value : values(movie, dimension)) {
                if (value.isEmpty() || value.equals("—") || !value.toLowerCase(Locale.ROOT).contains(needle)) continue;
                counts.put(value, counts.containsKey(value) ? counts.get(value) + 1 : 1);
            }
        }
        return counts;
    }

    public Map<String, Integer> tags() { return facetCounts("flag", "", ""); }

    public List<Actor> actors() {
        Map<String, Actor> metadata = new LinkedHashMap<>();
        for (Actor actor : actorMetadata) metadata.put(actor.name, actor);
        Map<String, Integer> counts = new LinkedHashMap<>();
        Map<String, Long> bytes = new LinkedHashMap<>();
        for (Movie movie : movies) for (String name : movie.actors) {
            counts.put(name, counts.containsKey(name) ? counts.get(name) + 1 : 1);
            bytes.put(name, (bytes.containsKey(name) ? bytes.get(name) : 0) + movie.totalSize);
        }
        List<Actor> result = new ArrayList<>();
        for (Map.Entry<String, Integer> entry : counts.entrySet()) {
            Actor source = metadata.remove(entry.getKey());
            result.add(new Actor(source == null ? "" : source.key, entry.getKey(), entry.getValue(), bytes.get(entry.getKey()), source != null && source.avatarAvailable));
        }
        result.addAll(metadata.values());
        Collections.sort(result, (left, right) -> left.count != right.count ? Integer.compare(right.count, left.count) : left.name.compareTo(right.name));
        return result;
    }

    public List<Shelf> homeShelves() {
        List<Movie> recent = browse("", "", null, "入库时间");
        List<Movie> hd = new ArrayList<>(), vr = new ArrayList<>();
        for (Movie movie : recent) { if (movie.height >= 1080) hd.add(movie); if (movie.isVr) vr.add(movie); }
        List<Shelf> shelves = new ArrayList<>();
        if (!recent.isEmpty()) shelves.add(new Shelf("最近入库", recent));
        if (!hd.isEmpty()) shelves.add(new Shelf("高清收藏", hd));
        if (!vr.isEmpty()) shelves.add(new Shelf("VR 影厅", vr));
        return shelves;
    }

    public List<Shelf> vrShelves() {
        Map<String, List<Movie>> groups = new LinkedHashMap<>();
        for (Movie movie : movies) {
            if (!movie.isVr) continue;
            String key = "VR " + (movie.quality.isEmpty() ? "—" : movie.quality);
            if (!groups.containsKey(key)) groups.put(key, new ArrayList<>());
            groups.get(key).add(movie);
        }
        List<Shelf> result = new ArrayList<>();
        for (Map.Entry<String, List<Movie>> group : groups.entrySet()) result.add(new Shelf(group.getKey(), group.getValue()));
        return result;
    }

    private static List<String> values(Movie movie, String dimension) {
        if (dimension.equals("actor")) return movie.actors;
        if (dimension.equals("flag")) return movie.tags;
        return Collections.singletonList(dimension.equals("studio") ? movie.studio : movie.quality);
    }

    public static <T> Page<T> page(List<T> values, int index, int size) {
        if (size <= 0) throw new IllegalArgumentException("分页大小无效。");
        int pages = Math.max(1, (values.size() + size - 1) / size);
        index = Math.max(0, Math.min(index, pages - 1));
        return new Page<>(values.subList(index * size, Math.min(values.size(), (index + 1) * size)), index, pages, values.size());
    }

    public static final class Shelf {
        public final String name;
        public final List<Movie> movies;
        private Shelf(String name, List<Movie> movies) { this.name = name; this.movies = Collections.unmodifiableList(new ArrayList<>(movies)); }
    }

    public static final class Page<T> {
        public final List<T> items;
        public final int index, pages, total;
        private Page(List<T> items, int index, int pages, int total) {
            this.items = Collections.unmodifiableList(new ArrayList<>(items));
            this.index = index; this.pages = pages; this.total = total;
        }
    }

    public static final class Actor {
        public final String key, name;
        public final int count;
        public final long totalSize;
        public final boolean avatarAvailable;
        public Actor(String key, String name, int count, long totalSize, boolean avatarAvailable) {
            this.key = key; this.name = name; this.count = count; this.totalSize = totalSize; this.avatarAvailable = avatarAvailable;
        }
        static Actor fromJson(JSONObject raw) {
            String key = raw.optString("key", "").trim(), name = raw.optString("name", key).trim();
            if (!validKey(key) || name.isEmpty()) throw new IllegalArgumentException("演员信息无效。");
            String expected = "/api/movies/local-library/actors/" + key + "/avatar";
            return new Actor(key, name, Math.max(0, raw.optInt("movie_count", 0)), Math.max(0, raw.optLong("total_size", 0)), expected.equals(raw.optString("avatar_url")));
        }
        static boolean validKey(String key) {
            return key != null && !key.equals(".") && !key.equals("..") && key.matches("[^/\\\\?#\\p{Cntrl}]+");
        }
    }
}
