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
    Segmented,
    Slider,
    Space,
    Table,
    Tag,
    Typography,
    message,
} = antd;
const { Text, Title } = Typography;
const {
    ArrowLeftOutlined,
    AppstoreOutlined,
    DatabaseOutlined,
    DeleteOutlined,
    DownloadOutlined,
    FilterOutlined,
    FolderOpenOutlined,
    PlayCircleOutlined,
    ReloadOutlined,
    SearchOutlined,
    UnorderedListOutlined,
} = icons;

const Icon = ({ as: Component }) => Component ? <Component /> : null;
const INFORMATION_CHECK_STORAGE_KEY = "javjaeger.localLibrary.informationCheckFields";
const INFORMATION_CHECK_FIELD_OPTIONS = [
    { label: "标题", value: "title" },
    { label: "发行日期", value: "date" },
    { label: "演员", value: "stars" },
    { label: "标签", value: "genres" },
    { label: "远程封面", value: "cover_url" },
    { label: "NFO 文件", value: "nfo" },
    { label: "本地封面", value: "poster_file" },
];
const DEFAULT_INFORMATION_CHECK_FIELDS = INFORMATION_CHECK_FIELD_OPTIONS.map((option) => option.value);

const normalizeInformationCheckFields = (fields, fallback = DEFAULT_INFORMATION_CHECK_FIELDS) => {
    const allowed = new Set(DEFAULT_INFORMATION_CHECK_FIELDS);
    const normalized = (Array.isArray(fields) ? fields : [])
        .map((field) => String(field || "").trim())
        .filter((field, index, source) => allowed.has(field) && source.indexOf(field) === index);
    return normalized.length ? normalized : [...fallback];
};

const loadInformationCheckSettings = () => {
    try {
        return {
            fields: normalizeInformationCheckFields(JSON.parse(window.localStorage.getItem(INFORMATION_CHECK_STORAGE_KEY) || "[]")),
        };
    } catch (error) {
        return { fields: [...DEFAULT_INFORMATION_CHECK_FIELDS] };
    }
};

const saveInformationCheckSettings = (fields) => {
    try {
        window.localStorage.setItem(INFORMATION_CHECK_STORAGE_KEY, JSON.stringify(normalizeInformationCheckFields(fields)));
    } catch (error) {
        /* ignore storage errors */
    }
};

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

const posterSource = (record) => {
    if (record?.poster_url) {
        return record.poster_url;
    }
    const coverUrl = record?.cover_url || record?.metadata?.cover_url || record?.img || "";
    return coverUrl ? `/api/image-proxy?url=${encodeURIComponent(coverUrl)}` : "";
};

const proxiedImageSource = (url) => {
    if (!url) {
        return "";
    }
    return url.startsWith("/api/")
        ? url
        : `/api/image-proxy?url=${encodeURIComponent(url)}`;
};

const thumbnailSource = (record) => {
    const thumbnailUrl = record?.thumbnail_url || "";
    if (thumbnailUrl.startsWith("/api/")) {
        return thumbnailUrl;
    }
    if (record?.poster_url) {
        return record.poster_url;
    }
    return proxiedImageSource(thumbnailUrl || record?.metadata?.list_thumbnail_url || "");
};

const actorName = (actor) => {
    if (actor && typeof actor === "object") {
        return String(actor.name || actor.title || actor.id || "").trim();
    }
    return String(actor || "").trim();
};

const normalizeActors = (record) => {
    const actorValues = [
        ...(Array.isArray(record?.metadata?.raw?.stars) ? record.metadata.raw.stars : []),
        ...(Array.isArray(record?.metadata?.actor_refs) ? record.metadata.actor_refs : []),
        ...(Array.isArray(record?.stars) ? record.stars : []),
    ];
    const actorsByName = new Map();
    actorValues.forEach((actor) => {
        const name = actorName(actor);
        if (!name) {
            return;
        }
        const existing = actorsByName.get(name) || { name, avatar: "" };
        if (actor && typeof actor === "object" && !existing.avatar) {
            existing.avatar = actor.avatar || actor.img || actor.image || actor.thumbnail || "";
        }
        actorsByName.set(name, existing);
    });
    return Array.from(actorsByName.values());
};

