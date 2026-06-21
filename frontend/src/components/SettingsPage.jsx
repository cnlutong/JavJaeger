import { fetchSystemSettings, updateSystemSettings } from "../utils/api.js";

const React = window.React;
const antd = window.antd;
const icons = window.icons || {};

const {
    Alert,
    Button,
    Card,
    Col,
    Form,
    Input,
    InputNumber,
    Row,
    Select,
    Space,
    Spin,
    Switch,
    Tag,
    Typography,
    message,
} = antd;
const { Title, Text } = Typography;
const {
    ApiOutlined,
    CloudOutlined,
    CloudServerOutlined,
    LoginOutlined,
    ReloadOutlined,
    SafetyCertificateOutlined,
    SaveOutlined,
    SettingOutlined,
} = icons;

const Icon = ({ as: Component }) => Component ? <Component /> : null;

const SCRAPER_OPTIONS = [
    { value: "javbus", label: "JavBus" },
    { value: "r18dev", label: "r18dev" },
    { value: "dmm", label: "DMM" },
    { value: "libredmm", label: "LibreDMM" },
    { value: "javlibrary", label: "JavLibrary" },
    { value: "javdb", label: "JavDB" },
    { value: "jav321", label: "Jav321" },
    { value: "mgstage", label: "MGStage" },
    { value: "tokyohot", label: "TokyoHot" },
    { value: "aventertainment", label: "AVEntertainment" },
    { value: "dlgetchu", label: "DL.Getchu" },
    { value: "caribbeancom", label: "Caribbeancom" },
    { value: "fc2", label: "FC2" },
    { value: "javstash", label: "JavStash" },
];

const SCRAPER_LANGUAGE_OPTIONS = [
    { value: "zh", label: "zh" },
    { value: "cn", label: "cn" },
    { value: "tw", label: "tw" },
    { value: "ja", label: "ja" },
    { value: "en", label: "en" },
];

const withSecretPlaceholders = (payload = {}) => ({
    javbus: payload.javbus || {},
    scrapers: {
        ...(payload.scrapers || {}),
        javstash: { ...(payload.scrapers?.javstash || {}), api_key: "" },
    },
    webdav: { ...(payload.webdav || {}), password: "" },
    aria2: { ...(payload.aria2 || {}), secret: "" },
    pikpak: { ...(payload.pikpak || {}), password: "" },
    pan115: { ...(payload.pan115 || {}), cookie: "" },
});

const buildSettingsPayload = (values = {}) => {
    const payload = {
        javbus: { ...(values.javbus || {}) },
        scrapers: { ...(values.scrapers || {}) },
        webdav: { ...(values.webdav || {}) },
        aria2: { ...(values.aria2 || {}) },
        pikpak: { ...(values.pikpak || {}) },
        pan115: { ...(values.pan115 || {}) },
    };

    if (!payload.webdav.password) {
        delete payload.webdav.password;
    }
    if (!payload.aria2.secret) {
        delete payload.aria2.secret;
    }
    if (!payload.pikpak.password) {
        delete payload.pikpak.password;
    }
    if (!payload.pan115.cookie) {
        delete payload.pan115.cookie;
    }
    payload.scrapers.javstash = { ...(payload.scrapers.javstash || {}) };
    if (!payload.scrapers.javstash.api_key) {
        delete payload.scrapers.javstash.api_key;
    }

    return payload;
};

