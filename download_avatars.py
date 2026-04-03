import csv
import os
import requests
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry
from urllib.parse import urlparse
import time
import random

def download_avatars():
    # 创建头像存储目录
    avatars_dir = 'static/avatars'
    if not os.path.exists(avatars_dir):
        os.makedirs(avatars_dir)

    # 复用同一个 Session（保持连接池 & cookies）
    session = requests.Session()
    session.headers.update({
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
        'Accept': 'image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9,zh-CN;q=0.8,zh;q=0.7',
        'Accept-Encoding': 'gzip, deflate, br',
        'Referer': 'https://www.javbus.com/',
        'Connection': 'keep-alive',
    })

    # 自动重试策略：遇到 500/502/503/504 或连接错误时最多重试 3 次
    retry_strategy = Retry(
        total=3,
        backoff_factor=2,            # 等待 2s, 4s, 8s
        status_forcelist=[500, 502, 503, 504],
        allowed_methods=["GET"],
    )
    adapter = HTTPAdapter(max_retries=retry_strategy)
    session.mount("https://", adapter)
    session.mount("http://", adapter)

    success_count = 0
    fail_count = 0
    skip_count = 0

    # 读取演员CSV文件
    with open('演员.csv', 'r', encoding='utf-8') as file:
        reader = csv.DictReader(file)

        for i, row in enumerate(reader):
            name = row['姓名']
            code = row['代码']
            avatar_url = row['头像']

            if not avatar_url or not avatar_url.startswith('http'):
                skip_count += 1
                continue

            # 获取文件扩展名
            parsed_url = urlparse(avatar_url)
            file_ext = os.path.splitext(parsed_url.path)[1] or '.jpg'

            # 本地文件路径
            local_filename = f"{code}{file_ext}"
            local_path = os.path.join(avatars_dir, local_filename)

            # 如果文件已存在，跳过
            if os.path.exists(local_path):
                skip_count += 1
                continue

            try:
                print(f"[{i+1}] 下载 {name} ({code})...")
                response = session.get(avatar_url, timeout=20)
                response.raise_for_status()

                # 保存文件
                with open(local_path, 'wb') as f:
                    f.write(response.content)

                success_count += 1
                print(f"  ✓ 成功下载 {name}")

            except requests.exceptions.HTTPError as e:
                fail_count += 1
                status = e.response.status_code if e.response is not None else '?'
                print(f"  ✗ HTTP {status} - {name}")

            except Exception as e:
                fail_count += 1
                print(f"  ✗ 下载失败 {name}: {e}")

            # 随机延迟 1~3 秒，降低被反爬封锁的风险
            time.sleep(random.uniform(0.5, 1.5))

    print(f"\n===== 下载完成 =====")
    print(f"成功: {success_count}  |  失败: {fail_count}  |  跳过: {skip_count}")

if __name__ == "__main__":
    download_avatars()