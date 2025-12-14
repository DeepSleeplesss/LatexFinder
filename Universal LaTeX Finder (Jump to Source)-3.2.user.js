// ==UserScript==
// @name         [全网通用] Universal LaTeX Finder (Jump to Source)
// @namespace    http://tampermonkey.net/
// @version      3.2
// @description  探测任意网页上的数学公式，支持一键复制和快速跳转定位到原公式位置
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
            transform: translateX(-50%);
            width: 600px;
            max-width: 90%;
            height: 70vh;
            background: white;
            border-radius: 8px;
            box-shadow: 0 15px 50px rgba(0,0,0,0.3);
            z-index: 2147483647;
            display: none;
            flex-direction: column;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif;
            border: 1px solid #ddd;
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
        }
        .tex-panel-head h3 { margin: 0; font-size: 16px; color: #333; pointer-events: none; }

        /* 内容区域 */
        .tex-panel-body {
            flex: 1;
            overflow-y: auto;
            padding: 10px;
            background: #fafafa;
        }

        /* 单个公式项容器 */
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

        /* 公式内容的点击区域 (复制) */
        .tex-content-area {
            padding: 12px;
            cursor: pointer;
            width: 100%;
            box-sizing: border-box;
        }
        .tex-content-area:hover {
            background-color: #f0f7ff;
        }

        /* 底部动作条 */
        .tex-action-bar {
            border-top: 1px solid #eee;
            padding: 5px 10px;
            display: flex;
            justify-content: space-between;
            align-items: center;
            background: #fff;
            border-radius: 0 0 6px 6px;
        }

        /* 标签 */
        .tex-tag {
            padding: 2px 6px;
            border-radius: 3px;
            font-size: 10px;
            color: white;
            font-weight: bold;
            font-family: sans-serif;
        }

        /* 按钮样式 */
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

        /* 底部总控 */
        .tex-panel-foot {
            padding: 12px;
            border-top: 1px solid #ddd;
            display: flex;
            justify-content: flex-end;
            gap: 10px;
            background: white;
            border-radius: 0 0 8px 8px;
        }
        .u-btn { padding: 8px 16px; border:none; border-radius:4px; cursor:pointer; font-weight:bold; font-size: 13px; }
        .u-close { background:#f0f0f0; color:#333; }
        .u-copy-all { background:#673AB7; color:white; }

        /* 代码文本 */
        .code-text {
            font-family: Consolas, Monaco, monospace;
            font-size: 13px;
            word-break: break-all;
            line-height: 1.4;
            color: #333;
        }

        /* 高亮动画 */
        @keyframes target-blink {
            0% { background-color: rgba(255, 235, 59, 0.8); box-shadow: 0 0 15px rgba(255, 235, 59, 0.8); transform: scale(1.05); }
            100% { background-color: transparent; box-shadow: none; transform: scale(1); }
        }
        .tex-highlight-target {
            animation: target-blink 2s ease-out;
            border-radius: 4px;
        }
    `);

    // ===========================
    // 2. 核心探测逻辑
    // ===========================
    function detectMath() {
        const results = [];
        const seen = new Set();

        // 这里的 element 参数很关键，用于跳转
        const add = (source, type, element) => {
            if (!source) return;
            source = source.trim();
            // 去重逻辑：如果需要跳转到具体位置，其实不应该完全去重。
            // 但为了列表简洁，我们这里只保留该公式的“第一次出现”作为跳转目标。
            if (seen.has(source) || source.length < 2) return;
            seen.add(source);
            results.push({ source, type, element });
        };

        // A. KaTeX
        document.querySelectorAll('.katex').forEach(wrapper => {
            // KaTeX 结构复杂，我们取最外层 wrapper 用于跳转，取内部 annotation 用于提取
            const annotation = wrapper.querySelector('annotation[encoding="application/x-tex"]');
            if (annotation) {
                add(annotation.textContent, 'KaTeX', wrapper);
            }
        });

        // B. MathJax 2 script
        document.querySelectorAll('script[type^="math/tex"]').forEach(script => {
            // Script 标签本身不显示，通常它前面有个 preview 元素，或者我们跳到 script 的父元素
            add(script.textContent, 'MathJax2', script.parentElement);
        });

        // C. MathJax 3 / Aria
        document.querySelectorAll('mjx-container, [role="math"]').forEach(el => {
            const label = el.getAttribute('aria-label');
            if (label) add(label, 'MathJax3', el);
            else if (el.dataset.latex) add(el.dataset.latex, 'Data-Attr', el);
        });

        // D. Images
        document.querySelectorAll('img').forEach(img => {
            const alt = img.alt || "";
            const src = img.src || "";
            if ((img.className && img.className.toString().includes('math')) || src.includes('latex') || (alt.includes('\\') && alt.length > 5)) {
                add(alt, 'Image', img);
            }
        });

        return results;
    }

    // ===========================
    // 3. 功能函数：跳转与高亮
    // ===========================
    function scrollToElement(el) {
        if (!el) return;

        // 平滑滚动到视野中央
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });

        // 添加高亮类
        el.classList.add('tex-highlight-target');

        // 动画结束后移除类，保持页面整洁
        setTimeout(() => {
            el.classList.remove('tex-highlight-target');
        }, 2000);
    }

    // 拖拽逻辑
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
    `;
    document.body.appendChild(panel);
    makeDraggable(panel, panel.querySelector('.tex-panel-head'));

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

            // 颜色定义
            let color = '#999';
            if (item.type === 'KaTeX') color = '#4caf50';
            if (item.type.includes('MathJax')) color = '#2196f3';
            if (item.type === 'Image') color = '#ff9800';

            // HTML 结构：分为“内容区”和“操作条”
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

            // 事件：复制
            const copyAction = (e) => {
                e.stopPropagation(); // 防止冒泡
                GM_setClipboard(item.source);
                showToast('已复制');
                itemDiv.querySelector('.tex-content-area').style.background = '#e8f5e9';
                setTimeout(() => itemDiv.querySelector('.tex-content-area').style.background = '', 300);
            };
            itemDiv.querySelector('.tex-content-area').addEventListener('click', copyAction);
            itemDiv.querySelector('.btn-copy-one').addEventListener('click', copyAction);

            // 事件：定位
            itemDiv.querySelector('.btn-locate').addEventListener('click', (e) => {
                e.stopPropagation();
                if (item.element) {
                    scrollToElement(item.element);
                    showToast('已跳转到位置');

                    // 如果是移动端或屏幕较小，可以考虑跳转时自动收起面板，这里暂不收起，方便连续查看
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