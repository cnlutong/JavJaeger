// 优化的前端应用 - 减少API请求，将业务逻辑移到后端

// PikPak相关变量
let pikpakCredentials = null;
let isLoggedIn = false;

// 类别数据
let categoriesData = null;
// 演员数据
let actorsData = null;

// 进度条管理器
class ProgressManager {
    constructor() {
        this.container = document.getElementById('progress-container');
        this.textElement = document.getElementById('progress-text');
        this.percentageElement = document.getElementById('progress-percentage');
        this.fillElement = document.getElementById('progress-fill');
        this.currentElement = document.getElementById('progress-current');
        this.totalElement = document.getElementById('progress-total');
        this.isVisible = false;
    }

    show(text = '正在处理请求...', total = 0) {
        console.log('ProgressManager.show called:', text, total);
        console.log('Container element:', this.container);
        
        if (this.container) {
            this.container.style.display = 'block';
            this.isVisible = true;
            this.updateText(text);
            this.updateProgress(0, total);
            console.log('Progress bar shown successfully');
        } else {
            console.error('Progress container not found!');
        }
    }

    hide() {
        if (this.container) {
            this.container.style.display = 'none';
            this.isVisible = false;
        }
    }

    updateText(text) {
        if (this.textElement) {
            this.textElement.textContent = text;
        }
    }

    updateProgress(current, total = null, text = null) {
        if (text !== null) {
            this.updateText(text);
        }
        
        if (total !== null && this.totalElement) {
            this.totalElement.textContent = total;
        }
        
        if (this.currentElement) {
            this.currentElement.textContent = current;
        }

        const totalValue = total || parseInt(this.totalElement?.textContent || '0');
        const percentage = totalValue > 0 ? Math.round((current / totalValue) * 100) : 0;
        
        if (this.percentageElement) {
            this.percentageElement.textContent = `${percentage}%`;
        }
        
        if (this.fillElement) {
            this.fillElement.style.width = `${percentage}%`;
        }
    }

    setIndeterminate(text = '正在处理...') {
        this.show(text, 0);
        if (this.fillElement) {
            this.fillElement.style.width = '100%';
            this.fillElement.style.animation = 'progress-shine 1.5s infinite';
        }
        if (this.percentageElement) {
            this.percentageElement.textContent = '';
        }
        if (this.currentElement && this.totalElement) {
            this.currentElement.textContent = '';
            this.totalElement.textContent = '';
        }
    }

    complete(text = '处理完成') {
        this.updateText(text);
        this.updateProgress(parseInt(this.totalElement?.textContent || '1'), parseInt(this.totalElement?.textContent || '1'));
        setTimeout(() => {
            this.hide();
        }, 1000);
    }
}

// 创建全局进度条管理器实例
let progressManager;

// 简化的fetch函数（移除复杂的重试逻辑，由后端处理）
async function simpleFetch(url, options = {}) {
    try {
        const response = await fetch(url, options);
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        return response.json();
    } catch (error) {
        console.error('请求失败:', error);
        throw error;
    }
}

// 加载类别数据
async function loadCategoriesData() {
    if (categoriesData) {
        return categoriesData;
    }
    
    try {
        const response = await fetch('/static/categories.json');
        if (response.ok) {
            categoriesData = await response.json();
            return categoriesData;
        }
    } catch (error) {
        console.error('加载类别数据失败:', error);
    }
    
    return {};
}

// 加载演员数据
async function loadActorsData() {
    if (actorsData) {
        return actorsData;
    }
    
    try {
        const response = await fetch('/static/actors.json');
        if (response.ok) {
            actorsData = await response.json();
            return actorsData;
        }
    } catch (error) {
        console.error('加载演员数据失败:', error);
    }
    
    return {};
}

// 显示选项选择器
function showOptionsSelector() {
    const filterTypeSelect = document.querySelector('#movie-filter select[name="filterType"]');
    const selectedType = filterTypeSelect.value;
    
    if (selectedType === 'genre') {
        loadCategoriesData().then(categories => {
            createOptionsDisplay('类别', categories);
        });
    } else if (selectedType === 'star') {
        loadActorsData().then(actors => {
            createOptionsDisplay('演员', actors);
        });
    } else if (selectedType === 'director') {
        createOptionsDisplay('导演', {});
    } else if (selectedType === 'studio') {
        createOptionsDisplay('制作商', {});
    } else if (selectedType === 'label') {
        createOptionsDisplay('发行商', {});
    } else if (selectedType === 'series') {
        createOptionsDisplay('系列', {});
    } else {
        const resultContainer = document.getElementById('result-container');
        resultContainer.innerHTML = `
            <div class="empty-state">
                <div class="empty-icon">⚠️</div>
                <p>请先选择筛选类型</p>
                <span class="empty-hint">在上方下拉框中选择演员、类别、导演等筛选类型</span>
            </div>
        `;
    }
}

