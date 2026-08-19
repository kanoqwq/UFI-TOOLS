const isArray = (raw) => {
    let parsed;
    try {
        parsed = JSON.parse(raw);
    } catch (e) {
        parsed = null;
    }
    // 判断是否为数组
    if (Array.isArray(parsed)) {
        return true
    } else {
        return false
    }
}

function gsmDecode(hex) {
    // 去掉空格/换行，并校验
    const clean = hex.replace(/\s+/g, '').toLowerCase();
    if (clean.length % 2 !== 0) throw new Error("Invalid hex: odd length");

    // hex -> bytes
    const bytes = [];
    for (let i = 0; i < clean.length; i += 2) {
        const b = parseInt(clean.slice(i, i + 2), 16);
        if (Number.isNaN(b)) throw new Error("Invalid hex: contains non-hex chars");
        bytes.push(b);
    }

    if (bytes.length % 2 !== 0) throw new Error("Invalid data: odd byte length for UTF-16BE");

    // UTF-16BE bytes -> JS string (code units)
    const codeUnits = [];
    for (let i = 0; i < bytes.length; i += 2) {
        const codeUnit = (bytes[i] << 8) | bytes[i + 1];
        codeUnits.push(codeUnit);
    }

    // 拼回字符串：代理对会自动合成
    return String.fromCharCode(...codeUnits);
}

function openLink(link) {
    if (!link) return
    const a = document.createElement('a')
    a.href = link
    a.target = "_blank"
    a.click()
}

//检测是否启用高级功能
const checkAdvancedFunc = async () => {
    const res = await runShellWithRoot('whoami')
    if (res.content) {
        if (res.content.includes('root')) {
            return true
        }
    }
    return false
}

function requestInterval(callback, interval) {
    let lastTime = 0;
    let timeoutId = null;

    function loop(timestamp) {
        if (!lastTime) lastTime = timestamp; // 初始化上次时间
        const delta = timestamp - lastTime; // 计算时间差

        if (delta >= interval) {
            callback(); // 执行任务
            lastTime = timestamp; // 更新上次时间
        }

        timeoutId = requestAnimationFrame(loop); // 继续请求下一帧
    }

    timeoutId = requestAnimationFrame(loop); // 启动动画循环

    // 返回清除函数
    return () => cancelAnimationFrame(timeoutId);
}

function copyText(e) {
    const text = e.target.innerText;
    if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
        // 浏览器支持
        navigator.clipboard.writeText(text).then(() => {
            createToast(t('copy_success'), 'green')
        }).catch(err => {
            createToast(t('copy_failed'), 'red')
        });
    } else {
        // 创建text area
        let textArea = document.createElement("textarea");
        textArea.value = text;
        // 使text area不在viewport，同时设置不可见
        textArea.style.position = "absolute";
        textArea.style.opacity = 0;
        textArea.style.left = "-999999px";
        textArea.style.top = "-999999px";
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();
        return new Promise((res, rej) => {
            // 执行复制命令并移除文本框
            document.execCommand('copy') ? res() : rej();
            textArea.remove();
        }).then(() => {
            createToast(t('copy_success'), 'green')
        }).catch(() => {
            createToast(t('copy_failed'), 'red')
        });
    }
}

//按照信号dbm强度绘制信号强度栏(-113到-51)
function kano_parseSignalBar(val, min = -125, max = -81, green_low = -90, yellow_low = -100, config = { g: 'green', o: 'orange', r: 'red' }, suffix = '') {
    if (!config) {
        config = { g: 'green', o: 'orange', r: 'red' }
    }
    let strength = Number(val)
    strength = strength > max ? max : strength
    strength = strength < min ? min : strength
    const bar = document.createElement('span')
    const strengths = Array.from({ length: Math.abs((min - max)) + 1 }, (_, i) => min + i);
    const index = strengths.findIndex(i => i >= strength) // 找到对应的索引
    const percent = ((index + 1) / strengths.length) * 100 // 计算百分比
    const progress = document.createElement('span')
    const text = document.createElement('span')

    text.innerHTML = `${val}${suffix}`
    bar.className = 'signal_bar'
    text.className = 'text'
    progress.className = 'signal_bar_progress'
    progress.style.transition = 'all 0.5s'
    progress.style.width = `${percent}%`
    progress.style.opacity = '.6'

    if (strength >= green_low) {
        progress.style.backgroundColor = config.g || 'green';
    } else if (strength >= yellow_low) {
        progress.style.backgroundColor = config.o || 'orange';
    } else {
        progress.style.backgroundColor = config.r || 'red';
    }

    bar.appendChild(progress)
    bar.appendChild(text)
    return bar.outerHTML
}

function kano_getSignalEmoji(strength) {
    const signals = ["📶 ⬜⬜⬜⬜", "📶 🟨⬜⬜⬜", "📶 🟩🟨⬜⬜", "📶 🟩🟩🟨⬜", "📶 🟩🟩🟩🟨", "📶 🟩🟩🟩🟩"];
    return `${strength} ${signals[Math.max(0, Math.min(strength, 5))]}`; // 确保输入在 0-5 之间
}

function kano_formatTime(seconds) {
    if (seconds < 60) {
        return `${seconds} ${t('seconds')}`;
    } else if (seconds < 3600) {
        return `${(seconds / 60).toFixed(1)} ${t('minutes')}`;
    } else {
        return `${(seconds / 3600).toFixed(1)} ${t('hours')}`;
    }
}

function formatBytes(bytes, needTrim = false) {
    if (bytes === 0) return ' 0.00 B';
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    let size = (bytes / Math.pow(1024, i)).toFixed(2)
    let str = String(size);
    if (needTrim) {
        if (size < 10) {
            str = '&nbsp;&nbsp;&nbsp;' + String(size);
        } else if (size < 100) {
            str = '&nbsp;&nbsp;' + String(size);
        } else if (size < 1000) {
            str = '&nbsp;' + String(size);
        }
    }
    return `${str} ${sizes[i]}`;
}

