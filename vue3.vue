<template>
  <div class="page">
    <div class="header" @click="showPopup">
      <img src="@images/list.png" class="list" alt="" />
    </div>
    <div class="container" @touchstart="handleScroll">
      <!-- 首次进入 -->
      <div class="chat_info" v-if="!chatHistory.length">
        <div class="logo">
          <img
            src="ai.gif"
            mode=""
            class="icon"
          />
          <img src="@images/hi.png" mode="" class="hi" />
        </div>

        <div class="chat_tip">专注消防数字化服务</div>
        <div class="btn_tip_group">
          <div class="row">
            <div class="item" @click="checkSend(1)">平台操作问题</div>
            <div class="item" @click="checkSend(2)">消防知识咨询</div>
          </div>
          <div class="row">
            <div class="item" @click="checkSend(3)">规范标准查询</div>
            <div class="item" @click="checkSend(4)">故障处理建议</div>
          </div>
        </div>

        <div class="customer_box">
          <div class="title">联系我们</div>

          <div class="row">
            <img src="@images/service.png" class="icon" alt="" />
            <div class="label">客服热线：</div>
            <div class="value">
              <a href="tel:"></a>
            </div>
          </div>
          <div class="row">
            <img src="@images/phone.png" class="icon" alt="" />
            <div class="label">商务咨询：</div>
            <div class="value">
              <a href=""></a>
            </div>
          </div>
        </div>
      </div>

      <!-- 对话列表 -->
      <div class="chat-history" v-if="chatHistory.length">
        <div class="list" ref="list">
          <div
            v-for="(item, index) in chatHistory"
            :key="index"
            :class="item.role === 'user' ? 'user-message' : 'ai-message'"
          >
            <div class="chat-message-container">
              <div v-if="item.role === 'assistant'" class="ai_name">
                <img src="@images/ai.png" class="icon" />
                <div class="name">火腿AI</div>
              </div>

              <div
                class="loader"
                v-if="isLoading && index === chatHistory.length - 1"
              ></div>

              <div v-if="item.role === 'user'" class="chat-message-item">
                {{ item.content }}
              </div>

              <v-md-preview
                :text="item.content"
                v-if="item.role === 'assistant'"
              ></v-md-preview>

              <div
                class="stopSession"
                v-if="
                  item.role === 'assistant' &&
                  stopSession &&
                  index === chatHistory.length - 1
                "
              >
                已停止会话
              </div>

              <template
                v-if="
                  item.role === 'assistant' &&
                  item.content !== '' &&
                  (index !== chatHistory.length - 1 || lastCopy)
                "
              >
                <div class="chat_actions">
                  <div class="item" @click="copyMessage(item.content)">
                    <img src="@images/copy.png" class="icon" />
                    <div class="label">复制内容</div>
                  </div>
                  <div class="item" @click="updateMessage(index)">
                    <img src="@images/update.png" class="icon" />
                    <div class="label">重新生成</div>
                  </div>
                </div>
              </template>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- 输入部分 -->
    <div class="input_box">
      <div class="chat_input_box">
        <Textarea
          v-model:value="inputText"
          placeholder="有什么问题尽管问我"
          auto-size
          @change="onInput"
        />
        <div class="chat_btn" @click="sendMessage" v-if="sendType == 1">
          <img src="@images/send.png" class="icon" />
        </div>

        <div class="chat_btn" @click="stopChat" v-if="sendType == 2">
          <div class="stop"></div>
        </div>
      </div>
    </div>

    <!-- 左侧弹出 -->
    <van-popup
      v-model:show="show"
      position="left"
      :style="{ width: '70%', height: '100%' }"
    >
      <div class="pop_box">
        <div class="title">对话记录</div>

        <div class="add" @click="addChat">
          <img src="@images/addchat.png" alt="" class="icon" />
          <div class="value">新建对话</div>
        </div>

        <div class="list">
          <div
            v-for="item in talkList"
            :key="item.sessionId"
            class="item"
            :data-id="item.sessionId"
            @click="getTalkInfo(item.sessionId)"
          >
            {{ item.subject }}
          </div>
        </div>
      </div>
    </van-popup>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted, watch } from "vue";
import http from "@/utils/axios";
import { api } from "@/utils/config";
import { initWechatShare } from "@/utils/wx-share";

import { showToast, Popup } from "vant";
import useClipboard from "vue-clipboard3";
import "vant/lib/index.css";

const { toClipboard } = useClipboard();

const inputText = ref("");
const chatHistory = reactive([]);
const sendType = ref(1); // 1: 发送 2: 取消
const isLoading = ref(false); // 加载动画
const stopSession = ref(false); // 停止会话
const lastCopy = ref(true);
const currentChunk = ref(""); // 当前流式数据的块

onMounted(() => {
  checkLogin();

});

