const React = window.React;
const antd = window.antd;
const icons = window.icons || {};

const {
    Alert,
    Button,
    Checkbox,
    Divider,
    Drawer,
    Form,
    Input,
    InputNumber,
    Popconfirm,
    Space,
    Table,
    Tag,
    Typography,
    message,
} = antd;
const { Text, Title } = Typography;
const {
    DatabaseOutlined,
    FilterOutlined,
    FolderOpenOutlined,
    ReloadOutlined,
    SearchOutlined,
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

const countedOptions = (records, getter) => {
    const counts = new Map();
    records.forEach((record) => {
        const value = getter(record);
        const values = Array.isArray(value) ? value : [value];
        values.filter(Boolean).forEach((item) => {
            const key = String(item).trim();
            if (!key) return;
            counts.set(key, (counts.get(key) || 0) + 1);
        });
    });
    return Array.from(counts.entries())
        .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
        .slice(0, 80)
        .map(([value, count]) => ({
            label: `${value} (${count})`,
            value,
        }));
};

const matchesAny = (recordValues, selectedValues) => {
    if (!selectedValues || selectedValues.length === 0) {
        return true;
    }
    const values = Array.isArray(recordValues) ? recordValues : [recordValues].filter(Boolean);
    const normalized = new Set(values.map((value) => String(value)));
    return selectedValues.some((value) => normalized.has(String(value)));
};

export default function LocalLibraryPage() {
    const [form] = Form.useForm();
    const [library, setLibrary] = React.useState({ records: [], total_movies: 0, total_files: 0, total_size: 0 });
    const [scanResult, setScanResult] = React.useState(null);
    const [loading, setLoading] = React.useState(false);
    const [scanning, setScanning] = React.useState(false);
    const [filterOpen, setFilterOpen] = React.useState(false);
    const [scanOpen, setScanOpen] = React.useState(false);
    const [filters, setFilters] = React.useState({
        keyword: "",
        genres: [],
        stars: [],
        studios: [],
        publishers: [],
        series: [],
        years: [],
        roots: [],
    });

    const records = library.records || [];

    const filterOptions = React.useMemo(() => ({
        genres: countedOptions(records, (record) => record.genres),
        stars: countedOptions(records, (record) => record.stars),
        studios: countedOptions(records, (record) => record.studio),
        publishers: countedOptions(records, (record) => record.publisher),
        series: countedOptions(records, (record) => record.series),
        years: countedOptions(records, (record) => String(record.date || "").slice(0, 4)),
        roots: countedOptions(records, (record) => record.scan_roots),
    }), [records]);

    const activeFilterCount = React.useMemo(() => (
        Object.entries(filters).reduce((count, [key, value]) => {
            if (key === "keyword") {
                return count + (String(value || "").trim() ? 1 : 0);
            }
            return count + (Array.isArray(value) ? value.length : 0);
        }, 0)
    ), [filters]);

    const filteredRecords = React.useMemo(() => {
        const keyword = filters.keyword.trim().toLowerCase();
        return records.filter((record) => {
            if (keyword) {
                const text = `${record.movie_id || ""}\n${record.title || ""}\n${record.full_text || ""}`.toLowerCase();
                if (!text.includes(keyword)) {
                    return false;
                }
            }
            return (
                matchesAny(record.genres, filters.genres) &&
                matchesAny(record.stars, filters.stars) &&
                matchesAny(record.studio, filters.studios) &&
                matchesAny(record.publisher, filters.publishers) &&
                matchesAny(record.series, filters.series) &&
                matchesAny(String(record.date || "").slice(0, 4), filters.years) &&
                matchesAny(record.scan_roots, filters.roots)
            );
        });
    }, [records, filters]);

    const clearFilters = () => setFilters({
        keyword: "",
        genres: [],
        stars: [],
        studios: [],
        publishers: [],
        series: [],
        years: [],
        roots: [],
    });

    const loadLibrary = async () => {
        setLoading(true);
        try {
            const response = await fetch("/api/movies/local-library");
            const data = await response.json();
            if (!data.success) {
                throw new Error(data.message || "加载失败");
            }
            setLibrary(data);
        } catch (error) {
            message.error(`影视库加载失败：${error.message}`);
        } finally {
            setLoading(false);
        }
    };

    React.useEffect(() => {
        loadLibrary();
    }, []);

    const handleScan = async (values) => {
        setScanning(true);
        setScanResult(null);
        try {
            const data = await postJson("/api/movies/local-library/scan", {
                directory: values.directory,
                recursive: values.recursive !== false,
                max_depth: values.maxDepth ?? null,
                remove_missing: values.removeMissing !== false,
                scrape: values.scrape !== false,
                concurrent: values.concurrent || 3,
            });
            setScanResult(data);
            await loadLibrary();
            setScanOpen(false);
            message.success(`影视库已更新：${data.recognized_files}/${data.scanned_files} 个文件识别成功`);
        } catch (error) {
            message.error(`影视库更新失败：${error.message}`);
        } finally {
            setScanning(false);
        }
    };

    const handleClear = async () => {
        setLoading(true);
        try {
            const response = await fetch("/api/movies/local-library", { method: "DELETE" });
            const data = await response.json();
            if (!data.success) {
                throw new Error(data.message || "清空失败");
            }
            setScanResult(null);
            await loadLibrary();
            message.success("影视库已清空");
        } catch (error) {
            message.error(`清空失败：${error.message}`);
        } finally {
            setLoading(false);
        }
    };

    const filterBlock = (title, key) => {
        const options = filterOptions[key] || [];
        const selected = filters[key] || [];
        return (
            <div className="jav-library-filter-block">
                <div className="jav-library-filter-block-title">
                    <Text strong>{title}</Text>
                    {selected.length > 0 && (
                        <Button
                            type="link"
                            size="small"
                            onClick={() => setFilters((prev) => ({ ...prev, [key]: [] }))}
                        >
                            清除
                        </Button>
                    )}
                </div>
                {options.length ? (
                    <Checkbox.Group
                        options={options}
                        value={selected}
                        onChange={(next) => setFilters((prev) => ({ ...prev, [key]: next }))}
                    />
                ) : (
                    <Text type="secondary">暂无可选项</Text>
                )}
            </div>
        );
    };

    const activeFilterTags = () => {
        const labels = {
            genres: "标签",
            stars: "演员",
            studios: "制作商",
            publishers: "发行商",
            series: "系列",
            years: "年份",
            roots: "目录",
        };
        return Object.entries(labels).flatMap(([key, label]) => (
            (filters[key] || []).map((value) => (
                <Tag
                    key={`${key}:${value}`}
                    closable
                    onClose={() => setFilters((prev) => ({
                        ...prev,
                        [key]: (prev[key] || []).filter((item) => item !== value),
                    }))}
                >
                    {label}: {value}
                </Tag>
            ))
        ));
    };

    const columns = [
        {
            title: "番号",
            dataIndex: "movie_id",
            key: "movie_id",
            width: 140,
            render: (value, record) => (
                <Space direction="vertical" size={2}>
                    <Tag color="blue">{value}</Tag>
                    {record.scrape_status === "found" && <Tag color="green">已刮削</Tag>}
                    {record.scrape_status === "failed" && <Tag color="red">刮削失败</Tag>}
                </Space>
            ),
        },
        {
            title: "影片信息",
            key: "info",
            render: (_, record) => (
                <Space direction="vertical" size={4}>
                    <Text strong ellipsis={{ tooltip: record.title }} style={{ maxWidth: 620 }}>{record.title || record.movie_id}</Text>
                    <Space size={4} wrap>
                        {record.date && <Text type="secondary">{record.date}</Text>}
                        {record.studio && <Tag>{record.studio}</Tag>}
                        {record.publisher && <Tag>{record.publisher}</Tag>}
                        {record.series && <Tag color="purple">{record.series}</Tag>}
                    </Space>
                    <Space size={4} wrap>
                        {(record.genres || []).slice(0, 8).map((genre) => <Tag color="cyan" key={genre}>{genre}</Tag>)}
                        {(record.genres || []).length > 8 && <Tag>+{record.genres.length - 8}</Tag>}
                    </Space>
                    <Space size={4} wrap>
                        {(record.stars || []).slice(0, 6).map((star) => <Tag color="magenta" key={star}>{star}</Tag>)}
                        {(record.stars || []).length > 6 && <Tag>+{record.stars.length - 6}</Tag>}
                    </Space>
                </Space>
            ),
        },
        {
            title: "文件",
            key: "files",
            width: 340,
            render: (_, record) => (
                <Space direction="vertical" size={2}>
                    <Text>{record.file_count || 0} 个文件 · {formatBytes(record.total_size)}</Text>
                    {(record.files || []).slice(0, 3).map((file) => (
                        <Text key={file.path} type="secondary" ellipsis={{ tooltip: file.path }} style={{ maxWidth: 320 }}>
                            {file.file_name}
                        </Text>
                    ))}
                    {(record.files || []).length > 3 && <Text type="secondary">+{record.files.length - 3} 个文件</Text>}
                </Space>
            ),
        },
    ];

    return (
        <div className="jav-local-scrape jav-library-page">
            <div className="jav-library-layout">
                <section className="jav-local-results jav-library-results">
                    <div className="jav-results-header">
                        <div>
                            <Title level={4} className="jav-results-title">
                                <span className="jav-section-icon"><Icon as={DatabaseOutlined} /></span>
                                影视库
                            </Title>
                            <Text type="secondary" className="jav-results-subtitle">
                                从本地文件夹建立影片数据库，并用刮削全文信息支持筛选与去重下载
                            </Text>
                        </div>
                    </div>
                    <div className="jav-library-toolbar">
                        <Input
                            allowClear
                            prefix={<Icon as={SearchOutlined} />}
                            placeholder="搜索番号、标题、演员、标签"
                            value={filters.keyword}
                            onChange={(event) => setFilters((prev) => ({ ...prev, keyword: event.target.value }))}
                        />
                        <Button icon={<Icon as={FolderOpenOutlined} />} onClick={() => setScanOpen(true)}>
                            扫描入库
                        </Button>
                        <Button icon={<Icon as={FilterOutlined} />} onClick={() => setFilterOpen(true)}>
                            筛选{activeFilterCount ? ` (${activeFilterCount})` : ""}
                        </Button>
                        <Button icon={<Icon as={ReloadOutlined} />} onClick={loadLibrary} loading={loading}>
                            刷新
                        </Button>
                        <Popconfirm title="确认清空影视库数据库？" onConfirm={handleClear} okText="清空" cancelText="取消">
                            <Button danger loading={loading}>清空</Button>
                        </Popconfirm>
                    </div>
                    {activeFilterCount > 0 && (
                        <div className="jav-library-active-filters">
                            {filters.keyword.trim() && (
                                <Tag
                                    closable
                                    onClose={() => setFilters((prev) => ({ ...prev, keyword: "" }))}
                                >
                                    搜索: {filters.keyword.trim()}
                                </Tag>
                            )}
                            {activeFilterTags()}
                            <Button size="small" type="link" onClick={clearFilters}>清除全部</Button>
                        </div>
                    )}
                    <div className="jav-kpi-grid jav-local-kpis">
                        <div className="jav-kpi-card">
                            <span className="jav-kpi-label">影片</span>
                            <strong>{library.total_movies || 0}</strong>
                            <span className="jav-kpi-note">数据库记录</span>
                        </div>
                        <div className="jav-kpi-card">
                            <span className="jav-kpi-label">文件</span>
                            <strong>{library.total_files || 0}</strong>
                            <span className="jav-kpi-note">本地视频</span>
                        </div>
                        <div className="jav-kpi-card">
                            <span className="jav-kpi-label">容量</span>
                            <strong>{formatBytes(library.total_size)}</strong>
                            <span className="jav-kpi-note">总大小</span>
                        </div>
                        <div className="jav-kpi-card">
                            <span className="jav-kpi-label">筛选</span>
                            <strong>{filteredRecords.length}</strong>
                            <span className="jav-kpi-note">当前结果</span>
                        </div>
                    </div>
                    {scanResult && (
                        <Alert
                            style={{ marginTop: 14 }}
                            type={scanResult.success ? "success" : "warning"}
                            showIcon
                            message={`扫描完成：识别 ${scanResult.recognized_files || 0}/${scanResult.scanned_files || 0} 个文件`}
                            description={`新增 ${scanResult.new_movie_count || 0}，更新 ${scanResult.updated_movie_count || 0}，刮削 ${scanResult.scraped_movie_count || 0} 个番号。`}
                        />
                    )}
                    <Divider className="jav-section-divider" />
                    <Table
                        rowKey="movie_id"
                        size="small"
                        dataSource={filteredRecords}
                        columns={columns}
                        loading={loading}
                        pagination={{ pageSize: 12, showSizeChanger: true }}
                        locale={{ emptyText: "暂无影视库记录，请先扫描目录" }}
                    />
                    <Drawer
                        title="扫描入库"
                        placement="right"
                        width={420}
                        open={scanOpen}
                        onClose={() => setScanOpen(false)}
                    >
                        <div className="jav-library-filter-help">
                            <Text type="secondary">扫描是低频维护操作。选择本地目录后，系统会识别番号、可选联网刮削，并更新影视库数据库。</Text>
                        </div>
                        <Form
                            form={form}
                            layout="vertical"
                            initialValues={{
                                recursive: true,
                                removeMissing: true,
                                scrape: true,
                                concurrent: 3,
                            }}
                            onFinish={handleScan}
                        >
                            <Form.Item name="directory" label="扫描目录" rules={[{ required: true, message: "请输入影视库目录" }]}>
                                <Input placeholder="Windows: D:\\Media\\JAV  /  Linux: /media/JAV 或 ~/Videos/JAV" />
                            </Form.Item>
                            <div className="jav-library-scan-options">
                                <Form.Item name="recursive" valuePropName="checked">
                                    <Checkbox>递归扫描</Checkbox>
                                </Form.Item>
                                <Form.Item name="removeMissing" valuePropName="checked">
                                    <Checkbox>同步移除失效文件</Checkbox>
                                </Form.Item>
                                <Form.Item name="scrape" valuePropName="checked">
                                    <Checkbox>联网刮削</Checkbox>
                                </Form.Item>
                            </div>
                            <Space align="center" wrap>
                                <Form.Item name="maxDepth" label="最大深度">
                                    <InputNumber min={0} placeholder="不限" />
                                </Form.Item>
                                <Form.Item name="concurrent" label="刮削并发">
                                    <InputNumber min={1} max={5} />
                                </Form.Item>
                            </Space>
                            <Button type="primary" htmlType="submit" block loading={scanning} icon={<Icon as={FolderOpenOutlined} />}>
                                扫描并升级数据库
                            </Button>
                        </Form>
                    </Drawer>
                    <Drawer
                        title="筛选"
                        placement="right"
                        width={420}
                        open={filterOpen}
                        onClose={() => setFilterOpen(false)}
                        extra={<Button type="link" onClick={clearFilters}>清除全部</Button>}
                    >
                        <div className="jav-library-filter-help">
                            <Text type="secondary">同一字段内为“任一匹配”，不同字段之间为“同时满足”。</Text>
                        </div>
                        <div className="jav-library-filters">
                            {filterBlock("标签", "genres")}
                            {filterBlock("演员", "stars")}
                            {filterBlock("制作商", "studios")}
                            {filterBlock("发行商", "publishers")}
                            {filterBlock("系列", "series")}
                            {filterBlock("年份", "years")}
                            {filterBlock("扫描目录", "roots")}
                        </div>
                    </Drawer>
                </section>
            </div>
        </div>
    );
}
