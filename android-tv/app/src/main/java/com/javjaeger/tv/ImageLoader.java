package com.javjaeger.tv;

import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.os.Handler;
import android.os.Looper;
import android.util.LruCache;
import android.widget.ImageView;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.concurrent.ArrayBlockingQueue;
import java.util.concurrent.ThreadPoolExecutor;
import java.util.concurrent.TimeUnit;

final class ImageLoader {
    private static final int MAX_BYTES = 8 * 1024 * 1024;
    private final Handler main = new Handler(Looper.getMainLooper());
    private final ThreadPoolExecutor workers = new ThreadPoolExecutor(2, 2, 0, TimeUnit.SECONDS,
            new ArrayBlockingQueue<>(128), new ThreadPoolExecutor.DiscardOldestPolicy());
    private final LruCache<String, Bitmap> cache = new LruCache<String, Bitmap>(12 * 1024 * 1024) {
        @Override protected int sizeOf(String key, Bitmap bitmap) { return bitmap.getAllocationByteCount(); }
    };
    private volatile boolean closed;

    void load(String posterUrl, ImageView image) {
        load(posterUrl, image, 640, 480);
    }

    void load(String posterUrl, ImageView image, int maxWidth, int maxHeight) {
        String key = posterUrl + "#" + maxWidth + "x" + maxHeight;
        image.setTag(key);
        Bitmap cached = cache.get(key);
        image.setImageBitmap(cached);
        image.requestLayout();
        if (closed || cached != null) return;
        workers.execute(() -> {
            Bitmap bitmap = fetch(posterUrl, maxWidth, maxHeight);
            if (closed || bitmap == null) return;
            cache.put(key, bitmap);
            main.post(() -> {
                if (!closed && key.equals(image.getTag())) {
                    image.setImageBitmap(bitmap);
                    image.requestLayout();
                }
            });
        });
    }

    private Bitmap fetch(String posterUrl, int maxWidth, int maxHeight) {
        HttpURLConnection connection = null;
        try {
            connection = (HttpURLConnection) new URL(posterUrl).openConnection();
            connection.setInstanceFollowRedirects(false);
            connection.setConnectTimeout(6000);
            connection.setReadTimeout(6000);
            if (connection.getResponseCode() != 200 || connection.getContentLength() > MAX_BYTES) return null;
            ByteArrayOutputStream bytes = new ByteArrayOutputStream();
            try (InputStream input = connection.getInputStream()) {
                byte[] buffer = new byte[8192];
                int count;
                while ((count = input.read(buffer)) != -1) {
                    if (bytes.size() + count > MAX_BYTES || closed || Thread.currentThread().isInterrupted()) return null;
                    bytes.write(buffer, 0, count);
                }
            }
            byte[] data = bytes.toByteArray();
            BitmapFactory.Options options = new BitmapFactory.Options();
            options.inJustDecodeBounds = true;
            BitmapFactory.decodeByteArray(data, 0, data.length, options);
            if (options.outWidth <= 0 || options.outHeight <= 0) return null;
            options.inSampleSize = 1;
            while (options.outWidth / options.inSampleSize > maxWidth || options.outHeight / options.inSampleSize > maxHeight) options.inSampleSize *= 2;
            options.inJustDecodeBounds = false;
            options.inPreferredConfig = Bitmap.Config.RGB_565;
            return BitmapFactory.decodeByteArray(data, 0, data.length, options);
        } catch (Exception unavailable) {
            return null;
        } finally {
            if (connection != null) connection.disconnect();
        }
    }

    void clearPending() { workers.getQueue().clear(); }

    void close() {
        closed = true;
        workers.shutdownNow();
        main.removeCallbacksAndMessages(null);
        cache.evictAll();
    }
}
