package main

import (
	"bytes"
	"crypto/hmac"
	"crypto/md5"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"encoding/xml"
	"flag"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"strings"
	"time"
)

const secretKey = "minikano_kOyXz0Ciz4V7wR0IeKmJFYFQ20jd"

func sha256Hex(data []byte) string {
	sum := sha256.Sum256(data)
	return hex.EncodeToString(sum[:]) // 默认就是小写
}

func hmacMD5(data []byte, key []byte) []byte {
	h := hmac.New(md5.New, key)
	h.Write(data)
	return h.Sum(nil) // 16 bytes
}

// 生成 kano-sign
func makeKanoSign(methodUpper, urlPath string, tsMillis string) string {
	rawData := "minikano" + methodUpper + urlPath + tsMillis

	// HMAC-MD5 -> 16 bytes
	h := hmacMD5([]byte(rawData), []byte(secretKey))

	mid := len(h) / 2 // 8
	part1 := h[:mid]
	part2 := h[mid:]

	// SHA256(part1/part2) -> 32 bytes each (NOT hex string)
	sha1 := sha256Bytes(part1)
	sha2 := sha256Bytes(part2)

	// concat 64 bytes then SHA256
	combined := append(sha1, sha2...)
	final := sha256.Sum256(combined)

	return hex.EncodeToString(final[:]) // 小写hex
}

func normalizeMethod(m string) string {
	m = strings.TrimSpace(m)
	if m == "" {
		return "GET"
	}
	return strings.ToUpper(m)
}

// endpoint 可以是：
// - "/api/user?id=1"
// - "http://192.168.1.1/api/user?id=1"
// host 如 "192.168.1.1" 或 "192.168.1.1:8080"
func buildURL(host, endpoint string) (*url.URL, error) {
	endpoint = strings.TrimSpace(endpoint)
	if endpoint == "" {
		return nil, fmt.Errorf("endpoint 不能为空")
	}

	// 如果 endpoint 已经是完整 URL
	if strings.HasPrefix(endpoint, "http://") || strings.HasPrefix(endpoint, "https://") {
		return url.Parse(endpoint)
	}

	// 否则拼接成 http://host + endpoint
	if !strings.HasPrefix(endpoint, "/") {
		endpoint = "/" + endpoint
	}
	full := "http://" + host + endpoint
	return url.Parse(full)
}

func sha256Bytes(data []byte) []byte {
	sum := sha256.Sum256(data)
	return sum[:]
}

func printJSONError(msg string, err error) {
	_ = json.NewEncoder(os.Stdout).Encode(map[string]string{
		"error": fmt.Sprintf("%s: %v", msg, err),
	})
}

type SharedPrefs struct {
	XMLName xml.Name `xml:"map"`
	Items   []Item   `xml:"string"`
}

type Item struct {
	Name  string `xml:"name,attr"`
	Value string `xml:",chardata"`
}

func GetLoginTokenSHA256() (string, error) {
	path := "/data/data/com.minikano.f50_sms/shared_prefs/kano_ZTE_store.xml"

	data, err := os.ReadFile(path)
	if err != nil {
		return "", err
	}

	var prefs SharedPrefs

	err = xml.Unmarshal(data, &prefs)
	if err != nil {
		return "", err
	}

	for _, item := range prefs.Items {
		if item.Name == "login_token" {
			return item.Value, nil
		}
	}

	return "", nil
}

func main() {
	var (
		host     string
		password string
		method   string
		endpoint string
		data     string
		timeout  int
	)

	//获取本机sha256密码
	tokenSHA256, _ := GetLoginTokenSHA256()

	flag.StringVar(&host, "host", "192.168.0.1:2333", `目标地址，比如 "192.168.0.1" 或 "192.168.0.1:2333" (选填)`)
	flag.StringVar(&password, "pass", "", "密码明文，用于生成 Authorization=sha256(password) (可以不填，不填自动获取本机的密码)")
	flag.StringVar(&method, "X", "GET", "HTTP 方法：GET/POST/PUT/DELETE...")
	flag.StringVar(&endpoint, "e", "", `请求路径或完整URL，如 "/api/xxx" (必填)`)
	flag.StringVar(&data, "d", "", `请求体(JSON字符串)。GET 一般不需要。例：'{"command":"ls"}'`)
	flag.IntVar(&timeout, "t", 10, "超时秒数 (默认 15)")

	flag.Usage = func() {
		fmt.Fprintf(os.Stderr, `ufi_req - MiniKano签名请求工具

用法：
  ufi_req -host 192.168.1.1 -pass 123456 -X POST -e /api/xxx -d '{"command":"ls"}'
  ufi_req -host 192.168.1.1 -pass 123456 -X GET  -e "/api/AT?command=AT&slot=0"

参数：
`)
		flag.PrintDefaults()
	}
	flag.Parse()

	if host == "" || (password == "" && tokenSHA256 == "") || endpoint == "" {
		flag.Usage()
		os.Exit(2)
	}

	u, err := buildURL(host, endpoint)
	if err != nil {
		printJSONError("URL 解析失败", err)
		os.Exit(1)
	}

	m := normalizeMethod(method)

	// 签名只用 path，不包含 query
	urlPath := u.Path
	if urlPath == "" {
		urlPath = "/"
	}

	auth := ""
	if password != "" {
		auth = sha256Hex([]byte(password))
	} else {
		auth = tokenSHA256
	}

	ts := fmt.Sprintf("%d", time.Now().UnixMilli())
	sign := makeKanoSign(m, urlPath, ts)

	var body io.Reader
	if data != "" {
		body = bytes.NewBufferString(data)
	}

	req, err := http.NewRequest(m, u.String(), body)
	if err != nil {
		printJSONError("创建请求失败", err)
		os.Exit(1)
	}

	// 必要请求头
	req.Header.Set("kano-t", ts)
	req.Header.Set("kano-sign", sign)
	req.Header.Set("Authorization", auth)

	// JSON 约定：只要有 body 就默认 JSON（你也可以改成只对 POST）
	if data != "" {
		req.Header.Set("Content-Type", "application/json")
	}

	client := &http.Client{
		Timeout: time.Duration(timeout) * time.Second,
	}

	resp, err := client.Do(req)
	if err != nil {
		printJSONError("响应失败", err)
		os.Exit(1)
	}
	defer resp.Body.Close()

	respBody, _ := io.ReadAll(resp.Body)

	// 输出：状态码 + body
	if resp.StatusCode != 200 {
		fmt.Printf("{\"error\":\"HTTP %d %s\"}", resp.StatusCode, http.StatusText(resp.StatusCode))
	} else {
		fmt.Print(string(respBody))
	}
}
