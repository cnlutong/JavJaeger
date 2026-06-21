import {
    createAutomationTask,
    deleteAutomationTask,
    fetchAutomationTasks,
    runAutomationTask,
    updateAutomationTask,
} from "../utils/api.js";

const React = window.React;
const antd = window.antd;
const icons = window.icons || {};

const {
    Button,
    Card,
    Divider,
    Empty,
    Form,
    Input,
    InputNumber,
    List,
    Popconfirm,
    Select,
    Space,
    Switch,
    Table,
    Tag,
    Typography,
    message,
} = antd;
const { Text, Title } = Typography;
const {
    ClockCircleOutlined,
    DeleteOutlined,
    DownloadOutlined,
    LinkOutlined,
    PlusOutlined,
    PlayCircleOutlined,
    SaveOutlined,
    SearchOutlined,
    ThunderboltOutlined,
} = icons;

const Icon = ({ as: Component }) => Component ? <Component /> : null;
const NODE_WIDTH = 196;
const NODE_HEIGHT = 84;
const NODE_GAP = 52;
const NODE_MIN_X = 48;
const NODE_MIN_Y = 92;
const NODE_TYPE_ORDER = ["trigger", "search", "magnet", "download"];
const MAGNET_SOURCE_LABELS = {
    javbus: "JavBus",
    cilisousuo: "Cilisousuo",
    yhg007: "YHG007",
};
const FILTER_TYPE_LABELS = { genre: "类别", star: "演员" };

const NODE_META = {
    trigger: { title: "触发", icon: ThunderboltOutlined, className: "automation-node-trigger" },
    search: { title: "检索", icon: SearchOutlined, className: "automation-node-search" },
    magnet: { title: "磁力", icon: LinkOutlined, className: "automation-node-magnet" },
    download: { title: "下载", icon: DownloadOutlined, className: "automation-node-download" },
};

const buildDefaultTask = () => ({
    name: "新的自动任务",
    enabled: false,
    trigger: { type: "auto", scheduled_time: null, interval_minutes: 60 },
    nodes: [
        { id: "trigger", type: "trigger", position: { x: 48, y: 110 }, config: {} },
        {
            id: "search",
            type: "search",
            position: { x: 296, y: 110 },
            config: { mode: "keyword", keyword: "", max_results: 10, filters: [], magnet: "exist", type: "normal", skip_existing: true },
        },
        {
            id: "magnet",
            type: "magnet",
            position: { x: 544, y: 110 },
            config: { source: "javbus", has_subtitle: undefined, exclude_4k: false, allow_chinese_subtitles: true },
        },
        { id: "download", type: "download", position: { x: 792, y: 110 }, config: { tool: "pikpak" } },
    ],
    edges: [
        { id: "edge-trigger-search", source: "trigger", target: "search" },
        { id: "edge-search-magnet", source: "search", target: "magnet" },
        { id: "edge-magnet-download", source: "magnet", target: "download" },
    ],
    runs: [],
});

const getAutoLayoutOrder = (nodes = [], edges = []) => {
    const nodeMap = new Map(nodes.map(node => [node.id, node]));
    const incoming = new Map(nodes.map(node => [node.id, 0]));
    const outgoing = new Map(nodes.map(node => [node.id, []]));

    edges.forEach(edge => {
        if (!nodeMap.has(edge.source) || !nodeMap.has(edge.target)) {
            return;
        }
        incoming.set(edge.target, (incoming.get(edge.target) || 0) + 1);
        outgoing.get(edge.source).push(edge.target);
    });

    const rankNode = (node) => {
        const typeRank = NODE_TYPE_ORDER.indexOf(node.type);
        return typeRank === -1 ? NODE_TYPE_ORDER.length : typeRank;
    };
    const queue = nodes
        .filter(node => (incoming.get(node.id) || 0) === 0)
        .sort((first, second) => rankNode(first) - rankNode(second));
    const ordered = [];
    const seen = new Set();

    while (queue.length > 0) {
        const node = queue.shift();
        if (!node || seen.has(node.id)) {
            continue;
        }
        seen.add(node.id);
        ordered.push(node);

        outgoing.get(node.id).forEach(targetId => {
            incoming.set(targetId, (incoming.get(targetId) || 0) - 1);
            if ((incoming.get(targetId) || 0) <= 0 && nodeMap.has(targetId)) {
                queue.push(nodeMap.get(targetId));
                queue.sort((first, second) => rankNode(first) - rankNode(second));
            }
        });
    }

    nodes
        .filter(node => !seen.has(node.id))
        .sort((first, second) => rankNode(first) - rankNode(second))
        .forEach(node => ordered.push(node));
    return ordered;
};

