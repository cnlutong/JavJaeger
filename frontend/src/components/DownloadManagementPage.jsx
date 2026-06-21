import { fetchClientConfig } from "../utils/api.js";
import { loadAria2Settings, saveAria2Settings } from "../utils/storage.js";

const React = window.React;
const antd = window.antd;
const icons = window.icons;
const {
    Layout, Typography, Badge, Card, Form, Input, Button,
    Table, Space, message, Popconfirm, Progress, Tag
} = antd;
const {
    CloudDownloadOutlined, ReloadOutlined, PauseCircleOutlined,
    PlayCircleOutlined, DeleteOutlined, ApiOutlined, CloudServerOutlined
} = icons;

const { Content } = Layout;
const { Title, Text } = Typography;

const formatFileSize = (bytes) => {
    if (!bytes || bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB", "TB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
};

const formatSpeed = (speed) => `${formatFileSize(speed)}/s`;

export default function DownloadManagementPage() {
    const [clientConfig, setClientConfig] = React.useState({
        aria2: { configured: false, enabled: false, url: "", auto_connect: false, has_secret: false },
    });
    const [aria2Connected, setAria2Connected] = React.useState(false);
    const [aria2Loading, setAria2Loading] = React.useState(false);
    const [downloads, setDownloads] = React.useState([]);
    const [downloadsLoading, setDownloadsLoading] = React.useState(false);
    const [aria2Form] = Form.useForm();
    const autoConnectTriggeredRef = React.useRef(false);

    React.useEffect(() => {
        const savedAria2 = loadAria2Settings();
        aria2Form.setFieldsValue(savedAria2);
        loadClientConfig();
        checkConnectionStatus();
    }, []);

    React.useEffect(() => {
        if (
            clientConfig.aria2.auto_connect &&
            clientConfig.aria2.configured &&
            !aria2Connected &&
            !autoConnectTriggeredRef.current
        ) {
            autoConnectTriggeredRef.current = true;
            handleAria2ConnectFromConfig({ silent: true });
        }
    }, [clientConfig.aria2.auto_connect, clientConfig.aria2.configured, aria2Connected]);

    React.useEffect(() => {
        if (!aria2Connected) return undefined;
        const timer = window.setInterval(() => {
            loadDownloads({ silent: true });
        }, 10000);
        return () => window.clearInterval(timer);
    }, [aria2Connected]);

    const loadClientConfig = async () => {
        try {
            const config = await fetchClientConfig();
            setClientConfig(config);
            if (!aria2Form.getFieldValue("url") && config.aria2?.url) {
                aria2Form.setFieldsValue({ url: config.aria2.url });
            }
        } catch (error) {
            console.error("Load client config error:", error);
        }
    };

    const checkConnectionStatus = async () => {
        try {
            const res = await fetch("/api/webdav/status");
            const status = await res.json();
            setAria2Connected(status.aria2_connected);
            if (status.aria2_url && !aria2Form.getFieldValue("url")) {
                aria2Form.setFieldsValue({ url: status.aria2_url });
            }
            if (status.aria2_connected) {
                loadDownloads({ silent: true });
            } else {
                setDownloads([]);
            }
        } catch (error) {
            console.error("Check connection error:", error);
        }
    };

    const handleAria2Connect = async (values) => {
        setAria2Loading(true);
        const formData = new FormData();
        formData.append("aria2_url", values.url);
        formData.append("aria2_secret", values.secret || "");

        try {
            const res = await fetch("/api/aria2/connect", { method: "POST", body: formData });
            const result = await res.json();
            if (result.success) {
                saveAria2Settings(values);
                message.success("Aria2连接成功");
                setAria2Connected(true);
                loadDownloads({ silent: true });
            } else {
                message.error(result.message || "Aria2连接失败");
                setAria2Connected(false);
                setDownloads([]);
            }
        } catch (error) {
            message.error("Aria2连接异常");
            setAria2Connected(false);
            setDownloads([]);
        } finally {
            setAria2Loading(false);
        }
    };

    const handleAria2ConnectFromConfig = async ({ silent = false } = {}) => {
        setAria2Loading(true);
        try {
            const res = await fetch("/api/aria2/connect-config", { method: "POST" });
            const result = await res.json();
            if (result.success) {
                if (clientConfig.aria2?.url) {
                    aria2Form.setFieldsValue({ url: clientConfig.aria2.url });
                }
                setAria2Connected(true);
                if (!silent) {
                    message.success("已使用配置连接 Aria2");
                }
                loadDownloads({ silent: true });
            } else {
                setAria2Connected(false);
                setDownloads([]);
                if (!silent) {
                    message.error(result.message || "Aria2 配置连接失败");
                }
            }
        } catch (error) {
            setAria2Connected(false);
            setDownloads([]);
            if (!silent) {
                message.error("Aria2 配置连接异常");
            }
        } finally {
            setAria2Loading(false);
        }
    };

    const loadDownloads = async ({ silent = false } = {}) => {
        setDownloadsLoading(true);
        try {
            const res = await fetch("/api/aria2/downloads");
            const result = await res.json();
            if (result.success) {
                setDownloads(result.downloads || []);
            } else if (!silent) {
                message.error(result.message || "获取下载列表失败");
            }
        } catch (error) {
            if (!silent) {
                message.error("获取下载列表异常");
            }
        } finally {
            setDownloadsLoading(false);
        }
    };

    const doDownloadAction = async (action, gid) => {
        try {
            const res = await fetch(`/api/aria2/${action}/${gid}`, { method: action === "remove" ? "DELETE" : "POST" });
            const result = await res.json();
            if (result.success) {
                message.success("操作成功");
                loadDownloads();
            } else {
                message.error(result.message || "操作失败");
            }
        } catch (error) {
            message.error("操作异常");
        }
    };

    const downloadColumns = [
        {
            title: "文件名",
            key: "name",
            ellipsis: true,
            render: (_, record) => {
                let name = record.name || "未知文件";
                if ((!record.name || record.name === "未知文件") && record.files?.[0]?.uris?.[0]?.uri) {
                    try {
                        const urlObj = new URL(record.files[0].uris[0].uri);
                        name = decodeURIComponent(urlObj.pathname.split("/").pop() || "未知文件");
                    } catch (error) {
                        /* keep fallback */
                    }
                }
                return name;
            },
        },
        {
            title: "状态",
            dataIndex: "status",
            key: "status",
            width: 100,
            render: (status) => {
                const map = {
                    active: { color: "processing", text: "下载中" },
                    waiting: { color: "default", text: "等待中" },
                    paused: { color: "warning", text: "已暂停" },
                    error: { color: "error", text: "错误" },
                    complete: { color: "success", text: "已完成" },
                    removed: { color: "default", text: "已删除" },
                };
                const item = map[status] || { color: "default", text: status };
                return <Tag color={item.color}>{item.text}</Tag>;
            },
        },
        {
            title: "进度",
            key: "progress",
            width: 200,
            render: (_, record) => {
                const percent = record.totalLength > 0 ? Math.round((record.completedLength / record.totalLength) * 100) : 0;
                return <Progress percent={percent} size="small" status={record.status === "error" ? "exception" : record.status === "active" ? "active" : "normal"} />;
            },
        },
        {
            title: "速度",
            dataIndex: "downloadSpeed",
            key: "speed",
            width: 120,
            render: (speed) => <Text style={{ fontFamily: "monospace" }}>{formatSpeed(speed)}</Text>,
        },
        {
            title: "大小",
            dataIndex: "totalLength",
            key: "size",
            width: 120,
            render: (size) => <Text style={{ fontFamily: "monospace" }}>{formatFileSize(size)}</Text>,
        },
        {
            title: "操作",
            key: "action",
            width: 180,
            render: (_, record) => (
                <Space size="small">
                    {record.status === "active" && <Button size="small" type="primary" onClick={() => doDownloadAction("pause", record.gid)} icon={<PauseCircleOutlined />}>暂停</Button>}
                    {(record.status === "paused" || record.status === "waiting") && <Button size="small" type="primary" ghost onClick={() => doDownloadAction("resume", record.gid)} icon={<PlayCircleOutlined />}>继续</Button>}
                    <Popconfirm title="确定删除?" onConfirm={() => doDownloadAction("remove", record.gid)}>
                        <Button size="small" danger icon={<DeleteOutlined />}>删除</Button>
                    </Popconfirm>
                </Space>
            ),
        },
    ];

    return (
        <div className="webdav-page">
            <div className="webdav-page-header">
                <div>
                    <Title level={3} style={{ marginBottom: 4 }}>下载管理</Title>
                    <Text type="secondary">连接 Aria2 下载器，查看任务进度，并执行暂停、继续和删除操作。</Text>
                </div>
                <Space size="large" className="webdav-status-cluster">
                    <span><Text>Aria2:</Text><Badge status={aria2Connected ? "success" : "default"} text={aria2Connected ? "已连接" : "未连接"} style={{ marginInlineStart: 8 }} /></span>
                </Space>
            </div>

            <Content>
                <Card className="webdav-connection-card" title={<><CloudServerOutlined /> Aria2下载器</>} extra={<Badge status={aria2Connected ? "success" : "default"} text={aria2Connected ? "已连接" : "未连接"} />}>
                    <Form form={aria2Form} layout="vertical" onFinish={handleAria2Connect}>
                        <Form.Item label="Aria2 RPC URL" name="url" rules={[{ required: true, message: "请输入 Aria2 URL" }]}>
                            <Input placeholder="http://localhost:6800/jsonrpc" autoComplete="url" />
                        </Form.Item>
                        <Form.Item label="RPC Secret" name="secret">
                            <Input.Password autoComplete="current-password" />
                        </Form.Item>
                        <Space wrap>
                            <Button type="primary" htmlType="submit" icon={<ApiOutlined />} loading={aria2Loading}>连接 Aria2</Button>
                            {clientConfig.aria2.configured && (
                                <Button onClick={() => handleAria2ConnectFromConfig()} loading={aria2Loading}>
                                    使用配置连接
                                </Button>
                            )}
                        </Space>
                    </Form>
                </Card>

                <Card className="webdav-work-card" title={<><CloudDownloadOutlined /> Aria2任务</>} extra={<Button icon={<ReloadOutlined />} onClick={loadDownloads} loading={downloadsLoading} disabled={!aria2Connected}>刷新列表</Button>}>
                    <Table
                        columns={downloadColumns}
                        dataSource={downloads}
                        rowKey="gid"
                        loading={downloadsLoading}
                        pagination={false}
                        scroll={{ x: 920 }}
                        locale={{ emptyText: aria2Connected ? "暂无下载任务" : "请先连接 Aria2 下载器" }}
                    />
                </Card>
            </Content>
        </div>
    );
}
