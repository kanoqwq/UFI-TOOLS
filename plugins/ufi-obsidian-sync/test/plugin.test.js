/* 插件冒烟测试：在 jsdom 里模拟 UFI-TOOLS 页面环境加载当前源码。
 * 运行：JSDOM_PATH=/path/to/jsdom node test/plugin.test.js
 */
const fs = require('fs');
const path = require('path');
const { JSDOM } = require(process.env.JSDOM_PATH || 'jsdom');

const SRC = path.join(__dirname, '..', 'plugin', 'ufi-obsidian-sync.src.js');
const DEVICE_SCRIPT = path.join(__dirname, '..', 'device', 'ufisync.sh');
const raw = fs.readFileSync(SRC, 'utf8').replace(
  '__UFISYNC_SH_B64__', fs.readFileSync(DEVICE_SCRIPT).toString('base64'));

let failures = 0;
const check = (name, cond, extra) => {
  if (cond) console.log('  ✅ ' + name);
  else { console.log('  ❌ ' + name + (extra ? '  → ' + extra : '')); failures++; }
};

console.log('UFI-TOOLS 插件格式');
check('首行是 //<script>', raw.split('\n')[0].trim() === '//<script>');
check('末行是 //</script>', raw.trim().split('\n').pop().trim() === '//</script>');
check('体积在 1145KB 以内', Buffer.byteLength(raw) < 1145000, Buffer.byteLength(raw));

// DEV_MAC 取自 Syncthing 官方项目的公开示例；其余两个由合法 52 位 Base32 载荷生成。
const DEV_MAC = 'FZ23CS4-PDV743V-32LS44M-TCIUBAQ-RQ3OC4X-XN6EG66-BGUCZH4-OISTMAE';
const DEV_WIN = 'BBBBBBB-BBBBBBN-BBBBBBB-BBBBBBN-BBBBBBB-BBBBBBN-BBBBBBB-BBBBBBN';
const DEV_LINUX = 'CCCCCCC-CCCCCC2-CCCCCCC-CCCCCC2-CCCCCCC-CCCCCC2-CCCCCCC-CCCCCC2';
const legacyDeviceId = (id) => id.replace(/-/g, '').match(/.{14}/g)
  .map((group) => group.slice(0, 13)).join('');
const DEV_WIN_LEGACY = legacyDeviceId(DEV_WIN);

const CONFIG_LINES = [
  'F|notes-main|我的笔记',
  'F|research-notes|研究资料',
  `D|${DEV_MAC}|Mac`,
  `D|${DEV_WIN}|Windows`
].join('\n');

const STATUS = [
  '### UFISYNC-STATUS v2.3.1',
  'installed=yes', 'initialized=yes',
  'kernel_version=syncthing v1.30.0 "Gold Grasshopper"',
  'pid=4711', 'process=running',
  'process_count=2', 'process_rss_mb=84', 'process_threads=21',
  'data_root=/sdcard/ufisync/vaults', 'sync_port=22001',
  'free_mb=53844', 'min_free_mb=1024',
  'boot_hook=yes', 'watchdog_hook=yes',
  '--- config ---', CONFIG_LINES,
  '--- system/status ---',
  '{"myID":"ABCDEFG-HIJKLMO-NOPQRST-UVWXYZS-234567A-BCDEFG5-HIJKLMN-OPQRSTH",' +
    '"connectionServiceStatus":{"dynamic+https://relays.syncthing.net/endpoint":{' +
    '"error":null,"lanAddresses":["relay://203.0.113.1:22067"],"wanAddresses":["relay://203.0.113.1:22067"]}}}',
  '--- system/version ---', '{"version":"v1.30.0"}',
  '--- system/connections ---',
  `{"connections":{"${DEV_MAC}":{"connected":true,"type":"tcp-client"},` +
    `"${DEV_WIN}":{"connected":true,"type":"relay-client"}}}`,
  '--- system/error ---',
  '{"errors":[{"when":"2026-07-31T08:06:23.527173262Z","message":"Syncthing should not run as a privileged or system user. Please consider using a normal user account."}]}',
  '--- db/notes-main ---',
  '{"globalBytes":928667159,"localBytes":928667159,"needBytes":0,"stateChanged":"2026-07-30T12:00:00Z"}',
  '--- db/research-notes ---',
  '{"globalBytes":60618110,"localBytes":30309055,"needBytes":30309055,"stateChanged":"2026-07-30T12:00:00Z"}',
  '### END'
].join('\n');
const STATUS_MISSING = 'sh: /data/data/com.minikano.f50_sms/files/ufisync/ufisync.sh: not found';
const withoutStatusBlock = (text, name) => {
  const lines = String(text).split('\n');
  const at = lines.indexOf(`--- ${name} ---`);
  if (at >= 0) lines.splice(at, 2);
  return lines.join('\n');
};
let statusOutput = STATUS_MISSING;
let statusSuccess = true;
let statusResponseQueue = [];
let applyResult = { success: true, content: '配置已应用并启动' };
let stopResult = { success: true, content: '已停止' };
let uninstallResult = { success: true, content: '卸载完成' };
let purgeResult = { success: true, content: '删除完成' };
let statusDelayMs = 2;

const PREFLIGHT = [
  '### UFISYNC-PREFLIGHT v2.1.0',
  'abi=arm64-v8a', 'model=device', 'android_sdk=33', 'is_root=yes', 'selinux=Permissive',
  'libc=bionic', 'mem_total_mb=1467', 'mem_avail_mb=424',
  'free_data_mb=53844', 'free_sdcard_mb=53844', 'target_version=1.30.0',
  'tool:curl=yes', 'tool:wget=no', 'tool:busybox=no', 'tool:tar=yes', 'tool:base64=yes',
  'port:22000=busy', 'port:22001=free', 'sync_port_choice=22001',
  'net_github=200', 'net_ghproxy=200',
  'verdict=pass', 'verdict_reason=ok',
  '### END'
].join('\n');

const DIAG_GLIBC = [
  '### UFISYNC-DIAG', 'target_version=2.1.2', 'bin_exists=yes',
  'linkage=dynamic-glibc',
  'linkage_note=该二进制需要 glibc 动态链接器，Android 的 bionic libc 无法执行。',
  '### END'
].join('\n');

const calls = [];
const toasts = [];
let installPolls = 0;
let activeStatusCalls = 0;
let maxStatusCalls = 0;

const dom = new JSDOM(
  '<!doctype html><html><body><div class="functions-container"></div></body></html>',
  { runScripts: 'outside-only', pretendToBeVisual: true });
const { window } = dom;