const statusColor = (status) => {
    if (status === "success") return "green";
    if (status === "partial") return "gold";
    if (status === "failed") return "red";
    if (status === "running") return "blue";
    return "default";
};

const triggerLabel = (trigger) => {
    if (!trigger || trigger.type === "auto") return "自动运行";
    if (trigger.type === "scheduled") return `定时 ${trigger.scheduled_time || "00:00"}`;
    return `间隔 ${trigger.interval_minutes || 60} 分钟`;
};

export default function AutomationPage() {
    const [tasks, setTasks] = React.useState([]);
    const [currentTask, setCurrentTask] = React.useState(buildDefaultTask());
    const [selectedNodeId, setSelectedNodeId] = React.useState("search");
    const [loading, setLoading] = React.useState(false);
    const [saving, setSaving] = React.useState(false);
    const [running, setRunning] = React.useState(false);
    const [dragState, setDragState] = React.useState(null);
    const [categoryGroups, setCategoryGroups] = React.useState({});
    const [actorGroups, setActorGroups] = React.useState({});
    const canvasRef = React.useRef(null);

    React.useEffect(() => {
        void loadTasks();
        void loadFilterCatalogs();
    }, []);

    React.useEffect(() => {
        if (!dragState) return undefined;
        const handleMove = (event) => {
            const rect = canvasRef.current?.getBoundingClientRect();
            if (!rect) return;
            const x = Math.max(16, Math.min(rect.width - 220, event.clientX - rect.left - dragState.offsetX));
            const y = Math.max(70, Math.min(rect.height - 96, event.clientY - rect.top - dragState.offsetY));
            updateNode(dragState.nodeId, { position: { x, y } });
        };
        const handleUp = () => setDragState(null);
        window.addEventListener("pointermove", handleMove);
        window.addEventListener("pointerup", handleUp);
        return () => {
            window.removeEventListener("pointermove", handleMove);
            window.removeEventListener("pointerup", handleUp);
        };
    }, [dragState, currentTask]);

    const loadTasks = async () => {
        setLoading(true);
        try {
            const payload = await fetchAutomationTasks();
            const nextTasks = payload.tasks || [];
            setTasks(nextTasks);
            if (nextTasks.length > 0 && !currentTask.id) {
                setCurrentTask(nextTasks[0]);
                setSelectedNodeId(nextTasks[0].nodes?.[1]?.id || "search");
            }
        } catch (error) {
            message.error("加载自动任务失败");
        } finally {
            setLoading(false);
        }
    };

    const loadFilterCatalogs = async () => {
        try {
            const [categoryPayload, actorPayload] = await Promise.all([
                fetch("/static/categories.json").then(response => response.json()),
                fetch("/static/actors.json").then(response => response.json()),
            ]);
            setCategoryGroups(categoryPayload || {});
            setActorGroups(actorPayload || {});
        } catch (error) {
            message.warning("筛选预览数据加载失败");
        }
    };

    const updateTaskField = (field, value) => {
        setCurrentTask(prev => ({ ...prev, [field]: value }));
    };

    const updateTrigger = (patch) => {
        setCurrentTask(prev => ({ ...prev, trigger: { ...(prev.trigger || {}), ...patch } }));
    };

    const updateNode = (nodeId, patch) => {
        setCurrentTask(prev => ({
            ...prev,
            nodes: (prev.nodes || []).map(node => node.id === nodeId ? { ...node, ...patch } : node),
        }));
    };

    const updateNodeConfig = (nodeId, patch) => {
        setCurrentTask(prev => ({
            ...prev,
            nodes: (prev.nodes || []).map(node => (
                node.id === nodeId ? { ...node, config: { ...(node.config || {}), ...patch } } : node
            )),
        }));
    };

    const categorySelectOptions = React.useMemo(() => Object.entries(categoryGroups || {}).map(([groupName, items]) => ({
        label: groupName,
        options: (Array.isArray(items) ? items : []).map(item => ({
            label: item.name || item.code,
            value: item.code,
            filterType: "genre",
        })),
    })), [categoryGroups]);

    const actorSelectOptions = React.useMemo(() => Object.values(actorGroups || {}).flatMap(items => (
        Array.isArray(items) ? items : []
    )).map(item => ({
        label: item.name || item.code,
        value: item.code,
        filterType: "star",
    })), [actorGroups]);

    const filterOptionMap = React.useMemo(() => {
        const nextMap = new Map();
        categorySelectOptions.forEach(group => {
            (group.options || []).forEach(option => nextMap.set(`genre:${option.value}`, option));
        });
        actorSelectOptions.forEach(option => nextMap.set(`star:${option.value}`, option));
        return nextMap;
    }, [categorySelectOptions, actorSelectOptions]);

    const getSearchFilters = (config = {}) => {
        if (Array.isArray(config.filters)) {
            return config.filters.filter(item => item && item.type && item.value);
        }
        if (config.filter_type && config.filter_value) {
            return [{ type: config.filter_type, value: config.filter_value, label: config.filter_label || config.filter_value }];
        }
        return [];
    };

    const getSelectedFilterValues = (config, type) => getSearchFilters(config)
        .filter(item => item.type === type)
        .map(item => item.value);

    const setSelectedFilterValues = (type, values) => {
        if (!selectedNode) {
            return;
        }
        const existingFilters = getSearchFilters(selectedNode.config).filter(item => item.type !== type);
        const selectedFilters = (values || []).map(value => {
            const option = filterOptionMap.get(`${type}:${value}`);
            return {
                type,
                value,
                label: option?.label || value,
            };
        });
        updateNodeConfig(selectedNode.id, {
            filters: [...existingFilters, ...selectedFilters],
            filter_type: undefined,
            filter_value: undefined,
            filter_label: undefined,
        });
    };

    const handleAutoLayout = () => {
        const rect = canvasRef.current?.getBoundingClientRect();
        const canvasWidth = Math.max(rect?.width || 1040, 760);
        const canvasHeight = Math.max(rect?.height || 450, 360);

        setCurrentTask(prev => {
            const nodes = prev.nodes || [];
            const orderedNodes = getAutoLayoutOrder(nodes, prev.edges || []);
            if (orderedNodes.length === 0) {
                return prev;
            }
            const totalWidth = orderedNodes.length * NODE_WIDTH + Math.max(0, orderedNodes.length - 1) * NODE_GAP;
            const startX = Math.max(NODE_MIN_X, Math.round((canvasWidth - totalWidth) / 2));
            const y = Math.max(NODE_MIN_Y, Math.round((canvasHeight - NODE_HEIGHT) / 2));
            const positionMap = new Map(
                orderedNodes.map((node, index) => [
                    node.id,
                    {
                        x: startX + index * (NODE_WIDTH + NODE_GAP),
                        y,
                    },
                ])
            );
            return {
                ...prev,
                nodes: nodes.map(node => ({
                    ...node,
                    position: positionMap.get(node.id) || node.position,
                })),
            };
        });
        message.success("已自动排版");
    };

    const handleNewTask = () => {
        const task = buildDefaultTask();
        setCurrentTask(task);
        setSelectedNodeId("search");
    };

    const handleSelectTask = (task) => {
        setCurrentTask(task);
        setSelectedNodeId(task.nodes?.[1]?.id || task.nodes?.[0]?.id || "search");
    };

    const handleSave = async () => {
        if (!currentTask.name?.trim()) {
            message.warning("请输入任务名称");
            return;
        }
        setSaving(true);
        try {
            const payload = {
                name: currentTask.name.trim(),
                enabled: !!currentTask.enabled,
                trigger: currentTask.trigger,
                nodes: currentTask.nodes,
                edges: currentTask.edges,
            };
            const saved = currentTask.id
                ? await updateAutomationTask(currentTask.id, payload)
                : await createAutomationTask(payload);
            setCurrentTask(saved);
            await loadTasks();
            message.success("自动任务已保存");
        } catch (error) {
            message.error("保存自动任务失败");
        } finally {
            setSaving(false);
        }
    };

    const handleRun = async () => {
        if (!currentTask.id) {
            message.warning("请先保存任务");
            return;
        }
        setRunning(true);
        try {
            const run = await runAutomationTask(currentTask.id);
            message[run.status === "failed" ? "error" : "success"](`运行完成：派发 ${run.dispatched_count || 0} 个任务`);
            await loadTasks();
            const refreshed = await fetchAutomationTasks();
            const latest = (refreshed.tasks || []).find(task => task.id === currentTask.id);
            if (latest) setCurrentTask(latest);
        } catch (error) {
            message.error("运行自动任务失败");
        } finally {
            setRunning(false);
        }
    };

    const handleDelete = async () => {
        if (!currentTask.id) {
            handleNewTask();
            return;
        }
        try {
            await deleteAutomationTask(currentTask.id);
            message.success("自动任务已删除");
            const payload = await fetchAutomationTasks();
            const nextTasks = payload.tasks || [];
            setTasks(nextTasks);
            setCurrentTask(nextTasks[0] || buildDefaultTask());
        } catch (error) {
            message.error("删除自动任务失败");
        }
    };

    const selectedNode = (currentTask.nodes || []).find(node => node.id === selectedNodeId) || currentTask.nodes?.[0];
    const nodeMap = Object.fromEntries((currentTask.nodes || []).map(node => [node.id, node]));

    const renderEdges = () => (
        <svg className="automation-flow-lines">
            {(currentTask.edges || []).map(edge => {
                const source = nodeMap[edge.source];
                const target = nodeMap[edge.target];
                if (!source || !target) return null;
                const x1 = (source.position?.x || 0) + 196;
                const y1 = (source.position?.y || 0) + 42;
                const x2 = target.position?.x || 0;
                const y2 = (target.position?.y || 0) + 42;
                const mid = x1 + Math.max(48, (x2 - x1) / 2);
                return (
                    <path
                        key={edge.id}
                        d={`M ${x1} ${y1} C ${mid} ${y1}, ${mid} ${y2}, ${x2} ${y2}`}
                    />
                );
            })}
        </svg>
    );

    const renderNodeSummary = (node) => {
        if (node.type === "trigger") return triggerLabel(currentTask.trigger);
        if (node.type === "search") {
            const mode = node.config?.mode || "keyword";
            if (mode === "codes") return "番号列表";
            if (mode === "filter") return `${node.config?.filter_type || "筛选"}:${node.config?.filter_value || "-"}`;
            return node.config?.keyword || "关键词";
        }
        if (node.type === "magnet") return MAGNET_SOURCE_LABELS[node.config?.source || "javbus"] || node.config?.source || "JavBus";
        if (node.config?.tool === "aria2") return "Aria2";
        if (node.config?.tool === "115") return "115网盘";
        return "PikPak";
    };

    const renderInspector = () => {
        if (!selectedNode) return <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} />;
        const config = selectedNode.config || {};
        if (selectedNode.type === "trigger") {
            return (
                <Form layout="vertical" className="automation-inspector-form">
                    <Form.Item label="触发条件">
                        <Select value={currentTask.trigger?.type || "auto"} onChange={(type) => updateTrigger({ type })}>
                            <Select.Option value="auto">自动运行</Select.Option>
                            <Select.Option value="scheduled">定时运行</Select.Option>
                            <Select.Option value="interval">间隔运行</Select.Option>
                        </Select>
                    </Form.Item>
                    {currentTask.trigger?.type === "scheduled" && (
                        <Form.Item label="每天时间">
                            <Input
                                value={currentTask.trigger?.scheduled_time || "00:00"}
                                placeholder="09:30"
                                onChange={(event) => updateTrigger({ scheduled_time: event.target.value })}
                            />
                        </Form.Item>
                    )}
                    {currentTask.trigger?.type === "interval" && (
                        <Form.Item label="间隔分钟">
                            <InputNumber
                                min={1}
                                max={10080}
                                value={currentTask.trigger?.interval_minutes || 60}
                                onChange={(value) => updateTrigger({ interval_minutes: value || 60 })}
                                style={{ width: "100%" }}
                            />
                        </Form.Item>
                    )}
                </Form>
            );
        }
        if (selectedNode.type === "search") {
            return (
                <Form layout="vertical" className="automation-inspector-form">
                    <Form.Item label="检索方式">
                        <Select value={config.mode || "keyword"} onChange={(mode) => updateNodeConfig(selectedNode.id, { mode })}>
                            <Select.Option value="keyword">关键词</Select.Option>
                            <Select.Option value="codes">番号列表</Select.Option>
                            <Select.Option value="filter">标签筛选</Select.Option>
                        </Select>
                    </Form.Item>
                    {config.mode === "codes" ? (
                        <Form.Item label="番号">
                            <Input.TextArea
                                rows={5}
                                value={config.codes || ""}
                                placeholder="ABP-123, ABP-124"
                                onChange={(event) => updateNodeConfig(selectedNode.id, { codes: event.target.value })}
                            />
                        </Form.Item>
                    ) : config.mode === "filter" ? (
                        <>
                            <div className="automation-filter-builder">
                                <Form.Item label="类别预览与选择">
                                    <Select
                                        mode="multiple"
                                        allowClear
                                        showSearch
                                        optionFilterProp="label"
                                        placeholder="预览并选择一个或多个类别"
                                        value={getSelectedFilterValues(config, "genre")}
                                        options={categorySelectOptions}
                                        onChange={(values) => setSelectedFilterValues("genre", values)}
                                    />
                                </Form.Item>
                                <Form.Item label="演员预览与选择">
                                    <Select
                                        mode="multiple"
                                        allowClear
                                        showSearch
                                        optionFilterProp="label"
                                        placeholder="预览并选择一个或多个演员"
                                        value={getSelectedFilterValues(config, "star")}
                                        options={actorSelectOptions}
                                        onChange={(values) => setSelectedFilterValues("star", values)}
                                    />
                                </Form.Item>
                                <div className="automation-filter-summary">
                                    {getSearchFilters(config).length > 0 ? getSearchFilters(config).map(filter => (
                                        <Tag key={`${filter.type}:${filter.value}`} color={filter.type === "star" ? "magenta" : "cyan"}>
                                            {FILTER_TYPE_LABELS[filter.type] || filter.type}: {filter.label || filter.value}
                                        </Tag>
                                    )) : <Text type="secondary">尚未选择筛选条件</Text>}
                                </div>
                            </div>
                        </>
                    ) : (
                        <Form.Item label="关键词">
                            <Input value={config.keyword || ""} onChange={(event) => updateNodeConfig(selectedNode.id, { keyword: event.target.value })} />
                        </Form.Item>
                    )}
                    <Form.Item label="最大筛选结果">
                        <Select value={config.max_results || 10} onChange={(max_results) => updateNodeConfig(selectedNode.id, { max_results })}>
                            <Select.Option value={10}>10</Select.Option>
                            <Select.Option value={20}>20</Select.Option>
                            <Select.Option value={50}>50</Select.Option>
                            <Select.Option value={100}>100</Select.Option>
                            <Select.Option value={200}>200</Select.Option>
                            <Select.Option value="all">全部</Select.Option>
                        </Select>
                    </Form.Item>
                    <Form.Item label="磁力条件">
                        <Select value={config.magnet || "exist"} onChange={(magnet) => updateNodeConfig(selectedNode.id, { magnet })}>
                            <Select.Option value="exist">仅有磁力</Select.Option>
                            <Select.Option value="all">全部影片</Select.Option>
                        </Select>
                    </Form.Item>
                    <Form.Item label="跳过已存在">
                        <Switch checked={config.skip_existing !== false} onChange={(checked) => updateNodeConfig(selectedNode.id, { skip_existing: checked })} />
                    </Form.Item>
                </Form>
            );
        }
        if (selectedNode.type === "magnet") {
            return (
                <Form layout="vertical" className="automation-inspector-form">
                    <Form.Item label="来源">
                        <Select value={config.source || "javbus"} onChange={(source) => updateNodeConfig(selectedNode.id, { source })}>
                            <Select.Option value="javbus">JavBus</Select.Option>
                            <Select.Option value="cilisousuo">Cilisousuo</Select.Option>
                            <Select.Option value="yhg007">YHG007</Select.Option>
                        </Select>
                    </Form.Item>
                    <Form.Item label="字幕过滤">
                        <Select allowClear value={config.has_subtitle} onChange={(has_subtitle) => updateNodeConfig(selectedNode.id, { has_subtitle })}>
                            <Select.Option value="true">只要字幕</Select.Option>
                            <Select.Option value="false">不要字幕</Select.Option>
                        </Select>
                    </Form.Item>
                    <Form.Item label="排除 4K">
                        <Switch checked={!!config.exclude_4k} onChange={(checked) => updateNodeConfig(selectedNode.id, { exclude_4k: checked })} />
                    </Form.Item>
                    <Form.Item label="允许中文字幕">
                        <Switch checked={config.allow_chinese_subtitles !== false} onChange={(checked) => updateNodeConfig(selectedNode.id, { allow_chinese_subtitles: checked })} />
                    </Form.Item>
                </Form>
            );
        }
        return (
            <Form layout="vertical" className="automation-inspector-form">
                <Form.Item label="下载方式">
                    <Select value={config.tool || "pikpak"} onChange={(tool) => updateNodeConfig(selectedNode.id, { tool })}>
                        <Select.Option value="pikpak">PikPak</Select.Option>
                        <Select.Option value="115">115网盘</Select.Option>
                        <Select.Option value="aria2">Aria2</Select.Option>
                    </Select>
                </Form.Item>
            </Form>
        );
    };

    const runColumns = [
        { title: "时间", dataIndex: "started_at", width: 170 },
        { title: "状态", dataIndex: "status", width: 90, render: (value) => <Tag color={statusColor(value)}>{value || "-"}</Tag> },
        { title: "检索", dataIndex: "found_count", width: 70 },
        { title: "磁力", dataIndex: "magnet_count", width: 70 },
        { title: "派发", dataIndex: "dispatched_count", width: 70 },
        { title: "跳过", dataIndex: "skipped_count", width: 70 },
        { title: "错误", dataIndex: "error", ellipsis: true },
    ];

    return (
        <div className="automation-page">
            <aside className="automation-sidebar">
                <div className="automation-sidebar-header">
                    <Title level={5}>自动模式</Title>
                    <Button type="primary" size="small" icon={<Icon as={PlusOutlined} />} onClick={handleNewTask}>新建</Button>
                </div>
                <List
                    loading={loading}
                    dataSource={tasks}
                    locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无任务" /> }}
                    renderItem={(task) => (
                        <List.Item
                            className={`automation-task-item ${currentTask.id === task.id ? "is-active" : ""}`}
                            onClick={() => handleSelectTask(task)}
                        >
                            <div>
                                <Text strong>{task.name}</Text>
                                <div className="automation-task-meta">
                                    <Tag color={task.enabled ? "green" : "default"}>{task.enabled ? "已启用" : "未启用"}</Tag>
                                    <span>{triggerLabel(task.trigger)}</span>
                                </div>
                            </div>
                        </List.Item>
                    )}
                />
            </aside>

            <main className="automation-main">
                <section className="automation-toolbar">
                    <Space align="center" wrap>
                        <Input
                            className="automation-name-input"
                            value={currentTask.name}
                            onChange={(event) => updateTaskField("name", event.target.value)}
                            placeholder="任务名称"
                        />
                        <Switch
                            checked={!!currentTask.enabled}
                            checkedChildren="启用"
                            unCheckedChildren="停用"
                            onChange={(checked) => updateTaskField("enabled", checked)}
                        />
                        <Tag icon={<Icon as={ClockCircleOutlined} />} color="blue">{triggerLabel(currentTask.trigger)}</Tag>
                    </Space>
                    <Space>
                        <Button className="automation-layout-button" onClick={handleAutoLayout}>自动排版</Button>
                        <Button icon={<Icon as={PlayCircleOutlined} />} onClick={handleRun} loading={running}>运行</Button>
                        <Button type="primary" icon={<Icon as={SaveOutlined} />} onClick={handleSave} loading={saving}>保存</Button>
                        <Popconfirm title="删除这个自动任务？" okText="删除" cancelText="取消" onConfirm={handleDelete}>
                            <Button danger icon={<Icon as={DeleteOutlined} />}>删除</Button>
                        </Popconfirm>
                    </Space>
                </section>

                <section className="automation-workbench">
                    <div className="automation-canvas" ref={canvasRef}>
                        {renderEdges()}
                        {(currentTask.nodes || []).map(node => {
                            const meta = NODE_META[node.type] || NODE_META.search;
                            return (
                                <button
                                    key={node.id}
                                    type="button"
                                    className={`automation-node ${meta.className} ${selectedNodeId === node.id ? "is-selected" : ""}`}
                                    style={{ left: node.position?.x || 0, top: node.position?.y || 0 }}
                                    onClick={() => setSelectedNodeId(node.id)}
                                    onPointerDown={(event) => {
                                        const rect = event.currentTarget.getBoundingClientRect();
                                        setSelectedNodeId(node.id);
                                        setDragState({
                                            nodeId: node.id,
                                            offsetX: event.clientX - rect.left,
                                            offsetY: event.clientY - rect.top,
                                        });
                                    }}
                                >
                                    <span className="automation-node-icon"><Icon as={meta.icon} /></span>
                                    <span className="automation-node-body">
                                        <strong>{meta.title}</strong>
                                        <em>{renderNodeSummary(node)}</em>
                                    </span>
                                </button>
                            );
                        })}
                    </div>
                    <aside className="automation-inspector">
                        <Card size="small" title={selectedNode ? NODE_META[selectedNode.type]?.title : "节点"}>
                            {renderInspector()}
                        </Card>
                    </aside>
                </section>

                <section className="automation-runs">
                    <Card size="small" title="运行记录">
                        <Table
                            size="small"
                            rowKey="id"
                            columns={runColumns}
                            dataSource={currentTask.runs || []}
                            pagination={{ pageSize: 5, hideOnSinglePage: true }}
                            locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无运行记录" /> }}
                        />
                    </Card>
                </section>
            </main>
        </div>
    );
}
