package com.javjaeger.tv;

import android.app.Activity;
import android.app.Instrumentation;
import android.content.Intent;
import android.os.Bundle;
import android.os.SystemClock;
import android.view.KeyEvent;
import android.view.MotionEvent;
import android.view.View;
import android.view.ViewGroup;
import android.view.WindowInsets;
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
            result.putString("stream", "PASS: local and session playback support remote seeking and pointer scrubbing, immediate 30-second steps, fast control hiding and fullscreen\n");
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
                    ready[0] = player.getPlaybackState() == Player.STATE_READY && activity.hasWindowFocus();
                });
                SystemClock.sleep(50);
            }
            check(ready[0], "Synthetic video must become ready");
            checkControlHiding(activity, view[0]);
            checkRemoteSeeking(activity, view[0]);
            runOnMainSync(() -> view[0].getPlayer().pause());
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
            runOnMainSync(() -> view[0].getPlayer().seekTo(45000));
            key(KeyEvent.KEYCODE_DPAD_RIGHT);
            assertPosition(view[0], 75000, "Right on the timeline must immediately advance 30 seconds");
            key(KeyEvent.KEYCODE_DPAD_LEFT);
            assertPosition(view[0], 45000, "Left on the timeline must immediately rewind 30 seconds");
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

    private void checkRemoteSeeking(Activity activity, PlayerView view) {
        onMain(() -> check(view.getPlayer().getDuration() >= 120000, "Seek fixture must last at least two minutes"));
        // Keep playback paused for exact position and key-down/key-up accounting.
        runOnMainSync(() -> {
            view.getPlayer().pause();
            view.getPlayer().seekTo(45000);
            ((PlayerControlView) activity.findViewById(androidx.media3.ui.R.id.exo_controller)).hideImmediately();
            view.requestFocus();
        });
        key(KeyEvent.KEYCODE_DPAD_RIGHT);
        assertPosition(view, 75000, "Right from fullscreen must immediately advance exactly 30 seconds");
        key(KeyEvent.KEYCODE_DPAD_LEFT);
        assertPosition(view, 45000, "Left must immediately rewind exactly 30 seconds");
        runOnMainSync(() -> view.getPlayer().seekTo(10000));
        key(KeyEvent.KEYCODE_DPAD_LEFT);
        assertPosition(view, 0, "Rewinding near the start must stop at zero");
        runOnMainSync(() -> view.getPlayer().seekTo(view.getPlayer().getDuration() - 10000));
        key(KeyEvent.KEYCODE_DPAD_RIGHT);
        onMain(() -> check(view.getPlayer().getCurrentPosition() == view.getPlayer().getDuration(),
                "Forward near the end must stop at the current file's duration"));
        onMain(() -> check(!view.getPlayer().getPlayWhenReady(), "Direction seeking must preserve pause state"));
        runOnMainSync(() -> {
            view.getPlayer().seekTo(10000);
            view.getPlayer().play();
            ((PlayerControlView) activity.findViewById(androidx.media3.ui.R.id.exo_controller)).hideImmediately();
            view.requestFocus();
        });
        key(KeyEvent.KEYCODE_DPAD_RIGHT);
        onMain(() -> {
            check(view.getPlayer().getCurrentPosition() >= 40000 && view.getPlayer().getCurrentPosition() < 42000,
                    "Playing fullscreen must advance one 30-second step");
            check(view.getPlayer().getPlayWhenReady(), "Direction seeking must preserve playback state");
            view.getPlayer().pause();
        });
    }

    private void assertPosition(PlayerView view, long expected, String message) {
        onMain(() -> check(view.getPlayer().getCurrentPosition() == expected,
                message + "; actual=" + view.getPlayer().getCurrentPosition()));
    }

    private void checkControlHiding(Activity activity, PlayerView view) {
        View top = findDescription(activity.getWindow().getDecorView(), "播放控制栏");
        View progress = activity.findViewById(androidx.media3.ui.R.id.exo_progress);
        awaitHidden(view, top, progress, "Starting playback must hide all controls within two seconds");
        key(KeyEvent.KEYCODE_DPAD_UP);
        onMain(() -> check(top.hasFocus() && top.isShown(), "Up must reveal and focus the top actions"));
        SystemClock.sleep(900);
        key(KeyEvent.KEYCODE_DPAD_RIGHT);
        SystemClock.sleep(900);
        onMain(() -> check(top.isShown() && progress.isShown(), "Remote activity must restart the hide timeout"));
        awaitHidden(view, top, progress, "Focused top actions must not keep controls visible indefinitely");
        onMain(() -> {
            check(view.hasFocus(), "Hidden controls must return focus to the player");
            if (android.os.Build.VERSION.SDK_INT >= 30) {
                WindowInsets insets = activity.getWindow().getDecorView().getRootWindowInsets();
                check(insets != null && !insets.isVisible(WindowInsets.Type.statusBars())
                        && !insets.isVisible(WindowInsets.Type.navigationBars()), "Playback must hide system bars");
            }
        });
        key(KeyEvent.KEYCODE_MEDIA_PAUSE);
        SystemClock.sleep(2100);
        onMain(() -> check(top.isShown() && progress.isShown(), "Paused controls must remain visible"));
        key(KeyEvent.KEYCODE_MEDIA_PLAY);
        awaitHidden(view, top, progress, "Resuming playback must hide controls within two seconds");
        key(KeyEvent.KEYCODE_DPAD_DOWN);
        onMain(() -> check(progress.hasFocus() && top.isShown(), "Down must restore controls and timeline focus"));
    }

    private void awaitHidden(PlayerView view, View top, View progress, String message) {
        long until = SystemClock.uptimeMillis() + 2100;
        boolean[] hidden = {false};
        while (!hidden[0] && SystemClock.uptimeMillis() < until) {
            runOnMainSync(() -> hidden[0] = !view.isControllerFullyVisible() && !top.isShown() && !progress.isShown());
            if (!hidden[0]) SystemClock.sleep(25);
        }
        check(hidden[0], message);
    }

    private View findDescription(View view, String description) {
        if (description.equals(view.getContentDescription())) return view;
        if (view instanceof ViewGroup) {
            ViewGroup group = (ViewGroup) view;
            for (int i = 0; i < group.getChildCount(); i++) {
                View found = findDescription(group.getChildAt(i), description);
                if (found != null) return found;
            }
        }
        return null;
    }

    private void key(int code) { sendKeyDownUpSync(code); waitForIdleSync(); }
    private void onMain(Runnable check) {
        AssertionError[] failure = new AssertionError[1];
        runOnMainSync(() -> { try { check.run(); } catch (AssertionError error) { failure[0] = error; } });
        if (failure[0] != null) throw failure[0];
    }
    private static void check(boolean value, String message) { if (!value) throw new AssertionError(message); }
}
