import { fetchClientConfig } from "../utils/api.js";
import { loadWebDavSettings, saveWebDavSettings } from "../utils/storage.js";
import DirectoryInput from "./DirectoryInput.jsx";

const React = window.React;
const antd = window.antd;
const icons = window.icons;
const {
    Layout, Typography, Badge, Card, Form, Input, Button,
    Table, Breadcrumb, Switch, InputNumber, Space, message,
    Row, Col, Tag, Empty, List, Modal, Popconfirm
} = antd;
const {
    CloudOutlined, DownloadOutlined, FolderFilled, PlayCircleFilled,
    FileOutlined, ReloadOutlined, ApiOutlined, PlusOutlined,
    DatabaseOutlined, HddOutlined, DeleteOutlined, SearchOutlined,
    FolderOpenOutlined
} = icons;

const { Content } = Layout;
const { Title, Text } = Typography;

const NET_DISK_PUBLIC_KEY = "webdavNetDisksPublic";
const NET_DISK_SECRET_KEY = "webdavNetDisksSecret";

const parseJson = (value, fallback) => {
    if (!value) return fallback;
    try {
        return JSON.parse(value);
    } catch (error) {
        return fallback;
    }
};

const loadNetDiskProfiles = () => parseJson(window.localStorage.getItem(NET_DISK_PUBLIC_KEY), []);
const loadNetDiskSecrets = () => parseJson(window.sessionStorage.getItem(NET_DISK_SECRET_KEY), {});

const saveNetDiskProfiles = (profiles) => {
    window.localStorage.setItem(
        NET_DISK_PUBLIC_KEY,
        JSON.stringify(profiles.map(({ id, type, name, url, username, path }) => ({ id, type, name, url, username, path }))),
    );
};

const saveNetDiskSecret = (profileId, password) => {
    const secrets = loadNetDiskSecrets();
    secrets[profileId] = password || "";
    window.sessionStorage.setItem(NET_DISK_SECRET_KEY, JSON.stringify(secrets));
};

const buildProfileId = (url, username) => `webdav::${url || ""}::${username || ""}`;
const buildLocalFolderId = (path) => `localFolder::${path || ""}`;

const upsertNetDiskProfile = (profiles, values) => {
    const url = values.url || "";
    const username = values.username || "";
    const id = buildProfileId(url, username);
    const name = values.name || values.label || url || "WebDAV";
    const profile = { id, type: "webdav", name, url, username };
    const nextProfiles = [profile, ...profiles.filter((item) => item.id !== id)];
    saveNetDiskProfiles(nextProfiles);
    saveNetDiskSecret(id, values.password || "");
    return { profile, profiles: nextProfiles };
};

const upsertLocalFolderProfile = (profiles, values) => {
    const path = values.path || "";
    const id = buildLocalFolderId(path);
    const name = values.name || path || "本地文件夹";
    const profile = { id, type: "localFolder", name, path };
    const nextProfiles = [profile, ...profiles.filter((item) => item.id !== id)];
    saveNetDiskProfiles(nextProfiles);
    return { profile, profiles: nextProfiles };
};

