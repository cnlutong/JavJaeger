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
    public final String date, added, duration, studio, label, series, director, codec, size;
    public final long totalSize;
    public final int height;
    public final boolean isVr, subtitle, unavailable;
    public final List<String> actors, tags;
    public final List<VideoFile> files;
    final String artworkSource;
    final String backdropSource;

    private Movie(JSONObject record) throws JSONException {
        id = text(record, "movie_id", text(record, "id", ""));
        LibraryClient.requireMovieId(id);
        JSONObject metadata = record.optJSONObject("metadata");
        if (metadata == null) metadata = new JSONObject();
        title = text(record, "title", text(metadata, "title", id));
        description = text(record, "plot", text(record, "description", text(metadata, "plot", text(metadata, "description", ""))));
        date = text(record, "date", text(metadata, "date", ""));
        added = text(record, "updated_at", text(record, "added_at", text(record, "created_at", "")));
        year = date.matches("[0-9]{4}.*") ? date.substring(0, 4) : "";
        studio = first(named(record, "producer"), named(record, "studio"), named(metadata, "producer"), named(metadata, "studio"), "—");
        label = first(named(record, "publisher"), named(record, "label"), named(metadata, "publisher"), named(metadata, "label"), "—");
        director = first(named(record, "director"), named(metadata, "director"), "—");
        series = first(named(record, "series"), named(metadata, "series"), "—");
        JSONObject media = record.optJSONObject("media_info");
        if (media == null) media = metadata.optJSONObject("media_info");
        int mediaHeight = media == null ? 0 : media.optInt("height", 0);
        boolean aggregateHeight = mediaHeight > 0;
        JSONObject bestFile = new JSONObject();
        actors = Collections.unmodifiableList(names(record.optJSONArray("stars") != null ? record.optJSONArray("stars") : metadata.optJSONArray("stars")));
        List<String> genres = names(record.optJSONArray("genres") != null ? record.optJSONArray("genres") : metadata.optJSONArray("genres"));
        if (record.optBoolean("is_vr") && !genres.contains("VR")) genres.add("VR");
        tags = Collections.unmodifiableList(genres);
        isVr = tags.contains("VR");
        subtitle = tags.contains("中文字幕");
        List<VideoFile> videos = new ArrayList<>();
        String poster = "/api/movies/local-library/poster/" + id;
        String thumbnail = "/api/movies/local-library/thumbnail/" + id;
        boolean localPoster = poster.equals(text(record, "poster_url", ""));
        boolean localThumbnail = thumbnail.equals(text(record, "thumbnail_url", ""));
        JSONArray source = record.optJSONArray("files");
        long fileBytes = 0;
        boolean playable = false;
        if (source != null) for (int index = 0; index < source.length(); index++) {
            JSONObject file = source.optJSONObject(index);
            if (file == null) continue;
            if (!aggregateHeight) mediaHeight = Math.max(mediaHeight, file.optInt("height", 0));
            if (file.optLong("resolution_pixels", 0) > bestFile.optLong("resolution_pixels", -1)
                    || file.optLong("resolution_pixels", 0) == bestFile.optLong("resolution_pixels", -1)
                    && file.optLong("bitrate", 0) > bestFile.optLong("bitrate", 0)) bestFile = file;
            fileBytes += Math.max(0, file.optLong("size", 0));
            String label = text(file, "file_name", text(file, "path", ""));
            label = label.replace('\\', '/');
            label = label.substring(label.lastIndexOf('/') + 1);
            JSONObject filesystem = file.optJSONObject("filesystem");
            if (filesystem != null) {
                localPoster |= filesystem.optBoolean("poster");
                localThumbnail |= filesystem.optBoolean("thumbnail");
            }
            boolean missing = Boolean.FALSE.equals(file.opt("exists")) || filesystem != null && Boolean.FALSE.equals(filesystem.opt("exists"));
            playable |= !missing;
            videos.add(new VideoFile(index, label.isEmpty() ? "文件 " + (index + 1) : label, missing, file));
        }
        height = mediaHeight;
        quality = height > 0 ? height + "p" : "";
        if (media == null) media = bestFile;
        codec = first(text(media, "codec", ""), text(media, "video_codec", ""), text(bestFile, "codec", ""), "—");
        String minutes = first(scalar(record, "duration"), scalar(record, "videoLength"), scalar(metadata, "duration"), scalar(metadata, "videoLength"));
        long roundedMinutes = Math.round(media.optDouble("duration_seconds", bestFile.optDouble("duration_seconds", 0)) / 60);
        duration = (minutes.isEmpty() ? roundedMinutes > 0 ? Long.toString(roundedMinutes) : "—" : minutes) + " 分";
        totalSize = Math.max(0, record.optLong("total_size", 0)) > 0 ? record.optLong("total_size") : fileBytes;
        size = formatSize(totalSize);
        unavailable = !playable;
        files = Collections.unmodifiableList(videos);
        artworkSource = localPoster ? poster : localThumbnail ? thumbnail : remoteArtwork(record, metadata);
        backdropSource = remoteImage(text(record, "backdrop_url", ""), text(metadata, "backdrop_url", ""),
                text(record, "cover_url", ""), text(metadata, "cover_url", ""));
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

    private static String named(JSONObject object, String key) {
        JSONObject name = object.optJSONObject(key);
        return name == null ? text(object, key, "") : text(name, "name", "");
    }

    private static String scalar(JSONObject object, String key) {
        Object value = object.opt(key);
        return value instanceof Number ? ((Number) value).doubleValue() == 0 ? "" : value.toString() : text(object, key, "");
    }

    private static String first(String... values) {
        for (String value : values) if (!value.isEmpty()) return value;
        return "";
    }

    public static String formatSize(long bytes) {
        if (bytes <= 0) return "0 B";
        String[] units = {"B", "KB", "MB", "GB", "TB"};
        double value = bytes;
        int unit = 0;
        while (value >= 1024 && unit < units.length - 1) { value /= 1024; unit++; }
        value = Math.round(value * 10) / 10.0;
        return (value == (long) value ? Long.toString((long) value) : Double.toString(value)) + " " + units[unit];
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
        return remoteImage(text(record, "cover_url", ""), text(record, "img", ""),
                text(metadata, "cover_url", ""), text(metadata, "img", ""),
                text(record, "thumbnail_url", ""), text(metadata, "list_thumbnail_url", ""));
    }

    private static String remoteImage(String... sources) {
        for (String value : sources) {
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
        public final String size, quality, codec;
        public final boolean missing;

        private VideoFile(int index, String label, boolean missing, JSONObject raw) {
            this.index = index;
            this.label = label;
            this.missing = missing;
            size = formatSize(Math.max(0, raw.optLong("size", 0)));
            JSONObject media = raw.optJSONObject("media_info");
            if (media == null) media = raw;
            int height = media.optInt("height", 0);
            quality = height > 0 ? height + "p" : "";
            codec = text(media, "codec", text(media, "video_codec", ""));
        }
    }
}
