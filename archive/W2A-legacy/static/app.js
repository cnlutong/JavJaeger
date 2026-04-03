const {
    Layout, Typography, Badge, Card, Form, Input, Button,
    Table, Breadcrumb, Switch, InputNumber, Space, message,
    Row, Col, Popconfirm, Progress, Tag
} = antd;
const {
    CloudDownloadOutlined, CloudOutlined, DownloadOutlined,
    FolderFilled, PlayCircleFilled, FileOutlined,
    ReloadOutlined, PauseCircleOutlined, PlayCircleOutlined,
    DeleteOutlined, StopOutlined, ApiOutlined, CloudServerOutlined
} = icons;

const { Header, Content, Footer } = Layout;
const { Title, Text } = Typography;

const App = () => {
    const [webdavConnected, setWebdavConnected] = React.useState(false);
    const [aria2Connected, setAria2Connected] = React.useState(false);

    // WebDAV Form
    const [webdavLoading, setWebdavLoading] = React.useState(false);

    // Aria2 Form
    const [aria2Loading, setAria2Loading] = React.useState(false);

    // File Browser
    const [currentPath, setCurrentPath] = React.useState('/');
    const [files, setFiles] = React.useState([]);
    const [filesLoading, setFilesLoading] = React.useState(false);
    const [selectedRowKeys, setSelectedRowKeys] = React.useState([]);
    const [selectedRows, setSelectedRows] = React.useState([]);

    const [videoFilter, setVideoFilter] = React.useState(false);
    const [minFileSizeMb, setMinFileSizeMb] = React.useState(300);
    const [downloadingSelection, setDownloadingSelection] = React.useState(false);

    // Downloads
    const [downloads, setDownloads] = React.useState([]);
    const [downloadsLoading, setDownloadsLoading] = React.useState(false);

    // Initial load
    React.useEffect(() => {
        checkConnectionStatus();
    }, []);

    const checkConnectionStatus = async () => {
        try {
            const res = await fetch('/api/status');
            const status = await res.json();
            setWebdavConnected(status.webdav_connected);
            setAria2Connected(status.aria2_connected);

            if (status.webdav_connected) {
                loadFiles('/');
            }
            if (status.aria2_connected) {
                loadDownloads();
            }
        } catch (error) {
            console.error('Check connection error:', error);
        }
    };

    const handleWebdavConnect = async (values) => {
        setWebdavLoading(true);
        const formData = new FormData();
        formData.append('webdav_url', values.url);
        formData.append('username', values.username || '');
        formData.append('password', values.password || '');

        try {
            const res = await fetch('/api/connect/webdav', { method: 'POST', body: formData });
            const result = await res.json();
            if (result.success) {
                message.success('WebDAV连接成功！');
                setWebdavConnected(true);
                loadFiles('/');
            } else {
                message.error(result.message || 'WebDAV连接失败');
                setWebdavConnected(false);
            }
        } catch (error) {
            message.error('WebDAV连接异常');
            setWebdavConnected(false);
        }
        setWebdavLoading(false);
    };

    const handleAria2Connect = async (values) => {
        setAria2Loading(true);
        const formData = new FormData();
        formData.append('aria2_url', values.url);
        formData.append('aria2_secret', values.secret || '');

        try {
            const res = await fetch('/api/connect/aria2', { method: 'POST', body: formData });
            const result = await res.json();
            if (result.success) {
                message.success('Aria2连接成功！');
                setAria2Connected(true);
                loadDownloads();
            } else {
                message.error(result.message || 'Aria2连接失败');
                setAria2Connected(false);
            }
        } catch (error) {
            message.error('Aria2连接异常');
            setAria2Connected(false);
        }
        setAria2Loading(false);
    };

    const loadFiles = async (path) => {
        setFilesLoading(true);
        try {
            const res = await fetch(`/api/files?path=${encodeURIComponent(path)}`);
            const result = await res.json();
            if (result.success) {
                setCurrentPath(path);

                // Add parent directory ".." if not root
                let fileList = [];
                if (path !== '/') {
                    const parts = path.split('/').filter(p => p);
                    parts.pop();
                    const parentPath = parts.length === 0 ? '/' : '/' + parts.join('/');
                    fileList.push({
                        key: '..',
                        name: '..',
                        path: parentPath,
                        is_directory: true,
                        size: 0,
                        isParent: true
                    });
                }

                // Sort
                let actualFiles = result.files || [];
                actualFiles.sort((a, b) => {
                    if (a.is_directory && !b.is_directory) return -1;
                    if (!a.is_directory && b.is_directory) return 1;
                    return a.name.localeCompare(b.name);
                });

                actualFiles = actualFiles.map(f => ({ ...f, key: f.path }));

                setFiles([...fileList, ...actualFiles]);
                setSelectedRowKeys([]);
                setSelectedRows([]);
            } else {
                message.error(result.message || '加载文件失败');
            }
        } catch (error) {
            message.error('加载文件异常');
        }
        setFilesLoading(false);
    };

    const loadDownloads = async () => {
        setDownloadsLoading(true);
        try {
            const res = await fetch('/api/aria2/downloads');
            const result = await res.json();
            if (result.success) {
                setDownloads(result.downloads || []);
            } else {
                message.error('获取下载列表失败: ' + result.message);
            }
        } catch (error) {
            message.error('获取下载列表异常');
        }
        setDownloadsLoading(false);
    };

    const handleDownloadSelected = async () => {
        if (selectedRows.length === 0) return;
        if (!aria2Connected) {
            message.warning('请先连接Aria2下载器');
            return;
        }

        setDownloadingSelection(true);
        try {
            const requestData = {
                files: selectedRows,
                video_filter: videoFilter,
                min_file_size_mb: minFileSizeMb
            };

            const res = await fetch('/api/download', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(requestData)
            });
            const result = await res.json();

            if (result.success) {
                const successCount = result.results.filter(r => r.success).length;
                const failCount = result.results.filter(r => !r.success).length;

                if (successCount > 0) {
                    message.success(`成功添加 ${successCount} 个下载任务${failCount > 0 ? `，${failCount} 个失败` : ''}`);
                    loadDownloads();
                } else if (failCount > 0) {
                    message.error(`${failCount} 个文件下载失败`);
                }
                setSelectedRowKeys([]);
                setSelectedRows([]);
            } else {
                message.error('批量下载失败');
            }
        } catch (error) {
            message.error('批量下载异常');
        }
        setDownloadingSelection(false);
    };

    const downloadSingleFile = async (record) => {
        if (!aria2Connected) {
            message.warning('请先连接Aria2下载器');
            return;
        }

        try {
            message.loading({ content: `正在添加任务: ${record.name}`, key: 'downloading' });
            const requestData = {
                files: [record],
                video_filter: videoFilter,
                min_file_size_mb: minFileSizeMb
            };

            const res = await fetch('/api/download', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(requestData)
            });
            const result = await res.json();

            if (result.success && result.results.length > 0) {
                const successCount = result.results.filter(r => r.success).length;
                const failCount = result.results.filter(r => !r.success).length;

                if (successCount > 0) {
                    message.success({ content: `已添加下载任务: ${record.name}${record.is_directory ? ` (${successCount}个文件)` : ''}`, key: 'downloading' });
                    loadDownloads();
                } else if (failCount > 0) {
                    const firstError = result.results.find(r => !r.success);
                    message.error({ content: `下载失败: ${firstError.message}`, key: 'downloading' });
                }
            } else {
                message.error({ content: '没有可下载的文件', key: 'downloading' });
            }
        } catch (error) {
            message.error({ content: '下载异常', key: 'downloading' });
        }
    };

    const doDownloadAction = async (action, gid) => {
        try {
            const res = await fetch(`/api/aria2/${action}/${gid}`, { method: action === 'remove' ? 'DELETE' : 'POST' });
            const result = await res.json();
            if (result.success) {
                message.success('操作成功');
                loadDownloads();
            } else {
                message.error(result.message || '操作失败');
            }
        } catch (error) {
            message.error('操作异常');
        }
    };

    // Utils
    const formatFileSize = (bytes) => {
        if (!bytes || bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    };

    const formatSpeed = (speed) => {
        return formatFileSize(speed) + '/s';
    };

    const isVideoFile = (filename) => {
        if (!filename) return false;
        const ext = filename.split('.').pop().toLowerCase();
        return ['mp4', 'avi', 'mkv', 'mov', 'wmv', 'flv', 'webm', 'm4v', 'ts', 'mts', 'mpeg', 'mpg'].includes(ext);
    };

    // Columns
    const fileColumns = [
        {
            title: '名称',
            dataIndex: 'name',
            key: 'name',
            ellipsis: true,
            render: (text, record) => {
                const isVideo = !record.is_directory && isVideoFile(record.name);
                const isLargeVideo = isVideo && record.size >= minFileSizeMb * 1024 * 1024;

                let icon;
                if (record.is_directory) {
                    icon = <FolderFilled style={{ color: '#ffc107', marginRight: 8, fontSize: 16 }} />;
                } else if (isVideo) {
                    icon = <PlayCircleFilled className="video-icon" style={{ marginRight: 8, fontSize: 16 }} />;
                } else {
                    icon = <FileOutlined style={{ color: '#8c8c8c', marginRight: 8, fontSize: 16 }} />;
                }

                return (
                    <div style={{ display: 'flex', alignItems: 'center', width: '100%' }}>
                        <div style={{ flexShrink: 0 }}>{icon}</div>
                        <a onClick={() => record.is_directory && loadFiles(record.path)}
                            style={{
                                color: 'inherit',
                                fontWeight: isLargeVideo ? 600 : 'normal',
                                whiteSpace: 'nowrap',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                display: 'inline-block',
                                maxWidth: '100%'
                            }}
                            title={text}
                        >
                            {text}
                        </a>
                        {isLargeVideo && <div style={{ flexShrink: 0 }}><Tag color="success" style={{ marginLeft: 8 }}>✓ 视频</Tag></div>}
                    </div>
                );
            }
        },
        {
            title: '类型',
            dataIndex: 'is_directory',
            key: 'type',
            width: 100,
            render: (isDir, record) => {
                if (record.isParent) return '-';
                if (isDir) return <Tag color="warning">目录</Tag>;
                if (isVideoFile(record.name)) return <Tag color="processing">视频</Tag>;
                return <Tag>文件</Tag>;
            }
        },
        {
            title: '大小',
            dataIndex: 'size',
            key: 'size',
            width: 120,
            render: (size, record) => record.is_directory ? '-' : <Text type="secondary" style={{ fontFamily: 'monospace' }}>{formatFileSize(size)}</Text>
        },
        {
            title: '操作',
            key: 'action',
            width: 100,
            render: (_, record) => (
                !record.isParent ?
                    <Button
                        type="primary"
                        ghost
                        icon={<DownloadOutlined />}
                        size="small"
                        onClick={(e) => { e.stopPropagation(); downloadSingleFile(record); }}
                    /> : null
            )
        }
    ];

    const downloadColumns = [
        {
            title: '文件名',
            key: 'name',
            ellipsis: true,
            render: (_, record) => {
                let name = record.name || '未知文件';
                if ((!record.name || record.name === '未知文件') && record.files?.[0]?.uris?.[0]?.uri) {
                    try {
                        const urlObj = new URL(record.files[0].uris[0].uri);
                        name = decodeURIComponent(urlObj.pathname.split('/').pop() || '未知文件');
                    } catch (e) { }
                }
                return name;
            }
        },
        {
            title: '状态',
            dataIndex: 'status',
            key: 'status',
            width: 100,
            render: (status) => {
                const map = {
                    'active': { color: 'processing', text: '下载中' },
                    'waiting': { color: 'default', text: '等待中' },
                    'paused': { color: 'warning', text: '已暂停' },
                    'error': { color: 'error', text: '错误' },
                    'complete': { color: 'success', text: '已完成' },
                    'removed': { color: 'default', text: '已删除' }
                };
                const s = map[status] || { color: 'default', text: status };
                return <Tag color={s.color}>{s.text}</Tag>;
            }
        },
        {
            title: '进度',
            key: 'progress',
            width: 200,
            render: (_, record) => {
                const percent = record.totalLength > 0 ?
                    Math.round((record.completedLength / record.totalLength) * 100) : 0;
                return <Progress percent={percent} size="small" status={record.status === 'error' ? 'exception' : record.status === 'active' ? 'active' : 'normal'} />;
            }
        },
        {
            title: '速度',
            dataIndex: 'downloadSpeed',
            key: 'speed',
            width: 120,
            render: (s) => <Text style={{ fontFamily: 'monospace' }}>{formatSpeed(s)}</Text>
        },
        {
            title: '大小',
            dataIndex: 'totalLength',
            key: 'size',
            width: 120,
            render: (s) => <Text style={{ fontFamily: 'monospace' }}>{formatFileSize(s)}</Text>
        },
        {
            title: '操作',
            key: 'action',
            width: 180,
            render: (_, record) => (
                <Space size="small">
                    {record.status === 'active' &&
                        <Button size="small" type="primary" onClick={() => doDownloadAction('pause', record.gid)} icon={<PauseCircleOutlined />}>暂停</Button>}
                    {(record.status === 'paused' || record.status === 'waiting') &&
                        <Button size="small" type="primary" ghost onClick={() => doDownloadAction('resume', record.gid)} icon={<PlayCircleOutlined />}>继续</Button>}
                    <Popconfirm title="确定删除?" onConfirm={() => doDownloadAction('remove', record.gid)}>
                        <Button size="small" danger icon={<DeleteOutlined />}>删除</Button>
                    </Popconfirm>
                </Space>
            )
        }
    ];

    const breadcrumbItems = currentPath.split('/').filter(p => p).reduce((acc, part, index) => {
        const path = acc.length === 0 ? '/' + part : acc[acc.length - 1].path + '/' + part;
        acc.push({ title: <a onClick={() => loadFiles(path)}>{part}</a>, path: path });
        return acc;
    }, []);

    return (
        <Layout className="app-layout">
            <Header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 24px' }}>
                <div className="logo-container">
                    <CloudDownloadOutlined style={{ fontSize: 24 }} />
                    <span>WebDAV网盘监控工具</span>
                </div>
                <div className="header-actions">
                    <Space size="middle">
                        <span>
                            <Text style={{ color: 'rgba(255,255,255,0.85)' }}>WebDAV:</Text>
                            <Badge status={webdavConnected ? "success" : "error"} text={<span style={{ color: 'white' }}>{webdavConnected ? '已连接' : '未连接'}</span>} className="header-status-badge" />
                        </span>
                        <span>
                            <Text style={{ color: 'rgba(255,255,255,0.85)' }}>Aria2:</Text>
                            <Badge status={aria2Connected ? "success" : "error"} text={<span style={{ color: 'white' }}>{aria2Connected ? '已连接' : '未连接'}</span>} className="header-status-badge" />
                        </span>
                    </Space>
                </div>
            </Header>

            <Content style={{ padding: '24px 50px', maxWidth: 1400, margin: '0 auto', width: '100%' }}>
                <Row gutter={[24, 24]}>
                    <Col xs={24} md={12}>
                        <Card title={<><CloudOutlined /> WebDAV服务器</>} extra={<Badge status={webdavConnected ? "success" : "error"} text={webdavConnected ? "已连接" : "未连接"} />}>
                            <Form layout="vertical" onFinish={handleWebdavConnect} initialValues={{ url: 'https://example.com/webdav' }}>
                                <Form.Item label="WebDAV URL" name="url" rules={[{ required: true, message: '请输入WebDAV URL' }]}>
                                    <Input placeholder="https://..." />
                                </Form.Item>
                                <Row gutter={16}>
                                    <Col span={12}>
                                        <Form.Item label="用户名" name="username">
                                            <Input />
                                        </Form.Item>
                                    </Col>
                                    <Col span={12}>
                                        <Form.Item label="密码" name="password">
                                            <Input.Password />
                                        </Form.Item>
                                    </Col>
                                </Row>
                                <Button type="primary" htmlType="submit" icon={<ApiOutlined />} loading={webdavLoading}>连接WebDAV</Button>
                            </Form>
                        </Card>
                    </Col>
                    <Col xs={24} md={12}>
                        <Card title={<><DownloadOutlined /> Aria2下载器</>} extra={<Badge status={aria2Connected ? "success" : "error"} text={aria2Connected ? "已连接" : "未连接"} />}>
                            <Form layout="vertical" onFinish={handleAria2Connect} initialValues={{ url: 'http://localhost:6800/jsonrpc' }}>
                                <Form.Item label="Aria2 RPC URL" name="url" rules={[{ required: true, message: '请输入Aria2 URL' }]}>
                                    <Input placeholder="http://localhost:6800/jsonrpc" />
                                </Form.Item>
                                <Form.Item label="RPC Secret (可选)" name="secret">
                                    <Input.Password />
                                </Form.Item>
                                <Button type="primary" htmlType="submit" style={{ backgroundColor: '#52c41a', borderColor: '#52c41a' }} icon={<ApiOutlined />} loading={aria2Loading}>连接Aria2</Button>
                            </Form>
                        </Card>
                    </Col>
                </Row>

                {webdavConnected && (
                    <Card
                        style={{ marginTop: 24 }}
                        title={<><FolderFilled /> 文件浏览器</>}
                        extra={
                            <Space wrap>
                                <Button icon={<ReloadOutlined />} onClick={() => loadFiles(currentPath)}>刷新</Button>
                                <Switch checkedChildren="仅视频" unCheckedChildren="全部文件" checked={videoFilter} onChange={setVideoFilter} />
                                <Space.Compact>
                                    <Input style={{ width: 40, pointerEvents: 'none', backgroundColor: '#fafafa', borderRight: 0 }} placeholder="≥" disabled />
                                    <InputNumber min={1} max={10240} value={minFileSizeMb} onChange={setMinFileSizeMb} disabled={!videoFilter} style={{ width: 100 }} />
                                    <Input style={{ width: 50, pointerEvents: 'none', backgroundColor: '#fafafa' }} placeholder="MB" disabled />
                                </Space.Compact>
                                <Button
                                    type="primary"
                                    icon={<DownloadOutlined />}
                                    disabled={selectedRowKeys.length === 0}
                                    onClick={handleDownloadSelected}
                                    loading={downloadingSelection}
                                >
                                    下载选中 ({selectedRowKeys.length})
                                </Button>
                            </Space>
                        }
                    >
                        <Breadcrumb style={{ marginBottom: 16 }}>
                            <Breadcrumb.Item><a onClick={() => loadFiles('/')}>根目录</a></Breadcrumb.Item>
                            {breadcrumbItems.map((item, idx) => (
                                <Breadcrumb.Item key={idx}>{idx === breadcrumbItems.length - 1 ? item.title.props.children : item.title}</Breadcrumb.Item>
                            ))}
                        </Breadcrumb>

                        <Table
                            columns={fileColumns}
                            dataSource={files}
                            loading={filesLoading}
                            pagination={false}
                            rowSelection={{
                                selectedRowKeys,
                                onChange: (newSelectedRowKeys, newSelectedRows) => {
                                    setSelectedRowKeys(newSelectedRowKeys);
                                    setSelectedRows(newSelectedRows);
                                },
                                getCheckboxProps: (record) => ({
                                    disabled: record.isParent,
                                })
                            }}
                            rowClassName={(record) => {
                                const isVideo = !record.is_directory && isVideoFile(record.name);
                                const isLargeVideo = isVideo && record.size >= minFileSizeMb * 1024 * 1024;
                                return isLargeVideo ? 'file-row-video' : '';
                            }}
                        />
                    </Card>
                )}

                {aria2Connected && (
                    <Card
                        style={{ marginTop: 24 }}
                        title={<><CloudServerOutlined /> 下载管理</>}
                        extra={<Button icon={<ReloadOutlined />} onClick={loadDownloads} loading={downloadsLoading}>刷新列表</Button>}
                    >
                        <Table
                            columns={downloadColumns}
                            dataSource={downloads}
                            rowKey="gid"
                            loading={downloadsLoading}
                            pagination={false}
                            locale={{ emptyText: '暂无下载任务' }}
                        />
                    </Card>
                )}
            </Content>

            <Footer style={{ textAlign: 'center' }}>
                WebDAV Monitor ©{new Date().getFullYear()} Created with React & Ant Design
            </Footer>
        </Layout>
    );
};

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(<App />);