package com.javjaeger.tv;

import java.util.Arrays;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.json.JSONObject;
import org.junit.Test;
import static org.junit.Assert.*;

public class CinemaLibraryTest {
    private static Movie movie(String id, String extra) throws Exception {
        return Movie.fromJson(new JSONObject("{\"movie_id\":\"" + id + "\",\"title\":\"" + id
                + "\",\"files\":[{\"path\":\"/media/" + id + ".mp4\"}]," + extra + "}"));
    }

    private static CinemaLibrary library() throws Exception {
        return new CinemaLibrary(Arrays.asList(
                movie("QA-001", "\"date\":\"2022-01-01\",\"updated_at\":\"2025-01-01\",\"stars\":[\"Alice\",\"Bob\"],\"genres\":[\"剧情\",\"中文字幕\"],\"studio\":\"Studio A\",\"media_info\":{\"height\":1080},\"total_size\":900"),
                movie("QA-002", "\"date\":\"2024-01-01\",\"updated_at\":\"2024-01-01\",\"stars\":[\"Alice\"],\"genres\":[\"剧情\",\"VR\"],\"studio\":\"Studio B\",\"media_info\":{\"height\":2160},\"total_size\":100"),
                movie("QA-003", "\"date\":\"2023-01-01\",\"updated_at\":\"2026-01-01\",\"stars\":[\"Carol\"],\"genres\":[\"纪录\"],\"studio\":\"Studio A\",\"media_info\":{\"height\":720},\"total_size\":500")));
    }

    @Test public void browserMatchesWebOrWithinDimensionAndAcrossDimensions() throws Exception {
        CinemaLibrary library = library();
        Map<String, List<String>> filters = new LinkedHashMap<>();
        filters.put("actor", Arrays.asList("Alice", "Carol"));
        filters.put("studio", Collections.singletonList("Studio A"));
        assertEquals(Arrays.asList("QA-003", "QA-001"), ids(library.browse("", "", filters, "入库时间")));
        filters.put("flag", Arrays.asList("剧情", "纪录"));
        assertEquals(2, library.browse("", "", filters, "入库时间").size());
        assertTrue(library.browse("", "", filters, "入库时间", true).isEmpty());
        filters.put("flag", Arrays.asList("剧情", "中文字幕"));
        assertEquals(Collections.singletonList("QA-001"), ids(library.browse("", "", filters, "入库时间", true)));
        filters.put("actor", Collections.singletonList("Carol"));
        assertEquals(Collections.singletonList("QA-001"), ids(library.browse("alice", "Alice", filters, "入库时间")));
        assertTrue(library.browse("剧情", "", Collections.emptyMap(), "入库时间").isEmpty());
    }

    @Test public void sortsUseDatesBytesAndCodesWithoutFormattedSizeComparisons() throws Exception {
        CinemaLibrary library = library();
        assertEquals(Arrays.asList("QA-002", "QA-003", "QA-001"), ids(library.browse("", "", null, "发行日期")));
        assertEquals(Arrays.asList("QA-001", "QA-003", "QA-002"), ids(library.browse("", "", null, "体积")));
        assertEquals(Arrays.asList("QA-001", "QA-002", "QA-003"), ids(library.browse("", "", null, "番号")));
    }

    @Test public void searchJoinsActorNamesWithSpacesLikeTheWebCinema() throws Exception {
        assertEquals(Collections.singletonList("QA-001"), ids(library().browse("Alice Bob", "", null, "番号")));
        assertEquals(Collections.singletonList("QA-001"), ids(library().browse("QA-001 Alice", "", null, "番号")));
    }

    @Test public void facetsAreActorScopedAndSearchableAndLabelsUseFlagOnly() throws Exception {
        CinemaLibrary library = library();
        assertEquals(Arrays.asList("actor", "studio", "res", "flag"), CinemaLibrary.DIMENSIONS);
        assertEquals(Integer.valueOf(2), library.facetCounts("flag", "Alice", "剧").get("剧情"));
        assertEquals(1, library.facetCounts("studio", "Alice", "studio a").size());
        assertFalse(library.facetCounts("flag", "Alice", "").containsKey("纪录"));
        assertEquals(Integer.valueOf(2), library.tags().get("剧情"));
        assertEquals(3, library.actors().size());
        assertEquals("Alice", library.actors().get(0).name);
        assertEquals(2, library.actors().get(0).count);
        assertEquals(1000, library.actors().get(0).totalSize);
    }