// 创建选项展示（保持原有逻辑）
function createOptionsDisplay(optionType, optionsData) {
    const resultContainer = document.getElementById('result-container');
    
    resultContainer.innerHTML = '';
    
    if (!optionsData || Object.keys(optionsData).length === 0) {
        resultContainer.innerHTML = `
            <div class="empty-state">
                <div class="empty-icon">📝</div>
                <p>${optionType}数据暂未添加</p>
                <span class="empty-hint">该功能正在开发中，敬请期待</span>
            </div>
        `;
        return;
    }
    
    const optionsDisplay = document.createElement('div');
    optionsDisplay.className = 'options-display';
    
    const header = document.createElement('div');
    header.className = 'options-display-header';
    
    const title = document.createElement('h3');
    title.className = 'options-display-title';
    title.innerHTML = `📋 选择${optionType}`;
    
    const closeBtn = document.createElement('button');
    closeBtn.className = 'options-close-btn';
    closeBtn.innerHTML = '×';
    closeBtn.onclick = () => {
        resultContainer.innerHTML = `
            <div class="empty-state">
                <div class="empty-icon">🔍</div>
                <p>查询结果将显示在这里</p>
                <span class="empty-hint">请在左侧选择查询功能开始搜索</span>
            </div>
        `;
    };
    
    header.appendChild(title);
    header.appendChild(closeBtn);
    
    const groupsContainer = document.createElement('div');
    groupsContainer.className = 'options-groups';
    
    if (optionType === '演员') {
        const actorsList = optionsData['演员'] || [];
        const group = document.createElement('div');
        group.className = 'options-group';
        
        const itemsContainer = document.createElement('div');
        itemsContainer.className = 'options-items';
        
        actorsList.forEach(item => {
            const itemBtn = document.createElement('button');
            itemBtn.className = 'options-item';
            
            if (item.avatar) {
                const avatar = document.createElement('img');
                avatar.src = item.avatar;
                avatar.className = 'actor-avatar';
                avatar.alt = item.name;
                avatar.crossOrigin = 'anonymous';
                avatar.loading = 'lazy';
                
                avatar.onerror = () => {
                    avatar.style.display = 'none';
                    const defaultIcon = document.createElement('span');
                    defaultIcon.textContent = '👤';
                    defaultIcon.className = 'actor-default-icon';
                    itemBtn.insertBefore(defaultIcon, avatar);
                };
                
                const nameSpan = document.createElement('span');
                nameSpan.textContent = item.name;
                nameSpan.className = 'actor-name';
                
                itemBtn.appendChild(avatar);
                itemBtn.appendChild(nameSpan);
            } else {
                const defaultIcon = document.createElement('span');
                defaultIcon.textContent = '👤';
                defaultIcon.className = 'actor-default-icon';
                
                const nameSpan = document.createElement('span');
                nameSpan.textContent = item.name;
                nameSpan.className = 'actor-name';
                
                itemBtn.appendChild(defaultIcon);
                itemBtn.appendChild(nameSpan);
            }
            
            itemBtn.title = item.name;
            itemBtn.onclick = () => {
                selectOption(item.code, item.name, optionType);
                resultContainer.innerHTML = `
                    <div class="empty-state">
                        <div class="empty-icon">✅</div>
                        <p>已选择${optionType}: ${item.name}</p>
                        <span class="empty-hint">${optionType}名称已自动填入筛选框</span>
                    </div>
                `;
            };
            itemsContainer.appendChild(itemBtn);
        });
        
        group.appendChild(itemsContainer);
        groupsContainer.appendChild(group);
    } else {
        Object.keys(optionsData).forEach(type => {
            const group = document.createElement('div');
            group.className = 'options-group';
            
            const groupTitle = document.createElement('h4');
            groupTitle.className = 'options-group-title';
            groupTitle.textContent = type;
            
            const itemsContainer = document.createElement('div');
            itemsContainer.className = 'options-items';
            
            optionsData[type].forEach(item => {
                const itemBtn = document.createElement('button');
                itemBtn.className = 'options-item';
                itemBtn.textContent = item.name;
                itemBtn.title = item.name;
                itemBtn.onclick = () => {
                    selectOption(item.code, item.name, optionType);
                    resultContainer.innerHTML = `
                        <div class="empty-state">
                            <div class="empty-icon">✅</div>
                            <p>已选择${optionType}: ${item.name}</p>
                            <span class="empty-hint">${optionType}名称已自动填入筛选框</span>
                        </div>
                    `;
                };
                itemsContainer.appendChild(itemBtn);
            });
            
            group.appendChild(groupTitle);
            group.appendChild(itemsContainer);
            groupsContainer.appendChild(group);
        });
    }
    
    optionsDisplay.appendChild(header);
    optionsDisplay.appendChild(groupsContainer);
    resultContainer.appendChild(optionsDisplay);
}

