import csv
import os
import requests
from urllib.parse import urlparse
import time

def download_avatars():
    # 创建头像存储目录
    avatars_dir = 'static/avatars'
    if not os.path.exists(avatars_dir):
        os.makedirs(avatars_dir)
    
    # 读取演员CSV文件
    with open('演员.csv', 'r', encoding='utf-8') as file:
        reader = csv.DictReader(file)
        
        for i, row in enumerate(reader):
            name = row['姓名']
            code = row['代码']
            avatar_url = row['头像']
            
            if not avatar_url or not avatar_url.startswith('http'):
                print(f"跳过 {name}: 无效的头像URL")
                continue
            
            # 获取文件扩展名
            parsed_url = urlparse(avatar_url)
            file_ext = os.path.splitext(parsed_url.path)[1] or '.jpg'
            
            # 本地文件路径
            local_filename = f"{code}{file_ext}"
            local_path = os.path.join(avatars_dir, local_filename)
            
            # 如果文件已存在，跳过
            if os.path.exists(local_path):
                print(f"已存在 {name} ({code})")
                continue
            
            try:
                print(f"下载 {name} ({code})...")
                
                # 下载头像
                headers = {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                    'Accept': 'image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
                    'Accept-Language': 'en-US,en;q=0.9,zh-CN;q=0.8,zh;q=0.7',
                    'Accept-Encoding': 'gzip, deflate, br',
                    'Referer': 'https://www.javbus.com/',
                    'Connection': 'keep-alive',
                    'Upgrade-Insecure-Requests': '1'
                }
                
                session = requests.Session()
                session.headers.update(headers)
                
                response = session.get(avatar_url, timeout=15)
                response.raise_for_status()
                
                # 保存文件
                with open(local_path, 'wb') as f:
                    f.write(response.content)
                
                print(f"✓ 成功下载 {name}")
                
                # 添加延迟避免请求过快
                time.sleep(0.5)
                
            except Exception as e:
                print(f"✗ 下载失败 {name}: {str(e)}")
                continue
    
    print("\n头像下载完成！")

if __name__ == "__main__":
    download_avatars()