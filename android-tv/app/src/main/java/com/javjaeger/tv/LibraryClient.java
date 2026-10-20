package com.javjaeger.tv;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.UnsupportedEncodingException;
import java.net.HttpURLConnection;
import java.net.URI;
import java.net.URISyntaxException;
import java.net.URL;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

public final class LibraryClient {
    private static final int MAX_RESPONSE_BYTES = 16 * 1024 * 1024;
    private final String baseUrl;

    public LibraryClient(String server) { baseUrl = normalizeServer(server); }

    public String getBaseUrl() { return baseUrl; }

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

    public String posterUrl(String id) {
        requireMovieId(id);
        return baseUrl + "/api/movies/local-library/poster/" + id;
    }

    public String posterUrl(Movie movie) {
        if (movie == null) throw new IllegalArgumentException("影片信息无效。");
        if (movie.artworkSource.isEmpty()) return posterUrl(movie.id);
        if (movie.artworkSource.startsWith("/")) return baseUrl + movie.artworkSource;
        try { return baseUrl + "/api/image-proxy?url=" + URLEncoder.encode(movie.artworkSource, "UTF-8"); }
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

    private JSONObject read(String path) throws IOException {
        HttpURLConnection connection = null;
        try {
            connection = (HttpURLConnection) new URL(baseUrl + path).openConnection();
            connection.setConnectTimeout(10_000);
            connection.setReadTimeout(20_000);
            connection.setInstanceFollowRedirects(false);
            connection.setRequestProperty("Accept", "application/json");
            if (connection.getResponseCode() != HttpURLConnection.HTTP_OK || connection.getContentLength() > MAX_RESPONSE_BYTES) throw invalidResponse();
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
            if (payload.has("error") || payload.has("success") && !payload.optBoolean("success")) throw invalidResponse();
            return payload;
        } catch (IOException | JSONException exception) {
            throw invalidResponse();
        } finally {
            if (connection != null) connection.disconnect();
        }
    }

    private static IOException invalidResponse() { return new IOException("无法读取影视库，请检查服务器地址、网络连接或服务端状态。"); }
}