// 选择选项
function selectOption(code, name, optionType) {
    const filterTypeSelect = document.querySelector('#movie-filter select[name="filterType"]');
    const filterValueInput = document.querySelector('#movie-filter input[name="filterValue"]');
    const filterCodeInput = document.querySelector('#movie-filter input[name="filterCode"]');
    
    if (filterTypeSelect && filterValueInput && filterCodeInput) {
        const typeMapping = {
            '类别': 'genre',
            '演员': 'star',
            '导演': 'director',
            '制作商': 'studio',
            '发行商': 'label',
            '系列': 'series'
        };
        
        const filterType = typeMapping[optionType] || filterTypeSelect.value;
        filterTypeSelect.value = filterType;
        filterValueInput.value = name;
        filterCodeInput.value = code;
        filterValueInput.placeholder = `已选择: ${name}`;
    }
}

// 处理影片搜索表单提交
document.getElementById('movie-search').addEventListener('submit', async (e) => {
    e.preventDefault();
    const keyword = e.target.keyword.value.trim();
    const resultContainer = document.getElementById('result-container');
    
    if (!keyword) {
        resultContainer.innerHTML = '<p>请输入影片番号</p>';
        return;
    }
    
    // 显示进度条
    progressManager.setIndeterminate('正在搜索影片...');
    resultContainer.innerHTML = '';
    
    try {
        // 调用API搜索影片
        const data = await simpleFetch(`/api/movies/${encodeURIComponent(keyword)}`);
        
        // 完成进度条
        progressManager.complete('搜索完成');
        
        // 显示结果
        displayResults(data);
    } catch (error) {
        console.error('搜索失败:', error);
        progressManager.hide();
        resultContainer.innerHTML = '<p>搜索失败，请稍后重试</p>';
    }
});

// 处理磁力链接查询表单提交
document.getElementById('magnet-search').addEventListener('submit', async (e) => {
    e.preventDefault();
    const movieId = e.target.movieId.value;
    const sortBy = e.target.sortBy.value;
    const sortOrder = e.target.sortOrder.value;
    const resultContainer = document.getElementById('result-container');
    
    // 显示进度条
    progressManager.setIndeterminate('正在获取影片信息...');
    resultContainer.innerHTML = '';
    
    try {
        // 先获取影片详情
        const movieData = await simpleFetch(`/api/movies/${encodeURIComponent(movieId)}`);
        
        if (!movieData || !movieData.gid || movieData.uc === undefined) {
            throw new Error('无法获取影片详情或必要参数');
        }
        
        // 更新进度条状态
        progressManager.updateText('正在获取磁力链接...');
        
        // 构建查询参数
        const queryParams = new URLSearchParams();
        queryParams.append('gid', movieData.gid);
        queryParams.append('uc', movieData.uc);
        if (sortBy) queryParams.append('sortBy', sortBy);
        if (sortOrder) queryParams.append('sortOrder', sortOrder);
        
        // 调用API获取磁力链接
        const data = await simpleFetch(`/api/magnets/${encodeURIComponent(movieId)}?${queryParams.toString()}`);
        
        // 完成进度条
        progressManager.complete('获取完成');
        
        // 显示结果
        if (data && data.length > 0) {
            const sortedData = [...data].sort((a, b) => {
                const sizeA = parseFloat(a.size);
                const sizeB = parseFloat(b.size);
                return sizeB - sizeA;
            });

            let magnetsHtml = '<h3>磁力链接:</h3><ul>';
            sortedData.forEach((magnet, index) => {
                const isBest = index === 0;
                magnetsHtml += `<li class="${isBest ? 'best-magnet' : ''}">` +
                    `${isBest ? '<span class="best-tag">最佳资源</span>' : ''}` +
                    `<a href="${magnet.link}" target="_blank">${magnet.title}</a> ` +
                    `(大小: ${magnet.size}, 日期: ${magnet.date})</li>`;
            });
            magnetsHtml += '</ul>';
            resultContainer.innerHTML = magnetsHtml;
        } else {
            resultContainer.innerHTML = '<p>没有找到磁力链接</p>';
        }
    } catch (error) {
        console.error('获取磁力链接失败:', error);
        progressManager.hide();
        resultContainer.innerHTML = '<p>获取磁力链接失败，请稍后重试</p>';
    }
});

