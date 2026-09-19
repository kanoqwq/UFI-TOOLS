#!/system/bin/sh
# ttyd login script
# Example: ttyd -W -a -p 5500 /system/bin/sh /data/local/tmp/login.sh

trap '' INT TSTP
umask 077

MAX_RETRIES=3
retry_count=0

PASS_FILE="/data/data/com.minikano.f50_sms/shared_prefs/kano_ZTE_store.xml"
SHA256_BIN="/data/data/com.minikano.f50_sms/files/sha256"

# Extract login_token from XML
get_login_pass() {
    if [ -r "$PASS_FILE" ]; then
        grep '<string name="login_token">' "$PASS_FILE" \
            | sed -n 's/.*<string name="login_token">\([^<]*\)<\/string>.*/\1/p' \
            | head -n 1
    else
        echo ""
    fi
}

# Safe password input
read_password() {
    prompt="$1"
    printf "%s" "$prompt" 1>&2
    if command -v stty >/dev/null 2>&1; then
        stty -echo 2>/dev/null
        IFS= read -r pw
        stty echo 2>/dev/null
        printf "\n" 1>&2
    else
        IFS= read -r pw
        printf "\n" 1>&2
    fi
    printf "%s" "$pw"
}

while true; do
    hashed_pass="$(get_login_pass)"

    if [ -n "$hashed_pass" ]; then
        PASS="$hashed_pass"
    else
        # 以前这里会退回到一个写死的备用口令。那个常量在公开仓库里，
        # 等于给任何人留了一把 root shell 的钥匙。现在直接拒绝登录：
        # 读不到口令就不该放行。
        echo "Error: login token unavailable. Open UFI-TOOLS and set a password first." 1>&2
        exit 1
    fi

    input_raw_pass="$(read_password "Password: ")"
    input_pass="$("$SHA256_BIN" "$input_raw_pass")"

    if [ "$input_pass" = "$PASS" ]; then
        echo "Login successful!"
        exec /system/bin/sh
    else
        retry_count=$((retry_count + 1))
        echo "Incorrect password! Attempt ${retry_count}/${MAX_RETRIES}"

        if [ "$retry_count" -ge "$MAX_RETRIES" ]; then
            echo "Too many failed attempts, exiting..."
            exit 1
        else
            sleep 1
        fi
    fi
done
