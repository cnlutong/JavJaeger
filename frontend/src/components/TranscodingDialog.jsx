const React = window.React;
const antd = window.antd;
const icons = window.icons || {};

const {
    Alert,
    Button,
    Card,
    Col,
    Collapse,
    Divider,
    Form,
    InputNumber,
    Modal,
    Row,
    Select,
    Space,
    Switch,
    Tag,
    Typography,
    message,
} = antd;
const { VideoCameraOutlined, SettingOutlined, ThunderboltOutlined } = icons;
const { Text, Title } = Typography;

const VIDEO_CODEC_LABELS = {
    libx264: "H.264 / x264（高兼容）",
    libx265: "H.265 / x265（高压缩）",
    libsvtav1: "AV1 / SVT-AV1（极致压缩）",
    h264_nvenc: "H.264 / NVIDIA NVENC",
    hevc_nvenc: "H.265 / NVIDIA NVENC",
    av1_nvenc: "AV1 / NVIDIA NVENC",
};
const AUDIO_CODEC_LABELS = {
    aac: "AAC",
    ac3: "Dolby AC-3",
    libopus: "Opus",
    copy: "复制原音频（不转码）",
};
const SPEED_OPTIONS = [
    ["ultrafast", "极速"],
    ["veryfast", "很快"],
    ["fast", "较快"],
    ["medium", "均衡"],
    ["slow", "慢速 / 更好压缩"],
    ["slower", "更慢 / 更好压缩"],
    ["veryslow", "最慢 / 极致压缩"],
].map(([value, label]) => ({ value, label }));

const formatBytes = (value) => {
    const bytes = Number(value) || 0;
    if (!bytes) return "0 B";
    const units = ["B", "KB", "MB", "GB", "TB"];
    const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
    return `${(bytes / (1024 ** index)).toFixed(index > 2 ? 2 : 1)} ${units[index]}`;
};

const responseError = (response, payload, fallback) => {
    const detail = payload?.detail;
    return detail?.message || payload?.message || (typeof detail === "string" ? detail : "") || fallback || `HTTP ${response.status}`;
};