function decodeBase64(base64String) {
    // 将Base64字符串分成每64个字符一组
    const padding = base64String.length % 4 === 0 ? 0 : 4 - (base64String.length % 4)
    base64String += '='.repeat(padding)

    // 使用atob()函数解码Base64字符串
    const binaryString = window.atob(base64String)

    // 将二进制字符串转换为TypedArray
    const bytes = new Uint8Array(binaryString.length)
    for (let i = 0; i < binaryString.length; i++) bytes[i] = binaryString.charCodeAt(i)

    // 将TypedArray转换为字符串
    return new TextDecoder('utf-8').decode(bytes)
}

function encodeBase64(plainText) {
    // 将字符串转为 Uint8Array（二进制形式）
    const bytes = new TextEncoder().encode(plainText)

    // 把二进制转换为字符串（每个字节对应一个字符）
    let binaryString = ''
    for (let i = 0; i < bytes.length; i++) {
        binaryString += String.fromCharCode(bytes[i])
    }

    // 使用 btoa() 编码为 Base64
    return window.btoa(binaryString)
}

function createToast(text, color, delay = 3000, fn = null) {
    try {
        const toastContainer = document.querySelector("#toastContainer")
        const toastEl = document.createElement('div')
        toastEl.style.padding = '10px'
        toastEl.style.fontSize = '13px'
        toastEl.style.width = "fit-content"
        toastEl.style.position = "relative"
        toastEl.style.top = "0px"
        toastEl.style.color = color || 'while'
        toastEl.style.backgroundColor = 'var(--dark-card-bg)'
        toastEl.style.transform = `scale(1)`
        toastEl.style.transition = `all .3s ease`
        toastEl.style.opacity = `0`
        toastEl.style.transform = `scale(0)`
        toastEl.style.transformOrigin = 'top center'
        toastEl.style.boxShadow = '0 0 10px 0 #00000076'
        toastEl.style.fontWeight = 'bold'
        toastEl.style.backdropFilter = 'blur(10px)'
        toastEl.style.borderRadius = '6px'
        toastEl.innerHTML = text;
        const id = 'toastkano'
        toastEl.setAttribute('class', id);
        toastContainer.appendChild(toastEl)
        setTimeout(() => {
            toastEl.style.opacity = `1`
            toastEl.style.transform = `scale(1)`
        }, 50);
        let timer = null
        setTimeout(() => {
            toastEl.style.opacity = `0`
            toastEl.style.transform = `scale(0)`
            toastEl.style.top = '-' + toastEl.getBoundingClientRect().height + 'px'
            clearTimeout(timer)
            timer = setTimeout(() => {
                toastContainer.removeChild(toastEl)
                if (fn && typeof fn === 'function') {
                    fn()
                }
            }, 300);
        }, delay);
    } catch (e) {
        console.error('创建toast失败:', e);
    }
}

function createFixedToast(_id, text, style = {}) {
    try {
        const oldEl = document.getElementById(_id)
        if (oldEl) {
            oldEl.remove()
        }
        const toastContainer = document.querySelector("#toastContainer")
        const toastEl = document.createElement('div')
        toastEl.id = _id
        toastEl.style.padding = '10px'
        toastEl.style.fontSize = '13px'
        toastEl.style.width = "fit-content"
        toastEl.style.position = "relative"
        toastEl.style.top = "0px"
        toastEl.style.backgroundColor = 'var(--dark-card-bg)'
        toastEl.style.transform = `scale(1)`
        toastEl.style.transition = `all .3s ease`
        toastEl.style.opacity = `0`
        toastEl.style.transform = `scale(0)`
        toastEl.style.transformOrigin = 'top center'
        toastEl.style.boxShadow = '0 0 10px 0 #00000076'
        toastEl.style.fontWeight = 'bold'
        toastEl.style.backdropFilter = 'blur(10px)'
        toastEl.style.borderRadius = '6px'
        if (style && typeof style === 'object') {
            Object.entries(style).forEach(([key, value]) => {
                if (toastEl.style[key]) {
                    toastEl.style[key] = value
                }
            })
        }
        toastEl.innerHTML = text;
        const id = 'toastkano'
        toastEl.setAttribute('class', id);
        toastContainer.appendChild(toastEl)
        setTimeout(() => {
            toastEl.style.opacity = `1`
            toastEl.style.transform = `scale(1)`
        }, 50);
        let timer = null
        return {
            el: toastEl,
            close: () => {
                toastEl.style.opacity = `0`
                toastEl.style.transform = `scale(0)`
                toastEl.style.top = '-' + toastEl.getBoundingClientRect().height + 'px'
                clearTimeout(timer)
                timer = setTimeout(() => {
                    toastEl.remove()
                }, 300);
            }
        }
    } catch (e) {
        console.error('创建toast失败:', e);
    }
}

let modalTimer = null
function closeModal(txt, time = 300, cb = null) {
    if (txt == '#smsList') smsSender && smsSender()
    let el = document.querySelector(txt)
    if (!el) return
    el.style.opacity = 0
    modalTimer && clearTimeout(modalTimer)
    modalTimer = setTimeout(() => {
        el.style.display = 'none'
        setTimeout(() => {
            cb && cb()
        }, 30)
    }, time)
}

function showModal(txt, time = 300, opacity = '1') {
    let el = document.querySelector(txt)
    if (!el) return
    el.style.opacity = 0
    el.style.display = ''
    setTimeout(() => {
        el.style.opacity = opacity
    }, 10)
}

const debounce = (func, delay) => {
    let timer;
    return function (...args) {
        if (timer) clearTimeout(timer);
        timer = setTimeout(() => {
            func.apply(this, args);
        }, delay);
    };
};

function hsvToRgb(h, s, v) {
    let c = v * s;
    let x = c * (1 - Math.abs((h / 60) % 2 - 1));
    let m = v - c;
    let r = 0, g = 0, b = 0;

    if (h < 60) [r, g, b] = [c, x, 0];
    else if (h < 120) [r, g, b] = [x, c, 0];
    else if (h < 180) [r, g, b] = [0, c, x];
    else if (h < 240) [r, g, b] = [0, x, c];
    else if (h < 300) [r, g, b] = [x, 0, c];
    else[r, g, b] = [c, 0, x];

    return {
        r: Math.round((r + m) * 255),
        g: Math.round((g + m) * 255),
        b: Math.round((b + m) * 255)
    };
}

