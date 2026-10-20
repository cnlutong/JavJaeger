package com.javjaeger.tv;

import android.app.Activity;
import android.app.Dialog;
import android.content.Intent;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.graphics.drawable.StateListDrawable;
import android.os.Bundle;
import android.text.Editable;
import android.text.TextWatcher;
import android.text.TextUtils;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.view.Window;
import android.view.inputmethod.EditorInfo;
import android.view.inputmethod.InputMethodManager;
import android.widget.AbsListView;
import android.widget.BaseAdapter;
import android.widget.Button;
import android.widget.EditText;
import android.widget.GridView;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

public final class MainActivity extends Activity {
    private static final int BACKGROUND = Color.rgb(11, 13, 18);
    private static final int SURFACE = Color.rgb(23, 28, 39);
    private static final int TEXT = Color.rgb(243, 245, 248);
    private static final int MUTED = Color.rgb(169, 178, 195);
    private final ExecutorService network = Executors.newSingleThreadExecutor();
    private final List<Movie> movies = new ArrayList<>();
    private final List<Movie> visible = new ArrayList<>();
    private LibraryClient client;
    private ImageLoader images;
    private EditText search;
    private GridView grid;
    private TextView status;
    private Button refresh;
    private MovieAdapter adapter;
    private Dialog detailDialog;
    private String query = "";
    private String selectedId = "";
    private int libraryGeneration;
    private int detailGeneration;

    @Override public void onCreate(Bundle savedState) {
        super.onCreate(savedState);
        images = new ImageLoader();
        if (savedState != null) {
            query = savedState.getString("query", "");
            selectedId = savedState.getString("selected", "");
        }
        String server = getPreferences(MODE_PRIVATE).getString("server", "");
        if (server.isEmpty()) showServer(""); else connect(server, false);
    }

    private LinearLayout column() {
        LinearLayout view = new LinearLayout(this);
        view.setOrientation(LinearLayout.VERTICAL);
        return view;
    }

    private LinearLayout screen() {
        LinearLayout root = column();
        root.setBackgroundColor(BACKGROUND);
        root.setPadding(dp(40), dp(26), dp(40), dp(24));
        setContentView(root);
        return root;
    }

    private TextView text(String value, int size, int color) {
        TextView view = new TextView(this);
        view.setText(value);
        view.setTextSize(size);
        view.setTextColor(color);
        view.setPadding(0, dp(5), 0, dp(5));
        return view;
    }

    private Button button(String label) {
        Button button = new Button(this);
        button.setText(label);
        button.setTextSize(16);
        button.setAllCaps(false);
        button.setTextColor(TEXT);
        button.setPadding(dp(18), dp(8), dp(18), dp(8));
        button.setBackground(focusBackground());
        return button;
    }

    private EditText input(String description, String hint) {
        EditText input = new EditText(this);
        input.setContentDescription(description);
        input.setHint(hint);
        input.setTextColor(TEXT);
        input.setHintTextColor(MUTED);
        input.setTextSize(18);
        input.setSingleLine(true);
        input.setPadding(dp(16), dp(10), dp(16), dp(10));
        input.setBackground(focusBackground());
        return input;
    }

