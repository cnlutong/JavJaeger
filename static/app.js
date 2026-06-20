(() => {
  // frontend/src/utils/api.js
  var fetchWithRetry = async (url, options = {}, retries = 3, delay = 1e3) => {
    try {
      const response = await fetch(url, options);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      return await response.json();
    } catch (error) {
      if (retries > 0) {
        await new Promise((resolve) => setTimeout(resolve, delay));
        return fetchWithRetry(url, options, retries - 1, delay * 2);
      }
      throw error;
    }
  };
  var fetchClientConfig = async () => fetchWithRetry("/api/client-config");
  var fetchSystemSettings = async () => fetchWithRetry("/api/system/settings");
  var updateJavBusSettings = async (javbus) => fetchWithRetry(
    "/api/system/settings/javbus",
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ javbus })
    },
    0
  );
  var fetchAutomationTasks = async () => fetchWithRetry("/api/automation/tasks", {}, 0);
  var createAutomationTask = async (payload) => fetchWithRetry(
    "/api/automation/tasks",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    },
    0
  );
  var updateAutomationTask = async (taskId, payload) => fetchWithRetry(
    `/api/automation/tasks/${encodeURIComponent(taskId)}`,
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    },
    0
  );
  var deleteAutomationTask = async (taskId) => fetchWithRetry(
    `/api/automation/tasks/${encodeURIComponent(taskId)}`,
    { method: "DELETE" },
    0
  );
  var runAutomationTask = async (taskId) => fetchWithRetry(
    `/api/automation/tasks/${encodeURIComponent(taskId)}/run`,
    { method: "POST" },
    0
  );

  // frontend/src/utils/storage.js
  var parseJson = (value, fallback = {}) => {
    if (!value) {
      return fallback;
    }
    try {
      return JSON.parse(value);
    } catch (error) {
      return fallback;
    }
  };
  var loadPikPakSession = () => {
    const credentials = parseJson(window.sessionStorage.getItem("pikpakCredentials"), null);
    const isLoggedIn = window.sessionStorage.getItem("pikpakLoginStatus") === "true";
    const profile = parseJson(window.localStorage.getItem("pikpakProfile"), {});
    return {
      credentials,
      isLoggedIn: Boolean(credentials && isLoggedIn),
      profile
    };
  };
  var persistPikPakSession = (credentials) => {
    window.localStorage.setItem("pikpakProfile", JSON.stringify({ username: credentials.username || "" }));
    window.sessionStorage.setItem("pikpakCredentials", JSON.stringify(credentials));
    window.sessionStorage.setItem("pikpakLoginStatus", "true");
  };
  var clearPikPakSession = () => {
    window.sessionStorage.removeItem("pikpakCredentials");
    window.sessionStorage.removeItem("pikpakLoginStatus");
  };
  var loadWebDavSettings = () => ({
    ...parseJson(window.localStorage.getItem("webdavSettingsPublic"), {}),
    ...parseJson(window.sessionStorage.getItem("webdavSettingsSecret"), {})
  });
  var saveWebDavSettings = (values) => {
    window.localStorage.setItem(
      "webdavSettingsPublic",
      JSON.stringify({
        url: values.url || "",
        username: values.username || ""
      })
    );
    window.sessionStorage.setItem(
      "webdavSettingsSecret",
      JSON.stringify({
        password: values.password || ""
      })
    );
  };
  var loadAria2Settings = () => ({
    ...parseJson(window.localStorage.getItem("aria2SettingsPublic"), {}),
    ...parseJson(window.sessionStorage.getItem("aria2SettingsSecret"), {})
  });
  var saveAria2Settings = (values) => {
    window.localStorage.setItem(
      "aria2SettingsPublic",
      JSON.stringify({
        url: values.url || ""
      })
    );
    window.sessionStorage.setItem(
      "aria2SettingsSecret",
      JSON.stringify({
        secret: values.secret || ""
      })
    );
  };

  // frontend/src/components/WebDavPage.jsx
  var React = window.React;
  var antd = window.antd;
  var icons = window.icons;
  var {
    Layout,
    Typography,
    Badge,
    Card,
    Form,
    Input,
    Button,
    Table,
    Breadcrumb,
    Switch,
    InputNumber,
    Space,
    message,
    Row,
    Col,
    Popconfirm,
    Progress,
    Tag
  } = antd;
  var {
    CloudDownloadOutlined,
    CloudOutlined,
    DownloadOutlined,
    FolderFilled,
    PlayCircleFilled,
    FileOutlined,
    ReloadOutlined,
    PauseCircleOutlined,
    PlayCircleOutlined,
    DeleteOutlined,
    ApiOutlined,
    CloudServerOutlined
  } = icons;
  var { Content } = Layout;
  var { Title, Text } = Typography;
  function WebDavPage() {
    const [clientConfig, setClientConfig] = React.useState({
      webdav: { configured: false, enabled: false, url: "", username: "", auto_connect: false },
      aria2: { configured: false, enabled: false, url: "", auto_connect: false, has_secret: false }
    });
    const [webdavConnected, setWebdavConnected] = React.useState(false);
    const [aria2Connected, setAria2Connected] = React.useState(false);
    const [webdavLoading, setWebdavLoading] = React.useState(false);
    const [aria2Loading, setAria2Loading] = React.useState(false);
    const [currentPath, setCurrentPath] = React.useState("/");
    const [files, setFiles] = React.useState([]);
    const [filesLoading, setFilesLoading] = React.useState(false);
    const [selectedRowKeys, setSelectedRowKeys] = React.useState([]);
    const [selectedRows, setSelectedRows] = React.useState([]);
    const [videoFilter, setVideoFilter] = React.useState(false);
    const [minFileSizeMb, setMinFileSizeMb] = React.useState(300);
    const [downloadingSelection, setDownloadingSelection] = React.useState(false);
    const [downloads, setDownloads] = React.useState([]);
    const [downloadsLoading, setDownloadsLoading] = React.useState(false);
    const [webdavForm] = Form.useForm();
    const [aria2Form] = Form.useForm();
    const autoConnectTriggeredRef = React.useRef({ webdav: false, aria2: false });
    React.useEffect(() => {
      const savedWebdav = loadWebDavSettings();
      const savedAria2 = loadAria2Settings();
      webdavForm.setFieldsValue(savedWebdav);
      aria2Form.setFieldsValue(savedAria2);
      loadClientConfig();
      checkConnectionStatus();
    }, []);
    React.useEffect(() => {
      if (clientConfig.webdav.auto_connect && clientConfig.webdav.configured && !webdavConnected && !autoConnectTriggeredRef.current.webdav) {
        autoConnectTriggeredRef.current.webdav = true;
        handleWebdavConnectFromConfig({ silent: true });
      }
    }, [clientConfig.webdav.auto_connect, clientConfig.webdav.configured, webdavConnected]);
    React.useEffect(() => {
      if (clientConfig.aria2.auto_connect && clientConfig.aria2.configured && !aria2Connected && !autoConnectTriggeredRef.current.aria2) {
        autoConnectTriggeredRef.current.aria2 = true;
        handleAria2ConnectFromConfig({ silent: true });
      }
    }, [clientConfig.aria2.auto_connect, clientConfig.aria2.configured, aria2Connected]);
    React.useEffect(() => {
      if (!aria2Connected) return void 0;
      const timer = window.setInterval(() => {
        loadDownloads({ silent: true });
      }, 1e4);
      return () => window.clearInterval(timer);
    }, [aria2Connected]);
    const loadClientConfig = async () => {
      try {
        const config = await fetchClientConfig();
        setClientConfig(config);
        if (!webdavForm.getFieldValue("url") && config.webdav?.url) {
          webdavForm.setFieldsValue({ url: config.webdav.url });
        }
        if (!webdavForm.getFieldValue("username") && config.webdav?.username) {
          webdavForm.setFieldsValue({ username: config.webdav.username });
        }
        if (!aria2Form.getFieldValue("url") && config.aria2?.url) {
          aria2Form.setFieldsValue({ url: config.aria2.url });
        }
      } catch (error) {
        console.error("Load client config error:", error);
      }
    };
    const checkConnectionStatus = async () => {
      try {
        const res = await fetch("/api/webdav/status");
        const status = await res.json();
        setWebdavConnected(status.webdav_connected);
        setAria2Connected(status.aria2_connected);
        if (status.webdav_url && !webdavForm.getFieldValue("url")) {
          webdavForm.setFieldsValue({ url: status.webdav_url });
        }
        if (status.webdav_username && !webdavForm.getFieldValue("username")) {
          webdavForm.setFieldsValue({ username: status.webdav_username });
        }
        if (status.aria2_url && !aria2Form.getFieldValue("url")) {
          aria2Form.setFieldsValue({ url: status.aria2_url });
        }
        if (status.webdav_connected) {
          loadFiles("/");
        } else {
          setFiles([]);
        }
        if (status.aria2_connected) {
          loadDownloads({ silent: true });
        } else {
          setDownloads([]);
        }
      } catch (error) {
        console.error("Check connection error:", error);
      }
    };
    const handleWebdavConnect = async (values) => {
      setWebdavLoading(true);
      const formData = new FormData();
      formData.append("webdav_url", values.url);
      formData.append("username", values.username || "");
      formData.append("password", values.password || "");
      try {
        const res = await fetch("/api/webdav/connect", { method: "POST", body: formData });
        const result = await res.json();
        if (result.success) {
          saveWebDavSettings(values);
          message.success("WebDAV\u8FDE\u63A5\u6210\u529F");
          setWebdavConnected(true);
          loadFiles("/");
        } else {
          message.error(result.message || "WebDAV\u8FDE\u63A5\u5931\u8D25");
          setWebdavConnected(false);
          setFiles([]);
        }
      } catch (error) {
        message.error("WebDAV\u8FDE\u63A5\u5F02\u5E38");
        setWebdavConnected(false);
        setFiles([]);
      } finally {
        setWebdavLoading(false);
      }
    };
    const handleAria2Connect = async (values) => {
      setAria2Loading(true);
      const formData = new FormData();
      formData.append("aria2_url", values.url);
      formData.append("aria2_secret", values.secret || "");
      try {
        const res = await fetch("/api/aria2/connect", { method: "POST", body: formData });
        const result = await res.json();
        if (result.success) {
          saveAria2Settings(values);
          message.success("Aria2\u8FDE\u63A5\u6210\u529F");
          setAria2Connected(true);
          loadDownloads({ silent: true });
        } else {
          message.error(result.message || "Aria2\u8FDE\u63A5\u5931\u8D25");
          setAria2Connected(false);
          setDownloads([]);
        }
      } catch (error) {
        message.error("Aria2\u8FDE\u63A5\u5F02\u5E38");
        setAria2Connected(false);
        setDownloads([]);
      } finally {
        setAria2Loading(false);
      }
    };
    const handleWebdavConnectFromConfig = async ({ silent = false } = {}) => {
      setWebdavLoading(true);
      try {
        const res = await fetch("/api/webdav/connect-config", { method: "POST" });
        const result = await res.json();
        if (result.success) {
          if (clientConfig.webdav?.url || clientConfig.webdav?.username) {
            webdavForm.setFieldsValue({
              url: clientConfig.webdav.url || "",
              username: clientConfig.webdav.username || ""
            });
          }
          setWebdavConnected(true);
          if (!silent) {
            message.success("\u5DF2\u4F7F\u7528\u914D\u7F6E\u8FDE\u63A5 WebDAV");
          }
          loadFiles("/");
        } else {
          setWebdavConnected(false);
          setFiles([]);
          if (!silent) {
            message.error(result.message || "WebDAV \u914D\u7F6E\u8FDE\u63A5\u5931\u8D25");
          }
        }
      } catch (error) {
        setWebdavConnected(false);
        setFiles([]);
        if (!silent) {
          message.error("WebDAV \u914D\u7F6E\u8FDE\u63A5\u5F02\u5E38");
        }
      } finally {
        setWebdavLoading(false);
      }
    };
    const handleAria2ConnectFromConfig = async ({ silent = false } = {}) => {
      setAria2Loading(true);
      try {
        const res = await fetch("/api/aria2/connect-config", { method: "POST" });
        const result = await res.json();
        if (result.success) {
          if (clientConfig.aria2?.url) {
            aria2Form.setFieldsValue({ url: clientConfig.aria2.url });
          }
          setAria2Connected(true);
          if (!silent) {
            message.success("\u5DF2\u4F7F\u7528\u914D\u7F6E\u8FDE\u63A5 Aria2");
          }
          loadDownloads({ silent: true });
        } else {
          setAria2Connected(false);
          setDownloads([]);
          if (!silent) {
            message.error(result.message || "Aria2 \u914D\u7F6E\u8FDE\u63A5\u5931\u8D25");
          }
        }
      } catch (error) {
        setAria2Connected(false);
        setDownloads([]);
        if (!silent) {
          message.error("Aria2 \u914D\u7F6E\u8FDE\u63A5\u5F02\u5E38");
        }
      } finally {
        setAria2Loading(false);
      }
    };
    const loadFiles = async (path) => {
      setFilesLoading(true);
      try {
        const res = await fetch(`/api/webdav/files?path=${encodeURIComponent(path)}`);
        const result = await res.json();
        if (result.success) {
          setCurrentPath(path);
          let fileList = [];
          if (path !== "/") {
            const parts = path.split("/").filter(Boolean);
            parts.pop();
            const parentPath = parts.length === 0 ? "/" : "/" + parts.join("/");
            fileList.push({
              key: "..",
              name: "..",
              path: parentPath,
              is_directory: true,
              size: 0,
              isParent: true
            });
          }
          const actualFiles = (result.files || []).sort((a, b) => {
            if (a.is_directory && !b.is_directory) return -1;
            if (!a.is_directory && b.is_directory) return 1;
            return a.name.localeCompare(b.name);
          }).map((item) => ({ ...item, key: item.path }));
          setFiles([...fileList, ...actualFiles]);
          setSelectedRowKeys([]);
          setSelectedRows([]);
        } else {
          message.error(result.message || "\u52A0\u8F7D\u6587\u4EF6\u5931\u8D25");
        }
      } catch (error) {
        message.error("\u52A0\u8F7D\u6587\u4EF6\u5F02\u5E38");
      } finally {
        setFilesLoading(false);
      }
    };
    const loadDownloads = async ({ silent = false } = {}) => {
      setDownloadsLoading(true);
      try {
        const res = await fetch("/api/aria2/downloads");
        const result = await res.json();
        if (result.success) {
          setDownloads(result.downloads || []);
        } else {
          if (!silent) {
            message.error(result.message || "\u83B7\u53D6\u4E0B\u8F7D\u5217\u8868\u5931\u8D25");
          }
        }
      } catch (error) {
        if (!silent) {
          message.error("\u83B7\u53D6\u4E0B\u8F7D\u5217\u8868\u5F02\u5E38");
        }
      } finally {
        setDownloadsLoading(false);
      }
    };
    const handleDownloadSelected = async () => {
      if (selectedRows.length === 0) return;
      if (!aria2Connected) {
        message.warning("\u8BF7\u5148\u8FDE\u63A5Aria2\u4E0B\u8F7D\u5668");
        return;
      }
      setDownloadingSelection(true);
      try {
        const res = await fetch("/api/webdav/download", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            files: selectedRows,
            video_filter: videoFilter,
            min_file_size_mb: minFileSizeMb
          })
        });
        const result = await res.json();
        if (result.success) {
          const successCount = result.results.filter((item) => item.success).length;
          const failCount = result.results.filter((item) => !item.success).length;
          if (successCount > 0) {
            message.success(`\u6210\u529F\u6DFB\u52A0 ${successCount} \u4E2A\u4E0B\u8F7D\u4EFB\u52A1${failCount > 0 ? `\uFF0C${failCount} \u4E2A\u5931\u8D25` : ""}`);
            loadDownloads();
          } else if (failCount > 0) {
            message.error(`${failCount} \u4E2A\u6587\u4EF6\u4E0B\u8F7D\u5931\u8D25`);
          }
          setSelectedRowKeys([]);
          setSelectedRows([]);
        } else {
          message.error("\u6279\u91CF\u4E0B\u8F7D\u5931\u8D25");
        }
      } catch (error) {
        message.error("\u6279\u91CF\u4E0B\u8F7D\u5F02\u5E38");
      } finally {
        setDownloadingSelection(false);
      }
    };
    const downloadSingleFile = async (record) => {
      if (!aria2Connected) {
        message.warning("\u8BF7\u5148\u8FDE\u63A5Aria2\u4E0B\u8F7D\u5668");
        return;
      }
      try {
        message.loading({ content: `\u6B63\u5728\u6DFB\u52A0\u4EFB\u52A1: ${record.name}`, key: "webdav-download" });
        const res = await fetch("/api/webdav/download", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            files: [record],
            video_filter: videoFilter,
            min_file_size_mb: minFileSizeMb
          })
        });
        const result = await res.json();
        if (result.success && result.results.length > 0) {
          const successCount = result.results.filter((item) => item.success).length;
          if (successCount > 0) {
            message.success({ content: `\u5DF2\u6DFB\u52A0\u4E0B\u8F7D\u4EFB\u52A1: ${record.name}`, key: "webdav-download" });
            loadDownloads();
          } else {
            message.error({ content: result.results[0].message || "\u4E0B\u8F7D\u5931\u8D25", key: "webdav-download" });
          }
        } else {
          message.error({ content: "\u6CA1\u6709\u53EF\u4E0B\u8F7D\u7684\u6587\u4EF6", key: "webdav-download" });
        }
      } catch (error) {
        message.error({ content: "\u4E0B\u8F7D\u5F02\u5E38", key: "webdav-download" });
      }
    };
    const doDownloadAction = async (action, gid) => {
      try {
        const res = await fetch(`/api/aria2/${action}/${gid}`, { method: action === "remove" ? "DELETE" : "POST" });
        const result = await res.json();
        if (result.success) {
          message.success("\u64CD\u4F5C\u6210\u529F");
          loadDownloads();
        } else {
          message.error(result.message || "\u64CD\u4F5C\u5931\u8D25");
        }
      } catch (error) {
        message.error("\u64CD\u4F5C\u5F02\u5E38");
      }
    };
    const formatFileSize = (bytes) => {
      if (!bytes || bytes === 0) return "0 B";
      const k = 1024;
      const sizes = ["B", "KB", "MB", "GB", "TB"];
      const i = Math.floor(Math.log(bytes) / Math.log(k));
      return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
    };
    const formatSpeed = (speed) => formatFileSize(speed) + "/s";
    const isVideoFile = (filename) => {
      if (!filename) return false;
      const ext = filename.split(".").pop().toLowerCase();
      return ["mp4", "avi", "mkv", "mov", "wmv", "flv", "webm", "m4v", "ts", "mts", "mpeg", "mpg"].includes(ext);
    };
    const fileColumns = [
      {
        title: "\u540D\u79F0",
        dataIndex: "name",
        key: "name",
        ellipsis: true,
        render: (text, record) => {
          const isVideo = !record.is_directory && isVideoFile(record.name);
          const isLargeVideo = isVideo && record.size >= minFileSizeMb * 1024 * 1024;
          let iconNode;
          if (record.is_directory) {
            iconNode = /* @__PURE__ */ React.createElement(FolderFilled, { style: { color: "#ffc107", marginRight: 8, fontSize: 16 } });
          } else if (isVideo) {
            iconNode = /* @__PURE__ */ React.createElement(PlayCircleFilled, { className: "video-icon", style: { marginRight: 8, fontSize: 16 } });
          } else {
            iconNode = /* @__PURE__ */ React.createElement(FileOutlined, { style: { color: "#8c8c8c", marginRight: 8, fontSize: 16 } });
          }
          return /* @__PURE__ */ React.createElement("div", { style: { display: "flex", alignItems: "center", width: "100%" } }, /* @__PURE__ */ React.createElement("div", { style: { flexShrink: 0 } }, iconNode), /* @__PURE__ */ React.createElement(
            "a",
            {
              onClick: () => record.is_directory && loadFiles(record.path),
              style: {
                color: "inherit",
                fontWeight: isLargeVideo ? 600 : "normal",
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
                display: "inline-block",
                maxWidth: "100%"
              },
              title: text
            },
            text
          ), isLargeVideo && /* @__PURE__ */ React.createElement(Tag, { color: "success", style: { marginLeft: 8 } }, "\u89C6\u9891"));
        }
      },
      {
        title: "\u7C7B\u578B",
        dataIndex: "is_directory",
        key: "type",
        width: 100,
        render: (isDir, record) => {
          if (record.isParent) return "-";
          if (isDir) return /* @__PURE__ */ React.createElement(Tag, { color: "warning" }, "\u76EE\u5F55");
          if (isVideoFile(record.name)) return /* @__PURE__ */ React.createElement(Tag, { color: "processing" }, "\u89C6\u9891");
          return /* @__PURE__ */ React.createElement(Tag, null, "\u6587\u4EF6");
        }
      },
      {
        title: "\u5927\u5C0F",
        dataIndex: "size",
        key: "size",
        width: 120,
        render: (size, record) => record.is_directory ? "-" : /* @__PURE__ */ React.createElement(Text, { type: "secondary", style: { fontFamily: "monospace" } }, formatFileSize(size))
      },
      {
        title: "\u64CD\u4F5C",
        key: "action",
        width: 100,
        render: (_, record) => !record.isParent ? /* @__PURE__ */ React.createElement(Button, { type: "primary", ghost: true, icon: /* @__PURE__ */ React.createElement(DownloadOutlined, null), size: "small", onClick: (e) => {
          e.stopPropagation();
          downloadSingleFile(record);
        } }) : null
      }
    ];
    const downloadColumns = [
      {
        title: "\u6587\u4EF6\u540D",
        key: "name",
        ellipsis: true,
        render: (_, record) => {
          let name = record.name || "\u672A\u77E5\u6587\u4EF6";
          if ((!record.name || record.name === "\u672A\u77E5\u6587\u4EF6") && record.files?.[0]?.uris?.[0]?.uri) {
            try {
              const urlObj = new URL(record.files[0].uris[0].uri);
              name = decodeURIComponent(urlObj.pathname.split("/").pop() || "\u672A\u77E5\u6587\u4EF6");
            } catch (error) {
            }
          }
          return name;
        }
      },
      {
        title: "\u72B6\u6001",
        dataIndex: "status",
        key: "status",
        width: 100,
        render: (status) => {
          const map = {
            active: { color: "processing", text: "\u4E0B\u8F7D\u4E2D" },
            waiting: { color: "default", text: "\u7B49\u5F85\u4E2D" },
            paused: { color: "warning", text: "\u5DF2\u6682\u505C" },
            error: { color: "error", text: "\u9519\u8BEF" },
            complete: { color: "success", text: "\u5DF2\u5B8C\u6210" },
            removed: { color: "default", text: "\u5DF2\u5220\u9664" }
          };
          const item = map[status] || { color: "default", text: status };
          return /* @__PURE__ */ React.createElement(Tag, { color: item.color }, item.text);
        }
      },
      {
        title: "\u8FDB\u5EA6",
        key: "progress",
        width: 200,
        render: (_, record) => {
          const percent = record.totalLength > 0 ? Math.round(record.completedLength / record.totalLength * 100) : 0;
          return /* @__PURE__ */ React.createElement(Progress, { percent, size: "small", status: record.status === "error" ? "exception" : record.status === "active" ? "active" : "normal" });
        }
      },
      {
        title: "\u901F\u5EA6",
        dataIndex: "downloadSpeed",
        key: "speed",
        width: 120,
        render: (speed) => /* @__PURE__ */ React.createElement(Text, { style: { fontFamily: "monospace" } }, formatSpeed(speed))
      },
      {
        title: "\u5927\u5C0F",
        dataIndex: "totalLength",
        key: "size",
        width: 120,
        render: (size) => /* @__PURE__ */ React.createElement(Text, { style: { fontFamily: "monospace" } }, formatFileSize(size))
      },
      {
        title: "\u64CD\u4F5C",
        key: "action",
        width: 180,
        render: (_, record) => /* @__PURE__ */ React.createElement(Space, { size: "small" }, record.status === "active" && /* @__PURE__ */ React.createElement(Button, { size: "small", type: "primary", onClick: () => doDownloadAction("pause", record.gid), icon: /* @__PURE__ */ React.createElement(PauseCircleOutlined, null) }, "\u6682\u505C"), (record.status === "paused" || record.status === "waiting") && /* @__PURE__ */ React.createElement(Button, { size: "small", type: "primary", ghost: true, onClick: () => doDownloadAction("resume", record.gid), icon: /* @__PURE__ */ React.createElement(PlayCircleOutlined, null) }, "\u7EE7\u7EED"), /* @__PURE__ */ React.createElement(Popconfirm, { title: "\u786E\u5B9A\u5220\u9664?", onConfirm: () => doDownloadAction("remove", record.gid) }, /* @__PURE__ */ React.createElement(Button, { size: "small", danger: true, icon: /* @__PURE__ */ React.createElement(DeleteOutlined, null) }, "\u5220\u9664")))
      }
    ];
    const breadcrumbItems = currentPath.split("/").filter(Boolean).reduce((acc, part) => {
      const path = acc.length === 0 ? "/" + part : acc[acc.length - 1].path + "/" + part;
      acc.push({ title: /* @__PURE__ */ React.createElement("a", { onClick: () => loadFiles(path) }, part), path });
      return acc;
    }, []);
    return /* @__PURE__ */ React.createElement("div", { className: "webdav-page" }, /* @__PURE__ */ React.createElement("div", { className: "webdav-page-header" }, /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement(Title, { level: 3, style: { marginBottom: 4 } }, "WebDAV \u4E0B\u8F7D\u4E2D\u5FC3"), /* @__PURE__ */ React.createElement(Text, { type: "secondary" }, "\u6D4F\u89C8\u7F51\u76D8\u76EE\u5F55\u5E76\u5C06\u76F4\u94FE\u6279\u91CF\u53D1\u9001\u5230 Aria2\u3002")), /* @__PURE__ */ React.createElement(Space, { size: "large", className: "webdav-status-cluster" }, /* @__PURE__ */ React.createElement("span", null, /* @__PURE__ */ React.createElement(Text, null, "WebDAV:"), /* @__PURE__ */ React.createElement(Badge, { status: webdavConnected ? "success" : "default", text: webdavConnected ? "\u5DF2\u8FDE\u63A5" : "\u672A\u8FDE\u63A5", style: { marginInlineStart: 8 } })), /* @__PURE__ */ React.createElement("span", null, /* @__PURE__ */ React.createElement(Text, null, "Aria2:"), /* @__PURE__ */ React.createElement(Badge, { status: aria2Connected ? "success" : "default", text: aria2Connected ? "\u5DF2\u8FDE\u63A5" : "\u672A\u8FDE\u63A5", style: { marginInlineStart: 8 } })))), /* @__PURE__ */ React.createElement(Content, null, /* @__PURE__ */ React.createElement(Row, { gutter: [24, 24] }, /* @__PURE__ */ React.createElement(Col, { xs: 24, md: 12 }, /* @__PURE__ */ React.createElement(Card, { className: "webdav-connection-card", title: /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement(CloudOutlined, null), " WebDAV\u670D\u52A1\u5668"), extra: /* @__PURE__ */ React.createElement(Badge, { status: webdavConnected ? "success" : "default", text: webdavConnected ? "\u5DF2\u8FDE\u63A5" : "\u672A\u8FDE\u63A5" }) }, /* @__PURE__ */ React.createElement(Form, { form: webdavForm, layout: "vertical", onFinish: handleWebdavConnect }, /* @__PURE__ */ React.createElement(Form.Item, { label: "WebDAV URL", name: "url", rules: [{ required: true, message: "\u8BF7\u8F93\u5165WebDAV URL" }] }, /* @__PURE__ */ React.createElement(Input, { placeholder: "https://...", autoComplete: "url" })), /* @__PURE__ */ React.createElement(Row, { gutter: 16 }, /* @__PURE__ */ React.createElement(Col, { span: 12 }, /* @__PURE__ */ React.createElement(Form.Item, { label: "\u7528\u6237\u540D", name: "username" }, /* @__PURE__ */ React.createElement(Input, { autoComplete: "username" }))), /* @__PURE__ */ React.createElement(Col, { span: 12 }, /* @__PURE__ */ React.createElement(Form.Item, { label: "\u5BC6\u7801", name: "password" }, /* @__PURE__ */ React.createElement(Input.Password, { autoComplete: "current-password" })))), /* @__PURE__ */ React.createElement(Space, { wrap: true }, /* @__PURE__ */ React.createElement(Button, { type: "primary", htmlType: "submit", icon: /* @__PURE__ */ React.createElement(ApiOutlined, null), loading: webdavLoading }, "\u8FDE\u63A5 WebDAV"), clientConfig.webdav.configured && /* @__PURE__ */ React.createElement(Button, { onClick: () => handleWebdavConnectFromConfig(), loading: webdavLoading }, "\u4F7F\u7528\u914D\u7F6E\u8FDE\u63A5"))))), /* @__PURE__ */ React.createElement(Col, { xs: 24, md: 12 }, /* @__PURE__ */ React.createElement(Card, { className: "webdav-connection-card", title: /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement(CloudServerOutlined, null), " Aria2\u4E0B\u8F7D\u5668"), extra: /* @__PURE__ */ React.createElement(Badge, { status: aria2Connected ? "success" : "default", text: aria2Connected ? "\u5DF2\u8FDE\u63A5" : "\u672A\u8FDE\u63A5" }) }, /* @__PURE__ */ React.createElement(Form, { form: aria2Form, layout: "vertical", onFinish: handleAria2Connect }, /* @__PURE__ */ React.createElement(Form.Item, { label: "Aria2 RPC URL", name: "url", rules: [{ required: true, message: "\u8BF7\u8F93\u5165Aria2 URL" }] }, /* @__PURE__ */ React.createElement(Input, { placeholder: "http://localhost:6800/jsonrpc", autoComplete: "url" })), /* @__PURE__ */ React.createElement(Form.Item, { label: "RPC Secret", name: "secret" }, /* @__PURE__ */ React.createElement(Input.Password, { autoComplete: "current-password" })), /* @__PURE__ */ React.createElement(Space, { wrap: true }, /* @__PURE__ */ React.createElement(Button, { type: "primary", htmlType: "submit", icon: /* @__PURE__ */ React.createElement(ApiOutlined, null), loading: aria2Loading }, "\u8FDE\u63A5 Aria2"), clientConfig.aria2.configured && /* @__PURE__ */ React.createElement(Button, { onClick: () => handleAria2ConnectFromConfig(), loading: aria2Loading }, "\u4F7F\u7528\u914D\u7F6E\u8FDE\u63A5")))))), webdavConnected && /* @__PURE__ */ React.createElement(
      Card,
      {
        className: "webdav-work-card",
        title: /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement(FolderFilled, null), " \u6587\u4EF6\u6D4F\u89C8\u5668"),
        extra: /* @__PURE__ */ React.createElement(Space, { wrap: true, className: "webdav-toolbar" }, /* @__PURE__ */ React.createElement(Button, { icon: /* @__PURE__ */ React.createElement(ReloadOutlined, null), onClick: () => loadFiles(currentPath) }, "\u5237\u65B0"), /* @__PURE__ */ React.createElement(Switch, { checkedChildren: "\u4EC5\u89C6\u9891", unCheckedChildren: "\u5168\u90E8\u6587\u4EF6", checked: videoFilter, onChange: setVideoFilter }), /* @__PURE__ */ React.createElement(Space.Compact, null, /* @__PURE__ */ React.createElement(Input, { style: { width: 40, pointerEvents: "none", backgroundColor: "#fafafa", borderRight: 0 }, placeholder: "\u2265", disabled: true }), /* @__PURE__ */ React.createElement(InputNumber, { min: 1, max: 10240, value: minFileSizeMb, onChange: setMinFileSizeMb, disabled: !videoFilter, style: { width: 100 } }), /* @__PURE__ */ React.createElement(Input, { style: { width: 50, pointerEvents: "none", backgroundColor: "#fafafa" }, placeholder: "MB", disabled: true })), /* @__PURE__ */ React.createElement(Button, { type: "primary", icon: /* @__PURE__ */ React.createElement(DownloadOutlined, null), disabled: selectedRowKeys.length === 0, onClick: handleDownloadSelected, loading: downloadingSelection }, "\u4E0B\u8F7D\u9009\u4E2D (", selectedRowKeys.length, ")"))
      },
      /* @__PURE__ */ React.createElement(Breadcrumb, { style: { marginBottom: 16 } }, /* @__PURE__ */ React.createElement(Breadcrumb.Item, null, /* @__PURE__ */ React.createElement("a", { onClick: () => loadFiles("/") }, "\u6839\u76EE\u5F55")), breadcrumbItems.map((item, idx) => /* @__PURE__ */ React.createElement(Breadcrumb.Item, { key: idx }, idx === breadcrumbItems.length - 1 ? item.title.props.children : item.title))),
      /* @__PURE__ */ React.createElement(
        Table,
        {
          columns: fileColumns,
          dataSource: files,
          loading: filesLoading,
          pagination: false,
          scroll: { x: 760 },
          rowSelection: {
            selectedRowKeys,
            onChange: (newSelectedRowKeys, newSelectedRows) => {
              setSelectedRowKeys(newSelectedRowKeys);
              setSelectedRows(newSelectedRows);
            },
            getCheckboxProps: (record) => ({ disabled: record.isParent })
          },
          rowClassName: (record) => {
            const isLargeVideo = !record.is_directory && isVideoFile(record.name) && record.size >= minFileSizeMb * 1024 * 1024;
            return isLargeVideo ? "file-row-video" : "";
          }
        }
      )
    ), aria2Connected && /* @__PURE__ */ React.createElement(Card, { className: "webdav-work-card", title: /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement(CloudDownloadOutlined, null), " \u4E0B\u8F7D\u7BA1\u7406"), extra: /* @__PURE__ */ React.createElement(Button, { icon: /* @__PURE__ */ React.createElement(ReloadOutlined, null), onClick: loadDownloads, loading: downloadsLoading }, "\u5237\u65B0\u5217\u8868") }, /* @__PURE__ */ React.createElement(Table, { columns: downloadColumns, dataSource: downloads, rowKey: "gid", loading: downloadsLoading, pagination: false, scroll: { x: 920 }, locale: { emptyText: "\u6682\u65E0\u4E0B\u8F7D\u4EFB\u52A1" } }))));
  }

  // frontend/src/utils/localScrapeTemplates.mjs
  var LOCAL_SCRAPE_TASK_TEMPLATE_KEY = "localScrapeTaskTemplates";
  var MAX_TEMPLATES = 30;
  var parseJson2 = (value, fallback) => {
    if (!value) {
      return fallback;
    }
    try {
      return JSON.parse(value);
    } catch (error) {
      return fallback;
    }
  };
  var clampInteger = (value, min, max, fallback) => {
    const parsed = Number.parseInt(value, 10);
    if (!Number.isFinite(parsed)) {
      return fallback;
    }
    return Math.max(min, Math.min(max, parsed));
  };
  var normalizeOptionalInteger = (value, min = 0) => {
    if (value === null || value === void 0 || value === "") {
      return null;
    }
    const parsed = Number.parseInt(value, 10);
    if (!Number.isFinite(parsed)) {
      return null;
    }
    return Math.max(min, parsed);
  };
  var defaultNow = () => (/* @__PURE__ */ new Date()).toISOString();
  var defaultIdFactory = () => {
    if (globalThis.crypto?.randomUUID) {
      return globalThis.crypto.randomUUID();
    }
    return `local-scrape-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  };
  var normalizeLocalScrapeTaskValues = (values = {}) => ({
    directory: String(values.directory || "").trim(),
    recursive: values.recursive !== false,
    maxDepth: normalizeOptionalInteger(values.maxDepth),
    scrape: values.scrape !== false,
    concurrent: clampInteger(values.concurrent, 1, 5, 3),
    organize: values.organize !== false,
    targetDirectory: String(values.targetDirectory || "").trim(),
    folderTemplate: values.folderTemplate === null || values.folderTemplate === void 0 ? "{code} {title}" : String(values.folderTemplate).trim(),
    namingTemplate: String(values.namingTemplate || "{code} {title}").trim() || "{code} {title}",
    writeNfo: values.writeNfo !== false,
    downloadImages: values.downloadImages !== false,
    downloadSampleImages: !!values.downloadSampleImages,
    downloadActorImages: !!values.downloadActorImages,
    downloadListThumbnail: !!values.downloadListThumbnail,
    overwriteExisting: !!values.overwriteExisting
  });
  var normalizeLocalScrapeTaskTemplateName = (name) => {
    const normalized = String(name || "").trim().replace(/\s+/g, " ");
    return normalized || "Local scrape task";
  };
  var normalizeTemplate = (template) => {
    if (!template || typeof template !== "object") {
      return null;
    }
    const id = String(template.id || "").trim();
    if (!id) {
      return null;
    }
    return {
      id,
      name: normalizeLocalScrapeTaskTemplateName(template.name),
      values: normalizeLocalScrapeTaskValues(template.values),
      createdAt: String(template.createdAt || ""),
      updatedAt: String(template.updatedAt || template.createdAt || "")
    };
  };
  var loadLocalScrapeTaskTemplates = (storage = globalThis.window?.localStorage) => {
    if (!storage) {
      return [];
    }
    const parsed = parseJson2(storage.getItem(LOCAL_SCRAPE_TASK_TEMPLATE_KEY), []);
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed.map(normalizeTemplate).filter(Boolean).sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt))).slice(0, MAX_TEMPLATES);
  };
  var persistTemplates = (storage, templates) => {
    storage.setItem(LOCAL_SCRAPE_TASK_TEMPLATE_KEY, JSON.stringify(templates.slice(0, MAX_TEMPLATES)));
  };
  var saveLocalScrapeTaskTemplate = (storage = globalThis.window?.localStorage, name, values, { existingId = "", idFactory = defaultIdFactory, now = defaultNow } = {}) => {
    if (!storage) {
      throw new Error("local storage is unavailable");
    }
    const templates = loadLocalScrapeTaskTemplates(storage);
    const timestamp = now();
    const normalizedName = normalizeLocalScrapeTaskTemplateName(name);
    const normalizedValues = normalizeLocalScrapeTaskValues(values);
    const targetId = String(existingId || "").trim();
    const existing = templates.find((template) => template.id === targetId);
    const saved = {
      id: existing?.id || idFactory(),
      name: normalizedName,
      values: normalizedValues,
      createdAt: existing?.createdAt || timestamp,
      updatedAt: timestamp
    };
    const nextTemplates = [saved, ...templates.filter((template) => template.id !== saved.id)];
    persistTemplates(storage, nextTemplates);
    return saved;
  };
  var deleteLocalScrapeTaskTemplate = (storage = globalThis.window?.localStorage, id) => {
    if (!storage) {
      return [];
    }
    const targetId = String(id || "").trim();
    const nextTemplates = loadLocalScrapeTaskTemplates(storage).filter((template) => template.id !== targetId);
    persistTemplates(storage, nextTemplates);
    return nextTemplates;
  };

  // frontend/src/utils/localScrapeNamingTemplates.mjs
  var LOCAL_SCRAPE_NAMING_FIELDS = [
    { id: "code", label: "\u756A\u53F7", placeholder: "{code}", sample: "ABP-123" },
    { id: "title", label: "\u6807\u9898", placeholder: "{title}", sample: "\u5F71\u7247\u6807\u9898" },
    { id: "actor", label: "\u9996\u4F4D\u6F14\u5458", placeholder: "{actor}", sample: "\u6F14\u5458A" },
    { id: "actors", label: "\u5168\u90E8\u6F14\u5458", placeholder: "{actors}", sample: "\u6F14\u5458A \u6F14\u5458B" },
    { id: "year", label: "\u5E74\u4EFD", placeholder: "{year}", sample: "2024" },
    { id: "date", label: "\u53D1\u884C\u65E5\u671F", placeholder: "{date}", sample: "2024-05-17" },
    { id: "studio", label: "\u5236\u4F5C\u5546", placeholder: "{studio}", sample: "Studio" },
    { id: "maker", label: "\u5236\u4F5C\u5546\u522B\u540D", placeholder: "{maker}", sample: "Studio" },
    { id: "publisher", label: "\u53D1\u884C\u5546", placeholder: "{publisher}", sample: "Publisher" },
    { id: "series", label: "\u7CFB\u5217", placeholder: "{series}", sample: "Series" },
    { id: "director", label: "\u5BFC\u6F14", placeholder: "{director}", sample: "Director" },
    { id: "original", label: "\u539F\u6587\u4EF6\u540D", placeholder: "{original}", sample: "ABP-123" }
  ];
  var LOCAL_SCRAPE_NAMING_SEPARATORS = [
    { id: "space", label: "\u7A7A\u683C", value: " " },
    { id: "slash", label: "\u6587\u4EF6\u5939\u5C42\u7EA7", value: "/" },
    { id: "dash", label: "\u77ED\u6A2A\u7EBF", value: " - " },
    { id: "underscore", label: "\u4E0B\u5212\u7EBF", value: "_" },
    { id: "dot", label: "\u70B9\u53F7", value: "." }
  ];
  var DEFAULT_TEMPLATE_PARTS = [
    { type: "field", id: "code" },
    { type: "separator", id: "space" },
    { type: "field", id: "title" }
  ];
  var fieldById = new Map(LOCAL_SCRAPE_NAMING_FIELDS.map((field) => [field.id, field]));
  var separatorById = new Map(LOCAL_SCRAPE_NAMING_SEPARATORS.map((separator) => [separator.id, separator]));
  var separatorByValue = new Map(LOCAL_SCRAPE_NAMING_SEPARATORS.map((separator) => [separator.value, separator]));
  var placeholderPattern = /\{([a-z]+)\}/g;
  var getNamingField = (id) => fieldById.get(String(id || ""));
  var getNamingSeparator = (id) => separatorById.get(String(id || ""));
  var normalizePart = (part) => {
    if (!part || typeof part !== "object") {
      return null;
    }
    if (part.type === "field" && fieldById.has(part.id)) {
      return { type: "field", id: part.id };
    }
    if (part.type === "separator" && separatorById.has(part.id)) {
      return { type: "separator", id: part.id };
    }
    if (part.type === "literal") {
      const value = String(part.value || "");
      return value ? { type: "literal", value } : null;
    }
    return null;
  };
  var normalizeTemplateParts = (parts, { allowEmpty = false } = {}) => {
    if (!Array.isArray(parts)) {
      return allowEmpty ? [] : [...DEFAULT_TEMPLATE_PARTS];
    }
    const normalized = parts.map(normalizePart).filter(Boolean);
    return normalized.length || allowEmpty ? normalized : [...DEFAULT_TEMPLATE_PARTS];
  };
  var buildTemplateFromParts = (parts, { allowEmpty = false } = {}) => {
    const rendered = normalizeTemplateParts(parts, { allowEmpty }).map((part) => {
      if (part.type === "field") {
        return fieldById.get(part.id).placeholder;
      }
      if (part.type === "separator") {
        return separatorById.get(part.id).value;
      }
      return part.value;
    }).join("").trim();
    return rendered || (allowEmpty ? "" : "{code} {title}");
  };
  var pushLiteralParts = (parts, literal) => {
    if (!literal) {
      return;
    }
    const exactSeparator = separatorByValue.get(literal);
    if (exactSeparator) {
      parts.push({ type: "separator", id: exactSeparator.id });
      return;
    }
    let remaining = literal;
    while (remaining.length > 0) {
      const separator = LOCAL_SCRAPE_NAMING_SEPARATORS.find((item) => remaining.startsWith(item.value));
      if (separator) {
        parts.push({ type: "separator", id: separator.id });
        remaining = remaining.slice(separator.value.length);
        continue;
      }
      const nextSeparatorIndex = LOCAL_SCRAPE_NAMING_SEPARATORS.map((item) => remaining.indexOf(item.value)).filter((index) => index > 0).sort((a, b) => a - b)[0];
      const literalValue = nextSeparatorIndex ? remaining.slice(0, nextSeparatorIndex) : remaining;
      parts.push({ type: "literal", value: literalValue });
      remaining = remaining.slice(literalValue.length);
    }
  };
  var parseTemplateToParts = (template, { allowEmpty = false } = {}) => {
    const source = String(template || "").trim();
    if (!source) {
      return allowEmpty ? [] : [...DEFAULT_TEMPLATE_PARTS];
    }
    const parts = [];
    let lastIndex = 0;
    for (const match of source.matchAll(placeholderPattern)) {
      pushLiteralParts(parts, source.slice(lastIndex, match.index));
      const fieldId = match[1];
      if (fieldById.has(fieldId)) {
        parts.push({ type: "field", id: fieldId });
      } else {
        parts.push({ type: "literal", value: match[0] });
      }
      lastIndex = match.index + match[0].length;
    }
    pushLiteralParts(parts, source.slice(lastIndex));
    return normalizeTemplateParts(parts, { allowEmpty });
  };
  var moveTemplatePart = (parts, fromIndex, toIndex) => {
    const normalized = normalizeTemplateParts(parts, { allowEmpty: true });
    const sourceIndex = Number.parseInt(fromIndex, 10);
    if (!Number.isInteger(sourceIndex) || sourceIndex < 0 || sourceIndex >= normalized.length) {
      return normalized;
    }
    const targetIndex = Math.max(0, Math.min(normalized.length - 1, Number.parseInt(toIndex, 10)));
    const nextParts = normalized.slice();
    const [moved] = nextParts.splice(sourceIndex, 1);
    nextParts.splice(targetIndex, 0, moved);
    return nextParts;
  };

  // frontend/src/utils/localScrapeResults.mjs
  var isConformingLocalScrapeItem = (item) => item?.scrape_status === "found";
  var getVisibleLocalScrapeItems = (items = [], showNonConforming = false) => {
    const source = Array.isArray(items) ? items : [];
    if (showNonConforming) {
      return source;
    }
    return source.filter(isConformingLocalScrapeItem);
  };
  var getDeletableNonConformingLocalScrapeKeys = (items = []) => {
    const source = Array.isArray(items) ? items : [];
    return source.filter((item) => !isConformingLocalScrapeItem(item) && item?.source_path).map((item) => item.source_path);
  };

  // frontend/src/components/DirectoryInput.jsx
  var React2 = window.React;
  var antd2 = window.antd;
  var icons2 = window.icons || {};
  var { Button: Button2, Empty, Input: Input2, List, Modal, Space: Space2, Typography: Typography2, message: message2 } = antd2;
  var { Text: Text2 } = Typography2;
  var { ArrowUpOutlined, FolderOpenOutlined, HomeOutlined } = icons2;
  var Icon = ({ as: Component }) => Component ? /* @__PURE__ */ React2.createElement(Component, null) : null;
  var fetchDirectories = async (path) => {
    const query = path ? `?path=${encodeURIComponent(path)}` : "";
    const response = await fetch(`/api/system/directories${query}`);
    const data = await response.json();
    if (!response.ok || !data.success) {
      throw new Error(data.message || `HTTP ${response.status}`);
    }
    return data;
  };
  function DirectoryInput({ value, onChange, placeholder, disabled }) {
    const [open, setOpen] = React2.useState(false);
    const [loading, setLoading] = React2.useState(false);
    const [browser, setBrowser] = React2.useState({ current_path: "", parent_path: null, entries: [] });
    const loadPath = async (path) => {
      setLoading(true);
      try {
        const data = await fetchDirectories(path);
        setBrowser(data);
      } catch (error) {
        message2.error(`\u52A0\u8F7D\u76EE\u5F55\u5931\u8D25\uFF1A${error.message}`);
      } finally {
        setLoading(false);
      }
    };
    const openBrowser = () => {
      setOpen(true);
      void loadPath(value);
    };
    const chooseCurrentPath = () => {
      if (!browser.current_path) {
        return;
      }
      onChange?.(browser.current_path);
      setOpen(false);
    };
    return /* @__PURE__ */ React2.createElement(React2.Fragment, null, /* @__PURE__ */ React2.createElement(Space2.Compact, { block: true }, /* @__PURE__ */ React2.createElement(
      Input2,
      {
        value,
        disabled,
        placeholder,
        onChange: (event) => onChange?.(event.target.value)
      }
    ), /* @__PURE__ */ React2.createElement(
      Button2,
      {
        htmlType: "button",
        disabled,
        icon: /* @__PURE__ */ React2.createElement(Icon, { as: FolderOpenOutlined }),
        onClick: openBrowser
      },
      "\u6D4F\u89C8"
    )), /* @__PURE__ */ React2.createElement(
      Modal,
      {
        title: "\u9009\u62E9\u670D\u52A1\u7AEF\u76EE\u5F55",
        open,
        onCancel: () => setOpen(false),
        onOk: chooseCurrentPath,
        okText: "\u9009\u62E9\u5F53\u524D\u76EE\u5F55",
        cancelText: "\u53D6\u6D88",
        okButtonProps: { disabled: !browser.current_path },
        width: 720
      },
      /* @__PURE__ */ React2.createElement(Space2, { style: { width: "100%", marginBottom: 12 }, wrap: true }, /* @__PURE__ */ React2.createElement(
        Button2,
        {
          htmlType: "button",
          icon: /* @__PURE__ */ React2.createElement(Icon, { as: HomeOutlined }),
          onClick: () => loadPath("")
        },
        "\u6839\u76EE\u5F55"
      ), /* @__PURE__ */ React2.createElement(
        Button2,
        {
          htmlType: "button",
          icon: /* @__PURE__ */ React2.createElement(Icon, { as: ArrowUpOutlined }),
          disabled: !browser.parent_path,
          onClick: () => loadPath(browser.parent_path)
        },
        "\u4E0A\u4E00\u7EA7"
      ), /* @__PURE__ */ React2.createElement(Text2, { copyable: !!browser.current_path, ellipsis: true, style: { maxWidth: 470 } }, browser.current_path || "\u9009\u62E9\u4E00\u4E2A\u8D77\u59CB\u4F4D\u7F6E")),
      /* @__PURE__ */ React2.createElement(
        List,
        {
          bordered: true,
          loading,
          dataSource: browser.entries || [],
          locale: { emptyText: /* @__PURE__ */ React2.createElement(Empty, { description: "\u6CA1\u6709\u53EF\u8FDB\u5165\u7684\u76EE\u5F55" }) },
          renderItem: (entry) => /* @__PURE__ */ React2.createElement(
            List.Item,
            {
              actions: [
                /* @__PURE__ */ React2.createElement(
                  Button2,
                  {
                    key: "open",
                    htmlType: "button",
                    size: "small",
                    onClick: () => loadPath(entry.path)
                  },
                  "\u6253\u5F00"
                )
              ]
            },
            /* @__PURE__ */ React2.createElement(
              List.Item.Meta,
              {
                avatar: /* @__PURE__ */ React2.createElement(Icon, { as: FolderOpenOutlined }),
                title: /* @__PURE__ */ React2.createElement("a", { onClick: () => loadPath(entry.path) }, entry.name),
                description: entry.path
              }
            )
          )
        }
      )
    ));
  }

  // frontend/src/components/LocalScrapePage.jsx
  var React3 = window.React;
  var antd3 = window.antd;
  var icons3 = window.icons || {};
  var {
    Alert,
    Button: Button3,
    Card: Card2,
    Checkbox,
    Divider,
    Drawer,
    Form: Form2,
    Input: Input3,
    InputNumber: InputNumber2,
    Popconfirm: Popconfirm2,
    Progress: Progress2,
    Select,
    Space: Space3,
    Switch: Switch2,
    Table: Table2,
    Tag: Tag2,
    Typography: Typography3,
    message: message3
  } = antd3;
  var { Text: Text3, Title: Title2 } = Typography3;
  var {
    CheckCircleOutlined,
    CloseOutlined,
    DeleteOutlined: DeleteOutlined2,
    DragOutlined,
    FileSearchOutlined,
    FolderOpenOutlined: FolderOpenOutlined2,
    PlayCircleOutlined: PlayCircleOutlined2,
    SaveOutlined,
    SettingOutlined,
    WarningOutlined
  } = icons3;
  var Icon2 = ({ as: Component }) => Component ? /* @__PURE__ */ React3.createElement(Component, null) : null;
  var LOCAL_SCRAPE_ACTIVE_TASK_KEY = "localScrapeActiveTask";
  var postJson = async (url, body) => {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.message || `HTTP ${response.status}`);
    }
    return data;
  };
  var formatBytes = (bytes) => {
    if (!bytes) return "-";
    const units = ["B", "KB", "MB", "GB", "TB"];
    let value = bytes;
    let index = 0;
    while (value >= 1024 && index < units.length - 1) {
      value /= 1024;
      index += 1;
    }
    return `${value.toFixed(index === 0 ? 0 : 1)} ${units[index]}`;
  };
  var statusTag = (item) => {
    if (item.target_exists) {
      return /* @__PURE__ */ React3.createElement(Tag2, { color: "red", icon: /* @__PURE__ */ React3.createElement(Icon2, { as: WarningOutlined }) }, "\u51B2\u7A81");
    }
    if (item.scrape_status === "found") {
      return /* @__PURE__ */ React3.createElement(Tag2, { color: "green", icon: /* @__PURE__ */ React3.createElement(Icon2, { as: CheckCircleOutlined }) }, "\u5DF2\u5339\u914D");
    }
    if (item.scrape_status === "recognized") {
      return /* @__PURE__ */ React3.createElement(Tag2, { color: "blue" }, "\u5DF2\u8BC6\u522B");
    }
    if (item.scrape_status === "unrecognized") {
      return /* @__PURE__ */ React3.createElement(Tag2, { color: "orange" }, "\u672A\u8BC6\u522B");
    }
    if (item.scrape_status === "not_found") {
      return /* @__PURE__ */ React3.createElement(Tag2, { color: "volcano" }, "\u672A\u627E\u5230");
    }
    if (item.scrape_status === "failed") {
      return /* @__PURE__ */ React3.createElement(Tag2, { color: "red" }, "\u5931\u8D25");
    }
    return /* @__PURE__ */ React3.createElement(Tag2, null, "\u5F85\u5904\u7406");
  };
  var genreTags = (genres) => {
    const values = Array.isArray(genres) ? genres.filter(Boolean) : [];
    if (!values.length) {
      return null;
    }
    const visible = values.slice(0, 6);
    const hiddenCount = values.length - visible.length;
    return /* @__PURE__ */ React3.createElement("div", { className: "jav-local-genre-tags" }, visible.map((genre, index) => /* @__PURE__ */ React3.createElement(Tag2, { color: "geekblue", key: `${genre}-${index}` }, genre)), hiddenCount > 0 && /* @__PURE__ */ React3.createElement(Tag2, null, "+", hiddenCount));
  };
  function LocalScrapePage() {
    const [form] = Form2.useForm();
    const [preview, setPreview] = React3.useState(null);
    const [selectedRowKeys, setSelectedRowKeys] = React3.useState([]);
    const [loadingPreview, setLoadingPreview] = React3.useState(false);
    const [loadingApply, setLoadingApply] = React3.useState(false);
    const [loadingDelete, setLoadingDelete] = React3.useState(false);
    const [showNonConforming, setShowNonConforming] = React3.useState(false);
    const [tablePageSize, setTablePageSize] = React3.useState(12);
    const [applyResult, setApplyResult] = React3.useState(null);
    const [taskTemplates, setTaskTemplates] = React3.useState(() => loadLocalScrapeTaskTemplates());
    const [activeTask, setActiveTask] = React3.useState(null);
    const [selectedTemplateId, setSelectedTemplateId] = React3.useState("");
    const [templateName, setTemplateName] = React3.useState("");
    const [templateDesignerOpen, setTemplateDesignerOpen] = React3.useState(false);
    const [templateDesignerTarget, setTemplateDesignerTarget] = React3.useState("folderTemplate");
    const [templateDesignerParts, setTemplateDesignerParts] = React3.useState(() => parseTemplateToParts("{code} {title}"));
    const overwriteExisting = Form2.useWatch("overwriteExisting", form);
    const allItems = preview?.items || [];
    const items = getVisibleLocalScrapeItems(allItems, showNonConforming);
    const selectedItems = allItems.filter((item) => selectedRowKeys.includes(item.source_path) && isConformingLocalScrapeItem(item));
    const selectedDeleteItems = allItems.filter((item) => selectedRowKeys.includes(item.source_path) && !isConformingLocalScrapeItem(item));
    const nonConformingCount = allItems.length - allItems.filter(isConformingLocalScrapeItem).length;
    const selectedTemplate = taskTemplates.find((template) => template.id === selectedTemplateId) || null;
    const taskTemplateOptions = taskTemplates.map((template) => ({
      value: template.id,
      label: template.name
    }));
    const templateDesignerTitle = templateDesignerTarget === "folderTemplate" ? "\u6587\u4EF6\u5939\u6A21\u677F" : "\u6587\u4EF6\u547D\u540D\u6A21\u677F";
    const templateDesignerPreview = buildTemplateFromParts(templateDesignerParts, { allowEmpty: true });
    React3.useEffect(() => {
      setTaskTemplates(loadLocalScrapeTaskTemplates());
      try {
        const savedTask = JSON.parse(window.sessionStorage.getItem(LOCAL_SCRAPE_ACTIVE_TASK_KEY) || "null");
        if (savedTask?.taskId && savedTask?.type) {
          setActiveTask(savedTask);
          setLoadingPreview(savedTask.type === "preview");
          setLoadingApply(savedTask.type === "apply");
        }
      } catch (error) {
        window.sessionStorage.removeItem(LOCAL_SCRAPE_ACTIVE_TASK_KEY);
      }
    }, []);
    React3.useEffect(() => {
      if (!activeTask?.taskId) {
        return void 0;
      }
      let stopped = false;
      let terminalHandled = false;
      const pollTask = async () => {
        if (terminalHandled) {
          return;
        }
        try {
          const response = await fetch(`/api/movies/local-scrape/jobs/${encodeURIComponent(activeTask.taskId)}`, { cache: "no-store" });
          const data = await response.json();
          if (!response.ok) {
            throw new Error(data.detail || `HTTP ${response.status}`);
          }
          if (stopped) {
            return;
          }
          const nextTask = {
            ...activeTask,
            status: data.status,
            phase: data.phase,
            percent: data.percent || 0,
            completed: data.completed || 0,
            total: data.total || 0,
            message: data.message || "",
            logs: data.logs || [],
            result: data.result || null,
            error: data.error || null
          };
          setActiveTask(nextTask);
          if (data.status === "running") {
            window.sessionStorage.setItem(LOCAL_SCRAPE_ACTIVE_TASK_KEY, JSON.stringify({
              taskId: activeTask.taskId,
              type: activeTask.type
            }));
            return;
          }
          terminalHandled = true;
          window.sessionStorage.removeItem(LOCAL_SCRAPE_ACTIVE_TASK_KEY);
          setLoadingPreview(false);
          setLoadingApply(false);
          if (data.result) {
            if (activeTask.type === "preview") {
              handlePreviewResult(data.result);
            } else {
              handleApplyResult(data.result);
            }
          } else {
            message3.error(data.message || "\u522E\u524A\u4EFB\u52A1\u5931\u8D25");
          }
        } catch (error) {
          if (!stopped) {
            setActiveTask((current) => current ? { ...current, status: "failed", message: error.message } : current);
            window.sessionStorage.removeItem(LOCAL_SCRAPE_ACTIVE_TASK_KEY);
            setLoadingPreview(false);
            setLoadingApply(false);
            message3.error(`\u522E\u524A\u4EFB\u52A1\u72B6\u6001\u8BFB\u53D6\u5931\u8D25\uFF1A${error.message}`);
          }
        }
      };
      pollTask();
      const timer = window.setInterval(pollTask, 1e3);
      return () => {
        stopped = true;
        window.clearInterval(timer);
      };
    }, [activeTask?.taskId, activeTask?.type]);
    const buildDefaultTemplateName = (values) => {
      const directoryName = String(values.directory || "").split(/[\\/]/).filter(Boolean).pop();
      return directoryName ? `\u522E\u524A\uFF1A${directoryName}` : "\u672C\u5730\u522E\u524A\u4EFB\u52A1";
    };
    const buildPayload = (values) => ({
      directory: values.directory,
      recursive: values.recursive !== false,
      max_depth: values.maxDepth ?? null,
      scrape: values.scrape !== false,
      concurrent: values.concurrent || 3,
      organize: values.organize !== false,
      target_directory: values.targetDirectory || null,
      folder_template: values.folderTemplate === null || values.folderTemplate === void 0 ? null : String(values.folderTemplate).trim(),
      naming_template: String(values.namingTemplate || "").trim(),
      write_nfo: values.writeNfo !== false,
      download_images: values.downloadImages !== false,
      download_sample_images: !!values.downloadSampleImages,
      download_actor_images: !!values.downloadActorImages,
      download_list_thumbnail: !!values.downloadListThumbnail,
      overwrite_existing: !!values.overwriteExisting
    });
    const applyTemplateToForm = (template) => {
      if (!template) {
        return;
      }
      form.setFieldsValue(template.values);
      setSelectedTemplateId(template.id);
      setTemplateName(template.name);
    };
    const handleTemplateSelect = (templateId) => {
      const template = taskTemplates.find((item) => item.id === templateId);
      applyTemplateToForm(template);
    };
    const startLocalScrapeTask = async (type, payload) => {
      const endpoint = type === "apply" ? "/api/movies/local-scrape/apply/jobs" : "/api/movies/local-scrape/preview/jobs";
      const data = await postJson(endpoint, payload);
      const task = {
        taskId: data.task_id,
        type,
        status: "running",
        phase: "queued",
        percent: 0,
        completed: 0,
        total: 0,
        message: "\u4EFB\u52A1\u5DF2\u63D0\u4EA4\uFF0C\u6B63\u5728\u540E\u53F0\u8FD0\u884C",
        logs: [],
        result: null
      };
      window.sessionStorage.setItem(LOCAL_SCRAPE_ACTIVE_TASK_KEY, JSON.stringify({ taskId: task.taskId, type }));
      setActiveTask(task);
      return task;
    };
    const handlePreviewResult = (data) => {
      if (!data.success) {
        message3.error(data.message || "\u626B\u63CF\u5931\u8D25");
        setPreview(null);
        return;
      }
      setPreview(data);
      const selectable = (data.items || []).filter((item) => isConformingLocalScrapeItem(item) && !item.target_exists && !item.target_duplicate).map((item) => item.source_path);
      setSelectedRowKeys(selectable);
      message3.success(`\u626B\u63CF\u5B8C\u6210\uFF1A${data.total_files} \u4E2A\u89C6\u9891\uFF0C${data.found_count} \u4E2A\u5339\u914D\u6210\u529F`);
    };
    const handleApplyResult = (data) => {
      setApplyResult(data);
      if (data.success) {
        message3.success(`\u522E\u524A\u5B8C\u6210\uFF1A${data.success_count} \u4E2A\u6587\u4EF6\uFF0C\u81EA\u52A8\u5165\u5E93 ${data.library_recorded_count || 0} \u4E2A`);
      } else {
        message3.warning(`\u90E8\u5206\u5B8C\u6210\uFF1A\u6210\u529F ${data.success_count}\uFF0C\u5931\u8D25 ${data.failed_count}\uFF0C\u81EA\u52A8\u5165\u5E93 ${data.library_recorded_count || 0}`);
      }
    };
    const handleSaveTemplate = async () => {
      try {
        const values = await form.validateFields();
        const saved = saveLocalScrapeTaskTemplate(
          window.localStorage,
          templateName || buildDefaultTemplateName(values),
          values,
          { existingId: selectedTemplateId }
        );
        const templates = loadLocalScrapeTaskTemplates();
        setTaskTemplates(templates);
        setSelectedTemplateId(saved.id);
        setTemplateName(saved.name);
        message3.success("\u522E\u524A\u4EFB\u52A1\u6A21\u677F\u5DF2\u4FDD\u5B58");
      } catch (error) {
        if (!error?.errorFields) {
          message3.error(`\u4FDD\u5B58\u6A21\u677F\u5931\u8D25\uFF1A${error.message}`);
        }
      }
    };
    const handleRunTemplate = async () => {
      if (!selectedTemplate) {
        message3.warning("\u8BF7\u5148\u9009\u62E9\u4E00\u4E2A\u522E\u524A\u4EFB\u52A1\u6A21\u677F");
        return;
      }
      applyTemplateToForm(selectedTemplate);
      await handlePreview(selectedTemplate.values);
    };
    const handleDeleteTemplate = () => {
      if (!selectedTemplateId) {
        return;
      }
      const templates = deleteLocalScrapeTaskTemplate(window.localStorage, selectedTemplateId);
      setTaskTemplates(templates);
      setSelectedTemplateId("");
      setTemplateName("");
      message3.success("\u522E\u524A\u4EFB\u52A1\u6A21\u677F\u5DF2\u5220\u9664");
    };
    const openTemplateDesigner = (fieldName) => {
      const currentTemplate = form.getFieldValue(fieldName);
      setTemplateDesignerTarget(fieldName);
      setTemplateDesignerParts(parseTemplateToParts(currentTemplate, { allowEmpty: true }));
      setTemplateDesignerOpen(true);
    };
    const closeTemplateDesigner = () => {
      setTemplateDesignerOpen(false);
    };
    const addTemplatePart = (part) => {
      setTemplateDesignerParts((currentParts) => [...currentParts, part]);
    };
    const removeTemplatePart = (index) => {
      setTemplateDesignerParts((currentParts) => {
        const nextParts = currentParts.slice();
        nextParts.splice(index, 1);
        return nextParts;
      });
    };
    const resetTemplateDesigner = () => {
      setTemplateDesignerParts(parseTemplateToParts("{code} {title}"));
    };
    const writeTemplateDesignerValue = () => {
      if (templateDesignerTarget === "namingTemplate" && !templateDesignerPreview) {
        message3.warning("\u6587\u4EF6\u547D\u540D\u6A21\u677F\u4E0D\u80FD\u4E3A\u7A7A\uFF0C\u8BF7\u81F3\u5C11\u6DFB\u52A0\u4E00\u4E2A\u547D\u540D\u5361\u7247");
        return;
      }
      form.setFieldValue(templateDesignerTarget, templateDesignerPreview);
      setTemplateDesignerOpen(false);
    };
    const startPaletteDrag = (event, part) => {
      event.dataTransfer.setData("application/x-javjaeger-template-part", JSON.stringify({ source: "palette", part }));
      event.dataTransfer.effectAllowed = "copy";
    };
    const startSelectedPartDrag = (event, index) => {
      event.dataTransfer.setData("application/x-javjaeger-template-part", JSON.stringify({ source: "selected", index }));
      event.dataTransfer.effectAllowed = "move";
    };
    const readDraggedTemplatePart = (event) => {
      try {
        return JSON.parse(event.dataTransfer.getData("application/x-javjaeger-template-part"));
      } catch (error) {
        return null;
      }
    };
    const handleTemplateDrop = (event, targetIndex = null) => {
      event.preventDefault();
      const payload = readDraggedTemplatePart(event);
      if (!payload) {
        return;
      }
      if (payload.source === "palette" && payload.part) {
        setTemplateDesignerParts((currentParts) => {
          const nextParts = currentParts.slice();
          const insertIndex = targetIndex === null ? nextParts.length : Math.max(0, Math.min(nextParts.length, targetIndex));
          nextParts.splice(insertIndex, 0, payload.part);
          return nextParts;
        });
        return;
      }
      if (payload.source === "selected") {
        setTemplateDesignerParts((currentParts) => moveTemplatePart(currentParts, payload.index, targetIndex ?? currentParts.length - 1));
      }
    };
    const renderTemplateDesignerPart = (part) => {
      if (part.type === "field") {
        const field = getNamingField(part.id);
        return field ? field.label : part.id;
      }
      if (part.type === "separator") {
        const separator = getNamingSeparator(part.id);
        return separator ? separator.label : part.id;
      }
      return part.value;
    };
    const handlePreview = async (values) => {
      setLoadingPreview(true);
      setApplyResult(null);
      setSelectedRowKeys([]);
      try {
        await startLocalScrapeTask("preview", buildPayload(values));
        message3.success("\u522E\u524A\u9884\u89C8\u5DF2\u5728\u540E\u53F0\u542F\u52A8");
      } catch (error) {
        message3.error(`\u626B\u63CF\u542F\u52A8\u5931\u8D25\uFF1A${error.message}`);
        setLoadingPreview(false);
      }
    };
    const handleApply = async () => {
      let values;
      try {
        values = await form.validateFields();
      } catch (error) {
        message3.warning("\u8BF7\u5148\u8865\u5168\u522E\u524A\u8BBE\u7F6E");
        return;
      }
      const payload = {
        ...buildPayload(values),
        items: selectedItems.map((item) => ({
          source_path: item.source_path,
          code: item.code,
          metadata: item.metadata
        }))
      };
      setLoadingApply(true);
      try {
        await startLocalScrapeTask("apply", payload);
        message3.success("\u522E\u524A\u6267\u884C\u5DF2\u5728\u540E\u53F0\u542F\u52A8");
      } catch (error) {
        message3.error(`\u6267\u884C\u542F\u52A8\u5931\u8D25\uFF1A${error.message}`);
        setLoadingApply(false);
      }
    };
    const handleSelectNonConforming = () => {
      const keys = getDeletableNonConformingLocalScrapeKeys(allItems);
      setShowNonConforming(true);
      setSelectedRowKeys(keys);
      if (keys.length === 0) {
        message3.info("\u6CA1\u6709\u53EF\u5220\u9664\u7684\u4E0D\u7B26\u5408\u8981\u6C42\u6587\u4EF6");
      }
    };
    const handleDeleteNonConforming = async () => {
      const sourcePaths = selectedDeleteItems.map((item) => item.source_path);
      if (!preview?.directory || sourcePaths.length === 0) {
        message3.warning("\u8BF7\u5148\u9009\u62E9\u4E0D\u7B26\u5408\u8981\u6C42\u7684\u6587\u4EF6");
        return;
      }
      setLoadingDelete(true);
      try {
        const data = await postJson("/api/movies/local-scrape/delete", {
          directory: preview.directory,
          source_paths: sourcePaths
        });
        const deletedPaths = new Set((data.results || []).filter((result) => result.success).map((result) => result.source_path));
        setPreview((current) => {
          if (!current) {
            return current;
          }
          const remainingItems = (current.items || []).filter((item) => !deletedPaths.has(item.source_path));
          return {
            ...current,
            total_files: remainingItems.length,
            recognized_count: remainingItems.filter((item) => item.code).length,
            found_count: remainingItems.filter(isConformingLocalScrapeItem).length,
            already_scraped_count: remainingItems.filter((item) => item.already_scraped).length,
            conflict_count: remainingItems.filter((item) => item.target_exists).length,
            items: remainingItems
          };
        });
        setSelectedRowKeys((currentKeys) => currentKeys.filter((key) => !deletedPaths.has(key)));
        if (data.failed_count) {
          message3.warning(`\u5DF2\u5220\u9664 ${data.deleted_count} \u4E2A\u6587\u4EF6\uFF0C${data.failed_count} \u4E2A\u5931\u8D25`);
        } else {
          message3.success(`\u5DF2\u5220\u9664 ${data.deleted_count} \u4E2A\u4E0D\u7B26\u5408\u8981\u6C42\u6587\u4EF6`);
        }
      } catch (error) {
        message3.error(`\u5220\u9664\u5931\u8D25\uFF1A${error.message}`);
      } finally {
        setLoadingDelete(false);
      }
    };
    const renderActiveTaskPanel = () => {
      if (!activeTask) {
        return null;
      }
      const logs = Array.isArray(activeTask.logs) ? activeTask.logs.slice(-12) : [];
      const statusText = activeTask.status === "running" ? "\u8FD0\u884C\u4E2D" : activeTask.status === "success" ? "\u5DF2\u5B8C\u6210" : "\u5931\u8D25";
      return /* @__PURE__ */ React3.createElement(Card2, { size: "small", className: "jav-local-task-card", title: `\u540E\u53F0\u4EFB\u52A1\uFF1A${activeTask.type === "apply" ? "\u6267\u884C\u522E\u524A" : "\u751F\u6210\u9884\u89C8"}` }, /* @__PURE__ */ React3.createElement(Space3, { direction: "vertical", style: { width: "100%" }, size: 8 }, /* @__PURE__ */ React3.createElement(Space3, { wrap: true }, /* @__PURE__ */ React3.createElement(Tag2, { color: activeTask.status === "failed" ? "red" : activeTask.status === "success" ? "green" : "processing" }, statusText), /* @__PURE__ */ React3.createElement(Text3, { type: "secondary" }, activeTask.phase || "queued"), activeTask.total > 0 && /* @__PURE__ */ React3.createElement(Text3, { type: "secondary" }, activeTask.completed, "/", activeTask.total)), /* @__PURE__ */ React3.createElement(
        Progress2,
        {
          percent: activeTask.percent || 0,
          status: activeTask.status === "failed" ? "exception" : activeTask.status === "success" ? "success" : "active"
        }
      ), /* @__PURE__ */ React3.createElement(Text3, null, activeTask.message || "\u4EFB\u52A1\u6B63\u5728\u540E\u53F0\u8FD0\u884C"), logs.length > 0 && /* @__PURE__ */ React3.createElement("div", { className: "jav-local-task-log" }, logs.map((entry, index) => /* @__PURE__ */ React3.createElement("div", { key: `${entry.time || "log"}-${index}` }, /* @__PURE__ */ React3.createElement(Text3, { type: "secondary" }, entry.time ? entry.time.slice(11, 19) : "--:--:--"), /* @__PURE__ */ React3.createElement(Text3, null, entry.message))))));
    };
    const columns = [
      {
        title: "\u72B6\u6001",
        key: "status",
        width: 104,
        render: (_, item) => statusTag(item)
      },
      {
        title: "\u6587\u4EF6",
        dataIndex: "file_name",
        key: "file_name",
        render: (_, item) => /* @__PURE__ */ React3.createElement(Space3, { direction: "vertical", size: 0 }, /* @__PURE__ */ React3.createElement(Text3, { strong: true }, item.file_name), /* @__PURE__ */ React3.createElement(Text3, { type: "secondary", style: { fontSize: 12 } }, formatBytes(item.file_size)))
      },
      {
        title: "\u756A\u53F7",
        dataIndex: "code",
        key: "code",
        width: 120,
        render: (code) => code ? /* @__PURE__ */ React3.createElement(Tag2, { color: "blue" }, code) : /* @__PURE__ */ React3.createElement(Text3, { type: "secondary" }, "-")
      },
      {
        title: "\u522E\u524A\u6807\u9898",
        key: "title",
        render: (_, item) => /* @__PURE__ */ React3.createElement(Space3, { direction: "vertical", size: 0 }, /* @__PURE__ */ React3.createElement(Text3, { ellipsis: { tooltip: item.metadata?.title }, style: { maxWidth: 420 } }, item.metadata?.title || "-"), item.metadata?.date && /* @__PURE__ */ React3.createElement(Text3, { type: "secondary", style: { fontSize: 12 } }, item.metadata.date), genreTags(item.metadata?.genres))
      },
      {
        title: "\u76EE\u6807\u8DEF\u5F84",
        dataIndex: "target_video_path",
        key: "target_video_path",
        render: (path, item) => /* @__PURE__ */ React3.createElement(Space3, { direction: "vertical", size: 0 }, /* @__PURE__ */ React3.createElement(Text3, { copyable: true, ellipsis: { tooltip: path }, style: { maxWidth: 520 } }, path), item.already_scraped && /* @__PURE__ */ React3.createElement(Text3, { type: "secondary", style: { fontSize: 12 } }, "\u5DF2\u6709 NFO \u548C\u5C01\u9762"), item.target_exists && /* @__PURE__ */ React3.createElement(Text3, { type: "danger", style: { fontSize: 12 } }, "\u76EE\u6807\u6587\u4EF6\u5DF2\u5B58\u5728"))
      }
    ];
    return /* @__PURE__ */ React3.createElement("div", { className: "jav-local-scrape" }, /* @__PURE__ */ React3.createElement("div", { className: "jav-local-layout" }, /* @__PURE__ */ React3.createElement("section", { className: "jav-local-settings" }, /* @__PURE__ */ React3.createElement(
      Card2,
      {
        title: /* @__PURE__ */ React3.createElement(React3.Fragment, null, /* @__PURE__ */ React3.createElement(Icon2, { as: FolderOpenOutlined2 }), " \u672C\u5730\u522E\u524A"),
        size: "small",
        className: "jav-tool-card"
      },
      /* @__PURE__ */ React3.createElement(
        Form2,
        {
          form,
          layout: "vertical",
          initialValues: {
            recursive: true,
            scrape: true,
            organize: true,
            folderTemplate: "{code} {title}",
            namingTemplate: "{code} {title}",
            concurrent: 3,
            writeNfo: true,
            downloadImages: true,
            downloadSampleImages: false,
            downloadActorImages: false,
            downloadListThumbnail: false,
            overwriteExisting: false
          },
          onFinish: handlePreview
        },
        /* @__PURE__ */ React3.createElement("div", { className: "jav-local-template-panel" }, /* @__PURE__ */ React3.createElement(Form2.Item, { label: "\u4EFB\u52A1\u6A21\u677F" }, /* @__PURE__ */ React3.createElement(Space3.Compact, { block: true }, /* @__PURE__ */ React3.createElement(
          Select,
          {
            value: selectedTemplateId || void 0,
            placeholder: "\u9009\u62E9\u5DF2\u4FDD\u5B58\u7684\u522E\u524A\u4EFB\u52A1",
            options: taskTemplateOptions,
            onChange: handleTemplateSelect,
            notFoundContent: "\u6682\u65E0\u6A21\u677F"
          }
        ), /* @__PURE__ */ React3.createElement(
          Button3,
          {
            type: "primary",
            htmlType: "button",
            icon: /* @__PURE__ */ React3.createElement(Icon2, { as: PlayCircleOutlined2 }),
            disabled: !selectedTemplateId,
            loading: loadingPreview,
            onClick: handleRunTemplate
          },
          "\u8FD0\u884C"
        ), /* @__PURE__ */ React3.createElement(
          Popconfirm2,
          {
            title: "\u5220\u9664\u8FD9\u4E2A\u522E\u524A\u4EFB\u52A1\u6A21\u677F\uFF1F",
            okText: "\u5220\u9664",
            cancelText: "\u53D6\u6D88",
            disabled: !selectedTemplateId,
            onConfirm: handleDeleteTemplate
          },
          /* @__PURE__ */ React3.createElement(
            Button3,
            {
              danger: true,
              htmlType: "button",
              icon: /* @__PURE__ */ React3.createElement(Icon2, { as: DeleteOutlined2 }),
              disabled: !selectedTemplateId
            }
          )
        ))), /* @__PURE__ */ React3.createElement(Form2.Item, { label: "\u6A21\u677F\u540D\u79F0" }, /* @__PURE__ */ React3.createElement(Space3.Compact, { block: true }, /* @__PURE__ */ React3.createElement(
          Input3,
          {
            value: templateName,
            placeholder: "\u4F8B\u5982\uFF1A\u4E0B\u8F7D\u76EE\u5F55\u5165\u5E93",
            onChange: (event) => setTemplateName(event.target.value)
          }
        ), /* @__PURE__ */ React3.createElement(Button3, { htmlType: "button", icon: /* @__PURE__ */ React3.createElement(Icon2, { as: SaveOutlined }), onClick: handleSaveTemplate }, "\u4FDD\u5B58")))),
        /* @__PURE__ */ React3.createElement(
          Form2.Item,
          {
            name: "directory",
            label: "\u626B\u63CF\u76EE\u5F55",
            rules: [{ required: true, message: "\u8BF7\u8F93\u5165\u8981\u626B\u63CF\u7684\u76EE\u5F55\u8DEF\u5F84" }]
          },
          /* @__PURE__ */ React3.createElement(DirectoryInput, { placeholder: "Windows: D:\\\\Downloads\\\\JAV  /  Linux: /media/JAV \u6216 ~/Videos/JAV" })
        ),
        /* @__PURE__ */ React3.createElement(Form2.Item, { name: "targetDirectory", label: "\u6574\u7406\u76EE\u6807\u76EE\u5F55" }, /* @__PURE__ */ React3.createElement(DirectoryInput, { placeholder: "\u7559\u7A7A\u5219\u5728\u539F\u76EE\u5F55\u5185\u6574\u7406\uFF1B\u4E5F\u53EF\u8F93\u5165 /data/JAV \u6216 D:\\\\Media\\\\JAV" })),
        /* @__PURE__ */ React3.createElement(Form2.Item, { label: "\u6587\u4EF6\u5939\u6A21\u677F" }, /* @__PURE__ */ React3.createElement(Space3.Compact, { block: true }, /* @__PURE__ */ React3.createElement(Form2.Item, { name: "folderTemplate", noStyle: true }, /* @__PURE__ */ React3.createElement(Input3, { placeholder: "{code} {title} / {actor}/{year}/{title} / {studio}/{code} {title}" })), /* @__PURE__ */ React3.createElement(
          Button3,
          {
            htmlType: "button",
            icon: /* @__PURE__ */ React3.createElement(Icon2, { as: SettingOutlined }),
            onClick: () => openTemplateDesigner("folderTemplate")
          },
          "\u8BBE\u7F6E"
        ))),
        /* @__PURE__ */ React3.createElement(
          Form2.Item,
          {
            label: "\u6587\u4EF6\u547D\u540D\u6A21\u677F",
            required: true
          },
          /* @__PURE__ */ React3.createElement(Space3.Compact, { block: true }, /* @__PURE__ */ React3.createElement(
            Form2.Item,
            {
              name: "namingTemplate",
              noStyle: true,
              rules: [
                {
                  validator: (_, value) => String(value || "").trim() ? Promise.resolve() : Promise.reject(new Error("\u6587\u4EF6\u547D\u540D\u6A21\u677F\u4E0D\u80FD\u4E3A\u7A7A"))
                }
              ]
            },
            /* @__PURE__ */ React3.createElement(Input3, { placeholder: "{code} {title}" })
          ), /* @__PURE__ */ React3.createElement(
            Button3,
            {
              htmlType: "button",
              icon: /* @__PURE__ */ React3.createElement(Icon2, { as: SettingOutlined }),
              onClick: () => openTemplateDesigner("namingTemplate")
            },
            "\u8BBE\u7F6E"
          ))
        ),
        /* @__PURE__ */ React3.createElement(Space3, { wrap: true }, /* @__PURE__ */ React3.createElement(Form2.Item, { name: "recursive", valuePropName: "checked" }, /* @__PURE__ */ React3.createElement(Checkbox, null, "\u9012\u5F52\u626B\u63CF")), /* @__PURE__ */ React3.createElement(Form2.Item, { name: "scrape", valuePropName: "checked" }, /* @__PURE__ */ React3.createElement(Checkbox, null, "\u8054\u7F51\u522E\u524A")), /* @__PURE__ */ React3.createElement(Form2.Item, { name: "organize", valuePropName: "checked" }, /* @__PURE__ */ React3.createElement(Checkbox, null, "\u6574\u7406\u5230\u72EC\u7ACB\u76EE\u5F55")), /* @__PURE__ */ React3.createElement(Form2.Item, { name: "writeNfo", valuePropName: "checked" }, /* @__PURE__ */ React3.createElement(Checkbox, null, "\u5199\u5165 NFO")), /* @__PURE__ */ React3.createElement(Form2.Item, { name: "downloadImages", valuePropName: "checked" }, /* @__PURE__ */ React3.createElement(Checkbox, null, "\u4E0B\u8F7D\u5C01\u9762")), /* @__PURE__ */ React3.createElement(Form2.Item, { name: "downloadSampleImages", valuePropName: "checked" }, /* @__PURE__ */ React3.createElement(Checkbox, null, "\u4E0B\u8F7D\u6837\u54C1\u56FE")), /* @__PURE__ */ React3.createElement(Form2.Item, { name: "downloadActorImages", valuePropName: "checked" }, /* @__PURE__ */ React3.createElement(Checkbox, null, "\u4E0B\u8F7D\u6F14\u5458\u5934\u50CF")), /* @__PURE__ */ React3.createElement(Form2.Item, { name: "downloadListThumbnail", valuePropName: "checked" }, /* @__PURE__ */ React3.createElement(Checkbox, null, "\u4E0B\u8F7D\u5217\u8868\u7F29\u7565\u56FE"))),
        /* @__PURE__ */ React3.createElement(Space3, { align: "center", wrap: true }, /* @__PURE__ */ React3.createElement(Form2.Item, { name: "maxDepth", label: "\u6700\u5927\u6DF1\u5EA6" }, /* @__PURE__ */ React3.createElement(InputNumber2, { min: 0, placeholder: "\u4E0D\u9650" })), /* @__PURE__ */ React3.createElement(Form2.Item, { name: "concurrent", label: "\u522E\u524A\u5E76\u53D1" }, /* @__PURE__ */ React3.createElement(InputNumber2, { min: 1, max: 5 })), /* @__PURE__ */ React3.createElement(Form2.Item, { name: "overwriteExisting", label: "\u8986\u76D6\u51B2\u7A81", valuePropName: "checked" }, /* @__PURE__ */ React3.createElement(Switch2, null))),
        /* @__PURE__ */ React3.createElement(
          Button3,
          {
            type: "primary",
            htmlType: "submit",
            block: true,
            loading: loadingPreview,
            icon: /* @__PURE__ */ React3.createElement(Icon2, { as: FileSearchOutlined })
          },
          "\u626B\u63CF\u5E76\u751F\u6210\u9884\u89C8"
        )
      )
    ), /* @__PURE__ */ React3.createElement(
      Alert,
      {
        type: "info",
        showIcon: true,
        message: "\u6267\u884C\u524D\u4F1A\u5148\u751F\u6210\u9884\u89C8",
        description: "\u53EA\u6709\u70B9\u51FB\u786E\u8BA4\u6267\u884C\u540E\u624D\u4F1A\u79FB\u52A8\u6587\u4EF6\u3001\u5199\u5165 NFO \u6216\u4E0B\u8F7D\u56FE\u7247\u3002\u5EFA\u8BAE\u5148\u68C0\u67E5\u51B2\u7A81\u548C\u76EE\u6807\u8DEF\u5F84\u3002"
      }
    )), /* @__PURE__ */ React3.createElement("section", { className: "jav-local-results" }, /* @__PURE__ */ React3.createElement("div", { className: "jav-results-header" }, /* @__PURE__ */ React3.createElement("div", null, /* @__PURE__ */ React3.createElement(Title2, { level: 4, className: "jav-results-title" }, /* @__PURE__ */ React3.createElement("span", { className: "jav-section-icon" }, /* @__PURE__ */ React3.createElement(Icon2, { as: FileSearchOutlined })), "\u522E\u524A\u4EFB\u52A1"), /* @__PURE__ */ React3.createElement(Text3, { type: "secondary", className: "jav-results-subtitle" }, "\u626B\u63CF\u672C\u5730\u76EE\u5F55\uFF0C\u6309\u756A\u53F7\u522E\u524A\u5E76\u6574\u7406\u4E3A\u5A92\u4F53\u5E93\u7ED3\u6784\uFF0C\u5B8C\u6210\u540E\u81EA\u52A8\u5165\u5E93")), /* @__PURE__ */ React3.createElement(Space3, { wrap: true, align: "center" }, /* @__PURE__ */ React3.createElement(Space3, { size: 6 }, /* @__PURE__ */ React3.createElement(Text3, { type: "secondary" }, "\u663E\u793A\u4E0D\u7B26\u5408\u8981\u6C42"), /* @__PURE__ */ React3.createElement(
      Switch2,
      {
        size: "small",
        checked: showNonConforming,
        onChange: setShowNonConforming,
        disabled: !preview
      }
    ), preview && /* @__PURE__ */ React3.createElement(Tag2, null, nonConformingCount)), /* @__PURE__ */ React3.createElement(
      Button3,
      {
        disabled: !preview || nonConformingCount === 0,
        onClick: handleSelectNonConforming
      },
      "\u5168\u9009\u4E0D\u7B26\u5408\u8981\u6C42"
    ), /* @__PURE__ */ React3.createElement(
      Popconfirm2,
      {
        title: `\u786E\u8BA4\u5220\u9664 ${selectedDeleteItems.length} \u4E2A\u4E0D\u7B26\u5408\u8981\u6C42\u7684\u6587\u4EF6\uFF1F`,
        description: "\u6B64\u64CD\u4F5C\u4F1A\u4ECE\u672C\u5730\u6587\u4EF6\u7CFB\u7EDF\u5220\u9664\u9009\u4E2D\u7684\u6E90\u6587\u4EF6\u3002",
        okText: "\u5220\u9664",
        cancelText: "\u53D6\u6D88",
        disabled: selectedDeleteItems.length === 0 || loadingDelete,
        onConfirm: handleDeleteNonConforming
      },
      /* @__PURE__ */ React3.createElement(
        Button3,
        {
          danger: true,
          disabled: selectedDeleteItems.length === 0,
          loading: loadingDelete,
          icon: /* @__PURE__ */ React3.createElement(Icon2, { as: DeleteOutlined2 })
        },
        "\u5220\u9664\u9009\u4E2D"
      )
    ), /* @__PURE__ */ React3.createElement(
      Popconfirm2,
      {
        title: `\u786E\u8BA4\u6267\u884C ${selectedItems.length} \u4E2A\u6761\u76EE\u7684\u522E\u524A\u64CD\u4F5C\uFF1F`,
        description: "\u6B64\u64CD\u4F5C\u4F1A\u4FEE\u6539\u672C\u5730\u6587\u4EF6\u7CFB\u7EDF\u3002",
        okText: "\u786E\u8BA4\u6267\u884C",
        cancelText: "\u53D6\u6D88",
        disabled: selectedItems.length === 0 || loadingApply,
        onConfirm: handleApply
      },
      /* @__PURE__ */ React3.createElement(
        Button3,
        {
          type: "primary",
          disabled: selectedItems.length === 0,
          loading: loadingApply,
          icon: /* @__PURE__ */ React3.createElement(Icon2, { as: PlayCircleOutlined2 })
        },
        "\u6267\u884C\u9009\u4E2D\u9879"
      )
    ))), renderActiveTaskPanel(), preview && /* @__PURE__ */ React3.createElement("div", { className: "jav-kpi-grid jav-local-kpis" }, /* @__PURE__ */ React3.createElement("div", { className: "jav-kpi-card" }, /* @__PURE__ */ React3.createElement("span", { className: "jav-kpi-label" }, "\u89C6\u9891"), /* @__PURE__ */ React3.createElement("strong", null, preview.total_files), /* @__PURE__ */ React3.createElement("span", { className: "jav-kpi-note" }, "\u626B\u63CF\u7ED3\u679C")), /* @__PURE__ */ React3.createElement("div", { className: "jav-kpi-card" }, /* @__PURE__ */ React3.createElement("span", { className: "jav-kpi-label" }, "\u8BC6\u522B"), /* @__PURE__ */ React3.createElement("strong", null, preview.recognized_count), /* @__PURE__ */ React3.createElement("span", { className: "jav-kpi-note" }, "\u756A\u53F7\u5339\u914D")), /* @__PURE__ */ React3.createElement("div", { className: "jav-kpi-card" }, /* @__PURE__ */ React3.createElement("span", { className: "jav-kpi-label" }, "\u522E\u524A"), /* @__PURE__ */ React3.createElement("strong", null, preview.found_count), /* @__PURE__ */ React3.createElement("span", { className: "jav-kpi-note" }, "\u5143\u6570\u636E\u547D\u4E2D")), /* @__PURE__ */ React3.createElement("div", { className: "jav-kpi-card" }, /* @__PURE__ */ React3.createElement("span", { className: "jav-kpi-label" }, "\u51B2\u7A81"), /* @__PURE__ */ React3.createElement("strong", null, preview.conflict_count), /* @__PURE__ */ React3.createElement("span", { className: "jav-kpi-note" }, "\u76EE\u6807\u5DF2\u5B58\u5728"))), /* @__PURE__ */ React3.createElement(Divider, { className: "jav-section-divider" }), /* @__PURE__ */ React3.createElement(
      Table2,
      {
        rowKey: "source_path",
        size: "small",
        dataSource: items,
        columns,
        loading: loadingPreview,
        pagination: {
          pageSize: tablePageSize,
          showSizeChanger: true,
          onShowSizeChange: (_, size) => setTablePageSize(size),
          onChange: (_, size) => setTablePageSize(size)
        },
        rowSelection: {
          selectedRowKeys,
          onChange: setSelectedRowKeys,
          getCheckboxProps: (item) => ({
            disabled: isConformingLocalScrapeItem(item) ? item.target_duplicate || item.target_exists && !overwriteExisting : false
          })
        },
        locale: { emptyText: "\u8BF7\u8F93\u5165\u76EE\u5F55\u5E76\u751F\u6210\u9884\u89C8" }
      }
    ), applyResult && /* @__PURE__ */ React3.createElement(
      Alert,
      {
        style: { marginTop: 14 },
        type: applyResult.success ? "success" : "warning",
        showIcon: true,
        message: `\u6267\u884C\u7ED3\u679C\uFF1A\u6210\u529F ${applyResult.success_count}\uFF0C\u5931\u8D25 ${applyResult.failed_count}\uFF0C\u81EA\u52A8\u5165\u5E93 ${applyResult.library_recorded_count || 0}`,
        description: /* @__PURE__ */ React3.createElement(Space3, { direction: "vertical", size: 2 }, (applyResult.results || []).slice(0, 5).map((result) => /* @__PURE__ */ React3.createElement(Text3, { key: result.source_path, type: result.success ? "secondary" : "danger" }, result.success ? result.target_video_path : `${result.source_path}: ${result.error}`)))
      }
    ))), /* @__PURE__ */ React3.createElement(
      Drawer,
      {
        title: `${templateDesignerTitle}\u8BBE\u7F6E`,
        open: templateDesignerOpen,
        onClose: closeTemplateDesigner,
        width: 640,
        placement: "right",
        className: "jav-template-designer-drawer",
        extra: /* @__PURE__ */ React3.createElement(Space3, null, /* @__PURE__ */ React3.createElement(Button3, { htmlType: "button", onClick: resetTemplateDesigner }, "\u91CD\u7F6E"), /* @__PURE__ */ React3.createElement(Button3, { type: "primary", htmlType: "button", onClick: writeTemplateDesignerValue }, "\u5E94\u7528"))
      },
      /* @__PURE__ */ React3.createElement("div", { className: "jav-template-designer" }, /* @__PURE__ */ React3.createElement("section", null, /* @__PURE__ */ React3.createElement(Text3, { strong: true }, "\u53EF\u7528\u5361\u7247"), /* @__PURE__ */ React3.createElement("div", { className: "jav-template-card-grid" }, LOCAL_SCRAPE_NAMING_FIELDS.map((field) => /* @__PURE__ */ React3.createElement(
        "button",
        {
          type: "button",
          key: field.id,
          className: "jav-template-card",
          draggable: true,
          onDragStart: (event) => startPaletteDrag(event, { type: "field", id: field.id }),
          onClick: () => addTemplatePart({ type: "field", id: field.id })
        },
        /* @__PURE__ */ React3.createElement("span", null, field.label),
        /* @__PURE__ */ React3.createElement("small", null, field.sample)
      )))), /* @__PURE__ */ React3.createElement("section", null, /* @__PURE__ */ React3.createElement(Text3, { strong: true }, "\u5206\u9694\u7B26"), /* @__PURE__ */ React3.createElement("div", { className: "jav-template-separator-grid" }, LOCAL_SCRAPE_NAMING_SEPARATORS.map((separator) => /* @__PURE__ */ React3.createElement(
        "button",
        {
          type: "button",
          key: separator.id,
          className: "jav-template-card jav-template-separator-card",
          draggable: true,
          onDragStart: (event) => startPaletteDrag(event, { type: "separator", id: separator.id }),
          onClick: () => addTemplatePart({ type: "separator", id: separator.id })
        },
        /* @__PURE__ */ React3.createElement("span", null, separator.label),
        /* @__PURE__ */ React3.createElement("small", null, separator.value === " " ? "\u7A7A\u683C" : separator.value)
      )))), /* @__PURE__ */ React3.createElement("section", null, /* @__PURE__ */ React3.createElement(Text3, { strong: true }, "\u5F53\u524D\u6A21\u677F"), /* @__PURE__ */ React3.createElement(
        "div",
        {
          className: "jav-template-drop-zone",
          onDragOver: (event) => event.preventDefault(),
          onDrop: (event) => handleTemplateDrop(event)
        },
        templateDesignerParts.map((part, index) => /* @__PURE__ */ React3.createElement(
          "span",
          {
            key: `${part.type}-${part.id || part.value}-${index}`,
            className: `jav-template-selected-card ${part.type === "separator" ? "is-separator" : ""}`,
            draggable: true,
            onDragStart: (event) => startSelectedPartDrag(event, index),
            onDragOver: (event) => event.preventDefault(),
            onDrop: (event) => handleTemplateDrop(event, index)
          },
          /* @__PURE__ */ React3.createElement(Icon2, { as: DragOutlined }),
          renderTemplateDesignerPart(part),
          /* @__PURE__ */ React3.createElement("button", { type: "button", onClick: () => removeTemplatePart(index), "aria-label": "\u79FB\u9664\u5361\u7247" }, /* @__PURE__ */ React3.createElement(Icon2, { as: CloseOutlined }))
        ))
      )), /* @__PURE__ */ React3.createElement("section", null, /* @__PURE__ */ React3.createElement(Text3, { strong: true }, "\u751F\u6210\u7ED3\u679C"), /* @__PURE__ */ React3.createElement(Input3, { value: templateDesignerPreview, readOnly: true })), /* @__PURE__ */ React3.createElement(
        Alert,
        {
          type: "info",
          showIcon: true,
          message: "\u62D6\u62FD\u5361\u7247\u6216\u70B9\u51FB\u5361\u7247\u5373\u53EF\u52A0\u5165\u6A21\u677F\uFF1B\u6587\u4EF6\u5939\u6A21\u677F\u4E2D\u4F7F\u7528\u201C\u6587\u4EF6\u5939\u5C42\u7EA7\u201D\u5361\u7247\u4F1A\u751F\u6210\u591A\u7EA7\u76EE\u5F55\u3002"
        }
      ))
    ));
  }

  // frontend/src/components/LocalLibraryPage.jsx
  var React4 = window.React;
  var antd4 = window.antd;
  var icons4 = window.icons || {};
  var {
    Alert: Alert2,
    Button: Button4,
    Card: Card3,
    Checkbox: Checkbox2,
    Divider: Divider2,
    Drawer: Drawer2,
    Form: Form3,
    Input: Input4,
    InputNumber: InputNumber3,
    Popconfirm: Popconfirm3,
    Segmented,
    Slider,
    Space: Space4,
    Table: Table3,
    Tag: Tag3,
    Typography: Typography4,
    message: message4
  } = antd4;
  var { Text: Text4, Title: Title3 } = Typography4;
  var {
    ArrowLeftOutlined,
    AppstoreOutlined,
    DatabaseOutlined,
    DownloadOutlined: DownloadOutlined2,
    FilterOutlined,
    FolderOpenOutlined: FolderOpenOutlined3,
    PlayCircleOutlined: PlayCircleOutlined3,
    ReloadOutlined: ReloadOutlined2,
    SearchOutlined,
    UnorderedListOutlined
  } = icons4;
  var Icon3 = ({ as: Component }) => Component ? /* @__PURE__ */ React4.createElement(Component, null) : null;
  var postJson2 = async (url, body) => {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.message || `HTTP ${response.status}`);
    }
    return data;
  };
  var formatBytes2 = (bytes) => {
    if (!bytes) return "-";
    const units = ["B", "KB", "MB", "GB", "TB"];
    let value = bytes;
    let index = 0;
    while (value >= 1024 && index < units.length - 1) {
      value /= 1024;
      index += 1;
    }
    return `${value.toFixed(index === 0 ? 0 : 1)} ${units[index]}`;
  };
  var countedOptions = (records, getter) => {
    const counts = /* @__PURE__ */ new Map();
    records.forEach((record) => {
      const value = getter(record);
      const values = Array.isArray(value) ? value : [value];
      values.filter(Boolean).forEach((item) => {
        const key = String(item).trim();
        if (!key) return;
        counts.set(key, (counts.get(key) || 0) + 1);
      });
    });
    return Array.from(counts.entries()).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 80).map(([value, count]) => ({
      label: `${value} (${count})`,
      value
    }));
  };
  var matchesAny = (recordValues, selectedValues) => {
    if (!selectedValues || selectedValues.length === 0) {
      return true;
    }
    const values = Array.isArray(recordValues) ? recordValues : [recordValues].filter(Boolean);
    const normalized = new Set(values.map((value) => String(value)));
    return selectedValues.some((value) => normalized.has(String(value)));
  };
  var posterSource = (record) => {
    if (record?.poster_url) {
      return record.poster_url;
    }
    const coverUrl = record?.cover_url || record?.metadata?.cover_url || record?.img || "";
    return coverUrl ? `/api/image-proxy?url=${encodeURIComponent(coverUrl)}` : "";
  };
  var thumbnailSource = (record) => {
    const thumbnailUrl = record?.thumbnail_url || record?.metadata?.list_thumbnail_url || "";
    if (!thumbnailUrl) {
      return "";
    }
    return thumbnailUrl.startsWith("/api/") ? thumbnailUrl : `/api/image-proxy?url=${encodeURIComponent(thumbnailUrl)}`;
  };
  var actorName = (actor) => {
    if (actor && typeof actor === "object") {
      return String(actor.name || actor.title || actor.id || "").trim();
    }
    return String(actor || "").trim();
  };
  var normalizeActors = (record) => {
    const actorValues = [
      ...Array.isArray(record?.metadata?.raw?.stars) ? record.metadata.raw.stars : [],
      ...Array.isArray(record?.metadata?.actor_refs) ? record.metadata.actor_refs : [],
      ...Array.isArray(record?.stars) ? record.stars : []
    ];
    const actorsByName = /* @__PURE__ */ new Map();
    actorValues.forEach((actor) => {
      const name = actorName(actor);
      if (!name) {
        return;
      }
      const existing = actorsByName.get(name) || { name, avatar: "" };
      if (actor && typeof actor === "object" && !existing.avatar) {
        existing.avatar = actor.avatar || actor.img || actor.image || actor.thumbnail || "";
      }
      actorsByName.set(name, existing);
    });
    return Array.from(actorsByName.values());
  };
  var actorAvatarSource = (record, actor) => {
    if (actor?.avatar) {
      return actor.avatar.startsWith("/api/") ? actor.avatar : `/api/image-proxy?url=${encodeURIComponent(actor.avatar)}`;
    }
    if (!record?.movie_id || !actor?.name) {
      return "";
    }
    return `/api/movies/local-library/actor-avatar/${encodeURIComponent(record.movie_id)}/${encodeURIComponent(actor.name)}`;
  };
  var MoviePoster = ({ record, compact = false, width = null, variant = "poster", onRatio = null }) => {
    const [failed, setFailed] = React4.useState(false);
    const src = variant === "thumbnail" ? thumbnailSource(record) || posterSource(record) : posterSource(record);
    const style = width ? { width, height: compact ? Math.round(width * 1.5) : void 0 } : void 0;
    if (src && !failed) {
      return /* @__PURE__ */ React4.createElement("div", { className: `jav-library-poster ${compact ? "is-compact" : ""}`, style }, /* @__PURE__ */ React4.createElement(
        "img",
        {
          src,
          alt: record.title || record.movie_id,
          onError: () => setFailed(true),
          onLoad: (event) => {
            const { naturalWidth, naturalHeight } = event.currentTarget;
            if (onRatio && naturalWidth > 0 && naturalHeight > 0) {
              onRatio(naturalWidth / naturalHeight);
            }
          }
        }
      ));
    }
    return /* @__PURE__ */ React4.createElement("div", { className: `jav-library-poster is-placeholder ${compact ? "is-compact" : ""}`, style }, /* @__PURE__ */ React4.createElement("span", null, record.movie_id || "N/A"));
  };
  var ActorPill = ({ record, actor, onClick }) => {
    const [failed, setFailed] = React4.useState(false);
    const src = actorAvatarSource(record, actor);
    const initial = (actor.name || "?").slice(0, 1).toUpperCase();
    return /* @__PURE__ */ React4.createElement("button", { className: "jav-library-actor-pill", type: "button", onClick }, /* @__PURE__ */ React4.createElement("span", { className: "jav-library-actor-avatar" }, src && !failed ? /* @__PURE__ */ React4.createElement("img", { src, alt: actor.name, onError: () => setFailed(true) }) : /* @__PURE__ */ React4.createElement("span", null, initial)), /* @__PURE__ */ React4.createElement("span", { className: "jav-library-actor-name" }, actor.name));
  };
  function LocalLibraryPage() {
    const [form] = Form3.useForm();
    const [library, setLibrary] = React4.useState({ records: [], total_movies: 0, total_files: 0, total_size: 0 });
    const [scanResult, setScanResult] = React4.useState(null);
    const [informationCheck, setInformationCheck] = React4.useState(null);
    const [loading, setLoading] = React4.useState(false);
    const [scanning, setScanning] = React4.useState(false);
    const [checkingInformation, setCheckingInformation] = React4.useState(false);
    const [downloadingInformation, setDownloadingInformation] = React4.useState(false);
    const [filterOpen, setFilterOpen] = React4.useState(false);
    const [scanOpen, setScanOpen] = React4.useState(false);
    const [selectedRecord, setSelectedRecord] = React4.useState(null);
    const [playingRecordKey, setPlayingRecordKey] = React4.useState("");
    const [selectedPlayFileIndex, setSelectedPlayFileIndex] = React4.useState(0);
    const [posterAspectRatioMap, setPosterAspectRatioMap] = React4.useState({});
    const [viewMode, setViewMode] = React4.useState("list");
    const [listPosterSize, setListPosterSize] = React4.useState(56);
    const [gridPosterSize, setGridPosterSize] = React4.useState(156);
    const [filters, setFilters] = React4.useState({
      keyword: "",
      genres: [],
      stars: [],
      studios: [],
      publishers: [],
      series: [],
      years: [],
      roots: []
    });
    const records = library.records || [];
    const missingInformationByMovieId = React4.useMemo(() => {
      const entries = informationCheck?.records || [];
      return entries.reduce((map, record) => {
        if (record?.movie_id && !record.info_complete) {
          map[String(record.movie_id).toUpperCase()] = record;
        }
        return map;
      }, {});
    }, [informationCheck]);
    const filterOptions = React4.useMemo(() => ({
      genres: countedOptions(records, (record) => record.genres),
      stars: countedOptions(records, (record) => record.stars),
      studios: countedOptions(records, (record) => record.studio),
      publishers: countedOptions(records, (record) => record.publisher),
      series: countedOptions(records, (record) => record.series),
      years: countedOptions(records, (record) => String(record.date || "").slice(0, 4)),
      roots: countedOptions(records, (record) => record.scan_roots)
    }), [records]);
    const activeFilterCount = React4.useMemo(() => Object.entries(filters).reduce((count, [key, value]) => {
      if (key === "keyword") {
        return count + (String(value || "").trim() ? 1 : 0);
      }
      return count + (Array.isArray(value) ? value.length : 0);
    }, 0), [filters]);
    const filteredRecords = React4.useMemo(() => {
      const keyword = filters.keyword.trim().toLowerCase();
      return records.filter((record) => {
        if (keyword) {
          const text = `${record.movie_id || ""}
${record.title || ""}
${record.full_text || ""}`.toLowerCase();
          if (!text.includes(keyword)) {
            return false;
          }
        }
        return matchesAny(record.genres, filters.genres) && matchesAny(record.stars, filters.stars) && matchesAny(record.studio, filters.studios) && matchesAny(record.publisher, filters.publishers) && matchesAny(record.series, filters.series) && matchesAny(String(record.date || "").slice(0, 4), filters.years) && matchesAny(record.scan_roots, filters.roots);
      });
    }, [records, filters]);
    const clearFilters = () => setFilters({
      keyword: "",
      genres: [],
      stars: [],
      studios: [],
      publishers: [],
      series: [],
      years: [],
      roots: []
    });
    const loadLibrary = async () => {
      setLoading(true);
      try {
        const response = await fetch("/api/movies/local-library");
        const data = await response.json();
        if (!data.success) {
          throw new Error(data.message || "\u52A0\u8F7D\u5931\u8D25");
        }
        setLibrary(data);
      } catch (error) {
        message4.error(`\u5F71\u89C6\u5E93\u52A0\u8F7D\u5931\u8D25\uFF1A${error.message}`);
      } finally {
        setLoading(false);
      }
    };
    const loadInformationCheck = async () => {
      setCheckingInformation(true);
      try {
        const response = await fetch("/api/movies/local-library/information/check");
        const data = await response.json();
        if (!data.success) {
          throw new Error(data.message || "\u68C0\u67E5\u5931\u8D25");
        }
        setInformationCheck(data);
        if (data.incomplete_count > 0) {
          message4.warning(`\u53D1\u73B0 ${data.incomplete_count} \u90E8\u5F71\u7247\u7F3A\u5C11\u4FE1\u606F`);
        } else {
          message4.success("\u5F71\u89C6\u5E93\u4FE1\u606F\u5B8C\u6574");
        }
        return data;
      } catch (error) {
        message4.error(`\u4FE1\u606F\u68C0\u67E5\u5931\u8D25\uFF1A${error.message}`);
        return null;
      } finally {
        setCheckingInformation(false);
      }
    };
    React4.useEffect(() => {
      loadLibrary();
    }, []);
    const openRecordPreview = (record) => {
      setSelectedRecord(record);
      setPlayingRecordKey("");
      setSelectedPlayFileIndex(0);
      window.scrollTo({ top: 0, behavior: "smooth" });
    };
    const closeRecordPreview = () => {
      setSelectedRecord(null);
      setPlayingRecordKey("");
    };
    const handlePlaySelectedRecord = (fileIndex = 0) => {
      if (!selectedRecord?.movie_id) {
        return;
      }
      setSelectedPlayFileIndex(fileIndex);
      setPlayingRecordKey(`${selectedRecord.movie_id}:${fileIndex}`);
    };
    const handlePosterAspectRatio = (ratio) => {
      if (!selectedRecord?.movie_id || !Number.isFinite(ratio) || ratio <= 0) {
        return;
      }
      setPosterAspectRatioMap((current) => ({
        ...current,
        [selectedRecord.movie_id]: ratio
      }));
    };
    const handleScan = async (values) => {
      setScanning(true);
      setScanResult(null);
      try {
        const data = await postJson2("/api/movies/local-library/scan", {
          directory: values.directory,
          recursive: values.recursive !== false,
          max_depth: values.maxDepth ?? null,
          remove_missing: values.removeMissing !== false,
          scrape: values.scrape !== false,
          concurrent: values.concurrent || 3
        });
        setScanResult(data);
        await loadLibrary();
        setScanOpen(false);
        message4.success(`\u5F71\u89C6\u5E93\u5DF2\u66F4\u65B0\uFF1A${data.recognized_files}/${data.scanned_files} \u4E2A\u6587\u4EF6\u8BC6\u522B\u6210\u529F`);
      } catch (error) {
        message4.error(`\u5F71\u89C6\u5E93\u66F4\u65B0\u5931\u8D25\uFF1A${error.message}`);
      } finally {
        setScanning(false);
      }
    };
    const handleClear = async () => {
      setLoading(true);
      try {
        const response = await fetch("/api/movies/local-library", { method: "DELETE" });
        const data = await response.json();
        if (!data.success) {
          throw new Error(data.message || "\u6E05\u7A7A\u5931\u8D25");
        }
        setScanResult(null);
        await loadLibrary();
        message4.success("\u5F71\u89C6\u5E93\u5DF2\u6E05\u7A7A");
      } catch (error) {
        message4.error(`\u6E05\u7A7A\u5931\u8D25\uFF1A${error.message}`);
      } finally {
        setLoading(false);
      }
    };
    const handleDownloadMissingInformation = async () => {
      setDownloadingInformation(true);
      try {
        const data = await postJson2("/api/movies/local-library/information/download", {
          only_missing: true,
          concurrent: 3
        });
        setInformationCheck(data.information_check);
        await loadLibrary();
        message4.success(`\u5DF2\u66F4\u65B0 ${data.updated_count || 0} \u90E8\u5F71\u7247\u4FE1\u606F`);
      } catch (error) {
        message4.error(`\u4E0B\u8F7D\u7F3A\u5931\u4FE1\u606F\u5931\u8D25\uFF1A${error.message}`);
      } finally {
        setDownloadingInformation(false);
      }
    };
    const filterBlock = (title, key) => {
      const options = filterOptions[key] || [];
      const selected = filters[key] || [];
      return /* @__PURE__ */ React4.createElement("div", { className: "jav-library-filter-block" }, /* @__PURE__ */ React4.createElement("div", { className: "jav-library-filter-block-title" }, /* @__PURE__ */ React4.createElement(Text4, { strong: true }, title), selected.length > 0 && /* @__PURE__ */ React4.createElement(
        Button4,
        {
          type: "link",
          size: "small",
          onClick: () => setFilters((prev) => ({ ...prev, [key]: [] }))
        },
        "\u6E05\u9664"
      )), options.length ? /* @__PURE__ */ React4.createElement(
        Checkbox2.Group,
        {
          options,
          value: selected,
          onChange: (next) => setFilters((prev) => ({ ...prev, [key]: next }))
        }
      ) : /* @__PURE__ */ React4.createElement(Text4, { type: "secondary" }, "\u6682\u65E0\u53EF\u9009\u9879"));
    };
    const activeFilterTags = () => {
      const labels = {
        genres: "\u6807\u7B7E",
        stars: "\u6F14\u5458",
        studios: "\u5236\u4F5C\u5546",
        publishers: "\u53D1\u884C\u5546",
        series: "\u7CFB\u5217",
        years: "\u5E74\u4EFD",
        roots: "\u76EE\u5F55"
      };
      return Object.entries(labels).flatMap(([key, label]) => (filters[key] || []).map((value) => /* @__PURE__ */ React4.createElement(
        Tag3,
        {
          key: `${key}:${value}`,
          closable: true,
          onClose: () => setFilters((prev) => ({
            ...prev,
            [key]: (prev[key] || []).filter((item) => item !== value)
          }))
        },
        label,
        ": ",
        value
      )));
    };
    const handleFilterTagClick = (filterKey, value, event) => {
      event?.stopPropagation?.();
      if (!filterKey || !value) {
        return;
      }
      setFilters({
        keyword: "",
        genres: filterKey === "genres" ? [value] : [],
        stars: filterKey === "stars" ? [value] : [],
        studios: [],
        publishers: [],
        series: [],
        years: [],
        roots: []
      });
      setSelectedRecord(null);
      setPlayingRecordKey("");
      window.scrollTo({ top: 0, behavior: "smooth" });
    };
    const renderFilterTag = (filterKey, value, color) => /* @__PURE__ */ React4.createElement(
      Tag3,
      {
        color,
        key: value,
        className: "jav-library-filter-tag",
        onClick: (event) => handleFilterTagClick(filterKey, value, event)
      },
      value
    );
    const renderTagList = (items, color, filterKey = null) => {
      const values = Array.isArray(items) ? items.filter(Boolean) : [items].filter(Boolean);
      if (!values.length) {
        return /* @__PURE__ */ React4.createElement(Text4, { type: "secondary" }, "-");
      }
      return /* @__PURE__ */ React4.createElement(Space4, { size: 4, wrap: true }, values.map((value) => filterKey ? renderFilterTag(filterKey, value, color) : /* @__PURE__ */ React4.createElement(Tag3, { color, key: value }, value)));
    };
    const renderActorList = (record, variant = "compact") => {
      const actors = normalizeActors(record);
      if (!actors.length) {
        return /* @__PURE__ */ React4.createElement(Text4, { type: "secondary" }, "-");
      }
      const className = variant === "cast" ? "jav-library-actor-list is-cast" : "jav-library-actor-list";
      return /* @__PURE__ */ React4.createElement("div", { className }, actors.map((actor) => /* @__PURE__ */ React4.createElement(
        ActorPill,
        {
          key: actor.name,
          record,
          actor,
          onClick: (event) => handleFilterTagClick("stars", actor.name, event)
        }
      )));
    };
    const renderRecordPreview = () => {
      if (!selectedRecord) {
        return null;
      }
      const detailRows = [
        ["\u756A\u53F7", selectedRecord.movie_id],
        ["\u53D1\u5E03\u65E5\u671F", selectedRecord.date],
        ["\u5236\u4F5C\u5546", selectedRecord.studio],
        ["\u53D1\u884C\u5546", selectedRecord.publisher],
        ["\u5BFC\u6F14", selectedRecord.director],
        ["\u7CFB\u5217", selectedRecord.series],
        ["\u522E\u524A\u72B6\u6001", selectedRecord.scrape_status],
        ["\u9996\u6B21\u5165\u5E93", selectedRecord.first_seen_at],
        ["\u6700\u8FD1\u66F4\u65B0", selectedRecord.updated_at],
        ["\u6587\u4EF6\u6570\u91CF", `${selectedRecord.file_count || 0} \u4E2A\u6587\u4EF6`],
        ["\u603B\u5BB9\u91CF", formatBytes2(selectedRecord.total_size)]
      ].filter(([, value]) => value);
      const hasPlayableFile = (selectedRecord.files || []).length > 0;
      const videoSrc = `/api/movies/local-library/${encodeURIComponent(selectedRecord.movie_id)}/play?file_index=${selectedPlayFileIndex}`;
      const isPlayingSelectedRecord = playingRecordKey === `${selectedRecord.movie_id}:${selectedPlayFileIndex}`;
      const posterAspectRatio = posterAspectRatioMap[selectedRecord.movie_id] || null;
      const previewRatioClass = posterAspectRatio > 1.08 ? "is-landscape" : posterAspectRatio && posterAspectRatio < 0.82 ? "is-portrait" : "is-balanced";
      const previewStyle = posterAspectRatio ? { "--jav-library-preview-poster-ratio": posterAspectRatio } : void 0;
      return /* @__PURE__ */ React4.createElement("div", { className: `jav-library-preview ${previewRatioClass}`, style: previewStyle }, /* @__PURE__ */ React4.createElement("aside", { className: "jav-library-preview-poster" }, /* @__PURE__ */ React4.createElement(MoviePoster, { record: selectedRecord, onRatio: handlePosterAspectRatio }), /* @__PURE__ */ React4.createElement("div", { className: "jav-library-preview-poster-extras" }, /* @__PURE__ */ React4.createElement("div", { className: "jav-library-preview-section" }, /* @__PURE__ */ React4.createElement(Text4, { strong: true }, "\u6F14\u5458"), renderActorList(selectedRecord)), /* @__PURE__ */ React4.createElement("div", { className: "jav-library-preview-section" }, /* @__PURE__ */ React4.createElement(Text4, { strong: true }, "\u6807\u7B7E"), renderTagList(selectedRecord.genres, "cyan", "genres")))), /* @__PURE__ */ React4.createElement("section", { className: "jav-library-preview-details" }, /* @__PURE__ */ React4.createElement("div", { className: "jav-library-preview-header" }, /* @__PURE__ */ React4.createElement(Button4, { icon: /* @__PURE__ */ React4.createElement(Icon3, { as: ArrowLeftOutlined }), onClick: closeRecordPreview }, "\u8FD4\u56DE\u5F71\u7247\u5E93"), /* @__PURE__ */ React4.createElement(Space4, null, /* @__PURE__ */ React4.createElement(
        Button4,
        {
          type: "primary",
          icon: /* @__PURE__ */ React4.createElement(Icon3, { as: PlayCircleOutlined3 }),
          disabled: !hasPlayableFile,
          onClick: () => handlePlaySelectedRecord(0)
        },
        "\u64AD\u653E\u5F71\u7247"
      ), /* @__PURE__ */ React4.createElement(Tag3, { color: "blue" }, selectedRecord.movie_id))), /* @__PURE__ */ React4.createElement("div", null, /* @__PURE__ */ React4.createElement(Title3, { level: 3, className: "jav-library-preview-title" }, selectedRecord.title || selectedRecord.movie_id), selectedRecord.scrape_error && /* @__PURE__ */ React4.createElement(
        Alert2,
        {
          type: "warning",
          showIcon: true,
          message: "\u522E\u524A\u5F02\u5E38",
          description: selectedRecord.scrape_error
        }
      )), /* @__PURE__ */ React4.createElement("div", { className: "jav-library-preview-section jav-library-preview-cast" }, /* @__PURE__ */ React4.createElement(Text4, { strong: true }, "\u6F14\u5458\u9635\u5BB9"), renderActorList(selectedRecord, "cast")), isPlayingSelectedRecord && /* @__PURE__ */ React4.createElement("video", { controls: true, className: "jav-library-preview-player", src: videoSrc }, "\u60A8\u7684\u6D4F\u89C8\u5668\u4E0D\u652F\u6301\u89C6\u9891\u64AD\u653E\u3002"), /* @__PURE__ */ React4.createElement("div", { className: "jav-library-preview-meta" }, detailRows.map(([label, value]) => /* @__PURE__ */ React4.createElement("div", { className: "jav-library-preview-meta-row", key: label }, /* @__PURE__ */ React4.createElement("span", null, label), /* @__PURE__ */ React4.createElement("strong", null, value)))), /* @__PURE__ */ React4.createElement("div", { className: "jav-library-preview-section" }, /* @__PURE__ */ React4.createElement(Text4, { strong: true }, "\u626B\u63CF\u76EE\u5F55"), renderTagList(selectedRecord.scan_roots, "geekblue")), selectedRecord.full_text && /* @__PURE__ */ React4.createElement("div", { className: "jav-library-preview-section" }, /* @__PURE__ */ React4.createElement(Text4, { strong: true }, "\u5168\u6587\u4FE1\u606F"), /* @__PURE__ */ React4.createElement(Text4, { className: "jav-library-preview-full-text" }, selectedRecord.full_text)), /* @__PURE__ */ React4.createElement("div", { className: "jav-library-preview-section" }, /* @__PURE__ */ React4.createElement(Text4, { strong: true }, "\u672C\u5730\u6587\u4EF6"), /* @__PURE__ */ React4.createElement("div", { className: "jav-library-preview-files" }, (selectedRecord.files || []).map((file, fileIndex) => /* @__PURE__ */ React4.createElement("div", { className: "jav-library-preview-file", key: file.path }, /* @__PURE__ */ React4.createElement("div", { className: "jav-library-preview-file-title" }, /* @__PURE__ */ React4.createElement(Text4, { strong: true, ellipsis: { tooltip: file.path } }, file.file_name || file.path), /* @__PURE__ */ React4.createElement(
        Button4,
        {
          size: "small",
          icon: /* @__PURE__ */ React4.createElement(Icon3, { as: PlayCircleOutlined3 }),
          onClick: () => handlePlaySelectedRecord(fileIndex)
        },
        "\u64AD\u653E"
      )), /* @__PURE__ */ React4.createElement(Text4, { type: "secondary", ellipsis: { tooltip: file.path } }, formatBytes2(file.size), " \xB7 ", file.path)))))));
    };
    const columns = [
      {
        title: "\u5C01\u9762",
        key: "poster",
        width: listPosterSize + 30,
        render: (_, record) => /* @__PURE__ */ React4.createElement(MoviePoster, { record, compact: true, width: listPosterSize, variant: "thumbnail" })
      },
      {
        title: "\u756A\u53F7",
        dataIndex: "movie_id",
        key: "movie_id",
        width: 140,
        render: (value, record) => /* @__PURE__ */ React4.createElement(Space4, { direction: "vertical", size: 2 }, /* @__PURE__ */ React4.createElement(Tag3, { color: "blue" }, value), record.scrape_status === "found" && /* @__PURE__ */ React4.createElement(Tag3, { color: "green" }, "\u5DF2\u522E\u524A"), record.scrape_status === "failed" && /* @__PURE__ */ React4.createElement(Tag3, { color: "red" }, "\u522E\u524A\u5931\u8D25"), missingInformationByMovieId[String(value || "").toUpperCase()] && /* @__PURE__ */ React4.createElement(Tag3, { color: "orange" }, "\u7F3A\u4FE1\u606F"))
      },
      {
        title: "\u5F71\u7247\u4FE1\u606F",
        key: "info",
        render: (_, record) => /* @__PURE__ */ React4.createElement(Space4, { direction: "vertical", size: 4 }, /* @__PURE__ */ React4.createElement(Text4, { strong: true, ellipsis: { tooltip: record.title }, style: { maxWidth: 620 } }, record.title || record.movie_id), /* @__PURE__ */ React4.createElement(Space4, { size: 4, wrap: true }, record.date && /* @__PURE__ */ React4.createElement(Text4, { type: "secondary" }, record.date), record.studio && /* @__PURE__ */ React4.createElement(Tag3, null, record.studio), record.publisher && /* @__PURE__ */ React4.createElement(Tag3, null, record.publisher), record.series && /* @__PURE__ */ React4.createElement(Tag3, { color: "purple" }, record.series)), /* @__PURE__ */ React4.createElement(Space4, { size: 4, wrap: true }, (record.genres || []).slice(0, 8).map((genre) => renderFilterTag("genres", genre, "cyan")), (record.genres || []).length > 8 && /* @__PURE__ */ React4.createElement(Tag3, null, "+", record.genres.length - 8)), /* @__PURE__ */ React4.createElement(Space4, { size: 4, wrap: true }, (record.stars || []).slice(0, 6).map((star) => renderFilterTag("stars", star, "magenta")), (record.stars || []).length > 6 && /* @__PURE__ */ React4.createElement(Tag3, null, "+", record.stars.length - 6)))
      },
      {
        title: "\u6587\u4EF6",
        key: "files",
        width: 340,
        render: (_, record) => /* @__PURE__ */ React4.createElement(Space4, { direction: "vertical", size: 2 }, /* @__PURE__ */ React4.createElement(Text4, null, record.file_count || 0, " \u4E2A\u6587\u4EF6 \xB7 ", formatBytes2(record.total_size)), (record.files || []).slice(0, 3).map((file) => /* @__PURE__ */ React4.createElement(Text4, { key: file.path, type: "secondary", ellipsis: { tooltip: file.path }, style: { maxWidth: 320 } }, file.file_name)), (record.files || []).length > 3 && /* @__PURE__ */ React4.createElement(Text4, { type: "secondary" }, "+", record.files.length - 3, " \u4E2A\u6587\u4EF6"))
      }
    ];
    if (selectedRecord) {
      const previewBackdropSource = posterSource(selectedRecord) || thumbnailSource(selectedRecord);
      const previewBackdropStyle = previewBackdropSource ? { "--jav-library-preview-backdrop": `url("${previewBackdropSource.replace(/"/g, '\\"')}")` } : void 0;
      return /* @__PURE__ */ React4.createElement("div", { className: "jav-local-scrape jav-library-page is-previewing" }, /* @__PURE__ */ React4.createElement(
        "div",
        {
          className: "jav-library-preview-backdrop",
          style: previewBackdropStyle,
          onClick: closeRecordPreview
        },
        /* @__PURE__ */ React4.createElement(
          "section",
          {
            className: "jav-local-results jav-library-results jav-library-preview-surface",
            role: "dialog",
            "aria-modal": "true",
            "aria-label": "\u5F71\u7247\u6C89\u6D78\u5F0F\u9884\u89C8",
            onClick: (event) => event.stopPropagation()
          },
          renderRecordPreview()
        )
      ));
    }
    return /* @__PURE__ */ React4.createElement("div", { className: "jav-local-scrape jav-library-page" }, /* @__PURE__ */ React4.createElement("div", { className: "jav-library-layout" }, /* @__PURE__ */ React4.createElement("section", { className: "jav-local-results jav-library-results" }, /* @__PURE__ */ React4.createElement("div", { className: "jav-results-header" }, /* @__PURE__ */ React4.createElement("div", null, /* @__PURE__ */ React4.createElement(Title3, { level: 4, className: "jav-results-title" }, /* @__PURE__ */ React4.createElement("span", { className: "jav-section-icon" }, /* @__PURE__ */ React4.createElement(Icon3, { as: DatabaseOutlined })), "\u5F71\u89C6\u5E93"), /* @__PURE__ */ React4.createElement(Text4, { type: "secondary", className: "jav-results-subtitle" }, "\u4ECE\u672C\u5730\u6587\u4EF6\u5939\u5EFA\u7ACB\u5F71\u7247\u6570\u636E\u5E93\uFF0C\u5E76\u7528\u522E\u524A\u5168\u6587\u4FE1\u606F\u652F\u6301\u7B5B\u9009\u4E0E\u53BB\u91CD\u4E0B\u8F7D"))), /* @__PURE__ */ React4.createElement("div", { className: "jav-library-toolbar" }, /* @__PURE__ */ React4.createElement(
      Input4,
      {
        allowClear: true,
        prefix: /* @__PURE__ */ React4.createElement(Icon3, { as: SearchOutlined }),
        placeholder: "\u641C\u7D22\u756A\u53F7\u3001\u6807\u9898\u3001\u6F14\u5458\u3001\u6807\u7B7E",
        value: filters.keyword,
        onChange: (event) => setFilters((prev) => ({ ...prev, keyword: event.target.value }))
      }
    ), /* @__PURE__ */ React4.createElement(
      Segmented,
      {
        value: viewMode,
        onChange: setViewMode,
        options: [
          { label: /* @__PURE__ */ React4.createElement("span", null, /* @__PURE__ */ React4.createElement(Icon3, { as: UnorderedListOutlined }), " \u5217\u8868"), value: "list" },
          { label: /* @__PURE__ */ React4.createElement("span", null, /* @__PURE__ */ React4.createElement(Icon3, { as: AppstoreOutlined }), " \u5361\u7247"), value: "grid" }
        ]
      }
    ), /* @__PURE__ */ React4.createElement("div", { className: "jav-library-size-control" }, /* @__PURE__ */ React4.createElement(Text4, { type: "secondary" }, "\u5927\u5C0F"), /* @__PURE__ */ React4.createElement(
      Slider,
      {
        min: viewMode === "grid" ? 120 : 44,
        max: viewMode === "grid" ? 240 : 96,
        step: 4,
        value: viewMode === "grid" ? gridPosterSize : listPosterSize,
        onChange: viewMode === "grid" ? setGridPosterSize : setListPosterSize,
        tooltip: { formatter: (value) => `${value}px` }
      }
    )), /* @__PURE__ */ React4.createElement(Button4, { icon: /* @__PURE__ */ React4.createElement(Icon3, { as: FolderOpenOutlined3 }), onClick: () => setScanOpen(true) }, "\u626B\u63CF\u5165\u5E93"), /* @__PURE__ */ React4.createElement(Button4, { icon: /* @__PURE__ */ React4.createElement(Icon3, { as: FilterOutlined }), onClick: () => setFilterOpen(true) }, "\u7B5B\u9009", activeFilterCount ? ` (${activeFilterCount})` : ""), /* @__PURE__ */ React4.createElement(Button4, { icon: /* @__PURE__ */ React4.createElement(Icon3, { as: SearchOutlined }), onClick: loadInformationCheck, loading: checkingInformation }, "\u68C0\u67E5\u4FE1\u606F"), /* @__PURE__ */ React4.createElement(
      Button4,
      {
        type: "primary",
        ghost: true,
        icon: /* @__PURE__ */ React4.createElement(Icon3, { as: DownloadOutlined2 }),
        onClick: handleDownloadMissingInformation,
        loading: downloadingInformation,
        disabled: informationCheck && informationCheck.incomplete_count === 0
      },
      "\u4E0B\u8F7D\u7F3A\u5931\u4FE1\u606F"
    ), /* @__PURE__ */ React4.createElement(Button4, { icon: /* @__PURE__ */ React4.createElement(Icon3, { as: ReloadOutlined2 }), onClick: loadLibrary, loading }, "\u5237\u65B0"), /* @__PURE__ */ React4.createElement(Popconfirm3, { title: "\u786E\u8BA4\u6E05\u7A7A\u5F71\u89C6\u5E93\u6570\u636E\u5E93\uFF1F", onConfirm: handleClear, okText: "\u6E05\u7A7A", cancelText: "\u53D6\u6D88" }, /* @__PURE__ */ React4.createElement(Button4, { danger: true, loading }, "\u6E05\u7A7A"))), activeFilterCount > 0 && /* @__PURE__ */ React4.createElement("div", { className: "jav-library-active-filters" }, filters.keyword.trim() && /* @__PURE__ */ React4.createElement(
      Tag3,
      {
        closable: true,
        onClose: () => setFilters((prev) => ({ ...prev, keyword: "" }))
      },
      "\u641C\u7D22: ",
      filters.keyword.trim()
    ), activeFilterTags(), /* @__PURE__ */ React4.createElement(Button4, { size: "small", type: "link", onClick: clearFilters }, "\u6E05\u9664\u5168\u90E8")), /* @__PURE__ */ React4.createElement("div", { className: "jav-kpi-grid jav-local-kpis" }, /* @__PURE__ */ React4.createElement("div", { className: "jav-kpi-card" }, /* @__PURE__ */ React4.createElement("span", { className: "jav-kpi-label" }, "\u5F71\u7247"), /* @__PURE__ */ React4.createElement("strong", null, library.total_movies || 0), /* @__PURE__ */ React4.createElement("span", { className: "jav-kpi-note" }, "\u6570\u636E\u5E93\u8BB0\u5F55")), /* @__PURE__ */ React4.createElement("div", { className: "jav-kpi-card" }, /* @__PURE__ */ React4.createElement("span", { className: "jav-kpi-label" }, "\u6587\u4EF6"), /* @__PURE__ */ React4.createElement("strong", null, library.total_files || 0), /* @__PURE__ */ React4.createElement("span", { className: "jav-kpi-note" }, "\u672C\u5730\u89C6\u9891")), /* @__PURE__ */ React4.createElement("div", { className: "jav-kpi-card" }, /* @__PURE__ */ React4.createElement("span", { className: "jav-kpi-label" }, "\u5BB9\u91CF"), /* @__PURE__ */ React4.createElement("strong", null, formatBytes2(library.total_size)), /* @__PURE__ */ React4.createElement("span", { className: "jav-kpi-note" }, "\u603B\u5927\u5C0F")), /* @__PURE__ */ React4.createElement("div", { className: "jav-kpi-card" }, /* @__PURE__ */ React4.createElement("span", { className: "jav-kpi-label" }, "\u7B5B\u9009"), /* @__PURE__ */ React4.createElement("strong", null, filteredRecords.length), /* @__PURE__ */ React4.createElement("span", { className: "jav-kpi-note" }, "\u5F53\u524D\u7ED3\u679C")), /* @__PURE__ */ React4.createElement("div", { className: "jav-kpi-card" }, /* @__PURE__ */ React4.createElement("span", { className: "jav-kpi-label" }, "\u4FE1\u606F"), /* @__PURE__ */ React4.createElement("strong", null, informationCheck ? informationCheck.incomplete_count : "-"), /* @__PURE__ */ React4.createElement("span", { className: "jav-kpi-note" }, "\u7F3A\u5931\u5F71\u7247"))), informationCheck && /* @__PURE__ */ React4.createElement(
      Alert2,
      {
        style: { marginTop: 14 },
        type: informationCheck.incomplete_count > 0 ? "warning" : "success",
        showIcon: true,
        message: `\u4FE1\u606F\u68C0\u67E5\uFF1A\u5B8C\u6574 ${informationCheck.complete_count || 0} / ${informationCheck.total_movies || 0}`,
        description: informationCheck.incomplete_count > 0 ? `\u7F3A\u5931 ${informationCheck.incomplete_count} \u90E8\uFF0C\u70B9\u51FB\u201C\u4E0B\u8F7D\u7F3A\u5931\u4FE1\u606F\u201D\u4F1A\u53EA\u8865\u5168\u8FD9\u4E9B\u5F71\u7247\u3002` : "\u5F53\u524D\u5DF2\u5165\u5E93\u5F71\u7247\u4FE1\u606F\u5B8C\u6574\u3002"
      }
    ), scanResult && /* @__PURE__ */ React4.createElement(
      Alert2,
      {
        style: { marginTop: 14 },
        type: scanResult.success ? "success" : "warning",
        showIcon: true,
        message: `\u626B\u63CF\u5B8C\u6210\uFF1A\u8BC6\u522B ${scanResult.recognized_files || 0}/${scanResult.scanned_files || 0} \u4E2A\u6587\u4EF6`,
        description: `\u65B0\u589E ${scanResult.new_movie_count || 0}\uFF0C\u66F4\u65B0 ${scanResult.updated_movie_count || 0}\uFF0C\u522E\u524A ${scanResult.scraped_movie_count || 0} \u4E2A\u756A\u53F7\u3002`
      }
    ), /* @__PURE__ */ React4.createElement(Divider2, { className: "jav-section-divider" }), viewMode === "grid" ? filteredRecords.length ? /* @__PURE__ */ React4.createElement(
      "div",
      {
        className: "jav-library-poster-grid",
        style: { "--jav-library-card-min": `${gridPosterSize}px` }
      },
      filteredRecords.map((record) => /* @__PURE__ */ React4.createElement(
        Card3,
        {
          key: record.movie_id,
          hoverable: true,
          className: "jav-library-poster-card",
          cover: /* @__PURE__ */ React4.createElement(MoviePoster, { record, variant: "thumbnail" }),
          onClick: () => openRecordPreview(record)
        },
        /* @__PURE__ */ React4.createElement(Text4, { strong: true, ellipsis: { tooltip: record.title }, className: "jav-library-poster-title" }, record.title || record.movie_id),
        /* @__PURE__ */ React4.createElement("div", { className: "jav-library-poster-meta" }, /* @__PURE__ */ React4.createElement(Tag3, { color: "blue" }, record.movie_id), record.date && /* @__PURE__ */ React4.createElement(Text4, { type: "secondary" }, String(record.date).slice(0, 4))),
        /* @__PURE__ */ React4.createElement("div", { className: "jav-library-poster-tags" }, (record.stars || []).slice(0, 2).map((star) => renderFilterTag("stars", star, "magenta")), (record.genres || []).slice(0, 2).map((genre) => renderFilterTag("genres", genre, "cyan")))
      ))
    ) : /* @__PURE__ */ React4.createElement("div", { className: "jav-state-panel jav-library-empty-state" }, /* @__PURE__ */ React4.createElement(Text4, { type: "secondary" }, "\u6682\u65E0\u5F71\u89C6\u5E93\u8BB0\u5F55\uFF0C\u8BF7\u5148\u626B\u63CF\u76EE\u5F55")) : /* @__PURE__ */ React4.createElement(
      Table3,
      {
        rowKey: "movie_id",
        size: "small",
        dataSource: filteredRecords,
        columns,
        loading,
        pagination: { pageSize: 12, showSizeChanger: true },
        onRow: (record) => ({
          onClick: () => openRecordPreview(record)
        }),
        locale: { emptyText: "\u6682\u65E0\u5F71\u89C6\u5E93\u8BB0\u5F55\uFF0C\u8BF7\u5148\u626B\u63CF\u76EE\u5F55" }
      }
    ), /* @__PURE__ */ React4.createElement(
      Drawer2,
      {
        title: "\u626B\u63CF\u5165\u5E93",
        placement: "right",
        width: 420,
        open: scanOpen,
        onClose: () => setScanOpen(false)
      },
      /* @__PURE__ */ React4.createElement("div", { className: "jav-library-filter-help" }, /* @__PURE__ */ React4.createElement(Text4, { type: "secondary" }, "\u626B\u63CF\u662F\u4F4E\u9891\u7EF4\u62A4\u64CD\u4F5C\u3002\u9009\u62E9\u672C\u5730\u76EE\u5F55\u540E\uFF0C\u7CFB\u7EDF\u4F1A\u8BC6\u522B\u756A\u53F7\u3001\u53EF\u9009\u8054\u7F51\u522E\u524A\uFF0C\u5E76\u66F4\u65B0\u5F71\u89C6\u5E93\u6570\u636E\u5E93\u3002")),
      /* @__PURE__ */ React4.createElement(
        Form3,
        {
          form,
          layout: "vertical",
          initialValues: {
            recursive: true,
            removeMissing: true,
            scrape: true,
            concurrent: 3
          },
          onFinish: handleScan
        },
        /* @__PURE__ */ React4.createElement(Form3.Item, { name: "directory", label: "\u626B\u63CF\u76EE\u5F55", rules: [{ required: true, message: "\u8BF7\u8F93\u5165\u5F71\u89C6\u5E93\u76EE\u5F55" }] }, /* @__PURE__ */ React4.createElement(DirectoryInput, { placeholder: "Windows: D:\\\\Media\\\\JAV  /  Linux: /media/JAV \u6216 ~/Videos/JAV" })),
        /* @__PURE__ */ React4.createElement("div", { className: "jav-library-scan-options" }, /* @__PURE__ */ React4.createElement(Form3.Item, { name: "recursive", valuePropName: "checked" }, /* @__PURE__ */ React4.createElement(Checkbox2, null, "\u9012\u5F52\u626B\u63CF")), /* @__PURE__ */ React4.createElement(Form3.Item, { name: "removeMissing", valuePropName: "checked" }, /* @__PURE__ */ React4.createElement(Checkbox2, null, "\u540C\u6B65\u79FB\u9664\u5931\u6548\u6587\u4EF6")), /* @__PURE__ */ React4.createElement(Form3.Item, { name: "scrape", valuePropName: "checked" }, /* @__PURE__ */ React4.createElement(Checkbox2, null, "\u8054\u7F51\u522E\u524A"))),
        /* @__PURE__ */ React4.createElement(Space4, { align: "center", wrap: true }, /* @__PURE__ */ React4.createElement(Form3.Item, { name: "maxDepth", label: "\u6700\u5927\u6DF1\u5EA6" }, /* @__PURE__ */ React4.createElement(InputNumber3, { min: 0, placeholder: "\u4E0D\u9650" })), /* @__PURE__ */ React4.createElement(Form3.Item, { name: "concurrent", label: "\u522E\u524A\u5E76\u53D1" }, /* @__PURE__ */ React4.createElement(InputNumber3, { min: 1, max: 5 }))),
        /* @__PURE__ */ React4.createElement(Button4, { type: "primary", htmlType: "submit", block: true, loading: scanning, icon: /* @__PURE__ */ React4.createElement(Icon3, { as: FolderOpenOutlined3 }) }, "\u626B\u63CF\u5E76\u5347\u7EA7\u6570\u636E\u5E93")
      )
    ), /* @__PURE__ */ React4.createElement(
      Drawer2,
      {
        title: "\u7B5B\u9009",
        placement: "right",
        width: 420,
        open: filterOpen,
        onClose: () => setFilterOpen(false),
        extra: /* @__PURE__ */ React4.createElement(Button4, { type: "link", onClick: clearFilters }, "\u6E05\u9664\u5168\u90E8")
      },
      /* @__PURE__ */ React4.createElement("div", { className: "jav-library-filter-help" }, /* @__PURE__ */ React4.createElement(Text4, { type: "secondary" }, "\u540C\u4E00\u5B57\u6BB5\u5185\u4E3A\u201C\u4EFB\u4E00\u5339\u914D\u201D\uFF0C\u4E0D\u540C\u5B57\u6BB5\u4E4B\u95F4\u4E3A\u201C\u540C\u65F6\u6EE1\u8DB3\u201D\u3002")),
      /* @__PURE__ */ React4.createElement("div", { className: "jav-library-filters" }, filterBlock("\u6807\u7B7E", "genres"), filterBlock("\u6F14\u5458", "stars"), filterBlock("\u5236\u4F5C\u5546", "studios"), filterBlock("\u53D1\u884C\u5546", "publishers"), filterBlock("\u7CFB\u5217", "series"), filterBlock("\u5E74\u4EFD", "years"), filterBlock("\u626B\u63CF\u76EE\u5F55", "roots"))
    ))));
  }

  // frontend/src/components/SettingsPage.jsx
  var React5 = window.React;
  var antd5 = window.antd;
  var icons5 = window.icons || {};
  var {
    Alert: Alert3,
    Button: Button5,
    Card: Card4,
    Col: Col2,
    Form: Form4,
    Input: Input5,
    InputNumber: InputNumber4,
    Row: Row2,
    Space: Space5,
    Spin,
    Tag: Tag4,
    Typography: Typography5,
    message: message5
  } = antd5;
  var { Title: Title4, Text: Text5 } = Typography5;
  var { ApiOutlined: ApiOutlined2, ReloadOutlined: ReloadOutlined3, SaveOutlined: SaveOutlined2, SettingOutlined: SettingOutlined2 } = icons5;
  var Icon4 = ({ as: Component }) => Component ? /* @__PURE__ */ React5.createElement(Component, null) : null;
  function SettingsPage() {
    const [form] = Form4.useForm();
    const [loading, setLoading] = React5.useState(true);
    const [saving, setSaving] = React5.useState(false);
    const [settings, setSettings] = React5.useState(null);
    const loadSettings = async () => {
      setLoading(true);
      try {
        const payload = await fetchSystemSettings();
        setSettings(payload);
        form.setFieldsValue(payload.javbus || {});
      } catch (error) {
        message5.error("\u52A0\u8F7D\u8BBE\u7F6E\u5931\u8D25");
      } finally {
        setLoading(false);
      }
    };
    React5.useEffect(() => {
      loadSettings();
    }, []);
    const saveSettings = async (values) => {
      setSaving(true);
      try {
        const payload = await updateJavBusSettings(values);
        setSettings(payload);
        form.setFieldsValue(payload.javbus || {});
        message5.success("API \u8BBE\u7F6E\u5DF2\u4FDD\u5B58");
      } catch (error) {
        message5.error("\u4FDD\u5B58\u8BBE\u7F6E\u5931\u8D25\uFF0C\u8BF7\u68C0\u67E5\u8F93\u5165\u503C");
      } finally {
        setSaving(false);
      }
    };
    const envOverrides = settings?.environment_overrides?.javbus || {};
    const hasEnvOverrides = Object.values(envOverrides).some(Boolean);
    return /* @__PURE__ */ React5.createElement("div", { className: "webdav-page" }, /* @__PURE__ */ React5.createElement("div", { className: "webdav-page-header" }, /* @__PURE__ */ React5.createElement("div", null, /* @__PURE__ */ React5.createElement(Title4, { level: 3, style: { marginBottom: 4 } }, "\u8BBE\u7F6E"), /* @__PURE__ */ React5.createElement(Text5, { type: "secondary" }, "API \u53C2\u6570\u4E0E\u8FD0\u884C\u914D\u7F6E")), /* @__PURE__ */ React5.createElement(Space5, null, hasEnvOverrides && /* @__PURE__ */ React5.createElement(Tag4, { color: "warning" }, "\u73AF\u5883\u53D8\u91CF\u8986\u76D6\u4E2D"), /* @__PURE__ */ React5.createElement(Button5, { icon: /* @__PURE__ */ React5.createElement(Icon4, { as: ReloadOutlined3 }), onClick: loadSettings, loading }, "\u5237\u65B0"))), /* @__PURE__ */ React5.createElement(Spin, { spinning: loading }, /* @__PURE__ */ React5.createElement(Row2, { gutter: [24, 24] }, /* @__PURE__ */ React5.createElement(Col2, { xs: 24, lg: 16 }, /* @__PURE__ */ React5.createElement(Card4, { className: "webdav-connection-card", title: /* @__PURE__ */ React5.createElement(React5.Fragment, null, /* @__PURE__ */ React5.createElement(Icon4, { as: ApiOutlined2 }), " JavBus API") }, hasEnvOverrides && /* @__PURE__ */ React5.createElement(
      Alert3,
      {
        showIcon: true,
        type: "warning",
        style: { marginBottom: 16 },
        message: "\u90E8\u5206\u5B57\u6BB5\u6B63\u7531\u73AF\u5883\u53D8\u91CF\u8986\u76D6\uFF0C\u4FDD\u5B58\u5230 config.json \u540E\u9700\u79FB\u9664\u5BF9\u5E94\u73AF\u5883\u53D8\u91CF\u624D\u4F1A\u751F\u6548\u3002"
      }
    ), /* @__PURE__ */ React5.createElement(Form4, { form, layout: "vertical", onFinish: saveSettings }, /* @__PURE__ */ React5.createElement(
      Form4.Item,
      {
        name: "base_url",
        label: "Base URL",
        rules: [{ required: true, message: "\u8BF7\u8F93\u5165 API \u57FA\u7840\u5730\u5740" }],
        extra: envOverrides.base_url ? "JAVBUS_BASE_URL \u6B63\u5728\u8986\u76D6\u6B64\u5B57\u6BB5" : null
      },
      /* @__PURE__ */ React5.createElement(Input5, { placeholder: "https://www.javbus.com", autoComplete: "url" })
    ), /* @__PURE__ */ React5.createElement(
      Form4.Item,
      {
        name: "proxy",
        label: "\u4EE3\u7406",
        extra: envOverrides.proxy ? "JAVBUS_PROXY \u6B63\u5728\u8986\u76D6\u6B64\u5B57\u6BB5" : "\u652F\u6301 http\u3001https\u3001socks5\u3001socks5h\uFF1B\u7559\u7A7A\u8868\u793A\u4E0D\u4F7F\u7528\u4EE3\u7406"
      },
      /* @__PURE__ */ React5.createElement(Input5, { placeholder: "http://127.0.0.1:7890", autoComplete: "off" })
    ), /* @__PURE__ */ React5.createElement(Row2, { gutter: 16 }, /* @__PURE__ */ React5.createElement(Col2, { xs: 24, md: 12 }, /* @__PURE__ */ React5.createElement(Form4.Item, { name: "timeout_seconds", label: "\u8BF7\u6C42\u8D85\u65F6\uFF08\u79D2\uFF09", rules: [{ required: true, message: "\u8BF7\u8F93\u5165\u8BF7\u6C42\u8D85\u65F6" }] }, /* @__PURE__ */ React5.createElement(InputNumber4, { min: 1, max: 60, step: 1, style: { width: "100%" } }))), /* @__PURE__ */ React5.createElement(Col2, { xs: 24, md: 12 }, /* @__PURE__ */ React5.createElement(
      Form4.Item,
      {
        name: "request_interval_seconds",
        label: "\u8BF7\u6C42\u95F4\u9694\uFF08\u79D2\uFF09",
        rules: [{ required: true, message: "\u8BF7\u8F93\u5165\u8BF7\u6C42\u95F4\u9694" }],
        extra: envOverrides.request_interval_seconds ? "JAVBUS_REQUEST_INTERVAL_SECONDS \u6B63\u5728\u8986\u76D6\u6B64\u5B57\u6BB5" : null
      },
      /* @__PURE__ */ React5.createElement(InputNumber4, { min: 0, max: 10, step: 0.05, precision: 2, style: { width: "100%" } })
    ))), /* @__PURE__ */ React5.createElement(Row2, { gutter: 16 }, /* @__PURE__ */ React5.createElement(Col2, { xs: 24, md: 12 }, /* @__PURE__ */ React5.createElement(Form4.Item, { name: "cache_expire_seconds", label: "\u7F13\u5B58\u6709\u6548\u671F\uFF08\u79D2\uFF09", rules: [{ required: true, message: "\u8BF7\u8F93\u5165\u7F13\u5B58\u6709\u6548\u671F" }] }, /* @__PURE__ */ React5.createElement(InputNumber4, { min: 0, max: 86400, step: 60, style: { width: "100%" } }))), /* @__PURE__ */ React5.createElement(Col2, { xs: 24, md: 12 }, /* @__PURE__ */ React5.createElement(Form4.Item, { name: "cache_max_size", label: "\u7F13\u5B58\u5BB9\u91CF", rules: [{ required: true, message: "\u8BF7\u8F93\u5165\u7F13\u5B58\u5BB9\u91CF" }] }, /* @__PURE__ */ React5.createElement(InputNumber4, { min: 1, max: 1e5, step: 100, style: { width: "100%" } })))), /* @__PURE__ */ React5.createElement(Space5, { wrap: true }, /* @__PURE__ */ React5.createElement(Button5, { type: "primary", htmlType: "submit", icon: /* @__PURE__ */ React5.createElement(Icon4, { as: SaveOutlined2 }), loading: saving }, "\u4FDD\u5B58\u8BBE\u7F6E"), /* @__PURE__ */ React5.createElement(Button5, { onClick: () => form.setFieldsValue(settings?.javbus || {}), disabled: saving }, "\u91CD\u7F6E\u8868\u5355"))))), /* @__PURE__ */ React5.createElement(Col2, { xs: 24, lg: 8 }, /* @__PURE__ */ React5.createElement(Card4, { className: "webdav-connection-card", title: /* @__PURE__ */ React5.createElement(React5.Fragment, null, /* @__PURE__ */ React5.createElement(Icon4, { as: SettingOutlined2 }), " \u5F53\u524D\u72B6\u6001") }, /* @__PURE__ */ React5.createElement(Space5, { direction: "vertical", size: "middle", style: { width: "100%" } }, /* @__PURE__ */ React5.createElement("div", null, /* @__PURE__ */ React5.createElement(Text5, { type: "secondary" }, "\u8BF7\u6C42\u95F4\u9694"), /* @__PURE__ */ React5.createElement("div", null, /* @__PURE__ */ React5.createElement(Text5, { strong: true }, settings?.javbus?.request_interval_seconds ?? "-", " \u79D2"))), /* @__PURE__ */ React5.createElement("div", null, /* @__PURE__ */ React5.createElement(Text5, { type: "secondary" }, "\u7F13\u5B58\u5BB9\u91CF"), /* @__PURE__ */ React5.createElement("div", null, /* @__PURE__ */ React5.createElement(Text5, { strong: true }, settings?.javbus?.cache_max_size ?? "-", " \u6761"))), /* @__PURE__ */ React5.createElement("div", null, /* @__PURE__ */ React5.createElement(Text5, { type: "secondary" }, "\u73AF\u5883\u53D8\u91CF\u8986\u76D6"), /* @__PURE__ */ React5.createElement("div", { style: { marginTop: 6 } }, Object.entries(envOverrides).map(([key, active]) => /* @__PURE__ */ React5.createElement(Tag4, { key, color: active ? "warning" : "default" }, key, ": ", active ? "\u662F" : "\u5426"))))))))));
  }

  // frontend/src/components/AutomationPage.jsx
  var React6 = window.React;
  var antd6 = window.antd;
  var icons6 = window.icons || {};
  var {
    Button: Button6,
    Card: Card5,
    Divider: Divider3,
    Empty: Empty2,
    Form: Form5,
    Input: Input6,
    InputNumber: InputNumber5,
    List: List2,
    Popconfirm: Popconfirm4,
    Select: Select2,
    Space: Space6,
    Switch: Switch3,
    Table: Table4,
    Tag: Tag5,
    Typography: Typography6,
    message: message6
  } = antd6;
  var { Text: Text6, Title: Title5 } = Typography6;
  var {
    ClockCircleOutlined,
    DeleteOutlined: DeleteOutlined3,
    DownloadOutlined: DownloadOutlined3,
    LinkOutlined,
    PlusOutlined,
    PlayCircleOutlined: PlayCircleOutlined4,
    SaveOutlined: SaveOutlined3,
    SearchOutlined: SearchOutlined2,
    ThunderboltOutlined
  } = icons6;
  var Icon5 = ({ as: Component }) => Component ? /* @__PURE__ */ React6.createElement(Component, null) : null;
  var NODE_WIDTH = 196;
  var NODE_HEIGHT = 84;
  var NODE_GAP = 52;
  var NODE_MIN_X = 48;
  var NODE_MIN_Y = 92;
  var NODE_TYPE_ORDER = ["trigger", "search", "magnet", "download"];
  var FILTER_TYPE_LABELS = { genre: "\u7C7B\u522B", star: "\u6F14\u5458" };
  var NODE_META = {
    trigger: { title: "\u89E6\u53D1", icon: ThunderboltOutlined, className: "automation-node-trigger" },
    search: { title: "\u68C0\u7D22", icon: SearchOutlined2, className: "automation-node-search" },
    magnet: { title: "\u78C1\u529B", icon: LinkOutlined, className: "automation-node-magnet" },
    download: { title: "\u4E0B\u8F7D", icon: DownloadOutlined3, className: "automation-node-download" }
  };
  var buildDefaultTask = () => ({
    name: "\u65B0\u7684\u81EA\u52A8\u4EFB\u52A1",
    enabled: false,
    trigger: { type: "auto", scheduled_time: null, interval_minutes: 60 },
    nodes: [
      { id: "trigger", type: "trigger", position: { x: 48, y: 110 }, config: {} },
      {
        id: "search",
        type: "search",
        position: { x: 296, y: 110 },
        config: { mode: "keyword", keyword: "", max_results: 10, filters: [], magnet: "exist", type: "normal", skip_existing: true }
      },
      {
        id: "magnet",
        type: "magnet",
        position: { x: 544, y: 110 },
        config: { source: "javbus", has_subtitle: void 0, exclude_4k: false, allow_chinese_subtitles: true }
      },
      { id: "download", type: "download", position: { x: 792, y: 110 }, config: { tool: "pikpak" } }
    ],
    edges: [
      { id: "edge-trigger-search", source: "trigger", target: "search" },
      { id: "edge-search-magnet", source: "search", target: "magnet" },
      { id: "edge-magnet-download", source: "magnet", target: "download" }
    ],
    runs: []
  });
  var getAutoLayoutOrder = (nodes = [], edges = []) => {
    const nodeMap = new Map(nodes.map((node) => [node.id, node]));
    const incoming = new Map(nodes.map((node) => [node.id, 0]));
    const outgoing = new Map(nodes.map((node) => [node.id, []]));
    edges.forEach((edge) => {
      if (!nodeMap.has(edge.source) || !nodeMap.has(edge.target)) {
        return;
      }
      incoming.set(edge.target, (incoming.get(edge.target) || 0) + 1);
      outgoing.get(edge.source).push(edge.target);
    });
    const rankNode = (node) => {
      const typeRank = NODE_TYPE_ORDER.indexOf(node.type);
      return typeRank === -1 ? NODE_TYPE_ORDER.length : typeRank;
    };
    const queue = nodes.filter((node) => (incoming.get(node.id) || 0) === 0).sort((first, second) => rankNode(first) - rankNode(second));
    const ordered = [];
    const seen = /* @__PURE__ */ new Set();
    while (queue.length > 0) {
      const node = queue.shift();
      if (!node || seen.has(node.id)) {
        continue;
      }
      seen.add(node.id);
      ordered.push(node);
      outgoing.get(node.id).forEach((targetId) => {
        incoming.set(targetId, (incoming.get(targetId) || 0) - 1);
        if ((incoming.get(targetId) || 0) <= 0 && nodeMap.has(targetId)) {
          queue.push(nodeMap.get(targetId));
          queue.sort((first, second) => rankNode(first) - rankNode(second));
        }
      });
    }
    nodes.filter((node) => !seen.has(node.id)).sort((first, second) => rankNode(first) - rankNode(second)).forEach((node) => ordered.push(node));
    return ordered;
  };
  var statusColor = (status) => {
    if (status === "success") return "green";
    if (status === "partial") return "gold";
    if (status === "failed") return "red";
    if (status === "running") return "blue";
    return "default";
  };
  var triggerLabel = (trigger) => {
    if (!trigger || trigger.type === "auto") return "\u81EA\u52A8\u8FD0\u884C";
    if (trigger.type === "scheduled") return `\u5B9A\u65F6 ${trigger.scheduled_time || "00:00"}`;
    return `\u95F4\u9694 ${trigger.interval_minutes || 60} \u5206\u949F`;
  };
  function AutomationPage() {
    const [tasks, setTasks] = React6.useState([]);
    const [currentTask, setCurrentTask] = React6.useState(buildDefaultTask());
    const [selectedNodeId, setSelectedNodeId] = React6.useState("search");
    const [loading, setLoading] = React6.useState(false);
    const [saving, setSaving] = React6.useState(false);
    const [running, setRunning] = React6.useState(false);
    const [dragState, setDragState] = React6.useState(null);
    const [categoryGroups, setCategoryGroups] = React6.useState({});
    const [actorGroups, setActorGroups] = React6.useState({});
    const canvasRef = React6.useRef(null);
    React6.useEffect(() => {
      void loadTasks();
      void loadFilterCatalogs();
    }, []);
    React6.useEffect(() => {
      if (!dragState) return void 0;
      const handleMove = (event) => {
        const rect = canvasRef.current?.getBoundingClientRect();
        if (!rect) return;
        const x = Math.max(16, Math.min(rect.width - 220, event.clientX - rect.left - dragState.offsetX));
        const y = Math.max(70, Math.min(rect.height - 96, event.clientY - rect.top - dragState.offsetY));
        updateNode(dragState.nodeId, { position: { x, y } });
      };
      const handleUp = () => setDragState(null);
      window.addEventListener("pointermove", handleMove);
      window.addEventListener("pointerup", handleUp);
      return () => {
        window.removeEventListener("pointermove", handleMove);
        window.removeEventListener("pointerup", handleUp);
      };
    }, [dragState, currentTask]);
    const loadTasks = async () => {
      setLoading(true);
      try {
        const payload = await fetchAutomationTasks();
        const nextTasks = payload.tasks || [];
        setTasks(nextTasks);
        if (nextTasks.length > 0 && !currentTask.id) {
          setCurrentTask(nextTasks[0]);
          setSelectedNodeId(nextTasks[0].nodes?.[1]?.id || "search");
        }
      } catch (error) {
        message6.error("\u52A0\u8F7D\u81EA\u52A8\u4EFB\u52A1\u5931\u8D25");
      } finally {
        setLoading(false);
      }
    };
    const loadFilterCatalogs = async () => {
      try {
        const [categoryPayload, actorPayload] = await Promise.all([
          fetch("/static/categories.json").then((response) => response.json()),
          fetch("/static/actors.json").then((response) => response.json())
        ]);
        setCategoryGroups(categoryPayload || {});
        setActorGroups(actorPayload || {});
      } catch (error) {
        message6.warning("\u7B5B\u9009\u9884\u89C8\u6570\u636E\u52A0\u8F7D\u5931\u8D25");
      }
    };
    const updateTaskField = (field, value) => {
      setCurrentTask((prev) => ({ ...prev, [field]: value }));
    };
    const updateTrigger = (patch) => {
      setCurrentTask((prev) => ({ ...prev, trigger: { ...prev.trigger || {}, ...patch } }));
    };
    const updateNode = (nodeId, patch) => {
      setCurrentTask((prev) => ({
        ...prev,
        nodes: (prev.nodes || []).map((node) => node.id === nodeId ? { ...node, ...patch } : node)
      }));
    };
    const updateNodeConfig = (nodeId, patch) => {
      setCurrentTask((prev) => ({
        ...prev,
        nodes: (prev.nodes || []).map((node) => node.id === nodeId ? { ...node, config: { ...node.config || {}, ...patch } } : node)
      }));
    };
    const categorySelectOptions = React6.useMemo(() => Object.entries(categoryGroups || {}).map(([groupName, items]) => ({
      label: groupName,
      options: (Array.isArray(items) ? items : []).map((item) => ({
        label: item.name || item.code,
        value: item.code,
        filterType: "genre"
      }))
    })), [categoryGroups]);
    const actorSelectOptions = React6.useMemo(() => Object.values(actorGroups || {}).flatMap((items) => Array.isArray(items) ? items : []).map((item) => ({
      label: item.name || item.code,
      value: item.code,
      filterType: "star"
    })), [actorGroups]);
    const filterOptionMap = React6.useMemo(() => {
      const nextMap = /* @__PURE__ */ new Map();
      categorySelectOptions.forEach((group) => {
        (group.options || []).forEach((option) => nextMap.set(`genre:${option.value}`, option));
      });
      actorSelectOptions.forEach((option) => nextMap.set(`star:${option.value}`, option));
      return nextMap;
    }, [categorySelectOptions, actorSelectOptions]);
    const getSearchFilters = (config = {}) => {
      if (Array.isArray(config.filters)) {
        return config.filters.filter((item) => item && item.type && item.value);
      }
      if (config.filter_type && config.filter_value) {
        return [{ type: config.filter_type, value: config.filter_value, label: config.filter_label || config.filter_value }];
      }
      return [];
    };
    const getSelectedFilterValues = (config, type) => getSearchFilters(config).filter((item) => item.type === type).map((item) => item.value);
    const setSelectedFilterValues = (type, values) => {
      if (!selectedNode) {
        return;
      }
      const existingFilters = getSearchFilters(selectedNode.config).filter((item) => item.type !== type);
      const selectedFilters = (values || []).map((value) => {
        const option = filterOptionMap.get(`${type}:${value}`);
        return {
          type,
          value,
          label: option?.label || value
        };
      });
      updateNodeConfig(selectedNode.id, {
        filters: [...existingFilters, ...selectedFilters],
        filter_type: void 0,
        filter_value: void 0,
        filter_label: void 0
      });
    };
    const handleAutoLayout = () => {
      const rect = canvasRef.current?.getBoundingClientRect();
      const canvasWidth = Math.max(rect?.width || 1040, 760);
      const canvasHeight = Math.max(rect?.height || 450, 360);
      setCurrentTask((prev) => {
        const nodes = prev.nodes || [];
        const orderedNodes = getAutoLayoutOrder(nodes, prev.edges || []);
        if (orderedNodes.length === 0) {
          return prev;
        }
        const totalWidth = orderedNodes.length * NODE_WIDTH + Math.max(0, orderedNodes.length - 1) * NODE_GAP;
        const startX = Math.max(NODE_MIN_X, Math.round((canvasWidth - totalWidth) / 2));
        const y = Math.max(NODE_MIN_Y, Math.round((canvasHeight - NODE_HEIGHT) / 2));
        const positionMap = new Map(
          orderedNodes.map((node, index) => [
            node.id,
            {
              x: startX + index * (NODE_WIDTH + NODE_GAP),
              y
            }
          ])
        );
        return {
          ...prev,
          nodes: nodes.map((node) => ({
            ...node,
            position: positionMap.get(node.id) || node.position
          }))
        };
      });
      message6.success("\u5DF2\u81EA\u52A8\u6392\u7248");
    };
    const handleNewTask = () => {
      const task = buildDefaultTask();
      setCurrentTask(task);
      setSelectedNodeId("search");
    };
    const handleSelectTask = (task) => {
      setCurrentTask(task);
      setSelectedNodeId(task.nodes?.[1]?.id || task.nodes?.[0]?.id || "search");
    };
    const handleSave = async () => {
      if (!currentTask.name?.trim()) {
        message6.warning("\u8BF7\u8F93\u5165\u4EFB\u52A1\u540D\u79F0");
        return;
      }
      setSaving(true);
      try {
        const payload = {
          name: currentTask.name.trim(),
          enabled: !!currentTask.enabled,
          trigger: currentTask.trigger,
          nodes: currentTask.nodes,
          edges: currentTask.edges
        };
        const saved = currentTask.id ? await updateAutomationTask(currentTask.id, payload) : await createAutomationTask(payload);
        setCurrentTask(saved);
        await loadTasks();
        message6.success("\u81EA\u52A8\u4EFB\u52A1\u5DF2\u4FDD\u5B58");
      } catch (error) {
        message6.error("\u4FDD\u5B58\u81EA\u52A8\u4EFB\u52A1\u5931\u8D25");
      } finally {
        setSaving(false);
      }
    };
    const handleRun = async () => {
      if (!currentTask.id) {
        message6.warning("\u8BF7\u5148\u4FDD\u5B58\u4EFB\u52A1");
        return;
      }
      setRunning(true);
      try {
        const run = await runAutomationTask(currentTask.id);
        message6[run.status === "failed" ? "error" : "success"](`\u8FD0\u884C\u5B8C\u6210\uFF1A\u6D3E\u53D1 ${run.dispatched_count || 0} \u4E2A\u4EFB\u52A1`);
        await loadTasks();
        const refreshed = await fetchAutomationTasks();
        const latest = (refreshed.tasks || []).find((task) => task.id === currentTask.id);
        if (latest) setCurrentTask(latest);
      } catch (error) {
        message6.error("\u8FD0\u884C\u81EA\u52A8\u4EFB\u52A1\u5931\u8D25");
      } finally {
        setRunning(false);
      }
    };
    const handleDelete = async () => {
      if (!currentTask.id) {
        handleNewTask();
        return;
      }
      try {
        await deleteAutomationTask(currentTask.id);
        message6.success("\u81EA\u52A8\u4EFB\u52A1\u5DF2\u5220\u9664");
        const payload = await fetchAutomationTasks();
        const nextTasks = payload.tasks || [];
        setTasks(nextTasks);
        setCurrentTask(nextTasks[0] || buildDefaultTask());
      } catch (error) {
        message6.error("\u5220\u9664\u81EA\u52A8\u4EFB\u52A1\u5931\u8D25");
      }
    };
    const selectedNode = (currentTask.nodes || []).find((node) => node.id === selectedNodeId) || currentTask.nodes?.[0];
    const nodeMap = Object.fromEntries((currentTask.nodes || []).map((node) => [node.id, node]));
    const renderEdges = () => /* @__PURE__ */ React6.createElement("svg", { className: "automation-flow-lines" }, (currentTask.edges || []).map((edge) => {
      const source = nodeMap[edge.source];
      const target = nodeMap[edge.target];
      if (!source || !target) return null;
      const x1 = (source.position?.x || 0) + 196;
      const y1 = (source.position?.y || 0) + 42;
      const x2 = target.position?.x || 0;
      const y2 = (target.position?.y || 0) + 42;
      const mid = x1 + Math.max(48, (x2 - x1) / 2);
      return /* @__PURE__ */ React6.createElement(
        "path",
        {
          key: edge.id,
          d: `M ${x1} ${y1} C ${mid} ${y1}, ${mid} ${y2}, ${x2} ${y2}`
        }
      );
    }));
    const renderNodeSummary = (node) => {
      if (node.type === "trigger") return triggerLabel(currentTask.trigger);
      if (node.type === "search") {
        const mode = node.config?.mode || "keyword";
        if (mode === "codes") return "\u756A\u53F7\u5217\u8868";
        if (mode === "filter") return `${node.config?.filter_type || "\u7B5B\u9009"}:${node.config?.filter_value || "-"}`;
        return node.config?.keyword || "\u5173\u952E\u8BCD";
      }
      if (node.type === "magnet") return node.config?.source === "cilisousuo" ? "Cilisousuo" : "JavBus";
      return node.config?.tool === "aria2" ? "Aria2" : "PikPak";
    };
    const renderInspector = () => {
      if (!selectedNode) return /* @__PURE__ */ React6.createElement(Empty2, { image: Empty2.PRESENTED_IMAGE_SIMPLE });
      const config = selectedNode.config || {};
      if (selectedNode.type === "trigger") {
        return /* @__PURE__ */ React6.createElement(Form5, { layout: "vertical", className: "automation-inspector-form" }, /* @__PURE__ */ React6.createElement(Form5.Item, { label: "\u89E6\u53D1\u6761\u4EF6" }, /* @__PURE__ */ React6.createElement(Select2, { value: currentTask.trigger?.type || "auto", onChange: (type) => updateTrigger({ type }) }, /* @__PURE__ */ React6.createElement(Select2.Option, { value: "auto" }, "\u81EA\u52A8\u8FD0\u884C"), /* @__PURE__ */ React6.createElement(Select2.Option, { value: "scheduled" }, "\u5B9A\u65F6\u8FD0\u884C"), /* @__PURE__ */ React6.createElement(Select2.Option, { value: "interval" }, "\u95F4\u9694\u8FD0\u884C"))), currentTask.trigger?.type === "scheduled" && /* @__PURE__ */ React6.createElement(Form5.Item, { label: "\u6BCF\u5929\u65F6\u95F4" }, /* @__PURE__ */ React6.createElement(
          Input6,
          {
            value: currentTask.trigger?.scheduled_time || "00:00",
            placeholder: "09:30",
            onChange: (event) => updateTrigger({ scheduled_time: event.target.value })
          }
        )), currentTask.trigger?.type === "interval" && /* @__PURE__ */ React6.createElement(Form5.Item, { label: "\u95F4\u9694\u5206\u949F" }, /* @__PURE__ */ React6.createElement(
          InputNumber5,
          {
            min: 1,
            max: 10080,
            value: currentTask.trigger?.interval_minutes || 60,
            onChange: (value) => updateTrigger({ interval_minutes: value || 60 }),
            style: { width: "100%" }
          }
        )));
      }
      if (selectedNode.type === "search") {
        return /* @__PURE__ */ React6.createElement(Form5, { layout: "vertical", className: "automation-inspector-form" }, /* @__PURE__ */ React6.createElement(Form5.Item, { label: "\u68C0\u7D22\u65B9\u5F0F" }, /* @__PURE__ */ React6.createElement(Select2, { value: config.mode || "keyword", onChange: (mode) => updateNodeConfig(selectedNode.id, { mode }) }, /* @__PURE__ */ React6.createElement(Select2.Option, { value: "keyword" }, "\u5173\u952E\u8BCD"), /* @__PURE__ */ React6.createElement(Select2.Option, { value: "codes" }, "\u756A\u53F7\u5217\u8868"), /* @__PURE__ */ React6.createElement(Select2.Option, { value: "filter" }, "\u6807\u7B7E\u7B5B\u9009"))), config.mode === "codes" ? /* @__PURE__ */ React6.createElement(Form5.Item, { label: "\u756A\u53F7" }, /* @__PURE__ */ React6.createElement(
          Input6.TextArea,
          {
            rows: 5,
            value: config.codes || "",
            placeholder: "ABP-123, ABP-124",
            onChange: (event) => updateNodeConfig(selectedNode.id, { codes: event.target.value })
          }
        )) : config.mode === "filter" ? /* @__PURE__ */ React6.createElement(React6.Fragment, null, /* @__PURE__ */ React6.createElement("div", { className: "automation-filter-builder" }, /* @__PURE__ */ React6.createElement(Form5.Item, { label: "\u7C7B\u522B\u9884\u89C8\u4E0E\u9009\u62E9" }, /* @__PURE__ */ React6.createElement(
          Select2,
          {
            mode: "multiple",
            allowClear: true,
            showSearch: true,
            optionFilterProp: "label",
            placeholder: "\u9884\u89C8\u5E76\u9009\u62E9\u4E00\u4E2A\u6216\u591A\u4E2A\u7C7B\u522B",
            value: getSelectedFilterValues(config, "genre"),
            options: categorySelectOptions,
            onChange: (values) => setSelectedFilterValues("genre", values)
          }
        )), /* @__PURE__ */ React6.createElement(Form5.Item, { label: "\u6F14\u5458\u9884\u89C8\u4E0E\u9009\u62E9" }, /* @__PURE__ */ React6.createElement(
          Select2,
          {
            mode: "multiple",
            allowClear: true,
            showSearch: true,
            optionFilterProp: "label",
            placeholder: "\u9884\u89C8\u5E76\u9009\u62E9\u4E00\u4E2A\u6216\u591A\u4E2A\u6F14\u5458",
            value: getSelectedFilterValues(config, "star"),
            options: actorSelectOptions,
            onChange: (values) => setSelectedFilterValues("star", values)
          }
        )), /* @__PURE__ */ React6.createElement("div", { className: "automation-filter-summary" }, getSearchFilters(config).length > 0 ? getSearchFilters(config).map((filter) => /* @__PURE__ */ React6.createElement(Tag5, { key: `${filter.type}:${filter.value}`, color: filter.type === "star" ? "magenta" : "cyan" }, FILTER_TYPE_LABELS[filter.type] || filter.type, ": ", filter.label || filter.value)) : /* @__PURE__ */ React6.createElement(Text6, { type: "secondary" }, "\u5C1A\u672A\u9009\u62E9\u7B5B\u9009\u6761\u4EF6")))) : /* @__PURE__ */ React6.createElement(Form5.Item, { label: "\u5173\u952E\u8BCD" }, /* @__PURE__ */ React6.createElement(Input6, { value: config.keyword || "", onChange: (event) => updateNodeConfig(selectedNode.id, { keyword: event.target.value }) })), /* @__PURE__ */ React6.createElement(Form5.Item, { label: "\u6700\u5927\u7B5B\u9009\u7ED3\u679C" }, /* @__PURE__ */ React6.createElement(Select2, { value: config.max_results || 10, onChange: (max_results) => updateNodeConfig(selectedNode.id, { max_results }) }, /* @__PURE__ */ React6.createElement(Select2.Option, { value: 10 }, "10"), /* @__PURE__ */ React6.createElement(Select2.Option, { value: 20 }, "20"), /* @__PURE__ */ React6.createElement(Select2.Option, { value: 50 }, "50"), /* @__PURE__ */ React6.createElement(Select2.Option, { value: 100 }, "100"), /* @__PURE__ */ React6.createElement(Select2.Option, { value: 200 }, "200"), /* @__PURE__ */ React6.createElement(Select2.Option, { value: "all" }, "\u5168\u90E8"))), /* @__PURE__ */ React6.createElement(Form5.Item, { label: "\u78C1\u529B\u6761\u4EF6" }, /* @__PURE__ */ React6.createElement(Select2, { value: config.magnet || "exist", onChange: (magnet) => updateNodeConfig(selectedNode.id, { magnet }) }, /* @__PURE__ */ React6.createElement(Select2.Option, { value: "exist" }, "\u4EC5\u6709\u78C1\u529B"), /* @__PURE__ */ React6.createElement(Select2.Option, { value: "all" }, "\u5168\u90E8\u5F71\u7247"))), /* @__PURE__ */ React6.createElement(Form5.Item, { label: "\u8DF3\u8FC7\u5DF2\u5B58\u5728" }, /* @__PURE__ */ React6.createElement(Switch3, { checked: config.skip_existing !== false, onChange: (checked) => updateNodeConfig(selectedNode.id, { skip_existing: checked }) })));
      }
      if (selectedNode.type === "magnet") {
        return /* @__PURE__ */ React6.createElement(Form5, { layout: "vertical", className: "automation-inspector-form" }, /* @__PURE__ */ React6.createElement(Form5.Item, { label: "\u6765\u6E90" }, /* @__PURE__ */ React6.createElement(Select2, { value: config.source || "javbus", onChange: (source) => updateNodeConfig(selectedNode.id, { source }) }, /* @__PURE__ */ React6.createElement(Select2.Option, { value: "javbus" }, "JavBus"), /* @__PURE__ */ React6.createElement(Select2.Option, { value: "cilisousuo" }, "Cilisousuo"))), /* @__PURE__ */ React6.createElement(Form5.Item, { label: "\u5B57\u5E55\u8FC7\u6EE4" }, /* @__PURE__ */ React6.createElement(Select2, { allowClear: true, value: config.has_subtitle, onChange: (has_subtitle) => updateNodeConfig(selectedNode.id, { has_subtitle }) }, /* @__PURE__ */ React6.createElement(Select2.Option, { value: "true" }, "\u53EA\u8981\u5B57\u5E55"), /* @__PURE__ */ React6.createElement(Select2.Option, { value: "false" }, "\u4E0D\u8981\u5B57\u5E55"))), /* @__PURE__ */ React6.createElement(Form5.Item, { label: "\u6392\u9664 4K" }, /* @__PURE__ */ React6.createElement(Switch3, { checked: !!config.exclude_4k, onChange: (checked) => updateNodeConfig(selectedNode.id, { exclude_4k: checked }) })), /* @__PURE__ */ React6.createElement(Form5.Item, { label: "\u5141\u8BB8\u4E2D\u6587\u5B57\u5E55" }, /* @__PURE__ */ React6.createElement(Switch3, { checked: config.allow_chinese_subtitles !== false, onChange: (checked) => updateNodeConfig(selectedNode.id, { allow_chinese_subtitles: checked }) })));
      }
      return /* @__PURE__ */ React6.createElement(Form5, { layout: "vertical", className: "automation-inspector-form" }, /* @__PURE__ */ React6.createElement(Form5.Item, { label: "\u4E0B\u8F7D\u65B9\u5F0F" }, /* @__PURE__ */ React6.createElement(Select2, { value: config.tool || "pikpak", onChange: (tool) => updateNodeConfig(selectedNode.id, { tool }) }, /* @__PURE__ */ React6.createElement(Select2.Option, { value: "pikpak" }, "PikPak"), /* @__PURE__ */ React6.createElement(Select2.Option, { value: "aria2" }, "Aria2"))));
    };
    const runColumns = [
      { title: "\u65F6\u95F4", dataIndex: "started_at", width: 170 },
      { title: "\u72B6\u6001", dataIndex: "status", width: 90, render: (value) => /* @__PURE__ */ React6.createElement(Tag5, { color: statusColor(value) }, value || "-") },
      { title: "\u68C0\u7D22", dataIndex: "found_count", width: 70 },
      { title: "\u78C1\u529B", dataIndex: "magnet_count", width: 70 },
      { title: "\u6D3E\u53D1", dataIndex: "dispatched_count", width: 70 },
      { title: "\u8DF3\u8FC7", dataIndex: "skipped_count", width: 70 },
      { title: "\u9519\u8BEF", dataIndex: "error", ellipsis: true }
    ];
    return /* @__PURE__ */ React6.createElement("div", { className: "automation-page" }, /* @__PURE__ */ React6.createElement("aside", { className: "automation-sidebar" }, /* @__PURE__ */ React6.createElement("div", { className: "automation-sidebar-header" }, /* @__PURE__ */ React6.createElement(Title5, { level: 5 }, "\u81EA\u52A8\u6A21\u5F0F"), /* @__PURE__ */ React6.createElement(Button6, { type: "primary", size: "small", icon: /* @__PURE__ */ React6.createElement(Icon5, { as: PlusOutlined }), onClick: handleNewTask }, "\u65B0\u5EFA")), /* @__PURE__ */ React6.createElement(
      List2,
      {
        loading,
        dataSource: tasks,
        locale: { emptyText: /* @__PURE__ */ React6.createElement(Empty2, { image: Empty2.PRESENTED_IMAGE_SIMPLE, description: "\u6682\u65E0\u4EFB\u52A1" }) },
        renderItem: (task) => /* @__PURE__ */ React6.createElement(
          List2.Item,
          {
            className: `automation-task-item ${currentTask.id === task.id ? "is-active" : ""}`,
            onClick: () => handleSelectTask(task)
          },
          /* @__PURE__ */ React6.createElement("div", null, /* @__PURE__ */ React6.createElement(Text6, { strong: true }, task.name), /* @__PURE__ */ React6.createElement("div", { className: "automation-task-meta" }, /* @__PURE__ */ React6.createElement(Tag5, { color: task.enabled ? "green" : "default" }, task.enabled ? "\u5DF2\u542F\u7528" : "\u672A\u542F\u7528"), /* @__PURE__ */ React6.createElement("span", null, triggerLabel(task.trigger))))
        )
      }
    )), /* @__PURE__ */ React6.createElement("main", { className: "automation-main" }, /* @__PURE__ */ React6.createElement("section", { className: "automation-toolbar" }, /* @__PURE__ */ React6.createElement(Space6, { align: "center", wrap: true }, /* @__PURE__ */ React6.createElement(
      Input6,
      {
        className: "automation-name-input",
        value: currentTask.name,
        onChange: (event) => updateTaskField("name", event.target.value),
        placeholder: "\u4EFB\u52A1\u540D\u79F0"
      }
    ), /* @__PURE__ */ React6.createElement(
      Switch3,
      {
        checked: !!currentTask.enabled,
        checkedChildren: "\u542F\u7528",
        unCheckedChildren: "\u505C\u7528",
        onChange: (checked) => updateTaskField("enabled", checked)
      }
    ), /* @__PURE__ */ React6.createElement(Tag5, { icon: /* @__PURE__ */ React6.createElement(Icon5, { as: ClockCircleOutlined }), color: "blue" }, triggerLabel(currentTask.trigger))), /* @__PURE__ */ React6.createElement(Space6, null, /* @__PURE__ */ React6.createElement(Button6, { className: "automation-layout-button", onClick: handleAutoLayout }, "\u81EA\u52A8\u6392\u7248"), /* @__PURE__ */ React6.createElement(Button6, { icon: /* @__PURE__ */ React6.createElement(Icon5, { as: PlayCircleOutlined4 }), onClick: handleRun, loading: running }, "\u8FD0\u884C"), /* @__PURE__ */ React6.createElement(Button6, { type: "primary", icon: /* @__PURE__ */ React6.createElement(Icon5, { as: SaveOutlined3 }), onClick: handleSave, loading: saving }, "\u4FDD\u5B58"), /* @__PURE__ */ React6.createElement(Popconfirm4, { title: "\u5220\u9664\u8FD9\u4E2A\u81EA\u52A8\u4EFB\u52A1\uFF1F", okText: "\u5220\u9664", cancelText: "\u53D6\u6D88", onConfirm: handleDelete }, /* @__PURE__ */ React6.createElement(Button6, { danger: true, icon: /* @__PURE__ */ React6.createElement(Icon5, { as: DeleteOutlined3 }) }, "\u5220\u9664")))), /* @__PURE__ */ React6.createElement("section", { className: "automation-workbench" }, /* @__PURE__ */ React6.createElement("div", { className: "automation-canvas", ref: canvasRef }, renderEdges(), (currentTask.nodes || []).map((node) => {
      const meta = NODE_META[node.type] || NODE_META.search;
      return /* @__PURE__ */ React6.createElement(
        "button",
        {
          key: node.id,
          type: "button",
          className: `automation-node ${meta.className} ${selectedNodeId === node.id ? "is-selected" : ""}`,
          style: { left: node.position?.x || 0, top: node.position?.y || 0 },
          onClick: () => setSelectedNodeId(node.id),
          onPointerDown: (event) => {
            const rect = event.currentTarget.getBoundingClientRect();
            setSelectedNodeId(node.id);
            setDragState({
              nodeId: node.id,
              offsetX: event.clientX - rect.left,
              offsetY: event.clientY - rect.top
            });
          }
        },
        /* @__PURE__ */ React6.createElement("span", { className: "automation-node-icon" }, /* @__PURE__ */ React6.createElement(Icon5, { as: meta.icon })),
        /* @__PURE__ */ React6.createElement("span", { className: "automation-node-body" }, /* @__PURE__ */ React6.createElement("strong", null, meta.title), /* @__PURE__ */ React6.createElement("em", null, renderNodeSummary(node)))
      );
    })), /* @__PURE__ */ React6.createElement("aside", { className: "automation-inspector" }, /* @__PURE__ */ React6.createElement(Card5, { size: "small", title: selectedNode ? NODE_META[selectedNode.type]?.title : "\u8282\u70B9" }, renderInspector()))), /* @__PURE__ */ React6.createElement("section", { className: "automation-runs" }, /* @__PURE__ */ React6.createElement(Card5, { size: "small", title: "\u8FD0\u884C\u8BB0\u5F55" }, /* @__PURE__ */ React6.createElement(
      Table4,
      {
        size: "small",
        rowKey: "id",
        columns: runColumns,
        dataSource: currentTask.runs || [],
        pagination: { pageSize: 5, hideOnSinglePage: true },
        locale: { emptyText: /* @__PURE__ */ React6.createElement(Empty2, { image: Empty2.PRESENTED_IMAGE_SIMPLE, description: "\u6682\u65E0\u8FD0\u884C\u8BB0\u5F55" }) }
      }
    )))));
  }

  // frontend/src/components/JavPage.jsx
  var React7 = window.React;
  var antd7 = window.antd;
  var icons7 = window.icons || {};
  var {
    Layout: Layout2,
    Button: Button7,
    Drawer: Drawer3,
    Input: Input7,
    Form: Form6,
    Select: Select3,
    Card: Card6,
    Spin: Spin2,
    message: message7,
    Typography: Typography7,
    Space: Space7,
    Divider: Divider4,
    List: List3,
    Tag: Tag6,
    ConfigProvider,
    Segmented: Segmented2,
    Popconfirm: Popconfirm5
  } = antd7;
  var { Header, Content: Content2, Sider } = Layout2;
  var { Title: Title6, Text: Text7 } = Typography7;
  var { Option } = Select3;
  var {
    ArrowLeftOutlined: ArrowLeftOutlined2,
    ArrowRightOutlined,
    DatabaseOutlined: DatabaseOutlined2,
    DownloadOutlined: DownloadOutlined4,
    FilterOutlined: FilterOutlined2,
    GithubOutlined,
    HistoryOutlined,
    LinkOutlined: LinkOutlined2,
    LoginOutlined,
    LogoutOutlined,
    SafetyCertificateOutlined,
    SearchOutlined: SearchOutlined3,
    SettingOutlined: SettingOutlined3,
    ThunderboltOutlined: ThunderboltOutlined2
  } = icons7;
  var Icon6 = ({ as: Component }) => Component ? /* @__PURE__ */ React7.createElement(Component, null) : null;
  var HEADER_BRAND_NAME = "JavJaeger";
  var HEADER_SLOGAN_QUOTE = '"\u4EBA\u7C7B\u7684\u4E00\u5207\u75DB\u82E6\uFF0C\u90FD\u662F\u56E0\u4E3A\u6027\u6B32\u5F97\u4E0D\u5230\u6EE1\u8DB3"';
  var HEADER_SLOGAN_AUTHOR = " --\u5F17\u6D1B\u4F0A\u5FB7 \u5CF0";
  var RESOURCE_REQUEST_CONCURRENCY = 4;
  var FILTER_TYPE_LABELS2 = {
    star: "\u6F14\u5458",
    genre: "\u7C7B\u522B",
    director: "\u5BFC\u6F14",
    studio: "\u5236\u4F5C\u5546",
    label: "\u53D1\u884C\u5546",
    series: "\u7CFB\u5217"
  };
  var runWithConcurrency = async (items, limit, worker) => {
    if (!Array.isArray(items) || items.length === 0) {
      return;
    }
    let nextIndex = 0;
    const workerCount = Math.min(limit, items.length);
    const runners = Array.from({ length: workerCount }, async () => {
      while (nextIndex < items.length) {
        const item = items[nextIndex];
        nextIndex += 1;
        await worker(item);
      }
    });
    await Promise.all(runners);
  };
  function JavPage() {
    const [collapsedLeft, setCollapsedLeft] = React7.useState(false);
    const [collapsedRight, setCollapsedRight] = React7.useState(false);
    const [versionInfo, setVersionInfo] = React7.useState({
      version: "v1.0.0",
      build_date: "Unknown",
      asset_version: "",
      auto_reload_frontend: false
    });
    const [activePage, setActivePage] = React7.useState("jav");
    const [logoPreviewOpen, setLogoPreviewOpen] = React7.useState(false);
    const [loading, setLoading] = React7.useState(false);
    const [downloadingMovieIds, setDownloadingMovieIds] = React7.useState({});
    const [moviesData, setMoviesData] = React7.useState(null);
    const [magnetDataMap, setMagnetDataMap] = React7.useState({});
    const [movieImageLoadErrorMap, setMovieImageLoadErrorMap] = React7.useState({});
    const [movieDetailMap, setMovieDetailMap] = React7.useState({});
    const [webdavConnected, setWebdavConnected] = React7.useState(false);
    const [historyData, setHistoryData] = React7.useState(null);
    const [currentPage, setCurrentPage] = React7.useState(1);
    const [lastFilterValues, setLastFilterValues] = React7.useState(null);
    const [lastMagnetSearchValues, setLastMagnetSearchValues] = React7.useState(null);
    const [selectedFilters, setSelectedFilters] = React7.useState([]);
    const [downloadTool, setDownloadTool] = React7.useState(() => {
      try {
        return window.localStorage.getItem("downloadTool") || "pikpak";
      } catch (error) {
        return "pikpak";
      }
    });
    const [downloadToolConfigOpen, setDownloadToolConfigOpen] = React7.useState(false);
    const [aria2Connected, setAria2Connected] = React7.useState(false);
    const [categories, setCategories] = React7.useState({});
    const [actors, setActors] = React7.useState({});
    const [viewMode, setViewMode] = React7.useState("search");
    const [filterForm] = Form6.useForm();
    const [magnetSettingsForm] = Form6.useForm();
    const [webdavForm] = Form6.useForm();
    const [aria2Form] = Form6.useForm();
    const magnetRequestVersionRef = React7.useRef({});
    const resourceLoadVersionRef = React7.useRef(0);
    const [isLoggedIn, setIsLoggedIn] = React7.useState(false);
    const [pikpakCredentials, setPikpakCredentials] = React7.useState(null);
    const [aria2Loading, setAria2Loading] = React7.useState(false);
    const [webdavLoading, setWebdavLoading] = React7.useState(false);
    const [clientConfig, setClientConfig] = React7.useState({
      pikpak: { configured: false, enabled: false, username: "", auto_login: false }
    });
    const autoLoginTriggeredRef = React7.useRef(false);
    React7.useEffect(() => {
      if (window.versionInfo) {
        setVersionInfo(window.versionInfo);
      }
      fetch("/static/categories.json").then((res) => res.json()).then((data) => setCategories(data)).catch(console.error);
      fetch("/static/actors.json").then((res) => res.json()).then((data) => setActors(data)).catch(console.error);
      const savedSession = loadPikPakSession();
      if (savedSession.isLoggedIn && savedSession.credentials) {
        setPikpakCredentials(savedSession.credentials);
        setIsLoggedIn(true);
      }
      const savedWebDavSettings = loadWebDavSettings();
      const savedAria2Settings = loadAria2Settings();
      if (Object.keys(savedWebDavSettings || {}).length > 0) {
        webdavForm.setFieldsValue(savedWebDavSettings);
      }
      if (Object.keys(savedAria2Settings || {}).length > 0) {
        aria2Form.setFieldsValue(savedAria2Settings);
      }
      loadClientSideConfig();
      void loadDownloadToolStatus();
    }, []);
    React7.useEffect(() => {
      if (!versionInfo.auto_reload_frontend || !versionInfo.asset_version) {
        return;
      }
      const timer = window.setInterval(async () => {
        try {
          const response = await fetch("/api/system/info", { cache: "no-store" });
          if (!response.ok) {
            return;
          }
          const data = await response.json();
          const latestAssetVersion = data?.version?.asset_version;
          if (latestAssetVersion && latestAssetVersion !== versionInfo.asset_version) {
            window.location.reload();
          }
        } catch (error) {
        }
      }, 5e3);
      return () => {
        window.clearInterval(timer);
      };
    }, [versionInfo.auto_reload_frontend, versionInfo.asset_version]);
    React7.useEffect(() => {
      if (clientConfig.pikpak.auto_login && clientConfig.pikpak.configured && !isLoggedIn && !autoLoginTriggeredRef.current) {
        autoLoginTriggeredRef.current = true;
        handlePikPakLoginFromConfig({ silent: true });
      }
    }, [clientConfig.pikpak.auto_login, clientConfig.pikpak.configured, isLoggedIn]);
    React7.useEffect(() => {
      if (downloadTool !== "aria2") {
        return void 0;
      }
      const timer = window.setInterval(() => {
        void loadDownloadToolStatus();
      }, 1e4);
      return () => window.clearInterval(timer);
    }, [downloadTool]);
    React7.useEffect(() => {
      if (!logoPreviewOpen) {
        return void 0;
      }
      const handleKeyDown = (event) => {
        if (event.key === "Escape") {
          handleLogoPreviewClose();
        }
      };
      window.addEventListener("keydown", handleKeyDown);
      return () => window.removeEventListener("keydown", handleKeyDown);
    }, [logoPreviewOpen]);
    const displayVersion = versionInfo.version && versionInfo.version.startsWith("v") ? versionInfo.version : `v${versionInfo.version}`;
    const resultMovies = moviesData && Array.isArray(moviesData.movies) ? moviesData.movies : [];
    const resultCount = resultMovies.length;
    const magnetsLoadedCount = resultMovies.filter((movie) => Array.isArray(magnetDataMap[movie.id])).length;
    const magnetsReadyCount = resultMovies.filter((movie) => {
      const magnets = magnetDataMap[movie.id];
      return Array.isArray(magnets) && magnets.length > 0;
    }).length;
    const currentMagnetSource = magnetSettingsForm.getFieldValue("magnetSource") || "javbus";
    const isCurrentDownloadToolReady = downloadTool === "aria2" ? aria2Connected : isLoggedIn || clientConfig.pikpak.configured;
    const handleLogoPreviewOpen = () => {
      setLogoPreviewOpen(true);
    };
    const handleLogoPreviewClose = () => {
      setLogoPreviewOpen(false);
    };
    const buildFilterCondition = (type, value, label) => {
      const normalizedType = String(type || "").trim();
      const normalizedValue = String(value || "").trim();
      if (!normalizedType || !normalizedValue) {
        return null;
      }
      return {
        type: normalizedType,
        value: normalizedValue,
        label: String(label || normalizedValue).trim()
      };
    };
    const addSelectedFilter = (type, value, label) => {
      const nextFilter = buildFilterCondition(type, value, label);
      if (!nextFilter) {
        message7.warning("\u8BF7\u9009\u62E9\u7B5B\u9009\u7C7B\u578B\u5E76\u586B\u5199\u6807\u7B7E");
        return;
      }
      setSelectedFilters((prev) => {
        const exists = prev.some((item) => item.type === nextFilter.type && item.value === nextFilter.value);
        return exists ? prev : [...prev, nextFilter];
      });
    };
    const removeSelectedFilter = (type, value) => {
      setSelectedFilters((prev) => prev.filter((item) => item.type !== type || item.value !== value));
    };
    const buildFilterConditionsForSubmit = (values) => {
      if (selectedFilters.length > 0) {
        return selectedFilters;
      }
      const manualValue = values.filterValue || values.filterValueName;
      const manualLabel = values.filterValueName || values.filterValue;
      const manualFilter = buildFilterCondition(values.filterType, manualValue, manualLabel);
      return manualFilter ? [manualFilter] : [];
    };
    const buildNormalizedFilterValues = (values, page = 1) => {
      const activeFilters = Array.isArray(values.filters) ? values.filters : buildFilterConditionsForSubmit(values);
      const normalized = {
        ...values,
        filters: activeFilters
      };
      if (page > 1) {
        normalized.page = page;
      } else {
        delete normalized.page;
      }
      return normalized;
    };
    const handleAddCurrentFilter = () => {
      const values = filterForm.getFieldsValue(["filterType", "filterValue", "filterValueName"]);
      addSelectedFilter(values.filterType, values.filterValue || values.filterValueName, values.filterValueName);
    };
    const loadClientSideConfig = async () => {
      try {
        const config = await fetchClientConfig();
        setClientConfig(config);
        if (config?.webdav?.configured) {
          if (!webdavForm.getFieldValue("url") && config.webdav.url) {
            webdavForm.setFieldsValue({ url: config.webdav.url });
          }
          if (!webdavForm.getFieldValue("username") && config.webdav.username) {
            webdavForm.setFieldsValue({ username: config.webdav.username });
          }
        }
        if (config?.aria2?.configured && config.aria2.url && !aria2Form.getFieldValue("url")) {
          aria2Form.setFieldsValue({ url: config.aria2.url });
        }
      } catch (error) {
        console.error("Load client config error:", error);
      }
    };
    const loadDownloadToolStatus = async () => {
      try {
        const status = await fetchWithRetry("/api/webdav/status");
        setAria2Connected(!!status.aria2_connected);
        setWebdavConnected(!!status.webdav_connected);
        return status.aria2_connected;
      } catch (error) {
        setAria2Connected(false);
        setWebdavConnected(false);
        return false;
      }
    };
    const buildPikPakAuthPayload = () => {
      if (!isLoggedIn || !pikpakCredentials) {
        return {};
      }
      const payload = {};
      if (pikpakCredentials.username) {
        payload.username = pikpakCredentials.username;
      }
      if (pikpakCredentials.password) {
        payload.password = pikpakCredentials.password;
      }
      return payload;
    };
    const getDownloadToolConfig = (tool = downloadTool) => {
      const normalizedTool = tool === "aria2" ? "aria2" : "pikpak";
      return {
        tool: normalizedTool,
        label: normalizedTool === "aria2" ? "Aria2" : "PikPak",
        requiresLogin: normalizedTool === "pikpak",
        requiresConnection: normalizedTool === "aria2"
      };
    };
    const isDownloadToolReady = async (tool = downloadTool) => {
      const config = getDownloadToolConfig(tool);
      if (config.requiresLogin) {
        if (!isLoggedIn && !clientConfig.pikpak.configured) {
          message7.warning("\u8BF7\u5148\u767B\u5F55 PikPak \u6216\u5728 config.json \u4E2D\u914D\u7F6E\u8D26\u53F7");
          return false;
        }
        return true;
      }
      if (config.requiresConnection) {
        const connected = await loadDownloadToolStatus();
        if (!connected) {
          message7.warning("\u8BF7\u5148\u8FDE\u63A5 Aria2 \u6216\u68C0\u67E5\u914D\u7F6E");
          return false;
        }
        return true;
      }
      return true;
    };
    const dispatchMagnetDownloads = async (payload, tool = downloadTool) => {
      const magnetLinks = Array.isArray(payload) ? payload.map((item) => item.link).filter(Boolean) : [];
      const movieIds = Array.isArray(payload) ? payload.map((item) => item.movie_id).filter(Boolean) : [];
      if (magnetLinks.length === 0) {
        message7.warning("\u6CA1\u6709\u53EF\u7528\u7684\u78C1\u529B\u94FE\u63A5");
        return { success: false, message: "no_magnet" };
      }
      const config = getDownloadToolConfig(tool);
      if (config.requiresLogin) {
        if (!isLoggedIn && !clientConfig.pikpak.configured) {
          message7.warning("\u8BF7\u5148\u767B\u5F55 PikPak \u6216\u5728 config.json \u4E2D\u914D\u7F6E\u8D26\u53F7");
          return { success: false };
        }
      } else if (!aria2Connected) {
        const connected = await loadDownloadToolStatus();
        if (!connected) {
          message7.warning("\u8BF7\u5148\u5728 WebDAV \u4E0B\u8F7D\u9875\u9762\u8FDE\u63A5 Aria2");
          return { success: false };
        }
      }
      const response = await fetch(
        config.tool === "aria2" ? "/api/aria2/download-magnets" : "/api/pikpak/download",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            magnet_links: magnetLinks,
            movie_ids: movieIds,
            ...config.tool === "pikpak" ? buildPikPakAuthPayload() : {}
          })
        }
      );
      return await response.json();
    };
    const handleDownloadToolChange = (toolValue) => {
      const nextTool = toolValue === "aria2" ? "aria2" : "pikpak";
      setDownloadTool(nextTool);
      try {
        window.localStorage.setItem("downloadTool", nextTool);
      } catch (error) {
      }
    };
    const openDownloadToolConfig = () => {
      setDownloadToolConfigOpen(true);
    };
    const closeDownloadToolConfig = () => {
      setDownloadToolConfigOpen(false);
    };
    const fetchMovieDetail = async (id, resourceVersion = null) => {
      try {
        const detail = await fetchWithRetry(`/api/movies/${encodeURIComponent(id)}`);
        if (detail && detail.id) {
          if (resourceVersion !== null && resourceLoadVersionRef.current !== resourceVersion) {
            return;
          }
          setMovieDetailMap((prev) => ({ ...prev, [id]: detail }));
        }
      } catch (e) {
      }
    };
    const getMagnetSettings = () => {
      const magnetSource = magnetSettingsForm.getFieldValue("magnetSource") || "javbus";
      const exclude4k = !!magnetSettingsForm.getFieldValue("globalExclude4k");
      return { magnetSource, exclude4k };
    };
    const nextMagnetRequestVersion = (key) => {
      const nextVersion = (magnetRequestVersionRef.current[key] || 0) + 1;
      magnetRequestVersionRef.current[key] = nextVersion;
      return nextVersion;
    };
    const isLatestMagnetRequestVersion = (key, version) => magnetRequestVersionRef.current[key] === version;
    const buildMagnetDataMapFromResults = (magnetResults = []) => {
      const nextMap = {};
      magnetResults.forEach((result) => {
        if (!result || !result.movie_id || !result.link) {
          return;
        }
        nextMap[result.movie_id] = [{
          link: result.link,
          title: result.title || `${result.movie_id} - \u6700\u4F73\u8D44\u6E90`,
          size: result.size || "\u672A\u77E5",
          shareDate: result.shareDate || null,
          hasSubtitle: !!result.hasSubtitle
        }];
      });
      return nextMap;
    };
    const searchMovie = async (values) => {
      setLoading(true);
      setLastMagnetSearchValues(null);
      setMagnetDataMap({});
      setMovieDetailMap({});
      try {
        const data = await fetchWithRetry(`/api/movies/${encodeURIComponent(values.keyword)}`);
        setMoviesData(data.movies ? data : { movies: [data] });
        if (data.movies) {
          loadMovieResources(data.movies);
        } else if (data.id) {
          loadMovieResources([data]);
        }
      } catch (error) {
        message7.error("\u641C\u7D22\u5931\u8D25\uFF0C\u8BF7\u7A0D\u540E\u91CD\u8BD5");
      } finally {
        setLoading(false);
      }
    };
    const filterMovies = async (values, page = 1) => {
      const normalizedValues = buildNormalizedFilterValues(values, page);
      const activeFilters = normalizedValues.filters;
      setLoading(true);
      setLastMagnetSearchValues(null);
      if (page === 1) {
        setMagnetDataMap({});
        setMovieDetailMap({});
      }
      try {
        const queryParams = new URLSearchParams();
        if (activeFilters.length > 0) {
          queryParams.append("filters", JSON.stringify(activeFilters));
        } else if (normalizedValues.filterType) {
          queryParams.append("filterType", normalizedValues.filterType);
          queryParams.append("filterValue", normalizedValues.filterValue);
        }
        if (normalizedValues.magnet) queryParams.append("magnet", normalizedValues.magnet);
        if (normalizedValues.type) queryParams.append("type", normalizedValues.type);
        if (normalizedValues.actorCountFilter) queryParams.append("actorCountFilter", normalizedValues.actorCountFilter);
        if (normalizedValues.hasSubtitle) queryParams.append("hasSubtitle", normalizedValues.hasSubtitle);
        if (page > 1) queryParams.append("page", page);
        const apiUrl = normalizedValues.fetchMode === "all" ? `/api/movies/all?${queryParams.toString()}` : `/api/movies?${queryParams.toString()}`;
        const data = await fetchWithRetry(apiUrl);
        setMoviesData(data);
        setCurrentPage(page);
        setLastFilterValues(normalizedValues);
        if (data.movies) {
          loadMovieResources(data.movies);
        }
      } catch (error) {
        message7.error("\u7B5B\u9009\u5931\u8D25\uFF0C\u8BF7\u7A0D\u540E\u91CD\u8BD5");
      } finally {
        setLoading(false);
      }
    };
    const handleFilterPageChange = (nextPage) => {
      if (!lastFilterValues || loading) {
        return;
      }
      if (nextPage < 1) {
        return;
      }
      const formValues = filterForm.getFieldsValue(true);
      const normalizedValues = {
        ...lastFilterValues,
        ...formValues
      };
      const syncedValues = buildNormalizedFilterValues(normalizedValues, nextPage);
      filterMovies(syncedValues, nextPage);
    };
    const searchMagnet = async (values) => {
      setLoading(true);
      setLastMagnetSearchValues(values);
      const requestVersion = nextMagnetRequestVersion(values.movieId);
      try {
        const { magnetSource, exclude4k } = getMagnetSettings();
        setMoviesData({ movies: [{ id: values.movieId, title: `\u67E5\u8BE2\u78C1\u529B: ${values.movieId}` }] });
        setMagnetDataMap({});
        const queryParams = new URLSearchParams();
        queryParams.append("source", magnetSource);
        if (exclude4k) queryParams.append("exclude4k", "true");
        if (values.sortBy) queryParams.append("sortBy", values.sortBy);
        if (values.sortOrder) queryParams.append("sortOrder", values.sortOrder);
        if (values.hasSubtitle) queryParams.append("hasSubtitle", values.hasSubtitle);
        if (magnetSource !== "cilisousuo") {
          const movieData = await fetchWithRetry(`/api/movies/${encodeURIComponent(values.movieId)}`);
          if (!movieData || !movieData.gid || movieData.uc === void 0) {
            throw new Error("\u65E0\u6CD5\u83B7\u53D6\u5F71\u7247\u8BE6\u60C5\u6216\u5FC5\u8981\u53C2\u6570");
          }
          queryParams.append("gid", movieData.gid);
          queryParams.append("uc", movieData.uc);
        }
        const magnets = await fetchWithRetry(`/api/magnets/${encodeURIComponent(values.movieId)}?${queryParams.toString()}`);
        if (!isLatestMagnetRequestVersion(values.movieId, requestVersion)) {
          return;
        }
        setMagnetDataMap({ [values.movieId]: magnets || [] });
      } catch (error) {
        if (!isLatestMagnetRequestVersion(values.movieId, requestVersion)) {
          return;
        }
        message7.error("\u83B7\u53D6\u78C1\u529B\u94FE\u63A5\u5931\u8D25");
        setMoviesData(null);
      } finally {
        setLoading(false);
      }
    };
    const fetchBestMagnet = async (id, gid, uc) => {
      const { magnetSource, exclude4k } = getMagnetSettings();
      const requestVersion = nextMagnetRequestVersion(id);
      const queryParams = new URLSearchParams();
      queryParams.append("source", magnetSource);
      if (exclude4k) queryParams.append("exclude4k", "true");
      if (magnetSource !== "cilisousuo") {
        if (gid) queryParams.append("gid", gid);
        if (uc !== void 0) queryParams.append("uc", uc);
      }
      queryParams.append("sortBy", "size");
      queryParams.append("sortOrder", "desc");
      const hasSubtitle = filterForm.getFieldValue("hasSubtitle");
      if (hasSubtitle) queryParams.append("hasSubtitle", hasSubtitle);
      try {
        const data = await fetchWithRetry(`/api/magnets/${encodeURIComponent(id)}?${queryParams.toString()}`);
        if (!isLatestMagnetRequestVersion(id, requestVersion)) {
          return;
        }
        setMagnetDataMap((prev) => ({ ...prev, [id]: data || [] }));
      } catch (error) {
        if (!isLatestMagnetRequestVersion(id, requestVersion)) {
          return;
        }
        setMagnetDataMap((prev) => ({ ...prev, [id]: [] }));
      }
    };
    const loadMovieResources = (movies = []) => {
      const resourceVersion = resourceLoadVersionRef.current + 1;
      resourceLoadVersionRef.current = resourceVersion;
      void runWithConcurrency(movies, RESOURCE_REQUEST_CONCURRENCY, async (movie) => {
        await Promise.all([
          fetchBestMagnet(movie.id, movie.gid, movie.uc),
          fetchMovieDetail(movie.id, resourceVersion)
        ]);
      });
    };
    const handleMagnetSettingsChange = () => {
      if (lastMagnetSearchValues && moviesData && moviesData.movies && moviesData.movies.length === 1 && moviesData.movies[0].id === lastMagnetSearchValues.movieId) {
        searchMagnet(lastMagnetSearchValues);
        return;
      }
      if (!moviesData || !moviesData.movies || moviesData.movies.length === 0) {
        return;
      }
      setMagnetDataMap({});
      void runWithConcurrency(moviesData.movies, RESOURCE_REQUEST_CONCURRENCY, (movie) => fetchBestMagnet(movie.id, movie.gid, movie.uc));
    };
    const handlePikPakLogin = async (values) => {
      setLoading(true);
      try {
        const response = await fetch("/api/pikpak/login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(values)
        });
        const result = await response.json();
        if (result.success) {
          setIsLoggedIn(true);
          setPikpakCredentials(values);
          persistPikPakSession(values);
          message7.success("\u767B\u5F55\u6210\u529F\uFF01");
        } else {
          message7.error("\u767B\u5F55\u5931\u8D25: " + (result.message || "\u672A\u77E5\u9519\u8BEF"));
        }
      } catch (error) {
        message7.error("\u767B\u5F55\u5F02\u5E38");
      } finally {
        setLoading(false);
      }
    };
    const handleLogout = () => {
      clearPikPakSession();
      setIsLoggedIn(false);
      setPikpakCredentials(null);
      message7.info("\u5DF2\u9000\u51FA\u767B\u5F55");
    };
    const handleRecognizeMovie = async (values) => {
      setLoading(true);
      setMoviesData(null);
      setMagnetDataMap({});
      try {
        const { magnetSource } = getMagnetSettings();
        const shouldAutoDownload = values.autoDownload || false;
        const requestBody = {
          html_content: values.htmlContent,
          auto_download: shouldAutoDownload && downloadTool !== "aria2",
          magnet_source: magnetSource,
          has_subtitle_filter: values.hasSubtitle || null,
          exclude_4k: values.exclude4k || false
        };
        if (shouldAutoDownload && isLoggedIn && pikpakCredentials && downloadTool !== "aria2") {
          Object.assign(requestBody, buildPikPakAuthPayload());
        }
        const response = await fetch("/api/movies/recognize", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(requestBody)
        });
        const data = await response.json();
        if (data.error) {
          message7.error(`\u9519\u8BEF: ${data.error}`);
        } else {
          setMoviesData(data);
          if (data.magnet_results) {
            setMagnetDataMap(buildMagnetDataMapFromResults(data.magnet_results));
          }
          message7.success("\u8BC6\u522B\u5B8C\u6210");
          if (shouldAutoDownload && downloadTool === "aria2" && data.magnet_results?.length > 0) {
            const dispatchResult = await dispatchMagnetDownloads(data.magnet_results);
            if (dispatchResult && dispatchResult.success) {
              message7.success(dispatchResult.message || "\u5DF2\u63D0\u4EA4 Aria2 \u4E0B\u8F7D\u4EFB\u52A1");
            } else {
              message7.error(`\u4E0B\u8F7D\u5931\u8D25: ${dispatchResult?.message || "\u672A\u77E5\u9519\u8BEF"}`);
            }
          }
        }
      } catch (error) {
        message7.error("\u5F71\u7247\u8BC6\u522B\u5931\u8D25");
      } finally {
        setLoading(false);
      }
    };
    const handleCodeDownload = async (values) => {
      setLoading(true);
      setMoviesData(null);
      setMagnetDataMap({});
      try {
        const { magnetSource } = getMagnetSettings();
        const shouldAutoDownload = values.autoDownload || false;
        const requestBody = {
          movie_codes: values.movieCodes,
          auto_download: shouldAutoDownload && downloadTool !== "aria2",
          magnet_source: magnetSource,
          has_subtitle_filter: values.hasSubtitle || null,
          exclude_4k: values.exclude4k || false
        };
        if (shouldAutoDownload && isLoggedIn && pikpakCredentials && downloadTool !== "aria2") {
          Object.assign(requestBody, buildPikPakAuthPayload());
        }
        const response = await fetch("/api/movies/download-by-codes", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(requestBody)
        });
        const data = await response.json();
        if (data.error) {
          message7.error(`\u9519\u8BEF: ${data.error}`);
          return;
        }
        const movies = (data.found_movies || []).map((movie) => ({
          id: movie.id,
          title: movie.title,
          date: movie.date,
          img: movie.img,
          status: movie.status
        }));
        setMoviesData({ movies, magnet_results: data.magnet_results || [], download_result: data.download_result, not_found_codes: data.not_found_codes || [] });
        if (data.magnet_results) {
          setMagnetDataMap(buildMagnetDataMapFromResults(data.magnet_results));
        }
        message7.success(data.message || "\u5904\u7406\u5B8C\u6210");
        if (shouldAutoDownload && downloadTool === "aria2" && data.magnet_results?.length > 0) {
          const dispatchResult = await dispatchMagnetDownloads(data.magnet_results);
          if (dispatchResult && dispatchResult.success) {
            message7.success(dispatchResult.message || "\u5DF2\u63D0\u4EA4 Aria2 \u4E0B\u8F7D\u4EFB\u52A1");
          } else {
            message7.error(`\u4E0B\u8F7D\u5931\u8D25: ${dispatchResult?.message || "\u672A\u77E5\u9519\u8BEF"}`);
          }
        }
      } catch (error) {
        message7.error("\u756A\u53F7\u5904\u7406\u5931\u8D25");
      } finally {
        setLoading(false);
      }
    };
    const handlePikPakLoginFromConfig = async ({ silent = false } = {}) => {
      setLoading(true);
      try {
        const response = await fetch("/api/pikpak/login-config", {
          method: "POST"
        });
        const result = await response.json();
        if (result.success) {
          const sessionProfile = { username: result.username || clientConfig.pikpak.username || "", fromConfig: true };
          setIsLoggedIn(true);
          setPikpakCredentials(sessionProfile);
          persistPikPakSession(sessionProfile);
          if (!silent) {
            message7.success("\u5DF2\u4F7F\u7528\u914D\u7F6E\u767B\u5F55 PikPak");
          }
        } else if (!silent) {
          message7.error("\u767B\u5F55\u5931\u8D25: " + (result.message || "\u672A\u77E5\u9519\u8BEF"));
        }
      } catch (error) {
        if (!silent) {
          message7.error("\u914D\u7F6E\u767B\u5F55\u5F02\u5E38");
        }
      } finally {
        setLoading(false);
      }
    };
    const handleDownloadAllMovies = async () => {
      if (!await isDownloadToolReady()) {
        return;
      }
      if (!moviesData || !moviesData.movies || moviesData.movies.length === 0) {
        message7.warning("\u6CA1\u6709\u53EF\u4E0B\u8F7D\u7684\u5F71\u7247");
        return;
      }
      const magnetLinks = [];
      const movieIds = [];
      for (const movie of moviesData.movies) {
        if (movie.status === "local_exists" || movie.status === "already_downloaded" || movie.is_downloaded || movie.in_local_library) {
          continue;
        }
        const magnets = magnetDataMap[movie.id];
        if (magnets && magnets.length > 0) {
          const best = magnets[0];
          const link = best.link;
          if (link) {
            magnetLinks.push(link);
            movieIds.push(movie.id);
          }
        }
      }
      if (magnetLinks.length === 0) {
        message7.warning("\u6682\u65E0\u53EF\u7528\u7684\u78C1\u529B\u94FE\u63A5\uFF0C\u8BF7\u7B49\u5F85\u52A0\u8F7D\u5B8C\u6210");
        return;
      }
      try {
        setLoading(true);
        const result = await dispatchMagnetDownloads(
          magnetLinks.map((link, index) => ({ link, movie_id: movieIds[index] })),
          downloadTool
        );
        if (result.success) {
          message7.success(result.message || `\u5DF2\u6DFB\u52A0 ${magnetLinks.length} \u4E2A\u4E0B\u8F7D\u4EFB\u52A1`);
        } else {
          message7.error("\u4E0B\u8F7D\u5931\u8D25: " + (result.message || "\u672A\u77E5\u9519\u8BEF"));
        }
      } catch (error) {
        message7.error("\u4E0B\u8F7D\u8BF7\u6C42\u5931\u8D25");
      } finally {
        setLoading(false);
      }
    };
    const handleWebdavConnect = async (values) => {
      setWebdavLoading(true);
      const formData = new FormData();
      formData.append("webdav_url", values.url || "");
      formData.append("username", values.username || "");
      formData.append("password", values.password || "");
      try {
        const response = await fetch("/api/webdav/connect", {
          method: "POST",
          body: formData
        });
        const result = await response.json();
        if (result.success) {
          saveWebDavSettings(values);
          setWebdavConnected(true);
          loadDownloadToolStatus();
          message7.success("WebDAV\u8FDE\u63A5\u6210\u529F");
        } else {
          setWebdavConnected(false);
          message7.error(result.message || "WebDAV\u8FDE\u63A5\u5931\u8D25");
        }
      } catch (error) {
        setWebdavConnected(false);
        message7.error("WebDAV\u8FDE\u63A5\u5F02\u5E38");
      } finally {
        setWebdavLoading(false);
      }
    };
    const handleAria2Connect = async (values) => {
      setAria2Loading(true);
      const formData = new FormData();
      formData.append("aria2_url", values.url || "");
      formData.append("aria2_secret", values.secret || "");
      try {
        const response = await fetch("/api/aria2/connect", {
          method: "POST",
          body: formData
        });
        const result = await response.json();
        if (result.success) {
          saveAria2Settings(values);
          setAria2Connected(true);
          loadDownloadToolStatus();
          message7.success("Aria2\u8FDE\u63A5\u6210\u529F");
        } else {
          setAria2Connected(false);
          message7.error(result.message || "Aria2\u8FDE\u63A5\u5931\u8D25");
        }
      } catch (error) {
        setAria2Connected(false);
        message7.error("Aria2\u8FDE\u63A5\u5F02\u5E38");
      } finally {
        setAria2Loading(false);
      }
    };
    const handleWebdavConnectFromConfig = async ({ silent = false } = {}) => {
      setWebdavLoading(true);
      try {
        const response = await fetch("/api/webdav/connect-config", { method: "POST" });
        const result = await response.json();
        if (result.success) {
          if (clientConfig.webdav?.url || clientConfig.webdav?.username) {
            webdavForm.setFieldsValue({
              url: clientConfig.webdav.url || "",
              username: clientConfig.webdav.username || ""
            });
          }
          setWebdavConnected(true);
          loadDownloadToolStatus();
          if (!silent) {
            message7.success("\u5DF2\u4F7F\u7528\u914D\u7F6E\u8FDE\u63A5 WebDAV");
          }
        } else {
          setWebdavConnected(false);
          if (!silent) {
            message7.error(result.message || "\u4F7F\u7528\u914D\u7F6E\u8FDE\u63A5\u5931\u8D25");
          }
        }
      } catch (error) {
        setWebdavConnected(false);
        if (!silent) {
          message7.error("WebDAV \u914D\u7F6E\u8FDE\u63A5\u5F02\u5E38");
        }
      } finally {
        setWebdavLoading(false);
      }
    };
    const handleAria2ConnectFromConfig = async ({ silent = false } = {}) => {
      setAria2Loading(true);
      try {
        const response = await fetch("/api/aria2/connect-config", { method: "POST" });
        const result = await response.json();
        if (result.success) {
          if (clientConfig.aria2?.url) {
            aria2Form.setFieldsValue({ url: clientConfig.aria2.url });
          }
          setAria2Connected(true);
          loadDownloadToolStatus();
          if (!silent) {
            message7.success("\u5DF2\u4F7F\u7528\u914D\u7F6E\u8FDE\u63A5 Aria2");
          }
        } else {
          setAria2Connected(false);
          if (!silent) {
            message7.error(result.message || "\u4F7F\u7528\u914D\u7F6E\u8FDE\u63A5\u5931\u8D25");
          }
        }
      } catch (error) {
        setAria2Connected(false);
        if (!silent) {
          message7.error("Aria2 \u914D\u7F6E\u8FDE\u63A5\u5F02\u5E38");
        }
      } finally {
        setAria2Loading(false);
      }
    };
    const handleDownloadMovie = async (movie) => {
      if (!await isDownloadToolReady()) {
        return;
      }
      if (!movie || !movie.id) {
        return;
      }
      const magnets = magnetDataMap[movie.id];
      const bestMagnet = magnets && magnets.length > 0 ? magnets[0] : null;
      if (!bestMagnet || !bestMagnet.link) {
        message7.warning("\u8BE5\u5F71\u7247\u6682\u65E0\u53EF\u7528\u78C1\u529B\u94FE\u63A5");
        return;
      }
      if (movie.status === "local_exists" || movie.status === "already_downloaded" || movie.is_downloaded || movie.in_local_library) {
        message7.info("\u8BE5\u5F71\u7247\u5DF2\u4E0B\u8F7D\u6216\u672C\u5730\u5DF2\u5B58\u5728");
        return;
      }
      setDownloadingMovieIds((prev) => ({ ...prev, [movie.id]: true }));
      try {
        const result = await dispatchMagnetDownloads([{ link: bestMagnet.link, movie_id: movie.id }], downloadTool);
        if (result.success) {
          message7.success(result.message || `${movie.id} \u5DF2\u6DFB\u52A0\u4E0B\u8F7D\u4EFB\u52A1`);
        } else {
          message7.error("\u4E0B\u8F7D\u5931\u8D25: " + (result.message || "\u672A\u77E5\u9519\u8BEF"));
        }
      } catch (error) {
        message7.error("\u4E0B\u8F7D\u8BF7\u6C42\u5931\u8D25");
      } finally {
        setDownloadingMovieIds((prev) => ({ ...prev, [movie.id]: false }));
      }
    };
    const fetchHistory = async () => {
      setLoading(true);
      setViewMode("history");
      try {
        const data = await fetchWithRetry("/api/history");
        setHistoryData(data);
        message7.success("\u5DF2\u52A0\u8F7D\u5386\u53F2\u8BB0\u5F55");
      } catch (error) {
        message7.error("\u83B7\u53D6\u5386\u53F2\u8BB0\u5F55\u5931\u8D25");
      } finally {
        setLoading(false);
      }
    };
    const handleClearHistory = async () => {
      setLoading(true);
      try {
        const response = await fetch("/api/history", { method: "DELETE" });
        const result = await response.json();
        if (result.success) {
          message7.success("\u5386\u53F2\u8BB0\u5F55\u5DF2\u6E05\u7A7A");
          setHistoryData([]);
        } else {
          message7.error("\u6E05\u7A7A\u5386\u53F2\u8BB0\u5F55\u5931\u8D25: " + (result.message || "\u672A\u77E5\u9519\u8BEF"));
        }
      } catch (error) {
        message7.error("\u8BF7\u6C42\u6E05\u7A7A\u5386\u53F2\u8BB0\u5F55\u5931\u8D25");
      } finally {
        setLoading(false);
      }
    };
    const renderContent = () => {
      if (viewMode === "history") {
        return renderHistory();
      }
      if (viewMode === "browseCategory") {
        return renderCategoryGroups();
      }
      if (viewMode === "browseActor") {
        return renderActorsList();
      }
      if (loading) {
        return /* @__PURE__ */ React7.createElement("div", { className: "jav-state-panel" }, /* @__PURE__ */ React7.createElement(Spin2, { size: "large" }), /* @__PURE__ */ React7.createElement(Text7, { type: "secondary" }, "\u6B63\u5728\u641C\u7D22..."));
      }
      if (!moviesData) {
        return /* @__PURE__ */ React7.createElement("div", { className: "jav-state-panel" }, /* @__PURE__ */ React7.createElement(Text7, { type: "secondary" }, "\u6CA1\u6709\u4EFB\u4F55\u7ED3\u679C\uFF0C\u8BF7\u5728\u5DE6\u4FA7\u9009\u62E9\u67E5\u8BE2\u529F\u80FD\u5F00\u59CB\u641C\u7D22"));
      }
      if (moviesData.error) {
        return /* @__PURE__ */ React7.createElement("div", { className: "jav-state-panel" }, /* @__PURE__ */ React7.createElement(Text7, { type: "danger" }, moviesData.error));
      }
      if (moviesData.id && !moviesData.gid && !moviesData.uc && moviesData.avatar) {
        return /* @__PURE__ */ React7.createElement(Card6, { style: { marginBottom: 16, textAlign: "center" } }, /* @__PURE__ */ React7.createElement("img", { src: moviesData.avatar, alt: moviesData.name, style: { width: 150, height: 150, borderRadius: "50%", objectFit: "cover" } }), /* @__PURE__ */ React7.createElement(Title6, { level: 4, style: { marginTop: 16 } }, moviesData.name));
      }
      if (moviesData.movies && moviesData.movies.length > 0) {
        const isPageMode = lastFilterValues && lastFilterValues.fetchMode !== "all";
        const canGoPrev = isPageMode && lastFilterValues && currentPage > 1;
        const canGoNext = isPageMode && lastFilterValues && moviesData.movies.length >= 30;
        const paginationBar = isPageMode && lastFilterValues && /* @__PURE__ */ React7.createElement("div", { className: "jav-pagination-bar" }, /* @__PURE__ */ React7.createElement(
          Button7,
          {
            icon: /* @__PURE__ */ React7.createElement(Icon6, { as: ArrowLeftOutlined2 }),
            disabled: !canGoPrev || loading,
            onClick: () => handleFilterPageChange(currentPage - 1)
          },
          "\u4E0A\u4E00\u9875"
        ), /* @__PURE__ */ React7.createElement(Text7, { type: "secondary" }, "\u7B2C ", currentPage, " \u9875"), /* @__PURE__ */ React7.createElement(
          Button7,
          {
            icon: /* @__PURE__ */ React7.createElement(Icon6, { as: ArrowRightOutlined }),
            disabled: !canGoNext || loading,
            onClick: () => handleFilterPageChange(currentPage + 1)
          },
          "\u4E0B\u4E00\u9875"
        ));
        return /* @__PURE__ */ React7.createElement("div", { className: "jav-results-list" }, /* @__PURE__ */ React7.createElement("div", { className: "jav-results-meta" }, /* @__PURE__ */ React7.createElement(Text7, { type: "secondary" }, "\u5171 ", moviesData.movies.length, " \u90E8")), paginationBar, moviesData.movies.map((movie) => renderMovieCard(movie)), paginationBar);
      }
      return /* @__PURE__ */ React7.createElement("div", { className: "jav-state-panel" }, /* @__PURE__ */ React7.createElement(Text7, { type: "secondary" }, "\u672A\u627E\u5230\u76F8\u5173\u6570\u636E"));
    };
    const handleCategorySelect = (code, name) => {
      filterForm.setFieldsValue({ filterType: "genre", filterValue: code, filterValueName: name });
      addSelectedFilter("genre", code, name);
      setViewMode("search");
    };
    const handleActorSelect = (code, name) => {
      filterForm.setFieldsValue({ filterType: "star", filterValue: code, filterValueName: name });
      addSelectedFilter("star", code, name);
      setViewMode("search");
    };
    const renderCategoryGroups = () => {
      return /* @__PURE__ */ React7.createElement("div", null, /* @__PURE__ */ React7.createElement("div", { className: "jav-section-header" }, /* @__PURE__ */ React7.createElement(Title6, { level: 4, style: { margin: 0 } }, "\u6D4F\u89C8\u7C7B\u522B"), /* @__PURE__ */ React7.createElement(Button7, { icon: /* @__PURE__ */ React7.createElement(Icon6, { as: ArrowLeftOutlined2 }), onClick: () => setViewMode("search") }, "\u8FD4\u56DE\u67E5\u8BE2")), /* @__PURE__ */ React7.createElement(Divider4, { className: "jav-section-divider" }), Object.keys(categories).map((group) => /* @__PURE__ */ React7.createElement("div", { key: group, style: { marginBottom: 24 } }, /* @__PURE__ */ React7.createElement(Title6, { level: 5 }, group), /* @__PURE__ */ React7.createElement(
        List3,
        {
          grid: { gutter: 16, xs: 2, sm: 3, md: 4, lg: 5, xl: 6 },
          dataSource: categories[group],
          renderItem: (cat) => /* @__PURE__ */ React7.createElement(List3.Item, null, /* @__PURE__ */ React7.createElement(
            Card6,
            {
              hoverable: true,
              size: "small",
              className: "jav-picker-card",
              onClick: () => handleCategorySelect(cat.code, cat.name)
            },
            /* @__PURE__ */ React7.createElement(Text7, { strong: true, style: { fontSize: 16 } }, cat.name)
          ))
        }
      ))));
    };
    const renderHistory = () => {
      return /* @__PURE__ */ React7.createElement("div", null, /* @__PURE__ */ React7.createElement("div", { className: "jav-section-header" }, /* @__PURE__ */ React7.createElement(Title6, { level: 4, style: { margin: 0 } }, "\u5386\u53F2\u4E0B\u8F7D\u8BB0\u5F55"), /* @__PURE__ */ React7.createElement(Space7, null, /* @__PURE__ */ React7.createElement(
        Popconfirm5,
        {
          title: "\u786E\u5B9A\u8981\u6E05\u7A7A\u6240\u6709\u5386\u53F2\u8BB0\u5F55\u5417\uFF1F",
          onConfirm: handleClearHistory,
          okText: "\u786E\u5B9A",
          cancelText: "\u53D6\u6D88"
        },
        /* @__PURE__ */ React7.createElement(Button7, { danger: true, disabled: !historyData || historyData.length === 0, loading }, "\u6E05\u7A7A\u5386\u53F2\u8BB0\u5F55")
      ), /* @__PURE__ */ React7.createElement(Button7, { icon: /* @__PURE__ */ React7.createElement(Icon6, { as: ArrowLeftOutlined2 }), onClick: () => setViewMode("search") }, "\u8FD4\u56DE\u67E5\u8BE2"))), /* @__PURE__ */ React7.createElement(Divider4, { className: "jav-section-divider" }), /* @__PURE__ */ React7.createElement(
        antd7.Table,
        {
          dataSource: historyData || [],
          rowKey: "movie_id",
          pagination: { pageSize: 20 },
          columns: [
            {
              title: "\u5F71\u7247\u756A\u53F7",
              dataIndex: "movie_id",
              key: "movie_id",
              render: (text) => /* @__PURE__ */ React7.createElement(Text7, { strong: true }, text)
            },
            {
              title: "\u5F71\u7247\u540D",
              dataIndex: "title",
              key: "title",
              render: (text) => text ? /* @__PURE__ */ React7.createElement(Text7, { ellipsis: { tooltip: text }, style: { maxWidth: 200 } }, text) : "-"
            },
            {
              title: "\u6F14\u5458",
              dataIndex: "stars",
              key: "stars",
              render: (tags) => /* @__PURE__ */ React7.createElement("div", { style: { display: "flex", flexWrap: "wrap", gap: "4px" } }, tags && Array.isArray(tags) ? tags.map((tag) => /* @__PURE__ */ React7.createElement(Tag6, { color: "magenta", key: tag }, tag)) : "-")
            },
            {
              title: "\u7C7B\u578B",
              dataIndex: "genres",
              key: "genres",
              render: (tags) => /* @__PURE__ */ React7.createElement("div", { style: { display: "flex", flexWrap: "wrap", gap: "4px" } }, tags && Array.isArray(tags) ? tags.map((tag) => /* @__PURE__ */ React7.createElement(Tag6, { color: "cyan", key: tag }, tag)) : "-")
            },
            {
              title: "\u53D1\u5E03\u65F6\u95F4",
              dataIndex: "date",
              key: "date",
              render: (text) => text || "-"
            },
            {
              title: "\u4E0B\u8F7D\u65F6\u95F4",
              dataIndex: "download_time",
              key: "download_time",
              render: (text) => {
                if (!text) return "\u672A\u77E5\u65F6\u95F4";
                const d = new Date(text);
                return isNaN(d.getTime()) ? text : d.toLocaleString();
              }
            },
            {
              title: "\u64CD\u4F5C",
              key: "action",
              render: (_, record) => /* @__PURE__ */ React7.createElement(Button7, { type: "primary", size: "small", onClick: () => {
                setViewMode("search");
                searchMovie({ keyword: record.movie_id });
              } }, "\u8BE6\u60C5\u641C\u7D22")
            }
          ]
        }
      ));
    };
    const renderActorsList = () => {
      return /* @__PURE__ */ React7.createElement("div", null, /* @__PURE__ */ React7.createElement("div", { className: "jav-section-header" }, /* @__PURE__ */ React7.createElement(Title6, { level: 4, style: { margin: 0 } }, "\u6D4F\u89C8\u6F14\u5458"), /* @__PURE__ */ React7.createElement(Button7, { icon: /* @__PURE__ */ React7.createElement(Icon6, { as: ArrowLeftOutlined2 }), onClick: () => setViewMode("search") }, "\u8FD4\u56DE\u67E5\u8BE2")), /* @__PURE__ */ React7.createElement(Divider4, { className: "jav-section-divider" }), /* @__PURE__ */ React7.createElement(
        List3,
        {
          grid: { gutter: 16, xs: 2, sm: 3, md: 4, lg: 5, xl: 5, xxl: 5 },
          dataSource: Array.isArray(actors) ? actors : Object.values(actors).flat(),
          renderItem: (actor) => {
            const actorName2 = actor.name || actor;
            const actorCode = actor.code || actor;
            const fallbackImage = /* @__PURE__ */ React7.createElement("div", { className: "jav-actor-fallback" }, /* @__PURE__ */ React7.createElement(Text7, { type: "secondary" }, "\u65E0\u5934\u50CF"));
            return /* @__PURE__ */ React7.createElement(List3.Item, null, /* @__PURE__ */ React7.createElement(
              Card6,
              {
                hoverable: true,
                className: "jav-actor-card",
                cover: actor.avatar ? /* @__PURE__ */ React7.createElement("img", { alt: actorName2, src: actor.avatar, className: "jav-actor-cover" }) : fallbackImage,
                onClick: () => handleActorSelect(actorCode, actorName2),
                size: "small"
              },
              /* @__PURE__ */ React7.createElement(Card6.Meta, { title: actorName2, style: { textAlign: "center" } })
            ));
          }
        }
      ));
    };
    const renderMovieCard = (movie) => {
      const magnets = magnetDataMap[movie.id];
      const hasMagnets = magnets && magnets.length > 0;
      const bestMagnet = hasMagnets ? magnets[0] : null;
      const magnetLoading = !magnets;
      const detail = movieDetailMap[movie.id];
      const isDownloadingMovie = !!downloadingMovieIds[movie.id];
      const isMovieDownloaded = movie.status === "local_exists" || movie.status === "already_downloaded" || movie.is_downloaded || movie.in_local_library;
      const rawMovieImage = movie && movie.img || detail && detail.img || "";
      const movieImage = rawMovieImage && /^https?:/i.test(rawMovieImage) ? `/api/image-proxy?url=${encodeURIComponent(rawMovieImage)}` : rawMovieImage;
      const showImage = movieImage && !movieImageLoadErrorMap[movie.id];
      const stars = detail && detail.stars ? detail.stars.map((s) => s.name || s).filter(Boolean) : [];
      const genres = detail && detail.genres ? detail.genres.map((g) => g.name || g).filter(Boolean) : [];
      return /* @__PURE__ */ React7.createElement(
        Card6,
        {
          key: movie.id,
          size: "small",
          hoverable: true,
          className: "jav-movie-card",
          styles: { body: { padding: "10px 16px" } }
        },
        /* @__PURE__ */ React7.createElement("div", { className: "jav-movie-content-row", style: { display: "flex", alignItems: "stretch", gap: 12 } }, /* @__PURE__ */ React7.createElement(
          "div",
          {
            style: {
              flex: "0 0 126px",
              width: 126,
              aspectRatio: "2 / 3",
              borderRadius: 6,
              overflow: "hidden",
              background: "#f5f5f5",
              border: "1px solid #e5e7eb"
            }
          },
          showImage ? /* @__PURE__ */ React7.createElement(
            "img",
            {
              src: movieImage,
              alt: movie.title || movie.full_title || movie.id,
              style: { width: "100%", height: "100%", objectFit: "cover", display: "block" },
              onError: () => setMovieImageLoadErrorMap((prev) => {
                if (prev[movie.id]) {
                  return prev;
                }
                return { ...prev, [movie.id]: true };
              }),
              loading: "lazy"
            }
          ) : /* @__PURE__ */ React7.createElement("div", { style: {
            width: "100%",
            height: "100%",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "#8c8c8c",
            fontSize: 12
          } }, /* @__PURE__ */ React7.createElement(Text7, { type: "secondary", style: { fontSize: 12 } }, "\u6682\u65E0\u5C01\u9762"))
        ), /* @__PURE__ */ React7.createElement("div", { style: { flex: 1, minWidth: 0, display: "flex", flexDirection: "column" } }, /* @__PURE__ */ React7.createElement("div", { className: "jav-movie-row jav-movie-meta-row" }, /* @__PURE__ */ React7.createElement(Tag6, { color: "blue", style: { fontWeight: 700, fontSize: 13, margin: 0 } }, movie.id), (movie.status === "local_exists" || movie.in_local_library) && /* @__PURE__ */ React7.createElement(Tag6, { color: "purple", style: { margin: 0, fontSize: 12 } }, "\u672C\u5730\u5DF2\u6709"), (movie.status === "already_downloaded" || movie.is_downloaded) && /* @__PURE__ */ React7.createElement(Tag6, { color: "green", style: { margin: 0, fontSize: 12 } }, "\u5DF2\u4E0B\u8F7D"), movie.date && /* @__PURE__ */ React7.createElement(Text7, { type: "secondary", style: { fontSize: 12 } }, movie.date)), /* @__PURE__ */ React7.createElement(
          Text7,
          {
            strong: true,
            className: "jav-movie-title",
            title: movie.title || movie.full_title
          },
          movie.title || movie.full_title
        ), stars.length > 0 && /* @__PURE__ */ React7.createElement("div", { className: "jav-movie-row" }, /* @__PURE__ */ React7.createElement(Text7, { type: "secondary", style: { fontSize: 12 } }, "\u6F14\u5458"), stars.map((s) => /* @__PURE__ */ React7.createElement(Tag6, { key: s, color: "magenta", style: { margin: 0, fontSize: 12 } }, s))), genres.length > 0 && /* @__PURE__ */ React7.createElement("div", { className: "jav-movie-row" }, /* @__PURE__ */ React7.createElement(Text7, { type: "secondary", style: { fontSize: 12 } }, "\u7C7B\u578B"), genres.slice(0, 8).map((g) => /* @__PURE__ */ React7.createElement(Tag6, { key: g, color: "cyan", style: { margin: 0, fontSize: 12 } }, g)), genres.length > 8 && /* @__PURE__ */ React7.createElement(Text7, { type: "secondary", style: { fontSize: 12 } }, "+", genres.length - 8)), /* @__PURE__ */ React7.createElement(Divider4, { style: { margin: "6px 0" } }), /* @__PURE__ */ React7.createElement("div", { className: "jav-magnet-row" }, magnetLoading && /* @__PURE__ */ React7.createElement(React7.Fragment, null, /* @__PURE__ */ React7.createElement(Spin2, { size: "small" }), /* @__PURE__ */ React7.createElement(Text7, { type: "secondary", style: { fontSize: 12 } }, "\u641C\u7D22\u78C1\u529B\u94FE\u63A5...")), magnets && magnets.length === 0 && /* @__PURE__ */ React7.createElement(Text7, { type: "danger", style: { fontSize: 12 } }, "\u6682\u65E0\u53EF\u7528\u8D44\u6E90"), hasMagnets && /* @__PURE__ */ React7.createElement(React7.Fragment, null, /* @__PURE__ */ React7.createElement(Tag6, { color: "gold", style: { margin: 0, fontSize: 12, flexShrink: 0 } }, "\u6700\u4F73"), bestMagnet.hasSubtitle && /* @__PURE__ */ React7.createElement(Tag6, { color: "green", style: { margin: 0, fontSize: 12, flexShrink: 0 } }, "\u5B57\u5E55"), /* @__PURE__ */ React7.createElement(Text7, { type: "secondary", style: { fontSize: 12, flexShrink: 0 } }, bestMagnet.size), bestMagnet.shareDate && /* @__PURE__ */ React7.createElement(Text7, { type: "secondary", style: { fontSize: 12, flexShrink: 0 } }, bestMagnet.shareDate), /* @__PURE__ */ React7.createElement(
          "a",
          {
            href: bestMagnet.link,
            target: "_blank",
            rel: "noreferrer",
            className: "jav-magnet-link",
            title: bestMagnet.title
          },
          bestMagnet.title
        ))), /* @__PURE__ */ React7.createElement("div", { style: { marginTop: "auto", marginLeft: "auto" } }, /* @__PURE__ */ React7.createElement(
          Button7,
          {
            type: "primary",
            size: "small",
            icon: /* @__PURE__ */ React7.createElement(Icon6, { as: DownloadOutlined4 }),
            loading: isDownloadingMovie,
            disabled: magnetLoading || !bestMagnet || isMovieDownloaded || (downloadTool === "aria2" ? !aria2Connected : !isCurrentDownloadToolReady),
            onClick: () => handleDownloadMovie(movie)
          },
          "\u7ACB\u5373\u4E0B\u8F7D"
        ))))
      );
    };
    const renderStandalonePage = (page) => {
      const pageContent = {
        localScrape: /* @__PURE__ */ React7.createElement(LocalScrapePage, null),
        localLibrary: /* @__PURE__ */ React7.createElement(LocalLibraryPage, null),
        automation: /* @__PURE__ */ React7.createElement(AutomationPage, null),
        settings: /* @__PURE__ */ React7.createElement(SettingsPage, null),
        webdav: /* @__PURE__ */ React7.createElement(WebDavPage, null)
      }[page] || /* @__PURE__ */ React7.createElement(WebDavPage, null);
      return /* @__PURE__ */ React7.createElement(Layout2, { className: "jav-workspace jav-page-workspace" }, /* @__PURE__ */ React7.createElement(Content2, { className: "jav-content jav-page-content" }, /* @__PURE__ */ React7.createElement("section", { className: "jav-results-panel jav-page-panel" }, pageContent)));
    };
    return /* @__PURE__ */ React7.createElement(
      ConfigProvider,
      {
        theme: {
          token: {
            colorPrimary: "#1677ff",
            colorInfo: "#1677ff",
            colorSuccess: "#52c41a",
            colorWarning: "#faad14",
            colorError: "#ff4d4f",
            colorBgLayout: "#f5f5f5",
            colorBorder: "#d9d9d9",
            borderRadius: 6,
            fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif'
          }
        }
      },
      /* @__PURE__ */ React7.createElement("div", { className: "jav-app" }, /* @__PURE__ */ React7.createElement(Layout2, { className: "jav-app-layout" }, /* @__PURE__ */ React7.createElement(Header, { className: "jav-header" }, /* @__PURE__ */ React7.createElement("div", { className: "jav-header-left" }, /* @__PURE__ */ React7.createElement("div", { className: "jav-brand" }, /* @__PURE__ */ React7.createElement(
        "button",
        {
          type: "button",
          className: "jav-brand-logo-button",
          "aria-label": "\u67E5\u770B JavJaeger logo \u5927\u56FE",
          onClick: handleLogoPreviewOpen
        },
        /* @__PURE__ */ React7.createElement("img", { src: "/static/logo.jpg", alt: "JavJaeger", className: "jav-brand-logo" })
      ), /* @__PURE__ */ React7.createElement("span", { className: "jav-brand-copy" }, /* @__PURE__ */ React7.createElement(Text7, { className: "jav-brand-name" }, HEADER_BRAND_NAME), /* @__PURE__ */ React7.createElement(Text7, { className: "jav-brand-slogan" }, /* @__PURE__ */ React7.createElement("span", null, HEADER_SLOGAN_QUOTE), /* @__PURE__ */ React7.createElement("span", null, HEADER_SLOGAN_AUTHOR))))), /* @__PURE__ */ React7.createElement("div", { className: "jav-header-nav" }, /* @__PURE__ */ React7.createElement(
        Segmented2,
        {
          className: "jav-page-tabs",
          value: activePage,
          onChange: setActivePage,
          options: [
            { label: "\u5F71\u7247\u68C0\u7D22", value: "jav" },
            { label: "\u522E\u524A", value: "localScrape" },
            { label: "\u5F71\u89C6\u5E93", value: "localLibrary" },
            { label: "\u81EA\u52A8\u6A21\u5F0F", value: "automation" },
            { label: "WebDAV\u4E0B\u8F7D", value: "webdav" },
            { label: "\u8BBE\u7F6E", value: "settings" }
          ]
        }
      )), /* @__PURE__ */ React7.createElement(Space7, { size: "middle", className: "jav-header-actions" }, /* @__PURE__ */ React7.createElement(Text7, { type: "secondary", className: "jav-version" }, displayVersion, " (", versionInfo.build_date, ")"), /* @__PURE__ */ React7.createElement("a", { className: "jav-github-link", href: "https://github.com/cnlutong/JavJaeger", target: "_blank", rel: "noreferrer", "aria-label": "GitHub repository" }, GithubOutlined ? /* @__PURE__ */ React7.createElement(GithubOutlined, null) : /* @__PURE__ */ React7.createElement("svg", { viewBox: "0 0 24 24", fill: "currentColor", width: "24", height: "24" }, /* @__PURE__ */ React7.createElement("path", { d: "M12 0C5.374 0 0 5.373 0 12 0 17.302 3.438 21.8 8.207 23.387c.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23A11.509 11.509 0 0112 5.803c1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576C20.566 21.797 24 17.3 24 12c0-6.627-5.373-12-12-12z" }))))), logoPreviewOpen && /* @__PURE__ */ React7.createElement(
        "div",
        {
          className: "jav-logo-preview-overlay",
          role: "dialog",
          "aria-modal": "true",
          "aria-label": "JavJaeger logo \u5927\u56FE",
          onClick: handleLogoPreviewClose
        },
        /* @__PURE__ */ React7.createElement(
          "button",
          {
            type: "button",
            className: "jav-logo-preview-close",
            "aria-label": "\u5173\u95ED logo \u5927\u56FE",
            onClick: handleLogoPreviewClose
          },
          "\xD7"
        ),
        /* @__PURE__ */ React7.createElement("div", { className: "jav-logo-preview-frame", onClick: (event) => event.stopPropagation() }, /* @__PURE__ */ React7.createElement("img", { src: "/static/logo.jpg", alt: "JavJaeger logo \u5927\u56FE", className: "jav-logo-preview-image" }))
      ), activePage === "jav" ? /* @__PURE__ */ React7.createElement(Layout2, { className: "jav-workspace" }, /* @__PURE__ */ React7.createElement(
        Sider,
        {
          width: 320,
          theme: "light",
          collapsible: true,
          collapsed: collapsedLeft,
          onCollapse: (value) => setCollapsedLeft(value),
          className: "jav-sidebar jav-sidebar-left"
        },
        /* @__PURE__ */ React7.createElement("div", { className: "jav-sidebar-content" }, /* @__PURE__ */ React7.createElement(Title6, { level: 5, className: "jav-sidebar-title" }, "\u67E5\u8BE2\u529F\u80FD"), /* @__PURE__ */ React7.createElement(Divider4, { className: "jav-sidebar-divider" }), /* @__PURE__ */ React7.createElement(Card6, { title: /* @__PURE__ */ React7.createElement(React7.Fragment, null, /* @__PURE__ */ React7.createElement(Icon6, { as: FilterOutlined2 }), " \u5F71\u7247\u5217\u8868\u7B5B\u9009"), size: "small", className: "jav-tool-card" }, /* @__PURE__ */ React7.createElement(Form6, { form: filterForm, onFinish: filterMovies, layout: "vertical", initialValues: { magnet: "exist", type: "normal", fetchMode: "page" } }, /* @__PURE__ */ React7.createElement(Form6.Item, { name: "filterType", style: { marginBottom: 8 } }, /* @__PURE__ */ React7.createElement(Select3, { placeholder: "\u9009\u62E9\u7B5B\u9009\u7C7B\u578B", allowClear: true, optionLabelProp: "label" }, /* @__PURE__ */ React7.createElement(Option, { value: "star", label: "\u6F14\u5458" }, /* @__PURE__ */ React7.createElement("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "center" } }, /* @__PURE__ */ React7.createElement("span", null, "\u6F14\u5458"), /* @__PURE__ */ React7.createElement("a", { onClick: (e) => {
          e.stopPropagation();
          filterForm.setFieldsValue({ filterType: "star" });
          setViewMode("browseActor");
        } }, "\u6D4F\u89C8"))), /* @__PURE__ */ React7.createElement(Option, { value: "genre", label: "\u7C7B\u522B" }, /* @__PURE__ */ React7.createElement("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "center" } }, /* @__PURE__ */ React7.createElement("span", null, "\u7C7B\u522B"), /* @__PURE__ */ React7.createElement("a", { onClick: (e) => {
          e.stopPropagation();
          filterForm.setFieldsValue({ filterType: "genre" });
          setViewMode("browseCategory");
        } }, "\u6D4F\u89C8"))), /* @__PURE__ */ React7.createElement(Option, { value: "director", label: "\u5BFC\u6F14" }, "\u5BFC\u6F14"), /* @__PURE__ */ React7.createElement(Option, { value: "studio", label: "\u5236\u4F5C\u5546" }, "\u5236\u4F5C\u5546"), /* @__PURE__ */ React7.createElement(Option, { value: "label", label: "\u53D1\u884C\u5546" }, "\u53D1\u884C\u5546"), /* @__PURE__ */ React7.createElement(Option, { value: "series", label: "\u7CFB\u5217" }, "\u7CFB\u5217"))), /* @__PURE__ */ React7.createElement(Form6.Item, { name: "filterValue", hidden: true }, /* @__PURE__ */ React7.createElement(Input7, null)), /* @__PURE__ */ React7.createElement(Form6.Item, { style: { marginBottom: 8 } }, /* @__PURE__ */ React7.createElement("div", { style: { display: "flex", width: "100%" } }, /* @__PURE__ */ React7.createElement("div", { style: { flex: "1 1 0", minWidth: 0 } }, /* @__PURE__ */ React7.createElement(Form6.Item, { name: "filterValueName", noStyle: true }, /* @__PURE__ */ React7.createElement(
          Input7,
          {
            placeholder: "\u7B5B\u9009\u4EE3\u7801\u6216\u540D\u79F0",
            onChange: (e) => filterForm.setFieldsValue({ filterValue: e.target.value }),
            allowClear: true,
            style: {
              width: "100%",
              height: 46,
              minWidth: 0,
              borderTopRightRadius: 0,
              borderBottomRightRadius: 0
            }
          }
        ))), /* @__PURE__ */ React7.createElement(
          Button7,
          {
            htmlType: "button",
            onClick: handleAddCurrentFilter,
            autoInsertSpace: false,
            style: {
              flex: "0 0 62px",
              width: 62,
              marginLeft: -1,
              borderTopLeftRadius: 0,
              borderBottomLeftRadius: 0,
              height: 46,
              paddingInline: 0
            }
          },
          /* @__PURE__ */ React7.createElement("span", null, "\u52A0\u5165")
        ))), selectedFilters.length > 0 && /* @__PURE__ */ React7.createElement(Form6.Item, { style: { marginBottom: 8 } }, /* @__PURE__ */ React7.createElement("div", { style: { display: "flex", flexWrap: "wrap", gap: 6 } }, selectedFilters.map((filter) => /* @__PURE__ */ React7.createElement(
          Tag6,
          {
            key: `${filter.type}:${filter.value}`,
            closable: true,
            color: filter.type === "star" ? "magenta" : "cyan",
            onClose: () => removeSelectedFilter(filter.type, filter.value),
            style: { margin: 0 }
          },
          FILTER_TYPE_LABELS2[filter.type] || filter.type,
          ": ",
          filter.label || filter.value
        )), /* @__PURE__ */ React7.createElement(Button7, { type: "link", size: "small", htmlType: "button", onClick: () => setSelectedFilters([]) }, "\u6E05\u7A7A"))), /* @__PURE__ */ React7.createElement(Form6.Item, { name: "magnet", style: { marginBottom: 8 } }, /* @__PURE__ */ React7.createElement(Select3, { placeholder: "\u78C1\u529B\u94FE\u63A5\u72B6\u6001" }, /* @__PURE__ */ React7.createElement(Option, { value: "exist" }, "\u6709\u78C1\u529B\u94FE\u63A5"), /* @__PURE__ */ React7.createElement(Option, { value: "all" }, "\u5168\u90E8\u5F71\u7247"))), /* @__PURE__ */ React7.createElement(Form6.Item, { name: "type", style: { marginBottom: 8 } }, /* @__PURE__ */ React7.createElement(Select3, { placeholder: "\u5F71\u7247\u7C7B\u578B" }, /* @__PURE__ */ React7.createElement(Option, { value: "normal" }, "\u6709\u7801\u5F71\u7247"), /* @__PURE__ */ React7.createElement(Option, { value: "uncensored" }, "\u65E0\u7801\u5F71\u7247"))), /* @__PURE__ */ React7.createElement(Form6.Item, { name: "actorCountFilter", label: "\u6F14\u5458\u4EBA\u6570", style: { marginBottom: 8 } }, /* @__PURE__ */ React7.createElement(Select3, { placeholder: "\u4E0D\u9650\u5236", allowClear: true }, /* @__PURE__ */ React7.createElement(Option, { value: "1" }, "\u5355\u4EBA\u4F5C\u54C1 (=1)"), /* @__PURE__ */ React7.createElement(Option, { value: "2" }, "\u53CC\u4EBA\u4F5C\u54C1 (=2)"), /* @__PURE__ */ React7.createElement(Option, { value: "3" }, "\u4E09\u4EBA\u4F5C\u54C1 (=3)"), /* @__PURE__ */ React7.createElement(Option, { value: "<=2" }, "\u5C11\u4E8E\u7B49\u4E8E2\u4EBA"), /* @__PURE__ */ React7.createElement(Option, { value: "<=3" }, "\u5C11\u4E8E\u7B49\u4E8E3\u4EBA"), /* @__PURE__ */ React7.createElement(Option, { value: ">=3" }, "\u5927\u4E8E\u7B49\u4E8E3\u4EBA"), /* @__PURE__ */ React7.createElement(Option, { value: ">=4" }, "\u5927\u4E8E\u7B49\u4E8E4\u4EBA"))), /* @__PURE__ */ React7.createElement(Form6.Item, { name: "hasSubtitle", label: "\u5B57\u5E55\u8981\u6C42", style: { marginBottom: 8 } }, /* @__PURE__ */ React7.createElement(Select3, { placeholder: "\u4E0D\u9650\u5236", allowClear: true }, /* @__PURE__ */ React7.createElement(Option, { value: "" }, "\u5305\u542B\u6216\u4E0D\u5305\u542B\u90FD\u53EF\u4EE5"), /* @__PURE__ */ React7.createElement(Option, { value: "true" }, "\u5305\u542B\u5B57\u5E55"), /* @__PURE__ */ React7.createElement(Option, { value: "false" }, "\u4E0D\u542B\u5B57\u5E55"))), /* @__PURE__ */ React7.createElement(Form6.Item, { name: "fetchMode", label: "\u83B7\u53D6\u65B9\u5F0F", style: { marginBottom: 8 } }, /* @__PURE__ */ React7.createElement(Select3, null, /* @__PURE__ */ React7.createElement(Option, { value: "page" }, "\u9010\u9875\u83B7\u53D6 (\u6BCF\u987530\u4E2A)"), /* @__PURE__ */ React7.createElement(Option, { value: "all" }, "\u83B7\u53D6\u5168\u90E8 (\u6240\u6709\u9875)"))), /* @__PURE__ */ React7.createElement(Button7, { type: "primary", htmlType: "submit", block: true, loading, icon: /* @__PURE__ */ React7.createElement(Icon6, { as: FilterOutlined2 }) }, "\u7B5B\u9009"))), /* @__PURE__ */ React7.createElement(Card6, { title: /* @__PURE__ */ React7.createElement(React7.Fragment, null, /* @__PURE__ */ React7.createElement(Icon6, { as: SearchOutlined3 }), " \u5F71\u7247\u67E5\u8BE2"), size: "small", className: "jav-tool-card" }, /* @__PURE__ */ React7.createElement(Form6, { onFinish: searchMovie, layout: "vertical" }, /* @__PURE__ */ React7.createElement(Form6.Item, { name: "keyword", style: { marginBottom: 8 }, rules: [{ required: true, message: "\u8BF7\u8F93\u5165\u756A\u53F7" }] }, /* @__PURE__ */ React7.createElement(Input7, { placeholder: "\u8F93\u5165\u5F71\u7247\u756A\u53F7" })), /* @__PURE__ */ React7.createElement(Button7, { type: "primary", htmlType: "submit", block: true, loading, icon: /* @__PURE__ */ React7.createElement(Icon6, { as: SearchOutlined3 }) }, "\u641C\u7D22"))), /* @__PURE__ */ React7.createElement(Card6, { title: /* @__PURE__ */ React7.createElement(React7.Fragment, null, /* @__PURE__ */ React7.createElement(Icon6, { as: LinkOutlined2 }), " \u78C1\u529B\u94FE\u63A5\u67E5\u8BE2"), size: "small", className: "jav-tool-card" }, /* @__PURE__ */ React7.createElement(Form6, { onFinish: searchMagnet, layout: "vertical" }, /* @__PURE__ */ React7.createElement(Form6.Item, { name: "movieId", style: { marginBottom: 8 }, rules: [{ required: true, message: "\u8BF7\u8F93\u5165\u756A\u53F7" }] }, /* @__PURE__ */ React7.createElement(Input7, { placeholder: "\u8F93\u5165\u5F71\u7247\u756A\u53F7" })), /* @__PURE__ */ React7.createElement(Form6.Item, { name: "sortBy", style: { marginBottom: 8 } }, /* @__PURE__ */ React7.createElement(Select3, { placeholder: "\u6392\u5E8F\u65B9\u5F0F", allowClear: true }, /* @__PURE__ */ React7.createElement(Option, { value: "date" }, "\u65E5\u671F"), /* @__PURE__ */ React7.createElement(Option, { value: "size" }, "\u5927\u5C0F"))), /* @__PURE__ */ React7.createElement(Form6.Item, { name: "sortOrder", style: { marginBottom: 8 } }, /* @__PURE__ */ React7.createElement(Select3, { placeholder: "\u6392\u5E8F\u987A\u5E8F", allowClear: true }, /* @__PURE__ */ React7.createElement(Option, { value: "asc" }, "\u5347\u5E8F"), /* @__PURE__ */ React7.createElement(Option, { value: "desc" }, "\u964D\u5E8F"))), /* @__PURE__ */ React7.createElement(Form6.Item, { name: "hasSubtitle", style: { marginBottom: 8 } }, /* @__PURE__ */ React7.createElement(Select3, { placeholder: "\u5B57\u5E55\u7B5B\u9009", allowClear: true }, /* @__PURE__ */ React7.createElement(Option, { value: "true" }, "\u6709\u5B57\u5E55"), /* @__PURE__ */ React7.createElement(Option, { value: "false" }, "\u65E0\u5B57\u5E55"))), /* @__PURE__ */ React7.createElement(Button7, { type: "primary", htmlType: "submit", block: true, loading, icon: /* @__PURE__ */ React7.createElement(Icon6, { as: LinkOutlined2 }) }, "\u67E5\u8BE2\u78C1\u529B\u94FE\u63A5"))), /* @__PURE__ */ React7.createElement(Card6, { title: /* @__PURE__ */ React7.createElement(React7.Fragment, null, /* @__PURE__ */ React7.createElement(Icon6, { as: DatabaseOutlined2 }), " \u5F71\u7247\u8BC6\u522B"), size: "small", className: "jav-tool-card" }, /* @__PURE__ */ React7.createElement(Form6, { onFinish: handleRecognizeMovie, layout: "vertical", initialValues: { autoDownload: true } }, /* @__PURE__ */ React7.createElement(Form6.Item, { name: "htmlContent", rules: [{ required: true, message: "\u8BF7\u7C98\u8D34HTML\u6E90\u4EE3\u7801" }], style: { marginBottom: 8 } }, /* @__PURE__ */ React7.createElement(Input7.TextArea, { placeholder: "\u8BF7\u7C98\u8D34JAVLibrary\u7F51\u9875\u6E90\u4EE3\u7801...", rows: 4 })), /* @__PURE__ */ React7.createElement(Form6.Item, { name: "autoDownload", style: { marginBottom: 12 } }, /* @__PURE__ */ React7.createElement(
          Segmented2,
          {
            block: true,
            options: [
              { label: "\u4EC5\u8BC6\u522B", value: false },
              { label: "\u81EA\u52A8\u4E0B\u8F7D\u6700\u4F73", value: true }
            ]
          }
        )), /* @__PURE__ */ React7.createElement(Form6.Item, { name: "hasSubtitle", style: { marginBottom: 8 } }, /* @__PURE__ */ React7.createElement(Select3, { placeholder: "\u5B57\u5E55\u7B5B\u9009", allowClear: true }, /* @__PURE__ */ React7.createElement(Option, { value: "true" }, "\u6709\u5B57\u5E55"), /* @__PURE__ */ React7.createElement(Option, { value: "false" }, "\u65E0\u5B57\u5E55"))), /* @__PURE__ */ React7.createElement(Form6.Item, { name: "exclude4k", style: { marginBottom: 16 } }, /* @__PURE__ */ React7.createElement(
          Segmented2,
          {
            block: true,
            options: [
              { label: "\u4E0D\u6392\u96644K", value: false },
              { label: "\u6392\u96644K", value: true }
            ]
          }
        )), /* @__PURE__ */ React7.createElement(Button7, { type: "primary", htmlType: "submit", block: true, loading, icon: /* @__PURE__ */ React7.createElement(Icon6, { as: SearchOutlined3 }) }, "\u8BC6\u522B\u5E76\u4E0B\u8F7D"))), /* @__PURE__ */ React7.createElement(Card6, { title: /* @__PURE__ */ React7.createElement(React7.Fragment, null, /* @__PURE__ */ React7.createElement(Icon6, { as: DownloadOutlined4 }), " \u756A\u53F7\u81EA\u52A8\u4E0B\u8F7D"), size: "small", className: "jav-tool-card" }, /* @__PURE__ */ React7.createElement(Form6, { onFinish: handleCodeDownload, layout: "vertical", initialValues: { autoDownload: true } }, /* @__PURE__ */ React7.createElement(Form6.Item, { name: "movieCodes", rules: [{ required: true, message: "\u8BF7\u8F93\u5165\u756A\u53F7" }], style: { marginBottom: 8 } }, /* @__PURE__ */ React7.createElement(Input7.TextArea, { placeholder: "\u652F\u6301\u591A\u884C\u3001\u7A7A\u683C\u5206\u9694...", rows: 4 })), /* @__PURE__ */ React7.createElement(Form6.Item, { name: "autoDownload", style: { marginBottom: 12 } }, /* @__PURE__ */ React7.createElement(
          Segmented2,
          {
            block: true,
            options: [
              { label: "\u4EC5\u641C\u7D22", value: false },
              { label: "\u81EA\u52A8\u4E0B\u8F7D\u6700\u4F73", value: true }
            ]
          }
        )), /* @__PURE__ */ React7.createElement(Form6.Item, { name: "hasSubtitle", style: { marginBottom: 8 } }, /* @__PURE__ */ React7.createElement(Select3, { placeholder: "\u5B57\u5E55\u7B5B\u9009", allowClear: true }, /* @__PURE__ */ React7.createElement(Option, { value: "true" }, "\u6709\u5B57\u5E55"), /* @__PURE__ */ React7.createElement(Option, { value: "false" }, "\u65E0\u5B57\u5E55"))), /* @__PURE__ */ React7.createElement(Form6.Item, { name: "exclude4k", style: { marginBottom: 16 } }, /* @__PURE__ */ React7.createElement(
          Segmented2,
          {
            block: true,
            options: [
              { label: "\u4E0D\u6392\u96644K", value: false },
              { label: "\u6392\u96644K", value: true }
            ]
          }
        )), /* @__PURE__ */ React7.createElement(Button7, { type: "primary", htmlType: "submit", block: true, loading, icon: /* @__PURE__ */ React7.createElement(Icon6, { as: DownloadOutlined4 }) }, "\u641C\u7D22\u5E76\u4E0B\u8F7D"))))
      ), /* @__PURE__ */ React7.createElement(Content2, { className: "jav-content" }, /* @__PURE__ */ React7.createElement("section", { className: "jav-results-panel" }, viewMode === "search" && /* @__PURE__ */ React7.createElement(React7.Fragment, null, /* @__PURE__ */ React7.createElement("div", { className: "jav-results-header" }, /* @__PURE__ */ React7.createElement("div", null, /* @__PURE__ */ React7.createElement(Title6, { level: 4, className: "jav-results-title" }, /* @__PURE__ */ React7.createElement("span", { className: "jav-section-icon" }, /* @__PURE__ */ React7.createElement(Icon6, { as: ThunderboltOutlined2 })), "\u67E5\u8BE2\u7ED3\u679C"), /* @__PURE__ */ React7.createElement(Text7, { type: "secondary", className: "jav-results-subtitle" }, "\u5F53\u524D\u6279\u6B21\u8D44\u6E90\u6982\u89C8")), /* @__PURE__ */ React7.createElement(
        Button7,
        {
          type: "primary",
          disabled: !(downloadTool === "aria2" ? aria2Connected : isLoggedIn || clientConfig.pikpak.configured) || !moviesData || !moviesData.movies || moviesData.movies.length === 0,
          loading,
          icon: /* @__PURE__ */ React7.createElement(Icon6, { as: DownloadOutlined4 }),
          onClick: handleDownloadAllMovies
        },
        "\u4E0B\u8F7D\u672C\u9875\u5168\u90E8\u5F71\u7247"
      )), /* @__PURE__ */ React7.createElement("div", { className: "jav-kpi-grid" }, /* @__PURE__ */ React7.createElement("div", { className: "jav-kpi-card" }, /* @__PURE__ */ React7.createElement("span", { className: "jav-kpi-label" }, "\u7ED3\u679C"), /* @__PURE__ */ React7.createElement("strong", null, resultCount), /* @__PURE__ */ React7.createElement("span", { className: "jav-kpi-note" }, "\u5F71\u7247")), /* @__PURE__ */ React7.createElement("div", { className: "jav-kpi-card" }, /* @__PURE__ */ React7.createElement("span", { className: "jav-kpi-label" }, "\u78C1\u529B"), /* @__PURE__ */ React7.createElement("strong", null, magnetsReadyCount), /* @__PURE__ */ React7.createElement("span", { className: "jav-kpi-note" }, magnetsLoadedCount, "/", resultCount || 0, " \u5DF2\u68C0\u7D22")), /* @__PURE__ */ React7.createElement("div", { className: "jav-kpi-card" }, /* @__PURE__ */ React7.createElement("span", { className: "jav-kpi-label" }, "PikPak"), /* @__PURE__ */ React7.createElement("strong", null, isLoggedIn ? "\u5728\u7EBF" : clientConfig.pikpak.configured ? "\u53EF\u914D\u7F6E" : "\u79BB\u7EBF"), /* @__PURE__ */ React7.createElement("span", { className: "jav-kpi-note" }, pikpakCredentials?.username || clientConfig.pikpak.username || "\u672A\u767B\u5F55")), /* @__PURE__ */ React7.createElement("div", { className: "jav-kpi-card" }, /* @__PURE__ */ React7.createElement("span", { className: "jav-kpi-label" }, "\u6765\u6E90"), /* @__PURE__ */ React7.createElement("strong", null, currentMagnetSource === "cilisousuo" ? "Cilisousuo" : "JavBus"), /* @__PURE__ */ React7.createElement("span", { className: "jav-kpi-note" }, "4K\u8FC7\u6EE4\uFF1A", magnetSettingsForm.getFieldValue("globalExclude4k") ? "\u5F00\u542F" : "\u5173\u95ED"))), /* @__PURE__ */ React7.createElement("div", { className: "jav-process-strip" }, /* @__PURE__ */ React7.createElement("div", { className: `jav-process-item ${resultCount > 0 ? "is-active" : ""}` }, /* @__PURE__ */ React7.createElement("span", { className: "jav-process-icon" }, /* @__PURE__ */ React7.createElement(Icon6, { as: SearchOutlined3 })), /* @__PURE__ */ React7.createElement("span", null, /* @__PURE__ */ React7.createElement("strong", null, "\u68C0\u7D22"), /* @__PURE__ */ React7.createElement("em", null, loading ? "\u8FDB\u884C\u4E2D" : resultCount > 0 ? "\u5DF2\u5B8C\u6210" : "\u5F85\u5F00\u59CB"))), /* @__PURE__ */ React7.createElement("div", { className: `jav-process-item ${magnetsLoadedCount > 0 ? "is-active" : ""}` }, /* @__PURE__ */ React7.createElement("span", { className: "jav-process-icon" }, /* @__PURE__ */ React7.createElement(Icon6, { as: LinkOutlined2 })), /* @__PURE__ */ React7.createElement("span", null, /* @__PURE__ */ React7.createElement("strong", null, "\u8D44\u6E90"), /* @__PURE__ */ React7.createElement("em", null, magnetsReadyCount > 0 ? `${magnetsReadyCount} \u53EF\u7528` : magnetsLoadedCount > 0 ? "\u65E0\u53EF\u7528" : "\u5F85\u5339\u914D"))), /* @__PURE__ */ React7.createElement("div", { className: `jav-process-item ${isCurrentDownloadToolReady ? "is-active" : ""}` }, /* @__PURE__ */ React7.createElement("span", { className: "jav-process-icon" }, /* @__PURE__ */ React7.createElement(Icon6, { as: SafetyCertificateOutlined })), /* @__PURE__ */ React7.createElement("span", null, /* @__PURE__ */ React7.createElement("strong", null, "\u6D3E\u53D1"), /* @__PURE__ */ React7.createElement("em", null, isCurrentDownloadToolReady ? "\u5DF2\u5C31\u7EEA" : downloadTool === "aria2" ? "\u672A\u8FDE\u63A5Aria2" : clientConfig.pikpak.configured ? "\u53EF\u914D\u7F6E" : "\u672A\u767B\u5F55")))), /* @__PURE__ */ React7.createElement(Divider4, { className: "jav-section-divider" })), renderContent())), /* @__PURE__ */ React7.createElement(
        Sider,
        {
          width: 300,
          theme: "light",
          collapsible: true,
          collapsed: collapsedRight,
          onCollapse: (value) => setCollapsedRight(value),
          className: "jav-sidebar jav-sidebar-right",
          reverseArrow: true
        },
        /* @__PURE__ */ React7.createElement("div", { className: "jav-sidebar-content" }, /* @__PURE__ */ React7.createElement(Title6, { level: 5, className: "jav-sidebar-title" }, "\u4E0B\u8F7D\u7BA1\u7406"), /* @__PURE__ */ React7.createElement(Divider4, { className: "jav-sidebar-divider" }), /* @__PURE__ */ React7.createElement(
          Card6,
          {
            title: /* @__PURE__ */ React7.createElement(React7.Fragment, null, /* @__PURE__ */ React7.createElement(Icon6, { as: ThunderboltOutlined2 }), " \u4E0B\u8F7D\u5DE5\u5177"),
            extra: /* @__PURE__ */ React7.createElement(
              Button7,
              {
                type: "text",
                size: "small",
                title: "\u6253\u5F00\u914D\u7F6E",
                icon: /* @__PURE__ */ React7.createElement(Icon6, { as: SettingOutlined3 }),
                onClick: openDownloadToolConfig
              }
            ),
            size: "small",
            className: "jav-tool-card"
          },
          /* @__PURE__ */ React7.createElement("div", { style: { marginBottom: 8 } }, /* @__PURE__ */ React7.createElement(Text7, { type: "secondary", style: { fontSize: 12 } }, "\u5F53\u524D\u9009\u62E9\uFF1A", /* @__PURE__ */ React7.createElement(Text7, { strong: true, style: { marginLeft: 6, color: "#262626" } }, downloadTool === "aria2" ? "\u76F4\u63A5\u4E0B\u8F7D" : "\u7F51\u76D8"))),
          /* @__PURE__ */ React7.createElement("div", { style: { marginBottom: 10 } }, /* @__PURE__ */ React7.createElement(Text7, { type: "secondary", style: { fontSize: 12, color: webdavConnected ? "#52c41a" : "#ff4d4f" } }, "WebDAV\uFF08\u7F51\u76D8\uFF09\uFF1A", webdavConnected ? "\u5DF2\u8FDE\u63A5" : "\u672A\u8FDE\u63A5"), /* @__PURE__ */ React7.createElement("br", null), /* @__PURE__ */ React7.createElement(Text7, { type: "secondary", style: { fontSize: 12, color: aria2Connected ? "#52c41a" : "#ff4d4f" } }, "Aria2\uFF1A", aria2Connected ? "\u5DF2\u8FDE\u63A5" : "\u672A\u8FDE\u63A5")),
          /* @__PURE__ */ React7.createElement(
            Segmented2,
            {
              value: downloadTool,
              block: true,
              onChange: handleDownloadToolChange,
              options: [
                { label: "\u7F51\u76D8", value: "pikpak" },
                { label: "\u76F4\u63A5\u4E0B\u8F7D", value: "aria2" }
              ]
            }
          )
        ), /* @__PURE__ */ React7.createElement(
          Drawer3,
          {
            title: downloadTool === "aria2" ? "\u914D\u7F6E Aria2\uFF08\u76F4\u63A5\u4E0B\u8F7D\uFF09" : "\u914D\u7F6E \u7F51\u76D8\uFF08PikPak\uFF09",
            open: downloadToolConfigOpen,
            onClose: closeDownloadToolConfig,
            width: 360,
            placement: "right",
            destroyOnClose: true
          },
          downloadTool === "aria2" ? /* @__PURE__ */ React7.createElement(Card6, { size: "small", title: /* @__PURE__ */ React7.createElement(React7.Fragment, null, /* @__PURE__ */ React7.createElement(Icon6, { as: ThunderboltOutlined2 }), " Aria2 \u914D\u7F6E"), className: "jav-tool-card" }, /* @__PURE__ */ React7.createElement("div", { style: { marginBottom: 8 } }, /* @__PURE__ */ React7.createElement(Text7, { type: "secondary", style: { fontSize: 12, color: aria2Connected ? "#52c41a" : "#ff4d4f" } }, aria2Connected ? "Aria2 \u5DF2\u8FDE\u63A5" : "Aria2 \u672A\u8FDE\u63A5")), /* @__PURE__ */ React7.createElement(Form6, { form: aria2Form, layout: "vertical", onFinish: handleAria2Connect }, /* @__PURE__ */ React7.createElement(Form6.Item, { name: "url", label: "Aria2 RPC \u5730\u5740", rules: [{ required: true, message: "\u8BF7\u8F93\u5165 Aria2 RPC \u5730\u5740" }] }, /* @__PURE__ */ React7.createElement(Input7, { placeholder: "http://127.0.0.1:6800/jsonrpc" })), /* @__PURE__ */ React7.createElement(Form6.Item, { name: "secret", label: "RPC Secret" }, /* @__PURE__ */ React7.createElement(Input7.Password, { placeholder: "\u53EF\u9009" })), /* @__PURE__ */ React7.createElement(Space7, { direction: "vertical", style: { width: "100%" } }, /* @__PURE__ */ React7.createElement(Button7, { type: "primary", htmlType: "submit", block: true, loading: aria2Loading }, "\u8FDE\u63A5 Aria2"), clientConfig.aria2?.configured && /* @__PURE__ */ React7.createElement(Button7, { block: true, onClick: () => handleAria2ConnectFromConfig(), loading: aria2Loading }, "\u4F7F\u7528\u914D\u7F6E\u8FDE\u63A5")))) : /* @__PURE__ */ React7.createElement(Card6, { size: "small", title: /* @__PURE__ */ React7.createElement(React7.Fragment, null, /* @__PURE__ */ React7.createElement(Icon6, { as: ThunderboltOutlined2 }), " WebDAV \u914D\u7F6E"), className: "jav-tool-card" }, /* @__PURE__ */ React7.createElement("div", { style: { marginBottom: 8 } }, /* @__PURE__ */ React7.createElement(Text7, { type: "secondary", style: { fontSize: 12, color: webdavConnected ? "#52c41a" : "#ff4d4f" } }, webdavConnected ? "WebDAV \u5DF2\u8FDE\u63A5" : "WebDAV \u672A\u8FDE\u63A5")), /* @__PURE__ */ React7.createElement(Form6, { form: webdavForm, layout: "vertical", onFinish: handleWebdavConnect }, /* @__PURE__ */ React7.createElement(Form6.Item, { name: "url", label: "WebDAV \u5730\u5740", rules: [{ required: true, message: "\u8BF7\u8F93\u5165 WebDAV \u5730\u5740" }] }, /* @__PURE__ */ React7.createElement(Input7, { placeholder: "https://dav.example.com/" })), /* @__PURE__ */ React7.createElement(Form6.Item, { name: "username", label: "\u7528\u6237\u540D" }, /* @__PURE__ */ React7.createElement(Input7, { placeholder: "\u53EF\u9009" })), /* @__PURE__ */ React7.createElement(Form6.Item, { name: "password", label: "\u5BC6\u7801" }, /* @__PURE__ */ React7.createElement(Input7.Password, { placeholder: "\u53EF\u9009" })), /* @__PURE__ */ React7.createElement(Space7, { direction: "vertical", style: { width: "100%" } }, /* @__PURE__ */ React7.createElement(Button7, { type: "primary", htmlType: "submit", block: true, loading: webdavLoading }, "\u8FDE\u63A5 WebDAV"), clientConfig.webdav?.configured && /* @__PURE__ */ React7.createElement(Button7, { block: true, onClick: () => handleWebdavConnectFromConfig(), loading: webdavLoading }, "\u4F7F\u7528\u914D\u7F6E\u8FDE\u63A5"))))
        ), /* @__PURE__ */ React7.createElement(
          Button7,
          {
            type: "default",
            block: true,
            icon: /* @__PURE__ */ React7.createElement(Icon6, { as: HistoryOutlined }),
            onClick: fetchHistory,
            className: "jav-sidebar-action"
          },
          "\u67E5\u770B\u5386\u53F2\u8BB0\u5F55"
        ), /* @__PURE__ */ React7.createElement(Card6, { title: /* @__PURE__ */ React7.createElement(React7.Fragment, null, /* @__PURE__ */ React7.createElement(Icon6, { as: LoginOutlined }), " PikPak \u767B\u5F55"), size: "small", className: "jav-tool-card" }, !isLoggedIn ? /* @__PURE__ */ React7.createElement(Form6, { layout: "vertical", onFinish: handlePikPakLogin }, /* @__PURE__ */ React7.createElement(Form6.Item, { name: "username", style: { marginBottom: "12px" }, rules: [{ required: true, message: "\u8BF7\u8F93\u5165\u7528\u6237\u540D" }] }, /* @__PURE__ */ React7.createElement(Input7, { placeholder: "\u7528\u6237\u540D", autoComplete: "username" })), /* @__PURE__ */ React7.createElement(Form6.Item, { name: "password", style: { marginBottom: "12px" }, rules: [{ required: true, message: "\u8BF7\u8F93\u5165\u5BC6\u7801" }] }, /* @__PURE__ */ React7.createElement(Input7.Password, { placeholder: "\u5BC6\u7801", autoComplete: "current-password" })), /* @__PURE__ */ React7.createElement(Space7, { direction: "vertical", style: { width: "100%" } }, /* @__PURE__ */ React7.createElement(Button7, { type: "primary", htmlType: "submit", block: true, loading }, "\u767B\u5F55"), clientConfig.pikpak.configured && /* @__PURE__ */ React7.createElement(Button7, { block: true, onClick: () => handlePikPakLoginFromConfig(), loading }, "\u4F7F\u7528\u914D\u7F6E\u767B\u5F55"))) : /* @__PURE__ */ React7.createElement("div", { style: { textAlign: "center" } }, /* @__PURE__ */ React7.createElement(Text7, { type: "success", strong: true }, "\u5DF2\u767B\u5F55"), /* @__PURE__ */ React7.createElement("div", { style: { marginTop: 8 } }, pikpakCredentials?.username), /* @__PURE__ */ React7.createElement(Button7, { danger: true, style: { marginTop: 12 }, block: true, onClick: handleLogout, icon: /* @__PURE__ */ React7.createElement(Icon6, { as: LogoutOutlined }) }, "\u9000\u51FA\u767B\u5F55"))), /* @__PURE__ */ React7.createElement(Card6, { title: /* @__PURE__ */ React7.createElement(React7.Fragment, null, /* @__PURE__ */ React7.createElement(Icon6, { as: LinkOutlined2 }), " \u78C1\u529B\u94FE\u63A5\u6765\u6E90"), size: "small", className: "jav-tool-card" }, /* @__PURE__ */ React7.createElement(
          Form6,
          {
            form: magnetSettingsForm,
            layout: "vertical",
            initialValues: { magnetSource: "javbus", globalExclude4k: false },
            onValuesChange: handleMagnetSettingsChange
          },
          /* @__PURE__ */ React7.createElement(Form6.Item, { name: "magnetSource", label: "\u9009\u62E9\u6765\u6E90", style: { marginBottom: "12px" } }, /* @__PURE__ */ React7.createElement(Select3, null, /* @__PURE__ */ React7.createElement(Option, { value: "javbus" }, "JavBus API (\u9ED8\u8BA4)"), /* @__PURE__ */ React7.createElement(Option, { value: "cilisousuo" }, "Cilisousuo"))),
          /* @__PURE__ */ React7.createElement(Form6.Item, { name: "globalExclude4k", style: { marginBottom: 0 } }, /* @__PURE__ */ React7.createElement(
            Segmented2,
            {
              block: true,
              options: [
                { label: "\u4E0D\u6392\u96644K", value: false },
                { label: "\u5168\u5C40\u6392\u96644K", value: true }
              ]
            }
          ))
        )))
      )) : renderStandalonePage(activePage)))
    );
  }

  // frontend/src/App.jsx
  var React8 = window.React;
  function App() {
    return /* @__PURE__ */ React8.createElement(JavPage, null);
  }

  // frontend/src/main.jsx
  var React9 = window.React;
  var ReactDOM = window.ReactDOM;
  var root = ReactDOM.createRoot(document.getElementById("root"));
  root.render(/* @__PURE__ */ React9.createElement(App, null));
})();
