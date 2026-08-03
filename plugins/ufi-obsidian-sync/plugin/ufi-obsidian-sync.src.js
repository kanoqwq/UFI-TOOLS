//<script>
/* =============================================================================
 * UFI Sync Node — UFI-TOOLS 插件
 * -----------------------------------------------------------------------------
 * 把随身 WiFi 变成持续在线的第三同步节点。同步内核（Syncthing）是插件的内部
 * 组件：安装 / 初始化 / 启停 / 看门狗 / 版本约束 / 状态 / 卸载全部由本插件完成。
 *
 * 要同步哪些仓库、信任哪些设备，都在面板里配置，不需要改源码。
 *
 * 与 root_shell 的相处之道（踩过的坑）：
 *   - timeout 不能超过 60 秒，否则服务端直接返回「请检查命令输入格式」。
 *     所以安装是后台任务 + 前端轮询进度，没有任何长时间阻塞调用。
 *   - 单条命令不宜过长，脚本与配置按 800 字符分段写入。
 *
 * 同步内核版本：默认 1.30.0。
 *   Syncthing 2.x 为了 SQLite 后端改用 CGO 构建，官方 linux-arm64 二进制动态
 *   链接 glibc，而 Android 用 bionic libc，装上也执行不了。1.30.0 是最后一个
 *   纯 Go 静态构建，且与 2.x 协议兼容。
 *
 * 第三方声明：Syncthing 由 The Syncthing Authors 维护，依 MPL-2.0
 * 分发。安装器保留上游 LICENSE；详见 THIRD_PARTY_NOTICES.md。
 *
 * 安全约束：
 *   - 动作固定枚举；输入框只有版本号、仓库 ID/名称、设备 ID/名称，全部强校验。
 *   - 配置以 base64 传输并在设备端二次校验，杜绝命令注入。
 *   - 不读取 / 不显示 / 不存储 Syncthing API key、设备证书、后台密码。
 *   - Syncthing GUI 只绑定 127.0.0.1:8384，不对外暴露。
 *   - 卸载默认保留仓库副本；删除数据是需要二次确认的独立动作。
 *
 * 构建产物由 build.sh 生成，请勿直接编辑 dist/ 下的文件。
 * ========================================================================== */