// 处理影片列表筛选表单提交 - 优化版本
document.getElementById('movie-filter').addEventListener('submit', async (e) => {
    e.preventDefault();
    const filterType = e.target.filterType.value;
    const filterValue = e.target.filterValue.value;
    const filterCode = e.target.filterCode.value;
    const magnet = e.target.magnet.value;
    const type = e.target.type.value;
    const actorCountFilter = e.target.actorCountFilter.value;
    const hasSubtitle = e.target.hasSubtitle.value;
    const resultContainer = document.getElementById('result-container');
    
    // 显示进度条
    progressManager.setIndeterminate('正在获取影片列表...');
    resultContainer.innerHTML = '';
    
    try {
        // 构建查询参数
        const queryParams = new URLSearchParams();
        if (filterType) {
            queryParams.append('filterType', filterType);
            const actualFilterValue = filterCode || filterValue;
            queryParams.append('filterValue', actualFilterValue);
        }
        if (magnet) queryParams.append('magnet', magnet);
        if (type) queryParams.append('type', type);
        if (actorCountFilter) queryParams.append('actorCountFilter', actorCountFilter);
        if (hasSubtitle) queryParams.append('hasSubtitle', hasSubtitle);
        
        // 调用API获取影片列表
        const data = await simpleFetch(`/api/movies?${queryParams.toString()}`);
        
        // 不要在这里完成进度条，让displayResults函数处理
        // progressManager.complete('获取完成');
        
        // 显示结果
        displayResults(data);
    } catch (error) {
        console.error('筛选失败:', error);
        progressManager.hide();
        resultContainer.innerHTML = '<p>筛选失败，请稍后重试</p>';
    }
});

// 优化的显示查询结果函数
function displayResults(data) {
    const resultContainer = document.getElementById('result-container');

    if (!data || (Array.isArray(data.movies) && data.movies.length === 0)) {
        progressManager.hide();
        resultContainer.innerHTML = '<p>没有找到匹配的结果</p>';
        return;
    }

    // 检查是否是影片详情对象
    if (data.id && data.gid !== undefined && data.uc !== undefined) {
        progressManager.hide();
        displayMovieDetails(data);
        fetchAndDisplayMagnets(data.id, data.gid, data.uc);
    } else if (data.id || data.avatar) {
        progressManager.hide();
        displayStarDetails(data);
    } else if (data.movies) {
        // 显示影片列表 - 使用批量API优化
        // 不要在这里隐藏进度条，让displayMoviesList接管
        displayMoviesList(data);
    } else {
        progressManager.hide();
        resultContainer.innerHTML = `<pre>${JSON.stringify(data, null, 2)}</pre>`;
    }
}

