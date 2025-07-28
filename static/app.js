// 导入工具函数
import { fetchWithRetry } from './utils.js';

// PikPak相关变量
let pikpakCredentials = null;
let isLoggedIn = false;

// 类别数据
let categoriesData = null;
// 演员数据
let actorsData = null;

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
    
    // 如果加载失败，返回空数据
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
    
    // 如果加载失败，返回空数据
    return {};
}

// 显示选项选择器
function showOptionsSelector() {
    const filterTypeSelect = document.querySelector('#movie-filter select[name="filterType"]');
    const selectedType = filterTypeSelect.value;
    
    if (selectedType === 'genre') {
        // 显示类别选项
        loadCategoriesData().then(categories => {
            createOptionsDisplay('类别', categories);
        });
    } else if (selectedType === 'star') {
        // 显示演员选项
        loadActorsData().then(actors => {
            createOptionsDisplay('演员', actors);
        });
    } else if (selectedType === 'director') {
        // 显示导演选项（暂时为空）
        createOptionsDisplay('导演', {});
    } else if (selectedType === 'studio') {
        // 显示制作商选项（暂时为空）
        createOptionsDisplay('制作商', {});
    } else if (selectedType === 'label') {
        // 显示发行商选项（暂时为空）
        createOptionsDisplay('发行商', {});
    } else if (selectedType === 'series') {
        // 显示系列选项（暂时为空）
        createOptionsDisplay('系列', {});
    } else {
        // 未选择筛选类型时的提示
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

// 在查询结果区域创建选项展示
function createOptionsDisplay(optionType, optionsData) {
    const resultContainer = document.getElementById('result-container');
    
    // 清空现有内容
    resultContainer.innerHTML = '';
    
    // 如果没有数据，显示空状态
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
    
    // 创建选项展示容器
    const optionsDisplay = document.createElement('div');
    optionsDisplay.className = 'options-display';
    
    // 创建头部
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
    
    // 创建选项组容器
    const groupsContainer = document.createElement('div');
    groupsContainer.className = 'options-groups';
    
    // 如果是演员选项，直接显示所有演员，不分组
    if (optionType === '演员') {
        const actorsList = optionsData['演员'] || [];
        
        // 创建单个容器直接显示所有演员
        const group = document.createElement('div');
        group.className = 'options-group';
        
        const itemsContainer = document.createElement('div');
        itemsContainer.className = 'options-items';
        
        // 直接遍历所有演员数据
        actorsList.forEach(item => {
            const itemBtn = document.createElement('button');
            itemBtn.className = 'options-item';
            
            // 显示头像和名字
            if (item.avatar) {
                const avatar = document.createElement('img');
                avatar.src = item.avatar;
                avatar.className = 'actor-avatar';
                avatar.alt = item.name;
                avatar.crossOrigin = 'anonymous';
                avatar.loading = 'lazy';
                
                // 添加加载成功和失败的处理
                avatar.onload = () => {
                    console.log('头像加载成功:', item.name);
                };
                
                avatar.onerror = () => {
                    console.log('头像加载失败:', item.name, item.avatar);
                    // 头像加载失败时显示默认图标
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
                // 没有头像时显示默认图标
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
                // 选择后关闭选项展示
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
        // 其他类型选项保持原有的分组逻辑
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
                
                // 其他类型选项只显示名字
                itemBtn.textContent = item.name;
                
                itemBtn.title = item.name;
                itemBtn.onclick = () => {
                    selectOption(item.code, item.name, optionType);
                    // 选择后关闭选项展示
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
        // 根据选项类型设置对应的筛选类型值
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
        filterValueInput.value = name;  // 在输入框中显示名称
        filterCodeInput.value = code;   // 在隐藏字段中保存代码
        filterValueInput.placeholder = `已选择: ${name}`;
    }
}

// 监听筛选值输入框的变化，当手动清空时也清空代码
document.addEventListener('DOMContentLoaded', () => {
    const filterValueInput = document.querySelector('#movie-filter input[name="filterValue"]');
    const filterCodeInput = document.querySelector('#movie-filter input[name="filterCode"]');
    
    if (filterValueInput && filterCodeInput) {
        filterValueInput.addEventListener('input', (e) => {
            // 如果输入框被清空，也清空隐藏的代码字段
            if (e.target.value === '') {
                filterCodeInput.value = '';
                e.target.placeholder = '输入筛选值';
            }
        });
    }
});

// 页面加载时恢复PikPak登录状态
function restorePikPakLogin() {
    const savedCredentials = localStorage.getItem('pikpakCredentials');
    const savedLoginStatus = localStorage.getItem('pikpakLoginStatus');
    
    if (savedCredentials && savedLoginStatus === 'true') {
        try {
            pikpakCredentials = JSON.parse(savedCredentials);
            isLoggedIn = true;
            
            // 更新UI状态
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
            
            // 更新下载按钮状态
            updateCopyButtonStatus();
        } catch (error) {
            console.error('恢复登录状态失败:', error);
            // 清除无效的存储数据
            localStorage.removeItem('pikpakCredentials');
            localStorage.removeItem('pikpakLoginStatus');
        }
    }
}

// 保存PikPak登录状态
function savePikPakLogin(credentials) {
    localStorage.setItem('pikpakCredentials', JSON.stringify(credentials));
    localStorage.setItem('pikpakLoginStatus', 'true');
}

// 清除PikPak登录状态
function clearPikPakLogin() {
    localStorage.removeItem('pikpakCredentials');
    localStorage.removeItem('pikpakLoginStatus');
    pikpakCredentials = null;
    isLoggedIn = false;
}

// 页面加载完成后恢复登录状态
document.addEventListener('DOMContentLoaded', () => {
    restorePikPakLogin();
    
    // 添加退出登录按钮事件监听器
    const logoutBtn = document.getElementById('logout-btn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', handleLogout);
    }
    
    // 添加选项按钮事件监听器
    const showOptionsBtn = document.getElementById('show-options-btn');
    if (showOptionsBtn) {
        showOptionsBtn.addEventListener('click', showOptionsSelector);
    }
});

// 处理退出登录
function handleLogout() {
    // 清除登录状态
    clearPikPakLogin();
    
    // 重置UI状态
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
        loginStatus.textContent = '';
    }
    
    if (usernameInput && passwordInput) {
        usernameInput.value = '';
        passwordInput.value = '';
    }
    
    // 更新下载按钮状态
    updateCopyButtonStatus();
}

// 处理PikPak登录表单提交
document.getElementById('pikpak-login').addEventListener('submit', async (e) => {
    e.preventDefault();
    const username = e.target.username.value;
    const password = e.target.password.value;
    const loginBtn = document.getElementById('login-btn');
    const loginStatus = document.getElementById('login-status');
    const downloadButton = document.querySelector('.download-all-btn');
    
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
            
            // 更新影片列表中的下载按钮状态
            updateCopyButtonStatus();
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

// 处理影片搜索表单提交
document.getElementById('movie-search').addEventListener('submit', async (e) => {
    e.preventDefault();
    const keyword = e.target.keyword.value;
    const resultContainer = document.getElementById('result-container');
    resultContainer.innerHTML = '<p>正在搜索，请稍候...</p>';
    
    try {
        // 调用API搜索影片
        const data = await fetchWithRetry(`/api/movies/${encodeURIComponent(keyword)}`);
        
        // 显示结果
        displayResults(data);
    } catch (error) {
        console.error('搜索失败:', error);
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
    resultContainer.innerHTML = '<p>正在获取影片信息，请稍候...</p>';
    
    try {
        // 先获取影片详情以获取gid和uc参数
        const movieData = await fetchWithRetry(`/api/movies/${encodeURIComponent(movieId)}`);
        
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
        const data = await fetchWithRetry(`/api/magnets/${encodeURIComponent(movieId)}?${queryParams.toString()}`);
        
        // 显示结果
        if (data && data.length > 0) {
            // 按文件大小排序（降序）
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

// 处理影片列表筛选表单提交
document.getElementById('movie-filter').addEventListener('submit', async (e) => {
    e.preventDefault();
    const filterType = e.target.filterType.value;
    const filterValue = e.target.filterValue.value;
    const filterCode = e.target.filterCode.value;
    const magnet = e.target.magnet.value;
    const type = e.target.type.value;
    const actorCountFilter = e.target.actorCountFilter.value;
    const fetchMode = e.target.fetchMode.value; // 获取方式：page 或 all
    // hasSubtitle 参数不在影片列表级别使用，而是在磁力链接级别使用
    const resultContainer = document.getElementById('result-container');
    
    // 根据获取方式显示不同的加载信息
    if (fetchMode === 'all') {
        resultContainer.innerHTML = '<p>正在获取所有页面的影片列表，请稍候...</p>';
    } else {
        resultContainer.innerHTML = '<p>正在获取影片列表，请稍候...</p>';
    }
    
    try {
        // 构建查询参数
        const queryParams = new URLSearchParams();
        if (filterType) {
            queryParams.append('filterType', filterType);
            // 优先使用代码，如果没有代码则使用输入框的值
            const actualFilterValue = filterCode || filterValue;
            queryParams.append('filterValue', actualFilterValue);
        }
        if (magnet) queryParams.append('magnet', magnet);
        if (type) queryParams.append('type', type);
        if (actorCountFilter) queryParams.append('actorCountFilter', actorCountFilter);
        // 移除 hasSubtitle 参数，因为字幕筛选在磁力链接级别进行
        // if (hasSubtitle) queryParams.append('hasSubtitle', hasSubtitle);
        
        // 根据获取方式选择不同的API端点
        let apiUrl;
        if (fetchMode === 'all') {
            apiUrl = `/api/movies/all?${queryParams.toString()}`;
        } else {
            apiUrl = `/api/movies?${queryParams.toString()}`;
        }
        
        // 调用API获取影片列表
        const data = await fetchWithRetry(apiUrl);
        
        // 检查是否需要自动切换到获取全部
        if (fetchMode === 'page' && (!data || !data.movies || data.movies.length === 0)) {
            console.log('第一页没有找到结果，自动切换到获取全部模式');
            resultContainer.innerHTML = '<p>第一页没有找到结果，正在获取全部页面的影片，请耐心等待...</p>';
            
            // 自动切换到获取全部模式
            const allApiUrl = `/api/movies/all?${queryParams.toString()}`;
            const allData = await fetchWithRetry(allApiUrl);
            
            // 显示获取全部的结果
            displayResults(allData);
        } else {
            // 显示正常结果
            displayResults(data);
        }
    } catch (error) {
        console.error('筛选失败:', error);
        resultContainer.innerHTML = '<p>筛选失败，请稍后重试</p>';
    }
});

// 全局变量用于跟踪资源加载状态
let loadedResources = 0;

// 更新复制按钮状态的函数
function updateCopyButtonStatus() {
    const copyButton = document.getElementById('copy-all-links');
    const downloadButton = document.getElementById('download-all-links');
    if (!copyButton) return;
    
    const movieCards = document.querySelectorAll('.movie-card');
    const totalMovies = movieCards.length;
    const loadedMovies = Array.from(movieCards).filter(card => {
        const magnetContainer = card.querySelector('.magnet-container');
        return magnetContainer && (
            magnetContainer.querySelector('.best-magnet') ||
            magnetContainer.textContent.includes('影片不存在') ||
            magnetContainer.textContent.includes('无法获取影片参数') ||
            magnetContainer.textContent.includes('暂无可用资源') ||
            magnetContainer.textContent.includes('获取资源失败')
        );
    }).length;
    
    loadedResources = loadedMovies;
    
    if (loadedMovies === totalMovies) {
        copyButton.disabled = false;
        copyButton.textContent = '复制本页全部链接';
        if (downloadButton) {
            downloadButton.disabled = !isLoggedIn;
            downloadButton.textContent = isLoggedIn ? '📥 下载本页全部影片' : '📥 请先登录';
        }
    } else {
        copyButton.disabled = true;
        copyButton.textContent = `加载中... (${loadedMovies}/${totalMovies})`;
        if (downloadButton) {
            downloadButton.disabled = true;
            downloadButton.textContent = `📥 加载中... (${loadedMovies}/${totalMovies})`;
        }
    }
}

// 显示查询结果
function displayResults(data) {
    // 重置资源加载计数器
    loadedResources = 0;
    const resultContainer = document.getElementById('result-container');
    resultContainer.innerHTML = ''; // 清空之前的结果

    if (!data || (Array.isArray(data.movies) && data.movies.length === 0)) {
        resultContainer.innerHTML = '<p>没有找到匹配的结果</p>';
        return;
    }

    // 检查是否是影片详情对象 (包含 gid 和 uc)
    if (data.id && data.gid !== undefined && data.uc !== undefined) {
        // 显示影片详情
        displayMovieDetails(data);
        // 自动获取并显示磁力链接
        fetchAndDisplayMagnets(data.id, data.gid, data.uc);
    } else if (data.id || data.avatar) {
        // 显示演员详情
        displayStarDetails(data);
    } else if (data.movies) {
        // 显示影片列表
        let html = '<div class="copy-links-container">' +
            '<button id="copy-all-links" class="copy-btn" disabled>加载中...</button>' +
            '<button id="download-all-links" class="download-btn" disabled>📥 下载本页全部影片</button>' +
            '</div><div class="movies-grid">';
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
            // 获取并显示该影片的最佳磁力链接
            (async () => {
                try {
                    // 检查是否已下载
                    let isDownloaded = false;
                    try {
                        const checkResponse = await fetch(`/api/downloaded-movies/${encodeURIComponent(movie.id)}`);
                        const checkResult = await checkResponse.json();
                        isDownloaded = checkResult.is_downloaded;
                    } catch (error) {
                        console.warn(`检查影片 ${movie.id} 下载状态失败:`, error);
                    }
                    
                    const movieData = await fetchWithRetry(`/api/movies/${encodeURIComponent(movie.id)}`);
                    
                    const magnetContainer = document.getElementById(`magnet-${movie.id}`);
                    if (!movieData) {
                        magnetContainer.innerHTML = '<p>影片不存在</p>';
                        loadedResources++;
                        updateCopyButtonStatus();
                        return;
                    }
                    
                    if (!movieData.gid || movieData.uc === undefined) {
                        magnetContainer.innerHTML = '<p>无法获取影片参数</p>';
                        loadedResources++;
                        updateCopyButtonStatus();
                        return;
                    }
                    
                    const queryParams = new URLSearchParams();
                    queryParams.append('gid', movieData.gid);
                    queryParams.append('uc', movieData.uc);
                    queryParams.append('sortBy', 'size');
                    queryParams.append('sortOrder', 'desc');
                    
                    // 获取当前的字幕筛选条件
                    const hasSubtitleFilter = document.querySelector('select[name="hasSubtitle"]')?.value;
                    if (hasSubtitleFilter) {
                        queryParams.append('hasSubtitle', hasSubtitleFilter);
                    }
                    
                    const data = await fetchWithRetry(`/api/magnets/${encodeURIComponent(movie.id)}?${queryParams.toString()}`);
                    
                    if (data && data.length > 0) {
                        const bestMagnet = data[0];
                        const downloadedBadge = isDownloaded ? '<span class="downloaded-badge">✅ 已下载</span>' : '';
                        magnetContainer.innerHTML = `
                            <div class="best-magnet ${isDownloaded ? 'downloaded' : ''}">
                                <span class="best-tag">最佳资源</span>
                                ${downloadedBadge}
                                <a href="${bestMagnet.link}" target="_blank">${bestMagnet.title}</a>
                                <p>大小: ${bestMagnet.size}, 日期: ${bestMagnet.date}</p>
                            </div>
                        `;
                    } else {
                        magnetContainer.innerHTML = '<p>暂无可用资源</p>';
                    }
                    loadedResources++;
                    updateCopyButtonStatus();
                } catch (error) {
                    console.error(`获取影片 ${movie.id} 的磁力链接失败:`, error);
                    const magnetContainer = document.getElementById(`magnet-${movie.id}`);
                    magnetContainer.innerHTML = '<p>获取资源失败</p>';
                }
            })();
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

        // 添加复制按钮和下载按钮事件监听
        const copyButton = document.getElementById('copy-all-links');
        const downloadButton = document.getElementById('download-all-links');
        
        if (copyButton) {
            copyButton.addEventListener('click', async () => {
                const movieCards = document.querySelectorAll('.movie-card');
                let links = [];
                
                // 等待所有磁力链接加载完成
                await Promise.all(Array.from(movieCards).map(async (card) => {
                    const magnetContainer = card.querySelector('.magnet-container');
                    const bestMagnetLink = magnetContainer.querySelector('.best-magnet a');
                    if (bestMagnetLink) {
                        links.push(bestMagnetLink.href);
                    }
                }));

                // 复制到剪贴板
                if (links.length > 0) {
                    const linksText = links.join('\n');
                    await navigator.clipboard.writeText(linksText);
                    copyButton.textContent = '复制成功！';
                    setTimeout(() => {
                        copyButton.textContent = '复制本页全部链接';
                    }, 2000);
                } else {
                    copyButton.textContent = '暂无可用链接';
                    setTimeout(() => {
                        copyButton.textContent = '复制本页全部链接';
                    }, 2000);
                }
            });
        }
        
        // 添加下载按钮事件监听
        if (downloadButton) {
            downloadButton.addEventListener('click', async () => {
                if (!isLoggedIn || !pikpakCredentials) {
                    alert('请先登录PikPak账户');
                    return;
                }
                
                const movieCards = document.querySelectorAll('.movie-card');
                let links = [];
                let movieIds = [];
                
                // 收集所有磁力链接和影片番号
                for (const card of movieCards) {
                    const magnetContainer = card.querySelector('.magnet-container');
                    const bestMagnetLink = magnetContainer.querySelector('.best-magnet a');
                    const movieIdElement = card.querySelector('.movie-id b');
                    
                    if (bestMagnetLink && movieIdElement) {
                        const movieId = movieIdElement.textContent.trim();
                        
                        // 检查是否已下载
                        try {
                            const checkResponse = await fetch(`/api/downloaded-movies/${encodeURIComponent(movieId)}`);
                            const checkResult = await checkResponse.json();
                            
                            if (checkResult.is_downloaded) {
                                console.log(`影片 ${movieId} 已下载，跳过`);
                                continue;
                            }
                        } catch (error) {
                            console.warn(`检查影片 ${movieId} 下载状态失败:`, error);
                        }
                        
                        links.push(bestMagnetLink.href);
                        movieIds.push(movieId);
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
                        // 更新当前页面的下载状态显示，不刷新页面
                        updateCopyButtonStatus();
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
            });
        }

        // 添加分页按钮事件监听
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
                const fetchMode = form.fetchMode.value;

                const queryParams = new URLSearchParams();
                queryParams.append('page', page);
                if (filterType) {
                    queryParams.append('filterType', filterType);
                    // 优先使用代码，如果没有代码则使用输入框的值
                    const actualFilterValue = filterCode || filterValue;
                    queryParams.append('filterValue', actualFilterValue);
                }
                if (magnet) queryParams.append('magnet', magnet);
                if (type) queryParams.append('type', type);
                if (actorCountFilter) queryParams.append('actorCountFilter', actorCountFilter);
                // 移除 hasSubtitle 参数，因为字幕筛选在磁力链接级别进行
                // if (hasSubtitle) queryParams.append('hasSubtitle', hasSubtitle);

                try {
                    // 分页按钮只在逐页模式下使用，所以这里固定使用 /api/movies
                    const response = await fetch(`/api/movies?${queryParams.toString()}`);
                    const data = await response.json();
                    displayResults(data);
                } catch (error) {
                    console.error('加载页面失败:', error);
                    resultContainer.innerHTML = '<p>加载页面失败，请稍后重试</p>';
                }
            });
        });
    } else {
        // 其他类型的响应，显示原始JSON
        resultContainer.innerHTML = `<pre>${JSON.stringify(data, null, 2)}</pre>`;
    }
}

// 显示影片详情
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
        <div id="magnets-container"></div> <!-- 用于显示磁力链接 -->
    `;
    resultContainer.innerHTML = html;
}

// 获取并显示磁力链接
async function fetchAndDisplayMagnets(movieId, gid, uc) {
    const magnetsContainer = document.getElementById('magnets-container');
    magnetsContainer.innerHTML = '<p>正在加载磁力链接...</p>';

    const queryParams = new URLSearchParams();
    queryParams.append('gid', gid);
    queryParams.append('uc', uc);
    queryParams.append('sortBy', 'size');
    queryParams.append('sortOrder', 'desc');
    
    // 获取字幕筛选条件
    const form = document.getElementById('movie-filter');
    if (form && form.hasSubtitle && form.hasSubtitle.value) {
        queryParams.append('hasSubtitle', form.hasSubtitle.value);
    }

    try {
        const response = await fetch(`/api/magnets/${encodeURIComponent(movieId)}?${queryParams.toString()}`);
        const data = await response.json();

        if (data && data.length > 0) {
            // 按文件大小排序（降序）
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

// 显示演员详情
function displayStarDetails(star) {
    const resultContainer = document.getElementById('result-container');
    let html = `
        <h2>${star.name}</h2>
        <div class="star-info-card">
            <img src="${star.avatar}" alt="${star.name}" style="max-width: 300px;">
            <p><strong>ID:</strong> ${star.id}</p>
            <p><strong>生日:</strong> ${star.birthday || 'N/A'}</p>
            <p><strong>年龄:</strong> ${star.age || 'N/A'}</p>
            <p><strong>身高:</strong> ${star.height || 'N/A'}</p>
            <p><strong>胸围:</strong> ${star.bust || 'N/A'}</p>
            <p><strong>腰围:</strong> ${star.waistline || 'N/A'}</p>
            <p><strong>臀围:</strong> ${star.hipline || 'N/A'}</p>
            <p><strong>出生地:</strong> ${star.birthplace || 'N/A'}</p>
            <p><strong>爱好:</strong> ${star.hobby || 'N/A'}</p>
        </div>
        <h3>作品列表:</h3>
        <div class="movies-container">
            ${star.movies ? star.movies.map(movie => `
                <div class="movie-item">
                    <img src="${movie.img}" alt="${movie.title}" style="max-width: 200px;">
                    <p><strong>${movie.id}</strong></p>
                    <p>${movie.title}</p>
                    <p>发布日期: ${movie.date}</p>
                </div>
            `).join('') : '<p>暂无作品信息</p>'}
        </div>
    `;
    resultContainer.innerHTML = html;
}