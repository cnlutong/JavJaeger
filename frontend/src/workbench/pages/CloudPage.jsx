import { api, formData, formatBytes } from "../api.js";
import { EmptyBlock, PageIntro, StatusDot } from "../ui.jsx";

const React = window.React;
const { Alert, Button, Form, Input, InputNumber, Modal, Pagination, Segmented, Space, Switch, Table, Tag, Typography, message } = window.antd;
const { Text } = Typography;
const icons = window.icons || {};

export default function CloudPage({ clientConfig, connections, refreshRuntime, navigate }) {
  const [source, setSource] = React.useState(clientConfig.pan115?.configured ? "pan115" : "webdav");
  const [path, setPath] = React.useState("/");
  const [pathStack, setPathStack] = React.useState([]);
  const [files, setFiles] = React.useState([]);
  const [selected, setSelected] = React.useState([]);
  const [loading, setLoading] = React.useState(false);
  const [connectOpen, setConnectOpen] = React.useState(false);
  const [panOpen, setPanOpen] = React.useState(false);
  const [pan115Status, setPan115Status] = React.useState({});
  const [qrSession, setQrSession] = React.useState(null);
  const [offset, setOffset] = React.useState(0);
  const [total, setTotal] = React.useState(0);
  const [videoOnly, setVideoOnly] = React.useState(true);
  const [minSize, setMinSize] = React.useState(300);
  const [dispatchResults, setDispatchResults] = React.useState([]);
  const [connectForm] = Form.useForm();
  const [cookieForm] = Form.useForm();
  const pageSize = 100;

  const refresh115 = React.useCallback(async () => {
    try { setPan115Status(await api("/api/115/status")); } catch { setPan115Status({ connected: false }); }
  }, []);
  React.useEffect(() => { void refresh115(); }, [refresh115]);
  React.useEffect(() => {
    if (!qrSession?.session_id || ["allowed", "expired", "canceled"].includes(qrSession.state)) return undefined;
    const timer = window.setInterval(async () => {
      try {
        const result = await api(`/api/115/qrcode/${encodeURIComponent(qrSession.session_id)}/status`);
        setQrSession(current => ({ ...current, ...result }));
        if (result.configured && result.state === "allowed") { await refresh115(); await refreshRuntime(); message.success("115 扫码登录成功"); }
      } catch (error) { setQrSession(current => ({ ...current, state: "expired", message: error.message })); }
    }, 2000);
    return () => window.clearInterval(timer);
  }, [qrSession?.session_id, qrSession?.state, refresh115, refreshRuntime]);

  const ready = source === "webdav" ? connections.webdav_connected : source === "pan115" ? !!(pan115Status.connected || clientConfig.pan115?.configured) : true;

  const load = React.useCallback(async (nextPath, nextSource, nextOffset = 0) => {
    setLoading(true); setSelected([]);
    try {
      let payload;
      if (nextSource === "pan115") payload = await api(`/api/115/files?cid=${encodeURIComponent(nextPath === "/" ? "0" : nextPath)}&offset=${nextOffset}&limit=${pageSize}`);
      else if (nextSource === "local") payload = await api(`/api/system/files?path=${encodeURIComponent(nextPath)}`);
      else payload = await api(`/api/webdav/files?path=${encodeURIComponent(nextPath)}`);
      const rows = payload.files || payload.items || payload.entries || payload.data || [];
      setFiles(rows.map((item, index) => ({
        ...item, _key: item.path || item.pick_code || item.id || item.cid || index,
        name: item.name || item.n || item.file_name || "未命名",
        path: item.path || item.id || item.cid || item.file_id || item.pick_code || "",
        is_directory: item.is_directory ?? item.is_dir ?? item.isdir ?? item.kind === "folder",
        size: Number(item.size || item.s || 0), source_type: nextSource === "pan115" ? "pan115" : nextSource === "local" ? "local" : "webdav",
        pick_code: item.pick_code || item.pc || "",
      })));
      setPath(payload.current_path || payload.cid || nextPath); setOffset(nextOffset); setTotal(Number(payload.count || rows.length));
    } catch (error) { if (nextSource !== "local") message.error(error.message); setFiles([]); }
    finally { setLoading(false); }
  }, []);

  React.useEffect(() => { if (ready) void load(source === "pan115" ? "0" : "/", source, 0); else setFiles([]); }, [source, ready, load]);
  const changeSource = value => { setSource(value); setPath(value === "pan115" ? "0" : "/"); setPathStack([]); setOffset(0); };
  const openFolder = record => {
    if (!record.is_directory) return;
    if (source === "pan115") setPathStack(stack => [...stack, path]);
    void load(record.path, source, 0);
  };
  const goUp = () => {
    if (source === "pan115") {
      const parent = pathStack.at(-1) || "0"; setPathStack(stack => stack.slice(0, -1)); return load(parent, source, 0);
    }
    const parent = path.replace(/[/\\]+$/, "").split(/[/\\]/).slice(0, -1).join("/") || "/";
    return load(parent, source, 0);
  };

  const connect = async values => {
    setLoading(true);
    try {
      const result = await api("/api/webdav/connect", { method: "POST", body: formData({ webdav_url: values.url, username: values.username, password: values.password }) });
      if (!result.success) throw new Error(result.message || "WebDAV 连接失败");
      connectForm.setFieldValue("password", ""); setConnectOpen(false); await refreshRuntime(); await load("/", "webdav"); message.success("WebDAV 已连接到当前会话");
    } catch (error) { message.error(error.message); }
    finally { setLoading(false); }
  };
  const connectConfigured = async () => {
    try { const result = await api("/api/webdav/connect-config", { method: "POST" }); if (!result.success) throw new Error(result.message); await refreshRuntime(); await load("/", "webdav"); }
    catch (error) { message.error(error.message); }
  };
  const startQrLogin = async () => {
    try { setQrSession(await api("/api/115/qrcode/start", { method: "POST", body: JSON.stringify({ app: clientConfig.pan115?.login_app || "wechatmini" }) })); }
    catch (error) { message.error(error.message); }
  };
  const saveCookie = async values => {
    try { await api("/api/115/cookie", { method: "POST", body: JSON.stringify({ cookie: values.cookie, enabled: true }) }); cookieForm.resetFields(); await refresh115(); await refreshRuntime(); message.success("115 Cookie 已验证并保存"); }
    catch (error) { message.error(error.message); }
  };
  const dispatch = async () => {
    if (!connections.aria2_connected) return message.warning("请先在下载页连接 Aria2");
    const chosen = files.filter(file => selected.includes(file._key));
    try {
      const result = await api("/api/webdav/download", { method: "POST", body: JSON.stringify({ files: chosen, video_filter: videoOnly, min_file_size_mb: minSize }) });
      setDispatchResults(result.results || []); setSelected([]);
      const success = (result.results || []).filter(item => item.success).length; message.success(`已发送 ${success}/${chosen.length} 项到 Aria2`);
    } catch (error) { message.error(error.message); }
  };

  return <div className="wb-page">
    <PageIntro title="云端文件" description="连接并浏览 WebDAV、115 网盘和服务端目录，再把选中资源派发到当前会话的 Aria2。" actions={[<Button key="webdav" onClick={() => setConnectOpen(true)}>连接 WebDAV</Button>, <Button key="pan115" onClick={() => setPanOpen(true)}>115 登录</Button>, <Button key="downloads" type="text" onClick={() => navigate("downloads")}>打开下载队列</Button>]} />
    <div className="wb-cloud-sources"><Segmented value={source} onChange={changeSource} options={[{ label: "WebDAV", value: "webdav" }, { label: "115 网盘", value: "pan115" }, { label: "服务端文件", value: "local" }]} /><StatusDot ready={ready}>{ready ? "已连接" : "未连接"}</StatusDot><StatusDot ready={connections.aria2_connected}>Aria2 {connections.aria2_connected ? "已就绪" : "未连接"}</StatusDot></div>
    <section className="wb-file-browser"><div className="wb-browser-toolbar"><Space><Button type="text" icon={icons.ArrowUpOutlined ? <icons.ArrowUpOutlined /> : null} onClick={goUp} disabled={(source === "pan115" && !pathStack.length) || (source !== "pan115" && path === "/")}>上一级</Button><Text code>{path}</Text></Space><Space wrap><Space><Switch checked={videoOnly} onChange={setVideoOnly} /><Text>仅视频</Text></Space><InputNumber value={minSize} onChange={value => setMinSize(value || 0)} min={0} addonAfter="MB" /><Button type="primary" onClick={dispatch} disabled={!selected.length || source === "local"}>发送所选 {selected.length || ""}</Button></Space></div>
      {ready ? <><Table rowKey="_key" loading={loading} dataSource={files} pagination={false} rowSelection={{ selectedRowKeys: selected, onChange: setSelected, getCheckboxProps: () => ({ disabled: source === "local" }) }} onRow={record => ({ onDoubleClick: () => openFolder(record) })} columns={[{ title: "名称", dataIndex: "name", render: (value, record) => <Button type="link" className="wb-file-name" disabled={!record.is_directory} onClick={() => openFolder(record)}>{value}</Button> }, { title: "类型", width: 100, render: (_, record) => record.is_directory ? <Tag>目录</Tag> : <Tag color="blue">文件</Tag> }, { title: "大小", dataIndex: "size", width: 120, render: value => formatBytes(value) }]} />{source === "pan115" && total > pageSize ? <Pagination current={Math.floor(offset / pageSize) + 1} pageSize={pageSize} total={total} showSizeChanger={false} onChange={page => load(path, source, (page - 1) * pageSize)} /> : null}</> : <EmptyBlock title={`${source === "pan115" ? "115 网盘" : "WebDAV"} 未连接`} description="使用服务端配置，或在当前页面完成登录。" />}
    </section>

    <Modal title="连接 WebDAV" open={connectOpen} onCancel={() => setConnectOpen(false)} footer={null}><Form form={connectForm} layout="vertical" onFinish={connect} initialValues={{ url: clientConfig.webdav?.url || "", username: clientConfig.webdav?.username || "" }}><Form.Item name="url" label="WebDAV 地址" rules={[{ required: true }]}><Input /></Form.Item><Form.Item name="username" label="用户名"><Input autoComplete="username" /></Form.Item><Form.Item name="password" label="密码"><Input.Password autoComplete="current-password" /></Form.Item><Button type="primary" block htmlType="submit" loading={loading}>连接当前会话</Button>{clientConfig.webdav?.configured ? <Button className="wb-submit" block onClick={connectConfigured}>使用服务端配置</Button> : null}</Form></Modal>
    <Modal title="115 登录" open={panOpen} onCancel={() => setPanOpen(false)} footer={null}><Alert type={pan115Status.connected ? "success" : "warning"} showIcon message={pan115Status.connected ? `已连接${pan115Status.uid ? ` · ${pan115Status.uid}` : ""}` : "扫码登录或粘贴 Cookie"} /><Button className="wb-submit" type="primary" block onClick={startQrLogin}>生成登录二维码</Button>{qrSession ? <div className="wb-qr-login"><img src={qrSession.qrcode_image_url} alt="115 登录二维码" /><Text>{qrSession.message || qrSession.state}</Text></div> : null}<Form form={cookieForm} layout="vertical" onFinish={saveCookie}><Form.Item name="cookie" label="115 Cookie" rules={[{ required: true }]}><Input.Password /></Form.Item><Button block htmlType="submit">验证并保存 Cookie</Button></Form></Modal>
    <Modal title="派发结果" open={dispatchResults.length > 0} onCancel={() => setDispatchResults([])} footer={<Button onClick={() => setDispatchResults([])}>关闭</Button>} width={760}><Table rowKey={(item, index) => item.gid || item.filename || index} pagination={false} dataSource={dispatchResults} columns={[{ title: "文件", dataIndex: "filename", ellipsis: true }, { title: "状态", render: (_, item) => item.success ? <Tag color="green">成功</Tag> : item.skipped ? <Tag color="orange">跳过</Tag> : <Tag color="red">失败</Tag> }, { title: "说明", dataIndex: "message", ellipsis: true }, { title: "GID", dataIndex: "gid", ellipsis: true }]} /></Modal>
  </div>;
}