export default function SettingsPage() {
    const [form] = Form.useForm();
    const [loading, setLoading] = React.useState(true);
    const [saving, setSaving] = React.useState(false);
    const [settings, setSettings] = React.useState(null);

    const loadSettings = async () => {
        setLoading(true);
        try {
            const payload = await fetchSystemSettings();
            setSettings(payload);
            form.setFieldsValue(withSecretPlaceholders(payload));
        } catch (error) {
            message.error("加载设置失败");
        } finally {
            setLoading(false);
        }
    };

    React.useEffect(() => {
        loadSettings();
    }, []);

    const saveSettings = async (values) => {
        setSaving(true);
        try {
            const payload = await updateSystemSettings(buildSettingsPayload(values));
            setSettings(payload);
            form.setFieldsValue(withSecretPlaceholders(payload));
            message.success("设置已保存");
        } catch (error) {
            message.error("保存设置失败，请检查输入值");
        } finally {
            setSaving(false);
        }
    };

    const resetForm = () => {
        form.setFieldsValue(withSecretPlaceholders(settings || {}));
    };

    const envOverrides = settings?.environment_overrides?.javbus || {};
    const hasEnvOverrides = Object.values(envOverrides).some(Boolean);
    const security = settings?.security || {};

    return (
        <div className="webdav-page">
            <div className="webdav-page-header">
                <div>
                    <Title level={3} style={{ marginBottom: 4 }}>设置</Title>
                    <Text type="secondary">按类别管理可热更新的运行配置</Text>
                </div>
                <Space>
                    {hasEnvOverrides && <Tag color="warning">环境变量覆盖中</Tag>}
                    <Button icon={<Icon as={ReloadOutlined} />} onClick={loadSettings} loading={loading}>
                        刷新
                    </Button>
                </Space>
            </div>

            <Spin spinning={loading}>
                <Form form={form} layout="vertical" onFinish={saveSettings}>
                    <Row gutter={[24, 24]}>
                        <Col xs={24} xl={14}>
                            <Card className="webdav-connection-card" title={<><Icon as={ApiOutlined} /> JavBus API</>}>
                                {hasEnvOverrides && (
                                    <Alert
                                        showIcon
                                        type="warning"
                                        style={{ marginBottom: 16 }}
                                        message="部分字段正由环境变量覆盖，保存到 config.json 后需移除对应环境变量才会生效。"
                                    />
                                )}
                                <Form.Item
                                    name={["javbus", "base_url"]}
                                    label="Base URL"
                                    rules={[{ required: true, message: "请输入 API 基础地址" }]}
                                    extra={envOverrides.base_url ? "JAVBUS_BASE_URL 正在覆盖此字段" : null}
                                >
                                    <Input placeholder="https://www.javbus.com" autoComplete="url" />
                                </Form.Item>

                                <Form.Item
                                    name={["javbus", "proxy"]}
                                    label="代理"
                                    extra={envOverrides.proxy ? "JAVBUS_PROXY 正在覆盖此字段" : "支持 http、https、socks5、socks5h；留空表示不使用代理"}
                                >
                                    <Input placeholder="http://127.0.0.1:7890" autoComplete="off" />
                                </Form.Item>

                                <Row gutter={16}>
                                    <Col xs={24} md={12}>
                                        <Form.Item name={["javbus", "timeout_seconds"]} label="请求超时（秒）" rules={[{ required: true, message: "请输入请求超时" }]}>
                                            <InputNumber min={1} max={60} step={1} style={{ width: "100%" }} />
                                        </Form.Item>
                                    </Col>
                                    <Col xs={24} md={12}>
                                        <Form.Item
                                            name={["javbus", "request_interval_seconds"]}
                                            label="请求间隔（秒）"
                                            rules={[{ required: true, message: "请输入请求间隔" }]}
                                            extra={envOverrides.request_interval_seconds ? "JAVBUS_REQUEST_INTERVAL_SECONDS 正在覆盖此字段" : null}
                                        >
                                            <InputNumber min={0} max={10} step={0.05} precision={2} style={{ width: "100%" }} />
                                        </Form.Item>
                                    </Col>
                                </Row>

                                <Row gutter={16}>
                                    <Col xs={24} md={12}>
                                        <Form.Item name={["javbus", "cache_expire_seconds"]} label="缓存有效期（秒）" rules={[{ required: true, message: "请输入缓存有效期" }]}>
                                            <InputNumber min={0} max={86400} step={60} style={{ width: "100%" }} />
                                        </Form.Item>
                                    </Col>
                                    <Col xs={24} md={12}>
                                        <Form.Item name={["javbus", "cache_max_size"]} label="缓存容量" rules={[{ required: true, message: "请输入缓存容量" }]}>
                                            <InputNumber min={1} max={100000} step={100} style={{ width: "100%" }} />
                                        </Form.Item>
                                    </Col>
                                </Row>

                                <Row gutter={16}>
                                    <Col xs={24} md={12}>
                                        <Form.Item
                                            name={["javbus", "image_retry_attempts"]}
                                            label="图片下载重试次数"
                                            rules={[{ required: true, message: "请输入图片下载重试次数" }]}
                                        >
                                            <InputNumber min={1} max={10} step={1} precision={0} style={{ width: "100%" }} />
                                        </Form.Item>
                                    </Col>
                                    <Col xs={24} md={12}>
                                        <Form.Item
                                            name={["javbus", "image_retry_backoff_seconds"]}
                                            label="图片重试退避（秒）"
                                            rules={[{ required: true, message: "请输入图片重试退避" }]}
                                            extra="第 2 次起按该值递增等待；设为 0 表示不等待"
                                        >
                                            <InputNumber min={0} max={10} step={0.05} precision={2} style={{ width: "100%" }} />
                                        </Form.Item>
                                    </Col>
                                </Row>
                            </Card>
                        </Col>

                        <Col xs={24} xl={14}>
                            <Card className="webdav-connection-card" title={<><Icon as={SettingOutlined} /> 刮削员</>}>
                                <Form.Item
                                    name={["scrapers", "priority"]}
                                    label="Priority"
                                    extra="Inspired by javinizer-go: enabled providers are tried in this order."
                                >
                                    <Select mode="multiple" options={SCRAPER_OPTIONS} optionFilterProp="label" />
                                </Form.Item>

                                <Space direction="vertical" size="middle" style={{ width: "100%" }}>
                                    {SCRAPER_OPTIONS.map((provider) => (
                                        <div
                                            key={provider.value}
                                            style={{
                                                border: "1px solid #f0f0f0",
                                                borderRadius: 8,
                                                padding: 12,
                                            }}
                                        >
                                            <Space direction="vertical" size="small" style={{ width: "100%" }}>
                                                <Space wrap>
                                                    <Text strong>{provider.label}</Text>
                                                    <Tag color={settings?.scrapers?.[provider.value]?.implemented ? "success" : "default"}>
                                                        {settings?.scrapers?.[provider.value]?.implemented ? "active" : "configured"}
                                                    </Tag>
                                                </Space>
                                                <Row gutter={16}>
                                                    <Col xs={24} md={8}>
                                                        <Form.Item name={["scrapers", provider.value, "enabled"]} label="Enabled" valuePropName="checked">
                                                            <Switch />
                                                        </Form.Item>
                                                    </Col>
                                                    <Col xs={24} md={8}>
                                                        <Form.Item name={["scrapers", provider.value, "language"]} label="Language">
                                                            <Select options={SCRAPER_LANGUAGE_OPTIONS} />
                                                        </Form.Item>
                                                    </Col>
                                                    <Col xs={24} md={8}>
                                                        <Form.Item name={["scrapers", provider.value, "request_delay"]} label="Delay ms">
                                                            <InputNumber min={0} max={60000} step={100} precision={0} style={{ width: "100%" }} />
                                                        </Form.Item>
                                                    </Col>
                                                </Row>
                                                <Form.Item name={["scrapers", provider.value, "base_url"]} label="Base URL">
                                                    <Input autoComplete="url" />
                                                </Form.Item>
                                                {provider.value === "javstash" && (
                                                    <Form.Item
                                                        name={["scrapers", "javstash", "api_key"]}
                                                        label="JavStash API Key"
                                                        extra={settings?.scrapers?.javstash?.has_api_key ? "has_api_key: true; leave blank to keep the saved key" : "GraphQL API key is optional unless JavStash is enabled."}
                                                    >
                                                        <Input.Password autoComplete="new-password" />
                                                    </Form.Item>
                                                )}
                                            </Space>
                                        </div>
                                    ))}
                                </Space>
                            </Card>
                        </Col>

                        <Col xs={24} xl={10}>
                            <Card className="webdav-connection-card" title={<><Icon as={SettingOutlined} /> 运行与安全</>}>
                                <Space direction="vertical" size="middle" style={{ width: "100%" }}>
                                    <div>
                                        <Text type="secondary">session_secret</Text>
                                        <div style={{ marginTop: 6 }}>
                                            <Tag color={security.session_secret_configured ? "success" : "warning"}>
                                                {security.session_secret_configured ? "已配置" : "未配置"}
                                            </Tag>
                                            <Tag color={security.using_default_session_secret ? "error" : "success"}>
                                                {security.using_default_session_secret ? "使用默认值" : "非默认值"}
                                            </Tag>
                                        </div>
                                    </div>
                                    <div>
                                        <Text type="secondary">当前 JavBus 请求间隔</Text>
                                        <div><Text strong>{settings?.javbus?.request_interval_seconds ?? "-"} 秒</Text></div>
                                    </div>
                                    <div>
                                        <Text type="secondary">当前 JavBus 缓存容量</Text>
                                        <div><Text strong>{settings?.javbus?.cache_max_size ?? "-"} 条</Text></div>
                                    </div>
                                    <div>
                                        <Text type="secondary">当前图片下载重试</Text>
                                        <div>
                                            <Text strong>
                                                {settings?.javbus?.image_retry_attempts ?? "-"} 次，
                                                退避 {settings?.javbus?.image_retry_backoff_seconds ?? "-"} 秒
                                            </Text>
                                        </div>
                                    </div>
                                    <div>
                                        <Text type="secondary">环境变量覆盖</Text>
                                        <div style={{ marginTop: 6 }}>
                                            {Object.entries(envOverrides).map(([key, active]) => (
                                                <Tag key={key} color={active ? "warning" : "default"}>{key}: {active ? "是" : "否"}</Tag>
                                            ))}
                                        </div>
                                    </div>
                                </Space>
                            </Card>
                        </Col>

                        <Col xs={24} lg={12}>
                            <Card className="webdav-connection-card" title={<><Icon as={CloudOutlined} /> WebDAV</>}>
                                <Row gutter={16}>
                                    <Col xs={24} md={12}>
                                        <Form.Item name={["webdav", "enabled"]} label="启用配置连接" valuePropName="checked">
                                            <Switch />
                                        </Form.Item>
                                    </Col>
                                    <Col xs={24} md={12}>
                                        <Form.Item name={["webdav", "auto_connect"]} label="页面加载后自动连接" valuePropName="checked">
                                            <Switch />
                                        </Form.Item>
                                    </Col>
                                </Row>
                                <Form.Item name={["webdav", "url"]} label="WebDAV 地址">
                                    <Input placeholder="https://dav.example.com/" autoComplete="url" />
                                </Form.Item>
                                <Row gutter={16}>
                                    <Col xs={24} md={12}>
                                        <Form.Item name={["webdav", "username"]} label="用户名">
                                            <Input autoComplete="username" />
                                        </Form.Item>
                                    </Col>
                                    <Col xs={24} md={12}>
                                        <Form.Item
                                            name={["webdav", "password"]}
                                            label="密码"
                                            extra={settings?.webdav?.has_password ? "已保存密码；留空表示保留原值" : "仅在填写时写入 config.json"}
                                        >
                                            <Input.Password autoComplete="new-password" />
                                        </Form.Item>
                                    </Col>
                                </Row>
                            </Card>
                        </Col>

                        <Col xs={24} lg={12}>
                            <Card className="webdav-connection-card" title={<><Icon as={CloudServerOutlined} /> Aria2</>}>
                                <Row gutter={16}>
                                    <Col xs={24} md={12}>
                                        <Form.Item name={["aria2", "enabled"]} label="启用配置连接" valuePropName="checked">
                                            <Switch />
                                        </Form.Item>
                                    </Col>
                                    <Col xs={24} md={12}>
                                        <Form.Item name={["aria2", "auto_connect"]} label="页面加载后自动连接" valuePropName="checked">
                                            <Switch />
                                        </Form.Item>
                                    </Col>
                                </Row>
                                <Form.Item name={["aria2", "url"]} label="RPC 地址">
                                    <Input placeholder="http://127.0.0.1:6800/jsonrpc" autoComplete="url" />
                                </Form.Item>
                                <Form.Item
                                    name={["aria2", "secret"]}
                                    label="RPC Secret"
                                    extra={settings?.aria2?.has_secret ? "已保存 secret；留空表示保留原值" : "仅在填写时写入 config.json"}
                                >
                                    <Input.Password autoComplete="new-password" />
                                </Form.Item>
                            </Card>
                        </Col>

                        <Col xs={24} lg={12}>
                            <Card className="webdav-connection-card" title={<><Icon as={LoginOutlined} /> PikPak</>}>
                                <Row gutter={16}>
                                    <Col xs={24} md={12}>
                                        <Form.Item name={["pikpak", "enabled"]} label="启用配置登录" valuePropName="checked">
                                            <Switch />
                                        </Form.Item>
                                    </Col>
                                    <Col xs={24} md={12}>
                                        <Form.Item name={["pikpak", "auto_login"]} label="页面加载后自动登录" valuePropName="checked">
                                            <Switch />
                                        </Form.Item>
                                    </Col>
                                </Row>
                                <Row gutter={16}>
                                    <Col xs={24} md={12}>
                                        <Form.Item name={["pikpak", "username"]} label="账号">
                                            <Input autoComplete="username" />
                                        </Form.Item>
                                    </Col>
                                    <Col xs={24} md={12}>
                                        <Form.Item
                                            name={["pikpak", "password"]}
                                            label="密码"
                                            extra={settings?.pikpak?.has_password ? "已保存密码；留空表示保留原值" : "仅在填写时写入 config.json"}
                                        >
                                            <Input.Password autoComplete="new-password" />
                                        </Form.Item>
                                    </Col>
                                </Row>
                            </Card>
                        </Col>

                        <Col xs={24} lg={12}>
                            <Card className="webdav-connection-card" title={<><Icon as={CloudServerOutlined} /> 115网盘</>}>
                                <Row gutter={16}>
                                    <Col xs={24} md={12}>
                                        <Form.Item name={["pan115", "enabled"]} label="启用配置下发" valuePropName="checked">
                                            <Switch />
                                        </Form.Item>
                                    </Col>
                                    <Col xs={24} md={12}>
                                        <Form.Item name={["pan115", "save_dir_id"]} label="保存目录 ID">
                                            <Input placeholder="0" autoComplete="off" />
                                        </Form.Item>
                                    </Col>
                                </Row>
                                <Form.Item name={["pan115", "login_app"]} label="扫码登录端">
                                    <Select
                                        options={[
                                            { value: "wechatmini", label: "微信小程序" },
                                            { value: "tv", label: "TV" },
                                            { value: "web", label: "Web" },
                                            { value: "android", label: "Android" },
                                            { value: "ios", label: "iOS" },
                                            { value: "alipaymini", label: "支付宝小程序" },
                                            { value: "qandroid", label: "Android Q" },
                                        ]}
                                    />
                                </Form.Item>
                                <Row gutter={16}>
                                    <Col xs={24} md={12}>
                                        <Form.Item
                                            name={["pan115", "batch_size"]}
                                            label="每批链接数"
                                            extra="默认 20；一次请求会提交这一批里的多个链接"
                                        >
                                            <InputNumber min={1} max={50} precision={0} style={{ width: "100%" }} />
                                        </Form.Item>
                                    </Col>
                                    <Col xs={24} md={12}>
                                        <Form.Item
                                            name={["pan115", "batch_interval_seconds"]}
                                            label="批次间隔（秒）"
                                            extra="默认 25；仅在超过一批时生效"
                                        >
                                            <InputNumber min={0} max={300} step={5} precision={1} style={{ width: "100%" }} />
                                        </Form.Item>
                                    </Col>
                                    <Col xs={24} md={12}>
                                        <Form.Item
                                            name={["pan115", "jitter_seconds"]}
                                            label="随机抖动（秒）"
                                            extra="默认 5；批次间隔会在该范围内轻微浮动"
                                        >
                                            <InputNumber min={0} max={60} step={1} precision={1} style={{ width: "100%" }} />
                                        </Form.Item>
                                    </Col>
                                </Row>
                                <Form.Item
                                    name={["pan115", "cookie"]}
                                    label="Cookie"
                                    extra={settings?.pan115?.has_cookie ? "已保存 Cookie；留空表示保留原值" : "可通过下载工具抽屉扫码登录自动写入"}
                                >
                                    <Input.Password autoComplete="new-password" placeholder="UID=...;CID=...;SEID=...;KID=..." />
                                </Form.Item>
                            </Card>
                        </Col>

                        <Col xs={24} lg={12}>
                            <Card className="webdav-connection-card" title={<><Icon as={SafetyCertificateOutlined} /> 保存策略</>}>
                                <Space direction="vertical" size="middle" style={{ width: "100%" }}>
                                    <Alert
                                        showIcon
                                        type="info"
                                        message="敏感字段不会从接口回显。密码或 secret 留空时，保存不会覆盖 config.json 中已有值。"
                                    />
                                    <Space wrap>
                                        <Button type="primary" htmlType="submit" icon={<Icon as={SaveOutlined} />} loading={saving}>
                                            保存全部设置
                                        </Button>
                                        <Button onClick={resetForm} disabled={saving}>
                                            重置表单
                                        </Button>
                                    </Space>
                                </Space>
                            </Card>
                        </Col>
                    </Row>
                </Form>
            </Spin>
        </div>
    );
}