(() => {
  'use strict';

  const VERSION = '2.3.1';
  const PANEL_ID = 'UFI_OBSIDIAN_SYNC';
  const ROOT = '/data/data/com.minikano.f50_sms/files/ufisync';
  const SH = ROOT + '/ufisync.sh';
  const CONF_B64 = ROOT + '/sync.conf.b64';
  const SH_B64 = '__UFISYNC_SH_B64__';
  const CHUNK = 800;
  const MAX_TIMEOUT = 60000;
  const PURGE_CONFIRM = 'CONFIRM-DELETE-VAULT-COPIES';
  const TARBALL_BYTES = 12000000;
  const DEFAULT_KERNEL = '1.30.0';
  const PRIVILEGED_USER_WARNING =
    /Syncthing should not run as a privileged or system user/i;

  const RE_FOLDER = /^[A-Za-z0-9._-]{1,64}$/;
  const MAX_FOLDERS = 20;
  const MAX_DEVICES = 10;

  /* ---------------------------------------------------------------------- */
  /* Toast                                                                   */
  /* ---------------------------------------------------------------------- */
  const ToastManager = {
    current: null,
    clear() {
      try { if (this.current && typeof this.current.remove === 'function') this.current.remove(); }
      catch (e) { /* 忽略 */ }
      this.current = null;
    },
    _show(msg, color, ms) {
      this.clear();
      if (typeof createToast === 'function') {
        const r = createToast(msg, color, ms);
        this.current = (r && typeof r.remove === 'function') ? r : null;
      } else { console.log('[ufisync]', msg); }
    },
    success(m, ms = 4000) { this._show(m, 'green', ms); },
    error(m, ms = 8000) { this._show(m, 'red', ms); },
    warning(m, ms = 5000) { this._show(m, 'orange', ms); },
    info(m, ms = 3000) { this._show(m, 'blue', ms); }
  };

  /* ---------------------------------------------------------------------- */
  /* 权限与口令检查                                                          */
  /* ---------------------------------------------------------------------- */
  const WEAK = ['admin', 'password', '666', '6666', '12345', '123456', '1234567',
    '12345678', '123456789', '1234567890', 'root'];

  const checkWeakToken = () => {
    try {
      if (typeof SHA256 !== 'function' || !KANO_TOKEN) return false;
      const t = String(KANO_TOKEN).toUpperCase();
      return WEAK.some((w) => SHA256(w) === t);
    } catch (e) { return false; }
  };

  const guard = async () => {
    if (checkWeakToken()) {
      ToastManager.error('🚨 检测到 UFI-TOOLS 使用弱口令。本插件会以 root 装常驻后台服务，' +
        '请先改成复杂口令再操作！', 10000);
      return false;
    }
    const res = await runShellWithRoot('whoami', 15000);
    if (!(res && res.content && res.content.includes('root'))) {
      ToastManager.error('❌ 未开启高级功能（无 root），无法安装或控制同步内核');
      return false;
    }
    return true;
  };

  /* ---------------------------------------------------------------------- */
  /* 动作白名单                                                              */
  /* ---------------------------------------------------------------------- */
  const ACTIONS = {
    preflight: { label: '环境体检', timeout: 60000, priv: true },
    diag: { label: '诊断', timeout: 45000, priv: true },
    install: { label: '安装', timeout: 30000, priv: true },
    'install-status': { label: '安装进度', timeout: 20000, priv: false },
    init: { label: '初始化', timeout: 45000, priv: true },
    'get-config': { label: '读取配置', timeout: 20000, priv: false },
    'set-config': { label: '保存配置', timeout: 30000, priv: true },
    'apply-config': { label: '应用配置', timeout: 60000, priv: true },
    status: { label: '状态', timeout: 60000, priv: false },
    start: { label: '启动', timeout: 45000, priv: true },
    stop: { label: '停止', timeout: 45000, priv: true },
    restart: { label: '重启', timeout: 60000, priv: true },
    scan: { label: '立即同步', timeout: 60000, priv: true },
    'tail-log': { label: '查看日志', timeout: 30000, priv: false },
    uninstall: { label: '卸载', timeout: 60000, priv: true },
    'purge-data': { label: '删除副本', timeout: 60000, priv: true },
    version: { label: '版本', timeout: 15000, priv: false }
  };

  const shq = (s) => "'" + String(s).replace(/'/g, "'\\''") + "'";
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const shell = (cmd, timeout) => runShellWithRoot(cmd, Math.min(timeout || 30000, MAX_TIMEOUT));

  const run = (action, arg) => {
    if (!Object.prototype.hasOwnProperty.call(ACTIONS, action)) {
      return Promise.resolve({ success: false, content: '非法动作：' + action });
    }
    let cmd = 'sh ' + SH + ' ' + action;
    if (arg !== undefined && arg !== null && arg !== '') {
      const ok =
        (action === 'tail-log' && /^\d{1,3}$/.test(String(arg))) ||
        (action === 'purge-data' && String(arg) === PURGE_CONFIRM);
      if (!ok) return Promise.resolve({ success: false, content: '参数不合法，已拒绝执行' });
      cmd += ' ' + arg;
    }
    return shell(cmd, ACTIONS[action].timeout).then((result) => {
      const content = String(result && result.content || '').trim();
      if (!result) return { success: false, content: '设备未返回执行结果' };
      if (result.success === false) return result;
      if (!content) return { ...result, success: false, content: '设备未返回执行结果' };
      // 部分 UFI-TOOLS 固件会把设备脚本的非零退出包装成 HTTP success=true。
      // 在统一入口降级，避免启动、停止、初始化等普通动作各自漏判 FATAL。
      if (/\bFATAL\b/i.test(content)) return { ...result, success: false, content };
      return result;
    });
  };

  /* ---------------------------------------------------------------------- */
  /* 分段写入设备文件（脚本本体 / 配置）                                       */
  /* ---------------------------------------------------------------------- */
  const pushB64 = async (b64, target, label) => {
    const chunks = [];
    for (let i = 0; i < b64.length; i += CHUNK) chunks.push(b64.slice(i, i + CHUNK));
    const r0 = await shell(`mkdir -p ${ROOT} && rm -f ${target}`, 20000);
    if (r0 && r0.success === false) throw new Error('准备目录失败：' + r0.content);
    for (let i = 0; i < chunks.length; i++) {
      progress(`${label} ${i + 1}/${chunks.length}`, ((i + 1) / chunks.length) * 100);
      const r = await shell(`printf '%s' ${shq(chunks[i])} >> ${target}`, 20000);
      if (r && r.success === false) throw new Error(`${label} 第 ${i + 1} 段失败：${r.content}`);
    }
  };

  const b64encode = (text) => btoa(unescape(encodeURIComponent(text)));

  const deployScript = async () => {
    // 候选脚本必须在目标文件同目录完成全部校验，最后用 rename(2) 语义的
    // mv 原子切换。任何一步失败都只会留下（随后清理）旁路文件，不会截断
    // 当前仍在工作的 ufisync.sh。随机后缀也避免多个管理页面互相覆盖临时文件。
    const nonce = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    const encoded = `${SH}.deploy-${nonce}.b64`;
    const candidate = `${SH}.deploy-${nonce}.new`;
    const fail = (stage, result) => {
      const detail = result && result.content ? `：${String(result.content).trim()}` : '';
      throw new Error(`控制脚本${stage}失败${detail}`);
    };

    try {
      await pushB64(SH_B64, encoded, '写入控制脚本');
      progress('解码控制脚本', null);
      const decoded = await shell(
        `base64 -d ${encoded} > ${candidate} 2>/dev/null || busybox base64 -d ${encoded} > ${candidate}`,
        20000);
      if (!decoded || decoded.success === false) fail('解码', decoded);

      const nonempty = await shell(`test -s ${candidate}`, 15000);
      if (!nonempty || nonempty.success === false) fail('完整性校验（文件为空）', nonempty);

      const syntax = await shell(`sh -n ${candidate}`, 15000);
      if (!syntax || syntax.success === false) fail('语法校验', syntax);

      const version = await shell(`sh ${candidate} version`, 15000);
      const expected = `ufisync ${VERSION}`;
      const reported = String(version && version.content || '').trim();
      const versionMatch = reported.match(/^ufisync\s+(\d+\.\d+\.\d+)(?:\s|$)/);
      if (!version || version.success === false || !versionMatch || versionMatch[1] !== VERSION) {
        fail(`版本校验（应为 ${expected}）`, version);
      }

      const switched = await shell(`chmod 700 ${candidate} && mv -f ${candidate} ${SH}`, 20000);
      if (!switched || switched.success === false) fail('原子替换', switched);
      return reported;
    } finally {
      // 清理失败不应把已经成功切换的部署误报成失败；临时文件名不含用户输入。
      try { await shell(`rm -f ${encoded} ${candidate}`, 15000); } catch (e) { /* 忽略 */ }
    }
  };

  /* ---------------------------------------------------------------------- */
  /* 同步配置                                                                */
  /* ---------------------------------------------------------------------- */
  let cfg = { folders: [], devices: [] };
  let configDirty = false;
  let configKnown = false;
  let loadedConfigText = null;

  const DEVICE_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  const luhn32 = (text) => {
    let factor = 1, sum = 0;
    for (const ch of text) {
      const codepoint = DEVICE_ALPHABET.indexOf(ch);
      if (codepoint < 0) return null;
      let addend = factor * codepoint;
      factor = factor === 2 ? 1 : 2;
      addend = Math.floor(addend / 32) + (addend % 32);
      sum += addend;
    }
    return DEVICE_ALPHABET[(32 - (sum % 32)) % 32];
  };

  /**
   * 校验并规范 Syncthing Device ID。兼容官方支持的 52 位旧格式，
   * 对 56 位新格式严格验证四个 Luhn32 校验位，避免伪 ID 到启动时才报错。
   */
  const normDeviceId = (s) => {
    const typed = String(s || '').toUpperCase()
      .replace(/0/g, 'O').replace(/1/g, 'I').replace(/8/g, 'B');
    if (/[^A-Z2-7\-\s]/.test(typed)) return null;
    let raw = typed.replace(/[\-\s]/g, '');
    if (raw.length === 52) {
      let withChecks = '';
      for (let i = 0; i < 4; i++) {
        const part = raw.slice(i * 13, (i + 1) * 13);
        const check = luhn32(part);
        if (!check) return null;
        withChecks += part + check;
      }
      raw = withChecks;
    } else if (raw.length === 56) {
      for (let i = 0; i < 4; i++) {
        const part = raw.slice(i * 14, i * 14 + 13);
        if (luhn32(part) !== raw[i * 14 + 13]) return null;
      }
    } else return null;
    return raw.match(/.{7}/g).join('-');
  };

  // `|` 是 sync.conf 字段分隔符，控制字符也不应进入行协议。
  // XML 特殊字符不在这里删除；设备端生成 XML 时会正确转义，
  // 因此升级和重新应用不会静默改掉用户的显示名称。
  const cleanLabel = (s) => String(s || '').replace(/[\u0000-\u001f\u007f|]/g, '').trim().slice(0, 40);
  const validFolderId = (s) => {
    const id = String(s || '').trim();
    return RE_FOLDER.test(id) && id !== '.' && id !== '..';
  };

  const parseConf = (text) => {
    const folders = [], devices = [];
    String(text || '').split('\n').forEach((line) => {
      const p = line.split('|');
      const id = (p[1] || '').trim();
      const label = (p[2] || '').trim();
      if (p[0] === 'F' && id) folders.push({ id, label });
      else if (p[0] === 'D' && id) devices.push({ id, label });
    });
    return { folders, devices };
  };

  const serializeConf = (c) => c.folders.map((f) => `F|${f.id}|${f.label}`)
    .concat(c.devices.map((d) => `D|${d.id}|${d.label}`)).join('\n') + '\n';

  const loadConfig = async () => {
    const r = await run('get-config');
    if (r && r.content && r.content.includes('UFISYNC-CONFIG')) {
      cfg = parseConf(r.content);
      configDirty = false;
      configKnown = true;
      loadedConfigText = serializeConf(cfg).trim();
      renderConfig();
    }
  };

  const saveConfig = async () => {
    if (!configKnown) {
      openConfig();
      ToastManager.error('❌ 当前无法确认 device 上的现有配置。请等待状态恢复或点「重新读取」，' +
        '读取成功前不会保存，以免覆盖已有笔记库。', 10000);
      return;
    }
    if (!(await guard())) return;
    if (!cfg.folders.length) { ToastManager.error('❌ 至少要有一个仓库'); return; }
    if (!cfg.devices.length) { ToastManager.error('❌ 至少要有一台可信设备'); return; }

    const normalizedFolders = [];
    const seenFolderIds = new Set();
    for (const folder of cfg.folders) {
      const id = String(folder.id || '').trim();
      if (!validFolderId(id)) {
        openConfig();
        ToastManager.error(`❌ 已有笔记库「${cleanLabel(folder.label) || '未命名'}」的 Folder ID 无效。` +
          'Folder ID 不能是「.」或「..」，请移除后重新添加。', 10000);
        return;
      }
      if (seenFolderIds.has(id)) {
        openConfig();
        ToastManager.error('❌ 配置中有重复的 Folder ID，请移除重复项。', 10000);
        return;
      }
      seenFolderIds.add(id);
      normalizedFolders.push({ id, label: cleanLabel(folder.label) || id });
    }

    // 旧版配置可能保存的是 52 位无校验位 ID。在任何设备端写入之前，
    // 统一转换成 56 位标准格式，并拒绝损坏的历史配置。
    const normalizedDevices = [];
    const seenDeviceIds = new Set();
    for (const device of cfg.devices) {
      const id = normDeviceId(device.id);
      if (!id) {
        openConfig();
        ToastManager.error(`❌ 已有电脑「${cleanLabel(device.label) || '未命名'}」的设备 ID 无效，` +
          '请移除后从对方 Syncthing 重新复制 Device ID。', 10000);
        return;
      }
      if (seenDeviceIds.has(id)) {
        openConfig();
        ToastManager.error('❌ 配置中有重复的电脑 Device ID，请移除重复项。', 10000);
        return;
      }
      seenDeviceIds.add(id);
      normalizedDevices.push({ id, label: cleanLabel(device.label) || id.slice(0, 7) });
    }
    cfg.folders = normalizedFolders;
    cfg.devices = normalizedDevices;
    configDirty = true;
    renderConfig();

    // 全新 device 上尚无控制脚本，旧安装又可能仍是 2.2.1。
    // 先下发当前脚本，才能安全使用 set-config / apply-config。
    progress('准备设备端控制脚本…', null);
    await deployScript();

    await pushB64(b64encode(serializeConf(cfg)), CONF_B64, '写入配置');
    progress('保存配置', null);
    const r = await run('set-config');
    progress(null);
    showOut(r.content || '');
    if (r.success === false || /FATAL/.test(r.content || '')) {
      ToastManager.error('❌ 配置保存失败：' + (r.content || ''), 10000);
      return;
    }
    progress('应用配置并启动同步…', null);
    const applied = await run('apply-config');
    progress(null);
    showOut(applied.content || '');
    if (applied.success === false || /FATAL/.test(applied.content || '')) {
      if (/同步内核未安装|请先执行安装/.test(applied.content || '')) {
        await loadConfig();
        const admin = $('#ufis_admin_menu');
        if (admin) admin.open = true;
        ToastManager.info('✅ 笔记库和电脑已保存。下一步请在「部署与维护」点「一键安装」。', 12000);
        return;
      }
      ToastManager.error('❌ 配置已保存，但应用失败：' + (applied.content || '未知错误'), 12000);
      return;
    }
    ToastManager.success('✅ 配置已应用，device 已开始同步。', 9000);
    await loadConfig();
    await refresh(true, true);
  };

  const addFolder = () => {
    const id = ($('#ufis_new_folder_id') || {}).value || '';
    const label = ($('#ufis_new_folder_label') || {}).value || '';
    if (!configKnown) {
      ToastManager.error('❌ 现有配置尚未读取，暂不能添加笔记库，以免覆盖 device 上的配置。');
      return;
    }
    if (!validFolderId(id)) {
      ToastManager.error('❌ 仓库 ID 只能是字母、数字、点、下划线、连字符（1—64 位），' +
        '不能是「.」或「..」，且必须与其它设备上的 Folder ID 完全一致');
      return;
    }
    if (cfg.folders.some((f) => f.id === id.trim())) { ToastManager.warning('⚠️ 该仓库已在列表中'); return; }
    if (cfg.folders.length >= MAX_FOLDERS) { ToastManager.error(`❌ 最多 ${MAX_FOLDERS} 个仓库`); return; }
    cfg.folders.push({ id: id.trim(), label: cleanLabel(label) || id.trim() });
    configDirty = true;
    $('#ufis_new_folder_id').value = '';
    $('#ufis_new_folder_label').value = '';
    renderConfig();
    ToastManager.info('已添加，记得点「保存并应用」');
  };

  const addDevice = () => {
    const raw = ($('#ufis_new_device_id') || {}).value || '';
    const label = ($('#ufis_new_device_label') || {}).value || '';
    if (!configKnown) {
      ToastManager.error('❌ 现有配置尚未读取，暂不能添加电脑，以免覆盖 device 上的配置。');
      return;
    }
    const id = normDeviceId(raw);
    if (!id) {
      ToastManager.error('❌ 设备 ID 格式不对。应为 Syncthing 的 56 位设备 ID，' +
        '在对方的 Syncthing 界面「操作 → 显示 ID」里复制', 9000);
      return;
    }
    if (cfg.devices.some((d) => d.id === id)) { ToastManager.warning('⚠️ 该设备已在列表中'); return; }
    if (cfg.devices.length >= MAX_DEVICES) { ToastManager.error(`❌ 最多 ${MAX_DEVICES} 台设备`); return; }
    cfg.devices.push({ id, label: cleanLabel(label) || id.slice(0, 7) });
    configDirty = true;
    $('#ufis_new_device_id').value = '';
    $('#ufis_new_device_label').value = '';
    renderConfig();
    ToastManager.info('已添加，记得点「保存并应用」');
  };

  const renderConfig = () => {
    const fb = $('#ufis_folders'), db = $('#ufis_devices');
    if (!fb || !db) return;
    const summary = $('#ufis_config_summary');
    if (summary) summary.textContent = configKnown
      ? `${cfg.folders.length} 个笔记库 · ${cfg.devices.length} 台电脑`
      : '配置尚未读取';
    const complete = cfg.folders.length > 0 && cfg.devices.length > 0;
    const review = $('#ufis_review_summary');
    if (review) {
      review.textContent = !configKnown
        ? '正在确认 device 上的现有配置；读取成功前不会保存或覆盖。'
        : complete
          ? `将让 device 保存 ${cfg.folders.length} 个笔记库，并与 ${cfg.devices.length} 台电脑交换更新。`
          : '请至少添加一个笔记库和一台电脑。';
    }
    if (configKnown) {
      const onboarding = $('#ufis_onboarding');
      const daily = $('#ufis_daily');
      if (onboarding) onboarding.style.display = complete ? 'none' : 'block';
      if (daily) daily.style.display = complete ? 'block' : 'none';
      const menu = $('#ufis_config_menu');
      if (!complete && menu) menu.open = true;
    }

    const row = (main, sub, onDel) => {
      const d = document.createElement('div');
      d.style.cssText = 'display:flex;align-items:center;gap:8px;padding:6px 8px;' +
        'border:1px solid rgba(255,255,255,.12);border-radius:6px;margin-bottom:6px;';
      const t = document.createElement('div');
      t.style.cssText = 'flex:1;min-width:0;';
      t.innerHTML = `<div style="font-size:12px;color:#fff;word-break:break-all;">${esc(main)}</div>` +
        `<div style="font-size:10px;color:#888;word-break:break-all;">${esc(sub)}</div>`;
      const b = document.createElement('button');
      b.className = 'btn';
      b.textContent = '移除';
      b.type = 'button';
      b.style.cssText = 'flex:none;font-size:11px;padding:3px 9px;';
      b.addEventListener('click', onDel);
      d.appendChild(t); d.appendChild(b);
      return d;
    };

    fb.innerHTML = '';
    if (!cfg.folders.length) fb.innerHTML = configKnown
      ? '<div style="font-size:11px;color:#888;">还没有笔记库</div>'
      : '<div style="font-size:11px;color:#888;">现有笔记库配置尚未读取</div>';
    cfg.folders.forEach((f, i) => fb.appendChild(row(f.label || f.id, f.id, () => {
      cfg.folders.splice(i, 1); configDirty = true; renderConfig(); ToastManager.info('已移除，记得点「保存并应用」');
    })));

    db.innerHTML = '';
    if (!cfg.devices.length) db.innerHTML = configKnown
      ? '<div style="font-size:11px;color:#888;">还没有电脑</div>'
      : '<div style="font-size:11px;color:#888;">现有电脑配置尚未读取</div>';
    cfg.devices.forEach((d, i) => db.appendChild(row(d.label || d.id, d.id, () => {
      cfg.devices.splice(i, 1); configDirty = true; renderConfig(); ToastManager.info('已移除，记得点「保存并应用」');
    })));
  };

  /* ---------------------------------------------------------------------- */
  /* 解析设备端输出                                                          */
  /* ---------------------------------------------------------------------- */
  const parseKV = (text) => {
    const out = {};
    String(text || '').split('\n').forEach((line) => {
      const m = line.match(/^([a-zA-Z0-9_:/.\-]+)=(.*)$/);
      if (m) out[m[1]] = m[2].trim();
    });
    return out;
  };

  const parseBlocks = (text) => {
    const out = {};
    let cur = null, buf = [];
    String(text || '').split('\n').forEach((line) => {
      const m = line.match(/^--- (.+?) ---$/);
      if (m) { if (cur) out[cur] = buf.join('\n').trim(); cur = m[1]; buf = []; }
      else if (cur) {
        if (line.indexOf('### END') === 0) { out[cur] = buf.join('\n').trim(); cur = null; return; }
        buf.push(line);
      }
    });
    if (cur) out[cur] = buf.join('\n').trim();
    return out;
  };

  const strictJSONObject = (v) => {
    try {
      const parsed = JSON.parse(v);
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null;
    } catch (e) { return null; }
  };

  const fmtBytes = (n) => {
    n = Number(n) || 0;
    const u = ['B', 'KB', 'MB', 'GB', 'TB'];
    let i = 0;
    while (n >= 1024 && i < u.length - 1) { n /= 1024; i++; }
    return (i === 0 ? n : n.toFixed(1)) + ' ' + u[i];
  };

  const fmtTime = (iso) => {
    if (!iso) return '—';
    const d = new Date(iso);
    return (isNaN(d.getTime()) || d.getFullYear() < 2000) ? '—' : d.toLocaleString();
  };

  const esc = (s) => String(s === undefined || s === null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  /* ---------------------------------------------------------------------- */
  /* UI 基础件                                                               */
  /* ---------------------------------------------------------------------- */
  const $ = (sel) => document.querySelector(sel);
  const allButtons = [];
  let busy = false;
  let currentDeviceId = '';

  const setBusy = (v) => {
    busy = v;
    allButtons.forEach((b) => { b.disabled = v; });
    const panel = document.getElementById(PANEL_ID);
    if (panel) panel.querySelectorAll('input').forEach((i) => { i.disabled = v; });
  };

  const progress = (text, pct) => {
    const box = $('#ufis_prog');
    if (!box) return;
    if (text === null) { box.style.display = 'none'; return; }
    box.style.display = 'block';
    $('#ufis_prog_text').textContent = text;
    const bar = $('#ufis_prog_bar');
    if (pct === undefined || pct === null) bar.parentElement.style.display = 'none';
    else { bar.parentElement.style.display = 'block'; bar.style.width = Math.max(0, Math.min(100, pct)) + '%'; }
  };

  const showOut = (text) => {
    const pre = $('#ufis_out');
    if (!pre) return;
    pre.style.display = 'block';
    pre.textContent = text;
  };

  const appendOut = (text) => {
    const pre = $('#ufis_out');
    if (!pre) return;
    pre.style.display = 'block';
    pre.textContent = (pre.textContent ? pre.textContent + '\n' : '') + text;
    pre.scrollTop = pre.scrollHeight;
  };

  const createButton = (text, handler, needConfirm = false, small = false) => {
    const btn = Object.assign(document.createElement('button'), {
      className: 'btn', textContent: text, type: 'button'
    });
    if (small) btn.style.cssText = 'font-size:11px;padding:4px 10px;';
    let clicks = 0, timer = null;
    const onClick = () => {
      if (needConfirm && ++clicks < 2) {
        ToastManager.warning(`⚠️ 再点一次确认「${text}」`);
        if (timer) clearTimeout(timer);
        timer = setTimeout(() => { clicks = 0; timer = null; }, 3000);
        return;
      }
      if (timer) { clearTimeout(timer); timer = null; }
      clicks = 0;
      setBusy(true);
      Promise.resolve().then(handler)
        .catch((e) => { progress(null); appendOut('❌ ' + e.message); ToastManager.error('❌ ' + e.message, 10000); })
        .finally(() => setBusy(false));
    };
    btn.addEventListener('click', onClick);
    btn._cleanup = () => { if (timer) clearTimeout(timer); btn.removeEventListener('click', onClick); };
    allButtons.push(btn);
    return btn;
  };

  const copyDeviceId = async () => {
    if (!currentDeviceId) { ToastManager.warning('设备 ID 尚未生成，请先完成安装'); return; }
    if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
      await navigator.clipboard.writeText(currentDeviceId);
    } else {
      const input = document.createElement('input');
      input.value = currentDeviceId;
      input.style.position = 'fixed'; input.style.opacity = '0';
      document.body.appendChild(input); input.select();
      const copied = typeof document.execCommand === 'function' && document.execCommand('copy');
      input.remove();
      if (!copied) throw new Error('浏览器不允许自动复制，请长按设备 ID 手动复制');
    }
    ToastManager.success('✅ Sync Node Device ID 已复制');
  };

  /* ---------------------------------------------------------------------- */
  /* 状态刷新                                                                */
  /* ---------------------------------------------------------------------- */
  const cellHTML = (label, value, pct) =>
    `<div style="padding:8px 10px;border:1px solid rgba(255,255,255,.14);border-radius:8px;min-width:0;">
       <div style="font-size:11px;color:#9aa;margin-bottom:2px;">${esc(label)}</div>
       <div style="font-size:13px;color:#fff;word-break:break-all;">${esc(value)}</div>
       ${pct === undefined ? '' :
      `<div style="height:4px;border-radius:2px;background:rgba(255,255,255,.15);margin-top:5px;overflow:hidden;">
            <div style="height:100%;width:${Math.max(0, Math.min(100, pct))}%;background:#10b981;"></div>
          </div>`}
     </div>`;

  // 状态轮询频繁时，内容未变就保留原 DOM，减少 WebView 的分配与回收压力。
  const htmlSnapshots = new WeakMap();
  const setHTMLIfChanged = (el, html) => {
    if (!el || htmlSnapshots.get(el) === html) return false;
    htmlSnapshots.set(el, html);
    el.innerHTML = html;
    return true;
  };
  const setTextIfChanged = (el, text) => {
    if (!el || el.textContent === String(text)) return false;
    el.textContent = String(text);
    return true;
  };

  const setDot = (color) => { const d = $('#ufis_dot'); if (d) d.style.background = color; };
  const connectionLabel = (c) => {
    if (!c || !c.connected) return '未连接';
    if (String(c.type || '').indexOf('relay') >= 0) return '已连接 · 公网中继';
    return c.isLocal === true ? '已连接 · 局域网直连' : '已连接 · 互联网直连';
  };

  // status 请求失败时，旧的在线、进度和中继结论必须立即过期。
  // “状态未知”与“未连接/未同步”含义不同，不能为了填满面板而混为一谈。
  const renderRuntimeUnavailable = (message = '状态暂不可用', missingScript = false) => {
    const grid = $('#ufis_grid');
    setHTMLIfChanged(grid, missingScript
      ? cellHTML('状态', '控制脚本未部署') + cellHTML('下一步', '点「① 环境体检」')
      : cellHTML('状态', '暂不可用') + cellHTML('下一步', '正在自动重试'));
    setDot(missingScript ? '#9e9e9e' : '#f59e0b');

    const verdictBox = $('#ufis_sync_verdict');
    if (verdictBox) {
      setTextIfChanged(verdictBox, message);
      verdictBox.style.color = missingScript ? '#9ca3af' : '#fbbf24';
    }
    const recovery = $('#ufis_start_recovery');
    if (recovery) recovery.style.display = 'none';
    const sampleNote = $('#ufis_sample_note');
    setTextIfChanged(sampleNote, missingScript ? '尚未部署 device 同步服务' : '本次状态读取失败 · 正在自动重试');

    const peerStatus = $('#ufis_peer_status');
    const peerHTML = configKnown && cfg.devices.length
      ? cfg.devices.map((d) => `<div style="display:flex;align-items:center;gap:7px;padding:7px 9px;border:1px solid rgba(255,255,255,.12);border-radius:7px;min-width:0;">
          <span style="width:8px;height:8px;border-radius:50%;background:#6b7280;flex:none;"></span>
          <strong style="font-size:12px;color:#fff;overflow:hidden;text-overflow:ellipsis;">${esc(d.label || d.id.slice(0, 7))}</strong>
          <span style="font-size:11px;color:#9ca3af;margin-left:auto;white-space:nowrap;">状态未知</span>
        </div>`).join('')
      : `<div style="font-size:11px;color:#888;">${configKnown ? '尚未配置电脑' : '电脑配置与连接状态尚未读取'}</div>`;
    setHTMLIfChanged(peerStatus, peerHTML);

    const folderStatus = $('#ufis_folders_status');
    const folderHTML = configKnown && cfg.folders.length
      ? cfg.folders.map((f) => cellHTML(f.label || f.id, '同步状态未知')).join('')
      : `<div style="font-size:11px;color:#888;">${configKnown ? '尚未添加 Obsidian 笔记库' : '笔记库配置与同步状态尚未读取'}</div>`;
    setHTMLIfChanged(folderStatus, folderHTML);

    const techGrid = $('#ufis_tech_grid');
    setHTMLIfChanged(techGrid, cellHTML('运行状态', missingScript ? '控制脚本未部署' : '暂不可用'));
    currentDeviceId = '';
    setTextIfChanged($('#ufis_device_id'), missingScript ? '尚未初始化' : '暂不可用');
    pollFast = true;
    updatePollHint();
  };

  const isScriptMissingOutput = (text) =>
    /ufisync\.sh(?:\[\d+\])?\s*:\s*(?:not found|No such file or directory)/i.test(String(text || '')) ||
    /(?:can't|cannot) open[^\n]*ufisync\.sh/i.test(String(text || ''));

  const refreshNow = async (quiet, requestEpoch) => {
    const grid = $('#ufis_grid');
    if (!grid) return {};
    const r = await run('status');
    // 配置、启停等动作会推进 epoch。动作前发出的旧请求即使随后返回，也不能
    // 覆盖动作后的状态；直接丢弃，交给 forceFresh 发起的新一轮刷新。
    if (requestEpoch !== statusEpoch) return { status_available: 'stale' };
    const txt = (r && r.content) || '';

    if (!txt.includes('UFISYNC-STATUS') && isScriptMissingOutput(txt)) {
      renderRuntimeUnavailable('控制脚本尚未部署', true);
      // 真正的首次安装没有 status 可读，但配置编辑本身不依赖设备脚本。
      // 只有明确的 ufisync.sh not found 才能证明这是全新设备；超时和其它错误
      // 都不能被解释成空配置。
      if (!configKnown && !configDirty) {
        cfg = { folders: [], devices: [] };
        configKnown = true;
        loadedConfigText = '';
        renderConfig();
      }
      if (!quiet && r && r.success === false) ToastManager.error('❌ ' + r.content);
      pollFast = true;
      updatePollHint();
      return {};
    }

    if (!r || r.success === false || !txt.includes('UFISYNC-STATUS')) {
      renderRuntimeUnavailable();
      if (!quiet) ToastManager.error('❌ device 同步状态暂不可用，请稍后重试', 8000);
      return { status_available: 'no', sync_verdict: '状态暂不可用' };
    }

    const kv = parseKV(txt), bl = parseBlocks(txt);
    // 正常 status 必须带 config 区块（空配置也会有该区块）。缺失说明响应被截断，
    // 此时不能把尚未读到的配置当成 0 个笔记库、0 台电脑。
    if (!Object.prototype.hasOwnProperty.call(bl, 'config')) {
      renderRuntimeUnavailable();
      if (!quiet) ToastManager.error('❌ 状态响应不完整，正在自动重试', 8000);
      return { status_available: 'no', sync_verdict: '状态暂不可用' };
    }
    if (Object.prototype.hasOwnProperty.call(bl, 'config') && !configDirty) {
      const configText = String(bl.config || '').trim();
      if (!configKnown || configText !== loadedConfigText) {
        cfg = parseConf(configText);
        configKnown = true;
        loadedConfigText = configText;
        renderConfig();
      }
    }

    const running = kv.process === 'running';
    let st = {}, conns = {}, allErrors = [];
    if (running) {
      const statusPayload = strictJSONObject(bl['system/status']);
      const connectionsPayload = strictJSONObject(bl['system/connections']);
      const errorsPayload = strictJSONObject(bl['system/error']);
      if (!statusPayload || !connectionsPayload || !errorsPayload ||
        typeof statusPayload.myID !== 'string' || !statusPayload.myID ||
        !statusPayload.connectionServiceStatus || typeof statusPayload.connectionServiceStatus !== 'object' ||
        !connectionsPayload.connections || typeof connectionsPayload.connections !== 'object' ||
        Array.isArray(connectionsPayload.connections) ||
        !Array.isArray(errorsPayload.errors)) {
        renderRuntimeUnavailable();
        if (!quiet) ToastManager.error('❌ Syncthing 状态响应不完整，正在自动重试', 8000);
        return { status_available: 'no', sync_verdict: '状态暂不可用' };
      }
      st = statusPayload;
      conns = connectionsPayload.connections;
      allErrors = errorsPayload.errors;
    }
    const runtimeNotices = allErrors.filter((e) => PRIVILEGED_USER_WARNING.test(String(e.message || '')));
    const errs = allErrors.filter((e) => !PRIVILEGED_USER_WARNING.test(String(e.message || '')));

    currentDeviceId = st.myID || '';
    const deviceIdBox = $('#ufis_device_id');
    setTextIfChanged(deviceIdBox, currentDeviceId || '尚未初始化');
    const lowDisk = Number(kv.free_mb) > 0 && Number(kv.free_mb) < Number(kv.min_free_mb || 1024);
    const services = st.connectionServiceStatus || {};
    const relayKey = Object.keys(services).find((k) => k.indexOf('dynamic+https://relays.syncthing.net') === 0);
    const relayService = relayKey ? services[relayKey] || {} : {};
    const relayAddresses = (relayService.wanAddresses || []).concat(relayService.lanAddresses || []);
    const relayReady = !!relayKey && !relayService.error && relayAddresses.length > 0;
    const relayState = relayReady ? '已就绪' : relayKey ? (relayService.error ? '异常' : '连接中') : '未启用';
    setDot(errs.length || lowDisk || (running && !relayReady) ? '#f59e0b' : running ? '#10b981' : kv.installed === 'yes' ? '#ef4444' : '#9e9e9e');

    // 只统计用户在本插件中配置的电脑，避免 API 中的无关连接让在线数虚高。
    const configuredConnectionIds = cfg.devices.map((d) => normDeviceId(d.id) || d.id);
    const online = configuredConnectionIds.filter((id) => conns[id] && conns[id].connected);
    const kinds = online.map((k) => connectionLabel(conns[k]).replace(/^已连接\s*·\s*/, ''));
    const hasPublicConnection = online.some((id) => {
      const connection = conns[id] || {};
      return /relay/i.test(String(connection.type || '')) || connection.isLocal === false;
    });

    let need = 0, lastChange = '', folderDataComplete = true;
    const folderCells = cfg.folders.map((f) => {
      const d = strictJSONObject(bl['db/' + f.id]);
      const complete = d && ['globalBytes', 'localBytes', 'needBytes'].every((key) =>
        Object.prototype.hasOwnProperty.call(d, key) &&
        typeof d[key] === 'number' && Number.isFinite(d[key]));
      if (!complete) {
        folderDataComplete = false;
        return cellHTML(f.label || f.id, '同步状态暂不可用');
      }
      const g = Number(d.globalBytes) || 0, l = Number(d.localBytes) || 0;
      need += Number(d.needBytes) || 0;
      if (d.stateChanged && d.stateChanged > lastChange) lastChange = d.stateChanged;
      if (g === 0 && l === 0 && Number(d.needBytes || 0) === 0) {
        return cellHTML(f.label || f.id, '空仓库 · 0 B');
      }
      const p = g > 0 ? Math.round((l / g) * 100) : 0;
      return cellHTML(f.label || f.id, `${p}%　${fmtBytes(l)}`, p);
    });
    const folderStatus = $('#ufis_folders_status');
    setHTMLIfChanged(folderStatus,
      folderCells.join('') || '<div style="font-size:11px;color:#888;">尚未添加 Obsidian 笔记库</div>');

    const peerStatus = $('#ufis_peer_status');
    if (peerStatus) {
      const peerHTML = cfg.devices.map((d) => {
        const connectionId = normDeviceId(d.id) || d.id;
        const c = conns[connectionId] || {};
        const connected = !!c.connected;
        return `<div style="display:flex;align-items:center;gap:7px;padding:7px 9px;border:1px solid rgba(255,255,255,.12);border-radius:7px;min-width:0;">
          <span style="width:8px;height:8px;border-radius:50%;background:${connected ? '#10b981' : '#6b7280'};flex:none;"></span>
          <strong style="font-size:12px;color:#fff;overflow:hidden;text-overflow:ellipsis;">${esc(d.label || d.id.slice(0, 7))}</strong>
          <span style="font-size:11px;color:${connected ? '#86efac' : '#9ca3af'};margin-left:auto;white-space:nowrap;">${connectionLabel(c)}</span>
        </div>`;
      }).join('') || '<div style="font-size:11px;color:#888;">尚未配置电脑</div>';
      setHTMLIfChanged(peerStatus, peerHTML);
    }

    let verdict = '尚未安装同步内核', verdictColor = '#9ca3af';
    if (kv.installed === 'yes' && !running) { verdict = '同步已停止'; verdictColor = '#fca5a5'; }
    else if (running && errs.length) { verdict = `需要处理 ${errs.length} 个错误`; verdictColor = '#fbbf24'; }
    else if (running && !folderDataComplete) { verdict = '笔记库状态暂不可用 · 正在自动重试'; verdictColor = '#fbbf24'; }
    else if (running && !relayReady && !hasPublicConnection) {
      verdict = `公网中继${relayState} · 跨网络同步尚未就绪`; verdictColor = '#fbbf24';
    }
    else if (running && need > 0) { verdict = `device 正在更新副本 · 还需 ${fmtBytes(need)}`; verdictColor = '#7dd3fc'; }
    else if (running && !online.length) { verdict = 'device 已保存最新副本 · 等待电脑上线'; verdictColor = '#c4b5fd'; }
    else if (running && online.length < cfg.devices.length) {
      verdict = `device 已保存最新副本 · ${online.length}/${cfg.devices.length} 台电脑在线`; verdictColor = '#86efac';
    } else if (running) { verdict = `device 已保存最新副本 · ${online.length} 台电脑在线`; verdictColor = '#86efac'; }
    const verdictBox = $('#ufis_sync_verdict');
    if (verdictBox) {
      setTextIfChanged(verdictBox, verdict);
      verdictBox.style.color = verdictColor;
    }
    const recovery = $('#ufis_start_recovery');
    if (recovery) recovery.style.display = kv.installed === 'yes' && !running ? 'flex' : 'none';

    setHTMLIfChanged(grid, [
      cellHTML('电脑在线', `${online.length}/${cfg.devices.length}`),
      cellHTML('待同步', folderDataComplete ? fmtBytes(need) : '暂不可用'),
      cellHTML('最后同步', folderDataComplete ? fmtTime(lastChange) : '暂不可用'),
      cellHTML('公网中继', relayState),
      cellHTML('存储余量', `${kv.free_mb || '?'} MB${lowDisk ? ' ⚠ 偏低' : ''}`),
      cellHTML('合计 RSS', `${kv.process_rss_mb || '0'} MB`)
    ].join(''));

    const techGrid = $('#ufis_tech_grid');
    if (techGrid) setHTMLIfChanged(techGrid, [
      cellHTML('同步内核', kv.installed === 'yes'
        ? (kv.kernel_version || '').replace(/^syncthing\s*/i, '') || '已安装' : '未安装'),
      cellHTML('进程', running ? `运行中 (PID ${kv.pid})` : kv.installed === 'yes' ? '已停止' : '—'),
      cellHTML('同步端口', kv.sync_port || '—'),
      cellHTML('连接方式', online.length ? kinds.join(' / ') : '无在线电脑'),
      cellHTML('受管进程', `${kv.process_count || '0'} 个 · ${kv.process_threads || '0'} 线程`),
      cellHTML('运行方式', runtimeNotices.length ? '系统服务（root，属正常）' : '正常'),
      cellHTML('开机自启', kv.boot_hook === 'yes' && kv.watchdog_hook === 'yes' ? '已启用' : '未启用'),
      cellHTML('待处理错误', errs.length ? `${errs.length} 条` : '0')
    ].join(''));
    const sampleNote = $('#ufis_sample_note');
    setTextIfChanged(sampleNote, `状态刚刚更新 · ${cfg.folders.length} 个笔记库 · ${cfg.devices.length} 台电脑`);

    if (errs.length) showOut(errs.map((e) => `${e.when}  ${e.message}`).join('\n'));
    if (!quiet) {
      if (lowDisk) ToastManager.warning('⚠️ 存储余量偏低，同步内核会停止接收并告警，不会自动清理数据');
      else if (running) ToastManager.success(`✅ 运行中（PID ${kv.pid}）`);
      else if (kv.installed === 'yes') ToastManager.warning('⚠️ 同步内核已安装但未运行');
    }
    kv.connected_count = online.length;
    kv.relay_ready = relayReady ? 'yes' : 'no';
    kv.need_bytes = folderDataComplete ? need : null;
    kv.folder_status_available = folderDataComplete ? 'yes' : 'no';
    kv.sync_verdict = verdict;
    pollFast = !running || errs.length > 0 || !folderDataComplete || need > 0 || (!relayReady && !hasPublicConnection);
    updatePollHint();
    return kv;
  };

  /* ---------------------------------------------------------------------- */
  /* 动作实现                                                                */
  /* ---------------------------------------------------------------------- */
  const doPreflight = async () => {
    if (!(await guard())) return;
    showOut('');
    ToastManager.info('开始环境体检：会更新控制脚本，但不会安装同步内核或修改同步数据');
    await deployScript();
    progress('体检中…', null);
    const r = await run('preflight');
    progress(null);
    const kv = parseKV(r.content);
    showOut(r.content || '(无输出)');
    if (kv.verdict === 'pass') {
      const notes = [];
      if (kv.sync_port_choice && kv.sync_port_choice !== '22000') {
        notes.push(`22000 已被占用，将使用 ${kv.sync_port_choice}`);
      }
      if (kv.net_github !== '200' && kv.net_ghproxy !== '200') notes.push('GitHub 与镜像都不通，下载可能失败');
      ToastManager.success('✅ 环境满足安装条件，可以点「② 一键安装」' +
        (notes.length ? '\n注意：' + notes.join('；') : ''), 9000);
    } else {
      ToastManager.error(`❌ 体检未通过：${kv.verdict_reason || '未知原因'}`, 12000);
    }
    await refresh(true, true);
  };

  const doDiag = async () => {
    if (!(await guard())) return;
    progress('收集诊断信息…', null);
    const r = await run('diag');
    progress(null);
    showOut(r.content || '(无输出)');
    const kv = parseKV(r.content);
    if (kv.linkage === 'dynamic-glibc') {
      ToastManager.error('❌ 当前二进制依赖 glibc，Android 无法执行。' +
        `请把版本改成 ${DEFAULT_KERNEL} 后重新安装。`, 15000);
    } else {
      ToastManager.info('📋 诊断信息已输出到下方');
    }
  };

  const doInstall = async () => {
    if (!(await guard())) return;
    showOut('');
    ToastManager.info('开始安装，过程约 1—5 分钟，请保持页面打开');

    await deployScript();

    progress('安装前体检…', null);
    const pre = parseKV((await run('preflight')).content);
    if (pre.verdict !== 'pass') {
      progress(null);
      showOut(`体检未通过：${pre.verdict_reason}`);
      ToastManager.error(`❌ 安装中止：${pre.verdict_reason}`, 12000);
      return;
    }

    progress('启动后台安装任务…', null);
    const started = await run('install');
    appendOut(started.content || '');
    if (started.success === false) throw new Error('无法启动安装任务：' + started.content);

    const STAGE = {
      preparing: '准备中', downloading: '下载同步内核', verifying: '校验',
      unpacking: '解包安装', hooks: '配置开机自启', done: '完成', failed: '失败'
    };
    let last = '';
    for (let i = 0; i < 240; i++) {
      await sleep(2000);
      const s = await run('install-status');
      const kv = parseKV(s.content);
      const stage = kv.stage || 'idle';
      const dl = Number(kv.downloaded_bytes) || 0;
      const label = STAGE[stage] || stage;

      if (stage === 'downloading') {
        progress(`${label}　${fmtBytes(dl)}　${kv.message || ''}`, Math.min(99, (dl / TARBALL_BYTES) * 100));
      } else {
        progress(`${label}　${kv.message || ''}`, stage === 'done' ? 100 : null);
      }
      if (kv.message && kv.message !== last) { appendOut(`[${kv.at || ''}] ${label}：${kv.message}`); last = kv.message; }

      if (stage === 'failed') {
        progress(null);
        appendOut(s.content);
        ToastManager.error('❌ 安装失败：' + (kv.message || '见下方日志') + '\n可点「诊断」看详细原因', 15000);
        return;
      }
      if (stage === 'done') break;
      if (i === 239) { progress(null); throw new Error('安装超时，请点「查看日志」检查'); }
    }

    // 安装完成不等于可以断言“配置为空”。若进入安装时状态尚不可用，先强制
    // 读取设备上的真实配置；读取仍失败就保持未知，绝不把默认空数组落盘。
    if (!configKnown) await refresh(true, true);
    if (!configKnown) {
      progress(null);
      openConfig();
      ToastManager.warning('⚠️ 同步内核已安装，但现有配置仍暂不可用。请等待状态恢复后再保存。', 12000);
      return;
    }
    if (!cfg.folders.length || !cfg.devices.length) {
      progress(null);
      renderConfig();
      openConfig();
      ToastManager.success('✅ 同步内核已安装。请先添加笔记库和电脑，再点「保存并应用」。', 12000);
      return;
    }

    progress('写入托管配置…', null);
    const ini = await run('init');
    appendOut(ini.content || '');
    if (ini.success === false) throw new Error('初始化失败：' + ini.content);

    progress('启动同步内核…', null);
    const st = await run('start');
    appendOut(st.content || '');
    progress(null);

    const kv = await refresh(true, true);
    if (kv && kv.process === 'running') {
      ToastManager.success('🎉 安装完成！请把面板上的「本机设备 ID」添加到各台电脑的 ' +
        'Syncthing，并把对应仓库共享给它。', 15000);
    } else {
      ToastManager.warning('⚠️ 已安装但未能启动，请点「查看日志」或「诊断」检查', 10000);
    }
  };

  const simple = (action) => async () => {
    if (ACTIONS[action].priv && !(await guard())) return;
    progress(`${ACTIONS[action].label}中…`, null);
    const r = await run(action);
    progress(null);
    showOut(r.content || '(无输出)');
    if (r.success === false) { ToastManager.error('❌ ' + r.content, 10000); return; }
    await refresh(false, true);
  };

  // 恢复旧版安装留下的“内核已落盘、配置未生成”状态。
  // 启动前总是下发当前控制脚本，避免页面已更新但设备仍执行旧脚本。
  const doStart = async () => {
    if (!(await guard())) return;
    showOut('');
    progress('更新设备端控制脚本…', null);
    await deployScript();

    progress('检查初始化状态…', null);
    const kv = await refresh(true, true);
    if (!kv || kv.status_available === 'no' || kv.status_available === 'stale') {
      throw new Error('同步状态暂不可用，请稍后重试');
    }
    if (kv.initialized !== 'yes') {
      if (!cfg.folders.length || !cfg.devices.length) {
        configKnown = true;
        renderConfig();
        openConfig();
        progress(null);
        throw new Error('启动前请先添加至少一个笔记库和一台电脑');
      }
      appendOut('检测到同步内核尚未初始化，正在自动生成配置…');
      progress('初始化同步内核…', null);
      const ini = await run('init');
      appendOut(ini.content || '');
      if (ini.success === false) throw new Error('初始化失败：' + ini.content);
    }

    progress('启动同步内核…', null);
    const started = await run('start');
    appendOut(started.content || '');
    progress(null);
    if (started.success === false) throw new Error('启动失败：' + started.content);
    const after = await refresh(true, true);
    if (after.process === 'running') {
      ToastManager.success(`✅ 已启动 · ${after.connected_count || 0} 台设备在线 · ${after.sync_verdict}`, 9000);
    } else {
      ToastManager.warning('⚠️ 启动命令已执行，但尚未检测到运行进程，请查看日志', 10000);
    }
  };

  const doSync = async () => {
    if (!(await guard())) return;
    progress('触发全部仓库扫描…', null);
    const r = await run('scan');
    if (r.success === false || /FATAL/.test(r.content || '')) {
      progress(null);
      throw new Error('立即同步失败：' + (r.content || '未知错误'));
    }
    ToastManager.info('🔄 已触发仓库扫描，正在刷新同步状态…', 5000);
    await sleep(1200);
    const kv = await refresh(true, true);
    progress(null);
    if (kv.status_available === 'no' || kv.folder_status_available === 'no') {
      ToastManager.warning('⚠️ 扫描请求已发送，但最新同步状态暂不可用，页面会自动重试', 8000);
    } else if (kv.process !== 'running') {
      ToastManager.warning('⚠️ 扫描请求已发送，但同步内核未运行', 8000);
    } else if (Number(kv.need_bytes) > 0) {
      ToastManager.info(`🔄 正在同步，还需 ${fmtBytes(kv.need_bytes)}`, 8000);
    } else {
      ToastManager.success(`✅ 扫描完成 · ${kv.connected_count || 0} 台设备在线`, 7000);
    }
  };

  const doLog = async () => {
    progress('读取日志…', null);
    const r = await run('tail-log', '150');
    progress(null);
    showOut(r.content || '(无日志)');
    ToastManager.info('📋 已加载最近日志（见下方输出区）');
  };

  // root_shell 在部分固件上可能把设备脚本的非零退出包装成 HTTP 成功，
  // 因此危险动作不能只看 success；空响应和脚本输出的 FATAL 也必须视为失败。
  const requireActionSuccess = (label, result) => {
    const content = String(result && result.content || '').trim();
    let reason = '';
    if (!result || result.success === false) reason = content || '设备命令执行失败';
    else if (!content) reason = '设备未返回执行结果';
    else if (/\bFATAL\b/i.test(content)) reason = content;
    if (reason) throw new Error(`${label}失败：${reason}`);
    return content;
  };

  const doUninstall = async () => {
    if (!(await guard())) return;
    progress('卸载中（仓库副本会保留）…', null);
    const r = await run('uninstall');
    progress(null);
    showOut(r && r.content || '(无输出)');
    requireActionSuccess('卸载', r);
    ToastManager.success('✅ 已移除同步内核与开机自启，仓库副本未删除。', 8000);
    await refresh(true, true);
  };

  const doPurge = async () => {
    if (!(await guard())) return;
    progress('删除本机仓库副本…', null);
    const r = await run('purge-data', PURGE_CONFIRM);
    progress(null);
    showOut(r && r.content || '(无输出)');
    requireActionSuccess('删除本机副本', r);
    ToastManager.warning('已删除本机副本与同步身份。其它设备数据不受影响，' +
      '本机需要重新完整同步。', 10000);
    await refresh(true, true);
  };

  /* ---------------------------------------------------------------------- */
  /* 面板                                                                    */
  /* ---------------------------------------------------------------------- */
  let poll = null;
  let refreshInFlight = null;
  let statusEpoch = 0;
  let pollFast = true;

  // 所有入口（手动按钮、定时轮询、页面恢复可见、动作后刷新）共用同一把锁。
  // 在途时直接返回同一 Promise，避免 WebView 里重叠请求状态与重复渲染。
  const refresh = (quiet, forceFresh = false) => {
    if (forceFresh) statusEpoch++;
    const wantedEpoch = statusEpoch;
    if (refreshInFlight) {
      if (refreshInFlight.epoch === wantedEpoch) return refreshInFlight.promise;
      // 有旧 epoch 请求在途时先等它退出，再发起动作后的强制新请求；状态调用
      // 始终保持单飞，也绝不会把旧响应交给本次动作的调用者。
      return refreshInFlight.promise.catch(() => ({})).then(() => refresh(quiet, false));
    }
    const entry = { epoch: wantedEpoch, promise: null };
    entry.promise = Promise.resolve().then(() => refreshNow(quiet, wantedEpoch))
      .finally(() => {
        if (refreshInFlight === entry) refreshInFlight = null;
        schedulePoll();
      });
    refreshInFlight = entry;
    return entry.promise;
  };

  const pollDelay = () => {
    const box = $('#collapse_ufisync');
    const open = box && box.getAttribute('data-name') === 'open';
    if (document.hidden || !open) return 60000;
    return pollFast ? 5000 : 20000;
  };

  const updatePollHint = () => {
    const panel = document.getElementById(PANEL_ID);
    if (panel) panel.dataset.pollMs = String(pollDelay());
  };

  const schedulePoll = () => {
    if (poll) { clearTimeout(poll); poll = null; }
    if (!document.getElementById(PANEL_ID)) return;
    const delay = pollDelay();
    updatePollHint();
    poll = setTimeout(() => {
      poll = null;
      if (!busy && !document.hidden) refresh(true);
      else schedulePoll();
    }, delay);
  };

  const onVisibilityChange = () => {
    if (document.hidden) { schedulePoll(); return; }
    if (!busy) refresh(true);
    else schedulePoll();
  };

  const cleanup = () => {
    allButtons.forEach((b) => b._cleanup && b._cleanup());
    allButtons.length = 0;
    if (poll) { clearTimeout(poll); poll = null; }
    document.removeEventListener('visibilitychange', onVisibilityChange);
    window.removeEventListener('beforeunload', cleanup);
    ToastManager.clear();
  };

  const inputStyle = 'padding:5px 8px;border:1px solid #555;border-radius:4px;' +
    'background:#333;color:#fff;font-size:12px;';

  const PANEL_HTML = `
<div id="${PANEL_ID}" style="width:100%;margin-top:10px;">
  <style id="ufis_style">
    #${PANEL_ID}{--fs-bg:#101922;--fs-card:#17232e;--fs-line:rgba(164,190,209,.16);--fs-text:#eef7fb;--fs-muted:#91a6b5;--fs-blue:#38bdf8;--fs-green:#34d399;color:var(--fs-text)}
    #${PANEL_ID} *{box-sizing:border-box}
    #${PANEL_ID} .deviceList>li{padding:15px!important;background:linear-gradient(145deg,rgba(56,189,248,.06),transparent 38%),var(--fs-bg);border:1px solid var(--fs-line);border-radius:14px;box-shadow:0 12px 30px rgba(0,0,0,.18)}
    #${PANEL_ID} .ufis-onboarding{padding:16px;margin-bottom:12px;border:1px solid rgba(56,189,248,.24);border-radius:12px;background:linear-gradient(135deg,rgba(56,189,248,.12),rgba(52,211,153,.05))}
    #${PANEL_ID} .ufis-onboarding h3{margin:0 0 6px;font-size:16px;color:var(--fs-text)}
    #${PANEL_ID} .ufis-onboarding p{margin:0 0 12px;font-size:12px;line-height:1.6;color:#bfd0db}
    #${PANEL_ID} #ufis_sync_verdict{font-size:17px!important;line-height:1.35}
    #${PANEL_ID} #ufis_primary_ops{display:flex;gap:8px;flex-wrap:wrap}
    #${PANEL_ID} #ufis_primary_ops .btn{min-height:36px;padding:7px 13px;border-radius:9px}
    #${PANEL_ID} #ufis_primary_ops .ufis-primary,#${PANEL_ID} #ufis_start_recovery .ufis-primary{background:#0284c7;color:#fff;border-color:#0ea5e9}
    #${PANEL_ID} details{border:1px solid var(--fs-line)!important;border-radius:11px!important;background:rgba(23,35,46,.78)!important;overflow:hidden}
    #${PANEL_ID} summary{padding:12px 13px!important;color:#dbe8ef!important;font-size:12px!important;font-weight:650!important}
    #${PANEL_ID} details[open]>summary{border-bottom:1px solid var(--fs-line)}
    #${PANEL_ID} .ufis-step-title{display:flex;align-items:center;gap:7px;margin:10px 0 7px;font-size:12px;font-weight:650;color:var(--fs-text)}
    #${PANEL_ID} .ufis-step-num{width:21px;height:21px;display:inline-grid;place-items:center;border-radius:7px;background:rgba(56,189,248,.13);color:#7dd3fc;font-size:10px}
    #${PANEL_ID} input{min-height:34px!important;padding:6px 9px!important;border:1px solid rgba(145,166,181,.28)!important;border-radius:8px!important;background:#0f1820!important;color:var(--fs-text)!important;font-size:12px!important;outline:none}
    #${PANEL_ID} input:focus{border-color:var(--fs-blue)!important;box-shadow:0 0 0 2px rgba(56,189,248,.10)}
    #${PANEL_ID} #ufis_out{border-radius:10px!important;background:#0b1117!important;border-color:var(--fs-line)!important;color:#cbd5e1!important}
    @media(max-width:560px){#${PANEL_ID} .deviceList>li{padding:12px!important;border-radius:11px}#${PANEL_ID} #ufis_grid,#${PANEL_ID} #ufis_peer_status{grid-template-columns:1fr!important}#${PANEL_ID} input{flex:1 1 100%!important;min-width:0!important;width:100%}#${PANEL_ID} .btn{min-height:40px}}
  </style>
  <div class="title" style="margin:6px 0;color:#fff;display:flex;align-items:center;gap:15px;">
    <strong style="color:#fff;">🔄 UFI Sync Node · 异地同步节点</strong>
    <div style="display:inline-block;" id="collapse_ufisync_btn"></div>
  </div>
  <div class="collapse" id="collapse_ufisync" data-name="close" style="height:0px;overflow:hidden;">
    <div class="collapse_box">
      <ul class="deviceList" style="margin:0;padding:0;list-style:none;">
        <li style="padding:15px;">
          <div style="font-weight:bold;margin-bottom:4px;color:#fff;font-size:14px;">
            <span id="ufis_dot" style="display:inline-block;width:9px;height:9px;border-radius:50%;background:#9e9e9e;margin-right:7px;"></span>
            持续在线的第三同步节点
          </div>
          <div style="font-size:11px;color:#888;margin-bottom:12px;">
            插件 v${VERSION} · device 保存并转发电脑更新，不传播 device 上的手工修改
          </div>

          <section id="ufis_onboarding" class="ufis-onboarding" style="display:none;">
            <h3>开始设置你的同步节点</h3>
            <p>添加至少一个 Obsidian 笔记库和一台电脑。已有设备身份和笔记副本都会保留。</p>
            <div id="ufis_setup_action"></div>
          </section>

          <div id="ufis_prog" style="display:none;margin-bottom:12px;padding:10px 12px;background:rgba(14,165,233,.12);border-radius:6px;border-left:3px solid #0ea5e9;">
            <div id="ufis_prog_text" style="font-size:12px;color:#e6f2fb;margin-bottom:6px;">…</div>
            <div style="height:5px;border-radius:3px;background:rgba(255,255,255,.15);overflow:hidden;">
              <div id="ufis_prog_bar" style="height:100%;width:0%;background:#0ea5e9;transition:width .3s;"></div>
            </div>
          </div>

          <section id="ufis_daily">
          <div style="margin-bottom:14px;padding:14px;background:linear-gradient(135deg,rgba(56,189,248,.10),rgba(52,211,153,.04)),var(--fs-card);border-radius:11px;border:1px solid var(--fs-line);">
            <div style="font-size:12px;color:#ccc;margin-bottom:8px;font-weight:500;">📊 同步状态</div>
            <div id="ufis_sync_verdict" style="font-size:14px;font-weight:600;color:#9ca3af;margin-bottom:9px;">正在读取状态…</div>
            <div id="ufis_start_recovery" style="display:none;align-items:center;gap:8px;margin:-1px 0 10px;"></div>
            <div id="ufis_sample_note" style="font-size:10px;color:#91a6b5;margin-bottom:10px;">正在连接 device 同步服务</div>
            <div style="font-size:11px;color:#b8c8d2;margin-bottom:6px;font-weight:600;">电脑</div>
            <div id="ufis_peer_status" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(190px,1fr));gap:7px;margin-bottom:9px;"></div>
            <div style="font-size:11px;color:#b8c8d2;margin:11px 0 6px;font-weight:600;">Obsidian 笔记库 · device 本地副本</div>
            <div id="ufis_folders_status" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(148px,1fr));gap:8px;margin-bottom:9px;"></div>
            <div id="ufis_grid" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(148px,1fr));gap:8px;"></div>
          </div>

          <div style="margin-bottom:14px;padding:12px;background:rgba(255,255,255,0.05);border-radius:6px;border-left:3px solid #10b981;">
            <div style="font-size:12px;color:#ccc;margin-bottom:8px;font-weight:500;">⚡ 常用操作</div>
            <div id="ufis_primary_ops" style="display:flex;gap:8px;flex-wrap:wrap;"></div>
          </div>
          </section>

          <details id="ufis_config_menu" style="margin-bottom:10px;background:rgba(255,255,255,0.05);border-radius:6px;border-left:3px solid #a855f7;">
            <summary style="cursor:pointer;padding:11px 12px;color:#ddd;font-size:12px;font-weight:600;">
              管理笔记库与电脑
              <span id="ufis_config_summary" style="font-weight:400;color:#888;margin-left:7px;"></span>
            </summary>
            <div style="padding:2px 12px 12px;">
            <div class="ufis-step-title"><span class="ufis-step-num">1</span>第 1 步 · 添加 Obsidian 笔记库</div>
            <div style="font-size:10px;color:#888;margin-bottom:8px;">
              Folder ID 必须与其它电脑上的 Folder ID 完全一致
            </div>
            <div id="ufis_folders" style="margin-bottom:8px;"></div>
            <div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center;">
              <input id="ufis_new_folder_id" type="text" placeholder="仓库 ID，如 my-vault" maxlength="64" style="${inputStyle}flex:1;min-width:150px;">
              <input id="ufis_new_folder_label" type="text" placeholder="显示名称（可选）" maxlength="40" style="${inputStyle}flex:1;min-width:120px;">
              <span id="ufis_add_folder"></span>
            </div>

            <div class="ufis-step-title"><span class="ufis-step-num">2</span>第 2 步 · 添加电脑</div>
            <div style="font-size:10px;color:#888;margin-bottom:8px;">
              在对方 Syncthing 的「操作 → 显示 ID」里复制，带不带连字符都可以
            </div>
            <div id="ufis_devices" style="margin-bottom:8px;"></div>
            <div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center;">
              <input id="ufis_new_device_id" type="text" placeholder="设备 ID（56 位）" maxlength="70" style="${inputStyle}flex:1;min-width:180px;">
              <input id="ufis_new_device_label" type="text" placeholder="电脑名，如书房笔记本" maxlength="40" style="${inputStyle}flex:1;min-width:100px;">
              <span id="ufis_add_device"></span>
            </div>
            <div class="ufis-step-title"><span class="ufis-step-num">3</span>第 3 步 · 检查并应用</div>
            <div id="ufis_review_summary" style="font-size:11px;line-height:1.55;color:#b8c8d2;padding:9px 10px;border:1px solid var(--fs-line);border-radius:8px;background:rgba(255,255,255,.025);"></div>
            <div id="ufis_cfg_ops" style="display:flex;gap:8px;flex-wrap:wrap;margin-top:8px;"></div>
            </div>
          </details>

          <details id="ufis_node_menu" style="margin-top:10px;">
            <summary>节点信息与电脑配对</summary>
            <div style="padding:10px 12px 12px;">
              <div style="font-size:10px;line-height:1.55;color:#91a6b5;margin-bottom:9px;">在电脑端添加下面的 Sync Node Device ID，再把相同 Folder ID 的 Obsidian 笔记库共享给它；地址保持 dynamic。</div>
              <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;padding:10px;border:1px solid var(--fs-line);border-radius:9px;background:rgba(255,255,255,.025);">
                <code id="ufis_device_id" style="flex:1;min-width:180px;color:#dff7ff;word-break:break-all;font-size:11px;">尚未初始化</code>
                <span id="ufis_copy_id"></span>
              </div>
              <div id="ufis_tech_grid" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(148px,1fr));gap:8px;margin-top:9px;"></div>
            </div>
          </details>

          <details id="ufis_admin_menu" style="background:rgba(255,255,255,0.05);border-radius:6px;border-left:3px solid #f59e0b;">
            <summary style="cursor:pointer;padding:11px 12px;color:#ddd;font-size:12px;font-weight:600;">⚙️ 部署与维护</summary>
            <div style="padding:2px 12px 12px;">
            <div style="font-size:11px;color:#999;margin-bottom:7px;">安装与诊断</div>
            <div id="ufis_ops" style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:13px;"></div>
            <div style="font-size:11px;color:#999;margin-bottom:7px;">维护（危险操作需点两次确认）</div>
            <div style="font-size:11px;line-height:1.55;color:#9ca3af;margin-bottom:8px;padding:9px 10px;border:1px solid var(--fs-line);border-radius:8px;background:rgba(255,255,255,.025);">
              同步内核固定为 ${DEFAULT_KERNEL}（可信哈希白名单）。当前预览版暂不提供在线升级；
              新版本必须先改为后台事务并完成回滚验收，再开放入口。
            </div>
            <div id="ufis_ops2" style="display:flex;gap:8px;flex-wrap:wrap;"></div>
            </div>
          </details>

          <pre id="ufis_out" style="display:none;margin:12px 0 0;padding:10px;max-height:300px;overflow:auto;
               font-size:11px;line-height:1.45;background:#1a1a1a;color:#ddd;border:1px solid #444;
               border-radius:6px;white-space:pre-wrap;word-break:break-all;"></pre>
        </li>
      </ul>
    </div>
  </div>
</div>`;

  const openConfig = () => {
    const menu = $('#ufis_config_menu');
    if (menu) menu.open = true;
  };

  const mount = (container) => {
    const old = document.getElementById(PANEL_ID);
    if (old) { cleanup(); old.remove(); }

    container.insertAdjacentHTML('afterend', PANEL_HTML);

    $('#ufis_add_folder').appendChild(createButton('添加笔记库', addFolder, false, true));
    $('#ufis_add_device').appendChild(createButton('添加电脑', addDevice, false, true));
    $('#ufis_setup_action').appendChild(createButton('开始设置', openConfig));
    $('#ufis_copy_id').appendChild(createButton('复制', copyDeviceId, false, true));
    const recoveryButton = createButton('启动同步', doStart);
    recoveryButton.classList.add('ufis-primary');
    $('#ufis_start_recovery').appendChild(recoveryButton);

    const cfgOps = document.createDocumentFragment();
    [
      createButton('保存并应用', saveConfig),
      createButton('重新读取', loadConfig)
    ].forEach((b) => cfgOps.appendChild(b));
    $('#ufis_cfg_ops').appendChild(cfgOps);

    const primaryOps = document.createDocumentFragment();
    [
      createButton('立即同步', doSync),
      createButton('管理同步', openConfig),
      createButton('刷新', () => refresh(false))
    ].forEach((b) => primaryOps.appendChild(b));
    $('#ufis_primary_ops').appendChild(primaryOps);
    const primaryButton = $('#ufis_primary_ops button');
    if (primaryButton) primaryButton.classList.add('ufis-primary');

    const ops = document.createDocumentFragment();
    [
      createButton('① 环境体检', doPreflight),
      createButton('② 一键安装', doInstall),
      createButton('启动', doStart),
      createButton('停止', simple('stop'), true),
      createButton('重启', simple('restart')),
      createButton('查看日志', doLog),
      createButton('诊断', doDiag)
    ].forEach((b) => ops.appendChild(b));
    $('#ufis_ops').appendChild(ops);

    const ops2 = document.createDocumentFragment();
    [
      createButton('重新初始化配置', simple('init'), true),
      createButton('卸载（保留副本）', doUninstall, true),
      createButton('删除本机副本', doPurge, true)
    ].forEach((b) => ops2.appendChild(b));
    $('#ufis_ops2').appendChild(ops2);

    if (typeof collapseGen === 'function') {
      collapseGen('#collapse_ufisync_btn', '#collapse_ufisync', '#collapse_ufisync', () => {
        if (!busy && !document.hidden) refresh(true);
      });
    }

    renderConfig();
    refresh(true);

    document.addEventListener('visibilitychange', onVisibilityChange);
    window.addEventListener('beforeunload', cleanup);
  };

  const boot = () => {
    let tries = 0;
    const tick = () => {
      const c = document.querySelector('.functions-container');
      if (c) { mount(c); return; }
      if (++tries > 60) { console.warn('[ufisync] 找不到 .functions-container，插件未挂载'); return; }
      setTimeout(tick, 250);
    };
    tick();
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
//</script>
