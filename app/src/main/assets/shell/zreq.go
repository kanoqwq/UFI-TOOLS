package main

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"net/http"
	"net/url"
	"os"
	"strings"
	"time"
)

var (
	ip     = flag.String("ip", "192.168.0.1", "设备 IP 地址（可选），示例：192.168.0.1")
	pwd    = flag.String("pwd", "Wa@9w+YWRtaW4=", "登录密码（可选）")
	method = flag.String("method", "GET", "请求方法：GET 或 POST（默认 GET）")
	params = flag.String("params", "", "GET 请求参数，格式：cmd=LD&multi_data=1")
	body   = flag.String("body", "", "POST 请求体，格式：goformId=LOGIN&isTest=false")
	asJSON = flag.Bool("json", false, "是否以 JSON 格式输出响应")
)

func mustFlag(val string, name string) {
	if val == "" {
		fmt.Printf("参数 --%s 不能为空\n", name)
		flag.Usage()
		os.Exit(1)
	}
}

func sha256Hex(input string) string {
	h := sha256.Sum256([]byte(input))
	return strings.ToUpper(hex.EncodeToString(h[:]))
}

func getLD(baseURL string, headers map[string]string) (string, error) {
	resp, err := httpGet(baseURL+"/goform/goform_get_cmd_process?isTest=false&cmd=LD&_="+now(), headers)
	if err != nil {
		return "", err
	}
	return resp["LD"].(string), nil
}

func getRD(baseURL, cookie string, headers map[string]string) (string, error) {
	headers["Cookie"] = cookie
	resp, err := httpGet(baseURL+"/goform/goform_get_cmd_process?isTest=false&cmd=RD&_="+now(), headers)
	if err != nil {
		return "", err
	}
	return resp["RD"].(string), nil
}

func getUFIInfo(baseURL string, headers map[string]string) (string, string, error) {
	resp, err := httpGet(baseURL+"/goform/goform_get_cmd_process?isTest=false&cmd=Language,cr_version,wa_inner_version&multi_data=1&_="+now(), headers)
	if err != nil {
		return "", "", err
	}
	return resp["wa_inner_version"].(string), resp["cr_version"].(string), nil
}

func login(baseURL string, pwd string, headers map[string]string) (string, error) {
	LD, err := getLD(baseURL, headers)
	if err != nil {
		return "", err
	}
	hashed := sha256Hex(sha256Hex(pwd) + LD)
	data := url.Values{}
	data.Set("goformId", "LOGIN")
	data.Set("isTest", "false")
	data.Set("password", hashed)

	req, _ := http.NewRequest("POST", baseURL+"/goform/goform_set_cmd_process", strings.NewReader(data.Encode()))
	for k, v := range headers {
		req.Header.Set(k, v)
	}
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")

	client := &http.Client{}
	res, err := client.Do(req)
	if err != nil {
		return "", err
	}
	defer res.Body.Close()
	for _, c := range res.Header["Set-Cookie"] {
		parts := strings.Split(c, ";")
		if len(parts) > 0 {
			return parts[0], nil
		}
	}
	return "", errors.New("无法获取 Cookie")
}

func processAD(baseURL, cookie string, headers map[string]string) (string, error) {
	wa, cr, err := getUFIInfo(baseURL, headers)
	if err != nil {
		return "", err
	}
	parsed := sha256Hex(wa + cr)
	RD, err := getRD(baseURL, cookie, headers)
	if err != nil {
		return "", err
	}
	return sha256Hex(parsed + RD), nil
}

func httpGet(url string, headers map[string]string) (map[string]interface{}, error) {
	req, _ := http.NewRequest("GET", url, nil)
	for k, v := range headers {
		req.Header.Set(k, v)
	}
	client := &http.Client{}
	res, err := client.Do(req)
	if err != nil {
		return nil, err
	}
	defer res.Body.Close()
	var m map[string]interface{}
	err = json.NewDecoder(res.Body).Decode(&m)
	return m, err
}

func httpPost(url string, headers map[string]string, data url.Values) (map[string]interface{}, error) {
	req, _ := http.NewRequest("POST", url, strings.NewReader(data.Encode()))
	for k, v := range headers {
		req.Header.Set(k, v)
	}
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded; charset=UTF-8")
	client := &http.Client{}
	res, err := client.Do(req)
	if err != nil {
		return nil, err
	}
	defer res.Body.Close()
	var m map[string]interface{}
	err = json.NewDecoder(res.Body).Decode(&m)
	return m, err
}

func now() string {
	return fmt.Sprintf("%d", time.Now().UnixMilli())
}

func main() {
	flag.Parse()
	mustFlag(*ip, "ip")
	mustFlag(*pwd, "pwd")

	baseURL := "http://" + *ip + ":8080"
	headers := map[string]string{
		"referer":    baseURL + "/index.html",
		"host":       *ip,
		"user-agent": "Mozilla/5.0",
	}

	cookie, err := login(baseURL, *pwd, headers)
	if err != nil {
		fmt.Println("登录失败:", err)
		os.Exit(1)
	}

	if *method == "GET" {
		qs := *params
		if qs != "" && !strings.HasPrefix(qs, "&") {
			qs = "&" + qs
		}
		url := baseURL + "/goform/goform_get_cmd_process?isTest=false" + qs + "&_=" + now()
		res, err := httpGet(url, headers)
		if err != nil {
			fmt.Println("请求失败:", err)
			os.Exit(1)
		}
		printOutput(res)
	} else if *method == "POST" {
		AD, err := processAD(baseURL, cookie, headers)
		if err != nil {
			fmt.Println("AD 生成失败:", err)
			os.Exit(1)
		}
		headers["Cookie"] = cookie
		data, _ := url.ParseQuery(*body)
		data.Set("isTest", "false")
		data.Set("AD", AD)
		res, err := httpPost(baseURL+"/goform/goform_set_cmd_process", headers, data)
		if err != nil {
			fmt.Println("请求失败:", err)
			os.Exit(1)
		}
		printOutput(res)
	} else {
		fmt.Println("不支持的 method，仅支持 GET 或 POST")
		os.Exit(1)
	}
}

func printOutput(m map[string]interface{}) {
	if *asJSON {
		bytes, _ := json.MarshalIndent(m, "", "  ")
		fmt.Println(string(bytes))
	} else {
		for k, v := range m {
			fmt.Printf("%s: %v\n", k, v)
		}
	}
}
