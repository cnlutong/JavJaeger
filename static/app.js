(() => {
  // frontend/src/workbench/api.js
  async function api(path, options = {}) {
    const response = await fetch(path, {
      ...options,
      headers: options.body instanceof FormData ? options.headers : { "Content-Type": "application/json", ...options.headers || {} }
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      const detail = payload.detail;
      const message8 = typeof detail === "string" ? detail : detail?.message || payload.message || `\u8BF7\u6C42\u5931\u8D25 (${response.status})`;
      throw new Error(message8);
    }
    return payload;
  }
  function formData(values) {
    const body = new FormData();
    Object.entries(values).forEach(([key, value]) => body.append(key, value ?? ""));
    return body;
  }
  function formatBytes(value) {
    const bytes = Number(value || 0);
    if (!bytes) return "\u2014";
    const units = ["B", "KB", "MB", "GB", "TB"];
    const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
    return `${(bytes / 1024 ** index).toFixed(index > 2 ? 1 : 0)} ${units[index]}`;
  }
  function movieList(payload) {
    if (Array.isArray(payload)) return payload;
    return payload?.movies || payload?.records || payload?.items || [];
  }

  // frontend/src/workbench/ui.jsx
  var React = window.React;
  var { Typography, Tag } = window.antd;
  var { Title, Text } = Typography;
  function PageIntro({ title, description, actions }) {
    return /* @__PURE__ */ React.createElement("header", { className: "wb-page-intro" }, /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement(Title, { level: 2 }, title), /* @__PURE__ */ React.createElement(Text, { type: "secondary" }, description)), actions ? /* @__PURE__ */ React.createElement("div", { className: "wb-page-actions" }, actions) : null);
  }
  function StatusDot({ ready, children }) {
    return /* @__PURE__ */ React.createElement("span", { className: `wb-status ${ready ? "is-ready" : ""}` }, /* @__PURE__ */ React.createElement("i", null), children);
  }
  function StageRail({ active = 1 }) {
    return /* @__PURE__ */ React.createElement("div", { className: "wb-stage-rail", "aria-label": "\u81EA\u52A8\u5316\u5DE5\u4F5C\u6D41\u8FDB\u5EA6" }, [
      ["\u53D1\u73B0", "\u641C\u7D22\u5F71\u7247\u4E0E\u6761\u4EF6"],
      ["\u8D44\u6E90", "\u9009\u62E9\u6700\u4F73\u78C1\u529B"],
      ["\u6D3E\u53D1", "\u53D1\u9001\u5230\u4E0B\u8F7D\u5668"],
      ["\u5165\u5E93", "\u626B\u63CF\u6574\u7406\u4E0E\u547D\u540D"]
    ].map(([label, note], index) => /* @__PURE__ */ React.createElement("div", { key: label, className: `wb-stage ${index + 1 <= active ? "is-active" : ""}` }, /* @__PURE__ */ React.createElement("span", null, index + 1), /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("strong", null, label), /* @__PURE__ */ React.createElement("small", null, note)))));
  }
  function EmptyBlock({ title, description }) {
    return /* @__PURE__ */ React.createElement("div", { className: "wb-empty" }, /* @__PURE__ */ React.createElement(Tag, null, "JAVJAEGER"), /* @__PURE__ */ React.createElement("strong", null, title), /* @__PURE__ */ React.createElement(Text, { type: "secondary" }, description));
  }

  // frontend/src/utils/historyRedispatch.mjs
  var normalizeSource = (source, fallbackSource = "") => {
    const value = String(source || "").trim().toLowerCase();
    return value || String(fallbackSource || "").trim().toLowerCase();
  };
  var normalizeLink = (link) => String(link || "").trim();
  var selectHistoryRedispatchResource = (record, fallbackSource = "") => {
    const resources = Array.isArray(record?.download_resources) ? record.download_resources : [];
    for (let index = resources.length - 1; index >= 0; index -= 1) {
      const resource = resources[index];
      const link = normalizeLink(resource?.link || resource?.magnet || resource?.download_link || resource?.magnet_link);
      if (link) {
        return {
          link,
          source: normalizeSource(resource?.source || resource?.magnet_source || resource?.download_source, fallbackSource)
        };
      }
    }
    const links = Array.isArray(record?.download_links) ? record.download_links : [];
    for (let index = links.length - 1; index >= 0; index -= 1) {
      const link = normalizeLink(links[index]);
      if (link) {
        return {
          link,
          source: normalizeSource(record?.source || record?.magnet_source || record?.download_source, fallbackSource)
        };
      }
    }
    const singleLink = normalizeLink(record?.download_link || record?.magnet_link || record?.link || record?.magnet);
    if (singleLink) {
      return {
        link: singleLink,
        source: normalizeSource(record?.source || record?.magnet_source || record?.download_source, fallbackSource)
      };
    }
    return null;
  };
  var buildHistoryRedispatchPayload = (records, fallbackSource = "") => {
    return (Array.isArray(records) ? records : []).filter((record) => record?.needs_reselect && record?.movie_id).map((record) => {
      const resource = selectHistoryRedispatchResource(record, fallbackSource);
      if (!resource?.link) {
        return null;
      }
      return {
        link: resource.link,
        movie_id: String(record.movie_id || "").trim(),
        source: resource.source || normalizeSource("", fallbackSource)
      };
    }).filter(Boolean);
  };

  // frontend/src/utils/jobPolling.mjs
  async function waitForJob(api2, path, onUpdate = () => {
  }, interval = 500) {
    for (; ; ) {
      const job = await api2(path);
      onUpdate(job);
      if (!["queued", "running"].includes(job.status)) {
        if (job.status === "failed") throw new Error(job.message || "\u4EFB\u52A1\u6267\u884C\u5931\u8D25");
        return job.result || job;
      }
      if (interval) await new Promise((resolve) => setTimeout(resolve, interval));
    }
  }

  // frontend/src/workbench/pages/DiscoverPage.jsx
  var React2 = window.React;
  var {
    Alert,
    Button,
    Checkbox,
    Descriptions,
    Drawer,
    Form,
    Input,
    List,
    Modal,
    Popconfirm,
    Progress,
    Segmented,
    Select,
    Space,
    Spin,
    Switch,
    Table,
    Tabs,
    Tag: Tag2,
    Typography: Typography2,
    message
  } = window.antd;
  var { Text: Text2, Title: Title2 } = Typography2;
  var icons = window.icons || {};
  var SOURCE_LABELS = { javbus: "JavBus", cilisousuo: "Cilisiusou", yhg007: "YHG007" };
  var TARGET_LABELS = { pikpak: "PikPak", "115": "115", aria2: "Aria2" };
  function posterUrl(movie) {
    const raw = movie.img || movie.cover_url || movie.poster_url || "";
    return /^https?:/i.test(raw) ? `/api/image-proxy?url=${encodeURIComponent(raw)}` : raw;
  }
  function names(values) {
    return (values || []).map((item) => item?.name || item).filter(Boolean);
  }
  function DiscoverPage({ clientConfig, connections, refreshRuntime, navigate }) {
    const [query, setQuery] = React2.useState("");
    const [movies, setMovies] = React2.useState([]);
    const [magnets, setMagnets] = React2.useState({});
    const [downloaded, setDownloaded] = React2.useState(/* @__PURE__ */ new Set());
    const [selectedMovieKeys, setSelectedMovieKeys] = React2.useState([]);
    const [selectedMagnetLink, setSelectedMagnetLink] = React2.useState("");
    const [loading, setLoading] = React2.useState(false);
    const [filterOpen, setFilterOpen] = React2.useState(false);
    const [recognizeOpen, setRecognizeOpen] = React2.useState(false);
    const [batchOpen, setBatchOpen] = React2.useState(false);
    const [batchProgress, setBatchProgress] = React2.useState(null);
    const [accountOpen, setAccountOpen] = React2.useState(false);
    const [dispatchMovie, setDispatchMovie] = React2.useState(null);
    const [dispatchProgress, setDispatchProgress] = React2.useState(null);
    const [pan115DispatchMode, setPan115DispatchMode] = React2.useState("background");
    const [historyOpen, setHistoryOpen] = React2.useState(false);
    const [history, setHistory] = React2.useState([]);
    const [detailsMovie, setDetailsMovie] = React2.useState(null);
    const [actor, setActor] = React2.useState(null);
    const [pikpakLoggedIn, setPikpakLoggedIn] = React2.useState(false);
    const [pan115Status, setPan115Status] = React2.useState({});
    const [qrSession, setQrSession] = React2.useState(null);
    const [target, setTarget] = React2.useState(() => window.localStorage.getItem("wb-download-target") || "pikpak");
    const [source, setSource] = React2.useState("javbus");
    const [exclude4k, setExclude4k] = React2.useState(false);
    const [subtitle, setSubtitle] = React2.useState("");
    const [filterForm] = Form.useForm();
    const [recognizeForm] = Form.useForm();
    const [batchForm] = Form.useForm();
    const [pikpakForm] = Form.useForm();
    const [cookieForm] = Form.useForm();
    const refresh115 = React2.useCallback(async () => {
      try {
        setPan115Status(await api("/api/115/status"));
      } catch {
        setPan115Status({ connected: false });
      }
    }, []);
    React2.useEffect(() => {
      void refresh115();
    }, [refresh115]);
    React2.useEffect(() => {
      if (!qrSession?.session_id || ["allowed", "expired", "canceled"].includes(qrSession.state)) return void 0;
      const timer = window.setInterval(async () => {
        try {
          const status = await api(`/api/115/qrcode/${encodeURIComponent(qrSession.session_id)}/status`);
          setQrSession((current) => ({ ...current, ...status }));
          if (status.configured && status.state === "allowed") {
            message.success("115 \u626B\u7801\u767B\u5F55\u6210\u529F");
            await refresh115();
            await refreshRuntime();
          }
        } catch (error) {
          setQrSession((current) => ({ ...current, state: "expired", message: error.message }));
        }
      }, 2e3);
      return () => window.clearInterval(timer);
    }, [qrSession?.session_id, qrSession?.state, refresh115, refreshRuntime]);
    const targetReady = target === "aria2" ? !!connections.aria2_connected : target === "115" ? !!(pan115Status.connected || clientConfig.pan115?.configured) : !!(pikpakLoggedIn || clientConfig.pikpak?.configured);
    const loadMagnets = React2.useCallback(async (items) => {
      const entries = await Promise.all(items.slice(0, 40).map(async (original) => {
        try {
          let movie = original;
          if (source === "javbus" && (!movie.gid || movie.uc === void 0)) movie = await api(`/api/movies/${encodeURIComponent(movie.id)}`);
          const params = new URLSearchParams({ source, sortBy: "size", sortOrder: "desc" });
          if (exclude4k) params.set("exclude4k", "true");
          if (subtitle) params.set("hasSubtitle", subtitle);
          if (source === "javbus") {
            if (movie.gid) params.set("gid", movie.gid);
            if (movie.uc !== void 0) params.set("uc", movie.uc);
          }
          const result = await api(`/api/magnets/${encodeURIComponent(movie.id)}?${params}`);
          return [movie.id, Array.isArray(result) ? result : []];
        } catch {
          return [original.id, []];
        }
      }));
      setMagnets(Object.fromEntries(entries));
    }, [exclude4k, source, subtitle]);
    const showResults = React2.useCallback(async (payload) => {
      const next = movieList(payload).filter((movie) => movie?.id);
      setMovies(next);
      setSelectedMovieKeys([]);
      setMagnets({});
      const status = await api("/api/downloaded-movies").catch(() => ({ downloaded_movies: [] }));
      setDownloaded(new Set(status.downloaded_movies || []));
      await loadMagnets(next);
    }, [loadMagnets]);
    const search = async () => {
      const value = query.trim();
      if (!value) return message.warning("\u8BF7\u8F93\u5165\u756A\u53F7\u3001\u6F14\u5458\u6216\u7CFB\u5217");
      setLoading(true);
      try {
        if (/[,\n\s]/.test(value)) {
          const result = await api("/api/movies/download-by-codes", { method: "POST", body: JSON.stringify({ movie_codes: value, auto_download: false, magnet_source: source, has_subtitle_filter: subtitle || null, exclude_4k: exclude4k }) });
          await showResults({ movies: result.found_movies || [] });
        } else if (/^[a-z0-9]+-?\d+$/i.test(value)) {
          const result = await api(`/api/movies/${encodeURIComponent(value)}`);
          await showResults({ movies: result.movies || [result] });
        } else await showResults(await api(`/api/movies/search?keyword=${encodeURIComponent(value)}`));
      } catch (error) {
        message.error(error.message);
      } finally {
        setLoading(false);
      }
    };
    const recognize = async (values) => {
      setLoading(true);
      try {
        const result = await api("/api/movies/recognize", { method: "POST", body: JSON.stringify({ html_content: values.html, auto_download: false, magnet_source: source, has_subtitle_filter: subtitle || null, exclude_4k: exclude4k }) });
        await showResults({ movies: result.movies || result.found_movies || [] });
        setRecognizeOpen(false);
        recognizeForm.resetFields();
      } catch (error) {
        message.error(error.message);
      } finally {
        setLoading(false);
      }
    };
    const showBatchResults = async (results) => {
      const nextMovies = results.filter((item) => item.success).map((item) => ({ id: item.movie_id, title: item.title, date: item.date }));
      setMovies(nextMovies);
      setSelectedMovieKeys([]);
      setMagnets(Object.fromEntries(results.map((item) => [item.movie_id, item.best_magnet ? [item.best_magnet] : []])));
      const status = await api("/api/downloaded-movies").catch(() => ({ downloaded_movies: [] }));
      setDownloaded(new Set(status.downloaded_movies || []));
      setBatchOpen(false);
    };
    const batchLookup = async (values) => {
      const movie_ids = values.codes.split(/[\s,]+/).map((value) => value.trim()).filter(Boolean);
      if (!movie_ids.length) return message.warning("\u8BF7\u8F93\u5165\u81F3\u5C11\u4E00\u4E2A\u756A\u53F7");
      const payload = { movie_ids, magnet_source: source, has_subtitle_filter: subtitle || null, exclude_4k: exclude4k };
      setLoading(true);
      setBatchProgress({ completed: 0, total: movie_ids.length });
      try {
        if (values.mode === "standard") {
          const result = await api("/api/movies/batch", { method: "POST", body: JSON.stringify(payload) });
          await showBatchResults(result.results || []);
        } else {
          const response = await fetch("/api/movies/batch-stream", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
          if (!response.ok || !response.body) throw new Error(`\u6279\u91CF\u6D41\u8BF7\u6C42\u5931\u8D25 (${response.status})`);
          const reader = response.body.getReader();
          const decoder = new TextDecoder();
          let buffer = "";
          const results = [];
          for (; ; ) {
            const { value, done } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });
            const events = buffer.split("\n\n");
            buffer = events.pop() || "";
            for (const event of events) {
              const line = event.split("\n").find((item2) => item2.startsWith("data: "));
              if (!line) continue;
              const item = JSON.parse(line.slice(6));
              if (item.type === "progress") {
                results.push(item);
                setBatchProgress({ completed: results.length, total: movie_ids.length, current: item.movie_id });
              }
            }
          }
          await showBatchResults(results);
        }
      } catch (error) {
        message.error(error.message);
      } finally {
        setLoading(false);
        setBatchProgress(null);
      }
    };
    const loadAllMovies = async () => {
      setLoading(true);
      try {
        await showResults(await api("/api/movies/all"));
      } catch (error) {
        message.error(error.message);
      } finally {
        setLoading(false);
      }
    };
    const browse = async (values) => {
      setFilterOpen(false);
      setLoading(true);
      try {
        const params = new URLSearchParams({ magnet: "exist", type: values.type || "normal" });
        if (values.filterType && values.filterValue) {
          params.set("filterType", values.filterType);
          params.set("filterValue", values.filterValue);
        }
        if (values.hasSubtitle) params.set("hasSubtitle", values.hasSubtitle);
        if (values.excludeVr) params.set("excludeVr", "true");
        await showResults(await api(`/api/movies?${params}`));
      } catch (error) {
        message.error(error.message);
      } finally {
        setLoading(false);
      }
    };
    const changeTarget = (value) => {
      setTarget(value);
      window.localStorage.setItem("wb-download-target", value);
    };
    const dispatchEntries = async (entries) => {
      if (!entries.length) return message.warning("\u8BF7\u9009\u62E9\u53EF\u7528\u8D44\u6E90");
      if (!targetReady) return message.warning(`${TARGET_LABELS[target]} \u5C1A\u672A\u5C31\u7EEA`);
      setLoading(true);
      setDispatchProgress(target === "115" ? 0 : null);
      try {
        const payload = { magnet_links: entries.map((item) => item.link), movie_ids: entries.map((item) => item.movie_id), magnet_sources: entries.map((item) => item.source || source) };
        let result;
        if (target === "115" && pan115DispatchMode === "background") {
          const job = await api("/api/115/download-jobs", { method: "POST", body: JSON.stringify(payload) });
          result = await waitForJob(api, `/api/115/download-jobs/${encodeURIComponent(job.job_id)}`, (update) => setDispatchProgress(update.total_count ? Math.round((update.completed_count || 0) / update.total_count * 100) : 0), 800);
        } else {
          const endpoint = target === "aria2" ? "/api/aria2/download-magnets" : target === "115" ? "/api/115/download" : "/api/pikpak/download";
          result = await api(endpoint, { method: "POST", body: JSON.stringify(payload) });
        }
        message.success(result.message || `\u5DF2\u53D1\u9001 ${entries.length} \u9879\u5230 ${TARGET_LABELS[target]}`);
        setDispatchMovie(null);
        setSelectedMovieKeys([]);
        await api("/api/downloaded-movies").then((value) => setDownloaded(new Set(value.downloaded_movies || []))).catch(() => {
        });
      } catch (error) {
        message.error(error.message);
      } finally {
        setLoading(false);
        setDispatchProgress(null);
      }
    };
    const dispatchSelectedMovies = () => dispatchEntries(selectedMovieKeys.map((movieId) => ({ movie_id: movieId, link: magnets[movieId]?.[0]?.link, source: magnets[movieId]?.[0]?.source || source })).filter((item) => item.link));
    const openDispatch = (movie) => {
      setDispatchMovie(movie);
      setSelectedMagnetLink(magnets[movie.id]?.[0]?.link || "");
    };
    const openHistory = async () => {
      setHistoryOpen(true);
      try {
        setHistory(await api("/api/history"));
      } catch (error) {
        message.error(error.message);
      }
    };
    const checkHistory = async () => {
      try {
        const result = await api("/api/history/check-local-library", { method: "POST" });
        setHistory(result.records || result.history || (Array.isArray(result) ? result : history));
        message.success(result.message || "\u5386\u53F2\u8BB0\u5F55\u5DF2\u4E0E\u672C\u5730\u5F71\u89C6\u5E93\u6838\u5BF9");
      } catch (error) {
        message.error(error.message);
      }
    };
    const clearHistory = async () => {
      try {
        await api("/api/history", { method: "DELETE" });
        setHistory([]);
        message.success("\u4E0B\u8F7D\u5386\u53F2\u5DF2\u6E05\u7A7A");
      } catch (error) {
        message.error(error.message);
      }
    };
    const redispatchHistory = (records) => {
      const entries = buildHistoryRedispatchPayload(records, source).map((item) => ({ movie_id: item.movie_id, link: item.link, source: item.source }));
      return dispatchEntries(entries);
    };
    const loginPikpak = async (values) => {
      try {
        const result = await api("/api/pikpak/login", { method: "POST", body: JSON.stringify(values) });
        if (!result.success) throw new Error(result.message || "PikPak \u767B\u5F55\u5931\u8D25");
        setPikpakLoggedIn(true);
        pikpakForm.setFieldValue("password", "");
        message.success("PikPak \u767B\u5F55\u6210\u529F");
      } catch (error) {
        message.error(error.message);
      }
    };
    const loginConfiguredPikpak = async () => {
      try {
        const result = await api("/api/pikpak/login-config", { method: "POST" });
        if (!result.success) throw new Error(result.message || "PikPak \u767B\u5F55\u5931\u8D25");
        setPikpakLoggedIn(true);
        message.success("PikPak \u670D\u52A1\u7AEF\u8D26\u53F7\u53EF\u7528");
      } catch (error) {
        message.error(error.message);
      }
    };
    const startQrLogin = async () => {
      try {
        setQrSession(await api("/api/115/qrcode/start", { method: "POST", body: JSON.stringify({ app: clientConfig.pan115?.login_app || "wechatmini" }) }));
      } catch (error) {
        message.error(error.message);
      }
    };
    const saveCookie = async (values) => {
      try {
        await api("/api/115/cookie", { method: "POST", body: JSON.stringify({ cookie: values.cookie, enabled: true }) });
        cookieForm.resetFields();
        await refresh115();
        await refreshRuntime();
        message.success("115 Cookie \u5DF2\u9A8C\u8BC1\u5E76\u4FDD\u5B58");
      } catch (error) {
        message.error(error.message);
      }
    };
    const openActor = async (star) => {
      if (!star?.id) return;
      try {
        setActor(await api(`/api/stars/${encodeURIComponent(star.id)}`));
      } catch (error) {
        message.error(error.message);
      }
    };
    const openMovieDetails = async (movie) => {
      try {
        const [detail, status] = await Promise.all([api(`/api/movies/${encodeURIComponent(movie.id)}`), api(`/api/downloaded-movies/${encodeURIComponent(movie.id)}`)]);
        setDetailsMovie({ ...movie, ...detail, download_status: status });
      } catch (error) {
        message.error(error.message);
      }
    };
    const activeMovieMagnets = dispatchMovie ? magnets[dispatchMovie.id] || [] : [];
    const stage = movies.length ? Object.values(magnets).some((list) => list.length) ? 3 : 2 : 1;
    return /* @__PURE__ */ React2.createElement("div", { className: "wb-page wb-discover" }, /* @__PURE__ */ React2.createElement(PageIntro, { title: "\u53D1\u73B0\u5F71\u7247", description: "\u641C\u7D22\u3001\u8BC6\u522B\u3001\u9009\u62E9\u5177\u4F53\u8D44\u6E90\uFF0C\u5E76\u6279\u91CF\u6D3E\u53D1\u5230\u4E0B\u8F7D\u76EE\u6807\u3002", actions: [
      /* @__PURE__ */ React2.createElement(Button, { key: "accounts", type: "text", onClick: () => setAccountOpen(true) }, "\u8D26\u6237\u4E0E\u8FDE\u63A5"),
      /* @__PURE__ */ React2.createElement(Button, { key: "all", type: "text", onClick: loadAllMovies }, "\u5168\u90E8\u5F71\u7247"),
      /* @__PURE__ */ React2.createElement(Button, { key: "batch", type: "text", onClick: () => setBatchOpen(true) }, "\u6279\u91CF\u5DE5\u5177"),
      /* @__PURE__ */ React2.createElement(Button, { key: "recognize", type: "text", onClick: () => setRecognizeOpen(true) }, "\u8BC6\u522B\u7F51\u9875"),
      /* @__PURE__ */ React2.createElement(Button, { key: "history", type: "text", icon: icons.HistoryOutlined ? /* @__PURE__ */ React2.createElement(icons.HistoryOutlined, null) : null, onClick: openHistory }, "\u5386\u53F2"),
      /* @__PURE__ */ React2.createElement(Button, { key: "filter", type: "text", icon: icons.FilterOutlined ? /* @__PURE__ */ React2.createElement(icons.FilterOutlined, null) : null, onClick: () => setFilterOpen(true) }, "\u7B5B\u9009\u4E0E\u6765\u6E90")
    ] }), /* @__PURE__ */ React2.createElement("section", { className: "wb-search-band" }, /* @__PURE__ */ React2.createElement(Input, { value: query, onChange: (event) => setQuery(event.target.value), onPressEnter: search, prefix: icons.SearchOutlined ? /* @__PURE__ */ React2.createElement(icons.SearchOutlined, null) : null, placeholder: "\u8F93\u5165\u756A\u53F7\u3001\u6F14\u5458\u6216\u7CFB\u5217\uFF1B\u591A\u4E2A\u756A\u53F7\u7528\u7A7A\u683C\u5206\u9694", allowClear: true }), /* @__PURE__ */ React2.createElement(Button, { type: "primary", loading, onClick: search }, "\u641C\u7D22")), /* @__PURE__ */ React2.createElement(StageRail, { active: stage }), /* @__PURE__ */ React2.createElement("div", { className: "wb-discovery-toolbar" }, /* @__PURE__ */ React2.createElement(Space, { wrap: true }, /* @__PURE__ */ React2.createElement(Text2, { strong: true }, movies.length ? `\u627E\u5230 ${movies.length} \u90E8\u5F71\u7247` : "\u7B49\u5F85\u641C\u7D22"), /* @__PURE__ */ React2.createElement(Tag2, null, SOURCE_LABELS[source] || source), selectedMovieKeys.length ? /* @__PURE__ */ React2.createElement(Button, { type: "primary", onClick: dispatchSelectedMovies }, "\u53D1\u9001\u6240\u9009 ", selectedMovieKeys.length, " \u90E8") : null), /* @__PURE__ */ React2.createElement(Space, null, /* @__PURE__ */ React2.createElement(StatusDot, { ready: targetReady }, TARGET_LABELS[target], " ", targetReady ? "\u5DF2\u5C31\u7EEA" : "\u672A\u8FDE\u63A5"), /* @__PURE__ */ React2.createElement(Segmented, { value: target, onChange: changeTarget, options: [{ label: "PikPak", value: "pikpak" }, { label: "115", value: "115" }, { label: "Aria2", value: "aria2" }] }))), loading && !movies.length ? /* @__PURE__ */ React2.createElement("div", { className: "wb-loading" }, /* @__PURE__ */ React2.createElement(Spin, { size: "large" })) : movies.length ? /* @__PURE__ */ React2.createElement(List, { className: "wb-movie-list", dataSource: movies, renderItem: (movie) => {
      const best = magnets[movie.id]?.[0];
      const stars = movie.stars || [];
      const genres = names(movie.genres);
      return /* @__PURE__ */ React2.createElement(List.Item, { className: "wb-movie-row wb-movie-selectable" }, /* @__PURE__ */ React2.createElement(Checkbox, { checked: selectedMovieKeys.includes(movie.id), disabled: !best, onChange: (event) => setSelectedMovieKeys((keys) => event.target.checked ? [...keys, movie.id] : keys.filter((key) => key !== movie.id)), "aria-label": `\u9009\u62E9 ${movie.id}` }), /* @__PURE__ */ React2.createElement("button", { type: "button", className: "wb-poster", onClick: () => openMovieDetails(movie) }, posterUrl(movie) ? /* @__PURE__ */ React2.createElement("img", { src: posterUrl(movie), alt: `${movie.id} \u6D77\u62A5`, loading: "lazy" }) : /* @__PURE__ */ React2.createElement("span", null, movie.id)), /* @__PURE__ */ React2.createElement("div", { className: "wb-movie-copy" }, /* @__PURE__ */ React2.createElement(Space, { wrap: true, size: 6 }, /* @__PURE__ */ React2.createElement(Title2, { level: 4 }, movie.id), downloaded.has(movie.id) ? /* @__PURE__ */ React2.createElement(Tag2, { color: "blue" }, "\u5DF2\u6D3E\u53D1") : null, movie.date ? /* @__PURE__ */ React2.createElement(Text2, { type: "secondary" }, movie.date) : null), /* @__PURE__ */ React2.createElement("button", { type: "button", className: "wb-text-button", onClick: () => openMovieDetails(movie) }, movie.title || movie.full_title || "\u672A\u547D\u540D\u5F71\u7247"), stars.length ? /* @__PURE__ */ React2.createElement(Space, { wrap: true, size: 4 }, stars.map((star) => typeof star === "object" && star.id ? /* @__PURE__ */ React2.createElement(Button, { key: star.id, type: "link", size: "small", onClick: () => openActor(star) }, star.name) : /* @__PURE__ */ React2.createElement(Tag2, { key: star?.name || star }, star?.name || star))) : null, genres.length ? /* @__PURE__ */ React2.createElement("div", { className: "wb-tags" }, genres.slice(0, 5).map((name) => /* @__PURE__ */ React2.createElement(Tag2, { key: name }, name))) : null, /* @__PURE__ */ React2.createElement("div", { className: "wb-best-resource" }, magnets[movie.id] ? best ? /* @__PURE__ */ React2.createElement(React2.Fragment, null, /* @__PURE__ */ React2.createElement("b", null, best.title || "\u6700\u4F73\u8D44\u6E90"), /* @__PURE__ */ React2.createElement("span", null, best.source || source), /* @__PURE__ */ React2.createElement("span", null, best.size || formatBytes(best.size_bytes)), best.hasSubtitle ? /* @__PURE__ */ React2.createElement(Tag2, { color: "green" }, "\u4E2D\u5B57") : null) : /* @__PURE__ */ React2.createElement(Text2, { type: "danger" }, "\u6682\u65E0\u53EF\u7528\u8D44\u6E90") : /* @__PURE__ */ React2.createElement(React2.Fragment, null, /* @__PURE__ */ React2.createElement(Spin, { size: "small" }), /* @__PURE__ */ React2.createElement(Text2, { type: "secondary" }, "\u6B63\u5728\u5339\u914D\u8D44\u6E90")))), /* @__PURE__ */ React2.createElement(Button, { className: "wb-row-action", disabled: !best, onClick: () => openDispatch(movie) }, "\u9009\u62E9\u8D44\u6E90"));
    } }) : /* @__PURE__ */ React2.createElement(EmptyBlock, { title: "\u4ECE\u4E00\u6B21\u641C\u7D22\u5F00\u59CB", description: "\u7ED3\u679C\u4F1A\u6309\u5F71\u7247\u5C55\u793A\uFF0C\u5E76\u52A0\u8F7D\u5F53\u524D\u6765\u6E90\u7684\u5168\u90E8\u53EF\u7528\u78C1\u529B\u3002" }), /* @__PURE__ */ React2.createElement(Drawer, { title: "\u7B5B\u9009\u4E0E\u8D44\u6E90\u6765\u6E90", open: filterOpen, onClose: () => setFilterOpen(false), width: 400 }, /* @__PURE__ */ React2.createElement(Form, { form: filterForm, layout: "vertical", onFinish: browse, initialValues: { type: "normal", excludeVr: false } }, /* @__PURE__ */ React2.createElement(Form.Item, { label: "\u7B5B\u9009\u7EF4\u5EA6", name: "filterType" }, /* @__PURE__ */ React2.createElement(Select, { allowClear: true, options: [{ label: "\u6F14\u5458", value: "star" }, { label: "\u7C7B\u522B", value: "genre" }, { label: "\u5BFC\u6F14", value: "director" }, { label: "\u5236\u4F5C\u5546", value: "studio" }, { label: "\u53D1\u884C\u5546", value: "publisher" }, { label: "\u7CFB\u5217", value: "series" }] })), /* @__PURE__ */ React2.createElement(Form.Item, { label: "\u4EE3\u7801\u6216\u540D\u79F0", name: "filterValue" }, /* @__PURE__ */ React2.createElement(Input, { allowClear: true })), /* @__PURE__ */ React2.createElement(Form.Item, { label: "\u5F71\u7247\u7C7B\u578B", name: "type" }, /* @__PURE__ */ React2.createElement(Segmented, { block: true, options: [{ label: "\u6709\u7801", value: "normal" }, { label: "\u65E0\u7801", value: "uncensored" }] })), /* @__PURE__ */ React2.createElement(Form.Item, { label: "\u5B57\u5E55", name: "hasSubtitle" }, /* @__PURE__ */ React2.createElement(Select, { allowClear: true, options: [{ label: "\u6709\u5B57\u5E55", value: "true" }, { label: "\u65E0\u5B57\u5E55", value: "false" }] })), /* @__PURE__ */ React2.createElement(Form.Item, { label: "\u6392\u9664 VR", name: "excludeVr", valuePropName: "checked" }, /* @__PURE__ */ React2.createElement(Switch, null)), /* @__PURE__ */ React2.createElement(Button, { type: "primary", htmlType: "submit", block: true }, "\u83B7\u53D6\u7247\u5355")), /* @__PURE__ */ React2.createElement("div", { className: "wb-drawer-section" }, /* @__PURE__ */ React2.createElement(Text2, { strong: true }, "\u78C1\u529B\u6765\u6E90"), /* @__PURE__ */ React2.createElement(Segmented, { block: true, value: source, onChange: setSource, options: [{ label: "JavBus", value: "javbus" }, { label: "Cilisiusou", value: "cilisousuo" }, { label: "YHG007", value: "yhg007" }] }), /* @__PURE__ */ React2.createElement(Space, null, /* @__PURE__ */ React2.createElement(Switch, { checked: exclude4k, onChange: setExclude4k }), /* @__PURE__ */ React2.createElement(Text2, null, "\u6392\u9664 4K")), /* @__PURE__ */ React2.createElement(Select, { value: subtitle, onChange: setSubtitle, options: [{ label: "\u5B57\u5E55\u4E0D\u9650", value: "" }, { label: "\u53EA\u770B\u5B57\u5E55", value: "true" }, { label: "\u6392\u9664\u5B57\u5E55", value: "false" }] }))), /* @__PURE__ */ React2.createElement(Drawer, { title: dispatchMovie ? `\u9009\u62E9 ${dispatchMovie.id} \u7684\u8D44\u6E90` : "\u9009\u62E9\u8D44\u6E90", open: !!dispatchMovie, onClose: () => setDispatchMovie(null), width: 620 }, dispatchMovie ? /* @__PURE__ */ React2.createElement(React2.Fragment, null, /* @__PURE__ */ React2.createElement(Segmented, { block: true, value: target, onChange: changeTarget, options: Object.entries(TARGET_LABELS).map(([value, label]) => ({ value, label })) }), target === "115" ? /* @__PURE__ */ React2.createElement("div", { className: "wb-drawer-section" }, /* @__PURE__ */ React2.createElement(Text2, { strong: true }, "115 \u6D3E\u53D1\u65B9\u5F0F"), /* @__PURE__ */ React2.createElement(Segmented, { block: true, value: pan115DispatchMode, onChange: setPan115DispatchMode, options: [{ label: "\u540E\u53F0\u6279\u91CF", value: "background" }, { label: "\u540C\u6B65\u7B49\u5F85", value: "sync" }] })) : null, /* @__PURE__ */ React2.createElement(Table, { className: "wb-resource-table", size: "small", rowKey: "link", pagination: false, dataSource: activeMovieMagnets, rowSelection: { type: "radio", selectedRowKeys: selectedMagnetLink ? [selectedMagnetLink] : [], onChange: (keys) => setSelectedMagnetLink(keys[0] || "") }, columns: [{ title: "\u8D44\u6E90", dataIndex: "title", ellipsis: true }, { title: "\u6765\u6E90", dataIndex: "source", width: 100 }, { title: "\u5927\u5C0F", dataIndex: "size", width: 90 }, { title: "\u5B57\u5E55", dataIndex: "hasSubtitle", width: 70, render: (value) => value ? "\u6709" : "\u2014" }] }), dispatchProgress !== null ? /* @__PURE__ */ React2.createElement(Progress, { percent: dispatchProgress }) : null, /* @__PURE__ */ React2.createElement(Button, { className: "wb-confirm", type: "primary", block: true, disabled: !targetReady || !selectedMagnetLink, loading, onClick: () => dispatchEntries([{ movie_id: dispatchMovie.id, link: selectedMagnetLink, source: activeMovieMagnets.find((item) => item.link === selectedMagnetLink)?.source || source }]) }, "\u786E\u8BA4\u53D1\u9001\u5230 ", TARGET_LABELS[target]), !targetReady ? /* @__PURE__ */ React2.createElement(Button, { block: true, onClick: () => target === "aria2" ? navigate("downloads") : setAccountOpen(true) }, "\u8FDE\u63A5 ", TARGET_LABELS[target]) : null) : null), /* @__PURE__ */ React2.createElement(Drawer, { title: "\u4E0B\u8F7D\u5386\u53F2", open: historyOpen, onClose: () => setHistoryOpen(false), width: 900, extra: /* @__PURE__ */ React2.createElement(Space, null, /* @__PURE__ */ React2.createElement(Button, { onClick: checkHistory }, "\u6838\u5BF9\u5F71\u89C6\u5E93"), /* @__PURE__ */ React2.createElement(Popconfirm, { title: "\u786E\u5B9A\u6E05\u7A7A\u5168\u90E8\u4E0B\u8F7D\u5386\u53F2\uFF1F", onConfirm: clearHistory }, /* @__PURE__ */ React2.createElement(Button, { type: "text", danger: true }, "\u6E05\u7A7A"))) }, /* @__PURE__ */ React2.createElement(Table, { rowKey: "movie_id", dataSource: history, scroll: { x: 760 }, columns: [{ title: "\u756A\u53F7", dataIndex: "movie_id" }, { title: "\u6807\u9898", dataIndex: "title", ellipsis: true }, { title: "\u65F6\u95F4", dataIndex: "download_time" }, { title: "\u72B6\u6001", render: (_, record) => record.in_local_library ? /* @__PURE__ */ React2.createElement(Tag2, { color: "green" }, "\u5DF2\u5165\u5E93") : record.needs_reselect ? /* @__PURE__ */ React2.createElement(Tag2, { color: "orange" }, "\u9700\u8981\u91CD\u9009") : /* @__PURE__ */ React2.createElement(Tag2, null, "\u5DF2\u6D3E\u53D1") }, { title: "\u64CD\u4F5C", render: (_, record) => record.needs_reselect ? /* @__PURE__ */ React2.createElement(Button, { className: "wb-row-action", onClick: () => redispatchHistory([record]) }, "\u91CD\u65B0\u6D3E\u53D1") : null }] })), /* @__PURE__ */ React2.createElement(Modal, { title: "\u8BC6\u522B\u7F51\u9875\u4E2D\u7684\u756A\u53F7", open: recognizeOpen, onCancel: () => setRecognizeOpen(false), footer: null }, /* @__PURE__ */ React2.createElement(Form, { form: recognizeForm, layout: "vertical", onFinish: recognize }, /* @__PURE__ */ React2.createElement(Form.Item, { name: "html", label: "\u7F51\u9875 HTML", rules: [{ required: true }] }, /* @__PURE__ */ React2.createElement(Input.TextArea, { rows: 12, placeholder: "\u7C98\u8D34\u5305\u542B\u756A\u53F7\u7684\u7F51\u9875\u6E90\u7801" })), /* @__PURE__ */ React2.createElement(Button, { type: "primary", block: true, htmlType: "submit", loading }, "\u8BC6\u522B\u5E76\u52A0\u8F7D\u5F71\u7247"))), /* @__PURE__ */ React2.createElement(Modal, { title: "\u6279\u91CF\u5F71\u7247\u5DE5\u5177", open: batchOpen, onCancel: () => setBatchOpen(false), footer: null }, /* @__PURE__ */ React2.createElement(Form, { form: batchForm, layout: "vertical", onFinish: batchLookup, initialValues: { mode: "stream" } }, /* @__PURE__ */ React2.createElement(Form.Item, { name: "codes", label: "\u756A\u53F7\u5217\u8868", rules: [{ required: true }] }, /* @__PURE__ */ React2.createElement(Input.TextArea, { rows: 8, placeholder: "ABP-123\nIPX-456" })), /* @__PURE__ */ React2.createElement(Form.Item, { name: "mode", label: "\u5904\u7406\u65B9\u5F0F" }, /* @__PURE__ */ React2.createElement(Segmented, { block: true, options: [{ label: "\u6807\u51C6\u6279\u91CF", value: "standard" }, { label: "\u6D41\u5F0F\u8FDB\u5EA6", value: "stream" }] })), batchProgress ? /* @__PURE__ */ React2.createElement(Progress, { percent: batchProgress.total ? Math.round(batchProgress.completed / batchProgress.total * 100) : 0, format: () => `${batchProgress.completed}/${batchProgress.total}` }) : null, /* @__PURE__ */ React2.createElement(Button, { type: "primary", block: true, htmlType: "submit", loading }, "\u67E5\u8BE2\u5F71\u7247\u4E0E\u6700\u4F73\u78C1\u529B"))), /* @__PURE__ */ React2.createElement(Drawer, { title: "\u8D26\u6237\u4E0E\u8FDE\u63A5", open: accountOpen, onClose: () => setAccountOpen(false), width: 520 }, /* @__PURE__ */ React2.createElement(Tabs, { items: [
      { key: "pikpak", label: "PikPak", children: /* @__PURE__ */ React2.createElement(React2.Fragment, null, /* @__PURE__ */ React2.createElement(Alert, { type: pikpakLoggedIn || clientConfig.pikpak?.configured ? "success" : "warning", showIcon: true, message: pikpakLoggedIn ? "\u5F53\u524D\u4F1A\u8BDD\u767B\u5F55\u6210\u529F" : clientConfig.pikpak?.configured ? "\u670D\u52A1\u7AEF\u8D26\u53F7\u5DF2\u914D\u7F6E" : "\u5C1A\u672A\u914D\u7F6E\u8D26\u53F7" }), /* @__PURE__ */ React2.createElement(Form, { form: pikpakForm, layout: "vertical", onFinish: loginPikpak }, /* @__PURE__ */ React2.createElement(Form.Item, { name: "username", label: "\u7528\u6237\u540D", rules: [{ required: true }] }, /* @__PURE__ */ React2.createElement(Input, { autoComplete: "username" })), /* @__PURE__ */ React2.createElement(Form.Item, { name: "password", label: "\u5BC6\u7801", rules: [{ required: true }] }, /* @__PURE__ */ React2.createElement(Input.Password, { autoComplete: "current-password" })), /* @__PURE__ */ React2.createElement(Button, { type: "primary", block: true, htmlType: "submit" }, "\u767B\u5F55\u5F53\u524D\u4F1A\u8BDD"), clientConfig.pikpak?.configured ? /* @__PURE__ */ React2.createElement(Button, { className: "wb-submit", block: true, onClick: loginConfiguredPikpak }, "\u9A8C\u8BC1\u670D\u52A1\u7AEF\u914D\u7F6E") : null)) },
      { key: "115", label: "115 \u7F51\u76D8", children: /* @__PURE__ */ React2.createElement(React2.Fragment, null, /* @__PURE__ */ React2.createElement(Alert, { type: pan115Status.connected ? "success" : "warning", showIcon: true, message: pan115Status.connected ? `\u5DF2\u8FDE\u63A5${pan115Status.uid ? ` \xB7 ${pan115Status.uid}` : ""}` : "\u53EF\u4EE5\u626B\u7801\u767B\u5F55\u6216\u7C98\u8D34 Cookie" }), /* @__PURE__ */ React2.createElement(Button, { type: "primary", block: true, onClick: startQrLogin }, "\u751F\u6210\u767B\u5F55\u4E8C\u7EF4\u7801"), qrSession ? /* @__PURE__ */ React2.createElement("div", { className: "wb-qr-login" }, /* @__PURE__ */ React2.createElement("img", { src: qrSession.qrcode_image_url, alt: "115 \u767B\u5F55\u4E8C\u7EF4\u7801" }), /* @__PURE__ */ React2.createElement(Text2, null, qrSession.message || ({ waiting: "\u7B49\u5F85\u626B\u7801", scanned: "\u5DF2\u626B\u7801\uFF0C\u8BF7\u786E\u8BA4", allowed: "\u767B\u5F55\u6210\u529F", expired: "\u4E8C\u7EF4\u7801\u5DF2\u8FC7\u671F", canceled: "\u5DF2\u53D6\u6D88" }[qrSession.state] || qrSession.state))) : null, /* @__PURE__ */ React2.createElement(Form, { form: cookieForm, layout: "vertical", onFinish: saveCookie }, /* @__PURE__ */ React2.createElement(Form.Item, { name: "cookie", label: "115 Cookie", rules: [{ required: true }] }, /* @__PURE__ */ React2.createElement(Input.Password, null)), /* @__PURE__ */ React2.createElement(Button, { block: true, htmlType: "submit" }, "\u9A8C\u8BC1\u5E76\u4FDD\u5B58 Cookie"))) },
      { key: "aria2", label: "Aria2", children: /* @__PURE__ */ React2.createElement(React2.Fragment, null, /* @__PURE__ */ React2.createElement(Alert, { type: connections.aria2_connected ? "success" : "warning", showIcon: true, message: connections.aria2_connected ? "\u5F53\u524D\u4F1A\u8BDD\u5DF2\u8FDE\u63A5" : "\u5C1A\u672A\u8FDE\u63A5 Aria2" }), /* @__PURE__ */ React2.createElement(Button, { type: "primary", block: true, onClick: () => navigate("downloads") }, "\u6253\u5F00\u4E0B\u8F7D\u8FDE\u63A5\u9875")) }
    ] })), /* @__PURE__ */ React2.createElement(Drawer, { title: detailsMovie ? `${detailsMovie.id} \u8BE6\u60C5` : "\u5F71\u7247\u8BE6\u60C5", open: !!detailsMovie, onClose: () => setDetailsMovie(null), width: 560 }, detailsMovie ? /* @__PURE__ */ React2.createElement("div", { className: "wb-library-detail" }, posterUrl(detailsMovie) ? /* @__PURE__ */ React2.createElement("img", { src: posterUrl(detailsMovie), alt: `${detailsMovie.id} \u6D77\u62A5` }) : null, /* @__PURE__ */ React2.createElement(Title2, { level: 3 }, detailsMovie.title || detailsMovie.id), /* @__PURE__ */ React2.createElement(Descriptions, { column: 1, size: "small", items: [{ key: "id", label: "\u756A\u53F7", children: detailsMovie.id }, { key: "download", label: "\u4E0B\u8F7D\u8BB0\u5F55", children: detailsMovie.download_status?.downloaded ? "\u5DF2\u6709\u8BB0\u5F55" : "\u65E0\u8BB0\u5F55" }, { key: "date", label: "\u53D1\u884C\u65E5\u671F", children: detailsMovie.date || "\u2014" }, { key: "director", label: "\u5BFC\u6F14", children: detailsMovie.director?.name || detailsMovie.director || "\u2014" }, { key: "studio", label: "\u5236\u4F5C\u5546", children: detailsMovie.studio?.name || detailsMovie.studio || "\u2014" }, { key: "series", label: "\u7CFB\u5217", children: detailsMovie.series?.name || detailsMovie.series || "\u2014" }] }), /* @__PURE__ */ React2.createElement(Text2, null, detailsMovie.plot || detailsMovie.full_title || "\u6682\u65E0\u7B80\u4ECB")) : null), /* @__PURE__ */ React2.createElement(Drawer, { title: actor?.name || "\u6F14\u5458\u8BE6\u60C5", open: !!actor, onClose: () => setActor(null), width: 480 }, actor ? /* @__PURE__ */ React2.createElement("div", { className: "wb-library-detail" }, actor.avatar || actor.img ? /* @__PURE__ */ React2.createElement("img", { src: actor.avatar || actor.img, alt: actor.name || "\u6F14\u5458" }) : null, /* @__PURE__ */ React2.createElement(Title2, { level: 3 }, actor.name), /* @__PURE__ */ React2.createElement(Text2, null, actor.description || actor.birthday || "\u6682\u65E0\u66F4\u591A\u8D44\u6599")) : null));
  }

  // frontend/src/utils/localScrapeTemplates.mjs
  var LOCAL_SCRAPE_TASK_TEMPLATE_KEY = "localScrapeTaskTemplates";
  var MAX_TEMPLATES = 30;
  var parseJson = (value, fallback) => {
    if (!value) {
      return fallback;
    }
    try {
      return JSON.parse(value);
    } catch (error) {
      return fallback;
    }
  };
  var clampInteger = (value, min, max, fallback) => {
    const parsed = Number.parseInt(value, 10);
    if (!Number.isFinite(parsed)) {
      return fallback;
    }
    return Math.max(min, Math.min(max, parsed));
  };
  var normalizeOptionalInteger = (value, min = 0) => {
    if (value === null || value === void 0 || value === "") {
      return null;
    }
    const parsed = Number.parseInt(value, 10);
    if (!Number.isFinite(parsed)) {
      return null;
    }
    return Math.max(min, parsed);
  };
  var defaultNow = () => (/* @__PURE__ */ new Date()).toISOString();
  var defaultIdFactory = () => {
    if (globalThis.crypto?.randomUUID) {
      return globalThis.crypto.randomUUID();
    }
    return `local-scrape-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  };
  var normalizeLocalScrapeTaskValues = (values = {}) => ({
    directory: String(values.directory || "").trim(),
    recursive: values.recursive !== false,
    maxDepth: normalizeOptionalInteger(values.maxDepth),
    scrape: values.scrape !== false,
    concurrent: clampInteger(values.concurrent, 1, 5, 3),
    organize: values.organize !== false,
    targetDirectory: String(values.targetDirectory || "").trim(),
    folderTemplate: values.folderTemplate === null || values.folderTemplate === void 0 ? "{code} {title}" : String(values.folderTemplate).trim(),
    namingTemplate: String(values.namingTemplate || "{code} {title}").trim() || "{code} {title}",
    writeNfo: values.writeNfo !== false,
    downloadImages: values.downloadImages !== false,
    downloadSampleImages: !!values.downloadSampleImages,
    downloadActorImages: !!values.downloadActorImages,
    downloadListThumbnail: !!values.downloadListThumbnail,
    overwriteExisting: !!values.overwriteExisting
  });
  var normalizeLocalScrapeTaskTemplateName = (name) => {
    const normalized = String(name || "").trim().replace(/\s+/g, " ");
    return normalized || "Local scrape task";
  };
  var normalizeTemplate = (template) => {
    if (!template || typeof template !== "object") {
      return null;
    }
    const id = String(template.id || "").trim();
    if (!id) {
      return null;
    }
    return {
      id,
      name: normalizeLocalScrapeTaskTemplateName(template.name),
      values: normalizeLocalScrapeTaskValues(template.values),
      createdAt: String(template.createdAt || ""),
      updatedAt: String(template.updatedAt || template.createdAt || "")
    };
  };
  var loadLocalScrapeTaskTemplates = (storage = globalThis.window?.localStorage) => {
    if (!storage) {
      return [];
    }
    const parsed = parseJson(storage.getItem(LOCAL_SCRAPE_TASK_TEMPLATE_KEY), []);
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed.map(normalizeTemplate).filter(Boolean).sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt))).slice(0, MAX_TEMPLATES);
  };
  var persistTemplates = (storage, templates) => {
    storage.setItem(LOCAL_SCRAPE_TASK_TEMPLATE_KEY, JSON.stringify(templates.slice(0, MAX_TEMPLATES)));
  };
  var saveLocalScrapeTaskTemplate = (storage = globalThis.window?.localStorage, name, values, { existingId = "", idFactory = defaultIdFactory, now = defaultNow } = {}) => {
    if (!storage) {
      throw new Error("local storage is unavailable");
    }
    const templates = loadLocalScrapeTaskTemplates(storage);
    const timestamp = now();
    const normalizedName = normalizeLocalScrapeTaskTemplateName(name);
    const normalizedValues = normalizeLocalScrapeTaskValues(values);
    const targetId = String(existingId || "").trim();
    const existing = templates.find((template) => template.id === targetId);
    const saved = {
      id: existing?.id || idFactory(),
      name: normalizedName,
      values: normalizedValues,
      createdAt: existing?.createdAt || timestamp,
      updatedAt: timestamp
    };
    const nextTemplates = [saved, ...templates.filter((template) => template.id !== saved.id)];
    persistTemplates(storage, nextTemplates);
    return saved;
  };
  var deleteLocalScrapeTaskTemplate = (storage = globalThis.window?.localStorage, id) => {
    if (!storage) {
      return [];
    }
    const targetId = String(id || "").trim();
    const nextTemplates = loadLocalScrapeTaskTemplates(storage).filter((template) => template.id !== targetId);
    persistTemplates(storage, nextTemplates);
    return nextTemplates;
  };

  // frontend/src/utils/localScrapeResults.mjs
  var isConformingLocalScrapeItem = (item) => item?.scrape_status === "found";
  var FALLBACK_SCRAPE_REASONS = {
    recognized: "\u5DF2\u8BC6\u522B\u756A\u53F7\uFF0C\u4F46\u5F53\u524D\u9884\u89C8\u672A\u542F\u7528\u5143\u6570\u636E\u522E\u524A",
    unrecognized: "\u6587\u4EF6\u540D\u672A\u5339\u914D\u5230\u652F\u6301\u7684\u756A\u53F7\u683C\u5F0F",
    not_found: "\u5DF2\u8BC6\u522B\u756A\u53F7\uFF0C\u4F46\u5143\u6570\u636E\u6E90\u672A\u8FD4\u56DE\u5F71\u7247\u4FE1\u606F",
    failed: "\u522E\u524A\u8FC7\u7A0B\u4E2D\u53D1\u751F\u5F02\u5E38"
  };
  var getNonConformingLocalScrapeItems = (items = []) => {
    const source = Array.isArray(items) ? items : [];
    return source.filter((item) => !isConformingLocalScrapeItem(item));
  };
  var getVisibleLocalScrapeItems = (items = [], showNonConforming = false) => {
    const source = Array.isArray(items) ? items : [];
    if (showNonConforming) {
      return getNonConformingLocalScrapeItems(source);
    }
    return source.filter(isConformingLocalScrapeItem);
  };
  var getDeletableNonConformingLocalScrapeKeys = (items = []) => {
    return getNonConformingLocalScrapeItems(items).filter((item) => item?.source_path).map((item) => item.source_path);
  };
  var getLocalScrapeIssueReason = (item) => {
    if (!item || isConformingLocalScrapeItem(item)) {
      return "";
    }
    const explicitReason = String(item.scrape_reason || item.scrape_error || item.error || "").trim();
    if (explicitReason) {
      return explicitReason;
    }
    return FALLBACK_SCRAPE_REASONS[item.scrape_status] || "\u8BE5\u6587\u4EF6\u672A\u6EE1\u8DB3\u53EF\u522E\u524A\u6761\u4EF6";
  };

  // frontend/src/workbench/pages/OrganizePage.jsx
  var React3 = window.React;
  var { Button: Button2, Card, Checkbox: Checkbox2, Form: Form2, Input: Input2, InputNumber, Modal: Modal2, Popconfirm: Popconfirm2, Progress: Progress2, Segmented: Segmented2, Select: Select2, Space: Space2, Switch: Switch2, Table: Table2, Tag: Tag3, Typography: Typography3, message: message2 } = window.antd;
  var { Text: Text3 } = Typography3;
  var icons2 = window.icons || {};
  var templateToForm = (values) => ({
    directory: values.directory,
    recursive: values.recursive,
    max_depth: values.maxDepth,
    scrape: values.scrape,
    concurrent: values.concurrent,
    organize: values.organize,
    target_directory: values.targetDirectory,
    folder_template: values.folderTemplate,
    naming_template: values.namingTemplate,
    write_nfo: values.writeNfo,
    download_images: values.downloadImages,
    download_sample_images: values.downloadSampleImages,
    download_actor_images: values.downloadActorImages,
    download_list_thumbnail: values.downloadListThumbnail,
    overwrite_existing: values.overwriteExisting
  });
  var formToTemplate = (values) => ({
    directory: values.directory,
    recursive: values.recursive,
    maxDepth: values.max_depth,
    scrape: values.scrape,
    concurrent: values.concurrent,
    organize: values.organize,
    targetDirectory: values.target_directory,
    folderTemplate: values.folder_template,
    namingTemplate: values.naming_template,
    writeNfo: values.write_nfo,
    downloadImages: values.download_images,
    downloadSampleImages: values.download_sample_images,
    downloadActorImages: values.download_actor_images,
    downloadListThumbnail: values.download_list_thumbnail,
    overwriteExisting: values.overwrite_existing
  });
  function OrganizePage() {
    const [form] = Form2.useForm();
    const [items, setItems] = React3.useState([]);
    const [selected, setSelected] = React3.useState([]);
    const [loading, setLoading] = React3.useState(false);
    const [summary, setSummary] = React3.useState(null);
    const [job, setJob] = React3.useState(null);
    const [resultMode, setResultMode] = React3.useState("ready");
    const [templates, setTemplates] = React3.useState(() => loadLocalScrapeTaskTemplates());
    const [templateName, setTemplateName] = React3.useState("");
    const [activeTemplate, setActiveTemplate] = React3.useState("");
    const [browserOpen, setBrowserOpen] = React3.useState(false);
    const [browserField, setBrowserField] = React3.useState("directory");
    const [browserPath, setBrowserPath] = React3.useState("");
    const [directories, setDirectories] = React3.useState([]);
    const values = () => form.getFieldsValue(true);
    const payloadOptions = (formValues) => ({
      directory: formValues.directory,
      recursive: formValues.recursive,
      max_depth: formValues.max_depth ?? null,
      scrape: formValues.scrape,
      concurrent: formValues.concurrent,
      organize: formValues.organize,
      target_directory: formValues.target_directory || null,
      folder_template: formValues.folder_template ?? null,
      naming_template: formValues.naming_template,
      write_nfo: formValues.write_nfo,
      download_images: formValues.download_images,
      download_sample_images: formValues.download_sample_images,
      download_actor_images: formValues.download_actor_images,
      download_list_thumbnail: formValues.download_list_thumbnail,
      overwrite_existing: formValues.overwrite_existing
    });
    const openBrowser = async (field, path = "") => {
      setBrowserField(field);
      setBrowserOpen(true);
      try {
        const result = await api(`/api/system/directories${path ? `?path=${encodeURIComponent(path)}` : ""}`);
        setBrowserPath(result.current_path || path);
        setDirectories(result.entries || []);
      } catch (error) {
        message2.error(error.message);
      }
    };
    const preview = async (formValues) => {
      setLoading(true);
      setJob({ percent: 0, message: "\u521B\u5EFA\u9884\u89C8\u4EFB\u52A1" });
      try {
        let result;
        if (formValues.execution_mode === "sync") result = await api("/api/movies/local-scrape/preview", { method: "POST", body: JSON.stringify(payloadOptions(formValues)) });
        else {
          const started = await api("/api/movies/local-scrape/preview/jobs", { method: "POST", body: JSON.stringify(payloadOptions(formValues)) });
          result = await waitForJob(api, `/api/movies/local-scrape/jobs/${encodeURIComponent(started.task_id)}`, setJob, 500);
        }
        const rows = result.results || result.items || result.files || [];
        const normalized = rows.map((item, index) => ({ ...item, scrape_status: item.scrape_status || item.status, _key: item.source_path || item.path || index }));
        setItems(normalized);
        setSelected(normalized.filter((item) => item.scrape_status === "found" || item.status === "found" || item.metadata).map((item) => item._key));
        setSummary(result.summary || { total: rows.length });
        setResultMode("ready");
        message2.success(`\u5DF2\u751F\u6210 ${rows.length} \u6761\u6574\u7406\u9884\u89C8`);
      } catch (error) {
        message2.error(error.message);
      } finally {
        setLoading(false);
        setJob(null);
      }
    };
    const apply = async () => {
      const formValues = values();
      const chosen = items.filter((item) => selected.includes(item._key));
      if (!chosen.length) return message2.warning("\u8BF7\u5148\u9009\u62E9\u8981\u6267\u884C\u7684\u6587\u4EF6");
      setLoading(true);
      setJob({ percent: 0, message: "\u521B\u5EFA\u6574\u7406\u4EFB\u52A1" });
      try {
        const applyPayload = {
          items: chosen.map((item) => ({ source_path: item.source_path || item.path, code: item.code || item.movie_id, metadata: item.metadata || null, conflict_resolution: item.conflict_resolution || (item.conflict ? "auto_best" : null) })),
          ...payloadOptions(formValues),
          directory: void 0
        };
        let result;
        if (formValues.execution_mode === "sync") result = await api("/api/movies/local-scrape/apply", { method: "POST", body: JSON.stringify(applyPayload) });
        else {
          const started = await api("/api/movies/local-scrape/apply/jobs", { method: "POST", body: JSON.stringify(applyPayload) });
          result = await waitForJob(api, `/api/movies/local-scrape/jobs/${encodeURIComponent(started.task_id)}`, setJob, 500);
        }
        message2.success(result.message || "\u6574\u7406\u4EFB\u52A1\u5DF2\u5B8C\u6210");
        await preview(formValues);
      } catch (error) {
        message2.error(error.message);
        setLoading(false);
        setJob(null);
      }
    };
    const deleteInvalid = async () => {
      const sourcePaths = getDeletableNonConformingLocalScrapeKeys(items).filter((path) => selected.includes(path));
      if (!sourcePaths.length) return message2.warning("\u6CA1\u6709\u9009\u4E2D\u53EF\u5220\u9664\u7684\u672A\u901A\u8FC7\u6587\u4EF6");
      try {
        const result = await api("/api/movies/local-scrape/delete", { method: "POST", body: JSON.stringify({ directory: values().directory, source_paths: sourcePaths }) });
        message2.success(result.message || `\u5DF2\u5220\u9664 ${sourcePaths.length} \u4E2A\u6587\u4EF6`);
        setItems((current) => current.filter((item) => !sourcePaths.includes(item.source_path)));
        setSelected((current) => current.filter((key) => !sourcePaths.includes(key)));
      } catch (error) {
        message2.error(error.message);
      }
    };
    const saveTemplate = () => {
      const saved = saveLocalScrapeTaskTemplate(window.localStorage, templateName, formToTemplate(values()), { existingId: activeTemplate });
      setTemplates(loadLocalScrapeTaskTemplates());
      setActiveTemplate(saved.id);
      setTemplateName(saved.name);
      message2.success("\u6574\u7406\u6A21\u677F\u5DF2\u4FDD\u5B58");
    };
    const loadTemplate = (id) => {
      const template = templates.find((item) => item.id === id);
      setActiveTemplate(id);
      setTemplateName(template?.name || "");
      if (template) form.setFieldsValue(templateToForm(template.values));
    };
    const removeTemplate = () => {
      setTemplates(deleteLocalScrapeTaskTemplate(window.localStorage, activeTemplate));
      setActiveTemplate("");
      setTemplateName("");
    };
    const visibleItems = getVisibleLocalScrapeItems(items, resultMode === "issues");
    return /* @__PURE__ */ React3.createElement("div", { className: "wb-page" }, /* @__PURE__ */ React3.createElement(PageIntro, { title: "\u6574\u7406\u5A92\u4F53", description: "\u4F7F\u7528\u5F02\u6B65\u9884\u89C8\u68C0\u67E5\u8BC6\u522B\u3001\u547D\u540D\u548C\u51B2\u7A81\uFF0C\u518D\u6267\u884C\u6216\u6E05\u7406\u672A\u901A\u8FC7\u6587\u4EF6\u3002", actions: items.length ? [/* @__PURE__ */ React3.createElement(Button2, { key: "apply", type: "primary", icon: icons2.CheckOutlined ? /* @__PURE__ */ React3.createElement(icons2.CheckOutlined, null) : null, onClick: apply, loading }, "\u6267\u884C\u6240\u9009 ", selected.length, " \u9879")] : null }), /* @__PURE__ */ React3.createElement("div", { className: "wb-organize-layout" }, /* @__PURE__ */ React3.createElement(Card, { className: "wb-control-panel", title: "\u6574\u7406\u89C4\u5219", extra: /* @__PURE__ */ React3.createElement(Button2, { type: "text", size: "small", onClick: saveTemplate }, "\u4FDD\u5B58\u6A21\u677F") }, /* @__PURE__ */ React3.createElement(Space2, { direction: "vertical", className: "wb-full-width" }, /* @__PURE__ */ React3.createElement(Select2, { allowClear: true, placeholder: "\u52A0\u8F7D\u5DF2\u4FDD\u5B58\u6A21\u677F", value: activeTemplate || void 0, onChange: loadTemplate, options: templates.map((item) => ({ label: item.name, value: item.id })) }), /* @__PURE__ */ React3.createElement(Input2, { value: templateName, onChange: (event) => setTemplateName(event.target.value), placeholder: "\u6A21\u677F\u540D\u79F0", suffix: activeTemplate ? /* @__PURE__ */ React3.createElement(Popconfirm2, { title: "\u5220\u9664\u8FD9\u4E2A\u6A21\u677F\uFF1F", onConfirm: removeTemplate }, /* @__PURE__ */ React3.createElement(Button2, { type: "text", danger: true, size: "small" }, "\u5220\u9664")) : null })), /* @__PURE__ */ React3.createElement(Form2, { form, layout: "vertical", onFinish: preview, initialValues: { execution_mode: "background", recursive: true, max_depth: null, scrape: true, concurrent: 3, organize: true, naming_template: "{code} {title}", write_nfo: true, download_images: true, download_sample_images: false, download_actor_images: false, download_list_thumbnail: false, overwrite_existing: false } }, /* @__PURE__ */ React3.createElement(Form2.Item, { name: "execution_mode", label: "\u6267\u884C\u65B9\u5F0F" }, /* @__PURE__ */ React3.createElement(Segmented2, { block: true, options: [{ label: "\u540E\u53F0\u4EFB\u52A1", value: "background" }, { label: "\u540C\u6B65\u7B49\u5F85", value: "sync" }] })), /* @__PURE__ */ React3.createElement(Form2.Item, { name: "directory", label: "\u626B\u63CF\u76EE\u5F55", rules: [{ required: true }] }, /* @__PURE__ */ React3.createElement(Input2, { addonAfter: /* @__PURE__ */ React3.createElement(Button2, { type: "text", size: "small", onClick: () => openBrowser("directory", form.getFieldValue("directory")) }, "\u6D4F\u89C8") })), /* @__PURE__ */ React3.createElement(Form2.Item, { name: "target_directory", label: "\u76EE\u6807\u76EE\u5F55" }, /* @__PURE__ */ React3.createElement(Input2, { addonAfter: /* @__PURE__ */ React3.createElement(Button2, { type: "text", size: "small", onClick: () => openBrowser("target_directory", form.getFieldValue("target_directory")) }, "\u6D4F\u89C8") })), /* @__PURE__ */ React3.createElement(Form2.Item, { name: "folder_template", label: "\u6587\u4EF6\u5939\u6A21\u677F" }, /* @__PURE__ */ React3.createElement(Input2, { placeholder: "{actor}/{code}" })), /* @__PURE__ */ React3.createElement(Form2.Item, { name: "naming_template", label: "\u6587\u4EF6\u547D\u540D", rules: [{ required: true }] }, /* @__PURE__ */ React3.createElement(Input2, null)), /* @__PURE__ */ React3.createElement("div", { className: "wb-form-grid" }, /* @__PURE__ */ React3.createElement(Form2.Item, { name: "concurrent", label: "\u5E76\u53D1\u6570" }, /* @__PURE__ */ React3.createElement(InputNumber, { min: 1, max: 5 })), /* @__PURE__ */ React3.createElement(Form2.Item, { name: "max_depth", label: "\u6700\u5927\u6DF1\u5EA6" }, /* @__PURE__ */ React3.createElement(InputNumber, { min: 0, placeholder: "\u4E0D\u9650" })), /* @__PURE__ */ React3.createElement(Form2.Item, { name: "recursive", label: "\u9012\u5F52\u626B\u63CF", valuePropName: "checked" }, /* @__PURE__ */ React3.createElement(Switch2, null)), /* @__PURE__ */ React3.createElement(Form2.Item, { name: "scrape", label: "\u5728\u7EBF\u522E\u524A", valuePropName: "checked" }, /* @__PURE__ */ React3.createElement(Switch2, null)), /* @__PURE__ */ React3.createElement(Form2.Item, { name: "organize", label: "\u6574\u7406\u6587\u4EF6", valuePropName: "checked" }, /* @__PURE__ */ React3.createElement(Switch2, null)), /* @__PURE__ */ React3.createElement(Form2.Item, { name: "overwrite_existing", label: "\u8986\u76D6\u5DF2\u6709\u8D44\u6E90", valuePropName: "checked" }, /* @__PURE__ */ React3.createElement(Switch2, null))), /* @__PURE__ */ React3.createElement(Space2, { direction: "vertical" }, /* @__PURE__ */ React3.createElement(Form2.Item, { name: "write_nfo", valuePropName: "checked", noStyle: true }, /* @__PURE__ */ React3.createElement(Checkbox2, null, "\u5199\u5165 NFO")), /* @__PURE__ */ React3.createElement(Form2.Item, { name: "download_images", valuePropName: "checked", noStyle: true }, /* @__PURE__ */ React3.createElement(Checkbox2, null, "\u4E0B\u8F7D\u5C01\u9762")), /* @__PURE__ */ React3.createElement(Form2.Item, { name: "download_sample_images", valuePropName: "checked", noStyle: true }, /* @__PURE__ */ React3.createElement(Checkbox2, null, "\u4E0B\u8F7D\u6837\u4F8B\u56FE\u7247")), /* @__PURE__ */ React3.createElement(Form2.Item, { name: "download_actor_images", valuePropName: "checked", noStyle: true }, /* @__PURE__ */ React3.createElement(Checkbox2, null, "\u4E0B\u8F7D\u6F14\u5458\u5934\u50CF")), /* @__PURE__ */ React3.createElement(Form2.Item, { name: "download_list_thumbnail", valuePropName: "checked", noStyle: true }, /* @__PURE__ */ React3.createElement(Checkbox2, null, "\u751F\u6210\u5217\u8868\u7F29\u7565\u56FE"))), /* @__PURE__ */ React3.createElement(Button2, { className: "wb-submit", type: "primary", htmlType: "submit", block: true, loading }, "\u751F\u6210\u6574\u7406\u9884\u89C8"))), /* @__PURE__ */ React3.createElement("section", { className: "wb-work-surface" }, /* @__PURE__ */ React3.createElement("div", { className: "wb-surface-head" }, /* @__PURE__ */ React3.createElement("div", null, /* @__PURE__ */ React3.createElement("strong", null, "\u9884\u89C8\u7ED3\u679C"), /* @__PURE__ */ React3.createElement(Text3, { type: "secondary" }, summary ? `\u626B\u63CF ${summary.total ?? items.length} \u4E2A\u6587\u4EF6` : "\u7B49\u5F85\u626B\u63CF\u76EE\u5F55")), items.length ? /* @__PURE__ */ React3.createElement(Space2, null, /* @__PURE__ */ React3.createElement(Segmented2, { value: resultMode, onChange: (value) => {
      setResultMode(value);
      setSelected([]);
    }, options: [{ label: "\u53EF\u6267\u884C", value: "ready" }, { label: "\u672A\u901A\u8FC7", value: "issues" }] }), resultMode === "issues" ? /* @__PURE__ */ React3.createElement(Popconfirm2, { title: "\u786E\u5B9A\u5220\u9664\u6240\u9009\u672A\u901A\u8FC7\u6587\u4EF6\uFF1F\u6B64\u64CD\u4F5C\u4F1A\u5220\u9664\u539F\u6587\u4EF6\u3002", onConfirm: deleteInvalid }, /* @__PURE__ */ React3.createElement(Button2, { danger: true }, "\u5220\u9664\u6240\u9009")) : null) : null), job ? /* @__PURE__ */ React3.createElement("div", { className: "wb-job-progress" }, /* @__PURE__ */ React3.createElement(Progress2, { percent: job.percent || 0 }), /* @__PURE__ */ React3.createElement(Text3, null, job.message || job.current)) : null, items.length ? /* @__PURE__ */ React3.createElement(Table2, { rowKey: "_key", dataSource: visibleItems, loading, rowSelection: { selectedRowKeys: selected, onChange: setSelected }, scroll: { x: 1050 }, columns: [
      { title: "\u6E90\u6587\u4EF6", dataIndex: "source_path", ellipsis: true, render: (value, record) => value || record.path },
      { title: "\u756A\u53F7", dataIndex: "code", width: 120, render: (value, record) => value || record.movie_id || "\u2014" },
      { title: "\u6807\u9898", width: 210, ellipsis: true, render: (_, record) => record.metadata?.title || record.title || "\u2014" },
      { title: "\u76EE\u6807", dataIndex: "target_path", width: 240, ellipsis: true, render: (value, record) => value || record.target || "\u2014" },
      { title: "\u72B6\u6001", width: 130, render: (_, record) => record.scrape_status === "found" || record.status === "found" || record.metadata ? /* @__PURE__ */ React3.createElement(Tag3, { color: "green" }, "\u53EF\u6267\u884C") : /* @__PURE__ */ React3.createElement(Tag3, { color: "orange" }, "\u672A\u901A\u8FC7") },
      { title: "\u95EE\u9898/\u51B2\u7A81", width: 220, render: (_, record) => record.conflict ? /* @__PURE__ */ React3.createElement(Select2, { value: record.conflict_resolution || "auto_best", onChange: (value) => setItems((current) => current.map((item) => item._key === record._key ? { ...item, conflict_resolution: value } : item)), options: [{ label: "\u81EA\u52A8\u4FDD\u7559\u6700\u4F73", value: "auto_best" }, { label: "\u8DF3\u8FC7", value: "skip" }, { label: "\u8986\u76D6", value: "overwrite" }] }) : getLocalScrapeIssueReason(record) || "\u2014" }
    ] }) : /* @__PURE__ */ React3.createElement(EmptyBlock, { title: "\u9884\u89C8\u5148\u4E8E\u6267\u884C", description: "\u9009\u62E9\u76EE\u5F55\u5E76\u751F\u6210\u9884\u89C8\u540E\uFF0C\u8FD9\u91CC\u4F1A\u5C55\u793A\u6E90\u6587\u4EF6\u3001\u8BC6\u522B\u7ED3\u679C\u3001\u76EE\u6807\u8DEF\u5F84\u548C\u51B2\u7A81\u3002" }))), /* @__PURE__ */ React3.createElement(Modal2, { title: "\u9009\u62E9\u670D\u52A1\u7AEF\u76EE\u5F55", open: browserOpen, onCancel: () => setBrowserOpen(false), footer: /* @__PURE__ */ React3.createElement(Button2, { type: "primary", onClick: () => {
      form.setFieldValue(browserField, browserPath);
      setBrowserOpen(false);
    } }, "\u9009\u62E9\u5F53\u524D\u76EE\u5F55"), width: 720 }, /* @__PURE__ */ React3.createElement(Space2, { className: "wb-browser-path" }, /* @__PURE__ */ React3.createElement(Button2, { disabled: !browserPath, onClick: () => openBrowser(browserField, browserPath.replace(/[\\/][^\\/]+[\\/]?$/, "")) }, "\u4E0A\u4E00\u7EA7"), /* @__PURE__ */ React3.createElement(Text3, { code: true }, browserPath || "\u6839\u76EE\u5F55")), /* @__PURE__ */ React3.createElement(Table2, { rowKey: "path", pagination: false, dataSource: directories, columns: [{ title: "\u76EE\u5F55", dataIndex: "name", render: (name, record) => /* @__PURE__ */ React3.createElement(Button2, { type: "link", onClick: () => openBrowser(browserField, record.path) }, name) }, { title: "\u8DEF\u5F84", dataIndex: "path", ellipsis: true }] })));
  }

  // frontend/src/workbench/pages/LibraryPage.jsx
  var React4 = window.React;
  var { Button: Button3, Card: Card2, Checkbox: Checkbox3, Drawer: Drawer2, Form: Form3, Input: Input3, InputNumber: InputNumber2, Modal: Modal3, Popconfirm: Popconfirm3, Progress: Progress3, Segmented: Segmented3, Select: Select3, Space: Space3, Statistic, Table: Table3, Tag: Tag4, Typography: Typography4, message: message3 } = window.antd;
  var { Text: Text4, Title: Title3 } = Typography4;
  var icons3 = window.icons || {};
  function fileRows(record) {
    return record?.files || record?.video_files || [];
  }
  function names2(values) {
    return (values || []).map((item) => item?.name || item).filter(Boolean);
  }
  function recordId(record) {
    return record?.id || record?.movie_id || "";
  }
  function LibraryPage() {
    const [records, setRecords] = React4.useState([]);
    const [settings, setSettings] = React4.useState({ directories: [], ignored_paths: [] });
    const [actors, setActors] = React4.useState([]);
    const [actorKey, setActorKey] = React4.useState("");
    const [actorMovieIds, setActorMovieIds] = React4.useState(null);
    const [loading, setLoading] = React4.useState(true);
    const [job, setJob] = React4.useState(null);
    const [query, setQuery] = React4.useState("");
    const [view, setView] = React4.useState("posters");
    const [sort, setSort] = React4.useState("date");
    const [selected, setSelected] = React4.useState(null);
    const [scanOpen, setScanOpen] = React4.useState(false);
    const [actorsOpen, setActorsOpen] = React4.useState(false);
    const [maintenanceOpen, setMaintenanceOpen] = React4.useState(false);
    const [information, setInformation] = React4.useState(null);
    const [informationFields, setInformationFields] = React4.useState([]);
    const [scanForm] = Form3.useForm();
    const load = React4.useCallback(async () => {
      setLoading(true);
      try {
        const [library, librarySettings, actorPayload] = await Promise.all([
          api("/api/movies/local-library"),
          api("/api/movies/local-library/settings"),
          api("/api/movies/local-library/actors")
        ]);
        setRecords(movieList(library));
        setSettings(librarySettings);
        setActors(actorPayload.actors || []);
      } catch (error) {
        message3.error(error.message);
      } finally {
        setLoading(false);
      }
    }, []);
    React4.useEffect(() => {
      void load();
    }, [load]);
    const visible = React4.useMemo(() => {
      const keyword = query.trim().toLowerCase();
      let filtered = keyword ? records.filter((record) => [recordId(record), record.title, ...names2(record.stars), ...names2(record.genres)].join(" ").toLowerCase().includes(keyword)) : records;
      if (actorMovieIds) filtered = filtered.filter((record) => actorMovieIds.has(recordId(record)));
      return [...filtered].sort((a, b) => {
        if (sort === "title") return String(a.title || recordId(a)).localeCompare(String(b.title || recordId(b)), "zh-CN");
        if (sort === "size") return fileRows(b).reduce((sum, file) => sum + Number(file.size || 0), 0) - fileRows(a).reduce((sum, file) => sum + Number(file.size || 0), 0);
        return String(b.date || b.updated_at || "").localeCompare(String(a.date || a.updated_at || ""));
      });
    }, [actorMovieIds, query, records, sort]);
    const totalFiles = records.reduce((sum, record) => sum + fileRows(record).length, 0);
    const totalBytes = records.reduce((sum, record) => sum + fileRows(record).reduce((fileSum, file) => fileSum + Number(file.size || 0), 0), 0);
    const openScan = () => {
      scanForm.setFieldsValue({ execution_mode: "background", directories: (settings.directories || []).join("\n"), ignored_paths: (settings.ignored_paths || []).join("\n"), recursive: true, max_depth: null, remove_missing: true, scrape: false, probe_media: false, regularize_files: false, concurrent: 3 });
      setScanOpen(true);
    };
    const scan = async (values) => {
      const directories = values.directories.split(/\r?\n/).map((value) => value.trim()).filter(Boolean);
      const ignored_paths = values.ignored_paths?.split(/\r?\n/).map((value) => value.trim()).filter(Boolean) || [];
      setLoading(true);
      setJob({ percent: 0, message: "\u521B\u5EFA\u626B\u63CF\u4EFB\u52A1" });
      try {
        await api("/api/movies/local-library/settings", { method: "PUT", body: JSON.stringify({ directories, ignored_paths }) });
        const scanPayload = { directories, ignored_paths, recursive: values.recursive, max_depth: values.max_depth ?? null, remove_missing: values.remove_missing, scrape: values.scrape, probe_media: values.probe_media, regularize_files: values.regularize_files, concurrent: values.concurrent };
        let result;
        if (values.execution_mode === "sync") result = await api("/api/movies/local-library/scan", { method: "POST", body: JSON.stringify(scanPayload) });
        else {
          const started = await api("/api/movies/local-library/scan/jobs", { method: "POST", body: JSON.stringify(scanPayload) });
          result = await waitForJob(api, `/api/movies/local-library/scan/jobs/${encodeURIComponent(started.task_id)}`, setJob, 500);
        }
        message3.success(result.message || "\u5F71\u89C6\u5E93\u626B\u63CF\u5B8C\u6210");
        setScanOpen(false);
        await load();
      } catch (error) {
        message3.error(error.message);
      } finally {
        setLoading(false);
        setJob(null);
      }
    };
    const openDetails = async (record) => {
      setSelected(record);
      try {
        const result = await api(`/api/movies/local-library/${encodeURIComponent(recordId(record))}`);
        setSelected({ ...record, ...result.record || {} });
      } catch (error) {
        message3.error(error.message);
      }
    };
    const remove = async (record) => {
      try {
        await api(`/api/movies/local-library/${encodeURIComponent(recordId(record))}`, { method: "DELETE" });
        setSelected(null);
        await load();
        message3.success("\u5DF2\u4ECE\u5F71\u89C6\u5E93\u7D22\u5F15\u79FB\u9664");
      } catch (error) {
        message3.error(error.message);
      }
    };
    const checkInformation = async () => {
      try {
        const result = await api("/api/movies/local-library/information/check");
        setInformation(result);
        setInformationFields(result.fields || []);
        setMaintenanceOpen(true);
      } catch (error) {
        message3.error(error.message);
      }
    };
    const downloadInformation = async () => {
      try {
        const result = await api("/api/movies/local-library/information/download", { method: "POST", body: JSON.stringify({ fields: informationFields, only_missing: true, concurrent: 3, write_nfo: true, download_images: true, download_sample_images: false, download_actor_images: true, download_list_thumbnail: true, overwrite_existing: false }) });
        message3.success(result.message || "\u7F3A\u5931\u4FE1\u606F\u4E0B\u8F7D\u5B8C\u6210");
        await checkInformation();
        await load();
      } catch (error) {
        message3.error(error.message);
      }
    };
    const cleanInvalid = async () => {
      try {
        const result = await api("/api/movies/local-library/clean-invalid", { method: "POST" });
        message3.success(result.message || "\u65E0\u6548\u6587\u4EF6\u8BB0\u5F55\u5DF2\u6E05\u7406");
        await load();
      } catch (error) {
        message3.error(error.message);
      }
    };
    const clearLibrary = async () => {
      try {
        await api("/api/movies/local-library", { method: "DELETE" });
        setRecords([]);
        setMaintenanceOpen(false);
        message3.success("\u5F71\u89C6\u5E93\u7D22\u5F15\u5DF2\u6E05\u7A7A\uFF0C\u539F\u6587\u4EF6\u672A\u5220\u9664");
      } catch (error) {
        message3.error(error.message);
      }
    };
    const chooseActor = async (actor) => {
      const key = actor.actor_key || actor.key || actor.id || actor.name;
      try {
        const result = await api(`/api/movies/local-library/actors/${encodeURIComponent(key)}/movies`);
        setActorKey(key);
        setActorMovieIds(new Set((result.movies || result.movie_ids || []).map((item) => typeof item === "string" ? item : recordId(item))));
        setActorsOpen(false);
      } catch (error) {
        message3.error(error.message);
      }
    };
    return /* @__PURE__ */ React4.createElement("div", { className: "wb-page" }, /* @__PURE__ */ React4.createElement(PageIntro, { title: "\u5F71\u89C6\u5E93", description: "\u626B\u63CF\u3001\u64AD\u653E\u3001\u8865\u5168\u4FE1\u606F\u5E76\u7EF4\u62A4\u672C\u5730\u5A92\u4F53\u7D22\u5F15\u3002", actions: [
      /* @__PURE__ */ React4.createElement(Button3, { key: "actors", onClick: () => setActorsOpen(true) }, "\u6F14\u5458\u5E93"),
      /* @__PURE__ */ React4.createElement(Button3, { key: "maintain", onClick: checkInformation }, "\u7EF4\u62A4"),
      /* @__PURE__ */ React4.createElement(Button3, { key: "scan", type: "primary", icon: icons3.ScanOutlined ? /* @__PURE__ */ React4.createElement(icons3.ScanOutlined, null) : null, onClick: openScan }, "\u626B\u63CF\u76EE\u5F55")
    ] }), job ? /* @__PURE__ */ React4.createElement("div", { className: "wb-job-progress" }, /* @__PURE__ */ React4.createElement(Progress3, { percent: job.percent || 0 }), /* @__PURE__ */ React4.createElement(Text4, null, job.message || job.current)) : null, /* @__PURE__ */ React4.createElement("div", { className: "wb-library-stats" }, /* @__PURE__ */ React4.createElement(Statistic, { title: "\u5F71\u7247", value: records.length }), /* @__PURE__ */ React4.createElement(Statistic, { title: "\u672C\u5730\u6587\u4EF6", value: totalFiles }), /* @__PURE__ */ React4.createElement(Statistic, { title: "\u603B\u5BB9\u91CF", value: formatBytes(totalBytes) }), /* @__PURE__ */ React4.createElement(Statistic, { title: "\u5F53\u524D\u7ED3\u679C", value: visible.length })), /* @__PURE__ */ React4.createElement("div", { className: "wb-library-toolbar" }, /* @__PURE__ */ React4.createElement(Input3.Search, { value: query, onChange: (event) => setQuery(event.target.value), allowClear: true, placeholder: "\u641C\u7D22\u756A\u53F7\u3001\u6807\u9898\u3001\u6F14\u5458\u6216\u6807\u7B7E" }), /* @__PURE__ */ React4.createElement(Select3, { value: sort, onChange: setSort, options: [{ label: "\u6309\u53D1\u884C\u65E5\u671F", value: "date" }, { label: "\u6309\u6807\u9898", value: "title" }, { label: "\u6309\u5BB9\u91CF", value: "size" }] }), /* @__PURE__ */ React4.createElement(Segmented3, { value: view, onChange: setView, options: [{ label: "\u6D77\u62A5", value: "posters" }, { label: "\u5217\u8868", value: "list" }] }), /* @__PURE__ */ React4.createElement(Button3, { onClick: load, loading, type: "text" }, "\u5237\u65B0")), actorKey ? /* @__PURE__ */ React4.createElement("div", { className: "wb-active-filter" }, /* @__PURE__ */ React4.createElement(Tag4, { closable: true, onClose: () => {
      setActorKey("");
      setActorMovieIds(null);
    } }, "\u6F14\u5458\uFF1A", actorKey)) : null, visible.length ? /* @__PURE__ */ React4.createElement("div", { className: view === "posters" ? "wb-library-grid" : "wb-library-list" }, visible.map((record) => {
      const id = recordId(record);
      const media = record.media_info || fileRows(record)[0]?.media_info || {};
      return /* @__PURE__ */ React4.createElement("button", { type: "button", className: "wb-library-card", key: id, onClick: () => openDetails(record) }, /* @__PURE__ */ React4.createElement("span", { className: "wb-library-cover" }, /* @__PURE__ */ React4.createElement("img", { src: `/api/movies/local-library/poster/${encodeURIComponent(id)}`, alt: `${id} \u6D77\u62A5`, loading: "lazy", onError: (event) => {
        if (!event.currentTarget.dataset.fallback) {
          event.currentTarget.dataset.fallback = "1";
          event.currentTarget.src = `/api/movies/local-library/thumbnail/${encodeURIComponent(id)}`;
        } else event.currentTarget.style.display = "none";
      } })), /* @__PURE__ */ React4.createElement("span", { className: "wb-library-card-copy" }, /* @__PURE__ */ React4.createElement("strong", null, id), /* @__PURE__ */ React4.createElement(Text4, { ellipsis: { tooltip: record.title } }, record.title || "\u672A\u547D\u540D\u5F71\u7247"), /* @__PURE__ */ React4.createElement("small", null, names2(record.stars).join("\u3001") || "\u6F14\u5458\u672A\u77E5"), /* @__PURE__ */ React4.createElement("span", null, record.is_vr ? /* @__PURE__ */ React4.createElement(Tag4, { color: "purple" }, "VR") : null, media.resolution ? /* @__PURE__ */ React4.createElement(Tag4, null, media.resolution) : null, /* @__PURE__ */ React4.createElement(Tag4, null, fileRows(record).length, " \u4E2A\u6587\u4EF6"))));
    })) : /* @__PURE__ */ React4.createElement(EmptyBlock, { title: loading ? "\u6B63\u5728\u8BFB\u53D6\u5F71\u89C6\u5E93" : "\u5F71\u89C6\u5E93\u8FD8\u6CA1\u6709\u5185\u5BB9", description: "\u626B\u63CF\u4E00\u4E2A\u670D\u52A1\u7AEF\u53EF\u8BBF\u95EE\u76EE\u5F55\uFF0C\u6216\u8C03\u6574\u641C\u7D22\u6761\u4EF6\u3002" }), /* @__PURE__ */ React4.createElement(Modal3, { title: "\u626B\u63CF\u4E0E\u4FDD\u5B58\u5F71\u89C6\u5E93\u76EE\u5F55", open: scanOpen, onCancel: () => setScanOpen(false), footer: null, width: 620 }, /* @__PURE__ */ React4.createElement(Form3, { form: scanForm, layout: "vertical", onFinish: scan }, /* @__PURE__ */ React4.createElement(Form3.Item, { name: "execution_mode", label: "\u6267\u884C\u65B9\u5F0F" }, /* @__PURE__ */ React4.createElement(Segmented3, { block: true, options: [{ label: "\u540E\u53F0\u4EFB\u52A1", value: "background" }, { label: "\u540C\u6B65\u7B49\u5F85", value: "sync" }] })), /* @__PURE__ */ React4.createElement(Form3.Item, { name: "directories", label: "\u626B\u63CF\u76EE\u5F55\uFF08\u6BCF\u884C\u4E00\u4E2A\uFF09", rules: [{ required: true }] }, /* @__PURE__ */ React4.createElement(Input3.TextArea, { rows: 5, placeholder: "/media/JAV" })), /* @__PURE__ */ React4.createElement(Form3.Item, { name: "ignored_paths", label: "\u5FFD\u7565\u8DEF\u5F84\uFF08\u6BCF\u884C\u4E00\u4E2A\uFF09" }, /* @__PURE__ */ React4.createElement(Input3.TextArea, { rows: 3 })), /* @__PURE__ */ React4.createElement("div", { className: "wb-form-grid" }, /* @__PURE__ */ React4.createElement(Form3.Item, { name: "concurrent", label: "\u5E76\u53D1\u6570" }, /* @__PURE__ */ React4.createElement(InputNumber2, { min: 1, max: 10 })), /* @__PURE__ */ React4.createElement(Form3.Item, { name: "max_depth", label: "\u6700\u5927\u6DF1\u5EA6" }, /* @__PURE__ */ React4.createElement(InputNumber2, { min: 0, placeholder: "\u4E0D\u9650" }))), /* @__PURE__ */ React4.createElement(Space3, { direction: "vertical" }, /* @__PURE__ */ React4.createElement(Form3.Item, { name: "recursive", valuePropName: "checked", noStyle: true }, /* @__PURE__ */ React4.createElement(Checkbox3, null, "\u9012\u5F52\u626B\u63CF")), /* @__PURE__ */ React4.createElement(Form3.Item, { name: "remove_missing", valuePropName: "checked", noStyle: true }, /* @__PURE__ */ React4.createElement(Checkbox3, null, "\u79FB\u9664\u4E0D\u5B58\u5728\u7684\u7D22\u5F15\u8BB0\u5F55")), /* @__PURE__ */ React4.createElement(Form3.Item, { name: "scrape", valuePropName: "checked", noStyle: true }, /* @__PURE__ */ React4.createElement(Checkbox3, null, "\u626B\u63CF\u65F6\u5728\u7EBF\u522E\u524A")), /* @__PURE__ */ React4.createElement(Form3.Item, { name: "probe_media", valuePropName: "checked", noStyle: true }, /* @__PURE__ */ React4.createElement(Checkbox3, null, "\u8BFB\u53D6\u5206\u8FA8\u7387\u3001\u7F16\u7801\u548C\u7801\u7387")), /* @__PURE__ */ React4.createElement(Form3.Item, { name: "regularize_files", valuePropName: "checked", noStyle: true }, /* @__PURE__ */ React4.createElement(Checkbox3, null, "\u6574\u7406\u65E7\u5934\u50CF\u548C\u91CD\u590D\u6587\u4EF6"))), /* @__PURE__ */ React4.createElement(Button3, { className: "wb-submit", type: "primary", block: true, htmlType: "submit", loading }, "\u4FDD\u5B58\u8BBE\u7F6E\u5E76\u5F00\u59CB\u626B\u63CF"))), /* @__PURE__ */ React4.createElement(Drawer2, { title: selected ? `${recordId(selected)} \u5F71\u7247\u8BE6\u60C5` : "\u5F71\u7247\u8BE6\u60C5", open: !!selected, onClose: () => setSelected(null), width: 680 }, selected ? /* @__PURE__ */ React4.createElement("div", { className: "wb-library-detail" }, /* @__PURE__ */ React4.createElement("img", { src: `/api/movies/local-library/poster/${encodeURIComponent(recordId(selected))}`, alt: `${recordId(selected)} \u6D77\u62A5` }), /* @__PURE__ */ React4.createElement(Title3, { level: 3 }, selected.title || recordId(selected)), /* @__PURE__ */ React4.createElement("div", { className: "wb-detail-actors" }, names2(selected.stars).map((name) => /* @__PURE__ */ React4.createElement("span", { key: name }, /* @__PURE__ */ React4.createElement("img", { src: `/api/movies/local-library/actor-avatar/${encodeURIComponent(recordId(selected))}/${encodeURIComponent(name)}`, alt: name }), /* @__PURE__ */ React4.createElement(Tag4, { color: "magenta" }, name)))), /* @__PURE__ */ React4.createElement(Space3, { wrap: true }, names2(selected.genres).map((name) => /* @__PURE__ */ React4.createElement(Tag4, { key: name }, name))), /* @__PURE__ */ React4.createElement(Text4, null, selected.full_text || selected.plot || "\u6682\u65E0\u7B80\u4ECB"), /* @__PURE__ */ React4.createElement(Card2, { size: "small", title: "\u672C\u5730\u6587\u4EF6" }, fileRows(selected).map((file, index) => /* @__PURE__ */ React4.createElement("div", { className: "wb-file-line", key: file.path || file.file_name || index }, /* @__PURE__ */ React4.createElement("span", null, file.file_name || file.name || file.path), /* @__PURE__ */ React4.createElement(Space3, null, /* @__PURE__ */ React4.createElement(Text4, { type: "secondary" }, formatBytes(file.size)), /* @__PURE__ */ React4.createElement(Button3, { size: "small", type: "link", href: `/api/movies/local-library/${encodeURIComponent(recordId(selected))}/play?file_index=${index}`, target: "_blank" }, "\u64AD\u653E"))))), /* @__PURE__ */ React4.createElement(Popconfirm3, { title: "\u53EA\u79FB\u9664\u7D22\u5F15\uFF0C\u4E0D\u5220\u9664\u539F\u6587\u4EF6\u3002\u7EE7\u7EED\uFF1F", onConfirm: () => remove(selected) }, /* @__PURE__ */ React4.createElement(Button3, { danger: true }, "\u4ECE\u7D22\u5F15\u79FB\u9664"))) : null), /* @__PURE__ */ React4.createElement(Drawer2, { title: "\u6F14\u5458\u5E93", open: actorsOpen, onClose: () => setActorsOpen(false), width: 720 }, actors.length ? /* @__PURE__ */ React4.createElement("div", { className: "wb-actor-grid" }, actors.map((actor) => {
      const key = actor.actor_key || actor.key || actor.id || actor.name;
      return /* @__PURE__ */ React4.createElement("button", { type: "button", key, onClick: () => chooseActor(actor) }, /* @__PURE__ */ React4.createElement("img", { src: `/api/movies/local-library/actors/${encodeURIComponent(key)}/avatar`, alt: actor.name || key }), /* @__PURE__ */ React4.createElement("strong", null, actor.name || key), /* @__PURE__ */ React4.createElement(Text4, null, actor.movie_count || actor.count || 0, " \u90E8\u5F71\u7247"));
    })) : /* @__PURE__ */ React4.createElement(EmptyBlock, { title: "\u6F14\u5458\u5E93\u4E3A\u7A7A", description: "\u5B8C\u6210\u5E26\u6F14\u5458\u4FE1\u606F\u7684\u522E\u524A\u540E\uFF0C\u8FD9\u91CC\u4F1A\u751F\u6210\u6F14\u5458\u7D22\u5F15\u3002" })), /* @__PURE__ */ React4.createElement(Drawer2, { title: "\u5F71\u89C6\u5E93\u7EF4\u62A4", open: maintenanceOpen, onClose: () => setMaintenanceOpen(false), width: 760 }, /* @__PURE__ */ React4.createElement(Space3, { direction: "vertical", className: "wb-full-width", size: "large" }, /* @__PURE__ */ React4.createElement(Card2, { size: "small", title: "\u4FE1\u606F\u5B8C\u6574\u5EA6" }, /* @__PURE__ */ React4.createElement(Space3, { wrap: true }, /* @__PURE__ */ React4.createElement(Statistic, { title: "\u5F71\u7247", value: information?.total_movies || records.length }), /* @__PURE__ */ React4.createElement(Statistic, { title: "\u5B8C\u6574", value: information?.complete_count || 0 }), /* @__PURE__ */ React4.createElement(Statistic, { title: "\u5F85\u8865\u5168", value: information?.incomplete_count || 0 })), /* @__PURE__ */ React4.createElement(Select3, { mode: "multiple", value: informationFields, onChange: setInformationFields, options: (information?.available_fields || []).map((field) => ({ value: field, label: information?.field_labels?.[field] || field })), className: "wb-full-width" }), /* @__PURE__ */ React4.createElement(Button3, { type: "primary", onClick: downloadInformation, disabled: !informationFields.length }, "\u4E0B\u8F7D\u7F3A\u5931\u4FE1\u606F"), /* @__PURE__ */ React4.createElement(Table3, { size: "small", rowKey: "movie_id", pagination: { pageSize: 8 }, dataSource: information?.incomplete_records || [], columns: [{ title: "\u756A\u53F7", dataIndex: "movie_id" }, { title: "\u7F3A\u5931\u5B57\u6BB5", dataIndex: "missing_labels", render: (value) => (value || []).join("\u3001") }] })), /* @__PURE__ */ React4.createElement(Card2, { size: "small", title: "\u7D22\u5F15\u7EF4\u62A4" }, /* @__PURE__ */ React4.createElement(Space3, { wrap: true }, /* @__PURE__ */ React4.createElement(Button3, { onClick: cleanInvalid }, "\u6E05\u7406\u65E0\u6548\u6587\u4EF6\u8BB0\u5F55"), /* @__PURE__ */ React4.createElement(Popconfirm3, { title: "\u6E05\u7A7A\u6574\u4E2A\u5F71\u89C6\u5E93\u7D22\u5F15\uFF1F\u539F\u6587\u4EF6\u4E0D\u4F1A\u5220\u9664\u3002", onConfirm: clearLibrary }, /* @__PURE__ */ React4.createElement(Button3, { danger: true }, "\u6E05\u7A7A\u5F71\u89C6\u5E93\u7D22\u5F15")))))));
  }

  // frontend/src/workbench/pages/AutomationPage.jsx
  var React5 = window.React;
  var { Button: Button4, Drawer: Drawer3, Form: Form4, Input: Input4, InputNumber: InputNumber3, List: List2, Popconfirm: Popconfirm4, Segmented: Segmented4, Select: Select4, Space: Space4, Switch: Switch3, Table: Table4, Tag: Tag5, Typography: Typography5, message: message4 } = window.antd;
  var { Text: Text5 } = Typography5;
  var icons4 = window.icons || {};
  var defaultNodes = (values) => [
    { id: "trigger", type: "trigger", position: { x: 40, y: 80 }, config: {} },
    { id: "search", type: "search", position: { x: 280, y: 80 }, config: { mode: values.mode, keyword: values.mode === "keyword" ? values.query : "", codes: values.mode === "codes" ? values.query : "", max_results: values.max_results, skip_existing: true } },
    { id: "magnet", type: "magnet", position: { x: 520, y: 80 }, config: { source: values.source, has_subtitle: values.has_subtitle || null, exclude_4k: values.exclude_4k, allow_chinese_subtitles: true } },
    { id: "download", type: "download", position: { x: 760, y: 80 }, config: { tool: values.tool } }
  ];
  var EDGES = [
    { id: "trigger-search", source: "trigger", target: "search" },
    { id: "search-magnet", source: "search", target: "magnet" },
    { id: "magnet-download", source: "magnet", target: "download" }
  ];
  function AutomationPage() {
    const [tasks, setTasks] = React5.useState([]);
    const [runs, setRuns] = React5.useState([]);
    const [selected, setSelected] = React5.useState(null);
    const [editorOpen, setEditorOpen] = React5.useState(false);
    const [runsOpen, setRunsOpen] = React5.useState(false);
    const [loading, setLoading] = React5.useState(true);
    const [form] = Form4.useForm();
    const load = React5.useCallback(async () => {
      setLoading(true);
      try {
        setTasks((await api("/api/automation/tasks")).tasks || []);
      } catch (error) {
        message4.error(error.message);
      } finally {
        setLoading(false);
      }
    }, []);
    React5.useEffect(() => {
      void load();
    }, [load]);
    const openEditor = async (task) => {
      if (task?.id) {
        try {
          task = await api(`/api/automation/tasks/${encodeURIComponent(task.id)}`);
        } catch (error) {
          message4.error(error.message);
          return;
        }
      }
      setSelected(task || null);
      const search = task?.nodes?.find((node) => node.type === "search")?.config || {};
      const magnet = task?.nodes?.find((node) => node.type === "magnet")?.config || {};
      const download = task?.nodes?.find((node) => node.type === "download")?.config || {};
      form.setFieldsValue({
        name: task?.name || "\u65B0\u7684\u81EA\u52A8\u4EFB\u52A1",
        enabled: task?.enabled ?? true,
        trigger_type: task?.trigger?.type || "auto",
        scheduled_time: task?.trigger?.scheduled_time || "03:00",
        interval_minutes: task?.trigger?.interval_minutes || 60,
        mode: search.mode || "keyword",
        query: search.keyword || search.codes || "",
        max_results: search.max_results || 30,
        source: magnet.source || "javbus",
        has_subtitle: magnet.has_subtitle || "",
        exclude_4k: !!magnet.exclude_4k,
        tool: download.tool || "pikpak"
      });
      setEditorOpen(true);
      setRunsOpen(false);
    };
    const save = async (values) => {
      const payload = {
        name: values.name,
        enabled: values.enabled,
        trigger: { type: values.trigger_type, scheduled_time: values.trigger_type === "scheduled" ? values.scheduled_time : null, interval_minutes: values.trigger_type === "interval" ? values.interval_minutes : null },
        nodes: defaultNodes(values),
        edges: EDGES
      };
      try {
        await api(selected ? `/api/automation/tasks/${selected.id}` : "/api/automation/tasks", { method: selected ? "PUT" : "POST", body: JSON.stringify(payload) });
        message4.success(selected ? "\u4EFB\u52A1\u5DF2\u66F4\u65B0" : "\u4EFB\u52A1\u5DF2\u521B\u5EFA");
        setEditorOpen(false);
        await load();
      } catch (error) {
        message4.error(error.message);
      }
    };
    const run = async (task) => {
      try {
        message4.loading({ key: task.id, content: `\u6B63\u5728\u8FD0\u884C ${task.name}` });
        const result = await api(`/api/automation/tasks/${task.id}/run`, { method: "POST" });
        message4.success({ key: task.id, content: `\u8FD0\u884C\u5B8C\u6210\uFF1A${result.status || "success"}` });
        await load();
      } catch (error) {
        message4.error({ key: task.id, content: error.message });
      }
    };
    const remove = async (task) => {
      try {
        await api(`/api/automation/tasks/${task.id}`, { method: "DELETE" });
        await load();
      } catch (error) {
        message4.error(error.message);
      }
    };
    const openRuns = async (task) => {
      setSelected(task);
      setRunsOpen(true);
      try {
        setRuns((await api(`/api/automation/tasks/${task.id}/runs`)).runs || []);
      } catch (error) {
        message4.error(error.message);
      }
    };
    return /* @__PURE__ */ React5.createElement("div", { className: "wb-page" }, /* @__PURE__ */ React5.createElement(
      PageIntro,
      {
        title: "\u81EA\u52A8\u5316",
        description: "\u6BCF\u4E2A\u4EFB\u52A1\u90FD\u56FA\u5B9A\u5305\u542B\u53D1\u73B0\u3001\u9009\u62E9\u78C1\u529B\u548C\u6D3E\u53D1\u4E09\u4E2A\u4E1A\u52A1\u6B65\u9AA4\uFF0C\u53EA\u6709\u89E6\u53D1\u65B9\u5F0F\u4E0E\u7B56\u7565\u53EF\u914D\u7F6E\u3002",
        actions: [/* @__PURE__ */ React5.createElement(Button4, { key: "new", type: "primary", icon: icons4.PlusOutlined ? /* @__PURE__ */ React5.createElement(icons4.PlusOutlined, null) : null, onClick: () => openEditor(null) }, "\u65B0\u5EFA\u4EFB\u52A1")]
      }
    ), /* @__PURE__ */ React5.createElement("div", { className: "wb-automation-flow" }, [["1", "\u53D1\u73B0", "\u6309\u5173\u952E\u8BCD\u6216\u756A\u53F7\u83B7\u53D6\u5F71\u7247"], ["2", "\u8D44\u6E90", "\u6309\u5B57\u5E55\u548C\u6E05\u6670\u5EA6\u9009\u62E9\u78C1\u529B"], ["3", "\u6D3E\u53D1", "\u53D1\u9001\u5230 PikPak\u3001115 \u6216 Aria2"]].map(([number, label, note]) => /* @__PURE__ */ React5.createElement("div", { key: number }, /* @__PURE__ */ React5.createElement("span", null, number), /* @__PURE__ */ React5.createElement("strong", null, label), /* @__PURE__ */ React5.createElement("small", null, note)))), tasks.length ? /* @__PURE__ */ React5.createElement(
      List2,
      {
        className: "wb-task-list",
        loading,
        dataSource: tasks,
        renderItem: (task) => {
          const search = task.nodes?.find((node) => node.type === "search")?.config || {};
          const download = task.nodes?.find((node) => node.type === "download")?.config || {};
          return /* @__PURE__ */ React5.createElement(List2.Item, { actions: [
            /* @__PURE__ */ React5.createElement(Button4, { key: "run", className: "wb-row-action", onClick: () => run(task) }, "\u7ACB\u5373\u8FD0\u884C"),
            /* @__PURE__ */ React5.createElement(Button4, { key: "edit", type: "text", onClick: () => openEditor(task) }, "\u7F16\u8F91"),
            /* @__PURE__ */ React5.createElement(Button4, { key: "runs", type: "text", onClick: () => openRuns(task) }, "\u8BB0\u5F55"),
            /* @__PURE__ */ React5.createElement(Popconfirm4, { key: "delete", title: "\u5220\u9664\u8FD9\u4E2A\u81EA\u52A8\u4EFB\u52A1\uFF1F", onConfirm: () => remove(task) }, /* @__PURE__ */ React5.createElement(Button4, { type: "text", danger: true }, "\u5220\u9664"))
          ] }, /* @__PURE__ */ React5.createElement(
            List2.Item.Meta,
            {
              title: /* @__PURE__ */ React5.createElement(Space4, null, /* @__PURE__ */ React5.createElement(Text5, { strong: true }, task.name), /* @__PURE__ */ React5.createElement(Tag5, { color: task.enabled ? "green" : "default" }, task.enabled ? "\u542F\u7528" : "\u505C\u7528"), task.last_status ? /* @__PURE__ */ React5.createElement(Tag5, null, task.last_status) : null),
              description: `${search.mode === "codes" ? "\u756A\u53F7\u6279\u91CF" : "\u5173\u952E\u8BCD"} \xB7 ${search.keyword || search.codes || "\u672A\u8BBE\u7F6E"} \xB7 ${download.tool || "pikpak"}`
            }
          ), /* @__PURE__ */ React5.createElement(Text5, { type: "secondary" }, task.next_run_at ? `\u4E0B\u6B21\uFF1A${task.next_run_at}` : "\u4EC5\u624B\u52A8\u8FD0\u884C"));
        }
      }
    ) : /* @__PURE__ */ React5.createElement(EmptyBlock, { title: loading ? "\u6B63\u5728\u8BFB\u53D6\u4EFB\u52A1" : "\u8FD8\u6CA1\u6709\u81EA\u52A8\u4EFB\u52A1", description: "\u65B0\u5EFA\u4E00\u4E2A\u4EFB\u52A1\uFF0C\u628A\u91CD\u590D\u7684\u641C\u7D22\u3001\u8D44\u6E90\u9009\u62E9\u548C\u6D3E\u53D1\u4EA4\u7ED9\u7CFB\u7EDF\u3002" }), /* @__PURE__ */ React5.createElement(Drawer3, { title: selected ? "\u7F16\u8F91\u81EA\u52A8\u4EFB\u52A1" : "\u65B0\u5EFA\u81EA\u52A8\u4EFB\u52A1", open: editorOpen, onClose: () => {
      setEditorOpen(false);
      setSelected(null);
    }, width: 480 }, /* @__PURE__ */ React5.createElement(Form4, { form, layout: "vertical", onFinish: save }, /* @__PURE__ */ React5.createElement(Form4.Item, { name: "name", label: "\u4EFB\u52A1\u540D\u79F0", rules: [{ required: true }] }, /* @__PURE__ */ React5.createElement(Input4, null)), /* @__PURE__ */ React5.createElement(Form4.Item, { name: "enabled", label: "\u542F\u7528\u4EFB\u52A1", valuePropName: "checked" }, /* @__PURE__ */ React5.createElement(Switch3, null)), /* @__PURE__ */ React5.createElement(Form4.Item, { name: "trigger_type", label: "\u89E6\u53D1\u65B9\u5F0F" }, /* @__PURE__ */ React5.createElement(Segmented4, { block: true, options: [{ label: "\u4EC5\u624B\u52A8", value: "auto" }, { label: "\u6BCF\u5929\u5B9A\u65F6", value: "scheduled" }, { label: "\u56FA\u5B9A\u95F4\u9694", value: "interval" }] })), /* @__PURE__ */ React5.createElement(Form4.Item, { noStyle: true, shouldUpdate: (before, after) => before.trigger_type !== after.trigger_type }, ({ getFieldValue }) => getFieldValue("trigger_type") === "scheduled" ? /* @__PURE__ */ React5.createElement(Form4.Item, { name: "scheduled_time", label: "\u6BCF\u5929\u8FD0\u884C\u65F6\u95F4" }, /* @__PURE__ */ React5.createElement(Input4, { placeholder: "03:00" })) : getFieldValue("trigger_type") === "interval" ? /* @__PURE__ */ React5.createElement(Form4.Item, { name: "interval_minutes", label: "\u95F4\u9694\u5206\u949F" }, /* @__PURE__ */ React5.createElement(InputNumber3, { min: 1 })) : null), /* @__PURE__ */ React5.createElement(Form4.Item, { name: "mode", label: "\u53D1\u73B0\u65B9\u5F0F" }, /* @__PURE__ */ React5.createElement(Segmented4, { block: true, options: [{ label: "\u5173\u952E\u8BCD", value: "keyword" }, { label: "\u756A\u53F7\u5217\u8868", value: "codes" }] })), /* @__PURE__ */ React5.createElement(Form4.Item, { name: "query", label: "\u5173\u952E\u8BCD\u6216\u756A\u53F7", rules: [{ required: true }] }, /* @__PURE__ */ React5.createElement(Input4.TextArea, { rows: 4 })), /* @__PURE__ */ React5.createElement(Form4.Item, { name: "max_results", label: "\u6700\u591A\u5904\u7406" }, /* @__PURE__ */ React5.createElement(InputNumber3, { min: 1, max: 1e3 })), /* @__PURE__ */ React5.createElement(Form4.Item, { name: "source", label: "\u78C1\u529B\u6765\u6E90" }, /* @__PURE__ */ React5.createElement(Select4, { options: [{ label: "JavBus", value: "javbus" }, { label: "Cilisiusou", value: "cilisousuo" }, { label: "YHG007", value: "yhg007" }] })), /* @__PURE__ */ React5.createElement(Form4.Item, { name: "has_subtitle", label: "\u5B57\u5E55\u8981\u6C42" }, /* @__PURE__ */ React5.createElement(Select4, { options: [{ label: "\u4E0D\u9650", value: "" }, { label: "\u53EA\u8981\u5B57\u5E55", value: "true" }, { label: "\u6392\u9664\u5B57\u5E55", value: "false" }] })), /* @__PURE__ */ React5.createElement(Form4.Item, { name: "exclude_4k", label: "\u6392\u9664 4K", valuePropName: "checked" }, /* @__PURE__ */ React5.createElement(Switch3, null)), /* @__PURE__ */ React5.createElement(Form4.Item, { name: "tool", label: "\u6D3E\u53D1\u76EE\u6807" }, /* @__PURE__ */ React5.createElement(Segmented4, { block: true, options: [{ label: "PikPak", value: "pikpak" }, { label: "115", value: "115" }, { label: "Aria2", value: "aria2" }] })), /* @__PURE__ */ React5.createElement(Button4, { type: "primary", block: true, htmlType: "submit" }, "\u4FDD\u5B58\u4EFB\u52A1"))), /* @__PURE__ */ React5.createElement(Drawer3, { title: selected ? `${selected.name} \xB7 \u8FD0\u884C\u8BB0\u5F55` : "\u8FD0\u884C\u8BB0\u5F55", open: runsOpen, onClose: () => {
      setRunsOpen(false);
      setSelected(null);
      setRuns([]);
    }, width: 760 }, /* @__PURE__ */ React5.createElement(Table4, { rowKey: "id", dataSource: runs, expandable: { expandedRowRender: (record) => /* @__PURE__ */ React5.createElement(Table4, { size: "small", pagination: false, rowKey: (item, index) => `${item.movie_id}-${index}`, dataSource: record.items || [], columns: [
      { title: "\u756A\u53F7", dataIndex: "movie_id" },
      { title: "\u6807\u9898", dataIndex: "title", ellipsis: true },
      { title: "\u72B6\u6001", dataIndex: "status", render: (value) => /* @__PURE__ */ React5.createElement(Tag5, null, value) },
      { title: "\u78C1\u529B", dataIndex: "magnet_link", ellipsis: true },
      { title: "\u8BF4\u660E", dataIndex: "message", ellipsis: true }
    ] }) }, columns: [
      { title: "\u5F00\u59CB\u65F6\u95F4", dataIndex: "started_at" },
      { title: "\u72B6\u6001", dataIndex: "status", render: (value) => /* @__PURE__ */ React5.createElement(Tag5, { color: value === "success" ? "green" : value === "failed" ? "red" : "orange" }, value) },
      { title: "\u53D1\u73B0", dataIndex: "found_count" },
      { title: "\u78C1\u529B", dataIndex: "magnet_count" },
      { title: "\u6D3E\u53D1", dataIndex: "dispatched_count" },
      { title: "\u8DF3\u8FC7", dataIndex: "skipped_count" }
    ] })));
  }

  // frontend/src/workbench/pages/CloudPage.jsx
  var React6 = window.React;
  var { Alert: Alert2, Button: Button5, Form: Form5, Input: Input5, InputNumber: InputNumber4, Modal: Modal4, Pagination, Segmented: Segmented5, Space: Space5, Switch: Switch4, Table: Table5, Tag: Tag6, Typography: Typography6, message: message5 } = window.antd;
  var { Text: Text6 } = Typography6;
  var icons5 = window.icons || {};
  function CloudPage({ clientConfig, connections, refreshRuntime, navigate }) {
    const [source, setSource] = React6.useState(clientConfig.pan115?.configured ? "pan115" : "webdav");
    const [path, setPath] = React6.useState("/");
    const [pathStack, setPathStack] = React6.useState([]);
    const [files, setFiles] = React6.useState([]);
    const [selected, setSelected] = React6.useState([]);
    const [loading, setLoading] = React6.useState(false);
    const [connectOpen, setConnectOpen] = React6.useState(false);
    const [panOpen, setPanOpen] = React6.useState(false);
    const [pan115Status, setPan115Status] = React6.useState({});
    const [qrSession, setQrSession] = React6.useState(null);
    const [offset, setOffset] = React6.useState(0);
    const [total, setTotal] = React6.useState(0);
    const [videoOnly, setVideoOnly] = React6.useState(true);
    const [minSize, setMinSize] = React6.useState(300);
    const [dispatchResults, setDispatchResults] = React6.useState([]);
    const [connectForm] = Form5.useForm();
    const [cookieForm] = Form5.useForm();
    const pageSize = 100;
    const refresh115 = React6.useCallback(async () => {
      try {
        setPan115Status(await api("/api/115/status"));
      } catch {
        setPan115Status({ connected: false });
      }
    }, []);
    React6.useEffect(() => {
      void refresh115();
    }, [refresh115]);
    React6.useEffect(() => {
      if (!qrSession?.session_id || ["allowed", "expired", "canceled"].includes(qrSession.state)) return void 0;
      const timer = window.setInterval(async () => {
        try {
          const result = await api(`/api/115/qrcode/${encodeURIComponent(qrSession.session_id)}/status`);
          setQrSession((current) => ({ ...current, ...result }));
          if (result.configured && result.state === "allowed") {
            await refresh115();
            await refreshRuntime();
            message5.success("115 \u626B\u7801\u767B\u5F55\u6210\u529F");
          }
        } catch (error) {
          setQrSession((current) => ({ ...current, state: "expired", message: error.message }));
        }
      }, 2e3);
      return () => window.clearInterval(timer);
    }, [qrSession?.session_id, qrSession?.state, refresh115, refreshRuntime]);
    const ready = source === "webdav" ? connections.webdav_connected : source === "pan115" ? !!(pan115Status.connected || clientConfig.pan115?.configured) : true;
    const load = React6.useCallback(async (nextPath, nextSource, nextOffset = 0) => {
      setLoading(true);
      setSelected([]);
      try {
        let payload;
        if (nextSource === "pan115") payload = await api(`/api/115/files?cid=${encodeURIComponent(nextPath === "/" ? "0" : nextPath)}&offset=${nextOffset}&limit=${pageSize}`);
        else if (nextSource === "local") payload = await api(`/api/system/files?path=${encodeURIComponent(nextPath)}`);
        else payload = await api(`/api/webdav/files?path=${encodeURIComponent(nextPath)}`);
        const rows = payload.files || payload.items || payload.entries || payload.data || [];
        setFiles(rows.map((item, index) => ({
          ...item,
          _key: item.path || item.pick_code || item.id || item.cid || index,
          name: item.name || item.n || item.file_name || "\u672A\u547D\u540D",
          path: item.path || item.id || item.cid || item.file_id || item.pick_code || "",
          is_directory: item.is_directory ?? item.is_dir ?? item.isdir ?? item.kind === "folder",
          size: Number(item.size || item.s || 0),
          source_type: nextSource === "pan115" ? "pan115" : nextSource === "local" ? "local" : "webdav",
          pick_code: item.pick_code || item.pc || ""
        })));
        setPath(payload.current_path || payload.cid || nextPath);
        setOffset(nextOffset);
        setTotal(Number(payload.count || rows.length));
      } catch (error) {
        if (nextSource !== "local") message5.error(error.message);
        setFiles([]);
      } finally {
        setLoading(false);
      }
    }, []);
    React6.useEffect(() => {
      if (ready) void load(source === "pan115" ? "0" : "/", source, 0);
      else setFiles([]);
    }, [source, ready, load]);
    const changeSource = (value) => {
      setSource(value);
      setPath(value === "pan115" ? "0" : "/");
      setPathStack([]);
      setOffset(0);
    };
    const openFolder = (record) => {
      if (!record.is_directory) return;
      if (source === "pan115") setPathStack((stack) => [...stack, path]);
      void load(record.path, source, 0);
    };
    const goUp = () => {
      if (source === "pan115") {
        const parent2 = pathStack.at(-1) || "0";
        setPathStack((stack) => stack.slice(0, -1));
        return load(parent2, source, 0);
      }
      const parent = path.replace(/[/\\]+$/, "").split(/[/\\]/).slice(0, -1).join("/") || "/";
      return load(parent, source, 0);
    };
    const connect = async (values) => {
      setLoading(true);
      try {
        const result = await api("/api/webdav/connect", { method: "POST", body: formData({ webdav_url: values.url, username: values.username, password: values.password }) });
        if (!result.success) throw new Error(result.message || "WebDAV \u8FDE\u63A5\u5931\u8D25");
        connectForm.setFieldValue("password", "");
        setConnectOpen(false);
        await refreshRuntime();
        await load("/", "webdav");
        message5.success("WebDAV \u5DF2\u8FDE\u63A5\u5230\u5F53\u524D\u4F1A\u8BDD");
      } catch (error) {
        message5.error(error.message);
      } finally {
        setLoading(false);
      }
    };
    const connectConfigured = async () => {
      try {
        const result = await api("/api/webdav/connect-config", { method: "POST" });
        if (!result.success) throw new Error(result.message);
        await refreshRuntime();
        await load("/", "webdav");
      } catch (error) {
        message5.error(error.message);
      }
    };
    const startQrLogin = async () => {
      try {
        setQrSession(await api("/api/115/qrcode/start", { method: "POST", body: JSON.stringify({ app: clientConfig.pan115?.login_app || "wechatmini" }) }));
      } catch (error) {
        message5.error(error.message);
      }
    };
    const saveCookie = async (values) => {
      try {
        await api("/api/115/cookie", { method: "POST", body: JSON.stringify({ cookie: values.cookie, enabled: true }) });
        cookieForm.resetFields();
        await refresh115();
        await refreshRuntime();
        message5.success("115 Cookie \u5DF2\u9A8C\u8BC1\u5E76\u4FDD\u5B58");
      } catch (error) {
        message5.error(error.message);
      }
    };
    const dispatch = async () => {
      if (!connections.aria2_connected) return message5.warning("\u8BF7\u5148\u5728\u4E0B\u8F7D\u9875\u8FDE\u63A5 Aria2");
      const chosen = files.filter((file) => selected.includes(file._key));
      try {
        const result = await api("/api/webdav/download", { method: "POST", body: JSON.stringify({ files: chosen, video_filter: videoOnly, min_file_size_mb: minSize }) });
        setDispatchResults(result.results || []);
        setSelected([]);
        const success = (result.results || []).filter((item) => item.success).length;
        message5.success(`\u5DF2\u53D1\u9001 ${success}/${chosen.length} \u9879\u5230 Aria2`);
      } catch (error) {
        message5.error(error.message);
      }
    };
    return /* @__PURE__ */ React6.createElement("div", { className: "wb-page" }, /* @__PURE__ */ React6.createElement(PageIntro, { title: "\u4E91\u7AEF\u6587\u4EF6", description: "\u8FDE\u63A5\u5E76\u6D4F\u89C8 WebDAV\u3001115 \u7F51\u76D8\u548C\u670D\u52A1\u7AEF\u76EE\u5F55\uFF0C\u518D\u628A\u9009\u4E2D\u8D44\u6E90\u6D3E\u53D1\u5230\u5F53\u524D\u4F1A\u8BDD\u7684 Aria2\u3002", actions: [/* @__PURE__ */ React6.createElement(Button5, { key: "webdav", onClick: () => setConnectOpen(true) }, "\u8FDE\u63A5 WebDAV"), /* @__PURE__ */ React6.createElement(Button5, { key: "pan115", onClick: () => setPanOpen(true) }, "115 \u767B\u5F55"), /* @__PURE__ */ React6.createElement(Button5, { key: "downloads", type: "text", onClick: () => navigate("downloads") }, "\u6253\u5F00\u4E0B\u8F7D\u961F\u5217")] }), /* @__PURE__ */ React6.createElement("div", { className: "wb-cloud-sources" }, /* @__PURE__ */ React6.createElement(Segmented5, { value: source, onChange: changeSource, options: [{ label: "WebDAV", value: "webdav" }, { label: "115 \u7F51\u76D8", value: "pan115" }, { label: "\u670D\u52A1\u7AEF\u6587\u4EF6", value: "local" }] }), /* @__PURE__ */ React6.createElement(StatusDot, { ready }, ready ? "\u5DF2\u8FDE\u63A5" : "\u672A\u8FDE\u63A5"), /* @__PURE__ */ React6.createElement(StatusDot, { ready: connections.aria2_connected }, "Aria2 ", connections.aria2_connected ? "\u5DF2\u5C31\u7EEA" : "\u672A\u8FDE\u63A5")), /* @__PURE__ */ React6.createElement("section", { className: "wb-file-browser" }, /* @__PURE__ */ React6.createElement("div", { className: "wb-browser-toolbar" }, /* @__PURE__ */ React6.createElement(Space5, null, /* @__PURE__ */ React6.createElement(Button5, { type: "text", icon: icons5.ArrowUpOutlined ? /* @__PURE__ */ React6.createElement(icons5.ArrowUpOutlined, null) : null, onClick: goUp, disabled: source === "pan115" && !pathStack.length || source !== "pan115" && path === "/" }, "\u4E0A\u4E00\u7EA7"), /* @__PURE__ */ React6.createElement(Text6, { code: true }, path)), /* @__PURE__ */ React6.createElement(Space5, { wrap: true }, /* @__PURE__ */ React6.createElement(Space5, null, /* @__PURE__ */ React6.createElement(Switch4, { checked: videoOnly, onChange: setVideoOnly }), /* @__PURE__ */ React6.createElement(Text6, null, "\u4EC5\u89C6\u9891")), /* @__PURE__ */ React6.createElement(InputNumber4, { value: minSize, onChange: (value) => setMinSize(value || 0), min: 0, addonAfter: "MB" }), /* @__PURE__ */ React6.createElement(Button5, { type: "primary", onClick: dispatch, disabled: !selected.length || source === "local" }, "\u53D1\u9001\u6240\u9009 ", selected.length || ""))), ready ? /* @__PURE__ */ React6.createElement(React6.Fragment, null, /* @__PURE__ */ React6.createElement(Table5, { rowKey: "_key", loading, dataSource: files, pagination: false, rowSelection: { selectedRowKeys: selected, onChange: setSelected, getCheckboxProps: () => ({ disabled: source === "local" }) }, onRow: (record) => ({ onDoubleClick: () => openFolder(record) }), columns: [{ title: "\u540D\u79F0", dataIndex: "name", render: (value, record) => /* @__PURE__ */ React6.createElement(Button5, { type: "link", className: "wb-file-name", disabled: !record.is_directory, onClick: () => openFolder(record) }, value) }, { title: "\u7C7B\u578B", width: 100, render: (_, record) => record.is_directory ? /* @__PURE__ */ React6.createElement(Tag6, null, "\u76EE\u5F55") : /* @__PURE__ */ React6.createElement(Tag6, { color: "blue" }, "\u6587\u4EF6") }, { title: "\u5927\u5C0F", dataIndex: "size", width: 120, render: (value) => formatBytes(value) }] }), source === "pan115" && total > pageSize ? /* @__PURE__ */ React6.createElement(Pagination, { current: Math.floor(offset / pageSize) + 1, pageSize, total, showSizeChanger: false, onChange: (page) => load(path, source, (page - 1) * pageSize) }) : null) : /* @__PURE__ */ React6.createElement(EmptyBlock, { title: `${source === "pan115" ? "115 \u7F51\u76D8" : "WebDAV"} \u672A\u8FDE\u63A5`, description: "\u4F7F\u7528\u670D\u52A1\u7AEF\u914D\u7F6E\uFF0C\u6216\u5728\u5F53\u524D\u9875\u9762\u5B8C\u6210\u767B\u5F55\u3002" })), /* @__PURE__ */ React6.createElement(Modal4, { title: "\u8FDE\u63A5 WebDAV", open: connectOpen, onCancel: () => setConnectOpen(false), footer: null }, /* @__PURE__ */ React6.createElement(Form5, { form: connectForm, layout: "vertical", onFinish: connect, initialValues: { url: clientConfig.webdav?.url || "", username: clientConfig.webdav?.username || "" } }, /* @__PURE__ */ React6.createElement(Form5.Item, { name: "url", label: "WebDAV \u5730\u5740", rules: [{ required: true }] }, /* @__PURE__ */ React6.createElement(Input5, null)), /* @__PURE__ */ React6.createElement(Form5.Item, { name: "username", label: "\u7528\u6237\u540D" }, /* @__PURE__ */ React6.createElement(Input5, { autoComplete: "username" })), /* @__PURE__ */ React6.createElement(Form5.Item, { name: "password", label: "\u5BC6\u7801" }, /* @__PURE__ */ React6.createElement(Input5.Password, { autoComplete: "current-password" })), /* @__PURE__ */ React6.createElement(Button5, { type: "primary", block: true, htmlType: "submit", loading }, "\u8FDE\u63A5\u5F53\u524D\u4F1A\u8BDD"), clientConfig.webdav?.configured ? /* @__PURE__ */ React6.createElement(Button5, { className: "wb-submit", block: true, onClick: connectConfigured }, "\u4F7F\u7528\u670D\u52A1\u7AEF\u914D\u7F6E") : null)), /* @__PURE__ */ React6.createElement(Modal4, { title: "115 \u767B\u5F55", open: panOpen, onCancel: () => setPanOpen(false), footer: null }, /* @__PURE__ */ React6.createElement(Alert2, { type: pan115Status.connected ? "success" : "warning", showIcon: true, message: pan115Status.connected ? `\u5DF2\u8FDE\u63A5${pan115Status.uid ? ` \xB7 ${pan115Status.uid}` : ""}` : "\u626B\u7801\u767B\u5F55\u6216\u7C98\u8D34 Cookie" }), /* @__PURE__ */ React6.createElement(Button5, { className: "wb-submit", type: "primary", block: true, onClick: startQrLogin }, "\u751F\u6210\u767B\u5F55\u4E8C\u7EF4\u7801"), qrSession ? /* @__PURE__ */ React6.createElement("div", { className: "wb-qr-login" }, /* @__PURE__ */ React6.createElement("img", { src: qrSession.qrcode_image_url, alt: "115 \u767B\u5F55\u4E8C\u7EF4\u7801" }), /* @__PURE__ */ React6.createElement(Text6, null, qrSession.message || qrSession.state)) : null, /* @__PURE__ */ React6.createElement(Form5, { form: cookieForm, layout: "vertical", onFinish: saveCookie }, /* @__PURE__ */ React6.createElement(Form5.Item, { name: "cookie", label: "115 Cookie", rules: [{ required: true }] }, /* @__PURE__ */ React6.createElement(Input5.Password, null)), /* @__PURE__ */ React6.createElement(Button5, { block: true, htmlType: "submit" }, "\u9A8C\u8BC1\u5E76\u4FDD\u5B58 Cookie"))), /* @__PURE__ */ React6.createElement(Modal4, { title: "\u6D3E\u53D1\u7ED3\u679C", open: dispatchResults.length > 0, onCancel: () => setDispatchResults([]), footer: /* @__PURE__ */ React6.createElement(Button5, { onClick: () => setDispatchResults([]) }, "\u5173\u95ED"), width: 760 }, /* @__PURE__ */ React6.createElement(Table5, { rowKey: (item, index) => item.gid || item.filename || index, pagination: false, dataSource: dispatchResults, columns: [{ title: "\u6587\u4EF6", dataIndex: "filename", ellipsis: true }, { title: "\u72B6\u6001", render: (_, item) => item.success ? /* @__PURE__ */ React6.createElement(Tag6, { color: "green" }, "\u6210\u529F") : item.skipped ? /* @__PURE__ */ React6.createElement(Tag6, { color: "orange" }, "\u8DF3\u8FC7") : /* @__PURE__ */ React6.createElement(Tag6, { color: "red" }, "\u5931\u8D25") }, { title: "\u8BF4\u660E", dataIndex: "message", ellipsis: true }, { title: "GID", dataIndex: "gid", ellipsis: true }] })));
  }

  // frontend/src/workbench/pages/DownloadsPage.jsx
  var React7 = window.React;
  var { Button: Button6, Card: Card3, Form: Form6, Input: Input6, Popconfirm: Popconfirm5, Progress: Progress4, Segmented: Segmented6, Space: Space6, Table: Table6, Tag: Tag7, Typography: Typography7, message: message6 } = window.antd;
  var { Text: Text7 } = Typography7;
  var icons6 = window.icons || {};
  var ARIA2_ACTIONS = { pause: "/api/aria2/pause/", resume: "/api/aria2/resume/", remove: "/api/aria2/remove/" };
  function DownloadsPage({ clientConfig, connections, refreshRuntime }) {
    const [downloads, setDownloads] = React7.useState([]);
    const [aria2Status, setAria2Status] = React7.useState({ connected: false });
    const [statusFilter, setStatusFilter] = React7.useState("all");
    const [magnetOpen, setMagnetOpen] = React7.useState(false);
    const [loading, setLoading] = React7.useState(false);
    const [form] = Form6.useForm();
    const [magnetForm] = Form6.useForm();
    const load = React7.useCallback(async () => {
      const status = await api("/api/aria2/status").catch(() => ({ connected: false }));
      setAria2Status(status);
      if (!connections.aria2_connected) return setDownloads([]);
      try {
        setDownloads((await api("/api/aria2/downloads")).downloads || []);
      } catch (error) {
        message6.error(error.message);
      }
    }, [connections.aria2_connected]);
    React7.useEffect(() => {
      void load();
      if (!connections.aria2_connected) return void 0;
      const timer = window.setInterval(load, 1e4);
      return () => window.clearInterval(timer);
    }, [connections.aria2_connected, load]);
    const connect = async (values) => {
      setLoading(true);
      try {
        const result = await api("/api/aria2/connect", { method: "POST", body: formData({ aria2_url: values.url, aria2_secret: values.secret }) });
        if (!result.success) throw new Error(result.message || "Aria2 \u8FDE\u63A5\u5931\u8D25");
        form.setFieldValue("secret", "");
        await refreshRuntime();
        await load();
        message6.success("Aria2 \u5DF2\u8FDE\u63A5\u5230\u5F53\u524D\u6D4F\u89C8\u5668\u4F1A\u8BDD");
      } catch (error) {
        message6.error(error.message);
      } finally {
        setLoading(false);
      }
    };
    const connectConfigured = async () => {
      try {
        const result = await api("/api/aria2/connect-config", { method: "POST" });
        if (!result.success) throw new Error(result.message || "Aria2 \u8FDE\u63A5\u5931\u8D25");
        await refreshRuntime();
        await load();
        message6.success("\u5DF2\u4F7F\u7528\u670D\u52A1\u7AEF\u914D\u7F6E\u8FDE\u63A5");
      } catch (error) {
        message6.error(error.message);
      }
    };
    const act = async (action, gid) => {
      try {
        await api(`${ARIA2_ACTIONS[action]}${encodeURIComponent(gid)}`, { method: action === "remove" ? "DELETE" : "POST" });
        await load();
      } catch (error) {
        message6.error(error.message);
      }
    };
    const addMagnets = async (values) => {
      const links = values.magnets.split(/\r?\n/).map((value) => value.trim()).filter((value) => value.startsWith("magnet:"));
      if (!links.length) return message6.warning("\u8BF7\u8F93\u5165\u6709\u6548\u7684 magnet \u94FE\u63A5");
      try {
        const result = await api("/api/aria2/download-magnets", { method: "POST", body: JSON.stringify({ magnet_links: links, movie_ids: [], magnet_sources: [] }) });
        message6.success(result.message || `\u5DF2\u6DFB\u52A0 ${links.length} \u4E2A\u78C1\u529B\u4EFB\u52A1`);
        magnetForm.resetFields();
        setMagnetOpen(false);
        await load();
      } catch (error) {
        message6.error(error.message);
      }
    };
    const visible = statusFilter === "all" ? downloads : downloads.filter((item) => item.status === statusFilter);
    const totalSpeed = downloads.reduce((sum, item) => sum + Number(item.downloadSpeed || item.download_speed || 0), 0);
    return /* @__PURE__ */ React7.createElement("div", { className: "wb-page" }, /* @__PURE__ */ React7.createElement(PageIntro, { title: "\u4E0B\u8F7D\u961F\u5217", description: "\u8FDE\u63A5\u5F53\u524D\u4F1A\u8BDD\u7684 Aria2\uFF0C\u6DFB\u52A0\u78C1\u529B\u5E76\u7BA1\u7406\u6240\u6709\u4F20\u8F93\u72B6\u6001\u3002", actions: [/* @__PURE__ */ React7.createElement(Button6, { key: "magnet", type: "primary", disabled: !connections.aria2_connected, onClick: () => setMagnetOpen((value) => !value) }, "\u6DFB\u52A0\u78C1\u529B"), /* @__PURE__ */ React7.createElement(Button6, { key: "refresh", type: "text", icon: icons6.ReloadOutlined ? /* @__PURE__ */ React7.createElement(icons6.ReloadOutlined, null) : null, disabled: !connections.aria2_connected, onClick: load }, "\u5237\u65B0")] }), magnetOpen ? /* @__PURE__ */ React7.createElement(Card3, { className: "wb-inline-tool", title: "\u624B\u52A8\u6DFB\u52A0\u78C1\u529B" }, /* @__PURE__ */ React7.createElement(Form6, { form: magnetForm, layout: "vertical", onFinish: addMagnets }, /* @__PURE__ */ React7.createElement(Form6.Item, { name: "magnets", label: "\u6BCF\u884C\u4E00\u4E2A magnet \u94FE\u63A5", rules: [{ required: true }] }, /* @__PURE__ */ React7.createElement(Input6.TextArea, { rows: 4 })), /* @__PURE__ */ React7.createElement(Button6, { type: "primary", htmlType: "submit" }, "\u6DFB\u52A0\u5230 Aria2"))) : null, /* @__PURE__ */ React7.createElement("div", { className: "wb-download-layout" }, /* @__PURE__ */ React7.createElement(Card3, { className: "wb-control-panel", title: /* @__PURE__ */ React7.createElement(Space6, null, /* @__PURE__ */ React7.createElement("span", null, "Aria2 \u8FDE\u63A5"), /* @__PURE__ */ React7.createElement(StatusDot, { ready: connections.aria2_connected }, connections.aria2_connected ? "\u5DF2\u8FDE\u63A5" : "\u672A\u8FDE\u63A5")) }, /* @__PURE__ */ React7.createElement(Form6, { form, layout: "vertical", onFinish: connect, initialValues: { url: clientConfig.aria2?.url || "http://127.0.0.1:6800/jsonrpc" } }, /* @__PURE__ */ React7.createElement(Form6.Item, { name: "url", label: "JSON-RPC \u5730\u5740", rules: [{ required: true }] }, /* @__PURE__ */ React7.createElement(Input6, null)), /* @__PURE__ */ React7.createElement(Form6.Item, { name: "secret", label: "RPC Secret" }, /* @__PURE__ */ React7.createElement(Input6.Password, { placeholder: clientConfig.aria2?.has_secret ? "\u5DF2\u914D\u7F6E\uFF0C\u7559\u7A7A\u4E0D\u4F1A\u8986\u76D6" : "\u53EF\u9009" })), /* @__PURE__ */ React7.createElement(Button6, { type: "primary", block: true, htmlType: "submit", loading }, "\u8FDE\u63A5\u5F53\u524D\u4F1A\u8BDD"), clientConfig.aria2?.configured ? /* @__PURE__ */ React7.createElement(Button6, { className: "wb-submit", block: true, onClick: connectConfigured }, "\u4F7F\u7528\u670D\u52A1\u7AEF\u914D\u7F6E") : null)), /* @__PURE__ */ React7.createElement("section", { className: "wb-work-surface" }, /* @__PURE__ */ React7.createElement("div", { className: "wb-surface-head" }, /* @__PURE__ */ React7.createElement("div", null, /* @__PURE__ */ React7.createElement("strong", null, "\u4F20\u8F93\u4EFB\u52A1"), /* @__PURE__ */ React7.createElement(Text7, { type: "secondary" }, downloads.length, " \u4E2A\u4EFB\u52A1 \xB7 ", formatBytes(totalSpeed), "/s", aria2Status.version?.version ? ` \xB7 Aria2 ${aria2Status.version.version}` : "")), /* @__PURE__ */ React7.createElement(Segmented6, { value: statusFilter, onChange: setStatusFilter, options: [{ label: "\u5168\u90E8", value: "all" }, { label: "\u4E0B\u8F7D\u4E2D", value: "active" }, { label: "\u6682\u505C", value: "paused" }, { label: "\u5B8C\u6210", value: "complete" }, { label: "\u9519\u8BEF", value: "error" }] })), connections.aria2_connected ? /* @__PURE__ */ React7.createElement(Table6, { rowKey: "gid", dataSource: visible, scroll: { x: 900 }, columns: [
      { title: "\u540D\u79F0", ellipsis: true, render: (_, record) => record.name || record.files?.[0]?.path?.split(/[/\\]/).pop() || record.gid },
      { title: "\u8FDB\u5EA6", width: 220, render: (_, record) => {
        const total = Number(record.totalLength || record.total_length || 0);
        const done = Number(record.completedLength || record.completed_length || 0);
        return /* @__PURE__ */ React7.createElement(Progress4, { percent: total ? Math.round(done / total * 100) : 0, size: "small" });
      } },
      { title: "\u901F\u5EA6", width: 120, render: (_, record) => `${formatBytes(record.downloadSpeed || record.download_speed)}/s` },
      { title: "\u72B6\u6001", width: 100, dataIndex: "status", render: (value) => /* @__PURE__ */ React7.createElement(Tag7, { color: value === "active" ? "green" : value === "error" ? "red" : "default" }, value || "unknown") },
      { title: "\u64CD\u4F5C", width: 230, render: (_, record) => /* @__PURE__ */ React7.createElement(Space6, null, record.status === "paused" ? /* @__PURE__ */ React7.createElement(Button6, { type: "text", onClick: () => act("resume", record.gid) }, "\u7EE7\u7EED") : /* @__PURE__ */ React7.createElement(Button6, { type: "text", disabled: ["complete", "error", "removed"].includes(record.status), onClick: () => act("pause", record.gid) }, "\u6682\u505C"), /* @__PURE__ */ React7.createElement(Popconfirm5, { title: "\u4ECE Aria2 \u79FB\u9664\u8FD9\u4E2A\u4EFB\u52A1\uFF1F", onConfirm: () => act("remove", record.gid) }, /* @__PURE__ */ React7.createElement(Button6, { type: "text", danger: true }, "\u79FB\u9664"))) }
    ] }) : /* @__PURE__ */ React7.createElement(EmptyBlock, { title: "\u5148\u8FDE\u63A5 Aria2", description: "\u8FDE\u63A5\u5F53\u524D\u4F1A\u8BDD\uFF0C\u6216\u4F7F\u7528\u5DF2\u7ECF\u4FDD\u5B58\u7684\u670D\u52A1\u7AEF\u914D\u7F6E\u3002" }))));
  }

  // frontend/src/workbench/pages/SettingsPage.jsx
  var React8 = window.React;
  var { Alert: Alert3, Button: Button7, Card: Card4, Collapse, Descriptions: Descriptions2, Drawer: Drawer4, Form: Form7, Input: Input7, InputNumber: InputNumber5, Modal: Modal5, Select: Select5, Space: Space7, Switch: Switch5, Table: Table7, Tag: Tag8, Typography: Typography8, message: message7 } = window.antd;
  var { Text: Text8 } = Typography8;
  var PROVIDER_LABELS = {
    javbus: "JavBus",
    r18dev: "R18.dev",
    dmm: "DMM",
    libredmm: "LibreDMM",
    javlibrary: "JAVLibrary",
    javdb: "JavDB",
    jav321: "JAV321",
    mgstage: "MGStage",
    tokyohot: "TokyoHot",
    aventertainment: "AVEntertainment",
    dlgetchu: "DLGetchu",
    caribbeancom: "Caribbeancom",
    fc2: "FC2",
    javstash: "JavStash"
  };
  function cleanSection(value, secrets = []) {
    const next = { ...value || {} };
    secrets.forEach((key) => {
      if (!next[key]) delete next[key];
    });
    Object.keys(next).forEach((key) => {
      if (key.startsWith("has_")) delete next[key];
    });
    return next;
  }
  function SettingsPage({ refreshRuntime }) {
    const [settings, setSettings] = React8.useState(null);
    const [diagnostics, setDiagnostics] = React8.useState(null);
    const [diagnosticsOpen, setDiagnosticsOpen] = React8.useState(false);
    const [testOpen, setTestOpen] = React8.useState(false);
    const [scraperResults, setScraperResults] = React8.useState([]);
    const [loading, setLoading] = React8.useState(true);
    const [form] = Form7.useForm();
    const [testForm] = Form7.useForm();
    const load = React8.useCallback(async () => {
      setLoading(true);
      try {
        const [payload, info] = await Promise.all([api("/api/system/settings"), api("/api/system/info")]);
        setSettings(payload);
        setDiagnostics(info);
        form.setFieldsValue(payload);
      } catch (error) {
        message7.error(error.message);
      } finally {
        setLoading(false);
      }
    }, [form]);
    React8.useEffect(() => {
      void load();
    }, [load]);
    const save = async (values) => {
      const scrapers = {};
      Object.keys(PROVIDER_LABELS).forEach((provider) => {
        const value = values.scrapers?.[provider];
        if (value) scrapers[provider] = cleanSection(value, ["api_key"]);
      });
      if (values.scrapers?.priority) scrapers.priority = values.scrapers.priority;
      const payload = {
        javbus: cleanSection(values.javbus),
        scrapers,
        webdav: cleanSection(values.webdav, ["password"]),
        aria2: cleanSection(values.aria2, ["secret"]),
        pikpak: cleanSection(values.pikpak, ["password"]),
        pan115: cleanSection(values.pan115, ["cookie"]),
        magnet_health: cleanSection(values.magnet_health)
      };
      setLoading(true);
      try {
        const result = await api("/api/system/settings", { method: "PUT", body: JSON.stringify(payload) });
        setSettings(result);
        form.setFieldsValue(result);
        await refreshRuntime();
        message7.success("\u8BBE\u7F6E\u5DF2\u4FDD\u5B58\u5E76\u70ED\u66F4\u65B0");
      } catch (error) {
        message7.error(error.message);
      } finally {
        setLoading(false);
      }
    };
    const saveJavbus = async () => {
      try {
        const result = await api("/api/system/settings/javbus", { method: "PUT", body: JSON.stringify({ javbus: cleanSection(form.getFieldValue("javbus")) }) });
        setSettings(result);
        form.setFieldsValue(result);
        message7.success("JavBus \u8BBE\u7F6E\u5DF2\u70ED\u66F4\u65B0");
      } catch (error) {
        message7.error(error.message);
      }
    };
    const testScrapers = async (values) => {
      setLoading(true);
      try {
        const result = await api("/api/movies/metadata-scrapers/test", { method: "POST", body: JSON.stringify({ providers: values.providers, movie_ids: values.movie_ids ? JSON.parse(values.movie_ids) : null, concurrent: values.concurrent, apply_results: false }) });
        setScraperResults(result.results || []);
      } catch (error) {
        message7.error(error.message);
      } finally {
        setLoading(false);
      }
    };
    const applyScraperResults = async () => {
      try {
        await api("/api/movies/metadata-scrapers/apply-test-results", { method: "POST", body: JSON.stringify({ results: scraperResults }) });
        message7.success("\u6D4B\u8BD5\u7ED3\u679C\u5DF2\u5E94\u7528\u5230\u522E\u524A\u6E90\u914D\u7F6E");
        setTestOpen(false);
        await load();
      } catch (error) {
        message7.error(error.message);
      }
    };
    const providerItems = Object.entries(PROVIDER_LABELS).map(([provider, label]) => ({
      key: provider,
      label: /* @__PURE__ */ React8.createElement(Space7, null, /* @__PURE__ */ React8.createElement("span", null, label), settings?.scrapers?.[provider]?.enabled ? /* @__PURE__ */ React8.createElement(Tag8, { color: "green" }, "\u542F\u7528") : /* @__PURE__ */ React8.createElement(Tag8, null, "\u505C\u7528")),
      children: /* @__PURE__ */ React8.createElement("div", { className: "wb-provider-form" }, /* @__PURE__ */ React8.createElement(Form7.Item, { name: ["scrapers", provider, "enabled"], label: "\u542F\u7528", valuePropName: "checked" }, /* @__PURE__ */ React8.createElement(Switch5, null)), /* @__PURE__ */ React8.createElement(Form7.Item, { name: ["scrapers", provider, "language"], label: "\u8BED\u8A00" }, /* @__PURE__ */ React8.createElement(Select5, { options: [{ label: "\u4E2D\u6587", value: "zh" }, { label: "\u7B80\u4E2D", value: "cn" }, { label: "\u65E5\u6587", value: "ja" }, { label: "\u82F1\u6587", value: "en" }] })), /* @__PURE__ */ React8.createElement(Form7.Item, { name: ["scrapers", provider, "request_delay"], label: "\u8BF7\u6C42\u95F4\u9694" }, /* @__PURE__ */ React8.createElement(InputNumber5, { min: 0, max: 6e4, addonAfter: "ms" })), provider === "javbus" || provider === "javstash" ? /* @__PURE__ */ React8.createElement(Form7.Item, { name: ["scrapers", provider, "base_url"], label: "\u670D\u52A1\u5730\u5740" }, /* @__PURE__ */ React8.createElement(Input7, null)) : null, provider === "javstash" ? /* @__PURE__ */ React8.createElement(Form7.Item, { name: ["scrapers", provider, "api_key"], label: "API Key" }, /* @__PURE__ */ React8.createElement(Input7.Password, { placeholder: settings?.scrapers?.javstash?.has_api_key ? "\u5DF2\u914D\u7F6E\uFF0C\u7559\u7A7A\u4E0D\u4F1A\u8986\u76D6" : "\u53EF\u9009" })) : null)
    }));
    return /* @__PURE__ */ React8.createElement("div", { className: "wb-page" }, /* @__PURE__ */ React8.createElement(
      PageIntro,
      {
        title: "\u7CFB\u7EDF\u8BBE\u7F6E",
        description: "\u654F\u611F\u5B57\u6BB5\u53EA\u663E\u793A\u662F\u5426\u5DF2\u914D\u7F6E\uFF1B\u7559\u7A7A\u4FDD\u5B58\u4E0D\u4F1A\u8986\u76D6\u5DF2\u6709\u5BC6\u7801\u3001Cookie \u6216 Secret\u3002",
        actions: [/* @__PURE__ */ React8.createElement(Button7, { key: "diagnostics", onClick: () => setDiagnosticsOpen(true) }, "\u7CFB\u7EDF\u8BCA\u65AD"), /* @__PURE__ */ React8.createElement(Button7, { key: "test", onClick: () => setTestOpen(true) }, "\u6D4B\u8BD5\u522E\u524A\u6E90"), /* @__PURE__ */ React8.createElement(Button7, { key: "reload", type: "text", onClick: load, loading }, "\u91CD\u65B0\u8BFB\u53D6"), /* @__PURE__ */ React8.createElement(Button7, { key: "save", type: "primary", onClick: () => form.submit(), loading }, "\u4FDD\u5B58\u5168\u90E8\u8BBE\u7F6E")]
      }
    ), settings?.security?.using_default_session_secret ? /* @__PURE__ */ React8.createElement(Alert3, { type: "warning", showIcon: true, message: "\u5F53\u524D\u4ECD\u5728\u4F7F\u7528\u9ED8\u8BA4\u4F1A\u8BDD\u5BC6\u94A5", description: "\u751F\u4EA7\u90E8\u7F72\u8BF7\u8BBE\u7F6E APP_SESSION_SECRET \u6216 config.session_secret\u3002" }) : null, /* @__PURE__ */ React8.createElement(Form7, { form, layout: "vertical", onFinish: save, className: "wb-settings-form" }, /* @__PURE__ */ React8.createElement(Card4, { title: "JavBus \u4E0E\u7F13\u5B58", extra: /* @__PURE__ */ React8.createElement(Button7, { type: "text", onClick: saveJavbus }, "\u4EC5\u70ED\u66F4\u65B0 JavBus") }, /* @__PURE__ */ React8.createElement("div", { className: "wb-settings-grid" }, /* @__PURE__ */ React8.createElement(Form7.Item, { name: ["javbus", "base_url"], label: "JavBus \u5730\u5740" }, /* @__PURE__ */ React8.createElement(Input7, null)), /* @__PURE__ */ React8.createElement(Form7.Item, { name: ["javbus", "proxy"], label: "\u4EE3\u7406" }, /* @__PURE__ */ React8.createElement(Input7, { placeholder: "http://127.0.0.1:7890" })), /* @__PURE__ */ React8.createElement(Form7.Item, { name: ["javbus", "timeout_seconds"], label: "\u8BF7\u6C42\u8D85\u65F6" }, /* @__PURE__ */ React8.createElement(InputNumber5, { min: 1, max: 60, addonAfter: "\u79D2" })), /* @__PURE__ */ React8.createElement(Form7.Item, { name: ["javbus", "request_interval_seconds"], label: "\u8BF7\u6C42\u95F4\u9694" }, /* @__PURE__ */ React8.createElement(InputNumber5, { min: 0, max: 10, step: 0.1, addonAfter: "\u79D2" })), /* @__PURE__ */ React8.createElement(Form7.Item, { name: ["javbus", "cache_expire_seconds"], label: "\u7F13\u5B58\u6709\u6548\u671F" }, /* @__PURE__ */ React8.createElement(InputNumber5, { min: 0, max: 86400, addonAfter: "\u79D2" })), /* @__PURE__ */ React8.createElement(Form7.Item, { name: ["javbus", "cache_max_size"], label: "\u6700\u5927\u7F13\u5B58\u9879" }, /* @__PURE__ */ React8.createElement(InputNumber5, { min: 1, max: 1e5 })), /* @__PURE__ */ React8.createElement(Form7.Item, { name: ["javbus", "image_retry_attempts"], label: "\u56FE\u7247\u91CD\u8BD5\u6B21\u6570" }, /* @__PURE__ */ React8.createElement(InputNumber5, { min: 0, max: 10 })), /* @__PURE__ */ React8.createElement(Form7.Item, { name: ["javbus", "image_retry_backoff_seconds"], label: "\u56FE\u7247\u91CD\u8BD5\u9000\u907F" }, /* @__PURE__ */ React8.createElement(InputNumber5, { min: 0, max: 10, step: 0.05, addonAfter: "\u79D2" })))), /* @__PURE__ */ React8.createElement(Card4, { title: "\u4E0B\u8F7D\u4E0E\u7F51\u76D8\u670D\u52A1" }, /* @__PURE__ */ React8.createElement("div", { className: "wb-service-settings" }, /* @__PURE__ */ React8.createElement("section", null, /* @__PURE__ */ React8.createElement("div", { className: "wb-service-title" }, /* @__PURE__ */ React8.createElement("strong", null, "WebDAV"), /* @__PURE__ */ React8.createElement(StatusDot, { ready: settings?.webdav?.has_password }, "\u5BC6\u7801", settings?.webdav?.has_password ? "\u5DF2\u914D\u7F6E" : "\u672A\u914D\u7F6E")), /* @__PURE__ */ React8.createElement(Form7.Item, { name: ["webdav", "enabled"], label: "\u542F\u7528", valuePropName: "checked" }, /* @__PURE__ */ React8.createElement(Switch5, null)), /* @__PURE__ */ React8.createElement(Form7.Item, { name: ["webdav", "url"], label: "\u5730\u5740" }, /* @__PURE__ */ React8.createElement(Input7, null)), /* @__PURE__ */ React8.createElement(Form7.Item, { name: ["webdav", "username"], label: "\u7528\u6237\u540D" }, /* @__PURE__ */ React8.createElement(Input7, null)), /* @__PURE__ */ React8.createElement(Form7.Item, { name: ["webdav", "password"], label: "\u5BC6\u7801" }, /* @__PURE__ */ React8.createElement(Input7.Password, { placeholder: "\u7559\u7A7A\u4E0D\u4F1A\u8986\u76D6" })), /* @__PURE__ */ React8.createElement(Form7.Item, { name: ["webdav", "auto_connect"], label: "\u81EA\u52A8\u8FDE\u63A5", valuePropName: "checked" }, /* @__PURE__ */ React8.createElement(Switch5, null))), /* @__PURE__ */ React8.createElement("section", null, /* @__PURE__ */ React8.createElement("div", { className: "wb-service-title" }, /* @__PURE__ */ React8.createElement("strong", null, "Aria2"), /* @__PURE__ */ React8.createElement(StatusDot, { ready: settings?.aria2?.has_secret }, "Secret ", settings?.aria2?.has_secret ? "\u5DF2\u914D\u7F6E" : "\u672A\u914D\u7F6E")), /* @__PURE__ */ React8.createElement(Form7.Item, { name: ["aria2", "enabled"], label: "\u542F\u7528", valuePropName: "checked" }, /* @__PURE__ */ React8.createElement(Switch5, null)), /* @__PURE__ */ React8.createElement(Form7.Item, { name: ["aria2", "url"], label: "RPC \u5730\u5740" }, /* @__PURE__ */ React8.createElement(Input7, null)), /* @__PURE__ */ React8.createElement(Form7.Item, { name: ["aria2", "secret"], label: "RPC Secret" }, /* @__PURE__ */ React8.createElement(Input7.Password, { placeholder: "\u7559\u7A7A\u4E0D\u4F1A\u8986\u76D6" })), /* @__PURE__ */ React8.createElement(Form7.Item, { name: ["aria2", "auto_connect"], label: "\u81EA\u52A8\u8FDE\u63A5", valuePropName: "checked" }, /* @__PURE__ */ React8.createElement(Switch5, null))), /* @__PURE__ */ React8.createElement("section", null, /* @__PURE__ */ React8.createElement("div", { className: "wb-service-title" }, /* @__PURE__ */ React8.createElement("strong", null, "PikPak"), /* @__PURE__ */ React8.createElement(StatusDot, { ready: settings?.pikpak?.has_password }, "\u5BC6\u7801", settings?.pikpak?.has_password ? "\u5DF2\u914D\u7F6E" : "\u672A\u914D\u7F6E")), /* @__PURE__ */ React8.createElement(Form7.Item, { name: ["pikpak", "enabled"], label: "\u542F\u7528", valuePropName: "checked" }, /* @__PURE__ */ React8.createElement(Switch5, null)), /* @__PURE__ */ React8.createElement(Form7.Item, { name: ["pikpak", "username"], label: "\u7528\u6237\u540D" }, /* @__PURE__ */ React8.createElement(Input7, null)), /* @__PURE__ */ React8.createElement(Form7.Item, { name: ["pikpak", "password"], label: "\u5BC6\u7801" }, /* @__PURE__ */ React8.createElement(Input7.Password, { placeholder: "\u7559\u7A7A\u4E0D\u4F1A\u8986\u76D6" })), /* @__PURE__ */ React8.createElement(Form7.Item, { name: ["pikpak", "auto_login"], label: "\u81EA\u52A8\u767B\u5F55", valuePropName: "checked" }, /* @__PURE__ */ React8.createElement(Switch5, null))), /* @__PURE__ */ React8.createElement("section", null, /* @__PURE__ */ React8.createElement("div", { className: "wb-service-title" }, /* @__PURE__ */ React8.createElement("strong", null, "115 \u7F51\u76D8"), /* @__PURE__ */ React8.createElement(StatusDot, { ready: settings?.pan115?.has_cookie }, "Cookie ", settings?.pan115?.has_cookie ? "\u5DF2\u914D\u7F6E" : "\u672A\u914D\u7F6E")), /* @__PURE__ */ React8.createElement(Form7.Item, { name: ["pan115", "enabled"], label: "\u542F\u7528", valuePropName: "checked" }, /* @__PURE__ */ React8.createElement(Switch5, null)), /* @__PURE__ */ React8.createElement(Form7.Item, { name: ["pan115", "cookie"], label: "Cookie" }, /* @__PURE__ */ React8.createElement(Input7.Password, { placeholder: "\u7559\u7A7A\u4E0D\u4F1A\u8986\u76D6" })), /* @__PURE__ */ React8.createElement(Form7.Item, { name: ["pan115", "save_dir_id"], label: "\u4FDD\u5B58\u76EE\u5F55 ID" }, /* @__PURE__ */ React8.createElement(Input7, null)), /* @__PURE__ */ React8.createElement(Form7.Item, { name: ["pan115", "login_app"], label: "\u626B\u7801\u767B\u5F55\u5E94\u7528" }, /* @__PURE__ */ React8.createElement(Select5, { options: [{ label: "\u5FAE\u4FE1\u5C0F\u7A0B\u5E8F", value: "wechatmini" }, { label: "115 Android", value: "android" }, { label: "115 iOS", value: "ios" }, { label: "115 Web", value: "web" }] })), /* @__PURE__ */ React8.createElement(Form7.Item, { name: ["pan115", "batch_size"], label: "\u6279\u91CF\u5927\u5C0F" }, /* @__PURE__ */ React8.createElement(InputNumber5, { min: 1, max: 50 })), /* @__PURE__ */ React8.createElement(Form7.Item, { name: ["pan115", "batch_interval_seconds"], label: "\u6279\u6B21\u95F4\u9694" }, /* @__PURE__ */ React8.createElement(InputNumber5, { min: 0, max: 600, addonAfter: "\u79D2" })), /* @__PURE__ */ React8.createElement(Form7.Item, { name: ["pan115", "jitter_seconds"], label: "\u968F\u673A\u6296\u52A8" }, /* @__PURE__ */ React8.createElement(InputNumber5, { min: 0, max: 120, addonAfter: "\u79D2" }))))), /* @__PURE__ */ React8.createElement(Card4, { title: "\u78C1\u529B\u5065\u5EB7\u5EA6" }, /* @__PURE__ */ React8.createElement("div", { className: "wb-settings-grid" }, /* @__PURE__ */ React8.createElement(Form7.Item, { name: ["magnet_health", "enabled"], label: "\u542F\u7528\u5065\u5EB7\u5EA6\u7B5B\u9009", valuePropName: "checked" }, /* @__PURE__ */ React8.createElement(Switch5, null)), /* @__PURE__ */ React8.createElement(Form7.Item, { name: ["magnet_health", "probe_with_aria2"], label: "\u7528 Aria2 \u63A2\u6D4B", valuePropName: "checked" }, /* @__PURE__ */ React8.createElement(Switch5, null)), /* @__PURE__ */ React8.createElement(Form7.Item, { name: ["magnet_health", "min_seeders"], label: "\u6700\u5C11\u505A\u79CD" }, /* @__PURE__ */ React8.createElement(InputNumber5, { min: 0 })), /* @__PURE__ */ React8.createElement(Form7.Item, { name: ["magnet_health", "min_peers"], label: "\u6700\u5C11\u8FDE\u63A5" }, /* @__PURE__ */ React8.createElement(InputNumber5, { min: 0 })), /* @__PURE__ */ React8.createElement(Form7.Item, { name: ["magnet_health", "min_availability"], label: "\u6700\u4F4E\u53EF\u7528\u5EA6" }, /* @__PURE__ */ React8.createElement(InputNumber5, { min: 0, step: 0.1 })), /* @__PURE__ */ React8.createElement(Form7.Item, { name: ["magnet_health", "min_score"], label: "\u6700\u4F4E\u5065\u5EB7\u5206" }, /* @__PURE__ */ React8.createElement(InputNumber5, { min: 0, step: 0.1 })), /* @__PURE__ */ React8.createElement(Form7.Item, { name: ["magnet_health", "probe_timeout_seconds"], label: "\u63A2\u6D4B\u8D85\u65F6" }, /* @__PURE__ */ React8.createElement(InputNumber5, { min: 1, max: 120, addonAfter: "\u79D2" })), /* @__PURE__ */ React8.createElement(Form7.Item, { name: ["magnet_health", "allow_unknown"], label: "\u5141\u8BB8\u672A\u77E5\u5065\u5EB7\u5EA6", valuePropName: "checked" }, /* @__PURE__ */ React8.createElement(Switch5, null)))), /* @__PURE__ */ React8.createElement(Card4, { title: "\u5143\u6570\u636E\u522E\u524A\u6E90" }, /* @__PURE__ */ React8.createElement(Form7.Item, { name: ["scrapers", "priority"], label: "\u522E\u524A\u4F18\u5148\u7EA7" }, /* @__PURE__ */ React8.createElement(Select5, { mode: "multiple", options: Object.entries(PROVIDER_LABELS).map(([value, label]) => ({ value, label })) })), /* @__PURE__ */ React8.createElement(Collapse, { items: providerItems }))), /* @__PURE__ */ React8.createElement(Drawer4, { title: "\u7CFB\u7EDF\u8BCA\u65AD", open: diagnosticsOpen, onClose: () => setDiagnosticsOpen(false), width: 720 }, diagnostics ? /* @__PURE__ */ React8.createElement(Descriptions2, { bordered: true, column: 1, items: [
      { key: "version", label: "\u7248\u672C", children: diagnostics.version?.version },
      { key: "build", label: "\u6784\u5EFA\u65E5\u671F", children: diagnostics.version?.build_date },
      { key: "python", label: "Python", children: diagnostics.python_version },
      { key: "platform", label: "\u5E73\u53F0", children: diagnostics.platform },
      { key: "host", label: "\u4E3B\u673A", children: diagnostics.hostname },
      { key: "javbus", label: "JavBus", children: diagnostics.javbus_base_url },
      { key: "cache", label: "\u7F13\u5B58\u9879", children: diagnostics.cache_size },
      { key: "history", label: "\u4E0B\u8F7D\u8BB0\u5F55", children: diagnostics.downloaded_movies_count }
    ] }) : null), /* @__PURE__ */ React8.createElement(Modal5, { title: "\u6D4B\u8BD5\u5143\u6570\u636E\u522E\u524A\u6E90", open: testOpen, onCancel: () => setTestOpen(false), footer: null, width: 900 }, /* @__PURE__ */ React8.createElement(Form7, { form: testForm, layout: "vertical", onFinish: testScrapers, initialValues: { providers: settings?.scrapers?.priority || [], concurrent: 3 } }, /* @__PURE__ */ React8.createElement(Form7.Item, { name: "providers", label: "\u6D4B\u8BD5\u6765\u6E90", rules: [{ required: true }] }, /* @__PURE__ */ React8.createElement(Select5, { mode: "multiple", options: Object.entries(PROVIDER_LABELS).map(([value, label]) => ({ value, label })) })), /* @__PURE__ */ React8.createElement(Form7.Item, { name: "movie_ids", label: "\u6D4B\u8BD5\u756A\u53F7\u6620\u5C04\uFF08JSON\uFF0C\u53EF\u7559\u7A7A\uFF09" }, /* @__PURE__ */ React8.createElement(Input7.TextArea, { rows: 3, placeholder: '{"javbus":"ABP-123","dmm":"abp00123"}' })), /* @__PURE__ */ React8.createElement(Form7.Item, { name: "concurrent", label: "\u5E76\u53D1\u6570" }, /* @__PURE__ */ React8.createElement(InputNumber5, { min: 1, max: 10 })), /* @__PURE__ */ React8.createElement(Button7, { type: "primary", htmlType: "submit", loading }, "\u5F00\u59CB\u6D4B\u8BD5")), scraperResults.length ? /* @__PURE__ */ React8.createElement(React8.Fragment, null, /* @__PURE__ */ React8.createElement(Table7, { rowKey: (record, index) => record.provider || index, pagination: false, dataSource: scraperResults, columns: [{ title: "\u6765\u6E90", dataIndex: "provider" }, { title: "\u72B6\u6001", render: (_, record) => record.success ? /* @__PURE__ */ React8.createElement(Tag8, { color: "green" }, "\u6210\u529F") : /* @__PURE__ */ React8.createElement(Tag8, { color: "red" }, "\u5931\u8D25") }, { title: "\u8017\u65F6", dataIndex: "elapsed_ms", render: (value) => value ? `${value} ms` : "\u2014" }, { title: "\u8BF4\u660E", dataIndex: "message", ellipsis: true }] }), /* @__PURE__ */ React8.createElement(Button7, { className: "wb-submit", onClick: applyScraperResults }, "\u5E94\u7528\u6D4B\u8BD5\u7ED3\u679C")) : null));
  }

  // frontend/src/workbench/WorkbenchApp.jsx
  var React9 = window.React;
  var { ConfigProvider, Button: Button8, Drawer: Drawer5, Typography: Typography9 } = window.antd;
  var { Text: Text9 } = Typography9;
  var icons7 = window.icons || {};
  var NAV = [
    ["discover", "\u53D1\u73B0", icons7.SearchOutlined],
    ["organize", "\u6574\u7406", icons7.FileSearchOutlined],
    ["library", "\u5F71\u89C6\u5E93", icons7.VideoCameraOutlined || icons7.DatabaseOutlined],
    ["automation", "\u81EA\u52A8\u5316", icons7.ThunderboltOutlined],
    ["cloud", "\u4E91\u7AEF", icons7.CloudOutlined],
    ["downloads", "\u4E0B\u8F7D", icons7.DownloadOutlined],
    ["settings", "\u8BBE\u7F6E", icons7.SettingOutlined]
  ];
  var PAGE_TITLES = {
    discover: "\u53D1\u73B0\u5F71\u7247",
    organize: "\u6574\u7406\u5A92\u4F53",
    library: "\u5F71\u89C6\u5E93",
    automation: "\u81EA\u52A8\u5316",
    cloud: "\u4E91\u7AEF\u6587\u4EF6",
    downloads: "\u4E0B\u8F7D\u961F\u5217",
    settings: "\u7CFB\u7EDF\u8BBE\u7F6E"
  };
  var THEME = {
    token: {
      colorPrimary: "#2563eb",
      colorInfo: "#2563eb",
      colorSuccess: "#16a34a",
      colorWarning: "#d97706",
      colorError: "#dc2626",
      colorText: "#1f2937",
      colorTextSecondary: "#667085",
      colorBgLayout: "#f3f6fa",
      colorBgContainer: "#ffffff",
      colorBorder: "#d0d5dd",
      borderRadius: 8,
      controlHeight: 40,
      fontFamily: '"Noto Sans SC", "Microsoft YaHei", system-ui, sans-serif'
    }
  };
  function Glyph({ icon: Icon }) {
    return Icon ? /* @__PURE__ */ React9.createElement(Icon, null) : null;
  }
  function WorkbenchApp() {
    const [page, setPage] = React9.useState("discover");
    const [mobileMenu, setMobileMenu] = React9.useState(false);
    const [clientConfig, setClientConfig] = React9.useState({});
    const [connections, setConnections] = React9.useState({});
    const [version, setVersion] = React9.useState(window.versionInfo || {});
    const refreshRuntime = React9.useCallback(async () => {
      const [configResult, statusResult, infoResult] = await Promise.allSettled([
        api("/api/client-config"),
        api("/api/webdav/status"),
        api("/api/system/info")
      ]);
      if (configResult.status === "fulfilled") setClientConfig(configResult.value);
      if (statusResult.status === "fulfilled") setConnections(statusResult.value);
      if (infoResult.status === "fulfilled") setVersion(infoResult.value.version || {});
    }, []);
    React9.useEffect(() => {
      void refreshRuntime();
    }, [refreshRuntime]);
    const shared = { clientConfig, connections, refreshRuntime, navigate: setPage };
    const pages = {
      discover: /* @__PURE__ */ React9.createElement(DiscoverPage, { ...shared }),
      organize: /* @__PURE__ */ React9.createElement(OrganizePage, { ...shared }),
      library: /* @__PURE__ */ React9.createElement(LibraryPage, { ...shared }),
      automation: /* @__PURE__ */ React9.createElement(AutomationPage, { ...shared }),
      cloud: /* @__PURE__ */ React9.createElement(CloudPage, { ...shared }),
      downloads: /* @__PURE__ */ React9.createElement(DownloadsPage, { ...shared }),
      settings: /* @__PURE__ */ React9.createElement(SettingsPage, { ...shared })
    };
    const title = PAGE_TITLES[page];
    const navigation = /* @__PURE__ */ React9.createElement("nav", { className: "wb-nav", "aria-label": "\u4EA7\u54C1\u529F\u80FD" }, NAV.map(([key, label, icon]) => /* @__PURE__ */ React9.createElement(
      "button",
      {
        type: "button",
        key,
        className: page === key ? "is-active" : "",
        onClick: () => {
          setPage(key);
          setMobileMenu(false);
        }
      },
      /* @__PURE__ */ React9.createElement(Glyph, { icon }),
      /* @__PURE__ */ React9.createElement("span", null, label)
    )));
    return /* @__PURE__ */ React9.createElement(ConfigProvider, { theme: THEME }, /* @__PURE__ */ React9.createElement("div", { className: "wb-app" }, /* @__PURE__ */ React9.createElement("aside", { className: "wb-sidebar" }, /* @__PURE__ */ React9.createElement("button", { type: "button", className: "wb-wordmark", onClick: () => setPage("discover") }, /* @__PURE__ */ React9.createElement("b", null, "Jav"), "Jaeger"), navigation, /* @__PURE__ */ React9.createElement("footer", null, /* @__PURE__ */ React9.createElement(StatusDot, { ready: true }, "\u670D\u52A1\u8FD0\u884C\u4E2D"), /* @__PURE__ */ React9.createElement(Text9, null, version.version || "v1.0.0"))), /* @__PURE__ */ React9.createElement("section", { className: "wb-shell" }, /* @__PURE__ */ React9.createElement("header", { className: "wb-mobile-header" }, /* @__PURE__ */ React9.createElement(Button8, { className: "wb-mobile-menu", type: "text", icon: /* @__PURE__ */ React9.createElement(Glyph, { icon: icons7.MenuOutlined }), onClick: () => setMobileMenu(true) }), /* @__PURE__ */ React9.createElement("strong", null, title)), /* @__PURE__ */ React9.createElement("main", { className: "wb-main" }, pages[page])), /* @__PURE__ */ React9.createElement("div", { className: "wb-bottom-nav" }, navigation), /* @__PURE__ */ React9.createElement(Drawer5, { title: "JavJaeger", placement: "left", open: mobileMenu, onClose: () => setMobileMenu(false), width: 280 }, navigation)));
  }

  // frontend/src/App.jsx
  var React10 = window.React;
  function App() {
    return /* @__PURE__ */ React10.createElement(WorkbenchApp, null);
  }

  // frontend/src/main.jsx
  var React11 = window.React;
  var ReactDOM = window.ReactDOM;
  var root = ReactDOM.createRoot(document.getElementById("root"));
  root.render(/* @__PURE__ */ React11.createElement(App, null));
})();
