// ==UserScript==
// @name         [全网通用] Universal LaTeX Finder (Resizable)
// @namespace    http://tampermonkey.net/
// @version      3.3
// @description  探测任意网页上的数学公式，支持拖拽、缩放、复制和定位
// @author       You
// @match        *://*/*
// @grant        GM_setClipboard
// @grant        GM_addStyle
// ==/UserScript==

(function() {
    'use strict';

    // ===========================
    // 1. UI 样式
    // ===========================
    GM_addStyle(`
        /* 探测悬浮球 */
        #univ-tex-btn {
            position: fixed;
            bottom: 30px;
            right: 30px;
            width: 45px;
            height: 45px;
            background: #673AB7;
            color: white;
            border-radius: 50%;
            box-shadow: 0 4px 12px rgba(0,0,0,0.3);
            cursor: pointer;
            z-index: 2147483647;
            font-size: 20px;
            display: flex;
            align-items: center;
            justify-content: center;
            transition: transform 0.2s, width 0.3s;
            user-select: none;
            overflow: hidden;
            white-space: nowrap;
        }
        #univ-tex-btn:hover {
            width: 130px;
            border-radius: 30px;
            background: #5E35B1;
        }
        #univ-tex-btn:hover::after {
            content: " 探测公式";
            font-size: 14px;
            margin-left: 8px;
        }

        /* 结果面板 */
        #univ-tex-panel {
            position: fixed;
            top: 10%;
            left: 50%;
            transform: translateX(-50%); /* 初始居中 */
            width: 600px;
            height: 60vh;
            min-width: 300px;  /* 最小宽度 */
            min-height: 200px; /* 最小高度 */
            background: white;
            border-radius: 8px;
            box-shadow: 0 15px 50px rgba(0,0,0,0.3);
            z-index: 2147483647;
            display: none;
            flex-direction: column;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif;
            border: 1px solid #ddd;
            /* 关键：允许通过 CSS resize 属性调整，但为了更好的体验我们用 JS 实现 */
        }

        /* 标题栏 */
        .tex-panel-head {
            padding: 12px 15px;
            background: #f5f5f5;
            border-bottom: 1px solid #ddd;
            display: flex;
            justify-content: space-between;
            align-items: center;
            border-radius: 8px 8px 0 0;
            cursor: move;
            user-select: none;
            flex-shrink: 0; /* 防止标题栏被压缩 */
        }
        .tex-panel-head h3 { margin: 0; font-size: 16px; color: #333; pointer-events: none; }

        /* 内容区域 */
        .tex-panel-body {
            flex: 1;
            overflow-y: auto;
            padding: 10px;
            background: #fafafa;
        }
        
        /* 缩放手柄 (右下角) */
        .tex-resize-handle {
            position: absolute;
            bottom: 0;
            right: 0;
            width: 15px;
            height: 15px;
            cursor: se-resize; /* 对角线光标 */
            background: linear-gradient(135deg, transparent 50%, #ccc 50%); /* 绘制三角形条纹 */
            border-radius: 0 0 8px 0;
            z-index: 10;
        }

        /* 单个公式项 */
        .tex-item {
            background: #fff;
            margin-bottom: 10px;
            border: 1px solid #eee;
            border-radius: 6px;
            display: flex;
            flex-direction: column;
            transition: all 0.2s;
            position: relative;
        }
        .tex-item:hover {
            border-color: #2196F3;
            box-shadow: 0 2px 8px rgba(0,0,0,0.08);
        }

        .tex-content-area {
            padding: 12px;
            cursor: pointer;
            width: 100%;
            box-sizing: border-box;
        }
        .tex-content-area:hover { background-color: #f0f7ff; }

        .tex-action-bar {
            border-top: 1px solid #eee;
            padding: 5px 10px;
            display: flex;
            justify-content: space-between;
            align-items: center;
            background: #fff;
            border-radius: 0 0 6px 6px;
        }

        .tex-tag {
            padding: 2px 6px;
            border-radius: 3px;
            font-size: 10px;
            color: white;
            font-weight: bold;
        }
        
        .item-btn {
            background: none;
            border: none;
            cursor: pointer;
            font-size: 12px;
            color: #666;
            padding: 4px 8px;
            border-radius: 4px;
            display: flex;
            align-items: center;
            gap: 4px;
        }
        .item-btn:hover { background: #eee; color: #333; }
        .btn-locate { color: #E91E63; }
        .btn-locate:hover { background: #FCE4EC; }

        .tex-panel-foot {
            padding: 12px;
            border-top: 1px solid #ddd;
            display: flex;
            justify-content: flex-end;
            gap: 10px;
            background: white;
            border-radius: 0 0 8px 8px;
            flex-shrink: 0; /* 防止底部按钮被压缩 */
            margin-right: 10px; /* 给 resize handle 留点位置 */
        }
        
        .u-btn { padding: 8px 16px; border:none; border-radius:4px; cursor:pointer; font-weight:bold; font-size: 13px; }
        .u-close { background:#f0f0f0; color:#333; }
        .u-copy-all { background:#673AB7; color:white; }
        
        .code-text {
            font-family: Consolas, Monaco, monospace;
            font-size: 13px;
            word-break: break-all;
            line-height: 1.4;
            color: #333;
        }

        @keyframes target-blink {
            0% { background-color: rgba(255, 235, 59, 0.8); box-shadow: 0 0 15px rgba(255, 235, 59, 0.8); transform: scale(1.05); }
            100% { background-color: transparent; box-shadow: none; transform: scale(1); }
        }
        .tex-highlight-target { animation: target-blink 2s ease-out; border-radius: 4px; }
    `);

    // ===========================
    // 2. 核心探测逻辑
    // ===========================
    function detectMath() {
        const results = [];
        const seen = new Set();
        const add = (source, type, element) => {
            if (!source) return;
            source = source.trim();
            if (seen.has(source) || source.length < 2) return;
            seen.add(source);
            results.push({ source, type, element });
        };

        // KaTeX
        document.querySelectorAll('.katex').forEach(wrapper => {
            const annotation = wrapper.querySelector('annotation[encoding="application/x-tex"]');
            if (annotation) add(annotation.textContent, 'KaTeX', wrapper);
        });
        // MathJax 2
        document.querySelectorAll('script[type^="math/tex"]').forEach(script => {
            add(script.textContent, 'MathJax2', script.parentElement);
        });
        // MathJax 3 / Aria
        document.querySelectorAll('mjx-container, [role="math"]').forEach(el => {
            const label = el.getAttribute('aria-label');
            if (label) add(label, 'MathJax3', el);
            else if (el.dataset.latex) add(el.dataset.latex, 'Data-Attr', el);
        });
        // Images
        document.querySelectorAll('img').forEach(img => {
            const alt = img.alt || "";
            if ((img.className && img.className.toString().includes('math')) || img.src.includes('latex') || (alt.includes('\\') && alt.length > 5)) {
                add(alt, 'Image', img);
            }
        });
        return results;
    }

    function scrollToElement(el) {
        if (!el) return;
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        el.classList.add('tex-highlight-target');
        setTimeout(() => { el.classList.remove('tex-highlight-target'); }, 2000);
    }

    // ===========================
    // 3. 拖拽与缩放逻辑 (核心更新)
    // ===========================
    
    // 拖拽窗口 (Head)
    function makeDraggable(el, handle) {
        let isDragging = false;
        let startX, startY, initialLeft, initialTop;

        handle.addEventListener('mousedown', (e) => {
            if (e.target.tagName === 'BUTTON') return;
            isDragging = true;
            startX = e.clientX;
            startY = e.clientY;
            const rect = el.getBoundingClientRect();
            initialLeft = rect.left;
            initialTop = rect.top;
            
            // 转换为绝对定位
            el.style.transform = 'none'; 
            el.style.left = initialLeft + 'px';
            el.style.top = initialTop + 'px';
            el.style.margin = '0';
            
            document.body.style.cursor = 'move';
            document.addEventListener('mousemove', onMouseMove);
            document.addEventListener('mouseup', onMouseUp);
        });

        function onMouseMove(e) {
            if (!isDragging) return;
            e.preventDefault();
            const dx = e.clientX - startX;
            const dy = e.clientY - startY;
            el.style.left = (initialLeft + dx) + 'px';
            el.style.top = (initialTop + dy) + 'px';
        }

        function onMouseUp() {
            isDragging = false;
            document.body.style.cursor = 'default';
            document.removeEventListener('mousemove', onMouseMove);
            document.removeEventListener('mouseup', onMouseUp);
        }
    }

    // 缩放窗口 (Resize Handle)
    function makeResizable(el, handle) {
        let isResizing = false;
        let startX, startY, startWidth, startHeight;

        handle.addEventListener('mousedown', (e) => {
            e.preventDefault();
            e.stopPropagation(); // 防止触发拖拽
            isResizing = true;
            startX = e.clientX;
            startY = e.clientY;
            
            // 获取当前计算后的宽高
            const rect = el.getBoundingClientRect();
            startWidth = rect.width;
            startHeight = rect.height;

            document.body.style.cursor = 'se-resize';
            document.addEventListener('mousemove', onMouseMove);
            document.addEventListener('mouseup', onMouseUp);
        });

        function onMouseMove(e) {
            if (!isResizing) return;
            // 计算新的宽高
            const dx = e.clientX - startX;
            const dy = e.clientY - startY;
            
            // 简单的限制：最小 300x200
            const newWidth = Math.max(300, startWidth + dx);
            const newHeight = Math.max(200, startHeight + dy);

            el.style.width = newWidth + 'px';
            el.style.height = newHeight + 'px';
        }

        function onMouseUp() {
            isResizing = false;
            document.body.style.cursor = 'default';
            document.removeEventListener('mousemove', onMouseMove);
            document.removeEventListener('mouseup', onMouseUp);
        }
    }

    // ===========================
    // 4. UI 构建
    // ===========================
    const btn = document.createElement('div');
    btn.id = 'univ-tex-btn';
    btn.innerHTML = '∑';
    btn.title = '探测公式';
    document.body.appendChild(btn);

    const panel = document.createElement('div');
    panel.id = 'univ-tex-panel';
    panel.innerHTML = `
        <div class="tex-panel-head">
            <h3>页面公式 (<span id="tex-count">0</span>)</h3>
            <button class="u-btn u-close" id="tex-head-close" style="padding:4px 8px; font-size:12px;">✕</button>
        </div>
        <div class="tex-panel-body" id="tex-p-body"></div>
        <div class="tex-panel-foot">
            <button class="u-btn u-close" id="tex-p-cancel">关闭</button>
            <button class="u-btn u-copy-all" id="tex-p-copy">复制全部</button>
        </div>
        <div class="tex-resize-handle"></div>
    `;
    document.body.appendChild(panel);

    // 绑定交互
    makeDraggable(panel, panel.querySelector('.tex-panel-head'));
    makeResizable(panel, panel.querySelector('.tex-resize-handle'));

    function renderList(list) {
        const body = document.getElementById('tex-p-body');
        document.getElementById('tex-count').textContent = list.length;
        body.innerHTML = '';
        
        if (list.length === 0) {
            body.innerHTML = `<div style="text-align:center; padding:40px; color:#999;">未探测到公式</div>`;
            return;
        }

        list.forEach(item => {
            const itemDiv = document.createElement('div');
            itemDiv.className = 'tex-item';
            let color = item.type === 'KaTeX' ? '#4caf50' : (item.type.includes('MathJax') ? '#2196f3' : '#ff9800');

            itemDiv.innerHTML = `
                <div class="tex-content-area" title="点击复制 LaTeX">
                    <div class="code-text">${escapeHtml(item.source)}</div>
                </div>
                <div class="tex-action-bar">
                    <span class="tex-tag" style="background:${color}">${item.type}</span>
                    <div style="display:flex; gap:10px;">
                        <button class="item-btn btn-locate">📍 定位</button>
                        <button class="item-btn btn-copy-one">📋 复制</button>
                    </div>
                </div>
            `;
            
            const copyAction = (e) => {
                e.stopPropagation();
                GM_setClipboard(item.source);
                showToast('已复制');
                itemDiv.querySelector('.tex-content-area').style.background = '#e8f5e9';
                setTimeout(() => itemDiv.querySelector('.tex-content-area').style.background = '', 300);
            };
            
            itemDiv.querySelector('.tex-content-area').addEventListener('click', copyAction);
            itemDiv.querySelector('.btn-copy-one').addEventListener('click', copyAction);

            itemDiv.querySelector('.btn-locate').addEventListener('click', (e) => {
                e.stopPropagation();
                if (item.element) {
                    scrollToElement(item.element);
                    showToast('已定位');
                } else {
                    showToast('无法定位原元素');
                }
            });

            body.appendChild(itemDiv);
        });
    }

    // ===========================
    // 5. 事件绑定
    // ===========================
    btn.addEventListener('click', () => {
        const results = detectMath();
        renderList(results);
        panel.style.display = 'flex';
    });

    const closeFunc = () => { panel.style.display = 'none'; };
    document.getElementById('tex-head-close').addEventListener('click', closeFunc);
    document.getElementById('tex-p-cancel').addEventListener('click', closeFunc);
    document.getElementById('tex-p-copy').addEventListener('click', () => {
        const text = detectMath().map(r => r.source).join('\n\n');
        if (text) { GM_setClipboard(text); showToast('全部已复制'); }
    });

    function escapeHtml(text) {
        return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    }

    function showToast(msg) {
        let t = document.getElementById('u-toast');
        if (!t) {
            t = document.createElement('div');
            t.id = 'u-toast';
            t.style.cssText = 'position:fixed; top:20px; left:50%; transform:translateX(-50%); background:rgba(0,0,0,0.8); color:white; padding:8px 16px; border-radius:20px; z-index:2147483647; font-size:13px; transition:opacity 0.3s; pointer-events:none;';
            document.body.appendChild(t);
        }
        t.textContent = msg;
        t.style.opacity = '1';
        setTimeout(() => { t.style.opacity = '0'; }, 2000);
    }

})();