// 优化的影片列表显示函数
async function displayMoviesList(data) {
    const resultContainer = document.getElementById('result-container');
    const movieCount = data.movies.length;
    
    // 首先更新进度条文本和状态，从"获取影片列表"转换到"加载最佳资源"
    console.log('About to show progress bar, progressManager:', progressManager);
    console.log('Movie count:', movieCount);
    
    if (progressManager) {
        // 直接更新进度条状态，不要重新显示
        progressManager.updateText('正在加载最佳资源...');
        progressManager.updateProgress(0, movieCount);
        // 移除不确定状态的动画
        if (progressManager.fillElement) {
            progressManager.fillElement.style.animation = '';
            progressManager.fillElement.style.width = '0%';
        }
    } else {
        console.error('progressManager is not initialized!');
    }
    
    let html = '<div class="copy-links-container">' +
        '<button id="copy-all-links" class="copy-btn" disabled>正在加载...</button>' +
        '<button id="download-all-links" class="download-btn" disabled>📥 下载本页全部影片</button>' +
        '</div><div class="movies-grid">';
    
    // 先显示影片卡片框架
    data.movies.forEach(movie => {
        html += `
            <div class="movie-card">
                <div class="movie-header">
                    <h3 class="movie-title">${movie.title}</h3>
                    <div class="movie-meta">
                        <span class="movie-id"><b>${movie.id}</b></span>
                        <span class="movie-date">${movie.date}</span>
                    </div>
                </div>
                <div class="magnet-container" id="magnet-${movie.id}"><p>正在加载最佳资源...</p></div>
            </div>
        `;
    });

    html += '</div>';

    // 添加分页控件
    if (data.pagination) {
        html += '<div class="pagination">';
        if (data.pagination.pages) {
            data.pagination.pages.forEach(page => {
                const isCurrent = page === data.pagination.currentPage;
                html += `<button class="page-btn ${isCurrent ? 'current' : ''}" data-page="${page}">${page}</button>`;
            });
        }
        html += '</div>';
    }

    // 显示筛选信息
    if (data.filter) {
        html = `
            <div class="filter-info">
                <p>当前筛选: ${data.filter.type} - ${data.filter.name}</p>
            </div>
        ` + html;
    }

    resultContainer.innerHTML = html;

    // 使用流式批量API获取影片详情和磁力链接
    try {
        const movieIds = data.movies.map(movie => movie.id);
        
        // 使用fetch进行流式请求
        const response = await fetch('/api/movies/batch-stream', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(movieIds)
        });

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        let processedCount = 0;

        while (true) {
            const { done, value } = await reader.read();
            
            if (done) break;
            
            buffer += decoder.decode(value, { stream: true });
            
            // 处理完整的数据行
            const lines = buffer.split('\n');
            buffer = lines.pop() || ''; // 保留不完整的行
            
            for (const line of lines) {
                if (line.startsWith('data: ')) {
                    try {
                        const data = JSON.parse(line.slice(6));
                        
                        if (data.type === 'start') {
                            console.log(`开始处理 ${data.total} 个影片`);
                        } else if (data.type === 'progress') {
                            processedCount++;
                            
                            // 更新进度条
                            if (progressManager) {
                                progressManager.updateProgress(processedCount, movieCount, `正在加载最佳资源... (${processedCount}/${movieCount})`);
                            }
                            
                            // 更新对应影片的磁力链接信息
                            const magnetContainer = document.getElementById(`magnet-${data.movie_id}`);
                            if (magnetContainer) {
                                if (data.success && data.best_magnet) {
                                    const downloadedBadge = data.is_downloaded ? '<span class="downloaded-badge">✅ 已下载</span>' : '';
                                    magnetContainer.innerHTML = `
                                        <div class="best-magnet ${data.is_downloaded ? 'downloaded' : ''}">
                                            <span class="best-tag">最佳资源</span>
                                            ${downloadedBadge}
                                            <a href="${data.best_magnet.link}" target="_blank">${data.best_magnet.title}</a>
                                            <p>大小: ${data.best_magnet.size}, 日期: ${data.best_magnet.date}</p>
                                        </div>
                                    `;
                                } else {
                                    magnetContainer.innerHTML = `<p>${data.error || '暂无可用资源'}</p>`;
                                }
                            }
                        } else if (data.type === 'complete') {
                            console.log('所有影片处理完成');
                            
                            // 完成进度条
                            if (progressManager) {
                                progressManager.complete('加载完成');
                            }
                            
                            // 启用复制和下载按钮
                            const copyButton = document.getElementById('copy-all-links');
                            const downloadButton = document.getElementById('download-all-links');
                            
                            if (copyButton) {
                                copyButton.disabled = false;
                                copyButton.textContent = '复制本页全部链接';
                                copyButton.addEventListener('click', copyAllLinks);
                            }
                            
                            if (downloadButton) {
                                downloadButton.disabled = !isLoggedIn;
                                downloadButton.textContent = isLoggedIn ? '📥 下载本页全部影片' : '📥 请先登录';
                                downloadButton.addEventListener('click', downloadAllMovies);
                            }
                            break;
                        }
                    } catch (e) {
                        console.error('解析流式数据失败:', e);
                    }
                }
            }
        }
    } catch (error) {
        console.error('流式批量获取影片信息失败:', error);
        // 隐藏进度条
        if (progressManager) {
            progressManager.hide();
        }
        // 如果流式API失败，回退到原有逻辑
        data.movies.forEach(movie => {
            const magnetContainer = document.getElementById(`magnet-${movie.id}`);
            if (magnetContainer) {
                magnetContainer.innerHTML = '<p>获取资源失败</p>';
            }
        });
    }

    // 添加分页按钮事件监听
    addPaginationListeners(data);
}

// 复制所有链接
async function copyAllLinks() {
    const movieCards = document.querySelectorAll('.movie-card');
    let links = [];
    
    movieCards.forEach(card => {
        const bestMagnetLink = card.querySelector('.best-magnet a');
        if (bestMagnetLink) {
            links.push(bestMagnetLink.href);
        }
    });

    if (links.length > 0) {
        const linksText = links.join('\n');
        await navigator.clipboard.writeText(linksText);
        const copyButton = document.getElementById('copy-all-links');
        copyButton.textContent = '复制成功！';
        setTimeout(() => {
            copyButton.textContent = '复制本页全部链接';
        }, 2000);
    } else {
        const copyButton = document.getElementById('copy-all-links');
        copyButton.textContent = '暂无可用链接';
        setTimeout(() => {
            copyButton.textContent = '复制本页全部链接';
        }, 2000);
    }
}

