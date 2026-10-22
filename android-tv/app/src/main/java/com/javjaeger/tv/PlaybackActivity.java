package com.javjaeger.tv;

import android.app.Activity;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.text.TextUtils;
import android.view.Gravity;
import android.view.KeyEvent;
import android.view.View;
import android.view.ViewGroup;
import android.view.WindowManager;
import android.widget.Button;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.TextView;
import android.widget.AdapterView;
import android.widget.ArrayAdapter;
import android.widget.Spinner;
import android.graphics.drawable.GradientDrawable;
import android.graphics.drawable.StateListDrawable;
import androidx.media3.common.MediaItem;
import androidx.media3.common.MediaMetadata;
import androidx.media3.common.PlaybackException;
import androidx.media3.common.Player;
import androidx.media3.common.AudioAttributes;
import androidx.media3.common.C;
import androidx.media3.exoplayer.ExoPlayer;
import androidx.media3.exoplayer.source.DefaultMediaSourceFactory;
import androidx.media3.datasource.BaseDataSource;
import androidx.media3.datasource.DataSpec;
import androidx.media3.datasource.HttpUtil;
import androidx.media3.ui.PlayerView;
import java.io.EOFException;
import java.io.IOException;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

@androidx.annotation.OptIn(markerClass = androidx.media3.common.util.UnstableApi.class)
public final class PlaybackActivity extends Activity {
    private final ExecutorService network = Executors.newSingleThreadExecutor();
    private LibraryClient client;
    private String movieId;
    private String browseJobId;
    private int fileIndex;
    private long position;
    private boolean playWhenReady = true;
    private int generation;
    private ExoPlayer player;
    private PlayerView playerView;
    private FrameLayout root;
    private boolean failed;
    private Spinner fileSelector;
    private TextView playbackTitle;
    private LinearLayout playbackBar;
    private Movie playingMovie;
    private boolean selectingFile;

    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        root = new FrameLayout(this);
        root.setBackgroundColor(Color.BLACK);
        setContentView(root);
        try {
            client = new LibraryClient(getIntent().getStringExtra("server"));
            movieId = getIntent().getStringExtra("movie_id");
            browseJobId = getIntent().getStringExtra("browse_job_id");
            fileIndex = state == null ? getIntent().getIntExtra("file_index", -1) : state.getInt("file_index", -1);
            if (browseJobId == null) client.playbackUrl(movieId, fileIndex);
            else {
                client.playJobStreamUrl(browseJobId);
                playbackHeaders(getIntent().getStringExtra("session_cookie"));
                fileIndex = 0;
            }
            if (state != null) {
                position = state.getLong("position");
                playWhenReady = state.getBoolean("play", true);
            }
        } catch (IllegalArgumentException invalid) {
            showError("播放信息无效，请返回影片详情后重新选择文件。");
        }
    }

    @Override protected void onStart() {
        super.onStart();
        if (Build.VERSION.SDK_INT >= 24 && !failed) loadPlayback();
    }

    @Override protected void onResume() {
        super.onResume();
        if (Build.VERSION.SDK_INT < 24 && !failed) loadPlayback();
    }

    private void loadPlayback() {
        final int request = ++generation;
        if (browseJobId != null) {
            String title = getIntent().getStringExtra("title");
            startPlayer(null, Collections.singletonList(new MediaItem.Builder()
                    .setUri(client.playJobStreamUrl(browseJobId)).setMediaId("0")
                    .setMediaMetadata(new MediaMetadata.Builder().setTitle(title == null ? movieId : title).build()).build()));
            return;
        }
        root.removeAllViews();
        TextView loading = new TextView(this);
        loading.setText("正在读取播放文件…");
        loading.setTextColor(Color.WHITE);
        loading.setTextSize(22);
        loading.setGravity(Gravity.CENTER);
        root.addView(loading, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        network.execute(() -> {
            try {
                Movie movie = client.loadMovie(movieId);
                List<MediaItem> playlist = new ArrayList<>();
                boolean selectedExists = false;
                for (Movie.VideoFile file : movie.files) {
                    if (file.index == fileIndex && !file.missing) selectedExists = true;
                    if (file.missing) continue;
                    playlist.add(new MediaItem.Builder().setUri(client.playbackUrl(movieId, file.index))
                            .setMediaId(Integer.toString(file.index))
                            .setMediaMetadata(new MediaMetadata.Builder().setTitle(movie.title + " · " + file.label).build()).build());
                }
                if (!selectedExists) {
                    runOnUiThread(() -> { if (request == generation && !isDestroyed()) showError("所选文件已缺失，请返回详情重新选择，或在服务器重新扫描影片库。"); });
                    return;
                }
                runOnUiThread(() -> {
                    if (request != generation || isDestroyed()) return;
                    startPlayer(movie, playlist);
                });
            } catch (Exception unavailable) {
                runOnUiThread(() -> {
                    if (request == generation && !isDestroyed()) showError("无法读取播放信息。请检查电视网络与服务器状态，然后返回详情重试。");
                });
            }
        });
    }

    private void startPlayer(Movie movie, List<MediaItem> playlist) {
        root.removeAllViews();
        playingMovie = movie;
        LinearLayout bar = new LinearLayout(this);
        playbackBar = bar;
        bar.setContentDescription("播放控制栏");
        bar.setGravity(Gravity.CENTER_VERTICAL);
        int padding = Math.round(14 * getResources().getDisplayMetrics().density);
        bar.setPadding(padding, padding / 2, padding, padding / 2);
        bar.setBackground(new GradientDrawable(GradientDrawable.Orientation.TOP_BOTTOM, new int[]{0xee101114, 0x00101114}));
        playbackTitle = new TextView(this);
        playbackTitle.setText(movie == null ? playlist.get(0).mediaMetadata.title : movie.id + " · " + movie.title);
        playbackTitle.setMaxLines(1);
        playbackTitle.setEllipsize(TextUtils.TruncateAt.END);
        playbackTitle.setTextSize(16);
        playbackTitle.setTextColor(0xfff4f5f7);
        bar.addView(playbackTitle, new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1));
        fileSelector = null;
        if (movie != null) {
            List<String> labels = new ArrayList<>();
            int selected = 0;
            for (int i = 0; i < movie.files.size(); i++) {
                Movie.VideoFile file = movie.files.get(i);
                labels.add((file.index + 1) + ". " + file.label + (file.missing ? "（文件缺失）" : ""));
                if (file.index == fileIndex) selected = i;
            }
            fileSelector = new Spinner(this);
            fileSelector.setContentDescription("播放文件");
            fileSelector.setAdapter(new ArrayAdapter<String>(this, android.R.layout.simple_spinner_dropdown_item, labels) {
                @Override public boolean areAllItemsEnabled() { return false; }
                @Override public boolean isEnabled(int position) { return !movie.files.get(position).missing; }
            });
            fileSelector.setSelection(selected);
            fileSelector.setBackground(controlBackground());
            fileSelector.setOnFocusChangeListener((view, focused) -> keepControlsVisible(focused));
            bar.addView(fileSelector, new LinearLayout.LayoutParams(Math.round(260 * getResources().getDisplayMetrics().density), ViewGroup.LayoutParams.WRAP_CONTENT));
            fileSelector.setOnItemSelectedListener(new AdapterView.OnItemSelectedListener() {
                @Override public void onNothingSelected(AdapterView<?> parent) { }
                @Override public void onItemSelected(AdapterView<?> parent, View view, int position, long id) {
                    Movie.VideoFile chosen = movie.files.get(position);
                    if (selectingFile || chosen.missing || chosen.index == fileIndex) return;
                    releasePlayer();
                    fileIndex = chosen.index;
                    PlaybackActivity.this.position = 0;
                    playWhenReady = true;
                    loadPlayback();
                }
            });
        }
        Button stop = new Button(this);
        stop.setText("停止播放");
        stop.setAllCaps(false);
        stop.setTextColor(0xfff4f5f7);
        stop.setBackground(controlBackground());
        stop.setOnClickListener(view -> finish());
        stop.setOnFocusChangeListener((view, focused) -> keepControlsVisible(focused));
        bar.addView(stop);
        playerView = new PlayerView(this);
        playerView.setContentDescription("影片播放器");
        playerView.setKeepScreenOn(true);
        playerView.setShowNextButton(true);
        playerView.setShowPreviousButton(true);
        playerView.setControllerShowTimeoutMs(4000);
        playerView.setShowSubtitleButton(true);
        playerView.setControllerVisibilityListener((PlayerView.ControllerVisibilityListener) bar::setVisibility);
        root.addView(playerView, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        root.addView(bar, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT, Gravity.TOP));
        ExoPlayer.Builder builder = new ExoPlayer.Builder(this).setSeekBackIncrementMs(10000).setSeekForwardIncrementMs(10000);
        if (browseJobId != null) builder.setMediaSourceFactory(new DefaultMediaSourceFactory(
                () -> new SessionStreamDataSource(client.playJobStreamUrl(browseJobId), getIntent().getStringExtra("session_cookie"))));
        player = builder.build();
        player.setAudioAttributes(AudioAttributes.DEFAULT, true);
        player.addListener(new Player.Listener() {
            @Override public void onMediaItemTransition(MediaItem item, int reason) {
                if (item == null || playingMovie == null) return;
                fileIndex = Integer.parseInt(item.mediaId);
                selectingFile = true;
                for (int i = 0; i < playingMovie.files.size(); i++) if (playingMovie.files.get(i).index == fileIndex) {
                    fileSelector.setSelection(i);
                    playbackTitle.setText(playingMovie.id + " · " + playingMovie.title + " · " + playingMovie.files.get(i).label);
                    break;
                }
                selectingFile = false;
            }
            @Override public void onPlayerError(PlaybackException error) {
                showError("当前文件无法播放。请确认服务器可达；若其他影片可以播放，可能是电视不支持此视频或音频编码。可在服务器管理界面转换后重试。");
            }
        });
        playerView.setPlayer(player);
        int start = 0;
        for (int i = 0; i < playlist.size(); i++) if (playlist.get(i).mediaId.equals(Integer.toString(fileIndex))) start = i;
        player.setMediaItems(playlist, start, position);
        player.setPlayWhenReady(playWhenReady);
        player.prepare();
        playerView.requestFocus();
    }

    private void keepControlsVisible(boolean focused) {
        if (playerView == null) return;
        playerView.setControllerShowTimeoutMs(focused ? 0 : 4000);
        playerView.showController();
    }

    static Map<String, String> playbackHeaders(String cookie) {
        if (cookie == null || !cookie.matches("session=[A-Za-z0-9_+/=.-]+"))
            throw new IllegalArgumentException("播放会话无效，请返回影片详情重试。");
        return Collections.singletonMap("Cookie", cookie);
    }

    static HttpURLConnection openPlaybackConnection(String endpoint, String cookie, long position, long length) throws IOException {
        HttpURLConnection connection = (HttpURLConnection) new URL(endpoint).openConnection();
        connection.setInstanceFollowRedirects(false);
        connection.setConnectTimeout(10000);
        connection.setReadTimeout(20000);
        connection.setRequestProperty("Cookie", playbackHeaders(cookie).get("Cookie"));
        connection.setRequestProperty("Accept-Encoding", "identity");
        String range = HttpUtil.buildRangeRequestHeader(position, length);
        if (range != null) connection.setRequestProperty("Range", range);
        try {
            int response = connection.getResponseCode();
            if (response != HttpURLConnection.HTTP_OK && response != HttpURLConnection.HTTP_PARTIAL)
                throw new IOException("无法读取播放文件，请返回影片详情重试。");
            return connection;
        } catch (IOException failed) {
            connection.disconnect();
            throw new IOException("无法读取播放文件，请返回影片详情重试。");
        }
    }

    private static final class SessionStreamDataSource extends BaseDataSource {
        private final String endpoint, cookie;
        private HttpURLConnection connection;
        private InputStream input;
        private long remaining;
        private boolean opened;

        SessionStreamDataSource(String endpoint, String cookie) { super(true); this.endpoint = endpoint; this.cookie = cookie; }

        @Override public long open(DataSpec spec) throws IOException {
            if (!endpoint.equals(spec.uri.toString())) throw new IOException("播放地址无效。");
            transferInitializing(spec);
            try {
                connection = openPlaybackConnection(endpoint, cookie, spec.position, spec.length);
                input = connection.getInputStream();
                long skipped = connection.getResponseCode() == HttpURLConnection.HTTP_OK ? spec.position : 0;
                long toSkip = skipped;
                while (toSkip > 0) {
                    long count = input.skip(toSkip);
                    if (count == 0) { if (input.read() == -1) throw new EOFException(); count = 1; }
                    toSkip -= count;
                }
                long contentLength = HttpUtil.getContentLength(connection.getHeaderField("Content-Length"), connection.getHeaderField("Content-Range"));
                remaining = spec.length != C.LENGTH_UNSET ? spec.length : contentLength == C.LENGTH_UNSET ? C.LENGTH_UNSET : Math.max(0, contentLength - skipped);
                opened = true;
                transferStarted(spec);
                return remaining;
            } catch (IOException failed) { close(); throw failed; }
        }

        @Override public int read(byte[] buffer, int offset, int length) throws IOException {
            if (length == 0) return 0;
            if (remaining == 0) return C.RESULT_END_OF_INPUT;
            int count = input.read(buffer, offset, remaining == C.LENGTH_UNSET ? length : (int) Math.min(length, remaining));
            if (count == -1) { if (remaining > 0) throw new EOFException(); return C.RESULT_END_OF_INPUT; }
            if (remaining != C.LENGTH_UNSET) remaining -= count;
            bytesTransferred(count);
            return count;
        }

        @Override public Uri getUri() { return connection == null ? null : Uri.parse(endpoint); }
        @Override public Map<String, List<String>> getResponseHeaders() { return connection == null ? Collections.emptyMap() : connection.getHeaderFields(); }
        @Override public void close() throws IOException {
            try { if (input != null) input.close(); }
            finally {
                input = null;
                if (connection != null) connection.disconnect();
                connection = null;
                if (opened) { opened = false; transferEnded(); }
            }
        }
    }

    private StateListDrawable controlBackground() {
        StateListDrawable states = new StateListDrawable();
        for (int state : new int[]{android.R.attr.state_focused, 0}) {
            GradientDrawable shape = new GradientDrawable();
            shape.setColor(0xff1b1d22);
            shape.setCornerRadius(7 * getResources().getDisplayMetrics().density);
            shape.setStroke(Math.round(2 * getResources().getDisplayMetrics().density), state == 0 ? 0xff383d47 : 0xff59cbe8);
            states.addState(state == 0 ? new int[]{} : new int[]{state}, shape);
        }
        return states;
    }

    private void showError(String message) {
        failed = true;
        releasePlayer();
        root.removeAllViews();
        LinearLayout content = new LinearLayout(this);
        content.setOrientation(LinearLayout.VERTICAL);
        content.setGravity(Gravity.CENTER_VERTICAL);
        int padding = Math.round(48 * getResources().getDisplayMetrics().density);
        content.setPadding(padding, padding, padding, padding);
        TextView title = new TextView(this);
        title.setText("无法播放");
        title.setTextSize(30);
        title.setTextColor(Color.WHITE);
        content.addView(title);
        TextView detail = new TextView(this);
        detail.setText(message);
        detail.setTextSize(20);
        detail.setTextColor(Color.LTGRAY);
        detail.setPadding(0, padding / 2, 0, padding / 2);
        content.addView(detail);
        Button back = new Button(this);
        back.setText("返回影片详情");
        back.setOnClickListener(view -> finish());
        content.addView(back, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT));
        root.addView(content, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        back.requestFocus();
    }

    @Override public boolean dispatchKeyEvent(KeyEvent event) {
        if (player != null && event.getAction() == KeyEvent.ACTION_DOWN) {
            int key = event.getKeyCode();
            if (key == KeyEvent.KEYCODE_DPAD_UP && playerView.hasFocus()) {
                playerView.showController();
                if (fileSelector == null) playbackBar.getChildAt(playbackBar.getChildCount() - 1).requestFocus();
                else fileSelector.requestFocus();
                return true;
            }
            if (key == KeyEvent.KEYCODE_DPAD_DOWN && playbackBar.hasFocus()) {
                playerView.requestFocus();
                playerView.showController();
                return true;
            }
            if (key == KeyEvent.KEYCODE_MEDIA_PLAY_PAUSE || key == KeyEvent.KEYCODE_MEDIA_PAUSE || key == KeyEvent.KEYCODE_MEDIA_PLAY) {
                if (event.getRepeatCount() == 0) {
                    if (key == KeyEvent.KEYCODE_MEDIA_PAUSE || (key == KeyEvent.KEYCODE_MEDIA_PLAY_PAUSE && player.getPlayWhenReady())) player.pause();
                    else player.play();
                    playerView.showController();
                }
                return true;
            }
            boolean hidden = playerView.hasFocus() && !playerView.isControllerFullyVisible();
            if (key == KeyEvent.KEYCODE_MEDIA_REWIND || (hidden && key == KeyEvent.KEYCODE_DPAD_LEFT)) {
                player.seekBack();
                playerView.showController();
                return true;
            }
            if (key == KeyEvent.KEYCODE_MEDIA_FAST_FORWARD || (hidden && key == KeyEvent.KEYCODE_DPAD_RIGHT)) {
                player.seekForward();
                playerView.showController();
                return true;
            }
        }
        return (playerView != null && playerView.hasFocus() && playerView.dispatchKeyEvent(event)) || super.dispatchKeyEvent(event);
    }

    private void releasePlayer() {
        if (player == null) return;
        MediaItem current = player.getCurrentMediaItem();
        if (current != null) fileIndex = Integer.parseInt(current.mediaId);
        position = player.getCurrentPosition();
        playWhenReady = player.getPlayWhenReady();
        if (playerView != null) playerView.setPlayer(null);
        player.release();
        player = null;
        playerView = null;
    }

    @Override protected void onPause() {
        if (Build.VERSION.SDK_INT < 24) { ++generation; releasePlayer(); }
        super.onPause();
    }

    @Override protected void onStop() {
        ++generation;
        releasePlayer();
        super.onStop();
    }

    @Override protected void onSaveInstanceState(Bundle state) {
        MediaItem current = player == null ? null : player.getCurrentMediaItem();
        state.putInt("file_index", current == null ? fileIndex : Integer.parseInt(current.mediaId));
        state.putLong("position", player == null ? position : player.getCurrentPosition());
        state.putBoolean("play", player == null ? playWhenReady : player.getPlayWhenReady());
        super.onSaveInstanceState(state);
    }

    @Override protected void onDestroy() {
        ++generation;
        releasePlayer();
        network.shutdownNow();
        super.onDestroy();
    }
}
