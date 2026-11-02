# Android TV video fixtures

`test-pattern.mp4` is an eight-second synthetic silent video used by the playback
and automatic segment-switching workflow. `seek-pattern.mp4` repeats it to two
minutes so the isolated `--seek-only` workflow can measure actual 30-second seeks
and file boundaries. Neither contains real media or account data.

To regenerate the seek fixture from the repository root:

```bash
ffmpeg -stream_loop 14 -i tests/fixtures/android_tv/test-pattern.mp4 \
  -c copy -movflags +faststart tests/fixtures/android_tv/seek-pattern.mp4
```

The generated fixture is committed; running the tests does not require FFmpeg.