// 下载所有影片
async function downloadAllMovies() {
    if (!isLoggedIn || !pikpakCredentials) {
        alert('请先登录PikPak账户');
        return;
    }
    
    const movieCards = document.querySelectorAll('.movie-card');
    let links = [];
    let movieIds = [];
    
    // 收集未下载的影片
    for (const card of movieCards) {
        const magnetContainer = card.querySelector('.magnet-container');
        const bestMagnetLink = magnetContainer.querySelector('.best-magnet a');
        const movieIdElement = card.querySelector('.movie-id b');
        const isDownloaded = magnetContainer.querySelector('.downloaded-badge');
        
        if (bestMagnetLink && movieIdElement && !isDownloaded) {
            links.push(bestMagnetLink.href);
            movieIds.push(movieIdElement.textContent.trim());
        }
    }

    if (links.length === 0) {
        alert('暂无可用链接或所有影片已下载');
        return;
    }
    
    const totalMovies = movieCards.length;
    const newMovies = links.length;
    const skippedMovies = totalMovies - newMovies;
    
    let confirmMessage = `准备下载 ${newMovies} 部影片`;
    if (skippedMovies > 0) {
        confirmMessage += `\n跳过 ${skippedMovies} 部已下载的影片`;
    }
    confirmMessage += '\n\n确认下载吗？';
    
    if (!confirm(confirmMessage)) {
        return;
    }
    
    const downloadButton = document.getElementById('download-all-links');
    downloadButton.disabled = true;
    downloadButton.textContent = '下载中...';
    
    // 显示下载进度条
    progressManager.setIndeterminate('正在提交下载任务...');
    
    try {
        const response = await fetch('/api/pikpak/download', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                magnet_links: links,
                movie_ids: movieIds,
                username: pikpakCredentials.username,
                password: pikpakCredentials.password
            })
        });
        
        const result = await response.json();
        
        if (result.success) {
            progressManager.complete('下载任务提交成功');
            downloadButton.textContent = '下载成功！';
            alert(result.message + '\n\n下载记录已保存，下次将自动跳过已下载的影片。');
        } else {
            progressManager.hide();
            downloadButton.textContent = '下载失败';
            alert('下载失败: ' + (result.message || '未知错误'));
        }
    } catch (error) {
        console.error('下载失败:', error);
        progressManager.hide();
        downloadButton.textContent = '下载失败';
        alert('下载失败: ' + error.message);
    }
    
    setTimeout(() => {
        downloadButton.disabled = false;
        downloadButton.textContent = '📥 下载本页全部影片';
    }, 3000);
}

// 添加分页监听器
function addPaginationListeners(data) {
    document.querySelectorAll('.page-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
            const page = btn.dataset.page;
            const form = document.getElementById('movie-filter');
            const filterType = form.filterType.value;
            const filterValue = form.filterValue.value;
            const filterCode = form.filterCode.value;
            const magnet = form.magnet.value;
            const type = form.type.value;
            const actorCountFilter = form.actorCountFilter.value;
            const hasSubtitle = form.hasSubtitle.value;

            const queryParams = new URLSearchParams();
            queryParams.append('page', page);
            if (filterType) {
                queryParams.append('filterType', filterType);
                const actualFilterValue = filterCode || filterValue;
                queryParams.append('filterValue', actualFilterValue);
            }
            if (magnet) queryParams.append('magnet', magnet);
            if (type) queryParams.append('type', type);
            if (actorCountFilter) queryParams.append('actorCountFilter', actorCountFilter);
            if (hasSubtitle) queryParams.append('hasSubtitle', hasSubtitle);

            // 显示分页加载进度条
            progressManager.setIndeterminate(`正在加载第 ${page} 页...`);

            try {
                const response = await fetch(`/api/movies?${queryParams.toString()}`);
                const data = await response.json();
                
                // 完成进度条
                progressManager.complete('页面加载完成');
                
                displayResults(data);
            } catch (error) {
                console.error('加载页面失败:', error);
                progressManager.hide();
                const resultContainer = document.getElementById('result-container');
                resultContainer.innerHTML = '<p>加载页面失败，请稍后重试</p>';
            }
        });
    });
}

