package com.javjaeger.tv;

import java.util.Collections;
import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStreamReader;
import java.net.HttpURLConnection;
import java.net.InetAddress;
import java.net.ServerSocket;
import java.net.Socket;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.atomic.AtomicReference;
import org.junit.Test;
import static org.junit.Assert.*;

public class PlaybackActivityTest {
    @Test public void playbackCarriesOnlyOneTransientSessionCookie() {
        assertEquals(Collections.singletonMap("Cookie", "session=eyJzZXNzaW9uIjoiYWEifQ==.aB_12-cD.signed"),
                PlaybackActivity.playbackHeaders("session=eyJzZXNzaW9uIjoiYWEifQ==.aB_12-cD.signed"));
        for (String invalid : new String[]{null, "", "secret", "other=secret", "session=secret; other=value",
                "session=secret\r\nX-Injected: true", "session=secret\n", "session=\"secret\""}) {
            try { PlaybackActivity.playbackHeaders(invalid); fail("Accepted invalid playback credentials"); }
            catch (IllegalArgumentException expected) { assertFalse(expected.getMessage().contains("secret")); }
        }
    }

    @Test public void authenticatedPlaybackRejectsRedirectsAndKeepsRangeRequests() throws Exception {
        AtomicReference<String> received = new AtomicReference<>("");
        try (ServerSocket server = new ServerSocket(0, 8, InetAddress.getByName("127.0.0.1"))) {
            Thread worker = new Thread(() -> {
                while (!server.isClosed()) try (Socket socket = server.accept()) {
                    BufferedReader reader = new BufferedReader(new InputStreamReader(socket.getInputStream(), StandardCharsets.UTF_8));
                    String first = reader.readLine(), line;
                    StringBuilder headers = new StringBuilder(first);
                    while ((line = reader.readLine()) != null && !line.isEmpty()) headers.append('\n').append(line);
                    received.set(headers.toString());
                    String response = first.contains("/redirect ")
                            ? "302 Found\r\nLocation: http://localhost:" + server.getLocalPort() + "/secret-target\r\nContent-Length: 0\r\n\r\n"
                            : "206 Partial Content\r\nContent-Range: bytes 3-5/10\r\nContent-Length: 3\r\n\r\ndef";
                    socket.getOutputStream().write(("HTTP/1.1 " + response).getBytes(StandardCharsets.UTF_8));
                } catch (IOException ignored) { }
            });
            worker.setDaemon(true);
            worker.start();
            String endpoint = "http://127.0.0.1:" + server.getLocalPort();
            try {
                PlaybackActivity.openPlaybackConnection(endpoint + "/redirect", "session=secret", 0, -1);
                fail("Followed an authenticated redirect");
            } catch (IOException expected) {
                assertFalse(expected.toString().contains("secret"));
                assertTrue(received.get().startsWith("GET /redirect "));
            }
            HttpURLConnection connection = PlaybackActivity.openPlaybackConnection(endpoint + "/stream", "session=secret", 3, 3);
            try {
                assertFalse(connection.getInstanceFollowRedirects());
                assertEquals("def", new String(connection.getInputStream().readAllBytes(), StandardCharsets.UTF_8));
                assertTrue(received.get().contains("Cookie: session=secret"));
                assertTrue(received.get().contains("Range: bytes=3-5"));
            } finally { connection.disconnect(); }
        }
    }
}