function hsvToHsl(h, s, v) {
    // h: 0–360, s: 0–1, v: 0–1
    const l = v * (1 - s / 2);
    const sl = (l === 0 || l === 1) ? 0 : (v - l) / Math.min(l, 1 - l);
    return {
        h: h,
        s: sl * 100,
        l: l * 100
    };
}

// 创建一个开关
function createSwitch({ text, value, className = '', onChange, fontSize = 14 }) {
    const container = document.createElement('div');
    container.className = 'Switch';
    container.style.fontSize = fontSize + 'px';

    const label = document.createElement('label');
    label.style.display = 'flex';
    label.className = `outer ${className}`;

    const span = document.createElement('span');
    span.className = 'text';
    span.textContent = text;

    const switchDiv = document.createElement('div');
    switchDiv.className = 'switch text-center p-2';
    if (value) switchDiv.classList.add('active');

    const dot = document.createElement('div');
    dot.className = 'dot';
    switchDiv.appendChild(dot);

    const input = document.createElement('input');
    input.type = 'checkbox';
    input.checked = value;
    input.className = 'inline-block w-5 h-5 align-sub';

    function updateSwitchVisual(checked) {
        input.checked = checked;
        if (checked) {
            switchDiv.classList.add('active');
        } else {
            switchDiv.classList.remove('active');
        }
    }

    input.addEventListener('click', (e) => {
        const checked = e.target.checked;
        updateSwitchVisual(checked);
        onChange?.(checked);
    });

    label.appendChild(span);
    label.appendChild(switchDiv);
    label.appendChild(input);
    container.appendChild(label);

    // 添加 update 方法到容器上，供外部使用
    container.update = updateSwitchVisual;

    return container;
}


const createCollapseObserver = (boxEl = null) => {
    try {
        if (!boxEl) return
        const box = boxEl.querySelector('.collapse_box')
        const resizeObserver = new ResizeObserver(() => {
            const value = boxEl.getAttribute('data-name');
            if (!box || value != 'open') return
            boxEl.style.height = box.getBoundingClientRect().height + 'px'
        });
        resizeObserver.observe(box);
        const observer = new MutationObserver((mutationsList) => {
            for (const mutation of mutationsList) {
                if (
                    mutation.type === 'attributes' &&
                    mutation.attributeName === 'data-name'
                ) {
                    const newValue = boxEl.getAttribute('data-name');
                    if (!box) return
                    if (newValue == 'open') {
                        boxEl.style.height = box.getBoundingClientRect().height + 'px'
                        boxEl.style.overflow = 'hidden'
                    } else {
                        boxEl.style.height = '0'
                        boxEl.style.overflow = 'hidden'
                    }
                }
            }
        })
        observer.observe(boxEl, {
            attributes: true, // 监听属性变化
            attributeFilter: ['data-name'], // 只监听 data-name 属性
        });
        return {
            el: boxEl
        }
    } catch (e) {
        console.error('createCollapseObserver error:', e);
    }
}

const collapseGen = (btn_id, collapse_id, storName, callback = undefined) => {
    try {
        const { el: collapseMenuEl } = createCollapseObserver(document.querySelector(collapse_id));
        if (storName) {
            const storVal = localStorage.getItem(storName)
            if (storVal) {
                collapseMenuEl.dataset.name = storVal;
                localStorage.setItem(storName, storVal)
            } else {
                collapseMenuEl.dataset.name = 'open';
                localStorage.setItem(storName, 'open')
            }
        } else {
            collapseMenuEl.dataset.name = 'open'; // 默认打开
        }
        const collapseBtn = document.querySelector(btn_id);
        const switchComponent = createSwitch({
            value: collapseMenuEl.dataset.name == 'open',
            className: storName || collapse_id,
            onChange: (newVal) => {
                if (collapseMenuEl && collapseMenuEl.dataset) {
                    collapseMenuEl.dataset.name = newVal ? 'open' : 'close';
                    callback && callback(newVal ? 'open' : 'close');
                    if (storName) {
                        localStorage.setItem(storName, collapseMenuEl.dataset.name);
                    }
                }
            }
        });

        // 用 container.update 来同步状态
        const observer = new MutationObserver(() => {
            const newVal = collapseMenuEl.dataset.name === 'open';
            switchComponent.update?.(newVal);
        });
        observer.observe(collapseMenuEl, {
            attributes: true,
            attributeFilter: ['data-name'],
        });

        collapseBtn.appendChild(switchComponent);
    } catch (e) {
        console.error('collapseGen error:', e);
    }
};

//inputIMEI
const inputIMEIAT = () => {
    document.querySelector('#AT_INPUT').value = `AT+SPIMEI=0,"${t('your_new_imei')}"`
}

//提取apk中日期与时间
const getApkDate = (filename = null) => {
    if (!filename) return {
        date_str: null,
        date_obj: null,
        formatted_date: null
    }
    const match = filename.match(/(\d{8}_\d{4})/);
    if (match) {
        const datetimeStr = match[1];
        const [datePart, timePart] = datetimeStr.split('_');

        const year = datePart.slice(0, 4);
        const month = datePart.slice(4, 6);
        const day = datePart.slice(6, 8);
        const hour = timePart.slice(0, 2);
        const minute = timePart.slice(2, 4);

        const formatted = `${year}-${month}-${day} ${hour}:${minute}`;
        const formatted_date = `${year}${month}${day}`;
        const date_obj = new Date(`${year}-${month}-${day}T${hour}:${minute}:00`);
        return {
            date_str: formatted,
            date_obj,
            formatted_date
        }

    } else {
        return {
            date_str: null,
            date_obj: null,
            formatted_date: null
        }
    }
}

const isValidIP = (ip) => {
    const regex = /^(25[0-5]|2[0-4]\d|1\d{2}|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d{2}|[1-9]?\d)){3}$/;
    return regex.test(ip);
}

const isValidSubnetMask = (mask) => {
    return [
        "255.0.0.0", "255.128.0.0",
        "255.192.0.0", "255.224.0.0", "255.240.0.0", "255.248.0.0", "255.252.0.0",
        "255.254.0.0", "255.255.0.0", "255.255.128.0", "255.255.192.0",
        "255.255.224.0", "255.255.240.0", "255.255.248.0", "255.255.252.0",
        "255.255.254.0", "255.255.255.0", "255.255.255.128", "255.255.255.192",
        "255.255.255.224", "255.255.255.240", "255.255.255.248",
        "255.255.255.252", "255.255.255.254"
    ].includes(mask);
}