// 显示影片详情（保持原有逻辑）
function displayMovieDetails(movie) {
    const resultContainer = document.getElementById('result-container');
    let html = `
        <h2>${movie.title}</h2>
        <img src="${movie.img}" alt="${movie.title}" style="max-width: 300px;">
        <p><strong>ID:</strong> ${movie.id}</p>
        <p><strong>发布日期:</strong> ${movie.date}</p>
        <p><strong>时长:</strong> ${movie.videoLength} 分钟</p>
        <p><strong>导演:</strong> ${movie.director ? movie.director.name : 'N/A'}</p>
        <p><strong>制作商:</strong> ${movie.producer ? movie.producer.name : 'N/A'}</p>
        <p><strong>发行商:</strong> ${movie.publisher ? movie.publisher.name : 'N/A'}</p>
        <p><strong>系列:</strong> ${movie.series ? movie.series.name : 'N/A'}</p>
        <p><strong>类型:</strong> ${movie.genres.map(g => g.name).join(', ')}</p>
        <p><strong>演员:</strong> ${movie.stars.map(s => s.name).join(', ')}</p>
        <h3>样片:</h3>
        <div class="samples-container">
            ${movie.samples.map(sample => `<img src="${sample.src}" alt="${sample.alt}">`).join('')}
        </div>
        <div id="magnets-container"></div>
    `;
    resultContainer.innerHTML = html;
}

// 获取并显示磁力链接（保持原有逻辑）
async function fetchAndDisplayMagnets(movieId, gid, uc) {
    const magnetsContainer = document.getElementById('magnets-container');
    magnetsContainer.innerHTML = '<p>正在加载磁力链接...</p>';

    const queryParams = new URLSearchParams();
    queryParams.append('gid', gid);
    queryParams.append('uc', uc);
    queryParams.append('sortBy', 'size');
    queryParams.append('sortOrder', 'desc');

    try {
        const data = await simpleFetch(`/api/magnets/${encodeURIComponent(movieId)}?${queryParams.toString()}`);

        if (data && data.length > 0) {
            const sortedData = [...data].sort((a, b) => {
                const sizeA = parseFloat(a.size);
                const sizeB = parseFloat(b.size);
                return sizeB - sizeA;
            });

            let magnetsHtml = '<h3>磁力链接:</h3><ul>';
            sortedData.forEach((magnet, index) => {
                const isBest = index === 0;
                magnetsHtml += `<li class="${isBest ? 'best-magnet' : ''}">` +
                    `${isBest ? '<span class="best-tag">最佳资源</span>' : ''}` +
                    `<a href="${magnet.link}" target="_blank">${magnet.title}</a> ` +
                    `(大小: ${magnet.size}, 日期: ${magnet.date})</li>`;
            });
            magnetsHtml += '</ul>';
            magnetsContainer.innerHTML = magnetsHtml;
        } else {
            magnetsContainer.innerHTML = '<p>没有找到磁力链接</p>';
        }
    } catch (error) {
        console.error('获取磁力链接失败:', error);
        magnetsContainer.innerHTML = '<p>获取磁力链接失败</p>';
    }
}

// 显示演员详情（保持原有逻辑）
function displayStarDetails(star) {
    const resultContainer = document.getElementById('result-container');
    let html = `
        <h2>${star.name}</h2>
        <img src="${star.avatar}" alt="${star.name}" style="max-width: 200px;">
        <p><strong>ID:</strong> ${star.id}</p>
        <p><strong>出生日期:</strong> ${star.birthday || 'N/A'}</p>
        <p><strong>年龄:</strong> ${star.age || 'N/A'}</p>
        <p><strong>身高:</strong> ${star.height || 'N/A'}</p>
        <p><strong>罩杯:</strong> ${star.cup || 'N/A'}</p>
        <p><strong>胸围:</strong> ${star.bust || 'N/A'}</p>
        <p><strong>腰围:</strong> ${star.waist || 'N/A'}</p>
        <p><strong>臀围:</strong> ${star.hip || 'N/A'}</p>
        <p><strong>出生地:</strong> ${star.birthplace || 'N/A'}</p>
        <p><strong>爱好:</strong> ${star.hobby || 'N/A'}</p>
    `;
    resultContainer.innerHTML = html;
}

// PikPak登录相关函数（保持原有逻辑）
function restorePikPakLogin() {
    const savedCredentials = localStorage.getItem('pikpakCredentials');
    const savedLoginStatus = localStorage.getItem('pikpakLoginStatus');
    
    if (savedCredentials && savedLoginStatus === 'true') {
        try {
            pikpakCredentials = JSON.parse(savedCredentials);
            isLoggedIn = true;
            
            const loginBtn = document.getElementById('login-btn');
            const logoutBtn = document.getElementById('logout-btn');
            const loginStatus = document.getElementById('login-status');
            const usernameInput = document.querySelector('#pikpak-login input[name="username"]');
            const passwordInput = document.querySelector('#pikpak-login input[name="password"]');
            
            if (loginBtn && loginStatus) {
                loginBtn.textContent = '已登录';
                loginBtn.disabled = true;
                loginStatus.textContent = '已登录 (' + pikpakCredentials.username + ')';
                loginStatus.style.color = '#4CAF50';
            }
            
            if (logoutBtn) {
                logoutBtn.style.display = 'inline-block';
            }
            
            if (usernameInput && passwordInput) {
                usernameInput.value = pikpakCredentials.username;
                passwordInput.value = pikpakCredentials.password;
            }
        } catch (error) {
            console.error('恢复登录状态失败:', error);
            localStorage.removeItem('pikpakCredentials');
            localStorage.removeItem('pikpakLoginStatus');
        }
    }
}

