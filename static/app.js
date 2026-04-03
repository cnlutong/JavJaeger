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
    return /* @__PURE__ */ React.createElement("div", { className: "webdav-page", style: { padding: 24 } }, /* @__PURE__ */ React.createElement("div", { style: { display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24 } }, /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement(Title, { level: 3, style: { marginBottom: 4 } }, "WebDAV \u4E0B\u8F7D\u4E2D\u5FC3"), /* @__PURE__ */ React.createElement(Text, { type: "secondary" }, "\u6D4F\u89C8\u7F51\u76D8\u76EE\u5F55\u5E76\u5C06\u76F4\u94FE\u6279\u91CF\u53D1\u9001\u5230 Aria2\u3002")), /* @__PURE__ */ React.createElement(Space, { size: "large" }, /* @__PURE__ */ React.createElement("span", null, /* @__PURE__ */ React.createElement(Text, null, "WebDAV:"), /* @__PURE__ */ React.createElement(Badge, { status: webdavConnected ? "success" : "default", text: webdavConnected ? "\u5DF2\u8FDE\u63A5" : "\u672A\u8FDE\u63A5", style: { marginInlineStart: 8 } })), /* @__PURE__ */ React.createElement("span", null, /* @__PURE__ */ React.createElement(Text, null, "Aria2:"), /* @__PURE__ */ React.createElement(Badge, { status: aria2Connected ? "success" : "default", text: aria2Connected ? "\u5DF2\u8FDE\u63A5" : "\u672A\u8FDE\u63A5", style: { marginInlineStart: 8 } })))), /* @__PURE__ */ React.createElement(Content, null, /* @__PURE__ */ React.createElement(Row, { gutter: [24, 24] }, /* @__PURE__ */ React.createElement(Col, { xs: 24, md: 12 }, /* @__PURE__ */ React.createElement(Card, { title: /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement(CloudOutlined, null), " WebDAV\u670D\u52A1\u5668"), extra: /* @__PURE__ */ React.createElement(Badge, { status: webdavConnected ? "success" : "default", text: webdavConnected ? "\u5DF2\u8FDE\u63A5" : "\u672A\u8FDE\u63A5" }) }, /* @__PURE__ */ React.createElement(Form, { form: webdavForm, layout: "vertical", onFinish: handleWebdavConnect }, /* @__PURE__ */ React.createElement(Form.Item, { label: "WebDAV URL", name: "url", rules: [{ required: true, message: "\u8BF7\u8F93\u5165WebDAV URL" }] }, /* @__PURE__ */ React.createElement(Input, { placeholder: "https://...", autoComplete: "url" })), /* @__PURE__ */ React.createElement(Row, { gutter: 16 }, /* @__PURE__ */ React.createElement(Col, { span: 12 }, /* @__PURE__ */ React.createElement(Form.Item, { label: "\u7528\u6237\u540D", name: "username" }, /* @__PURE__ */ React.createElement(Input, { autoComplete: "username" }))), /* @__PURE__ */ React.createElement(Col, { span: 12 }, /* @__PURE__ */ React.createElement(Form.Item, { label: "\u5BC6\u7801", name: "password" }, /* @__PURE__ */ React.createElement(Input.Password, { autoComplete: "current-password" })))), /* @__PURE__ */ React.createElement(Space, { wrap: true }, /* @__PURE__ */ React.createElement(Button, { type: "primary", htmlType: "submit", icon: /* @__PURE__ */ React.createElement(ApiOutlined, null), loading: webdavLoading }, "\u8FDE\u63A5 WebDAV"), clientConfig.webdav.configured && /* @__PURE__ */ React.createElement(Button, { onClick: () => handleWebdavConnectFromConfig(), loading: webdavLoading }, "\u4F7F\u7528\u914D\u7F6E\u8FDE\u63A5"))))), /* @__PURE__ */ React.createElement(Col, { xs: 24, md: 12 }, /* @__PURE__ */ React.createElement(Card, { title: /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement(CloudServerOutlined, null), " Aria2\u4E0B\u8F7D\u5668"), extra: /* @__PURE__ */ React.createElement(Badge, { status: aria2Connected ? "success" : "default", text: aria2Connected ? "\u5DF2\u8FDE\u63A5" : "\u672A\u8FDE\u63A5" }) }, /* @__PURE__ */ React.createElement(Form, { form: aria2Form, layout: "vertical", onFinish: handleAria2Connect }, /* @__PURE__ */ React.createElement(Form.Item, { label: "Aria2 RPC URL", name: "url", rules: [{ required: true, message: "\u8BF7\u8F93\u5165Aria2 URL" }] }, /* @__PURE__ */ React.createElement(Input, { placeholder: "http://localhost:6800/jsonrpc", autoComplete: "url" })), /* @__PURE__ */ React.createElement(Form.Item, { label: "RPC Secret", name: "secret" }, /* @__PURE__ */ React.createElement(Input.Password, { autoComplete: "current-password" })), /* @__PURE__ */ React.createElement(Space, { wrap: true }, /* @__PURE__ */ React.createElement(Button, { type: "primary", htmlType: "submit", icon: /* @__PURE__ */ React.createElement(ApiOutlined, null), loading: aria2Loading }, "\u8FDE\u63A5 Aria2"), clientConfig.aria2.configured && /* @__PURE__ */ React.createElement(Button, { onClick: () => handleAria2ConnectFromConfig(), loading: aria2Loading }, "\u4F7F\u7528\u914D\u7F6E\u8FDE\u63A5")))))), webdavConnected && /* @__PURE__ */ React.createElement(
      Card,
      {
        style: { marginTop: 24 },
        title: /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement(FolderFilled, null), " \u6587\u4EF6\u6D4F\u89C8\u5668"),
        extra: /* @__PURE__ */ React.createElement(Space, { wrap: true }, /* @__PURE__ */ React.createElement(Button, { icon: /* @__PURE__ */ React.createElement(ReloadOutlined, null), onClick: () => loadFiles(currentPath) }, "\u5237\u65B0"), /* @__PURE__ */ React.createElement(Switch, { checkedChildren: "\u4EC5\u89C6\u9891", unCheckedChildren: "\u5168\u90E8\u6587\u4EF6", checked: videoFilter, onChange: setVideoFilter }), /* @__PURE__ */ React.createElement(Space.Compact, null, /* @__PURE__ */ React.createElement(Input, { style: { width: 40, pointerEvents: "none", backgroundColor: "#fafafa", borderRight: 0 }, placeholder: "\u2265", disabled: true }), /* @__PURE__ */ React.createElement(InputNumber, { min: 1, max: 10240, value: minFileSizeMb, onChange: setMinFileSizeMb, disabled: !videoFilter, style: { width: 100 } }), /* @__PURE__ */ React.createElement(Input, { style: { width: 50, pointerEvents: "none", backgroundColor: "#fafafa" }, placeholder: "MB", disabled: true })), /* @__PURE__ */ React.createElement(Button, { type: "primary", icon: /* @__PURE__ */ React.createElement(DownloadOutlined, null), disabled: selectedRowKeys.length === 0, onClick: handleDownloadSelected, loading: downloadingSelection }, "\u4E0B\u8F7D\u9009\u4E2D (", selectedRowKeys.length, ")"))
      },
      /* @__PURE__ */ React.createElement(Breadcrumb, { style: { marginBottom: 16 } }, /* @__PURE__ */ React.createElement(Breadcrumb.Item, null, /* @__PURE__ */ React.createElement("a", { onClick: () => loadFiles("/") }, "\u6839\u76EE\u5F55")), breadcrumbItems.map((item, idx) => /* @__PURE__ */ React.createElement(Breadcrumb.Item, { key: idx }, idx === breadcrumbItems.length - 1 ? item.title.props.children : item.title))),
      /* @__PURE__ */ React.createElement(
        Table,
        {
          columns: fileColumns,
          dataSource: files,
          loading: filesLoading,
          pagination: false,
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
    ), aria2Connected && /* @__PURE__ */ React.createElement(Card, { style: { marginTop: 24 }, title: /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement(CloudDownloadOutlined, null), " \u4E0B\u8F7D\u7BA1\u7406"), extra: /* @__PURE__ */ React.createElement(Button, { icon: /* @__PURE__ */ React.createElement(ReloadOutlined, null), onClick: loadDownloads, loading: downloadsLoading }, "\u5237\u65B0\u5217\u8868") }, /* @__PURE__ */ React.createElement(Table, { columns: downloadColumns, dataSource: downloads, rowKey: "gid", loading: downloadsLoading, pagination: false, locale: { emptyText: "\u6682\u65E0\u4E0B\u8F7D\u4EFB\u52A1" } }))));
  }

  // frontend/src/components/JavPage.jsx
  var React2 = window.React;
  var antd2 = window.antd;
  var { Layout: Layout2, Menu, Button: Button2, Input: Input2, Form: Form2, Select, Card: Card2, Switch: Switch2, Spin, message: message2, Typography: Typography2, Badge: Badge2, Progress: Progress2, Row: Row2, Col: Col2, Space: Space2, Divider, List, Tag: Tag2, ConfigProvider, Segmented, Popconfirm: Popconfirm2 } = antd2;
  var { Header, Content: Content2, Sider } = Layout2;
  var { Title: Title2, Text: Text2, Paragraph } = Typography2;
  var { Option } = Select;
  function JavPage() {
    const [collapsedLeft, setCollapsedLeft] = React2.useState(false);
    const [collapsedRight, setCollapsedRight] = React2.useState(false);
    const [versionInfo, setVersionInfo] = React2.useState({ version: "1.0.0", build_date: "Unknown" });
    const [activePage, setActivePage] = React2.useState("jav");
    const [loading, setLoading] = React2.useState(false);
    const [moviesData, setMoviesData] = React2.useState(null);
    const [magnetDataMap, setMagnetDataMap] = React2.useState({});
    const [movieDetailMap, setMovieDetailMap] = React2.useState({});
    const [historyData, setHistoryData] = React2.useState(null);
    const [currentPage, setCurrentPage] = React2.useState(1);
    const [lastFilterValues, setLastFilterValues] = React2.useState(null);
    const [lastMagnetSearchValues, setLastMagnetSearchValues] = React2.useState(null);
    const [categories, setCategories] = React2.useState({});
    const [actors, setActors] = React2.useState({});
    const [viewMode, setViewMode] = React2.useState("search");
    const [filterForm] = Form2.useForm();
    const [magnetSettingsForm] = Form2.useForm();
    const magnetRequestVersionRef = React2.useRef({});
    const [isLoggedIn, setIsLoggedIn] = React2.useState(false);
    const [pikpakCredentials, setPikpakCredentials] = React2.useState(null);
    const [clientConfig, setClientConfig] = React2.useState({
      pikpak: { configured: false, enabled: false, username: "", auto_login: false }
    });
    const autoLoginTriggeredRef = React2.useRef(false);
    React2.useEffect(() => {
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
      loadClientSideConfig();
    }, []);
    React2.useEffect(() => {
      if (clientConfig.pikpak.auto_login && clientConfig.pikpak.configured && !isLoggedIn && !autoLoginTriggeredRef.current) {
        autoLoginTriggeredRef.current = true;
        handlePikPakLoginFromConfig({ silent: true });
      }
    }, [clientConfig.pikpak.auto_login, clientConfig.pikpak.configured, isLoggedIn]);
    const displayVersion = versionInfo.version && versionInfo.version.startsWith("v") ? versionInfo.version : `v${versionInfo.version}`;
    const loadClientSideConfig = async () => {
      try {
        const config = await fetchClientConfig();
        setClientConfig(config);
      } catch (error) {
        console.error("Load client config error:", error);
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
    const fetchMovieDetail = async (id) => {
      try {
        const detail = await fetchWithRetry(`/api/movies/${encodeURIComponent(id)}`);
        if (detail && detail.id) {
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
        if (!result || !result.movie_id || !result.magnet_link) {
          return;
        }
        nextMap[result.movie_id] = [{
          link: result.magnet_link,
          title: result.title || `${result.movie_id} - \u6700\u4F73\u8D44\u6E90`,
          size: result.size || "\u672A\u77E5",
          date: result.date || "\u672A\u77E5",
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
          data.movies.forEach((m) => {
            fetchBestMagnet(m.id, m.gid, m.uc);
            fetchMovieDetail(m.id);
          });
        } else if (data.id) {
          fetchBestMagnet(data.id, data.gid, data.uc);
          fetchMovieDetail(data.id);
        }
      } catch (error) {
        message2.error("\u641C\u7D22\u5931\u8D25\uFF0C\u8BF7\u7A0D\u540E\u91CD\u8BD5");
      } finally {
        setLoading(false);
      }
    };
    const filterMovies = async (values, page = 1) => {
      setLoading(true);
      setLastMagnetSearchValues(null);
      if (page === 1) {
        setMagnetDataMap({});
        setMovieDetailMap({});
      }
      try {
        const queryParams = new URLSearchParams();
        if (values.filterType) {
          queryParams.append("filterType", values.filterType);
          queryParams.append("filterValue", values.filterValue);
        }
        if (values.magnet) queryParams.append("magnet", values.magnet);
        if (values.type) queryParams.append("type", values.type);
        if (values.actorCountFilter) queryParams.append("actorCountFilter", values.actorCountFilter);
        if (page > 1) queryParams.append("page", page);
        const apiUrl = values.fetchMode === "all" ? `/api/movies/all?${queryParams.toString()}` : `/api/movies?${queryParams.toString()}`;
        const data = await fetchWithRetry(apiUrl);
        setMoviesData(data);
        setCurrentPage(page);
        setLastFilterValues(values);
        if (data.movies) {
          data.movies.forEach((m) => {
            fetchBestMagnet(m.id, m.gid, m.uc);
            fetchMovieDetail(m.id);
          });
        }
      } catch (error) {
        message2.error("\u7B5B\u9009\u5931\u8D25\uFF0C\u8BF7\u7A0D\u540E\u91CD\u8BD5");
      } finally {
        setLoading(false);
      }
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
        message2.error("\u83B7\u53D6\u78C1\u529B\u94FE\u63A5\u5931\u8D25");
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
    const handleMagnetSettingsChange = () => {
      if (lastMagnetSearchValues && moviesData && moviesData.movies && moviesData.movies.length === 1 && moviesData.movies[0].id === lastMagnetSearchValues.movieId) {
        searchMagnet(lastMagnetSearchValues);
        return;
      }
      if (!moviesData || !moviesData.movies || moviesData.movies.length === 0) {
        return;
      }
      setMagnetDataMap({});
      moviesData.movies.forEach((m) => fetchBestMagnet(m.id, m.gid, m.uc));
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
          message2.success("\u767B\u5F55\u6210\u529F\uFF01");
        } else {
          message2.error("\u767B\u5F55\u5931\u8D25: " + (result.message || "\u672A\u77E5\u9519\u8BEF"));
        }
      } catch (error) {
        message2.error("\u767B\u5F55\u5F02\u5E38");
      } finally {
        setLoading(false);
      }
    };
    const handleLogout = () => {
      clearPikPakSession();
      setIsLoggedIn(false);
      setPikpakCredentials(null);
      message2.info("\u5DF2\u9000\u51FA\u767B\u5F55");
    };
    const handleRecognizeMovie = async (values) => {
      setLoading(true);
      setMoviesData(null);
      setMagnetDataMap({});
      try {
        const { magnetSource } = getMagnetSettings();
        const requestBody = {
          html_content: values.htmlContent,
          auto_download: values.autoDownload || false,
          magnet_source: magnetSource,
          has_subtitle_filter: values.hasSubtitle || null,
          exclude_4k: values.exclude4k || false
        };
        if (values.autoDownload && isLoggedIn && pikpakCredentials) {
          Object.assign(requestBody, buildPikPakAuthPayload());
        }
        const response = await fetch("/api/movies/recognize", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(requestBody)
        });
        const data = await response.json();
        if (data.error) {
          message2.error(`\u9519\u8BEF: ${data.error}`);
        } else {
          setMoviesData(data);
          if (data.magnet_results) {
            setMagnetDataMap(buildMagnetDataMapFromResults(data.magnet_results));
          }
          message2.success("\u8BC6\u522B\u5B8C\u6210");
        }
      } catch (error) {
        message2.error("\u5F71\u7247\u8BC6\u522B\u5931\u8D25");
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
        const requestBody = {
          movie_codes: values.movieCodes,
          auto_download: values.autoDownload || false,
          magnet_source: magnetSource,
          has_subtitle_filter: values.hasSubtitle || null,
          exclude_4k: values.exclude4k || false
        };
        if (values.autoDownload && isLoggedIn && pikpakCredentials) {
          Object.assign(requestBody, buildPikPakAuthPayload());
        }
        const response = await fetch("/api/movies/download-by-codes", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(requestBody)
        });
        const data = await response.json();
        if (data.error) {
          message2.error(`\u9519\u8BEF: ${data.error}`);
          return;
        }
        const movies = (data.found_movies || []).map((movie) => ({
          id: movie.id,
          title: movie.title,
          date: movie.date,
          cover: movie.cover,
          status: movie.status
        }));
        setMoviesData({ movies, magnet_results: data.magnet_results || [], download_result: data.download_result, not_found_codes: data.not_found_codes || [] });
        if (data.magnet_results) {
          setMagnetDataMap(buildMagnetDataMapFromResults(data.magnet_results));
        }
        message2.success(data.message || "\u5904\u7406\u5B8C\u6210");
      } catch (error) {
        message2.error("\u756A\u53F7\u5904\u7406\u5931\u8D25");
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
            message2.success("\u5DF2\u4F7F\u7528\u914D\u7F6E\u767B\u5F55 PikPak");
          }
        } else if (!silent) {
          message2.error("\u767B\u5F55\u5931\u8D25: " + (result.message || "\u672A\u77E5\u9519\u8BEF"));
        }
      } catch (error) {
        if (!silent) {
          message2.error("\u914D\u7F6E\u767B\u5F55\u5F02\u5E38");
        }
      } finally {
        setLoading(false);
      }
    };
    const handleDownloadAllMovies = async () => {
      if (!isLoggedIn && !clientConfig.pikpak.configured) {
        message2.warning("\u8BF7\u5148\u767B\u5F55 PikPak \u6216\u5728 config.json \u4E2D\u914D\u7F6E\u8D26\u53F7");
        return;
      }
      if (!moviesData || !moviesData.movies || moviesData.movies.length === 0) {
        message2.warning("\u6CA1\u6709\u53EF\u4E0B\u8F7D\u7684\u5F71\u7247");
        return;
      }
      const magnetLinks = [];
      const movieIds = [];
      for (const movie of moviesData.movies) {
        const magnets = magnetDataMap[movie.id];
        if (magnets && magnets.length > 0) {
          const best = magnets[0];
          const link = best.link || best.magnetLink || best.magnet_link;
          if (link) {
            magnetLinks.push(link);
            movieIds.push(movie.id);
          }
        }
      }
      if (magnetLinks.length === 0) {
        message2.warning("\u6682\u65E0\u53EF\u7528\u7684\u78C1\u529B\u94FE\u63A5\uFF0C\u8BF7\u7B49\u5F85\u52A0\u8F7D\u5B8C\u6210");
        return;
      }
      setLoading(true);
      try {
        const response = await fetch("/api/pikpak/download", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            magnet_links: magnetLinks,
            movie_ids: movieIds,
            ...buildPikPakAuthPayload()
          })
        });
        const result = await response.json();
        if (result.success) {
          message2.success(result.message || `\u5DF2\u6DFB\u52A0 ${magnetLinks.length} \u4E2A\u4E0B\u8F7D\u4EFB\u52A1`);
        } else {
          message2.error("\u4E0B\u8F7D\u5931\u8D25: " + (result.message || "\u672A\u77E5\u9519\u8BEF"));
        }
      } catch (error) {
        message2.error("\u4E0B\u8F7D\u8BF7\u6C42\u5931\u8D25");
      } finally {
        setLoading(false);
      }
    };
    const fetchHistory = async () => {
      setLoading(true);
      setViewMode("history");
      try {
        const data = await fetchWithRetry("/api/history");
        setHistoryData(data);
        message2.success("\u5DF2\u52A0\u8F7D\u5386\u53F2\u8BB0\u5F55");
      } catch (error) {
        message2.error("\u83B7\u53D6\u5386\u53F2\u8BB0\u5F55\u5931\u8D25");
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
          message2.success("\u5386\u53F2\u8BB0\u5F55\u5DF2\u6E05\u7A7A");
          setHistoryData([]);
        } else {
          message2.error("\u6E05\u7A7A\u5386\u53F2\u8BB0\u5F55\u5931\u8D25: " + (result.message || "\u672A\u77E5\u9519\u8BEF"));
        }
      } catch (error) {
        message2.error("\u8BF7\u6C42\u6E05\u7A7A\u5386\u53F2\u8BB0\u5F55\u5931\u8D25");
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
        return /* @__PURE__ */ React2.createElement("div", { style: { textAlign: "center", padding: "40px 0" } }, /* @__PURE__ */ React2.createElement(Spin, { size: "large" }), /* @__PURE__ */ React2.createElement("div", { style: { marginTop: 16 } }, "\u6B63\u5728\u641C\u7D22..."));
      }
      if (!moviesData) {
        return /* @__PURE__ */ React2.createElement("div", { style: { textAlign: "center", padding: "40px 0" } }, /* @__PURE__ */ React2.createElement(Text2, { type: "secondary" }, "\u6CA1\u6709\u4EFB\u4F55\u7ED3\u679C\uFF0C\u8BF7\u5728\u5DE6\u4FA7\u9009\u62E9\u67E5\u8BE2\u529F\u80FD\u5F00\u59CB\u641C\u7D22"));
      }
      if (moviesData.error) {
        return /* @__PURE__ */ React2.createElement("div", { style: { textAlign: "center", padding: "40px 0" } }, /* @__PURE__ */ React2.createElement(Text2, { type: "danger" }, moviesData.error));
      }
      if (moviesData.id && !moviesData.gid && !moviesData.uc && moviesData.avatar) {
        return /* @__PURE__ */ React2.createElement(Card2, { style: { marginBottom: 16, textAlign: "center" } }, /* @__PURE__ */ React2.createElement("img", { src: moviesData.avatar, alt: moviesData.name, style: { width: 150, height: 150, borderRadius: "50%", objectFit: "cover" } }), /* @__PURE__ */ React2.createElement(Title2, { level: 4, style: { marginTop: 16 } }, moviesData.name));
      }
      if (moviesData.movies && moviesData.movies.length > 0) {
        const canGoPrev = lastFilterValues && currentPage > 1;
        const canGoNext = lastFilterValues && moviesData.movies.length >= 30;
        const paginationBar = lastFilterValues && /* @__PURE__ */ React2.createElement("div", { style: { display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 } }, /* @__PURE__ */ React2.createElement(
          Button2,
          {
            icon: /* @__PURE__ */ React2.createElement("span", null, "\u2190"),
            disabled: !canGoPrev || loading,
            onClick: () => filterMovies(lastFilterValues, currentPage - 1)
          },
          "\u4E0A\u4E00\u9875"
        ), /* @__PURE__ */ React2.createElement(Text2, { type: "secondary" }, "\u7B2C ", currentPage, " \u9875"), /* @__PURE__ */ React2.createElement(
          Button2,
          {
            icon: /* @__PURE__ */ React2.createElement("span", null, "\u2192"),
            disabled: !canGoNext || loading,
            onClick: () => filterMovies(lastFilterValues, currentPage + 1)
          },
          "\u4E0B\u4E00\u9875"
        ));
        return /* @__PURE__ */ React2.createElement("div", null, /* @__PURE__ */ React2.createElement("div", { style: { display: "flex", alignItems: "center", gap: 8, marginBottom: 12 } }, /* @__PURE__ */ React2.createElement(Text2, { type: "secondary", style: { fontSize: 12 } }, "\u5171 ", moviesData.movies.length, " \u90E8")), paginationBar, moviesData.movies.map((movie) => renderMovieCard(movie)), paginationBar);
      }
      return /* @__PURE__ */ React2.createElement("div", { style: { textAlign: "center", padding: "40px 0" } }, /* @__PURE__ */ React2.createElement(Text2, { type: "secondary" }, "\u672A\u627E\u5230\u76F8\u5173\u6570\u636E"));
    };
    const handleCategorySelect = (code, name) => {
      filterForm.setFieldsValue({ filterType: "genre", filterValue: code, filterValueName: name });
      setViewMode("search");
    };
    const handleActorSelect = (code, name) => {
      filterForm.setFieldsValue({ filterType: "star", filterValue: code, filterValueName: name });
      setViewMode("search");
    };
    const renderCategoryGroups = () => {
      return /* @__PURE__ */ React2.createElement("div", null, /* @__PURE__ */ React2.createElement("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 } }, /* @__PURE__ */ React2.createElement(Title2, { level: 4, style: { margin: 0 } }, "\u6D4F\u89C8\u7C7B\u522B"), /* @__PURE__ */ React2.createElement(Button2, { onClick: () => setViewMode("search") }, "\u8FD4\u56DE\u67E5\u8BE2")), /* @__PURE__ */ React2.createElement(Divider, null), Object.keys(categories).map((group) => /* @__PURE__ */ React2.createElement("div", { key: group, style: { marginBottom: 24 } }, /* @__PURE__ */ React2.createElement(Title2, { level: 5 }, group), /* @__PURE__ */ React2.createElement(
        List,
        {
          grid: { gutter: 16, xs: 2, sm: 3, md: 4, lg: 5, xl: 6 },
          dataSource: categories[group],
          renderItem: (cat) => /* @__PURE__ */ React2.createElement(List.Item, null, /* @__PURE__ */ React2.createElement(
            Card2,
            {
              hoverable: true,
              size: "small",
              style: { textAlign: "center", cursor: "pointer" },
              onClick: () => handleCategorySelect(cat.code, cat.name)
            },
            /* @__PURE__ */ React2.createElement(Text2, { strong: true, style: { fontSize: 16 } }, cat.name)
          ))
        }
      ))));
    };
    const renderHistory = () => {
      return /* @__PURE__ */ React2.createElement("div", null, /* @__PURE__ */ React2.createElement("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 } }, /* @__PURE__ */ React2.createElement(Title2, { level: 4, style: { margin: 0 } }, "\u{1F4C2} \u5386\u53F2\u4E0B\u8F7D\u8BB0\u5F55"), /* @__PURE__ */ React2.createElement(Space2, null, /* @__PURE__ */ React2.createElement(
        Popconfirm2,
        {
          title: "\u786E\u5B9A\u8981\u6E05\u7A7A\u6240\u6709\u5386\u53F2\u8BB0\u5F55\u5417\uFF1F",
          onConfirm: handleClearHistory,
          okText: "\u786E\u5B9A",
          cancelText: "\u53D6\u6D88"
        },
        /* @__PURE__ */ React2.createElement(Button2, { danger: true, disabled: !historyData || historyData.length === 0, loading }, "\u6E05\u7A7A\u67E5\u9605\u8BB0\u5F55")
      ), /* @__PURE__ */ React2.createElement(Button2, { onClick: () => setViewMode("search") }, "\u8FD4\u56DE\u67E5\u8BE2"))), /* @__PURE__ */ React2.createElement(Divider, null), /* @__PURE__ */ React2.createElement(
        antd2.Table,
        {
          dataSource: historyData || [],
          rowKey: "movie_id",
          pagination: { pageSize: 20 },
          columns: [
            {
              title: "\u5F71\u7247\u756A\u53F7",
              dataIndex: "movie_id",
              key: "movie_id",
              render: (text) => /* @__PURE__ */ React2.createElement(Text2, { strong: true }, text)
            },
            {
              title: "\u5F71\u7247\u540D",
              dataIndex: "title",
              key: "title",
              render: (text) => text ? /* @__PURE__ */ React2.createElement(Text2, { ellipsis: { tooltip: text }, style: { maxWidth: 200 } }, text) : "-"
            },
            {
              title: "\u6F14\u5458",
              dataIndex: "stars",
              key: "stars",
              render: (tags) => /* @__PURE__ */ React2.createElement("div", { style: { display: "flex", flexWrap: "wrap", gap: "4px" } }, tags && Array.isArray(tags) ? tags.map((tag) => /* @__PURE__ */ React2.createElement(Tag2, { color: "magenta", key: tag }, tag)) : "-")
            },
            {
              title: "\u7C7B\u578B",
              dataIndex: "genres",
              key: "genres",
              render: (tags) => /* @__PURE__ */ React2.createElement("div", { style: { display: "flex", flexWrap: "wrap", gap: "4px" } }, tags && Array.isArray(tags) ? tags.map((tag) => /* @__PURE__ */ React2.createElement(Tag2, { color: "cyan", key: tag }, tag)) : "-")
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
              render: (_, record) => /* @__PURE__ */ React2.createElement(Button2, { type: "primary", size: "small", onClick: () => {
                setViewMode("search");
                searchMovie({ keyword: record.movie_id });
              } }, "\u8BE6\u60C5\u641C\u7D22")
            }
          ]
        }
      ));
    };
    const renderActorsList = () => {
      return /* @__PURE__ */ React2.createElement("div", null, /* @__PURE__ */ React2.createElement("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 } }, /* @__PURE__ */ React2.createElement(Title2, { level: 4, style: { margin: 0 } }, "\u6D4F\u89C8\u6F14\u5458"), /* @__PURE__ */ React2.createElement(Button2, { onClick: () => setViewMode("search") }, "\u8FD4\u56DE\u67E5\u8BE2")), /* @__PURE__ */ React2.createElement(Divider, null), /* @__PURE__ */ React2.createElement(
        List,
        {
          grid: { gutter: 16, xs: 2, sm: 3, md: 4, lg: 5, xl: 5, xxl: 5 },
          dataSource: Array.isArray(actors) ? actors : Object.values(actors).flat(),
          renderItem: (actor) => {
            const actorName = actor.name || actor;
            const actorCode = actor.code || actor;
            const fallbackImage = /* @__PURE__ */ React2.createElement("div", { style: { height: 200, display: "flex", alignItems: "center", justifyContent: "center", background: "var(--ant-color-bg-layout, #f5f5f5)" } }, /* @__PURE__ */ React2.createElement(Text2, { type: "secondary" }, "\u65E0\u5934\u50CF"));
            return /* @__PURE__ */ React2.createElement(List.Item, null, /* @__PURE__ */ React2.createElement(
              Card2,
              {
                hoverable: true,
                cover: actor.avatar ? /* @__PURE__ */ React2.createElement("img", { alt: actorName, src: actor.avatar, style: { height: 200, objectFit: "cover" } }) : fallbackImage,
                onClick: () => handleActorSelect(actorCode, actorName),
                size: "small"
              },
              /* @__PURE__ */ React2.createElement(Card2.Meta, { title: actorName, style: { textAlign: "center" } })
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
      const stars = detail && detail.stars ? detail.stars.map((s) => s.name || s).filter(Boolean) : [];
      const genres = detail && detail.genres ? detail.genres.map((g) => g.name || g).filter(Boolean) : [];
      return /* @__PURE__ */ React2.createElement(
        Card2,
        {
          key: movie.id,
          size: "small",
          hoverable: true,
          style: { marginBottom: 8 },
          styles: { body: { padding: "10px 16px" } }
        },
        /* @__PURE__ */ React2.createElement("div", { style: { display: "flex", alignItems: "center", gap: 8, marginBottom: 4 } }, /* @__PURE__ */ React2.createElement(Tag2, { color: "blue", style: { fontWeight: 700, fontSize: 13, margin: 0 } }, movie.id), movie.date && /* @__PURE__ */ React2.createElement(Text2, { type: "secondary", style: { fontSize: 12 } }, "\u{1F4C5} ", movie.date)),
        /* @__PURE__ */ React2.createElement(
          Text2,
          {
            strong: true,
            style: { display: "block", fontSize: 14, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", marginBottom: 4 },
            title: movie.title || movie.full_title
          },
          movie.title || movie.full_title
        ),
        stars.length > 0 && /* @__PURE__ */ React2.createElement("div", { style: { display: "flex", flexWrap: "wrap", gap: 4, alignItems: "center", marginBottom: 4 } }, /* @__PURE__ */ React2.createElement(Text2, { type: "secondary", style: { fontSize: 11 } }, "\u{1F464}"), stars.map((s) => /* @__PURE__ */ React2.createElement(Tag2, { key: s, color: "magenta", style: { margin: 0, fontSize: 11 } }, s))),
        genres.length > 0 && /* @__PURE__ */ React2.createElement("div", { style: { display: "flex", flexWrap: "wrap", gap: 4, alignItems: "center", marginBottom: 4 } }, /* @__PURE__ */ React2.createElement(Text2, { type: "secondary", style: { fontSize: 11 } }, "\u{1F3F7}"), genres.slice(0, 8).map((g) => /* @__PURE__ */ React2.createElement(Tag2, { key: g, color: "cyan", style: { margin: 0, fontSize: 11 } }, g)), genres.length > 8 && /* @__PURE__ */ React2.createElement(Text2, { type: "secondary", style: { fontSize: 11 } }, "+", genres.length - 8)),
        /* @__PURE__ */ React2.createElement(Divider, { style: { margin: "6px 0" } }),
        /* @__PURE__ */ React2.createElement("div", { style: { display: "flex", alignItems: "center", gap: 8, minWidth: 0 } }, magnetLoading && /* @__PURE__ */ React2.createElement(React2.Fragment, null, /* @__PURE__ */ React2.createElement(Spin, { size: "small" }), /* @__PURE__ */ React2.createElement(Text2, { type: "secondary", style: { fontSize: 12 } }, "\u641C\u7D22\u78C1\u529B\u94FE\u63A5...")), magnets && magnets.length === 0 && /* @__PURE__ */ React2.createElement(Text2, { type: "danger", style: { fontSize: 12 } }, "\u26A0 \u6682\u65E0\u53EF\u7528\u8D44\u6E90"), hasMagnets && /* @__PURE__ */ React2.createElement(React2.Fragment, null, /* @__PURE__ */ React2.createElement(Tag2, { color: "gold", style: { margin: 0, fontSize: 11, flexShrink: 0 } }, "\u6700\u4F73"), bestMagnet.hasSubtitle && /* @__PURE__ */ React2.createElement(Tag2, { color: "green", style: { margin: 0, fontSize: 11, flexShrink: 0 } }, "\u5B57\u5E55"), /* @__PURE__ */ React2.createElement(Text2, { type: "secondary", style: { fontSize: 12, flexShrink: 0 } }, bestMagnet.size), bestMagnet.date && /* @__PURE__ */ React2.createElement(Text2, { type: "secondary", style: { fontSize: 12, flexShrink: 0 } }, bestMagnet.date), /* @__PURE__ */ React2.createElement(
          "a",
          {
            href: bestMagnet.link,
            target: "_blank",
            rel: "noreferrer",
            style: { fontSize: 12, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1, minWidth: 0 },
            title: bestMagnet.title
          },
          "\u{1F9F2} ",
          bestMagnet.title
        )))
      );
    };
    return /* @__PURE__ */ React2.createElement(
      ConfigProvider,
      {
        theme: {
          token: {
            colorPrimary: "#1677ff",
            borderRadius: 6,
            fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif'
          }
        }
      },
      /* @__PURE__ */ React2.createElement("div", null, /* @__PURE__ */ React2.createElement(Layout2, { style: { minHeight: "100vh", maxWidth: 1600, margin: "0 auto" } }, /* @__PURE__ */ React2.createElement(Header, { style: { display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 24px", height: "72px" } }, /* @__PURE__ */ React2.createElement("div", { style: { display: "flex", alignItems: "center", gap: 20 } }, /* @__PURE__ */ React2.createElement("div", { style: { display: "flex", alignItems: "center" } }, /* @__PURE__ */ React2.createElement("img", { src: "/static/logo.jpg", alt: "Logo", style: { height: "52px", marginRight: "16px", borderRadius: "4px" } }), /* @__PURE__ */ React2.createElement(Title2, { level: 3, style: { margin: 0, fontWeight: 700, letterSpacing: "-0.5px", color: "#fff" } }, "JavJaeger"), /* @__PURE__ */ React2.createElement(Divider, { type: "vertical", style: { height: "28px", margin: "0 20px" } }), /* @__PURE__ */ React2.createElement(Text2, { style: { fontSize: "14px", letterSpacing: "1px", fontWeight: 500, color: "rgba(255,255,255,0.75)" }, className: "subtitle-hidden-mobile" }, "\u4EBA\u7C7B\u7684\u4E00\u5207\u75DB\u82E6\uFF0C\u90FD\u662F\u56E0\u4E3A\u6027\u6B32\u5F97\u4E0D\u5230\u6EE1\u8DB3\u3002")), /* @__PURE__ */ React2.createElement(
        Segmented,
        {
          value: activePage,
          onChange: setActivePage,
          options: [
            { label: "\u5F71\u7247\u68C0\u7D22", value: "jav" },
            { label: "WebDAV\u4E0B\u8F7D", value: "webdav" }
          ]
        }
      )), /* @__PURE__ */ React2.createElement(Space2, { size: "large" }, /* @__PURE__ */ React2.createElement(Text2, { type: "secondary", style: { fontSize: "13px" } }, displayVersion, " (", versionInfo.build_date, ")"), /* @__PURE__ */ React2.createElement("a", { href: "https://github.com/cnlutong/JavJaeger", target: "_blank", rel: "noreferrer" }, /* @__PURE__ */ React2.createElement("svg", { viewBox: "0 0 24 24", fill: "currentColor", width: "24", height: "24" }, /* @__PURE__ */ React2.createElement("path", { d: "M12 0C5.374 0 0 5.373 0 12 0 17.302 3.438 21.8 8.207 23.387c.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23A11.509 11.509 0 0112 5.803c1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576C20.566 21.797 24 17.3 24 12c0-6.627-5.373-12-12-12z" }))))), activePage === "jav" ? /* @__PURE__ */ React2.createElement(Layout2, null, /* @__PURE__ */ React2.createElement(
        Sider,
        {
          width: 320,
          theme: "light",
          collapsible: true,
          collapsed: collapsedLeft,
          onCollapse: (value) => setCollapsedLeft(value),
          style: { overflow: "auto", height: "100%" }
        },
        /* @__PURE__ */ React2.createElement("div", { style: { padding: "16px" } }, /* @__PURE__ */ React2.createElement(Title2, { level: 5 }, "\u{1F50D} \u67E5\u8BE2\u529F\u80FD"), /* @__PURE__ */ React2.createElement(Divider, { style: { margin: "12px 0" } }), /* @__PURE__ */ React2.createElement(Card2, { title: "\u{1F4CB} \u5F71\u7247\u5217\u8868\u7B5B\u9009", size: "small", style: { marginBottom: 16 } }, /* @__PURE__ */ React2.createElement(Form2, { form: filterForm, onFinish: filterMovies, layout: "vertical", initialValues: { magnet: "exist", type: "normal", fetchMode: "page" } }, /* @__PURE__ */ React2.createElement(Form2.Item, { name: "filterType", style: { marginBottom: 8 } }, /* @__PURE__ */ React2.createElement(Select, { placeholder: "\u9009\u62E9\u7B5B\u9009\u7C7B\u578B", allowClear: true, optionLabelProp: "label" }, /* @__PURE__ */ React2.createElement(Option, { value: "star", label: "\u6F14\u5458" }, /* @__PURE__ */ React2.createElement("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "center" } }, /* @__PURE__ */ React2.createElement("span", null, "\u6F14\u5458"), /* @__PURE__ */ React2.createElement("a", { onClick: (e) => {
          e.stopPropagation();
          filterForm.setFieldsValue({ filterType: "star" });
          setViewMode("browseActor");
        } }, "\u6D4F\u89C8"))), /* @__PURE__ */ React2.createElement(Option, { value: "genre", label: "\u7C7B\u522B" }, /* @__PURE__ */ React2.createElement("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "center" } }, /* @__PURE__ */ React2.createElement("span", null, "\u7C7B\u522B"), /* @__PURE__ */ React2.createElement("a", { onClick: (e) => {
          e.stopPropagation();
          filterForm.setFieldsValue({ filterType: "genre" });
          setViewMode("browseCategory");
        } }, "\u6D4F\u89C8"))), /* @__PURE__ */ React2.createElement(Option, { value: "director", label: "\u5BFC\u6F14" }, "\u5BFC\u6F14"), /* @__PURE__ */ React2.createElement(Option, { value: "studio", label: "\u5236\u4F5C\u5546" }, "\u5236\u4F5C\u5546"), /* @__PURE__ */ React2.createElement(Option, { value: "label", label: "\u53D1\u884C\u5546" }, "\u53D1\u884C\u5546"), /* @__PURE__ */ React2.createElement(Option, { value: "series", label: "\u7CFB\u5217" }, "\u7CFB\u5217"))), /* @__PURE__ */ React2.createElement(Form2.Item, { name: "filterValue", hidden: true }, /* @__PURE__ */ React2.createElement(Input2, null)), /* @__PURE__ */ React2.createElement(Form2.Item, { style: { marginBottom: 8 } }, /* @__PURE__ */ React2.createElement(Form2.Item, { name: "filterValueName", noStyle: true }, /* @__PURE__ */ React2.createElement(
          Input2,
          {
            placeholder: "\u8F93\u5165\u7B5B\u9009\u4EE3\u7801\u6216\u540D\u79F0",
            onChange: (e) => filterForm.setFieldsValue({ filterValue: e.target.value }),
            allowClear: true
          }
        ))), /* @__PURE__ */ React2.createElement(Form2.Item, { name: "magnet", style: { marginBottom: 8 } }, /* @__PURE__ */ React2.createElement(Select, { placeholder: "\u78C1\u529B\u94FE\u63A5\u72B6\u6001" }, /* @__PURE__ */ React2.createElement(Option, { value: "exist" }, "\u6709\u78C1\u529B\u94FE\u63A5"), /* @__PURE__ */ React2.createElement(Option, { value: "all" }, "\u5168\u90E8\u5F71\u7247"))), /* @__PURE__ */ React2.createElement(Form2.Item, { name: "type", style: { marginBottom: 8 } }, /* @__PURE__ */ React2.createElement(Select, { placeholder: "\u5F71\u7247\u7C7B\u578B" }, /* @__PURE__ */ React2.createElement(Option, { value: "normal" }, "\u6709\u7801\u5F71\u7247"), /* @__PURE__ */ React2.createElement(Option, { value: "uncensored" }, "\u65E0\u7801\u5F71\u7247"))), /* @__PURE__ */ React2.createElement(Form2.Item, { name: "actorCountFilter", label: "\u6F14\u5458\u4EBA\u6570", style: { marginBottom: 8 } }, /* @__PURE__ */ React2.createElement(Select, { placeholder: "\u4E0D\u9650\u5236", allowClear: true }, /* @__PURE__ */ React2.createElement(Option, { value: "1" }, "\u5355\u4EBA\u4F5C\u54C1 (=1)"), /* @__PURE__ */ React2.createElement(Option, { value: "2" }, "\u53CC\u4EBA\u4F5C\u54C1 (=2)"), /* @__PURE__ */ React2.createElement(Option, { value: "3" }, "\u4E09\u4EBA\u4F5C\u54C1 (=3)"), /* @__PURE__ */ React2.createElement(Option, { value: "<=2" }, "\u5C11\u4E8E\u7B49\u4E8E2\u4EBA"), /* @__PURE__ */ React2.createElement(Option, { value: "<=3" }, "\u5C11\u4E8E\u7B49\u4E8E3\u4EBA"), /* @__PURE__ */ React2.createElement(Option, { value: ">=3" }, "\u5927\u4E8E\u7B49\u4E8E3\u4EBA"), /* @__PURE__ */ React2.createElement(Option, { value: ">=4" }, "\u5927\u4E8E\u7B49\u4E8E4\u4EBA"))), /* @__PURE__ */ React2.createElement(Form2.Item, { name: "hasSubtitle", label: "\u5B57\u5E55\u8981\u6C42", style: { marginBottom: 8 } }, /* @__PURE__ */ React2.createElement(Select, { placeholder: "\u4E0D\u9650\u5236", allowClear: true }, /* @__PURE__ */ React2.createElement(Option, { value: "" }, "\u5305\u542B\u6216\u4E0D\u5305\u542B\u90FD\u53EF\u4EE5"), /* @__PURE__ */ React2.createElement(Option, { value: "true" }, "\u5305\u542B\u5B57\u5E55"), /* @__PURE__ */ React2.createElement(Option, { value: "false" }, "\u4E0D\u542B\u5B57\u5E55"))), /* @__PURE__ */ React2.createElement(Form2.Item, { name: "fetchMode", label: "\u83B7\u53D6\u65B9\u5F0F", style: { marginBottom: 8 } }, /* @__PURE__ */ React2.createElement(Select, null, /* @__PURE__ */ React2.createElement(Option, { value: "page" }, "\u9010\u9875\u83B7\u53D6 (\u6BCF\u987530\u4E2A)"), /* @__PURE__ */ React2.createElement(Option, { value: "all" }, "\u83B7\u53D6\u5168\u90E8 (\u6240\u6709\u9875)"))), /* @__PURE__ */ React2.createElement(Button2, { type: "primary", htmlType: "submit", block: true, loading }, "\u7B5B\u9009"))), /* @__PURE__ */ React2.createElement(Card2, { title: "\u{1F3AC} \u5F71\u7247\u67E5\u8BE2", size: "small", style: { marginBottom: 16 } }, /* @__PURE__ */ React2.createElement(Form2, { onFinish: searchMovie, layout: "vertical" }, /* @__PURE__ */ React2.createElement(Form2.Item, { name: "keyword", style: { marginBottom: 8 }, rules: [{ required: true, message: "\u8BF7\u8F93\u5165\u756A\u53F7" }] }, /* @__PURE__ */ React2.createElement(Input2, { placeholder: "\u8F93\u5165\u5F71\u7247\u756A\u53F7" })), /* @__PURE__ */ React2.createElement(Button2, { type: "primary", htmlType: "submit", block: true, loading }, "\u641C\u7D22"))), /* @__PURE__ */ React2.createElement(Card2, { title: "\u{1F9F2} \u78C1\u529B\u94FE\u63A5\u67E5\u8BE2", size: "small", style: { marginBottom: 16 } }, /* @__PURE__ */ React2.createElement(Form2, { onFinish: searchMagnet, layout: "vertical" }, /* @__PURE__ */ React2.createElement(Form2.Item, { name: "movieId", style: { marginBottom: 8 }, rules: [{ required: true, message: "\u8BF7\u8F93\u5165\u756A\u53F7" }] }, /* @__PURE__ */ React2.createElement(Input2, { placeholder: "\u8F93\u5165\u5F71\u7247\u756A\u53F7" })), /* @__PURE__ */ React2.createElement(Form2.Item, { name: "sortBy", style: { marginBottom: 8 } }, /* @__PURE__ */ React2.createElement(Select, { placeholder: "\u6392\u5E8F\u65B9\u5F0F", allowClear: true }, /* @__PURE__ */ React2.createElement(Option, { value: "date" }, "\u65E5\u671F"), /* @__PURE__ */ React2.createElement(Option, { value: "size" }, "\u5927\u5C0F"))), /* @__PURE__ */ React2.createElement(Form2.Item, { name: "sortOrder", style: { marginBottom: 8 } }, /* @__PURE__ */ React2.createElement(Select, { placeholder: "\u6392\u5E8F\u987A\u5E8F", allowClear: true }, /* @__PURE__ */ React2.createElement(Option, { value: "asc" }, "\u5347\u5E8F"), /* @__PURE__ */ React2.createElement(Option, { value: "desc" }, "\u964D\u5E8F"))), /* @__PURE__ */ React2.createElement(Form2.Item, { name: "hasSubtitle", style: { marginBottom: 8 } }, /* @__PURE__ */ React2.createElement(Select, { placeholder: "\u5B57\u5E55\u7B5B\u9009", allowClear: true }, /* @__PURE__ */ React2.createElement(Option, { value: "true" }, "\u6709\u5B57\u5E55"), /* @__PURE__ */ React2.createElement(Option, { value: "false" }, "\u65E0\u5B57\u5E55"))), /* @__PURE__ */ React2.createElement(Button2, { type: "primary", htmlType: "submit", block: true, loading }, "\u67E5\u8BE2\u78C1\u529B\u94FE\u63A5"))), /* @__PURE__ */ React2.createElement(Card2, { title: "\u{1F3AF} \u5F71\u7247\u8BC6\u522B", size: "small", style: { marginBottom: 16 } }, /* @__PURE__ */ React2.createElement(Form2, { onFinish: handleRecognizeMovie, layout: "vertical", initialValues: { autoDownload: true } }, /* @__PURE__ */ React2.createElement(Form2.Item, { name: "htmlContent", rules: [{ required: true, message: "\u8BF7\u7C98\u8D34HTML\u6E90\u4EE3\u7801" }], style: { marginBottom: 8 } }, /* @__PURE__ */ React2.createElement(Input2.TextArea, { placeholder: "\u8BF7\u7C98\u8D34JAVLibrary\u7F51\u9875\u6E90\u4EE3\u7801...", rows: 4 })), /* @__PURE__ */ React2.createElement(Form2.Item, { name: "autoDownload", style: { marginBottom: 12 } }, /* @__PURE__ */ React2.createElement(
          Segmented,
          {
            block: true,
            options: [
              { label: "\u4EC5\u8BC6\u522B", value: false },
              { label: "\u81EA\u52A8\u4E0B\u8F7D\u6700\u4F73", value: true }
            ]
          }
        )), /* @__PURE__ */ React2.createElement(Form2.Item, { name: "hasSubtitle", style: { marginBottom: 8 } }, /* @__PURE__ */ React2.createElement(Select, { placeholder: "\u5B57\u5E55\u7B5B\u9009", allowClear: true }, /* @__PURE__ */ React2.createElement(Option, { value: "true" }, "\u6709\u5B57\u5E55"), /* @__PURE__ */ React2.createElement(Option, { value: "false" }, "\u65E0\u5B57\u5E55"))), /* @__PURE__ */ React2.createElement(Form2.Item, { name: "exclude4k", style: { marginBottom: 16 } }, /* @__PURE__ */ React2.createElement(
          Segmented,
          {
            block: true,
            options: [
              { label: "\u4E0D\u6392\u96644K", value: false },
              { label: "\u6392\u96644K", value: true }
            ]
          }
        )), /* @__PURE__ */ React2.createElement(Button2, { type: "primary", htmlType: "submit", block: true, loading }, "\u{1F50D} \u8BC6\u522B\u5E76\u4E0B\u8F7D"))), /* @__PURE__ */ React2.createElement(Card2, { title: "\u{1F3AC} \u756A\u53F7\u81EA\u52A8\u4E0B\u8F7D", size: "small", style: { marginBottom: 16 } }, /* @__PURE__ */ React2.createElement(Form2, { onFinish: handleCodeDownload, layout: "vertical", initialValues: { autoDownload: true } }, /* @__PURE__ */ React2.createElement(Form2.Item, { name: "movieCodes", rules: [{ required: true, message: "\u8BF7\u8F93\u5165\u756A\u53F7" }], style: { marginBottom: 8 } }, /* @__PURE__ */ React2.createElement(Input2.TextArea, { placeholder: "\u652F\u6301\u591A\u884C\u3001\u7A7A\u683C\u5206\u9694...", rows: 4 })), /* @__PURE__ */ React2.createElement(Form2.Item, { name: "autoDownload", style: { marginBottom: 12 } }, /* @__PURE__ */ React2.createElement(
          Segmented,
          {
            block: true,
            options: [
              { label: "\u4EC5\u641C\u7D22", value: false },
              { label: "\u81EA\u52A8\u4E0B\u8F7D\u6700\u4F73", value: true }
            ]
          }
        )), /* @__PURE__ */ React2.createElement(Form2.Item, { name: "hasSubtitle", style: { marginBottom: 8 } }, /* @__PURE__ */ React2.createElement(Select, { placeholder: "\u5B57\u5E55\u7B5B\u9009", allowClear: true }, /* @__PURE__ */ React2.createElement(Option, { value: "true" }, "\u6709\u5B57\u5E55"), /* @__PURE__ */ React2.createElement(Option, { value: "false" }, "\u65E0\u5B57\u5E55"))), /* @__PURE__ */ React2.createElement(Form2.Item, { name: "exclude4k", style: { marginBottom: 16 } }, /* @__PURE__ */ React2.createElement(
          Segmented,
          {
            block: true,
            options: [
              { label: "\u4E0D\u6392\u96644K", value: false },
              { label: "\u6392\u96644K", value: true }
            ]
          }
        )), /* @__PURE__ */ React2.createElement(Button2, { type: "primary", htmlType: "submit", block: true, loading }, "\u{1F680} \u641C\u7D22\u5E76\u4E0B\u8F7D"))))
      ), /* @__PURE__ */ React2.createElement(Content2, { style: { padding: "24px", margin: 0, minHeight: 280, overflow: "auto" } }, /* @__PURE__ */ React2.createElement(Card2, { bordered: false, style: { minHeight: "100%" } }, viewMode === "search" && /* @__PURE__ */ React2.createElement(React2.Fragment, null, /* @__PURE__ */ React2.createElement("div", { style: { display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 } }, /* @__PURE__ */ React2.createElement(Title2, { level: 4, style: { margin: 0 } }, "\u{1F4CA} \u67E5\u8BE2\u7ED3\u679C"), /* @__PURE__ */ React2.createElement(
        Button2,
        {
          type: "primary",
          disabled: !isLoggedIn && !clientConfig.pikpak.configured || !moviesData || !moviesData.movies || moviesData.movies.length === 0,
          loading,
          icon: /* @__PURE__ */ React2.createElement("span", { role: "img", "aria-label": "download" }, "\u{1F4E5}"),
          onClick: handleDownloadAllMovies
        },
        "\u4E0B\u8F7D\u672C\u9875\u5168\u90E8\u5F71\u7247"
      )), /* @__PURE__ */ React2.createElement(Divider, { style: { margin: "0 0 16px 0" } })), renderContent())), /* @__PURE__ */ React2.createElement(
        Sider,
        {
          width: 300,
          theme: "light",
          collapsible: true,
          collapsed: collapsedRight,
          onCollapse: (value) => setCollapsedRight(value),
          style: { overflow: "auto", height: "100%" },
          reverseArrow: true
        },
        /* @__PURE__ */ React2.createElement("div", { style: { padding: "16px" } }, /* @__PURE__ */ React2.createElement(Title2, { level: 5 }, "\u{1F4E5} \u4E0B\u8F7D\u7BA1\u7406"), /* @__PURE__ */ React2.createElement(Divider, { style: { margin: "12px 0" } }), /* @__PURE__ */ React2.createElement(
          Button2,
          {
            type: "default",
            block: true,
            icon: /* @__PURE__ */ React2.createElement("span", { role: "img", "aria-label": "history" }, "\u{1F4C2}"),
            onClick: fetchHistory,
            style: { marginBottom: "16px" }
          },
          "\u67E5\u770B\u5386\u53F2\u8BB0\u5F55"
        ), /* @__PURE__ */ React2.createElement(Card2, { title: "\u{1F510} PikPak \u767B\u5F55", size: "small", style: { marginBottom: "16px" } }, !isLoggedIn ? /* @__PURE__ */ React2.createElement(Form2, { layout: "vertical", onFinish: handlePikPakLogin }, /* @__PURE__ */ React2.createElement(Form2.Item, { name: "username", style: { marginBottom: "12px" }, rules: [{ required: true, message: "\u8BF7\u8F93\u5165\u7528\u6237\u540D" }] }, /* @__PURE__ */ React2.createElement(Input2, { placeholder: "\u7528\u6237\u540D", autoComplete: "username" })), /* @__PURE__ */ React2.createElement(Form2.Item, { name: "password", style: { marginBottom: "12px" }, rules: [{ required: true, message: "\u8BF7\u8F93\u5165\u5BC6\u7801" }] }, /* @__PURE__ */ React2.createElement(Input2.Password, { placeholder: "\u5BC6\u7801", autoComplete: "current-password" })), /* @__PURE__ */ React2.createElement(Space2, { direction: "vertical", style: { width: "100%" } }, /* @__PURE__ */ React2.createElement(Button2, { type: "primary", htmlType: "submit", block: true, loading }, "\u767B\u5F55"), clientConfig.pikpak.configured && /* @__PURE__ */ React2.createElement(Button2, { block: true, onClick: () => handlePikPakLoginFromConfig(), loading }, "\u4F7F\u7528\u914D\u7F6E\u767B\u5F55"))) : /* @__PURE__ */ React2.createElement("div", { style: { textAlign: "center" } }, /* @__PURE__ */ React2.createElement(Text2, { type: "success", strong: true }, "\u2713 \u5DF2\u767B\u5F55"), /* @__PURE__ */ React2.createElement("div", { style: { marginTop: 8 } }, pikpakCredentials?.username), /* @__PURE__ */ React2.createElement(Button2, { danger: true, style: { marginTop: 12 }, block: true, onClick: handleLogout }, "\u9000\u51FA\u767B\u5F55"))), /* @__PURE__ */ React2.createElement(Card2, { title: "\u{1F9F2} \u78C1\u529B\u94FE\u63A5\u6765\u6E90", size: "small", style: { marginBottom: "16px" } }, /* @__PURE__ */ React2.createElement(
          Form2,
          {
            form: magnetSettingsForm,
            layout: "vertical",
            initialValues: { magnetSource: "javbus", globalExclude4k: false },
            onValuesChange: handleMagnetSettingsChange
          },
          /* @__PURE__ */ React2.createElement(Form2.Item, { name: "magnetSource", label: "\u9009\u62E9\u6765\u6E90", style: { marginBottom: "12px" } }, /* @__PURE__ */ React2.createElement(Select, null, /* @__PURE__ */ React2.createElement(Option, { value: "javbus" }, "JavBus API (\u9ED8\u8BA4)"), /* @__PURE__ */ React2.createElement(Option, { value: "cilisousuo" }, "Cilisousuo"))),
          /* @__PURE__ */ React2.createElement(Form2.Item, { name: "globalExclude4k", style: { marginBottom: 0 } }, /* @__PURE__ */ React2.createElement(
            Segmented,
            {
              block: true,
              options: [
                { label: "\u4E0D\u6392\u96644K", value: false },
                { label: "\u5168\u5C40\u6392\u96644K", value: true }
              ]
            }
          ))
        )))
      )) : /* @__PURE__ */ React2.createElement("div", { style: { background: "#fff", minHeight: "calc(100vh - 72px)" } }, /* @__PURE__ */ React2.createElement(WebDavPage, null))))
    );
  }

  // frontend/src/App.jsx
  var React3 = window.React;
  function App() {
    return /* @__PURE__ */ React3.createElement(JavPage, null);
  }

  // frontend/src/main.jsx
  var React4 = window.React;
  var ReactDOM = window.ReactDOM;
  var root = ReactDOM.createRoot(document.getElementById("root"));
  root.render(/* @__PURE__ */ React4.createElement(App, null));
})();
