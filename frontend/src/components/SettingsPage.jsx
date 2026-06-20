import { fetchSystemSettings, updateJavBusSettings } from "../utils/api.js";

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
    Space,
    Spin,
    Tag,
    Typography,
    message,
} = antd;
const { Title, Text } = Typography;
const { ApiOutlined, ReloadOutlined, SaveOutlined, SettingOutlined } = icons;

const Icon = ({ as: Component }) => Component ? <Component /> : null;

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
            form.setFieldsValue(payload.javbus || {});
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
            const payload = await updateJavBusSettings(values);
            setSettings(payload);
            form.setFieldsValue(payload.javbus || {});
            message.success("API 设置已保存");
        } catch (error) {
            message.error("保存设置失败，请检查输入值");
        } finally {
            setSaving(false);
        }
    };

    const envOverrides = settings?.environment_overrides?.javbus || {};
    const hasEnvOverrides = Object.values(envOverrides).some(Boolean);

    return (
        <div className="webdav-page">
            <div className="webdav-page-header">
                <div>
                    <Title level={3} style={{ marginBottom: 4 }}>设置</Title>
                    <Text type="secondary">API 参数与运行配置</Text>
                </div>
                <Space>
                    {hasEnvOverrides && <Tag color="warning">环境变量覆盖中</Tag>}
                    <Button icon={<Icon as={ReloadOutlined} />} onClick={loadSettings} loading={loading}>
                        刷新
                    </Button>
                </Space>
            </div>

            <Spin spinning={loading}>
                <Row gutter={[24, 24]}>
                    <Col xs={24} lg={16}>
                        <Card className="webdav-connection-card" title={<><Icon as={ApiOutlined} /> JavBus API</>}>
                            {hasEnvOverrides && (
                                <Alert
                                    showIcon
                                    type="warning"
                                    style={{ marginBottom: 16 }}
                                    message="部分字段正由环境变量覆盖，保存到 config.json 后需移除对应环境变量才会生效。"
                                />
                            )}
                            <Form form={form} layout="vertical" onFinish={saveSettings}>
                                <Form.Item
                                    name="base_url"
                                    label="Base URL"
                                    rules={[{ required: true, message: "请输入 API 基础地址" }]}
                                    extra={envOverrides.base_url ? "JAVBUS_BASE_URL 正在覆盖此字段" : null}
                                >
                                    <Input placeholder="https://www.javbus.com" autoComplete="url" />
                                </Form.Item>

                                <Form.Item
                                    name="proxy"
                                    label="代理"
                                    extra={envOverrides.proxy ? "JAVBUS_PROXY 正在覆盖此字段" : "支持 http、https、socks5、socks5h；留空表示不使用代理"}
                                >
                                    <Input placeholder="http://127.0.0.1:7890" autoComplete="off" />
                                </Form.Item>

                                <Row gutter={16}>
                                    <Col xs={24} md={12}>
                                        <Form.Item name="timeout_seconds" label="请求超时（秒）" rules={[{ required: true, message: "请输入请求超时" }]}>
                                            <InputNumber min={1} max={60} step={1} style={{ width: "100%" }} />
                                        </Form.Item>
                                    </Col>
                                    <Col xs={24} md={12}>
                                        <Form.Item
                                            name="request_interval_seconds"
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
                                        <Form.Item name="cache_expire_seconds" label="缓存有效期（秒）" rules={[{ required: true, message: "请输入缓存有效期" }]}>
                                            <InputNumber min={0} max={86400} step={60} style={{ width: "100%" }} />
                                        </Form.Item>
                                    </Col>
                                    <Col xs={24} md={12}>
                                        <Form.Item name="cache_max_size" label="缓存容量" rules={[{ required: true, message: "请输入缓存容量" }]}>
                                            <InputNumber min={1} max={100000} step={100} style={{ width: "100%" }} />
                                        </Form.Item>
                                    </Col>
                                </Row>

                                <Space wrap>
                                    <Button type="primary" htmlType="submit" icon={<Icon as={SaveOutlined} />} loading={saving}>
                                        保存设置
                                    </Button>
                                    <Button onClick={() => form.setFieldsValue(settings?.javbus || {})} disabled={saving}>
                                        重置表单
                                    </Button>
                                </Space>
                            </Form>
                        </Card>
                    </Col>

                    <Col xs={24} lg={8}>
                        <Card className="webdav-connection-card" title={<><Icon as={SettingOutlined} /> 当前状态</>}>
                            <Space direction="vertical" size="middle" style={{ width: "100%" }}>
                                <div>
                                    <Text type="secondary">请求间隔</Text>
                                    <div><Text strong>{settings?.javbus?.request_interval_seconds ?? "-"} 秒</Text></div>
                                </div>
                                <div>
                                    <Text type="secondary">缓存容量</Text>
                                    <div><Text strong>{settings?.javbus?.cache_max_size ?? "-"} 条</Text></div>
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
                </Row>
            </Spin>
        </div>
    );
}
