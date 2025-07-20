// 优化的前端应用 - 减少API请求，将业务逻辑移到后端

// PikPak相关变量
let pikpakCredentials = null;
let isLoggedIn = false;

// 类别数据
let categoriesData = null;
// 演员数据
let actorsData = null;

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

// 处理磁力链接查询表单提交
document.getElementById('magnet-search').addEventListener('submit', async (e) => {
    e.preventDefault();
    const movieId = e.target.movieId.value;
    const sortBy = e.target.sortBy.value;
    const sortOrder = e.target.sortOrder.value;
    const resultContainer = document.getElementById('result-container');
    resultContainer.innerHTML = '<p>正在获取影片信息，请稍候...</p>';
    
    try {
        // 先获取影片详情
        const movieData = await simpleFetch(`/api/movies/${encodeURIComponent(movieId)}`);
        
        if (!movieData || !movieData.gid || movieData.uc === undefined) {
            throw new Error('无法获取影片详情或必要参数');
        }
        
        // 构建查询参数
        const queryParams = new URLSearchParams();
        queryParams.append('gid', movieData.gid);
        queryParams.append('uc', movieData.uc);
        if (sortBy) queryParams.append('sortBy', sortBy);
        if (sortOrder) queryParams.append('sortOrder', sortOrder);
        
        resultContainer.innerHTML = '<p>正在获取磁力链接，请稍候...</p>';
        
        // 调用API获取磁力链接
        const data = await simpleFetch(`/api/magnets/${encodeURIComponent(movieId)}?${queryParams.toString()}`);
        
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
    const resultContainer = document.getElementById('result-container');
    resultContainer.innerHTML = '<p>正在获取影片列表，请稍候...</p>';
    
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
        
        // 调用API获取影片列表
        const data = await simpleFetch(`/api/movies?${queryParams.toString()}`);
        
        // 显示结果
        displayResults(data);
    } catch (error) {
        console.error('筛选失败:', error);
        resultContainer.innerHTML = '<p>筛选失败，请稍后重试</p>';
    }
});

// 优化的显示查询结果函数
function displayResults(data) {
    const resultContainer = document.getElementById('result-container');
    resultContainer.innerHTML = '';

    if (!data || (Array.isArray(data.movies) && data.movies.length === 0)) {
        resultContainer.innerHTML = '<p>没有找到匹配的结果</p>';
        return;
    }

    // 检查是否是影片详情对象
    if (data.id && data.gid !== undefined && data.uc !== undefined) {
        displayMovieDetails(data);
        fetchAndDisplayMagnets(data.id, data.gid, data.uc);
    } else if (data.id || data.avatar) {
        displayStarDetails(data);
    } else if (data.movies) {
        // 显示影片列表 - 使用批量API优化
        displayMoviesList(data);
    } else {
        resultContainer.innerHTML = `<pre>${JSON.stringify(data, null, 2)}</pre>`;
    }
}

// 优化的影片列表显示函数
async function displayMoviesList(data) {
    const resultContainer = document.getElementById('result-container');
    
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

    // 使用批量API获取影片详情和磁力链接
    try {
        const movieIds = data.movies.map(movie => movie.id);
        const batchData = await simpleFetch('/api/movies/batch', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(movieIds)
        });

        if (batchData && batchData.success) {
            // 更新每个影片的磁力链接信息
            batchData.results.forEach(result => {
                const magnetContainer = document.getElementById(`magnet-${result.movie_id}`);
                if (!magnetContainer) return;

                if (result.success && result.best_magnet) {
                    const downloadedBadge = result.is_downloaded ? '<span class="downloaded-badge">✅ 已下载</span>' : '';
                    magnetContainer.innerHTML = `
                        <div class="best-magnet ${result.is_downloaded ? 'downloaded' : ''}">
                            <span class="best-tag">最佳资源</span>
                            ${downloadedBadge}
                            <a href="${result.best_magnet.link}" target="_blank">${result.best_magnet.title}</a>
                            <p>大小: ${result.best_magnet.size}, 日期: ${result.best_magnet.date}</p>
                        </div>
                    `;
                } else {
                    magnetContainer.innerHTML = `<p>${result.error || '暂无可用资源'}</p>`;
                }
            });

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
        }
    } catch (error) {
        console.error('批量获取影片信息失败:', error);
        // 如果批量API失败，回退到原有逻辑
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
            downloadButton.textContent = '下载成功！';
            alert(result.message + '\n\n下载记录已保存，下次将自动跳过已下载的影片。');
        } else {
            downloadButton.textContent = '下载失败';
            alert('下载失败: ' + (result.message || '未知错误'));
        }
    } catch (error) {
        console.error('下载失败:', error);
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

            const queryParams = new URLSearchParams();
            queryParams.append('page', page);
            if (filterType) {
                queryParams.append('filterType', filterType);
                const actualFilterValue = filterCode || filterValue;
                queryParams.append('filterValue', actualFilterValue);
            }
            if (magnet) queryParams.append('magnet', magnet);
            if (type) queryParams.append('type', type);

            try {
                const response = await fetch(`/api/movies?${queryParams.toString()}`);
                const data = await response.json();
                displayResults(data);
            } catch (error) {
                console.error('加载页面失败:', error);
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
});