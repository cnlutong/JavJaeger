import {
    deleteLocalScrapeTaskTemplate,
    loadLocalScrapeTaskTemplates,
    saveLocalScrapeTaskTemplate,
} from "../utils/localScrapeTemplates.mjs";
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
    Form,
    Input,
    InputNumber,
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
    CheckCircleOutlined,
    DeleteOutlined,
    FileSearchOutlined,
    FolderOpenOutlined,
    PlayCircleOutlined,
    SaveOutlined,
    WarningOutlined,
} = icons;

const Icon = ({ as: Component }) => Component ? <Component /> : null;

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
    const [applyResult, setApplyResult] = React.useState(null);
    const [taskTemplates, setTaskTemplates] = React.useState(() => loadLocalScrapeTaskTemplates());
    const [selectedTemplateId, setSelectedTemplateId] = React.useState("");
    const [templateName, setTemplateName] = React.useState("");
    const overwriteExisting = Form.useWatch("overwriteExisting", form);

    const items = preview?.items || [];
    const selectedItems = items.filter((item) => selectedRowKeys.includes(item.source_path));
    const selectedTemplate = taskTemplates.find((template) => template.id === selectedTemplateId) || null;
    const taskTemplateOptions = taskTemplates.map((template) => ({
        value: template.id,
        label: template.name,
    }));

    React.useEffect(() => {
        setTaskTemplates(loadLocalScrapeTaskTemplates());
    }, []);

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
        folder_template: values.folderTemplate || values.namingTemplate || "{code} {title}",
        naming_template: values.namingTemplate || "{code} {title}",
        write_nfo: values.writeNfo !== false,
        download_images: values.downloadImages !== false,
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

    const handlePreview = async (values) => {
        setLoadingPreview(true);
        setApplyResult(null);
        setSelectedRowKeys([]);
        try {
            const data = await postJson("/api/movies/local-scrape/preview", buildPayload(values));
            if (!data.success) {
                message.error(data.message || "扫描失败");
                setPreview(null);
                return;
            }
            setPreview(data);
            const selectable = (data.items || [])
                .filter((item) => ["found", "recognized"].includes(item.scrape_status) && !item.target_exists && !item.target_duplicate)
                .map((item) => item.source_path);
            setSelectedRowKeys(selectable);
            message.success(`扫描完成：${data.total_files} 个视频，${data.found_count} 个匹配成功`);
        } catch (error) {
            message.error(`扫描失败：${error.message}`);
        } finally {
            setLoadingPreview(false);
        }
    };

    const handleApply = async () => {
        const values = form.getFieldsValue();
        const payload = {
            ...buildPayload(values),
            items: selectedItems.map((item) => ({
                source_path: item.source_path,
                code: item.code,
                metadata: item.metadata,
            })),
        };
        setLoadingApply(true);
        try {
            const data = await postJson("/api/movies/local-scrape/apply", payload);
            setApplyResult(data);
            if (data.success) {
                message.success(`刮削完成：${data.success_count} 个文件，自动入库 ${data.library_recorded_count || 0} 个`);
            } else {
                message.warning(`部分完成：成功 ${data.success_count}，失败 ${data.failed_count}，自动入库 ${data.library_recorded_count || 0}`);
            }
        } catch (error) {
            message.error(`执行失败：${error.message}`);
        } finally {
            setLoadingApply(false);
        }
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
                    {item.target_exists && <Text type="danger" style={{ fontSize: 12 }}>目标文件已存在</Text>}
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
                            <Form.Item name="folderTemplate" label="文件夹模板">
                                <Input placeholder="{code} {title} / {actor}/{year}/{title} / {studio}/{code} {title}" />
                            </Form.Item>
                            <Form.Item name="namingTemplate" label="文件命名模板">
                                <Input placeholder="{code} {title}" />
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
                    </div>

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
                        pagination={{ pageSize: 12, showSizeChanger: true }}
                        rowSelection={{
                            selectedRowKeys,
                            onChange: setSelectedRowKeys,
                            getCheckboxProps: (item) => ({
                                disabled: item.target_duplicate || !["found", "recognized"].includes(item.scrape_status) || (item.target_exists && !overwriteExisting),
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
                                            {result.success ? result.target_video_path : `${result.source_path}: ${result.error}`}
                                        </Text>
                                    ))}
                                </Space>
                            }
                        />
                    )}
                </section>
            </div>
        </div>
    );
}