const formatFileSize = (bytes) => {
    if (!bytes || bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB", "TB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
};

const isVideoFile = (filename) => {
    if (!filename) return false;
    const ext = filename.split(".").pop().toLowerCase();
    return ["mp4", "avi", "mkv", "mov", "wmv", "flv", "webm", "m4v", "ts", "mts", "mpeg", "mpg"].includes(ext);
};

export default function WebDavPage({ onOpenDownloadManagement } = {}) {
    const [clientConfig, setClientConfig] = React.useState({
        webdav: { configured: false, enabled: false, url: "", username: "", auto_connect: false },
    });
    const [netDisks, setNetDisks] = React.useState([]);
    const [activeNetDiskId, setActiveNetDiskId] = React.useState("");
    const [webdavConnected, setWebdavConnected] = React.useState(false);
    const [aria2Connected, setAria2Connected] = React.useState(false);
    const [webdavLoading, setWebdavLoading] = React.useState(false);
    const [currentPath, setCurrentPath] = React.useState("/");
    const [files, setFiles] = React.useState([]);
    const [filesLoading, setFilesLoading] = React.useState(false);
    const [selectedRowKeys, setSelectedRowKeys] = React.useState([]);
    const [selectedRows, setSelectedRows] = React.useState([]);
    const [videoFilter, setVideoFilter] = React.useState(false);
    const [minFileSizeMb, setMinFileSizeMb] = React.useState(300);
    const [fileNameFilter, setFileNameFilter] = React.useState("");
    const [netDiskModalOpen, setNetDiskModalOpen] = React.useState(false);
    const [localFolderModalOpen, setLocalFolderModalOpen] = React.useState(false);
    const [downloadingSelection, setDownloadingSelection] = React.useState(false);
    const [webdavForm] = Form.useForm();
    const [localFolderForm] = Form.useForm();
    const autoConnectTriggeredRef = React.useRef(false);

    React.useEffect(() => {
        const savedWebdav = loadWebDavSettings();
        const savedProfiles = loadNetDiskProfiles();
        const derivedProfiles = savedProfiles.length > 0
            ? savedProfiles.map((profile) => ({
                type: "webdav",
                ...profile,
                id: profile.type === "localFolder"
                    ? profile.id || buildLocalFolderId(profile.path)
                    : profile.id?.startsWith("webdav::")
                        ? profile.id
                        : buildProfileId(profile.url, profile.username || ""),
            }))
            : savedWebdav.url
                ? [{
                    id: buildProfileId(savedWebdav.url, savedWebdav.username || ""),
                    type: "webdav",
                    name: savedWebdav.url,
                    url: savedWebdav.url,
                    username: savedWebdav.username || "",
                }]
                : [];

        setNetDisks(derivedProfiles);
        webdavForm.setFieldsValue(savedWebdav);
        loadClientConfig();
        checkConnectionStatus();
    }, []);

    React.useEffect(() => {
        if (
            clientConfig.webdav.auto_connect &&
            clientConfig.webdav.configured &&
            !webdavConnected &&
            !autoConnectTriggeredRef.current
        ) {
            autoConnectTriggeredRef.current = true;
            handleWebdavConnectFromConfig({ silent: true });
        }
    }, [clientConfig.webdav.auto_connect, clientConfig.webdav.configured, webdavConnected]);

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
            if (status.webdav_connected) {
                const id = buildProfileId(status.webdav_url, status.webdav_username || "");
                setActiveNetDiskId(id);
                loadWebDavFiles("/");
            } else {
                const activeProfile = netDisks.find((item) => item.id === activeNetDiskId);
                if (!activeProfile || activeProfile.type !== "localFolder") {
                    setFiles([]);
                }
            }
        } catch (error) {
            console.error("Check connection error:", error);
        }
    };

    const connectWebdav = async (values, { saveProfile = true, silent = false } = {}) => {
        setWebdavLoading(true);
        const formData = new FormData();
        formData.append("webdav_url", values.url || "");
        formData.append("username", values.username || "");
        formData.append("password", values.password || "");

        try {
            const res = await fetch("/api/webdav/connect", { method: "POST", body: formData });
            const result = await res.json();
            if (result.success) {
                saveWebDavSettings(values);
                if (saveProfile) {
                    const { profile, profiles } = upsertNetDiskProfile(netDisks, values);
                    setNetDisks(profiles);
                    setActiveNetDiskId(profile.id);
                }
                if (!silent) {
                    message.success("WebDAV连接成功");
                }
                setWebdavConnected(true);
                setNetDiskModalOpen(false);
                await checkConnectionStatus();
                loadWebDavFiles("/");
            } else {
                if (!silent) {
                    message.error(result.message || "WebDAV连接失败");
                }
                setWebdavConnected(false);
                setFiles([]);
            }
        } catch (error) {
            if (!silent) {
                message.error("WebDAV连接异常");
            }
            setWebdavConnected(false);
            setFiles([]);
        } finally {
            setWebdavLoading(false);
        }
    };

    const handleWebdavConnect = async (values) => connectWebdav(values);

    const handleWebdavConnectFromConfig = async ({ silent = false } = {}) => {
        setWebdavLoading(true);
        try {
            const res = await fetch("/api/webdav/connect-config", { method: "POST" });
            const result = await res.json();
            if (result.success) {
                const values = {
                    name: "配置 WebDAV",
                    url: clientConfig.webdav?.url || "",
                    username: clientConfig.webdav?.username || "",
                    password: "",
                };
                if (values.url || values.username) {
                    webdavForm.setFieldsValue({ url: values.url, username: values.username });
                    const { profile, profiles } = upsertNetDiskProfile(netDisks, values);
                    setNetDisks(profiles);
                    setActiveNetDiskId(profile.id);
                }
                setWebdavConnected(true);
                if (!silent) {
                    message.success("已使用配置连接 WebDAV");
                }
                await checkConnectionStatus();
                loadWebDavFiles("/");
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

    const handleProfileConnect = async (profile) => {
        if (profile.type === "localFolder") {
            setActiveNetDiskId(profile.id);
            setWebdavConnected(false);
            await loadLocalFiles(profile.path);
            return;
        }

        const secrets = loadNetDiskSecrets();
        webdavForm.setFieldsValue({
            name: profile.name,
            url: profile.url,
            username: profile.username,
            password: secrets[profile.id] || "",
        });
        await connectWebdav(
            {
                name: profile.name,
                url: profile.url,
                username: profile.username,
                password: secrets[profile.id] || "",
            },
            { saveProfile: false },
        );
        setActiveNetDiskId(profile.id);
    };

    const handleLocalFolderAdd = async (values) => {
        if (!values.path) {
            message.warning("请选择本地文件夹");
            return;
        }
        const { profile, profiles } = upsertLocalFolderProfile(netDisks, values);
        setNetDisks(profiles);
        setActiveNetDiskId(profile.id);
        setWebdavConnected(false);
        setLocalFolderModalOpen(false);
        await loadLocalFiles(profile.path);
    };

    const openNetDiskModal = () => {
        webdavForm.setFieldsValue({ name: "", url: "", username: "", password: "" });
        setNetDiskModalOpen(true);
    };

    const openLocalFolderModal = () => {
        localFolderForm.setFieldsValue({ name: "", path: "" });
        setLocalFolderModalOpen(true);
    };

    const handleRemoveProfile = (profileId) => {
        const nextProfiles = netDisks.filter((item) => item.id !== profileId);
        const secrets = loadNetDiskSecrets();
        delete secrets[profileId];
        saveNetDiskProfiles(nextProfiles);
        window.sessionStorage.setItem(NET_DISK_SECRET_KEY, JSON.stringify(secrets));
        setNetDisks(nextProfiles);
        if (activeNetDiskId === profileId) {
            setActiveNetDiskId("");
            setWebdavConnected(false);
            setFiles([]);
            setSelectedRowKeys([]);
            setSelectedRows([]);
        }
    };

    const applyFileList = (entries, path, sourceType) => {
        const parentRows = [];
        if (path !== "/" && path !== "") {
            const activeProfile = netDisks.find((item) => item.id === activeNetDiskId);
            const isLocalRoot = activeProfile?.type === "localFolder" && activeProfile.path === path;
            if (!isLocalRoot) {
                const separator = path.includes("\\") ? "\\" : "/";
                const parts = path.split(/[\\/]/).filter(Boolean);
                parts.pop();
                const parentPath = separator === "\\"
                    ? parts.join("\\")
                    : parts.length === 0 ? "/" : `/${parts.join("/")}`;
                parentRows.push({
                    key: "..",
                    name: "..",
                    path: parentPath || path,
                    is_directory: true,
                    size: 0,
                    isParent: true,
                    source_type: sourceType,
                });
            }
        }

        const actualFiles = (entries || [])
            .sort((a, b) => {
                if (a.is_directory && !b.is_directory) return -1;
                if (!a.is_directory && b.is_directory) return 1;
                return a.name.localeCompare(b.name);
            })
            .map((item) => ({ ...item, key: item.path, source_type: sourceType }));

        setCurrentPath(path);
        setFiles([...parentRows, ...actualFiles]);
        setSelectedRowKeys([]);
        setSelectedRows([]);
        setFileNameFilter("");
    };

    const loadWebDavFiles = async (path) => {
        setFilesLoading(true);
        try {
            const res = await fetch(`/api/webdav/files?path=${encodeURIComponent(path)}`);
            const result = await res.json();
            if (result.success) {
                applyFileList(result.files || [], path, "webdav");
            } else {
                message.error(result.message || "加载文件失败");
            }
        } catch (error) {
            message.error("加载文件异常");
        } finally {
            setFilesLoading(false);
        }
    };

    const loadLocalFiles = async (path) => {
        setFilesLoading(true);
        try {
            const res = await fetch(`/api/system/files?path=${encodeURIComponent(path)}`);
            const result = await res.json();
            if (result.success) {
                applyFileList(result.entries || [], result.current_path || path, "local");
            } else {
                message.error(result.message || "加载本地文件夹失败");
            }
        } catch (error) {
            message.error("加载本地文件夹异常");
        } finally {
            setFilesLoading(false);
        }
    };

    const loadFiles = async (path) => {
        const activeProfile = netDisks.find((item) => item.id === activeNetDiskId);
        if (activeProfile?.type === "localFolder") {
            await loadLocalFiles(path);
            return;
        }
        await loadWebDavFiles(path);
    };

    const ensureAria2Ready = async () => {
        if (aria2Connected) return true;
        try {
            const res = await fetch("/api/webdav/status");
            const status = await res.json();
            const connected = !!status.aria2_connected;
            setAria2Connected(connected);
            if (connected) return true;
        } catch (error) {
            setAria2Connected(false);
        }
        message.warning("请先到下载管理页面连接 Aria2 下载器");
        if (typeof onOpenDownloadManagement === "function") {
            onOpenDownloadManagement();
        }
        return false;
    };

    const submitDownloads = async (rows) => {
        if (rows.some((row) => row.source_type === "local")) {
            message.warning("本地文件不能发送到 Aria2");
            return null;
        }
        const ready = await ensureAria2Ready();
        if (!ready || rows.length === 0) return null;

        const res = await fetch("/api/webdav/download", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                files: rows,
                video_filter: videoFilter,
                min_file_size_mb: minFileSizeMb,
            }),
        });
        return await res.json();
    };

    const handleDownloadSelected = async () => {
        if (selectedRows.length === 0) return;

        setDownloadingSelection(true);
        try {
            const result = await submitDownloads(selectedRows);
            if (!result) return;
            if (result.success) {
                const successCount = result.results.filter((item) => item.success).length;
                const failCount = result.results.filter((item) => !item.success).length;
                if (successCount > 0) {
                    message.success(`成功添加 ${successCount} 个下载任务${failCount > 0 ? `，${failCount} 个失败` : ""}`);
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
        try {
            message.loading({ content: `正在添加任务: ${record.name}`, key: "webdav-download" });
            const result = await submitDownloads([record]);
            if (!result) {
                message.destroy("webdav-download");
                return;
            }
            if (result.success && result.results.length > 0) {
                const successCount = result.results.filter((item) => item.success).length;
                if (successCount > 0) {
                    message.success({ content: `已添加下载任务: ${record.name}`, key: "webdav-download" });
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
                                maxWidth: "100%",
                            }}
                            title={text}
                        >
                            {text}
                        </a>
                        {isLargeVideo && <Tag color="success" style={{ marginLeft: 8 }}>视频</Tag>}
                    </div>
                );
            },
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
            },
        },
        {
            title: "大小",
            dataIndex: "size",
            key: "size",
            width: 120,
            render: (size, record) => record.is_directory
                ? "-"
                : <Text type="secondary" style={{ fontFamily: "monospace" }}>{formatFileSize(size)}</Text>,
        },
        {
            title: "操作",
            key: "action",
            width: 100,
            render: (_, record) => !record.isParent ? (
                <Button
                    type="primary"
                    ghost
                    icon={<DownloadOutlined />}
                    size="small"
                    disabled={record.source_type === "local"}
                    title={record.source_type === "local" ? "本地文件不能发送到 Aria2" : "下载"}
                    onClick={(event) => {
                        event.stopPropagation();
                        downloadSingleFile(record);
                    }}
                />
            ) : null,
        },
    ];

    const breadcrumbItems = currentPath.split("/").filter(Boolean).reduce((acc, part) => {
        const path = acc.length === 0 ? `/${part}` : `${acc[acc.length - 1].path}/${part}`;
        acc.push({ title: <a onClick={() => loadFiles(path)}>{part}</a>, path });
        return acc;
    }, []);

    const activeNetDisk = netDisks.find((item) => item.id === activeNetDiskId);
    const isLocalSource = activeNetDisk?.type === "localFolder";
    const resourceReady = isLocalSource || webdavConnected;
    const normalizedFileNameFilter = fileNameFilter.trim().toLowerCase();
    const visibleFiles = normalizedFileNameFilter
        ? files.filter((item) => item.isParent || item.name.toLowerCase().includes(normalizedFileNameFilter))
        : files;

    return (
        <div className="webdav-page">
            <div className="webdav-page-header webdav-page-header-compact">
                <div>
                    <Title level={3} style={{ marginBottom: 4 }}>网盘管理</Title>
                    <Text type="secondary">{resourceReady ? activeNetDisk?.name || "当前来源" : "选择 WebDAV 网盘或本地文件夹开始浏览"}</Text>
                </div>
                <Space wrap>
                    <Badge status={resourceReady ? "success" : "default"} text={resourceReady ? "已选择" : "未选择"} />
                    <Button type="primary" icon={<PlusOutlined />} onClick={openNetDiskModal}>新增网盘</Button>
                    <Button icon={<FolderOpenOutlined />} onClick={openLocalFolderModal}>新增本地文件夹</Button>
                </Space>
            </div>

            <Content>
                <Row gutter={[24, 24]}>
                    <Col xs={24} lg={7} xl={6}>
                        <Card
                            className="webdav-work-card webdav-netdisk-card"
                            title={<><DatabaseOutlined /> 来源</>}
                            extra={
                                <Space size={4}>
                                    <Button type="text" size="small" icon={<PlusOutlined />} title="新增网盘" onClick={openNetDiskModal} />
                                    <Button type="text" size="small" icon={<FolderOpenOutlined />} title="新增本地文件夹" onClick={openLocalFolderModal} />
                                </Space>
                            }
                        >
                            {netDisks.length === 0 ? (
                                <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无来源" />
                            ) : (
                                <List
                                    className="webdav-netdisk-list"
                                    dataSource={netDisks}
                                    renderItem={(item) => (
                                        <List.Item className={activeNetDiskId === item.id && (webdavConnected || item.type === "localFolder") ? "is-active" : ""}>
                                            <button type="button" className="webdav-netdisk-row" onClick={() => handleProfileConnect(item)}>
                                                {item.type === "localFolder" ? <FolderOpenOutlined className="webdav-netdisk-icon" /> : <CloudOutlined className="webdav-netdisk-icon" />}
                                                <span className="webdav-netdisk-copy">
                                                    <Text strong ellipsis>{item.name || item.path || item.url}</Text>
                                                    <Text type="secondary" ellipsis>
                                                        {item.type === "localFolder" ? `本地文件夹 · ${item.path}` : item.username ? `WebDAV · ${item.username} @ ${item.url}` : `WebDAV · ${item.url}`}
                                                    </Text>
                                                </span>
                                                {activeNetDiskId === item.id && (webdavConnected || item.type === "localFolder") && <Badge status="success" />}
                                            </button>
                                            <Popconfirm title="删除该网盘?" onConfirm={() => handleRemoveProfile(item.id)}>
                                                <Button type="text" size="small" danger icon={<DeleteOutlined />} title="删除" />
                                            </Popconfirm>
                                        </List.Item>
                                    )}
                                />
                            )}
                            {clientConfig.webdav.configured && (
                                <Button block icon={<ApiOutlined />} onClick={() => handleWebdavConnectFromConfig()} loading={webdavLoading}>
                                    连接配置网盘
                                </Button>
                            )}
                        </Card>
                    </Col>

                    <Col xs={24} lg={17} xl={18}>
                        <Card
                            className="webdav-work-card"
                            title={<><HddOutlined /> 资源管理器</>}
                            extra={
                                <Space wrap className="webdav-toolbar">
                                    <Button icon={<ReloadOutlined />} onClick={() => loadFiles(currentPath)} disabled={!resourceReady}>刷新</Button>
                                    <Switch checkedChildren="仅视频" unCheckedChildren="全部文件" checked={videoFilter} onChange={setVideoFilter} />
                                    <Space.Compact>
                                        <Input style={{ width: 40, pointerEvents: "none", backgroundColor: "#fafafa", borderRight: 0 }} placeholder="≥" disabled />
                                        <InputNumber min={1} max={10240} value={minFileSizeMb} onChange={setMinFileSizeMb} disabled={!videoFilter} style={{ width: 100 }} />
                                        <Input style={{ width: 50, pointerEvents: "none", backgroundColor: "#fafafa" }} placeholder="MB" disabled />
                                    </Space.Compact>
                                    <Button
                                        type="primary"
                                        icon={<DownloadOutlined />}
                                        disabled={selectedRowKeys.length === 0 || selectedRows.some((row) => row.source_type === "local")}
                                        onClick={handleDownloadSelected}
                                        loading={downloadingSelection}
                                    >
                                        下载选中 ({selectedRowKeys.length})
                                    </Button>
                                </Space>
                            }
                        >
                            {!resourceReady ? (
                                <Empty description="请选择 WebDAV 网盘或本地文件夹" />
                            ) : (
                                <>
                                    <div className="webdav-explorer-topbar">
                                        <Breadcrumb>
                                            <Breadcrumb.Item><a onClick={() => loadFiles("/")}>根目录</a></Breadcrumb.Item>
                                            {breadcrumbItems.map((item, idx) => (
                                                <Breadcrumb.Item key={idx}>{idx === breadcrumbItems.length - 1 ? item.title.props.children : item.title}</Breadcrumb.Item>
                                            ))}
                                        </Breadcrumb>
                                        <Input
                                            allowClear
                                            prefix={<SearchOutlined />}
                                            placeholder="搜索当前目录"
                                            value={fileNameFilter}
                                            onChange={(event) => setFileNameFilter(event.target.value)}
                                            className="webdav-file-search"
                                        />
                                    </div>

                                    <Table
                                        columns={fileColumns}
                                        dataSource={visibleFiles}
                                        loading={filesLoading}
                                        pagination={false}
                                        scroll={{ x: 760 }}
                                        rowSelection={{
                                            selectedRowKeys,
                                            onChange: (newSelectedRowKeys, newSelectedRows) => {
                                                setSelectedRowKeys(newSelectedRowKeys);
                                                setSelectedRows(newSelectedRows);
                                            },
                                            getCheckboxProps: (record) => ({ disabled: record.isParent || record.source_type === "local" }),
                                        }}
                                        rowClassName={(record) => {
                                            const isLargeVideo = !record.is_directory && isVideoFile(record.name) && record.size >= minFileSizeMb * 1024 * 1024;
                                            return isLargeVideo ? "file-row-video" : "";
                                        }}
                                        locale={{ emptyText: fileNameFilter ? "没有匹配文件" : "当前目录为空" }}
                                    />
                                </>
                            )}
                        </Card>
                    </Col>
                </Row>
            </Content>

            <Modal
                title="新增网盘"
                open={netDiskModalOpen}
                onCancel={() => setNetDiskModalOpen(false)}
                footer={null}
                destroyOnClose={false}
                width={520}
            >
                <Form form={webdavForm} layout="vertical" onFinish={handleWebdavConnect}>
                    <Form.Item label="名称" name="name">
                        <Input placeholder="家庭 NAS / 云盘" autoComplete="off" />
                    </Form.Item>
                    <Form.Item label="WebDAV URL" name="url" rules={[{ required: true, message: "请输入 WebDAV URL" }]}>
                        <Input placeholder="https://..." autoComplete="url" />
                    </Form.Item>
                    <Row gutter={16}>
                        <Col xs={24} sm={12}>
                            <Form.Item label="用户名" name="username">
                                <Input autoComplete="username" />
                            </Form.Item>
                        </Col>
                        <Col xs={24} sm={12}>
                            <Form.Item label="密码" name="password">
                                <Input.Password autoComplete="current-password" />
                            </Form.Item>
                        </Col>
                    </Row>
                    <Space wrap>
                        <Button type="primary" htmlType="submit" icon={<ApiOutlined />} loading={webdavLoading}>连接并添加</Button>
                        <Button onClick={() => setNetDiskModalOpen(false)}>取消</Button>
                    </Space>
                </Form>
            </Modal>

            <Modal
                title="新增本地文件夹"
                open={localFolderModalOpen}
                onCancel={() => setLocalFolderModalOpen(false)}
                footer={null}
                destroyOnClose={false}
                width={560}
            >
                <Form form={localFolderForm} layout="vertical" onFinish={handleLocalFolderAdd}>
                    <Form.Item label="名称" name="name">
                        <Input placeholder="本地影片目录 / 下载目录" autoComplete="off" />
                    </Form.Item>
                    <Form.Item label="本地路径" name="path" rules={[{ required: true, message: "请选择本地文件夹" }]}>
                        <DirectoryInput placeholder="选择服务端可访问的本地文件夹" />
                    </Form.Item>
                    <Space wrap>
                        <Button type="primary" htmlType="submit" icon={<FolderOpenOutlined />}>添加并浏览</Button>
                        <Button onClick={() => setLocalFolderModalOpen(false)}>取消</Button>
                    </Space>
                </Form>
            </Modal>
        </div>
    );
}
