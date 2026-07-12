import { api, formatBytes, movieList } from "../api.js";
import { EmptyBlock, PageIntro } from "../ui.jsx";
import { waitForJob } from "../../utils/jobPolling.mjs";

const React = window.React;
const { Button, Card, Checkbox, Drawer, Form, Input, InputNumber, Modal, Popconfirm, Progress, Segmented, Select, Space, Statistic, Table, Tag, Typography, message } = window.antd;
const { Text, Title } = Typography;
const icons = window.icons || {};

function fileRows(record) { return record?.files || record?.video_files || []; }
function names(values) { return (values || []).map(item => item?.name || item).filter(Boolean); }
function recordId(record) { return record?.id || record?.movie_id || ""; }

export default function LibraryPage() {
  const [records, setRecords] = React.useState([]);
  const [settings, setSettings] = React.useState({ directories: [], ignored_paths: [] });
  const [actors, setActors] = React.useState([]);
  const [actorKey, setActorKey] = React.useState("");
  const [actorMovieIds, setActorMovieIds] = React.useState(null);
  const [loading, setLoading] = React.useState(true);
  const [job, setJob] = React.useState(null);
  const [query, setQuery] = React.useState("");
  const [view, setView] = React.useState("posters");
  const [sort, setSort] = React.useState("date");
  const [selected, setSelected] = React.useState(null);
  const [scanOpen, setScanOpen] = React.useState(false);
  const [actorsOpen, setActorsOpen] = React.useState(false);
  const [maintenanceOpen, setMaintenanceOpen] = React.useState(false);
  const [information, setInformation] = React.useState(null);
  const [informationFields, setInformationFields] = React.useState([]);
  const [scanForm] = Form.useForm();

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const [library, librarySettings, actorPayload] = await Promise.all([
        api("/api/movies/local-library"), api("/api/movies/local-library/settings"), api("/api/movies/local-library/actors"),
      ]);
      setRecords(movieList(library)); setSettings(librarySettings); setActors(actorPayload.actors || []);
    } catch (error) { message.error(error.message); }
    finally { setLoading(false); }
  }, []);

  React.useEffect(() => { void load(); }, [load]);

  const visible = React.useMemo(() => {
    const keyword = query.trim().toLowerCase();
    let filtered = keyword ? records.filter(record => [recordId(record), record.title, ...names(record.stars), ...names(record.genres)].join(" ").toLowerCase().includes(keyword)) : records;
    if (actorMovieIds) filtered = filtered.filter(record => actorMovieIds.has(recordId(record)));
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

  const scan = async values => {
    const directories = values.directories.split(/\r?\n/).map(value => value.trim()).filter(Boolean);
    const ignored_paths = values.ignored_paths?.split(/\r?\n/).map(value => value.trim()).filter(Boolean) || [];
    setLoading(true); setJob({ percent: 0, message: "创建扫描任务" });
    try {
      await api("/api/movies/local-library/settings", { method: "PUT", body: JSON.stringify({ directories, ignored_paths }) });
      const scanPayload = { directories, ignored_paths, recursive: values.recursive, max_depth: values.max_depth ?? null, remove_missing: values.remove_missing, scrape: values.scrape, probe_media: values.probe_media, regularize_files: values.regularize_files, concurrent: values.concurrent };
      let result;
      if (values.execution_mode === "sync") result = await api("/api/movies/local-library/scan", { method: "POST", body: JSON.stringify(scanPayload) });
      else {
        const started = await api("/api/movies/local-library/scan/jobs", { method: "POST", body: JSON.stringify(scanPayload) });
        result = await waitForJob(api, `/api/movies/local-library/scan/jobs/${encodeURIComponent(started.task_id)}`, setJob, 500);
      }
      message.success(result.message || "影视库扫描完成"); setScanOpen(false); await load();
    } catch (error) { message.error(error.message); }
    finally { setLoading(false); setJob(null); }
  };

  const openDetails = async record => {
    setSelected(record);
    try {
      const result = await api(`/api/movies/local-library/${encodeURIComponent(recordId(record))}`);
      setSelected({ ...record, ...(result.record || {}) });
    } catch (error) { message.error(error.message); }
  };

  const remove = async record => {
    try { await api(`/api/movies/local-library/${encodeURIComponent(recordId(record))}`, { method: "DELETE" }); setSelected(null); await load(); message.success("已从影视库索引移除"); }
    catch (error) { message.error(error.message); }
  };

  const checkInformation = async () => {
    try {
      const result = await api("/api/movies/local-library/information/check");
      setInformation(result); setInformationFields(result.fields || []); setMaintenanceOpen(true);
    } catch (error) { message.error(error.message); }
  };

  const downloadInformation = async () => {
    try {
      const result = await api("/api/movies/local-library/information/download", { method: "POST", body: JSON.stringify({ fields: informationFields, only_missing: true, concurrent: 3, write_nfo: true, download_images: true, download_sample_images: false, download_actor_images: true, download_list_thumbnail: true, overwrite_existing: false }) });
      message.success(result.message || "缺失信息下载完成"); await checkInformation(); await load();
    } catch (error) { message.error(error.message); }
  };

  const cleanInvalid = async () => {
    try { const result = await api("/api/movies/local-library/clean-invalid", { method: "POST" }); message.success(result.message || "无效文件记录已清理"); await load(); }
    catch (error) { message.error(error.message); }
  };
  const clearLibrary = async () => {
    try { await api("/api/movies/local-library", { method: "DELETE" }); setRecords([]); setMaintenanceOpen(false); message.success("影视库索引已清空，原文件未删除"); }
    catch (error) { message.error(error.message); }
  };
  const chooseActor = async actor => {
    const key = actor.actor_key || actor.key || actor.id || actor.name;
    try {
      const result = await api(`/api/movies/local-library/actors/${encodeURIComponent(key)}/movies`);
      setActorKey(key); setActorMovieIds(new Set((result.movies || result.movie_ids || []).map(item => typeof item === "string" ? item : recordId(item)))); setActorsOpen(false);
    } catch (error) { message.error(error.message); }
  };

  return <div className="wb-page">
    <PageIntro title="影视库" description="扫描、播放、补全信息并维护本地媒体索引。" actions={[
      <Button key="actors" onClick={() => setActorsOpen(true)}>演员库</Button>,
      <Button key="maintain" onClick={checkInformation}>维护</Button>,
      <Button key="scan" type="primary" icon={icons.ScanOutlined ? <icons.ScanOutlined /> : null} onClick={openScan}>扫描目录</Button>,
    ]} />

    {job ? <div className="wb-job-progress"><Progress percent={job.percent || 0} /><Text>{job.message || job.current}</Text></div> : null}
    <div className="wb-library-stats"><Statistic title="影片" value={records.length} /><Statistic title="本地文件" value={totalFiles} /><Statistic title="总容量" value={formatBytes(totalBytes)} /><Statistic title="当前结果" value={visible.length} /></div>
    <div className="wb-library-toolbar"><Input.Search value={query} onChange={event => setQuery(event.target.value)} allowClear placeholder="搜索番号、标题、演员或标签" /><Select value={sort} onChange={setSort} options={[{ label: "按发行日期", value: "date" }, { label: "按标题", value: "title" }, { label: "按容量", value: "size" }]} /><Segmented value={view} onChange={setView} options={[{ label: "海报", value: "posters" }, { label: "列表", value: "list" }]} /><Button onClick={load} loading={loading} type="text">刷新</Button></div>
    {actorKey ? <div className="wb-active-filter"><Tag closable onClose={() => { setActorKey(""); setActorMovieIds(null); }}>演员：{actorKey}</Tag></div> : null}

    {visible.length ? <div className={view === "posters" ? "wb-library-grid" : "wb-library-list"}>{visible.map(record => {
      const id = recordId(record); const media = record.media_info || fileRows(record)[0]?.media_info || {};
      return <button type="button" className="wb-library-card" key={id} onClick={() => openDetails(record)}><span className="wb-library-cover"><img src={`/api/movies/local-library/poster/${encodeURIComponent(id)}`} alt={`${id} 海报`} loading="lazy" onError={event => { if (!event.currentTarget.dataset.fallback) { event.currentTarget.dataset.fallback = "1"; event.currentTarget.src = `/api/movies/local-library/thumbnail/${encodeURIComponent(id)}`; } else event.currentTarget.style.display = "none"; }} /></span><span className="wb-library-card-copy"><strong>{id}</strong><Text ellipsis={{ tooltip: record.title }}>{record.title || "未命名影片"}</Text><small>{names(record.stars).join("、") || "演员未知"}</small><span>{record.is_vr ? <Tag color="purple">VR</Tag> : null}{media.resolution ? <Tag>{media.resolution}</Tag> : null}<Tag>{fileRows(record).length} 个文件</Tag></span></span></button>;
    })}</div> : <EmptyBlock title={loading ? "正在读取影视库" : "影视库还没有内容"} description="扫描一个服务端可访问目录，或调整搜索条件。" />}

    <Modal title="扫描与保存影视库目录" open={scanOpen} onCancel={() => setScanOpen(false)} footer={null} width={620}><Form form={scanForm} layout="vertical" onFinish={scan}><Form.Item name="execution_mode" label="执行方式"><Segmented block options={[{ label: "后台任务", value: "background" }, { label: "同步等待", value: "sync" }]} /></Form.Item><Form.Item name="directories" label="扫描目录（每行一个）" rules={[{ required: true }]}><Input.TextArea rows={5} placeholder="/media/JAV" /></Form.Item><Form.Item name="ignored_paths" label="忽略路径（每行一个）"><Input.TextArea rows={3} /></Form.Item><div className="wb-form-grid"><Form.Item name="concurrent" label="并发数"><InputNumber min={1} max={10} /></Form.Item><Form.Item name="max_depth" label="最大深度"><InputNumber min={0} placeholder="不限" /></Form.Item></div><Space direction="vertical"><Form.Item name="recursive" valuePropName="checked" noStyle><Checkbox>递归扫描</Checkbox></Form.Item><Form.Item name="remove_missing" valuePropName="checked" noStyle><Checkbox>移除不存在的索引记录</Checkbox></Form.Item><Form.Item name="scrape" valuePropName="checked" noStyle><Checkbox>扫描时在线刮削</Checkbox></Form.Item><Form.Item name="probe_media" valuePropName="checked" noStyle><Checkbox>读取分辨率、编码和码率</Checkbox></Form.Item><Form.Item name="regularize_files" valuePropName="checked" noStyle><Checkbox>整理旧头像和重复文件</Checkbox></Form.Item></Space><Button className="wb-submit" type="primary" block htmlType="submit" loading={loading}>保存设置并开始扫描</Button></Form></Modal>

    <Drawer title={selected ? `${recordId(selected)} 影片详情` : "影片详情"} open={!!selected} onClose={() => setSelected(null)} width={680}>{selected ? <div className="wb-library-detail"><img src={`/api/movies/local-library/poster/${encodeURIComponent(recordId(selected))}`} alt={`${recordId(selected)} 海报`} /><Title level={3}>{selected.title || recordId(selected)}</Title><div className="wb-detail-actors">{names(selected.stars).map(name => <span key={name}><img src={`/api/movies/local-library/actor-avatar/${encodeURIComponent(recordId(selected))}/${encodeURIComponent(name)}`} alt={name} /><Tag color="magenta">{name}</Tag></span>)}</div><Space wrap>{names(selected.genres).map(name => <Tag key={name}>{name}</Tag>)}</Space><Text>{selected.full_text || selected.plot || "暂无简介"}</Text><Card size="small" title="本地文件">{fileRows(selected).map((file, index) => <div className="wb-file-line" key={file.path || file.file_name || index}><span>{file.file_name || file.name || file.path}</span><Space><Text type="secondary">{formatBytes(file.size)}</Text><Button size="small" type="link" href={`/api/movies/local-library/${encodeURIComponent(recordId(selected))}/play?file_index=${index}`} target="_blank">播放</Button></Space></div>)}</Card><Popconfirm title="只移除索引，不删除原文件。继续？" onConfirm={() => remove(selected)}><Button danger>从索引移除</Button></Popconfirm></div> : null}</Drawer>

    <Drawer title="演员库" open={actorsOpen} onClose={() => setActorsOpen(false)} width={720}>{actors.length ? <div className="wb-actor-grid">{actors.map(actor => { const key = actor.actor_key || actor.key || actor.id || actor.name; return <button type="button" key={key} onClick={() => chooseActor(actor)}><img src={`/api/movies/local-library/actors/${encodeURIComponent(key)}/avatar`} alt={actor.name || key} /><strong>{actor.name || key}</strong><Text>{actor.movie_count || actor.count || 0} 部影片</Text></button>; })}</div> : <EmptyBlock title="演员库为空" description="完成带演员信息的刮削后，这里会生成演员索引。" />}</Drawer>

    <Drawer title="影视库维护" open={maintenanceOpen} onClose={() => setMaintenanceOpen(false)} width={760}><Space direction="vertical" className="wb-full-width" size="large"><Card size="small" title="信息完整度"><Space wrap><Statistic title="影片" value={information?.total_movies || records.length} /><Statistic title="完整" value={information?.complete_count || 0} /><Statistic title="待补全" value={information?.incomplete_count || 0} /></Space><Select mode="multiple" value={informationFields} onChange={setInformationFields} options={(information?.available_fields || []).map(field => ({ value: field, label: information?.field_labels?.[field] || field }))} className="wb-full-width" /><Button type="primary" onClick={downloadInformation} disabled={!informationFields.length}>下载缺失信息</Button><Table size="small" rowKey="movie_id" pagination={{ pageSize: 8 }} dataSource={information?.incomplete_records || []} columns={[{ title: "番号", dataIndex: "movie_id" }, { title: "缺失字段", dataIndex: "missing_labels", render: value => (value || []).join("、") }]} /></Card><Card size="small" title="索引维护"><Space wrap><Button onClick={cleanInvalid}>清理无效文件记录</Button><Popconfirm title="清空整个影视库索引？原文件不会删除。" onConfirm={clearLibrary}><Button danger>清空影视库索引</Button></Popconfirm></Space></Card></Space></Drawer>
  </div>;
}
