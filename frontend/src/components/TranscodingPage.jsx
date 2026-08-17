const React = window.React;
const antd = window.antd;
const icons = window.icons || {};

const {
    Alert,
    Badge,
    Button,
    Card,
    Col,
    Descriptions,
    Drawer,
    Empty,
    Popconfirm,
    Progress,
    Row,
    Segmented,
    Space,
    Statistic,
    Table,
    Tag,
    Typography,
    message,
} = antd;
const {
    CloseCircleOutlined,
    DeleteOutlined,
    EyeOutlined,
    ReloadOutlined,
    RetweetOutlined,
    VideoCameraOutlined,
} = icons;
const { Text, Title } = Typography;

const STATUS_META = {
    queued: { label: "等待中", color: "default", badge: "default" },
    running: { label: "转码中", color: "processing", badge: "processing" },
    completed: { label: "已完成", color: "success", badge: "success" },
    failed: { label: "失败", color: "error", badge: "error" },
    cancelled: { label: "已取消", color: "warning", badge: "warning" },
};

const formatBytes = (value) => {
    const bytes = Number(value) || 0;
    if (!bytes) return "0 B";
    const units = ["B", "KB", "MB", "GB", "TB"];
    const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
    return `${(bytes / (1024 ** index)).toFixed(index > 2 ? 2 : 1)} ${units[index]}`;
};

const formatDuration = (value) => {
    const seconds = Math.max(0, Number(value) || 0);
    if (seconds < 60) return `${seconds} 秒`;
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    return hours ? `${hours} 小时 ${minutes} 分` : `${minutes} 分 ${seconds % 60} 秒`;
};

const formatDateTime = (value) => value ? new Date(value).toLocaleString("zh-CN") : "-";

const parseError = (response, payload, fallback) => (
    payload?.detail?.message || payload?.message || (typeof payload?.detail === "string" ? payload.detail : "") || fallback || `HTTP ${response.status}`
);

