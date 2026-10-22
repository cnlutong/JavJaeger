package com.javjaeger.tv;

import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.net.ServerSocket;
import java.net.Socket;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicReference;
import org.junit.After;
import org.junit.Before;
import org.junit.Test;
import static org.junit.Assert.*;

public class LibraryClientTest {
    private ServerSocket server;
    private Thread serverThread;
    private String address;
    private final AtomicReference<String> body = new AtomicReference<>("{}");
    private final AtomicReference<String> requested = new AtomicReference<>();
    private final AtomicReference<String> redirect = new AtomicReference<>();
    private final AtomicReference<Integer> responseCode = new AtomicReference<>(200);
    private final AtomicBoolean chunked = new AtomicBoolean();
    private final AtomicReference<String> setCookie = new AtomicReference<>();
    private final AtomicReference<String> cookie = new AtomicReference<>();
    private final AtomicReference<String> requestMethod = new AtomicReference<>();
    private final AtomicReference<String> requestBody = new AtomicReference<>();

    @Before public void startServer() throws IOException {
        server = new ServerSocket(0, 1, java.net.InetAddress.getByName("127.0.0.1"));
        serverThread = new Thread(() -> {
            while (!server.isClosed()) try (Socket socket = server.accept()) {
                socket.setSoTimeout(1000);
                BufferedReader reader = new BufferedReader(new InputStreamReader(socket.getInputStream(), StandardCharsets.UTF_8));
                String[] request = reader.readLine().split(" ");
                requestMethod.set(request[0]); requested.set(request[1]); cookie.set("");
                String line;
                int length = 0;
                while ((line = reader.readLine()) != null && !line.isEmpty()) {
                    if (line.toLowerCase(java.util.Locale.ROOT).startsWith("cookie:")) cookie.set(line.substring(7).trim());
                    if (line.toLowerCase(java.util.Locale.ROOT).startsWith("content-length:")) length = Integer.parseInt(line.substring(15).trim());
                }
                char[] content = new char[length]; int count = 0;
                while (count < length) { int read = reader.read(content, count, length - count); if (read < 0) break; count += read; }
                requestBody.set(new String(content, 0, count));
                byte[] bytes = body.get().getBytes(StandardCharsets.UTF_8);
                String headers = "HTTP/1.1 " + responseCode.get() + " Test\r\nContent-Type: application/json\r\nConnection: close\r\n"
                        + (redirect.get() == null ? "" : "Location: " + redirect.get() + "\r\n")
                        + (setCookie.get() == null ? "" : "Set-Cookie: " + setCookie.get() + "\r\n")
                        + (chunked.get() ? "Transfer-Encoding: chunked\r\n" : "Content-Length: " + bytes.length + "\r\n") + "\r\n";
                OutputStream output = socket.getOutputStream();
                output.write(headers.getBytes(StandardCharsets.UTF_8));
                if (chunked.get()) output.write((Integer.toHexString(bytes.length) + "\r\n").getBytes(StandardCharsets.UTF_8));
                output.write(bytes);
                if (chunked.get()) output.write("\r\n0\r\n\r\n".getBytes(StandardCharsets.UTF_8));
            } catch (IOException ignored) { /* Shutdown or a size-limited client can close the connection. */ }
        });
        serverThread.setDaemon(true);
        serverThread.start();
        address = "http://127.0.0.1:" + server.getLocalPort();
    }

    @After public void stopServer() throws Exception { server.close(); serverThread.join(1000); }

    @Test public void normalizesServerWithoutDroppingSubpathOrIpv6() {
        assertEquals("https://example.test/javjaeger", LibraryClient.normalizeServer("  https://example.test/javjaeger///  "));
        assertEquals("http://[::1]:8000/media", LibraryClient.normalizeServer("http://[::1]:8000/media/"));
        assertEquals("https://example.test", new LibraryClient("https://example.test/").getBaseUrl());
        for (String invalid : new String[]{null, "", "example.test", "file:///secret", "javascript:alert(1)",
                "https://user:secret@example.test", "https://example.test?token=secret", "https://example.test/#secret",
                "https:///missing", "http://example.test:70000", "http://example.test:0", "http://example.test:-2", "http://example.test/\\other"}) {
            try { LibraryClient.normalizeServer(invalid); fail("Accepted an invalid address"); }
            catch (IllegalArgumentException expected) { assertFalse(expected.getMessage().contains("secret")); }
        }
    }

