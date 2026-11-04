package com.javjaeger.tv;

import android.app.Activity;
import android.app.AlertDialog;
import android.app.Dialog;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.text.LineBreaker;
import android.graphics.drawable.GradientDrawable;
import android.graphics.drawable.StateListDrawable;
import android.net.Uri;
import android.os.Bundle;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.text.Editable;
import android.text.SpannableString;
import android.text.Spanned;
import android.text.TextUtils;
import android.text.TextWatcher;
import android.text.style.StyleSpan;
import android.view.Gravity;
import android.view.KeyEvent;
import android.view.View;
import android.view.ViewGroup;
import android.view.Window;
import android.view.inputmethod.EditorInfo;
import android.view.inputmethod.InputMethodManager;
import android.widget.AdapterView;
import android.widget.ArrayAdapter;
import android.widget.Button;
import android.widget.CheckBox;
import android.widget.EditText;
import android.widget.FrameLayout;
import android.widget.HorizontalScrollView;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.Spinner;
import android.widget.TextView;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import org.json.JSONObject;

public final class MainActivity extends Activity {
    private static final int BG = TvTheme.BG, SURFACE = TvTheme.SURFACE, TEXT = TvTheme.TEXT, DIM = TvTheme.DIM;
    private static final int ACCENT = TvTheme.ACCENT;
    private static final String[] TABS = {"推荐", "全部影片", "标签", "演员", "VR", "浏览新片"};
    private static final String[] SORTS = {"入库时间", "发行日期", "体积", "番号"};
    private static final String[] DIMENSIONS = {"actor", "studio", "res", "flag"};
    private static final String[] DIMENSION_NAMES = {"演员", "制作商", "分辨率", "标签"};
    private interface TextChanged { void accept(String value); }
    private interface PageChanged { void accept(int index); }
    private final ExecutorService network = Executors.newFixedThreadPool(2);
    private final Map<String, LinkedHashSet<String>> filters = new LinkedHashMap<>();
    private final Map<String, Button> tabButtons = new LinkedHashMap<>();
    private LibraryClient client;
    private CinemaLibrary library = new CinemaLibrary(Collections.emptyList());
    private ImageLoader images;
    private LinearLayout shell;
    private FrameLayout content;
    private View lastMovieCard;
    private EditText search;
    private TextView badge;
    private Button refresh;
    private ScrollView wallScroll;
    private final Map<String, View> wallCards = new LinkedHashMap<>();
    private Dialog detailDialog;
    private String tab = "推荐", query = "", actor = "", tagQuery = "", sort = SORTS[0];
    private String selectedId = "", deployment = "版本未知 · 更新时间未记录";
    private String homeCollection = "最近入库", vrCollection = "";
    private String pendingFocus = "";
    private boolean tagResults, allTags, loading, changingSearch, serverScreen;
    private int wallPage, tagPage, actorPage, shelfPage, libraryGeneration, detailGeneration;
    private final Handler handler = new Handler(Looper.getMainLooper());
    private final List<LibraryClient.BrowseFilter> browseFilters = new ArrayList<>();
    private final List<Movie> browseMovies = new ArrayList<>();
    private String browseKind = "normal", browseError = "", playJobId = "", playMovieId = "", playTitle = "";
    private boolean browseLoaded, browseLoading, startingPlay;
    private int browseNext = 1, browsePage, browseGeneration, playGeneration;
    private Dialog playDialog;
    private LinearLayout playBody;

    @Override public void onCreate(Bundle saved) {
        super.onCreate(saved); images = new ImageLoader();
        if (Build.VERSION.SDK_INT >= 33) getOnBackInvokedDispatcher().registerOnBackInvokedCallback(android.window.OnBackInvokedDispatcher.PRIORITY_DEFAULT, this::back);
        for (String key : DIMENSIONS) filters.put(key, new LinkedHashSet<>());
        if (saved != null) {
            tab = saved.getString("tab", tab); query = saved.getString("query", ""); actor = saved.getString("actor", "");
            tagQuery = saved.getString("tag_query", ""); sort = saved.getString("sort", sort); selectedId = saved.getString("selected", "");
            pendingFocus = saved.getString("focus", "");
            homeCollection = saved.getString("home_collection", homeCollection); vrCollection = saved.getString("vr_collection", vrCollection);
            tagResults = saved.getBoolean("tag_results"); allTags = saved.getBoolean("all_tags"); wallPage = saved.getInt("wall_page"); tagPage = saved.getInt("tag_page"); actorPage = saved.getInt("actor_page"); shelfPage = saved.getInt("shelf_page");
            for (String key : DIMENSIONS) { ArrayList<String> values = saved.getStringArrayList("filter_" + key); if (values != null) filters.get(key).addAll(values); }
        }
        String server = getPreferences(MODE_PRIVATE).getString("server", ""); if (server.isEmpty()) showServer(""); else connect(server, false);
    }

    private int dp(int value) { return Math.round(value * getResources().getDisplayMetrics().density); }
    private LinearLayout column() { LinearLayout view = new LinearLayout(this); view.setOrientation(LinearLayout.VERTICAL); return view; }
    private LinearLayout row() { LinearLayout view = new LinearLayout(this); view.setGravity(Gravity.CENTER_VERTICAL); return view; }
    private TextView text(String value, int size, int color) { TextView view = new TextView(this); view.setText(value); view.setTextSize(size); view.setTextColor(color); view.setPadding(0, dp(3), 0, dp(3)); return view; }
    private TextView heading(String value, int size) { TextView view = text(value, size, TEXT); view.setTypeface(Typeface.create("serif", Typeface.NORMAL)); view.setBreakStrategy(LineBreaker.BREAK_STRATEGY_BALANCED); return view; }
    private GradientDrawable shape(int color, int stroke, boolean round) { return TvTheme.shape(this, color, stroke, round ? 80 : 10); }
    private StateListDrawable focus(int color) { return TvTheme.control(this, color); }
    private Button button(String label, Runnable action) {
        Button button = new Button(this); button.setText(label); button.setTextSize(15); button.setAllCaps(false); button.setTextColor(TEXT);
        button.setMaxLines(1); button.setEllipsize(TextUtils.TruncateAt.END); button.setMinWidth(dp(48)); button.setMinimumWidth(dp(48)); button.setMinHeight(dp(44)); button.setMinimumHeight(dp(44)); button.setPadding(dp(14), dp(5), dp(14), dp(5)); button.setBackground(focus(SURFACE)); button.setOnClickListener(view -> action.run()); return button;
    }
    private Button primary(String label, Runnable action) { Button view = button(label, action); view.setBackground(focus(ACCENT)); view.setTextColor(new android.content.res.ColorStateList(new int[][]{new int[]{-android.R.attr.state_enabled}, new int[]{}}, new int[]{DIM, TvTheme.ON_ACCENT})); return view; }
    private void chosen(Button view, boolean selected) { view.setSelected(selected); view.setTextColor(selected ? ACCENT : TEXT); }
    private EditText input(String description, String hint) {
        EditText input = new EditText(this); input.setContentDescription(description); input.setHint(hint); input.setTextColor(TEXT); input.setHintTextColor(DIM); input.setTextSize(16); input.setSingleLine(true); input.setPadding(dp(13), dp(6), dp(13), dp(6)); input.setBackground(focus(SURFACE)); return input;
    }
    private void watch(EditText input, TextChanged changed) { input.addTextChangedListener(new TextWatcher() {
        @Override public void beforeTextChanged(CharSequence s, int start, int count, int after) { }
        @Override public void onTextChanged(CharSequence s, int start, int before, int count) { changed.accept(s.toString()); }
        @Override public void afterTextChanged(Editable s) { }
    }); }
    private void hideKeyboard(View input) { ((InputMethodManager) getSystemService(INPUT_METHOD_SERVICE)).hideSoftInputFromWindow(input.getWindowToken(), 0); }
    private void gap(LinearLayout parent, int size) { parent.addView(new View(this), new LinearLayout.LayoutParams(dp(size), dp(size))); }
    private ScrollView scroller(LinearLayout body) { ScrollView scroll = new ScrollView(this); scroll.setVerticalScrollBarEnabled(false); scroll.setClipToPadding(false); scroll.addView(body); return scroll; }
    private void completeRow(LinearLayout line, int count) {
        if (line == null) return;
        while (line.getChildCount() < count) {
            LinearLayout.LayoutParams params = new LinearLayout.LayoutParams((LinearLayout.LayoutParams) line.getChildAt(0).getLayoutParams()); params.height = 1;
            line.addView(new View(this), params);
        }
    }