const ipToInt = (ip) => {
    return ip.split('.').reduce((res, octet) => (res << 8) + parseInt(octet), 0);
}

const isSameSubnet = (ip1, ip2, netmask) => {
    return (ipToInt(ip1) & ipToInt(netmask)) === (ipToInt(ip2) & ipToInt(netmask));
}

const getNetworkAddress = (ip, mask) => {
    return intToIp(ipToInt(ip) & ipToInt(mask));
}

const getBroadcastAddress = (ip, mask) => {
    return intToIp((ipToInt(ip) & ipToInt(mask)) | (~ipToInt(mask) >>> 0));
}

const intToIp = (int) => {
    return [
        (int >>> 24) & 255,
        (int >>> 16) & 255,
        (int >>> 8) & 255,
        int & 255
    ].join('.');
}

//获取字体颜色
const getTextColor = () => getComputedStyle(document.documentElement)
    .getPropertyValue('--dark-text-color')
    .trim();

// chart.js插件合集
const centerTextPlugin = {
    id: 'centerText',
    afterDatasetsDraw: (chart) => {
        const {
            ctx,
            chartArea: { left, right, top, bottom }
        } = chart;

        const width = right - left;
        const height = bottom - top;

        ctx.save();
        ctx.font = 'bold 14px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        const displayLines = chart.config.options.plugins.centerText?.text || [];

        const lineHeight = 18;
        const totalHeight = displayLines.length * lineHeight;
        const startY = top + (height - totalHeight) / 2 + lineHeight / 2;

        displayLines.forEach((lineObj, i) => {
            const color = lineObj.color || getTextColor();
            ctx.fillStyle = color;
            ctx.fillText(lineObj.text, left + width / 2, startY + i * lineHeight);
        });

        ctx.restore();
    }
};

Chart.register(centerTextPlugin);

const getRefteshRate = (cb) => {
    const rate = localStorage.getItem("refreshRate")

    let rate_num = null
    if (rate == null || rate == undefined || isNaN(Number(rate))) {
        rate_num = 1000
    } else {
        rate_num = Number(rate)
    }
    cb && cb(rate_num)
    return rate_num
}

// 特定模态框模糊区域点击关闭
Array.from(document.querySelectorAll('.mask'))?.forEach(el => {
    el.onclick = (e) => {
        e.stopPropagation()
        const classList = Array.from(e?.target?.classList || [])
        const id = e.target.id
        //维护一个黑名单，黑名单内的模态框不受影响
        const blackList = ["AddTaskModal", 'updateSoftwareModal', "plugin_store", "APNViewModal", "APNEditModal", "advanceModal"]
        const isCloseable = !blackList.includes(id)
        if (classList && classList.includes('mask') && isCloseable) {
            if (id) {
                closeModal(`#${id}`);
            }
        }
    }
})


//传入css变量返回颜色
const getCssVariableColor = (variableName) => {
    const color = getComputedStyle(document.documentElement)
        ?.getPropertyValue(variableName)
        ?.trim();
    return color
}

const scroolToTop = () => {
    document.querySelector('.container').scrollTo({
        top: 0,
        behavior: "smooth",
    })
}

//下载url
const downloadUrl = (url, filename) => {
    const a = document.createElement('a')
    a.href = url
    a.download = filename || url.split('/').pop() || 'download'
    a.style.display = 'none'
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    createToast(t('download_ing'), 'pink')
}

//获取浏览器版本号
function getBrowserVersion() {
    const ua = navigator.userAgent;

    const browsers = [
        { name: 'Edge', regex: /Edg\/([\d.]+)/ },
        { name: 'Opera', regex: /OPR\/([\d.]+)/ },
        { name: 'Brave', regex: /Brave\/([\d.]+)/ },
        { name: 'Chrome', regex: /Chrome\/([\d.]+)/ },
        { name: 'Firefox', regex: /Firefox\/([\d.]+)/ },
        { name: 'Safari', regex: /Version\/([\d.]+).*Safari/ },
        { name: 'Samsung Internet', regex: /SamsungBrowser\/([\d.]+)/ },
        { name: 'QQBrowser', regex: /QQBrowser\/([\d.]+)/ },
        { name: 'UC Browser', regex: /UCBrowser\/([\d.]+)/ },
        { name: 'Baidu Browser', regex: /(?:BIDUBrowser|baidubrowser)\/([\d.]+)/i },
        { name: 'Mi Browser', regex: /MiuiBrowser\/([\d.]+)/ },
        { name: 'Huawei Browser', regex: /HuaweiBrowser\/([\d.]+)/ },
        { name: 'Vivo Browser', regex: /VivoBrowser\/([\d.]+)/ },
        { name: 'OPPO Browser', regex: /HeyTapBrowser\/([\d.]+)/ },
        { name: '360SE', regex: /360SE/ },
        { name: '360EE', regex: /360EE/ },
        { name: 'Sogou Browser', regex: /SogouMobileBrowser\/([\d.]+)/ },
    ];

    for (const browser of browsers) {
        const match = ua.match(browser.regex);
        if (match) {
            return {
                browser: browser.name,
                version: match[1] || 'unknown'
            };
        }
    }

    return {
        browser: 'Unknown',
        version: 'Unknown'
    };
}

const bandTableTrList = document.querySelectorAll('#bandTable tr')
const selectAllBandChkBox = document.querySelector('#selectAllBand')

const toggleAllBandBox = (checked = false) => {
    if (bandTableTrList) {
        bandTableTrList.forEach(el => {
            const input = el.querySelector('input')
            if (input) {
                input.checked = checked
            }
        })
    }
}

const checkBandSelect = () => {
    if (bandTableTrList && bandTableTrList.length) {
        let flagCount = 0
        bandTableTrList.forEach(el => {
            const input = el.querySelector('input')
            if (input.checked) {
                flagCount++
            }
        })
        if (flagCount == bandTableTrList.length) {
            //全选开关为真
            selectAllBandChkBox.checked = true
        } else {
            //全选开关为假
            selectAllBandChkBox.checked = false
        }
    }
}

