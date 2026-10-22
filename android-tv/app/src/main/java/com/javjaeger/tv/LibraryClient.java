package com.javjaeger.tv;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.UnsupportedEncodingException;
import java.net.HttpURLConnection;
import java.net.CookieManager;
import java.net.CookiePolicy;
import java.net.HttpCookie;
import java.net.URI;
import java.net.URISyntaxException;
import java.net.URL;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.Iterator;
import java.util.List;
import java.util.Locale;
import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

public final class LibraryClient {
    private static final int MAX_RESPONSE_BYTES = 16 * 1024 * 1024;
    private final String baseUrl;
    private final CookieManager cookies = new CookieManager(null, (uri, cookie) ->
            "session".equals(cookie.getName()) && CookiePolicy.ACCEPT_ORIGINAL_SERVER.shouldAccept(uri, cookie));

    public LibraryClient(String server) { baseUrl = normalizeServer(server); }

    public String getBaseUrl() { return baseUrl; }

    public static final class BrowseFilter {
        public final String type, value, label, artworkSource;
        public BrowseFilter(String type, String value, String label) { this(type, value, label, ""); }
        public BrowseFilter(String type, String value, String label, String avatar) {
            if (!Arrays.asList("star", "genre", "studio", "label", "director", "series").contains(type)
                    || value == null || value.trim().isEmpty() || value.length() > 240 || value.matches("(?s).*[\\p{Cntrl}/?#].*") || value.indexOf('\\') >= 0)
                throw new IllegalArgumentException("浏览筛选条件无效。");
            this.type = type; this.value = value.trim(); this.label = label == null || label.trim().isEmpty() ? this.value : label.trim();
            artworkSource = "star".equals(type) ? Movie.remoteImage(avatar == null ? "" : avatar) : "";
        }
    }

    public static final class BrowsePage {
        public final List<Movie> movies;
        public final int nextPage;
        private BrowsePage(List<Movie> movies, int nextPage) {
            this.movies = Collections.unmodifiableList(movies); this.nextPage = nextPage;
        }
    }

    public BrowsePage loadBrowse(int page, String kind, List<BrowseFilter> filters) throws IOException {
        if (page < 1 || page == Integer.MAX_VALUE || !("normal".equals(kind) || "uncensored".equals(kind))) throw new IllegalArgumentException("浏览页码或影片类型无效。");
        try {
            JSONArray selected = new JSONArray();
            if (filters != null) for (BrowseFilter filter : filters) selected.put(new JSONObject().put("type", filter.type).put("value", filter.value).put("label", filter.label));
            JSONObject payload = read("/api/movies?type=" + kind + "&magnet=exist&page=" + page + "&filters=" + encode(selected.toString()));
            JSONArray records = payload.getJSONArray("movies"); List<Movie> movies = new ArrayList<>();
            for (int index = 0; index < records.length(); index++) movies.add(Movie.fromJson(records.getJSONObject(index)));
            JSONObject pagination = payload.optJSONObject("pagination");
            boolean more = pagination == null ? movies.size() >= 30 : pagination.has("hasNextPage") ? pagination.optBoolean("hasNextPage") : pagination.optInt("nextPage", 0) > 0;
            int next = pagination == null ? page + 1 : pagination.optInt("nextPage", page + 1);
            return new BrowsePage(movies, more ? Math.max(page + 1, next) : 0);
        } catch (JSONException | IllegalArgumentException invalid) { throw invalidResponse(); }
    }

    public Movie loadBrowseMovie(String id) throws IOException {
        requireMovieId(id);
        try {
            Movie movie = Movie.fromJson(read("/api/movies/" + id));
            if (!movie.id.equalsIgnoreCase(id)) throw invalidResponse();
            return movie;
        } catch (JSONException | IllegalArgumentException invalid) { throw invalidResponse(); }
    }

    public List<BrowseFilter> loadBrowseCatalog(String type) throws IOException {
        if (!("star".equals(type) || "genre".equals(type))) throw new IllegalArgumentException("浏览目录无效。");
        JSONObject groups = read("star".equals(type) ? "/static/actors.json" : "/static/categories.json");
        List<BrowseFilter> options = new ArrayList<>();
        try {
            for (Iterator<String> keys = groups.keys(); keys.hasNext();) {
                Object group = groups.get(keys.next());
                if (group instanceof JSONArray) {
                    JSONArray items = (JSONArray) group;
                    for (int index = 0; index < items.length(); index++) {
                        JSONObject item = items.getJSONObject(index);
                        options.add(new BrowseFilter(type, item.optString("id", item.optString("code", "")), item.optString("name", item.optString("title", "")),
                                Movie.remoteImage(item.optString("avatar", ""), item.optString("img", ""))));
                    }
                } else if (group instanceof JSONObject) {
                    JSONObject items = (JSONObject) group;
                    for (Iterator<String> codes = items.keys(); codes.hasNext();) { String code = codes.next(); options.add(new BrowseFilter(type, code, items.getString(code))); }
                } else throw invalidResponse();
            }
            return options;
        } catch (JSONException | IllegalArgumentException invalid) { throw invalidResponse(); }
    }