    @Test public void loadsCompactLibraryAndMapsNativeCinemaFields() throws Exception {
        body.set("{\"success\":true,\"records\":[{\"movie_id\":\"QA-001\",\"title\":\"影院影片\",\"date\":\"2025-03-01\","
                + "\"stars\":[\"Alice\",{\"name\":\"演员\"}],\"genres\":[{\"name\":\"剧情\"}],\"media_info\":{\"height\":2160},"
                + "\"metadata\":{\"plot\":\"本地简介\"},\"files\":[{\"path\":\"/private/library/QA-001-CD1.mp4\",\"exists\":true},null,"
                + "{\"path\":\"C:\\\\media\\\\QA-001-CD2.mkv\",\"exists\":false},{\"file_name\":\"自选版本.mp4\"}]}]}");
        LibraryClient client = new LibraryClient(address + "/media/");
        List<Movie> movies = client.loadMovies();
        assertEquals("/media/api/movies/local-library?compact=true", requested.get());
        assertEquals(1, movies.size());
        Movie movie = movies.get(0);
        assertEquals("QA-001", movie.id);
        assertEquals("影院影片", movie.title);
        assertEquals("本地简介", movie.description);
        assertEquals("2025", movie.year);
        assertEquals("2160p", movie.quality);
        assertEquals("Alice", movie.actors.get(0));
        assertEquals("剧情", movie.tags.get(0));
        assertEquals(3, movie.files.size());
        assertEquals(0, movie.files.get(0).index);
        assertEquals("QA-001-CD1.mp4", movie.files.get(0).label);
        assertEquals(2, movie.files.get(1).index);
        assertEquals("QA-001-CD2.mkv", movie.files.get(1).label);
        assertTrue(movie.files.get(1).missing);
        assertFalse(movie.files.get(2).missing);
        assertTrue(movie.matches("  alice  "));
        assertTrue(movie.matches("qa-001"));
        assertTrue(movie.matches("演员"));
        assertTrue(movie.matches("剧情"));
        assertTrue(movie.matches(""));
        assertFalse(movie.matches("does not exist"));
        try { movie.files.clear(); fail("Mutable movie files"); } catch (UnsupportedOperationException expected) { }
    }

    @Test public void loadsDetailWithMetadataFallbacksAndBuildsOnlySameOriginUrls() throws Exception {
        body.set("{\"success\":true,\"in_local_library\":true,\"record\":{\"movie_id\":\"QA-002\",\"metadata\":{\"title\":\"详情\","
                + "\"description\":\"简介\",\"date\":\"2024-01-01\",\"stars\":[{\"name\":\"Alice\"}],\"genres\":[\"VR\"],"
                + "\"media_info\":{\"height\":1080}},\"poster_url\":\"http://evil.test/secret\",\"files\":[{\"path\":\"http://evil.test/video\"}]}}");
        LibraryClient client = new LibraryClient(address + "/base");
        Movie movie = client.loadMovie("QA-002");
        assertEquals("/base/api/movies/local-library/QA-002", requested.get());
        assertEquals("详情", movie.title);
        assertEquals("简介", movie.description);
        assertEquals("2024", movie.year);
        assertEquals("1080p", movie.quality);
        assertEquals(address + "/base/api/movies/local-library/poster/QA-002", client.posterUrl(movie.id));
        assertEquals(address + "/base/api/movies/local-library/QA-002/play?file_index=0", client.playbackUrl(movie.id, 0));
        for (String invalid : new String[]{"", "..", "../secrets", "QA-002?token=secret", "http://evil.test"}) {
            try { client.posterUrl(invalid); fail("Accepted invalid movie ID"); }
            catch (IllegalArgumentException expected) { assertFalse(expected.getMessage().contains("secret")); }
        }
        try { client.playbackUrl("QA-002", -1); fail("Accepted a negative file index"); }
        catch (IllegalArgumentException expected) { }
    }

    @Test public void rejectsHttpApiAndMalformedJsonErrorsWithoutExposingResponse() throws Exception {
        LibraryClient client = new LibraryClient(address);
        for (String response : new String[]{"secret password", "{\"success\":false,\"message\":\"secret password\"}",
                "{\"success\":true,\"records\":\"secret password\"}", "{\"success\":true,\"records\":[{\"title\":\"secret password\"}]}"}) {
            body.set(response);
            assertSafeFailure(client, false);
        }
        body.set("{\"success\":true,\"in_local_library\":false,\"record\":null}");
        assertSafeFailure(client, true);
        body.set("secret password");
        responseCode.set(500);
        assertSafeFailure(client, false);
    }