// 主要逻辑入口
const checkLogin = () => {
  const token = localStorage.getItem("aiToken"); // 从 localStorage 获取 token

  if (token) {
    generatedSessionId(); // 存在 token，直接生成会话 ID
    initWechatShare();
    return;
  }

  const code = getUrlParam("code"); // 获取 URL 中的 code
  if (code) {
    getToken(code); // 用 code 交换 token
  } else {
    redirectToAuth(); // 触发微信授权
  }
};

// 解析url参数
const getUrlParam = (name) => {
  const urlParams = new URLSearchParams(window.location.search);
  return urlParams.get(name);
};

// 微信登录
const redirectToAuth = () => {
  // 构造微信授权URL
   const appid = "wx8b23e74bd57c6fa2"; // 测试公众号AppID
  const redirectUri = encodeURIComponent(window.location.href); // 授权回调地址
  const scope = "snsapi_userinfo"; // 弹出授权页面，可通过openid拿到昵称、性别、所在地
  const state = "STATE"; // 可选参数，用于防CSRF攻击

  // 跳转到微信授权页面
  const url = `https://open.weixin.qq.com/connect/oauth2/authorize?appid=${appid}&redirect_uri=${redirectUri}&response_type=code&scope=${scope}&state=${state}#wechat_redirect`;

  try {
    if (location && location.href) {
      location.href = url;
    } else {
      let a = document.createElement("a");
      a.href = url;
      document.body.append(a);
      a.click();
      a.remove();
    }
  } catch {
    const newWindow = window.open(url, "_blank");
    if (newWindow) {
      newWindow.opener = null;
      newWindow.location = url;
    } else {
      location.href = url;
    }
  }

  console.log("授权页面跳转成功");
};

// 微信公众号用户授权登录 返回token
const getToken = async (code) => {
  let res = await http.get("", {
    params: {
      code,
    },
  });
  if (res.code == 200) {
    localStorage.setItem("aiToken", res.data);
    generatedSessionId();
    initWechatShare();
  }
};

// 生成会话ID
const sessionId = ref("");
const generatedSessionId = async () => {
  let res = await http.post("");
  if (res.code == 200) {
    sessionId.value = res.data;
  }
};
// 处理输入事件
const onInput = (event) => {
  console.log("输入内容:", event.target.value);
  inputText.value = event.target.value;
};

// 选择预设的会话 发送并获取AI响应
const checkSend = (e) => {
  let arr = ["平台操作问题", "消防知识咨询", "规范标准查询", "故障处理建议"];
  inputText.value = arr[e - 1];
  sendMessage();
};

// 发送消息
const sendMessage = () => {
  let token = localStorage.getItem("aiToken");
  if (!token) {
    redirectToAuth();
    return;
  }

  const userMessage = inputText.value;

  if (!userMessage) return;

  // 添加用户消息到聊天历史
  addMessageToHistory(userMessage, "user");
  addMessageToHistory("", "assistant");

  inputText.value = "";
  isLoading.value = true;
  currentChunk.value = ""; // 清空当前流式数据的块
  sendType.value = 2;
  stopSession.value = false;
  lastCopy.value = false;
  // 调用 AI 接口获取回复
  setTimeout(() => {
    aiResponse(userMessage);
  }, 200);
};

// 将消息添加到聊天历史
const addMessageToHistory = (content, role) => {
  chatHistory.push({ content, role });
  scrollToBottom();
};

// AI接口请求方法

const aiResponse = async (message) => {
  const query = {
    content: message,
    sessionId: sessionId.value,
  };
  try {
    const response = await fetch(`${api}/ai/agent/chat`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Token: localStorage.getItem("aiToken"),
      },
      body: JSON.stringify(query),
    });
    const reader = response.body.getReader();
    const decoder = new TextDecoder();

    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        sendType.value = 1;
        lastCopy.value = true;
        console.log("请求结束");
        break; // 退出循环
      }
      isLoading.value = false;

      let chunk = decoder.decode(value);
      renderChunk(chunk); // 渲染分块数据
    }
  } catch (error) {
    if (error.name === "AbortError") {
      console.log("请求被手动终止");
    } else {
      console.error("请求错误", error);
    }
  }
};

// 渲染分块内容，实现打字机效果
const renderChunk = (chunk) => {
  const lastMsg = chatHistory[chatHistory.length - 1];
  if (lastMsg?.role === "assistant") {
    lastMsg.content += chunk;
  } else {
    addMessageToHistory(chunk, "assistant");
  }
  scrollToBottom();
};

// 停止会话
const stopChat = async () => {
  console.log("停止会话请求");
  let res = await http.post(``);
  // controller.abort();
  sendType.value = 1;
  isLoading.value = false;
  stopSession.value = true;
  lastCopy.value = true;
};

