package com.javjaeger.tv;

import android.app.Activity;
import android.app.Instrumentation;
import android.content.Intent;
import android.os.Bundle;
import android.os.SystemClock;
import android.view.KeyEvent;
import android.view.MotionEvent;
import android.view.View;
import androidx.media3.common.Player;
import androidx.media3.ui.PlayerView;
import androidx.media3.ui.PlayerControlView;

/** Runs against the smoke server's synthetic video, without accounts or a test library. */
@androidx.annotation.OptIn(markerClass = androidx.media3.common.util.UnstableApi.class)
public final class PlaybackSeekCheck extends Instrumentation {
    private String server;

    @Override public void onCreate(Bundle args) { super.onCreate(args); server = args.getString("server"); start(); }

    @Override public void onStart() {
        Bundle result = new Bundle();
        try {
            for (boolean online : new boolean[]{false, true}) checkPlayback(online);
            result.putString("stream", "PASS: local and session playback support remote seeking and pointer scrubbing\n");
            finish(Activity.RESULT_OK, result);
        } catch (Throwable failure) {
            result.putString("stream", "FAIL: " + failure + "\n");
            finish(Activity.RESULT_CANCELED, result);
        }
    }

    private void checkPlayback(boolean online) {
        Intent intent = new Intent(getTargetContext(), PlaybackActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                .putExtra("server", server).putExtra("movie_id", "TV-001").putExtra("file_index", 0);
        if (online) intent.putExtra("browse_job_id", "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa")
                .putExtra("session_cookie", "session=tv-session").putExtra("title", "在线播放定位测试");
        Activity activity = startActivitySync(intent);
        try {
            PlayerView[] view = new PlayerView[1];
            long until = SystemClock.uptimeMillis() + 20000;
            boolean[] ready = {false};
            while (!ready[0] && SystemClock.uptimeMillis() < until) {
                runOnMainSync(() -> {
                    View progress = activity.findViewById(androidx.media3.ui.R.id.exo_progress);
                    if (progress == null) return;
                    View parent = progress;
                    while (!(parent instanceof PlayerView) && parent.getParent() instanceof View) parent = (View) parent.getParent();
                    if (!(parent instanceof PlayerView)) return;
                    view[0] = (PlayerView) parent;
                    Player player = view[0].getPlayer();
                    player.pause();
                    ready[0] = player.getPlaybackState() == Player.STATE_READY && activity.hasWindowFocus();
                });
                SystemClock.sleep(50);
            }
            check(ready[0], "Synthetic video must become ready");
            View progress = activity.findViewById(androidx.media3.ui.R.id.exo_progress);
            // Real D-pad input leaves touch mode after the preceding pointer test.
            sendKeyDownUpSync(KeyEvent.KEYCODE_DPAD_DOWN);
            waitForIdleSync();
            onMain(() -> check(activity.findViewById(androidx.media3.ui.R.id.exo_play_pause).requestFocus(),
                    "Remote playback controls must accept focus; touch=" + progress.isInTouchMode()));
            key(KeyEvent.KEYCODE_DPAD_UP);
            onMain(() -> check(activity.getCurrentFocus() != null && !view[0].hasFocus(), "Up must reach the top playback actions"));
            key(KeyEvent.KEYCODE_DPAD_DOWN);
            onMain(() -> check(progress.hasFocus(), "Down from the top controls must focus the timeline; current="
                    + activity.getCurrentFocus() + ", enabled=" + progress.isEnabled() + ", shown=" + progress.isShown()));
            key(KeyEvent.KEYCODE_DPAD_RIGHT);
            key(KeyEvent.KEYCODE_DPAD_CENTER);
            onMain(() -> check(view[0].getPlayer().getCurrentPosition() > 1000, "Remote must commit a seek"));
            key(KeyEvent.KEYCODE_DPAD_LEFT);
            key(KeyEvent.KEYCODE_DPAD_CENTER);
            onMain(() -> check(view[0].getPlayer().getCurrentPosition() < 1000, "Remote must seek backwards"));
            int[] location = new int[2];
            runOnMainSync(() -> { view[0].showController(); progress.getLocationOnScreen(location); });
            long down = SystemClock.uptimeMillis();
            for (int step = 0; step <= 5; step++) {
                float x = location[0] + progress.getWidth() * (.2f + .1f * step);
                MotionEvent event = MotionEvent.obtain(down, SystemClock.uptimeMillis(), step == 0 ? MotionEvent.ACTION_DOWN
                        : step == 5 ? MotionEvent.ACTION_UP : MotionEvent.ACTION_MOVE, x, location[1] + progress.getHeight() / 2f, 0);
                sendPointerSync(event); event.recycle(); SystemClock.sleep(50);
            }
            onMain(() -> {
                Player player = view[0].getPlayer();
                check(player.getCurrentPosition() > player.getDuration() * .55 && player.getCurrentPosition() < player.getDuration() * .85,
                        "Dragging must commit the requested timeline position");
                check(!player.getPlayWhenReady(), "Seeking must preserve pause state");
            });
            sendKeyDownUpSync(KeyEvent.KEYCODE_DPAD_DOWN);
            runOnMainSync(() -> {
                ((PlayerControlView) activity.findViewById(androidx.media3.ui.R.id.exo_controller)).hideImmediately();
                view[0].requestFocus();
            });
            key(KeyEvent.KEYCODE_DPAD_DOWN);
            onMain(() -> check(progress.hasFocus(), "Down must reveal the hidden timeline and focus it"));
        } finally { runOnMainSync(activity::finish); }
    }

    private void key(int code) { sendKeyDownUpSync(code); waitForIdleSync(); }
    private void onMain(Runnable check) {
        AssertionError[] failure = new AssertionError[1];
        runOnMainSync(() -> { try { check.run(); } catch (AssertionError error) { failure[0] = error; } });
        if (failure[0] != null) throw failure[0];
    }
    private static void check(boolean value, String message) { if (!value) throw new AssertionError(message); }
}
