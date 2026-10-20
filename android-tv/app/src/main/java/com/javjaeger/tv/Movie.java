package com.javjaeger.tv;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Locale;
import java.net.URI;
import java.net.URISyntaxException;
import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

public final class Movie {
    public final String id, title, description, year, quality;
    public final List<String> actors, tags;
    public final List<VideoFile> files;
    final String artworkSource;

    private Movie(JSONObject record) throws JSONException {
        id = text(record, "movie_id", text(record, "id", ""));
        LibraryClient.requireMovieId(id);
        JSONObject metadata = record.optJSONObject("metadata");
        if (metadata == null) metadata = new JSONObject();
        title = text(record, "title", text(metadata, "title", id));
        description = text(record, "plot", text(record, "description", text(metadata, "plot", text(metadata, "description", ""))));
        String date = text(record, "date", text(metadata, "date", ""));
        year = date.matches("[0-9]{4}.*") ? date.substring(0, 4) : "";
        JSONObject media = record.optJSONObject("media_info");
        if (media == null) media = metadata.optJSONObject("media_info");
        int height = media == null ? 0 : media.optInt("height", 0);
        actors = Collections.unmodifiableList(names(record.optJSONArray("stars") != null ? record.optJSONArray("stars") : metadata.optJSONArray("stars")));
        List<String> genres = names(record.optJSONArray("genres") != null ? record.optJSONArray("genres") : metadata.optJSONArray("genres"));
        if (record.optBoolean("is_vr") && !genres.contains("VR")) genres.add("VR");
        tags = Collections.unmodifiableList(genres);
        List<VideoFile> videos = new ArrayList<>();
        String poster = "/api/movies/local-library/poster/" + id;
        String thumbnail = "/api/movies/local-library/thumbnail/" + id;
        boolean localPoster = poster.equals(text(record, "poster_url", ""));
        boolean localThumbnail = thumbnail.equals(text(record, "thumbnail_url", ""));
        JSONArray source = record.optJSONArray("files");
        if (source != null) for (int index = 0; index < source.length(); index++) {
            JSONObject file = source.optJSONObject(index);
            if (file == null) continue;
            height = Math.max(height, file.optInt("height", 0));
            String label = text(file, "file_name", text(file, "path", ""));
            label = label.replace('\\', '/');
            label = label.substring(label.lastIndexOf('/') + 1);
            JSONObject filesystem = file.optJSONObject("filesystem");
            if (filesystem != null) {
                localPoster |= filesystem.optBoolean("poster");
                localThumbnail |= filesystem.optBoolean("thumbnail");
            }
            boolean missing = Boolean.FALSE.equals(file.opt("exists")) || filesystem != null && Boolean.FALSE.equals(filesystem.opt("exists"));
            videos.add(new VideoFile(index, label.isEmpty() ? "文件 " + (index + 1) : label, missing));
        }
        quality = height > 0 ? height + "p" : "";
        files = Collections.unmodifiableList(videos);
        artworkSource = localPoster ? poster : localThumbnail ? thumbnail : remoteArtwork(record, metadata);
    }

    static Movie fromJson(JSONObject record) throws JSONException { return new Movie(record); }

    public boolean matches(String query) {
        String needle = query == null ? "" : query.trim().toLowerCase(Locale.ROOT);
        return (id + " " + title + " " + actors + " " + tags)
                .toLowerCase(Locale.ROOT).contains(needle);
    }

    private static String text(JSONObject object, String key, String fallback) {
        Object value = object.opt(key);
        return value instanceof String && !((String) value).trim().isEmpty() ? ((String) value).trim() : fallback;
    }

    private static List<String> names(JSONArray values) {
        List<String> result = new ArrayList<>();
        if (values != null) for (int index = 0; index < values.length(); index++) {
            Object value = values.opt(index);
            String name = value instanceof String ? ((String) value).trim()
                    : value instanceof JSONObject ? text((JSONObject) value, "name", "") : "";
            if (!name.isEmpty() && !result.contains(name)) result.add(name);
        }
        return result;
    }

    private static String remoteArtwork(JSONObject record, JSONObject metadata) {
        for (String value : new String[]{text(record, "cover_url", ""), text(record, "img", ""),
                text(metadata, "cover_url", ""), text(metadata, "img", ""),
                text(record, "thumbnail_url", ""), text(metadata, "list_thumbnail_url", "")}) {
            try {
                URI image = new URI(value);
                if (("http".equalsIgnoreCase(image.getScheme()) || "https".equalsIgnoreCase(image.getScheme()))
                        && image.getHost() != null && image.getRawUserInfo() == null && image.getPort() != 0 && image.getPort() <= 65535) return value;
            } catch (URISyntaxException invalid) { /* Try the next public artwork field. */ }
        }
        return "";
    }

    public static final class VideoFile {
        public final int index;
        public final String label;
        public final boolean missing;

        private VideoFile(int index, String label, boolean missing) {
            this.index = index;
            this.label = label;
            this.missing = missing;
        }
    }
}
