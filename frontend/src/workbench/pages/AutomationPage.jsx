import { api } from "../api.js";
import { EmptyBlock, PageIntro } from "../ui.jsx";

const React = window.React;
const { Button, Drawer, Form, Input, InputNumber, List, Popconfirm, Segmented, Select, Space, Switch, Table, Tag, Typography, message } = window.antd;
const { Text } = Typography;
const icons = window.icons || {};

const defaultNodes = values => [
  { id: "trigger", type: "trigger", position: { x: 40, y: 80 }, config: {} },
  { id: "search", type: "search", position: { x: 280, y: 80 }, config: { mode: values.mode, keyword: values.mode === "keyword" ? values.query : "", codes: values.mode === "codes" ? values.query : "", max_results: values.max_results, skip_existing: true } },
  { id: "magnet", type: "magnet", position: { x: 520, y: 80 }, config: { source: values.source, has_subtitle: values.has_subtitle || null, exclude_4k: values.exclude_4k, allow_chinese_subtitles: true } },
  { id: "download", type: "download", position: { x: 760, y: 80 }, config: { tool: values.tool } },
];

const EDGES = [
  { id: "trigger-search", source: "trigger", target: "search" },
  { id: "search-magnet", source: "search", target: "magnet" },
  { id: "magnet-download", source: "magnet", target: "download" },
];

