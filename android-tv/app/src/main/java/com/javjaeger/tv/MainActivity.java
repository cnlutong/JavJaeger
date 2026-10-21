package com.javjaeger.tv;

import android.app.Activity;
import android.app.AlertDialog;
import android.app.Dialog;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.graphics.drawable.StateListDrawable;
import android.net.Uri;
import android.os.Bundle;
import android.os.Build;
import android.text.Editable;
import android.text.TextUtils;
import android.text.TextWatcher;
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

public final class MainActivity extends Activity {
    private static final int BG = 0xff101114, SURFACE = 0xff1b1d22, TEXT = 0xfff4f5f7, DIM = 0xffa4abb7;
    private static final int ACCENT = 0xff59cbe8, RING = 0xff383d47;
    private static final String[] TABS = {"推荐", "全部影片", "标签", "演员", "VR"};
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
    private EditText search;
    private TextView badge;
    private Button refresh;
    private ScrollView wallScroll;
    private final Map<String, View> wallCards = new LinkedHashMap<>();
    private Dialog detailDialog;
    private String tab = "推荐", query = "", actor = "", tagQuery = "", sort = SORTS[0];
    private String selectedId = "", heroId = "", deployment = "版本未知 · 更新时间未记录";
    private String pendingFocus = "";
    private boolean tagResults, allTags, loading, changingSearch, serverScreen;
    private int wallPage, tagPage, actorPage, shelfPage, libraryGeneration, detailGeneration;
    private List<Movie> visibleMovies = new ArrayList<>();

    @Override public void onCreate(Bundle saved) {
        super.onCreate(saved); images = new ImageLoader();
        if (Build.VERSION.SDK_INT >= 33) getOnBackInvokedDispatcher().registerOnBackInvokedCallback(android.window.OnBackInvokedDispatcher.PRIORITY_DEFAULT, this::back);
        for (String key : DIMENSIONS) filters.put(key, new LinkedHashSet<>());
        if (saved != null) {
            tab = saved.getString("tab", tab); query = saved.getString("query", ""); actor = saved.getString("actor", "");
            tagQuery = saved.getString("tag_query", ""); sort = saved.getString("sort", sort); selectedId = saved.getString("selected", ""); heroId = saved.getString("hero", "");
            pendingFocus = saved.getString("focus", "");
            tagResults = saved.getBoolean("tag_results"); allTags = saved.getBoolean("all_tags"); wallPage = saved.getInt("wall_page"); tagPage = saved.getInt("tag_page"); actorPage = saved.getInt("actor_page"); shelfPage = saved.getInt("shelf_page");
            for (String key : DIMENSIONS) { ArrayList<String> values = saved.getStringArrayList("filter_" + key); if (values != null) filters.get(key).addAll(values); }
        }
        String server = getPreferences(MODE_PRIVATE).getString("server", ""); if (server.isEmpty()) showServer(""); else connect(server, false);
    }

    private int dp(int value) { return Math.round(value * getResources().getDisplayMetrics().density); }
    private LinearLayout column() { LinearLayout view = new LinearLayout(this); view.setOrientation(LinearLayout.VERTICAL); return view; }
    private LinearLayout row() { LinearLayout view = new LinearLayout(this); view.setGravity(Gravity.CENTER_VERTICAL); return view; }
    private TextView text(String value, int size, int color) { TextView view = new TextView(this); view.setText(value); view.setTextSize(size); view.setTextColor(color); view.setPadding(0, dp(3), 0, dp(3)); return view; }
    private TextView heading(String value, int size) { TextView view = text(value, size, TEXT); view.setTypeface(null, Typeface.BOLD); return view; }
    private GradientDrawable shape(int color, int stroke, boolean round) { GradientDrawable shape = new GradientDrawable(); shape.setColor(color); shape.setCornerRadius(dp(round ? 80 : 7)); if (stroke != 0) shape.setStroke(dp(2), stroke); return shape; }
    private StateListDrawable focus(int color) {
        StateListDrawable states = new StateListDrawable();
        states.addState(new int[]{android.R.attr.state_focused}, shape(color, ACCENT, false));
        states.addState(new int[]{android.R.attr.state_selected}, shape(color, ACCENT, false));
        states.addState(new int[]{android.R.attr.state_pressed}, shape(color, ACCENT, false));
        states.addState(new int[]{}, shape(color, RING, false)); return states;
    }
    private Button button(String label, Runnable action) {
        Button button = new Button(this); button.setText(label); button.setTextSize(15); button.setAllCaps(false); button.setTextColor(TEXT);
        button.setMinHeight(dp(42)); button.setMinimumHeight(dp(42)); button.setPadding(dp(14), dp(5), dp(14), dp(5)); button.setBackground(focus(SURFACE)); button.setOnClickListener(view -> action.run()); return button;
    }
    private Button primary(String label, Runnable action) { Button view = button(label, action); view.setBackground(focus(ACCENT)); view.setTextColor(0xff07232b); return view; }
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
    private ScrollView scroller(LinearLayout body) { ScrollView scroll = new ScrollView(this); scroll.setClipToPadding(false); scroll.addView(body); return scroll; }

