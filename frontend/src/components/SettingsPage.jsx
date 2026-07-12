import {
    applyMetadataScraperTestResults,
    fetchSystemSettings,
    testMetadataScrapers,
    updateSystemSettings,
} from "../utils/api.js";

const React = window.React;
const antd = window.antd;
const icons = window.icons || {};

const {
    Alert,
    Badge,
    Button,
    Card,
    Col,
    Divider,
    Form,
    Input,
    InputNumber,
    Row,
    Select,
    Space,
    Spin,
    Switch,
    Table,
    Tag,
    Typography,
    message,
} = antd;
const { Title, Text } = Typography;
const {
    ApiOutlined,
    CheckCircleOutlined,
    CloudOutlined,
    CloudServerOutlined,
    DatabaseOutlined,
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

const SETTINGS_SECTIONS = [
    { key: "overview", label: "概览", icon: CheckCircleOutlined },
    { key: "javbus", label: "JavBus API", icon: ApiOutlined },
    { key: "scrapers", label: "刮削源", icon: DatabaseOutlined },
    { key: "downloads", label: "下载服务", icon: CloudServerOutlined },
    { key: "security", label: "运行与安全", icon: SafetyCertificateOutlined },
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
    magnet_health: payload.magnet_health || {},
});

const buildSettingsPayload = (values = {}) => {
    const payload = {
        javbus: { ...(values.javbus || {}) },
        scrapers: { ...(values.scrapers || {}) },
        webdav: { ...(values.webdav || {}) },
        aria2: { ...(values.aria2 || {}) },
        pikpak: { ...(values.pikpak || {}) },
        pan115: { ...(values.pan115 || {}) },
        magnet_health: { ...(values.magnet_health || {}) },
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

const settingPageStyles = `
.settings-page {
    --settings-bg: #f5f5f5;
    --settings-surface: #ffffff;
    --settings-border: #d9d9d9;
    --settings-border-soft: #f0f0f0;
    --settings-text: #262626;
    --settings-muted: #595959;
    --settings-primary: #1677ff;
    min-height: 100%;
    color: var(--settings-text);
}

.settings-page .webdav-page-header {
    align-items: flex-start;
    margin-bottom: 16px;
}

.settings-heading-copy {
    display: flex;
    flex-direction: column;
    gap: 4px;
}

.settings-header-actions {
    flex-shrink: 0;
}

.settings-shell {
    display: grid;
    grid-template-columns: 232px minmax(0, 1fr);
    align-items: start;
    gap: 16px;
}

.settings-nav {
    position: sticky;
    top: 12px;
    border: 1px solid var(--settings-border);
    border-radius: 8px;
    background: var(--settings-surface);
    box-shadow: 0 1px 2px rgba(0, 0, 0, 0.03);
    overflow: hidden;
}

.settings-nav-header {
    padding: 14px 14px 10px;
    border-bottom: 1px solid var(--settings-border-soft);
    background: #fafafa;
}

.settings-nav-title {
    display: block;
    margin-bottom: 2px;
    color: var(--settings-text);
    font-size: 13px;
    font-weight: 760;
}

.settings-nav-list {
    display: flex;
    flex-direction: column;
    gap: 4px;
    padding: 8px;
}

.settings-nav-item {
    display: grid;
    grid-template-columns: 18px minmax(0, 1fr) auto;
    align-items: center;
    gap: 8px;
    width: 100%;
    min-height: 38px;
    padding: 8px 10px;
    color: var(--settings-muted);
    text-align: left;
    background: transparent;
    border: 0;
    border-radius: 6px;
    cursor: pointer;
}

.settings-page button.settings-nav-item:not(.is-active) {
    padding: 8px 10px !important;
    color: var(--settings-muted) !important;
    background: transparent !important;
    box-shadow: none !important;
    transform: none !important;
}

.settings-page button.settings-nav-item:not(.is-active):hover {
    background: #f5f8ff !important;
    color: var(--settings-primary) !important;
    box-shadow: none !important;
    transform: none !important;
}

.settings-page button.settings-nav-item.is-active {
    padding: 8px 10px !important;
    background: #e6f4ff !important;
    color: var(--settings-primary) !important;
    font-weight: 700;
    box-shadow: none !important;
    transform: none !important;
}

.settings-section-stack {
    display: flex;
    min-width: 0;
    flex-direction: column;
    gap: 16px;
}

.settings-section-heading {
    padding: 2px 0 0;
}

.settings-section-heading h4.ant-typography {
    margin: 0 0 4px !important;
    color: var(--settings-text);
    font-size: 18px;
    line-height: 1.25;
}

.settings-card,
.settings-page .webdav-connection-card.settings-card {
    border-radius: 8px !important;
    border-color: var(--settings-border) !important;
    box-shadow: 0 1px 2px rgba(0, 0, 0, 0.03) !important;
}

.settings-card .ant-card-head {
    min-height: 46px !important;
    background: #fafafa !important;
}

.settings-card .ant-card-body {
    padding: 16px !important;
}

.settings-card .ant-card-head-title {
    display: flex;
    align-items: center;
    gap: 8px;
    color: var(--settings-text);
    font-size: 14px;
    font-weight: 760;
}

.settings-summary-grid {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 12px;
}

.settings-summary-card {
    min-height: 118px;
    padding: 14px;
    border: 1px solid var(--settings-border);
    border-radius: 8px;
    background: var(--settings-surface);
}

.settings-summary-top {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    margin-bottom: 12px;
}

.settings-summary-label {
    color: var(--settings-muted);
    font-size: 12px;
    font-weight: 700;
}

.settings-summary-value {
    display: block;
    margin-bottom: 4px;
    color: var(--settings-text);
    font-size: 18px;
    font-weight: 780;
    line-height: 1.2;
}

.settings-summary-note {
    color: var(--settings-muted);
    font-size: 12px;
}

.settings-metric-list {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 12px;
}

.settings-metric {
    padding: 12px;
    border: 1px solid var(--settings-border-soft);
    border-radius: 8px;
    background: #fafafa;
}

.settings-metric-label {
    display: block;
    margin-bottom: 4px;
    color: var(--settings-muted);
    font-size: 12px;
}

.settings-metric-value {
    color: var(--settings-text);
    font-size: 15px;
    font-weight: 740;
}

.settings-service-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 16px;
}

.settings-service-card {
    border: 1px solid var(--settings-border);
    border-radius: 8px;
    background: var(--settings-surface);
    overflow: hidden;
}

.settings-service-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    padding: 12px 14px;
    border-bottom: 1px solid var(--settings-border-soft);
    background: #fafafa;
}

.settings-service-title {
    display: flex;
    align-items: center;
    gap: 8px;
    font-weight: 760;
}

.settings-service-body {
    padding: 14px;
}

.settings-table-card .ant-table-wrapper {
    border: 1px solid var(--settings-border-soft);
    border-radius: 8px;
}

.settings-table-card .ant-table-thead > tr > th {
    color: var(--settings-muted) !important;
    font-size: 12px;
    font-weight: 760 !important;
    background: #fafafa !important;
}

.settings-provider-name {
    display: flex;
    min-width: 0;
    flex-direction: column;
    gap: 2px;
}

.settings-provider-actions {
    display: flex;
    gap: 4px;
}

.settings-provider-detail {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(220px, 320px);
    gap: 16px;
    padding: 4px 8px;
}

.settings-save-card {
    position: sticky;
    bottom: 0;
    z-index: 2;
    border-color: #b7d9ff !important;
}

.settings-save-card .ant-card-body {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
}

.settings-page .ant-form-item-label > label {
    font-size: 12px;
    font-weight: 700;
}

@media (max-width: 1180px) {
    .settings-summary-grid {
        grid-template-columns: repeat(2, minmax(0, 1fr));
    }
}

@media (max-width: 980px) {
    .settings-shell {
        grid-template-columns: 1fr;
    }

    .settings-nav {
        position: static;
    }

    .settings-nav-list {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
    }

    .settings-service-grid,
    .settings-metric-list {
        grid-template-columns: 1fr;
    }
}

@media (max-width: 680px) {
    .settings-page .webdav-page-header {
        flex-direction: column;
    }

    .settings-header-actions,
    .settings-header-actions .ant-space-item,
    .settings-header-actions .ant-btn {
        width: 100%;
    }

    .settings-nav-list,
    .settings-summary-grid {
        grid-template-columns: 1fr;
    }

    .settings-save-card .ant-card-body,
    .settings-provider-detail {
        grid-template-columns: 1fr;
        flex-direction: column;
        align-items: stretch;
    }
}
`;

const StatusBadge = ({ ready, readyText = "已配置", missingText = "未配置" }) => (
    <Badge status={ready ? "success" : "default"} text={ready ? readyText : missingText} />
);

const SummaryCard = ({ label, value, note, ready }) => (
    <div className="settings-summary-card">
        <div className="settings-summary-top">
            <span className="settings-summary-label">{label}</span>
            <StatusBadge ready={ready} />
        </div>
        <span className="settings-summary-value">{value}</span>
        <span className="settings-summary-note">{note}</span>
    </div>
);

const Metric = ({ label, value }) => (
    <div className="settings-metric">
        <span className="settings-metric-label">{label}</span>
        <span className="settings-metric-value">{value}</span>
    </div>
);

const ServicePanel = ({ icon, title, configured, children }) => (
    <div className="settings-service-card">
        <div className="settings-service-head">
            <span className="settings-service-title"><Icon as={icon} /> {title}</span>
            <StatusBadge ready={configured} />
        </div>
        <div className="settings-service-body">{children}</div>
    </div>
);

const SectionHeading = ({ title, description }) => (
    <div className="settings-section-heading">
        <Title level={4}>{title}</Title>
        <Text type="secondary">{description}</Text>
    </div>
);

const formatApiError = (error, fallback) => {
    const rawMessage = String(error?.message || "");
    const jsonStart = rawMessage.indexOf("{");
    if (jsonStart >= 0) {
        try {
            const parsed = JSON.parse(rawMessage.slice(jsonStart));
            const detail = parsed?.detail;
            if (typeof detail === "string") {
                return detail;
            }
            if (detail?.message && detail?.reason) {
                return `${detail.message}: ${detail.reason}`;
            }
            if (detail?.message) {
                return detail.message;
            }
            if (detail?.error) {
                return detail.error;
            }
        } catch (parseError) {
            // Fall back to the transport error below.
        }
    }
    return rawMessage || fallback;
};

export default function SettingsPage() {
    const [form] = Form.useForm();
    const [loading, setLoading] = React.useState(true);
    const [saving, setSaving] = React.useState(false);
    const [scraperTesting, setScraperTesting] = React.useState(false);
    const [scraperApplying, setScraperApplying] = React.useState(false);
    const [scraperTestResult, setScraperTestResult] = React.useState(null);
    const [settings, setSettings] = React.useState(null);
    const [activeSection, setActiveSection] = React.useState("overview");
    const scraperPriority = Form.useWatch(["scrapers", "priority"], form) || [];

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

    const saveSettings = async () => {
        setSaving(true);
        try {
            const values = form.getFieldsValue(true);
            const payload = await updateSystemSettings(buildSettingsPayload(values));
            setSettings(payload);
            form.setFieldsValue(withSecretPlaceholders(payload));
            message.success("设置已保存");
        } catch (error) {
            message.error(`保存设置失败：${formatApiError(error, "请检查输入值")}`);
        } finally {
            setSaving(false);
        }
    };

    const runScraperTests = async () => {
        setScraperTesting(true);
        try {
            const values = form.getFieldsValue(true);
            try {
                const saved = await updateSystemSettings(buildSettingsPayload(values));
                setSettings(saved);
                form.setFieldsValue(withSecretPlaceholders(saved));
            } catch (saveError) {
                message.warning("保存当前设置失败，将使用服务器已保存配置测试");
            }
            const result = await testMetadataScrapers({
                providers: SCRAPER_OPTIONS.map((option) => option.value),
            });
            setScraperTestResult(result);
            message.success(`测试完成：${result.summary?.success || 0}/${result.summary?.total || 0} 可用`);
        } catch (error) {
            message.error(`测试刮削源失败：${error.message || "请求失败"}`);
        } finally {
            setScraperTesting(false);
        }
    };

    const applyScraperTestResults = async () => {
        if (!scraperTestResult?.results?.length) {
            message.warning("请先测试刮削源");
            return;
        }
        setScraperApplying(true);
        try {
            await applyMetadataScraperTestResults(scraperTestResult.results);
            await loadSettings();
            message.success("已按测试结果更新启用状态");
        } catch (error) {
            message.error(`应用测试结果失败：${formatApiError(error, "请求失败")}`);
        } finally {
            setScraperApplying(false);
        }
    };

    const moveScraperPriority = (provider, direction) => {
        const current = [...(form.getFieldValue(["scrapers", "priority"]) || [])];
        const index = current.indexOf(provider);
        if (index < 0) {
            form.setFieldValue(["scrapers", "priority"], [...current, provider]);
            return;
        }
        const nextIndex = index + direction;
        if (nextIndex < 0 || nextIndex >= current.length) {
            return;
        }
        const next = [...current];
        [next[index], next[nextIndex]] = [next[nextIndex], next[index]];
        form.setFieldValue(["scrapers", "priority"], next);
    };

    const resetForm = () => {
        form.setFieldsValue(withSecretPlaceholders(settings || {}));
    };

    const envOverrides = settings?.environment_overrides?.javbus || {};
    const hasEnvOverrides = Object.values(envOverrides).some(Boolean);
    const security = settings?.security || {};
    const scraperTestByProvider = React.useMemo(() => {
        const entries = {};
        for (const item of scraperTestResult?.results || []) {
            entries[item.provider] = item;
        }
        return entries;
    }, [scraperTestResult]);

    const enabledScraperCount = SCRAPER_OPTIONS.filter((provider) => settings?.scrapers?.[provider.value]?.enabled).length;
    const serviceConfiguredCount = [
        settings?.webdav?.enabled && settings?.webdav?.url,
        settings?.aria2?.enabled && settings?.aria2?.url,
        settings?.pikpak?.enabled && settings?.pikpak?.username && settings?.pikpak?.has_password,
        settings?.pan115?.enabled && settings?.pan115?.has_cookie,
    ].filter(Boolean).length;

    const scraperColumns = [
        {
            title: "Provider",
            dataIndex: "label",
            key: "label",
            width: 190,
            render: (_, provider) => (
                <div className="settings-provider-name">
                    <Text strong>{provider.label}</Text>
                    <Text type="secondary">{provider.value}</Text>
                </div>
            ),
        },
        {
            title: "状态",
            key: "status",
            width: 170,
            render: (_, provider) => (
                <Space size={4} wrap>
                    <Form.Item name={["scrapers", provider.value, "enabled"]} valuePropName="checked" noStyle>
                        <Switch size="small" />
                    </Form.Item>
                    <Tag color={settings?.scrapers?.[provider.value]?.implemented ? "success" : "default"}>
                        {settings?.scrapers?.[provider.value]?.implemented ? "active" : "configured"}
                    </Tag>
                </Space>
            ),
        },
        {
            title: "优先级",
            key: "priority",
            width: 156,
            render: (_, provider) => {
                const priorityIndex = scraperPriority.indexOf(provider.value);
                return (
                    <Space size={4} wrap>
                        {priorityIndex >= 0 ? <Tag color="processing">#{priorityIndex + 1}</Tag> : <Tag>未加入</Tag>}
                        <div className="settings-provider-actions">
                            <Button
                                size="small"
                                onClick={() => moveScraperPriority(provider.value, -1)}
                                disabled={priorityIndex <= 0}
                            >
                                上移
                            </Button>
                            <Button
                                size="small"
                                onClick={() => moveScraperPriority(provider.value, 1)}
                                disabled={priorityIndex < 0 || priorityIndex === scraperPriority.length - 1}
                            >
                                下移
                            </Button>
                        </div>
                    </Space>
                );
            },
        },
        {
            title: "语言",
            key: "language",
            width: 130,
            render: (_, provider) => (
                <Form.Item name={["scrapers", provider.value, "language"]} noStyle>
                    <Select options={SCRAPER_LANGUAGE_OPTIONS} />
                </Form.Item>
            ),
        },
        {
            title: "延迟 ms",
            key: "delay",
            width: 130,
            render: (_, provider) => (
                <Form.Item name={["scrapers", provider.value, "request_delay"]} noStyle>
                    <InputNumber min={0} max={60000} step={100} precision={0} style={{ width: "100%" }} />
                </Form.Item>
            ),
        },
        {
            title: "测试结果",
            key: "test",
            width: 190,
            render: (_, provider) => {
                const result = scraperTestByProvider[provider.value];
                if (!result) {
                    return <Text type="secondary">未测试</Text>;
                }
                return (
                    <Space size={4} wrap>
                        <Tag color={result.success ? "success" : "error"}>{result.status}</Tag>
                        {result.duration_ms != null && <Tag>{result.duration_ms} ms</Tag>}
                    </Space>
                );
            },
        },
    ];

    const renderOverview = () => (
        <>
            <div className="settings-summary-grid">
                <SummaryCard
                    label="JavBus API"
                    value={settings?.javbus?.base_url || "-"}
                    note={`超时 ${settings?.javbus?.timeout_seconds ?? "-"} 秒，间隔 ${settings?.javbus?.request_interval_seconds ?? "-"} 秒`}
                    ready={Boolean(settings?.javbus?.base_url)}
                />
                <SummaryCard
                    label="刮削源"
                    value={`${enabledScraperCount}/${SCRAPER_OPTIONS.length}`}
                    note={`优先级队列 ${scraperPriority.length} 个 provider`}
                    ready={enabledScraperCount > 0}
                />
                <SummaryCard
                    label="下载服务"
                    value={`${serviceConfiguredCount}/4`}
                    note="WebDAV、Aria2、PikPak、115网盘"
                    ready={serviceConfiguredCount > 0}
                />
                <SummaryCard
                    label="会话安全"
                    value={security.using_default_session_secret ? "默认密钥" : "已配置"}
                    note="生产环境应使用 APP_SESSION_SECRET"
                    ready={!security.using_default_session_secret}
                />
            </div>

            {hasEnvOverrides && (
                <Alert
                    showIcon
                    type="warning"
                    message="部分 JavBus 字段正由环境变量覆盖；保存到 config.json 后，需要移除对应环境变量才会生效。"
                />
            )}

            <Card className="settings-card" title={<><Icon as={SettingOutlined} /> 当前运行参数</>}>
                <div className="settings-metric-list">
                    <Metric label="JavBus 请求间隔" value={`${settings?.javbus?.request_interval_seconds ?? "-"} 秒`} />
                    <Metric label="JavBus 缓存容量" value={`${settings?.javbus?.cache_max_size ?? "-"} 条`} />
                    <Metric
                        label="图片下载重试"
                        value={`${settings?.javbus?.image_retry_attempts ?? "-"} 次 / ${settings?.javbus?.image_retry_backoff_seconds ?? "-"} 秒`}
                    />
                </div>
            </Card>
        </>
    );

    const renderJavbus = () => (
        <Card className="settings-card webdav-connection-card" title={<><Icon as={ApiOutlined} /> JavBus API</>}>
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
    );

    const renderScrapers = () => (
        <Card
            className="settings-card settings-table-card"
            title={<><Icon as={DatabaseOutlined} /> 刮削源</>}
            extra={(
                <Space wrap>
                    <Button size="small" onClick={runScraperTests} loading={scraperTesting} disabled={saving || scraperApplying}>
                        测试所有源
                    </Button>
                    <Button
                        size="small"
                        type="primary"
                        onClick={applyScraperTestResults}
                        loading={scraperApplying}
                        disabled={scraperTesting || !scraperTestResult?.results?.length}
                    >
                        按结果启停
                    </Button>
                </Space>
            )}
        >
            {scraperTestResult?.summary && (
                <Alert
                    showIcon
                    type={scraperTestResult.summary.failed ? "warning" : "success"}
                    style={{ marginBottom: 16 }}
                    message={`可用 ${scraperTestResult.summary.success}/${scraperTestResult.summary.total}，失败 ${scraperTestResult.summary.failed}`}
                />
            )}
            <Form.Item
                name={["scrapers", "priority"]}
                label="Priority"
                extra="启用的 provider 会按此顺序尝试。表格中可直接上移、下移或在这里批量调整。"
            >
                <Select mode="multiple" options={SCRAPER_OPTIONS} optionFilterProp="label" />
            </Form.Item>
            <Table
                rowKey="value"
                columns={scraperColumns}
                dataSource={SCRAPER_OPTIONS}
                pagination={false}
                size="small"
                scroll={{ x: 960 }}
                expandable={{
                    expandedRowRender: (provider) => (
                        <div className="settings-provider-detail">
                            <Form.Item name={["scrapers", provider.value, "base_url"]} label="Base URL">
                                <Input autoComplete="url" />
                            </Form.Item>
                            {provider.value === "javstash" ? (
                                <Form.Item
                                    name={["scrapers", "javstash", "api_key"]}
                                    label="JavStash API Key"
                                    extra={settings?.scrapers?.javstash?.has_api_key ? "has_api_key: true；留空表示保留已保存 key" : "启用 JavStash 时按需填写"}
                                >
                                    <Input.Password autoComplete="new-password" />
                                </Form.Item>
                            ) : (
                                <div>
                                    {scraperTestByProvider[provider.value] && (
                                        <Text
                                            type={scraperTestByProvider[provider.value].success ? "secondary" : "danger"}
                                            ellipsis={{ tooltip: scraperTestByProvider[provider.value].error_message || scraperTestByProvider[provider.value].title }}
                                        >
                                            {scraperTestByProvider[provider.value].success
                                                ? `${scraperTestByProvider[provider.value].id || "-"} ${scraperTestByProvider[provider.value].title || ""}`
                                                : scraperTestByProvider[provider.value].error_message || "no metadata returned"}
                                        </Text>
                                    )}
                                </div>
                            )}
                        </div>
                    ),
                }}
            />
        </Card>
    );

    const renderDownloads = () => (
        <div className="settings-service-grid">
            <ServicePanel icon={CloudOutlined} title="WebDAV" configured={Boolean(settings?.webdav?.enabled && settings?.webdav?.url)}>
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
            </ServicePanel>

            <ServicePanel icon={CloudServerOutlined} title="Aria2" configured={Boolean(settings?.aria2?.enabled && settings?.aria2?.url)}>
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
            </ServicePanel>

            <ServicePanel icon={LoginOutlined} title="PikPak" configured={Boolean(settings?.pikpak?.enabled && settings?.pikpak?.username && settings?.pikpak?.has_password)}>
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
            </ServicePanel>

            <ServicePanel icon={CloudServerOutlined} title="115网盘" configured={Boolean(settings?.pan115?.enabled && settings?.pan115?.has_cookie)}>
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
                    <Col xs={24} md={8}>
                        <Form.Item name={["pan115", "batch_size"]} label="每批链接数" extra="默认 20">
                            <InputNumber min={1} max={50} precision={0} style={{ width: "100%" }} />
                        </Form.Item>
                    </Col>
                    <Col xs={24} md={8}>
                        <Form.Item name={["pan115", "batch_interval_seconds"]} label="批次间隔（秒）" extra="超过一批时生效">
                            <InputNumber min={0} max={300} step={5} precision={1} style={{ width: "100%" }} />
                        </Form.Item>
                    </Col>
                    <Col xs={24} md={8}>
                        <Form.Item name={["pan115", "jitter_seconds"]} label="随机抖动（秒）" extra="批次间隔浮动范围">
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
            </ServicePanel>

            <ServicePanel icon={SafetyCertificateOutlined} title="磁力健康度" configured={Boolean(settings?.magnet_health?.enabled)}>
                <Row gutter={16}>
                    <Col xs={24} md={12}>
                        <Form.Item name={["magnet_health", "enabled"]} label="启用健康度过滤" valuePropName="checked">
                            <Switch />
                        </Form.Item>
                    </Col>
                    <Col xs={24} md={12}>
                        <Form.Item
                            name={["magnet_health", "probe_with_aria2"]}
                            label="使用 Aria2 探测"
                            valuePropName="checked"
                            extra="需要已启用并配置 Aria2；探测使用 metadata-only 任务并自动清理"
                        >
                            <Switch />
                        </Form.Item>
                    </Col>
                </Row>
                <Row gutter={16}>
                    <Col xs={24} md={8}>
                        <Form.Item name={["magnet_health", "min_seeders"]} label="最少做种数">
                            <InputNumber min={0} max={10000} precision={0} style={{ width: "100%" }} />
                        </Form.Item>
                    </Col>
                    <Col xs={24} md={8}>
                        <Form.Item name={["magnet_health", "min_peers"]} label="最少 Peer 数">
                            <InputNumber min={0} max={10000} precision={0} style={{ width: "100%" }} />
                        </Form.Item>
                    </Col>
                    <Col xs={24} md={8}>
                        <Form.Item name={["magnet_health", "min_availability"]} label="最小可用度">
                            <InputNumber min={0} max={100} step={0.1} precision={2} style={{ width: "100%" }} />
                        </Form.Item>
                    </Col>
                </Row>
                <Row gutter={16}>
                    <Col xs={24} md={8}>
                        <Form.Item name={["magnet_health", "min_score"]} label="最低评分">
                            <InputNumber min={0} max={100000} step={0.5} precision={1} style={{ width: "100%" }} />
                        </Form.Item>
                    </Col>
                    <Col xs={24} md={8}>
                        <Form.Item name={["magnet_health", "probe_timeout_seconds"]} label="探测超时（秒）">
                            <InputNumber min={3} max={120} step={1} precision={0} style={{ width: "100%" }} />
                        </Form.Item>
                    </Col>
                    <Col xs={24} md={8}>
                        <Form.Item name={["magnet_health", "allow_unknown"]} label="放行未知健康度" valuePropName="checked">
                            <Switch />
                        </Form.Item>
                    </Col>
                </Row>
            </ServicePanel>
        </div>
    );

    const renderSecurity = () => (
        <>
            <Card className="settings-card" title={<><Icon as={SafetyCertificateOutlined} /> 运行与安全</>}>
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
                    <Divider style={{ margin: "4px 0" }} />
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

            <Card className="settings-card settings-save-card" title={<><Icon as={SaveOutlined} /> 保存策略</>}>
                <Alert
                    showIcon
                    type="info"
                    message="敏感字段不会从接口回显。密码、secret、Cookie 或 API key 留空时，保存不会覆盖 config.json 中已有值。"
                />
                <Space wrap>
                    <Button type="primary" onClick={saveSettings} icon={<Icon as={SaveOutlined} />} loading={saving}>
                        保存全部
                    </Button>
                    <Button onClick={resetForm} disabled={saving}>
                        重置表单
                    </Button>
                </Space>
            </Card>
        </>
    );

    const renderActiveSection = () => {
        if (activeSection === "javbus") {
            return (
                <>
                    <SectionHeading title="JavBus API" description="调整站点访问、代理、缓存和图片重试策略。" />
                    {renderJavbus()}
                </>
            );
        }
        if (activeSection === "scrapers") {
            return (
                <>
                    <SectionHeading title="刮削源" description="管理元数据 provider 的启用状态、优先级、语言和请求延迟。" />
                    {renderScrapers()}
                </>
            );
        }
        if (activeSection === "downloads") {
            return (
                <>
                    <SectionHeading title="下载服务" description="集中维护 WebDAV、Aria2、PikPak 和 115网盘的配置连接。" />
                    {renderDownloads()}
                </>
            );
        }
        if (activeSection === "security") {
            return (
                <>
                    <SectionHeading title="运行与安全" description="查看会话密钥、环境变量覆盖和敏感字段保存规则。" />
                    {renderSecurity()}
                </>
            );
        }
        return (
            <>
                <SectionHeading title="概览" description="先看当前配置状态，再进入具体分组编辑。" />
                {renderOverview()}
            </>
        );
    };

    return (
        <div className="webdav-page settings-page">
            <style>{settingPageStyles}</style>
            <div className="webdav-page-header">
                <div className="settings-heading-copy">
                    <Title level={3} style={{ marginBottom: 0 }}>设置</Title>
                    <Text type="secondary">按运行配置、刮削源和下载服务分组管理可热更新项</Text>
                </div>
                <Space className="settings-header-actions" wrap>
                    {hasEnvOverrides && <Tag color="warning">环境变量覆盖中</Tag>}
                    <Button icon={<Icon as={ReloadOutlined} />} onClick={loadSettings} loading={loading}>
                        刷新
                    </Button>
                    <Button type="primary" icon={<Icon as={SaveOutlined} />} onClick={saveSettings} loading={saving}>
                        保存全部
                    </Button>
                </Space>
            </div>

            <Spin spinning={loading}>
                <Form form={form} layout="vertical" onFinish={saveSettings}>
                    <div className="settings-shell">
                        <aside className="settings-nav" aria-label="设置分组">
                            <div className="settings-nav-header">
                                <span className="settings-nav-title">运行配置</span>
                                <Text type="secondary">选择一个分组集中编辑</Text>
                            </div>
                            <div className="settings-nav-list">
                                {SETTINGS_SECTIONS.map((section) => (
                                    <button
                                        key={section.key}
                                        type="button"
                                        className={`settings-nav-item ${activeSection === section.key ? "is-active" : ""}`}
                                        onClick={() => setActiveSection(section.key)}
                                    >
                                        <Icon as={section.icon} />
                                        <span>{section.label}</span>
                                        {section.key === "downloads" && serviceConfiguredCount > 0 ? <Tag color="processing">{serviceConfiguredCount}</Tag> : null}
                                    </button>
                                ))}
                            </div>
                        </aside>

                        <section className="settings-section-stack">
                            {renderActiveSection()}
                        </section>
                    </div>
                </Form>
            </Spin>
        </div>
    );
}