export default function AutomationPage() {
  const [tasks, setTasks] = React.useState([]);
  const [runs, setRuns] = React.useState([]);
  const [selected, setSelected] = React.useState(null);
  const [editorOpen, setEditorOpen] = React.useState(false);
  const [runsOpen, setRunsOpen] = React.useState(false);
  const [loading, setLoading] = React.useState(true);
  const [form] = Form.useForm();

  const load = React.useCallback(async () => {
    setLoading(true);
    try { setTasks((await api("/api/automation/tasks")).tasks || []); }
    catch (error) { message.error(error.message); }
    finally { setLoading(false); }
  }, []);

  React.useEffect(() => { void load(); }, [load]);

  const openEditor = async task => {
    if (task?.id) {
      try { task = await api(`/api/automation/tasks/${encodeURIComponent(task.id)}`); }
      catch (error) { message.error(error.message); return; }
    }
    setSelected(task || null);
    const search = task?.nodes?.find(node => node.type === "search")?.config || {};
    const magnet = task?.nodes?.find(node => node.type === "magnet")?.config || {};
    const download = task?.nodes?.find(node => node.type === "download")?.config || {};
    form.setFieldsValue({
      name: task?.name || "新的自动任务", enabled: task?.enabled ?? true,
      trigger_type: task?.trigger?.type || "auto", scheduled_time: task?.trigger?.scheduled_time || "03:00", interval_minutes: task?.trigger?.interval_minutes || 60,
      mode: search.mode || "keyword", query: search.keyword || search.codes || "", max_results: search.max_results || 30,
      source: magnet.source || "javbus", has_subtitle: magnet.has_subtitle || "", exclude_4k: !!magnet.exclude_4k, tool: download.tool || "pikpak",
    });
    setEditorOpen(true);
    setRunsOpen(false);
  };

  const save = async values => {
    const payload = {
      name: values.name,
      enabled: values.enabled,
      trigger: { type: values.trigger_type, scheduled_time: values.trigger_type === "scheduled" ? values.scheduled_time : null, interval_minutes: values.trigger_type === "interval" ? values.interval_minutes : null },
      nodes: defaultNodes(values),
      edges: EDGES,
    };
    try {
      await api(selected ? `/api/automation/tasks/${selected.id}` : "/api/automation/tasks", { method: selected ? "PUT" : "POST", body: JSON.stringify(payload) });
      message.success(selected ? "任务已更新" : "任务已创建");
      setEditorOpen(false);
      await load();
    } catch (error) { message.error(error.message); }
  };

  const run = async task => {
    try {
      message.loading({ key: task.id, content: `正在运行 ${task.name}` });
      const result = await api(`/api/automation/tasks/${task.id}/run`, { method: "POST" });
      message.success({ key: task.id, content: `运行完成：${result.status || "success"}` });
      await load();
    } catch (error) { message.error({ key: task.id, content: error.message }); }
  };

  const remove = async task => {
    try { await api(`/api/automation/tasks/${task.id}`, { method: "DELETE" }); await load(); }
    catch (error) { message.error(error.message); }
  };

  const openRuns = async task => {
    setSelected(task);
    setRunsOpen(true);
    try { setRuns((await api(`/api/automation/tasks/${task.id}/runs`)).runs || []); }
    catch (error) { message.error(error.message); }
  };

  return (
    <div className="wb-page">
      <PageIntro
        title="自动化"
        description="每个任务都固定包含发现、选择磁力和派发三个业务步骤，只有触发方式与策略可配置。"
        actions={[<Button key="new" type="primary" icon={icons.PlusOutlined ? <icons.PlusOutlined /> : null} onClick={() => openEditor(null)}>新建任务</Button>]}
      />

      <div className="wb-automation-flow">
        {[["1", "发现", "按关键词或番号获取影片"], ["2", "资源", "按字幕和清晰度选择磁力"], ["3", "派发", "发送到 PikPak、115 或 Aria2"]].map(([number, label, note]) => <div key={number}><span>{number}</span><strong>{label}</strong><small>{note}</small></div>)}
      </div>

      {tasks.length ? (
        <List
          className="wb-task-list"
          loading={loading}
          dataSource={tasks}
          renderItem={task => {
            const search = task.nodes?.find(node => node.type === "search")?.config || {};
            const download = task.nodes?.find(node => node.type === "download")?.config || {};
            return (
              <List.Item actions={[
                <Button key="run" className="wb-row-action" onClick={() => run(task)}>立即运行</Button>,
                <Button key="edit" type="text" onClick={() => openEditor(task)}>编辑</Button>,
                <Button key="runs" type="text" onClick={() => openRuns(task)}>记录</Button>,
                <Popconfirm key="delete" title="删除这个自动任务？" onConfirm={() => remove(task)}><Button type="text" danger>删除</Button></Popconfirm>,
              ]}>
                <List.Item.Meta
                  title={<Space><Text strong>{task.name}</Text><Tag color={task.enabled ? "green" : "default"}>{task.enabled ? "启用" : "停用"}</Tag>{task.last_status ? <Tag>{task.last_status}</Tag> : null}</Space>}
                  description={`${search.mode === "codes" ? "番号批量" : "关键词"} · ${search.keyword || search.codes || "未设置"} · ${download.tool || "pikpak"}`}
                />
                <Text type="secondary">{task.next_run_at ? `下次：${task.next_run_at}` : "仅手动运行"}</Text>
              </List.Item>
            );
          }}
        />
      ) : <EmptyBlock title={loading ? "正在读取任务" : "还没有自动任务"} description="新建一个任务，把重复的搜索、资源选择和派发交给系统。" />}

      <Drawer title={selected ? "编辑自动任务" : "新建自动任务"} open={editorOpen} onClose={() => { setEditorOpen(false); setSelected(null); }} width={480}>
        <Form form={form} layout="vertical" onFinish={save}>
          <Form.Item name="name" label="任务名称" rules={[{ required: true }]}><Input /></Form.Item>
          <Form.Item name="enabled" label="启用任务" valuePropName="checked"><Switch /></Form.Item>
          <Form.Item name="trigger_type" label="触发方式"><Segmented block options={[{ label: "仅手动", value: "auto" }, { label: "每天定时", value: "scheduled" }, { label: "固定间隔", value: "interval" }]} /></Form.Item>
          <Form.Item noStyle shouldUpdate={(before, after) => before.trigger_type !== after.trigger_type}>{({ getFieldValue }) => getFieldValue("trigger_type") === "scheduled" ? <Form.Item name="scheduled_time" label="每天运行时间"><Input placeholder="03:00" /></Form.Item> : getFieldValue("trigger_type") === "interval" ? <Form.Item name="interval_minutes" label="间隔分钟"><InputNumber min={1} /></Form.Item> : null}</Form.Item>
          <Form.Item name="mode" label="发现方式"><Segmented block options={[{ label: "关键词", value: "keyword" }, { label: "番号列表", value: "codes" }]} /></Form.Item>
          <Form.Item name="query" label="关键词或番号" rules={[{ required: true }]}><Input.TextArea rows={4} /></Form.Item>
          <Form.Item name="max_results" label="最多处理"><InputNumber min={1} max={1000} /></Form.Item>
          <Form.Item name="source" label="磁力来源"><Select options={[{ label: "JavBus", value: "javbus" }, { label: "Cilisiusou", value: "cilisousuo" }, { label: "YHG007", value: "yhg007" }]} /></Form.Item>
          <Form.Item name="has_subtitle" label="字幕要求"><Select options={[{ label: "不限", value: "" }, { label: "只要字幕", value: "true" }, { label: "排除字幕", value: "false" }]} /></Form.Item>
          <Form.Item name="exclude_4k" label="排除 4K" valuePropName="checked"><Switch /></Form.Item>
          <Form.Item name="tool" label="派发目标"><Segmented block options={[{ label: "PikPak", value: "pikpak" }, { label: "115", value: "115" }, { label: "Aria2", value: "aria2" }]} /></Form.Item>
          <Button type="primary" block htmlType="submit">保存任务</Button>
        </Form>
      </Drawer>

      <Drawer title={selected ? `${selected.name} · 运行记录` : "运行记录"} open={runsOpen} onClose={() => { setRunsOpen(false); setSelected(null); setRuns([]); }} width={760}>
        <Table rowKey="id" dataSource={runs} expandable={{ expandedRowRender: record => <Table size="small" pagination={false} rowKey={(item, index) => `${item.movie_id}-${index}`} dataSource={record.items || []} columns={[
          { title: "番号", dataIndex: "movie_id" },
          { title: "标题", dataIndex: "title", ellipsis: true },
          { title: "状态", dataIndex: "status", render: value => <Tag>{value}</Tag> },
          { title: "磁力", dataIndex: "magnet_link", ellipsis: true },
          { title: "说明", dataIndex: "message", ellipsis: true },
        ]} /> }} columns={[
          { title: "开始时间", dataIndex: "started_at" }, { title: "状态", dataIndex: "status", render: value => <Tag color={value === "success" ? "green" : value === "failed" ? "red" : "orange"}>{value}</Tag> },
          { title: "发现", dataIndex: "found_count" }, { title: "磁力", dataIndex: "magnet_count" }, { title: "派发", dataIndex: "dispatched_count" }, { title: "跳过", dataIndex: "skipped_count" },
        ]} />
      </Drawer>
    </div>
  );
}