    @Test public void shelvesFollowActualHomepageAndGroupVrByResolution() throws Exception {
        CinemaLibrary library = library();
        assertEquals(Arrays.asList("最近入库", "高清收藏", "VR 影厅"), names(library.homeShelves()));
        assertEquals(Arrays.asList("QA-003", "QA-001", "QA-002"), ids(library.homeShelves().get(0).movies));
        assertEquals(Arrays.asList("QA-001", "QA-002"), ids(library.homeShelves().get(1).movies));
        assertEquals("VR 2160p", library.vrShelves().get(0).name);
        assertEquals(Collections.singletonList("QA-002"), ids(library.vrShelves().get(0).movies));
    }

    @Test public void pagingClampsOutOfRangeAndKeepsAllItemsReachable() throws Exception {
        CinemaLibrary.Page<Movie> page = CinemaLibrary.page(library().movies, 9, 2);
        assertEquals(1, page.index);
        assertEquals(2, page.pages);
        assertEquals(3, page.total);
        assertEquals(Collections.singletonList("QA-003"), ids(page.items));
        assertEquals(0, CinemaLibrary.page(Collections.emptyList(), -1, 60).index);
        assertEquals(1, CinemaLibrary.page(Collections.emptyList(), 0, 60).pages);
        try { CinemaLibrary.page(Collections.emptyList(), 0, 0); fail("Zero page size"); }
        catch (IllegalArgumentException expected) { }
    }

    @Test public void actorMetadataKeepsAvatarsWithoutAllowingPathOrControlCharacters() throws Exception {
        CinemaLibrary.Actor actor = new CinemaLibrary.Actor("alice", "Alice", 2, 1000, true);
        CinemaLibrary library = new CinemaLibrary(library().movies, Collections.singletonList(actor));
        assertTrue(library.actors().get(0).avatarAvailable);
        assertEquals("alice", library.actors().get(0).key);
        for (String key : Arrays.asList("../alice", "alice/bob", "alice\\bob", "alice\nbob\n", "alice?query")) {
            assertFalse(CinemaLibrary.Actor.validKey(key));
        }
    }

    @Test public void movieMetadataAndRawFilesExposeDetailFacts() throws Exception {
        Movie movie = movie("QA-010", "\"date\":\"2025-02-03\",\"updated_at\":\"2026-01-02\",\"duration\":120,"
                + "\"producer\":{\"name\":\"Studio\"},\"publisher\":{\"name\":\"Label\"},\"director\":{\"name\":\"Director\"},\"series\":\"Series\","
                + "\"genres\":[\"中文字幕\"],\"is_vr\":true,\"media_info\":{\"height\":2160,\"codec\":\"hevc\"},\"total_size\":1073741824");
        assertEquals("2025-02-03", movie.date);
        assertEquals("2026-01-02", movie.added);
        assertEquals("120 分", movie.duration);
        assertEquals("Studio", movie.studio);
        assertEquals("Label", movie.label);
        assertEquals("Director", movie.director);
        assertEquals("Series", movie.series);
        assertEquals("hevc", movie.codec);
        assertEquals(2160, movie.height);
        assertEquals("1 GB", movie.size);
        assertTrue(movie.isVr);
        assertTrue(movie.subtitle);
        assertFalse(movie.unavailable);
        Movie missing = Movie.fromJson(new JSONObject("{\"movie_id\":\"QA-011\",\"files\":[{\"height\":1080,\"codec\":\"h264\",\"size\":1024,\"filesystem\":{\"exists\":false}}]}"));
        assertTrue(missing.unavailable);
        assertEquals("1 KB", missing.files.get(0).size);
        assertEquals("1080p", missing.files.get(0).quality);
        assertEquals("h264", missing.files.get(0).codec);
    }

    @Test public void aggregateResolutionStaysAuthoritativeForMixedAspectRatioFiles() throws Exception {
        Movie movie = Movie.fromJson(new JSONObject("{\"movie_id\":\"QA-VR\",\"media_info\":{\"height\":1080},\"files\":["
                + "{\"width\":3840,\"height\":1080,\"resolution_pixels\":4147200},"
                + "{\"width\":1920,\"height\":1440,\"resolution_pixels\":2764800}]}"));
        assertEquals(1080, movie.height);
        assertEquals("1080p", movie.quality);
        assertEquals(Integer.valueOf(1), new CinemaLibrary(Collections.singletonList(movie)).facetCounts("res", "", "").get("1080p"));
    }

    private static List<String> ids(List<Movie> values) {
        List<String> ids = new java.util.ArrayList<>();
        for (Movie movie : values) ids.add(movie.id);
        return ids;
    }

    private static List<String> names(List<CinemaLibrary.Shelf> values) {
        List<String> names = new java.util.ArrayList<>();
        for (CinemaLibrary.Shelf shelf : values) names.add(shelf.name);
        return names;
    }
}