window.runShellWithRoot = (cmd, timeout) => {
  calls.push({ cmd, timeout });
  if (cmd === 'whoami') return Promise.resolve({ success: true, content: 'root\n' });
  if (/ status$/.test(cmd)) {
    const queued = statusResponseQueue.length ? statusResponseQueue.shift() : null;
    activeStatusCalls++;
    maxStatusCalls = Math.max(maxStatusCalls, activeStatusCalls);
    return new Promise((resolve) => setTimeout(() => {
      activeStatusCalls--;
      resolve(queued || { success: statusSuccess, content: statusOutput });
    }, queued && queued.delay !== undefined ? queued.delay : statusDelayMs));
  }
  if (/ufisync\.sh\.deploy-[^ ]+\.new version$/.test(cmd)) {
    return Promise.resolve({ success: true, content: 'ufisync 2.3.1 / syncthing target v1.30.0' });
  }
  if (/ version$/.test(cmd)) return Promise.resolve({ success: true, content: 'ufisync 2.2.1' });
  if (/ preflight$/.test(cmd)) return Promise.resolve({ success: true, content: PREFLIGHT });
  if (/ diag$/.test(cmd)) return Promise.resolve({ success: true, content: DIAG_GLIBC });
  if (/ get-config$/.test(cmd)) {
    return Promise.resolve({ success: true, content: `### UFISYNC-CONFIG\n${CONFIG_LINES}\n### END` });
  }
  if (/ set-config$/.test(cmd)) return Promise.resolve({ success: true, content: '配置已保存：3 个仓库，2 台可信设备' });
  if (/ apply-config$/.test(cmd)) return Promise.resolve(applyResult);
  if (/ stop$/.test(cmd)) return Promise.resolve(stopResult);
  if (/ uninstall$/.test(cmd)) return Promise.resolve(uninstallResult);
  if (/ purge-data CONFIRM-DELETE-VAULT-COPIES$/.test(cmd)) return Promise.resolve(purgeResult);
  if (/ install$/.test(cmd)) return Promise.resolve({ success: true, content: 'install-started' });
  if (/ install-status$/.test(cmd)) {
    installPolls++;
    const stage = installPolls < 3 ? 'downloading' : 'done';
    return Promise.resolve({
      success: true,
      content: `### UFISYNC-INSTALL\nstage=${stage}\nmessage=从 ghproxy.net 下载\nat=12:00:0${installPolls}\n` +
        `downloaded_bytes=${installPolls * 4000000}\ninstalled=yes\n### END`
    });
  }
  return Promise.resolve({ success: true, content: 'ok' });
};
window.createToast = (msg, color, ms) => {
  toasts.push({ msg, color, ms });
  return window.document.createElement('div');
};
window.collapseGen = () => { };
window.SHA256 = () => 'DEADBEEF';
window.KANO_TOKEN = 'ABCDEF0123456789';

// 压缩测试中的安装轮询；长间隔状态轮询另行记录活跃计时器。
const realSetTimeout = window.setTimeout.bind(window);
const realClearTimeout = window.clearTimeout.bind(window);
const pollDurations = [];
const activePollTimers = new Set();
const activePollCallbacks = new Map();
window.setTimeout = (fn, ms, ...args) => {
  if (ms === 2000) return realSetTimeout(fn, 20, ...args);
  if (ms >= 5000) {
    pollDurations.push(ms);
    let handle = null;
    handle = realSetTimeout(() => {
      activePollTimers.delete(handle);
      activePollCallbacks.delete(handle);
      fn(...args);
    }, 250);
    activePollTimers.add(handle);
    activePollCallbacks.set(handle, () => {
      if (!activePollTimers.has(handle)) return false;
      realClearTimeout(handle);
      activePollTimers.delete(handle);
      activePollCallbacks.delete(handle);
      fn(...args);
      return true;
    });
    return handle;
  }
  return realSetTimeout(fn, ms, ...args);
};
window.clearTimeout = (handle) => {
  activePollTimers.delete(handle);
  activePollCallbacks.delete(handle);
  return realClearTimeout(handle);
};

const fireLatestPoll = () => {
  const handles = [...activePollTimers];
  const callback = activePollCallbacks.get(handles[handles.length - 1]);
  return callback ? callback() : false;
};

window.eval(raw);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const btn = (panel, label) =>
  [...panel.querySelectorAll('button')].find((b) => b.textContent.includes(label));

// 独立页面探针：第一次状态请求只是瞬时失败时，不能把“没读到”误判为
// “全新设备 / 空配置”，下一次健康响应还必须能正常恢复。
const testFirstTransientFailureRecovery = async () => {
  const probeDom = new JSDOM(
    '<!doctype html><html><body><div class="functions-container"></div></body></html>',
    { runScripts: 'outside-only', pretendToBeVisual: true });
  const probe = probeDom.window;
  const probeCalls = [];
  const probeToasts = [];
  let probeStatus = { success: false, content: 'root_shell request timed out' };
  probe.runShellWithRoot = (cmd, timeout) => {
    probeCalls.push({ cmd, timeout });
    if (/ status$/.test(cmd)) return Promise.resolve(probeStatus);
    if (cmd === 'whoami') return Promise.resolve({ success: true, content: 'root\n' });
    return Promise.resolve({ success: true, content: 'ok' });
  };
  probe.createToast = (msg, color, ms) => {
    probeToasts.push({ msg, color, ms });
    return probe.document.createElement('div');
  };
  probe.collapseGen = () => { };
  probe.SHA256 = () => 'DEADBEEF';
  probe.KANO_TOKEN = 'ABCDEF0123456789';
  probe.eval(raw);
  await sleep(250);

  const probePanel = probe.document.querySelector('#UFI_OBSIDIAN_SYNC');
  check('首次瞬时失败显示“状态暂不可用”而非“控制脚本未部署”',
    probePanel && probe.document.querySelector('#ufis_sync_verdict').textContent === '状态暂不可用' &&
      !/控制脚本未部署/.test(probe.document.querySelector('#ufis_grid').textContent));
  check('首次瞬时失败不显示空配置引导',
    probe.document.querySelector('#ufis_onboarding').style.display === 'none' &&
      /配置尚未读取/.test(probe.document.querySelector('#ufis_config_summary').textContent));

  const writesBeforeUnknownSave = probeCalls.length;
  btn(probePanel, '保存并应用').click();
  await sleep(80);
  check('配置未知时拒绝保存，不会部署脚本或覆盖配置',
    !probeCalls.slice(writesBeforeUnknownSave).some((c) => /set-config|ufisync\.sh\.b64/.test(c.cmd)) &&
      probeToasts.some((t) => /无法确认[\s\S]*不会保存|配置尚未读取/.test(t.msg)));

  probeStatus = { success: true, content: STATUS };
  btn(probePanel, '刷新').click();
  await sleep(250);
  check('首次瞬时失败后的健康响应恢复配置与实时状态',
    /2 个笔记库 · 2 台电脑/.test(probe.document.querySelector('#ufis_config_summary').textContent) &&
      /Mac[\s\S]*已连接[\s\S]*Windows[\s\S]*已连接/.test(probe.document.querySelector('#ufis_peer_status').textContent));
  probeDom.window.close();
};

