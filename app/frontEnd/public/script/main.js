// toolbar
const tb = document.querySelector('#top_btn')
if (tb) {
    let ctTimer = null
    let ctTimer1 = null
    const ct = document.querySelector('.container')
    tb.style.transition = 'all .3s'
    const fn = debounce(() => {
        if (ct.scrollTop > 100) {
            tb.style.display = ''
            ctTimer1 && clearTimeout(ctTimer1)
            ctTimer1 = setTimeout(() => {
                tb.style.opacity = '1'
            }, 300);
        } else {
            tb.style.opacity = '0'
            ctTimer && clearTimeout(ctTimer)
            ctTimer = setTimeout(() => {
                tb.style.display = 'none'
            }, 300);
        }
    }, 50)
    if (ct) {
        ct.addEventListener('scroll', fn)
    }
}

const _cloudSync = localStorage.getItem('isCloudSync');
if (_cloudSync == null || _cloudSync == undefined) {
    localStorage.setItem('isCloudSync', true);
    initTheme()
}

let REFRESH_TIME = getRefteshRate((val) => {
    let refreshRateSelect = document.querySelector('#refreshRateSelect')
    refreshRateSelect && (refreshRateSelect.value = val.toString())
})

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
                    try {
                        const newScript = document.createElement('script');
                        if (scriptEl.src) {
                            newScript.src = scriptEl.src;
                        } else {
                            newScript.textContent = scriptEl.textContent;
                        }
                        if (scriptEl.type) newScript.type = scriptEl.type;

                        document.head.appendChild(newScript);
                    } catch (e) {
                        createToast(t('toast_head_resove_failed'));
                    }
                })
            } catch (e) {
                createToast(t('toast_head_resove_failed'));
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

const overlay = document.createElement('div')
overlay.className = 'loading-overlay'
overlay.innerHTML = "<p>Loading...</p>"
document.body.appendChild(overlay)

//判断一下是否需要token
const needToken = async (shouldThrowError = false, fetchMaxRetries = 3) => {
    let retries = 0
    let res = null

    while (retries < fetchMaxRetries) {
        try {
            res = await (await fetchWithTimeout(`${KANO_baseURL}/need_token`, { headers: { ...common_headers } }, 1000)).json()
            if (res) {
                break
            }
        } catch {
            if (overlay) {
                overlay.innerHTML = `<p>${t('backend_not_respond')}, ${t('toast_retries')} ${retries + 1} ...</p>`
            }
        } finally {
            retries++
        }
    }

    if (!res) {
        if (shouldThrowError) {
            throw new Error(t('toast_connect_failed') + `, ${t('toast_retries')}：${retries}`)
        }
        isNeedToken = true
    } else {
        if (res.need_token) {
            isNeedToken = true
        } else {
            isNeedToken = false
        }
    }

    let tkInput = document.querySelector('#TOKEN')
    let tkLabel = document.querySelector("#TOKEN_LABEL")
    if (isNeedToken) {
        tkInput && (tkInput.style.display = "")
        tkLabel && (tkLabel.style.display = "")
    } else {
        tkInput && (tkInput.style.display = "none")
        tkLabel && (tkLabel.style.display = "none")
    }
};

needToken(true, 30).then(() => {
    overlay && (overlay.style.opacity = '0')
    setTimeout(() => {
        let container = document.querySelector('.container')
        container.style.opacity = 1
        container.style.filter = 'none'
        overlay && overlay.remove()
    }, 100);
    main_func()
}).catch((e) => {
    if (overlay) {
        overlay.innerHTML = `
        <p>${e.message}</p>
        <div><button onclick="location.reload()">${t('common_refresh_btn')}</button></div>
        `
    }
})

function main_func() {

    checkBroswer()

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
                "name": "current_now",
                "isShow": true
            },
            {
                "name": "voltage_now",
                "isShow": true
            },
            {
                "name": "realtime_rx_thrpt",
                "isShow": true
            }
        ],
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
    DragList("#draggable_props", (list) => saveDragListData(list, (d_list) => {
        localStorage.setItem('propsShowListDOM', d_list.innerHTML)
    }))

    //渲染listDOM
    const listDOM_STATUS = document.querySelector("#draggable_status")
    const listDOM_PROPS = document.querySelector("#draggable_props")
    const statusDOMStor = localStorage.getItem('statusShowListDOM')
    const signalDOMStor = localStorage.getItem('signalShowListDOM')
    const propsDOMStor = localStorage.getItem('propsShowListDOM')
    statusDOMStor && (listDOM_STATUS.innerHTML = statusDOMStor)
    propsDOMStor && (listDOM_PROPS.innerHTML = propsDOMStor)

    //按照showList初始化排序模态框
    listDOM_STATUS.querySelectorAll('input').forEach((item) => {
        let name = item.dataset.name
        let foundItem = showList.statusShowList.find(i => i.name == name)
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
        initPluginSetting()
        initTheme()
        initBGBtn()
        initChangeTokenData()
        adbQuery()
        loadTitle()
        initATBtn()
        initCellularSpeedTestBtn()
        initUSBStatusManagementBtn()
        initAdvanceTools()
        initTerms()
        initCheckWeakToken()
        initTTYD()
    }

    let toastTimer = null
    const onTokenConfirm = debounce(async () => {
        try {
            createToast(t('toast_login_checking'), '', 2000)
            await needToken()
            let tokenInput = document.querySelector('#TOKEN')
            let token = tokenInput && (tokenInput.value)
            if (isNeedToken) {
                if (!token || !token?.trim()) return createToast(t('toast_please_input_token'), 'red')
                KANO_TOKEN = SHA256(token.trim()).toLowerCase()
            } else {
                KANO_TOKEN = null
            }
            common_headers.authorization = KANO_TOKEN
            try {
                const res = await fetchWithTimeout(`${KANO_baseURL}/baseDeviceInfo`, { headers: { ...common_headers } }, 3000)
                if (res.status === 401) {
                    return createToast(t('toast_token_failed'), 'red')
                }
                if (!res.ok) {
                    throw new Error(`HTTP ${res.status}`)
                }
            } catch (e) {
                if (e.status === 401) {
                    return createToast(t('toast_token_failed'), 'red')
                }
                throw e
            }
            createToast(t('toast_login_success'), 'green')
            if (KANO_TOKEN) {
                localStorage.setItem('kano_sms_token', KANO_TOKEN)
            }
            closeModal('#tokenModal')
            initRenderMethod()
        }
        catch (e) {
            createToast(t('toast_login_failed_catch'), 'red')
        }
    }, 200)

    let timer_out = null
    function out() {
        smsSender && smsSender()
        localStorage.removeItem('kano_sms_token')
        closeModal('#smsList')
        clearTimeout(timer_out)
        timer_out = setTimeout(() => {
            showModal('#tokenModal')
        }, 320);
    }

    let initRequestData = async () => {
        const TOKEN = localStorage.getItem('kano_sms_token')
        if (isNeedToken && !TOKEN) {
            return false
        }
        KANO_TOKEN = TOKEN || null
        common_headers.authorization = KANO_TOKEN
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
                // out()
                createToast(t('client_mgmt_fetch_error') + res.error, 'red')
                return null
            }
            return res.messages ? res.messages : []
        } catch {
            // out()
            createToast(t('client_mgmt_fetch_error') + res.error, 'red')
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
                if (isDisabledSendSMS) return createToast(t('toast_do_not_send_repeatly'), 'red')
                const content = SMSInput.value.trim()
                const number = PhoneInput.value.trim()
                isDisabledSendSMS = true
                const res = await sendSms_UFI({ content, number })
                if (res && res.result == 'success') {
                    SMSInput.value = ''
                    createToast(t('toast_sms_send_success'), 'green')
                    handleSmsRender()
                } else {
                    createToast((res && res.message) ? res.message : t('toast_sms_send_failed'), 'red')
                }
            } catch {
                createToast(t('toast_sms_send_failed_network'), 'red')
                // out()
            }
            isDisabledSendSMS = false
        } else {
            createToast(t('toast_sms_check_phone_and_content'), 'red')
        }
    }

    const deleteState = new Map();
    const deleteSMS = async (id, flag = false) => {
        const message = document.querySelector(`#message${id}`);
        if (!message) return;
        // 获取当前 id 的删除状态
        let state = deleteState.get(id) || { confirmCount: 0, timer: null, isDeleting: false };

        if (state.isDeleting) return; // 正在删除时禁止操作

        state.confirmCount += 1;
        if (!flag) {
            message.style.display = '';
        }
        // 清除之前的计时器，重新设置 2 秒后重置状态
        clearTimeout(state.timer);
        state.timer = setTimeout(() => {
            state.confirmCount = 0;
            message.style.display = 'none';
            deleteState.set(id, state);
        }, 2000);

        deleteState.set(id, state);

        if (!flag) {
            if (state.confirmCount < 2) return; // 第一次点击时仅提示
        }
        // 进入删除状态，防止重复点击
        state.isDeleting = true;
        deleteState.set(id, state);

        try {
            const res = await removeSmsById(id);
            if (res?.result === 'success') {
                if (!flag) {
                    createToast(t('toast_delete_success'), 'green');
                }
                setTimeout(() => {
                    handleSmsRender();
                    state.isDeleting = false;
                }, 300)
            } else {
                createToast(res?.message || t('toast_delete_failed'), 'red');
            }
        } catch {
            createToast(t('toast_opration_failed_network'), 'red');
        }

        // 删除完成后，清理状态
        deleteState.delete(id);
    };

    let deleteAndReSendSms = async (id) => {
        await deleteSMS(id, true)
        //填充
        let smsListEl = document.querySelectorAll("#sms-list .sms-item")
        if (!smsListEl || !smsListEl.length) return
        let smsList = Array.from(smsListEl)
        for (let i in smsList) {
            if (smsList[i].dataset.smsId == id) {
                const PhoneInput = document.querySelector('#PhoneInput')
                const SMSInput = document.querySelector('#SMSInput')
                if (PhoneInput && SMSInput) {
                    PhoneInput.value = smsList[i].dataset.smsPhone
                    SMSInput.value = decodeBase64(smsList[i].dataset.smsContent)
                    await sendSMS()
                }
                break
            }
        }
    }

    let isFirstRender = true
    let lastRequestSmsIds = null
    let handleSmsRender = async () => {
        let list = document.querySelector('#sms-list')
        if (!list) createToast(t('toast_sms_list_node_not_found'), 'red')
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
            const dateStrArr = [t('year'), t('month'), '&nbsp;', ':', ':', '']
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
                return `<li class="sms-item" data-sms-id="${item.id}" data-sms-phone="${item.number}" data-sms-content="${item.content}" style="${item.tag == '3' ? 'background-color:#ffc0cb1f;margin-right:15px' : item.tag != '2' ? 'background-color:#0880001f;margin-left:15px' : 'background-color:#ffc0cb1f;margin-right:15px'}">
                                        <div class="arrow" style="${item.tag == '3' ? 'right:-30px;border-color: transparent transparent transparent #ffc0cb1f' : item.tag == '2' ? 'right:-30px;border-color: transparent transparent transparent #ffc0cb1f' : 'left:-30px;border-color: transparent #0880001f transparent transparent'}"></div>
                                        ${item.tag == "3" ? `<svg onclick="deleteAndReSendSms(${item.id})" class="icon" style="position: absolute;right: 50px;top: 18px;" width="14px" height="14px" viewBox="0 0 1024 1024" version="1.1" xmlns="http://www.w3.org/2000/svg">
                <path fill="red" d="M815.36 184.96V128a36.48 36.48 0 0 1 10.24-26.88 37.76 37.76 0 0 1 52.48 0 40.96 40.96 0 0 1 11.52 26.88v172.16a40.32 40.32 0 0 1-37.12 37.12h-173.44a40.32 40.32 0 0 1-26.88-11.52 37.76 37.76 0 0 1 0-52.48 35.84 35.84 0 0 1 26.88-10.24h108.8a372.48 372.48 0 0 0-453.12-75.52A367.36 367.36 0 0 0 170.24 364.8a374.4 374.4 0 0 0-19.84 242.56 369.92 369.92 0 0 0 132.48 202.24A375.04 375.04 0 0 0 512 888.32a368.64 368.64 0 0 0 263.68-108.8A376.32 376.32 0 0 0 885.12 512H960A448 448 0 1 1 136.32 270.08a438.4 438.4 0 0 1 192-164.48 444.16 444.16 0 0 1 256-32 455.68 455.68 0 0 1 230.4 111.36z"></path>
            </svg>`: ""}
                                        <div class="icon" onclick="deleteSMS(${item.id})">
                                            <span id="message${item.id}" style="color: red;position: absolute;width: 100px;top: 2px;right: 30px;background: var(--dark-tag-color-active);display: none;text-align: center;padding: 4px;border-radius: 8px;backdrop-filter: blur(var(--blur-rate));">确定要删除吗？</span>
                                            <svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" t="1742373390977" class="icon" viewBox="0 0 1024 1024" version="1.1" p-id="2837" width="16" height="16"><path d="M848 144H608V96a48 48 0 0 0-48-48h-96a48 48 0 0 0-48 48v48H176a48 48 0 0 0-48 48v48h768v-48a48 48 0 0 0-48-48zM176 928a48 48 0 0 0 48 48h576a48 48 0 0 0 48-48V288H176v640z m480-496a48 48 0 1 1 96 0v400a48 48 0 1 1-96 0V432z m-192 0a48 48 0 1 1 96 0v400a48 48 0 1 1-96 0V432z m-192 0a48 48 0 1 1 96 0v400a48 48 0 1 1-96 0V432z" fill="" p-id="2838"/></svg>
                                        </div>
                                        <p style="color:#adadad;font-size:16px;margin:4px 0">${item.number}${item.tag == '3' ? ` <span style="font-size:.7rem;color:red">(${t("toast_sms_send_failed")})</span>` : ""}</p>
                                        <p>${decodeBase64(item.content)}</p>
                                        <p style="text-align:right;color:#adadad;margin-top:4px">${date}</p>
                                    </li > `
            }).join('')
        } else {
            if (!res) {
                return createToast(t('client_mgmt_fetch_error'), 'red')
                // out()
            }
            list.innerHTML = ` <li> <h2 style="padding: 30px;text-align:center;">${t('no_sms')}</h2></li >`
        }
    }

    let cachedDiagImeiQueryResult = ''
    let diagImeiTimer = null
    const queryImeiFromDIAG = async () => {
        if (diagImeiTimer == null) {
            diagImeiTimer = setTimeout(() => {
                cachedDiagImeiQueryResult = ''
                diagImeiTimer = null
            }, 5 * 60 * 1000);
        }
        if (cachedDiagImeiQueryResult && cachedDiagImeiQueryResult != '') {
            return cachedDiagImeiQueryResult
        }
        let isEnabled = await checkAdvancedFunc()
        if (isEnabled) {
            try {
                const res = await runShellWithRoot(`/data/data/com.minikano.f50_sms/files/imei_reader`)
                const imei = res.content.replace(/IMEI[0-9]:/g, "").split('\n')[0]
                cachedDiagImeiQueryResult = imei
                return imei
            } catch {
                return ''
            }
        }
    }

    const resetDiagImeiCache = () => {
        cachedDiagImeiQueryResult = ''
        diagImeiTimer && clearTimeout(diagImeiTimer)
        diagImeiTimer = null
    }

    let StopStatusRenderTimer = null
    let isNotLoginOnce = true
    let status_login_try_times = 0
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
                status.innerHTML = `<li style="padding-top: 15px;"><strong onclick="copyText(event)" class="green">${t('status_load_failed')}</strong></li>`
                createToast(t('toast_get_data_failed_check_network_pwd'), 'red')
            }
            if ((!KANO_TOKEN || !common_headers.authorization) && isNotLoginOnce) {
                status.innerHTML = `<li style="padding-top: 15px;"><strong onclick="copyText(event)" class="green">${t('status_load_failed')}</strong></li>`
                createToast(t('toast_login_to_get_data'), 'pink')
                isNotLoginOnce = false
            }
            return
        }
        if (res) {
            // //如果打开了高级功能，且用户已经处于改串后不显串状态，则使用强力查串补充串号显示
            if (!res.imei || res.imei.length === 0) {
                res.imei = await queryImeiFromDIAG()
            }
            //如果设备显串，且和缓存不一致，则清空缓存
            if (res.imei && (res.imei != cachedDiagImeiQueryResult)) {
                resetDiagImeiCache()
            }
            //不管设备是否显串，只要iccid有变更，就清空imei缓存
            if (window.UFI_DATA["iccid"] !== res.iccid) {
                resetDiagImeiCache()
            }

            Object.keys(res).forEach(key => {
                window.UFI_DATA[key] = res[key];
            });

            adbQuery()
            isNotLoginOnce = false
            let html = ''
            try {
                const current_cell = document.querySelector('#CURRENT_CELL')
                const select_current_cell_btn = document.querySelector('#SELECT_CURRENT_CELL_BTN')

                const cellData = res || {}
                const PCI = cellData.Nr_pci || cellData.Lte_pci || ''
                const FCN = cellData.Nr_fcn || cellData.Lte_fcn || ''
                const BAND_STR = cellData.Nr_bands ? "N" + cellData.Nr_bands : (cellData.Lte_bands ? "B" + cellData.Lte_bands : '')
                const RSRP = cellData.Z5g_rsrp || cellData.lte_rsrp || ''
                const SINR = cellData.Nr_snr || cellData.Lte_snr || ''
                const RSRQ = cellData.nr_rsrq || cellData.lte_rsrq || ''

                if (!PCI || !FCN) {
                    if (current_cell) {
                        current_cell.innerHTML = `<tr><td colspan="6" style="opacity:.66;text-align:center;color:var(--dark-text-color)">${t('no_cell_connected')}</td></tr>`
                    }
                    if (select_current_cell_btn) {
                        select_current_cell_btn.onclick = () => {
                            createToast(t('no_cell_connected'), 'pink')
                        }
                    }
                }

                if (select_current_cell_btn) {
                    select_current_cell_btn.onclick = () => onSelectCellRow(PCI, FCN)
                }

                if (current_cell) {
                    current_cell.innerHTML = `
            <tr onclick="onSelectCellRow(${PCI},${FCN})" style="cursor: pointer;">
                <td>${BAND_STR}</td>
                <td>${FCN}</td>
                <td>${PCI}</td>
                <td>${kano_parseSignalBar(RSRP)}</td>
                <td>${kano_parseSignalBar(SINR, -10, 30, 13, 0)}</td>
                <td>${kano_parseSignalBar(RSRQ, -20, -3, -9, -12)}</td>
            </tr>
            `
                }
            } catch (e) {
                console.error("render PCI blocks fail:", e);
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
                network_type: `${notNullOrundefinedOrIsShow(res, 'network_type') ? `<strong onclick="copyText(event)"  class="green">${t('network_status')}：${res.network_provider} ${res.network_type == '20' ? '5G' : res.network_type == '13' ? '4G' : res.network_type}</strong>` : ''}`,
                wifi_access_sta_num: `${notNullOrundefinedOrIsShow(res, 'wifi_access_sta_num') ? `<strong onclick="copyText(event)"  class="blue">${t('wifi_client_num')}：${res.wifi_access_sta_num}</strong>` : ''}`,
                battery: `${notNullOrundefinedOrIsShow(res, 'battery') && (res.battery_value != '' || res.battery_vol_percent != '') ? `<strong onclick="copyText(event)"  class="green">${res.battery_charging == "1" ? `${t('charging')}` : `${t('battery_level')}`}：${kano_parseSignalBar(res.battery, 1, 100, 50, 10, undefined, " %")}</strong>` : ''}`,
                rssi: `${notNullOrundefinedOrIsShow(res, 'rssi') || notNullOrundefinedOrIsShow(res, 'network_signalbar', true) ? `<strong onclick="copyText(event)"  class="green">${t('rssi')}：${kano_getSignalEmoji(notNullOrundefinedOrIsShow(res, 'rssi') ? res.rssi : res.network_signalbar)}</strong>` : ''}`,
                cpu_temp: `${notNullOrundefinedOrIsShow(res, 'cpu_temp') ? `<strong onclick="copyText(event)"  class="blue">${t('cpu_temp')}：<span style="text-align:center;display:inline-block;width: 8ch;">${String(Number(res.cpu_temp / 1000).toFixed(2)).padStart(5, ' ')} ℃</span></strong>` : ''}`,
                cpu_usage: `${notNullOrundefinedOrIsShow(res, 'cpu_usage') ? `<strong onclick="copyText(event)"  class="blue">${t('cpu_usage')}：<span style="text-align:center;display:inline-block;width: 8ch;">${String(Number(res.cpu_usage).toFixed(2)).padStart(5, ' ')} %</span></strong>` : ''}`,
                mem_usage: `${notNullOrundefinedOrIsShow(res, 'mem_usage') ? `<strong onclick="copyText(event)"  class="blue">${t("ram_usage")}：<span style="text-align:center;display:inline-block;width: 8ch;">${String(Number(res.mem_usage).toFixed(2)).padStart(5, ' ')} %</span></strong>` : ''}`,
                realtime_time: `${notNullOrundefinedOrIsShow(res, 'realtime_time') ? `<strong onclick="copyText(event)"  class="blue">${t('link_realtime')}：${kano_formatTime(Number(res.realtime_time))}${res.monthly_time ? `&nbsp;<span style="color:white">/</span>&nbsp;${t('total_link_time')}: ` + kano_formatTime(Number(res.monthly_time)) : ''}</strong>` : ''}`,
                monthly_tx_bytes: `${notNullOrundefinedOrIsShow(res, 'monthly_tx_bytes') || notNullOrundefinedOrIsShow(res, 'monthly_rx_bytes') ? `<strong onclick="copyText(event)"  class="blue">${t("monthly_rx_bytes")}：<span class="red">${formatBytes(Number((res.monthly_tx_bytes + res.monthly_rx_bytes)))}</span>${(res.data_volume_limit_size || res.flux_data_volume_limit_size) && (res.flux_data_volume_limit_switch == '1' || res.data_volume_limit_switch == '1') ? `&nbsp;<span style="color:white">/</span>&nbsp;${t('total_limit_bytes')}：` + formatBytes((() => {
                    const limit_size = res.data_volume_limit_size ? res.data_volume_limit_size : res.flux_data_volume_limit_size
                    if (!limit_size) return ''
                    return limit_size.split('_')[0] * limit_size.split('_')[1] * Math.pow(1024, 2)
                })()) : ''}</strong>` : ''}`,
                daily_data: `${notNullOrundefinedOrIsShow(res, 'daily_data') ? `<strong onclick="copyText(event)"  class="blue">${t('daily_data')}：${formatBytes(res.daily_data)}${res.monthly_data ? ` / ${t('monthly_data')}：${formatBytes(res.monthly_data)}` : ''}</strong>` : ''}`,
                current_now: `${notNullOrundefinedOrIsShow(res, 'current_now') && (res.battery_value != '' || res.battery_vol_percent != '') ? `<strong onclick="copyText(event)"  class="blue">${t('battery_current')}：<span style="width: 9ch;text-align:center">${res.current_now / 1000} mA</span></strong>` : ''}`,
                voltage_now: `${notNullOrundefinedOrIsShow(res, 'voltage_now') && (res.battery_value != '' || res.battery_vol_percent != '') ? `<strong onclick="copyText(event)"  class="blue">${t('battery_voltage')}：${(res.voltage_now / 1000000).toFixed(3)} V</strong>` : ''}`,
                realtime_rx_thrpt: `${notNullOrundefinedOrIsShow(res, 'realtime_tx_thrpt') || notNullOrundefinedOrIsShow(res, 'realtime_rx_thrpt') ? `<strong onclick="copyText(event)" class="blue">${t("current_network_speed")}: <span style="text-align:center;white-space:nowrap;overflow:hidden;display:inline-block;width: 14ch;">⬇️&nbsp;${formatBytes(Number((res.realtime_rx_thrpt)))}/S</span><span style="white-space:nowrap;overflow:hidden;text-align:center;display:inline-block;width: 14ch;font-weight:bolder">⬆️&nbsp;${formatBytes(Number((res.realtime_tx_thrpt)))}/S</span></strong>` : ''}`,
            }
            let statusHtml_net = {
                lte_rsrp: notNullOrundefinedOrIsShow(res, 'lte_rsrp') ? `<strong onclick="copyText(event)" class="green">${t('4g_rsrp')}：${kano_parseSignalBar(res.lte_rsrp)}</strong>` : '',
                Lte_snr: notNullOrundefinedOrIsShow(res, 'Lte_snr') ? `<strong onclick="copyText(event)" class="blue">${t('4g_sinr')}：${kano_parseSignalBar(res.Lte_snr, -10, 30, 13, 0)}</strong>` : '',
                Lte_bands: notNullOrundefinedOrIsShow(res, 'Lte_bands') ? `<strong onclick="copyText(event)" class="blue">${t('4g_band')}：B${res.Lte_bands}</strong>` : '',
                Lte_fcn: notNullOrundefinedOrIsShow(res, 'Lte_fcn') ? `<strong onclick="copyText(event)" class="green">${t('4g_freq')}：${res.Lte_fcn}</strong>` : '',
                Lte_bands_widths: notNullOrundefinedOrIsShow(res, 'Lte_bands_widths') ? `<strong onclick="copyText(event)" class="green">${t('4g_bandwidth')}：${res.Lte_bands_widths}</strong>` : '',
                Lte_pci: notNullOrundefinedOrIsShow(res, 'Lte_pci') ? `<strong onclick="copyText(event)" class="blue">${t('4g_pci')}：${res.Lte_pci}</strong>` : '',
                lte_rsrq: notNullOrundefinedOrIsShow(res, 'lte_rsrq') ? `<strong onclick="copyText(event)" class="blue">${t('4g_rsrq')}：${kano_parseSignalBar(res.lte_rsrq, -20, -3, -9, -12)}</strong>` : '',
                lte_rssi: notNullOrundefinedOrIsShow(res, 'lte_rssi') ? `<strong onclick="copyText(event)" class="green">${t('4g_rssi')}：${res.lte_rssi}</strong>` : '',
                Lte_cell_id: notNullOrundefinedOrIsShow(res, 'Lte_cell_id') ? `<strong onclick="copyText(event)" class="green">${t('4g_cell_id')}：${res.Lte_cell_id}</strong>` : '',

                Z5g_rsrp: notNullOrundefinedOrIsShow(res, 'Z5g_rsrp') ? `<strong onclick="copyText(event)" class="green">${t('5g_rsrp')}：${kano_parseSignalBar(res.Z5g_rsrp)}</strong>` : '',
                Nr_snr: notNullOrundefinedOrIsShow(res, 'Nr_snr') ? `<strong onclick="copyText(event)" class="green">${t('5g_sinr')}：${kano_parseSignalBar(res.Nr_snr, -10, 30, 13, 0)}</strong>` : '',
                Nr_bands: notNullOrundefinedOrIsShow(res, 'Nr_bands') ? `<strong onclick="copyText(event)" class="green">${t('5g_band')}：N${res.Nr_bands}</strong>` : '',
                Nr_fcn: notNullOrundefinedOrIsShow(res, 'Nr_fcn') ? `<strong onclick="copyText(event)" class="blue">${t('5g_freq')}：${res.Nr_fcn}</strong>` : '',
                Nr_bands_widths: notNullOrundefinedOrIsShow(res, 'Nr_bands_widths') ? `<strong onclick="copyText(event)" class="blue">${t('5g_bandwidth')}：${res.Nr_bands_widths}</strong>` : '',
                Nr_pci: notNullOrundefinedOrIsShow(res, 'Nr_pci') ? `<strong onclick="copyText(event)" class="green">${t('5g_pci')}：${res.Nr_pci}</strong>` : '',
                nr_rsrq: notNullOrundefinedOrIsShow(res, 'nr_rsrq') ? `<strong onclick="copyText(event)" class="green">${t('5g_rsrq')}：${kano_parseSignalBar(res.nr_rsrq, -20, -3, -9, -12)}</strong>` : '',
                nr_rssi: notNullOrundefinedOrIsShow(res, 'nr_rssi') ? `<strong onclick="copyText(event)" class="blue">${t('5g_rssi')}：${res.nr_rssi}</strong>` : '',
                Nr_cell_id: notNullOrundefinedOrIsShow(res, 'Nr_cell_id') ? `<strong onclick="copyText(event)" class="blue">${t('5g_cell_id')}：${res.Nr_cell_id}</strong>` : '',
            };

            let statusHtml_other = {
                client_ip: notNullOrundefinedOrIsShow(res, 'client_ip') ? `<strong onclick="copyText(event)" class="blue">${t('client_ip')}：${res.client_ip}</strong>` : '',
                model: notNullOrundefinedOrIsShow(res, 'model') ? `<strong onclick="copyText(event)" class="blue">${t('device_model')}：${res.model}</strong>` : '',
                cr_version: notNullOrundefinedOrIsShow(res, 'cr_version') ? `<strong onclick="copyText(event)" class="blue">${t('version')}：${res.cr_version}</strong>` : '',
                iccid: notNullOrundefinedOrIsShow(res, 'iccid') ? `<strong onclick="copyText(event)" class="blue">ICCID：${res.iccid}</strong>` : '',
                imei: notNullOrundefinedOrIsShow(res, 'imei') ? `<strong onclick="copyText(event)" class="blue">IMEI：${res.imei}</strong>` : '',
                imsi: notNullOrundefinedOrIsShow(res, 'imsi') ? `<strong onclick="copyText(event)" class="blue">IMSI：${res.imsi}</strong>` : '',
                ipv6_wan_ipaddr: notNullOrundefinedOrIsShow(res, 'ipv6_wan_ipaddr') ? `<strong onclick="copyText(event)" class="blue">${t('ipv6_addr')}：${res.ipv6_wan_ipaddr}</strong>` : '',
                lan_ipaddr: notNullOrundefinedOrIsShow(res, 'lan_ipaddr') ? `<strong onclick="copyText(event)" class="blue">${t('lan_gateway')}：${res.lan_ipaddr}</strong>` : '',
                mac_address: notNullOrundefinedOrIsShow(res, 'mac_address') ? `<strong onclick="copyText(event)" class="blue">MAC：${res.mac_address}</strong>` : '',
                msisdn: notNullOrundefinedOrIsShow(res, 'msisdn') ? `<strong onclick="copyText(event)" class="blue">${t('msisdn')}：${res.msisdn}</strong>` : '',
                internal_available_storage: (notNullOrundefinedOrIsShow(res, 'internal_available_storage') || notNullOrundefinedOrIsShow(res, 'internal_total_storage')) ? `<strong onclick="copyText(event)" class="blue">${t('internal_storage')}：${formatBytes(res.internal_used_storage)} ${t('used_storage')} / ${formatBytes(res.internal_total_storage)} ${t('total_storage')}</strong>` : '',
                external_available_storage: (notNullOrundefinedOrIsShow(res, 'external_available_storage') || notNullOrundefinedOrIsShow(res, 'external_total_storage')) ? `<strong onclick="copyText(event)" class="blue">${t('sd_storage')}：${formatBytes(res.external_used_storage)} ${t('used_storage')} / ${formatBytes(res.external_total_storage)} ${t('total_storage')}</strong>` : '',
            };

            html += `<li style="padding-top: 15px;"><p>`
            showList.statusShowList.forEach(item => {
                if (statusHtml_base[item.name] && item.isShow) {
                    html += statusHtml_base[item.name]
                }
            })
            html += `</p></li>`
            
            html += `<div class="title" style="margin: 6px 0;"><b>${t('device_props')}</b></div>`

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

    async function init() {
        smsSender && smsSender()
        if (!(await initRequestData())) {
            showModal('#tokenModal')
        } else {
            isFirstRender = true
            lastRequestSmsIds = null
            handleSmsRender()
            smsSender = requestInterval(() => handleSmsRender(), 2000)
        }
    }

    let clearBtn = document.querySelector('#CLEAR')
    clearBtn.onclick = async () => {
        isFirstRender = true
        lastRequestSmsIds = null
        localStorage.removeItem('kano_sms_token')
        KANO_TOKEN = null
        common_headers.authorization = null
        initRenderMethod()
        await needToken()
        createToast(t('toast_logout'), 'green')
        showModal('#tokenModal')
    }

    //WiFi开关切换_INIT
    let initWIFISwitch = async () => {
        const selectEl = document.querySelector('#WIFI_SWITCH')
        if (!(await initRequestData()) || !selectEl) {
            selectEl.style.backgroundColor = 'var(--dark-btn-disabled-color)'
            selectEl.disabled = true
            return null
        }

        selectEl.style.backgroundColor = ''
        selectEl.disabled = false
        let { WiFiModuleSwitch, ResponseList } = await getData(new URLSearchParams({
            cmd: 'queryWiFiModuleSwitch,queryAccessPointInfo'
        }))

        const WIFIManagementContent = document.querySelector('#wifiInfo')

        try {
            await initWIFIManagementForm()
        } catch { }

        if (WiFiModuleSwitch == "1") {
            WIFIManagementContent && (WIFIManagementContent.style.display = '')
            if (ResponseList?.length) {
                ResponseList.forEach(item => {
                    if (item.AccessPointSwitchStatus == '1') {
                        selectEl.value = item.ChipIndex == "0" ? 'chip1' : 'chip2'
                    }
                })
            }
        } else {
            WIFIManagementContent && (WIFIManagementContent.style.display = 'none')
            selectEl.value = 0
        }
    }
    initWIFISwitch()

    //WiFi开关切换
    let changeWIFISwitch = async (e) => {
        const selectEl = document.querySelector('#WIFI_SWITCH')
        const value = e.target.value.trim()
        if (!(await initRequestData()) || !value) {
            createToast(t('toast_need_login'), 'red')
            return null
        }
        createToast(t('toast_changing'), '#BF723F')
        try {
            selectEl.style.backgroundColor = 'var(--dark-btn-disabled-color)'
            selectEl.disabled = true
            const cookie = await login()
            if (!cookie) {
                createToast(t('toast_login_failed_check_network'), 'red')
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
                    createToast(t('toast_op_success_reconnect_wifi'), 'green')
                    initWIFISwitch()

                } else {
                    createToast(t('toast_oprate_failed'), 'red')
                }
                selectEl.style.backgroundColor = ''
                selectEl.disabled = false
            }, 1000);
        } catch (e) {
            // createToast(e.message)
        }
    }

    const initBandForm = async () => {
        const el = document.querySelector('#bandsForm')
        if (!(await initRequestData()) || !el) {
            return null
        }
        let res = await getData(new URLSearchParams({
            cmd: 'lte_band_lock,nr_band_lock'
        })).catch(() => null)

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
        checkBandSelect()
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
        try {
            const cookie = await login()
            if (!cookie) {
                throw new Error('login failed')
            }
            const res = await (await postData(cookie, {
                goformId: 'LTE_BAND_LOCK',
                lte_band_lock: lte_bands.join(','),
                nr_band_lock: nr_bands.join(',')
            })).json()
            if (res.result == 'success') {
                createToast(t('toast_set_band_success'), 'green')
            }
            else {
                createToast(t('toast_set_band_failed'), 'red')
            }
        } catch {
            createToast(t('toast_set_band_failed'), 'red')
        } finally {
            await initBandForm()
        }
    }

    //解除锁定所有频段
    const unlockAllBand = () => {
        //手动全选频段，点击锁定
        toggleAllBandBox(true)
        selectAllBand.checked = true
        const lockBandBtn = document.querySelector('#lockBandBtn')
        if (lockBandBtn) {
            lockBandBtn.click()
        }
    }

    //锁基站
    let initCellInfo = async (onlyRefreshLockedInfoList = false) => {
        try {
            //已锁基站信息
            //基站信息
            const { neighbor_cell_info, locked_cell_info } = await getData(new URLSearchParams({
                cmd: 'neighbor_cell_info,locked_cell_info',
                multi_data: 1
            }))

            if (neighbor_cell_info && !onlyRefreshLockedInfoList) {
                const cellBodyEl = document.querySelector('#cellForm tbody')
                if (neighbor_cell_info.length <= 0) {
                    cellBodyEl.innerHTML = `<tr><td colspan="6" style="opacity:.66;text-align:center;color:var(--dark-text-color)">${t('no_neighbour_cell')}</td></tr>`
                } else {
                    cellBodyEl.innerHTML = neighbor_cell_info.map(item => {
                        const { band, earfcn, pci, rsrp, rsrq, sinr } = item
                        return `
                    <tr onclick="onSelectCellRow(${pci},${earfcn})">
                        <td>${band}</td>
                        <td>${earfcn}</td>
                        <td>${pci}</td>
                        <td>${kano_parseSignalBar(rsrp)}</td>
                        <td>${kano_parseSignalBar(sinr, -10, 30, 13, 0)}</td>
                        <td>${kano_parseSignalBar(rsrq, -20, -3, -9, -12)}</td>
                    </tr>
                `
                    }).join('')
                }
            }
            if (locked_cell_info) {
                const lockedCellBodyEl = document.querySelector('#LOCKED_CELL_FORM tbody')
                if (locked_cell_info.length <= 0) {
                    lockedCellBodyEl.innerHTML = `<tr><td colspan="3" style="opacity:.66;text-align:center;color:var(--dark-text-color)">${t('no_locked_cell')}</td></tr>`
                } else {
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
            }
        } catch (e) {
            // createToast(e.message)
        }
    }

    let cellInfoRequestTimer = null
    initCellInfo()

    const toggleLkcellOpen = (isOpen = false) => {
        const lkCellRefreshBtn = document.querySelector('#lkCellRefreshBtn')
        if (!lkCellRefreshBtn) return
        if (isOpen) {
            cellInfoRequestTimer && cellInfoRequestTimer()
            cellInfoRequestTimer = requestInterval(() => initCellInfo(), REFRESH_TIME + 1500)
            lkCellRefreshBtn.dataset.toggle = "1"
            lkCellRefreshBtn.innerHTML = t('stop_refresh')
        } else {
            cellInfoRequestTimer && cellInfoRequestTimer()
            lkCellRefreshBtn.dataset.toggle = "0"
            cellInfoRequestTimer = null
            lkCellRefreshBtn.innerHTML = t('start_refresh')
        }
    }

    const toggleCellInfoRefresh = (e) => {
        const target = e.target
        if (target) {
            const data = e.target.dataset.toggle
            if (data != "1") {
                toggleLkcellOpen(true)
            } else {
                toggleLkcellOpen(false)
            }
        }
    }

    let onSelectCellRow = (pci, earfcn) => {
        let pci_t = document.querySelector('#PCI')
        let earfcn_t = document.querySelector('#EARFCN')
        if (pci_t && earfcn_t && isNaN(pci) == false && isNaN(earfcn) == false) {
            pci_t.value = pci
            earfcn_t.value = earfcn
            createToast(`${t('toast_has_selected')}: ${pci},${earfcn}`, 'green')
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
                createToast(t('toast_data_not_filling_done'), 'red')
                return
            }

            const cookie = await login()
            if (!cookie) {
                throw new Error('login failed')
            }
            const res = await (await postData(cookie, {
                goformId: 'CELL_LOCK',
                ...form
            })).json()

            if (res.result == 'success') {
                pciEl.value = ''
                earfcnEl.value = ''
                createToast(t('toast_set_cell_success'), 'green')
                //刷新基站列表
                initCellInfo(true)
            } else {
                throw t('toast_set_cell_failed')
            }
        } catch (e) {
            createToast(t('toast_set_cell_failed'), 'red')
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
                throw new Error('login failed')
            }
            const res = await (await postData(cookie, {
                goformId: 'UNLOCK_ALL_CELL'
            })).json()

            if (res.result == 'success') {
                createToast(t('toast_unlock_cell_success'), 'green')
                //刷新基站列表
                initCellInfo(true)
            } else {
                throw t('toast_unlock_cell_failed')
            }
        } catch {
            createToast(t('toast_unlock_cell_failed'), 'red')
        }
    }

    //字段显示隐藏
    document.querySelector("#DICTIONARY").onclick = (e) => {
        showModal('#dictionaryModal')
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
        if (resetShowListBtnCount == 1) target.innerHTML = t('btn_confirm_question')
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
        StopStatusRenderTimer = requestInterval(() => handlerStatusRender(), REFRESH_TIME)
        QORSTimer = requestInterval(() => { QOSRDPCommand("AT+CGEQOSRDP=1") }, 10000)
    }
    const stopRefresh = () => {
        StopStatusRenderTimer && StopStatusRenderTimer()
        QORSTimer && QORSTimer()
    }

    //暂停开始刷新
    Array.from(document.querySelectorAll('.REFRESH_BTN'))?.forEach(el => {
        el.onclick = (e) => {
            if (e.target.innerHTML == t('start_refresh')) {
                Array.from(document.querySelectorAll('.REFRESH_BTN')).forEach(ee => {
                    ee.innerHTML = t('stop_refresh')
                })
                createToast(t('toast_start_refresh'), 'green')
                startRefresh()
            } else {
                Array.from(document.querySelectorAll('.REFRESH_BTN')).forEach(ee => {
                    ee.innerHTML = t('start_refresh')
                })
                createToast(t('toast_stop_refresh'), 'green')
                stopRefresh()
            }
        }
    })

    //流量管理逻辑
    const dataManagementBtn = document.querySelector("#DataManagement")
    if (dataManagementBtn) dataManagementBtn.onclick = async () => {
        if (!(await initRequestData())) {
            createToast(t('toast_please_login'), 'red')
            out()
            return null
        }
        // 查流量使用情况
        let res = await getDataUsage()
        if (!res) {
            createToast(t('toast_get_data_usage_failed'), 'red')
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
                createToast(t('toast_login_failed_check_network'), 'red')
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
                            createToast(t('toast_clear_date_must_be_number'), 'red')
                            return
                        }
                        if (Number(value.trim()) < 0 || Number(value.trim()) > 31) {
                            createToast(t('toast_clear_date_must_between_1_31'), 'red')
                            return
                        }
                        form_data[key] = value.trim()
                        form_data['flux_clear_date'] = value.trim()
                        break;
                    case 'data_volume_alert_percent':
                        if (isNaN(Number(value.trim())) || value.trim() == '') {
                            createToast(t('toast_alert_threshold_error'), 'red')
                            return
                        }
                        if (Number(value.trim()) < 0 || Number(value.trim()) > 100) {
                            createToast(t('toast_alert_threshold_must_between_0_100'), 'red')
                            return
                        }
                        form_data[key] = value.trim()
                        form_data['flux_data_volume_alert_percent'] = value.trim()
                        break;
                    case 'data_volume_limit_size':
                        if (isNaN(Number(value.trim()))) {
                            createToast(t('toast_plan_must_be_number'), 'red')
                            return
                        }
                        if (Number(value.trim()) <= 0) {
                            createToast(t('toast_plan_must_greater_than_0'), 'red')
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
                            createToast(t('toast_used_must_be_number'), 'red')
                            return
                        }
                        if (Number(value.trim()) <= 0) {
                            createToast(t('toast_used_must_greater_than_0'), 'red')
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
                    createToast(t('toast_set_success'), 'green')
                    closeModal('#DataManagementModal')
                } else {
                    throw t('toast_set_failed')
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
            const WIFIManagementContent = document.querySelector('#wifiInfo')
            if (!WIFIManagementForm) return

            if (WiFiModuleSwitch == "1" && ResponseList?.length) {
                WIFIManagementContent && (WIFIManagementContent.style.display = '')
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
            } else {
                WIFIManagementContent && (WIFIManagementContent.style.display = 'none')
            }
        }
        catch (e) {
            console.error(e.message)
            // createToast(e.message)
        }
    }

    const wifiManagementBtn = document.querySelector("#WIFIManagement")
    if (wifiManagementBtn) wifiManagementBtn.onclick = async () => {
        if (!(await initRequestData())) {
            createToast(t('toast_please_login'), 'red')
            out()
            return null
        }
        showModal("#WIFIManagementModal")
        await initWIFIManagementForm()
    }

    let handleWIFIManagementFormSubmit = async (e) => {
        e.preventDefault();
        try {
            const cookie = await login()
            if (!cookie) {
                createToast(t('toast_login_failed_check_network'), 'red')
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
                    return createToast(t('toast_please_input_pwd'), 'red')
                }
                if (data.Password.length < 8) {
                    return createToast(t('toast_password_too_short'), 'red')
                }
                if (data.ApMaxStationNumber.length <= 0) {
                    return createToast(t('toast_max_client_must_greater_than_0'), 'red')
                }
            }

            const res = await (await postData(cookie, {
                goformId: 'setAccessPointInfo',
                ...data
            })).json()

            if (res.result == 'success') {
                createToast(t('toast_op_success_reconnect_wifi'), 'green')
                closeModal('#WIFIManagementModal')
            } else {
                throw t('toast_oprate_failed_check_network')
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

    document.querySelector('#TOKEN').addEventListener('keydown', (event) => {
        if (event.key === 'Enter') {
            onTokenConfirm()
        }
    });

    // title
    const loadTitle = async () => {
        try {
            const { app_ver, model } = await (await fetch(`${KANO_baseURL}/version_info`, { headers: common_headers })).json()
            MODEL.innerHTML = `${model}`
            document.querySelector('#TITLE').innerHTML = `[${model}]UFI-TOOLS-WEB Ver: ${app_ver}`
            document.querySelector('#MAIN_TITLE').innerHTML = `UFI-TOOLS <span style="font-size:14px">Ver: ${app_ver}</span>`
        } catch {/*没有，不处理*/ }
    }
    loadTitle()

    //设置背景图片
    const initBGBtn = async () => {
        const btn = document.querySelector('#BG_SETTING')
        if (!(await initRequestData())) {
            btn.onclick = () => createToast(t('toast_please_login'), 'red')
            btn.style.backgroundColor = 'var(--dark-btn-disabled-color)'
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
        const imgUrl = document.querySelector('#BG_INPUT')?.value
        const bg_checked = document.querySelector('#isCheckedBG')?.checked
        const BG = document.querySelector('#BG')
        const BG_OVERLAY = document.querySelector('#BG_OVERLAY')
        const isCloudSync = document.querySelector("#isCloudSync")

        localStorage.setItem("isCloudSync", isCloudSync.checked)

        if (!BG || bg_checked == undefined || !BG_OVERLAY) return
        if (!bg_checked) {
            BG.style.backgroundImage = 'unset'
            localStorage.removeItem('backgroundUrl')
        } else {
            imgUrl.trim() && (BG.style.backgroundImage = `url(${imgUrl})`)
            imgUrl.trim() && localStorage.setItem('backgroundUrl', imgUrl)
        }
        //发请求同步数据
        if (isCloudSync.checked) {
            try {
                const { result, error } = await (await fetch(`${KANO_baseURL}/set_theme`, {
                    method: 'POST',
                    headers: common_headers,
                    body: JSON.stringify({
                        "backgroundEnabled": bg_checked,
                        "backgroundUrl": localStorage.getItem("backgroundUrl") || '',
                        "textColor": localStorage.getItem("textColor"),
                        "textColorPer": localStorage.getItem("textColorPer"),
                        "themeColor": localStorage.getItem("themeColor"),
                        "colorPer": localStorage.getItem("colorPer"),
                        "saturationPer": localStorage.getItem("saturationPer"),
                        "brightPer": localStorage.getItem("brightPer"),
                        "opacityPer": localStorage.getItem("opacityPer"),
                        "blurSwitch": localStorage.getItem("blurSwitch"),
                        "overlaySwitch": localStorage.getItem("overlaySwitch")
                    })
                })).json()

                if (result == "success") {
                    showSuccessToast && createToast(t('toast_save_success_sync'), 'green')
                    document.querySelector('#fileUploader').value = ''
                    closeModal('#bgSettingModal')
                }
                else throw error || ''
            }
            catch (e) {
                createToast(t('toast_sync_failed'), 'red')
            }
        } else {
            document.querySelector('#fileUploader').value = ''
            closeModal('#bgSettingModal')
            createToast(t('toast_save_success_local'), 'green')
        }
    }

    //手动同步主题
    const syncTheme = () => {
        initTheme(true); initBG()
        createToast(t('toast_sync_success'), 'green')
    }

    //初始化背景图片
    const initBG = async () => {
        const BG = document.querySelector('#BG')
        const imgUrl = localStorage.getItem('backgroundUrl')
        const isCheckedBG = document.querySelector('#isCheckedBG')
        const BG_INPUT = document.querySelector('#BG_INPUT')

        if (!BG || !isCheckedBG || !BG_INPUT) return
        isCheckedBG.checked = imgUrl ? true : false
        if (imgUrl?.length < 9999) {
            BG_INPUT.value = imgUrl
        }
        if (!imgUrl) {
            const BG_OVERLAY = document.querySelector('#BG_OVERLAY')
            // BG_OVERLAY && (BG_OVERLAY.style.background = 'transparent')
            return
        }

        BG.style.backgroundImage = `url(${imgUrl})`
    }
    initBG()

    //重置主题
    let resetThemeBtnTimer = 1
    let isConfirmResetTheme = false
    const resetTheme = async (e) => {
        e.target.innerHTML = t('reset_theme_confirm')
        resetThemeBtnTimer && clearTimeout(resetThemeBtnTimer)
        resetThemeBtnTimer = setTimeout(() => {
            isConfirmResetTheme = false
            e.target.disabled = false
            e.target.innerHTML = t('reset_theme_btn')
        }, 2000)
        if (!isConfirmResetTheme) {
            isConfirmResetTheme = true
            return
        }
        const isSync = localStorage.getItem("isCloudSync", isCloudSync.checked)
        if (isSync == true || isSync == "true") {
            try {
                const { result, error } = await (await fetch(`${KANO_baseURL}/set_theme`, {
                    method: 'POST',
                    headers: common_headers,
                    body: JSON.stringify({})
                })).json()

                if (result == "success") {
                    localStorage.removeItem('themeColor')
                    localStorage.removeItem('textColorPer')
                    localStorage.removeItem('textColor')
                    localStorage.removeItem('saturationPer')
                    localStorage.removeItem('opacityPer')
                    localStorage.removeItem('colorPer')
                    localStorage.removeItem('brightPer')

                    createToast(t('toast_reset_success'), 'green')
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
                createToast(t('toast_reset_failed'), 'red')
            }
        } else {
            createToast(t('toast_must_enable_sync_to_reset'), 'red')
        }
        initTheme && initTheme()
        e.target.innerHTML = t('reset_theme_btn')
        e.target.disabled = true
    }

    //定时重启模态框
    let initScheduleRebootStatus = async () => {
        const btn = document.querySelector('#SCHEDULE_REBOOT')
        const SCHEDULE_TIME = document.querySelector('#SCHEDULE_TIME')
        const SCHEDULE_ENABLED = document.querySelector('#SCHEDULE_ENABLED')
        if (!btn) return
        if (!(await initRequestData())) {
            btn.onclick = () => createToast(t('toast_please_login'), 'red')
            btn.style.backgroundColor = 'var(--dark-btn-disabled-color)'
            return null
        }

        const { restart_schedule_switch, restart_time } = await getData(new URLSearchParams({
            cmd: 'restart_schedule_switch,restart_time'
        }))

        SCHEDULE_ENABLED.checked = restart_schedule_switch == '1'
        SCHEDULE_TIME.value = restart_time
        btn.style.backgroundColor = restart_schedule_switch == '1' ? 'var(--dark-btn-color-active)' : ''

        btn.onclick = async () => {
            if (!(await initRequestData())) {
                btn.onclick = () => createToast(t('toast_please_login'), 'red')
                btn.style.backgroundColor = 'var(--dark-btn-disabled-color)'
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
                    if (!regx.exec(value.trim()) || !value.trim()) return createToast(t('toast_please_input_correct_reboot_time'), 'red')
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
                    createToast(t('toast_set_success'), 'green')
                    initScheduleRebootStatus()
                    closeModal('#scheduleRebootModal')
                } else {
                    throw t('toast_set_failed')
                }
            } catch {
                createToast(t('toast_set_failed'), 'red')
            }
        } catch {
            createToast(t('toast_login_failed_check_network_and_pwd'), 'red')
        }
    }

    // U30AIR用关机指令
    let shutDownBtnCount = 1
    let shutDownBtnTimer = null
    let initShutdownBtn = async () => {
        const btn = document.querySelector('#SHUTDOWN')
        if (!btn) return
        if (!(await initRequestData())) {
            btn.onclick = () => createToast(t('toast_please_login'), 'red')
            btn.style.backgroundColor = 'var(--dark-btn-disabled-color)'
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
                btn.onclick = () => createToast(t('toast_please_login'), 'red')
                btn.style.backgroundColor = 'var(--dark-btn-disabled-color)'
                return null
            }
            shutDownBtnCount++
            btn.innerHTML = t('confirm_shutdown')
            shutDownBtnTimer && clearTimeout(shutDownBtnTimer)
            shutDownBtnTimer = setTimeout(() => {
                shutDownBtnCount = 0
                btn.innerHTML = t('shutdown')
            }, 3000)
            if (shutDownBtnCount < 3) {
                return
            } else {
                btn.innerHTML = t("shutting_down")
            }
            try {
                const cookie = await login()
                try {
                    const res = await (await postData(cookie, {
                        goformId: 'SHUTDOWN_DEVICE'
                    })).json()
                    if (res?.result == 'success') {
                        createToast(t('toast_shutdown_success'), 'green')
                    } else {
                        createToast(t('toast_shutdown_failed'), 'red')
                    }
                } catch {
                    createToast(t('toast_shutdown_failed'), 'red')
                }
            } catch {
                createToast(t('toast_login_failed_check_network_and_pwd'), 'red')
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
            console.log('TTYD found')
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
        if (click_count_ttyd >= 4) {
            // 启用ttyd弹窗
            initResServer()
            showModal('#TTYDModal')
            ttyd_timer && clearInterval(ttyd_timer)
            click_count_ttyd = 1
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
        if (!ttyd_port || ttyd_port.trim() == '') return createToast(t('toast_please_input_port'), 'red')
        let ttydNumber = Number(ttyd_port.trim())
        if (isNaN(ttydNumber) || ttydNumber <= 0 || ttydNumber > 65535) return createToast(t('toast_please_input_port_correct'), 'red')
        // 保存ttyd port
        localStorage.setItem('ttyd_port', ttyd_port)
        createToast(t('toast_save_success'), 'green')
        initTTYD()
    }

    let changeResServer = async (e) => {
        e.preventDefault()
        const RES_SERVER_INPUT = document.querySelector('#RES_SERVER_INPUT')
        if (!RES_SERVER_INPUT) return
        const url = RES_SERVER_INPUT.value.trim()
        if (!url || url.length == 0) return createToast("Please input res server!", 'red')
        const res = await (await fetchWithTimeout(`${KANO_baseURL}/set_res_server`, {
            method: 'POST',
            headers: common_headers,
            body: JSON.stringify({ res_server: url })
        }, 5000)).json()
        if (res.result != "success") {
            return createToast(t('toast_save_failed'), 'red')
        }
        createToast(t('toast_save_success'), 'green')
        closeModal('#resServerModal')
    }

    let initResServer = async () => {
        const RES_SERVER_INPUT = document.querySelector('#RES_SERVER_INPUT')
        if (!RES_SERVER_INPUT) return
        try {
            const { res_server } = await (await fetchWithTimeout(`${KANO_baseURL}/get_res_server`, {
                method: 'GET',
                headers: common_headers
            })).json()
            RES_SERVER_INPUT.value = res_server || ''
        } catch {
            // no handle
        }
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
        return `QCI：${parts[1]} ⬇️ ${+parts[6] / 1000}Mbps ⬆️ ${+parts[7] / 1000}Mbps`
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
            //单卡用户默认0槽位
            sim_slot = 0
        }

        // For F50Pro
        if (UFI_DATA && UFI_DATA.model == "MU3356" && (sim_slot == '0' || sim_slot == '1')) {
            sim_slot = sim_slot == 1 ? 0 : 1
        }

        // V50 内置卡1(移动)slot=0 内置卡2(电信)slot=1 内置卡3(联通)slot=2 外置卡slot=11 外置卡 slot需要设置为0 联通内置卡slot设置为1
        // For V50
        if (sim_slot == "11") {
            //可恶的F50Pro两个卡槽居然是反过来的
            if (UFI_DATA && UFI_DATA.model == "MU3356") {
                sim_slot = 1
            } else {
                sim_slot = 0
            }
        }
        if (sim_slot == "2") {
            sim_slot = 1
        }
        // For F50Pro
        if (sim_slot == "12") {
            sim_slot = 0
        }

        let res = await executeATCommand(cmd, sim_slot)
        //如果是单卡用户，0槽位又获取不到数据，那就尝试1槽位
        if (res.result && res.result.includes('ERROR')) {
            if (dual_sim_support != '1') {
                sim_slot = 1
                res = await executeATCommand(cmd, sim_slot)
            }
        }
        if (res.result) return QORS_MESSAGE = parseCGEQOSRDP(res.result)
        return QORS_MESSAGE = null
    }
    QOSRDPCommand("AT+CGEQOSRDP=1")
    let QORSTimer = requestInterval(() => { QOSRDPCommand("AT+CGEQOSRDP=1") }, 10000)

    const initHighRailBtn = async () => {
        const highRailModeBtn = document.querySelector('#highRailModeBtn')
        if (highRailModeBtn) {
            try {
                const params = "AT+SP5GCMDS=\"get nr synch_param\",44"
                const res = await executeATCommand(params);
                highRailModeBtn.dataset.enabled = '0'
                if (res) {
                    if (res.error) {
                        AT_RESULT.innerHTML = `<p style="overflow: hidden;">${res.error}</p>`;
                        !silent && createToast(t('toast_exe_failed'), 'red');
                        return false
                    }
                    if (res.result.includes('synch_param,44,1')) {
                        highRailModeBtn.dataset.enabled = '1'
                        highRailModeBtn.style.backgroundColor = 'var(--dark-btn-color-active)'
                    }
                }
            } catch {
                highRailModeBtn.dataset.enabled = '0'
            }
        }
    }

    let initATBtn = async () => {
        const el = document.querySelector('#AT')
        if (!(await initRequestData()) || !el) {
            el.onclick = () => createToast(t('toast_please_login'), 'red')
            el.style.backgroundColor = 'var(--dark-btn-disabled-color)'
            return null
        }
        el.style.backgroundColor = ''
        el.onclick = () => {
            initHighRailBtn()
            showModal('#ATModal')
        }
    }
    initATBtn()


    const handleATFormSubmit = async () => {
        const AT_value = document.querySelector('#AT_INPUT')?.value;
        if (!AT_value || AT_value.trim() === '') {
            return createToast(t('toast_please_input_AT'), 'red');
        }

        const AT_RESULT = document.querySelector('#AT_RESULT');
        AT_RESULT.innerHTML = t('toast_running_please_wait')

        try {
            const res = await executeATCommand(AT_value.trim());

            if (res) {
                if (res.error) {
                    AT_RESULT.innerHTML = `<p style="overflow: hidden;">${res.error}</p>`;
                    createToast(t('toast_exe_failed'), 'red');
                    return;
                }
                //清空imei缓存
                resetDiagImeiCache()
                AT_RESULT.innerHTML = `<p onclick="copyText(event)"  style="overflow: hidden;">${parseCGEQOSRDP(res.result)}</p>`;
                createToast(t('toast_exe_success'), 'green');
            } else {
                createToast(t('toast_exe_failed'), 'red');
            }

        } catch (err) {
            const error = err?.error || t('toast_unknow_err');
            AT_RESULT.innerHTML = `<p style="overflow: hidden;">${error}</p>`;
            createToast(t('toast_exe_failed'), 'red');
        }
    };

    const handleQosAT = async () => {
        const AT_RESULT = document.querySelector('#AT_RESULT');
        AT_RESULT.innerHTML = t('toast_running_please_wait');

        try {
            const res = await executeATCommand('AT+CGEQOSRDP=1');

            if (res) {
                if (res.error) {
                    AT_RESULT.innerHTML = `<p style="overflow: hidden;">${res.error}</p>`;
                    createToast(t('toast_exe_failed'), 'red');
                    return;
                }

                AT_RESULT.innerHTML = `<p onclick="copyText(event)"  style="overflow: hidden;">${parseCGEQOSRDP(res.result)}</p>`;
                createToast(t('toast_exe_success'), 'green');
            } else {
                createToast(t('toast_exe_failed'), 'red');
            }

        } catch (err) {
            const error = err?.error || t('toast_unknow_err');
            AT_RESULT.innerHTML = `<p style="overflow: hidden;">${error}</p>`;
            createToast(t('toast_exe_failed'), 'red');
        }
    };

    const handleAT = async (params, silent = false) => {
        if (!params) return
        // 执行AT
        const AT_RESULT = document.querySelector('#AT_RESULT')
        AT_RESULT.innerHTML = t('toast_running_please_wait')
        try {
            const res = await executeATCommand(params);
            if (res) {
                if (res.error) {
                    AT_RESULT.innerHTML = `<p style="overflow: hidden;">${res.error}</p>`;
                    !silent && createToast(t('toast_exe_failed'), 'red');
                    return false
                }

                AT_RESULT.innerHTML = `<p onclick="copyText(event)"  style="overflow: hidden;">${res.result}</p>`;
                !silent && createToast(t('toast_exe_success'), 'green');
                //只要执行AT了，就默认清空一次imei展示缓存
                resetDiagImeiCache()
                return true
            } else {
                !silent && createToast(t('toast_exe_failed'), 'red');
                return false
            }
        } catch (err) {
            const error = err?.error || t('toast_unknow_err');
            AT_RESULT.innerHTML = `<p style="overflow: hidden;">${error}</p>`;
            !silent && createToast(t('toast_exe_failed'), 'red');
            return false
        }
    }

    //执行时禁用按钮
    const disableButtonWhenExecuteFunc = async (e, func) => {
        const target = e.currentTarget
        target.setAttribute("disabled", "true");
        target.style.opacity = '.5'
        try {
            if (func) {
                await func()
            }
        } finally {
            target.removeAttribute("disabled");
            target.style.opacity = ''
        }
    }

    const socatAlive = async () => {
        let res = await checkAdvancedFunc()
        if (res) {
            let smb = document.querySelector('#SMB')
            smb && (smb.style.display = 'none')
        }
        const socat_status = document.querySelectorAll('.socat_status')
        if (socat_status) {
            socat_status.forEach(item => {
                item.innerHTML = res ? `${t('advanced')}：🟢 ${t('advanced_tools_on')}` : `${t('advanced')}：🔴 ${t('advanced_tools_off')}`
            })
        }
    }
    socatAlive()

    let socatTimerFn = null

    //初始化高级功能按钮
    let initAdvanceTools = async () => {
        const el = document.querySelector('#ADVANCE')
        if (!(await initRequestData()) || !el) {
            el.onclick = () => createToast(t('toast_please_login'), 'red')
            el.style.backgroundColor = 'var(--dark-btn-disabled-color)'
            return null
        }
        el.style.backgroundColor = ''
        el.onclick = () => {
            showModal('#advanceModal')
            //循环检测是否开启socat
            socatAlive()
            socatTimerFn && socatTimerFn()
            socatTimerFn = requestInterval(() => socatAlive(), 1000)
        }
    }
    initAdvanceTools()

    const closeAdvanceToolsModal = () => {
        socatTimerFn && socatTimerFn()
        closeModal('#advanceModal')
    }

    //执行高级功能更改 1为启用0为禁用
    const handleSambaPath = async (flag = '1') => {
        const AT_RESULT = document.querySelector('#AD_RESULT')
        // let adb_status = await adbKeepAlive()
        // if (!adb_status) {
        //     AT_RESULT.innerHTML = ""
        //     return createToast(t('toast_ADB_not_init'), 'red')
        // }

        AT_RESULT.innerHTML = t('toast_running_please_wait')

        if (flag == '1') {
            try {
                const cookie = await login()
                if (cookie) {
                    await (await postData(cookie, {
                        goformId: 'SAMBA_SETTING',
                        samba_switch: '1'
                    })).json()
                }
                await initSMBStatus()
            } catch { }
        }
        try {
            const res = await (await fetch(`${KANO_baseURL}/smbPath?enable=${flag}`, { headers: common_headers })).json()
            if (res) {
                if (res.error) {
                    AT_RESULT.innerHTML = res.error;
                    createToast(t('toast_exe_failed'), 'red');
                    return;
                }
                AT_RESULT.innerHTML = res.result;
                createToast(t('toast_exe_done'), 'green');
            } else {
                AT_RESULT.innerHTML = '';
                createToast(t('toast_exe_failed'), 'red');
            }
        } catch (e) {
            AT_RESULT.innerHTML = '';
            createToast(t('toast_exe_failed'), 'red');
        }
    }

    //更改口令
    initChangeTokenData = async () => {
        const el = document.querySelector("#CHANGETOKEN")
        if (!(await initRequestData()) || !el) {
            el.onclick = () => createToast(t('toast_please_login'), 'red')
            el.style.backgroundColor = 'var(--dark-btn-disabled-color)'
            return null
        }
        el.style.backgroundColor = ''
        el.onclick = async () => {
            showModal('#changeTokenModal')
        }
    }
    initChangeTokenData()

    //更改口令
    const handleChangeToken = async (e) => {
        e.preventDefault()
        const form = e.target
        const formData = new FormData(form);
        const newToken = formData.get('newToken')
        const confirmToken = formData.get('confirmToken')
        const exp = /^(?=.*[a-zA-Z])(?=.*\d).{8,128}$/
        if (!newToken || newToken.trim() == '') return createToast(t('toast_please_input_new_token'), 'red')
        if (!confirmToken || confirmToken.trim() == '') return createToast(t('toast_please_input_new_conform_token'), 'red')
        if (newToken != confirmToken) return createToast(t('toast_token_not_eqal'), 'red')
        if (newToken.trim().length < 8) return createToast(t('toast_token_too_short'), 'red')
        if (!exp.test(newToken)) return createToast(t('toast_token_invalid'), 'red')
        try {
            try {
                const res = await (await fetchWithTimeout(`${KANO_baseURL}/set_token`, {
                    method: 'POST',
                    headers: common_headers,
                    body: JSON.stringify({
                        token: newToken.trim()
                    })
                })).json()
                if (res && res.result == 'success') {
                    createToast(t('toast_change_success'), 'green')
                    const new_token = SHA256(newToken.trim()).toLowerCase()
                    KANO_TOKEN = new_token
                    common_headers.authorization = KANO_TOKEN
                    localStorage.setItem('kano_sms_token', new_token)
                    form.reset()
                    const md = createModal({
                        name: "kano_token_confirm",
                        noBlur: true,
                        isMask: true,
                        title: t('remind_your_token'),
                        contentStyle: "font-size:12px",
                        onClose: () => {
                            return true
                        },
                        onConfirm: () => {
                            return true
                        },
                        content: `<div><p class="title" style="margin:6px 0">${t('remind_your_token_text')}</p><h1 onclick="copyText(event)" style="text-align:center">${newToken}</h1></div>`
                    })
                    closeModal('#changeTokenModal', 300, () => {
                        showModal(md.id)
                    })
                } else {
                    throw t('toast_change_failed')
                }
            } catch {
                createToast(t('toast_change_failed'), 'red')
            }
        } catch {
            createToast(t('toast_login_failed_check_network_and_pwd'), 'red')
            closeModal('#changeTokenModal')
        }
    }

    const onCloseChangeTokenForm = () => {
        const form = document.querySelector("#changeTokenForm")
        form && form.reset()
        closeModal("#changeTokenModal")
    }

    // 控制测速请求的中断器
    let speedFlag = false;
    let speedController = null; // 可重置的变量

    async function startTest(e) {
        if (!(await initRequestData())) {
            createToast(t('toast_please_login'), 'red')
            return null
        }
        if (speedFlag) {
            speedController.abort();
            createToast(t('toast_speed_test_cancel'));
            return;
        }

        speedFlag = true;
        speedController = new AbortController();
        const speedSignal = speedController.signal;

        e.target.style.backgroundColor = 'var(--dark-btn-disabled-color)';
        e.target.innerHTML = t('speedtest_stop_btn');

        const serverUrl = `${KANO_baseURL}/speedtest`;

        const ckSize = document.querySelector('#speedTestModal #ckSize').value;
        const chunkSize = !isNaN(Number(ckSize)) ? Number(ckSize) : 1000;
        const resultDiv = document.getElementById('speedtestResult');

        const url = `${serverUrl}?ckSize=${chunkSize}&cors`;
        resultDiv.textContent = t('speedtest_running_btn');

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

                if (now - lastUpdateTime >= 80) {
                    const elapsed = (now - lastUpdateTime) / 1000;
                    const speed = ((totalBytes - lastBytes) * 8 / 1024 / 1024) / elapsed;

                    resultDiv.innerHTML = `
                ${t('speedtest_testing')}<br/>
                ${t('speedtest_total_download')}: ${(totalBytes / 1024 / 1024).toFixed(2)} MB<br/>
                ${t('speedtest_current_speed')}: ${speed.toFixed(2)} Mbps
            `;

                    lastUpdateTime = now;
                    lastBytes = totalBytes;
                }
            }

            const totalTime = (performance.now() - startTime) / 1000;
            const avgSpeed = ((totalBytes * 8) / 1024 / 1024) / totalTime;

            resultDiv.innerHTML += `
        <br/>✅ ${t('speedtest_done')}<br/>
        ${t('speedtest_total_time')}: ${totalTime.toFixed(2)} ${t('unit_seconds')}<br/>
        ${t('speedtest_avg_speed')}: ${avgSpeed.toFixed(2)} Mbps
    `;
        } catch (err) {
            if (err.name === 'AbortError') {
                resultDiv.innerHTML += `<br/>⚠️ ${t('speedtest_aborted')}`;
            } else {
                resultDiv.innerHTML = `❌ ${t('speedtest_failed')}: ${err.message}`;
            }
        } finally {
            speedFlag = false;
            e.target.innerHTML = t('speedtest_start_btn');
            e.target.style.backgroundColor = '';
        }
    }

    //无限测速
    let loopSpeedTestTimer = null;
    const handleLoopMode = async (e) => {
        if (!(await initRequestData())) {
            createToast(t('please_login'), 'red');
            return null;
        }

        const speedTestButton = document.querySelector('#startSpeedBtn');
        const isStarting = e.target.innerHTML === t('loop_mode_start');

        if (isStarting) {
            e.target.innerHTML = t('loop_mode_stop');
            loopSpeedTestTimer && loopSpeedTestTimer();
            loopSpeedTestTimer = requestInterval(() => {
                if (speedTestButton && speedTestButton.innerHTML === t('speedtest_start')) {
                    speedTestButton.click();
                }
            }, 10);
        } else {
            loopSpeedTestTimer && loopSpeedTestTimer();
            if (speedTestButton && speedTestButton.innerHTML === t('speedtest_stop')) {
                speedTestButton.click();
            }
            e.target.innerHTML = t('loop_mode_start');
        }
    };

    //文件上传
    const handleFileUpload = async (event) => {
        const file = event.target.files[0];
        const MAX_SIZE = 10
        if (file) {
            // 检查文件大小
            if (file.size > MAX_SIZE * 1024 * 1024) {
                // MAX_SIZE MB
                createToast(`${t('toast_file_size_over_limit')}${MAX_SIZE}MB！`, 'red')
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
                        localStorage.setItem('backgroundUrl', url)
                        document.querySelector('#isCheckedBG').checked = true
                        BG.style.backgroundImage = `url(${url})`
                        createToast(t('toast_upload_success'), 'green')
                    }
                    else throw res.error || ''
                }
                catch (e) {
                    console.log(e);
                    createToast(t('toast_upload_failed'), 'red')
                } finally {
                    document.querySelector('#fileUploader').value = ''
                }
            }
        }
    }

    //打赏模态框设置
    const payModalState = localStorage.getItem('hidePayAndGroupModal') || false
    !payModalState && window.addEventListener('load', () => {
        setTimeout(() => {
            showModal('#payModal')
        }, 300);
    })

    const onClosePayModal = () => {
        closeModal('#payModal')
        localStorage.setItem('hidePayAndGroupModal', 'true')
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

    // 配置观察器_锁基站
    collapseGen("#collapse_lkcell_btn", "#collapse_lkcell", "collapse_lkcell", (isOpen) => {
        if (isOpen == 'open') {
            toggleLkcellOpen(true)
        } else {
            toggleLkcellOpen(false)
        }
    })

    //展开收起
    const collapse_lkcell_stor = localStorage.getItem('collapse_lkcell') || 'open'
    collapse_lkcell_stor == 'open' ? toggleLkcellOpen(true) : toggleLkcellOpen(false)

    //软件更新
    const queryUpdate = async () => {
        return null

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
        return null

        // const changelogTextContent = document.querySelector('#ChangelogTextContent')
        // changelogTextContent.innerHTML = ''
        const OTATextContent = document.querySelector('#OTATextContent')
        try {
            OTATextContent.innerHTML = `<div>📦 ${t('install_ing')}</div>`
            const _res = await fetch(`${KANO_baseURL}/install_apk`, {
                method: 'POST',
                headers: {
                    ...common_headers,
                }
            })
            const res = await _res.json()
            if (res && res.error) throw new Error(t('install_failed') + ': ' + res.error)
            const res_text = res.result == 'success' ? '✅ ' + t('install_success_refresh') : '❌ ' + t('install_fail_reboot')
            OTATextContent.innerHTML = `<div>${res_text}</div><div>${res.result != 'success' ? res.result : ''}</div>`
        } catch (e) {
            createToast(t('install_done'), 'green')
            let res_text = '✅ ' + t('install_success_refresh')
            console.log(e.message);
            if (e.message.includes(t('install_failed'))) {
                res_text = `❌ ${t('install_failed')}，${t('reason')}${e.message.replace(t('install_failed'), '')}，${t('error_please_reboot_devices')}`
            }
            OTATextContent.innerHTML = `<div>${res_text}</div></div>`
        } finally {
            initUpdateSoftware()
        }
    }

    //立即更新
    let updateSoftwareInterval = null
    const handleUpdateSoftware = async (url) => {
        return null

        updateSoftwareInterval && updateSoftwareInterval()
        if (!url || url.trim() == "") return
        const doUpdateEl = document.querySelector('#doUpdate')
        const closeUpdateBtnEl = document.querySelector('#closeUpdateBtn')
        const updateSoftwareModal = document.querySelector('#updateSoftwareModal')

        doUpdateEl.innerHTML = t('one_click_update')

        // 是否启用高级功能
        const isEnabledAdvanceFunc = await checkAdvancedFunc()

        if (!isEnabledAdvanceFunc) {
            let adb_status = await adbKeepAlive()
            if (!adb_status) {
                return createToast(t('adb_not_init'), 'red')
            }
        } else {
            createToast(t('advanced_install'))
            doUpdateEl.innerHTML = t('fast_installing')
        }

        // 更新时禁用按钮
        doUpdateEl && (doUpdateEl.onclick = null)
        doUpdateEl && (doUpdateEl.style.backgroundColor = 'var(--dark-btn-disabled-color)')
        closeUpdateBtnEl && (closeUpdateBtnEl.onclick = null)
        closeUpdateBtnEl && (closeUpdateBtnEl.style.backgroundColor = 'var(--dark-btn-disabled-color)')
        updateSoftwareModal && (updateSoftwareModal.onclick = null)
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
            createToast(t('download_request_failed'), 'red')
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
                if (res && res.error == 'error') throw t('download_failed')
                const status = res.status == "idle" ? `🕒 ${t("download_waiting")}` : res.status == "downloading" ? `🟢 ${t('download_ing')}` : res.status == "done" ? `✅ ${t('download_success')}` : `❌ ${t('download_failed')}`
                OTATextContent.innerHTML = `<div>🔄 ${t('donwload_ing_ota')}...<br/>${t('download_status')}：${status}<br/>📁 ${t('download_progress')}：${res?.percent}%<br/></div>`
                if (res.percent == 100) {
                    updateSoftwareInterval && updateSoftwareInterval()
                    createToast(t('toast_download_success_install'), 'green')
                    // 执行安装
                    requestInstallUpdate()
                }
            } catch (e) {
                OTATextContent.innerHTML = t('toast_download_failed_network')
                updateSoftwareInterval && updateSoftwareInterval()
                initUpdateSoftware()
            }
        }, 500)
    }

    //仅下载更新包到本地
    const handleDownloadSoftwareLink = async (fileLink) => {
        createToast(t('toast_download_start'), 'green')
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
        return null
        const changelogTextContent = document.querySelector('#ChangelogTextContent')
        const OTATextContent = document.querySelector('#OTATextContent')
        OTATextContent.innerHTML = t('checking_update')
        !silent && (changelogTextContent.innerHTML = '')
        !silent && showModal('#updateSoftwareModal')
        !silent && (socatAlive())

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

                if (!silent) {
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
                            doUpdateEl.style.backgroundColor = 'var(--dark-btn-disabled-color)'
                            doDownloadAPKEl.style.backgroundColor = 'var(--dark-btn-disabled-color)'
                        }
                        //有强制更新字段，允许更新
                        if (window.UFI_FORCE_ENABLE_UPDATE) {
                            window.UFI_FORCE_ENABLE_UPDATE = false
                            doUpdateEl.style.backgroundColor = 'var(--dark-btn-color)'
                            doDownloadAPKEl.style.backgroundColor = 'var(--dark-btn-color)'
                            doUpdateEl.onclick = () => handleUpdateSoftware(base_uri + name)
                            doDownloadAPKEl.onclick = () => handleDownloadSoftwareLink(base_uri + name)
                        }
                    }
                    //获取changeLog
                    // if (!isLatest) {
                    changelogTextContent.innerHTML = changelog
                    // }
                    OTATextContent.innerHTML = `${isLatest ? `<div>${t('is_latest_version')}：V${app_ver} ${app_ver_code}</div>` : `<div>${t('found_update')}:${name}<br/>${date_str ? `${t('release_date')}：${date_str}` : ''}</div>`}`

                }
                return !isLatest ? {
                    isForceUpdate: name.includes('force'),
                    text: version + ' ' + date_str
                } : null

            } else {
                throw new Error(t('error'))
            }
        } catch (e) {
            !silent && (OTATextContent.innerHTML = `${t('connect_update_server_failed')}<br>${e.message ? e.message : ''}`)
            return null
        }
    }

    const initUpdateSoftware = async () => {
        return

        const changelogTextContent = document.querySelector('#ChangelogTextContent')
        changelogTextContent.innerHTML = ''
        const btn = document.querySelector('#OTA')
        if (!btn) return
        const closeUpdateBtnEl = document.querySelector('#closeUpdateBtn')
        closeUpdateBtnEl && (closeUpdateBtnEl.onclick = () => closeModal('#updateSoftwareModal'))
        closeUpdateBtnEl && (closeUpdateBtnEl.style.backgroundColor = 'var(--dark-btn-color)')

        if (!(await initRequestData())) {
            btn.onclick = () => createToast(t('toast_please_login'), 'red')
            btn.style.backgroundColor = 'var(--dark-btn-disabled-color)'
            return null
        }
        btn.style.backgroundColor = 'var(--dark-btn-color)'
        btn.onclick = async () => {
            const btn = document.querySelector('#OTA')
            if (!(await initRequestData())) {
                btn.onclick = () => createToast(t('toast_please_login'), 'red')
                btn.style.backgroundColor = 'var(--dark-btn-disabled-color)'
                return null
            }
            checkUpdateAction()
        }
    }
    initUpdateSoftware()

    //adb轮询
    async function adbQuery() {
        try {
            const adb_status = await adbKeepAlive()
            const adb_text = adb_status ? `${t('network_adb_status')}：🟢 ${t('adb_status_active')}` : `${t('network_adb_status')}：🟡 ${t('adb_status_waiting')}`
            const version = window.UFI_DATA && window.UFI_DATA.cr_version ? window.UFI_DATA.cr_version : ''
            const adbSwitch = window.UFI_DATA && window.UFI_DATA.usb_port_switch == '1' ? true : false
            const adbStatusEl = document.querySelectorAll('.adb_status')
            if (adbStatusEl && adbStatusEl.length > 0) {
                adbStatusEl.forEach((item) => {
                    try {
                        item.innerHTML = adb_text + `<br/>${t('usb_debugging_status')}：${adbSwitch ? `🟢 ${t('usb_debugging_active')}` : `🔴 ${t('usb_debugging_inactive')}`}` + `<br/>${t('firmware_version')}：${version}`
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
            return createToast(t('toast_ADB_not_init'), 'red')
        }

        AT_RESULT.innerHTML = t('toast_running_please_wait')

        try {
            const res = await (await fetch(`${KANO_baseURL}/one_click_shell`, {
                headers: common_headers
            })).json()
            if (res) {
                if (res.error) {
                    AT_RESULT.innerHTML = res.error;
                    createToast(t('toast_exe_failed'), 'red');
                    return;
                }
                AT_RESULT.innerHTML = res.result;
                createToast(t('toast_exe_done'), 'green');
            } else {
                AT_RESULT.innerHTML = '';
                createToast(t('toast_exe_failed'), 'red');
            }
        } catch (e) {
            AT_RESULT.innerHTML = '';
            createToast(t('toast_exe_failed'), 'red');
        }

    }

    //开屏后检测更新
    setTimeout(() => {
        checkUpdateAction(true).then((res) => {
            if (res) {
                const { el, close } = createFixedToast('kano_new_ota', `
                <div style="pointer-events:all;width:80vw;max-width:300px;">
                <div class="title" style="margin:0" data-i18n="system_notice">${t('system_notice')}</div>
                <div class="title" id="force_update_title" style="margin-top:10px;font-size:.6rem"><i data-i18n="force_update_desc">${t("force_update_desc")}</i></div>
                <p>${`${t('found')} ${res.isForceUpdate ? t('sticky_update') : t('new_update')}：${res.text}`}</p>
                <div style="display:flex;gap:10px">
                    <button id="confirm_kano_new_ota_toast_btn" style="width:100%;font-size:.64rem;margin-top:5px" data-i18n="btn_update">${t("btn_update")}</button>
                    <button id="close_kano_new_ota_toast_btn" style="width:100%;font-size:.64rem;margin-top:5px" data-i18n="cancel_btn">${t("cancel_btn")}(8)</button>
                </div>
                </div>
                `, 'red')
                const confirmBtn = el.querySelector("#confirm_kano_new_ota_toast_btn")
                const closeBtn = el.querySelector("#close_kano_new_ota_toast_btn")
                const forceUpdateTitle = el.querySelector("#force_update_title")

                if (forceUpdateTitle) {
                    forceUpdateTitle.style.display = res.isForceUpdate ? "" : "none"
                }

                if (confirmBtn) {
                    let debounceTimer = null
                    confirmBtn.onclick = () => {
                        close()
                        clearTimeout(debounceTimer)
                        debounceTimer = setTimeout(() => {
                            checkUpdateAction()
                        }, 500);
                    }
                }
                if (closeBtn) {
                    let times = 7
                    let interval = setInterval(() => {
                        closeBtn.textContent = `${t("cancel_btn")}(${times--})`
                        if (times < 0) {
                            clearInterval(interval)
                            close()
                        }
                    }, 1000);
                    closeBtn.onclick = () => {
                        close()
                    }
                }
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
            const { smtp_host, smtp_port, smtp_username, smtp_password, smtp_to, forward_dev_info } = data
            const smtpHostEl = document.querySelector('#smtp_host')
            const smtpPortEl = document.querySelector('#smtp_port')
            const smtpToEl = document.querySelector('#smtp_to')
            const smtpUsernameEl = document.querySelector('#smtp_username')
            const smtpPasswordEl = document.querySelector('#smtp_password')
            const forwardDevInfoEl = document.querySelector('#smsForwardForm input[name="forward_dev_info"]')
            forwardDevInfoEl.checked = forward_dev_info == "1"
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
        } else if (method.toLowerCase() == 'dingtalk') {
            //获取模态框数据
            const data = await (await fetch(`${KANO_baseURL}/sms_forward_dingtalk`, {
                method: 'GET',
                headers: common_headers
            })).json()
            const { webhook_url, secret, forward_dev_info } = data
            const webhookEl = document.querySelector('#dingtalk_webhook')
            const secretEl = document.querySelector('#dingtalk_secret')
            const forwardDevInfoEl = document.querySelector('#smsForwardDingTalkForm input[name="forward_dev_info"]')
            forwardDevInfoEl.checked = forward_dev_info == "1"
            webhookEl.value = webhook_url || ''
            secretEl.value = secret || ''
            needSwitch && switchSmsForwardMethodTab({ target: document.querySelector('#dingtalk_btn') })
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
        const smsForwardDingTalkForm = document.querySelector('#smsForwardDingTalkForm')
        switch (method.toLowerCase()) {
            case 'smtp':
                smsForwardForm.style.display = 'block'
                smsForwardCurlForm.style.display = 'none'
                smsForwardDingTalkForm.style.display = 'none'
                break
            case 'curl':
                smsForwardForm.style.display = 'none'
                smsForwardCurlForm.style.display = 'block'
                smsForwardDingTalkForm.style.display = 'none'
                break
            case 'dingtalk':
                smsForwardForm.style.display = 'none'
                smsForwardCurlForm.style.display = 'none'
                smsForwardDingTalkForm.style.display = 'block'
                break
            default:
                smsForwardForm.style.display = 'block'
                smsForwardCurlForm.style.display = 'none'
                smsForwardDingTalkForm.style.display = 'none'
                break
        }
        initSmsForward(false, method)
        return method.toLowerCase()
    }

    // 短信转发-电源转发开关
    const collapse_smsforward_power_status_btn = document.querySelector('#collapse_smsforward_power_status_btn')
    const collapse_smsforward_power_status_btn_component = createSwitch({
        value: false,
        onChange: async (checked) => {
            if (checked != undefined) {
                try {
                    await (await fetch(`${KANO_baseURL}/power_status_forward_enabled?enable=${checked ? "1" : "0"}`, {
                        method: 'post',
                        headers: {
                            ...common_headers,
                            'Content-Type': 'application/json'
                        }
                    })).json()
                    createToast(`${t('power_status_forward')} ${checked ? t('enabled') : t('disabled')}`, 'green')
                } catch (e) {
                    createToast(t('toast_oprate_failed'), 'red')
                }
            }
        }
    })
    if (collapse_smsforward_power_status_btn && collapse_smsforward_power_status_btn_component) {
        collapse_smsforward_power_status_btn.appendChild(collapse_smsforward_power_status_btn_component)
    }

    //初始化短信转发模态框
    const initSmsForwardModal = async () => {
        const btn = document.querySelector('#smsForward')
        if (!btn) return null
        if (!(await initRequestData())) {
            btn.onclick = () => createToast(t('toast_please_login'), 'red')
            btn.style.backgroundColor = 'var(--dark-btn-disabled-color)'
            return null
        }
        btn.style.backgroundColor = 'var(--dark-btn-color)'
        btn.onclick = async () => {
            initSmsForward()
            initSmsForwardSwitch().then(async () => {
                showModal('#smsForwardModal')
                if (collapse_smsforward_power_status_btn_component) {
                    try {
                        const { enabled } = await (await fetch(`${KANO_baseURL}/power_status_forward_enabled`, {
                            method: 'GET',
                            headers: common_headers
                        })).json()
                        collapse_smsforward_power_status_btn_component.update(enabled == "1")
                    } catch (e) {
                        console.error("power_status_forward_enabled request failed", e)
                    }
                }
            })
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
        const forward_dev_info = formData.get('forward_dev_info') != null


        if (!smtp_host || smtp_host.trim() == '') return createToast(t('toast_please_input_smtp_host'), 'red')
        if (!smtp_port || smtp_port.trim() == '') return createToast(t('toast_please_input_smtp_port'), 'red')
        if (!smtp_username || smtp_username.trim() == '') return createToast(t('toast_please_input_smtp_username'), 'red')
        if (!smtp_password || smtp_password.trim() == '') return createToast(t('toast_please_input_smtp_pwd'), 'red')
        if (!smtp_to || smtp_to.trim() == '') return createToast(t('toast_please_input_smtp_receive'), 'red')

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
                    smtp_to: smtp_to.trim(),
                    forward_dev_info: forward_dev_info ? "1" : "0"
                })
            })).json()
            if (res.result == 'success') {
                createToast(t('toast_smtp_test_mail'), 'green')
                // form.reset()
                // closeModal('#smsForwardModal')
            } else {
                if (res.error) {
                    createToast(res.error, 'red')
                } else {
                    createToast(t('toast_set_failed'), 'red')
                }
            }
        }
        catch (e) {
            createToast(t('toast_request_failed'), 'red')
            return
        }
    }

    const handleSmsForwardCurlForm = async (e) => {
        e.preventDefault()
        const form = e.target
        const formData = new FormData(form);
        const curl_text = formData.get('curl_text')

        if (!curl_text || curl_text.trim() == '') return createToast(t('toast_please_input_curl'), 'red')

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
                createToast(t('toast_curl_test_msg'), 'green')
                // form.reset()
                // closeModal('#smsForwardModal')
            } else {
                if (res.error) {
                    createToast(res.error, 'red')
                } else {
                    createToast(t('toast_set_failed'), 'red')
                }
            }
        }
        catch (e) {
            createToast(t('toast_request_failed'), 'red')
            return
        }
    }

    const handleSmsForwardDingTalkForm = async (e) => {
        console.log('钉钉表单提交事件触发')
        e.preventDefault()
        const form = e.target
        const formData = new FormData(form);
        const webhook_url = formData.get('dingtalk_webhook')
        const secret = formData.get('dingtalk_secret')
        const forward_dev_info = formData.get('forward_dev_info') != null


        console.log('钉钉表单数据:', { webhook_url, secret, forward_dev_info })

        if (!webhook_url || webhook_url.trim() == '') return createToast(t('no_dingtalk_url'), 'red')

        //请求
        try {
            const res = await (await fetch(`${KANO_baseURL}/sms_forward_dingtalk`, {
                method: 'POST',
                headers: {
                    ...common_headers,
                    'Content-Type': 'application/json;charset=UTF-8'
                },
                body: JSON.stringify({
                    webhook_url: webhook_url.trim(),
                    secret: secret.trim(),
                    forward_dev_info: forward_dev_info ? "1" : "0"
                })
            })).json()
            if (res.result == 'success') {
                createToast(t('dingtalk_test_msg_success'), 'green')
                // form.reset()
                // closeModal('#smsForwardModal')
            } else {
                if (res.error) {
                    createToast(res.error, 'red')
                } else {
                    createToast(t('toast_set_failed'), 'red')
                }
            }
        }
        catch (e) {
            createToast(t('toast_request_failed'), 'red')
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
                createToast(`${t('sms_forward')} ${status == 'open' ? t('enabled') : t('disabled')}`, 'green')
            } catch (e) {
                createToast(t('toast_oprate_failed'), 'red')
            }
        }
    })

    //短信转发规则设置
    const forwardMethodSettingBtn = document.querySelector('#forward_method_setting_btn')
    if (forwardMethodSettingBtn) {
        forwardMethodSettingBtn.onclick = async () => {
            try {
                //获取数据
                const { keywords, phone } = await (await fetch(`${KANO_baseURL}/sms_forward_blacklist`, {
                    method: 'GET',
                    headers: common_headers
                })).json()

                const { el, close } = createFixedToast('kano_sms_forward_rules_toast', `
            <div style="pointer-events:all;width:80vw;max-width:400px">
            <div class="title" style="margin:0" data-i18n="kano_sms_forward_rules_toast_title">${t('kano_sms_forward_rules_toast_title')}</div>
            <p class="title" style="margin-top:10px" data-i18n="phone_black_list">${t('phone_black_list')}</p>
            <textarea id="kano_sms_forward_rules_phone_list" style="width: 100%;box-sizing: border-box;min-height: 5em;" data-i18n-placeholder="phone_black_list_placeholder" placeholder="${t('phone_black_list_placeholder')}"></textarea>
            <p class="title" style="margin-top:10px" data-i18n="keyword_black_list">${t('keyword_black_list')}</p>
            <textarea id="kano_sms_forward_rules_keywords_list" style="width: 100%;box-sizing: border-box;min-height: 6em;" data-i18n-placeholder="keyword_black_list_placeholder" placeholder="${t('keyword_black_list_placeholder')}"></textarea>
            <div style="display:flex;gap:10px">
                <button id="confirm_forward_method_setting_btn" style="width:100%;font-size:.64rem;margin-top:5px" data-i18n="submit_btn">${t("submit_btn")}</button>
                <button id="close_forward_method_setting_btn" style="width:100%;font-size:.64rem;margin-top:5px" data-i18n="cancel_btn">${t("cancel_btn")}</button>
            </div>
            </div>
            `)
                const confirmBtn = el.querySelector("#confirm_forward_method_setting_btn")
                const closeBtn = el.querySelector("#close_forward_method_setting_btn")
                const phoneListEl = el.querySelector('#kano_sms_forward_rules_phone_list')
                const keywordsListEl = el.querySelector('#kano_sms_forward_rules_keywords_list')

                if (phoneListEl) {
                    phoneListEl.value = phone
                }

                if (keywordsListEl) {
                    keywordsListEl.value = keywords
                }

                if (confirmBtn) {
                    confirmBtn.onclick = async () => {
                        //提交
                        try {
                            if (!/^[0-9\n]*$/.test(phoneListEl.value.trim())) {
                                return createToast(t('phone_param_is_invalid'), 'pink');
                            }
                            const phoneList = phoneListEl.value.trim().split('\n')
                            const keywordsList = keywordsListEl.value.trim().split('\n')
                            const res = await (await fetch(`${KANO_baseURL}/sms_forward_blacklist`, {
                                method: 'post',
                                body: JSON.stringify({
                                    keywords: keywordsList.join('\n'),
                                    phone: phoneList.join('\n')
                                }),
                                headers: {
                                    ...common_headers,
                                    'Content-Type': 'application/json'
                                }
                            })).json()
                            if (!res.result && res.error) {
                                throw new Error(res.error)
                            }
                            if (res.result && res.result == 'success') {
                                createToast(t('toast_save_success'), 'pink')
                            }
                        } catch (e) {
                            createToast(t('toast_save_failed'), 'red')
                        }
                        close()
                    }
                }
                if (closeBtn) {
                    closeBtn.onclick = () => {
                        close()
                    }
                }
                showModal("#" + el.id)
            } catch (e) {
                createToast(t('client_mgmt_fetch_error'), 'red')
                console.error(e)
            }
        }
    }

    // OP
    const OP = (e) => {
        e.preventDefault()
        createToast(t('egg'), 'pink')
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
        if (!btn) return null
        if (!(await initRequestData())) {
            btn.onclick = () => createToast(t('toast_please_login'), 'red')
            btn.style.backgroundColor = 'var(--dark-btn-disabled-color)'
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
                    createToast(t('toast_get_lan_setting_failed'), 'red')
                }
            } catch (e) {
                createToast(t('toast_get_lan_setting_failed'), 'red')
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
                createToast(t('toast_login_failed_check_network_and_pwd'), 'red')
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
                        if (!val || !isValidIP(val)) return createToast(t('toast_please_input_correct_lanIP'), 'red');
                        data[key] = val;
                        break;
                    case 'lanNetmask':
                        if (!val || !isValidSubnetMask(val)) return createToast(t('toast_please_input_correct_subnet_mask'), 'red');
                        data[key] = val;
                        break;
                    case 'dhcpStart': {
                        if (data.lanDhcpType == 'DISABLE') break
                        if (!val || !isValidIP(val)) return createToast(t('toast_please_input_correct_start_ip'), 'red');
                        const lanIp = formData.get('lanIp')?.trim();
                        const netmask = formData.get('lanNetmask')?.trim();
                        if (!isSameSubnet(val, lanIp, netmask)) {
                            return createToast('DHCP ' + t('toast_start_ip_not_include'), 'red');
                        }

                        if (ipToInt(val) <= ipToInt(lanIp)) {
                            return createToast('DHCP ' + t('toast_start_ip_should_bigger_than_lanIP'), 'red');
                        }
                        data[key] = val;
                        break;
                    }
                    case 'dhcpEnd': {
                        if (data.lanDhcpType == 'DISABLE') break
                        if (!val || !isValidIP(val)) return createToast(t('toast_invalid_end_ip'), 'red');
                        const start = formData.get('dhcpStart')?.trim();
                        const lanIp = formData.get('lanIp')?.trim();
                        const netmask = formData.get('lanNetmask')?.trim();

                        if (!isSameSubnet(val, lanIp, netmask)) {
                            return createToast('DHCP ' + t('toast_end_ip_not_in_subnet'), 'red');
                        }

                        if (start === val) return createToast(t('toast_start_equals_end_ip'), 'red');
                        if (ipToInt(start) > ipToInt(val)) return createToast(t('toast_start_greater_than_end_ip'), 'red');
                        data[key] = val;
                        break;
                    }
                    case 'dhcpLease':
                        if (data.lanDhcpType == 'DISABLE') break
                        if (Number(val) <= 0) return createToast(t('toast_invalid_lease_time'), 'red');
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
                    return createToast(t('toast_gateway_is_network_or_broadcast'), 'red');
                }

                // DHCP 起始或结束地址不能是网络地址或广播地址
                if (dhcpStart === networkAddr || dhcpStart === broadcastAddr) {
                    return createToast('DHCP ' + t('toast_start_ip_is_network_or_broadcast'), 'red');
                }

                if (dhcpEnd === networkAddr || dhcpEnd === broadcastAddr) {
                    return createToast('DHCP ' + t('toast_end_ip_is_network_or_broadcast'), 'red');
                }

                // 网关地址不能落在 DHCP 分配范围内
                const lanInt = ipToInt(lanIp);
                const startInt = ipToInt(dhcpStart);
                const endInt = ipToInt(dhcpEnd);
                if (lanInt >= startInt && lanInt <= endInt) {
                    return createToast(t('toast_gateway_in_dhcp_range'), 'red');
                }
            }

            const res = await (await postData(cookie, {
                goformId: 'DHCP_SETTING',
                ...data
            })).json()

            if (res.result == 'success') {
                createToast(t('toast_set_success_reboot'), 'green')
                closeModal('#LANManagementModal')
                setTimeout(() => {
                    //循环等待
                    let newURL = 'http://' + data.lanIp + ':2333'
                    window.location.href = newURL
                }, 30000);
            } else {
                throw t('toast_set_failed')
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
            createToast(t('toast_current_refresh_rate') + "：" + (value / 1000).toFixed(2) + "S")
            //保存
            localStorage.setItem("refreshRate", value)
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
        result.success ? createToast(t('toast_exe_success'), 'green') : createToast(t('toast_exe_failed'), 'red')

        AD_RESULT.innerHTML = result.content

    }

    //定时任务管理
    const clearAddTaskForm = () => {
        const form = document.querySelector('#AddTaskForm')
        form.id.value = '' // 清空ID
        form.id.disabled = false // 允许修改 ID
        form.date_time.value = '' // 清空时间
        form.repeatDaily.checked = false // 清空复选框
        form.action.value = '' // 清空动作参数
    }
    const setAddTaskForm = (task) => {
        const form = document.querySelector('#AddTaskForm')
        form.id.value = task.id
        form.id.disabled = true
        form.date_time.value = task.time
        form.repeatDaily.checked = task.repeatDaily
        form.action.value = JSON.stringify(task.actionMap || {}, null, 2)
    }

    const initScheduledTask = async () => {
        const btn = document.querySelector('#ScheduledTaskManagement')
        if (!btn) return null
        if (!(await initRequestData())) {
            btn.onclick = () => createToast(t('toast_please_login'), 'red')
            btn.style.backgroundColor = 'var(--dark-btn-disabled-color)'
            return null
        }
        btn.style.backgroundColor = 'var(--dark-btn-color)'
        btn.onclick = async () => {
            showModal('#ScheduledTasksModal')
            handleInitialScheduledTasks()
        }
    }
    initScheduledTask()

    function appendTaskToList(task) {
        const SCHEDULED_TASK_LIST = document.querySelector('#SCHEDULED_TASK_LIST')
        const li = document.createElement('li')
        li.style.marginBottom = '10px'
        li.style.padding = '0 10px'
        li.style.boxSizing = 'border-box'
        li.style.width = '100%'
        li.style.overflow = 'hidden'

        li.innerHTML = `
    <div style="background: none;display: flex;width: 100%;margin-top: 10px;overflow: auto;" class="card-item">
      <div style="flex:1;margin-right: 10px;">
        <p><span>${t('task_name_label')}</span><span>${task.id}</span></p>
        <p><span>${t('trigger_time_label')}</span><span>${task.time}</span></p>
        <p><span>${t('last_exe')}</span><span>${task.lastRunTimestamp ? (new Date(task.lastRunTimestamp).toLocaleString('zh-cn').replaceAll('/', '-')) : t('not_exec')}${task.hasTriggered ? `（${t('exec_ed')}）` : ""}</span></p>
        <p><span>${t('repeat_daily_label')}</span><span>${task.repeatDaily ? t('yes') : t('no')}</span></p>
        <p><span>${t('action_param')}:</span></p>
        <p class="text_Area"></p>
      </div>
    </div>
    <div style="padding-bottom:10px;text-align: right;">
      <button class="btn editBtn" style="margin: 2px;padding: 4px 6px;" onclick="editTask('${task.id}')">${t('edit')}</button>
      <button class="btn deleteBtn" style="margin: 2px;padding: 4px 6px;">${t('delete')}</button>
    </div>
  `

        const textarea = document.createElement('textarea')
        textarea.disabled = true
        textarea.style.width = '100%'
        textarea.style.fontSize = '12px'
        textarea.style.padding = '6px'
        textarea.rows = 6
        textarea.value = JSON.stringify(task.actionMap || {}, null, 2)
        li.querySelector('.text_Area').appendChild(textarea)

        let timer = null
        let counter = 0
        // 删除功能
        li.querySelector('.deleteBtn').onclick = async () => {
            timer && clearTimeout(timer)
            timer = setTimeout(() => {
                li.querySelector('.deleteBtn').innerHTML = t('delete')
                counter = 0
            }, 1000)
            li.querySelector('.deleteBtn').innerHTML = t('are_you_conform')
            counter += 1
            if (counter >= 2) {
                try {
                    const res = await fetchWithTimeout(`${KANO_baseURL}/remove_task`, {
                        method: 'POST',
                        headers: {
                            ...common_headers,
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify({ id: task.id })
                    })
                    const json = await res.json()
                    if (json.result === 'removed') {
                        createToast(t('toast_delete_success'), 'green')
                        handleInitialScheduledTasks()
                    } else {
                        createToast(t('toast_delete_failed'), 'red')
                    }
                } catch (e) {
                    console.error(e)
                    createToast(t('toast_opration_failed_network'), 'red')
                }
            }
        }

        SCHEDULED_TASK_LIST.appendChild(li)
    }

    const handleInitialScheduledTasks = async () => {
        const SCHEDULED_TASK_LIST = document.querySelector('#SCHEDULED_TASK_LIST')
        SCHEDULED_TASK_LIST.innerHTML = `<li style="backdrop-filter: none;padding-top: 15px;background:transparent;">
            <strong class="green" style="background:transparent;margin: 10px auto;margin-top: 0; display: flex;flex-direction: column;padding: 40px;">
                <span style="font-size: 50px;" class="spin">🌀</span>
                <span style="font-size: 16px;padding-top: 10px;">loading...</span>
            </strong>
        </li>`
        try {
            const res = await (await fetchWithTimeout(`${KANO_baseURL}/list_tasks`, {
                method: 'GET',
                headers: common_headers
            })).json()
            if (res && res.tasks && res.tasks.length > 0) {
                SCHEDULED_TASK_LIST.innerHTML = ''
                //倒转
                res.tasks.reverse().forEach((task) => {
                    appendTaskToList(task)
                })
            } else {
                SCHEDULED_TASK_LIST.innerHTML = `<li style="padding:10px">${t('no_scheduled_tasks')}</li>`
            }
        }
        catch (e) {
            console.error(e)
            createToast(t('load_scheduled_task_failed_network'), 'red')
            SCHEDULED_TASK_LIST.innerHTML = ''
            return
        }
    }

    //添加定时任务
    const handleSubmitTask = async (e) => {
        e.preventDefault()
        const form = e.target
        const data = {
            id: form.id.value.trim(),
            time: form.date_time.value.trim(),
            repeatDaily: form.repeatDaily.checked,
            action: {}
        }

        try {
            data.action = form.action.value.trim()
                ? JSON.parse(form.action.value.trim())
                : {}
        } catch (e) {
            return createToast(t('toast_is_not_valid_json'), 'red')
        }

        try {
            const res = await fetchWithTimeout(`${KANO_baseURL}/add_task`, {
                method: 'POST',
                headers: {
                    ...common_headers,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(data)
            })

            const json = await res.json()
            if (json.result === 'success') {
                createToast(t('toast_save_success'), 'green')
                closeModal('#AddTaskModal', 300, () => {
                    showModal("#ScheduledTasksModal")
                })
                handleInitialScheduledTasks()

                //清除字段
                form.id.value = ''
                form.date_time.value = ''
                form.repeatDaily.checked = false
                form.action.value = ''
            } else {
                createToast(t('toast_add_failed'), 'red')
            }
        } catch (e) {
            console.error(e)
            createToast(t('toast_network_error'), 'red')
        }
    }

    const addTask = () => {
        clearAddTaskForm()
        showModal('#AddTaskModal')
    }

    const refreshTask = () => {
        handleInitialScheduledTasks()
    }

    const editTask = (id) => {
        closeModal("#ScheduledTasksModal", 300, async () => {
            clearAddTaskForm()
            const form = document.querySelector('#AddTaskForm')
            form.id.value = id
            //拿取最新数据
            try {
                const res = await fetchWithTimeout(`${KANO_baseURL}/get_task?id=${id}`, {
                    headers: {
                        ...common_headers,
                        'Content-Type': 'application/json'
                    },
                })
                const json = await res.json()
                //预填充表单
                setAddTaskForm(json)
                form.id.disabled = true // 禁止修改 ID
                setTimeout(() => {
                    showModal('#AddTaskModal')
                }, 100);
            } catch (e) {
                console.error(e)
                createToast(t('toast_request_error'), 'red')
            }
        })
    }

    const closeAddTask = () => {
        closeModal('#AddTaskModal', 300, () => {
            showModal("#ScheduledTasksModal")
            clearAddTaskForm()
        })
    }

    const fillAction = async (e, actionName) => {
        e.preventDefault()
        //动作列表
        const actionList = {
            "转发设备信息": {
                "kano_do_sms_forward_action": "1"
            },
            "发送短信": {
                "goformId": "SEND_SMS",
                "Number": t("phone_number"),
                "MessageBody": `"${t("sms_content")}"`
            },
            "指示灯": {
                "goformId": "INDICATOR_LIGHT_SETTING",
                "indicator_light_switch": `${t('one_or_zero_prompt')}`
            },
            "NFC": {
                goformId: 'WIFI_NFC_SET',
                web_wifi_nfc_switch: `${t('one_or_zero_prompt')}`
            },
            "文件共享": {
                goformId: 'SAMBA_SETTING',
                samba_switch: `${t('one_or_zero_prompt')}`
            },
            "网络漫游": {
                goformId: 'SET_CONNECTION_MODE',
                ConnectionMode: "auto_dial",
                roam_setting_option: `${t('on_or_off_prompt')}`,
                dial_roam_setting_option: `${t('on_or_off_prompt')}`
            },
            "性能模式": {
                goformId: 'PERFORMANCE_MODE',
                performance_mode: `${t('one_or_zero_prompt')}`
            },
            "USB调试": {
                goformId: 'USB_PORT_SETTING',
                usb_port_switch: `${t('one_or_zero_prompt')}`
            },
            "打开数据": {
                goformId: 'CONNECT_NETWORK',
            },
            "关闭数据": {
                goformId: 'DISCONNECT_NETWORK',
            },
            "关闭WIFI": {
                goformId: 'switchWiFiModule',
                SwitchOption: 0
            },
            "开启WIFI(5G)": {
                goformId: 'switchWiFiChip',
                ChipEnum: 'chip2',
                GuestEnable: 0
            },
            "开启WIFI(2.4G)": {
                goformId: 'switchWiFiChip',
                ChipEnum: 'chip1',
                GuestEnable: 0
            },
            "5G/4G/3G": {
                goformId: 'SET_BEARER_PREFERENCE',
                BearerPreference: 'WL_AND_5G'
            },
            "5G NSA": {
                goformId: 'SET_BEARER_PREFERENCE',
                BearerPreference: 'LTE_AND_5G'
            },
            "5G SA": {
                goformId: 'SET_BEARER_PREFERENCE',
                BearerPreference: 'Only_5G'
            },
            "仅4G": {
                goformId: 'SET_BEARER_PREFERENCE',
                BearerPreference: 'Only_LTE'
            },
            "关机": {
                goformId: 'SHUTDOWN_DEVICE'
            },
            "重启": {
                goformId: 'REBOOT_DEVICE'
            },
            "解锁基站": {
                goformId: 'UNLOCK_ALL_CELL'
            },
            "锁基站": {
                goformId: 'CELL_LOCK',
                pci: "912",
                earfcn: "504990",
                rat: `${t('cell_lock_prompt')}`
            },
            "切SIM卡1": {
                goformId: 'SET_SIM_SLOT',
                sim_slot: 0
            },
            "切SIM卡2": {
                goformId: 'SET_SIM_SLOT',
                sim_slot: 1
            },
            "切移动": {
                goformId: 'SET_SIM_SLOT',
                sim_slot: 0
            },
            "切联通": {
                goformId: 'SET_SIM_SLOT',
                sim_slot: 2
            },
            "切电信": {
                goformId: 'SET_SIM_SLOT',
                sim_slot: 1
            },
            "切外置": {
                goformId: 'SET_SIM_SLOT',
                sim_slot: 11
            }
        }
        const taskAction = document.querySelector('#taskAction')
        if (!taskAction) return
        const action = actionList[actionName]
        if (action) {
            if (actionName == "发送短信") {
                if (!action.MessageBody) return
                const { el, close } = createFixedToast('kano_sms_body', `
                <div style="pointer-events:all;width:80vw;max-width:300px;">
                <div class="title" style="margin:0" data-i18n="please_input_sms_body_and_phone">${t('please_input_sms_body_and_phone')}</div>
                <input type="text" id="KANO_SMS_PHONE_NUMBER_FORWARD" style="padding:6px;width:100%;margin:10px 0" data-i18n-placeholder="phone_number" placeholder="${t("phone_number")}" ></input>
                <textarea data-i18n-placeholder="sms_content" placeholder="${t("sms_content")}" id="KANO_SMS_TEXT_FORWARD" style="padding:4px;width:100%;box-sizing:border-box;min-height: 10em;"></textarea>
                <div style="display:flex;gap:10px">
                    <button id="close_sms_body_toast_btn" style="width:100%;font-size:.64rem;margin-top:5px" data-i18n="confirm_btn">${t("confirm_btn")}</button>
                    <button id="close_sms_body_toast_btn1" style="width:100%;font-size:.64rem;margin-top:5px" data-i18n="cancel_btn">${t("cancel_btn")}</button>
                </div>
                </div>
                `, 'red')
                const btn = el.querySelector('#close_sms_body_toast_btn')
                const btn2 = el.querySelector('#close_sms_body_toast_btn1')
                const phone = el.querySelector("#KANO_SMS_PHONE_NUMBER_FORWARD")
                const text = el.querySelector("#KANO_SMS_TEXT_FORWARD")
                const taskAction = document.querySelector("#taskAction")

                if (!btn && !btn2 && !text && !phone) {
                    close()
                    return
                }
                btn2.onclick = () => {
                    close()
                }
                if (taskAction) {
                    try {
                        const data = JSON.parse(taskAction.value.trim())
                        phone.value = data.Number
                        text.value = gsmDecode(data.MessageBody.trim())
                    } catch (e) {
                        console.log("taskAction内容解析失败", e)
                    }
                }
                btn.onclick = () => {
                    const parsedVal = gsmEncode(text.value.trim())
                    const parsedPhone = phone.value.trim()
                    if (isNaN(parseInt(parsedPhone))) return createToast(t("please_input_correct_phone_number"), 'pink')
                    if (parsedVal == "" || !parsedVal) return createToast(t("sms_content_not_empty"), 'pink')
                    action.MessageBody = parsedVal
                    action.Number = parsedPhone
                    taskAction.value = JSON.stringify(action, null, 2)
                    createToast(t("toast_save_success", 'pink'))
                    close()
                }
            }
            if (actionName == "转发设备信息") {
                try {
                    const { enabled } = await (await fetch(`${KANO_baseURL}/sms_forward_enabled`, {
                        method: 'GET',
                        headers: common_headers
                    })).json()
                    if (enabled != "1") {
                        return createToast(t("action_forward_dev_info_notice") + "<br>" + t("action_forward_dev_info_notice_fail"), "pink", 5000)
                    }
                } catch (e) {
                    console.error("获取短信转发信息失败：", e)
                    return createToast(t('client_mgmt_fetch_error', 'pink'))
                }
            }
            if (actionName != "发送短信") {
                taskAction.value = JSON.stringify(action, null, 2)
            }
        }
    }

    //拖拽上传插件
    (() => {
        const dropZone = document.getElementById('pluginDropZone');

        dropZone.addEventListener('dragover', (e) => {
            e.preventDefault();
            dropZone.style.border = '2px dashed #007bff';
        });

        dropZone.addEventListener('dragleave', () => {
            dropZone.style.border = '2px solid transparent';
        });

        dropZone.addEventListener('drop', (e) => {
            e.preventDefault();
            dropZone.style.border = '2px solid transparent';
            const files = e.dataTransfer.files;

            if (files.length > 0) {
                const fakeEvent = {
                    target: {
                        files: files
                    }
                };
                handlePluginFileUpload(fakeEvent);
            }
        });

    })()


    //插件上传
    const handlePluginFileUpload = (event) => {
        return new Promise((resolve, reject) => {
            const file = event.target.files[0];

            if (!file) return;

            if (file.size > 1145 * 1024) {
                const msg = `${t('toast_file_size_not_over_than')}${1145}KB！`
                createToast(msg, 'red')
                reject({ msg, data: null })
                return
            }

            const reader = new FileReader();
            reader.readAsText(file);

            reader.onload = (e) => {
                const str = e.target.result;
                const custom_head = document.querySelector("#custom_head");
                if (!custom_head) return;

                const pluginRegex = /<!--\s*\[KANO_PLUGIN_START\]\s*(.*?)\s*-->([\s\S]*?)<!--\s*\[KANO_PLUGIN_END\]\s*\1\s*-->/g;

                let matched = false;
                let match;
                let msgs = ''
                while ((match = pluginRegex.exec(str)) !== null) {
                    console.log("匹配到一个插件集");

                    matched = true;

                    const pluginName =
                        (match[1].trim() || match[3].trim() || file.name).replace(/-->/g, "").trim();
                    const pluginContent = match[2].trim();

                    custom_head.value += `<!-- [KANO_PLUGIN_START] ${pluginName} -->\n${pluginContent}\n<!-- [KANO_PLUGIN_END] ${pluginName} -->\n\n`;

                    if (!plugins.some(el => el.name === pluginName)) {
                        plugins.push({
                            name: pluginName,
                            content: pluginContent
                        });
                    } else {
                        msgs += `<p>${t('plugin')}:${pluginName} ${t('exists_skip')}</p>`
                    }
                }
                if (msgs) {
                    createToast(msgs, 'pink', 5000)
                }

                if (matched) {
                    createToast(t('toast_add_success_save_to_submit'), 'green');
                    resolve({ msg: 'added as plugin set' });
                } else {
                    // 不含插件头尾，手动包裹整个为一个插件
                    const pluginName = file.name;
                    custom_head.value += `<!-- [KANO_PLUGIN_START] ${pluginName} -->\n${str}\n<!-- [KANO_PLUGIN_END] ${pluginName} -->\n\n\n\n`;
                    if (!plugins.some(el => el.name === pluginName)) {
                        plugins.push({
                            name: pluginName,
                            content: str
                        });
                        createToast(t('toast_add_success_save_to_submit'), 'pink');
                    } else {
                        createToast(t('same_plugin'), 'pink')
                    }
                    resolve({ msg: 'added as single plugin' });
                }

                renderPluginList();
            }
        })
    }

    //插件导出
    const pluginExport = async () => {
        try {
            const { text } = await (await fetch(`${KANO_baseURL}/get_custom_head`, {
                headers: common_headers
            })).json()
            if (text) {
                const b = new Blob([text], { type: 'text/plain' })
                const date = (new Date()).toLocaleString("zh-cn").replaceAll(" ", "_").replaceAll("/", "_").replaceAll(":", "_")
                saveAs(b, `UFI-TOOLS_Plugins_${date}.txt`)
            }
        } catch (e) {
            console.error(e)
            createToast(t('toast_get_plugin_failed_check_network'), 'red')
        }
    }

    const onPluginBtn = () => {
        document.querySelector('#pluginFileInput')?.click()
    }

    //初始化插件功能
    let sortable_plugin = null
    let plugins = []

    const renderPluginList = () => {
        const listEl = document.getElementById('sortable-list')
        const custom_head = document.querySelector('#custom_head')

        listEl.innerHTML = ''

        plugins.forEach((item, index) => {
            const el = document.createElement('li')
            el.dataset.index = index
            el.style.display = "flex"
            el.style.justifyContent = "space-between"
            el.style.alignItems = "center"
            el.style.width = "100%"
            el.style.gap = "10px"

            const deleteBtn = document.createElement('div')
            deleteBtn.style.height = '20px'
            deleteBtn.classList.add('drag-option', 'delete-btn')
            deleteBtn.innerHTML = `<svg width="20px" height="20px" viewBox="0 0 1024 1024" version="1.1" xmlns="http://www.w3.org/2000/svg"><path fill="#ffffff" d="M736 352.032L736.096 800h-0.128L288 799.968 288.032 352 736 352.032zM384 224h256v64h-256V224z m448 64h-128V202.624C704 182.048 687.232 160 640.16 160h-256.32C336.768 160 320 182.048 320 202.624V288H192a32 32 0 1 0 0 64h32V799.968C224 835.296 252.704 864 288.032 864h447.936A64.064 64.064 0 0 0 800 799.968V352h32a32 32 0 1 0 0-64z"  /><path fill="#ffffff" d="M608 690.56a32 32 0 0 0 32-32V448a32 32 0 1 0-64 0v210.56a32 32 0 0 0 32 32M416 690.56a32 32 0 0 0 32-32V448a32 32 0 1 0-64 0v210.56a32 32 0 0 0 32 32"  /></svg>`
            deleteBtn.onclick = () => {
                plugins.splice(index, 1)
                createToast(`${t('deleted_plugin')}：${item.name}，${t('save_to_apply')}！`)
                renderPluginList() // 重新渲染
            }

            const sortBtn = document.createElement('div')
            sortBtn.classList.add('handle', 'drag-option')
            sortBtn.style.height = '20px'
            sortBtn.innerHTML = `<svg width="20px" height="20px" viewBox="0 0 1024 1024" version="1.1" xmlns="http://www.w3.org/2000/svg"><path fill="#ffffff" d="M909.3 506.3L781.7 405.6c-4.7-3.7-11.7-0.4-11.7 5.7V476H548V254h64.8c6 0 9.4-7 5.7-11.7L517.7 114.7c-2.9-3.7-8.5-3.7-11.3 0L405.6 242.3c-3.7 4.7-0.4 11.7 5.7 11.7H476v222H254v-64.8c0-6-7-9.4-11.7-5.7L114.7 506.3c-3.7 2.9-3.7 8.5 0 11.3l127.5 100.8c4.7 3.7 11.7 0.4 11.7-5.7V548h222v222h-64.8c-6 0-9.4 7-5.7 11.7l100.8 127.5c2.9 3.7 8.5 3.7 11.3 0l100.8-127.5c3.7-4.7 0.4-11.7-5.7-11.7H548V548h222v64.8c0 6 7 9.4 11.7 5.7l127.5-100.8c3.7-2.9 3.7-8.5 0.1-11.4z" /></svg>`

            const text = document.createElement('span')
            text.innerHTML = item.disabed ? `<del style="opacity:.6">${item.name}</del>` : item.name
            text.style.padding = '2px 6px'

            text.onclick = () => {
                const editSinglePlugin = document.querySelector('#editSinglePlugin')
                if (editSinglePlugin) {
                    const currentItem = item
                    document.querySelector('#currentPluginName').textContent = currentItem.name
                    showModal('#editSinglePluginModal')
                    editSinglePlugin.value = currentItem.content
                    const submitEditSinglePlugin = document.querySelector('#submitEditSinglePlugin')
                    if (submitEditSinglePlugin) {
                        submitEditSinglePlugin.onclick = () => {
                            const index = plugins.findIndex(el => el.name == currentItem.name)
                            if (index != -1 && plugins[index]) {
                                plugins[index].content = editSinglePlugin.value
                                const arr = editSinglePlugin.value.split('\n')
                                if (arr[0].includes("[kano_disabled]") && arr[arr.length - 1].includes("[kano_disabled]")) {
                                    plugins[index].disabed = true
                                } else {
                                    plugins[index].disabed = false
                                }
                                renderPluginList()
                                closeModal('#editSinglePluginModal')
                                editSinglePlugin.value = ''
                                document.querySelector('#currentPluginName').textContent = ''
                                createToast(t('toast_add_success_save_to_submit'), 'pink')
                            }
                        }
                    }
                }
            }

            el.appendChild(sortBtn)
            el.appendChild(text)
            el.appendChild(deleteBtn)
            listEl.appendChild(el)
        })

        const enablePlugin = (flag = false) => {
            const editSinglePlugin = document.querySelector('#editSinglePlugin')
            if (editSinglePlugin) {
                const arr = editSinglePlugin.value.split('\n')
                if (arr[0].includes("[kano_disabled]")) {
                    arr.shift()
                }
                if (arr[arr.length - 1].includes("[kano_disabled]")) {
                    arr.pop()
                }
                editSinglePlugin.value = arr.join('\n')
                !flag && createToast(t('enabled') + "," + t('save_to_apply'))
            }
        }

        const disablePlugin = (flag = false) => {
            const editSinglePlugin = document.querySelector('#editSinglePlugin')
            if (editSinglePlugin) {
                enablePlugin(true)
                editSinglePlugin.value = "<!-- [kano_disabled]\n" + editSinglePlugin.value + "\n[kano_disabled] -->"
                !flag && createToast(t('disabled') + "," + t('save_to_apply'))
            }
        }

        //挂载
        window.disablePlugin = disablePlugin
        window.enablePlugin = enablePlugin

        // 初始化或重新绑定拖拽
        if (sortable_plugin && sortable_plugin.destroy) {
            sortable_plugin.destroy()
            sortable_plugin = null
        }

        sortable_plugin = new Sortable(listEl, {
            animation: 150,
            handle: '.handle',
            onEnd: (evt) => {
                const moved = plugins.splice(evt.oldIndex, 1)[0]
                plugins.splice(evt.newIndex, 0, moved)
                renderPluginList() // 拖动后重新渲染
            }
        })

        // 同步 textarea 内容
        custom_head.value = plugins.map(item =>
            `<!-- [KANO_PLUGIN_START] ${item.name} -->\n${item.content}\n<!-- [KANO_PLUGIN_END] ${item.name} -->\n\n\n\n`
        ).join('')

        // 同步插件数量
        const PLUGINS_NUM = document.querySelector('#PLUGINS_NUM')
        if (PLUGINS_NUM) PLUGINS_NUM.innerHTML = plugins.length
    }

    const initPluginSetting = async () => {
        const btn = document.querySelector('#PLUGIN_SETTING')
        if (!(await initRequestData())) {
            btn.onclick = () => createToast(t('toast_please_login'), 'red')
            btn.style.backgroundColor = 'var(--dark-btn-disabled-color)'
            return null
        }
        btn.style.backgroundColor = 'var(--dark-btn-color)'
        btn.onclick = async () => {
            showModal('#PluginModal')

            try {
                const { text } = await (await fetch(`${KANO_baseURL}/get_custom_head`, {
                    headers: common_headers
                })).json()
                const custom_head = document.querySelector('#custom_head')
                custom_head.value = text || ''

                // 提取插件
                const pluginRegex = /<!--\s*\[KANO_PLUGIN_START\]\s*(.*?)\s*-->([\s\S]*?)<!--\s*\[KANO_PLUGIN_END\]\s*\1\s*-->/g;

                plugins = []
                let match
                while ((match = pluginRegex.exec(text)) !== null) {
                    const name = match[1].trim()
                    const content = match[2].trim()
                    const disabed = content.includes('[kano_disabled]')
                    plugins.push({ name, content, disabed })
                }

                renderPluginList() // 初始化渲染
            } catch (e) {
                console.error(e)
                createToast(t('toast_get_plugin_failed'), 'red')
            }
        }
    }
    initPluginSetting()

    const clearPluginText = () => {
        const custom_head = document.querySelector('#custom_head')
        custom_head.value = ''
        createToast(t('toast_clear_success_save_to_submit'), 'green')
        plugins.length = 0
        renderPluginList()
    }

    const savePluginSetting = async (e) => {
        const custom_head = document.querySelector('#custom_head')
        if ((await initRequestData())) {
            setCustomHead(custom_head.value?.trim() || '').then(async ({ result, error }) => {
                if (result != "success") {
                    if (error)
                        createToast(error, 'red')
                    else
                        createToast(t('plugin_save_fail_network'), 'red')
                } else {
                    createToast(t('save_plugin_success_refresh'), 'green')
                    closeModal('#PluginModal')
                    setTimeout(() => {
                        location.reload()
                    }, 2000)
                }
            })
        } else {
            createToast(t("not_login_not_save_plugin"), 'yellow')
        }
    }

    const handleDisableFOTA = async () => {
        const AD_RESULT = document.querySelector('#AD_RESULT')
        try {
            //看看是不是开启了高级功能
            AD_RESULT.innerHTML = `<strong class="green" style="font-size: 12px;">${t('disable_update_ing')}...</strong>`
            if (await checkAdvancedFunc()) {
                createToast(t('toast_advanced_checked'), '')
                let res0 = await runShellWithRoot("pm disable com.zte.zdm")
                let res1 = await runShellWithRoot("pm uninstall -k --user 0 com.zte.zdm ")
                let res2 = await runShellWithRoot("pm uninstall -k --user 0 cn.zte.aftersale")
                let res3 = await runShellWithRoot("pm uninstall -k --user 0 com.zte.zdmdaemon")
                let res4 = await runShellWithRoot("pm uninstall -k --user 0 com.zte.zdmdaemon.install")
                let res5 = await runShellWithRoot("pm uninstall -k --user 0 com.zte.analytics")
                let res6 = await runShellWithRoot("pm uninstall -k --user 0 com.zte.neopush")
                let res7 = await runShellWithRoot("am force-stop com.zte.zdm")
                AD_RESULT.innerHTML = `
                <div style="min-width:200px;font-size:12px">
                <p>${t('advanced_checked_disabled_update')}</p>
                <p>${res0.content}</p>
                <p>${res1.content}</p>
                <p>${res2.content}</p>
                <p>${res3.content}</p>
                <p>${res4.content}</p>
                <p>${res5.content}</p>
                <p>${res6.content}</p>
                <p>${res7.content}</p>
                </div>`
            } else {
                createToast(t('toast_not_enabled_advanced_tools'), '')
                let adb_status = await adbKeepAlive()
                if (!adb_status) {
                    AT_RESULT.innerHTML = ""
                    return createToast(t('toast_ADB_not_init'), 'red')
                }
                const res = await (await fetchWithTimeout(`${KANO_baseURL}/disable_fota`, {
                    method: 'get',
                    headers: common_headers
                })).json()
                if (!res.error) {
                    createToast(t('update_has_disabled'), 'green')
                    AD_RESULT.innerHTML = `<strong class="green" style="font-size: 12px;">${t('use_adb_to_disabled_update')}</strong>`
                } else {
                    createToast(t('update_disabled_failed'), 'red')
                    AD_RESULT.innerHTML = `<strong class="red" style="font-size: 12px;">${t('update_disabled_failed')}</strong>`
                }
            }
        } catch (e) {
            console.error(e)
            AD_RESULT.innerHTML = `<strong class="red" style="font-size: 12px;">${t('update_disabled_failed')}</strong>`
            createToast(t('error'), 'red')
        }
    }

    const getBoot = async () => {
        try {
            const AD_RESULT = document.querySelector('#AD_RESULT')
            AD_RESULT.innerHTML = ''
            const res = await runShellWithRoot("getprop ro.boot.slot_suffix")
            let ab = res.content.includes('a') ? "A" : "B"
            createToast(`${t('your_boot_slot')}：${ab}`, '')
            await runShellWithRoot('mkdir /data/data/com.minikano.f50_sms/files/uploads')
            const outFile = `boot_${ab.toLowerCase()}.img`
            await runShellWithRoot(`rm -f /data/data/com.minikano.f50_sms/files/uploads/${outFile}`)
            const command = `dd if=/dev/block/by-name/boot_${ab.toLowerCase()} of=/data/data/com.minikano.f50_sms/files/uploads/${outFile}`
            let result = await runShellWithRoot(command)
            if (result.success) {
                AD_RESULT.innerHTML = `<strong style="font-size: 12px;">${t('your_boot_slot')}：${ab}，${t('downloading')}：boot_${ab}.img...</strong>`
            }
            //开始下载
            const outLink = `/api/uploads/${outFile}`
            const a = document.createElement('a')
            a.href = outLink
            a.download = outFile
            a.click()
        } catch {
            createToast(t("error"), 'red')
        }
    }

    let cellularSpeedFlag = false;
    let cellularSpeedController = null;
    let loopCellularTimer = null;
    let isCellularTestLooping = false;
    let totalBytes = 0;
    let isSingleTesting = false
    const getCellularStartBtn = () => document.querySelector('#CellularTestModal #startSpeedBtn')
    const singleTest = debounce((e) => {
        isSingleTesting = true
        if (cellularSpeedFlag) {
            isSingleTesting = false
        }
        startCellularTestRealtime(e, true)
    }, 500)

    function runSingleTest(e) {
        singleTest(e)
    }

    async function startCellularTestRealtime(e, flag = false) {
        if (isCellularTestLooping && e) {
            return
        }
        const isSingleRun = flag === true
        let runBytes = 0
        try {
            if (!cellularSpeedFlag) {
                flag && (totalBytes = 0)
            }
            const resultEl = document.getElementById('CellularTestResult');
            const url = document.getElementById('CellularTestUrl').value.trim();
            const rawThreadNum = Number(document.querySelector('#thread_num').textContent);

            if (!url) {
                createToast(t('cellular_pls_input_url'), 'red');
                return;
            }

            if (cellularSpeedFlag) {
                // 停止测速
                cellularSpeedController?.abort();
                createToast(t('speedtest_aborted'), 'orange');
                cellularSpeedFlag = false;
                e && (e.target.innerText = t('speedtest_start_btn'));
                return;
            }

            // 启动测速
            cellularSpeedFlag = true;
            cellularSpeedController = new AbortController();

            const maxThreadNum = 5;
            const batchSize = 8;
            const threadNum = Math.min(rawThreadNum, maxThreadNum);

            if (rawThreadNum > maxThreadNum) {
                createToast(`${t('thread_imit')} ${maxThreadNum},${t('avoid_overload')}`, 'orange');
            }

            e && (e.target.innerText = t('speedtest_stop_btn'));
            resultEl.innerHTML = `${t('speed_test_ing')} (${threadNum} ${t('thread')})...<br/><span>${t('preparing')}...</span>`;

            let startTime = performance.now();
            let lastUpdateTime = startTime;
            let lastBytes = 0;
            let firstResponseReceived = false;

            const readTasks = [];

            // 分批发起测速请求，并立即开始读取
            for (let i = 0; i < threadNum; i++) {
                const testUrl = `${KANO_baseURL}/proxy/--${url}?t=${Math.random()}`;

                const task = (async () => {
                    try {
                        const res = await fetch(testUrl, {
                            signal: cellularSpeedController.signal,
                            cache: 'no-store',
                        });

                        const reader = res.body?.getReader();
                        if (!reader) return;

                        while (true) {
                            const { done, value } = await reader.read();
                            if (done) break;

                            totalBytes += value.length;
                            runBytes += value.length;

                            if (!firstResponseReceived && value.length > 0) {
                                firstResponseReceived = true;
                            }
                        }
                    } catch (_) {
                        // 忽略异常
                    }
                })();

                readTasks.push(task);

                // 批处理延迟，避免同时连接过多
                if ((i + 1) % batchSize === 0) {
                    await new Promise(res => setTimeout(res, 100));
                }
            }

            // 每 100ms 更新一次速度
            const interval = setInterval(() => {
                const now = performance.now();
                const deltaTime = (now - lastUpdateTime) / 1000;
                const deltaBytes = totalBytes - lastBytes;
                const speedMbps = (deltaBytes * 8 / 1024 / 1024) / deltaTime;

                resultEl.innerHTML = `
            ${t('cellular_speed_test_thread')}${rawThreadNum}<br/>
            ${t('speedtest_current_speed')}: ${speedMbps.toFixed(2)} Mbps<br/>
            ${t('speedtest_total_download')}: ${(totalBytes / 1024 / 1024).toFixed(2)} MB
        `;
                lastUpdateTime = now;
                lastBytes = totalBytes;
            }, 100);

            // 响应慢提示
            setTimeout(() => {
                if (!firstResponseReceived && cellularSpeedFlag) {
                    resultEl.innerHTML += `<br/><span>${t('cellular_speed_test_slow')}</span>`;
                }
            }, 2000);

            try {
                await Promise.all(readTasks);
            } catch (_) {
                // 忽略中断异常
            }

            clearInterval(interval);
            cellularSpeedFlag = false;
            e && (e.target.innerText = t('speedtest_start_btn'));

            const totalTime = (performance.now() - startTime) / 1000;
            const avgSpeed = ((runBytes * 8) / 1024 / 1024) / totalTime;

            if (runBytes === 0) {
                resultEl.innerHTML += `<br/><span style="color:red;">${t('cellular_speed_test_failed')}</span>`;
            } else {
                resultEl.innerHTML += `<br/>${t('speedtest_avg_speed')}: ${avgSpeed.toFixed(2)} Mbps`;
            }

            // 循环测速
            if (!isCellularTestLooping) return;
            loopCellularTimer = setTimeout(() => {
                if (isCellularTestLooping) startCellularTestRealtime(); // 不传 e
            }, 500);
        } finally {
            if (isSingleRun) {
                isSingleTesting = false
            }
        }
    }

    const loopTest = debounce((event) => {
        const btn = event.target;
        const startBtn = getCellularStartBtn()

        if (isSingleTesting) {
            return
        }

        isCellularTestLooping = !isCellularTestLooping;

        if (isCellularTestLooping) {
            btn.innerText = t('loop_mode_stop');
            totalBytes = 0
            startBtn && (startBtn.disabled = true)
            startCellularTestRealtime();
        } else {
            btn.innerText = t('loop_mode_start');
            clearTimeout(loopCellularTimer);
            cellularSpeedController?.abort();
            cellularSpeedFlag = false;
            startBtn && (startBtn.disabled = false)
        }
    }, 500)

    function handleCellularLoopMode(event) {
        loopTest(event)
    }

    function closeCellularTest(selector) {
        closeModal(selector);
        isCellularTestLooping = false;
        clearTimeout(loopCellularTimer);
        cellularSpeedController?.abort();
        cellularSpeedFlag = false;
        const startBtn = getCellularStartBtn()
        startBtn && (startBtn.disabled = false)
    }

    const onThreadNumChange = (event) => {
        document.querySelector('#thread_num').innerHTML = event.target.value;
    };

    const initCellularSpeedTestBtn = async () => {
        const btn = document.querySelector('#CellularSpeedTestBtn')
        const stor = localStorage.getItem("cellularTestUrl")
        if (stor) {
            const CellularTestUrl = document.querySelector('#CellularTestUrl')
            CellularTestUrl && (CellularTestUrl.value = stor)
        }
        if (!(await initRequestData())) {
            btn.onclick = () => createToast(t('toast_please_login'), 'red')
            return null
        }
        btn.onclick = async () => {
            showModal('#CellularTestModal')
        }
    }
    initCellularSpeedTestBtn()

    const saveCellularTestUrl = (e) => {
        const target = e.target
        if (target?.value?.trim()) {
            localStorage.setItem("cellularTestUrl", target.value.trim())
        }
    }

    //从插件商店下载插件并安装
    const installPluginFromStore = async (url, name) => {
        const { close, el } = createFixedToast('download_ing', t('download_ing'))
        try {
            const res = await fetchWithTimeout(`${KANO_baseURL}/proxy/--${url}`, {
                method: 'GET',
            })
            if (!res.ok) {
                createToast(t('download_failed'), 'red')
                close()
                return
            }
            const text = await res.text()
            createToast(t('install_ing'), 'pink', 3000, () => {
                close() // 关闭下载中提示
            })
            await handlePluginFileUpload({
                target: {
                    files: [new File([text], name, { type: 'text/plain' })]
                }
            })
        } catch {
            createToast(t('download_failed'), 'red')
        } finally {
            close()
        }
    }

    //渲染插件
    const renderPluginItems = (items, download_url) => {
        const items_el = document.querySelector('#plugin_store .plugin-items')
        items_el.innerHTML = '' //清空之前的内容
        items.forEach(plugin => {
            const li = document.createElement('li')
            li.className = 'plugin-item'
            li.innerHTML = `
                            <div class="plugin-title">
                            ${plugin.name}
                            </div>
                            <div class="info">
                                <span>MD5:${plugin?.hash_info?.md5}</span><br>
                                <span>last-modified: ${new Date(plugin?.modified).toLocaleString('zh-cn')}</span>
                            </div>
                            <div class="actions">
                                <button onclick="installPluginFromStore('${download_url}/${plugin.name}','${plugin.name}')">${t('one_click_install')}</button>
                                <button onclick="downloadUrl('${download_url}/${plugin.name}')">${t('only_download')}</button>
                            </div>
                        `
            items_el.appendChild(li)
        })
    }

    const scrollToElementWithScrollContainerAndElement = ({ scrollContainer, el, highLightKeyWord }) => {
        // 计算 el 相对于 scrollContainer 的位置
        const topOffset = -15
        const elTop = el.getBoundingClientRect().top;
        const containerTop = scrollContainer.getBoundingClientRect().top;
        const relativeTop = elTop - containerTop + scrollContainer.scrollTop + topOffset;

        // 平滑滚动到该位置
        scrollContainer.scrollTo({
            top: relativeTop,
            behavior: 'smooth'
        });
        if (highLightKeyWord) {
            //高亮此插件
            let outerEl = el.parentElement
            outerEl.style.boxShadow = '0 0 4px 1px yellow'
            setTimeout(() => {
                outerEl.style.boxShadow = ''
            }, 5000);
        }
    }

    //搜索插件，滚动到合适位置
    const scrollToElement = (elementsName = '#plugin_store .plugin-title', keyword, highLightKeyWord = true) => {
        let found = false
        let foundList = []
        let scrollContainer = null
        document.querySelectorAll(elementsName).forEach(el => {
            const find = el.textContent?.toLowerCase()?.includes(keyword?.toLowerCase())
            if (find) {
                // 找到最近的可滚动容器
                scrollContainer = el.parentElement;
                while (scrollContainer && scrollContainer.scrollHeight <= scrollContainer.clientHeight) {
                    scrollContainer = scrollContainer.parentElement;
                }

                if (scrollContainer) {
                    scrollToElementWithScrollContainerAndElement({
                        scrollContainer, el, highLightKeyWord
                    })
                    foundList.push(el)
                    found = true
                } else {
                    found = false
                }
            }
        });

        console.log(foundList);

        if (scrollContainer) {
            if (foundList.length > 0) {
                scrollToElementWithScrollContainerAndElement({
                    scrollContainer,
                    el: foundList[0],
                    highLightKeyWord
                })
            }
        }

        return found
    }

    //插件市场
    const plugin_store_modal = document.querySelector('#plugin_store')
    plugin_store_modal.onclick = (e) => {
        e.stopPropagation()
        const pluginModal = document.querySelector('#PluginModal')
        const classList = Array.from(e?.target?.classList || [])
        const id = e.target.id
        if (classList && classList.includes('mask')) {
            if (id) {
                closeModal(`#${id}`);
                setTimeout(() => {
                    showModal('#PluginModal')
                }, 200);
            }
        }
    }

    const plugin_store = document.querySelector('#plugin_store_btn')
    const pluginsResultRes = []
    let timer_input = null
    plugin_store.onclick = (e) => {
        //隐藏插件功能模态框
        const pluginModal = document.querySelector('#PluginModal')
        pluginModal.style.display = 'none'

        const plugin_store_close_btn = document.querySelector('#plugin_store_close_btn')
        plugin_store_close_btn.onclick = () => {
            closeModal('#plugin_store', 200, () => {
                showModal('#PluginModal')
            })
        }

        const pluginSearchInputEl = document.querySelector("#pluginSearchInput")
        if (pluginSearchInputEl) {
            const searchListEl = document.querySelector("#plugin_store .searchList")
            if (searchListEl) {
                pluginSearchInputEl.oninput = (e) => {
                    const keyword = e.target.value.trim()
                    const foundList = []
                    searchListEl.innerHTML = ''
                    if (pluginsResultRes.length > 0) {
                        pluginsResultRes.forEach(el => {
                            let name_lower = el.name.toLowerCase()
                            let keyword_lower = keyword.toLowerCase()
                            if (keyword_lower && name_lower.includes(keyword_lower)) {
                                foundList.push(el)
                            }
                        })
                    }
                    if (foundList.length) {
                        searchListEl.style.display = 'block'
                        foundList.forEach(el => {
                            const itemEl = document.createElement("div")
                            itemEl.className = "searchListItem"
                            itemEl.innerHTML = el.name
                            itemEl.onclick = () => {
                                pluginSearchInputEl.value = el.name
                                document.querySelector("#pluginSearchBtn").click()
                            }
                            searchListEl.appendChild(itemEl)
                        })
                    } else {
                        searchListEl.style.display = 'none'
                    }
                }
                pluginSearchInputEl.onblur = () => {
                    timer_input && clearTimeout(timer_input)
                    timer_input = setTimeout(() => {
                        searchListEl.style.display = 'none'
                    }, 200);
                }
            }
        }
        showModal('#plugin_store')
        const items = document.querySelector('#plugin_store .plugin-items')
        //loading
        items.innerHTML = `
        <li style="padding-top: 15px;overflow:hidden">
            <strong class="green" style="text-align: center;margin: 10px auto;margin-top: 0; display: flex;flex-direction: column;padding: 40px;">
                <span style="font-size: 50px;" class="spin">🌀</span>
                <span style="font-size: 16px;padding-top: 10px;">loading...</span>
            </strong>
        </li>
        `
        const total = document.querySelector('#plugin_store .total')
        //加载插件
        pluginsResultRes.length = 0
        fetchWithTimeout(`${KANO_baseURL}/plugins_store`)
            .then(res => res.json())
            .then(({ res, download_url }) => {
                const data = res.data || {}
                items.innerHTML = ''
                if (data && data.content && data.content.length > 0) {
                    pluginsResultRes.push(...data.content)
                    total.innerHTML = `${t('plugin_modal_num')}: ${data.content.length}`
                    //分页
                    const pageSize = 10
                    const totalPages = Math.ceil(data.content.length / pageSize)
                    let pageNum = 0
                    const cur_page_el = document.querySelector('#plugin_store_cur_page')
                    const total_page_el = document.querySelector('#plugin_store_total_page')
                    cur_page_el.innerHTML = pageNum + 1
                    total_page_el.innerHTML = totalPages
                    renderPluginItems(data.content.slice(pageNum * pageSize, pageNum * pageSize + pageSize), download_url)

                    //下一页
                    const nextPageBtn = document.querySelector('#plugin_store_next_page')
                    nextPageBtn.style.backgroundColor = totalPages <= 1 ? 'var(--dark-btn-disabled-color)' : ''
                    nextPageBtn.onclick = () => {
                        pageNum++
                        if (pageNum >= totalPages - 1) {
                            nextPageBtn.style.backgroundColor = 'var(--dark-btn-disabled-color)'
                        } else {
                            nextPageBtn.style.backgroundColor = ''
                        }
                        if (pageNum >= totalPages) {
                            pageNum = totalPages - 1
                            return
                        }
                        prevageBtn.style.backgroundColor = ''
                        cur_page_el.innerHTML = pageNum + 1
                        total_page_el.innerHTML = totalPages
                        renderPluginItems(data.content.slice(pageNum * pageSize, pageNum * pageSize + pageSize), download_url)
                    }

                    //上一页
                    const prevageBtn = document.querySelector('#plugin_store_prev_page')
                    prevageBtn.style.backgroundColor = 'var(--dark-btn-disabled-color)'
                    prevageBtn.onclick = () => {
                        pageNum--
                        if (pageNum <= 0) {
                            prevageBtn.style.backgroundColor = 'var(--dark-btn-disabled-color)'
                        } else {
                            prevageBtn.style.backgroundColor = ''
                        }
                        if (pageNum < 0) {
                            pageNum = 0
                            return
                        }
                        nextPageBtn.style.backgroundColor = ''
                        cur_page_el.innerHTML = pageNum + 1
                        total_page_el.innerHTML = totalPages
                        renderPluginItems(data.content.slice(pageNum * pageSize, pageNum * pageSize + pageSize), download_url)
                    }

                    //搜索插件
                    const pluginSearchBtn = document.querySelector('#pluginSearchBtn')
                    pluginSearchBtn.onclick = () => {
                        const pluginSearchInput = document.querySelector('#pluginSearchInput')
                        const keyword = pluginSearchInput.value.trim()

                        const scrollToFirstPage = () => {
                            pageNum = 0
                            prevageBtn.style.backgroundColor = 'var(--dark-btn-disabled-color)'
                            nextPageBtn.style.backgroundColor = ''
                            cur_page_el.innerHTML = pageNum + 1
                            renderPluginItems(data.content.slice(pageNum * pageSize, pageNum * pageSize + pageSize), download_url)
                            scrollToElement('#plugin_store .plugin-title', data.content[0].name, false)
                        }

                        if (!keyword || keyword == '') {
                            return scrollToFirstPage()
                        }

                        //寻找存在的页面页码并跳转

                        const cur_index = data.content.findIndex(plugin => {
                            return plugin.name?.toLowerCase()?.includes(keyword?.toLowerCase())
                        })

                        if (cur_index == -1) {
                            createToast(`${t('no_plugins_found')}：${keyword}`, 'red')
                            return scrollToFirstPage()
                        }

                        pageNum = Math.floor(cur_index / pageSize)

                        if (pageNum == 0) {
                            prevageBtn.style.backgroundColor = 'var(--dark-btn-disabled-color)'
                            nextPageBtn.style.backgroundColor = ''
                        } else if (pageNum == totalPages - 1) {
                            prevageBtn.style.backgroundColor = ''
                            nextPageBtn.style.backgroundColor = 'var(--dark-btn-disabled-color)'
                        } else {
                            prevageBtn.style.backgroundColor = ''
                            nextPageBtn.style.backgroundColor = ''
                        }

                        cur_page_el.innerHTML = pageNum + 1
                        renderPluginItems(data.content.slice(pageNum * pageSize, pageNum * pageSize + pageSize), download_url)
                        scrollToElement('#plugin_store .plugin-title', keyword)
                        return
                    }

                    const plugin_search_reset_btn = document.querySelector('#pluginSearchResetBtn')
                    plugin_search_reset_btn.onclick = () => {
                        const pluginSearchInput = document.querySelector('#pluginSearchInput')
                        pluginSearchInput.value = '';
                        pluginSearchBtn.click() //触发搜索
                    }

                } else {
                    items.innerHTML = `<li style="padding:10px">${t('no_plugins_found')}</li>`
                }
            })
            .catch(err => {
                console.error(err)
                items.innerHTML = `<li style="padding:10px">${t('error_loading_plugins')}</li>`
            })

    }

    const handlePluginStoreSearchInput = (e) => {
        if (e.code.toLowerCase() == 'enter') {
            const pluginSearchBtn = document.querySelector('#pluginSearchBtn')
            if (pluginSearchBtn) {
                pluginSearchBtn.click()
            }
        }
    }

    const handleForceIMEI = async () => {
        if (!await checkAdvancedFunc()) return createToast(t("need_advance_func"), 'red')
        const AT_RESULT = document.querySelector('#AT_RESULT')
        if (AT_RESULT) {
            AT_RESULT.innerHTML = t('toast_running_please_wait')
            try {
                const res = await runShellWithRoot(`/data/data/com.minikano.f50_sms/files/imei_reader`)
                //清空imei展示缓存
                resetDiagImeiCache()
                AT_RESULT.innerHTML = `<p style="font-weight:bolder;overflow:hidden" onclick="copyText(event)">${res.content.replaceAll('\n', "<br>")}</p>`
            } catch {
                AT_RESULT.innerHTML = ""
            }
        }
    }

    const getSELinuxStatus = async () => {
        try {
            const res = await (await fetchWithTimeout(`${KANO_baseURL}/SELinux`)).json()
            let result = res.selinux.toLowerCase()
            if (result !== "permissive" && result !== "disabled" && result != "0") {
                createToast(t('not_support_firmware'), "pink", 10000);
            }
        } catch {
        }
    }
    getSELinuxStatus()

    const initTerms = async () => {
        if (!(await initRequestData())) {
            return null
        }
        // 用户协议
        const md = createModal({
            name: "kano_terms",
            noBlur: true,
            isMask: true,
            title: t('useTermsTitle'),
            contentStyle: "font-size:12px",
            confirmBtnText: t('accept'),
            closeBtnText: t('decline'),
            onClose: () => {
                createToast(t('please_accept_terms'))
                return false
            },
            onConfirm: () => {
                const text = document.querySelector("#kano_term_confirm_text")
                // 哎呀，你怎么又没认真看😯
                if (text.value.trim() != t("term_confirm_text")) {
                    createToast(t('please_read_terms'))
                    return false
                }
                localStorage.setItem('read_terms', '1')
                fetchWithTimeout(`${KANO_baseURL}/accept_terms`, {
                    method: "post",
                    headers: common_headers,
                }).then(r => r.json()).then(res => {
                    if (res.result == "success") {
                        createToast(t('accept'))
                    }
                }).finally((res) => {
                    //同意后检查弱口令
                    initCheckWeakToken()
                })
                return true
            },
            content: `${t('useTerms')}<div style="font-size: .9rem;margin-top: 10px;"><span>${t('please_input')}:"${t('term_confirm_text')}"</span><input id="kano_term_confirm_text" type="text" style="width: 100%;margin: 6px 0;padding: 6px;"></div>`
        })
        const cache = localStorage.getItem('read_terms')
        if (cache == '1') {
            return
        }
        try {
            if (await getTermsAcceptance()) {
                if (cache != "1") {
                    localStorage.setItem('read_terms', '1')
                }
                return
            }
            showModal(md.id)
        } catch {
            if (cache != "1" && cache != null && cache != undefined) {
                showModal(md.id)
            }
        }
    }
    initTerms()

    const initCheckWeakToken = async () => {
        if (!(await initRequestData())) {
            return null
        }

        // 没同意用户许可就不要显示
        if (!(await getTermsAcceptance())) {
            return null
        }

        if (await checkWeakToken()) {
            const stor_name = 'weakTokenToastLater'
            const threeDaysMill = 259200000
            try {
                const now_exp = localStorage.getItem(stor_name)
                if (now_exp) {
                    if (now_exp - Date.now() > 0) {
                        const t = new Date(now_exp - Date.now())
                        console.log(`弱口令弹窗还剩：${t.getTime() / 1000 / 60 / 60 / 24} 天`);
                        //三天内不提示
                        return
                    }
                } else {
                    throw new Error("now_exp为空")
                }
            } catch {
                console.error("weakTokenToastLater格式不合法,即将删除此stor");
                localStorage.removeItem(stor_name)
            }
            const { el, close } = createFixedToast('weak_token_toast', `
                <div style="pointer-events:all;width:80vw;max-width:300px;">
                <div class="title" style="margin:0" data-i18n="system_notice">${t('system_notice')}</div>
                <p>${t("weak_token_detected")}</p>
                <div style="display:flex;gap:10px">
                    <button id="close_weak_token_toast_btn" style="width:100%;font-size:.64rem;margin-top:5px" data-i18n="change_token_now">${t("change_token_now")}</button>
                    <button id="close_3_days_weak_token_toast_btn" style="width:100%;font-size:.64rem;margin-top:5px" data-i18n="three_days_later">${t("three_days_later")}</button>
                </div>
                </div>
                `, 'red')
            const btn = el.querySelector('#close_weak_token_toast_btn')
            const btn3Days = el.querySelector('#close_3_days_weak_token_toast_btn')

            if (!btn) {
                close()
                return
            }
            btn.onclick = () => {
                close()
                showModal("#changeTokenModal")
            }

            if (!btn3Days) {
                close()
                return
            }
            btn3Days.onclick = () => {
                localStorage.setItem(stor_name, Date.now() + threeDaysMill)
                createToast(t('three_days_later_info'))
                close()
            }
        }
    }
    initCheckWeakToken()

    // 获取消息
    const initMessage = async () => {
        if (!(await initRequestData())) {
            return null
        }
        try {
            const api = 'https://api.kanokano.cn/ufi_tools_report'
            const { device_id: uuid } = await (await fetch(`${KANO_baseURL}/device_id`, {
                headers: common_headers
            })).json()
            if (uuid) {
                const { message, has_read_message } = await (await fetch(`${KANO_baseURL}/proxy/--${api}/get_message/${uuid}`, {
                    headers: common_headers
                })).json()
                if (has_read_message == true || has_read_message == "true") return
                const { text } = parseDOM(message) //过滤掉远程任何的script脚本，防止远程任意代码自动执行
                const { el, close } = createFixedToast('kano_message', `
                    <div style="pointer-events:all;width:80vw;max-width:300px">
                        <div class="title" style="margin:0" data-i18n="system_notice">${t('system_notice')}</div>
                        <div style="margin:10px 0" id="kano_message_inner">${text}</div>
                        <div style="text-align:right">
                            <button style="font-size:.64rem" id="close_message_btn" data-i18n="pay_btn_dismiss">${t('pay_btn_dismiss')}</button>
                        </div>
                    </div>
                    `)
                const btn = el.querySelector('#close_message_btn')
                if (!btn) {
                    close()
                    return
                }
                btn.onclick = async () => {
                    try {
                        const { has_read_message } = await (await fetch(`${KANO_baseURL}/proxy/--${api}/set_read_message/${uuid}`, {
                            method: 'post',
                            headers: common_headers
                        })).json()
                        if (has_read_message) {
                            close()
                        }
                    } catch {
                        try {
                            const { has_read_message } = await (await fetch(`${api}/set_read_message/${uuid}`, {
                                method: 'post'
                            })).json()
                            if (has_read_message) {
                                close()
                            }
                        } catch { }
                    } finally {
                        close()
                    }
                }
            }
        } catch { }
    }
    initMessage()

    const togglePort = async (port, flag, isBootup = false, v6 = false) => {
        try {
            if (!await checkAdvancedFunc()) {
                createToast(t("need_advance_func"), 'red');
                return false;
            }

            const addCmd = (useV6) => {
                const bin = useV6 ? 'ip6tables' : 'iptables';
                return `${bin} -A INPUT -p tcp --dport ${port} -j DROP`;
            };

            const delCmd = (useV6) => addCmd(useV6).replace('-A', '-D');

            // 删除当前系统中的 DROP 规则
            const cleanupCmd = (useV6) => {
                const bin = useV6 ? 'ip6tables' : 'iptables';
                return `for table in filter nat mangle raw security; do ${bin}-save -t $table | grep -- '--dport ${port} .*DROP' | sed 's/-A/-D/' | while read line; do ${bin} $line; done; done`;
            };

            let r0 = await runShellWithRoot(cleanupCmd(false));
            if (!r0.success) return false;
            if (v6) {
                let r0v6 = await runShellWithRoot(cleanupCmd(true));
                if (!r0v6.success) return false;
            }

            const saveBootup = async (cmd, proto) => {
                const line = `${cmd} # UFI-TOOLS ${proto} ${port}`;
                const shell = `grep -qxF '${line}' /sdcard/ufi_tools_boot.sh || echo '${line}' >> /sdcard/ufi_tools_boot.sh`;
                await runShellWithRoot(shell);
            };

            const removeBootup = async (proto) => {
                const pattern = `# UFI-TOOLS ${proto} ${port}`;
                await runShellWithRoot(`sed -i '/${pattern}/d' /sdcard/ufi_tools_boot.sh`);
            };

            const removeAllBootup = async () => {
                await runShellWithRoot(`sed -i '/# UFI-TOOLS .* ${port}/d' /sdcard/ufi_tools_boot.sh`);
            };

            if (!isBootup) {
                await removeAllBootup();
            }

            if (flag) {
                await runShellWithRoot(delCmd(false));
                if (v6) await runShellWithRoot(delCmd(true));
                await removeBootup('v4');
                if (v6) await removeBootup('v6');
            } else {
                await runShellWithRoot(addCmd(false));
                if (v6) await runShellWithRoot(addCmd(true));
                if (isBootup) {
                    await saveBootup(addCmd(false), 'v4');
                    if (v6) await saveBootup(addCmd(true), 'v6');
                }
            }

            return true;
        } catch (e) {
            createToast(e);
            return false;
        }
    };

    const port_iptables = document.querySelector('#port_iptables')
    const dev_bootup = document.querySelector("#dev_bootup")
    const dev_ipv6 = document.querySelector("#dev_ipv6")

    const toggleTTYD = async (flag) => {
        if (!await checkAdvancedFunc()) return createToast(t("need_advance_func"), 'red')
        const bootUp = dev_bootup.checked
        const v6 = dev_ipv6.checked
        const res = togglePort("1146", flag, bootUp, v6)
        if (!res) createToast(t("toast_oprate_failed"), "red")
        createToast(t("toast_oprate_success"), 'green')
    }

    const toggleLogCat = async (flag) => {
        try {
            const { result } = await (await fetchWithTimeout(`${KANO_baseURL}/set_log_status`, {
                method: "POST",
                headers: common_headers,
                body: JSON.stringify({ debug_log_enabled: flag ? true : false })
            })).json()
            if (result.success) {
                throw new Error('Failed to toggle LogCat')
            }
            createToast(t("toast_oprate_success"), 'green')
        }
        catch {
            if (!res) createToast(t("toast_oprate_failed"), "red")
        }
    }

    const resetTTYDPort = () => {
        const port = localStorage.getItem('ttyd_port')
        if (port != '1146') {
            localStorage.setItem('ttyd_port', '1146')
            initTTYD && initTTYD()
            createToast(t('toast_oprate_success'), '')
        }
    }
    let clearUppBtnCounter = 0
    let clearUppBtnTimer = null
    const clearAPPUploadData = async () => {
        clearUppBtnCounter++
        if (clearUppBtnCounter <= 3) {
            clearUppBtnTimer && clearTimeout(clearUppBtnTimer)
            clearUppBtnTimer = setTimeout(() => {
                clearUppBtnCounter = 0
            }, 5000);
            return createToast('Click {num} times to confirm'.replace('{num}', (4 - clearUppBtnCounter)), 'pink', 3000)
        }
        clearUppBtnCounter = 0

        const res = await fetchWithTimeout(`${KANO_baseURL}/delete_all_uploads_data`, {
            method: 'post',
            headers: common_headers
        })
        const { result, deleted_list } = await res.json()
        if (result != "success") {
            createToast(t("toast_oprate_failed"), "red")
            return
        }
        if (deleted_list) {
            let listString = ''
            for (let key in deleted_list) {
                listString += `${key}: <b>${deleted_list[key] ? 'OK' : "FAILED"}</b><br>`
            }
            if (listString.trim() == '') {
                createToast(t('toast_oprate_success'), '')
                return
            }
            const { el, close } = createFixedToast('kano_del_appdata_success', `
                <div style="pointer-events:all;width:80vw;max-width:400px;">
                <div class="title" style="margin:0" data-i18n="system_notice">${t('system_notice')}</div>
                <p>${listString}</p>
                <div style="display:flex;gap:10px">
                    <button id="confirm_kano_del_appdata_toast_btn" style="width:100%;font-size:.64rem;margin-top:5px" data-i18n="close_btn">${t("close_btn")}</button>
                </div>
                </div>
                `, 'red')
            const close_btn = el.querySelector("#confirm_kano_del_appdata_toast_btn")

            if (close_btn) {
                close_btn.onclick = () => {
                    close()
                }
            }
        } else {
            createToast(t('toast_oprate_success'), '')
        }
    }

    const setPort = async (flag) => {
        if (!await checkAdvancedFunc()) return createToast(t("need_advance_func"), 'red')
        const port = port_iptables.value
        const bootUp = dev_bootup.checked
        const v6 = dev_ipv6.checked
        if (!port) return createToast("Please input a valid port (1 - 65535)")
        const res = await togglePort(port, flag, bootUp, v6)
        if (!res) createToast(t("toast_oprate_failed"), "red")
        createToast(t("toast_oprate_success"), 'green')
    }

    //高铁模式
    handleHighRailMode = async (e) => {
        if (!(await initRequestData())) {
            return null
        }
        const HighRailModeAT = "AT+SP5GCMDS=\"set nr param\",35,"
        const target = e.target
        const isEnabled = target.dataset.enabled === '1'
        try {
            if (isEnabled) {
                //关闭高铁模式
                const res = await handleAT(HighRailModeAT + "0", true)
                if (!res) throw new Error('Failed to enable High Rail Mode')
                target.dataset.enabled = '0'
                target.style.backgroundColor = ''
            } else {
                //开启高铁模式
                const res = await handleAT(HighRailModeAT + "1", true)
                if (!res) throw new Error('Failed to enable High Rail Mode')
                target.dataset.enabled = '1'
                target.style.backgroundColor = 'var(--dark-btn-color-active)'
            }
            createToast(t("toast_oprate_success_reboot"), 'green')
        } catch {
            createToast(t('toast_exe_failed'), 'red')
        }
    }

    //初始化休眠选项卡     
    const initSleepTime = async () => {
        const target = document.querySelector("#SLEEP_TIME")
        if (!target) return
        if (!(await initRequestData())) {
            target.disabed = true
            target.style.background = "var(--dark-btn-disabled-color)"
            return null
        }
        target.disabed = false
        target.style.background = ""
        // 从设备获取数据
        const { sleep_sysIdleTimeToSleep } = await getData(new URLSearchParams({
            cmd: "sleep_sysIdleTimeToSleep"
        }))
        if (sleep_sysIdleTimeToSleep == "") {
            target.style.display = 'none'
        } else {
            target.style.display = ''
        }
        target.value = sleep_sysIdleTimeToSleep

    }
    initSleepTime()

    const changeSleepTime = async (e) => {
        if (!(await initRequestData())) {
            createToast(t("toast_need_login"), 'red');
            e.preventDefault()
            return false;
        }
        const target = e.target
        if (!target) return

        try {

            const res = await postData(await login(), {
                goformId: "SET_WIFI_SLEEP_INFO",
                sleep_sysIdleTimeToSleep: target.value
            })

            const { result } = await res.json()

            if (result != "success") {
                throw new Error("fail!")
            }

            createToast(t('toast_oprate_success'), 'green')
            initSleepTime()
        } catch {
            createToast(t('toast_oprate_failed'), 'red')
        }
    }

    //初始化APN信息框内容
    const renderAPNViewModalContet = (res = {}) => {
        // 信息框初始化
        const APNViewModal = document.querySelector('#APNViewModal')
        if (APNViewModal) {
            const profileNameEl = APNViewModal.querySelector('input[name="profile_name"]')
            const apnEl = APNViewModal.querySelector('input[name="apn"]')
            const unameEl = APNViewModal.querySelector('input[name="username"]')
            const pwdEl = APNViewModal.querySelector('input[name="password"]')
            const authMethodEl = APNViewModal.querySelector('input[name="auth_method"]')
            const pdpMethodEl = APNViewModal.querySelector('input[name="pdp_method"]')

            if (profileNameEl) {
                profileNameEl.value = res.apn_m_profile_name || res.m_profile_name || res.profile_name
            }
            if (apnEl) {
                apnEl.value = res.apn_wan_apn || res.apn_ipv6_wan_apn
            }
            if (unameEl) {
                unameEl.value = res.ppp_username_ui || res.apn_ppp_username
            }
            if (pwdEl) {
                pwdEl.value = res.ppp_passwd_ui || res.apn_ppp_passwd
            }
            if (authMethodEl) {
                authMethodEl.value = res.ppp_auth_mode_ui.toLowerCase() || res.apn_ppp_auth_mode.toLowerCase()
            }
            if (pdpMethodEl) {
                pdpMethodEl.value = res.apn_pdp_type
            }
        }
    }

    //初始化APN修改框内容
    const renderAPNEditModalContet = (res = {}) => {
        // 信息框初始化
        const APNEditModal = document.querySelector('#APNEditModal')
        if (APNEditModal) {
            const profileNameEl = APNEditModal.querySelector('input[name="profile_name"]')
            const apnEl = APNEditModal.querySelector('input[name="apn"]')
            const unameEl = APNEditModal.querySelector('input[name="username"]')
            const pwdEl = APNEditModal.querySelector('input[name="password"]')
            const authMethodEl = APNEditModal.querySelector('select[name="auth_method"]')
            const pdpMethodEl = APNEditModal.querySelector('select[name="pdp_method"]')

            if (profileNameEl) {
                profileNameEl.value = res.apn_m_profile_name || res.m_profile_name || res.profile_name
            }
            if (apnEl) {
                apnEl.value = res.apn_wan_apn || ""
            }
            if (unameEl) {
                unameEl.value = res.apn_ppp_username || ""
            }
            if (pwdEl) {
                pwdEl.value = res.apn_ppp_passwd || ""
            }
            if (authMethodEl) {
                authMethodEl.value = res.apn_ppp_auth_mode.toLowerCase()
            }
            if (pdpMethodEl) {
                pdpMethodEl.value = res.apn_pdp_type
            }
        }
    }

    //APN手动与自动切换的点击事件
    const onChangeIsAutoFrofile = async (flag) => {
        const autoProfileEl = document.querySelector('#APNManagementForm #autoProfileEl')
        const profileEl = document.querySelector('#APNManagementForm #profileEl')
        if (autoProfileEl && profileEl) {
            if (flag) {
                autoProfileEl.style.display = ""
                profileEl.style.display = "none"
            } else {
                autoProfileEl.style.display = "none"
                profileEl.style.display = ""
            }
        }
    }

    // APN 编辑框数据提取
    const getAPNEditFormData = ({ index = 0 }) => {
        const APNEditModal = document.querySelector('#APNEditModal')

        if (!APNEditModal) return null
        if (index == null || index == undefined) return null
        const profileNameEl = APNEditModal.querySelector('input[name="profile_name"]') || {}
        const apnEl = APNEditModal.querySelector('input[name="apn"]') || {}
        const unameEl = APNEditModal.querySelector('input[name="username"]') || {}
        const pwdEl = APNEditModal.querySelector('input[name="password"]') || {}
        const authMethodEl = APNEditModal.querySelector('select[name="auth_method"]') || {}
        const pdpMethodEl = APNEditModal.querySelector('select[name="pdp_method"]') || {}

        if (!profileNameEl.value.trim() || !apnEl.value.trim()) {
            return null
        }

        const baseProfile = {
            "profile_name": profileNameEl.value ? profileNameEl.value.trim() : "",
            "wan_dial": "*99#",
            "apn_wan_dial": "*99#",
            "apn_select": "manual",
            "apn_pdp_type": pdpMethodEl.value ? pdpMethodEl.value : "IPv4v6",
            "pdp_type": pdpMethodEl.value ? pdpMethodEl.value : "IPv4v6",
            "apn_pdp_select": "auto",
            "apn_pdp_addr": "",
            "pdp_select": "auto",
            "pdp_addr": "",
            "index": index,
        }

        const v4Profile = {
            "apn_wan_apn": apnEl.value ? apnEl.value.trim() : "",
            "apn_ppp_auth_mode": authMethodEl.value ? authMethodEl.value : "none",
            "apn_ppp_username": unameEl.value ? unameEl.value.trim() : "",
            "apn_ppp_passwd": pwdEl.value ? pwdEl.value.trim() : "",
            "wan_apn": apnEl.value ? apnEl.value.trim() : "",
            "ppp_auth_mode": authMethodEl.value ? authMethodEl.value : "none",
            "ppp_username": unameEl.value ? unameEl.value.trim() : "",
            "ppp_passwd": pwdEl.value ? pwdEl.value.trim() : "",
            "dns_mode": "auto",
            "prefer_dns_manual": "",
            "standby_dns_manual": "",
        }
        const v6Profile = {
            "apn_ipv6_wan_apn": apnEl.value ? apnEl.value.trim() : "",
            "apn_ipv6_ppp_auth_mode": authMethodEl.value ? authMethodEl.value : "none",
            "apn_ipv6_ppp_username": unameEl.value ? unameEl.value.trim() : "",
            "apn_ipv6_ppp_passwd": pwdEl.value ? pwdEl.value.trim() : "",
            "ipv6_wan_apn": apnEl.value ? apnEl.value.trim() : "",
            "ipv6_ppp_auth_mode": authMethodEl.value ? authMethodEl.value : "none",
            "ipv6_ppp_username": unameEl.value ? unameEl.value.trim() : "",
            "ipv6_ppp_passwd": pwdEl.value ? pwdEl.value.trim() : "",
            "ipv6_dns_mode": "auto",
            "ipv6_prefer_dns_manual": "",
            "ipv6_standby_dns_manual": "",
        }
        if (pdpMethodEl.value == "IPv6") {
            return {
                ...baseProfile,
                ...v6Profile
            }
        }

        if (pdpMethodEl.value == "IP") {
            return {
                ...baseProfile,
                ...v4Profile
            }
        }

        if (pdpMethodEl.value == "IPv4v6") {
            return {
                ...baseProfile,
                ...v4Profile,
                ...v6Profile
            }
        }

        return null
    }

    // APN设置
    const initAPNManagement = async () => {
        const btn = document.querySelector('#APNManagement')
        if (!btn) return null
        if (!(await initRequestData())) {
            btn.onclick = () => createToast(t('toast_please_login'), 'red')
            btn.style.background = "var(--dark-btn-disabled-color)"
            return null
        }
        btn.style.background = ""
        const renderData = async () => {
            showModal('#APNManagementModal')
            // 加载数据
            const res = await getAPNData()

            const APNManagementFormEl = document.querySelector('#APNManagementForm')
            const APNManagementForm = document.querySelector('#APNManagementForm .content')
            if (!APNManagementForm) return

            const autoProfileEl = APNManagementForm.querySelector('#autoProfileEl')
            const profileEl = APNManagementForm.querySelector('#profileEl')
            if (autoProfileEl && profileEl) {
                if (res.apn_mode == "auto") {
                    autoProfileEl.style.display = ""
                    profileEl.style.display = "none"
                } else {
                    autoProfileEl.style.display = "none"
                    profileEl.style.display = ""
                }
            }

            const currentAPNEl = APNManagementForm.querySelector('span[name="apn_wan_apn"]')
            if (currentAPNEl) currentAPNEl.textContent = res.apn_wan_apn + ` (${res.profile_name || res.m_profile_name || res.profile_name_ui})`

            const autoApnModeEl = APNManagementForm.querySelector('#autoAPNMode')
            const apnModeEl = APNManagementForm.querySelector('#apnMode')
            if (apnModeEl) {
                if (res.apn_mode == "auto") {
                    autoApnModeEl.checked = true
                } else {
                    apnModeEl.checked = true
                }
            }

            const autoProfile = APNManagementForm.querySelector('#autoProfile')
            if (autoProfile) {
                const option = document.createElement('option')
                option.value = res.apn_auto_profile
                option.textContent = res.apn_m_profile_name || res.m_profile_name || res.profile_name
                autoProfile.innerHTML = res.apn_m_profile_name || res.m_profile_name || res.profile_name
                autoProfile.appendChild(option)
            }

            //手动配置文件下拉列表渲染
            const profile = APNManagementForm.querySelector('select[name="profile"]')

            if (profile) {
                let selectedIndex = -1
                profile.selectedIndex =
                    profile.innerHTML = ''
                for (let i = 0; i < 20; i++) {
                    if (!res["APN_config" + i]) continue
                    const configs = res["APN_config" + i].split('($)')
                    const configs_v6 = res["ipv6_APN_config" + i]
                    if (configs && configs.length) {
                        const option = document.createElement('option')
                        option.value = configs[0] //第一个值为APN名称
                        option.textContent = configs[0]
                        profile.appendChild(option)
                        // 选择当前使用的配置
                        if (configs[0] == (res.m_profile_name || res.profile_name)) {
                            selectedIndex = i
                        }
                    }
                }
                if (selectedIndex == -1) {
                    selectedIndex = profile.querySelectorAll('option').length - 1
                }
                profile.selectedIndex = selectedIndex
            }

            //渲染APN列表（预览）
            renderAPNViewModalContet(res)

            //保存profile
            const onSaveProfile = (method = "add") => {
                return async (e) => {
                    e.preventDefault()
                    if (!(await initRequestData())) {
                        createToast(t("toast_need_login"), 'red');
                        return false;
                    }

                    const manualProfileEl = APNManagementForm.querySelector('#manualProfile')

                    let index = manualProfileEl.selectedIndex

                    // 如果是添加配置的话，index应该是列表总数(+1)
                    if (method == "add") {
                        const options = APNManagementForm.querySelectorAll('#manualProfile option')
                        if (options.length) {
                            index = options.length
                        }
                    }

                    const formData = getAPNEditFormData({ index })

                    if (!formData) {
                        createToast(t("please_input_full_profile"), 'red')
                        return
                    }

                    try {
                        const res = await saveAPNProfile(formData)
                        if (res.result == "success") {
                            createToast(t('toast_save_success'), 'green')
                            closeModal('#APNEditModal', 300, () => {
                                showModal('#APNManagementModal')
                                // 重新加载
                                renderData()
                            })
                        } else {
                            createToast(t('toast_save_failed'), 'red')
                        }
                    } catch (e) {
                        createToast(t('toast_save_failed'), 'red')
                    }
                }
            }

            // 手动模式
            // 绑定添加的事件
            const addAPNBtn = APNManagementForm.querySelector('#addAPNProfile')
            if (addAPNBtn) addAPNBtn.onclick = async (e) => {
                e.preventDefault()
                const title = document.querySelector('#APNEditModal #APN_MOD_TITLE')
                if (title) title.textContent = t("add_apn")
                if (!(await initRequestData())) {
                    createToast(t("toast_need_login"), 'red');
                    return false;
                }
                closeModal('#APNManagementModal', 300, () => {
                    showModal('#APNEditModal')
                    //异步加载数据
                    renderAPNEditModalContet({
                        profile_name: "",
                        apn_wan_apn: "",
                        apn_ppp_username: "",
                        apn_ppp_passwd: "",
                        apn_ppp_auth_mode: "none",
                        apn_pdp_type: "IP",
                    })
                    // 保存
                    const submitBtn = document.querySelector('#APNEditModal button[name="submit"]')
                    if (submitBtn && APNManagementFormEl) {
                        submitBtn.onclick = onSaveProfile("add")
                    }
                })
            }

            // 绑定编辑的事件
            const editAPNBtn = APNManagementForm.querySelector('#editAPNProfile')
            if (editAPNBtn) editAPNBtn.onclick = async (e) => {
                e.preventDefault()
                const title = document.querySelector('#APNEditModal #APN_MOD_TITLE')
                if (title) title.textContent = t("edit_apn")
                if (!(await initRequestData())) {
                    createToast(t("toast_need_login"), 'red');
                    return false;
                }
                closeModal('#APNManagementModal', 300, () => {
                    showModal('#APNEditModal')
                    // 获取当前选中的配置文件index
                    const profileEl = APNManagementForm.querySelector('#profileEl select[name="profile"]')
                    if (profileEl) {
                        const index = profileEl.selectedIndex
                        const config = res["APN_config" + index].split('($)')
                        const config_v6 = res["ipv6_APN_config" + index].split('($)')
                        console.log(config, config_v6);
                        renderAPNEditModalContet({
                            profile_name: config[0] || "",
                            apn_wan_apn: config[1] || "",
                            apn_ppp_username: config[5] || "",
                            apn_ppp_passwd: config[6] || "",
                            apn_ppp_auth_mode: config[4] || "",
                            apn_pdp_type: config[7] || "",
                        })
                    }
                    // 保存
                    const submitBtn = document.querySelector('#APNEditModal button[name="submit"]')
                    if (submitBtn && APNManagementFormEl) {
                        submitBtn.onclick = onSaveProfile("mod")
                    }

                })
            }

            // 绑定删除的事件
            const delAPNBtn = APNManagementForm.querySelector('#delAPNProfile')
            if (delAPNBtn) delAPNBtn.onclick = async (e) => {
                e.preventDefault()
                if (!(await initRequestData())) {
                    createToast(t("toast_need_login"), 'red');
                    return false;
                }
                // 获取当前选中的配置文件index
                const profileEl = APNManagementForm.querySelector('#profileEl select[name="profile"]')
                if (profileEl) {
                    const index = profileEl.selectedIndex
                    try {
                        const res = await deleteAPNProfile(index)
                        if (res && res.result == "success") {
                            createToast(t('toast_delete_success'), 'green')
                            // 重新加载
                            renderData()
                        } else {
                            createToast(t('toast_delete_failed'), 'red')
                        }
                    } catch (e) {
                        createToast(t('toast_delete_failed'), 'red')
                    }
                }
            }

            //绑定切换自动手动事件
            const submitBtn = APNManagementFormEl.querySelector('button[name="submit"]')
            if (submitBtn && APNManagementFormEl) {
                submitBtn.onclick = async (e) => {
                    e.preventDefault()
                    if (!(await initRequestData())) {
                        createToast(t("toast_need_login"), 'red');
                        return false;
                    }
                    const autoAPNModeEl = APNManagementForm.querySelector('#autoAPNMode')
                    const apnModeEl = APNManagementForm.querySelector('#apnMode')
                    let apn_mode = "manual"
                    let profile_name = ""
                    let index = 0
                    if (autoAPNModeEl.checked) {
                        apn_mode = "auto"
                    } else if (apnModeEl.checked) {
                        apn_mode = "manual"
                        const manualProfile = APNManagementForm.querySelector('#manualProfile')
                        if (manualProfile) {
                            profile_name = manualProfile.value
                            index = manualProfile.selectedIndex
                        }
                    }

                    if (apn_mode == "manual" && !profile_name) {
                        return createToast(t('please_select_apn_profile'), 'red')
                    }

                    try {
                        const res = await switchAPNAuto({ isAuto: apn_mode == "auto", index })
                        if (res.result == "success") {
                            createToast(t('toast_oprate_success'), 'green')
                            renderData()
                        } else {
                            createToast(t('toast_oprate_failed'), 'red')
                        }
                    } catch (e) {
                        createToast(t('toast_oprate_failed'), 'red')
                    }
                }
            }
        }
        btn.onclick = renderData
    }
    initAPNManagement()

    //查看APN
    const onViewAPNProfile = async (e) => {
        e.preventDefault()
        if (!(await initRequestData())) {
            createToast(t("toast_need_login"), 'red');
            return false;
        }
        closeModal('#APNManagementModal', 300, () => {
            showModal('#APNViewModal')
            //异步加载数据

        })
    }

    const fetchUSBStatusList = async (el) => {
        try {
            const res = await (await fetchWithTimeout(`${KANO_baseURL}/usb_status`, {
                method: "GET",
                headers: common_headers
            })).json()
            if (!res) { throw new Error('No data') }
            let isGadgetMode = res.details.typec_mode == "gadget"
            el.innerHTML = `<div style="display: flex;margin-bottom:10px;flex-direction:column"><div>${t('max_speed')}：${isGadgetMode ? res.details.gadget_speed : formatSpeed(res.maxSpeed)}</div><div>${t('usb_status')}：${res.details.typec_mode}/${!isGadgetMode ? t('host_usb_exp') : t('device_usb_exp')}</div></div>
            <ul class="deviceList" style="display: flex;flex-direction: column;gap: 10px;">
                ${res.details.devices.map(device => `<li style="padding: 10px;">
                            <div>${t('path')}：${device.path}</div>
                            <div>${t('device_name')}： ${device.product}</div>
                            <div>${t('speed')}：${formatSpeed(device.speed)}</div>
                        </li>`).join('')}
            </ul>`.trim()
        } catch {
            el.innerHTML = `<div style="text-align:center;padding:20px 0">${t('no_usb_list')}</div>`
        }
    }

    //usb管理
    let stopRefreshUSBStatusInterval = null
    const initUSBStatusManagementBtn = async () => {
        const btn = document.querySelector('#USBStatusManagement')
        if (!(await initRequestData())) {
            btn.onclick = () => createToast(t('toast_please_login'), 'red')
            return null
        }
        btn.onclick = async () => {
            showModal('#USBStatusModal')
            //加载数据
            const el = document.querySelector('#USBStatusModal .content')
            if (!el) return
            el.innerHTML = `<div style="text-align:center;padding:20px 0">Loading...</div>`
            stopRefreshUSBStatusInterval && stopRefreshUSBStatusInterval()
            fetchUSBStatusList(el)
            stopRefreshUSBStatusInterval = requestInterval(() => fetchUSBStatusList(el), REFRESH_TIME + 1000)
        }
    }
    initUSBStatusManagementBtn()

    const closeUSBStatusModal = () => {
        closeModal('#USBStatusModal', 300, () => {
            stopRefreshUSBStatusInterval && stopRefreshUSBStatusInterval()
        })
    }

    const handleOpenUploadFilesList = async () => {
        let res = await runShellWithUser(`ls /data/data/com.minikano.f50_sms/files/uploads/`)
        if (!res.success) return createToast(t('read_file_fail'), 'red')
        if (res.content && res.content.content && res.content.content.split("\n") && res.content.content.split("\n").length) {
            let { el, close } = createFixedToast('kano_edit_ufi_media_file_list_message', `
                <div style="pointer-events:all;width:90vw;max-width:800px;">
                    <div class="title" style="margin:0" data-i18n="file_manager">${t("file_manager")}</div>
                    <div style="margin:10px 0;display: flex;flex-direction: column;gap: 6px;max-height: 50vh;overflow: auto;font-size: .7rem;" class="inner">
                      ${res.content.content.split('\n').map(item => (item.trim() ? `<div class="kano_uploads_file_item" data-item="${item}" style="padding: 10px 10px;background: var(--dark-tag-color);border-radius: 6px;display:flex;align-items: center;">
                      <span onclick="copyText({target:{innerText:'/api/uploads/${item}'}})" style="flex:1;overflow: hidden;text-overflow: ellipsis;white-space: nowrap;">${item}</span>
                      <button style="margin-right:6px;padding: 0;display: flex;" onclick="downloadUrl('/api/uploads/${item}','${item}')"><svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" t="1770319174878" viewBox="0 0 1024 1024" version="1.1" p-id="1583" width="20" height="20"><path d="M896 672c-17.066667 0-32 14.933333-32 32v128c0 6.4-4.266667 10.666667-10.666667 10.666667H170.666667c-6.4 0-10.666667-4.266667-10.666667-10.666667v-128c0-17.066667-14.933333-32-32-32s-32 14.933333-32 32v128c0 40.533333 34.133333 74.666667 74.666667 74.666667h682.666666c40.533333 0 74.666667-34.133333 74.666667-74.666667v-128c0-17.066667-14.933333-32-32-32z" fill="var(--dark-text-color)" p-id="1584"/><path d="M488.533333 727.466667c6.4 6.4 14.933333 8.533333 23.466667 8.533333s17.066667-2.133333 23.466667-8.533333l213.333333-213.333334c12.8-12.8 12.8-32 0-44.8-12.8-12.8-32-12.8-44.8 0l-157.866667 157.866667V170.666667c0-17.066667-14.933333-32-32-32s-34.133333 14.933333-34.133333 32v456.533333L322.133333 469.333333c-12.8-12.8-32-12.8-44.8 0-12.8 12.8-12.8 32 0 44.8l211.2 213.333334z" fill="var(--dark-text-color)" p-id="1585"/></svg></button>
                      <button style="margin-right:6px;padding: 0;display: flex;" onclick="openLink('/api/uploads/${item}')"><svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" t="1770319810359" viewBox="0 0 1024 1024" version="1.1" p-id="3490" width="20" height="20"><path d="M942.2 486.2C847.4 286.5 704.1 186 512 186c-192.2 0-335.4 100.5-430.2 300.3-7.7 16.2-7.7 35.2 0 51.5C176.6 737.5 319.9 838 512 838c192.2 0 335.4-100.5 430.2-300.3 7.7-16.2 7.7-35 0-51.5zM512 766c-161.3 0-279.4-81.8-362.7-254C232.6 339.8 350.7 258 512 258c161.3 0 279.4 81.8 362.7 254C791.5 684.2 673.4 766 512 766z" p-id="3491" fill="var(--dark-text-color)"/><path d="M508 336c-97.2 0-176 78.8-176 176s78.8 176 176 176 176-78.8 176-176-78.8-176-176-176z m0 288c-61.9 0-112-50.1-112-112s50.1-112 112-112 112 50.1 112 112-50.1 112-112 112z" p-id="3492" fill="var(--dark-text-color)"/></svg></button>
                      <button class="delete_file" style="padding: 0;display: flex;"><svg width="20px" height="20px" viewBox="0 0 1024 1024" version="1.1" xmlns="http://www.w3.org/2000/svg"><path fill="var(--dark-text-color)" d="M736 352.032L736.096 800h-0.128L288 799.968 288.032 352 736 352.032zM384 224h256v64h-256V224z m448 64h-128V202.624C704 182.048 687.232 160 640.16 160h-256.32C336.768 160 320 182.048 320 202.624V288H192a32 32 0 1 0 0 64h32V799.968C224 835.296 252.704 864 288.032 864h447.936A64.064 64.064 0 0 0 800 799.968V352h32a32 32 0 1 0 0-64z"></path><path fill="var(--dark-text-color)" d="M608 690.56a32 32 0 0 0 32-32V448a32 32 0 1 0-64 0v210.56a32 32 0 0 0 32 32M416 690.56a32 32 0 0 0 32-32V448a32 32 0 1 0-64 0v210.56a32 32 0 0 0 32 32"></path></svg></button></div>` : "")).join('')}
                    </div>
                    <div style="text-align:right">
                        <button style="font-size:.64rem" id="upload_media_file_btn" data-i18n="upload_file_limit_100mb">${t('upload_file_limit_100mb')}</button>
                        <button style="font-size:.64rem" id="close_edit_media_file_list_message_btn" data-i18n="close_btn">${t('close_btn')}</button>
                    </div>
                </div>
                `)

            //文件列表
            let filesEl = document.querySelectorAll('#kano_edit_ufi_media_file_list_message .kano_uploads_file_item')
            filesEl.forEach(el => {
                let data = el.dataset.item
                if (data && data.trim()) {
                    let elBtn = el.querySelector('.delete_file')
                    if (!elBtn) return
                    let delCountDown = 3
                    let delTimer = null
                    elBtn.onclick = async () => {
                        let delFile = data.trim()
                        delCountDown--
                        delTimer && clearTimeout(delTimer)
                        delTimer = setTimeout(() => {
                            delCountDown = 3
                        }, 3000);
                        if (delCountDown > 0) {
                            createToast(t('click_times_to_delete').replaceAll("$count$", ` ${delCountDown} `))
                            return
                        }
                        delCountDown = 3
                        try {
                            const { result, error } = await (await fetchWithTimeout(`${KANO_baseURL}/delete_img`, {
                                method: "POST",
                                headers: common_headers,
                                body: JSON.stringify({
                                    file_name: delFile
                                })
                            })).json()
                            if (result == "success") {
                                createToast(t('toast_delete_success'), "pink")
                                el.remove()
                            } else {
                                createToast(t('toast_delete_failed') + error, "red")
                            }
                        } catch (e) {
                            createToast(t('toast_delete_failed') + e, "red")
                        }
                    }
                }
            })
            let btn = el.querySelector('#close_edit_media_file_list_message_btn')
            let uploadBtn = el.querySelector('#upload_media_file_btn')

            if (!btn) {
                close()
                return
            }
            btn.onclick = async () => {
                close()
            }

            if (uploadBtn) {
                uploadBtn.onclick = () => {
                    let fileInput = document.createElement('input')
                    fileInput.type = "file"
                    const handleFileChange = async (event) => {
                        let file = event.target.files[0];
                        if (!file) return
                        let url = await uploadFileKano(file, true)
                        if (!url) return
                        createToast(`${url} ${t('toast_upload_success')}!`, "pink", 8000)
                        close()
                        setTimeout(() => {
                            handleOpenUploadFilesList()
                        }, 400);
                        fileInput.removeEventListener('change', handleFileChange);
                        fileInput = null;
                    }
                    fileInput.addEventListener('change', handleFileChange)
                    fileInput.click()
                }
            }


        } else {
            createToast(t('no_file'), 'pink')
        }
    }

    const showNetConnInfoModal = async () => {
        if (!(await initRequestData())) {
            createToast(t('toast_please_login'), 'red')
            return null
        }
        const id = "#kano_net_info_modal"
        const res = await getNetConnInfo()
        let intervalFn = requestInterval(() => {
            getNetConnInfo().then(res => {
                const contentEl = document.querySelector('#kano_net_info_modal .content')
                if (contentEl) {
                    contentEl.innerHTML = renderConnectStatusContent(res)
                }
            })
        }, REFRESH_TIME + 114, id)
        const md = createModal({
            showConfirm: false,
            name: id.replace('#', ''),
            isMask: false,
            titleI18nKey: 'network_conn_info',
            title: t('network_conn_info'),
            maxWidth: "400px",
            contentStyle: "font-size:.7rem;line-height:1.5",
            onClose: () => {
                intervalFn && intervalFn()
                return true
            },
            content: renderConnectStatusContent(res)
        })
        md.id && showModal(md.id)
    }

    //官方后台貌似对PIN超出次数的判定有问题，PIN次数用完后提示输入PUK，此时换卡也不会变更状态，用户只能恢复出厂设置，所以此功能不会继续实现
    // let simCardPinDisabled = false
    // const initSimCardPin = async () => {
    //     if (!initRequestData()) {
    //         return null
    //     }
    //     //检测是否有SIM卡锁定
    //     const res = await getSimPinStatus()

    //     if (res.pinnumber <= 0 || res.modem_main_state == "modem_waitpuk") {
    //         createToast("您的PIN次数已用尽，请前往官方后台输入PUK码解锁", 'red', 10000)
    //         return null
    //     }

    //     if (!(res.modem_main_state == "modem_waitpin")) {
    //         return null
    //     }

    //     //暂停数据刷新
    //     stopRefresh()

    //     const md = createModal({
    //         name: "kano_pin_modal",
    //         isMask: true,
    //         title: "请输入SIM卡PIN码",
    //         maxWidth: "400px",
    //         contentStyle: "font-size:12px",
    //         onClose: () => {
    //             return true
    //         },
    //         onConfirm: async () => {
    //             //再次获取数据
    //             const res1 = await getSimPinStatus()
    //             if (res1.pinnumber <= 0) {
    //                 createToast("您的PIN次数已用尽，请前往官方后台输入PUK码解锁", 'red')
    //                 return false
    //             }
    //             const el = document.querySelector('#simPinInput')
    //             if (!el) {
    //                 console.error("没有找到#simPinInput元素")
    //                 return false
    //             }
    //             const pinNumber = el.value.trim()
    //             if (pinNumber.length < 4) {
    //                 createToast("PIN不得小于4位数", 'pink')
    //                 return false
    //             }
    //             //解锁
    //             if (simCardPinDisabled) {
    //                 createToast("正在解锁中，请勿重复点击", 'pink')
    //                 return false
    //             }

    //             simCardPinDisabled = true

    //             const { close: closeLoadingEl } = createFixedToast("unlocking_toast", '解锁中...')
    //             try {
    //                 if (!(await initRequestData())) {
    //                     return false
    //                 }
    //                 const cookie = await login()
    //                 if (!cookie) {
    //                     createToast(t('toast_request_error'), 'red')
    //                     return false
    //                 }
    //                 let res1 = await (await postData(cookie, {
    //                     goformId: 'ENTER_PIN',
    //                     PinNumber: pinNumber,
    //                 })).json()

    //                 if (res1.result == 'success') {
    //                     createToast("PIN解锁成功", 'green')
    //                     startRefresh()
    //                     return true
    //                 } else {
    //                     createToast("PIN解锁失败，请重试", 'red')
    //                 }
    //                 //更新Pin次数
    //                 const pinNumEl = document.querySelector('#pinNumber')
    //                 const res_refresh = await getSimPinStatus()
    //                 if (pinNumEl) {
    //                     pinNumEl.textContent = res_refresh.pinnumber
    //                 }
    //                 return false
    //             } catch (e) {
    //                 console.error(e.message)
    //                 return false
    //             } finally {
    //                 simCardPinDisabled = false
    //                 closeLoadingEl()
    //             }
    //         },
    //         content: `<div class="content" style="font-size:12px;margin:10px 0;padding:0 4px;">
    //    <p style="color:red;margin-top:0" >PIN 剩余次数：<strong id="pinNumber">${res.pinnumber}</strong></p>
    //    <input type="password" id="simPinInput" placeholder="SIM卡PIN码" style="width:100%;padding:8px">
    // </div>`
    //     })
    //     showModal(md.id)
    // }
    // initSimCardPin()
    //挂载方法到window
    const methods = {
        showNetConnInfoModal,
        handleOpenUploadFilesList,
        clearAPPUploadData,
        closeUSBStatusModal,
        onCloseChangeTokenForm,
        handleChangeToken,
        toggleLogCat,
        changeResServer,
        onChangeIsAutoFrofile,
        onViewAPNProfile,
        changeSleepTime,
        setPort,
        resetTTYDPort,
        initTTYD,
        togglePort,
        toggleTTYD,
        unlockAllBand,
        handleForceIMEI,
        handlePluginStoreSearchInput,
        installPluginFromStore,
        saveCellularTestUrl,
        onThreadNumChange,
        closeCellularTest,
        handleCellularLoopMode,
        startCellularTestRealtime,
        runSingleTest,
        getBoot,
        handleDisableFOTA,
        refreshTask,
        savePluginSetting,
        fillAction,
        closeAddTask,
        addTask,
        editTask,
        handleSubmitTask,
        clearPluginText,
        pluginExport,
        closeAdvanceToolsModal,
        syncTheme,
        switchCpuCore,
        changeRefreshRate,
        onPluginBtn,
        handlePluginFileUpload,
        OP,
        onLANModalSubmit,
        switchSmsForwardMethodTab,
        handleSmsForwardCurlForm,
        handleSmsForwardForm,
        handleSmsForwardDingTalkForm,
        handleShell,
        enableTTYD,
        changeWIFISwitch,
        unlockAllCell,
        sendSMS,
        deleteSMS,
        deleteAndReSendSms,
        resetShowList,
        handleWIFIManagementFormSubmit,
        handleScheduleRebootFormSubmit,
        handleWifiEncodeChange,
        handleFileUpload,
        handleATFormSubmit,
        handleShowPassword,
        submitBandForm,
        submitCellForm,
        resetTheme,
        handleSubmitBg,
        disableButtonWhenExecuteFunc,
        startTest,
        handleLoopMode,
        onClosePayModal,
        handleTTYDFormSubmit,
        handleQosAT,
        handleSambaPath,
        handleAT,
        onSelectCellRow,
        handleClosePayModal,
        toggleCellInfoRefresh
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

    // 初始化语言包
    (() => {
        const savedLang = localStorage.getItem(LANG_STORAGE_KEY);
        const langToLoad = savedLang || detectBrowserLang();
        loadLanguage(langToLoad);
    })()
}