if (bandTableTrList && bandTableTrList.length) {
    bandTableTrList.forEach(el => {
        const input = el.querySelector('input')
        if (input) {
            input.onclick = (e) => {
                e.stopPropagation()
                checkBandSelect()
            }
            el.onclick = () => {
                input.click()
            }
        }
    })
}

if (selectAllBandChkBox) {
    selectAllBandChkBox.onclick = (e) => {
        const checked = e.target.checked
        toggleAllBandBox(checked)
    }
}

const isPromise = (obj = null) => {
    if (!obj) return false
    return obj !== null && (
        (obj instanceof Promise) ||
        ((typeof obj === 'object' || typeof obj === 'function') && typeof obj.then === 'function') ||
        Object.prototype.toString.call(obj) === '[object AsyncFunction]'
    )
}

const createModal = ({ name, noBlur, isMask, title, titleI18nKey = "", maxWidth, content, contentStyle, showConfirm = true, confirmBtnText = t('submit_btn'), closeBtnText = t('close_btn'), onClose, onConfirm }) => {
    const html = `
    <div class="title" style="width: 100%;display: flex;justify-content:space-between;">
    <span data-i18n="${titleI18nKey}">${title}</span>
    </div>
    <div class="content" style="${contentStyle ? contentStyle : ''};margin:10px 0;">
       ${content}
    </div>
    <div class="btn" style="text-align: right;margin-top: 6px;">
        ${showConfirm ? `<button id="${name}_confirm" type="button" >${confirmBtnText}</button>` : ''}
        <button id="${name}_close" type="button" >${closeBtnText}</button>
    </div>
`

    const container = document.querySelector('#BG_OVERLAY .container')
    if (container) {
        let mod = document.createElement('div')
        mod.id = name
        if (isMask) {
            mod.className = 'mask'
            mod.style.display = 'none'
            mod.onclick = (e) => {
                if (noBlur) return
                e.preventDefault()
                e.stopPropagation()
                if (e.target.id == name) {
                    if (onClose) {
                        let res = onClose()
                        if (res) {
                            closeModal("#" + name)
                            debounceRemoveEl()
                        }
                    }
                }
            }
            const inner = document.createElement('div')
            inner.style.maxWidth = maxWidth ? maxWidth : '600px'
            inner.style.width = "90%"
            inner.className = 'modal'
            mod.appendChild(inner)
            inner.innerHTML = html
        } else {
            mod.className = 'modal'
            mod.style.display = 'none'
            mod.style.maxWidth = maxWidth ? maxWidth : '600px'
            mod.style.width = "80%"
            mod.innerHTML = html
        }

        const confirm = mod.querySelector(`#${name}_confirm`)
        const close = mod.querySelector(`#${name}_close`)
        if (confirm && showConfirm) {
            confirm.onclick = async (e) => {
                e.preventDefault()
                if (onConfirm) {
                    let res = null
                    if (isPromise(onConfirm)) {
                        res = await onConfirm()
                    } else {
                        res = onConfirm()
                    }
                    if (res) {
                        closeModal("#" + name, 300, () => {
                            mod.remove()
                        })
                    }
                }
            }
        }
        if (close) {
            close.onclick = async (e) => {
                e.preventDefault()
                if (onClose) {
                    let res = null
                    if (isPromise(onClose)) {
                        res = await onClose()
                    } else {
                        res = onClose()
                    }
                    if (res) {
                        closeModal("#" + name, 300, () => {
                            mod.remove()
                        })
                    }
                }
            }
        }

        container.appendChild(mod)
        return {
            el: mod,
            id: "#" + name
        }
    }
}

// 安全DOM
const parseDOM = (text) => {
    try {
        const parser = new DOMParser();
        const doc = parser.parseFromString(text, 'text/html');
        // 获取除了 script 的其他内容
        let clone = doc.body.cloneNode(true);
        clone.querySelectorAll('script').forEach(el => el.remove());
        const remainingHTML = clone.innerHTML.trim();

        return { text: remainingHTML };
    } catch (e) {
        return { text: "" };
    }
};

const fillCurl = (kind) => {
    const curl_text = document.querySelector('#curl_text')
    let message = ''
    switch (kind) {
        case 'tg':
            message = message = t('tg_sms_help')
            curl_text.value = `curl -s -X POST https://api.telegram.org/bot<你的token>/sendMessage -H "Content-Type: application/json" -d '{"chat_id":<你的聊天会话id>,"text":"{{sms-body}} {{sms-time}} {{sms-from}}","parse_mode":"markdown"}'`
            break;
        case 'wechat':
            message = t('wechat_sms_help')
            curl_text.value = `curl -X POST "https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=<输入你的key>" -H "Content-Type: application/json" -d '{"msgtype": "text", "text": {"content": "【号码】{{sms-from}}\\n【短信内容】{{sms-body}}\\n【时间】{{sms-time}}"}}'`
            break;
        case 'pushplus':
            message = t('pushplus_sms_help')
            curl_text.value = `curl -s -X POST https://www.pushplus.plus/send/  -H "Content-Type: application/x-www-form-urlencoded" -d "token=<你的token>&title=有新消息！！&content=**【短信内容】**%0A{{sms-body}}%0A%0A**【时间】**%0A{{sms-time}}%0A%0A**【号码】**%0A{{sms-from}}&template=markdown"`
            break;
        case 'bark':
            message = t('bark_sms_help')
            curl_text.value = `curl -X "POST" "https://api.day.app/<你的token>/" -H 'Content-Type: application/json; charset=utf-8' -d '{"body": "【短信内容】{{sms-body}}\\n【时间】{{sms-time}}", "title":"{{sms-from}}", "group": "UFI-TOOLS_SMS", "isArchive":1}'`
            break;

    }

    const { el, close } = createFixedToast('kano_message', `
                    <div style="pointer-events:all;width:80vw;max-width:300px">
                        <div class="title" style="margin:0" data-i18n="system_notice">💡 Tips</div>
                        <div style="margin:10px 0;font-size:.64rem;max-height:300px;overflow:auto" id="kano_message_inner">${message}</div>
                        <div style="text-align:right">
                            <button style="font-size:.64rem" id="close_message_btn" data-i18n="close_btn">${t('close_btn')}</button>
                        </div>
                    </div>
                    `)
    const btn = el.querySelector('#close_message_btn')
    if (!btn) {
        close()
    } else {
        btn.onclick = () => {
            close()
        }
    }

}

