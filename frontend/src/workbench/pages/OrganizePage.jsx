import { api } from "../api.js";
import { EmptyBlock, PageIntro } from "../ui.jsx";
import { waitForJob } from "../../utils/jobPolling.mjs";
import { deleteLocalScrapeTaskTemplate, loadLocalScrapeTaskTemplates, saveLocalScrapeTaskTemplate } from "../../utils/localScrapeTemplates.mjs";
import { getDeletableNonConformingLocalScrapeKeys, getLocalScrapeIssueReason, getVisibleLocalScrapeItems } from "../../utils/localScrapeResults.mjs";

const React = window.React;
const { Button, Card, Checkbox, Form, Input, InputNumber, Modal, Popconfirm, Progress, Segmented, Select, Space, Switch, Table, Tag, Typography, message } = window.antd;
const { Text } = Typography;
const icons = window.icons || {};

const templateToForm = values => ({
  directory: values.directory, recursive: values.recursive, max_depth: values.maxDepth, scrape: values.scrape,
  concurrent: values.concurrent, organize: values.organize, target_directory: values.targetDirectory,
  folder_template: values.folderTemplate, naming_template: values.namingTemplate, write_nfo: values.writeNfo,
  download_images: values.downloadImages, download_sample_images: values.downloadSampleImages,
  download_actor_images: values.downloadActorImages, download_list_thumbnail: values.downloadListThumbnail,
  overwrite_existing: values.overwriteExisting,
});

const formToTemplate = values => ({
  directory: values.directory, recursive: values.recursive, maxDepth: values.max_depth, scrape: values.scrape,
  concurrent: values.concurrent, organize: values.organize, targetDirectory: values.target_directory,
  folderTemplate: values.folder_template, namingTemplate: values.naming_template, writeNfo: values.write_nfo,
  downloadImages: values.download_images, downloadSampleImages: values.download_sample_images,
  downloadActorImages: values.download_actor_images, downloadListThumbnail: values.download_list_thumbnail,
  overwriteExisting: values.overwrite_existing,
});