    @Test public void detailReadsRawFileResolutionAndFilesystemState() throws Exception {
        body.set("{\"success\":true,\"in_local_library\":true,\"record\":{\"movie_id\":\"QA-003\",\"files\":["
                + "{\"path\":\"/media/part1.mp4\",\"height\":720,\"filesystem\":{\"exists\":false}},"
                + "{\"path\":\"/media/part2.mp4\",\"height\":1080,\"filesystem\":{\"exists\":true}}]}}");
        Movie movie = new LibraryClient(address).loadMovie("QA-003");
        assertEquals("1080p", movie.quality);
        assertTrue(movie.files.get(0).missing);
        assertFalse(movie.files.get(1).missing);
    }

    @Test public void artworkUsesRegisteredLocalAssetsThenSameOriginImageProxy() throws Exception {
        body.set("{\"success\":true,\"records\":["
                + "{\"movie_id\":\"QA-010\",\"metadata\":{\"cover_url\":\"https://cdn.example/封面.jpg?size=720&crop=1\"}},"
                + "{\"movie_id\":\"QA-011\",\"poster_url\":\"/api/movies/local-library/poster/QA-011\",\"cover_url\":\"https://cdn.example/remote.jpg\"},"
                + "{\"movie_id\":\"QA-012\",\"cover_url\":\"https://cdn.example/remote.jpg\",\"files\":[{\"filesystem\":{\"thumbnail\":true}}]},"
                + "{\"movie_id\":\"QA-013\",\"poster_url\":\"/api/system/settings\",\"cover_url\":\"file:///secret\",\"metadata\":{\"img\":\"https://cdn.example/fallback.jpg\"}},"
                + "{\"movie_id\":\"QA-014\",\"cover_url\":\"https://user:secret@cdn.example/a.jpg\",\"img\":\"javascript:alert(1)\",\"metadata\":{\"cover_url\":\"//cdn.example/a.jpg\"}},"
                + "{\"movie_id\":\"QA-015\",\"poster_url\":\"/api/movies/local-library/poster/OTHER\",\"files\":[{\"filesystem\":{\"poster\":true}}]},"
                + "{\"movie_id\":\"QA-016\",\"thumbnail_url\":\"/api/movies/local-library/thumbnail/QA-016\"},"
                + "{\"movie_id\":\"QA-017\",\"cover_url\":\"https://cdn.example:70000/a.jpg\",\"metadata\":{\"list_thumbnail_url\":\"https://cdn.example/thumb.jpg\"}}]}");
        LibraryClient client = new LibraryClient(address + "/base");
        List<Movie> movies = client.loadMovies();
        assertEquals(address + "/base/api/image-proxy?url=https%3A%2F%2Fcdn.example%2F%E5%B0%81%E9%9D%A2.jpg%3Fsize%3D720%26crop%3D1", client.posterUrl(movies.get(0)));
        assertEquals(client.posterUrl("QA-011"), client.posterUrl(movies.get(1)));
        assertEquals(address + "/base/api/movies/local-library/thumbnail/QA-012", client.posterUrl(movies.get(2)));
        assertEquals(address + "/base/api/image-proxy?url=https%3A%2F%2Fcdn.example%2Ffallback.jpg", client.posterUrl(movies.get(3)));
        assertEquals(client.posterUrl("QA-014"), client.posterUrl(movies.get(4)));
        assertEquals(client.posterUrl("QA-015"), client.posterUrl(movies.get(5)));
        assertEquals(address + "/base/api/movies/local-library/thumbnail/QA-016", client.posterUrl(movies.get(6)));
        assertEquals(address + "/base/api/image-proxy?url=https%3A%2F%2Fcdn.example%2Fthumb.jpg", client.posterUrl(movies.get(7)));
    }

    @Test public void neverFollowsRedirects() throws Exception {
        redirect.set("http://127.0.0.1:1/secret-password");
        responseCode.set(302);
        assertSafeFailure(new LibraryClient(address), false);
        assertEquals("/api/movies/local-library?compact=true", requested.get());
    }