const checkBroswer = () => {
    const result = getBrowserVersion();
    console.log(`${result.browser} ${result.version}`);
    let ignoreBrowserCheckAlert = localStorage.getItem('ignoreBrowserCheckAlert') == '1';
    let isShowedBrowserCheckAlert = localStorage.getItem('isShowedBrowserCheckAlert') == '1';

    if (ignoreBrowserCheckAlert != '1') {
        if (result.browser === "Chrome") {
            const versionParts = result.version.split('.');
            const majorVersion = parseInt(versionParts[0], 10);
            if (majorVersion <= 100) {
                if (!isShowedBrowserCheckAlert) {
                    createToast(`${t('your')}${result.browser}${t('browser_version_low')}`, 'pink', 10000);
                }
                localStorage.setItem('isShowedBrowserCheckAlert', '1')
            }
            if (majorVersion <= 92) {
                alert(`${t('your')}${result.browser}${t('browser_version_very_low')}`);
            }
        } else if (result.browser === "Firefox") {
            const versionParts = result.version.split('.');
            const majorVersion = parseInt(versionParts[0], 10);
            if (majorVersion <= 100) {
                if (!isShowedBrowserCheckAlert) {
                    createToast(`${t('your')}${result.browser}${t('browser_version_low')}`, 'pink', 10000);
                }
                localStorage.setItem('isShowedBrowserCheckAlert', '1')
            }
            if (majorVersion <= 92) {
                alert(`${t('your')}${result.browser}${t('browser_version_very_low')}`);
            }
        } else if (result.browser === "Safari") {
            //需要大于17.5
            const versionParts = result.version.split('.');
            const majorVersion = parseInt(versionParts[0], 10);
            if (majorVersion <= 15.4) {
                if (!isShowedBrowserCheckAlert) {
                    createToast(`${t('your')}${result.browser}${t('browser_version_low')}`, 'pink', 10000);
                }
                localStorage.setItem('isShowedBrowserCheckAlert', '1')
            }
            if (majorVersion <= 14.1) {
                alert(`${t('your')}${result.browser}${t('browser_version_very_low')}`);
            }
        }
    }
}

const showLoginHelp = () => {
    const message = t("login_help_text").replaceAll('\n', "<br>")
    const { el, close } = createFixedToast('kano_login_help_message', `
                    <div style="pointer-events:all;width:80vw;max-width:600px">
                        <div class="title" style="margin:0">🔑 登录帮助说明</div>
                        <div style="margin:10px 0;max-height:400px;overflow:auto">${message}</div>
                        <div style="text-align:right">
                            <button style="font-size:.64rem" id="close_login_help_btn" data-i18n="pay_btn_dismiss">${t('pay_btn_dismiss')}</button>
                        </div>
                    </div>
                    `)
    const btn = el.querySelector('#close_login_help_btn')
    if (!btn) {
        close()
        return
    }
    btn.onclick = async () => {
        close()
    }
}

function formatSpeed(bps, base = 1000 * 1000) {
    if (bps == null || isNaN(bps)) return "0 kbps";

    bps = base * bps;

    const kbps = bps / 1_000;
    const mbps = bps / 1_000_000;
    const gbps = bps / 1_000_000_000;

    if (bps >= 1_000_000_000) {
        return gbps.toFixed(gbps >= 10 ? 0 : 1) + " Gbps";
    } else if (bps >= 1_000_000) {
        return mbps.toFixed(mbps >= 10 ? 0 : 1) + " Mbps";
    } else {
        return kbps.toFixed(kbps >= 10 ? 0 : 1) + " kbps";
    }
}

const checkWeakToken = async () => {
    try {
        const res = await (await fetchWithTimeout(`${KANO_baseURL}/is_weak_token`)).json();
        const is_weak_token = res && res.is_weak_token;
        return is_weak_token === true;
    } catch (e) {
        console.error('checkWeakToken error:', e);
        return false;
    }
}

const forceEnableOTABtn = (() => {
    let count = 0
    let timer = null
    return () => {
        count++
        if (count < 5) {
            if (timer) clearTimeout(timer)
            timer = setTimeout(() => {
                count = 0
            }, 2000);
            return
        }
        closeModal('#updateSoftwareModal');
        createToast('Enabled! please reopen the update software modal again', 'pink');
        UFI_FORCE_ENABLE_UPDATE = 1
        count = 0
    }
})()


const saveConfig = async (file, outputFile) => {
    try {
        const formData = new FormData();
        formData.append("file", file);
        const res = await (await fetch(`${KANO_baseURL}/upload_img`, {
            method: "POST",
            headers: common_headers,
            body: formData,
        })).json()

        if (res.url) {
            let foundFile = await runShellWithRoot(`
                        ls /data/data/com.minikano.f50_sms/files/${res.url}
                    `)
            if (!foundFile.content) {
                throw t('toast_upload_failed')
            }
            let resShell = await runShellWithRoot(`
                        mv /data/data/com.minikano.f50_sms/files/${res.url} ${outputFile}
                    `)
            if (resShell.success) {
                return true
            }
        }
        else throw res.error || ''
    }
    catch (e) {
        console.error(e);
        return false
    }
}