// 设备端已有健康控制脚本时，候选脚本必须先在旁路文件中通过校验。
// 这里模拟候选文件 sh -n 失败；用户从 UI 触发部署后，旧脚本仍应可用。
const testAtomicDeployPreservesOldScript = async () => {
  const probeDom = new JSDOM(
    '<!doctype html><html><body><div class="functions-container"></div></body></html>',
    { runScripts: 'outside-only', pretendToBeVisual: true });
  const probe = probeDom.window;
  const probeCalls = [];
  const probeToasts = [];
  const livePath = '/data/data/com.minikano.f50_sms/files/ufisync/ufisync.sh';
  let liveScript = 'ufisync 2.2.1 (healthy)';

  probe.runShellWithRoot = (cmd, timeout) => {
    probeCalls.push({ cmd, timeout });
    if (cmd === 'whoami') return Promise.resolve({ success: true, content: 'root\n' });
    if (/ status$/.test(cmd)) return Promise.resolve({ success: true, content: STATUS });
    if (/^base64 -d /.test(cmd)) {
      const target = (cmd.match(/>\s*(\S+)/) || [])[1];
      if (target === livePath) liveScript = 'invalid candidate';
      return Promise.resolve({ success: true, content: '' });
    }
    if (/^test -s /.test(cmd)) return Promise.resolve({ success: true, content: '' });
    if (/^sh -n /.test(cmd)) {
      return Promise.resolve({ success: false, content: 'syntax error: unexpected end of file' });
    }
    if (/ version$/.test(cmd)) {
      return Promise.resolve({ success: true, content: 'ufisync 2.3.1 / syncthing target v1.30.0' });
    }
    return Promise.resolve({ success: true, content: 'ok' });
  };
  probe.createToast = (msg, color, ms) => {
    probeToasts.push({ msg, color, ms });
    return probe.document.createElement('div');
  };
  probe.collapseGen = () => { };
  probe.SHA256 = () => 'DEADBEEF';
  probe.KANO_TOKEN = 'ABCDEF0123456789';
  probe.eval(raw);
  await sleep(250);

  const probePanel = probe.document.querySelector('#UFI_OBSIDIAN_SYNC');
  btn(probePanel, '环境体检').click();
  await sleep(350);
  const commands = probeCalls.map((c) => c.cmd);
  check('候选脚本语法失败时保留旧控制脚本', liveScript === 'ufisync 2.2.1 (healthy)', liveScript);
  check('候选脚本在控制脚本同目录旁路解码',
    commands.some((c) => new RegExp(`> ${livePath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\.deploy-[^ ]+\\.new`).test(c)) &&
      !commands.some((c) => new RegExp(`> ${livePath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?: |$)`).test(c)),
    commands.filter((c) => /^base64 -d /.test(c)).join(' → '));
  check('候选脚本语法失败时不会原子替换',
    !commands.some((c) => /\bmv\b[\s\S]*ufisync\.sh/.test(c)), commands.join(' → '));
  check('候选脚本语法失败会向 UI 报错',
    probeToasts.some((t) => t.color === 'red' && /控制脚本[\s\S]*语法|语法校验/.test(t.msg)),
    probeToasts.map((t) => t.msg).join(' → '));
  probeDom.window.close();
};

