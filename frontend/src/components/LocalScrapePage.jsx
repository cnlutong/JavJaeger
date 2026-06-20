import {
    deleteLocalScrapeTaskTemplate,
    loadLocalScrapeTaskTemplates,
    saveLocalScrapeTaskTemplate,
} from "../utils/localScrapeTemplates.mjs";
import {
    LOCAL_SCRAPE_NAMING_FIELDS,
    LOCAL_SCRAPE_NAMING_SEPARATORS,
    buildTemplateFromParts,
    getNamingField,
    getNamingSeparator,
    moveTemplatePart,
    parseTemplateToParts,
} from "../utils/localScrapeNamingTemplates.mjs";
import {
    getDeletableNonConformingLocalScrapeKeys,
    getVisibleLocalScrapeItems,
    isConformingLocalScrapeItem,
} from "../utils/localScrapeResults.mjs";
import DirectoryInput from "./DirectoryInput.jsx";

const React = window.React;
const antd = window.antd;
const icons = window.icons || {};

const {
    Alert,
    Button,
    Card,
    Checkbox,
    Divider,
    Drawer,
    Form,
    Input,
    InputNumber,
    Popconfirm,
    Progress,
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
    CheckCircleOutlined,
    CloseOutlined,
    DeleteOutlined,
    DragOutlined,
    FileSearchOutlined,
    FolderOpenOutlined,
    PlayCircleOutlined,
    SaveOutlined,
    SettingOutlined,
    WarningOutlined,
} = icons;

const Icon = ({ as: Component }) => Component ? <Component /> : null;
const LOCAL_SCRAPE_ACTIVE_TASK_KEY = "localScrapeActiveTask";

const postJson = async (url, body) => {
    const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
    });
    const data = await response.json();
    if (!response.ok) {
        throw new Error(data.message || `HTTP ${response.status}`);
    }
    return data;
};

const formatBytes = (bytes) => {
    if (!bytes) return "-";
    const units = ["B", "KB", "MB", "GB", "TB"];
    let value = bytes;
    let index = 0;
    while (value >= 1024 && index < units.length - 1) {
        value /= 1024;
        index += 1;
    }
    return `${value.toFixed(index === 0 ? 0 : 1)} ${units[index]}`;
};

const statusTag = (item) => {
    if (item.target_exists) {
        return <Tag color="red" icon={<Icon as={WarningOutlined} />}>冲突</Tag>;
    }
    if (item.scrape_status === "found") {
        return <Tag color="green" icon={<Icon as={CheckCircleOutlined} />}>已匹配</Tag>;
    }
    if (item.scrape_status === "recognized") {
        return <Tag color="blue">已识别</Tag>;
    }
    if (item.scrape_status === "unrecognized") {
        return <Tag color="orange">未识别</Tag>;
    }
    if (item.scrape_status === "not_found") {
        return <Tag color="volcano">未找到</Tag>;
    }
    if (item.scrape_status === "failed") {
        return <Tag color="red">失败</Tag>;
    }
    return <Tag>待处理</Tag>;
};

const genreTags = (genres) => {
    const values = Array.isArray(genres) ? genres.filter(Boolean) : [];
    if (!values.length) {
        return null;
    }
    const visible = values.slice(0, 6);
    const hiddenCount = values.length - visible.length;
    return (
        <div className="jav-local-genre-tags">
            {visible.map((genre, index) => (
                <Tag color="geekblue" key={`${genre}-${index}`}>{genre}</Tag>
            ))}
            {hiddenCount > 0 && <Tag>+{hiddenCount}</Tag>}
        </div>
    );
};