const handleEditBootScriptModal = async () => {
    if (!(await checkAdvancedFunc())) {
        createToast(t("need_advance_func"), 'pink')
        return
    }

    const res = await runShellWithRoot(`
        timeout 5s  awk '{print}' /sdcard/ufi_tools_boot.sh
        `)
    if (!res.success) return createToast(t('read_file_fail'), 'red')

    closeAdvanceToolsModal()
    const { el, close } = createFixedToast('kano_edit_ufi_boot_sh_message', `
                <div style="pointer-events:all;width:80vw;max-width:800px;">
                    <div class="title" style="margin:0" data-i18n="edit_boot_script">${t('edit_boot_script')}</div>
                    <div style="margin:10px 0" class="inner"></div>
                    <div style="text-align:right">
                        <button style="font-size:.64rem" id="save_edit_ufi_boot_sh_message_btn" data-i18n="plugin_modal_submit_btn">${t('plugin_modal_submit_btn')}</button>
                        <button style="font-size:.64rem" id="close_edit_ufi_boot_sh_message_btn" data-i18n="close_btn">${t('close_btn')}</button>
                    </div>
                </div>
                `)

    const textarea = document.createElement('textarea')
    textarea.style.width = "100%"
    textarea.style.height = "500px"
    textarea.style.maxHeight = "60vh"
    textarea.style.border = "none"
    textarea.setAttribute('spellcheck', 'false')
    textarea.placeholder = '#!/system/bin/sh\n# put script content here!!!\nsync\n\n'
    textarea.value = res.content
    el.querySelector('.inner').appendChild(textarea)
    const btn = el.querySelector('#close_edit_ufi_boot_sh_message_btn')
    const sbtn = el.querySelector('#save_edit_ufi_boot_sh_message_btn')
    if (!btn) {
        close()
        return
    }
    btn.onclick = async () => {
        close()
    }
    sbtn.onclick = async () => {
        let v = textarea.value
        if (!v || v.trim().length == 0) {
            v = '#!/system/bin/sh\n# put script content here!!!\nsync\n\n'
        }
        const file = new File([v], "ufi_tools_boot.sh", { type: "text/plain" });
        if (! await saveConfig(file, "/sdcard/ufi_tools_boot.sh")) {
            return createToast(t('toast_save_failed'), 'pink')
        }
        createToast(t('toast_save_success_sync'), 'green')
        close()
    }
}

function validateAlphaAndNumber(input) {
    const regex = /^[a-zA-Z0-9_.]+$/;
    return regex.test(input);
}

//文件上传(100MB)
async function uploadFileKano(file, needRename = false) {
    if (file) {
        console.log(file.name);
        // 检查文件大小
        if (file.size > 100 * 1024 * 1024) {
            // MAX_SIZE MB
            createToast(`${t('file_size_over_limit')} 100MB！`, 'red')
        } else {
            let closeFn = null
            //上传
            try {
                const { el, close } = createFixedToast("uploading_file_kano", t('uploading'))
                closeFn = close
                const formData = new FormData();
                formData.append("file", file);
                const res = await (await fetch(`${KANO_baseURL}/upload_img`, {
                    method: "POST",
                    headers: common_headers,
                    body: formData,
                })).json()

                if (res.url) {
                    el.textContent = t("toast_upload_success")
                    el.style.color = 'pink'
                    const resFileName = res.url.replace("/uploads/", "")
                    if (!resFileName) throw t('upload_success_but_cannot_detect_file_name')
                    const regResult = validateAlphaAndNumber(file.name)
                    console.log("文件名合法性测试结果：", regResult)
                    //重命名
                    if (needRename && regResult) {
                        const res = await runShellWithUser(`mv /data/data/com.minikano.f50_sms/files/uploads/${resFileName} /data/data/com.minikano.f50_sms/files/uploads/${file.name}`)
                        if (!res.success) {
                            createToast(t('toast_oprate_failed'), 'red')
                            return null
                        }
                        const res1 = await runShellWithUser(`ls /data/data/com.minikano.f50_sms/files/uploads/${file.name}`)
                        if (!res1.success) {
                            createToast(t('toast_oprate_failed'), 'red')
                            return null
                        }
                        if (!res1.content || !res1.content.content || !res1.content.content.includes(file.name)) {
                            createToast(t('rename_failed'), 'red')
                            return null
                        }
                    }
                    return (needRename && regResult) ? file.name : resFileName
                }
                else throw res.error || ''
            }
            catch (e) {
                console.error(e);
                createToast(t('toast_upload_failed'), 'red')
                return null
            } finally {
                closeFn && closeFn()
            }
        }
    }
}

const renderConnectStatusContent = (res) => {
    return `
    <div style="
        font-size:.7rem;
        display:flex;
        flex-direction:column;
        gap:10px;
        line-height:1.4;
    ">
        <!-- 总览 -->
        <div class="nc-card">
        <div class="nc-title">
            <span>${t('total_conn_count')}</span>
            <span class="nc-badge">All</span>
        </div>
        <div style="display:flex;justify-content:space-between;align-items:baseline;gap:10px;">
            <div>
                <div class="nc-sub">${t('tcp_conn_total')} / ${t('udp_conn_total')} / v6</div>
                <div class="nc-strong" style="font-size:18px;font-weight:900;">
                    ${Number(res.tcp) + Number(res.udp) + Number(res.tcp6) + Number(res.udp6)}
                </div>
            </div>
            <div style="text-align:right">
            <div class="nc-sub">${t('unix_conn_total')}</div>
            <div class="nc-value" style="font-size:16px;font-weight:800;">${res.unix}</div>
            </div>
        </div>
        </div>

        <!-- TCP v4 -->
        <div class="nc-card">
        <div class="nc-title">
            <span>TCP (v4)</span>
            <span class="nc-badge">${t('tcp_conn_total')}</span>
        </div>
        <div class="nc-grid">
            <div class="nc-label">${t('tcp_conn_active')}</div>
            <div class="nc-value">${res.tcp_active}</div>

            <div class="nc-label">${t('tcp_conn_other')}</div>
            <div class="nc-value">${res.tcp_other}</div>

            <div class="nc-divider" style="grid-column:1 / -1;"></div>

            <div class="nc-label">${t('tcp_conn_total')}</div>
            <div class="nc-value">${res.tcp}</div>
        </div>
        </div>

        <!-- 其他协议 -->
        <div class="nc-card">
        <div class="nc-title">
            <span>${t('other_protocols') || 'Other'}</span>
            <span class="nc-badge">UDP / v6</span>
        </div>
        <div class="nc-grid">
            <div class="nc-label">${t('tcp6_conn_total')}</div>
            <div class="nc-value">${res.tcp6}</div>

            <div class="nc-label">${t('udp_conn_total')}</div>
            <div class="nc-value">${res.udp}</div>

            <div class="nc-label">${t('udp6_conn_total')}</div>
            <div class="nc-value">${res.udp6}</div>

            <div class="nc-divider" style="grid-column:1 / -1;"></div>

            <div class="nc-label">${t('unix_conn_total')}</div>
            <div class="nc-value">${res.unix}</div>
        </div>
        </div>
    </div>
    `.trim()
}

