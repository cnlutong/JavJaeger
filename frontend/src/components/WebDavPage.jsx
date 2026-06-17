import { fetchClientConfig } from "../utils/api.js";
import { loadAria2Settings, loadWebDavSettings, saveAria2Settings, saveWebDavSettings } from "../utils/storage.js";

const React = window.React;
const antd = window.antd;
const icons = window.icons;
const {
    Layout, Typography, Badge, Card, Form, Input, Button,
    Table, Breadcrumb, Switch, InputNumber, Space, message,
    Row, Col, Popconfirm, Progress, Tag
} = antd;
const {
    CloudDownloadOutlined, CloudOutlined, DownloadOutlined,
    FolderFilled, PlayCircleFilled, FileOutlined,
    ReloadOutlined, PauseCircleOutlined, PlayCircleOutlined,
    DeleteOutlined, ApiOutlined, CloudServerOutlined
} = icons;

const { Content } = Layout;
const { Title, Text } = Typography;

export default function WebDavPage() {
        const [clientConfig, setClientConfig] = React.useState({
            webdav: { configured: false, enabled: false, url: "", username: "", auto_connect: false },
            aria2: { configured: false, enabled: false, url: "", auto_connect: false, has_secret: false }
        });
        const [webdavConnected, setWebdavConnected] = React.useState(false);
        const [aria2Connected, setAria2Connected] = React.useState(false);
        const [webdavLoading, setWebdavLoading] = React.useState(false);
        const [aria2Loading, setAria2Loading] = React.useState(false);
        const [currentPath, setCurrentPath] = React.useState("/");
        const [files, setFiles] = React.useState([]);
        const [filesLoading, setFilesLoading] = React.useState(false);
        const [selectedRowKeys, setSelectedRowKeys] = React.useState([]);
        const [selectedRows, setSelectedRows] = React.useState([]);
        const [videoFilter, setVideoFilter] = React.useState(false);
        const [minFileSizeMb, setMinFileSizeMb] = React.useState(300);
        const [downloadingSelection, setDownloadingSelection] = React.useState(false);
        const [downloads, setDownloads] = React.useState([]);
        const [downloadsLoading, setDownloadsLoading] = React.useState(false);
        const [webdavForm] = Form.useForm();
        const [aria2Form] = Form.useForm();
        const autoConnectTriggeredRef = React.useRef({ webdav: false, aria2: false });

        React.useEffect(() => {
            const savedWebdav = loadWebDavSettings();
            const savedAria2 = loadAria2Settings();
            webdavForm.setFieldsValue(savedWebdav);
            aria2Form.setFieldsValue(savedAria2);
            loadClientConfig();
            checkConnectionStatus();
        }, []);

        React.useEffect(() => {
            if (
                clientConfig.webdav.auto_connect &&
                clientConfig.webdav.configured &&
                !webdavConnected &&
                !autoConnectTriggeredRef.current.webdav
            ) {
                autoConnectTriggeredRef.current.webdav = true;
                handleWebdavConnectFromConfig({ silent: true });
            }
        }, [clientConfig.webdav.auto_connect, clientConfig.webdav.configured, webdavConnected]);

        React.useEffect(() => {
            if (
                clientConfig.aria2.auto_connect &&
                clientConfig.aria2.configured &&
                !aria2Connected &&
                !autoConnectTriggeredRef.current.aria2
            ) {
                autoConnectTriggeredRef.current.aria2 = true;
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

                if (!webdavForm.getFieldValue("url") && config.webdav?.url) {
                    webdavForm.setFieldsValue({ url: config.webdav.url });
                }
                if (!webdavForm.getFieldValue("username") && config.webdav?.username) {
                    webdavForm.setFieldsValue({ username: config.webdav.username });
                }
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
                setWebdavConnected(status.webdav_connected);
                setAria2Connected(status.aria2_connected);
                if (status.webdav_url && !webdavForm.getFieldValue("url")) {
                    webdavForm.setFieldsValue({ url: status.webdav_url });
                }
                if (status.webdav_username && !webdavForm.getFieldValue("username")) {
                    webdavForm.setFieldsValue({ username: status.webdav_username });
                }
                if (status.aria2_url && !aria2Form.getFieldValue("url")) {
                    aria2Form.setFieldsValue({ url: status.aria2_url });
                }
                if (status.webdav_connected) {
                    loadFiles("/");
                } else {
                    setFiles([]);
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

        const handleWebdavConnect = async (values) => {
            setWebdavLoading(true);
            const formData = new FormData();
            formData.append("webdav_url", values.url);
            formData.append("username", values.username || "");
            formData.append("password", values.password || "");

            try {
                const res = await fetch("/api/webdav/connect", { method: "POST", body: formData });
                const result = await res.json();
                if (result.success) {
                    saveWebDavSettings(values);
                    message.success("WebDAV连接成功");
                    setWebdavConnected(true);
                    loadFiles("/");
                } else {
                    message.error(result.message || "WebDAV连接失败");
                    setWebdavConnected(false);
                    setFiles([]);
                }
            } catch (error) {
                message.error("WebDAV连接异常");
                setWebdavConnected(false);
                setFiles([]);
            } finally {
                setWebdavLoading(false);
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

        const handleWebdavConnectFromConfig = async ({ silent = false } = {}) => {
            setWebdavLoading(true);
            try {
                const res = await fetch("/api/webdav/connect-config", { method: "POST" });
                const result = await res.json();
                if (result.success) {
                    if (clientConfig.webdav?.url || clientConfig.webdav?.username) {
                        webdavForm.setFieldsValue({
                            url: clientConfig.webdav.url || "",
                            username: clientConfig.webdav.username || "",
                        });
                    }
                    setWebdavConnected(true);
                    if (!silent) {
                        message.success("已使用配置连接 WebDAV");
                    }
                    loadFiles("/");
                } else {
                    setWebdavConnected(false);
                    setFiles([]);
                    if (!silent) {
                        message.error(result.message || "WebDAV 配置连接失败");
                    }
                }
            } catch (error) {
                setWebdavConnected(false);
                setFiles([]);
                if (!silent) {
                    message.error("WebDAV 配置连接异常");
                }
            } finally {
                setWebdavLoading(false);
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

        const loadFiles = async (path) => {
            setFilesLoading(true);
            try {
                const res = await fetch(`/api/webdav/files?path=${encodeURIComponent(path)}`);
                const result = await res.json();
                if (result.success) {
                    setCurrentPath(path);
                    let fileList = [];
                    if (path !== "/") {
                        const parts = path.split("/").filter(Boolean);
                        parts.pop();
                        const parentPath = parts.length === 0 ? "/" : "/" + parts.join("/");
                        fileList.push({
                            key: "..",
                            name: "..",
                            path: parentPath,
                            is_directory: true,
                            size: 0,
                            isParent: true
                        });
                    }

                    const actualFiles = (result.files || [])
                        .sort((a, b) => {
                            if (a.is_directory && !b.is_directory) return -1;
                            if (!a.is_directory && b.is_directory) return 1;
                            return a.name.localeCompare(b.name);
                        })
                        .map((item) => ({ ...item, key: item.path }));

                    setFiles([...fileList, ...actualFiles]);
                    setSelectedRowKeys([]);
                    setSelectedRows([]);
                } else {
                    message.error(result.message || "加载文件失败");
                }
            } catch (error) {
                message.error("加载文件异常");
            } finally {
                setFilesLoading(false);
            }
        };

        const loadDownloads = async ({ silent = false } = {}) => {
            setDownloadsLoading(true);
            try {
                const res = await fetch("/api/aria2/downloads");
                const result = await res.json();
                if (result.success) {
                    setDownloads(result.downloads || []);
                } else {
                    if (!silent) {
                        message.error(result.message || "获取下载列表失败");
                    }
                }
            } catch (error) {
                if (!silent) {
                    message.error("获取下载列表异常");
                }
            } finally {
                setDownloadsLoading(false);
            }
        };

        const handleDownloadSelected = async () => {
            if (selectedRows.length === 0) return;
            if (!aria2Connected) {
                message.warning("请先连接Aria2下载器");
                return;
            }

            setDownloadingSelection(true);
            try {
                const res = await fetch("/api/webdav/download", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        files: selectedRows,
                        video_filter: videoFilter,
                        min_file_size_mb: minFileSizeMb
                    })
                });
                const result = await res.json();
                if (result.success) {
                    const successCount = result.results.filter((item) => item.success).length;
                    const failCount = result.results.filter((item) => !item.success).length;
                    if (successCount > 0) {
                        message.success(`成功添加 ${successCount} 个下载任务${failCount > 0 ? `，${failCount} 个失败` : ""}`);
                        loadDownloads();
                    } else if (failCount > 0) {
                        message.error(`${failCount} 个文件下载失败`);
                    }
                    setSelectedRowKeys([]);
                    setSelectedRows([]);
                } else {
                    message.error("批量下载失败");
                }
            } catch (error) {
                message.error("批量下载异常");
            } finally {
                setDownloadingSelection(false);
            }
        };

        const downloadSingleFile = async (record) => {
            if (!aria2Connected) {
                message.warning("请先连接Aria2下载器");
                return;
            }

            try {
                message.loading({ content: `正在添加任务: ${record.name}`, key: "webdav-download" });
                const res = await fetch("/api/webdav/download", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        files: [record],
                        video_filter: videoFilter,
                        min_file_size_mb: minFileSizeMb
                    })
                });
                const result = await res.json();
                if (result.success && result.results.length > 0) {
                    const successCount = result.results.filter((item) => item.success).length;
                    if (successCount > 0) {
                        message.success({ content: `已添加下载任务: ${record.name}`, key: "webdav-download" });
                        loadDownloads();
                    } else {
                        message.error({ content: result.results[0].message || "下载失败", key: "webdav-download" });
                    }
                } else {
                    message.error({ content: "没有可下载的文件", key: "webdav-download" });
                }
            } catch (error) {
                message.error({ content: "下载异常", key: "webdav-download" });
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

        const formatFileSize = (bytes) => {
            if (!bytes || bytes === 0) return "0 B";
            const k = 1024;
            const sizes = ["B", "KB", "MB", "GB", "TB"];
            const i = Math.floor(Math.log(bytes) / Math.log(k));
            return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
        };

        const formatSpeed = (speed) => formatFileSize(speed) + "/s";
        const isVideoFile = (filename) => {
            if (!filename) return false;
            const ext = filename.split(".").pop().toLowerCase();
            return ["mp4", "avi", "mkv", "mov", "wmv", "flv", "webm", "m4v", "ts", "mts", "mpeg", "mpg"].includes(ext);
        };

        const fileColumns = [
            {
                title: "名称",
                dataIndex: "name",
                key: "name",
                ellipsis: true,
                render: (text, record) => {
                    const isVideo = !record.is_directory && isVideoFile(record.name);
                    const isLargeVideo = isVideo && record.size >= minFileSizeMb * 1024 * 1024;
                    let iconNode;
                    if (record.is_directory) {
                        iconNode = <FolderFilled style={{ color: "#ffc107", marginRight: 8, fontSize: 16 }} />;
                    } else if (isVideo) {
                        iconNode = <PlayCircleFilled className="video-icon" style={{ marginRight: 8, fontSize: 16 }} />;
                    } else {
                        iconNode = <FileOutlined style={{ color: "#8c8c8c", marginRight: 8, fontSize: 16 }} />;
                    }

                    return (
                        <div style={{ display: "flex", alignItems: "center", width: "100%" }}>
                            <div style={{ flexShrink: 0 }}>{iconNode}</div>
                            <a
                                onClick={() => record.is_directory && loadFiles(record.path)}
                                style={{
                                    color: "inherit",
                                    fontWeight: isLargeVideo ? 600 : "normal",
                                    whiteSpace: "nowrap",
                                    overflow: "hidden",
                                    textOverflow: "ellipsis",
                                    display: "inline-block",
                                    maxWidth: "100%"
                                }}
                                title={text}
                            >
                                {text}
                            </a>
                            {isLargeVideo && <Tag color="success" style={{ marginLeft: 8 }}>视频</Tag>}
                        </div>
                    );
                }
            },
            {
                title: "类型",
                dataIndex: "is_directory",
                key: "type",
                width: 100,
                render: (isDir, record) => {
                    if (record.isParent) return "-";
                    if (isDir) return <Tag color="warning">目录</Tag>;
                    if (isVideoFile(record.name)) return <Tag color="processing">视频</Tag>;
                    return <Tag>文件</Tag>;
                }
            },
            {
                title: "大小",
                dataIndex: "size",
                key: "size",
                width: 120,
                render: (size, record) => record.is_directory ? "-" : <Text type="secondary" style={{ fontFamily: "monospace" }}>{formatFileSize(size)}</Text>
            },
            {
                title: "操作",
                key: "action",
                width: 100,
                render: (_, record) => !record.isParent ? (
                    <Button type="primary" ghost icon={<DownloadOutlined />} size="small" onClick={(e) => { e.stopPropagation(); downloadSingleFile(record); }} />
                ) : null
            }
        ];

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
                        } catch (error) {}
                    }
                    return name;
                }
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
                        removed: { color: "default", text: "已删除" }
                    };
                    const item = map[status] || { color: "default", text: status };
                    return <Tag color={item.color}>{item.text}</Tag>;
                }
            },
            {
                title: "进度",
                key: "progress",
                width: 200,
                render: (_, record) => {
                    const percent = record.totalLength > 0 ? Math.round((record.completedLength / record.totalLength) * 100) : 0;
                    return <Progress percent={percent} size="small" status={record.status === "error" ? "exception" : record.status === "active" ? "active" : "normal"} />;
                }
            },
            {
                title: "速度",
                dataIndex: "downloadSpeed",
                key: "speed",
                width: 120,
                render: (speed) => <Text style={{ fontFamily: "monospace" }}>{formatSpeed(speed)}</Text>
            },
            {
                title: "大小",
                dataIndex: "totalLength",
                key: "size",
                width: 120,
                render: (size) => <Text style={{ fontFamily: "monospace" }}>{formatFileSize(size)}</Text>
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
                )
            }
        ];

        const breadcrumbItems = currentPath.split("/").filter(Boolean).reduce((acc, part) => {
            const path = acc.length === 0 ? "/" + part : acc[acc.length - 1].path + "/" + part;
            acc.push({ title: <a onClick={() => loadFiles(path)}>{part}</a>, path });
            return acc;
        }, []);

        return (
            <div className="webdav-page">
                <div className="webdav-page-header">
                    <div>
                        <Title level={3} style={{ marginBottom: 4 }}>WebDAV 下载中心</Title>
                        <Text type="secondary">浏览网盘目录并将直链批量发送到 Aria2。</Text>
                    </div>
                    <Space size="large" className="webdav-status-cluster">
                        <span><Text>WebDAV:</Text><Badge status={webdavConnected ? "success" : "default"} text={webdavConnected ? "已连接" : "未连接"} style={{ marginInlineStart: 8 }} /></span>
                        <span><Text>Aria2:</Text><Badge status={aria2Connected ? "success" : "default"} text={aria2Connected ? "已连接" : "未连接"} style={{ marginInlineStart: 8 }} /></span>
                    </Space>
                </div>

                <Content>
                    <Row gutter={[24, 24]}>
                        <Col xs={24} md={12}>
                            <Card className="webdav-connection-card" title={<><CloudOutlined /> WebDAV服务器</>} extra={<Badge status={webdavConnected ? "success" : "default"} text={webdavConnected ? "已连接" : "未连接"} />}>
                                <Form form={webdavForm} layout="vertical" onFinish={handleWebdavConnect}>
                                    <Form.Item label="WebDAV URL" name="url" rules={[{ required: true, message: "请输入WebDAV URL" }]}>
                                        <Input placeholder="https://..." autoComplete="url" />
                                    </Form.Item>
                                    <Row gutter={16}>
                                        <Col span={12}>
                                            <Form.Item label="用户名" name="username">
                                                <Input autoComplete="username" />
                                            </Form.Item>
                                        </Col>
                                        <Col span={12}>
                                            <Form.Item label="密码" name="password">
                                                <Input.Password autoComplete="current-password" />
                                            </Form.Item>
                                        </Col>
                                    </Row>
                                    <Space wrap>
                                        <Button type="primary" htmlType="submit" icon={<ApiOutlined />} loading={webdavLoading}>连接 WebDAV</Button>
                                        {clientConfig.webdav.configured && (
                                            <Button onClick={() => handleWebdavConnectFromConfig()} loading={webdavLoading}>
                                                使用配置连接
                                            </Button>
                                        )}
                                    </Space>
                                </Form>
                            </Card>
                        </Col>
                        <Col xs={24} md={12}>
                            <Card className="webdav-connection-card" title={<><CloudServerOutlined /> Aria2下载器</>} extra={<Badge status={aria2Connected ? "success" : "default"} text={aria2Connected ? "已连接" : "未连接"} />}>
                                <Form form={aria2Form} layout="vertical" onFinish={handleAria2Connect}>
                                    <Form.Item label="Aria2 RPC URL" name="url" rules={[{ required: true, message: "请输入Aria2 URL" }]}>
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
                        </Col>
                    </Row>

                    {webdavConnected && (
                        <Card
                            className="webdav-work-card"
                            title={<><FolderFilled /> 文件浏览器</>}
                            extra={
                                <Space wrap className="webdav-toolbar">
                                    <Button icon={<ReloadOutlined />} onClick={() => loadFiles(currentPath)}>刷新</Button>
                                    <Switch checkedChildren="仅视频" unCheckedChildren="全部文件" checked={videoFilter} onChange={setVideoFilter} />
                                    <Space.Compact>
                                        <Input style={{ width: 40, pointerEvents: "none", backgroundColor: "#fafafa", borderRight: 0 }} placeholder="≥" disabled />
                                        <InputNumber min={1} max={10240} value={minFileSizeMb} onChange={setMinFileSizeMb} disabled={!videoFilter} style={{ width: 100 }} />
                                        <Input style={{ width: 50, pointerEvents: "none", backgroundColor: "#fafafa" }} placeholder="MB" disabled />
                                    </Space.Compact>
                                    <Button type="primary" icon={<DownloadOutlined />} disabled={selectedRowKeys.length === 0} onClick={handleDownloadSelected} loading={downloadingSelection}>
                                        下载选中 ({selectedRowKeys.length})
                                    </Button>
                                </Space>
                            }
                        >
                            <Breadcrumb style={{ marginBottom: 16 }}>
                                <Breadcrumb.Item><a onClick={() => loadFiles("/")}>根目录</a></Breadcrumb.Item>
                                {breadcrumbItems.map((item, idx) => (
                                    <Breadcrumb.Item key={idx}>{idx === breadcrumbItems.length - 1 ? item.title.props.children : item.title}</Breadcrumb.Item>
                                ))}
                            </Breadcrumb>

                            <Table
                                columns={fileColumns}
                                dataSource={files}
                                loading={filesLoading}
                                pagination={false}
                                scroll={{ x: 760 }}
                                rowSelection={{
                                    selectedRowKeys,
                                    onChange: (newSelectedRowKeys, newSelectedRows) => {
                                        setSelectedRowKeys(newSelectedRowKeys);
                                        setSelectedRows(newSelectedRows);
                                    },
                                    getCheckboxProps: (record) => ({ disabled: record.isParent })
                                }}
                                rowClassName={(record) => {
                                    const isLargeVideo = !record.is_directory && isVideoFile(record.name) && record.size >= minFileSizeMb * 1024 * 1024;
                                    return isLargeVideo ? "file-row-video" : "";
                                }}
                            />
                        </Card>
                    )}

                    {aria2Connected && (
                        <Card className="webdav-work-card" title={<><CloudDownloadOutlined /> 下载管理</>} extra={<Button icon={<ReloadOutlined />} onClick={loadDownloads} loading={downloadsLoading}>刷新列表</Button>}>
                            <Table columns={downloadColumns} dataSource={downloads} rowKey="gid" loading={downloadsLoading} pagination={false} scroll={{ x: 920 }} locale={{ emptyText: "暂无下载任务" }} />
                        </Card>
                    )}
                </Content>
            </div>
        );
}