export default function OrganizePage() {
  const [form] = Form.useForm();
  const [items, setItems] = React.useState([]);
  const [selected, setSelected] = React.useState([]);
  const [loading, setLoading] = React.useState(false);
  const [summary, setSummary] = React.useState(null);
  const [job, setJob] = React.useState(null);
  const [resultMode, setResultMode] = React.useState("ready");
  const [templates, setTemplates] = React.useState(() => loadLocalScrapeTaskTemplates());
  const [templateName, setTemplateName] = React.useState("");
  const [activeTemplate, setActiveTemplate] = React.useState("");
  const [browserOpen, setBrowserOpen] = React.useState(false);
  const [browserField, setBrowserField] = React.useState("directory");
  const [browserPath, setBrowserPath] = React.useState("");
  const [directories, setDirectories] = React.useState([]);

  const values = () => form.getFieldsValue(true);
  const payloadOptions = formValues => ({
    directory: formValues.directory, recursive: formValues.recursive, max_depth: formValues.max_depth ?? null,
    scrape: formValues.scrape, concurrent: formValues.concurrent, organize: formValues.organize,
    target_directory: formValues.target_directory || null, folder_template: formValues.folder_template ?? null,
    naming_template: formValues.naming_template, write_nfo: formValues.write_nfo,
    download_images: formValues.download_images, download_sample_images: formValues.download_sample_images,
    download_actor_images: formValues.download_actor_images, download_list_thumbnail: formValues.download_list_thumbnail,
    overwrite_existing: formValues.overwrite_existing,
  });

  const openBrowser = async (field, path = "") => {
    setBrowserField(field); setBrowserOpen(true);
    try {
      const result = await api(`/api/system/directories${path ? `?path=${encodeURIComponent(path)}` : ""}`);
      setBrowserPath(result.current_path || path); setDirectories(result.entries || []);
    } catch (error) { message.error(error.message); }
  };

  const preview = async formValues => {
    setLoading(true); setJob({ percent: 0, message: "创建预览任务" });
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
      setSelected(normalized.filter(item => item.scrape_status === "found" || item.status === "found" || item.metadata).map(item => item._key));
      setSummary(result.summary || { total: rows.length }); setResultMode("ready");
      message.success(`已生成 ${rows.length} 条整理预览`);
    } catch (error) { message.error(error.message); }
    finally { setLoading(false); setJob(null); }
  };

  const apply = async () => {
    const formValues = values();
    const chosen = items.filter(item => selected.includes(item._key));
    if (!chosen.length) return message.warning("请先选择要执行的文件");
    setLoading(true); setJob({ percent: 0, message: "创建整理任务" });
    try {
      const applyPayload = {
        items: chosen.map(item => ({ source_path: item.source_path || item.path, code: item.code || item.movie_id, metadata: item.metadata || null, conflict_resolution: item.conflict_resolution || (item.conflict ? "auto_best" : null) })),
        ...payloadOptions(formValues), directory: undefined,
      };
      let result;
      if (formValues.execution_mode === "sync") result = await api("/api/movies/local-scrape/apply", { method: "POST", body: JSON.stringify(applyPayload) });
      else {
        const started = await api("/api/movies/local-scrape/apply/jobs", { method: "POST", body: JSON.stringify(applyPayload) });
        result = await waitForJob(api, `/api/movies/local-scrape/jobs/${encodeURIComponent(started.task_id)}`, setJob, 500);
      }
      message.success(result.message || "整理任务已完成");
      await preview(formValues);
    } catch (error) { message.error(error.message); setLoading(false); setJob(null); }
  };

  const deleteInvalid = async () => {
    const sourcePaths = getDeletableNonConformingLocalScrapeKeys(items).filter(path => selected.includes(path));
    if (!sourcePaths.length) return message.warning("没有选中可删除的未通过文件");
    try {
      const result = await api("/api/movies/local-scrape/delete", { method: "POST", body: JSON.stringify({ directory: values().directory, source_paths: sourcePaths }) });
      message.success(result.message || `已删除 ${sourcePaths.length} 个文件`);
      setItems(current => current.filter(item => !sourcePaths.includes(item.source_path)));
      setSelected(current => current.filter(key => !sourcePaths.includes(key)));
    } catch (error) { message.error(error.message); }
  };

  const saveTemplate = () => {
    const saved = saveLocalScrapeTaskTemplate(window.localStorage, templateName, formToTemplate(values()), { existingId: activeTemplate });
    setTemplates(loadLocalScrapeTaskTemplates()); setActiveTemplate(saved.id); setTemplateName(saved.name); message.success("整理模板已保存");
  };
  const loadTemplate = id => {
    const template = templates.find(item => item.id === id);
    setActiveTemplate(id); setTemplateName(template?.name || "");
    if (template) form.setFieldsValue(templateToForm(template.values));
  };
  const removeTemplate = () => {
    setTemplates(deleteLocalScrapeTaskTemplate(window.localStorage, activeTemplate)); setActiveTemplate(""); setTemplateName("");
  };

  const visibleItems = getVisibleLocalScrapeItems(items, resultMode === "issues");

  return <div className="wb-page">
    <PageIntro title="整理媒体" description="使用异步预览检查识别、命名和冲突，再执行或清理未通过文件。" actions={items.length ? [<Button key="apply" type="primary" icon={icons.CheckOutlined ? <icons.CheckOutlined /> : null} onClick={apply} loading={loading}>执行所选 {selected.length} 项</Button>] : null} />
    <div className="wb-organize-layout">
      <Card className="wb-control-panel" title="整理规则" extra={<Button type="text" size="small" onClick={saveTemplate}>保存模板</Button>}>
        <Space direction="vertical" className="wb-full-width">
          <Select allowClear placeholder="加载已保存模板" value={activeTemplate || undefined} onChange={loadTemplate} options={templates.map(item => ({ label: item.name, value: item.id }))} />
          <Input value={templateName} onChange={event => setTemplateName(event.target.value)} placeholder="模板名称" suffix={activeTemplate ? <Popconfirm title="删除这个模板？" onConfirm={removeTemplate}><Button type="text" danger size="small">删除</Button></Popconfirm> : null} />
        </Space>
        <Form form={form} layout="vertical" onFinish={preview} initialValues={{ execution_mode: "background", recursive: true, max_depth: null, scrape: true, concurrent: 3, organize: true, naming_template: "{code} {title}", write_nfo: true, download_images: true, download_sample_images: false, download_actor_images: false, download_list_thumbnail: false, overwrite_existing: false }}>
          <Form.Item name="execution_mode" label="执行方式"><Segmented block options={[{ label: "后台任务", value: "background" }, { label: "同步等待", value: "sync" }]} /></Form.Item>
          <Form.Item name="directory" label="扫描目录" rules={[{ required: true }]}><Input addonAfter={<Button type="text" size="small" onClick={() => openBrowser("directory", form.getFieldValue("directory"))}>浏览</Button>} /></Form.Item>
          <Form.Item name="target_directory" label="目标目录"><Input addonAfter={<Button type="text" size="small" onClick={() => openBrowser("target_directory", form.getFieldValue("target_directory"))}>浏览</Button>} /></Form.Item>
          <Form.Item name="folder_template" label="文件夹模板"><Input placeholder="{actor}/{code}" /></Form.Item><Form.Item name="naming_template" label="文件命名" rules={[{ required: true }]}><Input /></Form.Item>
          <div className="wb-form-grid"><Form.Item name="concurrent" label="并发数"><InputNumber min={1} max={5} /></Form.Item><Form.Item name="max_depth" label="最大深度"><InputNumber min={0} placeholder="不限" /></Form.Item><Form.Item name="recursive" label="递归扫描" valuePropName="checked"><Switch /></Form.Item><Form.Item name="scrape" label="在线刮削" valuePropName="checked"><Switch /></Form.Item><Form.Item name="organize" label="整理文件" valuePropName="checked"><Switch /></Form.Item><Form.Item name="overwrite_existing" label="覆盖已有资源" valuePropName="checked"><Switch /></Form.Item></div>
          <Space direction="vertical"><Form.Item name="write_nfo" valuePropName="checked" noStyle><Checkbox>写入 NFO</Checkbox></Form.Item><Form.Item name="download_images" valuePropName="checked" noStyle><Checkbox>下载封面</Checkbox></Form.Item><Form.Item name="download_sample_images" valuePropName="checked" noStyle><Checkbox>下载样例图片</Checkbox></Form.Item><Form.Item name="download_actor_images" valuePropName="checked" noStyle><Checkbox>下载演员头像</Checkbox></Form.Item><Form.Item name="download_list_thumbnail" valuePropName="checked" noStyle><Checkbox>生成列表缩略图</Checkbox></Form.Item></Space>
          <Button className="wb-submit" type="primary" htmlType="submit" block loading={loading}>生成整理预览</Button>
        </Form>
      </Card>

      <section className="wb-work-surface">
        <div className="wb-surface-head"><div><strong>预览结果</strong><Text type="secondary">{summary ? `扫描 ${summary.total ?? items.length} 个文件` : "等待扫描目录"}</Text></div>{items.length ? <Space><Segmented value={resultMode} onChange={value => { setResultMode(value); setSelected([]); }} options={[{ label: "可执行", value: "ready" }, { label: "未通过", value: "issues" }]} />{resultMode === "issues" ? <Popconfirm title="确定删除所选未通过文件？此操作会删除原文件。" onConfirm={deleteInvalid}><Button danger>删除所选</Button></Popconfirm> : null}</Space> : null}</div>
        {job ? <div className="wb-job-progress"><Progress percent={job.percent || 0} /><Text>{job.message || job.current}</Text></div> : null}
        {items.length ? <Table rowKey="_key" dataSource={visibleItems} loading={loading} rowSelection={{ selectedRowKeys: selected, onChange: setSelected }} scroll={{ x: 1050 }} columns={[
          { title: "源文件", dataIndex: "source_path", ellipsis: true, render: (value, record) => value || record.path },
          { title: "番号", dataIndex: "code", width: 120, render: (value, record) => value || record.movie_id || "—" },
          { title: "标题", width: 210, ellipsis: true, render: (_, record) => record.metadata?.title || record.title || "—" },
          { title: "目标", dataIndex: "target_path", width: 240, ellipsis: true, render: (value, record) => value || record.target || "—" },
          { title: "状态", width: 130, render: (_, record) => record.scrape_status === "found" || record.status === "found" || record.metadata ? <Tag color="green">可执行</Tag> : <Tag color="orange">未通过</Tag> },
          { title: "问题/冲突", width: 220, render: (_, record) => record.conflict ? <Select value={record.conflict_resolution || "auto_best"} onChange={value => setItems(current => current.map(item => item._key === record._key ? { ...item, conflict_resolution: value } : item))} options={[{ label: "自动保留最佳", value: "auto_best" }, { label: "跳过", value: "skip" }, { label: "覆盖", value: "overwrite" }]} /> : getLocalScrapeIssueReason(record) || "—" },
        ]} /> : <EmptyBlock title="预览先于执行" description="选择目录并生成预览后，这里会展示源文件、识别结果、目标路径和冲突。" />}
      </section>
    </div>

    <Modal title="选择服务端目录" open={browserOpen} onCancel={() => setBrowserOpen(false)} footer={<Button type="primary" onClick={() => { form.setFieldValue(browserField, browserPath); setBrowserOpen(false); }}>选择当前目录</Button>} width={720}><Space className="wb-browser-path"><Button disabled={!browserPath} onClick={() => openBrowser(browserField, browserPath.replace(/[\\/][^\\/]+[\\/]?$/, ""))}>上一级</Button><Text code>{browserPath || "根目录"}</Text></Space><Table rowKey="path" pagination={false} dataSource={directories} columns={[{ title: "目录", dataIndex: "name", render: (name, record) => <Button type="link" onClick={() => openBrowser(browserField, record.path)}>{name}</Button> }, { title: "路径", dataIndex: "path", ellipsis: true }]} /></Modal>
  </div>;
}
