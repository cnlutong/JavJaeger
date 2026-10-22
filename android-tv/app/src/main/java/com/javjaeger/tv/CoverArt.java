package com.javjaeger.tv;

import android.content.Context;
import android.graphics.drawable.Drawable;
import android.graphics.drawable.GradientDrawable;
import android.widget.FrameLayout;
import android.widget.ImageView;

final class CoverArt extends FrameLayout {
    private final ImageView image;
    private int fixedHeight;

    CoverArt(Context context) {
        super(context);
        GradientDrawable background = new GradientDrawable();
        background.setColor(0xff1b1d22);
        background.setCornerRadius(8 * getResources().getDisplayMetrics().density);
        setBackground(background);
        setClipToOutline(true);
        image = new ImageView(context);
        image.setScaleType(ImageView.ScaleType.FIT_CENTER);
        image.setImportantForAccessibility(IMPORTANT_FOR_ACCESSIBILITY_NO);
        addView(image, new FrameLayout.LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.MATCH_PARENT));
    }

    ImageView image() { return image; }
    void fixedHeight(int pixels) { fixedHeight = Math.max(0, pixels); requestLayout(); }

    @Override protected void onMeasure(int widthSpec, int heightSpec) {
        int width = MeasureSpec.getSize(widthSpec);
        Drawable drawable = image.getDrawable();
        int imageWidth = drawable == null ? 0 : drawable.getIntrinsicWidth();
        int imageHeight = drawable == null ? 0 : drawable.getIntrinsicHeight();
        int heightLimit = MeasureSpec.getMode(heightSpec) == MeasureSpec.UNSPECIFIED ? -1 : MeasureSpec.getSize(heightSpec);
        int[] size = fitSize(width, fixedHeight, imageWidth, imageHeight, heightLimit);
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
        int height = artHeight > 0 ? artHeight : scaledHeight(width, imageWidth, imageHeight);
        if (artHeight > 0) width = scaledWidth(height, imageWidth, imageHeight);
        if (heightLimit >= 0 && height > heightLimit) {
            height = heightLimit;
            width = scaledWidth(height, imageWidth, imageHeight);
        }
        return new int[]{width, height};
    }
}
