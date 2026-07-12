import { api } from "../api.js";
import { PageIntro, StatusDot } from "../ui.jsx";

const React = window.React;
const { Alert, Button, Card, Collapse, Descriptions, Drawer, Form, Input, InputNumber, Modal, Select, Space, Switch, Table, Tag, Typography, message } = window.antd;
const { Text } = Typography;

const PROVIDER_LABELS = {
  javbus: "JavBus", r18dev: "R18.dev", dmm: "DMM", libredmm: "LibreDMM", javlibrary: "JAVLibrary", javdb: "JavDB", jav321: "JAV321", mgstage: "MGStage", tokyohot: "TokyoHot", aventertainment: "AVEntertainment", dlgetchu: "DLGetchu", caribbeancom: "Caribbeancom", fc2: "FC2", javstash: "JavStash",
};

function cleanSection(value, secrets = []) {
  const next = { ...(value || {}) };
  secrets.forEach(key => { if (!next[key]) delete next[key]; });
  Object.keys(next).forEach(key => { if (key.startsWith("has_")) delete next[key]; });
  return next;
}

export default function SettingsPage({ refreshRuntime }) {
  const [settings, setSettings] = React.useState(null);
  const [diagnostics, setDiagnostics] = React.useState(null);
  const [diagnosticsOpen, setDiagnosticsOpen] = React.useState(false);
  const [testOpen, setTestOpen] = React.useState(false);
  const [scraperResults, setScraperResults] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [form] = Form.useForm();
  const [testForm] = Form.useForm();

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const [payload, info] = await Promise.all([api("/api/system/settings"), api("/api/system/info")]);
      setSettings(payload);
      setDiagnostics(info);
      form.setFieldsValue(payload);
    } catch (error) { message.error(error.message); }
    finally { setLoading(false); }
  }, [form]);

  React.useEffect(() => { void load(); }, [load]);

  const save = async values => {
    const scrapers = {};
    Object.keys(PROVIDER_LABELS).forEach(provider => {
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
      magnet_health: cleanSection(values.magnet_health),
    };
    setLoading(true);
    try {
      const result = await api("/api/system/settings", { method: "PUT", body: JSON.stringify(payload) });
      setSettings(result);
      form.setFieldsValue(result);
      await refreshRuntime();
      message.success("设置已保存并热更新");
    } catch (error) { message.error(error.message); }
    finally { setLoading(false); }
  };

  const saveJavbus = async () => {
    try {
      const result = await api("/api/system/settings/javbus", { method: "PUT", body: JSON.stringify({ javbus: cleanSection(form.getFieldValue("javbus")) }) });
      setSettings(result); form.setFieldsValue(result);
      message.success("JavBus 设置已热更新");
    } catch (error) { message.error(error.message); }
  };

  const testScrapers = async values => {
    setLoading(true);
    try {
      const result = await api("/api/movies/metadata-scrapers/test", { method: "POST", body: JSON.stringify({ providers: values.providers, movie_ids: values.movie_ids ? JSON.parse(values.movie_ids) : null, concurrent: values.concurrent, apply_results: false }) });
      setScraperResults(result.results || []);
    } catch (error) { message.error(error.message); }
    finally { setLoading(false); }
  };

  const applyScraperResults = async () => {
    try {
      await api("/api/movies/metadata-scrapers/apply-test-results", { method: "POST", body: JSON.stringify({ results: scraperResults }) });
      message.success("测试结果已应用到刮削源配置"); setTestOpen(false); await load();
    } catch (error) { message.error(error.message); }
  };

  const providerItems = Object.entries(PROVIDER_LABELS).map(([provider, label]) => ({
    key: provider,
    label: <Space><span>{label}</span>{settings?.scrapers?.[provider]?.enabled ? <Tag color="green">启用</Tag> : <Tag>停用</Tag>}</Space>,
    children: <div className="wb-provider-form">
      <Form.Item name={["scrapers", provider, "enabled"]} label="启用" valuePropName="checked"><Switch /></Form.Item>
      <Form.Item name={["scrapers", provider, "language"]} label="语言"><Select options={[{ label: "中文", value: "zh" }, { label: "简中", value: "cn" }, { label: "日文", value: "ja" }, { label: "英文", value: "en" }]} /></Form.Item>
      <Form.Item name={["scrapers", provider, "request_delay"]} label="请求间隔"><InputNumber min={0} max={60000} addonAfter="ms" /></Form.Item>
      {provider === "javbus" || provider === "javstash" ? <Form.Item name={["scrapers", provider, "base_url"]} label="服务地址"><Input /></Form.Item> : null}
      {provider === "javstash" ? <Form.Item name={["scrapers", provider, "api_key"]} label="API Key"><Input.Password placeholder={settings?.scrapers?.javstash?.has_api_key ? "已配置，留空不会覆盖" : "可选"} /></Form.Item> : null}
    </div>,
  }));

  return (
    <div className="wb-page">
      <PageIntro
        title="系统设置"
        description="敏感字段只显示是否已配置；留空保存不会覆盖已有密码、Cookie 或 Secret。"
        actions={[<Button key="diagnostics" onClick={() => setDiagnosticsOpen(true)}>系统诊断</Button>, <Button key="test" onClick={() => setTestOpen(true)}>测试刮削源</Button>, <Button key="reload" type="text" onClick={load} loading={loading}>重新读取</Button>, <Button key="save" type="primary" onClick={() => form.submit()} loading={loading}>保存全部设置</Button>]}
      />

      {settings?.security?.using_default_session_secret ? <Alert type="warning" showIcon message="当前仍在使用默认会话密钥" description="生产部署请设置 APP_SESSION_SECRET 或 config.session_secret。" /> : null}

      <Form form={form} layout="vertical" onFinish={save} className="wb-settings-form">
        <Card title="JavBus 与缓存" extra={<Button type="text" onClick={saveJavbus}>仅热更新 JavBus</Button>}>
          <div className="wb-settings-grid">
            <Form.Item name={["javbus", "base_url"]} label="JavBus 地址"><Input /></Form.Item>
            <Form.Item name={["javbus", "proxy"]} label="代理"><Input placeholder="http://127.0.0.1:7890" /></Form.Item>
            <Form.Item name={["javbus", "timeout_seconds"]} label="请求超时"><InputNumber min={1} max={60} addonAfter="秒" /></Form.Item>
            <Form.Item name={["javbus", "request_interval_seconds"]} label="请求间隔"><InputNumber min={0} max={10} step={0.1} addonAfter="秒" /></Form.Item>
            <Form.Item name={["javbus", "cache_expire_seconds"]} label="缓存有效期"><InputNumber min={0} max={86400} addonAfter="秒" /></Form.Item>
            <Form.Item name={["javbus", "cache_max_size"]} label="最大缓存项"><InputNumber min={1} max={100000} /></Form.Item>
            <Form.Item name={["javbus", "image_retry_attempts"]} label="图片重试次数"><InputNumber min={0} max={10} /></Form.Item>
            <Form.Item name={["javbus", "image_retry_backoff_seconds"]} label="图片重试退避"><InputNumber min={0} max={10} step={0.05} addonAfter="秒" /></Form.Item>
          </div>
        </Card>

        <Card title="下载与网盘服务">
          <div className="wb-service-settings">
            <section>
              <div className="wb-service-title"><strong>WebDAV</strong><StatusDot ready={settings?.webdav?.has_password}>密码{settings?.webdav?.has_password ? "已配置" : "未配置"}</StatusDot></div>
              <Form.Item name={["webdav", "enabled"]} label="启用" valuePropName="checked"><Switch /></Form.Item>
              <Form.Item name={["webdav", "url"]} label="地址"><Input /></Form.Item>
              <Form.Item name={["webdav", "username"]} label="用户名"><Input /></Form.Item>
              <Form.Item name={["webdav", "password"]} label="密码"><Input.Password placeholder="留空不会覆盖" /></Form.Item>
              <Form.Item name={["webdav", "auto_connect"]} label="自动连接" valuePropName="checked"><Switch /></Form.Item>
            </section>
            <section>
              <div className="wb-service-title"><strong>Aria2</strong><StatusDot ready={settings?.aria2?.has_secret}>Secret {settings?.aria2?.has_secret ? "已配置" : "未配置"}</StatusDot></div>
              <Form.Item name={["aria2", "enabled"]} label="启用" valuePropName="checked"><Switch /></Form.Item>
              <Form.Item name={["aria2", "url"]} label="RPC 地址"><Input /></Form.Item>
              <Form.Item name={["aria2", "secret"]} label="RPC Secret"><Input.Password placeholder="留空不会覆盖" /></Form.Item>
              <Form.Item name={["aria2", "auto_connect"]} label="自动连接" valuePropName="checked"><Switch /></Form.Item>
            </section>
            <section>
              <div className="wb-service-title"><strong>PikPak</strong><StatusDot ready={settings?.pikpak?.has_password}>密码{settings?.pikpak?.has_password ? "已配置" : "未配置"}</StatusDot></div>
              <Form.Item name={["pikpak", "enabled"]} label="启用" valuePropName="checked"><Switch /></Form.Item>
              <Form.Item name={["pikpak", "username"]} label="用户名"><Input /></Form.Item>
              <Form.Item name={["pikpak", "password"]} label="密码"><Input.Password placeholder="留空不会覆盖" /></Form.Item>
              <Form.Item name={["pikpak", "auto_login"]} label="自动登录" valuePropName="checked"><Switch /></Form.Item>
            </section>
            <section>
              <div className="wb-service-title"><strong>115 网盘</strong><StatusDot ready={settings?.pan115?.has_cookie}>Cookie {settings?.pan115?.has_cookie ? "已配置" : "未配置"}</StatusDot></div>
              <Form.Item name={["pan115", "enabled"]} label="启用" valuePropName="checked"><Switch /></Form.Item>
              <Form.Item name={["pan115", "cookie"]} label="Cookie"><Input.Password placeholder="留空不会覆盖" /></Form.Item>
              <Form.Item name={["pan115", "save_dir_id"]} label="保存目录 ID"><Input /></Form.Item>
              <Form.Item name={["pan115", "login_app"]} label="扫码登录应用"><Select options={[{ label: "微信小程序", value: "wechatmini" }, { label: "115 Android", value: "android" }, { label: "115 iOS", value: "ios" }, { label: "115 Web", value: "web" }]} /></Form.Item>
              <Form.Item name={["pan115", "batch_size"]} label="批量大小"><InputNumber min={1} max={50} /></Form.Item>
              <Form.Item name={["pan115", "batch_interval_seconds"]} label="批次间隔"><InputNumber min={0} max={600} addonAfter="秒" /></Form.Item>
              <Form.Item name={["pan115", "jitter_seconds"]} label="随机抖动"><InputNumber min={0} max={120} addonAfter="秒" /></Form.Item>
            </section>
          </div>
        </Card>

        <Card title="磁力健康度">
          <div className="wb-settings-grid">
            <Form.Item name={["magnet_health", "enabled"]} label="启用健康度筛选" valuePropName="checked"><Switch /></Form.Item>
            <Form.Item name={["magnet_health", "probe_with_aria2"]} label="用 Aria2 探测" valuePropName="checked"><Switch /></Form.Item>
            <Form.Item name={["magnet_health", "min_seeders"]} label="最少做种"><InputNumber min={0} /></Form.Item>
            <Form.Item name={["magnet_health", "min_peers"]} label="最少连接"><InputNumber min={0} /></Form.Item>
            <Form.Item name={["magnet_health", "min_availability"]} label="最低可用度"><InputNumber min={0} step={0.1} /></Form.Item>
            <Form.Item name={["magnet_health", "min_score"]} label="最低健康分"><InputNumber min={0} step={0.1} /></Form.Item>
            <Form.Item name={["magnet_health", "probe_timeout_seconds"]} label="探测超时"><InputNumber min={1} max={120} addonAfter="秒" /></Form.Item>
            <Form.Item name={["magnet_health", "allow_unknown"]} label="允许未知健康度" valuePropName="checked"><Switch /></Form.Item>
          </div>
        </Card>

        <Card title="元数据刮削源"><Form.Item name={["scrapers", "priority"]} label="刮削优先级"><Select mode="multiple" options={Object.entries(PROVIDER_LABELS).map(([value, label]) => ({ value, label }))} /></Form.Item><Collapse items={providerItems} /></Card>
      </Form>

      <Drawer title="系统诊断" open={diagnosticsOpen} onClose={() => setDiagnosticsOpen(false)} width={720}>
        {diagnostics ? <Descriptions bordered column={1} items={[
          { key: "version", label: "版本", children: diagnostics.version?.version },
          { key: "build", label: "构建日期", children: diagnostics.version?.build_date },
          { key: "python", label: "Python", children: diagnostics.python_version },
          { key: "platform", label: "平台", children: diagnostics.platform },
          { key: "host", label: "主机", children: diagnostics.hostname },
          { key: "javbus", label: "JavBus", children: diagnostics.javbus_base_url },
          { key: "cache", label: "缓存项", children: diagnostics.cache_size },
          { key: "history", label: "下载记录", children: diagnostics.downloaded_movies_count },
        ]} /> : null}
      </Drawer>

      <Modal title="测试元数据刮削源" open={testOpen} onCancel={() => setTestOpen(false)} footer={null} width={900}>
        <Form form={testForm} layout="vertical" onFinish={testScrapers} initialValues={{ providers: settings?.scrapers?.priority || [], concurrent: 3 }}>
          <Form.Item name="providers" label="测试来源" rules={[{ required: true }]}><Select mode="multiple" options={Object.entries(PROVIDER_LABELS).map(([value, label]) => ({ value, label }))} /></Form.Item>
          <Form.Item name="movie_ids" label="测试番号映射（JSON，可留空）"><Input.TextArea rows={3} placeholder={'{"javbus":"ABP-123","dmm":"abp00123"}'} /></Form.Item>
          <Form.Item name="concurrent" label="并发数"><InputNumber min={1} max={10} /></Form.Item>
          <Button type="primary" htmlType="submit" loading={loading}>开始测试</Button>
        </Form>
        {scraperResults.length ? <><Table rowKey={(record, index) => record.provider || index} pagination={false} dataSource={scraperResults} columns={[{ title: "来源", dataIndex: "provider" }, { title: "状态", render: (_, record) => record.success ? <Tag color="green">成功</Tag> : <Tag color="red">失败</Tag> }, { title: "耗时", dataIndex: "elapsed_ms", render: value => value ? `${value} ms` : "—" }, { title: "说明", dataIndex: "message", ellipsis: true }]} /><Button className="wb-submit" onClick={applyScraperResults}>应用测试结果</Button></> : null}
      </Modal>
    </div>
  );
}