const resetInput = (inputElId) => {
    if (!inputElId) return
    if (!inputElId.startsWith('#')) {
        inputElId = `#${inputElId}`
    }
    const inputEl = document.querySelector(inputElId)
    if (!inputEl) return
    if (inputEl) {
        inputEl.value = ''
    }
}

const formatLocalDate = (date) => {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
};

const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms));

const createFormToast = ({ title, id, fields }, cb = async () => { }) => {
    // fields: [
    //     {
    //         name: 'rat',
    //         label: t('rat'),
    //         type: 'select',
    //         options: [
    //             { value: 'GSM', label: t('gsm') },
    //             { value: 'UMTS', label: t('umts') },
    //             { value: 'LTE', label: t('lte') }
    //         ]
    //     }
    // ]
    if (!fields || !Array.isArray(fields)) {
        console.error('Invalid fields provided for createFormToast')
        return null
    }
    if (!id) {
        console.error('ID is required for createFormToast')
        return null
    }

    const fieldHtml = fields.map((field, index) => {
        if (field.type === 'select' && Array.isArray(field.options)) {
            const optionsHtml = field.options.map(opt => `<option value="${opt.value}">${opt.label}</option>`).join('')
            return `
                <div>
                    <div style="margin-bottom:5px;">${field.label}:</div>
                    <select class="select" style="width:100%;padding:5px;margin: 0 !important;" id="${id}_input_${index}">
                        ${optionsHtml}
                    </select>
                </div>
            `
        } else if (field.type === 'textarea') {
            return `
                <div>
                    <div style="margin-bottom:5px;">${field.label}:</div>
                    <textarea style="width:100%;padding:5px;" id="${id}_input_${index}" placeholder="${field.placeholder || ''}"></textarea>
                </div>
            `
        } else if (field.type === "checkbox") {
            return `
                <div class="user_select_none" style="display:flex;align-items:center;gap:0px;">
                    <input type="checkbox" id="${id}_input_${index}"/>
                    <label style="padding-left:5px;" for="${id}_input_${index}">${field.label}</label>
                </div>
            `
        } else if (field.type === "checkbox-group") {
            if (!Array.isArray(field.options)) {
                console.error(`Invalid options for checkbox-group field: ${field.name}`)
                return ''
            }
            const checkboxesHtml = field.options.map(opt => `
                <div class="user_select_none" style="display:flex;align-items:center;gap:0px;">
                    <input type="checkbox" id="${id}_input_group_item_${index}_${field.name}_${opt.value}" value="${opt.value}"/>
                    <label style="padding-left:5px;" for="${id}_input_group_item_${index}_${field.name}_${opt.value}">${opt.label}</label>
                </div>
            `).join('')
            return `
                <div>
                    <div style="margin-bottom:5px;">${field.label}:</div>
                    <div style="display:flex;gap:5px;flex-wrap: wrap;" id="${id}_input_group_${index}">
                        ${checkboxesHtml}
                    </div>
                </div>
            `
        } else {
            return `
                <div>
                    <div style="margin-bottom:5px;">${field.label}:</div>
                    <input style="width:100%;padding:5px;" type="text" id="${id}_input_${index}" placeholder="${field.placeholder || ''}"/>
                </div>
            `
        }
    }).join('')

    const { el, close } = createFixedToast(id, `
                <div style="pointer-events:all;width:80vw;max-width:300px;">
                <div class="title" style="margin:0" data-i18n="${title}">${t(title)}</div>
                <div class="form-group" style="display:flex;flex-direction:column;gap:6px;margin:10px 0;">
                    ${fieldHtml}
                </div>
                <div style="display:flex;gap:10px">
                    <button id="close_${id}_toast_btn" style="width:100%;font-size:.64rem;margin-top:5px" data-i18n="confirm_btn">${t("confirm_btn")}</button>
                    <button id="close_${id}_toast_btn1" style="width:100%;font-size:.64rem;margin-top:5px" data-i18n="cancel_btn">${t("cancel_btn")}</button>
                </div>
                </div>
                `, 'red')
    const btn = el.querySelector(`#close_${id}_toast_btn`)
    const btn2 = el.querySelector(`#close_${id}_toast_btn1`)

    const getFormValues = () => {
        const fieldValues = {}
        fields.forEach((field, index) => {
            const inputEl = el.querySelector(`#${id}_input_${index}`)
            const inputGroupEl = el.querySelector(`#${id}_input_group_${index}`)
            if (inputEl) {
                if (field.type === 'checkbox') {
                    fieldValues[field.name] = inputEl.checked
                } else {
                    fieldValues[field.name] = inputEl.value
                }
            } else if (inputGroupEl) {
                if (field.type === 'checkbox-group') {
                    fieldValues[field.name] = Array.from(inputGroupEl.querySelectorAll('input[type="checkbox"]'))
                        .filter(checkbox => checkbox.checked)
                        .map(checkbox => checkbox.value)
                }
            }
        })
        return fieldValues
    }

    if (!btn && !btn2) {
        close()
        return
    }
    btn2.onclick = () => {
        close()
    }
    btn.onclick = async () => {
        try {
            await cb(getFormValues(), close)
        } catch (error) {
            console.error('Error occurred while submitting form:', error)
        }
    }

}

function safeClone(obj) {
    if (typeof structuredClone === 'function') {
        return structuredClone(obj)
    }
    return JSON.parse(JSON.stringify(obj))
}

function setBtnLoading(ele, isLoading = false) {
    if (!ele) return
    if (isLoading) {
        ele.querySelector(".kano_btn_is_loading") && ele.removeChild(ele.querySelector(".kano_btn_is_loading"))
        const span = document.createElement('span')
        span.className = "kano_btn_is_loading"
        span.style.display = 'inline-block'
        span.innerText = "🍥"
        span.classList.add("spin")
        ele.appendChild(span)
        ele.disabled = true
        ele.style.backgroundColor = "var(--dark-btn-disabled)"
    } else {
        ele.querySelector(".kano_btn_is_loading") && ele.removeChild(ele.querySelector(".kano_btn_is_loading"))
        ele.disabled = false
        ele.style.backgroundColor = ""
    }
}