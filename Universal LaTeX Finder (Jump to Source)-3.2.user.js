// ==UserScript==
// @name         [Apple UI] Universal LaTeX Finder (Crystal Glass)
// @namespace    http://tampermonkey.net/
// @version      4.3
// @description  探测网页公式，极致通透的 iOS 水晶毛玻璃 UI，支持丝滑贝塞尔动画
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
    function getSFConfig() {
        const endpoint = (GM_getValue('SF_API_ENDPOINT', 'https://api.siliconflow.cn/v1') || 'https://api.siliconflow.cn/v1').trim();
        const apiKey = (GM_getValue('SF_API_KEY', '') || '').trim();
        const model = (GM_getValue('SF_MODEL', 'Qwen/Qwen3-VL-8B-Instruct') || 'Qwen/Qwen3-VL-8B-Instruct').trim();
        return { endpoint, apiKey, model };
    }

    async function recognizeLatexFromImage(file) {
        try {
            const { endpoint, apiKey, model } = getSFConfig();
            if (!apiKey || !endpoint || !model) throw new Error('缺少 API 配置');

            const isOCRAPI = model.toLowerCase().includes('latex-ocr') || endpoint.includes('/ocr/latex');

            if (isOCRAPI) {
                const boundary = '----TamperMonkeyFormBoundary' + Math.random().toString(16).slice(2);
                const encoder = new TextEncoder();
                const fileBuf = await new Promise((resolve, reject) => {
                    const reader = new FileReader();
                    reader.onload = () => resolve(reader.result);
                    reader.onerror = reject;
                    reader.readAsArrayBuffer(file);
                });
                function partHeader(name, filename, type) {
                    return encoder.encode(`--${boundary}\r\nContent-Disposition: form-data; name="${name}"${filename ? `; filename="${filename}"` : ''}\r\n${type ? `Content-Type: ${type}\r\n` : ''}\r\n`);
                }
                const chunks = [
                    partHeader('model'), encoder.encode(model), encoder.encode('\r\n'),
                    partHeader('file', file.name || 'img.png', file.type || 'image/png'), new Uint8Array(fileBuf), encoder.encode('\r\n'),
                    encoder.encode(`--${boundary}--\r\n`)
                ];
                let total = 0; chunks.forEach(c => total += c.byteLength);
                const body = new Uint8Array(total);
                let off = 0; chunks.forEach(c => { body.set(c, off); off += c.byteLength; });

                return await new Promise((resolve, reject) => {
                    GM_xmlhttpRequest({
                        method: 'POST', url: endpoint,
                        headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': `multipart/form-data; boundary=${boundary}` },
                        data: body, binary: true, responseType: 'json',
                        onload: (r) => { try { resolve((r.response || JSON.parse(r.responseText)).latex || ''); } catch (e) { reject(e); } },
                        onerror: () => reject(new Error('OCR Failed'))
                    });
                });
            } else {
                const base64 = await new Promise((resolve) => {
                    const r = new FileReader(); r.onload = () => resolve(r.result); r.readAsDataURL(file);
                });
                return await new Promise((resolve, reject) => {
                    let finalURL = endpoint.endsWith('/') ? endpoint + 'chat/completions' : endpoint + '/chat/completions';
                    if (endpoint.includes('/chat/completions')) finalURL = endpoint;
                    
                    GM_xmlhttpRequest({
                        method: 'POST', url: finalURL,
                        headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
                        data: JSON.stringify({
                            model: model,
                            messages: [{ role: "user", content: [{ type: "image_url", image_url: { url: base64 } }, { type: "text", text: "识别图片中的LaTeX公式，只返回纯LaTeX代码。" }] }],
                            max_tokens: 2000
                        }),
                        responseType: 'json',
                        onload: (r) => {
                            try {
                                if (r.status !== 200) return reject(new Error(`HTTP ${r.status}`));
                                const data = r.response || JSON.parse(r.responseText);
                                let tex = data.choices?.[0]?.message?.content || '';
                                tex = tex.replace(/^```latex\n?/i, '').replace(/^```\n?/, '').replace(/\n?```$/g, '').replace(/^\$\$\s*/, '').replace(/\s*\$\$$/, '').trim();
                                resolve(tex);
                            } catch (e) { reject(e); }
                        },
                        onerror: () => reject(new Error('Network Error'))
                    });
                });
            }
        } catch (e) { throw e; }
    }

    // ===========================
    // 1. Apple Style UI 系统 (Crystal Glass Edition)
    // ===========================
    const IOS_EASE = 'cubic-bezier(0.25, 1, 0.5, 1)';
    const IOS_BOUNCE = 'cubic-bezier(0.34, 1.56, 0.64, 1)';

    GM_addStyle(`
        /* 全局字体 */
        .apple-tex-root {
            font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", "Helvetica Neue", Helvetica, Arial, sans-serif;
            -webkit-font-smoothing: antialiased;
            box-sizing: border-box;
            letter-spacing: -0.015em;
        }

        /* --- 核心组件：水晶玻璃按钮 mixin --- */
        /* 极度通透的基底 */
        .glass-btn-base {
            border: none;
            outline: none;
            cursor: pointer;
            font-size: 13px;
            font-weight: 500;
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 6px;
            transition: all 0.3s ${IOS_EASE};
            
            /* 通透核心：低不透明度 + 高饱和度模糊 */
            background: rgba(255, 255, 255, 0.2); 
            backdrop-filter: blur(30px) saturate(200%);
            -webkit-backdrop-filter: blur(30px) saturate(200%);
            
            /* 边缘发光感 */
            border: 1px solid rgba(255, 255, 255, 0.5);
            box-shadow: 0 4px 20px rgba(0, 0, 0, 0.05), 
                        0 0 0 1px rgba(255, 255, 255, 0.1) inset;
            
            color: #1d1d1f;
            text-shadow: 0 1px 2px rgba(255, 255, 255, 0.8);
            user-select: none;
        }

        /* 悬停状态：变得稍微实一点，增加光泽 */
        .glass-btn-base:hover {
            background: rgba(255, 255, 255, 0.35);
            border-color: rgba(255, 255, 255, 0.6);
            box-shadow: 0 8px 30px rgba(0, 0, 0, 0.08),
                        0 0 0 1px rgba(255, 255, 255, 0.2) inset;
            transform: translateY(-1px);
        }

        /* 点击状态：缩小 + 变暗 */
        .glass-btn-base:active {
            transform: scale(0.96);
            background: rgba(255, 255, 255, 0.25);
        }

        /* --- 变体：功能按钮 (更通透的色彩) --- */
        
        /* 蓝色主按钮 */
        .glass-btn-primary {
            background: rgba(0, 122, 255, 0.1) !important; /* 极淡蓝 */
            color: #007AFF !important;
            border-color: rgba(0, 122, 255, 0.15) !important;
            font-weight: 600 !important;
        }
        .glass-btn-primary:hover {
            background: rgba(0, 122, 255, 0.2) !important;
            box-shadow: 0 4px 15px rgba(0, 122, 255, 0.15) !important;
        }

        /* 绿色按钮 (上传) */
        .glass-btn-success {
            background: rgba(52, 199, 89, 0.1) !important;
            color: #34C759 !important;
            border-color: rgba(52, 199, 89, 0.15) !important;
        }
        .glass-btn-success:hover {
            background: rgba(52, 199, 89, 0.2) !important;
            box-shadow: 0 4px 15px rgba(52, 199, 89, 0.15) !important;
        }

        /* 橙色按钮 (开关) */
        .glass-btn-warning {
            background: rgba(255, 149, 0, 0.1) !important;
            color: #FF9500 !important;
            border-color: rgba(255, 149, 0, 0.15) !important;
        }
        .glass-btn-warning:hover {
            background: rgba(255, 149, 0, 0.2) !important;
            box-shadow: 0 4px 15px rgba(255, 149, 0, 0.15) !important;
        }
        
        /* 灰色关闭按钮 */
        .glass-btn-secondary {
            color: #666 !important;
            background: rgba(255, 255, 255, 0.2) !important;
        }
        .glass-btn-secondary:hover {
            background: rgba(255, 255, 255, 0.4) !important;
            color: #333 !important;
        }

        /* --- 悬浮球 (透光水晶球) --- */
        #univ-tex-btn {
            position: fixed; bottom: 30px; right: 30px; 
            width: 52px; height: 52px;
            
            /* 半透明渐变 */
            background: linear-gradient(135deg, rgba(94, 92, 230, 0.4), rgba(54, 52, 163, 0.5));
            backdrop-filter: blur(25px) saturate(180%);
            -webkit-backdrop-filter: blur(25px) saturate(180%);
            
            border: 1px solid rgba(255,255,255,0.4);
            color: #fff;
            border-radius: 50%;
            /* 柔和的彩色阴影 */
            box-shadow: 0 12px 35px rgba(54, 52, 163, 0.3), 
                        inset 0 0 30px rgba(255,255,255,0.15),
                        0 0 0 1px rgba(255, 255, 255, 0.1) inset;
            text-shadow: 0 2px 4px rgba(0, 0, 0, 0.3);
            
            cursor: pointer; z-index: 2147483647;
            font-size: 24px; display: flex; align-items: center; justify-content: center;
            transition: all 0.6s ${IOS_BOUNCE};
            user-select: none;
        }
        #univ-tex-btn:hover {
            transform: scale(1.1) translateY(-2px);
            background: linear-gradient(135deg, rgba(94, 92, 230, 0.5), rgba(54, 52, 163, 0.6));
            box-shadow: 0 15px 45px rgba(54, 52, 163, 0.4),
                        inset 0 0 35px rgba(255,255,255,0.2);
            width: 140px; border-radius: 26px; /* 变胶囊 */
        }
        #univ-tex-btn:active { transform: scale(0.95); }
        #univ-tex-btn::after {
            content: "探测公式"; font-size: 15px; font-weight: 500; letter-spacing: 0.5px;
            opacity: 0; width: 0; white-space: nowrap; display: inline-block;
            transition: all 0.4s ${IOS_EASE}; margin-left: 0; overflow: hidden; text-shadow: 0 1px 2px rgba(0,0,0,0.1);
        }
        #univ-tex-btn:hover::after { opacity: 1; width: 64px; margin-left: 8px; }

        /* --- 主面板 (高透) --- */
        #univ-tex-panel {
            position: fixed; top: 15%; left: 2%;
            transform: scale(0.96);
            opacity: 0;
            
            width: 280px; height: 65vh; min-width: 340px; min-height: 300px;
            
            /* 面板通透化 - 与设置窗口一致 */
            background: rgba(255, 255, 255, 0.3);
            backdrop-filter: saturate(200%) blur(50px);
            -webkit-backdrop-filter: saturate(200%) blur(50px);
            
            border: 1px solid rgba(255, 255, 255, 0.6);
            border-radius: 24px;
            box-shadow: 0 40px 90px rgba(0,0,0,0.2),
                        0 0 0 1px rgba(255, 255, 255, 0.3) inset;
            
            z-index: 2147483647;
            display: none; flex-direction: column;
            transition: transform 0.5s ${IOS_EASE}, opacity 0.3s ease;
        }
        #univ-tex-panel.is-visible { opacity: 1; transform: scale(1); }

        /* --- 头部 --- */
        .tex-panel-head {
            height: 56px; padding: 0 18px; 
            border-bottom: 1px solid rgba(0, 0, 0, 0.03); /* 极淡分割线 */
            display: flex; justify-content: space-between; align-items: center;
            cursor: default; user-select: none;
        }
        .tex-panel-head h3 { 
            margin: 0; font-size: 16px; font-weight: 600; 
            color: rgba(0,0,0,0.9); 
            letter-spacing: -0.02em;
            text-shadow: 0 1px 2px rgba(255, 255, 255, 0.8);
        }
        .tex-badge { 
            background: rgba(0,0,0,0.08); 
            color: #555; 
            padding: 2px 8px; border-radius: 12px; 
            font-size: 12px; font-weight: 600;
            text-shadow: 0 0.5px 1px rgba(255, 255, 255, 0.5);
        }

        /* 顶部小图标 (关闭/设置) */
        .btn-icon-glass {
            width: 30px; height: 30px; border-radius: 50%;
            border: 1px solid rgba(255,255,255,0.4);
            background: rgba(255,255,255,0.15);
            backdrop-filter: blur(15px);
            -webkit-backdrop-filter: blur(15px);
            color: #555; cursor: pointer;
            display: flex; align-items: center; justify-content: center;
            font-size: 14px; transition: all 0.2s;
            text-shadow: 0 1px 1px rgba(255, 255, 255, 0.5);
        }
        .btn-icon-glass:hover { 
            background: rgba(255,255,255,0.35); 
            box-shadow: 0 2px 10px rgba(0,0,0,0.08); 
            color: #000; 
        }
        .btn-icon-glass:active { transform: scale(0.9); }

        /* --- 内容列表 --- */
        .tex-panel-body { flex: 1; overflow-y: auto; padding: 14px; scrollbar-width: thin; }
        .tex-item {
            background: rgba(255, 255, 255, 0.15); /* 列表项也更透 */
            backdrop-filter: blur(20px);
            -webkit-backdrop-filter: blur(20px);
            margin-bottom: 10px;
            border-radius: 16px; 
            border: 1px solid rgba(255,255,255,0.4);
            display: flex; flex-direction: column; 
            transition: all 0.3s ${IOS_EASE};
            position: relative; overflow: hidden;
        }
        .tex-item:hover {
            background: rgba(255, 255, 255, 0.3); 
            box-shadow: 0 8px 25px rgba(0,0,0,0.06),
                        0 0 0 1px rgba(255, 255, 255, 0.2) inset;
            transform: scale(1.01);
            border-color: rgba(255,255,255,0.6);
        }
        .tex-content-area { padding: 16px; cursor: pointer; width: 100%; box-sizing: border-box; }
        .code-text { 
            font-family: "SF Mono", Menlo, monospace; 
            font-size: 13px; 
            color: #1d1d1f; 
            line-height: 1.5; 
            word-break: break-all;
            text-shadow: 0 1px 2px rgba(255, 255, 255, 0.8);
        }
        
        /* 列表底部操作栏 */
        .tex-action-bar {
            padding: 8px 12px; 
            background: rgba(255, 255, 255, 0.1);
            backdrop-filter: blur(15px);
            -webkit-backdrop-filter: blur(15px);
            border-top: 1px solid rgba(255,255,255,0.3); 
            display: flex; justify-content: space-between; align-items: center;
        }
        
        /* 列表内的胶囊按钮 */
        .item-btn-pill {
            border: none; 
            background: rgba(255,255,255,0.25); 
            backdrop-filter: blur(10px);
            -webkit-backdrop-filter: blur(10px);
            padding: 4px 10px; border-radius: 12px; 
            font-size: 11px; font-weight: 600; color: #555;
            cursor: pointer; display: flex; align-items: center; gap: 4px;
            transition: all 0.2s; border: 1px solid rgba(255,255,255,0.4);
            text-shadow: 0 0.5px 1px rgba(255, 255, 255, 0.5);
        }
        .item-btn-pill:hover { 
            background: rgba(255,255,255,0.45); 
            color: #000; 
            box-shadow: 0 2px 8px rgba(0,0,0,0.05); 
        }
        .item-btn-pill:active { transform: scale(0.94); }
        .btn-locate { color: #007AFF; }
        
        /* 标签 */
        .tex-tag { font-size: 10px; font-weight: 700; padding: 3px 8px; border-radius: 8px; text-transform: uppercase; letter-spacing: 0.5px; }
        .tag-katex { color: #2E7D32; background: rgba(52, 199, 89, 0.1); }
        .tag-mathjax { color: #007AFF; background: rgba(0, 122, 255, 0.1); }
        .tag-img { color: #FF9500; background: rgba(255, 149, 0, 0.1); }

        /* --- 底部 (Footer) --- */
        .tex-panel-foot {
            padding: 14px 18px; 
            border-top: 1px solid rgba(255, 255, 255, 0.3);
            display: flex; justify-content: flex-end; gap: 10px; flex-wrap: wrap;
            background: rgba(255,255,255,0.1); 
            backdrop-filter: blur(20px);
            -webkit-backdrop-filter: blur(20px);
            position: relative;
        }
        /* 底部的大按钮类 */
        .u-btn {
            @extend .glass-btn-base;
            padding: 8px 16px;
            border-radius: 12px;
            height: 36px;
        }

        .tex-resize-handle { position: absolute; bottom: 0; right: 0; width: 24px; height: 24px; cursor: se-resize; z-index: 20; }
        .tex-resize-handle::after {
            content: ""; position: absolute; bottom: 6px; right: 6px; width: 10px; height: 10px;
            border-bottom: 2px solid #bbb; border-right: 2px solid #bbb; border-radius: 0 0 2px 0;
        }

        /* --- 设置面板 --- */
        #tex-settings {
            display: none; position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%);
            width: 420px; 
            background: rgba(255,255,255,0.3); 
            backdrop-filter: saturate(200%) blur(50px);
            -webkit-backdrop-filter: saturate(200%) blur(50px);
            border: 1px solid rgba(255,255,255,0.6); border-radius: 24px; 
            box-shadow: 0 40px 90px rgba(0,0,0,0.2),
                        0 0 0 1px rgba(255, 255, 255, 0.3) inset; 
            z-index: 2147483647;
            animation: popIn 0.4s ${IOS_EASE};
        }
        @keyframes popIn { from { opacity:0; transform:translate(-50%, -50%) scale(0.9); } to { opacity:1; transform:translate(-50%, -50%) scale(1); } }
        
        .tex-settings-head { height: 50px; padding: 0 16px; border-bottom: 1px solid rgba(0,0,0,0.05); display: flex; align-items: center; justify-content: space-between; }
        .tex-settings-body { padding: 20px; display: grid; gap: 16px; }
        .tex-setting-row { display: grid; grid-template-columns: 100px 1fr; align-items: center; gap: 12px; }
        .tex-setting-row label { color: #333; font-size: 13px; font-weight: 500; }
        .tex-setting-row input { 
            height: 36px; border-radius: 10px; 
            border: 1px solid rgba(0,0,0,0.08); 
            padding: 0 12px; font-size: 13px; 
            background: rgba(255,255,255,0.2); 
            backdrop-filter: blur(15px);
            -webkit-backdrop-filter: blur(15px);
            color: #1d1d1f;
            transition: all 0.2s;
        }
        .tex-setting-row input:focus { 
            background: rgba(255,255,255,0.5); 
            border-color: #007AFF; 
            box-shadow: 0 0 0 3px rgba(0,122,255,0.15); 
            outline: none; 
        }
        .tex-settings-foot { padding: 14px 20px; border-top: 1px solid rgba(0,0,0,0.05); display: flex; justify-content: flex-end; gap: 10px; }

        /* Toast */
        #apple-toast {
            position: fixed; top: 40px; left: 50%; transform: translateX(-50%) translateY(-20px) scale(0.9);
            background: rgba(255,255,255,0.35); 
            backdrop-filter: blur(40px) saturate(200%);
            -webkit-backdrop-filter: blur(40px) saturate(200%);
            color: #1d1d1f; 
            padding: 12px 24px; border-radius: 50px;
            box-shadow: 0 15px 45px rgba(0,0,0,0.15),
                        0 0 0 1px rgba(255,255,255,0.4) inset; 
            border: 1px solid rgba(255,255,255,0.6);
            font-size: 14px; font-weight: 500; 
            text-shadow: 0 1px 2px rgba(255, 255, 255, 0.8);
            opacity: 0; pointer-events: none; 
            transition: all 0.5s ${IOS_BOUNCE}; z-index: 2147483647;
            display: flex; align-items: center; gap: 8px;
        }
        #apple-toast.show { opacity: 1; transform: translateX(-50%) translateY(0) scale(1); }

        /* ==========================================
           深色模式适配 (Dark Mode)
        ========================================== */
        @media (prefers-color-scheme: dark) {
            /* 按钮基底 - 深色版 */
            .glass-btn-base {
                background: rgba(255, 255, 255, 0.1);
                border-color: rgba(255, 255, 255, 0.2);
                color: rgba(255, 255, 255, 0.9);
                text-shadow: 0 1px 2px rgba(0, 0, 0, 0.3);
            }
            .glass-btn-base:hover {
                background: rgba(255, 255, 255, 0.15);
                border-color: rgba(255, 255, 255, 0.3);
            }
            .glass-btn-base:active {
                background: rgba(255, 255, 255, 0.08);
            }

            /* 功能按钮 - 深色版 */
            .glass-btn-primary {
                background: rgba(10, 132, 255, 0.25) !important;
                color: #0A84FF !important;
                border-color: rgba(10, 132, 255, 0.4) !important;
            }
            .glass-btn-primary:hover {
                background: rgba(10, 132, 255, 0.35) !important;
            }

            .glass-btn-success {
                background: rgba(48, 209, 88, 0.25) !important;
                color: #30D158 !important;
                border-color: rgba(48, 209, 88, 0.4) !important;
            }
            .glass-btn-success:hover {
                background: rgba(48, 209, 88, 0.35) !important;
            }

            .glass-btn-warning {
                background: rgba(255, 159, 10, 0.25) !important;
                color: #FF9F0A !important;
                border-color: rgba(255, 159, 10, 0.4) !important;
            }
            .glass-btn-warning:hover {
                background: rgba(255, 159, 10, 0.35) !important;
            }

            .glass-btn-secondary {
                background: rgba(255, 255, 255, 0.1) !important;
                color: rgba(255, 255, 255, 0.6) !important;
            }
            .glass-btn-secondary:hover {
                background: rgba(255, 255, 255, 0.15) !important;
                color: rgba(255, 255, 255, 0.9) !important;
            }

            /* 主面板 - 深色版 */
            #univ-tex-panel {
                background: rgba(30, 30, 30, 0.85);
                border-color: rgba(255, 255, 255, 0.15);
                box-shadow: 0 40px 90px rgba(0, 0, 0, 0.6),
                            0 0 0 1px rgba(255, 255, 255, 0.1) inset;
            }

            /* 头部 - 深色版 */
            .tex-panel-head {
                border-bottom-color: rgba(255, 255, 255, 0.08);
            }
            .tex-panel-head h3 {
                color: rgba(255, 255, 255, 0.95);
                text-shadow: 0 1px 2px rgba(0, 0, 0, 0.3);
            }
            .tex-badge {
                background: rgba(255, 255, 255, 0.15);
                color: rgba(255, 255, 255, 0.7);
                text-shadow: 0 0.5px 1px rgba(0, 0, 0, 0.2);
            }

            /* 图标按钮 - 深色版 */
            .btn-icon-glass {
                background: rgba(255, 255, 255, 0.1);
                border-color: rgba(255, 255, 255, 0.2);
                color: rgba(255, 255, 255, 0.7);
                text-shadow: 0 1px 1px rgba(0, 0, 0, 0.2);
            }
            .btn-icon-glass:hover {
                background: rgba(255, 255, 255, 0.2);
                color: rgba(255, 255, 255, 0.95);
            }

            /* 列表项 - 深色版 */
            .tex-item {
                background: rgba(255, 255, 255, 0.08);
                border-color: rgba(255, 255, 255, 0.15);
            }
            .tex-item:hover {
                background: rgba(255, 255, 255, 0.12);
                border-color: rgba(255, 255, 255, 0.25);
            }

            .code-text {
                color: rgba(255, 255, 255, 0.9);
                text-shadow: 0 1px 2px rgba(0, 0, 0, 0.3);
            }

            /* 操作栏 - 深色版 */
            .tex-action-bar {
                background: rgba(0, 0, 0, 0.2);
                border-top-color: rgba(255, 255, 255, 0.1);
            }

            /* 胶囊按钮 - 深色版 */
            .item-btn-pill {
                background: rgba(255, 255, 255, 0.12);
                border-color: rgba(255, 255, 255, 0.2);
                color: rgba(255, 255, 255, 0.7);
                text-shadow: 0 0.5px 1px rgba(0, 0, 0, 0.2);
            }
            .item-btn-pill:hover {
                background: rgba(255, 255, 255, 0.2);
                color: rgba(255, 255, 255, 0.95);
            }
            .btn-locate {
                color: #0A84FF;
            }

            /* 标签 - 深色版 */
            .tag-katex {
                color: #30D158;
                background: rgba(48, 209, 88, 0.2);
            }
            .tag-mathjax {
                color: #0A84FF;
                background: rgba(10, 132, 255, 0.2);
            }
            .tag-img {
                color: #FF9F0A;
                background: rgba(255, 159, 10, 0.2);
            }

            /* 底部栏 - 深色版 */
            .tex-panel-foot {
                background: rgba(0, 0, 0, 0.2);
                border-top-color: rgba(255, 255, 255, 0.1);
            }

            .tex-resize-handle::after {
                border-bottom-color: rgba(255, 255, 255, 0.3);
                border-right-color: rgba(255, 255, 255, 0.3);
            }

            /* 设置面板 - 深色版 */
            #tex-settings {
                background: rgba(30, 30, 30, 0.85);
                border-color: rgba(255, 255, 255, 0.15);
                box-shadow: 0 40px 90px rgba(0, 0, 0, 0.6),
                            0 0 0 1px rgba(255, 255, 255, 0.1) inset;
            }

            .tex-settings-head {
                border-bottom-color: rgba(255, 255, 255, 0.08);
                color: rgba(255, 255, 255, 0.95);
            }

            .tex-setting-row label {
                color: rgba(255, 255, 255, 0.8);
            }

            .tex-setting-row input {
                background: rgba(255, 255, 255, 0.1);
                border-color: rgba(255, 255, 255, 0.15);
                color: rgba(255, 255, 255, 0.9);
            }
            .tex-setting-row input::placeholder {
                color: rgba(255, 255, 255, 0.4);
            }
            .tex-setting-row input:focus {
                background: rgba(255, 255, 255, 0.15);
                border-color: #0A84FF;
                box-shadow: 0 0 0 3px rgba(10, 132, 255, 0.25);
            }

            .tex-settings-foot {
                border-top-color: rgba(255, 255, 255, 0.08);
            }

            /* Toast - 深色版 */
            #apple-toast {
                background: rgba(50, 50, 50, 0.9);
                border-color: rgba(255, 255, 255, 0.2);
                color: rgba(255, 255, 255, 0.95);
                text-shadow: 0 1px 2px rgba(0, 0, 0, 0.3);
                box-shadow: 0 15px 45px rgba(0, 0, 0, 0.5),
                            0 0 0 1px rgba(255, 255, 255, 0.15) inset;
            }

            /* 空状态提示 - 深色版 */
            .tex-empty-tip {
                color: rgba(255, 255, 255, 0.5) !important;
            }
        }
    `);

    // ===========================
    // 2. 逻辑核心
    // ===========================
    function detectMath() {
        const results = [];
        const seen = new Set();
        const add = (source, type, element) => {
            if (!source) return; source = source.trim();
            if (seen.has(source) || source.length < 2) return;
            seen.add(source); results.push({ source, type, element });
        };
        // Detectors
        document.querySelectorAll('.katex').forEach(w => {
            const a = w.querySelector('annotation[encoding="application/x-tex"]');
            if (a) add(a.textContent, 'KaTeX', w);
        });
        document.querySelectorAll('script[type^="math/tex"]').forEach(s => add(s.textContent, 'MathJax', s.parentElement));
        document.querySelectorAll('mjx-container, [role="math"]').forEach(el => {
            const l = el.getAttribute('aria-label');
            if (l) add(l, 'MathJax', el);
            else if (el.dataset.latex) add(el.dataset.latex, 'Data-Attr', el);
        });
        document.querySelectorAll('img').forEach(img => {
            const alt = img.alt || "";
            if ((img.className && img.className.toString().includes('math')) || img.src.includes('latex') || (alt.includes('\\') && alt.length > 5)) add(alt, 'Image', img);
        });
        return results;
    }

    function scrollToElement(el) {
        if (!el) return;
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        el.style.transition = 'all 1s';
        const originalShadow = el.style.boxShadow;
        el.style.boxShadow = '0 0 0 6px rgba(255, 235, 59, 0.6)';
        setTimeout(() => el.style.boxShadow = originalShadow, 1500);
    }

    // ===========================
    // 3. 拖拽与缩放
    // ===========================
    function makeDraggable(el, handle) {
        let isDragging = false, startX, startY, initialLeft, initialTop;
        handle.addEventListener('mousedown', (e) => {
            if (e.target.closest('button')) return;
            isDragging = true; startX = e.clientX; startY = e.clientY;
            const rect = el.getBoundingClientRect(); initialLeft = rect.left; initialTop = rect.top;
            el.style.transform = 'none'; el.style.left = initialLeft + 'px'; el.style.top = initialTop + 'px'; el.style.margin = '0';
            document.body.style.cursor = 'move';
            window.addEventListener('mousemove', onMove); window.addEventListener('mouseup', onUp);
        });
        function onMove(e) { if (!isDragging) return; el.style.left = (initialLeft + (e.clientX - startX)) + 'px'; el.style.top = (initialTop + (e.clientY - startY)) + 'px'; }
        function onUp() { isDragging = false; document.body.style.cursor = 'default'; window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); }
    }

    function makeResizable(el, handle) {
        let isResizing = false, startX, startY, startW, startH;
        handle.addEventListener('mousedown', (e) => {
            e.stopPropagation(); e.preventDefault(); isResizing = true; startX = e.clientX; startY = e.clientY;
            const rect = el.getBoundingClientRect(); startW = rect.width; startH = rect.height;
            document.body.style.cursor = 'se-resize'; window.addEventListener('mousemove', onMove); window.addEventListener('mouseup', onUp);
        });
        function onMove(e) { if (!isResizing) return; el.style.width = Math.max(300, startW + (e.clientX - startX)) + 'px'; el.style.height = Math.max(250, startH + (e.clientY - startY)) + 'px'; }
        function onUp() { isResizing = false; document.body.style.cursor = 'default'; window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); }
    }

    // ===========================
    // 4. 构建 UI (HTML)
    // ===========================
    const btn = document.createElement('div'); btn.id = 'univ-tex-btn'; btn.className = 'apple-tex-root'; btn.innerHTML = '∑';
    document.body.appendChild(btn);

    const panel = document.createElement('div'); panel.id = 'univ-tex-panel'; panel.className = 'apple-tex-root';
    // 注意：buttons 使用新的 glass-btn-base 类
    panel.innerHTML = `
        <div class="tex-panel-head">
            <div class="tex-title-group"><h3>公式探测</h3><span class="tex-badge" id="tex-count">0</span></div>
            <div style="display:flex; align-items:center; gap:8px;">
                <button class="btn-icon-glass" id="tex-open-settings" title="设置">⚙️</button>
                <button class="btn-icon-glass" id="tex-head-close">✕</button>
            </div>
        </div>
        <div class="tex-panel-body" id="tex-p-body"></div>
        <div class="tex-panel-foot">
            <button class="glass-btn-base glass-btn-secondary u-btn" id="tex-p-cancel">关闭</button>
            <button class="glass-btn-base glass-btn-success u-btn" id="tex-recognize-img">🖼️ 图片识别</button>
            <button class="glass-btn-base glass-btn-warning u-btn" id="tex-toggle-paste">📋 粘贴识别: 关</button>
            <button class="glass-btn-base glass-btn-primary u-btn" id="tex-p-copy">复制全部</button>
            <div class="tex-resize-handle"></div>
        </div>`;
    document.body.appendChild(panel);

    const toast = document.createElement('div'); toast.id = 'apple-toast'; toast.className = 'apple-tex-root';
    document.body.appendChild(toast);

    const settings = document.createElement('div'); settings.id = 'tex-settings'; settings.className = 'apple-tex-root';
    settings.innerHTML = `
        <div class="tex-settings-head"><div style="font-weight:600;">API 设置</div><button class="btn-icon-glass" id="tex-settings-close">✕</button></div>
        <div class="tex-settings-body">
            <div class="tex-setting-row"><label>API Key</label><input id="sf-key" type="password" placeholder="SiliconFlow Key" /></div>
            <div class="tex-setting-row"><label>模型名称</label><input id="sf-model" type="text" placeholder="Qwen/Qwen3-VL-8B-Instruct" /></div>
            <div class="tex-setting-row"><label>接口地址</label><input id="sf-endpoint" type="text" placeholder="[https://api.siliconflow.cn/v1](https://api.siliconflow.cn/v1)" /></div>
        </div>
        <div class="tex-settings-foot">
            <button class="glass-btn-base glass-btn-secondary u-btn" id="tex-settings-cancel">取消</button>
            <button class="glass-btn-base glass-btn-primary u-btn" id="tex-settings-save">保存配置</button>
        </div>`;
    document.body.appendChild(settings);

    function showToast(msg, icon='✅') {
        toast.innerHTML = `<span>${icon}</span><span>${msg}</span>`; toast.classList.add('show');
        clearTimeout(toast.timer); toast.timer = setTimeout(() => toast.classList.remove('show'), 2000);
    }

    // ===========================
    // 5. 渲染与事件绑定
    // ===========================
    
    // 上传图片按钮
    document.getElementById('tex-recognize-img').addEventListener('click', () => {
        const inp = document.createElement('input'); inp.type = 'file'; inp.accept = 'image/*'; inp.style.display='none';
        inp.onchange = (e) => { if(e.target.files[0]) processImageRecognition(e.target.files[0]); };
        document.body.appendChild(inp); inp.click(); setTimeout(()=>inp.remove(),100);
    });

    // 自动粘贴开关
    let isPasteEnabled = GM_getValue('PASTE_AUTO_DETECT', false);
    const togglePasteBtn = document.getElementById('tex-toggle-paste');
    function updatePasteState() {
        togglePasteBtn.textContent = isPasteEnabled ? '📋 粘贴识别: 开' : '📋 粘贴识别: 关';
        togglePasteBtn.style.opacity = isPasteEnabled ? '1' : '0.8'; 
        // 样式类已经通过 CSS glass-btn-warning 处理颜色，这里只需微调文字
    }
    updatePasteState();
    togglePasteBtn.addEventListener('click', () => {
        isPasteEnabled = !isPasteEnabled;
        GM_setValue('PASTE_AUTO_DETECT', isPasteEnabled);
        updatePasteState();
        showToast(isPasteEnabled ? 'Ctrl+V 识别已开启' : 'Ctrl+V 识别已关闭', isPasteEnabled?'✅':'⚠️');
    });

    // 全局粘贴监听
    window.addEventListener('paste', (e) => {
        if (!isPasteEnabled) return;
        const items = e.clipboardData?.items || [];
        for (let it of items) {
            if (it.kind === 'file' && it.type.startsWith('image/')) {
                processImageRecognition(it.getAsFile());
                break;
            }
        }
    });

    // 图片处理封装
    async function processImageRecognition(file) {
        showToast('正在识别...', '🖼️');
        try {
            const latex = await recognizeLatexFromImage(file);
            if (!latex) throw new Error('未识别到内容');
            addResultItem(latex, 'Image');
            if(panel.style.display === 'none' || !panel.style.display) openPanel();
            showToast('识别成功', '✨');
        } catch (e) { showToast('识别失败: ' + e.message, '❌'); }
    }

    // 添加单项到列表
    function addResultItem(source, type) {
        const body = document.getElementById('tex-p-body');
        const count = document.getElementById('tex-count');
        
        // 如果是空的提示页，先清空
        if(body.querySelector('.tex-empty-tip')) body.innerHTML = '';
        
        const el = createItemEl({source, type});
        body.prepend(el);
        count.textContent = parseInt(count.textContent||0) + 1;
        
        // 闪烁高亮
        el.style.background = 'rgba(52, 199, 89, 0.3)';
        setTimeout(()=> el.style.background = '', 500);
    }

    function createItemEl(item) {
        const el = document.createElement('div'); el.className = 'tex-item';
        let tagClass = 'tag-katex'; 
        if (item.type.includes('MathJax')) tagClass = 'tag-mathjax'; 
        if (item.type === 'Image') tagClass = 'tag-img';

        el.innerHTML = `
            <div class="tex-content-area" title="点击复制"><div class="code-text">${escapeHtml(item.source)}</div></div>
            <div class="tex-action-bar">
                <span class="tex-tag ${tagClass}">${item.type}</span>
                <div style="display:flex; gap:8px;">
                    <button class="item-btn-pill btn-locate">📍 定位</button>
                    <button class="item-btn-pill btn-copy-one">📋 复制</button>
                </div>
            </div>`;
        
        const copy = (e) => { e.stopPropagation(); GM_setClipboard(item.source); showToast('已复制'); el.style.background = 'rgba(52,199,89,0.2)'; setTimeout(()=>el.style.background='',300); };
        el.querySelector('.tex-content-area').addEventListener('click', copy);
        el.querySelector('.btn-copy-one').addEventListener('click', copy);
        el.querySelector('.btn-locate').addEventListener('click', (e) => { 
            e.stopPropagation(); 
            if(item.element) { scrollToElement(item.element); showToast('已定位'); } 
            else showToast('无法定位来源', '⚠️'); 
        });
        return el;
    }

    function renderList(list) {
        const body = document.getElementById('tex-p-body');
        document.getElementById('tex-count').textContent = list.length;
        body.innerHTML = '';
        if (list.length === 0) {
            body.innerHTML = `<div class="tex-empty-tip" style="text-align:center; padding:60px 20px; color:#999;"><div style="font-size:40px; margin-bottom:10px; opacity:0.6;">👻</div><div>未探测到公式</div><div style="font-size:12px; margin-top:8px; opacity:0.8;">Ctrl+V 粘贴图片试试？</div></div>`;
            return;
        }
        list.forEach(item => body.appendChild(createItemEl(item)));
    }

    // 核心：打开面板逻辑 (修复闪烁)
    function openPanel() {
        const results = detectMath();
        renderList(results);
        
        // 定位修正
        if (panel.style.display !== 'flex') {
            panel.style.display = 'flex';
            // 如果还没被拖拽过（transform 还在），修正位置
            const rect = panel.getBoundingClientRect();
            panel.style.transform = 'none'; // 移除 scale 动画造成的初始 transform
            // 如果是第一次打开，且没有 left/top，则设置为靠巧2%
            if (!panel.style.left) {
                 const winW = window.innerWidth;
                 const winH = window.innerHeight;
                 panel.style.left = (winW * 0.02) + 'px'; // 靠巧2%
                 panel.style.top = (winH * 0.15) + 'px';
            }
            void panel.offsetHeight; 
            panel.classList.add('is-visible');
        }
    }

    // 悬浮球拖拽
    (function() {
        let isDragging = false, hasMoved = false, startX, startY, initL, initT;
        btn.addEventListener('mousedown', (e) => { isDragging = true; hasMoved = false; startX=e.clientX; startY=e.clientY; const r=btn.getBoundingClientRect(); initL=r.left; initT=r.top; document.body.style.cursor='move'; e.preventDefault(); });
        window.addEventListener('mousemove', (e) => { if(!isDragging)return; if(Math.abs(e.clientX-startX)>5||Math.abs(e.clientY-startY)>5){ hasMoved=true; btn.style.left=(initL+e.clientX-startX)+'px'; btn.style.top=(initT+e.clientY-startY)+'px'; btn.style.right='auto'; btn.style.bottom='auto'; } });
        window.addEventListener('mouseup', () => { if(isDragging && !hasMoved) openPanel(); isDragging=false; document.body.style.cursor='default'; });
    })();

    // 绑定关闭、拖拽、缩放
    const closeFunc = () => { panel.classList.remove('is-visible'); setTimeout(() => panel.style.display='none', 300); };
    document.getElementById('tex-head-close').addEventListener('click', closeFunc);
    document.getElementById('tex-p-cancel').addEventListener('click', closeFunc);
    
    document.getElementById('tex-p-copy').addEventListener('click', () => {
        const t = detectMath().map(r => r.source).join('\n\n');
        if(t) { GM_setClipboard(t); showToast('全部已复制'); }
    });

    makeDraggable(panel, panel.querySelector('.tex-panel-head'));
    makeResizable(panel, panel.querySelector('.tex-resize-handle'));

    // 设置面板逻辑
    document.getElementById('tex-open-settings').addEventListener('click', () => {
        const conf = getSFConfig();
        document.getElementById('sf-key').value = conf.apiKey;
        document.getElementById('sf-model').value = conf.model;
        document.getElementById('sf-endpoint').value = conf.endpoint;
        settings.style.display = 'block';
    });
    document.getElementById('tex-settings-close').addEventListener('click', () => settings.style.display='none');
    document.getElementById('tex-settings-cancel').addEventListener('click', () => settings.style.display='none');
    document.getElementById('tex-settings-save').addEventListener('click', () => {
        GM_setValue('SF_API_KEY', document.getElementById('sf-key').value.trim());
        GM_setValue('SF_MODEL', document.getElementById('sf-model').value.trim());
        GM_setValue('SF_API_ENDPOINT', document.getElementById('sf-endpoint').value.trim());
        showToast('设置已保存'); settings.style.display='none';
    });

    function escapeHtml(text) { return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }
})();