export default function TranscodingPage() {
    const [payload, setPayload] = React.useState({ tasks: [], counts: {}, max_concurrent_tasks: 0 });
    const [capabilities, setCapabilities] = React.useState(null);
    const [loading, setLoading] = React.useState(true);
    const [filter, setFilter] = React.useState("all");
    const [selectedTask, setSelectedTask] = React.useState(null);
    const [actionTaskId, setActionTaskId] = React.useState("");

    const loadTasks = React.useCallback(async ({ silent = false } = {}) => {
        if (!silent) setLoading(true);
        try {
            const response = await fetch("/api/movies/transcoding/tasks");
            const nextPayload = await response.json();
            if (!response.ok) throw new Error(parseError(response, nextPayload, "加载转码任务失败"));
            setPayload(nextPayload);
            setSelectedTask((current) => current
                ? nextPayload.tasks?.find((task) => task.id === current.id) || current
                : null);
        } catch (error) {
            if (!silent) message.error(error.message);
        } finally {
            if (!silent) setLoading(false);
        }
    }, []);

    const loadCapabilities = React.useCallback(async () => {
        try {
            const response = await fetch("/api/movies/transcoding/presets");
            const nextPayload = await response.json();
            if (!response.ok) throw new Error(parseError(response, nextPayload, "加载转码能力失败"));
            setCapabilities(nextPayload);
        } catch (error) {
            message.error(error.message);
        }
    }, []);

    React.useEffect(() => {
        let active = true;
        Promise.all([loadTasks(), loadCapabilities()]).finally(() => {
            if (active) setLoading(false);
        });
        const timer = window.setInterval(() => loadTasks({ silent: true }), 2000);
        return () => {
            active = false;
            window.clearInterval(timer);
        };
    }, [loadTasks, loadCapabilities]);

    const runAction = async (task, action, method = "POST") => {
        setActionTaskId(task.id);
        try {
            const suffix = action ? `/${action}` : "";
            const response = await fetch(`/api/movies/transcoding/tasks/${encodeURIComponent(task.id)}${suffix}`, { method });
            const nextPayload = await response.json();
            if (!response.ok) throw new Error(parseError(response, nextPayload, "操作失败"));
            message.success(action === "cancel" ? "已提交取消请求" : action === "retry" ? "已创建重试任务" : "任务记录已删除");
            if (method === "DELETE" && selectedTask?.id === task.id) setSelectedTask(null);
            await loadTasks({ silent: true });
        } catch (error) {
            message.error(error.message);
        } finally {
            setActionTaskId("");
        }
    };

    const tasks = payload.tasks || [];
    const filteredTasks = React.useMemo(() => {
        if (filter === "active") return tasks.filter((task) => ["queued", "running"].includes(task.status));
        if (filter === "completed") return tasks.filter((task) => task.status === "completed");
        if (filter === "problem") return tasks.filter((task) => ["failed", "cancelled"].includes(task.status));
        return tasks;
    }, [tasks, filter]);
    const counts = payload.counts || {};
    const activeCount = (counts.queued || 0) + (counts.running || 0);
    const selectedGpu = capabilities?.selected_gpu;
    const gpuSummary = selectedGpu
        ? `${selectedGpu.name} · ${String(selectedGpu.backend || "GPU").toUpperCase()} · ${(selectedGpu.encoders || []).join("、")}`
        : "";

    const columns = [
        {
            title: "影片 / 文件",
            key: "movie",
            width: 420,
            render: (_, task) => (
                <div className="transcoding-task-movie">
                    <div className="transcoding-task-movie-heading">
                        <Tag color="blue">{task.movie_id}</Tag>
                        <Text
                            strong
                            className="transcoding-task-movie-title"
                            title={task.movie_title || task.movie_id}
                        >
                            {task.movie_title || task.movie_id}
                        </Text>
                    </div>
                    <Text
                        type="secondary"
                        className="transcoding-task-file-name"
                        title={task.source_path}
                    >
                        {task.file_name}
                    </Text>
                </div>
            ),
        },
        {
            title: "预设",
            dataIndex: "preset_name",
            key: "preset",
            width: 220,
            render: (value, task) => {
                const gpuLabel = [
                    task.gpu_vendor || task.gpu_name,
                    task.hardware_backend ? String(task.hardware_backend).toUpperCase() : "",
                ].filter(Boolean).join(" · ");
                return (
                    <div className="transcoding-task-preset">
                        <Text className="transcoding-task-preset-name" title={value}>{value}</Text>
                        <Text type="secondary" className="transcoding-task-codec">
                            {task.options?.video_codec} · {task.options?.quality_mode === "crf" ? `质量 ${task.options?.crf}` : `${task.options?.video_bitrate_kbps} kbps`}
                        </Text>
                        {task.gpu_name ? (
                            <Tag className="transcoding-task-gpu" color="purple" title={task.gpu_name}>
                                {gpuLabel}
                            </Tag>
                        ) : null}
                    </div>
                );
            },
        },
        {
            title: "状态",
            key: "status",
            width: 180,
            render: (_, task) => {
                const meta = STATUS_META[task.status] || STATUS_META.queued;
                return (
                    <div className="transcoding-task-status">
                        <Badge status={meta.badge} text={meta.label} />
                        <Text type="secondary" className="transcoding-task-stage">{task.stage}</Text>
                    </div>
                );
            },
        },
        {
            title: "进度",
            key: "progress",
            width: 250,
            render: (_, task) => (
                <div className="transcoding-task-progress">
                    <Progress
                        percent={Math.round(Number(task.progress) || 0)}
                        size="small"
                        status={task.status === "failed" ? "exception" : task.status === "completed" ? "success" : "active"}
                    />
                    <Text type="secondary" className="transcoding-task-progress-meta">
                        {task.speed || "-"} · 已用 {formatDuration(task.elapsed_seconds)}
                        {task.eta_seconds != null && task.status === "running" ? ` · 剩余约 ${formatDuration(task.eta_seconds)}` : ""}
                    </Text>
                </div>
            ),
        },
        {
            title: "大小",
            key: "size",
            width: 155,
            render: (_, task) => <Text type="secondary" className="transcoding-task-size">{formatBytes(task.input_size)} → {formatBytes(task.output_size)}</Text>,
        },
        {
            title: "操作",
            key: "actions",
            width: 190,
            fixed: "right",
            render: (_, task) => (
                <Space className="transcoding-task-actions" size={4} wrap>
                    <Button size="small" icon={<EyeOutlined />} onClick={() => setSelectedTask(task)}>详情</Button>
                    {["queued", "running"].includes(task.status) && (
                        <Popconfirm title="取消该转码任务？" description="取消会清理临时输出，原文件保持不变。" onConfirm={() => runAction(task, "cancel")}>
                            <Button danger size="small" icon={<CloseCircleOutlined />} loading={actionTaskId === task.id}>取消</Button>
                        </Popconfirm>
                    )}
                    {["failed", "cancelled"].includes(task.status) && (
                        <Button size="small" icon={<RetweetOutlined />} loading={actionTaskId === task.id} onClick={() => runAction(task, "retry")}>重试</Button>
                    )}
                    {["completed", "failed", "cancelled"].includes(task.status) && (
                        <Popconfirm title="删除该任务记录？" onConfirm={() => runAction(task, "", "DELETE")}>
                            <Button danger type="text" size="small" icon={<DeleteOutlined />} loading={actionTaskId === task.id} />
                        </Popconfirm>
                    )}
                </Space>
            ),
        },
    ];

    return (
        <Space direction="vertical" size="large" style={{ width: "100%" }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 16, alignItems: "flex-start", flexWrap: "wrap" }}>
                <div>
                    <Title level={3} style={{ marginBottom: 4 }}><VideoCameraOutlined /> 转码面板</Title>
                    <Text type="secondary">管理多任务 FFmpeg 转码；只保留更小的转码结果，视觉质量与省空间可按预设选择。</Text>
                </div>
                <Space wrap>
                    <Tag color="blue">并发上限 {payload.max_concurrent_tasks || capabilities?.max_concurrent_tasks || 0}</Tag>
                    <Button icon={<ReloadOutlined />} loading={loading} onClick={() => Promise.all([loadTasks(), loadCapabilities()])}>刷新</Button>
                </Space>
            </div>

            {capabilities && !capabilities.ffmpeg_available && (
                <Alert type="error" showIcon message="FFmpeg 不可用" description="服务器未检测到 ffmpeg 可执行文件，当前无法启动新任务。Docker 镜像已默认包含 FFmpeg。" />
            )}
            {capabilities?.ffmpeg_available && !capabilities.ffprobe_available && (
                <Alert type="warning" showIcon message="ffprobe 不可用" description="任务仍可执行，但进度百分比、剩余时间和完成后的媒体信息可能不完整。" />
            )}
            {capabilities?.hardware_acceleration_required && capabilities?.gpu_available && (
                <Alert
                    type="success"
                    showIcon
                    message="GPU 转码已启用"
                    description={`${gpuSummary}。系统已完成真实硬件编码探针，所有新任务只使用 GPU 视频编码，不会回退到 CPU。`}
                />
            )}
            {capabilities?.hardware_acceleration_required && !capabilities?.gpu_available && (
                <Alert
                    type="error"
                    showIcon
                    message="GPU 转码不可用"
                    description={`${capabilities?.gpu_error || "未检测到可用 GPU 硬件编码器"}。为避免 CPU 转码，新任务已被禁用。`}
                />
            )}
            {capabilities?.output_must_be_smaller && (
                <Alert type="success" showIcon message="体积保护已启用" description="转码结果必须严格小于原文件才会覆盖；相等或更大时自动保留原片。" />
            )}

            <Row gutter={[16, 16]}>
                <Col xs={12} md={6}><Card><Statistic title="活动任务" value={activeCount} valueStyle={{ color: activeCount ? "#1677ff" : undefined }} /></Card></Col>
                <Col xs={12} md={6}><Card><Statistic title="正在转码" value={counts.running || 0} /></Card></Col>
                <Col xs={12} md={6}><Card><Statistic title="已完成" value={counts.completed || 0} valueStyle={{ color: "#52c41a" }} /></Card></Col>
                <Col xs={12} md={6}><Card><Statistic title="失败 / 取消" value={(counts.failed || 0) + (counts.cancelled || 0)} valueStyle={{ color: (counts.failed || 0) ? "#ff4d4f" : undefined }} /></Card></Col>
            </Row>

            <Card>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap", marginBottom: 20 }}>
                    <Title level={5} style={{ margin: 0 }}>任务队列</Title>
                    <Segmented size="small" value={filter} onChange={setFilter} options={[
                        { label: `全部 ${tasks.length}`, value: "all" },
                        { label: `活动 ${activeCount}`, value: "active" },
                        { label: `完成 ${counts.completed || 0}`, value: "completed" },
                        { label: `异常 ${(counts.failed || 0) + (counts.cancelled || 0)}`, value: "problem" },
                    ]} />
                </div>
                <Table
                    className="transcoding-task-table"
                    rowKey="id"
                    columns={columns}
                    dataSource={filteredTasks}
                    loading={loading}
                    tableLayout="fixed"
                    scroll={{ x: 1415 }}
                    pagination={{ pageSize: 20, showSizeChanger: true }}
                    locale={{ emptyText: <Empty description="暂无转码任务；请从影视库选择影片并启动转码" /> }}
                />
            </Card>

            <Card title="可用预设包">
                <Row gutter={[12, 12]}>
                    {(capabilities?.presets || []).map((preset) => (
                        <Col xs={24} sm={12} lg={8} key={preset.id}>
                            <Card size="small" title={preset.name} extra={<Tag color={preset.available ? "success" : "error"}>{preset.available ? preset.category : "GPU 不支持"}</Tag>}>
                                <Space direction="vertical" size={4}>
                                    <Text type="secondary">{preset.description}</Text>
                                    {preset.available
                                        ? <Text type="secondary">实际编码器：{preset.options?.video_codec}</Text>
                                        : <Text type="danger">{preset.unavailable_reason || "当前 GPU 不支持该编码格式"}</Text>}
                                </Space>
                            </Card>
                        </Col>
                    ))}
                </Row>
            </Card>

            <Drawer title="转码任务详情" width={620} open={Boolean(selectedTask)} onClose={() => setSelectedTask(null)}>
                {selectedTask ? (
                    <Space direction="vertical" size="middle" style={{ width: "100%" }}>
                        <Progress percent={Math.round(Number(selectedTask.progress) || 0)} status={selectedTask.status === "failed" ? "exception" : selectedTask.status === "completed" ? "success" : "active"} />
                        {selectedTask.error && <Alert type="error" showIcon message="任务错误" description={selectedTask.error} />}
                        <Descriptions bordered size="small" column={1}>
                            <Descriptions.Item label="任务 ID"><Text copyable>{selectedTask.id}</Text></Descriptions.Item>
                            <Descriptions.Item label="影片">{selectedTask.movie_id} · {selectedTask.movie_title}</Descriptions.Item>
                            <Descriptions.Item label="文件"><Text copyable>{selectedTask.source_path}</Text></Descriptions.Item>
                            <Descriptions.Item label="状态"><Tag color={STATUS_META[selectedTask.status]?.color}>{STATUS_META[selectedTask.status]?.label}</Tag> {selectedTask.stage}</Descriptions.Item>
                            <Descriptions.Item label="预设">{selectedTask.preset_name}</Descriptions.Item>
                            <Descriptions.Item label="GPU">{selectedTask.gpu_name || "-"} · {selectedTask.hardware_backend || "-"} · {selectedTask.hardware_device || "自动"}</Descriptions.Item>
                            <Descriptions.Item label="视频">{selectedTask.options?.video_codec} · {selectedTask.options?.quality_mode === "crf" ? `质量 ${selectedTask.options?.crf}` : `${selectedTask.options?.video_bitrate_kbps} kbps`} · {selectedTask.options?.speed_preset}</Descriptions.Item>
                            <Descriptions.Item label="画面">{selectedTask.options?.max_height ? `${selectedTask.options.max_height}p 上限` : "原分辨率"} · {selectedTask.options?.frame_rate ? `${selectedTask.options.frame_rate} FPS` : "原帧率"} · {selectedTask.options?.pixel_format}</Descriptions.Item>
                            <Descriptions.Item label="音频">{selectedTask.options?.audio_codec} · {selectedTask.options?.audio_bitrate_kbps ? `${selectedTask.options.audio_bitrate_kbps} kbps` : "原码率"} · {selectedTask.options?.audio_channels ? `${selectedTask.options.audio_channels} 声道` : "原声道"}</Descriptions.Item>
                            <Descriptions.Item label="流保留">字幕 {selectedTask.options?.copy_subtitles ? "保留" : "丢弃"} · 元数据 {selectedTask.options?.copy_metadata ? "保留" : "丢弃"}</Descriptions.Item>
                            <Descriptions.Item label="创建时间">{formatDateTime(selectedTask.created_at)}</Descriptions.Item>
                            <Descriptions.Item label="开始时间">{formatDateTime(selectedTask.started_at)}</Descriptions.Item>
                            <Descriptions.Item label="完成时间">{formatDateTime(selectedTask.completed_at)}</Descriptions.Item>
                            <Descriptions.Item label="文件大小">{formatBytes(selectedTask.input_size)} → {formatBytes(selectedTask.output_size)}</Descriptions.Item>
                        </Descriptions>
                    </Space>
                ) : null}
            </Drawer>
        </Space>
    );
}