const actorAvatarSources = (record, actor) => {
    const sources = [];
    if (record?.movie_id && actor?.name) {
        sources.push(`/api/movies/local-library/actor-avatar/${encodeURIComponent(record.movie_id)}/${encodeURIComponent(actor.name)}`);
    }
    const remoteAvatar = proxiedImageSource(actor?.avatar || "");
    if (remoteAvatar) {
        sources.push(remoteAvatar);
    }
    return sources;
};

const MoviePoster = ({ record, compact = false, width = null, variant = "poster", onRatio = null }) => {
    const [failed, setFailed] = React.useState(false);
    const src = variant === "thumbnail" ? thumbnailSource(record) || posterSource(record) : posterSource(record);
    const style = width ? { width, height: compact ? Math.round(width * 1.5) : undefined } : undefined;
    if (src && !failed) {
        return (
            <div className={`jav-library-poster ${compact ? "is-compact" : ""}`} style={style}>
                <img
                    src={src}
                    alt={record.title || record.movie_id}
                    onError={() => setFailed(true)}
                    onLoad={(event) => {
                        const { naturalWidth, naturalHeight } = event.currentTarget;
                        if (onRatio && naturalWidth > 0 && naturalHeight > 0) {
                            onRatio(naturalWidth / naturalHeight);
                        }
                    }}
                />
            </div>
        );
    }
    return (
        <div className={`jav-library-poster is-placeholder ${compact ? "is-compact" : ""}`} style={style}>
            <span>{record.movie_id || "N/A"}</span>
        </div>
    );
};

const ActorPill = ({ record, actor, onClick }) => {
    const [sourceIndex, setSourceIndex] = React.useState(0);
    const sources = actorAvatarSources(record, actor);
    const src = sources[sourceIndex] || "";
    const initial = (actor.name || "?").slice(0, 1).toUpperCase();
    return (
        <button className="jav-library-actor-pill" type="button" onClick={onClick}>
            <span className="jav-library-actor-avatar">
                {src ? (
                    <img
                        src={src}
                        alt={actor.name}
                        onError={() => setSourceIndex((index) => index + 1)}
                    />
                ) : (
                    <span>{initial}</span>
                )}
            </span>
            <span className="jav-library-actor-name">{actor.name}</span>
        </button>
    );
};