    private void showServer(String current) {
        ++libraryGeneration; serverScreen = true; LinearLayout root = column(); root.setBackgroundColor(BG); root.setGravity(Gravity.CENTER_VERTICAL); root.setPadding(dp(48), dp(28), dp(48), dp(28)); setContentView(root);
        root.addView(heading("JavJaeger · 电视影院", 34)); root.addView(text("连接现有服务器，浏览与播放你的本地收藏。", 18, DIM)); root.addView(text("服务器地址（HTTP / HTTPS）", 17, TEXT));
        EditText address = input("服务器地址", "http://192.168.1.10:8000"); address.setInputType(android.text.InputType.TYPE_CLASS_TEXT | android.text.InputType.TYPE_TEXT_VARIATION_URI); address.setText(current); root.addView(address, new LinearLayout.LayoutParams(-1, dp(52)));
        TextView error = text("仅保存不含账号、密码或令牌的服务器地址。", 16, DIM); root.addView(error);
        Button connect = primary("连接服务器", () -> {
            try { String normalized = LibraryClient.normalizeServer(address.getText().toString()); hideKeyboard(address); connect(normalized, true); }
            catch (IllegalArgumentException invalid) { error.setText("地址无效，请输入完整 HTTP / HTTPS 地址，不要包含账号、密码、查询参数或令牌。"); }
        }); root.addView(connect); connect.requestFocus();
        if (!current.isEmpty()) root.addView(button("返回影院", () -> { createShell(); render(false); }));
    }
    private void connect(String server, boolean save) {
        try { client = new LibraryClient(server); } catch (IllegalArgumentException invalid) { showServer(""); return; }
        library = new CinemaLibrary(Collections.emptyList()); createShell(); loadLibrary(save);
    }
    private void createShell() {
        serverScreen = false; shell = column(); shell.setBackgroundColor(BG); setContentView(shell); LinearLayout top = row(); top.setPadding(dp(30), dp(10), dp(30), dp(5));
        LinearLayout identity = column(); identity.addView(heading("JavJaeger", 21)); badge = text(deployment.replace(" · ", "\n"), 10, DIM); badge.setMaxLines(2); badge.setEllipsize(TextUtils.TruncateAt.END); identity.addView(badge); top.addView(identity, new LinearLayout.LayoutParams(dp(175), -2));
        search = input("搜索影片", "搜索影片、番号、演员"); search.setImeOptions(EditorInfo.IME_ACTION_SEARCH); search.setText(query); top.addView(search, new LinearLayout.LayoutParams(0, dp(42), 1));
        Button find = button("搜索", () -> { hideKeyboard(search); render(true); }); gap(top, 8); top.addView(find);
        Button clear = button("×", () -> { search.setText(""); hideKeyboard(search); render(true); }); clear.setContentDescription("清空影院搜索"); gap(top, 6); top.addView(clear, new LinearLayout.LayoutParams(dp(42), dp(42)));
        refresh = button("刷新", () -> loadLibrary(false)); gap(top, 8); top.addView(refresh); gap(top, 8); top.addView(button("管理界面", () -> openManagement(""))); gap(top, 8);
        Button server = button("服务器", () -> showServer(client.getBaseUrl())); server.setContentDescription("更换服务器"); top.addView(server); shell.addView(top);
        LinearLayout nav = row(); nav.setPadding(dp(30), 0, dp(30), dp(6)); tabButtons.clear();
        for (String name : TABS) { Button item = button(name, () -> navigate(name)); item.setBackground(focus(Color.TRANSPARENT)); tabButtons.put(name, item); nav.addView(item, new LinearLayout.LayoutParams(dp(100), dp(44))); gap(nav, 6); }
        shell.addView(nav); content = new FrameLayout(this); shell.addView(content, new LinearLayout.LayoutParams(-1, 0, 1));
        watch(search, value -> { if (changingSearch) return; query = value; tab = "全部影片"; actor = ""; tagResults = false; wallPage = 0; render(false); });
        search.setOnEditorActionListener((view, action, event) -> { if (action != EditorInfo.IME_ACTION_SEARCH) return false; hideKeyboard(search); render(true); return true; });
    }
    private void navigate(String name) { tab = name; actor = ""; tagResults = false; query = ""; wallPage = 0; shelfPage = 0; setSearchText(""); hideKeyboard(search); render(false); tabButtons.get(name).requestFocus(); }
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
    private void render(boolean focusMovies) {
        String previousFocus = focusKey(getCurrentFocus());
        images.clearPending(); wallScroll = null; wallCards.clear(); content.removeAllViews(); for (String name : TABS) chosen(tabButtons.get(name), name.equals(tab));
        if (!focusMovies && !previousFocus.isEmpty()) restoreFocus(previousFocus);
        if (loading && library.movies.isEmpty()) { LinearLayout body = paddedColumn(); body.addView(heading("正在读取影视库…", 25)); content.addView(body); return; }
        if (library.movies.isEmpty()) { LinearLayout body = paddedColumn(); body.addView(heading("开始建立你的影院", 28)); body.addView(text("添加媒体路径并扫描入库后，即可在这里浏览和播放。", 18, DIM)); body.addView(button("配置影视库", () -> openManagement(""))); content.addView(body); return; }
        if (tab.equals("推荐")) renderShelves(library.homeShelves(), true);
        else if (tab.equals("VR")) renderShelves(library.vrShelves(), false);
        else if (tab.equals("演员") && actor.isEmpty()) renderActors();
        else if (tab.equals("标签") && !tagResults) renderTags(); else renderWall(focusMovies);
    }
    private Movie hero() { for (Movie movie : library.movies) if (movie.id.equals(heroId)) return movie; return library.movies.get(0); }
    private void renderShelves(List<CinemaLibrary.Shelf> shelves, boolean home) {
        LinearLayout body = column(); if (home) body.addView(heroView(hero()), new LinearLayout.LayoutParams(-1, dp(270))); LinearLayout sections = paddedColumn();
        if (!home) { sections.addView(heading("VR 影厅", 27)); sections.addView(text(shelves.size() + " 个分区", 14, DIM)); }
        CinemaLibrary.Page<CinemaLibrary.Shelf> page = CinemaLibrary.page(shelves, shelfPage, 6); shelfPage = page.index;
        for (CinemaLibrary.Shelf shelf : page.items) {
            LinearLayout header = row(); header.addView(heading(shelf.name, 21)); gap(header, 12); header.addView(text(shelf.movies.size() + " 部", 13, DIM)); header.addView(new View(this), new LinearLayout.LayoutParams(0, 1, 1));
            HorizontalScrollView track = new HorizontalScrollView(this); track.setHorizontalScrollBarEnabled(false); track.setClipToPadding(false); header.addView(button("查看全部", () -> openShelf(shelf, home)));
            Button previous = button("‹", () -> track.smoothScrollBy(-Math.round(track.getWidth() * .85f), 0)); previous.setContentDescription("上一组 " + shelf.name); gap(header, 8); header.addView(previous);
            Button next = button("›", () -> track.smoothScrollBy(Math.round(track.getWidth() * .85f), 0)); next.setContentDescription("下一组 " + shelf.name); gap(header, 8); header.addView(next); sections.addView(header);
            LinearLayout cards = row(); cards.setPadding(dp(3), dp(8), dp(3), dp(8));
            for (Movie movie : shelf.movies.subList(0, Math.min(12, shelf.movies.size()))) { LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(dp(140), dp(252)); params.rightMargin = dp(16); cards.addView(movieCard(movie, true), params); }
            track.addView(cards); sections.addView(track); gap(sections, 22);
        }
        if (shelves.isEmpty()) { sections.addView(heading("暂无 VR 影片", 25)); sections.addView(text("扫描或补全影片资料后，在这里浏览你的收藏。", 17, DIM)); sections.addView(button("浏览全部影片", () -> navigate("全部影片"))); }
        addPager(sections, page, index -> { shelfPage = index; render(false); }); body.addView(sections); content.addView(scroller(body));
    }
    private FrameLayout heroView(Movie movie) {
        FrameLayout hero = new FrameLayout(this); ImageView backdrop = new ImageView(this); backdrop.setScaleType(ImageView.ScaleType.CENTER_CROP); hero.addView(backdrop, new FrameLayout.LayoutParams(-1, -1)); images.load(client.backdropUrl(movie), backdrop, 1280, 720);
        View shade = new View(this); shade.setBackground(new GradientDrawable(GradientDrawable.Orientation.LEFT_RIGHT, new int[]{BG, 0xe6101114, 0x55101114})); hero.addView(shade, new FrameLayout.LayoutParams(-1, -1));
        View bottom = new View(this); bottom.setBackground(new GradientDrawable(GradientDrawable.Orientation.BOTTOM_TOP, new int[]{BG, Color.TRANSPARENT})); hero.addView(bottom, new FrameLayout.LayoutParams(-1, -1));
        LinearLayout layout = row(); layout.setPadding(dp(34), dp(12), dp(52), dp(14)); LinearLayout copy = column(); TextView title = heading(movie.title, 30); title.setMaxLines(2); title.setEllipsize(TextUtils.TruncateAt.END); copy.addView(title); copy.addView(text(movieMeta(movie), 14, 0xffc0c7d1));
        TextView synopsis = text(description(movie), 15, 0xffc0c7d1); synopsis.setMaxLines(2); synopsis.setEllipsize(TextUtils.TruncateAt.END); copy.addView(synopsis);
        LinearLayout actions = row(); Button play = primary(movie.unavailable ? "文件缺失" : "播放", () -> playFirst(movie)); play.setEnabled(!movie.unavailable); actions.addView(play); gap(actions, 12); actions.addView(button("影片详情", () -> showDetail(movie.id))); copy.addView(actions); layout.addView(copy, new LinearLayout.LayoutParams(0, -2, 1)); gap(layout, 40);
        ImageView poster = new ImageView(this); poster.setScaleType(ImageView.ScaleType.CENTER_CROP); poster.setBackground(shape(SURFACE, 0, false)); poster.setClipToOutline(true); layout.addView(poster, new LinearLayout.LayoutParams(dp(150), dp(225))); images.load(client.posterUrl(movie), poster); hero.addView(layout, new FrameLayout.LayoutParams(-1, -1)); return hero;
    }
    private void openShelf(CinemaLibrary.Shelf shelf, boolean home) {
        clearFilters(); query = ""; actor = ""; wallPage = 0; tab = "全部影片"; tagResults = false;
        if (!home || shelf.name.equals("VR 影厅")) filters.get("flag").add("VR");
        if (!home || shelf.name.equals("高清收藏")) for (Movie movie : shelf.movies) filters.get("res").add(movie.quality);
        setSearchText(""); render(true);
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
        if (page.items.isEmpty()) directory.addView(text("没有匹配选项", 18, DIM)); addPager(directory, page, next -> { tagPage = next; renderTagDirectory(directory); });
    }
    private void renderActors() {
        LinearLayout body = paddedColumn(); body.addView(heading("演员", 27)); List<CinemaLibrary.Actor> actors = library.actors(); body.addView(text(actors.size() + " 位本地演员", 14, DIM)); CinemaLibrary.Page<CinemaLibrary.Actor> page = CinemaLibrary.page(actors, actorPage, 60); actorPage = page.index;
        LinearLayout line = null; int index = 0;
        for (CinemaLibrary.Actor item : page.items) {
            if (index++ % 6 == 0) { line = row(); line.setGravity(Gravity.TOP); body.addView(line); }
            LinearLayout card = column(); card.setGravity(Gravity.CENTER_HORIZONTAL); card.setPadding(dp(8), dp(10), dp(8), dp(10)); card.setBackground(focus(Color.TRANSPARENT)); card.setFocusable(true); card.setContentDescription("查看演员：" + item.name);
            FrameLayout avatar = new FrameLayout(this); avatar.setBackground(shape(SURFACE, 0, true)); avatar.setClipToOutline(true); TextView initial = text(item.name.isEmpty() ? "?" : item.name.substring(0, 1), 36, DIM); initial.setGravity(Gravity.CENTER); avatar.addView(initial, new FrameLayout.LayoutParams(-1, -1));
            ImageView image = new ImageView(this); image.setScaleType(ImageView.ScaleType.CENTER_CROP); avatar.addView(image, new FrameLayout.LayoutParams(-1, -1)); if (item.avatarAvailable) images.load(client.actorAvatarUrl(item), image, 256, 256);
            card.addView(avatar, new LinearLayout.LayoutParams(dp(112), dp(112))); card.addView(text(item.name, 16, TEXT)); card.addView(text(item.count + " 部", 14, DIM)); card.setOnClickListener(view -> { actor = item.name; clearFilters(); wallPage = 0; render(true); });
            LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(0, dp(204), 1); params.setMargins(dp(5), dp(4), dp(5), dp(8)); line.addView(card, params);
        }
        if (actors.isEmpty()) { body.addView(heading("暂无演员信息", 24)); body.addView(text("补全影片资料后，演员会出现在这里。", 17, DIM)); }
        addPager(body, page, next -> { actorPage = next; render(false); }); content.addView(scroller(body));
    }
    private void renderWall(boolean focusMovies) {
        LinearLayout body = paddedColumn(); body.setPadding(dp(32), dp(8), dp(32), dp(12)); content.addView(body);
        if (!actor.isEmpty()) body.addView(button("全部演员", () -> { actor = ""; clearFilters(); render(false); })); else if (tab.equals("标签") && tagResults) body.addView(button("全部标签", () -> { tagResults = false; render(false); }));
        List<Movie> matches = library.browse(query, actor, filters, sort, allTags); CinemaLibrary.Page<Movie> page = CinemaLibrary.page(matches, wallPage, 60); wallPage = page.index; visibleMovies = page.items;
        LinearLayout titleRow = row(); String title = !actor.isEmpty() ? actor : !query.trim().isEmpty() ? "搜索结果" : tab.equals("标签") ? "标签影片" : "全部影片"; titleRow.addView(heading(title, 25)); gap(titleRow, 16); titleRow.addView(text("共 " + matches.size() + " 部", 14, DIM)); titleRow.addView(new View(this), new LinearLayout.LayoutParams(0, 1, 1)); titleRow.addView(button("筛选影片", this::showFilters)); gap(titleRow, 10);
        Spinner sorting = new Spinner(this); sorting.setContentDescription("影院排序"); ArrayAdapter<String> options = new ArrayAdapter<>(this, android.R.layout.simple_spinner_dropdown_item, SORTS); sorting.setAdapter(options); sorting.setSelection(Arrays.asList(SORTS).indexOf(sort)); sorting.setBackground(focus(SURFACE)); sorting.setOnItemSelectedListener(new AdapterView.OnItemSelectedListener() { @Override public void onNothingSelected(AdapterView<?> parent) { } @Override public void onItemSelected(AdapterView<?> parent, View view, int position, long id) { if (!sort.equals(SORTS[position])) { sort = SORTS[position]; wallPage = 0; render(false); } } }); titleRow.addView(sorting, new LinearLayout.LayoutParams(dp(135), dp(44))); body.addView(titleRow);
        if (filterCount() > 0) body.addView(activeFilters());
        if (tagResults || !filters.get("flag").isEmpty()) {
            LinearLayout modes = row();
            Button any = button("匹配任一标签", () -> { allTags = false; wallPage = 0; render(false); });
            Button every = button("匹配全部标签", () -> { allTags = true; wallPage = 0; render(false); });
            chosen(any, !allTags); chosen(every, allTags); modes.addView(any); gap(modes, 10); modes.addView(every); body.addView(modes);
        }
        if (page.items.isEmpty()) { body.addView(heading("没有符合条件的影片", 24)); body.addView(text("试试其他关键词，或移除筛选条件。", 17, DIM)); body.addView(button("清空条件", () -> { clearFilters(); query = ""; setSearchText(""); render(false); })); return; }
        ScrollView scroll = new ScrollView(this); wallScroll = scroll;
        scroll.setTag("影片库"); scroll.setPadding(dp(3), dp(8), dp(3), dp(8)); scroll.setClipToPadding(false); scroll.setFocusable(false);
        LinearLayout rows = column(); scroll.addView(rows); body.addView(scroll, new LinearLayout.LayoutParams(-1, 0, 1));
        // ponytail: at most 60 real focusable cards per page; use RecyclerView if that cap grows.
        scroll.addOnLayoutChangeListener((view, left, top, right, bottom, oldLeft, oldTop, oldRight, oldBottom) -> {
            if (right - left == oldRight - oldLeft && bottom - top == oldBottom - oldTop || wallScroll != scroll) return;
            int height = Math.min(dp(252), Math.max(dp(100), bottom - top - dp(16)));
            int width = Math.max(dp(40), (height - dp(52)) * 2 / 3 + dp(6));
            int columns = Math.max(1, (right - left - dp(6) + dp(16)) / (width + dp(16)));
            rows.removeAllViews(); wallCards.clear(); LinearLayout line = null; int index = 0;
            for (Movie movie : page.items) {
                if (index++ % columns == 0) { line = row(); line.setGravity(Gravity.TOP); rows.addView(line); }
                LinearLayout card = movieCard(movie, true); wallCards.put(movie.id, card);
                LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(width, height); params.setMargins(0, 0, dp(16), dp(20)); line.addView(card, params);
            }
            if (focusMovies) restoreGridFocus();
        });
        addPager(body, page, next -> { wallPage = next; selectedId = ""; render(true); });
    }
    private LinearLayout movieCard(Movie movie, boolean clickable) {
        LinearLayout card = column(); card.setImportantForAccessibility(View.IMPORTANT_FOR_ACCESSIBILITY_YES); card.setPadding(dp(3), dp(3), dp(3), dp(3)); card.setBackground(focus(Color.TRANSPARENT)); FrameLayout art = new FrameLayout(this); art.setBackground(new GradientDrawable(GradientDrawable.Orientation.TL_BR, new int[]{0xff303745, 0xff181c25})); art.setClipToOutline(true);
        TextView placeholder = text("▣\n" + movie.id, 16, DIM); placeholder.setGravity(Gravity.CENTER); art.addView(placeholder, new FrameLayout.LayoutParams(-1, -1)); ImageView image = new ImageView(this); image.setScaleType(ImageView.ScaleType.CENTER_CROP); art.addView(image, new FrameLayout.LayoutParams(-1, -1));
        TextView quality = text(movie.quality, 11, TEXT); quality.setPadding(dp(6), dp(2), dp(6), dp(2)); quality.setBackgroundColor(0xcc080d16); FrameLayout.LayoutParams qualityParams = new FrameLayout.LayoutParams(-2, -2, Gravity.BOTTOM | Gravity.RIGHT); qualityParams.setMargins(0, 0, dp(6), dp(6)); art.addView(quality, qualityParams);
        TextView missing = text("文件缺失", 11, TEXT); missing.setBackgroundColor(0xdd762d3c); FrameLayout.LayoutParams missingParams = new FrameLayout.LayoutParams(-2, -2, Gravity.TOP | Gravity.LEFT); missingParams.setMargins(dp(6), dp(6), 0, 0); art.addView(missing, missingParams);
        card.addView(art, new LinearLayout.LayoutParams(-1, 0, 1)); TextView title = text(movie.title, 15, TEXT); title.setMaxLines(1); title.setEllipsize(TextUtils.TruncateAt.END); card.addView(title); card.addView(text("", 12, DIM)); bindCard(card, movie);
        if (clickable) { card.setFocusable(true); card.setOnFocusChangeListener((view, focused) -> { if (focused) selectedId = movie.id; }); card.setOnClickListener(view -> { selectedId = movie.id; showDetail(movie.id); }); } return card;
    }
    private void bindCard(LinearLayout card, Movie movie) {
        card.setContentDescription(movie.id + " " + movie.title); FrameLayout art = (FrameLayout) card.getChildAt(0); ((TextView) art.getChildAt(0)).setText("▣\n" + movie.id); images.load(client.posterUrl(movie), (ImageView) art.getChildAt(1), 320, 480);
        ((TextView) art.getChildAt(2)).setText(movie.quality); art.getChildAt(2).setVisibility(movie.quality.isEmpty() ? View.GONE : View.VISIBLE); art.getChildAt(3).setVisibility(movie.unavailable ? View.VISIBLE : View.GONE); ((TextView) card.getChildAt(1)).setText(movie.title); ((TextView) card.getChildAt(2)).setText(join(movie.id, movie.year));
    }
    private HorizontalScrollView activeFilters() {
        HorizontalScrollView scroll = new HorizontalScrollView(this); LinearLayout chips = row();
        for (int i = 0; i < DIMENSIONS.length; i++) { String key = DIMENSIONS[i]; if (key.equals("actor") && !actor.isEmpty()) continue; String label = DIMENSION_NAMES[i]; for (String value : filters.get(key)) { Button chip = button(label + " · " + value + " ×", () -> { filters.get(key).remove(value); wallPage = 0; render(false); }); chip.setContentDescription("移除 " + label + " · " + value); chips.addView(chip); gap(chips, 7); } }
        chips.addView(button("清空 " + filterCount() + " 个条件", () -> { clearFilters(); query = ""; setSearchText(""); wallPage = 0; render(false); })); scroll.addView(chips); return scroll;
    }
    private int filterCount() { int count = 0; for (Map.Entry<String, LinkedHashSet<String>> item : filters.entrySet()) if (!item.getKey().equals("actor") || actor.isEmpty()) count += item.getValue().size(); return count; }
    private void clearFilters() { for (LinkedHashSet<String> values : filters.values()) values.clear(); allTags = false; }
    private void toggle(String dimension, String value) { LinkedHashSet<String> values = filters.get(dimension); if (!values.remove(value)) values.add(value); wallPage = 0; }
    private void setSearchText(String value) { changingSearch = true; search.setText(value); changingSearch = false; }
    private void showFilters() {
        Dialog dialog = new Dialog(this); dialog.requestWindowFeature(Window.FEATURE_NO_TITLE); LinearLayout body = paddedColumn(); body.setBackgroundColor(BG); LinearLayout top = row(); top.addView(heading("筛选影片", 26), new LinearLayout.LayoutParams(0, -2, 1)); top.addView(button("完成", dialog::dismiss)); body.addView(top);
        final String[] dimension = {actor.isEmpty() ? "actor" : "studio"}; final int[] optionPage = {0}; LinearLayout dimensions = row(); body.addView(dimensions); EditText optionQuery = input("搜索筛选选项", "搜索选项"); body.addView(optionQuery, new LinearLayout.LayoutParams(-1, dp(46))); ScrollView scroll = new ScrollView(this); LinearLayout choices = column(); scroll.addView(choices); body.addView(scroll, new LinearLayout.LayoutParams(-1, 0, 1)); Map<String, Button> dimensionButtons = new LinkedHashMap<>();
        Runnable[] update = new Runnable[1]; update[0] = () -> {
            choices.removeAllViews(); String key = dimension[0]; String name = DIMENSION_NAMES[Arrays.asList(DIMENSIONS).indexOf(key)]; optionQuery.setContentDescription("搜索" + name + "选项"); optionQuery.setHint("搜索" + name + "选项"); for (String dim : dimensionButtons.keySet()) chosen(dimensionButtons.get(dim), dim.equals(key));
            if (key.equals("flag")) { LinearLayout modes = row(); Button any = button("匹配任一标签", () -> { allTags = false; update[0].run(); }); Button every = button("匹配全部标签", () -> { allTags = true; update[0].run(); }); chosen(any, !allTags); chosen(every, allTags); modes.addView(any); gap(modes, 10); modes.addView(every); choices.addView(modes); }
            Map<String, Integer> counts = library.facetCounts(key, actor, optionQuery.getText().toString()); CinemaLibrary.Page<Map.Entry<String, Integer>> page = CinemaLibrary.page(new ArrayList<>(counts.entrySet()), optionPage[0], 60); optionPage[0] = page.index;
            for (Map.Entry<String, Integer> item : page.items) { CheckBox option = new CheckBox(this); option.setText(item.getKey() + "  " + item.getValue()); option.setTextSize(17); option.setTextColor(TEXT); option.setButtonTintList(android.content.res.ColorStateList.valueOf(ACCENT)); option.setContentDescription("筛选" + name + "：" + item.getKey()); option.setBackground(focus(SURFACE)); option.setMinHeight(dp(44)); option.setChecked(filters.get(key).contains(item.getKey())); option.setOnClickListener(view -> toggle(key, item.getKey())); choices.addView(option); }
            if (page.items.isEmpty()) choices.addView(text("没有匹配选项", 18, DIM)); addPager(choices, page, next -> { optionPage[0] = next; update[0].run(); }); choices.addView(button("清空条件", () -> { clearFilters(); optionPage[0] = 0; update[0].run(); }));
        };
        for (int i = 0; i < DIMENSIONS.length; i++) { String key = DIMENSIONS[i]; if (key.equals("actor") && !actor.isEmpty()) continue; Button item = button(DIMENSION_NAMES[i], () -> { dimension[0] = key; optionPage[0] = 0; optionQuery.setText(""); update[0].run(); }); dimensions.addView(item); gap(dimensions, 8); dimensionButtons.put(key, item); }
        watch(optionQuery, value -> { optionPage[0] = 0; update[0].run(); }); update[0].run(); dialog.setContentView(body); dialog.setOnDismissListener(ignored -> render(false)); dialog.show(); dialog.getWindow().setLayout((int)(getResources().getDisplayMetrics().widthPixels * .86), (int)(getResources().getDisplayMetrics().heightPixels * .9));
    }
    private void showDetail(String id) {
        selectedId = id; heroId = id; final int generation = ++detailGeneration; Dialog dialog = new Dialog(this); dialog.requestWindowFeature(Window.FEATURE_NO_TITLE); LinearLayout body = column(); body.setBackgroundColor(BG); body.setPadding(dp(24), dp(12), dp(24), dp(20)); body.addView(heading("正在读取影片详情…", 25)); dialog.setContentView(body); detailDialog = dialog;
        dialog.setOnDismissListener(ignored -> { ++detailGeneration; if (detailDialog == dialog) detailDialog = null; restoreGridFocus(); }); dialog.show(); dialog.getWindow().setLayout((int)(getResources().getDisplayMetrics().widthPixels * .97), (int)(getResources().getDisplayMetrics().heightPixels * .96));
        LibraryClient requested = client; network.execute(() -> {
            try { Movie movie = requested.loadMovie(id); runOnUiThread(() -> { if (!isDestroyed() && generation == detailGeneration && dialog.isShowing()) renderDetail(dialog, body, movie); }); }
            catch (Exception absent) { runOnUiThread(() -> { if (isDestroyed() || generation != detailGeneration || !dialog.isShowing()) return; body.removeAllViews(); body.addView(text("无法读取详情，请检查网络或在服务器重新扫描影片库。", 22, TEXT)); body.addView(button("返回浏览", dialog::dismiss)); }); }
        });
    }
    private void renderDetail(Dialog dialog, LinearLayout body, Movie movie) {
        body.removeAllViews(); LinearLayout top = row(); top.addView(button("返回浏览", dialog::dismiss)); gap(top, 16); top.addView(heading(movie.id + " · " + movie.title, 23), new LinearLayout.LayoutParams(0, -2, 1)); Button close = button("×", dialog::dismiss); close.setContentDescription("关闭影片详情"); top.addView(close); body.addView(top); gap(body, 10);
        FrameLayout scene = new FrameLayout(this); ImageView backdrop = new ImageView(this); backdrop.setScaleType(ImageView.ScaleType.CENTER_CROP); backdrop.setAlpha(.2f); scene.addView(backdrop, new FrameLayout.LayoutParams(-1, -1)); images.load(client.backdropUrl(movie), backdrop, 1280, 720); LinearLayout columns = new LinearLayout(this); columns.setGravity(Gravity.TOP);
        ImageView poster = new ImageView(this); poster.setScaleType(ImageView.ScaleType.FIT_CENTER); columns.addView(poster, new LinearLayout.LayoutParams(dp(155), dp(233))); images.load(client.posterUrl(movie), poster);
        LinearLayout info = column(); info.setPadding(dp(22), 0, dp(20), dp(12)); info.addView(text(movieMeta(movie), 14, DIM)); info.addView(text(description(movie), 16, TEXT));
        for (String[] fact : new String[][]{{"发行日期", movie.date}, {"制作商", movie.studio}, {"系列", movie.series}, {"导演", movie.director}, {"本地文件", movie.files.size() + " 个 · " + movie.size}}) if (!fact[1].isEmpty() && !fact[1].equals("—")) info.addView(text(fact[0] + "  " + fact[1], 14, DIM));
        info.addView(button("在影视库中管理", () -> openManagement(movie.id))); info.addView(heading("演员与标签", 18));
        for (String name : movie.actors) { Button option = button(name, () -> { actor = name; tab = "演员"; query = ""; clearFilters(); wallPage = 0; setSearchText(""); dialog.dismiss(); render(true); }); option.setContentDescription("演员：" + name); info.addView(option); }
        for (String name : movie.tags) { Button option = button(name, () -> { clearFilters(); filters.get("flag").add(name); actor = ""; query = ""; tab = "标签"; tagResults = true; wallPage = 0; setSearchText(""); dialog.dismiss(); render(true); }); option.setContentDescription("标签：" + name); info.addView(option); }
        if (movie.actors.isEmpty() && movie.tags.isEmpty()) info.addView(text("暂无演员与标签资料", 15, DIM)); columns.addView(scroller(info), new LinearLayout.LayoutParams(0, -1, 1));
        LinearLayout files = column(); files.setPadding(dp(8), 0, 0, 0); files.addView(heading("播放文件", 21)); files.addView(text("选择版本或分段", 14, DIM)); List<Movie.VideoFile> playable = new ArrayList<>(); for (Movie.VideoFile file : movie.files) if (!file.missing) playable.add(file);
        Spinner selector = new Spinner(this); selector.setContentDescription("详情播放文件"); List<String> labels = new ArrayList<>(); for (Movie.VideoFile file : movie.files) labels.add((file.index + 1) + ". " + file.label + (file.missing ? "（文件缺失）" : "")); ArrayAdapter<String> options = new ArrayAdapter<String>(this, android.R.layout.simple_spinner_dropdown_item, labels) { @Override public boolean areAllItemsEnabled() { return false; } @Override public boolean isEnabled(int index) { return !movie.files.get(index).missing; } }; selector.setAdapter(options); selector.setBackground(focus(SURFACE)); selector.setEnabled(!playable.isEmpty()); if (!playable.isEmpty()) selector.setSelection(movie.files.indexOf(playable.get(0))); files.addView(selector, new LinearLayout.LayoutParams(-1, dp(44)));
        TextView fileMeta = text("", 13, DIM); files.addView(fileMeta); final Movie.VideoFile[] selected = {playable.isEmpty() ? null : playable.get(0)}; Runnable updateMeta = () -> fileMeta.setText(selected[0] == null ? "没有可用文件" : join(selected[0].size, selected[0].codec, selected[0].quality)); updateMeta.run(); selector.setOnItemSelectedListener(new AdapterView.OnItemSelectedListener() { @Override public void onNothingSelected(AdapterView<?> parent) { } @Override public void onItemSelected(AdapterView<?> parent, View view, int index, long id) { if (movie.files.get(index).missing) return; selected[0] = movie.files.get(index); updateMeta.run(); } });
        Button play = primary("播放所选文件", () -> { if (selected[0] != null) startPlayback(movie, selected[0].index); }); play.setEnabled(!playable.isEmpty()); files.addView(play); Button first = null;
        for (Movie.VideoFile file : movie.files) { Button direct = button("播放：" + file.label, () -> { selector.setSelection(movie.files.indexOf(file)); startPlayback(movie, file.index); }); direct.setEnabled(!file.missing); direct.setAlpha(file.missing ? .45f : 1f); direct.setContentDescription("播放：" + file.label); LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(-1, -2); params.topMargin = dp(6); files.addView(direct, params); if (!file.missing && first == null) first = direct; }
        files.addView(text("原画播放；多段影片按原顺序跳过缺失文件。", 13, DIM)); columns.addView(scroller(files), new LinearLayout.LayoutParams(dp(290), -1)); scene.addView(columns, new FrameLayout.LayoutParams(-1, -1)); body.addView(scene, new LinearLayout.LayoutParams(-1, 0, 1)); if (first != null) first.requestFocus(); else play.requestFocus();
    }
    private void playFirst(Movie movie) { for (Movie.VideoFile file : movie.files) if (!file.missing) { startPlayback(movie, file.index); return; } }
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
        if (page.pages <= 1) return; LinearLayout pager = row(); pager.setGravity(Gravity.CENTER); pager.setPadding(0, dp(12), 0, dp(8)); Button previous = button("上一页", () -> change.accept(page.index - 1)); previous.setEnabled(page.index > 0); pager.addView(previous); gap(pager, 16); pager.addView(text("第 " + (page.index + 1) + " / " + page.pages + " 页 · 共 " + page.total + " 项", 14, DIM)); gap(pager, 16); Button next = button("下一页", () -> change.accept(page.index + 1)); next.setEnabled(page.index < page.pages - 1); pager.addView(next); parent.addView(pager);
    }
    private void restoreGridFocus() { if (wallScroll == null) return; ScrollView expected = wallScroll; expected.post(() -> { if (isDestroyed() || detailDialog != null || wallScroll != expected || wallCards.isEmpty()) return; View card = wallCards.get(selectedId); if (card == null) card = wallCards.values().iterator().next(); card.requestFocus(); }); }
    private String focusKey(View view) { if (view == null) return ""; if (view.getContentDescription() != null) return "description:" + view.getContentDescription(); return view instanceof TextView ? "text:" + ((TextView)view).getText() : ""; }
    private View findFocus(View view, String key) { if (view.isFocusable() && key.equals(focusKey(view))) return view; if (view instanceof ViewGroup) for (int i = 0; i < ((ViewGroup)view).getChildCount(); i++) { View found = findFocus(((ViewGroup)view).getChildAt(i), key); if (found != null) return found; } return null; }
    private void restoreFocus(String key) { shell.post(() -> { if (isDestroyed()) return; if (key.equals("#grid")) restoreGridFocus(); else { View found = findFocus(shell, key); if (found != null) found.requestFocus(); } }); }
    @Override protected void onSaveInstanceState(Bundle state) {
        state.putString("focus", focusKey(getCurrentFocus())); state.putString("tab", tab); state.putString("query", query); state.putString("actor", actor); state.putString("tag_query", tagQuery); state.putString("sort", sort); state.putString("selected", selectedId); state.putString("hero", heroId); state.putBoolean("tag_results", tagResults); state.putBoolean("all_tags", allTags); state.putInt("wall_page", wallPage); state.putInt("tag_page", tagPage); state.putInt("actor_page", actorPage); state.putInt("shelf_page", shelfPage); for (String key : DIMENSIONS) state.putStringArrayList("filter_" + key, new ArrayList<>(filters.get(key))); super.onSaveInstanceState(state);
    }
    private void back() { if (serverScreen) { if (client == null) finish(); else { createShell(); render(false); } } else if (!actor.isEmpty()) { actor = ""; clearFilters(); render(false); } else if (tab.equals("标签") && tagResults) { tagResults = false; render(false); } else if (!tab.equals("推荐") && detailDialog == null) navigate("推荐"); else finish(); }
    @Override public boolean onKeyDown(int keyCode, KeyEvent event) { if (Build.VERSION.SDK_INT < 33 && keyCode == KeyEvent.KEYCODE_BACK) { if (event.getRepeatCount() == 0) back(); return true; } return super.onKeyDown(keyCode, event); }
    @Override protected void onDestroy() { ++libraryGeneration; ++detailGeneration; if (detailDialog != null) detailDialog.dismiss(); network.shutdownNow(); images.close(); super.onDestroy(); }
}