export default function LocalScrapePage() {
    const [form] = Form.useForm();
    const [preview, setPreview] = React.useState(null);
    const [selectedRowKeys, setSelectedRowKeys] = React.useState([]);
    const [loadingPreview, setLoadingPreview] = React.useState(false);
    const [loadingApply, setLoadingApply] = React.useState(false);
    const [loadingDelete, setLoadingDelete] = React.useState(false);
    const [showNonConforming, setShowNonConforming] = React.useState(false);
    const [tablePageSize, setTablePageSize] = React.useState(12);
    const [applyResult, setApplyResult] = React.useState(null);
    const [taskTemplates, setTaskTemplates] = React.useState(() => loadLocalScrapeTaskTemplates());
    const [activeTask, setActiveTask] = React.useState(null);
    const [selectedTemplateId, setSelectedTemplateId] = React.useState("");
    const [templateName, setTemplateName] = React.useState("");
    const [templateDesignerOpen, setTemplateDesignerOpen] = React.useState(false);
    const [conflictCompareItem, setConflictCompareItem] = React.useState(null);
    const [conflictResolutions, setConflictResolutions] = React.useState({});
    const [templateDesignerTarget, setTemplateDesignerTarget] = React.useState("folderTemplate");
    const [templateDesignerParts, setTemplateDesignerParts] = React.useState(() => parseTemplateToParts("{code} {title}"));
    const overwriteExisting = Form.useWatch("overwriteExisting", form);

    const allItems = preview?.items || [];
    const items = getVisibleLocalScrapeItems(allItems, showNonConforming);
    const selectedItems = allItems.filter((item) => selectedRowKeys.includes(item.source_path) && isConformingLocalScrapeItem(item));
    const selectedDeleteItems = allItems.filter((item) => selectedRowKeys.includes(item.source_path) && !isConformingLocalScrapeItem(item));
    const nonConformingCount = allItems.length - allItems.filter(isConformingLocalScrapeItem).length;
    const selectedTemplate = taskTemplates.find((template) => template.id === selectedTemplateId) || null;
    const taskTemplateOptions = taskTemplates.map((template) => ({
        value: template.id,
        label: template.name,
    }));
    const conflictResolutionLabels = {
        keep_source: "保留源文件并覆盖目标",
        keep_target: "保留目标文件",
    };
    const templateDesignerTitle = templateDesignerTarget === "folderTemplate" ? "文件夹模板" : "文件命名模板";
    const templateDesignerPreview = buildTemplateFromParts(templateDesignerParts, { allowEmpty: true });

    React.useEffect(() => {
        setTaskTemplates(loadLocalScrapeTaskTemplates());
        try {
            const savedTask = JSON.parse(window.sessionStorage.getItem(LOCAL_SCRAPE_ACTIVE_TASK_KEY) || "null");
            if (savedTask?.taskId && savedTask?.type) {
                setActiveTask(savedTask);
                setLoadingPreview(savedTask.type === "preview");
                setLoadingApply(savedTask.type === "apply");
            }
        } catch (error) {
            window.sessionStorage.removeItem(LOCAL_SCRAPE_ACTIVE_TASK_KEY);
        }
    }, []);

    React.useEffect(() => {
        if (!activeTask?.taskId) {
            return undefined;
        }

        let stopped = false;
        let terminalHandled = false;
        const pollTask = async () => {
            if (terminalHandled) {
                return;
            }
            try {
                const response = await fetch(`/api/movies/local-scrape/jobs/${encodeURIComponent(activeTask.taskId)}`, { cache: "no-store" });
                const data = await response.json();
                if (!response.ok) {
                    throw new Error(data.detail || `HTTP ${response.status}`);
                }
                if (stopped) {
                    return;
                }

                const nextTask = {
                    ...activeTask,
                    status: data.status,
                    phase: data.phase,
                    percent: data.percent || 0,
                    completed: data.completed || 0,
                    total: data.total || 0,
                    message: data.message || "",
                    logs: data.logs || [],
                    result: data.result || null,
                    error: data.error || null,
                };
                setActiveTask(nextTask);

                if (data.status === "running") {
                    window.sessionStorage.setItem(LOCAL_SCRAPE_ACTIVE_TASK_KEY, JSON.stringify({
                        taskId: activeTask.taskId,
                        type: activeTask.type,
                    }));
                    return;
                }

                terminalHandled = true;
                window.sessionStorage.removeItem(LOCAL_SCRAPE_ACTIVE_TASK_KEY);
                setLoadingPreview(false);
                setLoadingApply(false);
                if (data.result) {
                    if (activeTask.type === "preview") {
                        handlePreviewResult(data.result);
                    } else {
                        handleApplyResult(data.result);
                    }
                } else {
                    message.error(data.message || "刮削任务失败");
                }
            } catch (error) {
                if (!stopped) {
                    setActiveTask((current) => current ? { ...current, status: "failed", message: error.message } : current);
                    window.sessionStorage.removeItem(LOCAL_SCRAPE_ACTIVE_TASK_KEY);
                    setLoadingPreview(false);
                    setLoadingApply(false);
                    message.error(`刮削任务状态读取失败：${error.message}`);
                }
            }
        };

        pollTask();
        const timer = window.setInterval(pollTask, 1000);
        return () => {
            stopped = true;
            window.clearInterval(timer);
        };
    }, [activeTask?.taskId, activeTask?.type]);

    const buildDefaultTemplateName = (values) => {
        const directoryName = String(values.directory || "")
            .split(/[\\/]/)
            .filter(Boolean)
            .pop();
        return directoryName ? `刮削：${directoryName}` : "本地刮削任务";
    };

    const buildPayload = (values) => ({
        directory: values.directory,
        recursive: values.recursive !== false,
        max_depth: values.maxDepth ?? null,
        scrape: values.scrape !== false,
        concurrent: values.concurrent || 3,
        organize: values.organize !== false,
        target_directory: values.targetDirectory || null,
        folder_template: values.folderTemplate === null || values.folderTemplate === undefined
            ? null
            : String(values.folderTemplate).trim(),
        naming_template: String(values.namingTemplate || "").trim(),
        write_nfo: values.writeNfo !== false,
        download_images: values.downloadImages !== false,
        download_sample_images: !!values.downloadSampleImages,
        download_actor_images: !!values.downloadActorImages,
        download_list_thumbnail: !!values.downloadListThumbnail,
        overwrite_existing: !!values.overwriteExisting,
    });

    const applyTemplateToForm = (template) => {
        if (!template) {
            return;
        }
        form.setFieldsValue(template.values);
        setSelectedTemplateId(template.id);
        setTemplateName(template.name);
    };

    const handleTemplateSelect = (templateId) => {
        const template = taskTemplates.find((item) => item.id === templateId);
        applyTemplateToForm(template);
    };

    const startLocalScrapeTask = async (type, payload) => {
        const endpoint = type === "apply"
            ? "/api/movies/local-scrape/apply/jobs"
            : "/api/movies/local-scrape/preview/jobs";
        const data = await postJson(endpoint, payload);
        const task = {
            taskId: data.task_id,
            type,
            status: "running",
            phase: "queued",
            percent: 0,
            completed: 0,
            total: 0,
            message: "任务已提交，正在后台运行",
            logs: [],
            result: null,
        };
        window.sessionStorage.setItem(LOCAL_SCRAPE_ACTIVE_TASK_KEY, JSON.stringify({ taskId: task.taskId, type }));
        setActiveTask(task);
        return task;
    };

    const handlePreviewResult = (data) => {
        if (!data.success) {
            message.error(data.message || "扫描失败");
            setPreview(null);
            return;
        }
        setPreview(data);
        setConflictCompareItem(null);
        setConflictResolutions({});
        const selectable = (data.items || [])
            .filter((item) => isConformingLocalScrapeItem(item) && !item.target_exists && !item.target_duplicate)
            .map((item) => item.source_path);
        setSelectedRowKeys(selectable);
        message.success(`扫描完成：${data.total_files} 个视频，${data.found_count} 个匹配成功`);
    };

    const handleApplyResult = (data) => {
        setApplyResult(data);
        if (data.success) {
            message.success(`刮削完成：${data.success_count} 个文件，自动入库 ${data.library_recorded_count || 0} 个`);
        } else {
            message.warning(`部分完成：成功 ${data.success_count}，失败 ${data.failed_count}，自动入库 ${data.library_recorded_count || 0}`);
        }
    };

    const handleSaveTemplate = async () => {
        try {
            const values = await form.validateFields();
            const saved = saveLocalScrapeTaskTemplate(
                window.localStorage,
                templateName || buildDefaultTemplateName(values),
                values,
                { existingId: selectedTemplateId },
            );
            const templates = loadLocalScrapeTaskTemplates();
            setTaskTemplates(templates);
            setSelectedTemplateId(saved.id);
            setTemplateName(saved.name);
            message.success("刮削任务模板已保存");
        } catch (error) {
            if (!error?.errorFields) {
                message.error(`保存模板失败：${error.message}`);
            }
        }
    };

    const handleRunTemplate = async () => {
        if (!selectedTemplate) {
            message.warning("请先选择一个刮削任务模板");
            return;
        }
        applyTemplateToForm(selectedTemplate);
        await handlePreview(selectedTemplate.values);
    };

    const handleDeleteTemplate = () => {
        if (!selectedTemplateId) {
            return;
        }
        const templates = deleteLocalScrapeTaskTemplate(window.localStorage, selectedTemplateId);
        setTaskTemplates(templates);
        setSelectedTemplateId("");
        setTemplateName("");
        message.success("刮削任务模板已删除");
    };

    const openTemplateDesigner = (fieldName) => {
        const currentTemplate = form.getFieldValue(fieldName);
        setTemplateDesignerTarget(fieldName);
        setTemplateDesignerParts(parseTemplateToParts(currentTemplate, { allowEmpty: true }));
        setTemplateDesignerOpen(true);
    };

    const closeTemplateDesigner = () => {
        setTemplateDesignerOpen(false);
    };

    const addTemplatePart = (part) => {
        setTemplateDesignerParts((currentParts) => [...currentParts, part]);
    };

    const removeTemplatePart = (index) => {
        setTemplateDesignerParts((currentParts) => {
            const nextParts = currentParts.slice();
            nextParts.splice(index, 1);
            return nextParts;
        });
    };

    const resetTemplateDesigner = () => {
        setTemplateDesignerParts(parseTemplateToParts("{code} {title}"));
    };

    const writeTemplateDesignerValue = () => {
        if (templateDesignerTarget === "namingTemplate" && !templateDesignerPreview) {
            message.warning("文件命名模板不能为空，请至少添加一个命名卡片");
            return;
        }
        form.setFieldValue(templateDesignerTarget, templateDesignerPreview);
        setTemplateDesignerOpen(false);
    };

    const startPaletteDrag = (event, part) => {
        event.dataTransfer.setData("application/x-javjaeger-template-part", JSON.stringify({ source: "palette", part }));
        event.dataTransfer.effectAllowed = "copy";
    };

    const startSelectedPartDrag = (event, index) => {
        event.dataTransfer.setData("application/x-javjaeger-template-part", JSON.stringify({ source: "selected", index }));
        event.dataTransfer.effectAllowed = "move";
    };

    const readDraggedTemplatePart = (event) => {
        try {
            return JSON.parse(event.dataTransfer.getData("application/x-javjaeger-template-part"));
        } catch (error) {
            return null;
        }
    };

    const handleTemplateDrop = (event, targetIndex = null) => {
        event.preventDefault();
        const payload = readDraggedTemplatePart(event);
        if (!payload) {
            return;
        }
        if (payload.source === "palette" && payload.part) {
            setTemplateDesignerParts((currentParts) => {
                const nextParts = currentParts.slice();
                const insertIndex = targetIndex === null ? nextParts.length : Math.max(0, Math.min(nextParts.length, targetIndex));
                nextParts.splice(insertIndex, 0, payload.part);
                return nextParts;
            });
            return;
        }
        if (payload.source === "selected") {
            setTemplateDesignerParts((currentParts) => moveTemplatePart(currentParts, payload.index, targetIndex ?? currentParts.length - 1));
        }
    };

    const renderTemplateDesignerPart = (part) => {
        if (part.type === "field") {
            const field = getNamingField(part.id);
            return field ? field.label : part.id;
        }
        if (part.type === "separator") {
            const separator = getNamingSeparator(part.id);
            return separator ? separator.label : part.id;
        }
        return part.value;
    };

    const isResolvableConflict = (item) => Boolean(
        item?.target_exists
        && !item?.target_duplicate
        && item?.source_file
        && item?.target_file,
    );

    const getConflictResolution = (item) => conflictResolutions[item?.source_path] || "";

    const updateConflictResolution = (item, resolution) => {
        if (!item?.source_path) {
            return;
        }
        setConflictResolutions((current) => ({
            ...current,
            [item.source_path]: resolution,
        }));
        if (isConformingLocalScrapeItem(item)) {
            setSelectedRowKeys((currentKeys) => currentKeys.includes(item.source_path)
                ? currentKeys
                : [...currentKeys, item.source_path]);
        }
        setConflictCompareItem(null);
    };

    const renderConflictFileDetail = (title, file) => (
        <Card size="small" title={title}>
            <Space direction="vertical" size={4} style={{ width: "100%" }}>
                <Text strong ellipsis={{ tooltip: file?.file_name || "-" }}>{file?.file_name || "-"}</Text>
                <Text copyable ellipsis={{ tooltip: file?.path || "-" }} style={{ maxWidth: "100%" }}>
                    {file?.path || "-"}
                </Text>
                <Text type="secondary">大小：{formatBytes(file?.size)}</Text>
                <Text type="secondary">修改时间：{file?.modified_at || "-"}</Text>
                <Text type="secondary">扩展名：{file?.extension || "-"}</Text>
            </Space>
        </Card>
    );

    const handlePreview = async (values) => {
        setLoadingPreview(true);
        setApplyResult(null);
        setSelectedRowKeys([]);
        try {
            await startLocalScrapeTask("preview", buildPayload(values));
            message.success("刮削预览已在后台启动");
        } catch (error) {
            message.error(`扫描启动失败：${error.message}`);
            setLoadingPreview(false);
        }
    };

    const handleApply = async () => {
        let values;
        try {
            values = await form.validateFields();
        } catch (error) {
            message.warning("请先补全刮削设置");
            return;
        }
        const unresolvedConflicts = selectedItems.filter((item) => (
            isResolvableConflict(item)
            && !overwriteExisting
            && !getConflictResolution(item)
        ));
        if (unresolvedConflicts.length > 0) {
            message.warning("请先比较冲突文件，并选择保留源文件或目标文件");
            setConflictCompareItem(unresolvedConflicts[0]);
            return;
        }
        const payload = {
            ...buildPayload(values),
            items: selectedItems.map((item) => ({
                source_path: item.source_path,
                code: item.code,
                metadata: item.metadata,
                conflict_resolution: getConflictResolution(item) || null,
            })),
        };
        setLoadingApply(true);
        try {
            await startLocalScrapeTask("apply", payload);
            message.success("刮削执行已在后台启动");
        } catch (error) {
            message.error(`执行启动失败：${error.message}`);
            setLoadingApply(false);
        }
    };

    const handleSelectNonConforming = () => {
        const keys = getDeletableNonConformingLocalScrapeKeys(allItems);
        setShowNonConforming(true);
        setSelectedRowKeys(keys);
        if (keys.length === 0) {
            message.info("没有可删除的不符合要求文件");
        }
    };

    const handleDeleteNonConforming = async () => {
        const sourcePaths = selectedDeleteItems.map((item) => item.source_path);
        if (!preview?.directory || sourcePaths.length === 0) {
            message.warning("请先选择不符合要求的文件");
            return;
        }
        setLoadingDelete(true);
        try {
            const data = await postJson("/api/movies/local-scrape/delete", {
                directory: preview.directory,
                source_paths: sourcePaths,
            });
            const deletedPaths = new Set((data.results || [])
                .filter((result) => result.success)
                .map((result) => result.source_path));
            setPreview((current) => {
                if (!current) {
                    return current;
                }
                const remainingItems = (current.items || []).filter((item) => !deletedPaths.has(item.source_path));
                return {
                    ...current,
                    total_files: remainingItems.length,
                    recognized_count: remainingItems.filter((item) => item.code).length,
                    found_count: remainingItems.filter(isConformingLocalScrapeItem).length,
                    already_scraped_count: remainingItems.filter((item) => item.already_scraped).length,
                    conflict_count: remainingItems.filter((item) => item.target_exists).length,
                    items: remainingItems,
                };
            });
            setSelectedRowKeys((currentKeys) => currentKeys.filter((key) => !deletedPaths.has(key)));
            if (data.failed_count) {
                message.warning(`已删除 ${data.deleted_count} 个文件，${data.failed_count} 个失败`);
            } else {
                message.success(`已删除 ${data.deleted_count} 个不符合要求文件`);
            }
        } catch (error) {
            message.error(`删除失败：${error.message}`);
        } finally {
            setLoadingDelete(false);
        }
    };

    const renderActiveTaskPanel = () => {
        if (!activeTask) {
            return null;
        }
        const logs = Array.isArray(activeTask.logs) ? activeTask.logs.slice(-12) : [];
        const statusText = activeTask.status === "running"
            ? "运行中"
            : activeTask.status === "success"
                ? "已完成"
                : "失败";
        return (
            <Card size="small" className="jav-local-task-card" title={`后台任务：${activeTask.type === "apply" ? "执行刮削" : "生成预览"}`}>
                <Space direction="vertical" style={{ width: "100%" }} size={8}>
                    <Space wrap>
                        <Tag color={activeTask.status === "failed" ? "red" : activeTask.status === "success" ? "green" : "processing"}>
                            {statusText}
                        </Tag>
                        <Text type="secondary">{activeTask.phase || "queued"}</Text>
                        {activeTask.total > 0 && <Text type="secondary">{activeTask.completed}/{activeTask.total}</Text>}
                    </Space>
                    <Progress
                        percent={activeTask.percent || 0}
                        status={activeTask.status === "failed" ? "exception" : activeTask.status === "success" ? "success" : "active"}
                    />
                    <Text>{activeTask.message || "任务正在后台运行"}</Text>
                    {logs.length > 0 && (
                        <div className="jav-local-task-log">
                            {logs.map((entry, index) => (
                                <div key={`${entry.time || "log"}-${index}`}>
                                    <Text type="secondary">{entry.time ? entry.time.slice(11, 19) : "--:--:--"}</Text>
                                    <Text>{entry.message}</Text>
                                </div>
                            ))}
                        </div>
                    )}
                </Space>
            </Card>
        );
    };

    const columns = [
        {
            title: "状态",
            key: "status",
            width: 104,
            render: (_, item) => statusTag(item),
        },
        {
            title: "文件",
            dataIndex: "file_name",
            key: "file_name",
            render: (_, item) => (
                <Space direction="vertical" size={0}>
                    <Text strong>{item.file_name}</Text>
                    <Text type="secondary" style={{ fontSize: 12 }}>{formatBytes(item.file_size)}</Text>
                </Space>
            ),
        },
        {
            title: "番号",
            dataIndex: "code",
            key: "code",
            width: 120,
            render: (code) => code ? <Tag color="blue">{code}</Tag> : <Text type="secondary">-</Text>,
        },
        {
            title: "刮削标题",
            key: "title",
            render: (_, item) => (
                <Space direction="vertical" size={0}>
                    <Text ellipsis={{ tooltip: item.metadata?.title }} style={{ maxWidth: 420 }}>
                        {item.metadata?.title || "-"}
                    </Text>
                    {item.metadata?.date && <Text type="secondary" style={{ fontSize: 12 }}>{item.metadata.date}</Text>}
                    {genreTags(item.metadata?.genres)}
                </Space>
            ),
        },
        {
            title: "目标路径",
            dataIndex: "target_video_path",
            key: "target_video_path",
            render: (path, item) => (
                <Space direction="vertical" size={0}>
                    <Text copyable ellipsis={{ tooltip: path }} style={{ maxWidth: 520 }}>{path}</Text>
                    {item.already_scraped && <Text type="secondary" style={{ fontSize: 12 }}>已有 NFO 和封面</Text>}
                    {item.target_exists && (
                        <Space size={6} wrap>
                            <Text type="danger" style={{ fontSize: 12 }}>目标文件已存在</Text>
                            {isResolvableConflict(item) && (
                                <Button size="small" onClick={() => setConflictCompareItem(item)}>
                                    比较文件
                                </Button>
                            )}
                            {getConflictResolution(item) && (
                                <Tag color="gold">{conflictResolutionLabels[getConflictResolution(item)]}</Tag>
                            )}
                        </Space>
                    )}
                </Space>
            ),
        },
    ];

    return (
        <div className="jav-local-scrape">
            <div className="jav-local-layout">
                <section className="jav-local-settings">
                    <Card
                        title={<><Icon as={FolderOpenOutlined} /> 本地刮削</>}
                        size="small"
                        className="jav-tool-card"
                    >
                        <Form
                            form={form}
                            layout="vertical"
                            initialValues={{
                                recursive: true,
                                scrape: true,
                                organize: true,
                                folderTemplate: "{code} {title}",
                                namingTemplate: "{code} {title}",
                                concurrent: 3,
                                writeNfo: true,
                                downloadImages: true,
                                downloadSampleImages: false,
                                downloadActorImages: false,
                                downloadListThumbnail: false,
                                overwriteExisting: false,
                            }}
                            onFinish={handlePreview}
                        >
                            <div className="jav-local-template-panel">
                                <Form.Item label="任务模板">
                                    <Space.Compact block>
                                        <Select
                                            value={selectedTemplateId || undefined}
                                            placeholder="选择已保存的刮削任务"
                                            options={taskTemplateOptions}
                                            onChange={handleTemplateSelect}
                                            notFoundContent="暂无模板"
                                        />
                                        <Button
                                            type="primary"
                                            htmlType="button"
                                            icon={<Icon as={PlayCircleOutlined} />}
                                            disabled={!selectedTemplateId}
                                            loading={loadingPreview}
                                            onClick={handleRunTemplate}
                                        >
                                            运行
                                        </Button>
                                        <Popconfirm
                                            title="删除这个刮削任务模板？"
                                            okText="删除"
                                            cancelText="取消"
                                            disabled={!selectedTemplateId}
                                            onConfirm={handleDeleteTemplate}
                                        >
                                            <Button
                                                danger
                                                htmlType="button"
                                                icon={<Icon as={DeleteOutlined} />}
                                                disabled={!selectedTemplateId}
                                            />
                                        </Popconfirm>
                                    </Space.Compact>
                                </Form.Item>
                                <Form.Item label="模板名称">
                                    <Space.Compact block>
                                        <Input
                                            value={templateName}
                                            placeholder="例如：下载目录入库"
                                            onChange={(event) => setTemplateName(event.target.value)}
                                        />
                                        <Button htmlType="button" icon={<Icon as={SaveOutlined} />} onClick={handleSaveTemplate}>
                                            保存
                                        </Button>
                                    </Space.Compact>
                                </Form.Item>
                            </div>
                            <Form.Item
                                name="directory"
                                label="扫描目录"
                                rules={[{ required: true, message: "请输入要扫描的目录路径" }]}
                            >
                                <DirectoryInput placeholder="Windows: D:\\Downloads\\JAV  /  Linux: /media/JAV 或 ~/Videos/JAV" />
                            </Form.Item>
                            <Form.Item name="targetDirectory" label="整理目标目录">
                                <DirectoryInput placeholder="留空则在原目录内整理；也可输入 /data/JAV 或 D:\\Media\\JAV" />
                            </Form.Item>
                            <Form.Item label="文件夹模板">
                                <Space.Compact block>
                                    <Form.Item name="folderTemplate" noStyle>
                                        <Input placeholder="{code} {title} / {actor}/{year}/{title} / {studio}/{code} {title}" />
                                    </Form.Item>
                                    <Button
                                        htmlType="button"
                                        icon={<Icon as={SettingOutlined} />}
                                        onClick={() => openTemplateDesigner("folderTemplate")}
                                    >
                                        设置
                                    </Button>
                                </Space.Compact>
                            </Form.Item>
                            <Form.Item
                                label="文件命名模板"
                                required
                            >
                                <Space.Compact block>
                                    <Form.Item
                                        name="namingTemplate"
                                        noStyle
                                        rules={[
                                            {
                                                validator: (_, value) => String(value || "").trim()
                                                    ? Promise.resolve()
                                                    : Promise.reject(new Error("文件命名模板不能为空")),
                                            },
                                        ]}
                                    >
                                        <Input placeholder="{code} {title}" />
                                    </Form.Item>
                                    <Button
                                        htmlType="button"
                                        icon={<Icon as={SettingOutlined} />}
                                        onClick={() => openTemplateDesigner("namingTemplate")}
                                    >
                                        设置
                                    </Button>
                                </Space.Compact>
                            </Form.Item>
                            <Space wrap>
                                <Form.Item name="recursive" valuePropName="checked">
                                    <Checkbox>递归扫描</Checkbox>
                                </Form.Item>
                                <Form.Item name="scrape" valuePropName="checked">
                                    <Checkbox>联网刮削</Checkbox>
                                </Form.Item>
                                <Form.Item name="organize" valuePropName="checked">
                                    <Checkbox>整理到独立目录</Checkbox>
                                </Form.Item>
                                <Form.Item name="writeNfo" valuePropName="checked">
                                    <Checkbox>写入 NFO</Checkbox>
                                </Form.Item>
                                <Form.Item name="downloadImages" valuePropName="checked">
                                    <Checkbox>下载封面</Checkbox>
                                </Form.Item>
                                <Form.Item name="downloadSampleImages" valuePropName="checked">
                                    <Checkbox>下载样品图</Checkbox>
                                </Form.Item>
                                <Form.Item name="downloadActorImages" valuePropName="checked">
                                    <Checkbox>下载演员头像</Checkbox>
                                </Form.Item>
                                <Form.Item name="downloadListThumbnail" valuePropName="checked">
                                    <Checkbox>下载列表缩略图</Checkbox>
                                </Form.Item>
                            </Space>
                            <Space align="center" wrap>
                                <Form.Item name="maxDepth" label="最大深度">
                                    <InputNumber min={0} placeholder="不限" />
                                </Form.Item>
                                <Form.Item name="concurrent" label="刮削并发">
                                    <InputNumber min={1} max={5} />
                                </Form.Item>
                                <Form.Item name="overwriteExisting" label="覆盖冲突" valuePropName="checked">
                                    <Switch />
                                </Form.Item>
                            </Space>
                            <Button
                                type="primary"
                                htmlType="submit"
                                block
                                loading={loadingPreview}
                                icon={<Icon as={FileSearchOutlined} />}
                            >
                                扫描并生成预览
                            </Button>
                        </Form>
                    </Card>
                    <Alert
                        type="info"
                        showIcon
                        message="执行前会先生成预览"
                        description="只有点击确认执行后才会移动文件、写入 NFO 或下载图片。建议先检查冲突和目标路径。"
                    />
                </section>

                <section className="jav-local-results">
                    <div className="jav-results-header">
                        <div>
                            <Title level={4} className="jav-results-title">
                                <span className="jav-section-icon"><Icon as={FileSearchOutlined} /></span>
                                刮削任务
                            </Title>
                            <Text type="secondary" className="jav-results-subtitle">
                                扫描本地目录，按番号刮削并整理为媒体库结构，完成后自动入库
                            </Text>
                        </div>
                        <Space wrap align="center">
                            <Space size={6}>
                                <Text type="secondary">显示不符合要求</Text>
                                <Switch
                                    size="small"
                                    checked={showNonConforming}
                                    onChange={setShowNonConforming}
                                    disabled={!preview}
                                />
                                {preview && <Tag>{nonConformingCount}</Tag>}
                            </Space>
                            <Button
                                disabled={!preview || nonConformingCount === 0}
                                onClick={handleSelectNonConforming}
                            >
                                全选不符合要求
                            </Button>
                            <Popconfirm
                                title={`确认删除 ${selectedDeleteItems.length} 个不符合要求的文件？`}
                                description="此操作会从本地文件系统删除选中的源文件。"
                                okText="删除"
                                cancelText="取消"
                                disabled={selectedDeleteItems.length === 0 || loadingDelete}
                                onConfirm={handleDeleteNonConforming}
                            >
                                <Button
                                    danger
                                    disabled={selectedDeleteItems.length === 0}
                                    loading={loadingDelete}
                                    icon={<Icon as={DeleteOutlined} />}
                                >
                                    删除选中
                                </Button>
                            </Popconfirm>
                            <Popconfirm
                            title={`确认执行 ${selectedItems.length} 个条目的刮削操作？`}
                            description="此操作会修改本地文件系统。"
                            okText="确认执行"
                            cancelText="取消"
                            disabled={selectedItems.length === 0 || loadingApply}
                            onConfirm={handleApply}
                            >
                                <Button
                                    type="primary"
                                    disabled={selectedItems.length === 0}
                                    loading={loadingApply}
                                    icon={<Icon as={PlayCircleOutlined} />}
                                >
                                    执行选中项
                                </Button>
                            </Popconfirm>
                        </Space>
                    </div>

                    {renderActiveTaskPanel()}

                    {preview && (
                        <div className="jav-kpi-grid jav-local-kpis">
                            <div className="jav-kpi-card">
                                <span className="jav-kpi-label">视频</span>
                                <strong>{preview.total_files}</strong>
                                <span className="jav-kpi-note">扫描结果</span>
                            </div>
                            <div className="jav-kpi-card">
                                <span className="jav-kpi-label">识别</span>
                                <strong>{preview.recognized_count}</strong>
                                <span className="jav-kpi-note">番号匹配</span>
                            </div>
                            <div className="jav-kpi-card">
                                <span className="jav-kpi-label">刮削</span>
                                <strong>{preview.found_count}</strong>
                                <span className="jav-kpi-note">元数据命中</span>
                            </div>
                            <div className="jav-kpi-card">
                                <span className="jav-kpi-label">冲突</span>
                                <strong>{preview.conflict_count}</strong>
                                <span className="jav-kpi-note">目标已存在</span>
                            </div>
                        </div>
                    )}

                    <Divider className="jav-section-divider" />
                    <Table
                        rowKey="source_path"
                        size="small"
                        dataSource={items}
                        columns={columns}
                        loading={loadingPreview}
                        pagination={{
                            pageSize: tablePageSize,
                            showSizeChanger: true,
                            onShowSizeChange: (_, size) => setTablePageSize(size),
                            onChange: (_, size) => setTablePageSize(size),
                        }}
                        rowSelection={{
                            selectedRowKeys,
                            onChange: setSelectedRowKeys,
                            getCheckboxProps: (item) => ({
                                disabled: isConformingLocalScrapeItem(item)
                                    ? item.target_duplicate || (
                                        isResolvableConflict(item)
                                        && !overwriteExisting
                                        && !getConflictResolution(item)
                                    )
                                    : false,
                            }),
                        }}
                        locale={{ emptyText: "请输入目录并生成预览" }}
                    />

                    {applyResult && (
                        <Alert
                            style={{ marginTop: 14 }}
                            type={applyResult.success ? "success" : "warning"}
                            showIcon
                            message={`执行结果：成功 ${applyResult.success_count}，失败 ${applyResult.failed_count}，自动入库 ${applyResult.library_recorded_count || 0}`}
                            description={
                                <Space direction="vertical" size={2}>
                                    {(applyResult.results || []).slice(0, 5).map((result) => (
                                        <Text key={result.source_path} type={result.success ? "secondary" : "danger"}>
                                            {result.success
                                                ? result.skipped
                                                    ? `已保留目标文件：${result.target_video_path}`
                                                    : result.target_video_path
                                                : `${result.source_path}: ${result.error}`}
                                        </Text>
                                    ))}
                                </Space>
                            }
                        />
                    )}
                </section>
            </div>
            <Drawer
                title="冲突文件比较"
                open={Boolean(conflictCompareItem)}
                onClose={() => setConflictCompareItem(null)}
                width={760}
                placement="right"
                extra={conflictCompareItem && (
                    <Space>
                        <Button onClick={() => updateConflictResolution(conflictCompareItem, "keep_target")}>
                            保留目标文件
                        </Button>
                        <Button
                            type="primary"
                            danger
                            onClick={() => updateConflictResolution(conflictCompareItem, "keep_source")}
                        >
                            保留源文件并覆盖
                        </Button>
                    </Space>
                )}
            >
                {conflictCompareItem && (
                    <Space direction="vertical" size={14} style={{ width: "100%" }}>
                        <Alert
                            type="warning"
                            showIcon
                            message="目标文件已存在"
                            description="比较源文件和目标文件的路径、大小和修改时间后，选择本次刮削要保留哪个文件。"
                        />
                        <Space direction="vertical" size={4} style={{ width: "100%" }}>
                            <Text type="secondary">番号</Text>
                            <Tag color="blue">{conflictCompareItem.code || "-"}</Tag>
                            <Text strong>{conflictCompareItem.metadata?.title || conflictCompareItem.file_name}</Text>
                        </Space>
                        <div
                            style={{
                                display: "grid",
                                gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
                                gap: 12,
                            }}
                        >
                            {renderConflictFileDetail("源文件", conflictCompareItem.source_file)}
                            {renderConflictFileDetail("目标文件", conflictCompareItem.target_file)}
                        </div>
                        {getConflictResolution(conflictCompareItem) && (
                            <Alert
                                type="info"
                                showIcon
                                message={`当前选择：${conflictResolutionLabels[getConflictResolution(conflictCompareItem)]}`}
                            />
                        )}
                    </Space>
                )}
            </Drawer>
            <Drawer
                title={`${templateDesignerTitle}设置`}
                open={templateDesignerOpen}
                onClose={closeTemplateDesigner}
                width={640}
                placement="right"
                className="jav-template-designer-drawer"
                extra={
                    <Space>
                        <Button htmlType="button" onClick={resetTemplateDesigner}>重置</Button>
                        <Button type="primary" htmlType="button" onClick={writeTemplateDesignerValue}>应用</Button>
                    </Space>
                }
            >
                <div className="jav-template-designer">
                    <section>
                        <Text strong>可用卡片</Text>
                        <div className="jav-template-card-grid">
                            {LOCAL_SCRAPE_NAMING_FIELDS.map((field) => (
                                <button
                                    type="button"
                                    key={field.id}
                                    className="jav-template-card"
                                    draggable
                                    onDragStart={(event) => startPaletteDrag(event, { type: "field", id: field.id })}
                                    onClick={() => addTemplatePart({ type: "field", id: field.id })}
                                >
                                    <span>{field.label}</span>
                                    <small>{field.sample}</small>
                                </button>
                            ))}
                        </div>
                    </section>
                    <section>
                        <Text strong>分隔符</Text>
                        <div className="jav-template-separator-grid">
                            {LOCAL_SCRAPE_NAMING_SEPARATORS.map((separator) => (
                                <button
                                    type="button"
                                    key={separator.id}
                                    className="jav-template-card jav-template-separator-card"
                                    draggable
                                    onDragStart={(event) => startPaletteDrag(event, { type: "separator", id: separator.id })}
                                    onClick={() => addTemplatePart({ type: "separator", id: separator.id })}
                                >
                                    <span>{separator.label}</span>
                                    <small>{separator.value === " " ? "空格" : separator.value}</small>
                                </button>
                            ))}
                        </div>
                    </section>
                    <section>
                        <Text strong>当前模板</Text>
                        <div
                            className="jav-template-drop-zone"
                            onDragOver={(event) => event.preventDefault()}
                            onDrop={(event) => handleTemplateDrop(event)}
                        >
                            {templateDesignerParts.map((part, index) => (
                                <span
                                    key={`${part.type}-${part.id || part.value}-${index}`}
                                    className={`jav-template-selected-card ${part.type === "separator" ? "is-separator" : ""}`}
                                    draggable
                                    onDragStart={(event) => startSelectedPartDrag(event, index)}
                                    onDragOver={(event) => event.preventDefault()}
                                    onDrop={(event) => handleTemplateDrop(event, index)}
                                >
                                    <Icon as={DragOutlined} />
                                    {renderTemplateDesignerPart(part)}
                                    <button type="button" onClick={() => removeTemplatePart(index)} aria-label="移除卡片">
                                        <Icon as={CloseOutlined} />
                                    </button>
                                </span>
                            ))}
                        </div>
                    </section>
                    <section>
                        <Text strong>生成结果</Text>
                        <Input value={templateDesignerPreview} readOnly />
                    </section>
                    <Alert
                        type="info"
                        showIcon
                        message="拖拽卡片或点击卡片即可加入模板；文件夹模板中使用“文件夹层级”卡片会生成多级目录。"
                    />
                </div>
            </Drawer>
        </div>
    );
}
