const baseSize = 14;
const minScale = 0.9;
const maxScale = 1.2;
let REFRESH_TIME = getRefteshRate((val) => {
    let refreshRateSelect = document.querySelector('#refreshRateSelect')
    refreshRateSelect && (refreshRateSelect.value = val.toString())
})
function setRem() {
    const width = document.documentElement.clientWidth;
    let scale = width / 375;
    // 限制缩放范围
    if (scale < minScale) scale = minScale;
    if (scale > maxScale) scale = maxScale;
    document.documentElement.style.fontSize = (baseSize * scale) + 'px';
}
setRem();
window.addEventListener('resize', setRem);

let isNeedToken = true
const MODEL = document.querySelector("#MODEL")
let QORS_MESSAGE = null
let smsSender = null
let psw_fail_num = 0;

// 初始化全局数据代理对象
window.UFI_DATA = new Proxy({}, {
    set(target, prop, value) {
        target[prop] = value;
        chartUpdater && chartUpdater(prop, value)
        return true;
    }
});

//customHead
(() => {
    getCustomHead().then((head_text) => {
        if (head_text) {
            try {
                const parser = new DOMParser();
                const doc = parser.parseFromString(head_text, 'text/html');

                doc.querySelectorAll('style, link, meta').forEach(el => {
                    document.head.appendChild(el.cloneNode(true));
                });

                doc.querySelectorAll('script').forEach(scriptEl => {
                    const newScript = document.createElement('script');
                    if (scriptEl.src) {
                        newScript.src = scriptEl.src;
                    } else {
                        newScript.textContent = scriptEl.textContent;
                    }
                    if (scriptEl.type) newScript.type = scriptEl.type;

                    document.head.appendChild(newScript);
                })
            } catch (e) {
                alert('自定义head解析失败，请检查内容是否正确。');
            }
        }
    })
})();

//ttyd
if (!localStorage.getItem('ttyd_port')) {
    localStorage.setItem('ttyd_port', 1146)
}

if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/service-worker.js')
        .then(reg => {
            console.log('Service Worker 注册成功:', reg);
        })
        .catch(err => {
            console.error('Service Worker 注册失败:', err);
        });
}

//判断一下是否需要token
const needToken = async () => {
    try {
        let res = await (await fetch(`${KANO_baseURL}/need_token`, { headers: { ...common_headers } })).json()
        if (res.need_token) {
            isNeedToken = true
        } else {
            isNeedToken = false
        }
    } catch {
        isNeedToken = true
    }
    let tkInput = document.querySelector('#TOKEN')
    if (isNeedToken) {
        tkInput && (tkInput.style.display = "")
    } else {
        tkInput && (tkInput.style.display = "none")
    }
};

document.addEventListener("DOMContentLoaded", () => {
    setTimeout(() => {
        let container = document.querySelector('.container')
        container.style.opacity = 1
        container.style.filter = 'none'
    }, 100);
})

needToken().finally(() => {
    main_func()
})

