function SHA256(e) { function t(e, t) { var n = (65535 & e) + (65535 & t); return (e >> 16) + (t >> 16) + (n >> 16) << 16 | 65535 & n } function n(e, t) { return e >>> t | e << 32 - t } function r(e, t) { return e >>> t } function o(e, t, n) { return e & t ^ ~e & n } function i(e, t, n) { return e & t ^ e & n ^ t & n } function a(e) { return n(e, 2) ^ n(e, 13) ^ n(e, 22) } function s(e) { return n(e, 6) ^ n(e, 11) ^ n(e, 25) } function c(e) { return n(e, 7) ^ n(e, 18) ^ r(e, 3) } function u(e) { return n(e, 17) ^ n(e, 19) ^ r(e, 10) } var l = 8, d = 1; return e = function (e) { e = e.replace(/\r\n/g, "\n"); for (var t = "", n = 0; n < e.length; n++) { var r = e.charCodeAt(n); r < 128 ? t += String.fromCharCode(r) : r > 127 && r < 2048 ? (t += String.fromCharCode(r >> 6 | 192), t += String.fromCharCode(63 & r | 128)) : (t += String.fromCharCode(r >> 12 | 224), t += String.fromCharCode(r >> 6 & 63 | 128), t += String.fromCharCode(63 & r | 128)) } return t }(e), function (e) { for (var t = d ? "0123456789ABCDEF" : "0123456789abcdef", n = "", r = 0; r < 4 * e.length; r++)n += t.charAt(e[r >> 2] >> 8 * (3 - r % 4) + 4 & 15) + t.charAt(e[r >> 2] >> 8 * (3 - r % 4) & 15); return n }(function (e, n) { var r, l, d, p, h, f, m, g, _, b, v, $, S = new Array(1116352408, 1899447441, 3049323471, 3921009573, 961987163, 1508970993, 2453635748, 2870763221, 3624381080, 310598401, 607225278, 1426881987, 1925078388, 2162078206, 2614888103, 3248222580, 3835390401, 4022224774, 264347078, 604807628, 770255983, 1249150122, 1555081692, 1996064986, 2554220882, 2821834349, 2952996808, 3210313671, 3336571891, 3584528711, 113926993, 338241895, 666307205, 773529912, 1294757372, 1396182291, 1695183700, 1986661051, 2177026350, 2456956037, 2730485921, 2820302411, 3259730800, 3345764771, 3516065817, 3600352804, 4094571909, 275423344, 430227734, 506948616, 659060556, 883997877, 958139571, 1322822218, 1537002063, 1747873779, 1955562222, 2024104815, 2227730452, 2361852424, 2428436474, 2756734187, 3204031479, 3329325298), y = new Array(1779033703, 3144134277, 1013904242, 2773480762, 1359893119, 2600822924, 528734635, 1541459225), C = new Array(64); e[n >> 5] |= 128 << 24 - n % 32, e[15 + (n + 64 >> 9 << 4)] = n; for (var _ = 0; _ < e.length; _ += 16) { r = y[0], l = y[1], d = y[2], p = y[3], h = y[4], f = y[5], m = y[6], g = y[7]; for (var b = 0; b < 64; b++)C[b] = b < 16 ? e[b + _] : t(t(t(u(C[b - 2]), C[b - 7]), c(C[b - 15])), C[b - 16]), v = t(t(t(t(g, s(h)), o(h, f, m)), S[b]), C[b]), $ = t(a(r), i(r, l, d)), g = m, m = f, f = h, h = t(p, v), p = d, d = l, l = r, r = t(v, $); y[0] = t(r, y[0]), y[1] = t(l, y[1]), y[2] = t(d, y[2]), y[3] = t(p, y[3]), y[4] = t(h, y[4]), y[5] = t(f, y[5]), y[6] = t(m, y[6]), y[7] = t(g, y[7]) } return y }(function (e) { for (var t = Array(), n = (1 << l) - 1, r = 0; r < e.length * l; r += l)t[r >> 5] |= (e.charCodeAt(r / l) & n) << 24 - r % 32; return t }(e), e.length * l)) }
function gsmEncode(text) { function encodeText(text) { let encoded = []; for (let i = 0; i < text.length; i++) { const char = text[i]; const codePoint = char.codePointAt(0); if (codePoint <= 0xFFFF) { encoded.push((codePoint >> 8) & 0xFF); encoded.push(codePoint & 0xFF) } else { const highSurrogate = 0xD800 + ((codePoint - 0x10000) >> 10); const lowSurrogate = 0xDC00 + ((codePoint - 0x10000) & 0x3FF); encoded.push((highSurrogate >> 8) & 0xFF); encoded.push(highSurrogate & 0xFF); encoded.push((lowSurrogate >> 8) & 0xFF); encoded.push(lowSurrogate & 0xFF) } } return encoded } function toHexString(byteArray) { return byteArray.map(byte => byte.toString(16).padStart(2, '0')).join('') } const encodedBytes = encodeText(text); return toHexString(encodedBytes) }

let KANO_baseURL = '/api'
let KANO_PASSWORD = null
let KANO_TOKEN = null
let ACCEPT_TERMS = false
let KANO_COOKIE = null

const originFetch = window.fetch

const common_headers = {
    referer: KANO_baseURL + '/index.html',
    host: KANO_baseURL,
    origin: KANO_baseURL,
    authorization: KANO_TOKEN
};