    public JSONObject startPlayJob(String movieId) throws IOException {
        requireMovieId(movieId);
        try { return checkedJob(request("/api/automation/play-jobs", new JSONObject().put("movie_id", movieId))); }
        catch (JSONException invalid) { throw invalidResponse(); }
    }

    public JSONObject playJob(String taskId) throws IOException {
        requireTaskId(taskId);
        JSONObject task = checkedJob(read("/api/system/jobs/" + taskId));
        if (!taskId.equals(task.optString("task_id"))) throw invalidResponse();
        return task;
    }

    public JSONObject controlPlayJob(String taskId, String action) throws IOException {
        requireTaskId(taskId);
        if (!("cancel".equals(action) || "retry".equals(action))) throw new IllegalArgumentException("播放任务操作无效。");
        JSONObject task = checkedJob(request("/api/system/jobs/" + taskId + "/" + action, new JSONObject()));
        if (!taskId.equals(task.optString("task_id"))) throw invalidResponse();
        return task;
    }

    public String playJobStreamUrl(String taskId) { requireTaskId(taskId); return baseUrl + "/api/automation/play-jobs/" + taskId + "/stream"; }

    private static void requireTaskId(String taskId) {
        if (taskId == null || !taskId.matches("[0-9a-f]{32}")) throw new IllegalArgumentException("播放任务编号无效。");
    }

    private static JSONObject checkedJob(JSONObject task) throws IOException {
        try { requireTaskId(task.optString("task_id")); }
        catch (IllegalArgumentException invalid) { throw invalidResponse(); }
        if (!"browse-play".equals(task.optString("type"))) throw invalidResponse();
        return task;
    }

    // The signed app session remains in this client's memory; 115 credentials stay on the server.
    public synchronized String sessionCookie() {
        URI uri = URI.create(baseUrl + "/api/automation/play-jobs/");
        for (HttpCookie cookie : cookies.getCookieStore().get(uri)) {
            if (!cookie.hasExpired() && "session".equals(cookie.getName()) && (!cookie.getSecure() || "https".equals(uri.getScheme()))
                    && cookie.getValue().matches("[A-Za-z0-9_.=\\-]+")) return "session=" + cookie.getValue();
        }
        return "";
    }

    public static String normalizeServer(String raw) {
        try {
            URI uri = new URI(raw == null ? "" : raw.trim()).normalize();
            String scheme = uri.getScheme() == null ? "" : uri.getScheme().toLowerCase(Locale.ROOT);
            if (!(scheme.equals("http") || scheme.equals("https")) || uri.getHost() == null
                    || uri.getRawUserInfo() != null || uri.getRawQuery() != null || uri.getRawFragment() != null
                    || uri.getPort() == 0 || uri.getPort() > 65535) throw new IllegalArgumentException();
            String normalized = uri.toASCIIString();
            while (normalized.endsWith("/")) normalized = normalized.substring(0, normalized.length() - 1);
            return scheme + normalized.substring(normalized.indexOf(':'));
        } catch (URISyntaxException | IllegalArgumentException exception) {
            throw new IllegalArgumentException("请输入有效的 HTTP 或 HTTPS 服务器地址，地址不能包含账号、查询参数或片段。");
        }
    }

    public List<Movie> loadMovies() throws IOException {
        JSONObject payload = read("/api/movies/local-library?compact=true");
        try {
            JSONArray records = payload.getJSONArray("records");
            List<Movie> movies = new ArrayList<>();
            for (int index = 0; index < records.length(); index++) movies.add(Movie.fromJson(records.getJSONObject(index)));
            return movies;
        } catch (JSONException | IllegalArgumentException exception) { throw invalidResponse(); }
    }

    public Movie loadMovie(String id) throws IOException {
        requireMovieId(id);
        JSONObject payload = read("/api/movies/local-library/" + id);
        try {
            Movie movie = Movie.fromJson(payload.getJSONObject("record"));
            if (!movie.id.equalsIgnoreCase(id)) throw invalidResponse();
            return movie;
        } catch (JSONException | IllegalArgumentException exception) { throw invalidResponse(); }
    }

    public List<CinemaLibrary.Actor> loadActors() throws IOException {
        JSONObject payload = read("/api/movies/local-library/actors?compact=true");
        try {
            JSONArray records = payload.getJSONArray("actors");
            List<CinemaLibrary.Actor> actors = new ArrayList<>();
            for (int index = 0; index < records.length(); index++) actors.add(CinemaLibrary.Actor.fromJson(records.getJSONObject(index)));
            return actors;
        } catch (JSONException | IllegalArgumentException exception) { throw invalidResponse(); }
    }

    public String actorAvatarUrl(CinemaLibrary.Actor actor) {
        if (actor == null || !actor.avatarAvailable || !CinemaLibrary.Actor.validKey(actor.key)) return "";
        return baseUrl + "/api/movies/local-library/actors/" + encode(actor.key).replace("+", "%20") + "/avatar";
    }

