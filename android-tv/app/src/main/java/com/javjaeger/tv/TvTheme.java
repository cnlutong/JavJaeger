package com.javjaeger.tv;

import android.content.Context;
import android.graphics.Color;
import android.graphics.drawable.Drawable;
import android.graphics.drawable.GradientDrawable;
import android.graphics.drawable.LayerDrawable;
import android.graphics.drawable.StateListDrawable;
import android.view.Gravity;

/** JavFeng's warm archive palette, shared by the native catalog and playback controls. */
final class TvTheme {
    static final int BG = 0xff10120f, SURFACE = 0xff1d201a, TEXT = 0xffeeeade;
    static final int DIM = 0xffa6aa9b, ACCENT = 0xffef8a63, LINE = 0xff383b31;
    static final int SELECTED = 0xff302b22, ON_ACCENT = 0xff191a13;
    private TvTheme() { }

    static int dp(Context context, int value) {
        return Math.round(value * context.getResources().getDisplayMetrics().density);
    }

    static GradientDrawable shape(Context context, int color, int stroke, int radius) {
        GradientDrawable shape = new GradientDrawable();
        shape.setColor(color);
        shape.setCornerRadius(dp(context, radius));
        if (stroke != 0) shape.setStroke(dp(context, 2), stroke);
        return shape;
    }

    static Drawable canvas() {
        return new GradientDrawable(GradientDrawable.Orientation.TL_BR,
                new int[]{0xff29271c, BG, 0xff182018});
    }

    static StateListDrawable control(Context context, int color) {
        StateListDrawable states = new StateListDrawable();
        states.addState(new int[]{-android.R.attr.state_enabled}, shape(context, SURFACE, LINE, 8));
        states.addState(new int[]{android.R.attr.state_focused},
                shape(context, color == ACCENT ? 0xffffb18e : SELECTED, ACCENT, 8));
        states.addState(new int[]{android.R.attr.state_pressed}, shape(context, SELECTED, ACCENT, 8));
        states.addState(new int[]{android.R.attr.state_selected}, shape(context, SELECTED, 0, 8));
        states.addState(new int[]{}, shape(context, color, color == Color.TRANSPARENT ? 0 : LINE, 8));
        return states;
    }

    static Drawable navigation(Context context) {
        StateListDrawable states = new StateListDrawable();
        states.addState(new int[]{android.R.attr.state_focused}, shape(context, SELECTED, ACCENT, 7));
        GradientDrawable underline = shape(context, ACCENT, 0, 0);
        LayerDrawable selected = new LayerDrawable(new Drawable[]{shape(context, Color.TRANSPARENT, 0, 0), underline});
        selected.setLayerHeight(1, dp(context, 2));
        selected.setLayerGravity(1, Gravity.BOTTOM);
        states.addState(new int[]{android.R.attr.state_selected}, selected);
        states.addState(new int[]{}, shape(context, Color.TRANSPARENT, 0, 0));
        return states;
    }
}