    @Test public void actorAvatarsAndBackdropsStayOnValidatedServerEndpoints() throws Exception {
        body.set("{\"success\":true,\"actors\":[{\"key\":\"演员 A\",\"name\":\"演员\",\"movie_count\":2,\"total_size\":1024,"
                + "\"avatar_url\":\"/api/movies/local-library/actors/演员 A/avatar\"},{\"key\":\"bob\",\"name\":\"Bob\",\"avatar_url\":\"https://evil.test/avatar\"}]}");
        LibraryClient client = new LibraryClient(address + "/base");
        List<CinemaLibrary.Actor> actors = client.loadActors();
        assertEquals("/base/api/movies/local-library/actors?compact=true", requested.get());
        assertEquals("演员", actors.get(0).name);
        assertEquals(2, actors.get(0).count);
        assertEquals(1024, actors.get(0).totalSize);
        assertEquals(address + "/base/api/movies/local-library/actors/%E6%BC%94%E5%91%98%20A/avatar", client.actorAvatarUrl(actors.get(0)));
        assertEquals("", client.actorAvatarUrl(actors.get(1)));
        Movie movie = Movie.fromJson(new org.json.JSONObject("{\"movie_id\":\"QA-001\",\"backdrop_url\":\"https://cdn.example/back.jpg\"}"));
        assertEquals(address + "/base/api/image-proxy?url=https%3A%2F%2Fcdn.example%2Fback.jpg", client.backdropUrl(movie));
        body.set("{\"version\":{\"version\":\"git-abc1234\",\"deployed_at\":\"2026-10-21T10:00:00Z\"},\"hostname\":\"private-host\"}");
        assertEquals("git-abc1234 · 更新 2026-10-21 10:00:00 UTC", client.deploymentLabel());
        assertEquals("/base/api/system/info", requested.get());
        body.set("{\"version\":{\"version\":\"secret password\",\"built_at\":\"not-a-date\"}}");
        assertEquals("版本未知 · 更新时间未记录", client.deploymentLabel());
    }

    @Test public void boundsServerResponsesAtSixteenMebibytes() throws Exception {
        char[] large = new char[16 * 1024 * 1024 + 1];
        java.util.Arrays.fill(large, 'x');
        body.set(new String(large));
        assertSafeFailure(new LibraryClient(address), false);
        chunked.set(true);
        assertSafeFailure(new LibraryClient(address), false);
    }

    @Test public void browseKeepsServerPaginationAndCombinesEverySelectedFilter() throws Exception {
        LibraryClient client = new LibraryClient(address + "/base");
        body.set("{\"movies\":[{\"id\":\"QA-100\",\"title\":\"发现影片\",\"img\":\"https://cdn.example/cover.jpg\"}],\"pagination\":{\"hasNextPage\":true,\"nextPage\":3}}");
        LibraryClient.BrowsePage page = client.loadBrowse(2, "uncensored", java.util.Arrays.asList(
                new LibraryClient.BrowseFilter("star", "a1", "演员 A"), new LibraryClient.BrowseFilter("genre", "g1", "标签一"),
                new LibraryClient.BrowseFilter("genre", "g2", "标签二")));
        assertEquals("QA-100", page.movies.get(0).id); assertEquals(3, page.nextPage);
        String query = java.net.URLDecoder.decode(requested.get(), "UTF-8");
        assertTrue(query.startsWith("/base/api/movies?")); assertTrue(query.contains("type=uncensored")); assertTrue(query.contains("page=2")); assertTrue(query.contains("magnet=exist"));
        org.json.JSONArray filters = new org.json.JSONArray(query.substring(query.indexOf("filters=") + 8));
        assertEquals(3, filters.length()); assertEquals("g2", filters.getJSONObject(2).getString("value"));
        body.set("{\"movies\":[],\"pagination\":{\"hasNextPage\":true,\"nextPage\":4}}");
        assertEquals(4, client.loadBrowse(3, "normal", java.util.Collections.emptyList()).nextPage);
        body.set("{\"movies\":[],\"pagination\":{\"hasNextPage\":false,\"nextPage\":null}}");
        assertEquals(0, client.loadBrowse(4, "normal", java.util.Collections.emptyList()).nextPage);
    }