(() => {
    const of = window.fetch

    function hmacSignature(secret, data) {
        const hmacMd5 = CryptoJS.HmacMD5(data, secret)
        const hmacMd5Bytes = CryptoJS.enc.Hex.parse(hmacMd5.toString())

        const mid = Math.floor(hmacMd5Bytes.sigBytes / 2)
        const part1 = CryptoJS.lib.WordArray.create(hmacMd5Bytes.words.slice(0, mid / 4), mid)
        const part2 = CryptoJS.lib.WordArray.create(hmacMd5Bytes.words.slice(mid / 4), mid)

        const sha1 = CryptoJS.SHA256(part1)
        const sha2 = CryptoJS.SHA256(part2)
        const finalHash = CryptoJS.SHA256(sha1.concat(sha2))

        return finalHash.toString(CryptoJS.enc.Hex)
    }

    window.fetch = async (input, init = {}) => {
        const headers = new Headers(init.headers || {})
        const t = Date.now()
        const method = (init.method || 'GET').toUpperCase()

        if (typeof input === 'string' && input.startsWith('/api/proxy')) {
            let token = common_headers.authorization
            if (!token) {
                token = localStorage.getItem('kano_sms_token')
            }
            if (token) {
                headers.set('authorization', token)
            }
        }

        let urlPath = ''
        try {
            const url = new URL(input, window.location.origin)
            urlPath = url.pathname
        } catch {
            urlPath = input
        }

        const signature = hmacSignature('minikano_kOyXz0Ciz4V7wR0IeKmJFYFQ20jd', 'minikano' + method + urlPath + t)
        headers.set('kano-t', t)
        headers.set('kano-sign', signature)

        return of(input, { ...init, headers })
    }
})()

function originFetchWithTimeout(url = '', options = {}, timeout = 10000) {
    const controller = new AbortController()
    const tid = setTimeout(() => controller.abort(), timeout)
    return originFetch(url, {
        ...options,
        signal: controller.signal
    }).finally(() => {
        clearTimeout(tid)
    })
}

function fetchWithTimeout(url = '', options = {}, timeout = 10000) {
    const controller = new AbortController()
    const tid = setTimeout(() => controller.abort(), timeout)
    return fetch(url, {
        ...options,
        signal: controller.signal,
        headers: { ...common_headers, ...(options.headers || {}) }
    }).finally(() => {
        clearTimeout(tid)
    })
}

async function apiJson(url, options = {}, timeout = 5000) {
    const res = await fetchWithTimeout(url, options, timeout)
    const text = await res.text()
    let data = null
    try {
        data = text ? JSON.parse(text) : null
    } catch {
        data = null
    }
    if (!res.ok) {
        const error = new Error(data?.error || text || `HTTP ${res.status}`)
        error.status = res.status
        error.data = data
        throw error
    }
    return data
}

const unsupportedTokenOnly = async () => {
    throw new Error('This feature was removed from the frontend because it depends on deprecated device-side requests.')
}

const login = async () => null
const logout = async () => null
const getLD = async () => null
const getRD = async () => null
const getUFIInfo = async () => null
const processAD = async () => null
const postData = unsupportedTokenOnly
const getData = async () => ({})
const reboot = unsupportedTokenOnly
const sendSms_UFI = unsupportedTokenOnly
const removeSmsById = unsupportedTokenOnly
const readSmsByIds = async () => []
const getSmsInfo = async () => ({ messages: [] })
const getDataUsage = async () => null
const getAPNData = async () => null
const saveAPNProfile = unsupportedTokenOnly
const deleteAPNProfile = unsupportedTokenOnly
const switchAPNAuto = unsupportedTokenOnly
const getSimPinStatus = async () => null

const getUFIData = async () => {
    try {
        return await apiJson(`${KANO_baseURL}/baseDeviceInfo`)
    } catch {
        return null
    }
}

async function adbKeepAlive() {
    try {
        const { result } = await apiJson(`${KANO_baseURL}/adb_alive`)
        return result != null && result === 'true'
    } catch {
        return false
    }
}

const getCustomHead = async () => {
    try {
        const { text } = await apiJson(`${KANO_baseURL}/get_custom_head`)
        return text || ''
    } catch {
        return ''
    }
}

const setCustomHead = async (text = '') => {
    try {
        const { result, error } = await apiJson(`${KANO_baseURL}/set_custom_head`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text })
        })
        return { result, error }
    } catch (e) {
        return { result: null, error: e.message }
    }
}

const runShellWithRoot = async (cmd = '', timeout = 10000) => {
    try {
        const { result, error } = await apiJson(`${KANO_baseURL}/root_shell`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                command: cmd.trim(),
                timeout
            })
        }, timeout)
        return error ? { success: false, content: error } : { success: true, content: result }
    } catch (e) {
        return { success: false, content: e.message }
    }
}

const runShellWithUser = async (cmd = '', timeout = 10000) => {
    try {
        const { result, error } = await apiJson(`${KANO_baseURL}/user_shell`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                command: cmd.trim()
            })
        }, timeout)
        return error ? { success: false, content: error } : { success: true, content: result }
    } catch (e) {
        return { success: false, content: e.message }
    }
}

const updateAdminPsw = async (newPsw) => {
    try {
        const { result, error } = await apiJson(`${KANO_baseURL}/update_admin_pwd`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                password: newPsw
            })
        })
        return { result, error }
    } catch (e) {
        return { result: null, error: e.message }
    }
}

const getTermsAcceptance = async () => {
    try {
        const res = await apiJson(`${KANO_baseURL}/version_info`)
        ACCEPT_TERMS = res.accept_terms && res.accept_terms.toString() === 'true'
        return ACCEPT_TERMS
    } catch {
        return false
    }
}

const getNetConnInfo = async () => {
    try {
        const res = await apiJson(`${KANO_baseURL}/connInfo`)
        if (res.result === 'success') {
            return res.data
        }
    } catch (e) {
        console.error('getNetConnInfo Error:', e)
    }
    return null
}
