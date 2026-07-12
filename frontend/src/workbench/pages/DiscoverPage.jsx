import { api, formatBytes, movieList } from "../api.js";
import { EmptyBlock, PageIntro, StageRail, StatusDot } from "../ui.jsx";
import { buildHistoryRedispatchPayload } from "../../utils/historyRedispatch.mjs";
import { waitForJob } from "../../utils/jobPolling.mjs";

const React = window.React;
const {
  Alert, Button, Checkbox, Descriptions, Drawer, Form, Input, List, Modal,
  Popconfirm, Progress, Segmented, Select, Space, Spin, Switch, Table, Tabs,
  Tag, Typography, message,
} = window.antd;
const { Text, Title } = Typography;
const icons = window.icons || {};

const SOURCE_LABELS = { javbus: "JavBus", cilisousuo: "Cilisiusou", yhg007: "YHG007" };
const TARGET_LABELS = { pikpak: "PikPak", "115": "115", aria2: "Aria2" };

function posterUrl(movie) {
  const raw = movie.img || movie.cover_url || movie.poster_url || "";
  return /^https?:/i.test(raw) ? `/api/image-proxy?url=${encodeURIComponent(raw)}` : raw;
}

function names(values) {
  return (values || []).map(item => item?.name || item).filter(Boolean);
}