setTimeout(async () => {
  console.log('\n控制脚本原子部署');
  await testAtomicDeployPreservesOldScript();
  console.log('\n首次瞬时失败与恢复');
  await testFirstTransientFailureRecovery();
  const doc = window.document;
  const panel = doc.querySelector('#UFI_OBSIDIAN_SYNC');

  console.log('\n挂载与结构');
  check('面板已挂载', !!panel);
  check('挂在 .functions-container 之后',
    panel && panel.previousElementSibling &&
    panel.previousElementSibling.classList.contains('functions-container'));
  check('用了 UFI-TOOLS 的折叠结构',
    !!doc.querySelector('#collapse_ufisync .collapse_box .deviceList'));
  check('按钮用 .btn 类',
    [...panel.querySelectorAll('button')].every((b) => b.classList.contains('btn')));
  check('有面板内进度条', !!doc.querySelector('#ufis_prog_bar'));
  const scopedStyle = doc.querySelector('#ufis_style');
  check('视觉样式集中且限定在插件面板内',
    scopedStyle && scopedStyle.textContent.includes('#UFI_OBSIDIAN_SYNC'));
  check('320px 窄屏有单列网格与全宽输入框规则',
    scopedStyle && /@media\(max-width:560px\)/.test(scopedStyle.textContent) &&
      /#ufis_grid[^}]*grid-template-columns:1fr/.test(scopedStyle.textContent) &&
      /input[^}]*width:100%/.test(scopedStyle.textContent));
  check('包含首次设置引导', !!doc.querySelector('#ufis_onboarding'));
  check('包含日常状态台', !!doc.querySelector('#ufis_daily'));

  console.log('\n信息架构：高频操作直达，低频设置折叠');
  const configMenu = doc.querySelector('#ufis_config_menu');
  const adminMenu = doc.querySelector('#ufis_admin_menu');
  const primaryOps = doc.querySelector('#ufis_primary_ops');
  check('仓库与设备配置使用二级菜单',
    configMenu && configMenu.tagName === 'DETAILS');
  check('部署与维护是默认关闭的二级菜单',
    adminMenu && adminMenu.tagName === 'DETAILS' && !adminMenu.open);
  check('仓库添加输入框收进配置二级菜单',
    configMenu && configMenu.contains(doc.querySelector('#ufis_new_folder_id')));
  check('一键安装和诊断收进部署维护二级菜单',
    adminMenu && adminMenu.textContent.includes('一键安装') && adminMenu.textContent.includes('诊断'));
  const primaryLabels = primaryOps ? [...primaryOps.querySelectorAll('button')].map((b) => b.textContent.trim()) : [];
  check('日常区只保留立即同步、管理同步和刷新三个动作',
    JSON.stringify(primaryLabels) === JSON.stringify(['立即同步', '管理同步', '刷新']), primaryLabels.join(','));
  check('配置区按笔记库、电脑、应用三步组织',
    /第 1 步[\s\S]*Obsidian[\s\S]*第 2 步[\s\S]*电脑[\s\S]*第 3 步[\s\S]*应用/.test(configMenu.textContent));
  check('保存按钮直接表达保存并应用', !!btn(configMenu, '保存并应用'));
  check('启动和停止移入部署维护',
    adminMenu && !!btn(adminMenu, '启动') && !!btn(adminMenu, '停止'));

  console.log('\n全新设备：控制脚本不存在也能完成首次配置');
  check('未部署控制脚本时显示首次设置引导',
    doc.querySelector('#ufis_onboarding').style.display !== 'none');
  check('未部署控制脚本时自动打开配置', configMenu.open === true);
  check('未部署控制脚本时隐藏误导性日常状态台',
    doc.querySelector('#ufis_daily').style.display === 'none');
  const missingStatusCell = doc.querySelector('#ufis_grid > div');
  btn(panel, '刷新').click();
  await sleep(350);
  check('控制脚本缺失的相同状态刷新不重建 DOM',
    missingStatusCell && doc.querySelector('#ufis_grid > div') === missingStatusCell);

  doc.querySelector('#ufis_new_folder_id').value = 'fresh-notes';
  doc.querySelector('#ufis_new_folder_label').value = '首次安装笔记';
  btn(panel, '添加笔记库').click();
  await sleep(30);
  doc.querySelector('#ufis_new_device_id').value = 'c'.repeat(52);
  doc.querySelector('#ufis_new_device_label').value = '第一台电脑';
  btn(panel, '添加电脑').click();
  await sleep(120);
  applyResult = { success: false, content: 'FATAL: 同步内核未安装，请先执行安装' };
  const beforeFreshSave = calls.length;
  btn(panel, '保存并应用').click();
  await sleep(1500);
  const freshSaveCalls = calls.slice(beforeFreshSave).map((c) => c.cmd);
  const freshDeployAt = freshSaveCalls.findIndex((c) => /ufisync\.sh\.deploy-[^ ]+\.b64/.test(c));
  const freshSetConfigAt = freshSaveCalls.findIndex((c) => /ufisync\.sh set-config$/.test(c));
  check('全新设备保存前先部署当前控制脚本',
    freshDeployAt >= 0 && freshSetConfigAt > freshDeployAt, freshSaveCalls.join(' → '));
  check('旧 2.2.1 控制脚本不会在配置前被直接调用',
    freshSaveCalls.some((c) => /sh [^ ]*ufisync\.sh\.deploy-[^ ]+\.new version$/.test(c)) &&
      freshSaveCalls.some((c) => /chmod 700 [^ ]*ufisync\.sh\.deploy-[^ ]+\.new && mv -f [^ ]+ [^ ]*ufisync\.sh$/.test(c)) &&
      freshSetConfigAt > freshDeployAt);
  const nonemptyAt = freshSaveCalls.findIndex((c) => /^test -s [^ ]*ufisync\.sh\.deploy-[^ ]+\.new$/.test(c));
  const syntaxAt = freshSaveCalls.findIndex((c) => /^sh -n [^ ]*ufisync\.sh\.deploy-[^ ]+\.new$/.test(c));
  const versionAt = freshSaveCalls.findIndex((c) => /^sh [^ ]*ufisync\.sh\.deploy-[^ ]+\.new version$/.test(c));
  const switchAt = freshSaveCalls.findIndex((c) => /^chmod 700 [^ ]+ && mv -f [^ ]+ [^ ]*ufisync\.sh$/.test(c));
  check('候选脚本按非空、语法、2.3.1 版本顺序校验后才原子切换',
    nonemptyAt >= 0 && syntaxAt > nonemptyAt && versionAt > syntaxAt && switchAt > versionAt,
    `${nonemptyAt}/${syntaxAt}/${versionAt}/${switchAt}`);
  check('全新设备保存后引导安装内核',
    adminMenu.open === true && toasts.some((t) => /已保存[\s\S]*一键安装/.test(t.msg)));

  applyResult = { success: true, content: '配置已应用并启动' };
  statusOutput = STATUS;
  btn(panel, '刷新').click();
  await sleep(500);
  configMenu.open = false;
  adminMenu.open = false;

  console.log('\n状态渲染（仓库由配置驱动，不再写死）');
  const text = panel.textContent;
  check('显示本机设备 ID', text.includes('ABCDEFG-HIJKLMO'));
  check('内核版本显示 1.30.0', text.includes('1.30.0'));
  check('显示实际同步端口 22001', text.includes('22001'));
  check('明确显示公网中继已就绪', /公网中继[\s\S]{0,30}已就绪/.test(text));
  const folderStatus = doc.querySelector('#ufis_folders_status');
  check('按配置渲染了 notes-main', folderStatus && /我的笔记[\s\S]{0,60}100%/.test(folderStatus.textContent));
  check('按配置渲染了 research-notes', folderStatus && /研究资料[\s\S]{0,60}50%/.test(folderStatus.textContent));
  check('待同步字节已格式化', text.includes('28.9 MB'));
  check('日常区明确显示 monitor + worker 的合计 RSS',
    /合计 RSS[\s\S]{0,30}84 MB/.test((doc.querySelector('#ufis_daily') || {}).textContent || ''));
  check('区分直连与中继', text.includes('直连') && text.includes('中继'));
  const peerStatus = doc.querySelector('#ufis_peer_status');
  check('逐台显示 Mac 与 Windows 的连接状态',
    peerStatus && /Mac[\s\S]*已连接[\s\S]*Windows[\s\S]*已连接/.test(peerStatus.textContent));
  check('显著且准确地描述 device 副本状态',
    /device 正在更新副本[\s\S]*28\.9 MB/.test((doc.querySelector('#ufis_sync_verdict') || {}).textContent || ''));
  const dailyText = (doc.querySelector('#ufis_daily') || {}).textContent || '';
  check('日常区隐藏 PID、端口和 Syncthing 术语', !/PID|同步端口|Syncthing/i.test(dailyText), dailyText);
  const nodeMenu = doc.querySelector('#ufis_node_menu');
  check('设备 ID 与技术参数收进节点信息二级菜单',
    nodeMenu && nodeMenu.textContent.includes('ABCDEFG-HIJKLMO') && nodeMenu.textContent.includes('22001'));
  check('节点信息提供复制 Sync Node Device ID', nodeMenu && !!btn(nodeMenu, '复制'));
  check('Android root 运行提示不计为同步错误',
    !/需要处理[\s\S]*错误/.test((doc.querySelector('#ufis_sync_verdict') || {}).textContent || ''));

  console.log('\n状态读取失败：旧的在线与同步结论立即过期');
  statusSuccess = false;
  statusOutput = 'root_shell request timed out';
  btn(panel, '刷新').click();
  await sleep(400);
  const unavailableVerdict = (doc.querySelector('#ufis_sync_verdict') || {}).textContent || '';
  const unavailablePeers = (doc.querySelector('#ufis_peer_status') || {}).textContent || '';
  const unavailableFolders = (doc.querySelector('#ufis_folders_status') || {}).textContent || '';
  const unavailableGrid = (doc.querySelector('#ufis_grid') || {}).textContent || '';
  check('健康状态后超时明确显示“状态暂不可用”', unavailableVerdict === '状态暂不可用', unavailableVerdict);
  check('状态失败后电脑连接结论改为未知，不沿用已连接/直连/中继',
    /Mac[\s\S]*状态未知[\s\S]*Windows[\s\S]*状态未知/.test(unavailablePeers) &&
      !/已连接|直连|中继/.test(unavailablePeers), unavailablePeers);
  check('状态失败后笔记库进度改为未知，不沿用百分比',
    /我的笔记[\s\S]*同步状态未知[\s\S]*研究资料[\s\S]*同步状态未知/.test(unavailableFolders) &&
      !/\d+%/.test(unavailableFolders), unavailableFolders);
  check('状态失败后摘要不沿用在线数、待同步量和中继结论',
    !/2\/2|28\.9 MB|已就绪/.test(unavailableGrid), unavailableGrid);
  statusSuccess = true;
  statusOutput = STATUS;
  btn(panel, '刷新').click();
  await sleep(400);
  check('下一次健康响应会恢复实时状态',
    /device 正在更新副本/.test((doc.querySelector('#ufis_sync_verdict') || {}).textContent || '') &&
      /Mac[\s\S]*已连接[\s\S]*Windows[\s\S]*已连接/.test((doc.querySelector('#ufis_peer_status') || {}).textContent || ''));

  console.log('\n状态 API 与笔记库数据完整性');
  statusOutput = withoutStatusBlock(STATUS, 'system/status');
  btn(panel, '刷新').click();
  await sleep(400);
  check('system/status 区块缺失时整体状态暂不可用',
    (doc.querySelector('#ufis_sync_verdict') || {}).textContent === '状态暂不可用');
  check('system/status 区块缺失时不伪造待同步 0 B',
    !/待同步[\s\S]{0,30}0 B/.test((doc.querySelector('#ufis_grid') || {}).textContent || ''));

  statusOutput = withoutStatusBlock(STATUS, 'db/research-notes');
  btn(panel, '刷新').click();
  await sleep(400);
  const partialFolderText = (doc.querySelector('#ufis_folders_status') || {}).textContent || '';
  check('单个 db/status 区块缺失时该笔记库显示暂不可用而非 0%',
    /研究资料[\s\S]*同步状态暂不可用/.test(partialFolderText) &&
      !/研究资料[\s\S]{0,30}0%/.test(partialFolderText), partialFolderText);
  check('任一 db/status 缺失时待同步总量不伪造为 0 B',
    /待同步[\s\S]{0,30}暂不可用/.test((doc.querySelector('#ufis_grid') || {}).textContent || ''));
  check('任一 db/status 缺失时不声称 device 已保存最新副本',
    /笔记库状态暂不可用/.test((doc.querySelector('#ufis_sync_verdict') || {}).textContent || ''));

  statusOutput = STATUS.replace(
    '{"globalBytes":60618110,"localBytes":30309055,"needBytes":30309055,"stateChanged":"2026-07-30T12:00:00Z"}',
    '{}');
  btn(panel, '刷新').click();
  await sleep(400);
  check('空 db/status 对象按不完整处理而非空仓库',
    /研究资料[\s\S]*同步状态暂不可用/.test((doc.querySelector('#ufis_folders_status') || {}).textContent || '') &&
      /笔记库状态暂不可用/.test((doc.querySelector('#ufis_sync_verdict') || {}).textContent || ''));

  statusOutput = STATUS
    .replace('{"globalBytes":928667159,"localBytes":928667159,"needBytes":0,"stateChanged":"2026-07-30T12:00:00Z"}',
      '{"globalBytes":0,"localBytes":0,"needBytes":0,"stateChanged":"2026-07-30T12:00:00Z"}')
    .replace('{"globalBytes":60618110,"localBytes":30309055,"needBytes":30309055,"stateChanged":"2026-07-30T12:00:00Z"}',
      '{"globalBytes":0,"localBytes":0,"needBytes":0,"stateChanged":"2026-07-30T12:00:00Z"}');
  btn(panel, '刷新').click();
  await sleep(400);
  const emptyFolderText = (doc.querySelector('#ufis_folders_status') || {}).textContent || '';
  check('已知为空的笔记库显示“空仓库 · 0 B”',
    (emptyFolderText.match(/空仓库 · 0 B/g) || []).length === 2, emptyFolderText);
  check('已知为空的笔记库不显示误导性 0%', !/0%/.test(emptyFolderText), emptyFolderText);
  statusOutput = STATUS;
  btn(panel, '刷新').click();
  await sleep(400);

  console.log('\n连接状态自动刷新：离线设备不得沿用旧的“已连接/直连”');
  const refreshBtn = btn(panel, '刷新');
  doc.querySelector('#collapse_ufisync').setAttribute('data-name', 'open');
  if (refreshBtn) refreshBtn.click();
  await sleep(350);
  check('刷新按钮可见', !!refreshBtn);
  check('异常或同步中使用 5 秒快速轮询',
    panel.dataset.pollMs === '5000' && pollDurations.some((ms) => ms === 5000),
    `${panel.dataset.pollMs}; ${pollDurations.join(',')}`);

  console.log('\n刷新严格单飞：定时轮询与手点刷新真实竞态');
  statusDelayMs = 160;
  const statusCallsBeforeRace = calls.filter((c) => / status$/.test(c.cmd)).length;
  const timerWasFired = fireLatestPoll();
  await sleep(10);
  refreshBtn.click();
  await sleep(220);
  const statusCallsDuringRace = calls.filter((c) => / status$/.test(c.cmd)).length - statusCallsBeforeRace;
  check('测试确实先发起定时轮询，再在请求未完成时手点刷新', timerWasFired);
  check('手动与定时刷新共用同一个在途请求',
    statusCallsDuringRace === 1 && maxStatusCalls === 1,
    `发起 ${statusCallsDuringRace} 次，最大并发 ${maxStatusCalls}`);
  statusDelayMs = 2;

  console.log('\n动作后强制刷新：丢弃动作前旧响应且保持单飞');
  const stoppedStatus = STATUS
    .replace('pid=4711', 'pid=')
    .replace('process=running', 'process=stopped');
  statusOutput = stoppedStatus;
  statusResponseQueue = [
    { success: true, content: STATUS, delay: 160 },
    { success: true, content: stoppedStatus, delay: 2 }
  ];
  const statusBeforeMutationRace = calls.filter((c) => / status$/.test(c.cmd)).length;
  const mutationTimerFired = fireLatestPoll();
  await sleep(10);
  const stopButton = btn(adminMenu, '停止');
  stopButton.click(); stopButton.click();
  await sleep(220);
  const statusDuringMutationRace = calls.filter((c) => / status$/.test(c.cmd)).length - statusBeforeMutationRace;
  check('测试确实让停止动作撞上动作前的在途状态请求', mutationTimerFired);
  check('停止动作等待旧请求后强制发起恰好一轮新状态请求',
    statusDuringMutationRace === 2 && maxStatusCalls === 1,
    `状态请求 ${statusDuringMutationRace} 次，最大并发 ${maxStatusCalls}`);
  check('动作前旧的运行中响应未覆盖动作后的停止状态',
    (doc.querySelector('#ufis_sync_verdict') || {}).textContent === '同步已停止',
    (doc.querySelector('#ufis_sync_verdict') || {}).textContent);
  statusResponseQueue = [];
  statusOutput = STATUS;
  refreshBtn.click();
  await sleep(400);

  console.log('\n状态真实性：互联网直连在线时不被中继状态误导');
  statusOutput = STATUS
    .replace('"error":null,"lanAddresses":["relay://203.0.113.1:22067"],"wanAddresses":["relay://203.0.113.1:22067"]',
      '"error":null,"lanAddresses":[],"wanAddresses":[]')
    .replace(`"${DEV_MAC}":{"connected":true,"type":"tcp-client"}`,
      `"${DEV_MAC}":{"connected":true,"type":"tcp-client","isLocal":true}`)
    .replace(`"${DEV_WIN}":{"connected":true,"type":"relay-client"}`,
      `"${DEV_WIN}":{"connected":true,"type":"tcp-client","isLocal":false}`)
    .replace('{"globalBytes":60618110,"localBytes":30309055,"needBytes":30309055',
      '{"globalBytes":60618110,"localBytes":60618110,"needBytes":0');
  refreshBtn.click();
  await sleep(400);
  check('中继状态单元仍如实显示连接中',
    /公网中继[\s\S]{0,30}连接中/.test((doc.querySelector('#ufis_grid') || {}).textContent || ''));
  check('已经互联网直连时不误报跨网络未就绪',
    !/跨网络同步尚未就绪/.test((doc.querySelector('#ufis_sync_verdict') || {}).textContent || ''));
  check('互联网直连且无待同步时不因中继连接中持续 5 秒轮询',
    panel.dataset.pollMs === '20000', panel.dataset.pollMs);

  statusOutput = STATUS.replace(
    `"${DEV_WIN}":{"connected":true,"type":"relay-client"}`,
    `"${DEV_WIN}":{"connected":false,"type":""}`);
  await sleep(800);
  const disconnectedPeers = (doc.querySelector('#ufis_peer_status') || {}).textContent || '';
  check('Windows 断联后无需手动刷新即显示未连接',
    /Windows[\s\S]*(未连接|已离线|离线)/.test(disconnectedPeers), disconnectedPeers);
  check('Windows 断联后不再显示已连接或直连',
    !/Windows[\s\S]{0,40}(已连接|直连)/.test(disconnectedPeers), disconnectedPeers);
  statusOutput = STATUS;
  if (refreshBtn) {
    refreshBtn.click();
    await sleep(1500);
  }

  console.log('\n首次配置与自适应轮询');
  statusOutput = STATUS.replace(CONFIG_LINES, '');
  refreshBtn.click();
  await sleep(500);
  check('空配置显示首次设置引导', doc.querySelector('#ufis_onboarding').style.display !== 'none');
  check('空配置自动打开笔记库与电脑配置', configMenu.open === true);
  check('配置完成前不显示误导性日常状态', doc.querySelector('#ufis_daily').style.display === 'none');

  installPolls = 0;
  const beforeEmptyInstall = calls.length;
  btn(panel, '一键安装').click();
  await sleep(400);
  const emptyInstallCalls = calls.slice(beforeEmptyInstall).map((c) => c.cmd);
  check('空配置可以先安装同步内核',
    emptyInstallCalls.some((c) => /ufisync\.sh install$/.test(c)));
  check('空配置安装后不误执行 init 或 start',
    !emptyInstallCalls.some((c) => /ufisync\.sh (init|start)$/.test(c)), emptyInstallCalls.join(' → '));
  check('空配置安装后引导继续设置',
    toasts.some((t) => /同步内核已安装[\s\S]*保存并应用/.test(t.msg)));

  statusOutput = STATUS.replace(
    '{"globalBytes":60618110,"localBytes":30309055,"needBytes":30309055',
    '{"globalBytes":60618110,"localBytes":60618110,"needBytes":0');
  doc.querySelector('#collapse_ufisync').setAttribute('data-name', 'open');
  refreshBtn.click();
  await sleep(500);
  check('健康空闲时降为 20 秒轮询', panel.dataset.pollMs === '20000', panel.dataset.pollMs);
  doc.querySelector('#collapse_ufisync').setAttribute('data-name', 'close');
  refreshBtn.click();
  await sleep(500);
  check('面板折叠时降为 60 秒轮询', panel.dataset.pollMs === '60000', panel.dataset.pollMs);
  statusOutput = STATUS;
  doc.querySelector('#collapse_ufisync').setAttribute('data-name', 'open');
  refreshBtn.click();
  await sleep(500);

  const stableStatusCell = doc.querySelector('#ufis_grid > div');
  const stableNodeCount = panel.querySelectorAll('*').length;
  for (let i = 0; i < 100; i++) {
    refreshBtn.click();
    await sleep(6);
  }
  check('100 次相同状态刷新保留原 DOM 节点',
    doc.querySelector('#ufis_grid > div') === stableStatusCell);
  check('100 次刷新后面板节点数不增长', panel.querySelectorAll('*').length === stableNodeCount,
    `${stableNodeCount} → ${panel.querySelectorAll('*').length}`);
  check('自适应轮询始终只保留一个活跃计时器', activePollTimers.size <= 1, activePollTimers.size);
  check('状态请求不并发', maxStatusCalls === 1, maxStatusCalls);

  console.log('\n立即同步');
  const syncBtn = btn(panel, '立即同步');
  check('立即同步按钮可见', !!syncBtn);
  if (syncBtn) {
    const beforeSync = calls.length;
    const beforeSyncToast = toasts.length;
    syncBtn.click();
    await sleep(1800);
    check('立即同步触发 scan 动作',
      calls.slice(beforeSync).some((c) => /ufisync\.sh scan$/.test(c.cmd)));
    check('立即同步给出已触发反馈',
      toasts.slice(beforeSyncToast).some((t) => /同步|扫描/.test(t.msg)));
  }

  console.log('\n配置：仓库与设备可自定义');
  check('渲染了仓库列表', doc.querySelector('#ufis_folders').children.length === 2,
    doc.querySelector('#ufis_folders').children.length);
  check('渲染了设备列表', doc.querySelector('#ufis_devices').children.length === 2);
  check('渲染了笔记本电脑', panel.textContent.includes(DEV_MAC));
  check('渲染了台式电脑', panel.textContent.includes(DEV_WIN));

  console.log('\n旧 Device ID 迁移：保存前规范化并验证');
  statusOutput = STATUS.replace(`D|${DEV_WIN}|Windows`, `D|${DEV_WIN_LEGACY}|Windows`);
  refreshBtn.click();
  await sleep(400);
  check('能读取现有配置中的 52 位旧 Device ID', panel.textContent.includes(DEV_WIN_LEGACY));
  check('旧 Device ID 无需先保存也能匹配规范连接状态',
    /Windows[\s\S]*已连接[\s\S]*公网中继/.test((doc.querySelector('#ufis_peer_status') || {}).textContent || ''),
    (doc.querySelector('#ufis_peer_status') || {}).textContent || '');
  const beforeLegacySave = calls.length;
  btn(panel, '保存并应用').click();
  await sleep(1500);
  const legacyConfigWrites = calls.slice(beforeLegacySave)
    .filter((c) => /sync\.conf\.b64/.test(c.cmd) && /^printf '%s' /.test(c.cmd));
  const legacyEncodedConfig = legacyConfigWrites
    .map((c) => (c.cmd.match(/^printf '%s' '([A-Za-z0-9+/=]*)'/) || [])[1] || '').join('');
  const legacySavedConfig = Buffer.from(legacyEncodedConfig, 'base64').toString('utf8');
  check('52 位旧 Device ID 保存为带校验位的 56 位标准 ID',
    legacySavedConfig.includes(`D|${DEV_WIN}|Windows`) && !legacySavedConfig.includes(DEV_WIN_LEGACY),
    legacySavedConfig);

  statusOutput = STATUS.replace(`D|${DEV_WIN}|Windows`, 'D|NOT-A-DEVICE-ID|Windows');
  refreshBtn.click();
  await sleep(400);
  const beforeInvalidExisting = calls.length;
  const beforeInvalidToast = toasts.length;
  btn(panel, '保存并应用').click();
  await sleep(500);
  const invalidExistingCalls = calls.slice(beforeInvalidExisting).map((c) => c.cmd);
  check('现有配置里的非法 Device ID 会在写入前被拒绝',
    !invalidExistingCalls.some((c) => /ufisync\.sh set-config$/.test(c)));
  check('非法旧 Device ID 给出可操作错误提示',
    toasts.slice(beforeInvalidToast).some((t) => /设备 ID|Device ID/.test(t.msg) && t.color === 'red'));
  statusOutput = STATUS;
  refreshBtn.click();
  await sleep(400);

  // 添加仓库
  doc.querySelector('#ufis_new_folder_id').value = 'work-notes';
  doc.querySelector('#ufis_new_folder_label').value = '工作笔记';
  btn(panel, '添加笔记库').click();
  await sleep(120);
  check('可以添加仓库', doc.querySelector('#ufis_folders').children.length === 3);
  check('中文名称被接受', panel.textContent.includes('工作笔记'));

  // 非法仓库 ID
  const t0 = toasts.length;
  doc.querySelector('#ufis_new_folder_id').value = 'bad id; rm -rf /';
  btn(panel, '添加笔记库').click();
  await sleep(120);
  check('拒绝含空格与分号的仓库 ID', doc.querySelector('#ufis_folders').children.length === 3);
  check('给出了仓库 ID 错误提示',
    toasts.slice(t0).some((t) => /仓库 ID/.test(t.msg) && t.color === 'red'));

  // “.” 与 “..” 虽然只包含允许字符，但作为目录语义会逃逸仓库根目录，必须精确拒绝。
  for (const reservedId of ['.', '..']) {
    const beforeReserved = doc.querySelector('#ufis_folders').children.length;
    const beforeReservedToast = toasts.length;
    doc.querySelector('#ufis_new_folder_id').value = reservedId;
    btn(panel, '添加笔记库').click();
    await sleep(120);
    check(`拒绝保留 Folder ID ${reservedId}`,
      doc.querySelector('#ufis_folders').children.length === beforeReserved &&
        toasts.slice(beforeReservedToast).some((t) => /不能是|仓库 ID/.test(t.msg) && t.color === 'red'));
  }

  // 设备 ID 规范化：不带连字符也应被接受
  const t1 = toasts.length;
  doc.querySelector('#ufis_new_device_id').value = DEV_MAC.replace(/-/g, '').toLowerCase();
  doc.querySelector('#ufis_new_device_label').value = '笔记本';
  btn(panel, '添加电脑').click();
  await sleep(120);
  check('识别出重复设备（说明去连字符/大小写已规范化）',
    toasts.slice(t1).some((t) => /已在列表中/.test(t.msg)));

  const t2 = toasts.length;
  doc.querySelector('#ufis_new_device_id').value = 'NOT-A-VALID-DEVICE-ID';
  btn(panel, '添加电脑').click();
  await sleep(120);
  check('拒绝格式错误的设备 ID',
    toasts.slice(t2).some((t) => /设备 ID 格式不对/.test(t.msg)));

  const tChecksum = toasts.length;
  doc.querySelector('#ufis_new_device_id').value = DEV_WIN.slice(0, -1) + 'A';
  btn(panel, '添加电脑').click();
  await sleep(120);
  check('拒绝校验位错误的伪设备 ID',
    toasts.slice(tChecksum).some((t) => /设备 ID 格式不对/.test(t.msg)));

  // 产品不得假定只有 Mac/Windows：任意第三台 Syncthing 主机也能添加。
  doc.querySelector('#ufis_new_device_id').value = 'c'.repeat(52); // Syncthing 兼容的旧式无校验位 ID
  doc.querySelector('#ufis_new_device_label').value = 'Linux & "服务器"';
  btn(panel, '添加电脑').click();
  await sleep(120);
  check('可以添加任意第三台主机', doc.querySelector('#ufis_devices').children.length === 3);
  check('第三台主机的名称与标准化 ID 正确',
    panel.textContent.includes('Linux & "服务器"') && panel.textContent.includes(DEV_LINUX));

  // 保存配置
  const beforeSave = calls.length;
  btn(panel, '保存并应用').click();
  await sleep(1500);
  const saveCalls = calls.slice(beforeSave).map((c) => c.cmd);
  const setConfigAt = saveCalls.findIndex((c) => /ufisync\.sh set-config$/.test(c));
  const applyConfigAt = saveCalls.findIndex((c) => /ufisync\.sh apply-config$/.test(c));
  check('保存并应用先调用 set-config', setConfigAt >= 0);
  check('保存后自动应用并启动', applyConfigAt > setConfigAt, saveCalls.join(' → '));
  const cfgWrites = calls.slice(beforeSave).filter((c) => /sync\.conf\.b64/.test(c.cmd));
  check('配置以 base64 分段写入', cfgWrites.length > 0);
  check('写入的都是 base64，不含原始文本',
    cfgWrites.filter((c) => /printf/.test(c.cmd))
      .every((c) => /printf '%s' '[A-Za-z0-9+/=]*'/.test(c.cmd)),
    cfgWrites.find((c) => /printf/.test(c.cmd) && !/printf '%s' '[A-Za-z0-9+/=]*'/.test(c.cmd))?.cmd);
  const encodedConfig = cfgWrites.map((c) => (c.cmd.match(/^printf '%s' '([A-Za-z0-9+/=]*)'/) || [])[1] || '').join('');
  const decodedConfig = Buffer.from(encodedConfig, 'base64').toString('utf8');
  check('保存内容包含第三台主机且保留名称标点',
    decodedConfig.includes(`D|${DEV_LINUX}|Linux & "服务器"`));
  check('应用成功后直接给出完成反馈',
    toasts.some((t) => /已应用|开始同步/.test(t.msg) && t.color === 'green'));

  applyResult = { success: false, content: 'FATAL: 同步内核未安装，请先执行安装' };
  doc.querySelector('#ufis_new_folder_id').value = 'setup-before-install';
  btn(panel, '添加笔记库').click();
  await sleep(120);
  const beforeMissingKernel = toasts.length;
  btn(panel, '保存并应用').click();
  await sleep(1400);
  check('先配置后安装时自动展开下一步', adminMenu.open === true);
  check('内核未安装被解释为下一步而非配置失败',
    toasts.slice(beforeMissingKernel).some((t) => /已保存[\s\S]*一键安装/.test(t.msg) && t.color === 'blue'));
  applyResult = { success: true, content: '配置已应用并启动' };

  console.log('\n启动自恢复：旧安装已留下内核但尚未初始化');
  statusOutput = STATUS
    .replace('initialized=yes', 'initialized=no')
    .replace('pid=4711', 'pid=')
    .replace('process=running', 'process=stopped');
  refreshBtn.click();
  await sleep(400);
  const recoveryAction = doc.querySelector('#ufis_start_recovery');
  const recoveryButton = recoveryAction && btn(recoveryAction, '启动同步');
  check('已安装但停止时，首屏显示启动同步主操作',
    recoveryAction && recoveryAction.style.display !== 'none' && !!recoveryButton);
  const beforeRecovery = calls.length;
  if (recoveryButton) recoveryButton.click();
  else btn(adminMenu, '启动').click();
  await sleep(1500);
  const recoveryCalls = calls.slice(beforeRecovery).map((c) => c.cmd);
  const initAt = recoveryCalls.findIndex((c) => /ufisync\.sh init$/.test(c));
  const startAt = recoveryCalls.findIndex((c) => /ufisync\.sh start$/.test(c));
  check('启动前会部署当前控制脚本',
    recoveryCalls.some((c) => /ufisync\.sh\.deploy-[^ ]+\.b64/.test(c)));
  check('未初始化时会自动初始化', initAt >= 0);
  check('初始化成功后才启动', initAt >= 0 && startAt > initAt, recoveryCalls.join(' → '));
  statusOutput = STATUS;

  console.log('\nroot_shell 调用约束');
  const overLimit = calls.filter((c) => c.timeout > 60000);
  check('没有任何调用的 timeout 超过 60 秒', overLimit.length === 0,
    overLimit[0] && `${overLimit[0].cmd} → ${overLimit[0].timeout}`);
  const statusTimeouts = calls.filter((c) => /ufisync\.sh status$/.test(c.cmd)).map((c) => c.timeout);
  check('状态调用为最大 20 库的有界串行 REST 预留 60 秒',
    statusTimeouts.length > 0 && statusTimeouts.every((t) => t === 60000), statusTimeouts.join(','));
  check('没有超长命令（分段 ≤800 字符）',
    calls.every((c) => c.cmd.length <= 1200),
    calls.find((c) => c.cmd.length > 1200)?.cmd.length);

  console.log('\n安装：后台任务 + 轮询进度');
  const t3 = toasts.length;
  btn(panel, '一键安装').click();
  await sleep(500);
  check('调用了后台安装', calls.some((c) => /ufisync\.sh install$/.test(c.cmd)));
  check('轮询了安装进度', installPolls >= 3, installPolls);
  check('安装完成后执行了 init', calls.some((c) => /ufisync\.sh init$/.test(c.cmd)));
  check('安装完成后执行了 start', calls.some((c) => /ufisync\.sh start$/.test(c.cmd)));
  const during = toasts.length - t3;
  check('安装全程 toast 不刷屏（≤6 条）', during <= 6, during + ' 条');
  check('所有 toast 都有有限显示时长',
    toasts.every((t) => typeof t.ms === 'number' && t.ms > 0 && t.ms <= 15000));
  check('进度区在结束后隐藏', doc.querySelector('#ufis_prog').style.display === 'none');

  console.log('\nSyncthing 2.x 的 glibc 陷阱');
  check('维护区不暴露可能超出 Root Shell 时限的同步升级按钮',
    !btn(panel, '升级同步内核') && !doc.querySelector('#ufis_ver'));
  check('维护区解释当前固定内核版本与升级边界',
    /1\.30\.0[\s\S]*(暂不提供|不提供)[\s\S]*在线升级/.test((doc.querySelector('#ufis_admin_menu') || {}).textContent || ''));

  const t5 = toasts.length;
  btn(panel, '诊断').click();
  await sleep(400);
  check('诊断识别出 glibc 动态链接',
    toasts.slice(t5).some((t) => /glibc/.test(t.msg) && t.color === 'red'));

  console.log('\n安全约束');
  const shellCalls = calls.filter((c) => c.cmd !== 'whoami').map((c) => c.cmd);
  const bad = shellCalls.filter((c) =>
    !/^sh \/data\/data\/com\.minikano\.f50_sms\/files\/ufisync\/ufisync\.sh /.test(c) &&
    !/^mkdir -p |^printf '%s' |^base64 -d |^test -s |^sh -n |^sh \/data\/data\/com\.minikano\.f50_sms\/files\/ufisync\/ufisync\.sh\.deploy-|^chmod 700 |^rm -f /.test(c));
  check('所有调用都走固定控制脚本或分段写入', bad.length === 0, bad[0]);
  check('面板里没有 textarea', !panel.querySelector('textarea'));
  const ids = [...panel.querySelectorAll('input')].map((i) => i.id).sort();
  check('输入框只有受校验的字段',
    JSON.stringify(ids) === JSON.stringify(['ufis_new_device_id', 'ufis_new_device_label',
      'ufis_new_folder_id', 'ufis_new_folder_label']), ids.join(','));
  check('页面上不出现 apikey 字样', !/apikey/i.test(panel.textContent));
  check('面板从未调用同步升级动作', !calls.some((c) => /ufisync\.sh upgrade(?: |$)/.test(c.cmd)));

  console.log('\n危险动作失败响应：不把未知或 FATAL 当成成功');
  uninstallResult = { success: false, content: 'permission denied' };
  const beforeFailedUninstall = toasts.length;
  const uninstallBtn = btn(panel, '卸载（保留副本）');
  uninstallBtn.click(); uninstallBtn.click();
  await sleep(450);
  const failedUninstallFeedback = toasts.slice(beforeFailedUninstall);
  check('卸载 success=false 会明确报错',
    failedUninstallFeedback.some((t) => t.color === 'red' && /卸载[\s\S]*失败/.test(t.msg)),
    failedUninstallFeedback.map((t) => t.msg).join(' → '));
  check('卸载失败不提示已移除',
    !failedUninstallFeedback.some((t) => /已移除|卸载完成/.test(t.msg)),
    failedUninstallFeedback.map((t) => t.msg).join(' → '));
  uninstallResult = { success: true, content: '卸载完成' };

  purgeResult = { success: true, content: 'FATAL: 无法停止同步内核' };
  const beforeFatalPurge = toasts.length;
  const purgeBtn = btn(panel, '删除本机副本');
  purgeBtn.click(); purgeBtn.click();
  await sleep(450);
  const fatalPurgeFeedback = toasts.slice(beforeFatalPurge);
  check('删除响应含 FATAL 会明确报错',
    fatalPurgeFeedback.some((t) => t.color === 'red' && /删除[\s\S]*失败/.test(t.msg)),
    fatalPurgeFeedback.map((t) => t.msg).join(' → '));
  check('删除失败不提示已删除',
    !fatalPurgeFeedback.some((t) => /已删除|删除完成/.test(t.msg)),
    fatalPurgeFeedback.map((t) => t.msg).join(' → '));
  purgeResult = { success: true, content: '删除完成' };

  stopResult = { success: true, content: 'FATAL: 无法停止受管进程' };
  const beforeFatalStop = toasts.length;
  const failedStopButton = btn(adminMenu, '停止');
  failedStopButton.click(); failedStopButton.click();
  await sleep(450);
  const fatalStopFeedback = toasts.slice(beforeFatalStop);
  check('普通维护动作的 FATAL 也会明确报错',
    fatalStopFeedback.some((t) => t.color === 'red' && /无法停止|FATAL/.test(t.msg)),
    fatalStopFeedback.map((t) => t.msg).join(' → '));
  stopResult = { success: true, content: '已停止' };

  console.log('\n危险操作确认');
  const before = calls.filter((c) => /purge-data/.test(c.cmd)).length;
  purgeBtn.click();
  await sleep(120);
  check('单次点击不执行删除',
    calls.filter((c) => /purge-data/.test(c.cmd)).length === before);
  purgeBtn.click();
  await sleep(400);
  check('二次点击才执行，且带确认串',
    calls.some((c) => /purge-data CONFIRM-DELETE-VAULT-COPIES$/.test(c.cmd)));

  console.log('\n' + (failures === 0 ? '全部通过 ✅' : failures + ' 项失败 ❌'));
  process.exit(failures === 0 ? 0 : 1);
}, 800);
