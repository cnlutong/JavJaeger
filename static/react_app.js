const { Layout, Menu, Button, Input, Form, Select, Card, Switch, Spin, message, Typography, Badge, Progress, Row, Col, Space, Divider, List, Tag, ConfigProvider, Segmented } = antd;
const { Header, Content, Sider } = Layout;
const { Title, Text, Paragraph } = Typography;
const { Option } = Select;

// Utility function
const fetchWithRetry = async (url, options = {}, retries = 3, delay = 1000) => {
    try {
        const response = await fetch(url, options);
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        return await response.json();
    } catch (error) {
        if (retries > 0) {
            await new Promise(resolve => setTimeout(resolve, delay));
            return fetchWithRetry(url, options, retries - 1, delay * 2);
        }
        throw error;
    }
};

// Main Application Component
const App = () => {
    // ---- State ----
    const [collapsedLeft, setCollapsedLeft] = React.useState(false);
    const [collapsedRight, setCollapsedRight] = React.useState(false);
    const [versionInfo, setVersionInfo] = React.useState({ version: '1.0.0', build_date: 'Unknown' });

    // UI State
    const [loading, setLoading] = React.useState(false);
    const [moviesData, setMoviesData] = React.useState(null);
    const [magnetDataMap, setMagnetDataMap] = React.useState({});
    const [historyData, setHistoryData] = React.useState(null);

    // Filter Data State
    const [categories, setCategories] = React.useState({});
    const [actors, setActors] = React.useState({});

    // Main View Mode
    const [viewMode, setViewMode] = React.useState('search'); // 'search' | 'browseCategory' | 'browseActor'
    const [filterForm] = Form.useForm();

    // Auth State
    const [isLoggedIn, setIsLoggedIn] = React.useState(false);
    const [pikpakCredentials, setPikpakCredentials] = React.useState(null);

    React.useEffect(() => {
        if (window.versionInfo) {
            setVersionInfo(window.versionInfo);
        }
        // Load initial filter data
        fetch('/static/categories.json').then(res => res.json()).then(data => setCategories(data)).catch(console.error);
        fetch('/static/actors.json').then(res => res.json()).then(data => setActors(data)).catch(console.error);

        // Restore PikPak Login
        const savedCredentials = localStorage.getItem('pikpakCredentials');
        const savedLoginStatus = localStorage.getItem('pikpakLoginStatus');
        if (savedCredentials && savedLoginStatus === 'true') {
            try {
                setPikpakCredentials(JSON.parse(savedCredentials));
                setIsLoggedIn(true);
            } catch (error) {
                console.error(error);
            }
        }
    }, []);

    // ---- API Calls ----
    const searchMovie = async (values) => {
        setLoading(true);
        try {
            const data = await fetchWithRetry(`/api/movies/${encodeURIComponent(values.keyword)}`);
            setMoviesData(data.movies ? data : { movies: [data] }); // Adapt payload
            if (data.movies) {
                // Fetch best magnet for each
                data.movies.forEach(m => fetchBestMagnet(m.id, m.gid, m.uc));
            } else if (data.id) {
                fetchBestMagnet(data.id, data.gid, data.uc);
            }
        } catch (error) {
            message.error('搜索失败，请稍后重试');
        } finally {
            setLoading(false);
        }
    };

    const filterMovies = async (values) => {
        setLoading(true);
        try {
            const queryParams = new URLSearchParams();
            if (values.filterType) {
                queryParams.append('filterType', values.filterType);
                queryParams.append('filterValue', values.filterValue);
            }
            if (values.magnet) queryParams.append('magnet', values.magnet);
            if (values.type) queryParams.append('type', values.type);
            if (values.actorCountFilter) queryParams.append('actorCountFilter', values.actorCountFilter);

            const apiUrl = values.fetchMode === 'all'
                ? `/api/movies/all?${queryParams.toString()}`
                : `/api/movies?${queryParams.toString()}`;

            const data = await fetchWithRetry(apiUrl);
            setMoviesData(data);
            if (data.movies) {
                data.movies.forEach(m => fetchBestMagnet(m.id, m.gid, m.uc));
            }
        } catch (error) {
            message.error('筛选失败，请稍后重试');
        } finally {
            setLoading(false);
        }
    };

    const searchMagnet = async (values) => {
        setLoading(true);
        try {
            const movieData = await fetchWithRetry(`/api/movies/${encodeURIComponent(values.movieId)}`);
            if (!movieData || !movieData.gid || movieData.uc === undefined) {
                throw new Error('无法获取影片详情或必要参数');
            }

            // Set mock moviesData to show the result section
            setMoviesData({ movies: [{ id: values.movieId, title: `查询磁力: ${values.movieId}` }] });

            const queryParams = new URLSearchParams();
            queryParams.append('gid', movieData.gid);
            queryParams.append('uc', movieData.uc);
            if (values.sortBy) queryParams.append('sortBy', values.sortBy);
            if (values.sortOrder) queryParams.append('sortOrder', values.sortOrder);
            if (values.hasSubtitle) queryParams.append('hasSubtitle', values.hasSubtitle);

            const magnets = await fetchWithRetry(`/api/magnets/${encodeURIComponent(values.movieId)}?${queryParams.toString()}`);
            setMagnetDataMap({ [values.movieId]: magnets || [] });
        } catch (error) {
            message.error('获取磁力链接失败');
            setMoviesData(null);
        } finally {
            setLoading(false);
        }
    };

    const fetchBestMagnet = async (id, gid, uc) => {
        const queryParams = new URLSearchParams();
        if (gid) queryParams.append('gid', gid);
        if (uc !== undefined) queryParams.append('uc', uc);
        queryParams.append('sortBy', 'size');
        queryParams.append('sortOrder', 'desc');

        try {
            const data = await fetchWithRetry(`/api/magnets/${encodeURIComponent(id)}?${queryParams.toString()}`);
            setMagnetDataMap(prev => ({ ...prev, [id]: data || [] }));
        } catch (error) {
            setMagnetDataMap(prev => ({ ...prev, [id]: [] }));
        }
    };

    const handlePikPakLogin = async (values) => {
        setLoading(true);
        try {
            const response = await fetch('/api/pikpak/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(values)
            });
            const result = await response.json();
            if (result.success) {
                setIsLoggedIn(true);
                setPikpakCredentials(values);
                localStorage.setItem('pikpakCredentials', JSON.stringify(values));
                localStorage.setItem('pikpakLoginStatus', 'true');
                message.success('登录成功！');
            } else {
                message.error('登录失败: ' + (result.message || '未知错误'));
            }
        } catch (error) {
            message.error('登录异常');
        } finally {
            setLoading(false);
        }
    };

    const handleLogout = () => {
        localStorage.removeItem('pikpakCredentials');
        localStorage.removeItem('pikpakLoginStatus');
        setIsLoggedIn(false);
        setPikpakCredentials(null);
        message.info('已退出登录');
    };

    const handleRecognizeMovie = async (values) => {
        setLoading(true);
        setMoviesData(null);
        try {
            const requestBody = {
                html_content: values.htmlContent,
                auto_download: values.autoDownload || false
            };
            if (values.autoDownload && isLoggedIn && pikpakCredentials) {
                requestBody.username = pikpakCredentials.username;
                requestBody.password = pikpakCredentials.password;
            }

            const response = await fetch('/api/movies/recognize', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(requestBody)
            });
            const data = await response.json();

            if (data.error) {
                message.error(`错误: ${data.error}`);
            } else {
                setMoviesData(data); // Expecting data.movies, data.magnet_results, data.download_result
                message.success('识别完成');
            }
        } catch (error) {
            message.error('影片识别失败');
        } finally {
            setLoading(false);
        }
    };

    const handleCodeDownload = async (values) => {
        message.info('番号批量下载功能准备中...');
    };

    const fetchHistory = async () => {
        setLoading(true);
        setViewMode('history');
        try {
            const data = await fetchWithRetry('/api/history');
            setHistoryData(data);
            message.success('已加载历史记录');
        } catch (error) {
            message.error('获取历史记录失败');
        } finally {
            setLoading(false);
        }
    };

    // ---- Render Helpers ----
    const renderContent = () => {
        if (viewMode === 'history') {
            return renderHistory();
        }
        if (viewMode === 'browseCategory') {
            return renderCategoryGroups();
        }
        if (viewMode === 'browseActor') {
            return renderActorsList();
        }

        if (loading) {
            return (
                <div style={{ textAlign: 'center', padding: '40px 0' }}>
                    <Spin size="large" />
                    <div style={{ marginTop: 16 }}>正在搜索...</div>
                </div>
            );
        }

        if (!moviesData) {
            return (
                <div style={{ textAlign: 'center', padding: '40px 0' }}>
                    <Text type="secondary">没有任何结果，请在左侧选择查询功能开始搜索</Text>
                </div>
            );
        }

        // Handle error responses directly from backend
        if (moviesData.error) {
            return (
                <div style={{ textAlign: 'center', padding: '40px 0' }}>
                    <Text type="danger">{moviesData.error}</Text>
                </div>
            );
        }

        // Handle Actor payload
        if (moviesData.id && !moviesData.gid && !moviesData.uc && moviesData.avatar) {
            return (
                <Card style={{ marginBottom: 16, textAlign: 'center' }}>
                    <img src={moviesData.avatar} alt={moviesData.name} style={{ width: 150, height: 150, borderRadius: '50%', objectFit: 'cover' }} />
                    <Title level={4} style={{ marginTop: 16 }}>{moviesData.name}</Title>
                </Card>
            );
        }

        // Handle Array of Movies
        if (moviesData.movies && moviesData.movies.length > 0) {
            return (
                <div>
                    <div style={{ marginBottom: 16 }}>
                        <Button type="primary" disabled={!isLoggedIn} icon={<span role="img" aria-label="download">📥</span>}>下载本页全部影片</Button>
                    </div>
                    {moviesData.movies.map(movie => renderMovieCard(movie))}
                </div>
            );
        }

        return (
            <div style={{ textAlign: 'center', padding: '40px 0' }}>
                <Text type="secondary">未找到相关数据</Text>
            </div>
        );
    };

    // ---- Browse Handlers ----
    const handleCategorySelect = (code, name) => {
        filterForm.setFieldsValue({ filterType: 'genre', filterValue: code, filterValueName: name });
        setViewMode('search');
    };

    const handleActorSelect = (code, name) => {
        filterForm.setFieldsValue({ filterType: 'star', filterValue: code, filterValueName: name });
        setViewMode('search');
    };

    const renderCategoryGroups = () => {
        return (
            <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                    <Title level={4} style={{ margin: 0 }}>浏览类别</Title>
                    <Button onClick={() => setViewMode('search')}>返回查询</Button>
                </div>
                <Divider />
                {Object.keys(categories).map(group => (
                    <div key={group} style={{ marginBottom: 24 }}>
                        <Title level={5}>{group}</Title>
                        <List
                            grid={{ gutter: 16, xs: 2, sm: 3, md: 4, lg: 5, xl: 6 }}
                            dataSource={categories[group]}
                            renderItem={cat => (
                                <List.Item>
                                    <Card
                                        hoverable
                                        size="small"
                                        style={{ textAlign: 'center', borderColor: '#e8e6e1', cursor: 'pointer', background: '#fcfcfc' }}
                                        onClick={() => handleCategorySelect(cat.code, cat.name)}
                                    >
                                        <Text strong style={{ fontSize: 16 }}>{cat.name}</Text>
                                    </Card>
                                </List.Item>
                            )}
                        />
                    </div>
                ))}
            </div>
        );
    };

    const renderHistory = () => {
        return (
            <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                    <Title level={4} style={{ margin: 0 }}>📂 历史下载记录</Title>
                    <Button onClick={() => setViewMode('search')}>返回查询</Button>
                </div>
                <Divider />
                <antd.Table
                    dataSource={historyData || []}
                    rowKey="movie_id"
                    pagination={{ pageSize: 20 }}
                    columns={[
                        {
                            title: '影片番号',
                            dataIndex: 'movie_id',
                            key: 'movie_id',
                            render: text => <Text strong>{text}</Text>
                        },
                        {
                            title: '下载时间',
                            dataIndex: 'download_time',
                            key: 'download_time',
                            render: text => {
                                if (!text) return '未知时间';
                                const d = new Date(text);
                                return isNaN(d.getTime()) ? text : d.toLocaleString();
                            }
                        },
                        {
                            title: '操作',
                            key: 'action',
                            render: (_, record) => (
                                <Button type="primary" size="small" onClick={() => {
                                    setViewMode('search');
                                    searchMovie({ keyword: record.movie_id });
                                }}>
                                    详情搜索
                                </Button>
                            )
                        }
                    ]}
                />
            </div>
        );
    };

    const renderActorsList = () => {
        return (
            <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                    <Title level={4} style={{ margin: 0 }}>浏览演员</Title>
                    <Button onClick={() => setViewMode('search')}>返回查询</Button>
                </div>
                <Divider />
                <List
                    grid={{ gutter: 16, xs: 2, sm: 3, md: 4, lg: 5, xl: 5, xxl: 5 }}
                    dataSource={Array.isArray(actors) ? actors : Object.values(actors).flat()}
                    renderItem={actor => {
                        const actorName = actor.name || actor;
                        const actorCode = actor.code || actor;
                        const fallbackImage = <div style={{ height: 200, background: '#f0f0f0', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Text type="secondary">无头像</Text></div>;

                        return (
                            <List.Item>
                                <Card
                                    hoverable
                                    cover={actor.avatar ? <img alt={actorName} src={actor.avatar} style={{ height: 200, objectFit: 'cover' }} /> : fallbackImage}
                                    onClick={() => handleActorSelect(actorCode, actorName)}
                                    size="small"
                                >
                                    <Card.Meta title={actorName} style={{ textAlign: 'center' }} />
                                </Card>
                            </List.Item>
                        )
                    }}
                />
            </div>
        );
    };

    const renderMovieCard = (movie) => {
        const magnets = magnetDataMap[movie.id];
        const hasMagnets = magnets && magnets.length > 0;
        const bestMagnet = hasMagnets ? magnets[0] : null;

        return (
            <Card key={movie.id} style={{ marginBottom: 16, borderColor: '#f0f0f0', boxShadow: '0 1px 2px rgba(0,0,0,0.02)' }} size="small" hoverable>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Title level={5} style={{ margin: 0 }}>{movie.title || movie.full_title}</Title>
                    <Tag color="blue" bordered={false}>{movie.id}</Tag>
                </div>
                <div style={{ marginTop: 8 }}>
                    {movie.date && <Text type="secondary" style={{ fontSize: '13px' }}>发行日期: {movie.date}</Text>}
                </div>
                <Divider style={{ margin: '12px 0 8px 0', borderColor: '#f0f0f0' }} />
                <div style={{ background: '#fafafa', padding: '12px', borderRadius: 4, border: '1px solid #f0f0f0' }}>
                    {!magnets && <Spin size="small" />}
                    {magnets && magnets.length === 0 && <Text type="danger">暂无可用资源</Text>}
                    {hasMagnets && (
                        <div>
                            <Tag color="gold">最佳资源</Tag>
                            <a href={bestMagnet.link} target="_blank" rel="noreferrer" style={{ marginLeft: 8, wordBreak: 'break-all' }}>
                                {bestMagnet.title}
                            </a>
                            <div style={{ marginTop: 4 }}>
                                <Text type="secondary" style={{ fontSize: '12px' }}>大小: {bestMagnet.size} | 日期: {bestMagnet.date}</Text>
                            </div>
                        </div>
                    )}
                </div>
            </Card>
        );
    };

    // ---- Render ---
    return (
        <ConfigProvider
            theme={{
                token: {
                    colorPrimary: '#1677ff', // Professional crisp blue
                    colorBgBase: '#ffffff',
                    colorBgContainer: '#ffffff', // Clean white background
                    colorBgLayout: '#f0f2f5', // Standard concise gray layout
                    colorTextBase: '#1f1f1f', // Sharp dark grey text
                    colorBorder: '#f0f0f0', // Crisp subtle borders
                    borderRadius: 6,
                    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif'
                },
            }}
        >
            <div style={{ backgroundColor: '#f0f2f5', minHeight: '100vh' }}>
                <Layout style={{ minHeight: '100vh', maxWidth: 1600, margin: '0 auto', boxShadow: '0 4px 12px rgba(0,0,0,0.03)' }}>
                    <Header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#ffffff', padding: '0 24px', height: '72px', borderBottom: '1px solid #f0f0f0' }}>
                        <div style={{ display: 'flex', alignItems: 'center' }}>
                            <img src="/static/logo.jpg" alt="Logo" style={{ height: '52px', marginRight: '16px', borderRadius: '4px', border: '1px solid #f0f0f0' }} />
                            <Title level={3} style={{ margin: 0, fontWeight: 700, letterSpacing: '-0.5px', color: '#1f1f1f' }}>JavJaeger</Title>
                            <Divider type="vertical" style={{ height: '28px', margin: '0 20px', borderColor: '#e8e8e8' }} />
                            <Text type="secondary" style={{ fontSize: '14px', letterSpacing: '1px', fontWeight: 500 }} className="subtitle-hidden-mobile">
                                人类的一切痛苦，都是因为性欲得不到满足。
                            </Text>
                        </div>
                        <Space size="large">
                            <Text type="secondary" style={{ fontSize: '13px' }}>
                                v{versionInfo.version} ({versionInfo.build_date})
                            </Text>
                            <a href="https://github.com/cnlutong/JavJaeger" target="_blank" rel="noreferrer">
                                <svg viewBox="0 0 24 24" fill="currentColor" width="24" height="24">
                                    <path d="M12 0C5.374 0 0 5.373 0 12 0 17.302 3.438 21.8 8.207 23.387c.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23A11.509 11.509 0 0112 5.803c1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576C20.566 21.797 24 17.3 24 12c0-6.627-5.373-12-12-12z" />
                                </svg>
                            </a>
                        </Space>
                    </Header>

                    <Layout style={{ background: '#f0f2f5' }}>
                        {/* Left Sidebar */}
                        <Sider
                            width={320}
                            theme="light"
                            collapsible
                            collapsed={collapsedLeft}
                            onCollapse={(value) => setCollapsedLeft(value)}
                            style={{ overflow: 'auto', height: '100%', borderRight: '1px solid #f0f0f0' }}
                        >
                            <div style={{ padding: '16px' }}>
                                <Title level={5}>🔍 查询功能</Title>
                                <Divider style={{ margin: '12px 0', borderColor: '#e8e6e1' }} />

                                <Card title="📋 影片列表筛选" size="small" style={{ marginBottom: 16 }}>
                                    <Form form={filterForm} onFinish={filterMovies} layout="vertical" initialValues={{ magnet: 'exist', type: 'normal', fetchMode: 'page' }}>
                                        <Form.Item name="filterType" style={{ marginBottom: 8 }}>
                                            <Select placeholder="选择筛选类型" allowClear optionLabelProp="label">
                                                <Option value="star" label="演员">
                                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                        <span>演员</span>
                                                        <a onClick={(e) => { e.stopPropagation(); filterForm.setFieldsValue({ filterType: 'star' }); setViewMode('browseActor'); }}>浏览</a>
                                                    </div>
                                                </Option>
                                                <Option value="genre" label="类别">
                                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                        <span>类别</span>
                                                        <a onClick={(e) => { e.stopPropagation(); filterForm.setFieldsValue({ filterType: 'genre' }); setViewMode('browseCategory'); }}>浏览</a>
                                                    </div>
                                                </Option>
                                                <Option value="director" label="导演">导演</Option>
                                                <Option value="studio" label="制作商">制作商</Option>
                                                <Option value="label" label="发行商">发行商</Option>
                                                <Option value="series" label="系列">系列</Option>
                                            </Select>
                                        </Form.Item>
                                        <Form.Item name="filterValue" hidden>
                                            <Input />
                                        </Form.Item>
                                        <Form.Item style={{ marginBottom: 8 }}>
                                            <Form.Item name="filterValueName" noStyle>
                                                <Input
                                                    placeholder="输入筛选代码或名称"
                                                    onChange={(e) => filterForm.setFieldsValue({ filterValue: e.target.value })}
                                                    allowClear
                                                />
                                            </Form.Item>
                                        </Form.Item>
                                        <Form.Item name="magnet" style={{ marginBottom: 8 }}>
                                            <Select placeholder="磁力链接状态">
                                                <Option value="exist">有磁力链接</Option>
                                                <Option value="all">全部影片</Option>
                                            </Select>
                                        </Form.Item>
                                        <Form.Item name="type" style={{ marginBottom: 8 }}>
                                            <Select placeholder="影片类型">
                                                <Option value="normal">有码影片</Option>
                                                <Option value="uncensored">无码影片</Option>
                                            </Select>
                                        </Form.Item>
                                        <Form.Item name="actorCountFilter" label="演员人数" style={{ marginBottom: 8 }}>
                                            <Select placeholder="不限制" allowClear>
                                                <Option value="1">单人作品 (=1)</Option>
                                                <Option value="2">双人作品 (=2)</Option>
                                                <Option value="3">三人作品 (=3)</Option>
                                                <Option value="<=2">少于等于2人</Option>
                                                <Option value="<=3">少于等于3人</Option>
                                                <Option value=">=3">大于等于3人</Option>
                                                <Option value=">=4">大于等于4人</Option>
                                            </Select>
                                        </Form.Item>
                                        <Form.Item name="fetchMode" label="获取方式" style={{ marginBottom: 8 }}>
                                            <Select>
                                                <Option value="page">逐页获取 (每页30个)</Option>
                                                <Option value="all">获取全部 (所有页)</Option>
                                            </Select>
                                        </Form.Item>
                                        <Button type="primary" htmlType="submit" block loading={loading}>筛选</Button>
                                    </Form>
                                </Card>

                                <Card title="🎬 影片查询" size="small" style={{ marginBottom: 16 }}>
                                    <Form onFinish={searchMovie} layout="vertical">
                                        <Form.Item name="keyword" style={{ marginBottom: 8 }} rules={[{ required: true, message: '请输入番号' }]}>
                                            <Input placeholder="输入影片番号" />
                                        </Form.Item>
                                        <Button type="primary" htmlType="submit" block loading={loading}>搜索</Button>
                                    </Form>
                                </Card>

                                <Card title="🧲 磁力链接查询" size="small" style={{ marginBottom: 16 }}>
                                    <Form onFinish={searchMagnet} layout="vertical">
                                        <Form.Item name="movieId" style={{ marginBottom: 8 }} rules={[{ required: true, message: '请输入番号' }]}>
                                            <Input placeholder="输入影片番号" />
                                        </Form.Item>
                                        <Form.Item name="sortBy" style={{ marginBottom: 8 }}>
                                            <Select placeholder="排序方式" allowClear>
                                                <Option value="date">日期</Option>
                                                <Option value="size">大小</Option>
                                            </Select>
                                        </Form.Item>
                                        <Form.Item name="sortOrder" style={{ marginBottom: 8 }}>
                                            <Select placeholder="排序顺序" allowClear>
                                                <Option value="asc">升序</Option>
                                                <Option value="desc">降序</Option>
                                            </Select>
                                        </Form.Item>
                                        <Form.Item name="hasSubtitle" style={{ marginBottom: 8 }}>
                                            <Select placeholder="字幕筛选" allowClear>
                                                <Option value="true">有字幕</Option>
                                                <Option value="false">无字幕</Option>
                                            </Select>
                                        </Form.Item>
                                        <Button type="primary" htmlType="submit" block loading={loading}>查询磁力链接</Button>
                                    </Form>
                                </Card>

                                <Card title="🎯 影片识别" size="small" style={{ marginBottom: 16 }}>
                                    <Form onFinish={handleRecognizeMovie} layout="vertical" initialValues={{ autoDownload: true }}>
                                        <Form.Item name="htmlContent" rules={[{ required: true, message: '请粘贴HTML源代码' }]} style={{ marginBottom: 8 }}>
                                            <Input.TextArea placeholder="请粘贴JAVLibrary网页源代码..." rows={4} />
                                        </Form.Item>
                                        <Form.Item name="autoDownload" style={{ marginBottom: 12 }}>
                                            <Segmented
                                                block
                                                options={[
                                                    { label: '仅识别', value: false },
                                                    { label: '自动下载最佳', value: true }
                                                ]}
                                            />
                                        </Form.Item>
                                        <Form.Item name="exclude4k" style={{ marginBottom: 16 }}>
                                            <Segmented
                                                block
                                                options={[
                                                    { label: '不排除4K', value: false },
                                                    { label: '排除4K', value: true }
                                                ]}
                                            />
                                        </Form.Item>
                                        <Button type="primary" htmlType="submit" block loading={loading}>🔍 识别并下载</Button>
                                    </Form>
                                </Card>

                                <Card title="🎬 番号自动下载" size="small" style={{ marginBottom: 16 }}>
                                    <Form onFinish={handleCodeDownload} layout="vertical" initialValues={{ autoDownload: true }}>
                                        <Form.Item name="movieCodes" rules={[{ required: true, message: '请输入番号' }]} style={{ marginBottom: 8 }}>
                                            <Input.TextArea placeholder="支持多行、空格分隔..." rows={4} />
                                        </Form.Item>
                                        <Form.Item name="autoDownload" style={{ marginBottom: 12 }}>
                                            <Segmented
                                                block
                                                options={[
                                                    { label: '仅搜索', value: false },
                                                    { label: '自动下载最佳', value: true }
                                                ]}
                                            />
                                        </Form.Item>
                                        <Form.Item name="exclude4k" style={{ marginBottom: 16 }}>
                                            <Segmented
                                                block
                                                options={[
                                                    { label: '不排除4K', value: false },
                                                    { label: '排除4K', value: true }
                                                ]}
                                            />
                                        </Form.Item>
                                        <Button type="primary" htmlType="submit" block loading={loading}>🚀 搜索并下载</Button>
                                    </Form>
                                </Card>
                            </div>
                        </Sider>

                        {/* Main Content */}
                        <Content style={{ padding: '24px', margin: 0, minHeight: 280, background: '#f0f2f5', overflow: 'auto' }}>
                            <div style={{ background: '#ffffff', padding: '24px', borderRadius: '6px', minHeight: '100%', border: '1px solid #f0f0f0', boxShadow: '0 1px 2px rgba(0,0,0,0.02)' }}>
                                {viewMode === 'search' && (
                                    <>
                                        <Title level={4}>📊 查询结果</Title>
                                        <Divider style={{ borderColor: '#e8e6e1' }} />
                                    </>
                                )}
                                {renderContent()}
                            </div>
                        </Content>

                        {/* Right Sidebar */}
                        <Sider
                            width={300}
                            theme="light"
                            collapsible
                            collapsed={collapsedRight}
                            onCollapse={(value) => setCollapsedRight(value)}
                            style={{ overflow: 'auto', height: '100%', borderLeft: '1px solid #f0f0f0' }}
                            reverseArrow
                        >
                            <div style={{ padding: '16px' }}>
                                <Title level={5}>📥 下载管理</Title>
                                <Divider style={{ margin: '12px 0', borderColor: '#e8e6e1' }} />

                                <Button
                                    type="primary"
                                    block
                                    icon={<span role="img" aria-label="history">📂</span>}
                                    onClick={fetchHistory}
                                    style={{ marginBottom: '16px', background: '#52c41a', borderColor: '#52c41a' }}
                                >
                                    查看历史记录
                                </Button>

                                <Card title="🔐 PikPak 登录" size="small" style={{ marginBottom: '16px' }}>
                                    {!isLoggedIn ? (
                                        <Form layout="vertical" onFinish={handlePikPakLogin}>
                                            <Form.Item name="username" style={{ marginBottom: '12px' }} rules={[{ required: true, message: '请输入用户名' }]}>
                                                <Input placeholder="用户名" />
                                            </Form.Item>
                                            <Form.Item name="password" style={{ marginBottom: '12px' }} rules={[{ required: true, message: '请输入密码' }]}>
                                                <Input.Password placeholder="密码" />
                                            </Form.Item>
                                            <Button type="primary" htmlType="submit" block loading={loading}>登录</Button>
                                        </Form>
                                    ) : (
                                        <div style={{ textAlign: 'center' }}>
                                            <Text type="success" strong>✓ 已登录</Text>
                                            <div style={{ marginTop: 8 }}>{pikpakCredentials?.username}</div>
                                            <Button danger style={{ marginTop: 12 }} block onClick={handleLogout}>退出登录</Button>
                                        </div>
                                    )}
                                </Card>

                                <Card title="🧲 磁力链接来源" size="small" style={{ marginBottom: '16px' }}>
                                    <Form layout="vertical" initialValues={{ magnetSource: 'javbus' }}>
                                        <Form.Item name="magnetSource" label="选择来源" style={{ marginBottom: '12px' }}>
                                            <Select>
                                                <Option value="javbus">JavBus API (默认)</Option>
                                                <Option value="cilisousuo">Cilisousuo</Option>
                                            </Select>
                                        </Form.Item>
                                        <Form.Item name="globalExclude4k" style={{ marginBottom: 0 }}>
                                            <Segmented
                                                block
                                                options={[
                                                    { label: '不排除4K', value: false },
                                                    { label: '全局排除4K', value: true }
                                                ]}
                                            />
                                        </Form.Item>
                                    </Form>
                                </Card>
                            </div>
                        </Sider>
                    </Layout>
                </Layout>
            </div>
        </ConfigProvider>
    );
};

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(<App />);