export default function DiscoverPage({ clientConfig, connections, refreshRuntime, navigate }) {
  const [query, setQuery] = React.useState("");
  const [movies, setMovies] = React.useState([]);
  const [magnets, setMagnets] = React.useState({});
  const [downloaded, setDownloaded] = React.useState(new Set());
  const [selectedMovieKeys, setSelectedMovieKeys] = React.useState([]);
  const [selectedMagnetLink, setSelectedMagnetLink] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const [filterOpen, setFilterOpen] = React.useState(false);
  const [recognizeOpen, setRecognizeOpen] = React.useState(false);
  const [batchOpen, setBatchOpen] = React.useState(false);
  const [batchProgress, setBatchProgress] = React.useState(null);
  const [accountOpen, setAccountOpen] = React.useState(false);
  const [dispatchMovie, setDispatchMovie] = React.useState(null);
  const [dispatchProgress, setDispatchProgress] = React.useState(null);
  const [pan115DispatchMode, setPan115DispatchMode] = React.useState("background");
  const [historyOpen, setHistoryOpen] = React.useState(false);
  const [history, setHistory] = React.useState([]);
  const [detailsMovie, setDetailsMovie] = React.useState(null);
  const [actor, setActor] = React.useState(null);
  const [pikpakLoggedIn, setPikpakLoggedIn] = React.useState(false);
  const [pan115Status, setPan115Status] = React.useState({});
  const [qrSession, setQrSession] = React.useState(null);
  const [target, setTarget] = React.useState(() => window.localStorage.getItem("wb-download-target") || "pikpak");
  const [source, setSource] = React.useState("javbus");
  const [exclude4k, setExclude4k] = React.useState(false);
  const [subtitle, setSubtitle] = React.useState("");
  const [filterForm] = Form.useForm();
  const [recognizeForm] = Form.useForm();
  const [batchForm] = Form.useForm();
  const [pikpakForm] = Form.useForm();
  const [cookieForm] = Form.useForm();

  const refresh115 = React.useCallback(async () => {
    try { setPan115Status(await api("/api/115/status")); } catch { setPan115Status({ connected: false }); }
  }, []);

  React.useEffect(() => { void refresh115(); }, [refresh115]);
  React.useEffect(() => {
    if (!qrSession?.session_id || ["allowed", "expired", "canceled"].includes(qrSession.state)) return undefined;
    const timer = window.setInterval(async () => {
      try {
        const status = await api(`/api/115/qrcode/${encodeURIComponent(qrSession.session_id)}/status`);
        setQrSession(current => ({ ...current, ...status }));
        if (status.configured && status.state === "allowed") {
          message.success("115 扫码登录成功");
          await refresh115();
          await refreshRuntime();
        }
      } catch (error) { setQrSession(current => ({ ...current, state: "expired", message: error.message })); }
    }, 2000);
    return () => window.clearInterval(timer);
  }, [qrSession?.session_id, qrSession?.state, refresh115, refreshRuntime]);

  const targetReady = target === "aria2"
    ? !!connections.aria2_connected
    : target === "115"
      ? !!(pan115Status.connected || clientConfig.pan115?.configured)
      : !!(pikpakLoggedIn || clientConfig.pikpak?.configured);

  const loadMagnets = React.useCallback(async items => {
    const entries = await Promise.all(items.slice(0, 40).map(async original => {
      try {
        let movie = original;
        if (source === "javbus" && (!movie.gid || movie.uc === undefined)) movie = await api(`/api/movies/${encodeURIComponent(movie.id)}`);
        const params = new URLSearchParams({ source, sortBy: "size", sortOrder: "desc" });
        if (exclude4k) params.set("exclude4k", "true");
        if (subtitle) params.set("hasSubtitle", subtitle);
        if (source === "javbus") {
          if (movie.gid) params.set("gid", movie.gid);
          if (movie.uc !== undefined) params.set("uc", movie.uc);
        }
        const result = await api(`/api/magnets/${encodeURIComponent(movie.id)}?${params}`);
        return [movie.id, Array.isArray(result) ? result : []];
      } catch { return [original.id, []]; }
    }));
    setMagnets(Object.fromEntries(entries));
  }, [exclude4k, source, subtitle]);

  const showResults = React.useCallback(async payload => {
    const next = movieList(payload).filter(movie => movie?.id);
    setMovies(next);
    setSelectedMovieKeys([]);
    setMagnets({});
    const status = await api("/api/downloaded-movies").catch(() => ({ downloaded_movies: [] }));
    setDownloaded(new Set(status.downloaded_movies || []));
    await loadMagnets(next);
  }, [loadMagnets]);

  const search = async () => {
    const value = query.trim();
    if (!value) return message.warning("请输入番号、演员或系列");
    setLoading(true);
    try {
      if (/[,\n\s]/.test(value)) {
        const result = await api("/api/movies/download-by-codes", { method: "POST", body: JSON.stringify({ movie_codes: value, auto_download: false, magnet_source: source, has_subtitle_filter: subtitle || null, exclude_4k: exclude4k }) });
        await showResults({ movies: result.found_movies || [] });
      } else if (/^[a-z0-9]+-?\d+$/i.test(value)) {
        const result = await api(`/api/movies/${encodeURIComponent(value)}`);
        await showResults({ movies: result.movies || [result] });
      } else await showResults(await api(`/api/movies/search?keyword=${encodeURIComponent(value)}`));
    } catch (error) { message.error(error.message); }
    finally { setLoading(false); }
  };

  const recognize = async values => {
    setLoading(true);
    try {
      const result = await api("/api/movies/recognize", { method: "POST", body: JSON.stringify({ html_content: values.html, auto_download: false, magnet_source: source, has_subtitle_filter: subtitle || null, exclude_4k: exclude4k }) });
      await showResults({ movies: result.movies || result.found_movies || [] });
      setRecognizeOpen(false);
      recognizeForm.resetFields();
    } catch (error) { message.error(error.message); }
    finally { setLoading(false); }
  };

  const showBatchResults = async results => {
    const nextMovies = results.filter(item => item.success).map(item => ({ id: item.movie_id, title: item.title, date: item.date }));
    setMovies(nextMovies); setSelectedMovieKeys([]);
    setMagnets(Object.fromEntries(results.map(item => [item.movie_id, item.best_magnet ? [item.best_magnet] : []])));
    const status = await api("/api/downloaded-movies").catch(() => ({ downloaded_movies: [] }));
    setDownloaded(new Set(status.downloaded_movies || [])); setBatchOpen(false);
  };

  const batchLookup = async values => {
    const movie_ids = values.codes.split(/[\s,]+/).map(value => value.trim()).filter(Boolean);
    if (!movie_ids.length) return message.warning("请输入至少一个番号");
    const payload = { movie_ids, magnet_source: source, has_subtitle_filter: subtitle || null, exclude_4k: exclude4k };
    setLoading(true); setBatchProgress({ completed: 0, total: movie_ids.length });
    try {
      if (values.mode === "standard") {
        const result = await api("/api/movies/batch", { method: "POST", body: JSON.stringify(payload) });
        await showBatchResults(result.results || []);
      } else {
        const response = await fetch("/api/movies/batch-stream", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
        if (!response.ok || !response.body) throw new Error(`批量流请求失败 (${response.status})`);
        const reader = response.body.getReader(); const decoder = new TextDecoder(); let buffer = ""; const results = [];
        for (;;) {
          const { value, done } = await reader.read(); if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const events = buffer.split("\n\n"); buffer = events.pop() || "";
          for (const event of events) {
            const line = event.split("\n").find(item => item.startsWith("data: ")); if (!line) continue;
            const item = JSON.parse(line.slice(6));
            if (item.type === "progress") { results.push(item); setBatchProgress({ completed: results.length, total: movie_ids.length, current: item.movie_id }); }
          }
        }
        await showBatchResults(results);
      }
    } catch (error) { message.error(error.message); }
    finally { setLoading(false); setBatchProgress(null); }
  };

  const loadAllMovies = async () => {
    setLoading(true);
    try { await showResults(await api("/api/movies/all")); }
    catch (error) { message.error(error.message); }
    finally { setLoading(false); }
  };

  const browse = async values => {
    setFilterOpen(false);
    setLoading(true);
    try {
      const params = new URLSearchParams({ magnet: "exist", type: values.type || "normal" });
      if (values.filterType && values.filterValue) { params.set("filterType", values.filterType); params.set("filterValue", values.filterValue); }
      if (values.hasSubtitle) params.set("hasSubtitle", values.hasSubtitle);
      if (values.excludeVr) params.set("excludeVr", "true");
      await showResults(await api(`/api/movies?${params}`));
    } catch (error) { message.error(error.message); }
    finally { setLoading(false); }
  };

  const changeTarget = value => { setTarget(value); window.localStorage.setItem("wb-download-target", value); };

  const dispatchEntries = async entries => {
    if (!entries.length) return message.warning("请选择可用资源");
    if (!targetReady) return message.warning(`${TARGET_LABELS[target]} 尚未就绪`);
    setLoading(true);
    setDispatchProgress(target === "115" ? 0 : null);
    try {
      const payload = { magnet_links: entries.map(item => item.link), movie_ids: entries.map(item => item.movie_id), magnet_sources: entries.map(item => item.source || source) };
      let result;
      if (target === "115" && pan115DispatchMode === "background") {
        const job = await api("/api/115/download-jobs", { method: "POST", body: JSON.stringify(payload) });
        result = await waitForJob(api, `/api/115/download-jobs/${encodeURIComponent(job.job_id)}`, update => setDispatchProgress(update.total_count ? Math.round((update.completed_count || 0) / update.total_count * 100) : 0), 800);
      } else {
        const endpoint = target === "aria2" ? "/api/aria2/download-magnets" : target === "115" ? "/api/115/download" : "/api/pikpak/download";
        result = await api(endpoint, { method: "POST", body: JSON.stringify(payload) });
      }
      message.success(result.message || `已发送 ${entries.length} 项到 ${TARGET_LABELS[target]}`);
      setDispatchMovie(null);
      setSelectedMovieKeys([]);
      await api("/api/downloaded-movies").then(value => setDownloaded(new Set(value.downloaded_movies || []))).catch(() => {});
    } catch (error) { message.error(error.message); }
    finally { setLoading(false); setDispatchProgress(null); }
  };

  const dispatchSelectedMovies = () => dispatchEntries(selectedMovieKeys.map(movieId => ({ movie_id: movieId, link: magnets[movieId]?.[0]?.link, source: magnets[movieId]?.[0]?.source || source })).filter(item => item.link));
  const openDispatch = movie => { setDispatchMovie(movie); setSelectedMagnetLink(magnets[movie.id]?.[0]?.link || ""); };

  const openHistory = async () => {
    setHistoryOpen(true);
    try { setHistory(await api("/api/history")); } catch (error) { message.error(error.message); }
  };
  const checkHistory = async () => {
    try {
      const result = await api("/api/history/check-local-library", { method: "POST" });
      setHistory(result.records || result.history || (Array.isArray(result) ? result : history));
      message.success(result.message || "历史记录已与本地影视库核对");
    } catch (error) { message.error(error.message); }
  };
  const clearHistory = async () => {
    try { await api("/api/history", { method: "DELETE" }); setHistory([]); message.success("下载历史已清空"); }
    catch (error) { message.error(error.message); }
  };
  const redispatchHistory = records => {
    const entries = buildHistoryRedispatchPayload(records, source).map(item => ({ movie_id: item.movie_id, link: item.link, source: item.source }));
    return dispatchEntries(entries);
  };

  const loginPikpak = async values => {
    try {
      const result = await api("/api/pikpak/login", { method: "POST", body: JSON.stringify(values) });
      if (!result.success) throw new Error(result.message || "PikPak 登录失败");
      setPikpakLoggedIn(true); pikpakForm.setFieldValue("password", ""); message.success("PikPak 登录成功");
    } catch (error) { message.error(error.message); }
  };
  const loginConfiguredPikpak = async () => {
    try {
      const result = await api("/api/pikpak/login-config", { method: "POST" });
      if (!result.success) throw new Error(result.message || "PikPak 登录失败");
      setPikpakLoggedIn(true); message.success("PikPak 服务端账号可用");
    } catch (error) { message.error(error.message); }
  };
  const startQrLogin = async () => {
    try { setQrSession(await api("/api/115/qrcode/start", { method: "POST", body: JSON.stringify({ app: clientConfig.pan115?.login_app || "wechatmini" }) })); }
    catch (error) { message.error(error.message); }
  };
  const saveCookie = async values => {
    try {
      await api("/api/115/cookie", { method: "POST", body: JSON.stringify({ cookie: values.cookie, enabled: true }) });
      cookieForm.resetFields(); await refresh115(); await refreshRuntime(); message.success("115 Cookie 已验证并保存");
    } catch (error) { message.error(error.message); }
  };
  const openActor = async star => {
    if (!star?.id) return;
    try { setActor(await api(`/api/stars/${encodeURIComponent(star.id)}`)); } catch (error) { message.error(error.message); }
  };

  const openMovieDetails = async movie => {
    try {
      const [detail, status] = await Promise.all([api(`/api/movies/${encodeURIComponent(movie.id)}`), api(`/api/downloaded-movies/${encodeURIComponent(movie.id)}`)]);
      setDetailsMovie({ ...movie, ...detail, download_status: status });
    } catch (error) { message.error(error.message); }
  };

  const activeMovieMagnets = dispatchMovie ? magnets[dispatchMovie.id] || [] : [];
  const stage = movies.length ? (Object.values(magnets).some(list => list.length) ? 3 : 2) : 1;

  return (
    <div className="wb-page wb-discover">
      <PageIntro title="发现影片" description="搜索、识别、选择具体资源，并批量派发到下载目标。" actions={[
        <Button key="accounts" type="text" onClick={() => setAccountOpen(true)}>账户与连接</Button>,
        <Button key="all" type="text" onClick={loadAllMovies}>全部影片</Button>,
        <Button key="batch" type="text" onClick={() => setBatchOpen(true)}>批量工具</Button>,
        <Button key="recognize" type="text" onClick={() => setRecognizeOpen(true)}>识别网页</Button>,
        <Button key="history" type="text" icon={icons.HistoryOutlined ? <icons.HistoryOutlined /> : null} onClick={openHistory}>历史</Button>,
        <Button key="filter" type="text" icon={icons.FilterOutlined ? <icons.FilterOutlined /> : null} onClick={() => setFilterOpen(true)}>筛选与来源</Button>,
      ]} />

      <section className="wb-search-band"><Input value={query} onChange={event => setQuery(event.target.value)} onPressEnter={search} prefix={icons.SearchOutlined ? <icons.SearchOutlined /> : null} placeholder="输入番号、演员或系列；多个番号用空格分隔" allowClear /><Button type="primary" loading={loading} onClick={search}>搜索</Button></section>
      <StageRail active={stage} />

      <div className="wb-discovery-toolbar">
        <Space wrap><Text strong>{movies.length ? `找到 ${movies.length} 部影片` : "等待搜索"}</Text><Tag>{SOURCE_LABELS[source] || source}</Tag>{selectedMovieKeys.length ? <Button type="primary" onClick={dispatchSelectedMovies}>发送所选 {selectedMovieKeys.length} 部</Button> : null}</Space>
        <Space><StatusDot ready={targetReady}>{TARGET_LABELS[target]} {targetReady ? "已就绪" : "未连接"}</StatusDot><Segmented value={target} onChange={changeTarget} options={[{ label: "PikPak", value: "pikpak" }, { label: "115", value: "115" }, { label: "Aria2", value: "aria2" }]} /></Space>
      </div>

      {loading && !movies.length ? <div className="wb-loading"><Spin size="large" /></div> : movies.length ? <List className="wb-movie-list" dataSource={movies} renderItem={movie => {
        const best = magnets[movie.id]?.[0];
        const stars = movie.stars || [];
        const genres = names(movie.genres);
        return <List.Item className="wb-movie-row wb-movie-selectable">
          <Checkbox checked={selectedMovieKeys.includes(movie.id)} disabled={!best} onChange={event => setSelectedMovieKeys(keys => event.target.checked ? [...keys, movie.id] : keys.filter(key => key !== movie.id))} aria-label={`选择 ${movie.id}`} />
          <button type="button" className="wb-poster" onClick={() => openMovieDetails(movie)}>{posterUrl(movie) ? <img src={posterUrl(movie)} alt={`${movie.id} 海报`} loading="lazy" /> : <span>{movie.id}</span>}</button>
          <div className="wb-movie-copy">
            <Space wrap size={6}><Title level={4}>{movie.id}</Title>{downloaded.has(movie.id) ? <Tag color="blue">已派发</Tag> : null}{movie.date ? <Text type="secondary">{movie.date}</Text> : null}</Space>
            <button type="button" className="wb-text-button" onClick={() => openMovieDetails(movie)}>{movie.title || movie.full_title || "未命名影片"}</button>
            {stars.length ? <Space wrap size={4}>{stars.map(star => typeof star === "object" && star.id ? <Button key={star.id} type="link" size="small" onClick={() => openActor(star)}>{star.name}</Button> : <Tag key={star?.name || star}>{star?.name || star}</Tag>)}</Space> : null}
            {genres.length ? <div className="wb-tags">{genres.slice(0, 5).map(name => <Tag key={name}>{name}</Tag>)}</div> : null}
            <div className="wb-best-resource">{magnets[movie.id] ? best ? <><b>{best.title || "最佳资源"}</b><span>{best.source || source}</span><span>{best.size || formatBytes(best.size_bytes)}</span>{best.hasSubtitle ? <Tag color="green">中字</Tag> : null}</> : <Text type="danger">暂无可用资源</Text> : <><Spin size="small" /><Text type="secondary">正在匹配资源</Text></>}</div>
          </div>
          <Button className="wb-row-action" disabled={!best} onClick={() => openDispatch(movie)}>选择资源</Button>
        </List.Item>;
      }} /> : <EmptyBlock title="从一次搜索开始" description="结果会按影片展示，并加载当前来源的全部可用磁力。" />}

      <Drawer title="筛选与资源来源" open={filterOpen} onClose={() => setFilterOpen(false)} width={400}><Form form={filterForm} layout="vertical" onFinish={browse} initialValues={{ type: "normal", excludeVr: false }}>
        <Form.Item label="筛选维度" name="filterType"><Select allowClear options={[{ label: "演员", value: "star" }, { label: "类别", value: "genre" }, { label: "导演", value: "director" }, { label: "制作商", value: "studio" }, { label: "发行商", value: "publisher" }, { label: "系列", value: "series" }]} /></Form.Item>
        <Form.Item label="代码或名称" name="filterValue"><Input allowClear /></Form.Item><Form.Item label="影片类型" name="type"><Segmented block options={[{ label: "有码", value: "normal" }, { label: "无码", value: "uncensored" }]} /></Form.Item><Form.Item label="字幕" name="hasSubtitle"><Select allowClear options={[{ label: "有字幕", value: "true" }, { label: "无字幕", value: "false" }]} /></Form.Item><Form.Item label="排除 VR" name="excludeVr" valuePropName="checked"><Switch /></Form.Item><Button type="primary" htmlType="submit" block>获取片单</Button>
      </Form><div className="wb-drawer-section"><Text strong>磁力来源</Text><Segmented block value={source} onChange={setSource} options={[{ label: "JavBus", value: "javbus" }, { label: "Cilisiusou", value: "cilisousuo" }, { label: "YHG007", value: "yhg007" }]} /><Space><Switch checked={exclude4k} onChange={setExclude4k} /><Text>排除 4K</Text></Space><Select value={subtitle} onChange={setSubtitle} options={[{ label: "字幕不限", value: "" }, { label: "只看字幕", value: "true" }, { label: "排除字幕", value: "false" }]} /></div></Drawer>

      <Drawer title={dispatchMovie ? `选择 ${dispatchMovie.id} 的资源` : "选择资源"} open={!!dispatchMovie} onClose={() => setDispatchMovie(null)} width={620}>
        {dispatchMovie ? <><Segmented block value={target} onChange={changeTarget} options={Object.entries(TARGET_LABELS).map(([value, label]) => ({ value, label }))} />{target === "115" ? <div className="wb-drawer-section"><Text strong>115 派发方式</Text><Segmented block value={pan115DispatchMode} onChange={setPan115DispatchMode} options={[{ label: "后台批量", value: "background" }, { label: "同步等待", value: "sync" }]} /></div> : null}<Table className="wb-resource-table" size="small" rowKey="link" pagination={false} dataSource={activeMovieMagnets} rowSelection={{ type: "radio", selectedRowKeys: selectedMagnetLink ? [selectedMagnetLink] : [], onChange: keys => setSelectedMagnetLink(keys[0] || "") }} columns={[{ title: "资源", dataIndex: "title", ellipsis: true }, { title: "来源", dataIndex: "source", width: 100 }, { title: "大小", dataIndex: "size", width: 90 }, { title: "字幕", dataIndex: "hasSubtitle", width: 70, render: value => value ? "有" : "—" }]} />{dispatchProgress !== null ? <Progress percent={dispatchProgress} /> : null}<Button className="wb-confirm" type="primary" block disabled={!targetReady || !selectedMagnetLink} loading={loading} onClick={() => dispatchEntries([{ movie_id: dispatchMovie.id, link: selectedMagnetLink, source: activeMovieMagnets.find(item => item.link === selectedMagnetLink)?.source || source }])}>确认发送到 {TARGET_LABELS[target]}</Button>{!targetReady ? <Button block onClick={() => target === "aria2" ? navigate("downloads") : setAccountOpen(true)}>连接 {TARGET_LABELS[target]}</Button> : null}</> : null}
      </Drawer>

      <Drawer title="下载历史" open={historyOpen} onClose={() => setHistoryOpen(false)} width={900} extra={<Space><Button onClick={checkHistory}>核对影视库</Button><Popconfirm title="确定清空全部下载历史？" onConfirm={clearHistory}><Button type="text" danger>清空</Button></Popconfirm></Space>}><Table rowKey="movie_id" dataSource={history} scroll={{ x: 760 }} columns={[{ title: "番号", dataIndex: "movie_id" }, { title: "标题", dataIndex: "title", ellipsis: true }, { title: "时间", dataIndex: "download_time" }, { title: "状态", render: (_, record) => record.in_local_library ? <Tag color="green">已入库</Tag> : record.needs_reselect ? <Tag color="orange">需要重选</Tag> : <Tag>已派发</Tag> }, { title: "操作", render: (_, record) => record.needs_reselect ? <Button className="wb-row-action" onClick={() => redispatchHistory([record])}>重新派发</Button> : null }]} /></Drawer>

      <Modal title="识别网页中的番号" open={recognizeOpen} onCancel={() => setRecognizeOpen(false)} footer={null}><Form form={recognizeForm} layout="vertical" onFinish={recognize}><Form.Item name="html" label="网页 HTML" rules={[{ required: true }]}><Input.TextArea rows={12} placeholder="粘贴包含番号的网页源码" /></Form.Item><Button type="primary" block htmlType="submit" loading={loading}>识别并加载影片</Button></Form></Modal>
      <Modal title="批量影片工具" open={batchOpen} onCancel={() => setBatchOpen(false)} footer={null}><Form form={batchForm} layout="vertical" onFinish={batchLookup} initialValues={{ mode: "stream" }}><Form.Item name="codes" label="番号列表" rules={[{ required: true }]}><Input.TextArea rows={8} placeholder="ABP-123&#10;IPX-456" /></Form.Item><Form.Item name="mode" label="处理方式"><Segmented block options={[{ label: "标准批量", value: "standard" }, { label: "流式进度", value: "stream" }]} /></Form.Item>{batchProgress ? <Progress percent={batchProgress.total ? Math.round(batchProgress.completed / batchProgress.total * 100) : 0} format={() => `${batchProgress.completed}/${batchProgress.total}`} /> : null}<Button type="primary" block htmlType="submit" loading={loading}>查询影片与最佳磁力</Button></Form></Modal>

      <Drawer title="账户与连接" open={accountOpen} onClose={() => setAccountOpen(false)} width={520}><Tabs items={[
        { key: "pikpak", label: "PikPak", children: <><Alert type={pikpakLoggedIn || clientConfig.pikpak?.configured ? "success" : "warning"} showIcon message={pikpakLoggedIn ? "当前会话登录成功" : clientConfig.pikpak?.configured ? "服务端账号已配置" : "尚未配置账号"} /><Form form={pikpakForm} layout="vertical" onFinish={loginPikpak}><Form.Item name="username" label="用户名" rules={[{ required: true }]}><Input autoComplete="username" /></Form.Item><Form.Item name="password" label="密码" rules={[{ required: true }]}><Input.Password autoComplete="current-password" /></Form.Item><Button type="primary" block htmlType="submit">登录当前会话</Button>{clientConfig.pikpak?.configured ? <Button className="wb-submit" block onClick={loginConfiguredPikpak}>验证服务端配置</Button> : null}</Form></> },
        { key: "115", label: "115 网盘", children: <><Alert type={pan115Status.connected ? "success" : "warning"} showIcon message={pan115Status.connected ? `已连接${pan115Status.uid ? ` · ${pan115Status.uid}` : ""}` : "可以扫码登录或粘贴 Cookie"} /><Button type="primary" block onClick={startQrLogin}>生成登录二维码</Button>{qrSession ? <div className="wb-qr-login"><img src={qrSession.qrcode_image_url} alt="115 登录二维码" /><Text>{qrSession.message || ({ waiting: "等待扫码", scanned: "已扫码，请确认", allowed: "登录成功", expired: "二维码已过期", canceled: "已取消" }[qrSession.state] || qrSession.state)}</Text></div> : null}<Form form={cookieForm} layout="vertical" onFinish={saveCookie}><Form.Item name="cookie" label="115 Cookie" rules={[{ required: true }]}><Input.Password /></Form.Item><Button block htmlType="submit">验证并保存 Cookie</Button></Form></> },
        { key: "aria2", label: "Aria2", children: <><Alert type={connections.aria2_connected ? "success" : "warning"} showIcon message={connections.aria2_connected ? "当前会话已连接" : "尚未连接 Aria2"} /><Button type="primary" block onClick={() => navigate("downloads")}>打开下载连接页</Button></> },
      ]} /></Drawer>

      <Drawer title={detailsMovie ? `${detailsMovie.id} 详情` : "影片详情"} open={!!detailsMovie} onClose={() => setDetailsMovie(null)} width={560}>{detailsMovie ? <div className="wb-library-detail">{posterUrl(detailsMovie) ? <img src={posterUrl(detailsMovie)} alt={`${detailsMovie.id} 海报`} /> : null}<Title level={3}>{detailsMovie.title || detailsMovie.id}</Title><Descriptions column={1} size="small" items={[{ key: "id", label: "番号", children: detailsMovie.id }, { key: "download", label: "下载记录", children: detailsMovie.download_status?.downloaded ? "已有记录" : "无记录" }, { key: "date", label: "发行日期", children: detailsMovie.date || "—" }, { key: "director", label: "导演", children: detailsMovie.director?.name || detailsMovie.director || "—" }, { key: "studio", label: "制作商", children: detailsMovie.studio?.name || detailsMovie.studio || "—" }, { key: "series", label: "系列", children: detailsMovie.series?.name || detailsMovie.series || "—" }]} /><Text>{detailsMovie.plot || detailsMovie.full_title || "暂无简介"}</Text></div> : null}</Drawer>
      <Drawer title={actor?.name || "演员详情"} open={!!actor} onClose={() => setActor(null)} width={480}>{actor ? <div className="wb-library-detail">{actor.avatar || actor.img ? <img src={actor.avatar || actor.img} alt={actor.name || "演员"} /> : null}<Title level={3}>{actor.name}</Title><Text>{actor.description || actor.birthday || "暂无更多资料"}</Text></div> : null}</Drawer>
    </div>
  );
}
