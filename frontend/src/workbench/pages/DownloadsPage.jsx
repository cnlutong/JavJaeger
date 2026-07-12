import { api, formData, formatBytes } from "../api.js";
import { EmptyBlock, PageIntro, StatusDot } from "../ui.jsx";

const React = window.React;
const { Button, Card, Form, Input, Popconfirm, Progress, Segmented, Space, Table, Tag, Typography, message } = window.antd;
const { Text } = Typography;
const icons = window.icons || {};
const ARIA2_ACTIONS = { pause: "/api/aria2/pause/", resume: "/api/aria2/resume/", remove: "/api/aria2/remove/" };

export default function DownloadsPage({ clientConfig, connections, refreshRuntime }) {
  const [downloads, setDownloads] = React.useState([]);
  const [aria2Status, setAria2Status] = React.useState({ connected: false });
  const [statusFilter, setStatusFilter] = React.useState("all");
  const [magnetOpen, setMagnetOpen] = React.useState(false);
  const [loading, setLoading] = React.useState(false);
  const [form] = Form.useForm();
  const [magnetForm] = Form.useForm();

  const load = React.useCallback(async () => {
    const status = await api("/api/aria2/status").catch(() => ({ connected: false }));
    setAria2Status(status);
    if (!connections.aria2_connected) return setDownloads([]);
    try { setDownloads((await api("/api/aria2/downloads")).downloads || []); }
    catch (error) { message.error(error.message); }
  }, [connections.aria2_connected]);

  React.useEffect(() => {
    void load();
    if (!connections.aria2_connected) return undefined;
    const timer = window.setInterval(load, 10000);
    return () => window.clearInterval(timer);
  }, [connections.aria2_connected, load]);

  const connect = async values => {
    setLoading(true);
    try {
      const result = await api("/api/aria2/connect", { method: "POST", body: formData({ aria2_url: values.url, aria2_secret: values.secret }) });
      if (!result.success) throw new Error(result.message || "Aria2 连接失败");
      form.setFieldValue("secret", ""); await refreshRuntime(); await load(); message.success("Aria2 已连接到当前浏览器会话");
    } catch (error) { message.error(error.message); }
    finally { setLoading(false); }
  };

  const connectConfigured = async () => {
    try {
      const result = await api("/api/aria2/connect-config", { method: "POST" });
      if (!result.success) throw new Error(result.message || "Aria2 连接失败");
      await refreshRuntime(); await load(); message.success("已使用服务端配置连接");
    } catch (error) { message.error(error.message); }
  };

  const act = async (action, gid) => {
    try { await api(`${ARIA2_ACTIONS[action]}${encodeURIComponent(gid)}`, { method: action === "remove" ? "DELETE" : "POST" }); await load(); }
    catch (error) { message.error(error.message); }
  };

  const addMagnets = async values => {
    const links = values.magnets.split(/\r?\n/).map(value => value.trim()).filter(value => value.startsWith("magnet:"));
    if (!links.length) return message.warning("请输入有效的 magnet 链接");
    try {
      const result = await api("/api/aria2/download-magnets", { method: "POST", body: JSON.stringify({ magnet_links: links, movie_ids: [], magnet_sources: [] }) });
      message.success(result.message || `已添加 ${links.length} 个磁力任务`); magnetForm.resetFields(); setMagnetOpen(false); await load();
    } catch (error) { message.error(error.message); }
  };

  const visible = statusFilter === "all" ? downloads : downloads.filter(item => item.status === statusFilter);
  const totalSpeed = downloads.reduce((sum, item) => sum + Number(item.downloadSpeed || item.download_speed || 0), 0);

  return <div className="wb-page">
    <PageIntro title="下载队列" description="连接当前会话的 Aria2，添加磁力并管理所有传输状态。" actions={[<Button key="magnet" type="primary" disabled={!connections.aria2_connected} onClick={() => setMagnetOpen(value => !value)}>添加磁力</Button>, <Button key="refresh" type="text" icon={icons.ReloadOutlined ? <icons.ReloadOutlined /> : null} disabled={!connections.aria2_connected} onClick={load}>刷新</Button>]} />
    {magnetOpen ? <Card className="wb-inline-tool" title="手动添加磁力"><Form form={magnetForm} layout="vertical" onFinish={addMagnets}><Form.Item name="magnets" label="每行一个 magnet 链接" rules={[{ required: true }]}><Input.TextArea rows={4} /></Form.Item><Button type="primary" htmlType="submit">添加到 Aria2</Button></Form></Card> : null}
    <div className="wb-download-layout">
      <Card className="wb-control-panel" title={<Space><span>Aria2 连接</span><StatusDot ready={connections.aria2_connected}>{connections.aria2_connected ? "已连接" : "未连接"}</StatusDot></Space>}>
        <Form form={form} layout="vertical" onFinish={connect} initialValues={{ url: clientConfig.aria2?.url || "http://127.0.0.1:6800/jsonrpc" }}><Form.Item name="url" label="JSON-RPC 地址" rules={[{ required: true }]}><Input /></Form.Item><Form.Item name="secret" label="RPC Secret"><Input.Password placeholder={clientConfig.aria2?.has_secret ? "已配置，留空不会覆盖" : "可选"} /></Form.Item><Button type="primary" block htmlType="submit" loading={loading}>连接当前会话</Button>{clientConfig.aria2?.configured ? <Button className="wb-submit" block onClick={connectConfigured}>使用服务端配置</Button> : null}</Form>
      </Card>
      <section className="wb-work-surface"><div className="wb-surface-head"><div><strong>传输任务</strong><Text type="secondary">{downloads.length} 个任务 · {formatBytes(totalSpeed)}/s{aria2Status.version?.version ? ` · Aria2 ${aria2Status.version.version}` : ""}</Text></div><Segmented value={statusFilter} onChange={setStatusFilter} options={[{ label: "全部", value: "all" }, { label: "下载中", value: "active" }, { label: "暂停", value: "paused" }, { label: "完成", value: "complete" }, { label: "错误", value: "error" }]} /></div>
        {connections.aria2_connected ? <Table rowKey="gid" dataSource={visible} scroll={{ x: 900 }} columns={[
          { title: "名称", ellipsis: true, render: (_, record) => record.name || record.files?.[0]?.path?.split(/[/\\]/).pop() || record.gid },
          { title: "进度", width: 220, render: (_, record) => { const total = Number(record.totalLength || record.total_length || 0); const done = Number(record.completedLength || record.completed_length || 0); return <Progress percent={total ? Math.round(done / total * 100) : 0} size="small" />; } },
          { title: "速度", width: 120, render: (_, record) => `${formatBytes(record.downloadSpeed || record.download_speed)}/s` },
          { title: "状态", width: 100, dataIndex: "status", render: value => <Tag color={value === "active" ? "green" : value === "error" ? "red" : "default"}>{value || "unknown"}</Tag> },
          { title: "操作", width: 230, render: (_, record) => <Space>{record.status === "paused" ? <Button type="text" onClick={() => act("resume", record.gid)}>继续</Button> : <Button type="text" disabled={["complete", "error", "removed"].includes(record.status)} onClick={() => act("pause", record.gid)}>暂停</Button>}<Popconfirm title="从 Aria2 移除这个任务？" onConfirm={() => act("remove", record.gid)}><Button type="text" danger>移除</Button></Popconfirm></Space> },
        ]} /> : <EmptyBlock title="先连接 Aria2" description="连接当前会话，或使用已经保存的服务端配置。" />}
      </section>
    </div>
  </div>;
}
