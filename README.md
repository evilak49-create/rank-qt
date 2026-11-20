# 评级网 Vue 手机端

## 本地开发

```sh
npm ci
npm run dev
```

Vite 默认将 `/api/v1/` 转发至 `https://ht.1234.fund`。连接本地 Laravel 时，在本目录创建 `.env.local`，设置 `API_UPSTREAM=http://127.0.0.1:8000` 后重启 Vite。页面使用 Laravel 公开接口读取横幅、公告、平台、评价、保障条款、帮助、商城和客服。会员登录、退出与会话恢复使用 Laravel 的 Cookie 和 CSRF 流程。若旧版后台尚未提供 `/auth/csrf-cookie`，前端会通过同样发放 CSRF Cookie 的 `/health` 初始化会话。

## 独立部署

本地预览生产构建时，依次执行 `npm run build` 和 `npm run preview`，打开终端显示的本地地址。预览服务器也会代理 `/api/v1/`。

业务页面使用哈希路由，直接访问 `/#/platforms`、`/#/shop`、`/#/help` 或 `/#/member` 可打开对应页面。浏览器刷新时保留当前路由，静态服务器无需为业务路由做回退重写。涉及会员的页面登录后返回原业务入口。

打开本地预览的 `/concepts.html` 对比 20 款手机版首页。点击任意方案可打开完整预览，地址栏里的片段可直接定位到该方案，例如 `/concepts.html#sunrise`。

执行 `npm ci` 和 `npm run build`，将 `dist/` 部署到前台域名的 HTTPS 站点。前台站点的反向代理负责转发同源 `/api/v1/` 请求。以下是 Nginx 前台 HTTPS 虚拟主机的配置片段：

```nginx
root /var/www/cash-club/dist;
index index.html;

location / {
    try_files $uri $uri/ =404;
}

location ^~ /api/v1/ {
    proxy_pass https://ht.1234.fund;
    proxy_http_version 1.1;
    proxy_ssl_server_name on;
    proxy_ssl_verify on;
    proxy_ssl_trusted_certificate /etc/ssl/certs/ca-certificates.crt;
    proxy_set_header Host ht.1234.fund;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_cache off;
}
```

按服务器系统调整 CA 证书路径。Laravel 生产环境使用 `SESSION_DOMAIN=null` 和 `SESSION_SECURE_COOKIE=true`。如果线上响应已经写入了后台域名的 Cookie Domain，需要让后端使用 host-only Cookie，或在前台代理按实际域名配置 Cookie Domain 改写。CDN 对 `/api/v1/` 禁用缓存与注入验证页面。部署后检查前台域名下的 `/api/v1/health`，再验证带 Cookie 的登录、刷新和退出流程。