    private void showServer(String current) {
        ++libraryGeneration;
        LinearLayout root = screen();
        root.setGravity(Gravity.CENTER_VERTICAL);
        root.addView(text("JavJaeger · 电视影院", 34, TEXT));
        root.addView(text("连接现有 JavJaeger 服务器，浏览和播放本地影片库。", 18, MUTED));
        root.addView(text("服务器地址（HTTP / HTTPS）", 18, TEXT));
        EditText address = input("服务器地址", "http://192.168.1.10:8000");
        address.setInputType(android.text.InputType.TYPE_CLASS_TEXT | android.text.InputType.TYPE_TEXT_VARIATION_URI);
        address.setText(current);
        root.addView(address, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, dp(54)));
        TextView error = text("仅保存不含账号、密码或令牌的 HTTP / HTTPS 地址。", 16, MUTED);
        root.addView(error);
        Button connect = button("连接服务器");
        LinearLayout.LayoutParams action = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, dp(52));
        action.topMargin = dp(18);
        root.addView(connect, action);
        connect.setOnClickListener(view -> {
            try {
                String normalized = LibraryClient.normalizeServer(address.getText().toString());
                hideKeyboard(address);
                connect(normalized, true);
            } catch (IllegalArgumentException invalid) {
                error.setText("地址无效。请输入完整的 HTTP / HTTPS 地址，且不要包含账号、密码、查询参数或令牌。");
            }
        });
        connect.requestFocus();
    }

    private void connect(String address, boolean save) {
        try { client = new LibraryClient(address); }
        catch (IllegalArgumentException invalid) { showServer(""); return; }
        movies.clear();
        visible.clear();
        showLibrary();
        loadLibrary(save);
    }

    private void showLibrary() {
        LinearLayout root = screen();
        TextView heading = text("JavJaeger · 影院", 30, TEXT);
        heading.setTypeface(null, Typeface.BOLD);
        root.addView(heading);
        LinearLayout tools = new LinearLayout(this);
        tools.setGravity(Gravity.CENTER_VERTICAL);
        search = input("搜索影片", "搜索番号、标题或演员");
        search.setImeOptions(EditorInfo.IME_ACTION_SEARCH);
        search.setText(query);
        tools.addView(search, new LinearLayout.LayoutParams(0, dp(52), 1));
        Button find = button("搜索");
        refresh = button("刷新");
        Button server = button("更换服务器");
        for (Button action : new Button[]{find, refresh, server}) {
            LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, dp(52));
            params.leftMargin = dp(10);
            tools.addView(action, params);
        }
        root.addView(tools);
        status = text("正在读取影片库…", 16, MUTED);
        root.addView(status);
        grid = new GridView(this);
        grid.setContentDescription("影片库");
        grid.setNumColumns(GridView.AUTO_FIT);
        grid.setColumnWidth(dp(150));
        grid.setStretchMode(GridView.STRETCH_COLUMN_WIDTH);
        grid.setHorizontalSpacing(dp(14));
        grid.setVerticalSpacing(dp(14));
        grid.setClipToPadding(false);
        grid.setPadding(dp(4), dp(4), dp(4), dp(10));
        grid.setSelector(focusBackground(Color.TRANSPARENT));
        grid.setDrawSelectorOnTop(true);
        grid.setDescendantFocusability(ViewGroup.FOCUS_BLOCK_DESCENDANTS);
        adapter = new MovieAdapter();
        grid.setAdapter(adapter);
        root.addView(grid, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 0, 1));
        grid.setOnItemClickListener((parent, view, position, id) -> {
            selectedId = visible.get(position).id;
            showDetail(selectedId);
        });
        grid.setOnItemSelectedListener(new android.widget.AdapterView.OnItemSelectedListener() {
            @Override public void onItemSelected(android.widget.AdapterView<?> parent, View view, int position, long id) {
                if (position < visible.size()) selectedId = visible.get(position).id;
            }
            @Override public void onNothingSelected(android.widget.AdapterView<?> parent) { }
        });
        search.addTextChangedListener(new TextWatcher() {
            @Override public void beforeTextChanged(CharSequence s, int start, int count, int after) { }
            @Override public void onTextChanged(CharSequence s, int start, int before, int count) {
                query = s.toString();
                filter(false);
            }
            @Override public void afterTextChanged(Editable s) { }
        });
        find.setOnClickListener(view -> search());
        search.setOnEditorActionListener((view, action, event) -> {
            if (action == EditorInfo.IME_ACTION_SEARCH) { search(); return true; }
            return false;
        });
        refresh.setOnClickListener(view -> loadLibrary(false));
        server.setOnClickListener(view -> showServer(client.getBaseUrl()));
    }

    private void search() {
        hideKeyboard(search);
        filter(true);
    }

    private void loadLibrary(boolean save) {
        int generation = ++libraryGeneration;
        LibraryClient requestedClient = client;
        refresh.setEnabled(false);
        status.setText("正在读取影片库…");
        network.execute(() -> {
            try {
                List<Movie> loaded = requestedClient.loadMovies();
                runOnUiThread(() -> {
                    if (isDestroyed() || generation != libraryGeneration) return;
                    movies.clear();
                    movies.addAll(loaded);
                    if (save) getPreferences(MODE_PRIVATE).edit().putString("server", requestedClient.getBaseUrl()).apply();
                    refresh.setEnabled(true);
                    filter(true);
                });
            } catch (Exception unavailable) {
                runOnUiThread(() -> {
                    if (isDestroyed() || generation != libraryGeneration) return;
                    refresh.setEnabled(true);
                    status.setText("读取失败。请检查电视网络、服务器地址与服务状态，再选择刷新或更换服务器。");
                    refresh.requestFocus();
                });
            }
        });
    }

    private void filter(boolean focus) {
        visible.clear();
        for (Movie movie : movies) if (movie.matches(query)) visible.add(movie);
        adapter.notifyDataSetChanged();
        status.setText(movies.isEmpty() ? "影片库为空。请先在服务器管理界面添加路径并扫描影片。"
                : visible.isEmpty() ? "没有匹配的影片，请尝试其他关键词。" : visible.size() + " 部影片 · 方向键浏览，确定查看详情");
        if (focus && !visible.isEmpty()) restoreGridFocus();
    }

    private void restoreGridFocus() {
        grid.post(() -> {
            if (isDestroyed() || detailDialog != null || visible.isEmpty()) return;
            int position = 0;
            for (int i = 0; i < visible.size(); i++) if (visible.get(i).id.equals(selectedId)) { position = i; break; }
            grid.setSelection(position);
            grid.requestFocus();
        });
    }

    private void showDetail(String id) {
        final int generation = ++detailGeneration;
        Dialog dialog = new Dialog(this);
        dialog.requestWindowFeature(Window.FEATURE_NO_TITLE);
        LinearLayout body = column();
        body.setPadding(dp(28), dp(20), dp(28), dp(20));
        body.setBackgroundColor(BACKGROUND);
        body.addView(text("正在读取影片详情…", 24, TEXT));
        dialog.setContentView(body);
        detailDialog = dialog;
        dialog.setOnDismissListener(ignored -> {
            ++detailGeneration;
            if (detailDialog == dialog) detailDialog = null;
            restoreGridFocus();
        });
        dialog.show();
        dialog.getWindow().setLayout((int) (getResources().getDisplayMetrics().widthPixels * .94),
                (int) (getResources().getDisplayMetrics().heightPixels * .92));
        LibraryClient requestedClient = client;
        network.execute(() -> {
            try {
                Movie movie = requestedClient.loadMovie(id);
                runOnUiThread(() -> {
                    if (isDestroyed() || generation != detailGeneration || !dialog.isShowing()) return;
                    renderDetail(dialog, body, movie, requestedClient);
                });
            } catch (Exception unavailable) {
                runOnUiThread(() -> {
                    if (isDestroyed() || generation != detailGeneration || !dialog.isShowing()) return;
                    body.removeAllViews();
                    body.addView(text("无法读取详情，请检查网络或在服务器重新扫描影片库。", 22, TEXT));
                    Button back = button("返回影片库");
                    back.setOnClickListener(view -> dialog.dismiss());
                    body.addView(back);
                    back.requestFocus();
                });
            }
        });
    }

    private void renderDetail(Dialog dialog, LinearLayout body, Movie movie, LibraryClient requestedClient) {
        body.removeAllViews();
        LinearLayout top = new LinearLayout(this);
        TextView title = text(movie.id + " · " + movie.title, 27, TEXT);
        title.setTypeface(null, Typeface.BOLD);
        top.addView(title, new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1));
        Button back = button("返回影片库");
        back.setOnClickListener(view -> dialog.dismiss());
        top.addView(back);
        body.addView(top);
        LinearLayout content = new LinearLayout(this);
        ImageView poster = new ImageView(this);
        poster.setScaleType(ImageView.ScaleType.FIT_CENTER);
        poster.setContentDescription(movie.title + " 封面");
        content.addView(poster, new LinearLayout.LayoutParams(dp(210), dp(310)));
        images.load(requestedClient.posterUrl(movie), poster);
        ScrollView scroll = new ScrollView(this);
        LinearLayout info = column();
        info.setPadding(dp(26), 0, dp(6), dp(8));
        info.addView(text(join(movie.year, movie.quality), 18, MUTED));
        info.addView(text("演员：" + (movie.actors.isEmpty() ? "暂无资料" : TextUtils.join(" / ", movie.actors)), 18, TEXT));
        info.addView(text("标签：" + (movie.tags.isEmpty() ? "暂无资料" : TextUtils.join(" · ", movie.tags)), 17, MUTED));
        info.addView(text(movie.description.isEmpty() ? "暂无影片简介，可在服务器管理界面补全资料。" : movie.description, 18, TEXT));
        info.addView(text("选择播放文件", 22, TEXT));
        Button firstPlayable = null;
        for (Movie.VideoFile file : movie.files) {
            Button play = button("播放：" + file.label);
            play.setEnabled(!file.missing);
            play.setAlpha(file.missing ? .45f : 1f);
            play.setContentDescription("播放：" + file.label + (file.missing ? "（文件缺失）" : ""));
            LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
            params.topMargin = dp(8);
            info.addView(play, params);
            if (file.missing) info.addView(text("文件缺失，请在服务器检查或重新扫描。", 15, MUTED));
            else {
                if (firstPlayable == null) firstPlayable = play;
                play.setOnClickListener(view -> {
                    Intent intent = new Intent(this, PlaybackActivity.class);
                    intent.putExtra("server", requestedClient.getBaseUrl());
                    intent.putExtra("movie_id", movie.id);
                    intent.putExtra("file_index", file.index);
                    startActivity(intent);
                });
            }
        }
        if (firstPlayable == null) info.addView(text("没有可用的本地文件。", 18, MUTED));
        info.addView(text("多段影片会按原顺序播放并跳过缺失文件。返回键回到影片库。", 15, MUTED));
        scroll.addView(info);
        content.addView(scroll, new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.MATCH_PARENT, 1));
        body.addView(content, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 0, 1));
        if (firstPlayable != null) firstPlayable.requestFocus(); else back.requestFocus();
    }

    private static String join(String first, String second) {
        return first.isEmpty() ? second : second.isEmpty() ? first : first + " · " + second;
    }

    private StateListDrawable focusBackground() {
        return focusBackground(SURFACE);
    }

    private StateListDrawable focusBackground(int color) {
        StateListDrawable states = new StateListDrawable();
        for (int state : new int[]{android.R.attr.state_focused, android.R.attr.state_selected, android.R.attr.state_pressed, 0}) {
            GradientDrawable shape = new GradientDrawable();
            shape.setColor(color);
            shape.setCornerRadius(dp(8));
            if (state != 0) shape.setStroke(dp(3), Color.rgb(164, 212, 255));
            states.addState(state == 0 ? new int[]{} : new int[]{state}, shape);
        }
        return states;
    }

    private int dp(int value) { return Math.round(value * getResources().getDisplayMetrics().density); }

    private void hideKeyboard(View input) {
        ((InputMethodManager) getSystemService(INPUT_METHOD_SERVICE)).hideSoftInputFromWindow(input.getWindowToken(), 0);
    }

    @Override protected void onSaveInstanceState(Bundle state) {
        state.putString("query", query);
        state.putString("selected", selectedId);
        super.onSaveInstanceState(state);
    }

    @Override protected void onDestroy() {
        ++libraryGeneration;
        ++detailGeneration;
        if (detailDialog != null) detailDialog.dismiss();
        network.shutdownNow();
        images.close();
        super.onDestroy();
    }

    private final class MovieAdapter extends BaseAdapter {
        @Override public int getCount() { return visible.size(); }
        @Override public Movie getItem(int position) { return visible.get(position); }
        @Override public long getItemId(int position) { return position; }
        @Override public View getView(int position, View recycled, ViewGroup parent) {
            LinearLayout card;
            if (recycled == null) {
                card = column();
                card.setPadding(dp(6), dp(6), dp(6), dp(8));
                card.setBackgroundColor(SURFACE);
                card.setLayoutParams(new AbsListView.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, dp(260)));
                ImageView image = new ImageView(MainActivity.this);
                image.setScaleType(ImageView.ScaleType.CENTER_CROP);
                card.addView(image, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 0, 1));
                TextView title = text("", 16, TEXT);
                title.setMaxLines(2);
                title.setEllipsize(TextUtils.TruncateAt.END);
                card.addView(title);
                card.addView(text("", 13, MUTED));
            } else card = (LinearLayout) recycled;
            Movie movie = getItem(position);
            card.setContentDescription(movie.id + " " + movie.title);
            ((TextView) card.getChildAt(1)).setText(movie.title);
            ((TextView) card.getChildAt(2)).setText(join(movie.id, movie.quality));
            images.load(client.posterUrl(movie), (ImageView) card.getChildAt(0));
            return card;
        }
    }
}
