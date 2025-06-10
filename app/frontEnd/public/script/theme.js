//色相
let currentHue = 0;
//透明度
let currentOpacity = 1;
// 亮度
let currentValue = 1;
//饱和度
let currentSaturation = 1;
//字体颜色
let currentTextColor = 0;
//字体颜色百分比
let currentTextColorPer = 100;

//主页模糊开关
let homeBlurSwitch = true

// 调色盘
function getColorByPercent(e) {
    const value = e.target.value; // 0 ~ 100
    const h = (value / 100) * 300;
    currentHue = h;
    updateColor();

    saveThemeConfig();
}

//亮度
function getValueByPercent(e) {
    const value = e.target.value;
    currentValue = value / 100;
    updateColor();

    saveThemeConfig();
}

// 透明度
function getOpacityByPercent(e) {
    const value = e.target.value; // 0 ~ 100
    currentOpacity = value / 100;
    updateColor();

    saveThemeConfig();
}

//饱和度
function getSaturationByPercent(e) {
    const value = e.target.value; // 0 ~ 100
    currentSaturation = value / 100;
    updateColor();

    saveThemeConfig();
}

//字体颜色
function updateTextColor(e) {
    const value = e.target.value; // 0 ~ 100
    const gray = Math.round((value / 100) * 255);
    const color = `rgb(${gray}, ${gray}, ${gray})`;
    currentTextColor = color;
    currentTextColorPer = value;
    updateColor();

    saveThemeConfig();
}

//主页毛玻璃
function updateBlurSwitch(e) {
    const value = e.target.checked; // 0 ~ 100
    homeBlurSwitch = value
    updateColor()

    saveThemeConfig();
}

// 更新颜色 + 透明度
function updateColor() {
    const { r, g, b } = hsvToRgb(currentHue, currentSaturation, currentValue);
    const color = `rgba(${r}, ${g}, ${b}, ${currentOpacity})`;
    // 修改 :root 中的 CSS 变量
    document.documentElement.style.setProperty('--dark-bgi-color', color);
    document.documentElement.style.setProperty('--dark-tag-color', color);
    document.documentElement.style.setProperty('--dark-text-color', currentTextColor);
    document.documentElement.style.setProperty('--dark-text-color', currentTextColor);
    document.documentElement.style.setProperty('--blur-rate', homeBlurSwitch ? "4px" : "0");
}

// 保存主题配置到文件
async function saveThemeConfig() {
    try {
        const config = {
            backgroundEnabled: document.querySelector('#isCheckedBG')?.checked || false,
            backgroundUrl: document.querySelector('#BG_INPUT')?.value || '',
            textColor: typeof currentTextColor === 'string' ? currentTextColor : `rgb(${currentTextColor}, ${currentTextColor}, ${currentTextColor})`,
            textColorPer: currentTextColorPer,
            themeColor: currentHue.toString(),
            colorPer: document.querySelector('#colorEl')?.value || '61',
            saturationPer: document.querySelector('#saturationEl')?.value || '16',
            brightPer: document.querySelector('#brightEl')?.value || '16',
            opacityPer: document.querySelector('#opacityEl')?.value || '37',
            blurSwitch: homeBlurSwitch.toString()
        }

        const response = await fetch(`${KANO_baseURL}/set_theme`, {
            method: 'POST',
            headers: common_headers,
            body: JSON.stringify(config)
        });

        const result = await response.json();
        if (result.result !== "success") {
            console.error('保存主题配置失败:', result.error);
        }
    } catch (e) {
        console.error('保存主题配置出错:', e);
    }
}

//读取颜色数据
const initTheme = async () => {
    // 从配置文件读取主题数据
    let result = null
    try {
        result = await (await fetchWithTimeout(KANO_baseURL + "/get_theme", {
            method: 'get'
        })).json()
    } catch (e) {
        result = null
        console.error('读取主题配置失败：', e)
    }

    if (result) {
        // 设置默认值
        const defaultTheme = {
            backgroundEnabled: "false",
            backgroundUrl: "",
            textColor: "rgba(255, 255, 255, 1)",
            textColorPer: "100",
            themeColor: "183",
            colorPer: "61",
            saturationPer: "16",
            brightPer: "16",
            opacityPer: "37",
            blurSwitch: "true"
        }

        // 合并配置
        const config = { ...defaultTheme, ...result }

        // 设置UI元素的值
        document.querySelector('#textColorEl').value = config.textColorPer
        document.querySelector('#colorEl').value = config.colorPer
        document.querySelector('#saturationEl').value = config.saturationPer
        document.querySelector('#brightEl').value = config.brightPer
        document.querySelector('#opacityEl').value = config.opacityPer
        document.querySelector('#blurSwitch').checked = config.blurSwitch === "true"
        document.querySelector('#isCheckedBG').checked = config.backgroundEnabled === "true"
        document.querySelector('#BG_INPUT').value = config.backgroundUrl

        // 更新颜色
        currentHue = parseInt(config.themeColor)
        currentSaturation = parseInt(config.saturationPer) / 100
        currentValue = parseInt(config.brightPer) / 100
        currentOpacity = parseInt(config.opacityPer) / 100
        currentTextColor = config.textColor
        currentTextColorPer = parseInt(config.textColorPer)
        homeBlurSwitch = config.blurSwitch === "true"

        // 应用颜色
        updateColor()

        // 设置背景图片
        if (config.backgroundEnabled === "true" && config.backgroundUrl) {
            document.querySelector('#BG').style.backgroundImage = `url(${config.backgroundUrl})`
        }
    }
}
initTheme();