function savePikPakLogin(credentials) {
    localStorage.setItem('pikpakCredentials', JSON.stringify(credentials));
    localStorage.setItem('pikpakLoginStatus', 'true');
}

function clearPikPakLogin() {
    localStorage.removeItem('pikpakCredentials');
    localStorage.removeItem('pikpakLoginStatus');
    pikpakCredentials = null;
    isLoggedIn = false;
}

function handleLogout() {
    clearPikPakLogin();
    
    const loginBtn = document.getElementById('login-btn');
    const logoutBtn = document.getElementById('logout-btn');
    const loginStatus = document.getElementById('login-status');
    const usernameInput = document.querySelector('#pikpak-login input[name="username"]');
    const passwordInput = document.querySelector('#pikpak-login input[name="password"]');
    
    if (loginBtn) {
        loginBtn.textContent = '登录';
        loginBtn.disabled = false;
    }
    
    if (logoutBtn) {
        logoutBtn.style.display = 'none';
    }
    
    if (loginStatus) {
        loginStatus.textContent = '未登录';
        loginStatus.style.color = '#f44336';
    }
    
    if (usernameInput && passwordInput) {
        usernameInput.value = '';
        passwordInput.value = '';
    }
}

// 页面加载完成后的初始化
document.addEventListener('DOMContentLoaded', () => {
    // 初始化进度条管理器
    console.log('Initializing ProgressManager...');
    progressManager = new ProgressManager();
    console.log('ProgressManager initialized:', progressManager);
    
    // 验证进度条元素是否存在
    const progressContainer = document.getElementById('progress-container');
    console.log('Progress container found:', progressContainer);
    
    restorePikPakLogin();
    
    const logoutBtn = document.getElementById('logout-btn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', handleLogout);
    }
    
    const showOptionsBtn = document.getElementById('show-options-btn');
    if (showOptionsBtn) {
        showOptionsBtn.addEventListener('click', showOptionsSelector);
    }
    
    // 监听筛选值输入框的变化
    const filterValueInput = document.querySelector('#movie-filter input[name="filterValue"]');
    const filterCodeInput = document.querySelector('#movie-filter input[name="filterCode"]');
    
    if (filterValueInput && filterCodeInput) {
        filterValueInput.addEventListener('input', (e) => {
            if (e.target.value === '') {
                filterCodeInput.value = '';
                e.target.placeholder = '输入筛选值';
            }
        });
    }
    
    // 添加PikPak登录表单事件监听器
    const pikpakLoginForm = document.getElementById('pikpak-login');
    if (pikpakLoginForm) {
        pikpakLoginForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const username = e.target.username.value;
            const password = e.target.password.value;
            const loginBtn = document.getElementById('login-btn');
            const loginStatus = document.getElementById('login-status');
            
            loginBtn.disabled = true;
            loginBtn.textContent = '登录中...';
            loginStatus.textContent = '';
            
            try {
                const response = await fetch('/api/pikpak/login', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        username: username,
                        password: password
                    })
                });
                
                const result = await response.json();
                
                if (result.success) {
                    pikpakCredentials = { username, password };
                    isLoggedIn = true;
                    
                    // 保存登录状态到localStorage
                    savePikPakLogin(pikpakCredentials);
                    
                    const logoutBtn = document.getElementById('logout-btn');
                    
                    loginStatus.textContent = '登录成功！';
                    loginStatus.style.color = '#4CAF50';
                    loginBtn.textContent = '已登录';
                    loginBtn.disabled = true;
                    
                    if (logoutBtn) {
                        logoutBtn.style.display = 'inline-block';
                    }
                } else {
                    loginStatus.textContent = '登录失败: ' + (result.message || '未知错误');
                    loginStatus.style.color = '#f44336';
                    loginBtn.disabled = false;
                    loginBtn.textContent = '登录';
                }
            } catch (error) {
                console.error('登录失败:', error);
                loginStatus.textContent = '登录失败: ' + error.message;
                loginStatus.style.color = '#f44336';
                loginBtn.disabled = false;
                loginBtn.textContent = '登录';
            }
        });
    }
});