    private void showServer(String current) {
        ++libraryGeneration; serverScreen = true; FrameLayout canvas = new FrameLayout(this); canvas.setBackground(TvTheme.canvas()); setContentView(canvas); LinearLayout root = column(); root.setPadding(dp(28), dp(24), dp(28), dp(24)); root.setBackground(shape(BG, TvTheme.LINE, false)); canvas.addView(root, new FrameLayout.LayoutParams(dp(640), -2, Gravity.CENTER));
        TextView brand = heading("JavJaeger.", 25); brand.setTextColor(ACCENT); root.addView(brand); gap(root, 12);
        root.addView(heading("连接你的影视库", 32)); root.addView(text("从熟悉的封面开始，浏览与播放你的收藏。", 17, DIM)); gap(root, 16); root.addView(text("服务器地址（HTTP / HTTPS）", 15, TEXT));
        EditText address = input("服务器地址", "http://192.168.1.10:8000"); address.setInputType(android.text.InputType.TYPE_CLASS_TEXT | android.text.InputType.TYPE_TEXT_VARIATION_URI); address.setText(current); root.addView(address, new LinearLayout.LayoutParams(-1, dp(52)));
        TextView error = text("仅保存不含账号、密码或令牌的服务器地址。", 16, DIM); root.addView(error);
        Button connect = primary("连接服务器", () -> {
            try { String normalized = LibraryClient.normalizeServer(address.getText().toString()); hideKeyboard(address); connect(normalized, true); }
            catch (IllegalArgumentException invalid) { error.setText("地址无效，请输入完整 HTTP / HTTPS 地址，不要包含账号、密码、查询参数或令牌。"); }
        }); root.addView(connect); connect.requestFocus();
        if (!current.isEmpty()) root.addView(button("返回影院", () -> { createShell(); render(false); }));
    }
    private void present(Dialog dialog) {
        dialog.show(); Window window = dialog.getWindow(); window.setBackgroundDrawable(shape(BG, TvTheme.LINE, false));
        window.setDimAmount(.82f); window.getDecorView().setClipToOutline(true);
    }
    private void connect(String server, boolean save) {
        try { client = new LibraryClient(server); } catch (IllegalArgumentException invalid) { showServer(""); return; }
        ++browseGeneration; ++playGeneration; handler.removeCallbacksAndMessages(null); browseMovies.clear(); browseFilters.clear(); browseLoaded = browseLoading = startingPlay = false; browseNext = 1; browsePage = 0; browseKind = "normal"; playJobId = playMovieId = playTitle = ""; if (playDialog != null) playDialog.dismiss(); if (detailDialog != null) detailDialog.dismiss();
        library = new CinemaLibrary(Collections.emptyList()); createShell(); loadLibrary(save); if (tab.equals("浏览新片")) loadBrowse(true);
    }
    private void createShell() {
        serverScreen = false; shell = column(); shell.setBackground(TvTheme.canvas()); setContentView(shell);
        LinearLayout nav = row(); nav.setContentDescription("影院导航"); nav.setPadding(dp(20), dp(2), dp(20), dp(2)); nav.setBackgroundColor(0xe610120f);
        SpannableString nameplate = new SpannableString("JavJaeger."); nameplate.setSpan(new StyleSpan(Typeface.ITALIC), 3, 9, Spanned.SPAN_EXCLUSIVE_EXCLUSIVE);
        TextView brand = text("", 20, ACCENT); brand.setTextSize(android.util.TypedValue.COMPLEX_UNIT_DIP, 20); brand.setTypeface(Typeface.create("serif", Typeface.BOLD)); brand.setText(nameplate); brand.setSingleLine(true); nav.addView(brand, new LinearLayout.LayoutParams(dp(104), -2));
        LinearLayout tabs = row(); tabButtons.clear();
        for (String name : TABS) {
            Button item = button(name, () -> navigate(name)); item.setContentDescription(name); item.setTextSize(14); item.setPadding(dp(8), 0, dp(8), 0); item.setMinWidth(0); item.setMinimumWidth(0); item.setBackground(TvTheme.navigation(this));
            tabButtons.put(name, item); tabs.addView(item, new LinearLayout.LayoutParams(0, dp(44), 1));
        }
        nav.addView(tabs, new LinearLayout.LayoutParams(0, -1, 1)); gap(nav, 12);
        Button find = button("搜索", this::showSearch); find.setContentDescription("打开搜索"); nav.addView(find, new LinearLayout.LayoutParams(dp(80), dp(44))); gap(nav, 8);
        Button more = button("更多", this::showTools); more.setContentDescription("影院更多选项"); nav.addView(more, new LinearLayout.LayoutParams(dp(80), dp(44)));
        shell.addView(nav, new LinearLayout.LayoutParams(-1, dp(48)));
        View divider = new View(this); divider.setBackgroundColor(TvTheme.LINE); shell.addView(divider, new LinearLayout.LayoutParams(-1, dp(1)));
        content = new FrameLayout(this); shell.addView(content, new LinearLayout.LayoutParams(-1, 0, 1));
        // Detached controls retain the existing query and refresh workflow between dialogs.
        search = input("搜索影片", "搜索影片、番号、演员"); search.setText(query); badge = text(deployment, 13, DIM); refresh = button("刷新", () -> loadLibrary(false));
    }
    private void showSearch() {
        Dialog dialog = new Dialog(this); dialog.requestWindowFeature(Window.FEATURE_NO_TITLE); LinearLayout body = paddedColumn(); body.setBackgroundColor(BG); body.addView(heading("搜索本地收藏", 24));
        search = input("搜索影片", "搜索影片、番号、演员"); search.setImeOptions(EditorInfo.IME_ACTION_SEARCH); search.setText(query); body.addView(search, new LinearLayout.LayoutParams(-1, dp(48)));
        Runnable submit = () -> { query = search.getText().toString(); tab = "全部影片"; actor = ""; tagResults = false; wallPage = 0; hideKeyboard(search); dialog.dismiss(); render(true); };
        LinearLayout actions = row(); actions.addView(primary("搜索", submit)); gap(actions, 10); actions.addView(button("清空影院搜索", () -> search.setText(""))); gap(actions, 10); actions.addView(button("关闭", dialog::dismiss)); body.addView(actions);
        search.setOnEditorActionListener((view, action, event) -> { if (action != EditorInfo.IME_ACTION_SEARCH) return false; submit.run(); return true; });
        dialog.setContentView(body); present(dialog); dialog.getWindow().setLayout(dp(640), -2); actions.getChildAt(0).requestFocus();
    }
    private void showTools() {
        Dialog dialog = new Dialog(this); dialog.requestWindowFeature(Window.FEATURE_NO_TITLE); LinearLayout body = paddedColumn(); body.setBackgroundColor(BG); body.addView(heading("影院选项", 24)); body.addView(text(deployment, 14, DIM));
        body.addView(button("刷新影片", () -> { dialog.dismiss(); if (tab.equals("浏览新片")) loadBrowse(true); else loadLibrary(false); }));
        if (!playJobId.isEmpty()) body.addView(button("115 播放准备", () -> { dialog.dismiss(); resumePlayJob(); }));
        body.addView(button("管理界面", () -> { dialog.dismiss(); openManagement(""); })); body.addView(button("更换服务器", () -> { dialog.dismiss(); showServer(client.getBaseUrl()); })); body.addView(button("关闭", dialog::dismiss));
        dialog.setContentView(body); present(dialog); dialog.getWindow().setLayout(dp(480), -2);
    }
    private void navigate(String name) { tab = name; actor = ""; tagResults = false; query = ""; wallPage = 0; shelfPage = 0; setSearchText(""); hideKeyboard(search); if (name.equals("浏览新片") && !browseLoaded && !browseLoading) loadBrowse(true); else render(false); tabButtons.get(name).requestFocus(); }
    private void loadLibrary(boolean save) {
        final int generation = ++libraryGeneration; final LibraryClient requested = client; loading = true; refresh.setEnabled(false); render(false);
        network.execute(() -> {
            try {
                List<Movie> movies = requested.loadMovies();
                runOnUiThread(() -> { if (isDestroyed() || generation != libraryGeneration) return; library = new CinemaLibrary(movies); loading = false; refresh.setEnabled(true); if (save) getPreferences(MODE_PRIVATE).edit().putString("server", requested.getBaseUrl()).apply(); render(false); if (!pendingFocus.isEmpty()) { String key = pendingFocus; pendingFocus = ""; restoreFocus(key); } });
                List<CinemaLibrary.Actor> actors; try { actors = requested.loadActors(); } catch (Exception absent) { actors = Collections.emptyList(); }
                String version; try { version = requested.deploymentLabel(); } catch (Exception absent) { version = "版本未知 · 更新时间未记录"; }
                final List<CinemaLibrary.Actor> loadedActors = actors; final String loadedVersion = version;
                runOnUiThread(() -> { if (isDestroyed() || generation != libraryGeneration) return; library = new CinemaLibrary(movies, loadedActors); deployment = loadedVersion; badge.setText(deployment.replace(" · ", "\n")); if (tab.equals("演员") && actor.isEmpty()) render(false); });
            } catch (Exception unavailable) { runOnUiThread(() -> {
                if (isDestroyed() || generation != libraryGeneration) return; loading = false; refresh.setEnabled(true); LinearLayout message = paddedColumn(); message.addView(heading("读取影片库失败", 26)); message.addView(text("请检查电视网络、服务器地址与服务状态，再选择刷新或更换服务器。", 18, DIM)); message.addView(button("更换服务器", () -> showServer(client.getBaseUrl()))); content.removeAllViews(); content.addView(message);
            }); }
        });
    }
    private LinearLayout paddedColumn() { LinearLayout body = column(); body.setPadding(dp(32), dp(12), dp(32), dp(24)); return body; }
    private LinearLayout catalogBody() { LinearLayout body = column(); body.setPadding(dp(20), 0, dp(20), 0); return body; }
    private void render(boolean focusMovies) {
        String previousFocus = focusKey(getCurrentFocus());
        images.clearPending(); wallScroll = null; lastMovieCard = null; wallCards.clear(); content.removeAllViews(); for (String name : TABS) { chosen(tabButtons.get(name), name.equals(tab)); tabButtons.get(name).setNextFocusDownId(View.NO_ID); }
        if (!focusMovies && !previousFocus.isEmpty()) restoreFocus(previousFocus);
        if (tab.equals("浏览新片")) { renderBrowse(focusMovies); return; }
        if (loading && library.movies.isEmpty()) { LinearLayout body = paddedColumn(); body.addView(heading("正在读取影视库…", 25)); content.addView(body); return; }
        if (library.movies.isEmpty()) { LinearLayout body = paddedColumn(); body.addView(heading("开始建立你的影院", 28)); body.addView(text("添加媒体路径并扫描入库后，即可在这里浏览和播放。", 18, DIM)); body.addView(button("配置影视库", () -> openManagement(""))); content.addView(body); return; }
        if (tab.equals("推荐")) renderCollections(library.homeShelves(), true, focusMovies);
        else if (tab.equals("VR")) renderCollections(library.vrShelves(), false, focusMovies);
        else if (tab.equals("演员") && actor.isEmpty()) renderActors();
        else if (tab.equals("标签") && !tagResults) renderTags(); else renderWall(focusMovies);
    }
    private void renderCollections(List<CinemaLibrary.Shelf> shelves, boolean home, boolean focusMovies) {
        LinearLayout body = catalogBody(); content.addView(body);
        if (shelves.isEmpty()) { body.addView(heading("暂无 VR 影片", 25)); body.addView(text("扫描或补全影片资料后，在这里浏览你的收藏。", 17, DIM)); body.addView(button("浏览全部影片", () -> navigate("全部影片"))); return; }
        String selected = home ? homeCollection : vrCollection; CinemaLibrary.Shelf current = shelves.get(0);
        for (CinemaLibrary.Shelf shelf : shelves) if (shelf.name.equals(selected)) current = shelf;
        if (home) homeCollection = current.name; else vrCollection = current.name;
        LinearLayout toolbar = row(); HorizontalScrollView choices = new HorizontalScrollView(this); choices.setHorizontalScrollBarEnabled(false); choices.setFocusable(false); LinearLayout options = row();
        for (CinemaLibrary.Shelf shelf : shelves) {
            Button option = button(shelf.name, () -> { if (home) homeCollection = shelf.name; else vrCollection = shelf.name; shelfPage = 0; selectedId = ""; render(false); });
            option.setTextSize(14); option.setPadding(dp(10), 0, dp(10), 0); option.setContentDescription("片单：" + shelf.name); chosen(option, shelf == current); options.addView(option, new LinearLayout.LayoutParams(-2, dp(44))); gap(options, 6);
        }
        choices.addView(options); toolbar.addView(choices, new LinearLayout.LayoutParams(0, dp(44), 1));
        CinemaLibrary.Page<Movie> page = CinemaLibrary.page(current.movies, shelfPage, 60); shelfPage = page.index;
        if (page.pages <= 1) toolbar.addView(text(page.total + " 部", 13, DIM));
        addPager(toolbar, page, next -> { shelfPage = next; selectedId = ""; render(true); }, true);
        body.addView(toolbar, new LinearLayout.LayoutParams(-1, dp(44))); addMovieGrid(body, page.items, focusMovies);
    }
    private void renderTags() {
        LinearLayout body = paddedColumn(); body.addView(heading("标签", 27)); LinearLayout tools = row(); EditText optionQuery = input("搜索标签", "搜索标签"); optionQuery.setText(tagQuery); tools.addView(optionQuery, new LinearLayout.LayoutParams(0, dp(44), 1));
        gap(tools, 10); tools.addView(primary("查看影片", () -> { tagResults = true; wallPage = 0; hideKeyboard(optionQuery); render(true); })); gap(tools, 10); tools.addView(button("清空标签选择", () -> { filters.get("flag").clear(); tagQuery = ""; allTags = false; tagPage = 0; render(false); })); body.addView(tools);
        LinearLayout modes = row(); Button any = button("匹配任一标签", () -> { allTags = false; render(false); }); Button every = button("匹配全部标签", () -> { allTags = true; render(false); }); chosen(any, !allTags); chosen(every, allTags); modes.addView(any); gap(modes, 10); modes.addView(every); body.addView(modes);
        LinearLayout directory = column(); body.addView(directory); renderTagDirectory(directory); watch(optionQuery, value -> { tagQuery = value; tagPage = 0; renderTagDirectory(directory); }); content.addView(scroller(body));
    }
    private void renderTagDirectory(LinearLayout directory) {
        directory.removeAllViews(); Map<String, Integer> counts = library.facetCounts("flag", "", tagQuery); CinemaLibrary.Page<Map.Entry<String, Integer>> page = CinemaLibrary.page(new ArrayList<>(counts.entrySet()), tagPage, 60); tagPage = page.index;
        directory.addView(text(counts.size() + " 个标签 · 已选 " + filters.get("flag").size() + " 个", 14, DIM)); LinearLayout line = null; int index = 0;
        for (Map.Entry<String, Integer> item : page.items) {
            if (index++ % 4 == 0) { line = row(); directory.addView(line); } String name = item.getKey();
            Button option = button(name + "  " + item.getValue(), () -> { toggle("flag", name); renderTagDirectory(directory); View updated = directory.findViewWithTag(name); if (updated != null) updated.requestFocus(); }); option.setTag(name); option.setContentDescription("选择标签：" + name); chosen(option, filters.get("flag").contains(name));
            LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(0, dp(50), 1); params.setMargins(dp(3), dp(4), dp(3), dp(4)); line.addView(option, params);
        }
        completeRow(line, 4);
        if (page.items.isEmpty()) directory.addView(text("没有匹配选项", 18, DIM)); addPager(directory, page, next -> { tagPage = next; renderTagDirectory(directory); });
    }
    private FrameLayout actorPhoto(String name, String address, int size) {
        FrameLayout avatar = new FrameLayout(this); avatar.setBackground(shape(SURFACE, 0, true)); avatar.setClipToOutline(true);
        TextView initial = text(name.isEmpty() ? "?" : name.substring(0, 1), size / 3, DIM); initial.setGravity(Gravity.CENTER); initial.setImportantForAccessibility(View.IMPORTANT_FOR_ACCESSIBILITY_NO); avatar.addView(initial, new FrameLayout.LayoutParams(-1, -1));
        ImageView image = new ImageView(this); image.setContentDescription("演员照片：" + name); image.setImportantForAccessibility(View.IMPORTANT_FOR_ACCESSIBILITY_YES); image.setScaleType(ImageView.ScaleType.CENTER_CROP); avatar.addView(image, new FrameLayout.LayoutParams(-1, -1));
        if (!address.isEmpty()) images.load(address, image, 256, 256); return avatar;
    }
    private LinearLayout actorCard(String name, String address, String subtitle, Runnable action) {
        LinearLayout card = column(); card.setGravity(Gravity.CENTER_HORIZONTAL); card.setPadding(dp(6), dp(8), dp(6), dp(8)); card.setBackground(focus(Color.TRANSPARENT)); card.setFocusable(true); card.setContentDescription(name); card.setOnClickListener(view -> action.run());
        card.addView(actorPhoto(name, address, 104), new LinearLayout.LayoutParams(dp(104), dp(104)));
        TextView label = text(name, 16, TEXT); label.setMaxLines(1); label.setEllipsize(TextUtils.TruncateAt.END); label.setGravity(Gravity.CENTER); card.addView(label, new LinearLayout.LayoutParams(-1, -2));
        if (!subtitle.isEmpty()) { TextView count = text(subtitle, 14, DIM); count.setGravity(Gravity.CENTER); card.addView(count, new LinearLayout.LayoutParams(-1, -2)); } return card;
    }
    private LinearLayout actorButton(String name, String address, Runnable action) {
        LinearLayout option = row(); option.setPadding(dp(8), dp(6), dp(12), dp(6)); option.setBackground(focus(SURFACE)); option.setFocusable(true); option.setOnClickListener(view -> action.run());
        option.addView(actorPhoto(name, address, 40), new LinearLayout.LayoutParams(dp(40), dp(40))); gap(option, 12);
        TextView label = text(name, 16, TEXT); label.setMaxLines(1); label.setEllipsize(TextUtils.TruncateAt.END); option.addView(label, new LinearLayout.LayoutParams(0, -2, 1)); return option;
    }
    private void renderActors() {
        LinearLayout body = paddedColumn(); body.addView(heading("演员", 27)); List<CinemaLibrary.Actor> actors = library.actors(); body.addView(text(actors.size() + " 位本地演员", 14, DIM)); CinemaLibrary.Page<CinemaLibrary.Actor> page = CinemaLibrary.page(actors, actorPage, 60); actorPage = page.index;
        LinearLayout line = null; int index = 0;
        for (CinemaLibrary.Actor item : page.items) {
            if (index++ % 6 == 0) { line = row(); line.setGravity(Gravity.TOP); body.addView(line); }
            LinearLayout card = actorCard(item.name, client.actorAvatarUrl(item), item.count + " 部", () -> { actor = item.name; clearFilters(); wallPage = 0; render(true); }); card.setContentDescription("查看演员：" + item.name);
            LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(0, dp(176), 1); params.setMargins(dp(5), dp(4), dp(5), dp(8)); line.addView(card, params);
        }
        completeRow(line, 6);
        if (actors.isEmpty()) { body.addView(heading("暂无演员信息", 24)); body.addView(text("补全影片资料后，演员会出现在这里。", 17, DIM)); }
        addPager(body, page, next -> { actorPage = next; render(false); }); content.addView(scroller(body));
    }
    private void renderWall(boolean focusMovies) {
        LinearLayout body = catalogBody(); content.addView(body);
        List<Movie> matches = library.browse(query, actor, filters, sort, allTags); CinemaLibrary.Page<Movie> page = CinemaLibrary.page(matches, wallPage, 60); wallPage = page.index;
        LinearLayout titleRow = row(); Button directory = null;
        if (!actor.isEmpty()) directory = button("全部演员", () -> { actor = ""; clearFilters(); render(false); });
        else if (tab.equals("标签") && tagResults) directory = button("全部标签", () -> { tagResults = false; render(false); });
        String title = !actor.isEmpty() ? actor : !query.trim().isEmpty() ? "搜索结果" : tab.equals("标签") ? "标签影片" : "全部影片"; TextView summary = text(title + " · " + matches.size() + " 部 · " + sort, 15, DIM); summary.setSingleLine(true); summary.setEllipsize(TextUtils.TruncateAt.END); titleRow.addView(summary, new LinearLayout.LayoutParams(0, -2, 1));
        addPager(titleRow, page, next -> { wallPage = next; selectedId = ""; render(true); }, true);
        if (directory != null) { gap(titleRow, 8); titleRow.addView(directory); } gap(titleRow, 8); titleRow.addView(button("筛选影片", this::showFilters)); body.addView(titleRow, new LinearLayout.LayoutParams(-1, dp(44)));
        if (!query.isEmpty() || filterCount() > 0) body.addView(activeFilters(() -> render(true)));
        if (page.items.isEmpty()) { body.addView(heading("没有符合条件的影片", 24)); body.addView(text("试试其他关键词，或移除筛选条件。", 17, DIM)); Button clear = button("清空条件", () -> { clearFilters(); query = ""; setSearchText(""); render(false); }); clear.setId(View.generateViewId()); body.addView(clear); wireCatalogControls(body, null, clear.getId()); return; }
        addMovieGrid(body, page.items, focusMovies);
    }
    private int gridColumns(int width) { return Math.max(2, Math.min(10, (int)((width + dp(8)) / (dp(110) * Math.max(1f, getResources().getConfiguration().fontScale))))); }
    private void addMovieGrid(LinearLayout body, List<Movie> movies, boolean focusMovies) {
        ScrollView scroll = new ScrollView(this); wallScroll = scroll;
        scroll.setTag("影片库"); scroll.setContentDescription("影片墙"); scroll.setPadding(dp(2), dp(2), dp(2), dp(4)); scroll.setClipToPadding(false); scroll.setFocusable(false);
        LinearLayout rows = column(); rows.setClipChildren(false); scroll.addView(rows); body.addView(scroll, new LinearLayout.LayoutParams(-1, 0, 1));
        // Equal front-cover frames keep the remote's row/column path stable as artwork arrives.
        scroll.addOnLayoutChangeListener((view, left, top, right, bottom, oldLeft, oldTop, oldRight, oldBottom) -> {
            if (right - left == oldRight - oldLeft || wallScroll != scroll) return;
            rows.removeAllViews(); wallCards.clear(); int count = gridColumns(right - left - scroll.getPaddingLeft() - scroll.getPaddingRight());
            LinearLayout line = null; List<View> cards = new ArrayList<>();
            for (int index = 0; index < movies.size(); index++) {
                if (index % count == 0) { line = row(); line.setGravity(Gravity.TOP); line.setClipChildren(false); rows.addView(line); }
                Movie movie = movies.get(index); LinearLayout card = movieCard(movie, true); wallCards.put(movie.id, card); cards.add(card);
                LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(0, -2, 1); params.bottomMargin = dp(8); if (index % count < count - 1) params.rightMargin = dp(8); line.addView(card, params);
            }
            if (line != null) while (line.getChildCount() < count) { LinearLayout.LayoutParams empty = new LinearLayout.LayoutParams(0, 1, 1); if (line.getChildCount() < count - 1) empty.rightMargin = dp(8); line.addView(new View(this), empty); }
            for (int index = 0; index < cards.size(); index++) {
                View card = cards.get(index);
                card.setNextFocusLeftId(index % count > 0 ? cards.get(index - 1).getId() : card.getId());
                card.setNextFocusRightId(index % count < count - 1 && index + 1 < cards.size() ? cards.get(index + 1).getId() : card.getId());
                if (index >= count) card.setNextFocusUpId(cards.get(index - count).getId());
                if (index / count < (cards.size() - 1) / count) card.setNextFocusDownId(cards.get(Math.min(index + count, cards.size() - 1)).getId());
            }
            if (!cards.isEmpty()) {
                // An incomplete row leaves no card below the right-aligned filters. Android's
                // geometric search needs an explicit path in both directions.
                int entry = cards.get(0).getId(); View toolbar = wireCatalogControls(body, scroll, entry);
                for (int index = 0; index < Math.min(count, cards.size()); index++) cards.get(index).setNextFocusUpId(toolbar.getId());
            }
            if (focusMovies) restoreGridFocus();
        });
    }
    private View wireCatalogControls(LinearLayout body, View grid, int entry) {
        View toolbar = tabButtons.get(tab); if (toolbar.getId() == View.NO_ID) toolbar.setId(View.generateViewId());
        for (int index = 0; index < body.getChildCount() && body.getChildAt(index) != grid; index++) {
            View lastControl = null;
            for (View control : body.getChildAt(index).getFocusables(View.FOCUS_FORWARD)) if (control instanceof Button) {
                if (control.getId() == View.NO_ID) control.setId(View.generateViewId());
                control.setNextFocusDownId(entry); control.setNextFocusUpId(toolbar.getId()); lastControl = control;
            }
            if (lastControl != null) toolbar = lastControl;
        }
        tabButtons.get(tab).setNextFocusDownId(entry); return toolbar;
    }
    private LinearLayout movieCard(Movie movie, boolean clickable) {
        LinearLayout card = column(); card.setId(View.generateViewId()); card.setImportantForAccessibility(View.IMPORTANT_FOR_ACCESSIBILITY_YES); card.setPadding(dp(3), dp(3), dp(3), dp(3)); card.setBackground(focus(Color.TRANSPARENT)); card.setClipChildren(false);
        CoverArt art = new CoverArt(this); art.catalog(); art.setContentDescription("封面：" + movie.id); art.setImportantForAccessibility(View.IMPORTANT_FOR_ACCESSIBILITY_YES);
        TextView quality = text(movie.quality, 11, TEXT); quality.setPadding(dp(4), dp(1), dp(4), dp(1)); quality.setBackground(shape(0xe610120f, 0, false)); FrameLayout.LayoutParams qualityParams = new FrameLayout.LayoutParams(-2, -2, Gravity.TOP | Gravity.END); qualityParams.setMargins(0, dp(4), dp(4), 0); art.addView(quality, qualityParams);
        TextView missing = text("文件缺失", 11, TEXT); missing.setBackgroundColor(0xdd762d3c); FrameLayout.LayoutParams missingParams = new FrameLayout.LayoutParams(-2, -2, Gravity.TOP | Gravity.START); missingParams.setMargins(dp(6), dp(6), 0, 0); art.addView(missing, missingParams);
        TextView code = text(movie.id, 11, TEXT); code.setTypeface(Typeface.MONOSPACE); code.setPadding(dp(4), dp(1), dp(4), dp(1)); code.setSingleLine(true); code.setEllipsize(TextUtils.TruncateAt.END); code.setBackground(shape(0xe610120f, 0, false)); FrameLayout.LayoutParams codeParams = new FrameLayout.LayoutParams(-2, -2, Gravity.BOTTOM | Gravity.START); codeParams.setMargins(dp(4), 0, dp(4), dp(4)); art.addView(code, codeParams);
        card.addView(art, new LinearLayout.LayoutParams(-1, -2));
        TextView title = text(movie.title, 14, TEXT); title.setPadding(0, dp(2), 0, 0); title.setIncludeFontPadding(false); title.setBreakStrategy(LineBreaker.BREAK_STRATEGY_BALANCED); title.setMinLines(2); title.setMaxLines(2); title.setEllipsize(TextUtils.TruncateAt.END); card.addView(title);
        TextView actors = text(TextUtils.join(" / ", movie.actors), 12, 0xffd1bb94); actors.setPadding(0, 0, 0, 0); actors.setIncludeFontPadding(false); actors.setSingleLine(true); actors.setEllipsize(TextUtils.TruncateAt.END); card.addView(actors, new LinearLayout.LayoutParams(-1, -2)); bindCard(card, movie);
        if (clickable) { card.setFocusable(true); card.setOnFocusChangeListener((view, focused) -> { if (focused) { selectedId = movie.id; lastMovieCard = card; } }); card.setOnClickListener(view -> { selectedId = movie.id; lastMovieCard = card; if (tab.equals("浏览新片")) showBrowseDetail(movie.id); else showDetail(movie.id); }); } return card;
    }
    private void bindCard(LinearLayout card, Movie movie) {
        card.setContentDescription(movie.id + " " + movie.title); CoverArt art = (CoverArt) card.getChildAt(0); images.load(client.posterUrl(movie), art.image(), 640, 480);
        ((TextView) art.getChildAt(1)).setText(movie.quality.isEmpty() ? movie.duration : movie.quality); art.getChildAt(1).setVisibility(movie.quality.isEmpty() && movie.duration.equals("— 分") ? View.GONE : View.VISIBLE); art.getChildAt(2).setVisibility(movie.unavailable && !tab.equals("浏览新片") ? View.VISIBLE : View.GONE);
    }
    private HorizontalScrollView activeFilters(Runnable changed) {
        HorizontalScrollView scroll = new HorizontalScrollView(this); scroll.setFocusable(false); LinearLayout chips = row();
        if (!query.isEmpty()) { Button keyword = button("搜索 · " + query + "  ×", () -> { query = ""; setSearchText(""); wallPage = 0; changed.run(); }); keyword.setContentDescription("清空搜索条件"); chips.addView(keyword); gap(chips, 7); }
        for (int i = 0; i < DIMENSIONS.length; i++) { String key = DIMENSIONS[i]; if (key.equals("actor") && !actor.isEmpty()) continue; String label = DIMENSION_NAMES[i]; for (String value : filters.get(key)) { Button chip = button(label + " · " + value + " ×", () -> { filters.get(key).remove(value); wallPage = 0; changed.run(); }); chip.setContentDescription("移除 " + label + " · " + value); chips.addView(chip); gap(chips, 7); } }
        chips.addView(button(query.isEmpty() ? "清空 " + filterCount() + " 个条件" : "清空全部条件", () -> { clearFilters(); query = ""; setSearchText(""); wallPage = 0; changed.run(); })); scroll.addView(chips); return scroll;
    }
    private int filterCount() { int count = 0; for (Map.Entry<String, LinkedHashSet<String>> item : filters.entrySet()) if (!item.getKey().equals("actor") || actor.isEmpty()) count += item.getValue().size(); return count; }
    private void clearFilters() { for (LinkedHashSet<String> values : filters.values()) values.clear(); allTags = false; }
    private void toggle(String dimension, String value) { LinkedHashSet<String> values = filters.get(dimension); if (!values.remove(value)) values.add(value); wallPage = 0; }
    private void setSearchText(String value) { changingSearch = true; search.setText(value); changingSearch = false; }
    private void showFilters() {
        Dialog dialog = new Dialog(this); dialog.requestWindowFeature(Window.FEATURE_NO_TITLE); LinearLayout body = paddedColumn(); body.setBackgroundColor(BG); LinearLayout top = row(); top.addView(heading("筛选影片", 26), new LinearLayout.LayoutParams(0, -2, 1)); top.addView(button("完成", dialog::dismiss)); body.addView(top);
        Spinner sorting = new Spinner(this); sorting.setContentDescription("影院排序"); sorting.setAdapter(new ArrayAdapter<>(this, android.R.layout.simple_spinner_dropdown_item, SORTS)); sorting.setSelection(Arrays.asList(SORTS).indexOf(sort)); sorting.setBackground(focus(SURFACE)); sorting.setOnItemSelectedListener(new AdapterView.OnItemSelectedListener() { @Override public void onNothingSelected(AdapterView<?> parent) { } @Override public void onItemSelected(AdapterView<?> parent, View view, int position, long id) { if (!sort.equals(SORTS[position])) { sort = SORTS[position]; wallPage = 0; } } }); body.addView(sorting, new LinearLayout.LayoutParams(-1, dp(44)));
        if (filterCount() > 0) body.addView(activeFilters(dialog::dismiss));
        final String[] dimension = {actor.isEmpty() ? "actor" : "studio"}; final int[] optionPage = {0}; LinearLayout dimensions = row(); body.addView(dimensions); EditText optionQuery = input("搜索筛选选项", "搜索选项"); body.addView(optionQuery, new LinearLayout.LayoutParams(-1, dp(46))); ScrollView scroll = new ScrollView(this); LinearLayout choices = column(); scroll.addView(choices); body.addView(scroll, new LinearLayout.LayoutParams(-1, 0, 1)); Map<String, Button> dimensionButtons = new LinkedHashMap<>();
        Runnable[] update = new Runnable[1]; update[0] = () -> {
            choices.removeAllViews(); String key = dimension[0]; String name = DIMENSION_NAMES[Arrays.asList(DIMENSIONS).indexOf(key)]; optionQuery.setContentDescription("搜索" + name + "选项"); optionQuery.setHint("搜索" + name + "选项"); for (String dim : dimensionButtons.keySet()) chosen(dimensionButtons.get(dim), dim.equals(key));
            if (key.equals("flag")) { LinearLayout modes = row(); Button any = button("匹配任一标签", () -> { allTags = false; update[0].run(); }); Button every = button("匹配全部标签", () -> { allTags = true; update[0].run(); }); chosen(any, !allTags); chosen(every, allTags); modes.addView(any); gap(modes, 10); modes.addView(every); choices.addView(modes); }
            Map<String, Integer> counts = library.facetCounts(key, actor, optionQuery.getText().toString()); CinemaLibrary.Page<Map.Entry<String, Integer>> page = CinemaLibrary.page(new ArrayList<>(counts.entrySet()), optionPage[0], 60); optionPage[0] = page.index;
            for (Map.Entry<String, Integer> item : page.items) { CheckBox option = new CheckBox(this); option.setText(item.getKey() + "  " + item.getValue()); option.setTextSize(17); option.setTextColor(TEXT); option.setButtonTintList(android.content.res.ColorStateList.valueOf(ACCENT)); option.setContentDescription("筛选" + name + "：" + item.getKey()); option.setBackground(focus(SURFACE)); option.setMinHeight(dp(44)); option.setChecked(filters.get(key).contains(item.getKey())); option.setOnClickListener(view -> toggle(key, item.getKey())); choices.addView(option); }
            if (page.items.isEmpty()) choices.addView(text("没有匹配选项", 18, DIM)); addPager(choices, page, next -> { optionPage[0] = next; update[0].run(); }); choices.addView(button("清空条件", () -> { clearFilters(); optionPage[0] = 0; update[0].run(); }));
        };
        for (int i = 0; i < DIMENSIONS.length; i++) { String key = DIMENSIONS[i]; if (key.equals("actor") && !actor.isEmpty()) continue; Button item = button(DIMENSION_NAMES[i], () -> { dimension[0] = key; optionPage[0] = 0; optionQuery.setText(""); update[0].run(); }); dimensions.addView(item); gap(dimensions, 8); dimensionButtons.put(key, item); }
        watch(optionQuery, value -> { optionPage[0] = 0; update[0].run(); }); update[0].run(); dialog.setContentView(body); dialog.setOnDismissListener(ignored -> render(false)); present(dialog); dialog.getWindow().setLayout((int)(getResources().getDisplayMetrics().widthPixels * .86), (int)(getResources().getDisplayMetrics().heightPixels * .9));
    }
    private void loadBrowse(boolean reset) {
        if (!reset && (browseLoading || browseNext == 0)) return;
        final int generation = reset ? ++browseGeneration : browseGeneration, page = reset ? 1 : browseNext;
        final LibraryClient requested = client; final String kind = browseKind; final List<LibraryClient.BrowseFilter> selected = new ArrayList<>(browseFilters);
        if (reset) { browseMovies.clear(); browseNext = 1; browsePage = 0; }
        browseLoading = true; browseError = ""; render(false);
        network.execute(() -> {
            try { LibraryClient.BrowsePage result = requested.loadBrowse(page, kind, selected); runOnUiThread(() -> {
                if (isDestroyed() || generation != browseGeneration) return;
                Map<String, Movie> unique = new LinkedHashMap<>(); for (Movie movie : browseMovies) unique.put(movie.id, movie); for (Movie movie : result.movies) unique.put(movie.id, movie);
                browseMovies.clear(); browseMovies.addAll(unique.values()); browseNext = result.nextPage; browseLoaded = true; browseLoading = false; if (tab.equals("浏览新片")) render(false);
            }); } catch (Exception unavailable) { runOnUiThread(() -> { if (isDestroyed() || generation != browseGeneration) return; browseLoading = false; browseLoaded = true; browseError = "读取新片失败，请检查服务器的 JavBus 连接后重试。"; if (tab.equals("浏览新片")) render(false); }); }
        });
    }
    private void renderBrowse(boolean focusMovies) {
        LinearLayout body = catalogBody(); content.addView(body); LinearLayout title = row(); TextView summary = text("浏览新片 · " + browseMovies.size() + " 部 · " + (browseKind.equals("normal") ? "有码" : "无码") + (browseFilters.isEmpty() ? "" : " · " + browseFilters.size() + " 个条件"), 15, DIM); summary.setSingleLine(true); summary.setEllipsize(TextUtils.TruncateAt.END); title.addView(summary, new LinearLayout.LayoutParams(0, -2, 1));
        CinemaLibrary.Page<Movie> page = CinemaLibrary.page(browseMovies, browsePage, 60); browsePage = page.index;
        addPager(title, page, next -> { browsePage = next; selectedId = ""; render(true); }, true);
        if (browseNext > 0 && browseError.isEmpty()) { Button more = button(browseLoading ? "正在获取影片…" : "加载更多影片", () -> loadBrowse(false)); more.setEnabled(!browseLoading); title.addView(more); gap(title, 8); }
        title.addView(button("浏览筛选", this::showBrowseFilters)); body.addView(title, new LinearLayout.LayoutParams(-1, dp(44)));
        if (!page.items.isEmpty()) addMovieGrid(body, page.items, focusMovies);
        else { body.addView(heading(browseLoading ? "正在获取影片…" : "本页没有匹配影片", 24)); body.addView(text("从 JavBus 发现影片，选择最佳资源后通过 115 播放。", 16, DIM)); body.addView(new View(this), new LinearLayout.LayoutParams(1, 0, 1)); }
        if (!browseError.isEmpty()) { body.addView(text(browseError, 16, DIM)); body.addView(button("重试加载影片", () -> loadBrowse(browseMovies.isEmpty()))); }
    }
    private Dialog panel(String title, LinearLayout body) {
        Dialog dialog = new Dialog(this); dialog.requestWindowFeature(Window.FEATURE_NO_TITLE); body.setBackgroundColor(BG); LinearLayout top = row(); top.addView(heading(title, 24), new LinearLayout.LayoutParams(0, -2, 1)); top.addView(button("关闭", dialog::dismiss)); body.addView(top, 0);
        dialog.setContentView(body); present(dialog); dialog.getWindow().setLayout((int)(getResources().getDisplayMetrics().widthPixels * .86), (int)(getResources().getDisplayMetrics().heightPixels * .88)); return dialog;
    }
    private void showBrowseFilters() {
        LinearLayout body = paddedColumn(); Dialog dialog = panel("浏览筛选", body); LinearLayout actions = row();
        actions.addView(button("浏览演员目录", () -> { dialog.dismiss(); showBrowseCatalog("star"); })); gap(actions, 10); actions.addView(button("浏览标签目录", () -> { dialog.dismiss(); showBrowseCatalog("genre"); })); body.addView(actions);
        LinearLayout kinds = row(); for (String kind : new String[]{"normal", "uncensored"}) { Button option = button(kind.equals("normal") ? "有码" : "无码", () -> { browseKind = kind; dialog.dismiss(); loadBrowse(true); }); chosen(option, browseKind.equals(kind)); kinds.addView(option); gap(kinds, 10); } body.addView(kinds);
        LinearLayout choices = column(); for (LibraryClient.BrowseFilter filter : browseFilters) choices.addView(button("移除 " + filter.label, () -> { browseFilters.remove(filter); dialog.dismiss(); loadBrowse(true); }));
        choices.addView(button("清空浏览条件", () -> { browseFilters.clear(); dialog.dismiss(); loadBrowse(true); })); body.addView(scroller(choices), new LinearLayout.LayoutParams(-1, 0, 1));
    }
    private void addBrowseFilter(LibraryClient.BrowseFilter filter) {
        for (LibraryClient.BrowseFilter selected : browseFilters) if (selected.type.equals(filter.type) && selected.value.equals(filter.value)) return;
        browseFilters.add(filter); loadBrowse(true);
    }
    private void showBrowseCatalog(String type) {
        LinearLayout body = paddedColumn(); Dialog dialog = panel(type.equals("star") ? "选择演员" : "选择标签", body); EditText query = input("搜索浏览目录", "搜索名称或代码"); body.addView(query, new LinearLayout.LayoutParams(-1, dp(46)));
        LinearLayout choices = column(); body.addView(scroller(choices), new LinearLayout.LayoutParams(-1, 0, 1)); choices.addView(text("正在读取目录…", 18, DIM)); final LibraryClient requested = client;
        network.execute(() -> {
            try { List<LibraryClient.BrowseFilter> catalog = requested.loadBrowseCatalog(type); runOnUiThread(() -> {
                if (isDestroyed() || client != requested || !dialog.isShowing()) return;
                final int[] pageIndex = {0}; Runnable[] update = new Runnable[1]; update[0] = () -> {
                    choices.removeAllViews(); String needle = query.getText().toString().trim().toLowerCase(java.util.Locale.ROOT); List<LibraryClient.BrowseFilter> matches = new ArrayList<>(); for (LibraryClient.BrowseFilter filter : catalog) if ((filter.label + " " + filter.value).toLowerCase(java.util.Locale.ROOT).contains(needle)) matches.add(filter);
                    CinemaLibrary.Page<LibraryClient.BrowseFilter> page = CinemaLibrary.page(matches, pageIndex[0], 36); pageIndex[0] = page.index; LinearLayout line = null; int index = 0;
                    for (LibraryClient.BrowseFilter filter : page.items) {
                        if (index++ % 4 == 0) { line = row(); line.setGravity(Gravity.TOP); choices.addView(line); }
                        Runnable select = () -> { dialog.dismiss(); addBrowseFilter(filter); };
                        View option = type.equals("star") ? actorCard(filter.label, client.browseActorAvatarUrl(filter), "", select) : button(filter.label, select);
                        LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(0, type.equals("star") ? -2 : dp(48), 1); params.setMargins(dp(3), dp(4), dp(3), dp(4)); line.addView(option, params);
                    }
                    completeRow(line, 4);
                    if (matches.isEmpty()) choices.addView(text("没有匹配选项", 18, DIM)); addPager(choices, page, next -> { pageIndex[0] = next; update[0].run(); });
                }; watch(query, value -> { pageIndex[0] = 0; update[0].run(); }); update[0].run();
            }); } catch (Exception unavailable) { runOnUiThread(() -> { if (!isDestroyed() && dialog.isShowing()) { choices.removeAllViews(); choices.addView(text("目录读取失败，请关闭后重试。", 18, DIM)); } }); }
        });
    }
    private void showBrowseDetail(String id) {
        LinearLayout body = paddedColumn(); Dialog dialog = panel("浏览影片详情", body); detailDialog = dialog; dialog.setOnDismissListener(ignored -> { if (detailDialog == dialog) detailDialog = null; restoreGridFocus(); }); LinearLayout info = column(); body.addView(scroller(info), new LinearLayout.LayoutParams(-1, 0, 1)); info.addView(text("正在获取影片资料…", 20, DIM)); final LibraryClient requested = client;
        network.execute(() -> { try { Movie movie = requested.loadBrowseMovie(id); runOnUiThread(() -> {
            if (isDestroyed() || client != requested || !dialog.isShowing()) return; info.removeAllViews(); LinearLayout columns = row(); columns.setGravity(Gravity.TOP); CoverArt poster = new CoverArt(this); poster.setContentDescription("详情封面：" + movie.id); images.load(client.posterUrl(movie), poster.image()); columns.addView(poster, new LinearLayout.LayoutParams(dp(290), -2)); LinearLayout facts = column(); facts.setPadding(dp(24), 0, 0, 0); facts.addView(heading(movie.title, 26)); facts.addView(text(join(movie.id, movie.date, movie.duration), 16, DIM)); facts.addView(primary("最佳资源播放", () -> startBrowsePlay(movie)));
            facts.addView(text("自动选择磁力并提交到 115，下载完成后播放。", 16, DIM));
            for (LibraryClient.BrowseFilter filter : movie.browseFilters) {
                String name = filter.type.equals("star") ? "演员" : filter.type.equals("genre") ? "标签" : filter.type.equals("studio") ? "制作商" : filter.type.equals("label") ? "发行商" : filter.type.equals("director") ? "导演" : "系列";
                Runnable select = () -> { dialog.dismiss(); addBrowseFilter(filter); };
                View option = filter.type.equals("star") ? actorButton(filter.label, client.browseActorAvatarUrl(filter), select) : button(name + " · " + filter.label, select);
                option.setContentDescription("浏览" + name + "：" + filter.label); facts.addView(option);
            }
            columns.addView(facts, new LinearLayout.LayoutParams(0, -2, 1)); info.addView(columns);
        }); } catch (Exception unavailable) { runOnUiThread(() -> { if (isDestroyed() || !dialog.isShowing()) return; info.removeAllViews(); info.addView(text("读取影片资料失败，请检查网络后重试。", 20, DIM)); info.addView(button("重试影片资料", () -> { dialog.dismiss(); showBrowseDetail(id); })); }); } });
    }
    private void startBrowsePlay(Movie movie) {
        if (startingPlay) return; if (!playJobId.isEmpty() && movie.id.equals(playMovieId)) { resumePlayJob(); return; }
        String previousTitle = playTitle; playTitle = movie.title; startingPlay = true; final int generation = ++playGeneration; final LibraryClient requested = client; LinearLayout body = openPlayPanel(); body.addView(text("正在选择资源并准备 115 播放…", 20, DIM));
        network.execute(() -> { try { JSONObject job = requested.startPlayJob(movie.id); runOnUiThread(() -> { if (isDestroyed() || generation != playGeneration) return; startingPlay = false; playMovieId = movie.id; playJobId = job.optString("task_id"); if (playDialog != null && playDialog.isShowing()) pollPlayJob(); }); } catch (Exception unavailable) { runOnUiThread(() -> { if (isDestroyed() || generation != playGeneration) return; startingPlay = false; playTitle = previousTitle; body.addView(text("播放准备失败，请检查 115 登录状态；已有准备任务时，请先继续或取消。", 18, DIM)); if (!playJobId.isEmpty()) body.addView(button("继续上一部播放准备", this::resumePlayJob)); body.addView(button("重试播放", () -> startBrowsePlay(movie))); body.addView(button("115 设置", () -> openManagement(""))); }); } });
    }
    private LinearLayout openPlayPanel() {
        handler.removeCallbacksAndMessages(null); if (playDialog != null) playDialog.dismiss(); LinearLayout body = paddedColumn(); playBody = body; playDialog = panel("115 影片播放 · " + playTitle, body); body.addView(text("关闭等待后可从“更多 → 115 播放准备”继续；不会删除网盘文件。", 15, DIM)); return body;
    }
    private void resumePlayJob() { if (startingPlay) { if (playDialog != null) playDialog.show(); return; } ++playGeneration; openPlayPanel(); pollPlayJob(); }
    private void pollPlayJob() {
        final int generation = playGeneration; final LibraryClient requested = client; final String id = playJobId; final Dialog dialog = playDialog; if (id.isEmpty() || dialog == null || !dialog.isShowing()) return;
        network.execute(() -> { try { JSONObject job = requested.playJob(id); runOnUiThread(() -> {
            if (isDestroyed() || generation != playGeneration || dialog != playDialog || !dialog.isShowing()) return;
            if (job.optString("status").equals("success") && job.optJSONObject("result") != null && job.optJSONObject("result").optBoolean("success")) { dialog.dismiss(); Intent intent = new Intent(this, PlaybackActivity.class); intent.putExtra("server", requested.getBaseUrl()); intent.putExtra("browse_job_id", id); intent.putExtra("session_cookie", requested.sessionCookie()); intent.putExtra("movie_id", playMovieId); intent.putExtra("title", playTitle); startActivity(intent); return; }
            String focused = focusKey(dialog.getCurrentFocus()); LinearLayout body = playBody; while (body.getChildCount() > 2) body.removeViewAt(2);
            String status = job.optString("status"); String message = status.equals("cancelled") ? "已取消等待，网盘离线任务可能仍在进行。" : status.equals("failed") ? "播放准备失败，请检查 115 连接后重试。" : "正在准备 115 播放…";
            body.addView(text(message + (job.optInt("percent", 0) > 0 ? " " + Math.max(0, Math.min(100, job.optInt("percent"))) + "%" : ""), 20, TEXT));
            if (job.optBoolean("can_cancel")) body.addView(button("取消等待", () -> controlPlayJob("cancel")));
            if (job.optBoolean("can_retry")) body.addView(button("重试播放", () -> controlPlayJob("retry")));
            body.addView(button("115 设置", () -> openManagement("")));
            View action = findFocus(body, focused); if (action != null) action.requestFocus();
            if (job.optString("status").equals("running") || job.optString("status").equals("queued")) handler.postDelayed(this::pollPlayJob, 1500);
        }); } catch (Exception unavailable) { runOnUiThread(() -> { if (isDestroyed() || generation != playGeneration || !dialog.isShowing()) return; playBody.addView(text("无法读取播放任务，服务重启后请重新选择影片播放。", 18, DIM)); playBody.addView(button("返回重新播放", () -> { playJobId = ""; dialog.dismiss(); })); }); } });
    }
    private void controlPlayJob(String action) {
        handler.removeCallbacksAndMessages(null);
        final int generation = ++playGeneration; final LibraryClient requested = client; final String id = playJobId;
        network.execute(() -> { try { requested.controlPlayJob(id, action); runOnUiThread(() -> { if (!isDestroyed() && generation == playGeneration) pollPlayJob(); }); } catch (Exception unavailable) { runOnUiThread(() -> { if (!isDestroyed() && generation == playGeneration) resumePlayJob(); }); } });
    }
    private void showDetail(String id) {
        selectedId = id; final int generation = ++detailGeneration; Dialog dialog = new Dialog(this); dialog.requestWindowFeature(Window.FEATURE_NO_TITLE); LinearLayout body = column(); body.setBackgroundColor(BG); body.setPadding(dp(24), dp(12), dp(24), dp(20)); body.addView(heading("正在读取影片详情…", 25)); dialog.setContentView(body); detailDialog = dialog;
        dialog.setOnDismissListener(ignored -> { ++detailGeneration; if (detailDialog == dialog) detailDialog = null; restoreGridFocus(); }); present(dialog); dialog.getWindow().setLayout((int)(getResources().getDisplayMetrics().widthPixels * .94), (int)(getResources().getDisplayMetrics().heightPixels * .94));
        LibraryClient requested = client; network.execute(() -> {
            try { Movie movie = requested.loadMovie(id); runOnUiThread(() -> { if (!isDestroyed() && generation == detailGeneration && dialog.isShowing()) renderDetail(dialog, body, movie); }); }
            catch (Exception absent) { runOnUiThread(() -> { if (isDestroyed() || generation != detailGeneration || !dialog.isShowing()) return; body.removeAllViews(); body.addView(text("无法读取详情，请检查网络或在服务器重新扫描影片库。", 22, TEXT)); body.addView(button("返回浏览", dialog::dismiss)); }); }
        });
    }
    private void renderDetail(Dialog dialog, LinearLayout body, Movie movie) {
        body.removeAllViews(); LinearLayout top = row(); top.addView(button("返回浏览", dialog::dismiss)); gap(top, 16); TextView title = text(movie.id + "  /  影片资料", 15, DIM); title.setTypeface(Typeface.MONOSPACE); top.addView(title, new LinearLayout.LayoutParams(0, -2, 1)); Button close = button("×", dialog::dismiss); close.setContentDescription("关闭影片详情"); top.addView(close); body.addView(top); gap(body, 10);
        FrameLayout scene = new FrameLayout(this); ImageView backdrop = new ImageView(this); backdrop.setScaleType(ImageView.ScaleType.CENTER_CROP); backdrop.setAlpha(.06f); scene.addView(backdrop, new FrameLayout.LayoutParams(-1, -1)); images.load(client.backdropUrl(movie), backdrop, 1280, 720); LinearLayout columns = new LinearLayout(this); columns.setGravity(Gravity.TOP);
        CoverArt poster = new CoverArt(this); poster.setContentDescription("详情封面：" + movie.id); LinearLayout artwork = column(); artwork.setPadding(dp(4), 0, dp(20), 0); artwork.addView(poster, new LinearLayout.LayoutParams(-1, -2)); columns.addView(scroller(artwork), new LinearLayout.LayoutParams(0, -1, 2)); images.load(client.posterUrl(movie), poster.image());
        LinearLayout info = column(); info.setPadding(dp(8), 0, 0, dp(12)); info.addView(text(description(movie), 16, TEXT));
        for (String[] fact : new String[][]{{"发行日期", movie.date}, {"制作商", movie.studio}, {"系列", movie.series}, {"导演", movie.director}, {"本地文件", movie.files.size() + " 个 · " + movie.size}}) if (!fact[1].isEmpty() && !fact[1].equals("—")) info.addView(text(fact[0] + "  " + fact[1], 14, DIM));
        info.addView(button("在影视库中管理", () -> openManagement(movie.id))); info.addView(heading("演员与标签", 18));
        Map<String, CinemaLibrary.Actor> actorPhotos = new LinkedHashMap<>(); for (CinemaLibrary.Actor item : library.actors()) actorPhotos.put(item.name, item);
        for (String name : movie.actors) {
            String address = client.actorAvatarUrl(actorPhotos.get(name));
            if (address.isEmpty()) for (LibraryClient.BrowseFilter filter : movie.browseFilters) if (filter.type.equals("star") && filter.label.equals(name) && (!filter.artworkSource.isEmpty() || !filter.value.equals(filter.label))) { address = client.browseActorAvatarUrl(filter); break; }
            LinearLayout option = actorButton(name, address, () -> { actor = name; tab = "演员"; query = ""; clearFilters(); wallPage = 0; setSearchText(""); dialog.dismiss(); render(true); }); option.setContentDescription("演员：" + name); info.addView(option);
        }
        for (String name : movie.tags) { Button option = button(name, () -> { clearFilters(); filters.get("flag").add(name); actor = ""; query = ""; tab = "标签"; tagResults = true; wallPage = 0; setSearchText(""); dialog.dismiss(); render(true); }); option.setContentDescription("标签：" + name); info.addView(option); }
        if (movie.actors.isEmpty() && movie.tags.isEmpty()) info.addView(text("暂无演员与标签资料", 15, DIM));
        LinearLayout files = column(); files.setPadding(dp(8), 0, 0, 0); files.addView(heading("播放文件", 21)); files.addView(text("选择版本或分段", 14, DIM)); List<Movie.VideoFile> playable = new ArrayList<>(); for (Movie.VideoFile file : movie.files) if (!file.missing) playable.add(file);
        Spinner selector = new Spinner(this); selector.setContentDescription("详情播放文件"); List<String> labels = new ArrayList<>(); for (Movie.VideoFile file : movie.files) labels.add((file.index + 1) + ". " + file.label + (file.missing ? "（文件缺失）" : "")); ArrayAdapter<String> options = new ArrayAdapter<String>(this, android.R.layout.simple_spinner_dropdown_item, labels) { @Override public boolean areAllItemsEnabled() { return false; } @Override public boolean isEnabled(int index) { return !movie.files.get(index).missing; } }; selector.setAdapter(options); selector.setBackground(focus(SURFACE)); selector.setEnabled(!playable.isEmpty()); if (!playable.isEmpty()) selector.setSelection(movie.files.indexOf(playable.get(0))); files.addView(selector, new LinearLayout.LayoutParams(-1, dp(44)));
        TextView fileMeta = text("", 13, DIM); files.addView(fileMeta); final Movie.VideoFile[] selected = {playable.isEmpty() ? null : playable.get(0)}; Runnable updateMeta = () -> fileMeta.setText(selected[0] == null ? "没有可用文件" : join(selected[0].size, selected[0].codec, selected[0].quality)); updateMeta.run(); selector.setOnItemSelectedListener(new AdapterView.OnItemSelectedListener() { @Override public void onNothingSelected(AdapterView<?> parent) { } @Override public void onItemSelected(AdapterView<?> parent, View view, int index, long id) { if (movie.files.get(index).missing) return; selected[0] = movie.files.get(index); updateMeta.run(); } });
        Button play = primary("播放所选文件", () -> { if (selected[0] != null) startPlayback(movie, selected[0].index); }); play.setEnabled(!playable.isEmpty()); files.addView(play);
        for (Movie.VideoFile file : movie.files) { Button direct = button("播放：" + file.label, () -> { selector.setSelection(movie.files.indexOf(file)); startPlayback(movie, file.index); }); direct.setEnabled(!file.missing); direct.setAlpha(file.missing ? .45f : 1f); direct.setContentDescription("播放：" + file.label); LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(-1, -2); params.topMargin = dp(6); files.addView(direct, params); }
        files.addView(text("原画播放；多段影片按原顺序跳过缺失文件。", 13, DIM)); LinearLayout details = column(); details.addView(heading(movie.title, 27)); details.addView(text(movieMeta(movie), 14, DIM)); gap(details, 12); details.addView(files); gap(details, 20); details.addView(info); ScrollView reading = scroller(details); reading.setVerticalFadingEdgeEnabled(true); reading.setFadingEdgeLength(dp(20)); columns.addView(reading, new LinearLayout.LayoutParams(0, -1, 3)); scene.addView(columns, new FrameLayout.LayoutParams(-1, -1)); body.addView(scene, new LinearLayout.LayoutParams(-1, 0, 1)); play.requestFocus();
    }
    private void startPlayback(Movie movie, int index) { Intent intent = new Intent(this, PlaybackActivity.class); intent.putExtra("server", client.getBaseUrl()); intent.putExtra("movie_id", movie.id); intent.putExtra("file_index", index); startActivity(intent); }
    private String description(Movie movie) { String fallback = join(TextUtils.join(" / ", movie.actors), movie.studio, movie.series); return !movie.description.isEmpty() ? movie.description : fallback.isEmpty() ? "暂无影片简介，可在影视库中补全资料。" : fallback; }
    private String movieMeta(Movie movie) { return join(movie.id, movie.year, movie.duration, movie.quality, movie.codec.toUpperCase(java.util.Locale.ROOT)); }
    private static String join(String... items) { List<String> values = new ArrayList<>(); for (String item : items) if (item != null && !item.isEmpty() && !item.equals("—") && !item.equals("— 分")) values.add(item); return TextUtils.join(" · ", values); }
    private void openManagement(String id) {
        String address = client.getBaseUrl() + "/#library" + (id.isEmpty() ? "" : "/" + id);
        try { startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(address))); }
        catch (ActivityNotFoundException absent) { new AlertDialog.Builder(this).setTitle("管理界面").setMessage("此电视没有可用的浏览器。请在手机或电脑浏览器打开：\n\n" + address + "\n\n影片扫描、资料补全与转码在服务器管理界面操作。").setPositiveButton("知道了", null).show(); }
    }
    private <T> void addPager(LinearLayout parent, CinemaLibrary.Page<T> page, PageChanged change) {
        addPager(parent, page, change, false);
    }
    private <T> void addPager(LinearLayout parent, CinemaLibrary.Page<T> page, PageChanged change, boolean compact) {
        if (page.pages <= 1) return; LinearLayout pager = row(); pager.setGravity(Gravity.CENTER); pager.setPadding(0, compact ? 0 : dp(12), 0, compact ? 0 : dp(8));
        Button previous = button(compact ? "‹" : "上一页", () -> change.accept(page.index - 1)); previous.setContentDescription("上一页"); previous.setEnabled(page.index > 0);
        Button next = button(compact ? "›" : "下一页", () -> change.accept(page.index + 1)); next.setContentDescription("下一页"); next.setEnabled(page.index < page.pages - 1);
        if (compact) { previous.setPadding(0, 0, 0, 0); next.setPadding(0, 0, 0, 0); pager.addView(previous, new LinearLayout.LayoutParams(dp(44), dp(44))); }
        else pager.addView(previous);
        gap(pager, compact ? 6 : 16); pager.addView(text("第 " + (page.index + 1) + " / " + page.pages + " 页 · 共 " + page.total + " 项", compact ? 12 : 14, DIM)); gap(pager, compact ? 6 : 16);
        if (compact) { pager.addView(next, new LinearLayout.LayoutParams(dp(44), dp(44))); parent.addView(pager, new LinearLayout.LayoutParams(-2, dp(44))); }
        else { pager.addView(next); parent.addView(pager); }
    }
    private void restoreGridFocus() { if (lastMovieCard != null && lastMovieCard.isAttachedToWindow() && detailDialog == null) { lastMovieCard.requestFocus(); return; } if (wallScroll == null) return; ScrollView expected = wallScroll; expected.post(() -> { if (isDestroyed() || detailDialog != null || wallScroll != expected || wallCards.isEmpty()) return; View card = wallCards.get(selectedId); if (card == null) card = wallCards.values().iterator().next(); card.requestFocus(); }); }
    private String focusKey(View view) { if (view == null) return ""; if (view.getContentDescription() != null) return "description:" + view.getContentDescription(); return view instanceof TextView ? "text:" + ((TextView)view).getText() : ""; }
    private View findFocus(View view, String key) { if (view.isFocusable() && key.equals(focusKey(view))) return view; if (view instanceof ViewGroup) for (int i = 0; i < ((ViewGroup)view).getChildCount(); i++) { View found = findFocus(((ViewGroup)view).getChildAt(i), key); if (found != null) return found; } return null; }
    private void restoreFocus(String key) { shell.post(() -> { if (isDestroyed()) return; if (key.equals("#grid")) restoreGridFocus(); else { View found = findFocus(shell, key); if (found != null) found.requestFocus(); } }); }
    @Override protected void onSaveInstanceState(Bundle state) {
        state.putString("home_collection", homeCollection); state.putString("vr_collection", vrCollection);
        state.putString("focus", focusKey(getCurrentFocus())); state.putString("tab", tab); state.putString("query", query); state.putString("actor", actor); state.putString("tag_query", tagQuery); state.putString("sort", sort); state.putString("selected", selectedId); state.putBoolean("tag_results", tagResults); state.putBoolean("all_tags", allTags); state.putInt("wall_page", wallPage); state.putInt("tag_page", tagPage); state.putInt("actor_page", actorPage); state.putInt("shelf_page", shelfPage); for (String key : DIMENSIONS) state.putStringArrayList("filter_" + key, new ArrayList<>(filters.get(key))); super.onSaveInstanceState(state);
    }
    private void back() { if (serverScreen) { if (client == null) finish(); else { createShell(); render(false); } } else if (!actor.isEmpty()) { actor = ""; clearFilters(); render(false); } else if (tab.equals("标签") && tagResults) { tagResults = false; render(false); } else if (!tab.equals("推荐") && detailDialog == null) navigate("推荐"); else finish(); }
    @Override public boolean onKeyDown(int keyCode, KeyEvent event) { if (Build.VERSION.SDK_INT < 33 && keyCode == KeyEvent.KEYCODE_BACK) { if (event.getRepeatCount() == 0) back(); return true; } return super.onKeyDown(keyCode, event); }
    @Override protected void onDestroy() { ++libraryGeneration; ++detailGeneration; ++browseGeneration; ++playGeneration; handler.removeCallbacksAndMessages(null); if (playDialog != null) playDialog.dismiss(); if (detailDialog != null) detailDialog.dismiss(); network.shutdownNow(); images.close(); super.onDestroy(); }
}