export default function LocalLibraryPage() {
    const [form] = Form.useForm();
    const [library, setLibrary] = React.useState({ records: [], total_movies: 0, total_files: 0, total_size: 0 });
    const [scanResult, setScanResult] = React.useState(null);
    const [informationCheck, setInformationCheck] = React.useState(null);
    const [loading, setLoading] = React.useState(false);
    const [scanning, setScanning] = React.useState(false);
    const [checkingInformation, setCheckingInformation] = React.useState(false);
    const [downloadingInformation, setDownloadingInformation] = React.useState(false);
    const [deletingMovieId, setDeletingMovieId] = React.useState("");
    const [filterOpen, setFilterOpen] = React.useState(false);
    const [scanOpen, setScanOpen] = React.useState(false);
    const [informationCheckOpen, setInformationCheckOpen] = React.useState(false);
    const [informationCheckFields, setInformationCheckFields] = React.useState(() => loadInformationCheckSettings().fields);
    const [selectedRecord, setSelectedRecord] = React.useState(null);
    const [playingRecordKey, setPlayingRecordKey] = React.useState("");
    const [selectedPlayFileIndex, setSelectedPlayFileIndex] = React.useState(0);
    const [posterAspectRatioMap, setPosterAspectRatioMap] = React.useState({});
    const [viewMode, setViewMode] = React.useState("list");
    const [listPosterSize, setListPosterSize] = React.useState(56);
    const [gridPosterSize, setGridPosterSize] = React.useState(156);
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
    const [informationCheckForm] = Form.useForm();
    const [informationDownloadForm] = Form.useForm();

    const records = library.records || [];
    const missingInformationByMovieId = React.useMemo(() => {
        const entries = informationCheck?.records || [];
        return entries.reduce((map, record) => {
            if (record?.movie_id && !record.info_complete) {
                map[String(record.movie_id).toUpperCase()] = record;
            }
            return map;
        }, {});
    }, [informationCheck]);

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

    const openInformationCheck = () => {
        const saved = loadInformationCheckSettings();
        setInformationCheckFields(saved.fields);
        informationCheckForm.setFieldsValue({ fields: saved.fields });
        setInformationCheckOpen(true);
    };

    const handleSaveInformationCheckSettings = () => {
        const fields = informationCheckForm.getFieldValue("fields") || [];
        if (!fields.length) {
            message.warning("请至少选择一个检查项");
            return;
        }
        const normalizedFields = normalizeInformationCheckFields(fields, []);
        saveInformationCheckSettings(normalizedFields);
        setInformationCheckFields(normalizedFields);
        message.success("检查标准已保存");
    };

    const loadInformationCheck = async (values = {}) => {
        const selectedFields = normalizeInformationCheckFields(values.fields || informationCheckForm.getFieldValue("fields"), []);
        if (!selectedFields.length) {
            message.warning("请至少选择一个检查项");
            return null;
        }
        setCheckingInformation(true);
        try {
            const queryParams = new URLSearchParams();
            queryParams.set("fields", selectedFields.join(","));
            const response = await fetch(`/api/movies/local-library/information/check?${queryParams.toString()}`);
            const data = await response.json();
            if (!data.success) {
                throw new Error(data.message || "检查失败");
            }
            setInformationCheckFields(selectedFields);
            setInformationCheck(data);
            if (data.incomplete_count > 0) {
                message.warning(`发现 ${data.incomplete_count} 部影片缺少信息`);
            } else {
                message.success("影视库信息完整");
            }
            return data;
        } catch (error) {
            message.error(`信息检查失败：${error.message}`);
            return null;
        } finally {
            setCheckingInformation(false);
        }
    };

    React.useEffect(() => {
        loadLibrary();
    }, []);

    const openRecordPreview = (record) => {
        setSelectedRecord(record);
        setPlayingRecordKey("");
        setSelectedPlayFileIndex(0);
        window.scrollTo({ top: 0, behavior: "smooth" });
    };

    const closeRecordPreview = () => {
        setSelectedRecord(null);
        setPlayingRecordKey("");
    };

    const handlePlaySelectedRecord = (fileIndex = 0) => {
        if (!selectedRecord?.movie_id) {
            return;
        }
        setSelectedPlayFileIndex(fileIndex);
        setPlayingRecordKey(`${selectedRecord.movie_id}:${fileIndex}`);
    };

    const handlePosterAspectRatio = (ratio) => {
        if (!selectedRecord?.movie_id || !Number.isFinite(ratio) || ratio <= 0) {
            return;
        }
        setPosterAspectRatioMap((current) => ({
            ...current,
            [selectedRecord.movie_id]: ratio,
        }));
    };

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

    const handleDeleteMovie = async (record) => {
        const movieId = String(record?.movie_id || "").trim();
        if (!movieId) {
            message.warning("影片番号无效");
            return;
        }
        setDeletingMovieId(movieId);
        try {
            const response = await fetch(`/api/movies/local-library/${encodeURIComponent(movieId)}`, { method: "DELETE" });
            const data = await response.json();
            if (!data.success) {
                throw new Error(data.message || "删除失败");
            }
            if (selectedRecord?.movie_id === movieId) {
                closeRecordPreview();
            }
            setInformationCheck((current) => {
                if (!current?.records) {
                    return current;
                }
                const records = current.records.filter((item) => String(item.movie_id || "").toUpperCase() !== movieId.toUpperCase());
                const incompleteRecords = records.filter((item) => !item.info_complete);
                return {
                    ...current,
                    records,
                    incomplete_records: incompleteRecords,
                    total_movies: records.length,
                    complete_count: records.length - incompleteRecords.length,
                    incomplete_count: incompleteRecords.length,
                };
            });
            await loadLibrary();
            message.success(`已从影视库移除 ${movieId}`);
        } catch (error) {
            message.error(`删除影片失败：${error.message}`);
        } finally {
            setDeletingMovieId("");
        }
    };

    const handleDownloadMissingInformation = async (values = {}) => {
        setDownloadingInformation(true);
        try {
            const data = await postJson("/api/movies/local-library/information/download", {
                only_missing: true,
                fields: informationCheckFields,
                concurrent: values.concurrent || 3,
                write_nfo: values.writeNfo !== false,
                download_images: values.downloadImages !== false,
                download_sample_images: !!values.downloadSampleImages,
                download_actor_images: !!values.downloadActorImages,
                download_list_thumbnail: !!values.downloadListThumbnail,
                overwrite_existing: !!values.overwriteExisting,
            });
            setInformationCheck(data.information_check);
            await loadLibrary();
            const updatedCount = data.updated_count || 0;
            const failedCount = data.failed_count || 0;
            const remainingCount = data.information_check?.incomplete_count || 0;
            if (failedCount > 0 || remainingCount > 0) {
                message.warning(`已更新 ${updatedCount} 部，${failedCount} 部下载失败，仍有 ${remainingCount} 部缺失`);
            } else {
                message.success(`已更新 ${updatedCount} 部影片信息`);
            }
        } catch (error) {
            message.error(`下载缺失信息失败：${error.message}`);
        } finally {
            setDownloadingInformation(false);
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

    const handleFilterTagClick = (filterKey, value, event) => {
        event?.stopPropagation?.();
        if (!filterKey || !value) {
            return;
        }
        setFilters({
            keyword: "",
            genres: filterKey === "genres" ? [value] : [],
            stars: filterKey === "stars" ? [value] : [],
            studios: [],
            publishers: [],
            series: [],
            years: [],
            roots: [],
        });
        setSelectedRecord(null);
        setPlayingRecordKey("");
        window.scrollTo({ top: 0, behavior: "smooth" });
    };

    const renderFilterTag = (filterKey, value, color) => (
        <Tag
            color={color}
            key={value}
            className="jav-library-filter-tag"
            onClick={(event) => handleFilterTagClick(filterKey, value, event)}
        >
            {value}
        </Tag>
    );

    const renderTagList = (items, color, filterKey = null) => {
        const values = Array.isArray(items) ? items.filter(Boolean) : [items].filter(Boolean);
        if (!values.length) {
            return <Text type="secondary">-</Text>;
        }
        return (
            <Space size={4} wrap>
                {values.map((value) => (
                    filterKey ? renderFilterTag(filterKey, value, color) : <Tag color={color} key={value}>{value}</Tag>
                ))}
            </Space>
        );
    };

    const renderActorList = (record, variant = "compact") => {
        const actors = normalizeActors(record);
        if (!actors.length) {
            return <Text type="secondary">-</Text>;
        }
        const className = variant === "cast" ? "jav-library-actor-list is-cast" : "jav-library-actor-list";
        return (
            <div className={className}>
                {actors.map((actor) => (
                    <ActorPill
                        key={actor.name}
                        record={record}
                        actor={actor}
                        onClick={(event) => handleFilterTagClick("stars", actor.name, event)}
                    />
                ))}
            </div>
        );
    };

    const renderRecordPreview = () => {
        if (!selectedRecord) {
            return null;
        }

        const detailRows = [
            ["番号", selectedRecord.movie_id],
            ["发布日期", selectedRecord.date],
            ["制作商", selectedRecord.studio],
            ["发行商", selectedRecord.publisher],
            ["导演", selectedRecord.director],
            ["系列", selectedRecord.series],
            ["刮削状态", selectedRecord.scrape_status],
            ["首次入库", selectedRecord.first_seen_at],
            ["最近更新", selectedRecord.updated_at],
            ["文件数量", `${selectedRecord.file_count || 0} 个文件`],
            ["总容量", formatBytes(selectedRecord.total_size)],
        ].filter(([, value]) => value);
        const hasPlayableFile = (selectedRecord.files || []).length > 0;
        const videoSrc = `/api/movies/local-library/${encodeURIComponent(selectedRecord.movie_id)}/play?file_index=${selectedPlayFileIndex}`;
        const isPlayingSelectedRecord = playingRecordKey === `${selectedRecord.movie_id}:${selectedPlayFileIndex}`;
        const posterAspectRatio = posterAspectRatioMap[selectedRecord.movie_id] || null;
        const previewRatioClass = posterAspectRatio > 1.08
            ? "is-landscape"
            : posterAspectRatio && posterAspectRatio < 0.82
                ? "is-portrait"
                : "is-balanced";
        const previewStyle = posterAspectRatio
            ? { "--jav-library-preview-poster-ratio": posterAspectRatio }
            : undefined;

        return (
            <div className={`jav-library-preview ${previewRatioClass}`} style={previewStyle}>
                <aside className="jav-library-preview-poster">
                    <MoviePoster record={selectedRecord} onRatio={handlePosterAspectRatio} />
                    <div className="jav-library-preview-poster-extras">
                        <div className="jav-library-preview-section">
                            <Text strong>演员</Text>
                            {renderActorList(selectedRecord)}
                        </div>
                        <div className="jav-library-preview-section">
                            <Text strong>标签</Text>
                            {renderTagList(selectedRecord.genres, "cyan", "genres")}
                        </div>
                    </div>
                </aside>
                <section className="jav-library-preview-details">
                    <div className="jav-library-preview-header">
                        <Button icon={<Icon as={ArrowLeftOutlined} />} onClick={closeRecordPreview}>
                            返回影片库
                        </Button>
                        <Space>
                            <Button
                                type="primary"
                                icon={<Icon as={PlayCircleOutlined} />}
                                disabled={!hasPlayableFile}
                                onClick={() => handlePlaySelectedRecord(0)}
                            >
                                播放影片
                            </Button>
                            <Popconfirm
                                title={`从影视库移除 ${selectedRecord.movie_id}？`}
                                description="只删除数据库记录，不删除本地视频文件。"
                                okText="移除"
                                cancelText="取消"
                                onConfirm={() => handleDeleteMovie(selectedRecord)}
                            >
                                <Button
                                    danger
                                    icon={<Icon as={DeleteOutlined} />}
                                    loading={deletingMovieId === selectedRecord.movie_id}
                                >
                                    移除
                                </Button>
                            </Popconfirm>
                            <Tag color="blue">{selectedRecord.movie_id}</Tag>
                        </Space>
                    </div>
                    <div>
                        <Title level={3} className="jav-library-preview-title">
                            {selectedRecord.title || selectedRecord.movie_id}
                        </Title>
                        {selectedRecord.scrape_error && (
                            <Alert
                                type="warning"
                                showIcon
                                message="刮削异常"
                                description={selectedRecord.scrape_error}
                            />
                        )}
                    </div>
                    <div className="jav-library-preview-section jav-library-preview-cast">
                        <Text strong>演员阵容</Text>
                        {renderActorList(selectedRecord, "cast")}
                    </div>
                    {isPlayingSelectedRecord && (
                        <video controls className="jav-library-preview-player" src={videoSrc}>
                            您的浏览器不支持视频播放。
                        </video>
                    )}
                    <div className="jav-library-preview-meta">
                        {detailRows.map(([label, value]) => (
                            <div className="jav-library-preview-meta-row" key={label}>
                                <span>{label}</span>
                                <strong>{value}</strong>
                            </div>
                        ))}
                    </div>
                    <div className="jav-library-preview-section">
                        <Text strong>扫描目录</Text>
                        {renderTagList(selectedRecord.scan_roots, "geekblue")}
                    </div>
                    {selectedRecord.full_text && (
                        <div className="jav-library-preview-section">
                            <Text strong>全文信息</Text>
                            <Text className="jav-library-preview-full-text">{selectedRecord.full_text}</Text>
                        </div>
                    )}
                    <div className="jav-library-preview-section">
                        <Text strong>本地文件</Text>
                        <div className="jav-library-preview-files">
                            {(selectedRecord.files || []).map((file, fileIndex) => (
                                <div className="jav-library-preview-file" key={file.path}>
                                    <div className="jav-library-preview-file-title">
                                        <Text strong ellipsis={{ tooltip: file.path }}>{file.file_name || file.path}</Text>
                                        <Button
                                            size="small"
                                            icon={<Icon as={PlayCircleOutlined} />}
                                            onClick={() => handlePlaySelectedRecord(fileIndex)}
                                        >
                                            播放
                                        </Button>
                                    </div>
                                    <Text type="secondary" ellipsis={{ tooltip: file.path }}>
                                        {formatBytes(file.size)} · {file.path}
                                    </Text>
                                </div>
                            ))}
                        </div>
                    </div>
                </section>
            </div>
        );
    };

    const columns = [
        {
            title: "封面",
            key: "poster",
            width: listPosterSize + 30,
            render: (_, record) => <MoviePoster record={record} compact width={listPosterSize} variant="thumbnail" />,
        },
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
                    {missingInformationByMovieId[String(value || "").toUpperCase()] && <Tag color="orange">缺信息</Tag>}
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
                        {(record.genres || []).slice(0, 8).map((genre) => renderFilterTag("genres", genre, "cyan"))}
                        {(record.genres || []).length > 8 && <Tag>+{record.genres.length - 8}</Tag>}
                    </Space>
                    <Space size={4} wrap>
                        {(record.stars || []).slice(0, 6).map((star) => renderFilterTag("stars", star, "magenta"))}
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
        {
            title: "操作",
            key: "actions",
            width: 96,
            render: (_, record) => (
                <Popconfirm
                    title={`从影视库移除 ${record.movie_id}？`}
                    description="只删除数据库记录，不删除本地视频文件。"
                    okText="移除"
                    cancelText="取消"
                    onConfirm={(event) => {
                        event?.stopPropagation?.();
                        return handleDeleteMovie(record);
                    }}
                >
                    <Button
                        danger
                        size="small"
                        icon={<Icon as={DeleteOutlined} />}
                        loading={deletingMovieId === record.movie_id}
                        onClick={(event) => event.stopPropagation()}
                    >
                        移除
                    </Button>
                </Popconfirm>
            ),
        },
    ];

    if (selectedRecord) {
        const previewBackdropSource = posterSource(selectedRecord) || thumbnailSource(selectedRecord);
        const previewBackdropStyle = previewBackdropSource
            ? { "--jav-library-preview-backdrop": `url("${previewBackdropSource.replace(/"/g, '\\"')}")` }
            : undefined;
        return (
            <div className="jav-local-scrape jav-library-page is-previewing">
                <div
                    className="jav-library-preview-backdrop"
                    style={previewBackdropStyle}
                    onClick={closeRecordPreview}
                >
                    <section
                        className="jav-local-results jav-library-results jav-library-preview-surface"
                        role="dialog"
                        aria-modal="true"
                        aria-label="影片沉浸式预览"
                        onClick={(event) => event.stopPropagation()}
                    >
                        {renderRecordPreview()}
                    </section>
                </div>
            </div>
        );
    }

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
                        <Segmented
                            value={viewMode}
                            onChange={setViewMode}
                            options={[
                                { label: <span><Icon as={UnorderedListOutlined} /> 列表</span>, value: "list" },
                                { label: <span><Icon as={AppstoreOutlined} /> 卡片</span>, value: "grid" },
                            ]}
                        />
                        <div className="jav-library-size-control">
                            <Text type="secondary">大小</Text>
                            <Slider
                                min={viewMode === "grid" ? 120 : 44}
                                max={viewMode === "grid" ? 240 : 96}
                                step={4}
                                value={viewMode === "grid" ? gridPosterSize : listPosterSize}
                                onChange={viewMode === "grid" ? setGridPosterSize : setListPosterSize}
                                tooltip={{ formatter: (value) => `${value}px` }}
                            />
                        </div>
                        <Button icon={<Icon as={FolderOpenOutlined} />} onClick={() => setScanOpen(true)}>
                            扫描入库
                        </Button>
                        <Button icon={<Icon as={FilterOutlined} />} onClick={() => setFilterOpen(true)}>
                            筛选{activeFilterCount ? ` (${activeFilterCount})` : ""}
                        </Button>
                        <Button icon={<Icon as={SearchOutlined} />} onClick={openInformationCheck} loading={checkingInformation}>
                            检查信息
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
                    <div className="jav-kpi-grid jav-local-kpis jav-library-kpis">
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
                        <div className="jav-kpi-card">
                            <span className="jav-kpi-label">信息</span>
                            <strong>{informationCheck ? informationCheck.incomplete_count : "-"}</strong>
                            <span className="jav-kpi-note">缺失资料</span>
                        </div>
                    </div>
                    {informationCheck && (
                        <Alert
                            style={{ marginTop: 14 }}
                            type={informationCheck.incomplete_count > 0 ? "warning" : "success"}
                            showIcon
                            message={`信息检查：完整 ${informationCheck.complete_count || 0} / ${informationCheck.total_movies || 0}`}
                            description={
                                informationCheck.incomplete_count > 0
                                    ? `缺失 ${informationCheck.incomplete_count} 部，可在“检查信息”窗口中下载缺失信息。`
                                    : "当前已入库影片信息和本地资料完整。"
                            }
                        />
                    )}
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
                    {viewMode === "grid" ? (
                        filteredRecords.length ? (
                            <div
                                className="jav-library-poster-grid"
                                style={{ "--jav-library-card-min": `${gridPosterSize}px` }}
                            >
                                {filteredRecords.map((record) => (
                                    <Card
                                        key={record.movie_id}
                                        hoverable
                                        className="jav-library-poster-card"
                                        cover={<MoviePoster record={record} variant="thumbnail" />}
                                        onClick={() => openRecordPreview(record)}
                                    >
                                        <Text strong ellipsis={{ tooltip: record.title }} className="jav-library-poster-title">
                                            {record.title || record.movie_id}
                                        </Text>
                                        <div className="jav-library-poster-meta">
                                            <Tag color="blue">{record.movie_id}</Tag>
                                            {record.date && <Text type="secondary">{String(record.date).slice(0, 4)}</Text>}
                                        </div>
                                        <Popconfirm
                                            title={`从影视库移除 ${record.movie_id}？`}
                                            description="只删除数据库记录，不删除本地视频文件。"
                                            okText="移除"
                                            cancelText="取消"
                                            onConfirm={(event) => {
                                                event?.stopPropagation?.();
                                                return handleDeleteMovie(record);
                                            }}
                                        >
                                            <Button
                                                danger
                                                size="small"
                                                icon={<Icon as={DeleteOutlined} />}
                                                loading={deletingMovieId === record.movie_id}
                                                onClick={(event) => event.stopPropagation()}
                                                style={{ marginTop: 8 }}
                                            >
                                                移除
                                            </Button>
                                        </Popconfirm>
                                        <div className="jav-library-poster-tags">
                                            {(record.stars || []).slice(0, 2).map((star) => renderFilterTag("stars", star, "magenta"))}
                                            {(record.genres || []).slice(0, 2).map((genre) => renderFilterTag("genres", genre, "cyan"))}
                                        </div>
                                    </Card>
                                ))}
                            </div>
                        ) : (
                            <div className="jav-state-panel jav-library-empty-state">
                                <Text type="secondary">暂无影视库记录，请先扫描目录</Text>
                            </div>
                        )
                    ) : (
                        <Table
                            rowKey="movie_id"
                            size="small"
                            dataSource={filteredRecords}
                            columns={columns}
                            loading={loading}
                            pagination={{ pageSize: 12, showSizeChanger: true }}
                            onRow={(record) => ({
                                onClick: () => openRecordPreview(record),
                            })}
                            locale={{ emptyText: "暂无影视库记录，请先扫描目录" }}
                        />
                    )}
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
                                <DirectoryInput placeholder="Windows: D:\\Media\\JAV  /  Linux: /media/JAV 或 ~/Videos/JAV" />
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
                        title="检查信息"
                        placement="right"
                        width={460}
                        open={informationCheckOpen}
                        onClose={() => setInformationCheckOpen(false)}
                    >
                        <div className="jav-library-filter-help">
                            <Text type="secondary">先设置本次检查标准，再开始检查。默认检查全部信息项，保存后下次会自动沿用。</Text>
                        </div>
                        <Form
                            form={informationCheckForm}
                            layout="vertical"
                            initialValues={{ fields: informationCheckFields }}
                            onFinish={loadInformationCheck}
                        >
                            <Form.Item
                                name="fields"
                                label="检查标准"
                                rules={[{ required: true, message: "请至少选择一个检查项" }]}
                            >
                                <Checkbox.Group options={INFORMATION_CHECK_FIELD_OPTIONS} />
                            </Form.Item>
                            <Space wrap>
                                <Button type="primary" htmlType="submit" loading={checkingInformation} icon={<Icon as={SearchOutlined} />}>
                                    开始检查
                                </Button>
                                <Button onClick={handleSaveInformationCheckSettings}>
                                    保存标准
                                </Button>
                            </Space>
                        </Form>

                        {informationCheck && (
                            <>
                                <Divider />
                                <Alert
                                    type={informationCheck.incomplete_count > 0 ? "warning" : "success"}
                                    showIcon
                                    message={`检查结果：完整 ${informationCheck.complete_count || 0} / ${informationCheck.total_movies || 0}`}
                                    description={
                                        informationCheck.incomplete_count > 0
                                            ? `按当前标准仍有 ${informationCheck.incomplete_count} 部缺失信息。`
                                            : "当前标准下影视库信息完整。"
                                    }
                                />
                                {informationCheck.incomplete_count > 0 && (
                                    <>
                                        <Table
                                            size="small"
                                            rowKey="movie_id"
                                            style={{ marginTop: 12 }}
                                            dataSource={informationCheck.incomplete_records || []}
                                            pagination={{ pageSize: 5, size: "small" }}
                                            columns={[
                                                {
                                                    title: "番号",
                                                    dataIndex: "movie_id",
                                                    key: "movie_id",
                                                    width: 110,
                                                },
                                                {
                                                    title: "缺失项",
                                                    key: "missing_labels",
                                                    render: (_, record) => (
                                                        <Space size={[4, 4]} wrap>
                                                            {(record.missing_labels || []).map((label) => (
                                                                <Tag key={label} color="warning">{label}</Tag>
                                                            ))}
                                                        </Space>
                                                    ),
                                                },
                                            ]}
                                        />
                                        <Divider />
                                        <div className="jav-library-filter-help">
                                            <Text type="secondary">按上面的检查结果补全缺失影片，并可写入与本地刮削相同类型的本地资料文件。</Text>
                                        </div>
                                    </>
                                )}
                            </>
                        )}

                        {informationCheck && informationCheck.incomplete_count > 0 && (
                        <Form
                            form={informationDownloadForm}
                            layout="vertical"
                            initialValues={{
                                writeNfo: true,
                                downloadImages: true,
                                downloadSampleImages: false,
                                downloadActorImages: false,
                                downloadListThumbnail: false,
                                overwriteExisting: false,
                                concurrent: 3,
                            }}
                            onFinish={handleDownloadMissingInformation}
                        >
                            <Space wrap>
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
                                <Form.Item name="concurrent" label="刮削并发">
                                    <InputNumber min={1} max={5} />
                                </Form.Item>
                                <Form.Item name="overwriteExisting" label="覆盖已有文件" valuePropName="checked">
                                    <Checkbox />
                                </Form.Item>
                            </Space>
                            <Button type="primary" htmlType="submit" block loading={downloadingInformation} icon={<Icon as={DownloadOutlined} />}>
                                下载缺失信息
                            </Button>
                        </Form>
                        )}
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
