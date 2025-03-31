let app = getApp();
import towxml from "../towxml/index";
const config = require("~/config");
var plugin = requirePlugin("WechatSI");
let manager = plugin.getRecordRecognitionManager();
var requestTask = null;
Page({
  data: {
    navBarHeight: app.globalData.navBarHeight,
    menuRight: app.globalData.menuRight,
    menuTop: app.globalData.menuTop,
    menuHeight: app.globalData.menuHeight,
    pink: app.globalData.config.requestUrl,
    show: false,
    talkList: [], // AI对话列表

    sessionId: "", //会话ID
    inputText: "", // 用户输入的消息
    chatHistory: [], // 存储聊天历史
    currentChunk: "", // 存储当前正在接收的流式数据块

    isLoading: false, // AI响应加载状态

    bars: Array(15).fill(10),
    interval: null,

    inputType: 1, // 输入类型 1：键盘输入 2 语音输入
    sendType: 1, // 1 发送  2暂停
    longPress: false,
    startY: null, // 记录长按时的起始位置
    moveY: null, //  记录上滑结束位置
    stopClass: "",
    stopSession: false, // 是否停止会话

    windowHeight: 0,
    keyboardHeight: 0,
    scrollTop: 0,
    lastCopy: true, // 是否显示 复制 按钮
  },

  onLoad() {
    wx.setNavigationBarColor({
      frontColor: "#000000", //黑
      backgroundColor: "#ffffff",
    });
    const window = wx.getWindowInfo();
    console.log(window);
    this.setData({
      windowHeight: window.windowHeight - 80,
      startY: window.windowHeight,
      moveY: window.windowHeight,
    });

    this.generatedSessionId();
  },
  onUnload() {
    clearInterval(this.data.interval);
  },

  // 显示 AI 对话列表
  async lookList() {
    let res = await app.request("", {});
    let data = res.data.data;
    this.setData({
      talkList: data,
      stopSession: false,
      show: true,
    });
  },

  // 关闭对话框
  onClose() {
    this.setData({ show: false });
  },

  // 选择对话并获取内容
  getTalkInfo(e) {
    let { id } = e.currentTarget.dataset;
    this.stopChat();

    setTimeout(() => {
      this.setData({
        sessionId: id,
        sendType: 1,
        talkList: [], // AI对话列表

        inputText: "", // 用户输入的消息
        chatHistory: [], // 存储聊天历史
        currentChunk: "", // 存储当前正在接收的流式数据块
        isLoading: false, // AI响应加载状态
        bars: Array(15).fill(10),
        interval: null,
        inputType: 1, // 输入类型 1：键盘输入 2 语音输入
        sendType: 1, // 1 发送  2暂停
        longPress: false,
        startY: 0, // 记录长按时的起始位置
        stopClass: "",
        stopSession: false,
        lastCopy: true,
      });
      this.onClose();
      this.getAiTalk(id);
    }, 100);
  },

  // 获取AI对话内容
  async getAiTalk(id) {
    let res = await app.request(``);
    let data = res.data.data;
    this.setData({
      chatHistory: data,
    });
    this.processAiMessages();
    this.scrollToBottom();
  },

  // 生成会话ID
  async generatedSessionId() {
    let res = await app.request("", {});
    let data = res.data.data;
    this.setData({
      sessionId: data,
    });
  },

  // 处理 AI 消息，转换 markdown
  processAiMessages() {
    let { chatHistory } = this.data;

    chatHistory.forEach((item) => {
      if (item.role === "assistant") {
        item.markdownContent = towxml(item.content, "markdown", {
          theme: "light",
        });
      }
    });
    console.log(chatHistory);
    this.setData({ chatHistory });
  },

  // 切换输入方式（键盘/语音）
  toggleInputType() {
    this.setData({
      inputType: this.data.inputType === 1 ? 2 : 1,
      keyboardHeight: 0, // 恢复默认位置
    });
    if (this.data.inputType == 2) {
      this.checkAuthorization();
    }
  },

  // 长按开始 开始语音录制
  startLongPress(e) {
    console.log("长按开始");
    if (this.data.interval) return;

    manager.start({ duration: 30000, lang: "zh_CN" });
    wx.vibrateShort(); // 震动一下
    this.setData({
      longPress: true,
      startY: e.touches[0].pageY,
      moveY: e.touches[0].pageY,
      stopClass: "",
    });
    this.voiceAnimation();
  },
  // 检测上滑取消
  checkCancel(e) {
    console.log("手指上滑");
    const moveY = e.touches[0].pageY; // 获取当前手指位置的 Y 坐标
    let { startY } = this.data;
    this.setData({
      moveY,
    });
    if (startY - moveY > 50) {
      // 上滑超过 50px，标记为取消
      this.setData({
        stopClass: "stop",
      });
    } else {
      // 未上滑或滑回，标记为不取消
      this.setData({ stopClass: "" });
    }
  },
  // 结束长按
  stopLongPress() {
    console.log("结束长按");
    manager.stop();
    wx.vibrateShort(); // 震动一下

    // 如果没有取消录音，才进行处理
    // if (this.data.stopClass == "stop") {
    this.resetRecordingState();
    // }
  },

  // 重置录音状态
  resetRecordingState() {
    console.log("重置录音状态");
    clearInterval(this.data.interval);
    this.setData({
      interval: null,
      longPress: false,
      bars: Array(15).fill(10),
      stopClass: "",
    });
  },

  // 监听录音状态
  initRecord() {
    manager.onError = (res) => {
      console.log("录音报错", res);
      this.resetRecordingState();
    };

    manager.onStop = (res) => {
      console.log("录音结束", res);
      if (res.result) {
        this.setData({ inputText: res.result });

        setTimeout(() => {
          this.sendMessage();
        }, 500);
      } else {
        console.log("录音已取消");
      }

      this.resetRecordingState();
    };

    this.resetRecordingState();
  },

  /** 录音权限检查 */
  checkAuthorization() {
    const that = this;
    wx.getSetting({
      success(res) {
        if (res.authSetting["scope.record"]) {
          that.initRecord();
        } else {
          that.requestAuthorization();
        }
      },
    });
  },

  // 请求授权
  requestAuthorization() {
    const that = this;
    wx.authorize({
      scope: "scope.record",
      success() {
        that.initRecord();
      },
      fail() {
        that.openSetting();
      },
    });
  },

  // 打开设置页面
  openSetting() {
    const that = this;
    wx.showModal({
      title: "授权",
      content: "请先授权获取麦克风权限",
      success(res) {
        if (res.confirm) {
          wx.openSetting({
            success(res) {
              if (res.authSetting["scope.record"]) {
                that.initRecord();
              } else {
                that.openSetting();
              }
            },
          });
        } else if (res.cancel) {
          that.openSetting();
        }
      },
    });
  },

  // 语音波动动画
  voiceAnimation() {
    const that = this;
    this.setData({
      interval: setInterval(() => {
        that.setData({
          bars: that.data.bars.map(() => Math.random() * 60),
        });
      }, 200),
    });
  },

  // 选择预设的会话 发送并获取AI响应
  checkSend(e) {
    let { value } = e.currentTarget.dataset;
    this.setData({
      inputText: value,
    });
    this.sendMessage();
  },

  // 处理输入框变化
  onInput(e) {
    this.setData({
      inputText: e.detail.value,
    });
  },

  // 发送用户消息并获取AI响应
  sendMessage() {
    let { startY, moveY } = this.data;
    console.log(startY, moveY);
    if (startY - moveY > 50) {
      return;
    }

    const userMessage = this.data.inputText.trim();
    if (!userMessage) return;

    // 添加用户消息到聊天历史
    this.addMessageToHistory(userMessage, "user");
    this.addMessageToHistory("", "assistant");

    // 清空输入框
    this.setData({
      inputText: "",
      isLoading: true,
      currentChunk: "", // 清空当前流式数据的块
      sendType: 2,
      stopSession: false,
      lastCopy: false,
    });
    // 调用 AI 接口获取回复
    setTimeout(() => {
      this.requestAiResponse(userMessage);
    }, 200);
  },

  // AI接口请求方法
  requestAiResponse(message) {
    const that = this;
    let { sessionId, stopSession } = that.data;
    let query = {
      content: message,
      sessionId,
    };

    requestTask = wx.request({
      url: config.requestUrl + "",
      method: "POST",
      data: JSON.stringify(query),
      header: {
        "Content-Type": "application/json; charset=UTF-8",
        Token: wx.getStorageSync("token"),
        accept: "application/json",
        Authorization: "Bearer ..",
      },
      enableChunked: true,
      success(res) {
        console.log("会话请求成功：", res);
        that.setData({
          lastCopy: true,
          sendType: 1,
        });
        that.scrollToBottom();
      },
      fail(err) {
        if (err.errMsg === "request:fail abort") {
          console.log("请求已被中断");
        } else {
          console.error("请求失败：", err);
        }
        that.setData({ isLoading: false });
      },
    });

    if (stopSession) {
      requestTask.abort();
      return;
    }

    requestTask.onChunkReceived(function (res) {
      try {
        const chunkText = that.decode(res.data);
        that.setData({ isLoading: false });
        console.log(chunkText);
        that.data.currentChunk += chunkText;
        that.renderChunk(that.data.currentChunk);
      } catch (e) {
        console.error("解析数据块失败:", res.data, e);
      }
    });
  },

  // 解析 ArrayBuffer 为 UTF-8 字符串
  decode(arrayBuffer) {
    return decodeURIComponent(
      escape(String.fromCharCode(...new Uint8Array(arrayBuffer)))
    );
  },

  // 停止请求
  async stopChat() {
    console.log("执行停止会话请求");
    if (requestTask) {
      requestTask.abort();
      requestTask = null;
    }
    let { sessionId } = this.data;
    let res = await app.$http.post(``);
    console.log(res, "停止对话");
    this.setData({
      sendType: 1,
      isLoading: false,
      stopSession: true,
      lastCopy: true,
    });
    this.scrollToBottom();
  },

  // 实时渲染当前内容
  renderChunk(chunk) {
    let { chatHistory } = this.data;
    const parsedMarkdown = towxml(chunk, "markdown", {
      theme: "light",
    });

    let lastIndex = chatHistory.length - 1;
    if (lastIndex >= 0 && chatHistory[lastIndex].role === "assistant") {
      // 直接更新最后一条 AI 消息
      this.setData({
        [`chatHistory[${lastIndex}].markdownContent`]: parsedMarkdown,
        [`chatHistory[${lastIndex}].content`]: chunk,
      });
    } else {
      // 添加新消息
      this.addMessageToHistory(chunk, "assistant", parsedMarkdown);
    }

    this.scrollToBottom();
  },

  // 将消息添加到聊天历史
  addMessageToHistory(content, role, markdownContent = "") {
    const newMessage = {
      content,
      role,
      markdownContent,
    };
    this.setData({
      chatHistory: [...this.data.chatHistory, newMessage],
    });
    this.scrollToBottom();
  },

  // 提取 markdownContent 中的纯文本
  extractTextFromMarkdown(nodes) {
    let textContent = "";
    const traverse = (node) => {
      if (typeof node === "string") textContent += node;
      else if (Array.isArray(node)) node.forEach(traverse);
      else if (node?.type === "text") textContent += node.text;
      else if (node?.children) node.children.forEach(traverse);
    };
    traverse(nodes);
    return textContent.trim();
  },

  // 复制消息的函数
  copyMessage(e) {
    const { index } = e.currentTarget.dataset; // 获取消息的索引
    let { chatHistory } = this.data;
    const markdownNodes = chatHistory[index].markdownContent;
    // 提取 markdown 内容中的纯文本
    const textContent = this.extractTextFromMarkdown(markdownNodes);
    wx.setClipboardData({
      data: textContent,
      success() {
        wx.showToast({
          title: "复制成功",
          icon: "none",
          duration: 2000,
        });
      },
    });
  },

  // 点击重新发送
  updateMessage(e) {
    const { index } = e.currentTarget.dataset; // 获取消息的索引
    let { chatHistory } = this.data;
    const content = chatHistory[index - 1].content;

    this.setData({
      inputText: content,
    });
    this.sendMessage();
  },

  // 滚动到底部，保持对话流畅
  scrollToBottom() {
    const query = wx.createSelectorQuery();
    query.select("#list").boundingClientRect(); // 获取内容区域高度
    query.select("#scrollView").boundingClientRect(); // 获取scroll-view高度
    query.selectViewport().scrollOffset();
    query.exec((res) => {
      if (res[0] && res[1]) {
        const contentHeight = res[0].height;
        const scrollViewHeight = res[1].height;
        this.setData({
          scrollTop: contentHeight - scrollViewHeight + 100, // 计算滚动到底部的值
        });
      }
    });
  },

  // 导航返回
  back() {
    wx.navigateBack({ delta: 1 });
  },

  // 新建对话
  addChat() {
    this.stopChat();
    this.setData({
      show: false,
      btnOptions: [
        "平台操作问题",
        "消防知识咨询",
        "规范标准查询",
        "故障处理建议",
      ],
      talkList: [], // AI对话列表
      inputText: "", // 用户输入的消息
      chatHistory: [], // 存储聊天历史
      currentChunk: "", // 存储当前正在接收的流式数据块

      isLoading: false, // AI响应加载状态

      bars: Array(15).fill(10),
      interval: null,

      inputType: 1, // 输入类型 1：键盘输入 2 语音输入
      sendType: 1, // 1 发送  2暂停
      longPress: false,
      startY: 0, // 记录长按时的起始位置
      stopClass: "",
      stopSession: false,
      lastCopy: true,
    });
    this.generatedSessionId();
  },

  onFocus(e) {
    const { height } = e.detail;
    this.setData({
      keyboardHeight: height,
    });
  },

  onBlur() {
    this.setData({
      keyboardHeight: 0, // 恢复默认位置
    });
  },

  callPhone(e) {
    let phone = e.currentTarget.dataset.phone;
    if (phone) {
      wx.makePhoneCall({
        phoneNumber: phone, //仅为示例，并非真实的电话号码
      });
    }
  },
});
