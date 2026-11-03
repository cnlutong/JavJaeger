package com.javjaeger.tv;

import android.content.Context;
import android.graphics.Matrix;
import android.graphics.drawable.Drawable;
import android.graphics.drawable.GradientDrawable;
import android.widget.FrameLayout;
import android.widget.ImageView;

final class CoverArt extends FrameLayout {
    private final ImageView image;
    private int fixedHeight;
    private boolean catalog;

    CoverArt(Context context) {
        super(context);
        GradientDrawable background = new GradientDrawable();
        background.setColor(TvTheme.SURFACE);
        background.setCornerRadius(8 * getResources().getDisplayMetrics().density);
        setBackground(background);
        setClipToOutline(true);
        image = new ImageView(context) {
            @Override public void setImageDrawable(Drawable drawable) {
                super.setImageDrawable(drawable);
                updateCrop();
            }
            @Override protected void onSizeChanged(int width, int height, int oldWidth, int oldHeight) {
                super.onSizeChanged(width, height, oldWidth, oldHeight);
                updateCrop();
            }
        };
        image.setScaleType(ImageView.ScaleType.FIT_CENTER);
        image.setImportantForAccessibility(IMPORTANT_FOR_ACCESSIBILITY_NO);
        addView(image, new FrameLayout.LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.MATCH_PARENT));
    }

    ImageView image() { return image; }
    void fixedHeight(int pixels) { fixedHeight = Math.max(0, pixels); requestLayout(); }
    void catalog() { catalog = true; image.setScaleType(ImageView.ScaleType.MATRIX); requestLayout(); }

    private void updateCrop() {
        if (!catalog || image == null || image.getDrawable() == null) return;
        Drawable drawable = image.getDrawable();
        float[] crop = frontCoverTransform(image.getWidth(), image.getHeight(),
                drawable.getIntrinsicWidth(), drawable.getIntrinsicHeight());
        Matrix matrix = new Matrix();
        matrix.setScale(crop[0], crop[0]);
        matrix.postTranslate(crop[1], crop[2]);
        image.setImageMatrix(matrix);
    }

    @Override protected void onMeasure(int widthSpec, int heightSpec) {
        int width = MeasureSpec.getSize(widthSpec);
        Drawable drawable = image.getDrawable();
        int imageWidth = drawable == null ? 0 : drawable.getIntrinsicWidth();
        int imageHeight = drawable == null ? 0 : drawable.getIntrinsicHeight();
        int heightLimit = MeasureSpec.getMode(heightSpec) == MeasureSpec.UNSPECIFIED ? -1 : MeasureSpec.getSize(heightSpec);
        int[] size = fitSize(width, fixedHeight, imageWidth, imageHeight, heightLimit, catalog);
        super.onMeasure(MeasureSpec.makeMeasureSpec(size[0], MeasureSpec.EXACTLY),
                MeasureSpec.makeMeasureSpec(size[1], MeasureSpec.EXACTLY));
    }

    static int scaledHeight(int width, int imageWidth, int imageHeight) {
        if (width <= 0) return 0;
        double ratio = imageWidth > 0 && imageHeight > 0 ? (double) imageHeight / imageWidth : 9.0 / 16;
        return (int) Math.min(Integer.MAX_VALUE, Math.max(1, Math.round(width * ratio)));
    }

    static int scaledWidth(int height, int imageWidth, int imageHeight) {
        return imageWidth > 0 && imageHeight > 0 ? scaledHeight(height, imageHeight, imageWidth) : scaledHeight(height, 9, 16);
    }

    static int[] fitSize(int width, int artHeight, int imageWidth, int imageHeight, int heightLimit) {
        return fitSize(width, artHeight, imageWidth, imageHeight, heightLimit, false);
    }

    static int[] fitSize(int width, int artHeight, int imageWidth, int imageHeight, int heightLimit, boolean catalog) {
        if (catalog) return new int[]{width, scaledHeight(width, 147, 200)};
        int height = artHeight > 0 ? artHeight : scaledHeight(width, imageWidth, imageHeight);
        if (artHeight > 0) width = scaledWidth(height, imageWidth, imageHeight);
        if (heightLimit >= 0 && height > heightLimit) {
            height = heightLimit;
            width = scaledWidth(height, imageWidth, imageHeight);
        }
        return new int[]{width, height};
    }

    static float[] frontCoverTransform(int width, int height, int imageWidth, int imageHeight) {
        if (width <= 0 || height <= 0 || imageWidth <= 0 || imageHeight <= 0) return new float[]{1, 0, 0};
        float scale = Math.max((float) width / imageWidth, (float) height / imageHeight);
        return new float[]{scale, width - imageWidth * scale, (height - imageHeight * scale) / 2};
    }
}
