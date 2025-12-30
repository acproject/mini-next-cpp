## 部署

### 基于ECS上的部署发方法

假设这里用的是阿里云，你需要先把证书放在机器上，然后运行下面的命令：

```sh
sudo DOMAIN=www.yourdomain.com \
  CERT_PEM=/path/to/www.yourdomain.com.pem \
  CERT_KEY=/path/to/www.yourdomain.com.key \
  UPSTREAM_HOST=127.0.0.1 \
  UPSTREAM_PORT=3000 \
  bash ./deploy-nginx-ubuntu.sh
```
接下来脚本会帮你把nginx安装和配置，完成配置，如果你有其他需要，可以自行修改。