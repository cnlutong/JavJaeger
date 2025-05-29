// 导入工具函数
import { fetchWithRetry } from './utils.js';

// PikPak相关变量
let pikpakCredentials = null;
let isLoggedIn = false;

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
            loginStatus.textContent = '登录成功！';
            loginStatus.style.color = '#4CAF50';
            loginBtn.textContent = '已登录';
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

// 处理演员搜索表单提交
document.getElementById('star-search').addEventListener('submit', async (e) => {
    e.preventDefault();
    const starId = e.target.starId.value;
    const resultContainer = document.getElementById('result-container');
    resultContainer.innerHTML = '<p>正在搜索，请稍候...</p>';
    
    try {
        // 调用API搜索演员
        const data = await fetchWithRetry(`/api/stars/${starId}`);
        
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
    const magnet = e.target.magnet.value;
    const type = e.target.type.value;
    const resultContainer = document.getElementById('result-container');
    resultContainer.innerHTML = '<p>正在获取影片列表，请稍候...</p>';
    
    try {
        // 构建查询参数
        const queryParams = new URLSearchParams();
        if (filterType) {
            queryParams.append('filterType', filterType);
            queryParams.append('filterValue', filterValue);
        }
        if (magnet) queryParams.append('magnet', magnet);
        if (type) queryParams.append('type', type);
        
        // 调用API获取影片列表
        const data = await fetchWithRetry(`/api/movies?${queryParams.toString()}`);
        
        // 显示结果
        displayResults(data);
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
                    
                    const data = await fetchWithRetry(`/api/magnets/${encodeURIComponent(movie.id)}?${queryParams.toString()}`);
                    
                    if (data && data.length > 0) {
                        const bestMagnet = data[0];
                        magnetContainer.innerHTML = `
                            <div class="best-magnet">
                                <span class="best-tag">最佳资源</span>
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
                
                // 收集所有磁力链接
                movieCards.forEach(card => {
                    const magnetContainer = card.querySelector('.magnet-container');
                    const bestMagnetLink = magnetContainer.querySelector('.best-magnet a');
                    if (bestMagnetLink) {
                        links.push(bestMagnetLink.href);
                    }
                });

                if (links.length === 0) {
                    alert('暂无可用链接');
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
                            username: pikpakCredentials.username,
                            password: pikpakCredentials.password
                        })
                    });
                    
                    const result = await response.json();
                    
                    if (result.success) {
                        downloadButton.textContent = '下载成功！';
                        alert(result.message);
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
                const magnet = form.magnet.value;
                const type = form.type.value;

                const queryParams = new URLSearchParams();
                queryParams.append('page', page);
                if (filterType) {
                    queryParams.append('filterType', filterType);
                    queryParams.append('filterValue', filterValue);
                }
                if (magnet) queryParams.append('magnet', magnet);
                if (type) queryParams.append('type', type);

                try {
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