    @Test public void browseDetailsAndCatalogsRetainFilterIds() throws Exception {
        LibraryClient client = new LibraryClient(address);
        body.set("{\"id\":\"QA-100\",\"stars\":[{\"id\":\"a1\",\"name\":\"演员 A\"}],\"genres\":[{\"id\":\"g1\",\"name\":\"标签\"}],\"producer\":{\"id\":\"s1\",\"name\":\"制作商\"},\"publisher\":{\"id\":\"l1\",\"name\":\"发行商\"},\"director\":{\"id\":\"d1\",\"name\":\"导演\"},\"series\":{\"id\":\"r1\",\"name\":\"系列\"}}");
        Movie detail = client.loadBrowseMovie("QA-100"); assertEquals("/api/movies/QA-100", requested.get());
        assertEquals(6, detail.browseFilters.size()); assertEquals("star", detail.browseFilters.get(0).type); assertEquals("a1", detail.browseFilters.get(0).value);
        body.set("{\"演员\":[{\"name\":\"演员 A\",\"code\":\"a1\"}],\"其他\":{\"b2\":\"演员 B\"}}");
        List<LibraryClient.BrowseFilter> actors = client.loadBrowseCatalog("star");
        assertEquals("/static/actors.json", requested.get()); assertEquals(2, actors.size()); assertEquals("a1", actors.get(0).value); assertEquals("演员 B", actors.get(1).label);
        body.set("{\"主题\":[{\"name\":\"标签\",\"id\":\"g1\"}]}");
        assertEquals("g1", client.loadBrowseCatalog("genre").get(0).value); assertEquals("/static/categories.json", requested.get());
    }

    @Test public void browseFiltersRejectControlCharactersAndKeepRemotePathsOutOfFilterIds() throws Exception {
        for (String invalid : new String[]{"\n\n", "a\r\nb", "a?token=secret", "a#secret", "a\\secret", "../secret"}) {
            try { new LibraryClient.BrowseFilter("star", invalid, "演员"); fail("Accepted invalid filter value"); }
            catch (IllegalArgumentException expected) { assertFalse(expected.toString().contains("secret")); }
        }
        body.set("{\"id\":\"QA-100\",\"stars\":[{\"id\":\"uncensored/a1\",\"name\":\"演员\"}]}");
        assertEquals("a1", new LibraryClient(address).loadBrowseMovie("QA-100").browseFilters.get(0).value);
    }

    @Test public void playJobsShareOnlyTheirClientsInMemorySession() throws Exception {
        String task = "0123456789abcdef0123456789abcdef";
        LibraryClient first = new LibraryClient(address + "/base"), other = new LibraryClient(address + "/base");
        body.set("{\"task_id\":\"" + task + "\",\"type\":\"browse-play\",\"status\":\"running\",\"error\":null}");
        responseCode.set(202); setCookie.set("session=eyJ0diI6MX0.signature; Path=/; HttpOnly; SameSite=lax");
        assertEquals(task, first.startPlayJob("QA-100").getString("task_id"));
        assertEquals("POST", requestMethod.get()); assertEquals("QA-100", new org.json.JSONObject(requestBody.get()).getString("movie_id"));
        assertEquals("session=eyJ0diI6MX0.signature", first.sessionCookie()); assertEquals("", other.sessionCookie());
        setCookie.set(null); responseCode.set(200); first.playJob(task);
        assertEquals("/base/api/system/jobs/" + task, requested.get()); assertTrue(cookie.get().contains("session=eyJ0diI6MX0.signature"));
        first.controlPlayJob(task, "cancel"); assertEquals("POST", requestMethod.get()); assertEquals("/base/api/system/jobs/" + task + "/cancel", requested.get());
        first.controlPlayJob(task, "retry"); assertEquals("/base/api/system/jobs/" + task + "/retry", requested.get());
        assertEquals(address + "/base/api/automation/play-jobs/" + task + "/stream", first.playJobStreamUrl(task));
        other.playJob(task); assertEquals("", cookie.get());
        body.set("{\"task_id\":\"" + task + "\",\"type\":\"browse-play\",\"status\":\"failed\",\"error\":\"task_failed\",\"can_retry\":true}");
        assertTrue(first.playJob(task).getBoolean("can_retry"));
        for (String invalid : new String[]{"../secret", task + "?token=secret", "https://evil.test/", "", null}) {
            try { first.playJobStreamUrl(invalid); fail("Accepted invalid task ID"); } catch (IllegalArgumentException expected) { assertFalse(expected.toString().contains("secret")); }
        }
    }

    private static void assertSafeFailure(LibraryClient client, boolean detail) {
        try {
            if (detail) client.loadMovie("QA-001"); else client.loadMovies();
            fail("Accepted an invalid response");
        } catch (IOException expected) {
            assertFalse(expected.toString().contains("secret"));
            assertFalse(expected.toString().contains("password"));
            assertNull(expected.getCause());
        }
    }
}
