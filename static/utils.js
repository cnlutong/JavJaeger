// 请求队列管理器
class RequestQueue {
    constructor(maxConcurrent = 1, retryDelay = 3000) {
        this.queue = [];
        this.running = 0;
        this.maxConcurrent = maxConcurrent;
        this.baseRetryDelay = retryDelay;
        this.maxRetries = 3;
        this.lastRequestTime = 0;
        this.minInterval = 1000; // 最大安全频率：1秒间隔
    }

    async add(requestFn) {
        return new Promise((resolve, reject) => {
            this.queue.push({ requestFn, resolve, reject, retries: 0 });
            this.processQueue();
        });
    }

    async processQueue() {
        if (this.running >= this.maxConcurrent || this.queue.length === 0) return;

        // 检查请求间隔
        const now = Date.now();
        const timeSinceLastRequest = now - this.lastRequestTime;
        if (timeSinceLastRequest < this.minInterval) {
            setTimeout(() => this.processQueue(), this.minInterval - timeSinceLastRequest);
            return;
        }

        this.running++;
        this.lastRequestTime = Date.now();
        const { requestFn, resolve, reject, retries } = this.queue.shift();

        try {
            const result = await requestFn();
            resolve(result);
        } catch (error) {
            if (error.response?.status === 429 && retries < this.maxRetries) {
                // 计算递增的重试延迟时间
                const retryDelay = this.baseRetryDelay * Math.pow(2, retries);
                console.log(`请求被限制，${retryDelay}ms 后重试...`);
                
                setTimeout(() => {
                    this.queue.push({ requestFn, resolve, reject, retries: retries + 1 });
                    this.running--;
                    this.processQueue();
                }, retryDelay);
                return;
            }
            reject(error);
        }

        this.running--;
        // 最大安全频率：1秒间隔后处理下一个请求
        setTimeout(() => this.processQueue(), this.minInterval);
    }
}

// 创建请求队列实例
const requestQueue = new RequestQueue(5);

// 带重试和队列管理的fetch函数
export async function fetchWithRetry(url, options = {}) {
    return requestQueue.add(async () => {
        let lastError;
        for (let retryCount = 0; retryCount <= requestQueue.maxRetries; retryCount++) {
            try {
                const response = await fetch(url, options);
                
                if (response.status === 404) {
                    return null;
                }
                
                if (!response.ok) {
                    throw new Error(`HTTP error! status: ${response.status}`);
                }
                
                return response.json();
            } catch (error) {
                lastError = error;
                if (retryCount < requestQueue.maxRetries) {
                    const retryDelay = requestQueue.baseRetryDelay * Math.pow(2, retryCount);
                    console.log(`请求失败，${retryDelay}ms 后进行第 ${retryCount + 1} 次重试...`);
                    await new Promise(resolve => setTimeout(resolve, retryDelay));
                }
            }
        }
        throw lastError;
    });
}