// ==UserScript==
// @name         [Apple UI] Universal LaTeX Finder
// @namespace    http://tampermonkey.net/
// @version      4.0
// @description  探测网页公式，采用 macOS 风格毛玻璃UI，支持丝滑动画、拖拽与缩放
// @author       Apple UI Expert
// @match        *://*/*
// @grant        GM_setClipboard
// @grant        GM_addStyle
// ==/UserScript==

(function() {
    'use strict';

    // ===========================
    // 1. Apple Style UI 系统
    // ===========================
    // 定义核心动画曲线 (Apple Ease-Out)
    const BEZIER_EASE = 'cubic-bezier(0.19, 1, 0.22, 1)'; 
    const SPRING_BOUNCE = 'cubic-bezier(0.34, 1.56, 0.64, 1)';

    GM_addStyle(`
        /* ----------------------------------
           全局字体与重置
           ---------------------------------- */
        .apple-tex-root {
            font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
            -webkit-font-smoothing: antialiased;
            letter-spacing: -0.01em;
            box-sizing: border-box;
        }

        /* ----------------------------------
           悬浮球 (Floating Button)
           ---------------------------------- */
        #univ-tex-btn {
            position: fixed;
            bottom: 30px;
            right: 30px;
            width: 48px;
            height: 48px;
            /* iOS 风格渐变 */
            background: linear-gradient(135deg, #5E5CE6, #3634A3);
            color: rgba(255,255,255,0.95);
            border-radius: 50%;
            /* 深度阴影 */
            box-shadow: 0 8px 24px rgba(54, 52, 163, 0.35), 0 2px 8px rgba(0,0,0,0.1);
            cursor: pointer;
            z-index: 2147483647;
            font-size: 22px;
            font-weight: 500;
            display: flex;
            align-items: center;
            justify-content: center;
            /* 弹性动画 */
            transition: all 0.6s ${SPRING_BOUNCE}, background 0.3s ease;
            user-select: none;
            overflow: hidden;
            backdrop-filter: blur(10px);
            border: 1px solid rgba(255,255,255,0.1);
        }

        #univ-tex-btn:hover {
            transform: scale(1.08) translateY(-2px);
            box-shadow: 0 12px 32px rgba(54, 52, 163, 0.45);
            width: 140px;
            border-radius: 24px; /*由圆变长胶囊*/
        }
        
        #univ-tex-btn::after {
            content: "探测公式";
            font-size: 15px;
            font-weight: 600;
            margin-left: 0;
            opacity: 0;
            width: 0;
            white-space: nowrap;
            transition: all 0.4s ${BEZIER_EASE};
            display: inline-block;
        }
        
        #univ-tex-btn:hover::after {
            opacity: 1;
            width: 60px;
            margin-left: 8px;
        }

        /* ----------------------------------
           主面板 (Glassmorphism Panel)
           ---------------------------------- */
        #univ-tex-panel {
            position: fixed;
            top: 15%;
            left: 50%;
            /* 初始状态通过 transform 居中 */
            transform: translateX(-50%) scale(0.95); 
            opacity: 0; /* 初始隐藏 */
            
            width: 620px;
            height: 65vh;
            min-width: 320px;
            min-height: 250px;
            
            /* 毛玻璃核心代码 */
            background: rgba(255, 255, 255, 0.75);
            backdrop-filter: saturate(180%) blur(25px);
            -webkit-backdrop-filter: saturate(180%) blur(25px);
            
            border: 1px solid rgba(255, 255, 255, 0.4);
            border-radius: 18px;
            /* 弥散阴影 */
            box-shadow: 
                0 20px 50px -12px rgba(0, 0, 0, 0.25),
                0 0 1px rgba(0,0,0,0.1);
            
            z-index: 2147483647;
            display: none;
            flex-direction: column;
            
            /* 打开时的动画 */
            transition: transform 0.5s ${BEZIER_EASE}, opacity 0.4s ease;
        }

        /* 面板显示时的类 */
        #univ-tex-panel.is-visible {
            opacity: 1;
            /* 注意：如果处于拖拽模式，transform 会被 JS 覆盖为 none */
            transform: translateX(-50%) scale(1); 
        }

        /* ----------------------------------
           标题栏 (Title Bar)
           ---------------------------------- */
        .tex-panel-head {
            height: 52px;
            padding: 0 16px;
            /* 极淡的分隔线 */
            border-bottom: 1px solid rgba(0, 0, 0, 0.05);
            display: flex;
            justify-content: space-between;
            align-items: center;
            cursor: default; /* 拖拽区域 */
            user-select: none;
        }
        
        .tex-title-group {
            display: flex;
            align-items: center;
            gap: 8px;
        }
        
        .tex-panel-head h3 {
            margin: 0;
            font-size: 15px;
            font-weight: 600;
            color: #1d1d1f; /* Apple Dark Grey */
        }
        
        .tex-badge {
            background: rgba(0,0,0,0.06);
            color: #666;
            padding: 2px 8px;
            border-radius: 12px;
            font-size: 12px;
            font-weight: 500;
        }

        /* macOS 风格关闭按钮 */
        .btn-icon-close {
            width: 28px;
            height: 28px;
            border-radius: 50%;
            border: none;
            background: rgba(0,0,0,0.05);
            color: #555;
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 14px;
            transition: all 0.2s ease;
        }
        .btn-icon-close:hover {
            background: rgba(0,0,0,0.1);
            color: #000;
        }

        /* ----------------------------------
           内容区域 (Content)
           ---------------------------------- */
        .tex-panel-body {
            flex: 1;
            overflow-y: auto;
            padding: 12px;
            /* 滚动条美化 */
            scrollbar-width: thin;
            scrollbar-color: rgba(0,0,0,0.2) transparent;
        }
        .tex-panel-body::-webkit-scrollbar {
            width: 6px;
        }
        .tex-panel-body::-webkit-scrollbar-thumb {
            background-color: rgba(0,0,0,0.15);
            border-radius: 3px;
        }

        /* ----------------------------------
           列表项 (List Items)
           ---------------------------------- */
        .tex-item {
            background: rgba(255, 255, 255, 0.5); /* 半透明白 */
            margin-bottom: 8px;
            border-radius: 12px;
            border: 1px solid rgba(0,0,0,0.03);
            display: flex;
            flex-direction: column;
            transition: all 0.3s ${BEZIER_EASE};
            position: relative;
            overflow: hidden;
        }
        
        .tex-item:hover {
            background: rgba(255, 255, 255, 0.9);
            box-shadow: 0 4px 12px rgba(0,0,0,0.05);
            transform: scale(1.005);
            border-color: rgba(0,0,0,0.08);
        }

        .tex-content-area {
            padding: 14px;
            cursor: pointer;
            width: 100%;
            box-sizing: border-box;
        }
        
        .code-text {
            font-family: "SF Mono", Consolas, Menlo, monospace;
            font-size: 13px;
            color: #333;
            line-height: 1.5;
            word-break: break-all;
        }

        /* 底部工具条 */
        .tex-action-bar {
            padding: 8px 14px;
            background: rgba(245, 245, 247, 0.5); /* 极淡的灰 */
            border-top: 1px solid rgba(0,0,0,0.03);
            display: flex;
            justify-content: space-between;
            align-items: center;
        }

        /* 标签 Tag */
        .tex-tag {
            font-size: 11px;
            font-weight: 600;
            padding: 3px 8px;
            border-radius: 6px;
            letter-spacing: 0.02em;
            text-transform: uppercase;
        }
        .tag-katex { color: #2E7D32; background: rgba(76, 175, 80, 0.15); }
        .tag-mathjax { color: #1565C0; background: rgba(33, 150, 243, 0.15); }
        .tag-img { color: #E65100; background: rgba(255, 152, 0, 0.15); }

        /* 按钮组 */
        .tex-btn-group {
            display: flex;
            gap: 8px;
        }
        
        .item-btn {
            border: none;
            background: transparent;
            font-size: 12px;
            font-weight: 500;
            padding: 4px 10px;
            border-radius: 6px;
            cursor: pointer;
            transition: background 0.2s;
            color: #555;
            display: flex;
            align-items: center;
            gap: 4px;
        }
        .item-btn:hover { background: rgba(0,0,0,0.06); color: #000; }
        
        .btn-locate { color: #007AFF; } /* Apple Blue */
        .btn-locate:hover { background: rgba(0, 122, 255, 0.1); }

        /* ----------------------------------
           底部与缩放 (Footer & Resize)
           ---------------------------------- */
        .tex-panel-foot {
            padding: 12px 16px;
            border-top: 1px solid rgba(0, 0, 0, 0.05);
            display: flex;
            justify-content: flex-end;
            gap: 12px;
            background: rgba(255,255,255,0.3);
            position: relative; /* for resize handle */
        }
        
        /* 通用按钮 Apple Style */
        .u-btn {
            padding: 8px 18px;
            border: none;
            border-radius: 8px;
            cursor: pointer;
            font-size: 13px;
            font-weight: 600;
            transition: all 0.2s ease;
        }
        .u-close {
            background: rgba(0,0,0,0.05);
            color: #333;
        }
        .u-close:hover { background: rgba(0,0,0,0.1); }
        
        .u-copy-all {
            background: #007AFF;
            color: white;
            box-shadow: 0 2px 10px rgba(0, 122, 255, 0.3);
        }
        .u-copy-all:hover {
            background: #006ce6;
            transform: translateY(-1px);
        }

        /* 隐形但易用的 Resize Handle */
        .tex-resize-handle {
            position: absolute;
            bottom: 0;
            right: 0;
            width: 20px;
            height: 20px;
            cursor: se-resize;
            z-index: 20;
        }
        /* 视觉上的 Resize 指示器 (两条小线) */
        .tex-resize-handle::after {
            content: "";
            position: absolute;
            bottom: 5px;
            right: 5px;
            width: 8px;
            height: 1px;
            background: #ccc;
            box-shadow: 0 -3px 0 #ccc;
            transform: rotate(-45deg);
        }

        /* ----------------------------------
           交互反馈动画
           ---------------------------------- */
        @keyframes apple-blink {
            0% { background-color: rgba(255, 235, 59, 0.6); box-shadow: 0 0 0 4px rgba(255, 235, 59, 0.3); }
            100% { background-color: transparent; box-shadow: 0 0 0 0 transparent; }
        }
        .tex-highlight-target {
            animation: apple-blink 1.5s cubic-bezier(0.25, 1, 0.5, 1);
            border-radius: 4px;
        }
        
        /* Toast 提示 */
        #apple-toast {
            position: fixed;
            top: 40px;
            left: 50%;
            transform: translateX(-50%) translateY(-20px);
            background: rgba(255,255,255,0.9);
            backdrop-filter: blur(20px) saturate(180%);
            color: #1d1d1f;
            padding: 10px 24px;
            border-radius: 30px;
            box-shadow: 0 10px 30px rgba(0,0,0,0.15);
            font-size: 14px;
            font-weight: 500;
            opacity: 0;
            pointer-events: none;
            transition: all 0.4s ${SPRING_BOUNCE};
            z-index: 2147483647;
            border: 1px solid rgba(0,0,0,0.05);
            display: flex;
            align-items: center;
            gap: 8px;
        }
        #apple-toast.show {
            opacity: 1;
            transform: translateX(-50%) translateY(0);
        }
    `);

    // ===========================
    // 2. 逻辑核心 (Detect & Utilities)
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
            add(script.textContent, 'MathJax', script.parentElement);
        });
        // MathJax 3 / Aria
        document.querySelectorAll('mjx-container, [role="math"]').forEach(el => {
            const label = el.getAttribute('aria-label');
            if (label) add(label, 'MathJax', el);
            else if (el.dataset.latex) add(el.dataset.latex, 'Data-Attr', el);
        });
        // Images (Wiki/Forums)
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
        setTimeout(() => el.classList.remove('tex-highlight-target'), 2000);
    }

    // ===========================
    // 3. 窗口交互 (Drag & Resize)
    // ===========================
    function makeDraggable(el, handle) {
        let isDragging = false, startX, startY, initialLeft, initialTop;
        
        handle.addEventListener('mousedown', (e) => {
            if (e.target.closest('button')) return; // 忽略按钮点击
            isDragging = true;
            startX = e.clientX; startY = e.clientY;
            const rect = el.getBoundingClientRect();
            initialLeft = rect.left; initialTop = rect.top;
            
            // 切换为绝对定位，移除 transform 居中
            el.style.transform = 'none';
            el.style.left = initialLeft + 'px';
            el.style.top = initialTop + 'px';
            el.style.margin = '0';
            
            document.body.style.cursor = 'move';
            window.addEventListener('mousemove', onMouseMove);
            window.addEventListener('mouseup', onMouseUp);
        });

        function onMouseMove(e) {
            if (!isDragging) return;
            el.style.left = (initialLeft + (e.clientX - startX)) + 'px';
            el.style.top = (initialTop + (e.clientY - startY)) + 'px';
        }

        function onMouseUp() {
            isDragging = false;
            document.body.style.cursor = 'default';
            window.removeEventListener('mousemove', onMouseMove);
            window.removeEventListener('mouseup', onMouseUp);
        }
    }

    function makeResizable(el, handle) {
        let isResizing = false, startX, startY, startW, startH;
        
        handle.addEventListener('mousedown', (e) => {
            e.stopPropagation(); e.preventDefault();
            isResizing = true;
            startX = e.clientX; startY = e.clientY;
            const rect = el.getBoundingClientRect();
            startW = rect.width; startH = rect.height;
            
            document.body.style.cursor = 'se-resize';
            window.addEventListener('mousemove', onMove);
            window.addEventListener('mouseup', onUp);
        });
        
        function onMove(e) {
            if (!isResizing) return;
            const newW = Math.max(320, startW + (e.clientX - startX));
            const newH = Math.max(250, startH + (e.clientY - startY));
            el.style.width = newW + 'px';
            el.style.height = newH + 'px';
        }
        
        function onUp() {
            isResizing = false;
            document.body.style.cursor = 'default';
            window.removeEventListener('mousemove', onMove);
            window.removeEventListener('mouseup', onUp);
        }
    }

    // ===========================
    // 4. 构建 UI (HTML Structure)
    // ===========================
    // 悬浮球
    const btn = document.createElement('div');
    btn.id = 'univ-tex-btn';
    btn.className = 'apple-tex-root';
    btn.innerHTML = '∑'; // SF Symbols 风格通常用 SVG，这里 Unicode 足够简洁
    document.body.appendChild(btn);

    // 主面板
    const panel = document.createElement('div');
    panel.id = 'univ-tex-panel';
    panel.className = 'apple-tex-root';
    panel.innerHTML = `
        <div class="tex-panel-head">
            <div class="tex-title-group">
                <h3>公式探测</h3>
                <span class="tex-badge" id="tex-count">0</span>
            </div>
            <button class="btn-icon-close" id="tex-head-close">✕</button>
        </div>
        <div class="tex-panel-body" id="tex-p-body"></div>
        <div class="tex-panel-foot">
            <button class="u-btn u-close" id="tex-p-cancel">关闭</button>
            <button class="u-btn u-copy-all" id="tex-p-copy">复制全部</button>
            <div class="tex-resize-handle"></div>
        </div>
    `;
    document.body.appendChild(panel);

    // Toast
    const toast = document.createElement('div');
    toast.id = 'apple-toast';
    toast.className = 'apple-tex-root';
    document.body.appendChild(toast);

    function showToast(msg, icon='✅') {
        toast.innerHTML = `<span>${icon}</span><span>${msg}</span>`;
        toast.classList.add('show');
        // 防抖
        clearTimeout(toast.timer);
        toast.timer = setTimeout(() => toast.classList.remove('show'), 2000);
    }

    // 绑定拖拽和缩放
    makeDraggable(panel, panel.querySelector('.tex-panel-head'));
    makeResizable(panel, panel.querySelector('.tex-resize-handle'));

    // ===========================
    // 5. 渲染与事件
    // ===========================
    function renderList(list) {
        const body = document.getElementById('tex-p-body');
        document.getElementById('tex-count').textContent = list.length;
        body.innerHTML = '';

        if (list.length === 0) {
            body.innerHTML = `
                <div style="text-align:center; padding:60px 20px; color:#888;">
                    <div style="font-size:36px; margin-bottom:12px; opacity:0.5;">👻</div>
                    <div style="font-weight:500;">未探测到公式</div>
                    <div style="font-size:12px; margin-top:6px; opacity:0.7;">当前页面可能使用了非标准渲染方式</div>
                </div>`;
            return;
        }

        list.forEach(item => {
            const el = document.createElement('div');
            el.className = 'tex-item';
            
            // Tag 样式映射
            let tagClass = 'tag-katex';
            if (item.type.includes('MathJax')) tagClass = 'tag-mathjax';
            if (item.type === 'Image') tagClass = 'tag-img';

            el.innerHTML = `
                <div class="tex-content-area" title="点击复制 LaTeX">
                    <div class="code-text">${escapeHtml(item.source)}</div>
                </div>
                <div class="tex-action-bar">
                    <span class="tex-tag ${tagClass}">${item.type}</span>
                    <div class="tex-btn-group">
                        <button class="item-btn btn-locate">
                            <span>📍</span>定位
                        </button>
                        <button class="item-btn btn-copy-one">
                            <span>📋</span>复制
                        </button>
                    </div>
                </div>
            `;
            
            // 交互逻辑
            const copyFunc = (e) => {
                e.stopPropagation();
                GM_setClipboard(item.source);
                showToast('已复制到剪贴板');
                // 闪烁反馈
                el.style.background = 'rgba(52, 199, 89, 0.2)'; // Apple Green light
                setTimeout(() => el.style.background = '', 300);
            };

            el.querySelector('.tex-content-area').addEventListener('click', copyFunc);
            el.querySelector('.btn-copy-one').addEventListener('click', copyFunc);
            
            el.querySelector('.btn-locate').addEventListener('click', (e) => {
                e.stopPropagation();
                if (item.element) {
                    scrollToElement(item.element);
                    showToast('已跳转到公式位置', '📍');
                } else {
                    showToast('无法定位原元素', '⚠️');
                }
            });

            body.appendChild(el);
        });
    }

    // 打开面板
    btn.addEventListener('click', () => {
        const results = detectMath();
        renderList(results);
        panel.style.display = 'flex';
        // 强制重绘以触发 transition
        setTimeout(() => panel.classList.add('is-visible'), 10);
    });

    // 关闭面板
    const closeFunc = () => { 
        panel.classList.remove('is-visible');
        setTimeout(() => { panel.style.display = 'none'; }, 400); // 等待动画结束
    };
    document.getElementById('tex-head-close').addEventListener('click', closeFunc);
    document.getElementById('tex-p-cancel').addEventListener('click', closeFunc);

    // 复制全部
    document.getElementById('tex-p-copy').addEventListener('click', () => {
        const text = detectMath().map(r => r.source).join('\n\n');
        if (text) { 
            GM_setClipboard(text); 
            showToast(`已复制全部 ${detectMath().length} 个公式`); 
        }
    });

    function escapeHtml(text) {
        return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    }

})();