// 复制消息的函数
const copyMessage = (text) => {
  toClipboard(text);

  showToast({
    message: "复制成功",
    position: "bottom",
  });
};

// 点击重新发送
const updateMessage = (index) => {
  const content = chatHistory[index - 1].content;
  inputText.value = content;
  sendMessage();
};

const show = ref(false);
const talkList = ref([]);
// 展开对话列表
const showPopup = async () => {
  let token = localStorage.getItem("aiToken");
  if (!token) {
    redirectToAuth();
    return;
  }

  let res = await http.post("", {});
  let data = res.data;
  talkList.value = data;
  stopSession.value = false;
  show.value = true;
};

// 获取AI对话内容
const getTalkInfo = async (id) => {
  if (sendType.value == 2) {
    stopChat();
    setTimeout(() => {
      show.value = false;
      talkList.value = [];
      inputText.value = "";
      chatHistory.splice(0);
      currentChunk.value = "";
      isLoading.value = false;
      sendType.value = 1;
      stopSession.value = false;
      lastCopy.value = true;
    }, 100);
  }

  let res = await http.post(``);
  let data = res.data;
  chatHistory.splice(0);
  Object.assign(chatHistory, data);
  sessionId.value = id;
  show.value = false;
  scrollToBottom();
};

// 新建对话
const addChat = () => {
  stopChat();

  setTimeout(() => {
    show.value = false;
    talkList.value = [];
    inputText.value = "";
    chatHistory.splice(0);
    currentChunk.value = "";
    isLoading.value = false;
    sendType.value = 1;
    stopSession.value = false;
    lastCopy.value = true;

    generatedSessionId();
  }, 200);
};

// 自动滚动到底部
const list = ref(null);
const scrollToBottom = () => {
  if (list.value) {
    requestAnimationFrame(() => {
      list.value.scrollTop = list.value.scrollHeight;
    });
  }
};
// 监听聊天记录变化
watch(chatHistory, () => {
  scrollToBottom();
});

const handleScroll = () => {
  console.log("滚动收起键盘");
  // 收起键盘
  if (document.activeElement) {
    document.activeElement.blur();
  }
};
</script>