function main_func() {
    //读取展示列表
    const _stor = localStorage.getItem('showList')
    const showList = _stor != null ? JSON.parse(_stor) : {
        statusShowList: [
            {
                "name": "QORS_MESSAGE",
                "isShow": true
            },
            {
                "name": "network_type",
                "isShow": true
            },
            {
                "name": "wifi_access_sta_num",
                "isShow": true
            },
            {
                "name": "battery",
                "isShow": true
            },
            {
                "name": "rssi",
                "isShow": true
            },
            {
                "name": "cpu_temp",
                "isShow": true
            },
            {
                "name": "cpu_usage",
                "isShow": true
            },
            {
                "name": "mem_usage",
                "isShow": true
            },
            {
                "name": "realtime_time",
                "isShow": true
            },
            {
                "name": "monthly_tx_bytes",
                "isShow": true
            },
            {
                "name": "daily_data",
                "isShow": true
            },
            {
                "name": "realtime_rx_thrpt",
                "isShow": true
            }],
        signalShowList: [
            {
                "name": "Z5g_rsrp",
                "isShow": true
            },
            {
                "name": "Nr_snr",
                "isShow": true
            },
            {
                "name": "nr_rsrq",
                "isShow": true
            },
            {
                "name": "Nr_bands",
                "isShow": true
            },
            {
                "name": "Nr_fcn",
                "isShow": true
            },
            {
                "name": "Nr_bands_widths",
                "isShow": true
            },
            {
                "name": "Nr_pci",
                "isShow": true
            },
            {
                "name": "nr_rssi",
                "isShow": true
            },
            {
                "name": "Nr_cell_id",
                "isShow": true
            },
            {
                "name": "lte_rsrp",
                "isShow": true
            },
            {
                "name": "Lte_snr",
                "isShow": true
            },
            {
                "name": "lte_rsrq",
                "isShow": true
            },
            {
                "name": "Lte_bands",
                "isShow": true
            },
            {
                "name": "Lte_fcn",
                "isShow": true
            },
            {
                "name": "Lte_bands_widths",
                "isShow": true
            },
            {
                "name": "Lte_pci",
                "isShow": true
            },
            {
                "name": "lte_rssi",
                "isShow": true
            },
            {
                "name": "Lte_cell_id",
                "isShow": true
            }],
        propsShowList: [
            {
                "name": "client_ip",
                "isShow": true
            },
            {
                "name": "model",
                "isShow": true
            },
            {
                "name": "cr_version",
                "isShow": true
            },
            {
                "name": "iccid",
                "isShow": true
            },
            {
                "name": "imei",
                "isShow": true
            },
            {
                "name": "imsi",
                "isShow": true
            },
            {
                "name": "ipv6_wan_ipaddr",
                "isShow": true
            },
            {
                "name": "lan_ipaddr",
                "isShow": true
            },
            {
                "name": "mac_address",
                "isShow": true
            },
            {
                "name": "msisdn",
                "isShow": true
            },
            {
                "name": "internal_available_storage",
                "isShow": true
            },
            {
                "name": "external_available_storage",
                "isShow": true
            },
        ]

    }

    // #拖动管理 list为当前最新正确顺序
    const saveDragListData = (list, callback) => {
        //拖动状态更改
        const children = Array.from(list.querySelectorAll('input'))
        let id = null
        if (list.id == 'draggable_status') id = 'statusShowList'
        if (list.id == 'draggable_signal') id = 'signalShowList'
        if (list.id == 'draggable_props') id = 'propsShowList'
        if (!id) return
        //遍历
        showList[id] = children.map((item) => ({
            name: item.dataset.name,
            isShow: item.checked
        }))
        localStorage.setItem('showList', JSON.stringify(showList))
        //保存
        callback && callback(list)
    }

    //初始化drag触发器
    DragList("#draggable_status", (list) => saveDragListData(list, (d_list) => {
        localStorage.setItem('statusShowListDOM', d_list.innerHTML)
    }))
    DragList("#draggable_signal", (list) => saveDragListData(list, (d_list) => {
        localStorage.setItem('signalShowListDOM', d_list.innerHTML)
    }))
    DragList("#draggable_props", (list) => saveDragListData(list, (d_list) => {
        localStorage.setItem('propsShowListDOM', d_list.innerHTML)
    }))

    //渲染listDOM
    const listDOM_STATUS = document.querySelector("#draggable_status")
    const listDOM_SIGNAL = document.querySelector("#draggable_signal")
    const listDOM_PROPS = document.querySelector("#draggable_props")
    const statusDOMStor = localStorage.getItem('statusShowListDOM')
    const signalDOMStor = localStorage.getItem('signalShowListDOM')
    const propsDOMStor = localStorage.getItem('propsShowListDOM')
    statusDOMStor && (listDOM_STATUS.innerHTML = statusDOMStor)
    signalDOMStor && (listDOM_SIGNAL.innerHTML = signalDOMStor)
    propsDOMStor && (listDOM_PROPS.innerHTML = propsDOMStor)

    //按照showList初始化排序模态框
    listDOM_STATUS.querySelectorAll('input').forEach((item) => {
        let name = item.dataset.name
        let foundItem = showList.statusShowList.find(i => i.name == name)
        if (foundItem) {
            item.checked = foundItem.isShow
        }
    })
    listDOM_SIGNAL.querySelectorAll('input').forEach((item) => {
        let name = item.dataset.name
        let foundItem = showList.signalShowList.find(i => i.name == name)
        if (foundItem) {
            item.checked = foundItem.isShow
        }
    })
    listDOM_PROPS.querySelectorAll('input').forEach((item) => {
        let name = item.dataset.name
        let foundItem = showList.propsShowList.find(i => i.name == name)
        if (foundItem) {
            item.checked = foundItem.isShow
        }
    })
    const isNullOrUndefiend = (obj) => {
        let isNumber = typeof obj === 'number'
        if (isNumber) {
            //如果是数字类型，直接返回
            return true
        }
        return obj != undefined || obj != null
    }

    let isIncludeInShowList = (dicName) => (
        showList.statusShowList.find(i => i.name == dicName)
        || showList.propsShowList.find(i => i.name == dicName)
        || showList.signalShowList.find(i => i.name == dicName)
    )

    function notNullOrundefinedOrIsShow(obj, dicName, flag = false) {
        let isNumber = typeof obj[dicName] === 'number'
        if (isNumber) {
            return isIncludeInShowList(dicName) || flag
        }
        let isReadable = obj[dicName] != null && obj[dicName] != undefined && obj[dicName] != ''
        //这里需要遍历一下是否显示的字段
        return isReadable && isIncludeInShowList(dicName)
    }

    //初始化所有按钮
    const initRenderMethod = async () => {
        initTheme();
        initBGBtn()
        initLANSettings()
        initSmsForwardModal()
        initChangePassData()
        adbQuery()
        loadTitle()
        initUpdateSoftware()
        handlerADBStatus()
        handlerADBNetworkStatus()
        handlerPerformaceStatus()
        initNetworktype()
        initSMBStatus()
        initROAMStatus()
        initSimCardType()
        initLightStatus()
        initBandForm()
        initUSBNetworkType()
        initNFCSwitch()
        initWIFISwitch()
        rebootDeviceBtnInit()
        handlerCecullarStatus()
        initScheduleRebootStatus()
        initShutdownBtn()
        initATBtn()
        initAdvanceTools()
        initShellBtn()
        QOSRDPCommand("AT+CGEQOSRDP=1")
    }

    const onTokenConfirm = debounce(async () => {
        // psw_fail_num_str
        try {
            await needToken()
            let tkInput = document.querySelector('#tokenInput')
            let tokenInput = document.querySelector('#TOKEN')
            let password = tkInput && (tkInput.value)
            let token = tokenInput && (tokenInput.value)
            if (!password || !password?.trim()) return createToast('请输入密码！', 'red')
            KANO_PASSWORD = password.trim()
            if (isNeedToken) {
                if (!token || !token?.trim()) return createToast('请输入token！', 'red')
            }
            KANO_TOKEN = SHA256(token.trim()).toLowerCase()
            common_headers.authorization = KANO_TOKEN
            let { psw_fail_num_str, login_lock_time } = await getData(new URLSearchParams({
                cmd: 'psw_fail_num_str,login_lock_time'
            }))
            if (psw_fail_num_str == '0' && login_lock_time != '0') {
                createToast(`密码错误次数已达上限，请等待${login_lock_time}秒后再试！`, 'red')
                out()
                await needToken()
                return null
            }
            const cookie = await login()
            if (!cookie) {
                createToast(`登录失败,检查密码 ` + (psw_fail_num_str != undefined ? `剩余次数：${psw_fail_num_str}` : ''), 'red')
                out()
                await needToken()
                return null
            }
            createToast('登录成功！', 'green')
            localStorage.setItem('kano_sms_pwd', password.trim())
            localStorage.setItem('kano_sms_token', SHA256(token.trim()).toLowerCase())
            closeModal('#tokenModal')
            initRenderMethod()
        }
        catch {
            createToast('登录失败！', 'red')
        }
    }, 200)

    let timer_out = null
    function out() {
        smsSender && smsSender()
        localStorage.removeItem('kano_sms_pwd')
        localStorage.removeItem('kano_sms_token')
        closeModal('#smsList')
        clearTimeout(timer_out)
        timer_out = setTimeout(() => {
            showModal('#tokenModal')
        }, 320);
    }

    let initRequestData = async () => {
        const PWD = localStorage.getItem('kano_sms_pwd')
        const TOKEN = localStorage.getItem('kano_sms_token')
        if (!PWD) {
            return false
        }
        if (isNeedToken && !TOKEN) {
            return false
        }
        KANO_TOKEN = TOKEN
        common_headers.authorization = KANO_TOKEN
        KANO_PASSWORD = PWD
        return true
    }

    let getSms = async () => {
        if (!(await initRequestData())) {
            out()
            return null
        }
        try {
            let res = await getSmsInfo()
            if (!res) {
                out()
                createToast(res.error, 'red')
                return null
            }
            return res.messages
        } catch {
            out()
            return null
        }
    }

    let isDisabledSendSMS = false
    let sendSMS = async () => {
        const SMSInput = document.querySelector('#SMSInput')
        const PhoneInput = document.querySelector('#PhoneInput')
        if (SMSInput && SMSInput.value && SMSInput.value.trim()
            && PhoneInput && PhoneInput.value && Number(PhoneInput.value.trim())
        ) {
            try {
                if (isDisabledSendSMS) return createToast('请不要频繁发送！', 'red')
                const content = SMSInput.value.trim()
                const number = PhoneInput.value.trim()
                isDisabledSendSMS = true
                const res = await sendSms_UFI({ content, number })
                if (res && res.result == 'success') {
                    SMSInput.value = ''
                    createToast('发送成功！', 'green')
                    handleSmsRender()
                } else {
                    createToast((res && res.message) ? res.message : '发送失败', 'red')
                }
            } catch {
                createToast('发送失败，请检查网络和密码', 'red')
                out()
            }
            isDisabledSendSMS = false
        } else {
            createToast('请输入手机号和内容', 'red')
        }
    }

    const deleteState = new Map();
    const deleteSMS = async (id) => {
        const message = document.querySelector(`#message${id}`);
        if (!message) return;
        // 获取当前 id 的删除状态
        let state = deleteState.get(id) || { confirmCount: 0, timer: null, isDeleting: false };

        if (state.isDeleting) return; // 正在删除时禁止操作

        state.confirmCount += 1;
        message.style.display = '';

        // 清除之前的计时器，重新设置 2 秒后重置状态
        clearTimeout(state.timer);
        state.timer = setTimeout(() => {
            state.confirmCount = 0;
            message.style.display = 'none';
            deleteState.set(id, state);
        }, 2000);

        deleteState.set(id, state);

        if (state.confirmCount < 2) return; // 第一次点击时仅提示

        // 进入删除状态，防止重复点击
        state.isDeleting = true;
        deleteState.set(id, state);

        try {
            const res = await removeSmsById(id);
            if (res?.result === 'success') {
                createToast('删除成功！', 'green');
                handleSmsRender();
            } else {
                createToast(res?.message || '删除失败', 'red');
            }
        } catch {
            createToast('操作失败，请检查网络和密码', 'red');
        }

        // 删除完成后，清理状态
        deleteState.delete(id);
    };

    let isFirstRender = true
    let lastRequestSmsIds = null
    let handleSmsRender = async () => {
        let list = document.querySelector('#sms-list')
        if (!list) createToast('没有找到短信列表节点', 'red')
        if (isFirstRender) {
            list.innerHTML = ` <li><h2 style="padding: 30px;text-align:center;height:100vh">Loading...</h2></li>`
        }
        isFirstRender = false
        showModal('#smsList')
        let res = await getSms()
        if (res && res.length) {
            //防止重复渲染
            let ids = res.map(item => item.id).join('')
            if (ids === lastRequestSmsIds) return
            lastRequestSmsIds = ids
            const dateStrArr = ['年', '月', '日', ':', ':', '']
            res.sort((a, b) => {
                let date_a = a.date.split(',')
                let date_b = b.date.split(',')
                date_a.pop()
                date_b.pop()
                return Number(date_b.join('')) - Number(date_a.join(''))
            })
            // 收集所有id，已读操作
            const allIds = res?.filter(item => item.tag == '1')?.map(item => item.id)
            if (allIds && allIds.length > 0) {
                try {
                    console.log(allIds, '批量已读短信');
                    readSmsByIds(allIds)
                } catch (error) {
                    console.log('批量已读短信失败', error);
                }
            }
            list.innerHTML = res.map(item => {
                let date = item.date.split(',')
                date.pop()
                date = date.map((item, index) => {
                    return item + dateStrArr[index]
                }).join('')
                return `<li class="sms-item" style="${item.tag != '2' ? 'background-color:#0880001f;margin-left:15px' : 'background-color:#ffc0cb63;margin-right:15px'}">
                                        <div class="arrow" style="${item.tag == '2' ? 'right:-30px;border-color: transparent transparent transparent #ffc0cb63' : 'left:-30px;border-color: transparent #0880001f transparent transparent'}"></div>
                                        <div class="icon" onclick="deleteSMS(${item.id})">
                                            <span id="message${item.id}" style="display:none;color:red;position: absolute;width: 100px;top: 6px;right: 20px;">确定要删除吗？</span>
                                            <svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" t="1742373390977" class="icon" viewBox="0 0 1024 1024" version="1.1" p-id="2837" width="16" height="16"><path d="M848 144H608V96a48 48 0 0 0-48-48h-96a48 48 0 0 0-48 48v48H176a48 48 0 0 0-48 48v48h768v-48a48 48 0 0 0-48-48zM176 928a48 48 0 0 0 48 48h576a48 48 0 0 0 48-48V288H176v640z m480-496a48 48 0 1 1 96 0v400a48 48 0 1 1-96 0V432z m-192 0a48 48 0 1 1 96 0v400a48 48 0 1 1-96 0V432z m-192 0a48 48 0 1 1 96 0v400a48 48 0 1 1-96 0V432z" fill="" p-id="2838"/></svg>
                                        </div>
                                        <p style="color:#adadad;font-size:16px;margin:4px 0">${item.number}</p>
                                        <p>${decodeBase64(item.content)}</p>
                                        <p style="text-align:right;color:#adadad;margin-top:4px">${date}</p>
                                    </li > `
            }).join('')
        } else {
            if (!res) {
                out()
            }
            list.innerHTML = ` <li> <h2 style="padding: 30px;text-align:center;">没有短信</h2></li >`
        }
    }


    let StopStatusRenderTimer = null
    let isNotLoginOnce = true
    let handlerStatusRender = async (flag = false) => {
        const status = document.querySelector('#STATUS')
        if (flag) {
            const TOKEN = localStorage.getItem('kano_sms_token')
            if (!TOKEN && isNeedToken) {
                return false
            }
            KANO_TOKEN = TOKEN
            common_headers.authorization = KANO_TOKEN
            status.innerHTML = `
        <li style="padding-top: 15px;">
            <strong class="green" style="margin: 10px auto;margin-top: 0; display: flex;flex-direction: column;padding: 40px;">
                <span style="font-size: 50px;" class="spin">🌀</span>
                <span style="font-size: 16px;padding-top: 10px;">loading...</span>
            </strong>
        </li>`
        }
        let res = await getUFIData()
        if (!res) {
            // out()
            if (flag) {
                status.innerHTML = `<li style="padding-top: 15px;"><strong onclick="copyText(event)" class="green">当你看到这个tag的时候，请检查你的网络连接与软件内网关地址是否正确~</strong></li>`
                createToast('获取数据失败，请检查网络和密码！', 'red')
            }
            if ((!KANO_TOKEN || !common_headers.authorization) && isNotLoginOnce) {
                status.innerHTML = `<li style="padding-top: 15px;"><strong onclick="copyText(event)" class="green">当你看到这个tag的时候，请检查你的网络连接与软件内网关地址是否正确~</strong></li>`
                createToast('登录后获取数据', 'pink')
                isNotLoginOnce = false
            }
            return
        }
        if (res) {
            Object.keys(res).forEach(key => {
                window.UFI_DATA[key] = res[key];
            });
            adbQuery()
            isNotLoginOnce = false
            const current_cell = document.querySelector('#CURRENT_CELL')
            let html = ''

            if (current_cell) {
                current_cell.innerHTML = '<i>当前连接</i><br/>'
                current_cell.innerHTML += `
            ${notNullOrundefinedOrIsShow(res, 'Lte_fcn') ? `<span>频率: ${res.Lte_fcn}</span>` : ''}
            ${notNullOrundefinedOrIsShow(res, 'Lte_pci') ? `<span>&nbsp;PCI: ${res.Lte_pci}</span>` : ''}
            ${notNullOrundefinedOrIsShow(res, 'lte_rsrp') ? `<div style="display: flex;padding-bottom:2px;align-items: center;">RSRP:&nbsp; ${kano_parseSignalBar(res.lte_rsrp)}</div>` : ''}
            ${notNullOrundefinedOrIsShow(res, 'Lte_snr') ? `<div style="display: flex;align-items: center;">SINR:&nbsp; ${kano_parseSignalBar(res.Lte_snr, -10, 30, 13, 0)}</div>` : ''}
            ${notNullOrundefinedOrIsShow(res, 'lte_rsrq') ? `<div style="display: flex;padding-top:2px;align-items: center;">RSRQ:&nbsp; ${kano_parseSignalBar(res.lte_rsrq, -20, -3, -9, -12)}</div>` : ''}
            ${notNullOrundefinedOrIsShow(res, 'Nr_fcn') ? `<span>频率: ${res.Nr_fcn}</span>` : ''}
            ${notNullOrundefinedOrIsShow(res, 'Nr_pci') ? `<span>&nbsp;PCI: ${res.Nr_pci}</span>` : ''}
            ${notNullOrundefinedOrIsShow(res, 'Z5g_rsrp') ? `<div style="display: flex;padding-bottom:2px;align-items: center;width: 114px;justify-content: space-between"><span>RSRP:</span>${kano_parseSignalBar(res.Z5g_rsrp)}</div>` : ''}
            ${notNullOrundefinedOrIsShow(res, 'Nr_snr') ? `<div style="display: flex;align-items: center;width: 114px;justify-content: space-between"><span>SINR:</span>${kano_parseSignalBar(res.Nr_snr, -10, 30, 13, 0)}</div>` : ''}
            ${notNullOrundefinedOrIsShow(res, 'nr_rsrq') ? `<div style="display: flex;padding-top:2px;align-items: center;width: 114px;justify-content: space-between"><span>RSRQ:</span>${kano_parseSignalBar(res.nr_rsrq, -20, -3, -9, -12)}</div>` : ''}
            `
            }

            try {
                if (QORS_MESSAGE) {
                    res['QORS_MESSAGE'] = QORS_MESSAGE
                }
                const unreadEl = document.querySelector('#UNREAD_SMS')
                if (res.sms_unread_num && res.sms_unread_num > 0) {
                    unreadEl.style.display = ''
                    unreadEl.innerHTML = res.sms_unread_num > 99 ? '99+' : res.sms_unread_num
                } else {
                    unreadEl.innerHTML = ''
                    unreadEl.style.display = 'none'
                }
            } catch { }

            let statusHtml_base = {
                QORS_MESSAGE: `${notNullOrundefinedOrIsShow(res, "QORS_MESSAGE") ? `<strong onclick="copyText(event)"  class="green">${QORS_MESSAGE}</strong>` : ''}`,
                network_type: `${notNullOrundefinedOrIsShow(res, 'network_type') ? `<strong onclick="copyText(event)"  class="green">网络状态：${res.network_provider} ${res.network_type == '20' ? '5G' : res.network_type == '13' ? '4G' : res.network_type}</strong>` : ''}`,
                wifi_access_sta_num: `${notNullOrundefinedOrIsShow(res, 'wifi_access_sta_num') ? `<strong onclick="copyText(event)"  class="blue">WIFI连接：${res.wifi_access_sta_num}</strong>` : ''}`,
                battery: `${notNullOrundefinedOrIsShow(res, 'battery') ? `<strong onclick="copyText(event)"  class="green">${res.battery_charging == "1" ? "正在充电" : "剩余电量"}：${res.battery} %</strong>` : ''}`,
                rssi: `${notNullOrundefinedOrIsShow(res, 'rssi') || notNullOrundefinedOrIsShow(res, 'network_signalbar', true) ? `<strong onclick="copyText(event)"  class="green">信号强度：${kano_getSignalEmoji(notNullOrundefinedOrIsShow(res, 'rssi') ? res.rssi : res.network_signalbar)}</strong>` : ''}`,
                cpu_temp: `${notNullOrundefinedOrIsShow(res, 'cpu_temp') ? `<strong onclick="copyText(event)"  class="blue">CPU温度：<span style="text-align:center;display:inline-block;width: 8ch;">${String(Number(res.cpu_temp / 1000).toFixed(2)).padStart(5, ' ')} ℃</span></strong>` : ''}`,
                cpu_usage: `${notNullOrundefinedOrIsShow(res, 'cpu_usage') ? `<strong onclick="copyText(event)"  class="blue">CPU占用：<span style="text-align:center;display:inline-block;width: 8ch;">${String(Number(res.cpu_usage).toFixed(2)).padStart(5, ' ')} %</span></strong>` : ''}`,
                mem_usage: `${notNullOrundefinedOrIsShow(res, 'mem_usage') ? `<strong onclick="copyText(event)"  class="blue">内存占用：<span style="text-align:center;display:inline-block;width: 8ch;">${String(Number(res.mem_usage).toFixed(2)).padStart(5, ' ')} %</span></strong>` : ''}`,
                realtime_time: `${notNullOrundefinedOrIsShow(res, 'realtime_time') ? `<strong onclick="copyText(event)"  class="blue">连接时长：${kano_formatTime(Number(res.realtime_time))}${res.monthly_time ? '&nbsp;<span style="color:white">/</span>&nbsp;总时长: ' + kano_formatTime(Number(res.monthly_time)) : ''}</strong>` : ''}`,
                monthly_tx_bytes: `${notNullOrundefinedOrIsShow(res, 'monthly_tx_bytes') || notNullOrundefinedOrIsShow(res, 'monthly_rx_bytes') ? `<strong onclick="copyText(event)"  class="blue">已用流量：<span class="red">${formatBytes(Number((res.monthly_tx_bytes + res.monthly_rx_bytes)))}</span>${(res.data_volume_limit_size || res.flux_data_volume_limit_size) && (res.flux_data_volume_limit_switch == '1' || res.data_volume_limit_switch == '1') ? '&nbsp;<span style="color:white">/</span>&nbsp;总流量：' + formatBytes((() => {
                    const limit_size = res.data_volume_limit_size ? res.data_volume_limit_size : res.flux_data_volume_limit_size
                    if (!limit_size) return ''
                    return limit_size.split('_')[0] * limit_size.split('_')[1] * Math.pow(1024, 2)
                })()) : ''}</strong>` : ''}`,
                daily_data: `${notNullOrundefinedOrIsShow(res, 'daily_data') ? `<strong onclick="copyText(event)"  class="blue">当日流量：${formatBytes(res.daily_data)}</strong>` : ''}`,
                realtime_rx_thrpt: `${notNullOrundefinedOrIsShow(res, 'realtime_tx_thrpt') || notNullOrundefinedOrIsShow(res, 'realtime_rx_thrpt') ? `<strong onclick="copyText(event)" class="blue">当前网速: <span style="text-align:center;display:inline-block;width: 14ch;">⬇️&nbsp;${formatBytes(Number((res.realtime_rx_thrpt)), true)}/S</span><span style="text-align:center;display:inline-block;width: 14ch;">⬆️&nbsp;${formatBytes(Number((res.realtime_tx_thrpt)))}/S</span></strong>` : ''}`,
            }
            let statusHtml_net = {
                lte_rsrp: `${notNullOrundefinedOrIsShow(res, 'lte_rsrp') ? `<strong onclick="copyText(event)"  class="green">4G接收功率：${kano_parseSignalBar(res.lte_rsrp)}</strong>` : ''}`,
                Lte_snr: `${notNullOrundefinedOrIsShow(res, 'Lte_snr') ? `<strong onclick="copyText(event)"  class="blue">4G SINR：${kano_parseSignalBar(res.Lte_snr, -10, 30, 13, 0)}</strong>` : ''}`,
                Lte_bands: `${notNullOrundefinedOrIsShow(res, 'Lte_bands') ? `<strong onclick="copyText(event)"  class="blue">4G 注册频段：B${res.Lte_bands}</strong>` : ''}`,
                Lte_fcn: `${notNullOrundefinedOrIsShow(res, 'Lte_fcn') ? `<strong onclick="copyText(event)"  class="green">4G 频率：${res.Lte_fcn}</strong>` : ''}`,
                Lte_bands_widths: `${notNullOrundefinedOrIsShow(res, 'Lte_bands_widths') ? `<strong onclick="copyText(event)"  class="green">4G 频宽：${res.Lte_bands_widths}</strong>` : ''}`,
                Lte_pci: `${notNullOrundefinedOrIsShow(res, 'Lte_pci') ? `<strong onclick="copyText(event)"  class="blue">4G PCI：${res.Lte_pci}</strong>` : ''}`,
                lte_rsrq: `${notNullOrundefinedOrIsShow(res, 'lte_rsrq') ? `<strong onclick="copyText(event)"  class="blue">4G RSRQ：${kano_parseSignalBar(res.lte_rsrq, -20, -3, -9, -12)}</strong>` : ''}`,
                lte_rssi: `${notNullOrundefinedOrIsShow(res, 'lte_rssi') ? `<strong onclick="copyText(event)"  class="green">4G RSSI：${res.lte_rssi}</strong>` : ''}`,
                Lte_cell_id: `${notNullOrundefinedOrIsShow(res, 'Lte_cell_id') ? `<strong onclick="copyText(event)"  class="green">4G 基站ID：${res.Lte_cell_id}</strong>` : ''}`,
                Z5g_rsrp: `${notNullOrundefinedOrIsShow(res, 'Z5g_rsrp') ? `<strong onclick="copyText(event)"  class="green">5G接收功率：${kano_parseSignalBar(res.Z5g_rsrp)}</strong>` : ''}`,
                Nr_snr: `${notNullOrundefinedOrIsShow(res, 'Nr_snr') ? `<strong onclick="copyText(event)"  class="green">5G SINR：${kano_parseSignalBar(res.Nr_snr, -10, 30, 13, 0)}</strong>` : ''}`,
                Nr_bands: `${notNullOrundefinedOrIsShow(res, 'Nr_bands') ? `<strong onclick="copyText(event)"  class="green">5G 注册频段：N${res.Nr_bands}</strong>` : ''}`,
                Nr_fcn: `${notNullOrundefinedOrIsShow(res, 'Nr_fcn') ? `<strong onclick="copyText(event)"  class="blue">5G 频率：${res.Nr_fcn}</strong>` : ''}`,
                Nr_bands_widths: `${notNullOrundefinedOrIsShow(res, 'Nr_bands_widths') ? `<strong onclick="copyText(event)"  class="blue">5G 频宽：${res.Nr_bands_widths}</strong>` : ''}`,
                Nr_pci: `${notNullOrundefinedOrIsShow(res, 'Nr_pci') ? `<strong onclick="copyText(event)"  class="green">5G PCI：${res.Nr_pci}</strong>` : ''}`,
                nr_rsrq: `${notNullOrundefinedOrIsShow(res, 'nr_rsrq') ? `<strong onclick="copyText(event)"  class="green">5G RSRQ：${kano_parseSignalBar(res.nr_rsrq, -20, -3, -9, -12)}</strong>` : ''}`,
                nr_rssi: `${notNullOrundefinedOrIsShow(res, 'nr_rssi') ? `<strong onclick="copyText(event)"  class="blue">5G RSSI：${res.nr_rssi}</strong>` : ''}`,
                Nr_cell_id: `${notNullOrundefinedOrIsShow(res, 'Nr_cell_id') ? `<strong onclick="copyText(event)"  class="blue">5G 基站ID：${res.Nr_cell_id}</strong>` : ''}`,
            }

            let statusHtml_other = {
                client_ip: `${notNullOrundefinedOrIsShow(res, 'client_ip') ? `<strong onclick="copyText(event)"  class="blue">客户端IP：${res.client_ip}</strong>` : ''}`,
                model: `${notNullOrundefinedOrIsShow(res, 'model') ? `<strong onclick="copyText(event)"  class="blue">设备型号：${res.model}</strong>` : ''}`,
                cr_version: `${notNullOrundefinedOrIsShow(res, 'cr_version') ? `<strong onclick="copyText(event)"  class="blue">版本号：${res.cr_version}</strong>` : ''}`,
                iccid: `${notNullOrundefinedOrIsShow(res, 'iccid') ? `<strong onclick="copyText(event)"  class="blue">ICCID：${res.iccid}</strong>` : ''}`,
                imei: `${notNullOrundefinedOrIsShow(res, 'imei') ? `<strong onclick="copyText(event)"  class="blue">IMEI：${res.imei}</strong>` : ''}`,
                imsi: `${notNullOrundefinedOrIsShow(res, 'imsi') ? `<strong onclick="copyText(event)"  class="blue">IMSI：${res.imsi}</strong>` : ''}`,
                ipv6_wan_ipaddr: `${notNullOrundefinedOrIsShow(res, 'ipv6_wan_ipaddr') ? `<strong onclick="copyText(event)"  class="blue">IPV6地址：${res.ipv6_wan_ipaddr}</strong>` : ''}`,
                lan_ipaddr: `${notNullOrundefinedOrIsShow(res, 'lan_ipaddr') ? `<strong onclick="copyText(event)"  class="blue">本地网关：${res.lan_ipaddr}</strong>` : ''}`,
                mac_address: `${notNullOrundefinedOrIsShow(res, 'mac_address') ? `<strong onclick="copyText(event)"  class="blue">MAC地址：${res.mac_address}</strong>` : ''}`,
                msisdn: `${notNullOrundefinedOrIsShow(res, 'msisdn') ? `<strong onclick="copyText(event)"  class="blue">手机号：${res.msisdn}</strong>` : ''}`,
                internal_available_storage: `${notNullOrundefinedOrIsShow(res, 'internal_available_storage') || notNullOrundefinedOrIsShow(res, 'internal_total_storage') ? `<strong onclick="copyText(event)" class="blue">内部存储：${formatBytes(res.internal_used_storage)} 已用 / ${formatBytes(res.internal_total_storage)} 总容量</strong>` : ''}`,
                external_available_storage: `${notNullOrundefinedOrIsShow(res, 'external_available_storage') || notNullOrundefinedOrIsShow(res, 'external_total_storage') ? `<strong onclick="copyText(event)" class="blue">SD卡：${formatBytes(res.external_used_storage)} 已用 / ${formatBytes(res.external_total_storage)} 总容量</strong>` : ''}`,
            }

            html += `<li style="padding-top: 15px;"><p>`
            showList.statusShowList.forEach(item => {
                if (statusHtml_base[item.name] && item.isShow) {
                    html += statusHtml_base[item.name]
                }
            })
            html += `</p></li>`
            html += `<div class="title" style="margin: 6px 0;"><b>信号参数</b></div>`

            html += `<li style="padding-top: 15px;"><p>`
            showList.signalShowList.forEach(item => {
                if (statusHtml_net[item.name] && item.isShow) {
                    html += statusHtml_net[item.name]
                }
            })
            html += `</p></li>`
            html += `<div class="title" style="margin: 6px 0;"><b>设备属性</b></div>`

            html += `<li style="padding-top: 15px;"><p>`
            showList.propsShowList.forEach(item => {
                if (statusHtml_other[item.name] && item.isShow) {
                    html += statusHtml_other[item.name]
                }
            })
            html += `</p></li>`
            status && (status.innerHTML = html)
        }
    }
    handlerStatusRender(true)
    StopStatusRenderTimer = requestInterval(() => handlerStatusRender(), REFRESH_TIME)

    //检查usb调试状态
    let handlerADBStatus = async () => {
        const btn = document.querySelector('#ADB')
        if (!(await initRequestData())) {
            btn.onclick = () => createToast('请登录', 'red')
            btn.style.backgroundColor = '#80808073'
            return null
        }
        let res = await getData(new URLSearchParams({
            cmd: 'usb_port_switch'
        }))
        btn.onclick = async () => {
            try {
                if (!(await initRequestData())) {
                    return null
                }
                const cookie = await login()
                if (!cookie) {
                    createToast('登录失败，请检查密码', 'red')
                    out()
                    return null
                }
                let res1 = await (await postData(cookie, {
                    goformId: 'USB_PORT_SETTING',
                    usb_port_switch: res.usb_port_switch == '1' ? '0' : '1'
                })).json()

                if (res1.result == 'success') {
                    createToast('操作成功！', 'green')
                    await handlerADBStatus()
                } else {
                    createToast('操作失败！', 'red')
                }
            } catch (e) {
                console.error(e.message)
            }
        }
        btn.style.backgroundColor = res.usb_port_switch == '1' ? '#018ad8a8' : ''

    }
    handlerADBStatus()

    //检查usb网络调试状态
    let handlerADBNetworkStatus = async () => {
        const btn = document.querySelector('#ADB_NET')
        if (!(await initRequestData())) {
            btn.onclick = () => createToast('请登录', 'red')
            btn.style.backgroundColor = '#80808073'
            return null
        }

        let res = await (await fetch(`${KANO_baseURL}/adb_wifi_setting`, {
            method: 'GET',
            headers: {
                ...common_headers,
                'Content-Type': 'application/json',
            }
        })).json()

        btn.onclick = async () => {
            try {
                if (!(await initRequestData())) {
                    return null
                }
                const cookie = await login()
                if (!cookie) {
                    createToast('登录失败，请检查密码', 'red')
                    out()
                    return null
                }
                // usb调试需要同步开启
                if (!(res.enabled == "true" || res.enabled == true)) {
                    await (await postData(cookie, {
                        goformId: 'USB_PORT_SETTING',
                        usb_port_switch: '1'
                    })).json()
                }
                let res1 = await (await fetch(`${KANO_baseURL}/adb_wifi_setting`, {
                    method: 'POST',
                    headers: {
                        ...common_headers,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        enabled: res.enabled == "true" || res.enabled == true ? false : true,
                        password: KANO_PASSWORD
                    })
                })).json()
                if (res1.result == 'success') {
                    createToast('操作成功！重启生效', 'green')
                    await handlerADBStatus()
                    await handlerADBNetworkStatus()
                } else {
                    createToast('操作失败！', 'red')
                }
            } catch (e) {
                console.error(e.message)
            }
        }
        btn.style.backgroundColor = res.enabled == "true" || res.enabled == true ? '#018ad8a8' : ''

    }
    handlerADBNetworkStatus()

    //检查性能模式状态
    let handlerPerformaceStatus = async () => {
        const btn = document.querySelector('#PERF')
        if (!(await initRequestData())) {
            btn.onclick = () => createToast('请登录', 'red')
            btn.style.backgroundColor = '#80808073'
            return null
        }
        let res = await getData(new URLSearchParams({
            cmd: 'performance_mode'
        }))
        btn.style.backgroundColor = res.performance_mode == '1' ? '#018ad8a8' : ''
        btn.onclick = async () => {
            try {
                if (!(await initRequestData())) {
                    return null
                }
                const cookie = await login()
                if (!cookie) {
                    createToast('登录失败，请检查密码', 'red')
                    out()
                    return null
                }
                let res1 = await (await postData(cookie, {
                    goformId: 'PERFORMANCE_MODE_SETTING',
                    performance_mode: res.performance_mode == '1' ? '0' : '1'
                })).json()
                if (res1.result == 'success') {
                    createToast('操作成功，重启生效！', 'green')
                    await handlerPerformaceStatus()
                } else {
                    createToast('操作失败！', 'red')
                }
            } catch (e) {
                // createToast(e.message)
            }
        }
    }
    handlerPerformaceStatus()

    function init() {
        smsSender && smsSender()
        if (!localStorage.getItem('kano_sms_pwd')) {
            showModal('#tokenModal')
        } else {
            isFirstRender = true
            lastRequestSmsIds = null
            handleSmsRender()
            smsSender = requestInterval(() => handleSmsRender(), 2000)
        }
    }

    // init()
    let smsBtn = document.querySelector('#SMS')
    smsBtn.onclick = init

    let clearBtn = document.querySelector('#CLEAR')
    clearBtn.onclick = async () => {
        isFirstRender = true
        lastRequestSmsIds = null
        localStorage.removeItem('kano_sms_pwd')
        localStorage.removeItem('kano_sms_token')
        KANO_TOKEN = null
        common_headers.authorization = null
        initRenderMethod()
        //退出登录请求
        try {
            login().finally(cookie => {
                logout(cookie)
            })
        } catch { }
        await needToken()
        createToast('您已退出登录', 'green')
        showModal('#tokenModal')
    }

    let initNetworktype = async () => {
        const selectEl = document.querySelector('#NET_TYPE')
        if (!(await initRequestData()) || !selectEl) {
            selectEl.style.backgroundColor = '#80808073'
            selectEl.disabled = true
            return null
        }
        selectEl.style.backgroundColor = ''
        selectEl.disabled = false
        let res = await getData(new URLSearchParams({
            cmd: 'net_select'
        }))
        if (!selectEl || !res || res.net_select == null || res.net_select == undefined) {
            return
        }

        [...selectEl.children].forEach((item) => {
            if (item.value == res.net_select) {
                item.selected = true
            }
        })
        QOSRDPCommand("AT+CGEQOSRDP=1")
        let interCount = 0
        let temp_inte = requestInterval(async () => {
            let res = await QOSRDPCommand("AT+CGEQOSRDP=1")
            if (interCount == 20) return temp_inte && temp_inte()
            if (res && !res.includes("ERROR")) {
                return temp_inte && temp_inte()
            }
            interCount++
        }, 1000);
    }
    initNetworktype()

    const changeNetwork = async (e) => {
        const value = e.target.value.trim()
        if (!(await initRequestData()) || !value) {
            return null
        }
        createToast('更改中，请稍后', '#BF723F')
        try {
            const cookie = await login()
            if (!cookie) {
                createToast('登录失败，请检查密码', 'red')
                out()
                return null
            }
            let res = await (await postData(cookie, {
                goformId: 'SET_BEARER_PREFERENCE',
                BearerPreference: value.trim()
            })).json()
            if (res.result == 'success') {
                createToast('操作成功！', 'green')
            } else {
                createToast('操作失败！', 'red')
            }
            await initNetworktype()
        } catch (e) {
            // createToast(e.message)
        }
    }

    let initUSBNetworkType = async () => {
        const selectEl = document.querySelector('#USB_TYPE')
        if (!(await initRequestData()) || !selectEl) {
            selectEl.style.backgroundColor = '#80808073'
            selectEl.disabled = true
            return null
        }
        selectEl.style.backgroundColor = ''
        selectEl.disabled = false
        let res = await getData(new URLSearchParams({
            cmd: 'usb_network_protocal'
        }))
        if (!selectEl || !res || res.usb_network_protocal == null || res.usb_network_protocal == undefined) {
            return
        }
        [...selectEl.children].forEach((item) => {
            if (item.value == res.usb_network_protocal) {
                item.selected = true
            }
        })
    }
    initUSBNetworkType()

    let changeUSBNetwork = async (e) => {
        const value = e.target.value.trim()
        if (!(await initRequestData()) || !value) {
            return null
        }
        createToast('更改中，请稍后', '#BF723F')
        try {
            const cookie = await login()
            if (!cookie) {
                createToast('登录失败，请检查密码', 'red')
                out()
                return null
            }
            let res = await (await postData(cookie, {
                goformId: 'SET_USB_NETWORK_PROTOCAL',
                usb_network_protocal: value.trim()
            })).json()
            if (res.result == 'success') {
                createToast('操作成功，请重启设备生效！', 'green')
            } else {
                createToast('操作失败！', 'red')
            }
            await initUSBNetworkType()
        } catch (e) {
            // createToast(e.message)
        }
    }

    //WiFi开关切换_INIT
    let initWIFISwitch = async () => {
        const selectEl = document.querySelector('#WIFI_SWITCH')
        if (!(await initRequestData()) || !selectEl) {
            selectEl.style.backgroundColor = '#80808073'
            selectEl.disabled = true
            return null
        }

        selectEl.style.backgroundColor = ''
        selectEl.disabled = false
        let { WiFiModuleSwitch, ResponseList } = await getData(new URLSearchParams({
            cmd: 'queryWiFiModuleSwitch,queryAccessPointInfo'
        }))

        if (WiFiModuleSwitch == "1") {
            if (ResponseList?.length) {
                ResponseList.forEach(item => {
                    if (item.AccessPointSwitchStatus == '1') {
                        selectEl.value = item.ChipIndex == "0" ? 'chip1' : 'chip2'
                    }
                })
            }
        } else {
            selectEl.value = 0
        }
    }
    initWIFISwitch()

    //WiFi开关切换
    let changeWIFISwitch = async (e) => {
        const selectEl = document.querySelector('#WIFI_SWITCH')
        const value = e.target.value.trim()
        if (!(await initRequestData()) || !value) {
            createToast('需要登录', 'red')
            return null
        }
        createToast('更改中，请稍后', '#BF723F')
        try {
            selectEl.style.backgroundColor = '#80808073'
            selectEl.disabled = true
            const cookie = await login()
            if (!cookie) {
                createToast('登录失败，请检查密码', 'red')
                out()
                return null
            }
            let res = null
            if (value == "0" || value == 0) {
                res = await (await postData(cookie, {
                    goformId: 'switchWiFiModule',
                    SwitchOption: 0
                })).json()
            } else if (value == 'chip1' || value == 'chip2') {
                res = await (await postData(cookie, {
                    goformId: 'switchWiFiChip',
                    ChipEnum: value,
                    GuestEnable: 0
                })).json()
            } else {
                return
            }
            setTimeout(() => {
                if (res.result == 'success') {
                    createToast('操作成功，请重新连接WiFi！', 'green')
                    initWIFISwitch()

                } else {
                    createToast('操作失败！', 'red')
                }
                selectEl.style.backgroundColor = ''
                selectEl.disabled = false
            }, 1000);
        } catch (e) {
            // createToast(e.message)
        }
    }

    let initSMBStatus = async () => {
        const el = document.querySelector('#SMB')
        if (!(await initRequestData()) || !el) {
            el.onclick = () => createToast('请登录', 'red')
            el.style.backgroundColor = '#80808073'
            return null
        }
        let res = await getData(new URLSearchParams({
            cmd: 'samba_switch'
        }))
        if (!el || !res || res.samba_switch == null || res.samba_switch == undefined) return
        el.onclick = async () => {
            if (!(await initRequestData())) {
                return null
            }
            try {
                const cookie = await login()
                if (!cookie) {
                    createToast('登录失败，请检查密码', 'red')
                    out()
                    return null
                }
                let res1 = await (await postData(cookie, {
                    goformId: 'SAMBA_SETTING',
                    samba_switch: res.samba_switch == '1' ? '0' : '1'
                })).json()
                if (res1.result == 'success') {
                    createToast('操作成功！', 'green')
                } else {
                    createToast('操作失败！', 'red')
                }
                await initSMBStatus()
            } catch (e) {
                // createToast(e.message)
            }
        }
        el.style.backgroundColor = res.samba_switch == '1' ? '#018ad8a8' : ''
    }
    initSMBStatus()

    //检查网路漫游状态
    let initROAMStatus = async () => {
        const el = document.querySelector('#ROAM')
        if (!(await initRequestData()) || !el) {
            el.onclick = () => createToast('请登录', 'red')
            el.style.backgroundColor = '#80808073'
            return null
        }
        let res = await getData(new URLSearchParams({
            cmd: 'roam_setting_option,dial_roam_setting_option'
        }))
        if (res && res.dial_roam_setting_option) {
            res.roam_setting_option = res.dial_roam_setting_option
        }
        if (!el || !res || res.roam_setting_option == null || res.roam_setting_option == undefined) return
        el.onclick = async () => {
            if (!(await initRequestData())) {
                return null
            }
            try {
                const cookie = await login()
                if (!cookie) {
                    createToast('登录失败，请检查密码', 'red')
                    out()
                    return null
                }
                let res1 = await (await postData(cookie, {
                    goformId: 'SET_CONNECTION_MODE',
                    ConnectionMode: "auto_dial",
                    roam_setting_option: res.roam_setting_option == 'on' ? 'off' : 'on',
                    dial_roam_setting_option: res.roam_setting_option == 'on' ? 'off' : 'on'
                })).json()
                if (res1.result == 'success') {
                    createToast('操作成功！', 'green')
                } else {
                    createToast('操作失败！', 'red')
                }
                await initROAMStatus()
            } catch (e) {
                // createToast(e.message)
            }
        }
        el.style.backgroundColor = res.roam_setting_option == 'on' ? '#018ad8a8' : ''
    }
    initROAMStatus()

    let initLightStatus = async () => {
        const el = document.querySelector('#LIGHT')
        if (!(await initRequestData()) || !el) {
            el.onclick = () => createToast('请登录', 'red')
            el.style.backgroundColor = '#80808073'
            return null
        }
        let res = await getData(new URLSearchParams({
            cmd: 'indicator_light_switch'
        }))
        if (!el || !res || res.indicator_light_switch == null || res.indicator_light_switch == undefined) return
        el.onclick = async () => {
            if (!(await initRequestData())) {
                return null
            }
            try {
                const cookie = await login()
                if (!cookie) {
                    createToast('登录失败，请检查密码', 'red')
                    out()
                    return null
                }
                let res1 = await (await postData(cookie, {
                    goformId: 'INDICATOR_LIGHT_SETTING',
                    indicator_light_switch: res.indicator_light_switch == '1' ? '0' : '1'
                })).json()
                if (res1.result == 'success') {
                    createToast('操作成功！', 'green')
                } else {
                    createToast('操作失败！', 'red')
                }
                await initLightStatus()
            } catch (e) {
                createToast(e.message, 'red')
            }
        }
        el.style.backgroundColor = res.indicator_light_switch == '1' ? '#018ad8a8' : ''
    }
    initLightStatus()

    const initBandForm = async () => {
        const el = document.querySelector('#bandsForm')
        if (!(await initRequestData()) || !el) {
            return null
        }
        let res = await getData(new URLSearchParams({
            cmd: 'lte_band_lock,nr_band_lock'
        }))

        if (!res) return null

        if (res['lte_band_lock']) {
            const bands = res['lte_band_lock'].split(',')
            if (bands && bands.length) {
                for (let band of bands) {
                    //  data-type="4G" data-band="5"
                    const el = document.querySelector(`#bandsForm input[type="checkbox"][data-band="${band}"][data-type="4G"]`)
                    if (el) el.checked = true
                }
            }
        }
        if (res['nr_band_lock']) {
            const bands = res['nr_band_lock'].split(',')
            if (bands && bands.length) {
                for (let band of bands) {
                    //  data-type="5G" data-band="5"
                    const el = document.querySelector(`#bandsForm input[type="checkbox"][data-band="${band}"][data-type="5G"]`)
                    if (el) el.checked = true
                }
            }
        }
    }
    initBandForm()

    const submitBandForm = async (e) => {
        e.preventDefault()
        if (!(await initRequestData())) {
            out()
            return null
        }
        const form = e.target
        const bands = form.querySelectorAll('input[type="checkbox"]:checked')
        const lte_bands = []
        const nr_bands = []
        //收集选中的数据
        if (bands && bands.length) {
            for (let band of bands) {
                const type = band.getAttribute('data-type')
                const b = band.getAttribute('data-band')
                if (type && b) {
                    if (type == '4G') lte_bands.push(b)
                    if (type == '5G') nr_bands.push(b)
                }
            }
        }
        const cookie = await login()
        if (!cookie) {
            createToast('登录失败，请检查密码', 'red')
            out()
            return null
        }
        try {
            const res = await (await Promise.all([
                (await postData(cookie, {
                    goformId: 'LTE_BAND_LOCK',
                    lte_band_lock: lte_bands.join(',')
                })).json(),
                (await postData(cookie, {
                    goformId: 'NR_BAND_LOCK',
                    nr_band_lock: nr_bands.join(',')
                })).json(),
            ]))
            if (res[0].result == 'success' || res[1].result == 'success') {
                createToast('设置频段成功！', 'green')
            }
            else {
                createToast('设置频段失败', 'red')
            }
        } catch {
            createToast('设置频段失败', 'red')
        } finally {
            await initBandForm()
        }
    }

    //锁基站
    let initCellInfo = async () => {
        try {
            //已锁基站信息
            //基站信息
            const { neighbor_cell_info, locked_cell_info } = await getData(new URLSearchParams({
                cmd: 'neighbor_cell_info,locked_cell_info'
            }))

            if (neighbor_cell_info) {
                const cellBodyEl = document.querySelector('#cellForm tbody')
                cellBodyEl.innerHTML = neighbor_cell_info.map(item => {
                    const { band, earfcn, pci, rsrp, rsrq, sinr } = item
                    return `
                    <tr onclick="onSelectCellRow(${pci},${earfcn})">
                        <td>${band}</td>
                        <td>${earfcn}</td>
                        <td>${pci}</td>
                        <td>${kano_parseSignalBar(rsrp)}</td>
                        <td>${kano_parseSignalBar(rsrq, -20, -3, -9, -12)}</td>
                        <td>${kano_parseSignalBar(sinr, -10, 30, 13, 0)}</td>
                    </tr>
                `
                }).join('')
            }
            if (locked_cell_info) {
                const lockedCellBodyEl = document.querySelector('#LOCKED_CELL_FORM tbody')
                lockedCellBodyEl.innerHTML = locked_cell_info.map(item => {
                    const { earfcn, pci, rat } = item
                    return `
                    <tr>
                        <td>${rat == '12' ? '4G' : '5G'}</td>
                        <td>${pci}</td>
                        <td>${earfcn}</td>
                    </tr>
                `
                }).join('')
            }
        } catch (e) {
            // createToast(e.message)
        }
    }

    let cellInfoRequestTimer = null
    initCellInfo()
    cellInfoRequestTimer = requestInterval(() => initCellInfo(), REFRESH_TIME + 500)

    let onSelectCellRow = (pci, earfcn) => {
        let pci_t = document.querySelector('#PCI')
        let earfcn_t = document.querySelector('#EARFCN')
        if (pci_t && earfcn_t) {
            pci_t.value = pci
            earfcn_t.value = earfcn
            createToast(`已选择: ${pci},${earfcn}`, 'green')
        }
    }

    //锁基站
    const submitCellForm = async (e) => {
        e.preventDefault()
        if (!(await initRequestData())) {
            out()
            return null
        }
        try {
            const cookie = await login()
            if (!cookie) {
                createToast('登录失败，请检查密码', 'red')
                out()
                return null
            }

            const ratEl = e.target.querySelector('input[name="RAT"]:checked')
            const pciEl = e.target.querySelector('#PCI')
            const earfcnEl = e.target.querySelector('#EARFCN')

            if (!ratEl || !pciEl || !earfcnEl) return

            const form = {
                pci: pciEl.value.trim(),
                earfcn: earfcnEl.value.trim(),
                rat: ratEl.value.trim()
            }

            if (!form.pci || !form.earfcn) {
                createToast('请填写完整数据', 'red')
                return
            }

            const res = await (await postData(cookie, {
                goformId: 'CELL_LOCK',
                ...form
            })).json()

            if (res.result == 'success') {
                pciEl.value = ''
                earfcnEl.value = ''
                createToast('设置基站成功！', 'green')
            } else {
                throw '设置基站失败'
            }
        } catch (e) {
            createToast('设置基站失败', 'red')
        }
    }

    let unlockAllCell = async () => {
        if (!(await initRequestData())) {
            out()
            return null
        }
        try {
            const cookie = await login()
            if (!cookie) {
                createToast('登录失败，请检查密码', 'red')
                out()
                return null
            }

            const res = await (await postData(cookie, {
                goformId: 'UNLOCK_ALL_CELL',
            })).json()

            if (res.result == 'success') {
                createToast('解锁基站成功！', 'green')
            } else {
                throw '解锁基站失败'
            }

        } catch {
            createToast('解锁基站失败', 'red')
        }
    }

    let rebootBtnCount = 1
    let rebootTimer = null
    let rebootDevice = async (e) => {
        let target = e.target
        if (!(await initRequestData())) {
            out()
            target.style.backgroundColor = '#80808073'
            return null
        }
        target.style.backgroundColor = ''
        rebootTimer && clearTimeout(rebootTimer)
        if (rebootBtnCount == 1) target.innerHTML = "确定重启?"
        if (rebootBtnCount == 2) target.innerHTML = "重启咯?"
        if (rebootBtnCount >= 3) {
            target.innerHTML = "重启中.."
            try {
                const cookie = await login()
                if (!cookie) {
                    createToast('登录失败，请检查密码', 'red')
                    out()
                    return null
                }

                const res = await (await postData(cookie, {
                    goformId: 'REBOOT_DEVICE',
                })).json()

                if (res.result == 'success') {
                    createToast('重启成功!', 'green')
                } else {
                    throw '重启失败！请检查网络'
                }

            } catch {
                createToast('重启失败！请检查网络', 'red')
            }
        }
        rebootBtnCount++
        rebootTimer = setTimeout(() => {
            rebootBtnCount = 1
            target.innerHTML = '重启设备'
        }, 3000);
    }

    rebootDeviceBtnInit = async () => {
        let target = document.querySelector('#REBOOT')
        if (!(await initRequestData())) {
            target.onclick = () => createToast('请登录', 'red')
            target.style.backgroundColor = '#80808073'
            return null
        }
        target.style.backgroundColor = ''
        target.onclick = rebootDevice
    }
    rebootDeviceBtnInit()

    //字段显示隐藏
    document.querySelector("#DICTIONARY").onclick = (e) => {
        showModal('#dictionaryModal', 300, '.8')
    }

    document.querySelector('#DIC_LIST')?.addEventListener('click', (e) => {
        let target = e.target
        e.stopPropagation()
        e.stopImmediatePropagation()
        if (target.id == 'DIC_LIST') {
            return
        }
        let inputEl = null
        if ((target.tagName).toLowerCase() != 'input') {
            return
        } else {
            inputEl = target
        }
        let id = inputEl.getAttribute('data-name')
        //寻找这个id属于哪个dragList
        const list_id = inputEl.closest("ul").id
        let list_name = null
        if (list_id == "draggable_status") list_name = 'statusShowList'
        if (list_id == "draggable_signal") list_name = 'signalShowList'
        if (list_id == "draggable_props") list_name = 'propsShowList'

        if (list_name == null) return

        let index = showList[list_name].findIndex(i => i.name == id)
        if (index != -1) {
            showList[list_name][index].isShow = inputEl.checked
        }

        localStorage.setItem('showList', JSON.stringify(showList))
    }, false)

    let resetShowListBtnCount = 1
    let resetShowListTimer = null
    let resetShowList = (e) => {
        const target = e.target
        resetShowListTimer && clearTimeout(resetShowListTimer)
        if (resetShowListBtnCount == 1) target.innerHTML = "确定？"
        if (resetShowListBtnCount >= 2) {
            localStorage.removeItem('showList');
            localStorage.removeItem('statusShowListDOM');
            localStorage.removeItem('signalShowListDOM');
            localStorage.removeItem('propsShowListDOM');
            location.reload()
        }
        resetShowListBtnCount++
        resetShowListTimer = setTimeout(() => {
            resetShowListBtnCount = 1
            target.innerHTML = '重置(全选)'
        }, 3000);
    }

    const startRefresh = () => {
        cellInfoRequestTimer = requestInterval(() => initCellInfo(), REFRESH_TIME + 500)
        StopStatusRenderTimer = requestInterval(() => handlerStatusRender(), REFRESH_TIME)
    }
    const stopRefresh = () => {
        StopStatusRenderTimer && StopStatusRenderTimer()
        cellInfoRequestTimer && cellInfoRequestTimer()
    }

    //暂停开始刷新
    document.querySelector('#REFRESH').onclick = (e) => {
        if (e.target.innerHTML == '开始刷新') {
            e.target.innerHTML = '停止刷新'
            createToast('已开始刷新', 'green')
            startRefresh()
        } else {
            e.target.innerHTML = '开始刷新'
            createToast('已停止刷新', 'green')
            stopRefresh()
        }
    }

    //流量管理逻辑
    document.querySelector("#DataManagement").onclick = async () => {
        if (!(await initRequestData())) {
            createToast('请登录！', 'red')
            out()
            return null
        }
        // 查流量使用情况
        let res = await getDataUsage()
        if (!res) {
            createToast('获取流量使用情况失败', 'red')
            return null
        }

        res = {
            ...res,
            "wan_auto_clear_flow_data_switch": isNullOrUndefiend(res.wan_auto_clear_flow_data_switch) ? res.wan_auto_clear_flow_data_switch : res.flux_auto_clear_flow_data_switch,
            "data_volume_limit_unit": isNullOrUndefiend(res.data_volume_limit_unit) ? res.data_volume_limit_unit : res.flux_data_volume_limit_unit,
            "data_volume_limit_size": isNullOrUndefiend(res.data_volume_limit_size) ? res.data_volume_limit_size : res.flux_data_volume_limit_size,
            "traffic_clear_date": isNullOrUndefiend(res.traffic_clear_date) ? res.traffic_clear_date : res.flux_clear_date,
            "data_volume_alert_percent": isNullOrUndefiend(res.data_volume_alert_percent) ? res.data_volume_alert_percent : res.flux_data_volume_alert_percent,
            "data_volume_limit_switch": isNullOrUndefiend(res.data_volume_limit_switch) ? res.data_volume_limit_switch : res.flux_data_volume_limit_switch,
        }

        // 预填充表单
        const form = document.querySelector('#DataManagementForm')
        if (!form) return null
        let data_volume_limit_switch = form.querySelector('input[name="data_volume_limit_switch"]')
        let wan_auto_clear_flow_data_switch = form.querySelector('input[name="wan_auto_clear_flow_data_switch"]')
        let data_volume_limit_unit = form.querySelector('input[name="data_volume_limit_unit"]')
        let traffic_clear_date = form.querySelector('input[name="traffic_clear_date"]')
        let data_volume_alert_percent = form.querySelector('input[name="data_volume_alert_percent"]')
        let data_volume_limit_size = form.querySelector('input[name="data_volume_limit_size"]')
        let data_volume_limit_type = form.querySelector('select[name="data_volume_limit_type"]')
        let data_volume_used_size = form.querySelector('input[name="data_volume_used_size"]')
        let data_volume_used_type = form.querySelector('select[name="data_volume_used_type"]')

        // (12094630728720/1024/1024)/1048576
        let used_size_type = 1
        const used_size = (() => {
            const total_bytes = ((Number(res.monthly_rx_bytes) + Number(res.monthly_tx_bytes))) / Math.pow(1024, 2)

            if (total_bytes < 1024) {
                return total_bytes.toFixed(2)
            } else if (total_bytes >= 1024 && total_bytes < Math.pow(1024, 2)) {
                used_size_type = 1024
                return (total_bytes / 1024).toFixed(2)
            } else {
                used_size_type = Math.pow(1024, 2)
                return (total_bytes / Math.pow(1024, 2)).toFixed(2)
            }
        })()

        data_volume_limit_switch && (data_volume_limit_switch.checked = res.data_volume_limit_switch.toString() == '1')
        wan_auto_clear_flow_data_switch && (wan_auto_clear_flow_data_switch.checked = res.wan_auto_clear_flow_data_switch.toString() == 'on')
        data_volume_limit_unit && (data_volume_limit_unit.checked = res.data_volume_limit_unit.toString() == 'data')
        traffic_clear_date && (traffic_clear_date.value = res.traffic_clear_date.toString())
        data_volume_alert_percent && (data_volume_alert_percent.value = res.data_volume_alert_percent.toString())
        data_volume_limit_size && (data_volume_limit_size.value = res.data_volume_limit_size?.split('_')[0].toString())
        data_volume_limit_type && (() => {
            const val = Number(res.data_volume_limit_size?.split('_')[1])
            const option = data_volume_limit_type.querySelector(`option[data-value="${val}"]`)
            option && (option.selected = true)
        })()
        data_volume_used_size && (data_volume_used_size.value = used_size.toString())
        data_volume_used_type && (() => {
            const option = data_volume_used_type.querySelector(`option[data-value="${used_size_type.toFixed(0)}"]`)
            option && (option.selected = true)
        })()
        showModal('#DataManagementModal')
    }

    //流量管理表单提交
    let handleDataManagementFormSubmit = async (e) => {
        e.preventDefault();
        try {
            const cookie = await login()
            if (!cookie) {
                createToast('登录失败，请检查密码', 'red')
                closeModal('#DataManagementModal')
                setTimeout(() => {
                    out()
                }, 310);
                return null
            }

            let form_data = {
                "data_volume_limit_switch": "0",
                "wan_auto_clear_flow_data_switch": "off",
                "data_volume_limit_unit": "data",
                "traffic_clear_date": "0",
                "data_volume_alert_percent": "0",
                "data_volume_limit_size": "0",
                "data_volume_limit_type": "1", //MB GB TB
                "data_volume_used_size": "0",
                "data_volume_used_type": "1", //MB GB TB
                // 时间
                "notify_deviceui_enable": "0",
            }

            const form = e.target; // 获取表单
            const formData = new FormData(form);

            for (const [key, value] of formData.entries()) {
                switch (key) {
                    case 'data_volume_limit_switch':
                        form_data[key] = value.trim() == 'on' ? '1' : '0'
                        form_data['flux_data_volume_limit_switch'] = value.trim() == 'on' ? '1' : '0'
                        break;
                    case 'wan_auto_clear_flow_data_switch':
                        form_data[key] = value.trim() == 'on' ? 'on' : '0'
                        form_data['flux_auto_clear_flow_data_switch'] = value.trim() == 'on' ? 'on' : '0'
                        break;
                    case 'data_volume_limit_unit':
                        form_data[key] = value.trim() == 'on' ? 'data' : 'time'
                        form_data['flux_data_volume_limit_unit'] = value.trim() == 'on' ? 'data' : 'time'
                        break;
                    case 'traffic_clear_date':
                        if (isNaN(Number(value.trim()))) {
                            createToast('清零日期必须为数字', 'red')
                            return
                        }
                        if (Number(value.trim()) < 0 || Number(value.trim()) > 31) {
                            createToast('清零日期必须在0-31之间', 'red')
                            return
                        }
                        form_data[key] = value.trim()
                        form_data['flux_clear_date'] = value.trim()
                        break;
                    case 'data_volume_alert_percent':
                        if (isNaN(Number(value.trim())) || value.trim() == '') {
                            createToast('提醒阈值输入错误', 'red')
                            return
                        }
                        if (Number(value.trim()) < 0 || Number(value.trim()) > 100) {
                            createToast('提醒阈值必须在0-100之间', 'red')
                            return
                        }
                        form_data[key] = value.trim()
                        form_data['flux_data_volume_alert_percent'] = value.trim()
                        break;
                    case 'data_volume_limit_size':
                        if (isNaN(Number(value.trim()))) {
                            createToast('流量套餐必须为数字', 'red')
                            return
                        }
                        if (Number(value.trim()) <= 0) {
                            createToast('流量套餐必须大于0', 'red')
                            return
                        }
                        form_data[key] = value.trim()
                        form_data['flux_data_volume_limit_size'] = value.trim()
                        break;
                    case 'data_volume_limit_type':
                        form_data[key] = '_' + value.trim()
                        form_data['flux_data_volume_limit_type'] = '_' + value.trim()
                        break;
                    case 'data_volume_used_size':
                        if (isNaN(Number(value.trim()))) {
                            createToast('已用流量必须为数字', 'red')
                            return
                        }
                        if (Number(value.trim()) <= 0) {
                            createToast('已用流量必须大于0', 'red')
                            return
                        }
                        form_data[key] = value.trim()
                        break;
                    case 'data_volume_used_type':
                        form_data[key] = value.trim()
                        break;
                }
            }
            form_data['data_volume_limit_size'] = form_data['data_volume_limit_size'] + form_data['data_volume_limit_type']
            form_data['flux_data_volume_limit_size'] = form_data['data_volume_limit_size']
            const used_data = Number(form_data.data_volume_used_size) * Number(form_data['data_volume_used_type']) * Math.pow(1024, 2)
            const clear_form_data = {
                data_volume_limit_switch: form_data['data_volume_limit_switch'],
                wan_auto_clear_flow_data_switch: 'on',
                traffic_clear_date: '1',
                notify_deviceui_enable: '0',
                flux_data_volume_limit_switch: form_data['data_volume_limit_switch'],
                flux_auto_clear_flow_data_switch: 'on',
                flux_clear_date: '1',
                flux_notify_deviceui_enable: '0'
            }
            delete form_data['data_volume_limit_type']
            //发请求
            try {
                const tempData = form_data['data_volume_limit_switch'] == '0' ? clear_form_data : form_data
                const res = await (await postData(cookie, {
                    goformId: 'DATA_LIMIT_SETTING',
                    ...tempData
                })).json()

                const res1 = await (await postData(cookie, {
                    goformId: 'FLOW_CALIBRATION_MANUAL',
                    calibration_way: form_data.data_volume_limit_unit,
                    time: 0,
                    data: used_data.toFixed(0)
                })).json()

                if (res.result == 'success' && res1.result == 'success') {
                    createToast('设置成功!', 'green')
                    closeModal('#DataManagementModal')
                } else {
                    throw '设置失败！请检查网络'
                }
            } catch (e) {
                createToast(e.message, 'red')
            }
        } catch (e) {
            createToast(e.message, 'red')
        }
    };


    //WIFI管理逻辑
    let initWIFIManagementForm = async () => {
        try {
            let { WiFiModuleSwitch, ResponseList } = await getData(new URLSearchParams({
                cmd: 'queryWiFiModuleSwitch,queryAccessPointInfo'
            }))

            const WIFIManagementForm = document.querySelector('#WIFIManagementForm')
            if (!WIFIManagementForm) return

            if (WiFiModuleSwitch == "1" && ResponseList?.length) {
                for (let index in ResponseList) {
                    if (ResponseList[index].AccessPointSwitchStatus == '1') {
                        let item = ResponseList[index]
                        let apEl = WIFIManagementForm.querySelector('input[name="AccessPointIndex"]')
                        let chipEl = WIFIManagementForm.querySelector('input[name="ChipIndex"]')
                        let ApMaxStationNumberEl = WIFIManagementForm.querySelector('input[name="ApMaxStationNumber"]')
                        let PasswordEl = WIFIManagementForm.querySelector('input[name="Password"]')
                        let ApBroadcastDisabledEl = WIFIManagementForm.querySelector('input[name="ApBroadcastDisabled"]')
                        let SSIDEl = WIFIManagementForm.querySelector('input[name="SSID"]')
                        let QRCodeImg = document.querySelector("#QRCodeImg")
                        let AuthModeEl = WIFIManagementForm.querySelector('select[name="AuthMode"]')
                        apEl && (apEl.value = item.AccessPointIndex)
                        chipEl && (chipEl.value = item.ChipIndex)
                        ApMaxStationNumberEl && (ApMaxStationNumberEl.value = item.ApMaxStationNumber)
                        PasswordEl && (PasswordEl.value = decodeBase64(item.Password))
                        ApBroadcastDisabledEl && (ApBroadcastDisabledEl.checked = item.ApBroadcastDisabled.toString() == '0')
                        SSIDEl && (SSIDEl.value = item.SSID)
                        // 二维码
                        fetch(KANO_baseURL + item.QrImageUrl, {
                            headers: common_headers
                        }).then(async (res) => {
                            const blob = await res.blob();
                            const objectURL = URL.createObjectURL(blob);
                            QRCodeImg.onload = () => {
                                URL.revokeObjectURL(objectURL);
                            };
                            QRCodeImg.src = objectURL;
                        });
                        const WIFI_FORM_SHOWABLE = document.querySelector('#WIFI_FORM_SHOWABLE')
                        AuthModeEl.value = item.AuthMode
                        AuthModeEl.selected = item.AuthMode
                        if (AuthModeEl && WIFI_FORM_SHOWABLE) {
                            const option = AuthModeEl.querySelector(`option[data-value="${item.AuthMode}"]`)
                            option && (option.selected = "selected")
                            if (item.AuthMode == "OPEN") {
                                WIFI_FORM_SHOWABLE.style.display = 'none'
                            } else {
                                WIFI_FORM_SHOWABLE.style.display = ''
                            }
                        }

                    }
                }
            }
        }
        catch (e) {
            console.error(e.message)
            // createToast(e.message)
        }
    }

    document.querySelector("#WIFIManagement").onclick = async () => {
        if (!(await initRequestData())) {
            createToast('请登录！', 'red')
            out()
            return null
        }
        await initWIFIManagementForm()
        showModal("#WIFIManagementModal")
    }

    let handleWIFIManagementFormSubmit = async (e) => {
        e.preventDefault();
        try {
            const cookie = await login()
            if (!cookie) {
                createToast('登录失败，请检查密码', 'red')
                closeModal('#WIFIManagementModal')
                setTimeout(() => {
                    out()
                }, 310);
                return null
            }

            const form = e.target; // 获取表单
            const formData = new FormData(form);

            let data = {
                SSID: '',
                AuthMode: '',
                EncrypType: '',
                Password: '',
                ApMaxStationNumber: '',
                ApBroadcastDisabled: 1,
                ApIsolate: 0,
                ChipIndex: 0,
                AccessPointIndex: 0
            }

            for (const [key, value] of formData.entries()) {
                switch (key) {
                    case 'SSID':
                        value.trim() && (data[key] = value.trim())
                        break;
                    case 'AuthMode':
                        value == 'OPEN' ? data['EncrypType'] = "NONE" : data['EncrypType'] = "CCMP"
                        value.trim() && (data[key] = value.trim())
                        break;
                    case 'ApBroadcastDisabled':
                        data[key] = value == 'on' ? 0 : 1
                        break;
                    case 'Password':
                        // if(!value.trim()) createToast('请输入密码！')
                        value.trim() && (data[key] = encodeBase64(value.trim()))
                        break;
                    case 'ApIsolate':
                    case 'ApMaxStationNumber':
                    case 'AccessPointIndex':
                    case 'ChipIndex':
                        !isNaN(Number(value.trim())) && (data[key] = Number(value.trim()))
                        break;
                }
            }

            if (data.AuthMode == 'OPEN' || data.EncrypType == "NONE") {
                delete data.Password
            } else {
                if (data.Password.length == 0) {
                    return createToast('请输入密码', 'red')
                }
                if (data.Password.length < 8) {
                    return createToast('密码至少8位数', 'red')
                }
                if (data.ApMaxStationNumber.length <= 0) {
                    return createToast('最大接入必须大于0', 'red')
                }
            }

            const res = await (await postData(cookie, {
                goformId: 'setAccessPointInfo',
                ...data
            })).json()

            if (res.result == 'success') {
                createToast('设置成功! 请重新连接WIFI！', 'green')
                closeModal('#WIFIManagementModal')
            } else {
                throw '设置失败！请检查网络'
            }
        }
        catch (e) {
            console.error(e.message)
            // createToast(e.message)
        }
    }

    let handleWifiEncodeChange = (event) => {
        const WIFI_FORM_SHOWABLE = document.querySelector('#WIFI_FORM_SHOWABLE')
        const target = event.target
        if (target) {
            console.log(target.value);
            if (WIFI_FORM_SHOWABLE) {
                if (target.value == "OPEN") {
                    WIFI_FORM_SHOWABLE.style.display = 'none'
                } else {
                    WIFI_FORM_SHOWABLE.style.display = ''
                }
            }
        }
    }

    let handleShowPassword = (e) => {
        const target = e.target
        const WIFI_PASSWORD = document.querySelector('#WIFI_PASSWORD')
        if (target && WIFI_PASSWORD) {
            WIFI_PASSWORD.setAttribute('type', target.checked ? "text" : "password")
        }
    }

    document.querySelector('#tokenInput').addEventListener('keydown', (event) => {
        if (event.key === 'Enter') {
            onTokenConfirm()
        }
    });

    //无线设备管理
    document.querySelector('#ClientManagement').onclick = async () => {
        if (!(await initRequestData())) {
            createToast('请登录！', 'red')
            out()
            return null
        }
        await initClientManagementModal()
        showModal('#ClientManagementModal')
    }

    let initClientManagementModal = async () => {
        try {
            // 获取连接设备
            const { station_list, lan_station_list, BlackMacList, BlackNameList, AclMode } = await getData(new URLSearchParams({
                cmd: 'station_list,lan_station_list,queryDeviceAccessControlList'
            }))
            const blackMacList = BlackMacList ? BlackMacList.split(';') : []
            const blackNameList = BlackNameList ? BlackNameList.split(';') : []

            const CONN_CLIENT_LIST = document.querySelector('#CONN_CLIENT_LIST')
            const BLACK_CLIENT_LIST = document.querySelector('#BLACK_CLIENT_LIST')

            //渲染设备列表
            let conn_client_html = ''
            let black_list_html = ''

            if (station_list && station_list.length) {
                conn_client_html += station_list.map(({ hostname, ip_addr, mac_addr }) => (`
            <div style="display: flex;width: 100%;margin: 10px 0;overflow: auto;"
                class="card-item">
                <div style="margin-right: 10px;">
                    <p style="display: flex;justify-content: space-between;">
                        <span style="justify-self: start;">主机名称：</span>
                        <span onclick="copyText(event)">${hostname}</span>
                    </p>
                    <p style="display: flex;justify-content: space-between;">
                        <span style="justify-self: start;">MAC地址：</span>
                        <span onclick="copyText(event)">${mac_addr}</span>
                    </p>
                    <p style="display: flex;justify-content: space-between;">
                        <span style="justify-self: start;">IP地址：</span>
                        <span onclick="copyText(event)">${ip_addr}</span>
                    </p>
                    <p style="display: flex;justify-content: space-between;">
                        <span style="justify-self: start;">接入类型：</span>
                        <span>无线</span>
                    </p>
                </div>
                <div style="flex:1;text-align: right;">
                    <button class="btn" style="padding: 20px 4px;" onclick="setOrRemoveDeviceFromBlackList('${[mac_addr, ...blackMacList].join(';')}','${[hostname, ...blackNameList].join(';')}','${AclMode}')">🚫 拉黑</button>
                </div>
            </div>`)).join('')
            }
            if (lan_station_list && lan_station_list.length) {
                conn_client_html += lan_station_list.map(({ hostname, ip_addr, mac_addr }) => (`
            <div style="display: flex;width: 100%;margin: 10px 0;overflow: auto;"
                class="card-item">
                <div style="margin-right: 10px;">
                    <p style="display: flex;justify-content: space-between;">
                        <span style="justify-self: start;">主机名称：</span>
                        <span onclick="copyText(event)">${hostname}</span>
                    </p>
                    <p style="display: flex;justify-content: space-between;">
                        <span style="justify-self: start;">MAC地址：</span>
                        <span onclick="copyText(event)">${mac_addr}</span>
                    </p>
                    <p style="display: flex;justify-content: space-between;">
                        <span style="justify-self: start;">IP地址：</span>
                        <span onclick="copyText(event)">${ip_addr}</span>
                    </p>
                    <p style="display: flex;justify-content: space-between;">
                        <span style="justify-self: start;">接入类型：</span>
                        <span>有线</span>
                    </p>
                </div>
                <div style="flex:1;text-align: right;">
                    <button class="btn" style="padding: 20px 4px;" onclick="setOrRemoveDeviceFromBlackList('${[mac_addr, ...blackMacList].join(';')}','${[hostname, ...blackNameList].join(';')}','${AclMode}')">🚫 拉黑</button>
                </div>
            </div>`)).join('')
            }
            if (blackMacList.length && blackNameList.length) {
                black_list_html += blackMacList.map((item, index) => {
                    if (item) {
                        let params = `'${blackMacList.filter(i => item != i).join(';')}'` + ","
                            + `'${blackMacList.filter(i => blackNameList[index] != i).join(';')}'` + ","
                            + `'${AclMode}'`
                        return `
                    <div style="display: flex;width: 100%;margin: 10px 0;overflow: auto;"
                        class="card-item">
                        <div style="margin-right: 10px;">
                            <p style="display: flex;justify-content: space-between;">
                                <span style="justify-self: start;">主机名称：</span>
                                <span onclick="copyText(event)">${blackNameList[index] ? blackNameList[index] : '未知'}</span>
                            </p>
                            <p style="display: flex;justify-content: space-between;">
                                <span style="justify-self: start;">MAC地址：</span>
                                <span onclick="copyText(event)">${item}</span>
                            </p>
                        </div>
                        <div style="flex:1;text-align: right;">
                            <button class="btn" style="padding: 20px 4px;" onclick="setOrRemoveDeviceFromBlackList(${params})">✅ 解封</button>
                        </div>
                    </div>`
                    }
                }).join('')
            }

            if (conn_client_html == '') conn_client_html = '<p>暂无设备</p>'
            if (black_list_html == '') black_list_html = '<p>暂无设备</p>'
            CONN_CLIENT_LIST && (CONN_CLIENT_LIST.innerHTML = conn_client_html)
            BLACK_CLIENT_LIST && (BLACK_CLIENT_LIST.innerHTML = black_list_html)
        } catch (e) {
            console.error(e);
            createToast('获取数据失败，请检查网络连接', 'red')
        }
    }

    let setOrRemoveDeviceFromBlackList = async (BlackMacList, BlackNameList, AclMode) => {
        try {
            const cookie = await login()
            if (!cookie) {
                createToast('登录失败，请检查密码', 'red')
                closeModal('#ClientManagementModal')
                setTimeout(() => {
                    out()
                }, 310);
                return null
            }
            const res = await postData(cookie, {
                goformId: "setDeviceAccessControlList",
                AclMode: AclMode.trim(),
                WhiteMacList: "",
                BlackMacList: BlackMacList.trim(),
                WhiteNameList: "",
                BlackNameList: BlackNameList.trim()
            })
            const { result } = await res.json()
            if (result && result == 'success') {
                createToast('设置成功', 'green')
            } else {
                createToast('设置失败', 'red')
            }
            await initClientManagementModal()
        }
        catch (e) {
            console.error(e);
            createToast('请求数据失败，请检查网络连接', 'red')
        }
    }

    let closeClientManager = () => {
        closeModal('#ClientManagementModal')
    }

    //开关蜂窝数据
    let handlerCecullarStatus = async () => {
        const btn = document.querySelector('#CECULLAR')
        if (!(await initRequestData())) {
            btn.onclick = () => createToast('请登录', 'red')
            btn.style.backgroundColor = '#80808073'
            return null
        }
        let res = await getData(new URLSearchParams({
            cmd: 'ppp_status'
        }))
        btn.onclick = async () => {
            try {
                if (!(await initRequestData())) {
                    return null
                }
                const cookie = await login()
                if (!cookie) {
                    createToast('登录失败，请检查密码', 'red')
                    out()
                    return null
                }
                btn.innerHTML = '更改中..'
                let res1 = await (await postData(cookie, {
                    goformId: res.ppp_status == 'ppp_disconnected' ? 'CONNECT_NETWORK' : 'DISCONNECT_NETWORK',
                })).json()
                if (res1.result == 'success') {
                    setTimeout(async () => {
                        await handlerCecullarStatus()
                        createToast('操作成功！', 'green')
                        QOSRDPCommand("AT+CGEQOSRDP=1")
                    }, 2000);
                } else {
                    createToast('操作失败！', 'red')
                }
            } catch (e) {
                // createToast(e.message)
            }
        }
        btn.innerHTML = '数据流量'
        btn.style.backgroundColor = res.ppp_status == 'ppp_disconnected' ? '' : '#018ad8a8'
    }
    handlerCecullarStatus()

    // title
    const loadTitle = async () => {
        try {
            const { app_ver, model } = await (await fetch(`${KANO_baseURL}/version_info`, { headers: common_headers })).json()
            MODEL.innerHTML = `设备：${model}`
            document.querySelector('#TITLE').innerHTML = `[${model}]UFI-TOOLS-WEB Ver: ${app_ver}`
            document.querySelector('#MAIN_TITLE').innerHTML = `UFI-TOOLS <span style="font-size:14px">Ver: ${app_ver}</span>`
        } catch {/*没有，不处理*/ }
    }
    loadTitle()

    //设置背景图片
    const initBGBtn = async () => {
        const btn = document.querySelector('#BG_SETTING')
        if (!(await initRequestData())) {
            btn.onclick = () => createToast('请登录', 'red')
            btn.style.backgroundColor = '#80808073'
            return null
        }
        btn.style.backgroundColor = ''
        btn.onclick = () => {
            showModal('#bgSettingModal')
            initBG()
        }
    }
    initBGBtn()

    //设置主题背景
    let handleSubmitBg = async (showSuccessToast = true) => {
        const custom_head = document.querySelector('#custom_head')
        const imgUrl = document.querySelector('#BG_INPUT')?.value
        const bg_checked = document.querySelector('#isCheckedBG')?.checked
        const BG = document.querySelector('#BG')
        const BG_OVERLAY = document.querySelector('#BG_OVERLAY')
        if ((await initRequestData())) {
            setCustomHead(custom_head.value?.trim() || '').then(async ({ result, error }) => {
                if (result != "success") {
                    if (error)
                        createToast(error, 'red')
                    else
                        createToast('自定义头部保存失败，请检查网络', 'red')
                }
            })
        } else {
            createToast('没有登录，自定义头部不会保存', 'yellow')
        }

        if (!BG || bg_checked == undefined || !BG_OVERLAY) return
        if (!bg_checked) {
            BG.style.backgroundImage = 'unset'
        } else {
            imgUrl.trim() && (BG.style.backgroundImage = `url(${imgUrl})`)
        }
        //发请求同步数据
        try {
            const { result, error } = await (await fetch(`${KANO_baseURL}/set_theme`, {
                method: 'POST',
                headers: common_headers,
                body: JSON.stringify({
                    "backgroundEnabled": bg_checked,
                    "backgroundUrl": imgUrl?.trim() || '',
                    "textColor": document.querySelector('#textColorEl')?.value || '100',
                    "textColorPer": document.querySelector('#textColorEl')?.value || '100',
                    "themeColor": document.querySelector('#colorEl')?.value || '61',
                    "colorPer": document.querySelector('#colorEl')?.value || '61',
                    "saturationPer": document.querySelector('#saturationEl')?.value || '16',
                    "brightPer": document.querySelector('#brightEl')?.value || '16',
                    "opacityPer": document.querySelector('#opacityEl')?.value || '37',
                    "blurSwitch": document.querySelector('#blurSwitch')?.checked || true
                })
            })).json()

            if (result == "success") {
                showSuccessToast && createToast('保存成功，已同步至机器~', 'green')
                document.querySelector('#fileUploader').value = ''
                closeModal('#bgSettingModal')
            }
            else throw error || ''
        }
        catch (e) {
            createToast(`同步失败!`, 'red')
        }
    }

    //初始化背景图片
    const initBG = async () => {
        const head_text = await getCustomHead()
        const BG = document.querySelector('#BG')
        const isCheckedBG = document.querySelector('#isCheckedBG')
        const BG_INPUT = document.querySelector('#BG_INPUT')

        if (head_text) {
            const custom_head = document.querySelector('#custom_head')
            if (custom_head) {
                custom_head.value = head_text
            }
        }

        if (!BG || !isCheckedBG || !BG_INPUT) return

        // 从配置文件读取背景设置
        try {
            const result = await (await fetch(`${KANO_baseURL}/get_theme`, {
                method: 'get',
                headers: common_headers
            })).json()

            if (result) {
                isCheckedBG.checked = result.backgroundEnabled === "true"
                if (result.backgroundUrl?.length < 9999) {
                    BG_INPUT.value = result.backgroundUrl
                }
                if (result.backgroundEnabled === "true" && result.backgroundUrl) {
                    BG.style.backgroundImage = `url(${result.backgroundUrl})`
                }
            }
        } catch (e) {
            console.error('读取背景配置失败:', e)
        }
    }
    initBG()

    //重置主题
    let resetThemeBtnTimer = 1
    let isConfirmResetTheme = false
    const resetTheme = async (e) => {
        e.target.innerHTML = "确定？"
        if (!isConfirmResetTheme) {
            isConfirmResetTheme = true
            return
        }
        resetThemeBtnTimer && clearTimeout(resetThemeBtnTimer)
        resetThemeBtnTimer = setTimeout(() => {
            isConfirmResetTheme = false
            e.target.disabled = false
            e.target.innerHTML = '重置主题'
        }, 2000)
        try {
            const { result, error } = await (await fetch(`${KANO_baseURL}/set_theme`, {
                method: 'POST',
                headers: common_headers,
                body: JSON.stringify({})
            })).json()

            if (result == "success") {
                createToast('重置成功，已同步至机器~', 'green')
                document.querySelector('#fileUploader').value = ''
                setTimeout(() => {
                    initBG().then(() => {
                        handleSubmitBg(false)
                    })
                }, 100);
            }
            else throw error || ''
        }
        catch (e) {
            createToast(`重置失败!`, 'red')
        }
        initTheme && initTheme()
        e.target.innerHTML = '重置主题'
        e.target.disabled = true
    }

    //定时重启模态框
    let initScheduleRebootStatus = async () => {
        const btn = document.querySelector('#SCHEDULE_REBOOT')
        const SCHEDULE_TIME = document.querySelector('#SCHEDULE_TIME')
        const SCHEDULE_ENABLED = document.querySelector('#SCHEDULE_ENABLED')
        if (!btn) return
        if (!(await initRequestData())) {
            btn.onclick = () => createToast('请登录', 'red')
            btn.style.backgroundColor = '#80808073'
            return null
        }

        const { restart_schedule_switch, restart_time } = await getData(new URLSearchParams({
            cmd: 'restart_schedule_switch,restart_time'
        }))

        SCHEDULE_ENABLED.checked = restart_schedule_switch == '1'
        SCHEDULE_TIME.value = restart_time
        btn.style.backgroundColor = restart_schedule_switch == '1' ? '#018ad8a8' : ''

        btn.onclick = async () => {
            if (!(await initRequestData())) {
                btn.onclick = () => createToast('请登录', 'red')
                btn.style.backgroundColor = '#80808073'
                return null
            }
            showModal('#scheduleRebootModal')
        }
    }
    initScheduleRebootStatus()

    let handleScheduleRebootFormSubmit = async (e) => {
        e.preventDefault()
        const data = {
            restart_schedule_switch: "0",
            restart_time: '00:00'
        }
        const form = e.target; // 获取表单
        const formData = new FormData(form);
        let regx = /^(0?[0-9]|1[0-9]|2[0-3]):(0?[0-9]|[1-5][0-9])$/
        for ([key, value] of formData.entries()) {
            switch (key) {
                case 'restart_time':
                    if (!regx.exec(value.trim()) || !value.trim()) return createToast('请输入正确的重启时间 (00:00-23:59)', 'red')
                    data.restart_time = value.trim()
                    break;
                case 'restart_schedule_switch':
                    data.restart_schedule_switch = value == 'on' ? '1' : '0'
            }
        }
        try {
            const cookie = await login()
            try {
                const res = await (await postData(cookie, {
                    goformId: 'RESTART_SCHEDULE_SETTING',
                    restart_time: data.restart_time,
                    restart_schedule_switch: data.restart_schedule_switch
                })).json()
                if (res?.result == 'success') {
                    createToast('设置成功！', 'green')
                    initScheduleRebootStatus()
                    closeModal('#scheduleRebootModal')
                } else {
                    throw '设置失败'
                }
            } catch {
                createToast('设置失败！', 'red')
            }
        } catch {
            createToast('登录失败，请检查密码和网络连接', 'red')
        }
    }

    // U30AIR用关机指令
    let shutDownBtnCount = 1
    let shutDownBtnTimer = null
    let initShutdownBtn = async () => {
        const btn = document.querySelector('#SHUTDOWN')
        if (!btn) return
        if (!(await initRequestData())) {
            btn.onclick = () => createToast('请登录', 'red')
            btn.style.backgroundColor = '#80808073'
            return null
        }

        const { battery_value, battery_vol_percent } = await getData(new URLSearchParams({
            cmd: 'battery_value,battery_vol_percent'
        }))

        if (battery_value && battery_vol_percent && (battery_value != '' && battery_vol_percent != '')) {
            // 显示按钮
            btn.style.display = ''

        } else {
            //没电池的不显示此按钮
            btn.style.display = 'none'
        }
        btn.style.backgroundColor = 'var(--dark-btn-color)'
        btn.onclick = async () => {
            if (!(await initRequestData())) {
                btn.onclick = () => createToast('请登录', 'red')
                btn.style.backgroundColor = '#80808073'
                return null
            }
            shutDownBtnCount++
            btn.innerHTML = "确认关机？"
            shutDownBtnTimer && clearTimeout(shutDownBtnTimer)
            shutDownBtnTimer = setTimeout(() => {
                shutDownBtnCount = 0
                btn.innerHTML = '关机'
            }, 3000)
            if (shutDownBtnCount < 3) {
                return
            } else {
                btn.innerHTML = '正在关机'
            }
            try {
                const cookie = await login()
                try {
                    const res = await (await postData(cookie, {
                        goformId: 'SHUTDOWN_DEVICE'
                    })).json()
                    if (res?.result == 'success') {
                        createToast('关机成功！', 'green')
                    } else {
                        createToast('关机失败', 'red')
                    }
                } catch {
                    createToast('关机失败', 'red')
                }
            } catch {
                createToast('登录失败，请检查密码和网络连接', 'red')
            }
        }
    }
    initShutdownBtn()

    // 启用TTYD（如果有）
    let initTTYD = async () => {
        const TTYD = document.querySelector('#TTYD')
        if (!TTYD) return
        const list = TTYD.querySelector('.deviceList')
        if (!list) return
        //fetch TTYD地址，如有，则显示
        try {
            const port = localStorage.getItem('ttyd_port')
            if (!port) return
            const TTYD_INPUT = document.querySelector('#TTYD_INPUT')
            TTYD_INPUT && (TTYD_INPUT.value = port)
            const res = await (await fetch(`${KANO_baseURL}/hasTTYD?port=${port}`, {
                method: "get",
                headers: common_headers
            })).json()
            if (res.code !== '200') {
                TTYD.style.display = 'none'
                list.innerHTML = ``
                return
            }
            console.log('TTYD已找到，正在启用。。。')
            TTYD.style.display = ''
            setTimeout(() => {
                const title = TTYD.querySelector('.title strong')
                title && (title.innerHTML = "TTYD")
                list.innerHTML = `
        <li style = "padding:10px">
                    <iframe src="http://${res.ip}" style="border:none;padding:0;margin:0;width:100%;height:400px;border-radius: 10px;overflow: hidden;opacity: .6;"></iframe>
        </li > `
            }, 600);
        } catch {
            // console.log();
        }
    }
    initTTYD()

    let click_count_ttyd = 1
    let ttyd_timer = null
    let enableTTYD = () => {
        click_count_ttyd++
        if (click_count_ttyd == 4) {
            // 启用ttyd弹窗
            showModal('#TTYDModal')
        }
        ttyd_timer && clearInterval(ttyd_timer)
        ttyd_timer = setTimeout(() => {
            click_count_ttyd = 1
        }, 1999)
    }

    let handleTTYDFormSubmit = (e) => {
        e.preventDefault()
        const form = e.target
        const formData = new FormData(form);
        const ttyd_port = formData.get('ttyd_port')
        if (!ttyd_port || ttyd_port.trim() == '') return createToast('请填写端口', 'red')
        let ttydNumber = Number(ttyd_port.trim())
        if (isNaN(ttydNumber) || ttydNumber <= 0 || ttydNumber > 65535) return createToast('请填写正确的端口', 'red')
        // 保存ttyd port
        localStorage.setItem('ttyd_port', ttyd_port)
        createToast('保存成功', 'green')
        closeModal('#TTYDModal')
        initTTYD()
    }


    function parseCGEQOSRDP(input) {
        const match = input.match(/\+CGEQOSRDP:\s*(.+?)\s*OK/);
        if (!match) {
            return input
        }

        const parts = match[1].split(',').map(Number);
        if (parts.length < 8) {
            return input
        }
        return `QCI等级：${parts[1]} 🔽 ${+parts[6] / 1000}Mbps 🔼 ${+parts[7] / 1000}Mbps`
    }


    const executeATCommand = async (command, slot = null) => {
        let at_slot_value = document.querySelector("#AT_SLOT")?.value
        if (slot == null || slot == undefined) {
            if (isNaN(Number(at_slot_value?.trim())) || at_slot_value == undefined || at_slot_value == null) {
                slot = 0
            } else {
                slot = at_slot_value.trim()
            }
        }
        try {
            const command_enc = encodeURIComponent(command)
            const res = await (await fetch(`${KANO_baseURL}/AT?command=${command_enc}&slot=${slot}`, { headers: common_headers })).json()
            return res
        } catch (e) {
            return null
        }
    }

    async function QOSRDPCommand(cmd) {
        if (!cmd) return QORS_MESSAGE = null
        // 获取当前卡槽
        let { sim_slot } = await getData(new URLSearchParams({
            cmd: 'sim_slot'
        }))
        //获取是否支持双sim卡
        const { dual_sim_support } = await getData(new URLSearchParams({
            cmd: 'dual_sim_support'
        }))
        if (!sim_slot || dual_sim_support != '1') {
            sim_slot = 0
        }
        let res = await executeATCommand(cmd, sim_slot)
        if (res.result) return QORS_MESSAGE = parseCGEQOSRDP(res.result)
        return QORS_MESSAGE = null
    }
    QOSRDPCommand("AT+CGEQOSRDP=1")

    let initATBtn = async () => {
        const el = document.querySelector('#AT')
        if (!(await initRequestData()) || !el) {
            el.onclick = () => createToast('请登录', 'red')
            el.style.backgroundColor = '#80808073'
            return null
        }
        el.style.backgroundColor = ''
        el.onclick = () => {
            showModal('#ATModal')
        }
    }
    initATBtn()


    const handleATFormSubmit = async () => {
        const AT_value = document.querySelector('#AT_INPUT')?.value;
        if (!AT_value || AT_value.trim() === '') {
            return createToast('请输入AT指令', 'red');
        }

        const AT_RESULT = document.querySelector('#AT_RESULT');
        AT_RESULT.innerHTML = "执行中,请耐心等待...";

        try {
            const res = await executeATCommand(AT_value.trim());

            if (res) {
                if (res.error) {
                    AT_RESULT.innerHTML = `<p style="overflow: hidden;">${res.error}</p>`;
                    createToast('执行失败', 'red');
                    return;
                }
                AT_RESULT.innerHTML = `<p onclick="copyText(event)"  style="overflow: hidden;">${parseCGEQOSRDP(res.result)}</p>`;
                createToast('执行成功', 'green');
            } else {
                createToast('执行失败', 'red');
            }

        } catch (err) {
            const error = err?.error || '未知错误';
            AT_RESULT.innerHTML = `<p style="overflow: hidden;">${error}</p>`;
            createToast('执行失败', 'red');
        }
    };

    const handleQosAT = async () => {
        const AT_RESULT = document.querySelector('#AT_RESULT');
        AT_RESULT.innerHTML = "执行中,请耐心等待...";

        try {
            const res = await executeATCommand('AT+CGEQOSRDP=1');

            if (res) {
                if (res.error) {
                    AT_RESULT.innerHTML = `<p style="overflow: hidden;">${res.error}</p>`;
                    createToast('执行失败', 'red');
                    return;
                }

                AT_RESULT.innerHTML = `<p onclick="copyText(event)"  style="overflow: hidden;">${parseCGEQOSRDP(res.result)}</p>`;
                createToast('执行成功', 'green');
            } else {
                createToast('执行失败', 'red');
            }

        } catch (err) {
            const error = err?.error || '未知错误';
            AT_RESULT.innerHTML = `<p style="overflow: hidden;">${error}</p>`;
            createToast('执行失败', 'red');
        }
    };

    const handleAT = async (params) => {
        if (!params) return
        // 执行AT
        const AT_RESULT = document.querySelector('#AT_RESULT')
        AT_RESULT.innerHTML = "执行中,请耐心等待..."
        try {
            const res = await executeATCommand(params);
            if (res) {
                if (res.error) {
                    AT_RESULT.innerHTML = `<p style="overflow: hidden;">${res.error}</p>`;
                    createToast('执行失败', 'red');
                    return;
                }

                AT_RESULT.innerHTML = `<p onclick="copyText(event)"  style="overflow: hidden;">${res.result}</p>`;
                createToast('执行成功', 'green');
            } else {
                createToast('执行失败', 'red');
            }
        } catch (err) {
            const error = err?.error || '未知错误';
            AT_RESULT.innerHTML = `<p style="overflow: hidden;">${error}</p>`;
            createToast('执行失败', 'red');
        }
    }

    //执行时禁用按钮
    const disableButtonWhenExecuteFunc = async (e, func) => {
        const target = e.currentTarget

        target.setAttribute("disabled", "true");
        target.style.opacity = '.5'
        try {
            func && await func()
        } finally {
            target.removeAttribute("disabled");
            target.style.opacity = ''
        }
    }

    //初始化高级功能按钮
    let initAdvanceTools = async () => {
        const el = document.querySelector('#ADVANCE')
        if (!(await initRequestData()) || !el) {
            el.onclick = () => createToast('请登录', 'red')
            el.style.backgroundColor = '#80808073'
            return null
        }
        el.style.backgroundColor = ''
        el.onclick = () => {
            showModal('#advanceModal')
        }
    }
    initAdvanceTools()


    //执行高级功能更改 1为启用0为禁用
    const handleSambaPath = async (flag = '1') => {
        const AT_RESULT = document.querySelector('#AD_RESULT')
        let adb_status = await adbKeepAlive()
        if (!adb_status) {
            AT_RESULT.innerHTML = ""
            return createToast('ADB未初始化，请等待初始化完成', 'red')
        }

        AT_RESULT.innerHTML = "执行中,请耐心等待..."

        try {
            const res = await (await fetch(`${KANO_baseURL}/smbPath?enable=${flag}`, { headers: common_headers })).json()
            if (res) {
                if (res.error) {
                    AT_RESULT.innerHTML = res.error;
                    createToast('执行失败', 'red');
                    return;
                }
                AT_RESULT.innerHTML = res.result;
                createToast('执行完成', 'green');
            } else {
                AT_RESULT.innerHTML = '';
                createToast('执行失败', 'red');
            }
        } catch (e) {
            AT_RESULT.innerHTML = '';
            createToast('执行失败', 'red');
        }
    }

    //更改密码
    initChangePassData = async () => {
        const el = document.querySelector("#CHANGEPWD")
        if (!(await initRequestData()) || !el) {
            el.onclick = () => createToast('请登录', 'red')
            el.style.backgroundColor = '#80808073'
            return null
        }
        el.style.backgroundColor = '#87ceeb70'
        el.onclick = async () => {
            showModal('#changePassModal')
        }
    }
    initChangePassData()

    const handleChangePassword = async (e) => {
        e.preventDefault()
        const form = e.target
        const formData = new FormData(form);
        const oldPassword = formData.get('oldPassword')
        const newPassword = formData.get('newPassword')
        const confirmPassword = formData.get('confirmPassword')
        if (!oldPassword || oldPassword.trim() == '') return createToast('请输入旧密码', 'red')
        if (!newPassword || newPassword.trim() == '') return createToast('请输入新密码', 'red')
        if (!confirmPassword || confirmPassword.trim() == '') return createToast('请确认新密码', 'red')
        if (newPassword != confirmPassword) return createToast('两次输入的新密码不一致', 'red')

        try {
            const cookie = await login()
            try {
                const res = await (await postData(cookie, {
                    goformId: 'CHANGE_PASSWORD',
                    oldPassword: SHA256(oldPassword),
                    newPassword: SHA256(newPassword)
                })).json()
                if (res?.result == 'success') {
                    createToast('修改成功！', 'green')
                    form.reset()
                    closeModal('#changePassModal')
                } else {
                    throw '修改失败'
                }
            } catch {
                createToast('修改失败！', 'red')
            }
        } catch {
            createToast('登录失败，请检查密码和网络连接', 'red')
            closeModal('#changePassModal')
            setTimeout(() => {
                out()
            }, 310);
        }
    }

    const onCloseChangePassForm = () => {
        const form = document.querySelector("#changePassForm")
        form && form.reset()
        closeModal("#changePassModal")
    }

    //sim卡切换
    let initSimCardType = async () => {
        const selectEl = document.querySelector('#SIM_CARD_TYPE')
        //查询是否支持双卡
        // const { dual_sim_support } = await getData(new URLSearchParams({
        //     cmd: 'dual_sim_support'
        // }))
        // if (dual_sim_support && dual_sim_support == '0') {
        //     return
        // } else {
        selectEl.style.display = ''
        // }
        if (!(await initRequestData()) || !selectEl) {
            selectEl.style.backgroundColor = '#80808073'
            selectEl.disabled = true
            return null
        }
        selectEl.style.backgroundColor = ''
        selectEl.disabled = false
        let res = await getData(new URLSearchParams({
            cmd: 'sim_slot'
        }))
        if (!selectEl || !res || res.sim_slot == null || res.sim_slot == undefined) {
            return
        }
        [...selectEl.children].forEach((item) => {
            if (item.value == res.sim_slot) {
                item.selected = true
            }
        })
        QOSRDPCommand("AT+CGEQOSRDP=1")
    }
    initSimCardType()

    //NFC切换
    let initNFCSwitch = async () => {
        const btn = document.querySelector('#NFC')
        if (!(await initRequestData())) {
            btn.onclick = () => createToast('请登录', 'red')
            btn.style.backgroundColor = '#80808073'
            return null
        }
        // 查询是否支持NFC
        try {
            const { is_support_nfc_functions } = await getData(new URLSearchParams({
                cmd: 'is_support_nfc_functions'
            }))
            if (!is_support_nfc_functions || Number(is_support_nfc_functions) == 0) {
                return
            } else {
                btn.style.display = ''
            }

            btn.style.backgroundColor = ''
            const { web_wifi_nfc_switch } = await getData(new URLSearchParams({
                cmd: 'web_wifi_nfc_switch'
            }))

            btn.onclick = async () => {
                try {
                    if (!(await initRequestData())) {
                        btn.style.backgroundColor = '#80808073'
                        return null
                    }
                    const cookie = await login()
                    if (!cookie) {
                        createToast('登录失败，请检查密码', 'red')
                        out()
                        return null
                    }
                    let res = await (await postData(cookie, {
                        goformId: 'WIFI_NFC_SET',
                        web_wifi_nfc_switch: web_wifi_nfc_switch.toString() == '1' ? '0' : '1'
                    })).json()
                    if (res.result == 'success') {
                        createToast('操作成功！', 'green')
                        initNFCSwitch()
                    } else {
                        createToast('操作失败！', 'red')
                    }
                } catch (e) {
                    // createToast(e.message)
                }
            }

            btn.style.backgroundColor = web_wifi_nfc_switch.toString() == '1' ? '#018ad8a8' : ''
        } catch { }
    }
    initNFCSwitch()

    let changeSimCard = async (e) => {
        const value = e.target.value.trim()
        if (!(await initRequestData()) || !value) {
            return null
        }
        createToast('更改中，请稍后', '#BF723F')
        try {
            const cookie = await login()
            if (!cookie) {
                createToast('登录失败，请检查密码', 'red')
                out()
                return null
            }
            let res = await (await postData(cookie, {
                goformId: 'SET_SIM_SLOT',
                sim_slot: value.trim()
            })).json()
            if (res.result == 'success') {
                createToast('操作成功！', 'green')
            } else {
                createToast('操作失败！', 'red')
            }
            await initUSBNetworkType()
        } catch (e) {
            // createToast(e.message)
        }
    }


    // 控制测速请求的中断器
    let speedFlag = false;
    let speedController = null; // 可重置的变量

    async function startTest(e) {
        if (!(await initRequestData())) {
            createToast('请登录', 'red')
            return null
        }
        if (speedFlag) {
            speedController.abort();
            createToast('测速已取消');
            return;
        }

        speedFlag = true;
        speedController = new AbortController();
        const speedSignal = speedController.signal;

        e.target.style.backgroundColor = '#80808073';
        e.target.innerHTML = '停止测速';

        const serverUrl = `${KANO_baseURL}/speedtest`;
        const ckSize = document.querySelector('#speedTestModal #ckSize').value;
        const chunkSize = !isNaN(Number(ckSize)) ? Number(ckSize) : 1000;
        const resultDiv = document.getElementById('speedtestResult');

        const url = `${serverUrl}?ckSize=${chunkSize}&cors`;
        resultDiv.textContent = `测速中...`;

        let totalBytes = 0;
        let startTime = performance.now();
        let lastUpdateTime = startTime;
        let lastBytes = 0;

        try {
            const res = await fetch(url, { signal: speedSignal, headers: { ...common_headers } });
            const reader = res.body.getReader();

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                totalBytes += value.length;
                const now = performance.now();

                if (now - lastUpdateTime >= 50) {
                    const elapsed = (now - lastUpdateTime) / 1000;
                    const speed = ((totalBytes - lastBytes) * 8 / 1024 / 1024) / elapsed;

                    resultDiv.innerHTML = `实时测速中...
下载总量：${(totalBytes / 1024 / 1024).toFixed(2)} MB
当前速度：${speed.toFixed(2)} Mbps`;

                    lastUpdateTime = now;
                    lastBytes = totalBytes;
                }
            }

            const totalTime = (performance.now() - startTime) / 1000;
            const avgSpeed = ((totalBytes * 8) / 1024 / 1024) / totalTime;

            resultDiv.innerHTML += `<br/>✅ 测试完成
总耗时：${totalTime.toFixed(2)} 秒
平均速度：${avgSpeed.toFixed(2)} Mbps`;
        } catch (err) {
            if (err.name === 'AbortError') {
                resultDiv.innerHTML += `<br/>⚠️ 已中止测速`;
            } else {
                resultDiv.innerHTML = `❌ 测试失败：${err.message}`;
            }
        } finally {
            speedFlag = false;
            e.target.innerHTML = '开始测速';
            e.target.style.backgroundColor = '';
        }
    }

    //无限测速
    let loopSpeedTestTimer = null
    const handleLoopMode = async (e) => {
        if (!(await initRequestData())) {
            createToast('请登录', 'red')
            return null
        }
        const speedTestButton = document.querySelector('#startSpeedBtn')
        if (e.target.innerHTML == '循环测速') {
            e.target.innerHTML = '停止循环'
            loopSpeedTestTimer && loopSpeedTestTimer()
            loopSpeedTestTimer = requestInterval(() => {
                if (speedTestButton && speedTestButton.innerHTML == "开始测速") {
                    speedTestButton.click()
                }
            }, 10)
        } else {
            loopSpeedTestTimer && loopSpeedTestTimer()
            if (speedTestButton && speedTestButton.innerHTML == "停止测速") {
                speedTestButton.click()
            }
            e.target.innerHTML = '循环测速'
        }
    }

    //文件上传
    const handleFileUpload = async (event) => {
        const file = event.target.files[0];
        const MAX_SIZE = 10
        if (file) {
            // 检查文件大小
            if (file.size > MAX_SIZE * 1024 * 1024) {
                // MAX_SIZE MB
                createToast(`文件大小不能超过${MAX_SIZE}MB！`, 'red')
            } else {

                //上传图片
                try {
                    const formData = new FormData();
                    formData.append("file", file);
                    const res = await (await fetch(`${KANO_baseURL}/upload_img`, {
                        method: "POST",
                        headers: common_headers,
                        body: formData,
                    })).json()

                    if (res.url) {
                        const BG_INPUT = document.querySelector('#BG_INPUT')
                        const BG = document.querySelector("#BG")
                        const url = `${KANO_baseURL}${res.url}`
                        BG_INPUT.value = url
                        console.log(BG_INPUT.value);
                        localStorage.setItem('backgroundUrl', url)
                        document.querySelector('#isCheckedBG').checked = true
                        BG.style.backgroundImage = `url(${url})`
                        createToast('上传成功', 'green')
                    }
                    else throw res.error || ''
                }
                catch (e) {
                    console.log(e);
                    createToast(`上传失败!`, 'red')
                } finally {
                    document.querySelector('#fileUploader').value = ''
                }
            }
        }
    }

    //打赏模态框设置
    const payModalState = localStorage.getItem('hidePayModal') || false
    !payModalState && window.addEventListener('load', () => {
        setTimeout(() => {
            showModal('#payModal')
        }, 300);
    })

    const onClosePayModal = () => {
        closeModal('#payModal')
        localStorage.setItem('hidePayModal', 'true')
    }

    const handleClosePayModal = (e) => {
        if (e.target.id != 'payModal') return
        onClosePayModal()
    }


    //展开收起
    // 配置观察器_菜单
    (() => {
        const { el: collapseMenuEl } = createCollapseObserver(document.querySelector(".collapse_menu"))
        collapseMenuEl.dataset.name = localStorage.getItem('collapse_menu') || 'open'
        const collapseBtn = document.querySelector('#collapseBtn_menu')
        const switchComponent = createSwitch({
            text: '功能列表',
            value: collapseMenuEl.dataset.name == 'open',
            className: 'collapse_menu',
            onChange: (newVal) => {
                if (collapseMenuEl && collapseMenuEl.dataset) {
                    collapseMenuEl.dataset.name = newVal ? 'open' : 'close'
                    localStorage.setItem('collapse_menu', collapseMenuEl.dataset.name)
                }
            }
        });
        collapseBtn.appendChild(switchComponent);
    })();

    //展开收起
    // 配置观察器_基本状态
    collapseGen("#collapse_status_btn", "#collapse_status", "collapse_status")

    //展开收起
    // 配置观察器_TTYD
    collapseGen("#collapse_ttyd_btn", "#collapse_ttyd", "collapse_ttyd")

    //展开收起
    // 配置观察器_锁频
    collapseGen("#collapse_lkband_btn", "#collapse_lkband", "collapse_lkband")

    //展开收起
    // 配置观察器_锁基站
    collapseGen("#collapse_lkcell_btn", "#collapse_lkcell", "collapse_lkcell")

    //软件更新
    const queryUpdate = async () => {
        if (!(await initRequestData())) {
            return null
        }
        try {
            const res = await fetch(`${KANO_baseURL}/check_update`, {
                method: 'get',
                headers: common_headers
            })
            const { alist_res, base_uri, changelog } = await res.json()
            const contents = alist_res?.data?.content
            if (!contents || contents.length <= 0) return null
            //寻找最新APK
            const content = (contents.filter(item => item.name.includes('.apk')).sort((a, b) => {
                return new Date(b.modified) - new Date(a.modified)
            }))[0]
            if (content) {
                return {
                    name: content.name,
                    base_uri,
                    changelog
                }
            }
        } catch {
            return null
        }
    }

    //安装更新
    const requestInstallUpdate = async () => {
        // const changelogTextContent = document.querySelector('#ChangelogTextContent')
        // changelogTextContent.innerHTML = ''
        const OTATextContent = document.querySelector('#OTATextContent')
        try {
            OTATextContent.innerHTML = `<div>📦 安装中...</div>`
            const _res = await fetch(`${KANO_baseURL}/install_apk`, {
                method: 'POST',
                headers: {
                    ...common_headers,
                }
            })
            const res = await _res.json()
            if (res && res.error) throw new Error('安装失败: ' + res.error)
            const res_text = res.result == 'success' ? '✅ 安装成功，等待几秒刷新网页即可使用' : '❌ 安装失败，请重启随身WIFI后再试'
            OTATextContent.innerHTML = `<div>${res_text}</div><div>${res.result != 'success' ? res.result : ''}</div>`
        } catch (e) {
            createToast('安装程序运行结束', 'green')
            let res_text = '✅ 安装成功，等待几秒刷新网页即可使用'
            console.log(e.message);
            if (e.message.includes('安装失败')) {
                res_text = `❌ 安装失败，原因${e.message.replace('安装失败', '')}，请刷新网页或重启随身WIFI再试`
            }
            OTATextContent.innerHTML = `<div>${res_text}</div></div>`
        } finally {
            initUpdateSoftware()
        }
    }

    //立即更新
    let updateSoftwareInterval = null
    const handleUpdateSoftware = async (url) => {
        updateSoftwareInterval && updateSoftwareInterval()
        if (!url || url.trim() == "") return
        const doUpdateEl = document.querySelector('#doUpdate')
        const closeUpdateBtnEl = document.querySelector('#closeUpdateBtn')

        let adb_status = await adbKeepAlive()
        if (!adb_status) {
            return createToast('ADB未初始化，请等待初始化完成', 'red')
        }

        // 更新时禁用按钮
        doUpdateEl && (doUpdateEl.onclick = null)
        doUpdateEl && (doUpdateEl.style.backgroundColor = '#80808073')
        closeUpdateBtnEl && (closeUpdateBtnEl.onclick = null)
        closeUpdateBtnEl && (closeUpdateBtnEl.style.backgroundColor = '#80808073')

        try {
            // const changelogTextContent = document.querySelector('#ChangelogTextContent')
            // changelogTextContent.innerHTML = ''
            //开始请求下载更新
            await fetch(`${KANO_baseURL}/download_apk`, {
                method: 'POST',
                headers: {
                    ...common_headers,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(
                    {
                        apk_url: url
                    }
                )
            })
        } catch {
            createToast('下载请求失败，请检查网络连接', 'red')
            initUpdateSoftware()
            return
        }

        //开启定时器，查询更新进度
        const OTATextContent = document.querySelector('#OTATextContent')
        updateSoftwareInterval = requestInterval(async () => {
            try {
                const _res = await fetch(`${KANO_baseURL}/download_apk_status`, {
                    method: 'get',
                    headers: common_headers
                })
                const res = await _res.json()
                if (res && res.error == 'error') throw '下载失败'
                const status = res.status == "idle" ? '🕒 等待中' : res.status == "downloading" ? '🟢 下载中' : res.status == "done" ? "✅ 下载完成" : '❌ 下载失败'
                OTATextContent.innerHTML = `<div>🔄 正在下载更新...<br/>状态：${status}<br/>📁 当前进度：${res?.percent}%<br/></div>`
                if (res.percent == 100) {
                    updateSoftwareInterval && updateSoftwareInterval()
                    createToast('下载完成，正在自动安装...', 'green')
                    // 执行安装
                    requestInstallUpdate()
                }
            } catch (e) {
                OTATextContent.innerHTML = "下载失败，请检查网络连接"
                updateSoftwareInterval && updateSoftwareInterval()
                initUpdateSoftware()
            }
        }, 500)
    }

    //仅下载更新包到本地
    const handleDownloadSoftwareLink = async (fileLink) => {
        createToast("已开始下载", 'green')
        const linkEl = document.createElement('a')
        linkEl.href = fileLink
        linkEl.target = '_blank'
        linkEl.style.display = 'none'
        document.body.appendChild(linkEl)
        setTimeout(() => {
            linkEl.click()
            setTimeout(() => {
                linkEl.remove()
            }, 100);
        }, 50);
    }

    //检测更新
    const checkUpdateAction = async (silent = false) => {
        const changelogTextContent = document.querySelector('#ChangelogTextContent')
        const OTATextContent = document.querySelector('#OTATextContent')
        OTATextContent.innerHTML = '正在检查更新...'
        changelogTextContent.innerHTML = ''
        !silent && showModal('#updateSoftwareModal')
        try {
            const content = await queryUpdate()
            if (content) {
                const { app_ver, app_ver_code } = await (await fetch(`${KANO_baseURL}/version_info`, { headers: common_headers })).json();
                const { name, base_uri, changelog } = content;

                const version = name.match(/V(\d+\.\d+\.\d+)/i)?.[1];
                const appVer = app_ver.match(/(\d+\.\d+\.\d+)/i)?.[1];
                const { date_str, formatted_date } = getApkDate(name);
                let isLatest = false;

                if (version && appVer) {
                    const versionNew = version.trim();
                    const versionCurrent = appVer.trim();

                    // 如果新版本号大于当前版本
                    if (versionNew > versionCurrent) {
                        isLatest = false;
                    }
                    // 如果版本号相同，再比时间
                    else if ((versionNew === versionCurrent) && formatted_date) {
                        const newDate = Number(formatted_date);
                        const currentDate = Number(app_ver_code);

                        if (newDate > currentDate) {
                            isLatest = false;
                        } else {
                            isLatest = true;
                        }
                    }
                }

                // 如果包含 force 标志，强制不是最新
                if (name.includes('force')) {
                    isLatest = false;
                }
                const doUpdateEl = document.querySelector('#doUpdate')
                const doDownloadAPKEl = document.querySelector('#downloadAPK')
                if (doUpdateEl && doDownloadAPKEl) {
                    if (!isLatest) {
                        doUpdateEl.style.backgroundColor = 'var(--dark-btn-color)'
                        doDownloadAPKEl.style.backgroundColor = 'var(--dark-btn-color)'
                        doUpdateEl.onclick = () => handleUpdateSoftware(base_uri + name)
                        doDownloadAPKEl.onclick = () => handleDownloadSoftwareLink(base_uri + name)
                    } else {
                        doUpdateEl.onclick = null
                        doDownloadAPKEl.onclick = null
                        doUpdateEl.style.backgroundColor = '#80808073'
                        doDownloadAPKEl.style.backgroundColor = '#80808073'
                    }
                }
                //获取changeLog
                if (!isLatest) {
                    changelogTextContent.innerHTML = changelog
                }
                OTATextContent.innerHTML = `${isLatest ? `<div>当前已是最新版本：V${app_ver} ${app_ver_code}</div>` : `<div>发现更新:${name}<br/>${date_str ? `发布日期：${date_str}` : ''}</div>`}`
                return !isLatest ? {
                    isForceUpdate: name.includes('force'),
                    text: version + ' ' + date_str
                } : null

            } else {
                throw new Error('出错')
            }
        } catch (e) {
            OTATextContent.innerHTML = `连接更新服务器出错，请检查网络连接<br>${e.message ? e.message : ''}`
            return null
        }
    }

    const initUpdateSoftware = async () => {
        const changelogTextContent = document.querySelector('#ChangelogTextContent')
        changelogTextContent.innerHTML = ''
        const btn = document.querySelector('#OTA')
        if (!btn) return
        const closeUpdateBtnEl = document.querySelector('#closeUpdateBtn')
        closeUpdateBtnEl && (closeUpdateBtnEl.onclick = () => closeModal('#updateSoftwareModal'))
        closeUpdateBtnEl && (closeUpdateBtnEl.style.backgroundColor = 'var(--dark-btn-color)')

        if (!(await initRequestData())) {
            btn.onclick = () => createToast('请登录', 'red')
            btn.style.backgroundColor = '#80808073'
            return null
        }
        btn.style.backgroundColor = 'var(--dark-btn-color)'
        btn.onclick = async () => {
            const btn = document.querySelector('#OTA')
            if (!(await initRequestData())) {
                btn.onclick = () => createToast('请登录', 'red')
                btn.style.backgroundColor = '#80808073'
                return null
            }
            checkUpdateAction()
        }
    }
    initUpdateSoftware()

    //adb轮询
    const adbQuery = async () => {
        try {
            const adb_status = await adbKeepAlive()
            const adb_text = adb_status ? '网络ADB状态：🟢 正常' : '网络ADB状态：🟡 等待初始化'
            const version = window.UFI_DATA && window.UFI_DATA.cr_version ? window.UFI_DATA.cr_version : ''
            const adbSwitch = window.UFI_DATA && window.UFI_DATA.usb_port_switch == '1' ? true : false
            const adbStatusEl = document.querySelectorAll('.adb_status')
            if (adbStatusEl && adbStatusEl.length > 0) {
                adbStatusEl.forEach((item) => {
                    try {
                        item.innerHTML = adb_text + `<br/>USB调试开关：${adbSwitch ? '🟢 开启' : '🔴 未开启'}` + `<br/>固件版本：${version}`
                    } catch { }
                })
            }
        } catch { }
    }
    adbQuery()

    //执行shell脚本
    const handleShell = async () => {
        const AT_RESULT = document.querySelector('#AD_RESULT')
        let adb_status = await adbKeepAlive()
        if (!adb_status) {
            AT_RESULT.innerHTML = ""
            return createToast('ADB未初始化，请等待初始化完成', 'red')
        }

        AT_RESULT.innerHTML = "执行中,请耐心等待..."

        try {
            const res = await (await fetch(`${KANO_baseURL}/one_click_shell`, {
                headers: common_headers
            })).json()
            if (res) {
                if (res.error) {
                    AT_RESULT.innerHTML = res.error;
                    createToast('执行失败', 'red');
                    return;
                }
                AT_RESULT.innerHTML = res.result;
                createToast('执行完成', 'green');
            } else {
                AT_RESULT.innerHTML = '';
                createToast('执行失败', 'red');
            }
        } catch (e) {
            AT_RESULT.innerHTML = '';
            createToast('执行失败', 'red');
        }

    }

    //开屏后检测更新
    setTimeout(() => {
        checkUpdateAction(true).then((res) => {
            if (res) {
                createToast(`发现${res.isForceUpdate ? "常驻更新" : "新版本"}：${res.text}`)
            }
        })
    }, 100);


    //初始化短信转发表单
    const initSmsForward = async (needSwitch = true, method = undefined) => {
        //判断是SMTP还是CURL转发
        if (!method) {
            const { sms_forward_method } = await (await fetchWithTimeout(`${KANO_baseURL}/sms_forward_method`, {
                method: 'GET',
                headers: common_headers
            })).json()
            method = sms_forward_method
        }
        if (method.toLowerCase() == 'smtp') {
            //获取模态框数据
            const data = await (await fetch(`${KANO_baseURL}/sms_forward_mail`, {
                method: 'GET',
                headers: common_headers
            })).json()
            const { smtp_host, smtp_port, smtp_username, smtp_password, smtp_to } = data
            const smtpHostEl = document.querySelector('#smtp_host')
            const smtpPortEl = document.querySelector('#smtp_port')
            const smtpToEl = document.querySelector('#smtp_to')
            const smtpUsernameEl = document.querySelector('#smtp_username')
            const smtpPasswordEl = document.querySelector('#smtp_password')
            smtpHostEl.value = smtp_host || ''
            smtpPortEl.value = smtp_port || ''
            smtpUsernameEl.value = smtp_username || ''
            smtpPasswordEl.value = smtp_password || ''
            smtpToEl.value = smtp_to || ''
            needSwitch && switchSmsForwardMethodTab({ target: document.querySelector('#smtp_btn') })
        } else if (method.toLowerCase() == 'curl') {
            //获取模态框数据
            const data = await (await fetch(`${KANO_baseURL}/sms_forward_curl`, {
                method: 'GET',
                headers: common_headers
            })).json()
            const { curl_text } = data
            const curlTextEl = document.querySelector('#curl_text')
            curlTextEl.value = curl_text || ''
            needSwitch && switchSmsForwardMethodTab({ target: document.querySelector('#curl_btn') })
        } else {
            needSwitch && switchSmsForwardMethodTab({ target: document.querySelector('#smtp_btn') })
        }
    }

    //初始化短信转发开关
    const initSmsForwardSwitch = async () => {
        const { enabled } = await (await fetch(`${KANO_baseURL}/sms_forward_enabled`, {
            method: 'GET',
            headers: common_headers
        })).json()
        const collapse_smsforward = document.querySelector('#collapse_smsforward')
        if (!collapse_smsforward) {
            localStorage.setItem('collapse_smsforward', enabled == "1" ? 'open' : 'close')
            return
        }
        if (collapse_smsforward.dataset.name == 'open' && enabled != "1") {
            collapse_smsforward.dataset.name = 'close'
        } else if (collapse_smsforward.dataset.name == 'close' && enabled == "1") {
            collapse_smsforward.dataset.name = 'open'
        }
    }

    //切换短信转发方式
    const switchSmsForwardMethod = (method) => {
        const smsForwardForm = document.querySelector('#smsForwardForm')
        const smsForwardCurlForm = document.querySelector('#smsForwardCurlForm')
        switch (method.toLowerCase()) {
            case 'smtp':
                smsForwardForm.style.display = 'block'
                smsForwardCurlForm.style.display = 'none'
                break
            case 'curl':
                smsForwardForm.style.display = 'none'
                smsForwardCurlForm.style.display = 'block'
                break
            default:
                smsForwardForm.style.display = 'block'
                smsForwardCurlForm.style.display = 'none'
                break
        }
        initSmsForward(false, method)
        return method.toLowerCase()
    }

    //初始化短信转发模态框
    const initSmsForwardModal = async () => {
        const btn = document.querySelector('#smsForward')
        if (!(await initRequestData())) {
            btn.onclick = () => createToast('请登录', 'red')
            btn.style.backgroundColor = '#80808073'
            return null
        }
        btn.style.backgroundColor = 'var(--dark-btn-color)'
        btn.onclick = async () => {
            initSmsForward()
            await initSmsForwardSwitch()
            showModal('#smsForwardModal')
        }
    }
    initSmsForwardModal()

    const handleSmsForwardForm = async (e) => {
        e.preventDefault()
        const form = e.target
        const formData = new FormData(form);
        const smtp_host = formData.get('smtp_host')
        const smtp_port = formData.get('smtp_port')
        const smtp_to = formData.get('smtp_to')
        const smtp_username = formData.get('smtp_username')
        const smtp_password = formData.get('smtp_password')

        if (!smtp_host || smtp_host.trim() == '') return createToast('请输入SMTP服务器地址', 'red')
        if (!smtp_port || smtp_port.trim() == '') return createToast('请输入SMTP服务器端口', 'red')
        if (!smtp_username || smtp_username.trim() == '') return createToast('请输入SMTP服务器用户名', 'red')
        if (!smtp_password || smtp_password.trim() == '') return createToast('请输入SMTP服务器密码', 'red')
        if (!smtp_to || smtp_to.trim() == '') return createToast('请输入收件人邮箱', 'red')

        //请求
        try {
            const res = await (await fetch(`${KANO_baseURL}/sms_forward_mail`, {
                method: 'POST',
                headers: {
                    ...common_headers,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    smtp_host: smtp_host.trim(),
                    smtp_port: smtp_port.trim(),
                    smtp_username: smtp_username.trim(),
                    smtp_password: smtp_password.trim(),
                    smtp_to: smtp_to.trim()
                })
            })).json()
            if (res.result == 'success') {
                createToast('设置成功,系统会向目标邮箱发送一个测试消息，请注意查收~', 'green')
                // form.reset()
                // closeModal('#smsForwardModal')
            } else {
                if (res.error) {
                    createToast(res.error, 'red')
                } else {
                    createToast('设置失败', 'red')
                }
            }
        }
        catch (e) {
            createToast('请求失败', 'red')
            return
        }
    }

    const handleSmsForwardCurlForm = async (e) => {
        e.preventDefault()
        const form = e.target
        const formData = new FormData(form);
        const curl_text = formData.get('curl_text')

        if (!curl_text || curl_text.trim() == '') return createToast('请输入curl请求！', 'red')

        //请求
        try {
            const res = await (await fetch(`${KANO_baseURL}/sms_forward_curl`, {
                method: 'POST',
                headers: {
                    ...common_headers,
                    'Content-Type': 'application/json;charset=UTF-8'
                },
                body: JSON.stringify({
                    curl_text: curl_text.trim(),
                })
            })).json()
            if (res.result == 'success') {
                createToast('设置成功,系统会向目标地址发送一个测试消息，请注意查收~', 'green')
                // form.reset()
                // closeModal('#smsForwardModal')
            } else {
                if (res.error) {
                    createToast(res.error, 'red')
                } else {
                    createToast('设置失败', 'red')
                }
            }
        }
        catch (e) {
            createToast('请求失败', 'red')
            return
        }
    }

    //切换转发方式
    const switchSmsForwardMethodTab = (e) => {
        const target = e.target
        if (target.tagName != 'BUTTON') return
        const children = target.parentNode?.children
        if (!children) return
        Array.from(children).forEach((item) => {
            if (item != target) {
                item.classList.remove('active')
            }
        })
        target.classList.add('active')
        const method = target.dataset.method
        switchSmsForwardMethod(method)
    }

    // 配置观察器_短信转发开关
    collapseGen("#collapse_smsforward_btn", "#collapse_smsforward", "collapse_smsforward", async (status) => {
        let enabled = undefined
        status == 'open' ? enabled = '1' : enabled = '0'
        if (enabled != undefined) {
            try {
                //开启总开关
                await (await fetch(`${KANO_baseURL}/sms_forward_enabled?enable=${enabled}`, {
                    method: 'post',
                    headers: {
                        ...common_headers,
                        'Content-Type': 'application/json'
                    }
                })).json()
                createToast(`短信转发${status == 'open' ? '已启用' : '已禁用'}`, 'green')
                console.log(status);
            } catch (e) {
                createToast('操作失败！', 'red')
            }
        }
    })

    // OP
    const OP = (e) => {
        e.preventDefault()
        createToast('获得成就：原神启动！', 'pink')
        closeModal('#TTYDModal')
        const TTYD = document.querySelector('#TTYD')
        if (!TTYD) return
        const title = TTYD.querySelector('.title strong')
        title && (title.innerHTML = "?")
        const list = TTYD.querySelector('.deviceList')
        list.innerHTML = `
        <li style = "padding:10px">
                    <iframe src="https://cg.163.com/#/mobile" style="border:none;padding:0;margin:0;width:100%;height:600px;border-radius: 10px;overflow: hidden;opacity: 1;"></iframe>
        </li > `
    }

    //内网设置
    const initLANSettings = async () => {
        const btn = document.querySelector('#LANManagement')
        if (!(await initRequestData())) {
            btn.onclick = () => createToast('请登录', 'red')
            btn.style.backgroundColor = '#80808073'
            return null
        }
        btn.style.backgroundColor = 'var(--dark-btn-color)'
        btn.onclick = async () => {
            //获取当前局域网设置
            try {
                const res = await getData(new URLSearchParams({
                    cmd: 'lan_ipaddr,lan_netmask,mac_address,dhcpEnabled,dhcpStart,dhcpEnd,dhcpLease_hour,mtu,tcp_mss'
                }))
                if (res) {
                    const { lan_ipaddr, lan_netmask, dhcpEnabled, dhcpStart, dhcpEnd, dhcpLease_hour } = res
                    const form = document.querySelector('#LANManagementForm')
                    form.querySelector('input[name="lanIp"]').value = lan_ipaddr || ''
                    form.querySelector('input[name="lanNetmask"]').value = lan_netmask || ''
                    form.querySelector('input[name="dhcpStart"]').value = dhcpStart || ''
                    form.querySelector('input[name="dhcpEnd"]').value = dhcpEnd || ''
                    form.querySelector('input[name="dhcpLease"]').value = dhcpLease_hour.replace('h', '') || ''
                    form.querySelector('input[name="lanDhcpType"]').value = dhcpEnabled == '1' ? 'SERVER' : 'DISABLE'
                    // 设置开关状态
                    const collapse_dhcp = document.querySelector('#collapse_dhcp')
                    if (collapse_dhcp.dataset.name == 'open' && dhcpEnabled != '1') {
                        collapse_dhcp.dataset.name = 'close'
                    } else if (collapse_dhcp.dataset.name == 'close' && dhcpEnabled == '1') {
                        collapse_dhcp.dataset.name = 'open'
                    }

                } else {
                    createToast('获取局域网设置失败', 'red')
                }
            } catch (e) {
                createToast('获取局域网设置失败', 'red')
            }
            showModal('#LANManagementModal')
        }
    }
    initLANSettings()

    const onLANModalSubmit = async (e) => {
        e.preventDefault();
        try {
            const cookie = await login()
            if (!cookie) {
                createToast('登录失败，请检查密码与网络', 'red')
                return null
            }

            const form = e.target; // 获取表单
            const formData = new FormData(form);

            let data = {
                lanIp: '192.168.0.1',
                lanNetmask: '255.255.255.0',
                lanDhcpType: 'DISABLE',
                dhcpStart: '',
                dhcpEnd: '',
                dhcpLease: '',
                dhcp_reboot_flag: '1',
                mac_ip_reset: '0',
            }

            // dhcp开关
            const lanDhcpType = formData.get('lanDhcpType') === 'SERVER';
            if (lanDhcpType) {
                data.lanDhcpType = 'SERVER';
                data.mac_ip_reset = '1';
            } else {
                data.lanDhcpType = 'DISABLE';
                data.mac_ip_reset = '0';
            }

            for (const [key, value] of formData.entries()) {
                const val = value.trim();
                switch (key) {
                    case 'lanIp':
                        if (!val || !isValidIP(val)) return createToast('请输入正确的网关地址', 'red');
                        data[key] = val;
                        break;
                    case 'lanNetmask':
                        if (!val || !isValidSubnetMask(val)) return createToast('请输入正确的子网掩码', 'red');
                        data[key] = val;
                        break;
                    case 'dhcpStart': {
                        if (data.lanDhcpType == 'DISABLE') break
                        if (!val || !isValidIP(val)) return createToast('请输入正确的起始地址', 'red');
                        const lanIp = formData.get('lanIp')?.trim();
                        const netmask = formData.get('lanNetmask')?.trim();
                        if (!isSameSubnet(val, lanIp, netmask)) {
                            return createToast('DHCP 起始地址不在局域网IP所在网段内', 'red');
                        }

                        if (ipToInt(val) <= ipToInt(lanIp)) {
                            return createToast('DHCP 起始地址应该比局域网IP地址大', 'red');
                        }
                        data[key] = val;
                        break;
                    }
                    case 'dhcpEnd': {
                        if (data.lanDhcpType == 'DISABLE') break
                        if (!val || !isValidIP(val)) return createToast('请输入正确的结束地址', 'red');
                        const start = formData.get('dhcpStart')?.trim();
                        const lanIp = formData.get('lanIp')?.trim();
                        const netmask = formData.get('lanNetmask')?.trim();

                        if (!isSameSubnet(val, lanIp, netmask)) {
                            return createToast('DHCP 结束地址不在局域网IP所在网段内', 'red');
                        }

                        if (start === val) return createToast('起始地址和结束地址不能相同', 'red');
                        if (ipToInt(start) > ipToInt(val)) return createToast('起始地址不能大于结束地址', 'red');
                        data[key] = val;
                        break;
                    }
                    case 'dhcpLease':
                        if (data.lanDhcpType == 'DISABLE') break
                        if (Number(val) <= 0) return createToast('请输入正确的地址租期', 'red');
                        data[key] = val;
                        break;
                    default:
                        break;
                }
            }

            const lanIp = formData.get('lanIp')?.trim();
            const netmask = formData.get('lanNetmask')?.trim();
            if (isValidIP(lanIp) && isValidSubnetMask(netmask)) {
                const dhcpStart = formData.get('dhcpStart')?.trim();
                const dhcpEnd = formData.get('dhcpEnd')?.trim();
                const networkAddr = getNetworkAddress(lanIp, netmask);
                const broadcastAddr = getBroadcastAddress(lanIp, netmask);

                // 网关 IP 不能是网络地址或广播地址
                if (lanIp === networkAddr || lanIp === broadcastAddr) {
                    return createToast('网关地址不能是网络地址或广播地址', 'red');
                }

                // DHCP 起始或结束地址不能是网络地址或广播地址
                if (dhcpStart === networkAddr || dhcpStart === broadcastAddr) {
                    return createToast('DHCP 起始地址不能是网络地址或广播地址', 'red');
                }

                if (dhcpEnd === networkAddr || dhcpEnd === broadcastAddr) {
                    return createToast('DHCP 结束地址不能是网络地址或广播地址', 'red');
                }

                // 网关地址不能落在 DHCP 分配范围内
                const lanInt = ipToInt(lanIp);
                const startInt = ipToInt(dhcpStart);
                const endInt = ipToInt(dhcpEnd);
                if (lanInt >= startInt && lanInt <= endInt) {
                    return createToast('网关地址不能落在 DHCP 分配范围内', 'red');
                }
            }

            const res = await (await postData(cookie, {
                goformId: 'DHCP_SETTING',
                ...data
            })).json()

            if (res.result == 'success') {
                createToast('设置成功! 设备正在重启~', 'green')
                closeModal('#LANManagementModal')
                setTimeout(() => {
                    //循环等待
                    let newURL = 'http://' + data.lanIp + ':2333'
                    window.location.href = newURL
                }, 30000);
            } else {
                throw '设置失败！请检查网络'
            }
        }
        catch (e) {
            console.error(e.message)
            // createToast(e.message)
        }
    }

    collapseGen("#collapse_dhcp_switch", "#collapse_dhcp", null, async (status) => {
        const enableDHCP = document.querySelector('#enableDHCP')
        if (!enableDHCP) return
        enableDHCP.value = status == 'open' ? "SERVER" : "DISABLE"
    })

    //插件上传
    const handlePluginFileUpload = (event) => {
        return new Promise((resolve, reject) => {
            const file = event.target.files[0];

            if (file) {
                if (file.size > 1145 * 1024) {
                    createToast(`文件大小不能超过${1145}KB！`, 'red')
                    reject({ msg: `文件大小不能超过${1145}KB！`, data: null })
                } else {
                    const reader = new FileReader();
                    reader.readAsText(file); // 将文件读取为Data URL
                    reader.onload = (e) => {
                        const str = e.target.result;
                        console.log(str);
                        const custom_head = document.querySelector("#custom_head")
                        custom_head && (custom_head.value += (`\n\n\n<!-- ${file.name} -->\n` + str))
                        createToast("添加成功，提交后生效!", 'pink')
                        resolve({ msg: 'ok' })
                    }
                }
            }
        })
    }

    const onPluginBtn = () => {
        document.querySelector('#pluginFileInput')?.click()
    }

    //设备监控
    collapseGen("#collapse_device_mon_btn", "#collapse_device_mon", 'collapse_device_mon', async (status) => {
    })

    //改变刷新频率
    const changeRefreshRate = (e) => {
        const value = e.target.value
        if (value) {
            stopRefresh()
            REFRESH_TIME = value
            startRefresh()
            createToast("当前刷新频率：" + (value / 1000).toFixed(2) + "秒/次")
            //保存
            localStorage.setItem("refreshRate", value)
        }
    }

    //rootShell
    const runShellWithRoot = async (cmd = '') => {
        try {
            const res = await fetchWithTimeout(`${KANO_baseURL}/root_shell`, {
                method: "POST",
                headers: common_headers,
                body: JSON.stringify({
                    command: cmd.trim()
                })
            })
            const { result, error } = await res.json()
            return error ? { success: false, content: error } : { success: true, content: result }
        } catch (e) {
            return { success: false, content: e.message }
        }
    }


    //开关小核心
    const switchCpuCore = async (flag = true) => {
        const AD_RESULT = document.querySelector('#AD_RESULT')
        const shell = `
echo ${flag ? '1' : '0'} > /sys/devices/system/cpu/cpu0/online
echo ${flag ? '1' : '0'} > /sys/devices/system/cpu/cpu1/online
echo ${flag ? '1' : '0'} > /sys/devices/system/cpu/cpu2/online
echo ${flag ? '1' : '0'} > /sys/devices/system/cpu/cpu3/online
        `
        const result = await runShellWithRoot(shell)
        result.success ? createToast('执行成功', 'green') : createToast('执行失败', 'red')

        AD_RESULT.innerHTML = result.content

    }

    //挂载方法到window
    const methods = {
        runShellWithRoot,
        switchCpuCore,
        changeRefreshRate,
        onPluginBtn,
        handlePluginFileUpload,
        OP,
        onLANModalSubmit,
        switchSmsForwardMethodTab,
        handleSmsForwardCurlForm,
        handleSmsForwardForm,
        handleShell,
        handleDownloadSoftwareLink,
        handleUpdateSoftware,
        enableTTYD,
        changeNetwork,
        changeUSBNetwork,
        changeSimCard,
        changeWIFISwitch,
        unlockAllCell,
        onTokenConfirm,
        sendSMS,
        deleteSMS,
        resetShowList,
        handleDataManagementFormSubmit,
        handleWIFIManagementFormSubmit,
        handleScheduleRebootFormSubmit,
        handleWifiEncodeChange,
        handleFileUpload,
        handleATFormSubmit,
        handleChangePassword,
        handleShowPassword,
        submitBandForm,
        submitCellForm,
        initClientManagementModal,
        closeClientManager,
        resetTheme,
        handleSubmitBg,
        disableButtonWhenExecuteFunc,
        onCloseChangePassForm,
        startTest,
        handleLoopMode,
        onClosePayModal,
        handleTTYDFormSubmit,
        handleQosAT,
        handleSambaPath,
        handleAT,
        setOrRemoveDeviceFromBlackList,
        onSelectCellRow,
        handleClosePayModal
    }

    try {
        Object.keys(methods).forEach((method) => {
            window[method] = methods[method]
        })
        Object.keys(methods).forEach((method) => {
            globalThis[method] = methods[method]
        })
    }
    catch { }
}