export default function TranscodingDialog({
    open,
    record,
    initialFileIndex = 0,
    onClose,
    onStarted,
    onOpenPanel,
}) {
    const [form] = Form.useForm();
    const [capabilities, setCapabilities] = React.useState(null);
    const [loadingCapabilities, setLoadingCapabilities] = React.useState(false);
    const [submitting, setSubmitting] = React.useState(false);
    const qualityMode = Form.useWatch("quality_mode", form);
    const audioCodec = Form.useWatch("audio_codec", form);
    const selectedPresetId = Form.useWatch("preset_id", form);
    const files = Array.isArray(record?.files) ? record.files : [];

    const applyPreset = React.useCallback((presetId, presetPayload = capabilities) => {
        const preset = presetPayload?.presets?.find((item) => item.id === presetId);
        if (!preset) return;
        form.setFieldsValue({ preset_id: preset.id, ...preset.options });
    }, [capabilities, form]);

    React.useEffect(() => {
        if (!open) return undefined;
        let active = true;
        setLoadingCapabilities(true);
        fetch("/api/movies/transcoding/presets")
            .then(async (response) => {
                const payload = await response.json();
                if (!response.ok || !payload.success) {
                    throw new Error(responseError(response, payload, "加载转码预设失败"));
                }
                if (!active) return;
                setCapabilities(payload);
                const defaultPreset = payload.presets?.find((item) => item.id === "balanced_h264") || payload.presets?.[0];
                form.resetFields();
                form.setFieldsValue({ file_index: initialFileIndex, preset_id: defaultPreset?.id });
                if (defaultPreset) {
                    form.setFieldsValue(defaultPreset.options);
                }
            })
            .catch((error) => active && message.error(error.message))
            .finally(() => active && setLoadingCapabilities(false));
        return () => {
            active = false;
        };
    }, [open, record?.movie_id, initialFileIndex, form]);

    const handleSubmit = async (values) => {
        if (!record?.movie_id) {
            message.error("未选择有效影片");
            return;
        }
        const { preset_id, file_index, ...options } = values;
        setSubmitting(true);
        try {
            const response = await fetch("/api/movies/transcoding/tasks", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    movie_id: record.movie_id,
                    file_index,
                    preset_id,
                    options,
                }),
            });
            const payload = await response.json();
            if (!response.ok) {
                throw new Error(responseError(response, payload, "启动转码失败"));
            }
            message.success(`${record.movie_id} 已加入后台转码队列`);
            onStarted?.(payload);
            onClose?.();
        } catch (error) {
            message.error(error.message);
        } finally {
            setSubmitting(false);
        }
    };

    const selectedPreset = capabilities?.presets?.find((item) => item.id === selectedPresetId);
    const ffmpegUnavailable = capabilities && !capabilities.ffmpeg_available;

    return (
        <Modal
            title={<Space><VideoCameraOutlined /><span>转码影片</span></Space>}
            open={open}
            onCancel={onClose}
            footer={null}
            width={860}
            destroyOnClose={false}
        >
            <Space direction="vertical" size="middle" style={{ width: "100%" }}>
                <Card size="small">
                    <Space direction="vertical" size={2} style={{ width: "100%" }}>
                        <Title level={5} style={{ margin: 0 }}>{record?.title || record?.movie_id || "未选择影片"}</Title>
                        <Text type="secondary">{record?.movie_id} · {files.length} 个本地文件</Text>
                    </Space>
                </Card>

                <Alert
                    type="warning"
                    showIcon
                    message="任务完成后将安全覆盖原文件"
                    description="FFmpeg 会先在原文件目录生成临时文件，编码成功后再原子替换；失败或取消不会改动原片。转码期间请勿移动、播放或删除该文件。"
                />
                {ffmpegUnavailable && (
                    <Alert type="error" showIcon message="服务器未检测到 FFmpeg" description="请安装 FFmpeg 并确保 ffmpeg、ffprobe 可执行文件位于 PATH。" />
                )}

                <Form form={form} layout="vertical" onFinish={handleSubmit}>
                    <Row gutter={16}>
                        <Col xs={24} md={12}>
                            <Form.Item name="file_index" label="源文件" rules={[{ required: true }]}>
                                <Select
                                    options={files.map((file, index) => ({
                                        value: index,
                                        label: `${file.file_name || file.path} · ${formatBytes(file.size)}`,
                                    }))}
                                />
                            </Form.Item>
                        </Col>
                        <Col xs={24} md={12}>
                            <Form.Item name="preset_id" label="常用预设包" rules={[{ required: true }]}>
                                <Select
                                    loading={loadingCapabilities}
                                    onChange={(value) => applyPreset(value)}
                                    options={(capabilities?.presets || []).map((preset) => ({
                                        value: preset.id,
                                        disabled: preset.available === false,
                                        label: `${preset.name}${preset.available === false ? "（编码器不可用）" : ""}`,
                                    }))}
                                />
                            </Form.Item>
                        </Col>
                    </Row>

                    {selectedPreset && (
                        <Alert
                            type="info"
                            showIcon
                            icon={<ThunderboltOutlined />}
                            message={<Space><Tag color="blue">{selectedPreset.category}</Tag><Text strong>{selectedPreset.name}</Text></Space>}
                            description={selectedPreset.description}
                            style={{ marginBottom: 16 }}
                        />
                    )}

                    <Collapse
                        defaultActiveKey={["video", "audio"]}
                        items={[
                            {
                                key: "video",
                                label: <Space><SettingOutlined />专业视频参数</Space>,
                                children: (
                                    <Row gutter={16}>
                                        <Col xs={24} md={12}>
                                            <Form.Item name="video_codec" label="视频编码" rules={[{ required: true }]}>
                                                <Select
                                                    options={(capabilities?.video_codecs || []).map((codec) => ({
                                                        value: codec.value,
                                                        label: VIDEO_CODEC_LABELS[codec.value] || codec.value,
                                                        disabled: codec.available === false,
                                                    }))}
                                                    onChange={(value) => {
                                                        if (!["libx264", "libx265"].includes(value) || (value === "libx265" && form.getFieldValue("tune") === "film")) {
                                                            form.setFieldValue("tune", undefined);
                                                        }
                                                    }}
                                                />
                                            </Form.Item>
                                        </Col>
                                        <Col xs={24} md={12}>
                                            <Form.Item name="speed_preset" label="编码速度" rules={[{ required: true }]}>
                                                <Select options={SPEED_OPTIONS} />
                                            </Form.Item>
                                        </Col>
                                        <Col xs={24} md={8}>
                                            <Form.Item name="quality_mode" label="质量控制" rules={[{ required: true }]}>
                                                <Select options={[{ value: "crf", label: "恒定质量 CRF" }, { value: "bitrate", label: "平均码率" }]} />
                                            </Form.Item>
                                        </Col>
                                        <Col xs={24} md={8}>
                                            {qualityMode === "bitrate" ? (
                                                <Form.Item name="video_bitrate_kbps" label="视频码率 (kbps)" rules={[{ required: true }]}>
                                                    <InputNumber min={100} max={200000} step={500} style={{ width: "100%" }} />
                                                </Form.Item>
                                            ) : (
                                                <Form.Item name="crf" label="CRF（越低画质越高）" rules={[{ required: true }]}>
                                                    <InputNumber min={0} max={51} style={{ width: "100%" }} />
                                                </Form.Item>
                                            )}
                                        </Col>
                                        <Col xs={24} md={8}>
                                            <Form.Item name="max_height" label="最大高度">
                                                <Select
                                                    allowClear
                                                    placeholder="保持原分辨率"
                                                    options={[2160, 1440, 1080, 720, 576, 480].map((value) => ({ value, label: `${value}p` }))}
                                                />
                                            </Form.Item>
                                        </Col>
                                        <Col xs={24} md={8}>
                                            <Form.Item name="frame_rate" label="帧率">
                                                <Select
                                                    allowClear
                                                    placeholder="保持原帧率"
                                                    options={[24, 25, 30, 50, 60].map((value) => ({ value, label: `${value} FPS` }))}
                                                />
                                            </Form.Item>
                                        </Col>
                                        <Col xs={24} md={8}>
                                            <Form.Item name="pixel_format" label="像素格式">
                                                <Select options={[
                                                    { value: "yuv420p", label: "8-bit YUV 4:2:0（兼容）" },
                                                    { value: "yuv420p10le", label: "10-bit YUV 4:2:0" },
                                                    { value: "auto", label: "编码器自动" },
                                                ]} />
                                            </Form.Item>
                                        </Col>
                                        <Col xs={24} md={8}>
                                            <Form.Item name="tune" label="内容调优">
                                                <Select allowClear placeholder="不指定" options={[
                                                    { value: "film", label: "真人影片" },
                                                    { value: "animation", label: "动画" },
                                                    { value: "grain", label: "保留胶片颗粒" },
                                                    { value: "fastdecode", label: "快速解码" },
                                                    { value: "zerolatency", label: "低延迟" },
                                                ]} />
                                            </Form.Item>
                                        </Col>
                                        <Col xs={24} md={8}>
                                            <Form.Item name="deinterlace" label="反交错" valuePropName="checked">
                                                <Switch checkedChildren="启用" unCheckedChildren="关闭" />
                                            </Form.Item>
                                        </Col>
                                    </Row>
                                ),
                            },
                            {
                                key: "audio",
                                label: "音频、字幕与元数据",
                                children: (
                                    <Row gutter={16}>
                                        <Col xs={24} md={8}>
                                            <Form.Item name="audio_codec" label="音频编码" rules={[{ required: true }]}>
                                                <Select
                                                    options={(capabilities?.audio_codecs || []).map((value) => ({ value, label: AUDIO_CODEC_LABELS[value] || value }))}
                                                    onChange={(value) => {
                                                        if (value === "copy") {
                                                            form.setFieldsValue({ audio_bitrate_kbps: undefined, audio_channels: undefined });
                                                        }
                                                    }}
                                                />
                                            </Form.Item>
                                        </Col>
                                        <Col xs={24} md={8}>
                                            <Form.Item name="audio_bitrate_kbps" label="音频码率 (kbps)">
                                                <InputNumber disabled={audioCodec === "copy"} min={32} max={1536} step={32} style={{ width: "100%" }} />
                                            </Form.Item>
                                        </Col>
                                        <Col xs={24} md={8}>
                                            <Form.Item name="audio_channels" label="声道数">
                                                <Select disabled={audioCodec === "copy"} allowClear placeholder="保持原声道" options={[
                                                    { value: 1, label: "单声道" },
                                                    { value: 2, label: "双声道" },
                                                    { value: 6, label: "5.1 声道" },
                                                    { value: 8, label: "7.1 声道" },
                                                ]} />
                                            </Form.Item>
                                        </Col>
                                        <Col xs={24} md={12}>
                                            <Form.Item name="copy_subtitles" label="保留字幕流" valuePropName="checked">
                                                <Switch checkedChildren="保留" unCheckedChildren="丢弃" />
                                            </Form.Item>
                                        </Col>
                                        <Col xs={24} md={12}>
                                            <Form.Item name="copy_metadata" label="保留元数据与章节" valuePropName="checked">
                                                <Switch checkedChildren="保留" unCheckedChildren="丢弃" />
                                            </Form.Item>
                                        </Col>
                                    </Row>
                                ),
                            },
                        ]}
                    />

                    <Divider />
                    <Space style={{ width: "100%", justifyContent: "space-between" }} wrap>
                        <Button type="link" onClick={() => { onClose?.(); onOpenPanel?.(); }}>打开转码面板</Button>
                        <Space>
                            <Button onClick={onClose}>取消</Button>
                            <Button type="primary" htmlType="submit" icon={<VideoCameraOutlined />} loading={submitting} disabled={ffmpegUnavailable}>
                                启动后台转码
                            </Button>
                        </Space>
                    </Space>
                </Form>
            </Space>
        </Modal>
    );
}
