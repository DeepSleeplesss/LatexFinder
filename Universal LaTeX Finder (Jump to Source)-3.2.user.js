// ==UserScript==
// @name         [Apple UI] Universal LaTeX Finder
// @namespace    http://tampermonkey.net/
// @version      4.0
// @description  探测网页公式，采用 macOS 风格毛玻璃UI，支持丝滑动画、拖拽与缩放
// @author       Apple UI Expert
// @match        *://*/*
// @grant        GM_setClipboard
// @grant        GM_addStyle
// @grant        GM_xmlhttpRequest
// @grant        GM_getValue
// @grant        GM_setValue
// ==/UserScript==

(function() {
    'use strict';

    // ===========================
    // 0. API 配置（硅基流动 SiliconFlow）
    // ===========================
    // 说明：请替换为你的 API Key 与接口地址；使用 GM_xmlhttpRequest 规避跨域。
    function getSFConfig() {
        const endpoint = (GM_getValue('SF_API_ENDPOINT', 'https://api.siliconflow.cn/v1') || 'https://api.siliconflow.cn/v1').trim();
        const apiKey = (GM_getValue('SF_API_KEY', '') || '').trim();
        const model = (GM_getValue('SF_MODEL', 'Qwen/Qwen3-VL-8B-Instruct') || 'Qwen/Qwen3-VL-8B-Instruct').trim();
        return { endpoint, apiKey, model };
    }

    async function recognizeLatexFromImage(file) {
        try {
            const { endpoint, apiKey, model } = getSFConfig();
            if (!apiKey || !endpoint || !model) {
                throw new Error('缺少 API 配置 (Key/Endpoint/Model)');
            }

            // 判断是专用OCR API还是通用视觉模型
            const isOCRAPI = model.toLowerCase().includes('latex-ocr') || endpoint.includes('/ocr/latex');

            if (isOCRAPI) {
                // ========== 专用OCR API (multipart/form-data) ==========
                const boundary = '----TamperMonkeyFormBoundary' + Math.random().toString(16).slice(2);
                const encoder = new TextEncoder();

                const fileBuf = await new Promise((resolve, reject) => {
                    const reader = new FileReader();
                    reader.onload = () => resolve(reader.result);
                    reader.onerror = reject;
                    reader.readAsArrayBuffer(file);
                });

                function partHeader(name, filename, type) {
                    let h = `--${boundary}\r\n` +
                            `Content-Disposition: form-data; name="${name}"${filename ? `; filename="${filename}"` : ''}\r\n` +
                            (type ? `Content-Type: ${type}\r\n` : '') +
                            `\r\n`;
                    return encoder.encode(h);
                }
                const CRLF = encoder.encode('\r\n');
                const endBoundary = encoder.encode(`--${boundary}--\r\n`);

                const chunks = [];
                chunks.push(partHeader('model'));
                chunks.push(encoder.encode(model));
                chunks.push(CRLF);
                chunks.push(partHeader('file', file.name || 'clipboard.png', file.type || 'image/png'));
                chunks.push(new Uint8Array(fileBuf));
                chunks.push(CRLF);
                chunks.push(endBoundary);

                let totalLen = 0;
                chunks.forEach(c => totalLen += c.byteLength);
                const body = new Uint8Array(totalLen);
                let offset = 0;
                chunks.forEach(c => { body.set(c, offset); offset += c.byteLength; });

                return await new Promise((resolve, reject) => {
                    GM_xmlhttpRequest({
                        method: 'POST',
                        url: endpoint,
                        headers: {
                            'Authorization': `Bearer ${apiKey}`,
                            'Content-Type': `multipart/form-data; boundary=${boundary}`
                        },
                        data: body,
                        binary: true,
                        responseType: 'json',
                        onload: (resp) => {
                            try {
                                const data = resp.response || JSON.parse(resp.responseText || '{}');
                                const latex = data.latex || data.result || '';
                                if (!latex) return reject(new Error('未从响应中解析到 LaTeX'));
                                resolve(latex);
                            } catch (e) {
                                reject(e);
                            }
                        },
                        onerror: (e) => reject(new Error('OCR API 请求失败'))
                    });
                });

            } else {
                // ========== 通用视觉大模型 API (JSON格式) ==========
                const base64 = await new Promise((resolve, reject) => {
                    const reader = new FileReader();
                    reader.onload = () => {
                        const dataURL = reader.result;
                        resolve(dataURL); // 格式: data:image/png;base64,iVBOR...
                    };
                    reader.onerror = reject;
                    reader.readAsDataURL(file);
                });

                const requestBody = {
                    model: model,
                    messages: [
                        {
                            role: "user",
                            content: [
                                {
                                    type: "image_url",
                                    image_url: {
                                        url: base64
                                    }
                                },
                                {
                                    type: "text",
                                    text: "请识别这张图片中的LaTeX公式，只返回LaTeX代码，不要其他说明文字。"
                                }
                            ]
                        }
                    ],
                    max_tokens: 2000
                };

                return await new Promise((resolve, reject) => {
                    // 智能拼接URL，避免重复
                    let finalURL = endpoint;
                    if (!finalURL.includes('/chat/completions')) {
                        finalURL = finalURL.endsWith('/') ? finalURL + 'chat/completions' : finalURL + '/chat/completions';
                    }
                    
                    GM_xmlhttpRequest({
                        method: 'POST',
                        url: finalURL,
                        headers: {
                            'Authorization': `Bearer ${apiKey}`,
                            'Content-Type': 'application/json'
                        },
                        data: JSON.stringify(requestBody),
                        responseType: 'json',
                        onload: (resp) => {
                            try {
                                // 检查HTTP错误
                                if (resp.status !== 200) {
                                    const data = resp.response || JSON.parse(resp.responseText || '{}');
                                    let errMsg = data.error?.message || data.message || `HTTP ${resp.status}`;
                                    // 针对常见错误给出提示
                                    if (data.code === 20012 || errMsg.includes('Model does not exist')) {
                                        errMsg = `模型不存在，请检查模型名称是否正确（当前：${model}）`;
                                    }
                                    return reject(new Error(`API错误: ${errMsg}`));
                                }
                                
                                const data = resp.response || JSON.parse(resp.responseText || '{}');
                                
                                // 解析视觉模型响应
                                let latex = '';
                                if (data.choices && data.choices[0] && data.choices[0].message) {
                                    latex = data.choices[0].message.content || '';
                                }
                                
                                // 清理返回的内容，提取LaTeX
                                latex = latex.trim();
                                // 移除markdown代码块标记
                                latex = latex.replace(/^```latex\n?/i, '').replace(/^```\n?/, '').replace(/\n?```$/g, '');
                                // 移除可能的$符号包裹
                                latex = latex.replace(/^\$\$?\s*/, '').replace(/\s*\$\$?$/, '');
                                
                                if (!latex) {
                                    return reject(new Error('未从响应中解析到 LaTeX'));
                                }
                                
                                resolve(latex);
                            } catch (e) {
                                reject(e);
                            }
                        },
                        onerror: (e) => {
                            reject(new Error('网络请求失败，请检查网络连接'));
                        }
                    });
                });
            }

        } catch (err) {
            throw err;
        }
    }

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
            /* 设置面板样式 */
            #tex-settings {
                display: none;
                position: fixed;
                top: 20%;
                left: 50%;
                transform: translateX(-50%);
                width: 420px;
                background: rgba(255,255,255,0.9);
                backdrop-filter: blur(24px) saturate(160%);
                border: 1px solid rgba(0,0,0,0.06);
                border-radius: 16px;
                box-shadow: 0 20px 50px rgba(0,0,0,0.15);
                z-index: 2147483647;
            }
            .tex-settings-head {
                height: 48px;
                padding: 0 16px;
                border-bottom: 1px solid rgba(0,0,0,0.06);
                display: flex;
                align-items: center;
                justify-content: space-between;
            }
            .tex-settings-body {
                padding: 14px 16px 18px 16px;
                display: grid;
                gap: 12px;
            }
            .tex-setting-row {
                display: grid;
                grid-template-columns: 110px 1fr;
                align-items: center;
                gap: 10px;
            }
            .tex-setting-row label { color: #333; font-size: 13px; }
            .tex-setting-row input {
                height: 34px;
                border-radius: 8px;
                border: 1px solid rgba(0,0,0,0.12);
                padding: 0 10px;
                font-size: 13px;
                background: rgba(255,255,255,0.8);
            }
            .tex-settings-foot {
                padding: 12px 16px;
                border-top: 1px solid rgba(0,0,0,0.06);
                display: flex;
                justify-content: flex-end;
                gap: 8px;
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
            left: 10%;
            /* 初始状态只隐藏不变形 */
            transform: translateX(-50%);
            opacity: 0; /* 初始隐藏 */
            
            width: 240px;
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
            <div style="display:flex; align-items:center; gap:8px;">
                <button class="btn-icon-close" id="tex-open-settings" title="设置">⚙️</button>
                <button class="btn-icon-close" id="tex-head-close">✕</button>
            </div>
        </div>
        <div class="tex-panel-body" id="tex-p-body"></div>
        <div class="tex-panel-foot">
            <button class="u-btn u-close" id="tex-p-cancel">关闭</button>
            <button class="u-btn" id="tex-recognize-img" style="background:#34C759; color:white; box-shadow:0 2px 10px rgba(52,199,89,0.3);">🖼️ 识别图片（自动识别剪贴板）</button>
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

    // Settings Panel
    const settings = document.createElement('div');
    settings.id = 'tex-settings';
    settings.className = 'apple-tex-root';
    settings.innerHTML = `
        <div class="tex-settings-head">
            <div style="font-weight:600;">硅基流动 API 设置</div>
            <button class="btn-icon-close" id="tex-settings-close">✕</button>
        </div>
        <div class="tex-settings-body">
            <div class="tex-setting-row">
                <label>API Key</label>
                <input id="sf-key" type="password" placeholder="输入你的 SiliconFlow API Key" />
            </div>
            <div class="tex-setting-row">
                <label>模型名称</label>
                <input id="sf-model" type="text" placeholder="如 Pro/Qwen/Qwen2-VL-7B-Instruct" />
            </div>
            <div style="padding:0 16px; font-size:12px; color:#666; margin-top:-8px;">
                提示：模型列表请访问 <a href="https://siliconflow.cn/models" target="_blank" style="color:#007AFF;">siliconflow.cn/models</a>
            </div>
            <div class="tex-setting-row">
                <label>接口地址</label>
                <input id="sf-endpoint" type="text" placeholder="如 https://api.siliconflow.cn/v1" />
            </div>
        </div>
        <div class="tex-settings-foot">
            <button class="u-btn u-close" id="tex-settings-cancel">取消</button>
            <button class="u-btn u-copy-all" id="tex-settings-save">保存</button>
        </div>
    `;
    document.body.appendChild(settings);

    function showToast(msg, icon='✅') {
        toast.innerHTML = `<span>${icon}</span><span>${msg}</span>`;
        toast.classList.add('show');
        // 防抖
        clearTimeout(toast.timer);
        toast.timer = setTimeout(() => toast.classList.remove('show'), 2000);
    }

    // 提取识别图片的逻辑为函数
    async function processImageRecognition(imageFile) {
        try {
            const { endpoint, apiKey, model } = getSFConfig();
            
            if (!apiKey || !endpoint || !model) {
                showToast('请先在设置中填写 API Key / 模型 / 接口地址', '⚠️');
                return;
            }

            showToast('正在识别图片中的公式…', '🖼️');
            const latex = await recognizeLatexFromImage(imageFile);
            if (!latex) {
                showToast('未识别到 LaTeX 公式', '⚠️');
                return;
            }

            // 将识别结果追加到面板列表顶部
            const body = document.getElementById('tex-p-body');
            const el = document.createElement('div');
            el.className = 'tex-item';
            el.innerHTML = `
                <div class="tex-content-area" title="点击复制 LaTeX">
                    <div class="code-text">${escapeHtml(latex)}</div>
                </div>
                <div class="tex-action-bar">
                    <span class="tex-tag tag-img">Image→LaTeX</span>
                    <div class="tex-btn-group">
                        <button class="item-btn btn-copy-one"><span>📋</span>复制</button>
                    </div>
                </div>`;

            const copyFunc = (ev) => {
                ev.stopPropagation();
                GM_setClipboard(latex);
                showToast('识别结果已复制', '✅');
                el.style.background = 'rgba(52, 199, 89, 0.2)';
                setTimeout(() => el.style.background = '', 300);
            };
            el.querySelector('.tex-content-area').addEventListener('click', copyFunc);
            el.querySelector('.btn-copy-one').addEventListener('click', copyFunc);

            // 若面板未打开，先打开
            if (panel.style.display === 'none' || panel.style.display === '') {
                panel.classList.remove('is-visible');
                panel.style.display = 'flex';
                void panel.offsetHeight; // 强制重排，避免闪烁
                
                // 立即转换为绝对定位，避免后续拖拽时闪烁
                const rect = panel.getBoundingClientRect();
                panel.style.transform = 'none';
                panel.style.left = rect.left + 'px';
                panel.style.top = rect.top + 'px';
                
                requestAnimationFrame(() => {
                    panel.classList.add('is-visible');
                });
            }
            body.prepend(el);
            // 更新计数徽章
            const badge = document.getElementById('tex-count');
            badge.textContent = String(Number(badge.textContent || '0') + 1);

            showToast('已识别并添加到列表', '✨');
        } catch (err) {
            showToast('识别失败: ' + (err.message || '未知错误'), '❌');
        }
    }

    // 识别图片按钮事件 - 先尝试剪贴板，再文件选择
    document.getElementById('tex-recognize-img').addEventListener('click', async () => {
        // 首先尝试从剪贴板读取图片
        try {
            const clipboardItems = await navigator.clipboard.read();
            for (const item of clipboardItems) {
                if (item.types.includes('image/png') || item.types.includes('image/jpeg') || item.types.includes('image/webp')) {
                    const imageBlob = await item.getType(item.types.find(t => t.startsWith('image/')));
                    const file = new File([imageBlob], 'clipboard.png', { type: imageBlob.type });
                    processImageRecognition(file);
                    return;
                }
            }
        } catch (err) {
            // 剪贴板API不可用或无权限，继续执行文件选择
        }

        // 剪贴板没有图片，打开文件选择对话框
        const fileInput = document.createElement('input');
        fileInput.type = 'file';
        fileInput.accept = 'image/*';
        fileInput.style.display = 'none';
        
        fileInput.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (file) {
                processImageRecognition(file);
            }
        });
        
        // 触发文件选择对话框
        document.body.appendChild(fileInput);
        fileInput.click();
        setTimeout(() => fileInput.remove(), 100);
    });

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
                    <div style="font-weight:500; font-size:15px; color:#666;">未探测到公式</div>
                    <div style="font-size:12px; margin-top:6px; opacity:0.7; color:#999;">当前页面可能使用了非标准渲染方式</div>
                    <div style="margin-top:24px; padding:16px; background:rgba(0,122,255,0.12); border:1px solid rgba(0,122,255,0.2); border-radius:10px; font-size:14px; line-height:1.8;">
                        <div style="font-weight:600; color:#007AFF; margin-bottom:8px; font-size:15px;">💡 快捷提示</div>
                        <div style="color:#333; font-weight:500;">按 <kbd style="padding:4px 8px; background:rgba(255,255,255,0.9); border:1px solid rgba(0,0,0,0.15); border-radius:6px; font-size:13px; font-weight:600; box-shadow:0 1px 3px rgba(0,0,0,0.1);">Ctrl+V</kbd> 粘贴图片</div>
                        <div style="color:#555; margin-top:4px;">即可自动识别并提取 LaTeX 公式</div>
                    </div>
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

    // 让悬浮球可拖动
    (function makeBtnDraggable() {
        let isDragging = false, hasMoved = false, startX, startY, initialLeft, initialTop;
        
        btn.addEventListener('mousedown', (e) => {
            isDragging = true;
            hasMoved = false;
            startX = e.clientX;
            startY = e.clientY;
            const rect = btn.getBoundingClientRect();
            initialLeft = rect.left;
            initialTop = rect.top;
            
            document.body.style.cursor = 'move';
            e.preventDefault();
        });
        
        window.addEventListener('mousemove', (e) => {
            if (!isDragging) return;
            
            const deltaX = e.clientX - startX;
            const deltaY = e.clientY - startY;
            
            // 移动超过5px才认为是拖动
            if (Math.abs(deltaX) > 5 || Math.abs(deltaY) > 5) {
                hasMoved = true;
                btn.style.left = (initialLeft + deltaX) + 'px';
                btn.style.top = (initialTop + deltaY) + 'px';
                btn.style.right = 'auto';
                btn.style.bottom = 'auto';
            }
        });
        
        window.addEventListener('mouseup', (e) => {
            if (isDragging && !hasMoved) {
                // 没有拖动，触发点击
                const results = detectMath();
                renderList(results);
                panel.classList.remove('is-visible');
                panel.style.display = 'flex';
                void panel.offsetHeight; // 强制重排，避免闪烁
                
                // 立即转换为绝对定位，避免后续拖拽时闪烁
                const rect = panel.getBoundingClientRect();
                panel.style.transform = 'none';
                panel.style.left = rect.left + 'px';
                panel.style.top = rect.top + 'px';
                
                requestAnimationFrame(() => {
                    panel.classList.add('is-visible');
                });
            }
            
            isDragging = false;
            document.body.style.cursor = 'default';
        });
    })();

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

    // 设置按钮事件
    const openSettingsBtn = document.getElementById('tex-open-settings');
    const settingsCloseBtn = document.getElementById('tex-settings-close');
    const settingsCancelBtn = document.getElementById('tex-settings-cancel');
    const settingsSaveBtn = document.getElementById('tex-settings-save');

    function loadSettingsIntoForm() {
        const { endpoint, apiKey, model } = getSFConfig();
        document.getElementById('sf-key').value = apiKey;
        document.getElementById('sf-model').value = model;
        document.getElementById('sf-endpoint').value = endpoint;
    }

    openSettingsBtn.addEventListener('click', () => {
        loadSettingsIntoForm();
        settings.style.display = 'block';
    });
    settingsCloseBtn.addEventListener('click', () => { settings.style.display = 'none'; });
    settingsCancelBtn.addEventListener('click', () => { settings.style.display = 'none'; });
    settingsSaveBtn.addEventListener('click', () => {
        const key = document.getElementById('sf-key').value.trim();
        const model = document.getElementById('sf-model').value.trim();
        const endpoint = document.getElementById('sf-endpoint').value.trim();
        if (!key || !model || !endpoint) {
            showToast('请填写完整设置项', '⚠️');
            return;
        }
        GM_setValue('SF_API_KEY', key);
        GM_setValue('SF_MODEL', model);
        GM_setValue('SF_API_ENDPOINT', endpoint);
        showToast('设置已保存', '✅');
        settings.style.display = 'none';
    });

    function escapeHtml(text) {
        return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    }

})();