<style lang="less" scoped>
.page {
  -webkit-overflow-scrolling: touch;
  .header {
    position: fixed;
    top: 20px;
    left: 20px;
    display: flex;
    justify-content: center;
    align-items: center;
    border-radius: 5px;
    width: 35px;
    height: 35px;
    z-index: 999;
    background-color: #fff;
    box-shadow: 0px 5px 20px 0px rgba(100, 100, 111, 0.25);
    -webkit-overflow-scrolling: touch;
    .list {
      width: 20px;
      height: 20px;
    }
  }

  .container {
    position: fixed;
    right: 0;
    left: 0;
    top: 0;
    bottom: 80px;
    z-index: 1;

    .chat_info {
      // height: 100%;
      position: absolute;
      top: 50%;
      left: 50%;
      width: 100%;
      transform: translate(-50%, -50%);
      display: flex;
      flex-direction: column;
      justify-content: center;
      align-items: center;

      .logo {
        width: 100px;
        height: 100px;
        position: relative;

        .icon {
          width: 100%;
          height: 100%;
        }
        .hi {
          position: absolute;
          width: 125px;
          height: 45px;
          right: -90%;
          top: -15%;
        }
      }

      .chat_tip {
        font-size: 16px;
        font-weight: bold;
        margin: 15px;
      }

      .btn_tip_group {
        .row {
          display: flex;
          align-items: center;

          .item {
            border: thin solid #d1d1d1;
            margin: 7.5px;
            padding: 10px;
            border-radius: 10px;
            font-size: 15px;
          }
        }
      }

      .customer_box {
        margin-top: 50px;
        .title {
          font-size: 15px;
          color: #666666;
          text-align: center;
          position: relative;
          margin-bottom: 20px;

          &::before {
            content: "";
            position: absolute;
            left: 0;
            top: 50%;
            width: 30%;
            height: 1px;
            background-color: #d1d1d1;
          }
          &::after {
            content: "";
            position: absolute;
            right: 0;
            top: 50%;
            width: 30%;
            height: 1px;
            background-color: #d1d1d1;
          }
        }
        .row {
          display: flex;
          align-items: center;
          margin-bottom: 15px;

          .icon {
            width: 18px;
            height: 18px;
            margin-right: 10px;
          }
          .label {
            font-size: 15px;
            color: #888888;
          }
          .value {
            font-size: 15px;
            a {
              color: #576b95;
            }
          }
        }
      }
    }

    .chat-history {
      height: 100%;

      .list {
        // padding-bottom: 100px;
        overflow-y: scroll;
        height: 100%;

        .user-message {
          padding: 15px;
          .chat-message-container {
            display: flex;
            justify-content: flex-end;

            .chat-message-item {
              background-color: #2772ff;
              max-width: 90%;
              padding: 10px;
              color: #fff;
              font-size: 16px;
              word-break: break-word;
              border-radius: 10px;
              border-bottom-right-radius: 0;
            }
          }
        }

        .ai-message {
          // margin: 15px 15px 50px;
          padding: 15px 15px 50px;
          .chat-message-container {
            display: flex;
            flex-direction: column;

            .ai_name {
              display: flex;
              align-items: center;

              .icon {
                width: 40px;
                height: 40px;
                margin-right: 10px;
              }

              .name {
                font-size: 16px;
                font-weight: bold;
              }
            }

            .loader {
              margin: 15px 40px;
              width: 40px;
              aspect-ratio: 4;
              --_g: no-repeat
                radial-gradient(circle closest-side, #2772ff 90%, #0000);
              background: var(--_g) 0% 50%, var(--_g) 50% 50%,
                var(--_g) 100% 50%;
              background-size: calc(100% / 3) 100%;
              animation: l7 1s infinite linear;
            }

            @keyframes l7 {
              33% {
                background-size: calc(100% / 3) 0%, calc(100% / 3) 100%,
                  calc(100% / 3) 100%;
              }

              50% {
                background-size: calc(100% / 3) 100%, calc(100% / 3) 0%,
                  calc(100% / 3) 100%;
              }

              66% {
                background-size: calc(100% / 3) 100%, calc(100% / 3) 100%,
                  calc(100% / 3) 0%;
              }
            }

            :deep(.v-md-editor-preview) {
              .github-markdown-body {
                font-size: 16px;
                padding: 5px 15px;
                h1,
                h2,
                h3,
                h4,
                h5,
                h6,
                ol,
                dl,
                ul,
                p {
                  margin-top: 10px;
                  margin-bottom: 10px;
                }
              }
            }

            .stopSession {
              font-size: 13px;
              margin: 10px 15px;
            }

            .chat_actions {
              display: flex;
              gap: 8px;
              padding: 0 10px;
              .item {
                background-color: #edf0f6;
                padding: 5px 7.5px;
                border-radius: 6px;
                display: flex;
                align-items: center;
                justify-content: center;

                .icon {
                  width: 15px;
                  height: 15px;
                  margin-right: 7.5px;
                }

                .label {
                  font-size: 13px;
                  color: #666666;
                }
              }
            }
          }
        }
      }
    }
  }

  .input_box {
    position: fixed;
    left: 50%;
    transform: translateX(-50%);
    bottom: 10px;
    width: 100%;
    z-index: 99;
    padding-bottom: 15px;
    background-color: #fff;

    .chat_input_box {
      margin: 0 15px;
      background-color: #eff0f5;
      border-radius: 10px;
      padding: 5px 10px;
      display: flex;
      align-items: center;

      :deep(.m-textarea) {
        flex: 1;
        width: 100%;
        max-height: 100px;
        min-height: 35px;
        // margin: 0 10px;
        font-size: 16px;
        .textarea-item {
          width: 100%;
          min-width: 0;
          min-height: 35px;
          max-height: 100px;
          max-width: 100%;
          height: auto;
          padding: 5px;
          font-size: 16px;
          border: none;
          box-shadow: none;
          background-color: #eff0f5;
        }
        // }
      }

      .chat_btn {
        width: 30px;
        height: 30px;
        background-color: #2772ff;
        border-radius: 30px;
        display: flex;
        justify-content: center;
        align-items: center;
        margin-left: 10px;
        .icon {
          width: 15px;
          height: 15px;
        }

        .stop {
          background-color: #ffffff;
          width: 15px;
          height: 15px;
          border-radius: 4px;
        }
      }

      .chat_voice_tip {
        flex: 1;
        height: 100%;
        display: flex;
        justify-content: center;
        align-items: center;

        .tip {
          width: 100%;
          height: 100%;
          display: flex;
          justify-content: center;
          align-items: center;
          font-size: 16px;
          font-weight: bold;
        }
      }
    }
  }

  .pop_box {
    background-color: #fff;
    padding: 20px;
    height: 100%;
    // position: relative;

    .title {
      font-size: 16px;
      font-weight: bold;
    }

    .add {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 130px;
      padding: 5px 10px;
      border: thin solid #2772ff;
      border-radius: 25px;
      margin: 20px 0;

      .icon {
        width: 25px;
        height: 25px;
        margin-right: 10px;
      }

      .value {
        font-size: 14px;
        font-weight: bold;
        color: #2772ff;
      }
    }

    .list {
      overflow-y: scroll;
      height: calc(100% - 100px);

      .item {
        padding: 10px 0;
        white-space: nowrap;
        text-overflow: ellipsis;
        overflow: hidden;
        word-break: break-all;
        border-bottom: 1px solid #f1f1f1;
        font-size: 16px;
      }
    }
  }
}
</style>
