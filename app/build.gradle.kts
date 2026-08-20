import com.android.build.gradle.internal.api.BaseVariantOutputImpl
import java.text.SimpleDateFormat
import java.util.Date

plugins {
    alias(libs.plugins.android.application)
    alias(libs.plugins.kotlin.android)
    alias(libs.plugins.kotlin.compose)
    kotlin("plugin.serialization")
}

// 注册执行 npm 命令的任务
val npmBuild by tasks.registering(Exec::class) {
    workingDir = file("frontEnd")
    doFirst {
        println("✅ 当前 workingDir: $workingDir")
        println("✅ 系统平台: ${System.getProperty("os.name")}")
        println("✅ 环境变量 PATH:")
        println(System.getenv("PATH"))
    }
    commandLine = if (System.getProperty("os.name").startsWith("Windows")) {
        listOf("cmd", "/c", "npm", "run", "build")
    } else {
        listOf("sh", "-c", "npm run build")
    }
    group = "build"
    description = "Build frontend assets using npm"

    doFirst {
        println("[Gradle] 开始执行 npm run build")
    }
    doLast {
        println("[Gradle] npm run build 完成")
    }
}

// 让打包任务依赖这个 npm 构建
tasks.configureEach {
    if (name.startsWith("assemble") || name.startsWith("install") || name == "build") {
        dependsOn(npmBuild)
    }
}

tasks.register<Delete>("deleteDumpSymsFromApk") {
    delete(file("${layout.buildDirectory}/intermediates/merged_assets/release/out/dump_syms"))
    delete(file("${layout.buildDirectory}/intermediates/merged_assets/debug/out/dump_syms"))
    delete(file("${layout.buildDirectory}/dump_syms"))
}

android {
    namespace = "com.minikano.f50_sms"
    compileSdk = 35

    defaultConfig {
        applicationId = "com.minikano.f50_sms"
        minSdk = 26
        targetSdk = 33
        // 动态生成 versionCode 为 yyyyMMdd 格式
        versionCode = SimpleDateFormat("yyyyMMdd").format(Date()).toInt()
        versionName = "4.1.3"
        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro"
            )
        }
    }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_11
        targetCompatibility = JavaVersion.VERSION_11
    }
    kotlinOptions {
        jvmTarget = "11"
    }
    buildFeatures {
        compose = true
    }
    packaging {
        resources {
            excludes += listOf(
                "META-INF/LICENSE.md",
                "META-INF/LICENSE",
                "META-INF/NOTICE.md",
                "META-INF/NOTICE",
                "META-INF/INDEX.LIST",
                "dump_syms/**",
                "assets/script_orignal/**",
                "assets/dictionary.json",
                "assets/node_modules/**",
                "assets/dev-server.js",
                "assets/package-lock.json",
                "assets/package.json"
            )
        }
    }

    android.applicationVariants.all {
        val variant = this
        if (variant.buildType.name == "release") {
            variant.outputs.all {
                val output = this as BaseVariantOutputImpl

                val appName = "UFI-TOOLS_WEB"
                val versionName = variant.versionName ?: variant.versionCode
                val versionCode = variant.versionCode
                val date = SimpleDateFormat("HHmm").format(Date())

                val newName = "${appName}_V${versionName}_${versionCode}_${date}.apk"

                output.outputFileName = newName
            }
        }
    }
}

dependencies {

    // Ktor 核心与 CIO 引擎
    implementation(libs.ktor.server.core)
    implementation(libs.ktor.server.cio)

    // 常用功能插件
    implementation(libs.ktor.server.default.headers)
    implementation(libs.kotlinx.serialization.json)

    implementation(libs.android.mail)
    implementation(libs.android.activation)
    implementation(libs.jcifs.ng) {
        exclude(group = "org.slf4j")
    }
    implementation(libs.okhttp)
    implementation(libs.androidx.core.ktx)
    implementation(libs.androidx.lifecycle.runtime.ktx)
    implementation(libs.androidx.activity.compose)
    implementation(platform(libs.androidx.compose.bom))
    implementation(libs.androidx.ui)
    implementation(libs.androidx.ui.graphics)
    implementation(libs.androidx.ui.tooling.preview)
    implementation(libs.androidx.material3)
    implementation(libs.androidx.appcompat)
    implementation(libs.androidx.lifecycle.runtime.ktx.v262)
    implementation(libs.androidx.runtime.livedata)
    testImplementation(libs.junit)
    androidTestImplementation(libs.androidx.junit)
    androidTestImplementation(libs.androidx.espresso.core)
    androidTestImplementation(platform(libs.androidx.compose.bom))
    androidTestImplementation(libs.androidx.ui.test.junit4)
    debugImplementation(libs.androidx.ui.tooling)
    debugImplementation(libs.androidx.ui.test.manifest)
    debugImplementation(libs.firebase.crashlytics.buildtools)
}
