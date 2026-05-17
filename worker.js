export default {
  async fetch(request, env, ctx) {
    // 彻底砍掉后端代理 API，Worker 只负责提供纯前端搜索控制台页面
    return new Response(getDirectEngineUI(), {
      headers: { "Content-Type": "text/html;charset=UTF-8" }
    });
  }
};

// ======================== 纯前端直连、解析、无代理的搜索引擎 UI ========================
function getDirectEngineUI() {
  return `
  <!DOCTYPE html>
  <html lang="zh-CN">
  <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>混合搜索 - 浏览器直跨纯净版</title>
      <style>
          body { font-family: Arial, sans-serif; margin: 0; padding: 0; background: #fff; color: #202124; }
          
          /* 传统搜索引擎标准头部大栏 */
          .search-header { display: flex; align-items: center; padding: 20px 40px 15px 40px; border-bottom: 1px solid #f1f3f4; background: #fff; position: sticky; top: 0; z-index: 100; gap: 30px; }
          .logo { font-size: 24px; font-weight: bold; color: #4285f4; text-decoration: none; white-space: nowrap; }
          .logo span { color: #ea4335; }
          .search-input-wrap { display: flex; flex: 1; max-width: 650px; border: 1px solid #dfe1e5; box-shadow: 0 1px 6px rgba(32,33,36,0.1); border-radius: 24px; padding: 4px 8px 4px 20px; background: #fff; }
          .search-input-wrap:hover { box-shadow: 0 1px 6px rgba(32,33,36,0.2); }
          input[type="text"] { flex: 1; border: none; font-size: 16px; outline: none; background: transparent; }
          .search-btn { background: none; border: none; cursor: pointer; padding: 0 10px; color: #4285f4; font-size: 16px; font-weight: bold; }
          
          /* 引擎切换 Tabs 页签 */
          .nav-tabs { display: flex; padding: 0 40px 12px 145px; border-bottom: 1px solid #f1f3f4; gap: 24px; font-size: 14px; color: #5f6368; background: #fff; }
          .nav-tabs label { display: flex; align-items: center; gap: 4px; cursor: pointer; padding-bottom: 6px; border-bottom: 3px solid transparent; }
          .nav-tabs input[type="radio"] { display: none; }
          .nav-tabs label:has(input:checked) { color: #1a73e8; border-bottom-color: #1a73e8; font-weight: bold; }

          /* 主体经典搜索视窗布局（严格限制在舒适的 650px 宽度内） */
          .results-container { padding: 25px 40px 40px 145px; max-width: 650px; }
          .status-info { display: none; font-size: 14px; color: #70757a; margin-bottom: 20px; }
          
          /* 传统的搜索条目 */
          .item { margin-bottom: 26px; font-size: 14px; line-height: 1.54; word-wrap: break-word; }
          .item-meta { display: flex; align-items: center; gap: 8px; font-size: 12px; margin-bottom: 2px; }
          .source-badge { background: #f1f3f4; color: #5f6368; padding: 1px 5px; border-radius: 4px; font-weight: bold; font-size: 11px; }
          .item-link { color: #202124; text-decoration: none; max-width: 450px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
          .item-title { font-size: 19px; color: #1a0dab; text-decoration: none; display: inline-block; margin-bottom: 4px; font-weight: 400; }
          .item-title:hover { text-decoration: underline; }
          .item-snippet { color: #4d5156; text-align: justify; }

          /* 移动端简单自适应 */
          @media (max-width: 768px) {
              .search-header { padding: 12px 15px; flex-direction: column; align-items: stretch; gap: 8px; }
              .nav-tabs { padding: 8px 15px; overflow-x: auto; white-space: nowrap; }
              .results-container { padding: 15px; }
              .item-title { font-size: 17px; }
          }
      </style>
  </head>
  <body>

      <div class="search-header">
          <a class="logo" href="/">混合<span>搜索</span></a>
          <div class="search-input-wrap">
              <input type="text" id="keyword-field" placeholder="直接从本地跨域检索全网..." value="测试">
              <button class="search-btn" onclick="executeDirectSearch()">搜索</button>
          </div>
      </div>

      <div class="nav-tabs">
          <label><input type="radio" name="engine" value="mixed" checked>🌀 混合全量聚合</label>
          <label><input type="radio" name="engine" value="bing">必应原网</label>
          <label><input type="radio" name="engine" value="baidu">百度原网</label>
          <label><input type="radio" name="engine" value="so">360搜索</label>
          <label><input type="radio" name="engine" value="sogou">搜狗搜索</label>
          <label><input type="radio" name="engine" value="sm">神马搜索</label>
      </div>

      <div class="results-container">
          <div id="status-bar" class="status-info">正在直接利用本地跨域链路抓取源 HTML...</div>
          <div id="output-box"></div>
      </div>

      <script>
          // 浏览器前端直连并发抓取逻辑
          async function executeDirectSearch() {
              const q = document.getElementById('keyword-field').value.trim();
              if(!q) return;

              const activeEngine = document.querySelector('input[name="engine"]:checked').value;
              const statusBar = document.getElementById('status-bar');
              const outputBox = document.getElementById('output-box');
              
              statusBar.style.display = 'block';
              outputBox.innerHTML = '';

              const encoded = encodeURIComponent(q);
              
              // 构造各家搜索引擎的真实目标 HTML 地址
              const targets = {
                  bing: { name: "必应", url: \`https://cn.bing.com/search?q=\${encoded}\`, parser: parseBingFront },
                  baidu: { name: "百度", url: \`https://m.baidu.com/s?word=\${encoded}\`, parser: parseBaiduFront },
                  so: { name: "360", url: \`https://m.so.com/s?q=\${encoded}\`, parser: parse360Front },
                  sogou: { name: "搜狗", url: \`https://wap.sogou.com/web/sl?keyword=\${encoded}\`, parser: parseSogouFront },
                  sm: { name: "神马", url: \`https://m.sm.cn/s?q=\${encoded}\`, parser: parseSMFront }
              };

              let tasks = [];
              if (activeEngine === 'mixed') {
                  tasks = Object.values(targets);
              } else {
                  tasks = [targets[activeEngine]];
              }

              statusBar.innerText = \`正在由本地直接发出 \${tasks.length} 路网络流请求...\`;

              // 并发直接请求，完全不走后台代理中转
              const promises = tasks.map(async (cfg) => {
                  try {
                      const response = await fetch(cfg.url, {
                          method: 'GET',
                          mode: 'cors' // 依赖本地跨域环境(如Via脚本/CORS插件/扩展环境)直连
                      });
                      const htmlText = await response.text();
                      
                      // 纯前端高级 DOMParser 树解析
                      const parser = new DOMParser();
                      const doc = parser.parseFromString(htmlText, 'text/html');
                      return cfg.parser(doc);
                  } catch (err) {
                      console.error(\`[\${cfg.name}] 直连获取失败，请确保前端跨域权限已放开:\`, err);
                      return [];
                  }
              });

              const allRouteResults = await Promise.all(promises);
              statusBar.style.display = 'none';

              // 扁平化铺平所有结果流
              const finalItems = allRouteResults.flat();

              if (finalItems.length === 0) {
                  outputBox.innerHTML = \`<div style="color:#70757a; font-size:14px; line-height: 1.8;">
                      未加载到任何原网数据。<br>
                      💡 <b>排查提示：</b>由于您要求“不走后端代理直连跨域”，请确认您的浏览器（如 Via、网络调试工具等）已经赋予了当前页面跨域请求（CORS）的权限。
                  </div>\`;
                  return;
              }

              // 页面回归最纯正、不变形的经典排版（无去重干扰，拉回多少就无损吐出多少）
              outputBox.innerHTML = finalItems.map(node => \`
                  <div class="item">
                      <div class="item-meta">
                          <span class="source-badge">\${node.source}</span>
                          <span class="item-link">\${node.url}</span>
                      </div>
                      <a class="item-title" href="\${node.url}" target="_blank">\${node.title}</a>
                      <div class="item-snippet">\${node.snippet}</div>
                  </div>
              \`).join('');
          }

          // ======================== 前端高效 DOM 节点提取器 ========================

          function parseBingFront(doc) {
              const list = [];
              doc.querySelectorAll('li.b_algo').forEach(el => {
                  const a = el.querySelector('h2 a');
                  const p = el.querySelector('.b_caption p') || el.querySelector('.b_algo_text') || el.querySelector('p');
                  if (a) {
                      list.push({
                          source: "必应",
                          title: a.textContent.trim(),
                          url: a.getAttribute('href'),
                          snippet: p ? p.textContent.trim() : "点击直接阅览目标原网快照..."
                      });
                  }
              });
              return list;
          }

          function parseBaiduFront(doc) {
              const list = [];
              doc.querySelectorAll('.c-result-content, article').forEach(el => {
                  const a = el.querySelector('h3 a') || el.querySelector('a');
                  const s = el.querySelector('.c-color-gray') || el.querySelector('.c-abstract') || el;
                  if (a && a.textContent.trim()) {
                      let url = a.getAttribute('href') || '';
                      if (url && !url.startsWith('http')) url = 'https://m.baidu.com' + url;
                      list.push({
                          source: "百度",
                          title: a.textContent.trim(),
                          url: url,
                          snippet: s ? s.textContent.replace(a.textContent, '').trim().substring(0, 120) + '...' : '打开网页直接查阅详情。'
                      });
                  }
              });
              return list;
          }

          function parse360Front(doc) {
              const list = [];
              doc.querySelectorAll('li.res-list').forEach(el => {
                  const a = el.querySelector('h3 a');
                  const d = el.querySelector('.res-desc') || el.querySelector('.desc');
                  if (a) {
                      list.push({
                          source: "360",
                          title: a.textContent.trim(),
                          url: a.getAttribute('href'),
                          snippet: d ? d.textContent.trim() : "进入目标站查阅详细内容。"
                      });
                  }
              });
              return list;
          }

          function parseSogouFront(doc) {
              const list = [];
              doc.querySelectorAll('.vr-wrapper, .results, section').forEach(el => {
                  const a = el.querySelector('h3 a') || el.querySelector('a.title');
                  const s = el.querySelector('.summary') || el.querySelector('.abstract') || el.querySelector('p');
                  if (a) {
                      let url = a.getAttribute('href') || '';
                      if (url && !url.startsWith('http')) url = 'https://wap.sogou.com' + url;
                      list.push({
                          source: "搜狗",
                          title: a.textContent.trim(),
                          url: url,
                          snippet: s ? s.textContent.trim() : "多源头聚合无跳转展示。"
                      });
                  }
              });
              return list;
          }

          function parseSMFront(doc) {
              const list = [];
              doc.querySelectorAll('.card, .sc-card').forEach(el => {
                  const a = el.querySelector('.card-title a') || el.querySelector('h3 a') || el.querySelector('a');
                  const s = el.querySelector('.card-abstract') || el.querySelector('.sc-content');
                  if (a && a.textContent.trim()) {
                      let url = a.getAttribute('href') || '';
                      if (url && !url.startsWith('http')) url = 'https://m.sm.cn' + url;
                      list.push({
                          source: "神马",
                          title: a.textContent.trim(),
                          url: url,
                          snippet: s ? s.textContent.trim() : "神马原网干净推荐数据。"
                      });
                  }
              });
              return list;
          }

          // 绑定回车键响应
          document.getElementById('keyword-field').addEventListener('keypress', (e) => { if (e.key === 'Enter') executeDirectSearch(); });
          // 页签变动自动刷新
          document.querySelectorAll('input[name="engine"]').forEach(r => r.addEventListener('change', () => executeDirectSearch()));
          
          // 首屏初始化默认直接触发
          window.onload = () => { executeDirectSearch(); };
      </script>
  </body>
  </html>
  `;
}