    public String browseActorAvatarUrl(BrowseFilter actor) {
        if (actor == null || !"star".equals(actor.type)) return "";
        return actor.artworkSource.isEmpty() ? baseUrl + "/static/avatars/" + encode(actor.value).replace("+", "%20") + ".jpg" : artworkUrl(actor.artworkSource);
    }

    public String deploymentLabel() throws IOException {
        JSONObject version = read("/api/system/info").optJSONObject("version");
        if (version == null) return "版本未知 · 更新时间未记录";
        String label = version.optString("version", "");
        if (!label.matches("git-[0-9a-fA-F]{7,64}")) label = "版本未知";
        String deployed = version.optString("deployed_at", ""), built = version.optString("built_at", "");
        String instant = deployed.isEmpty() ? built : deployed;
        String time = instant.matches("[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}Z")
                ? (deployed.isEmpty() ? "构建 " : "更新 ") + instant.replace("T", " ").replace("Z", " UTC") : "更新时间未记录";
        return label + " · " + time;
    }

    public String posterUrl(String id) {
        requireMovieId(id);
        return baseUrl + "/api/movies/local-library/poster/" + id;
    }

    public String posterUrl(Movie movie) {
        if (movie == null) throw new IllegalArgumentException("影片信息无效。");
        if (movie.artworkSource.isEmpty()) return posterUrl(movie.id);
        return artworkUrl(movie.artworkSource);
    }

    public String backdropUrl(Movie movie) {
        if (movie == null) throw new IllegalArgumentException("影片信息无效。");
        return movie.backdropSource.isEmpty() ? posterUrl(movie) : artworkUrl(movie.backdropSource);
    }

    private String artworkUrl(String source) {
        return source.startsWith("/") ? baseUrl + source : baseUrl + "/api/image-proxy?url=" + encode(source);
    }

    private static String encode(String value) {
        try { return URLEncoder.encode(value, "UTF-8"); }
        catch (UnsupportedEncodingException impossible) { throw new AssertionError(impossible); }
    }

    public String playbackUrl(String id, int fileIndex) {
        requireMovieId(id);
        if (fileIndex < 0) throw new IllegalArgumentException("播放文件编号无效。");
        return baseUrl + "/api/movies/local-library/" + id + "/play?file_index=" + fileIndex;
    }

    static void requireMovieId(String id) {
        if (id == null || !id.matches("[A-Za-z0-9][A-Za-z0-9_-]*")) throw new IllegalArgumentException("影片编号无效。");
    }

    private JSONObject read(String path) throws IOException { return request(path, null); }

    private synchronized JSONObject request(String path, JSONObject body) throws IOException {
        HttpURLConnection connection = null;
        try {
            connection = (HttpURLConnection) new URL(baseUrl + path).openConnection();
            connection.setConnectTimeout(10_000);
            connection.setReadTimeout(20_000);
            connection.setInstanceFollowRedirects(false);
            connection.setRequestProperty("Accept", "application/json");
            String cookie = sessionCookie(); if (!cookie.isEmpty()) connection.setRequestProperty("Cookie", cookie);
            if (body != null) {
                byte[] bytes = body.toString().getBytes(StandardCharsets.UTF_8);
                connection.setRequestMethod("POST"); connection.setRequestProperty("Content-Type", "application/json");
                connection.setDoOutput(true); connection.setFixedLengthStreamingMode(bytes.length);
                try (java.io.OutputStream output = connection.getOutputStream()) { output.write(bytes); }
            }
            int status = connection.getResponseCode();
            if (status < 200 || status >= 300 || connection.getContentLength() > MAX_RESPONSE_BYTES) throw invalidResponse();
            cookies.put(URI.create(baseUrl + path), connection.getHeaderFields());
            ByteArrayOutputStream bytes = new ByteArrayOutputStream();
            try (InputStream stream = connection.getInputStream()) {
                byte[] buffer = new byte[8192];
                int count;
                while ((count = stream.read(buffer)) != -1) {
                    if (bytes.size() + count > MAX_RESPONSE_BYTES) throw invalidResponse();
                    bytes.write(buffer, 0, count);
                }
            }
            JSONObject payload = new JSONObject(new String(bytes.toByteArray(), StandardCharsets.UTF_8));
            boolean jobResponse = path.equals("/api/automation/play-jobs") || path.startsWith("/api/system/jobs/");
            if (!jobResponse && payload.has("error") && !payload.isNull("error") || payload.has("success") && !payload.optBoolean("success")) throw invalidResponse();
            return payload;
        } catch (IOException | JSONException exception) {
            throw invalidResponse();
        } finally {
            if (connection != null) connection.disconnect();
        }
    }

    private static IOException invalidResponse() { return new IOException("无法读取服务器数据，请检查服务器地址、网络连接或服务端配置。"); }
}
