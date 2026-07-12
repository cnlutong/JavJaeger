import DiscoverPage from "./pages/DiscoverPage.jsx";
import OrganizePage from "./pages/OrganizePage.jsx";
import LibraryPage from "./pages/LibraryPage.jsx";
import AutomationPage from "./pages/AutomationPage.jsx";
import CloudPage from "./pages/CloudPage.jsx";
import DownloadsPage from "./pages/DownloadsPage.jsx";
import SettingsPage from "./pages/SettingsPage.jsx";
import { api } from "./api.js";
import { StatusDot } from "./ui.jsx";

const React = window.React;
const { ConfigProvider, Button, Drawer, Typography } = window.antd;
const { Text } = Typography;
const icons = window.icons || {};

const NAV = [
  ["discover", "发现", icons.SearchOutlined],
  ["organize", "整理", icons.FileSearchOutlined],
  ["library", "影视库", icons.VideoCameraOutlined || icons.DatabaseOutlined],
  ["automation", "自动化", icons.ThunderboltOutlined],
  ["cloud", "云端", icons.CloudOutlined],
  ["downloads", "下载", icons.DownloadOutlined],
  ["settings", "设置", icons.SettingOutlined],
];

const PAGE_TITLES = {
  discover: "发现影片",
  organize: "整理媒体",
  library: "影视库",
  automation: "自动化",
  cloud: "云端文件",
  downloads: "下载队列",
  settings: "系统设置",
};

const THEME = {
  token: {
    colorPrimary: "#2563eb",
    colorInfo: "#2563eb",
    colorSuccess: "#16a34a",
    colorWarning: "#d97706",
    colorError: "#dc2626",
    colorText: "#1f2937",
    colorTextSecondary: "#667085",
    colorBgLayout: "#f3f6fa",
    colorBgContainer: "#ffffff",
    colorBorder: "#d0d5dd",
    borderRadius: 8,
    controlHeight: 40,
    fontFamily: '"Noto Sans SC", "Microsoft YaHei", system-ui, sans-serif',
  },
};

function Glyph({ icon: Icon }) {
  return Icon ? <Icon /> : null;
}

export default function WorkbenchApp() {
  const [page, setPage] = React.useState("discover");
  const [mobileMenu, setMobileMenu] = React.useState(false);
  const [clientConfig, setClientConfig] = React.useState({});
  const [connections, setConnections] = React.useState({});
  const [version, setVersion] = React.useState(window.versionInfo || {});

  const refreshRuntime = React.useCallback(async () => {
    const [configResult, statusResult, infoResult] = await Promise.allSettled([
      api("/api/client-config"),
      api("/api/webdav/status"),
      api("/api/system/info"),
    ]);
    if (configResult.status === "fulfilled") setClientConfig(configResult.value);
    if (statusResult.status === "fulfilled") setConnections(statusResult.value);
    if (infoResult.status === "fulfilled") setVersion(infoResult.value.version || {});
  }, []);

  React.useEffect(() => { void refreshRuntime(); }, [refreshRuntime]);

  const shared = { clientConfig, connections, refreshRuntime, navigate: setPage };
  const pages = {
    discover: <DiscoverPage {...shared} />,
    organize: <OrganizePage {...shared} />,
    library: <LibraryPage {...shared} />,
    automation: <AutomationPage {...shared} />,
    cloud: <CloudPage {...shared} />,
    downloads: <DownloadsPage {...shared} />,
    settings: <SettingsPage {...shared} />,
  };
  const title = PAGE_TITLES[page];

  const navigation = (
    <nav className="wb-nav" aria-label="产品功能">
      {NAV.map(([key, label, icon]) => (
        <button
          type="button"
          key={key}
          className={page === key ? "is-active" : ""}
          onClick={() => { setPage(key); setMobileMenu(false); }}
        >
          <Glyph icon={icon} /><span>{label}</span>
        </button>
      ))}
    </nav>
  );

  return (
    <ConfigProvider theme={THEME}>
      <div className="wb-app">
        <aside className="wb-sidebar">
          <button type="button" className="wb-wordmark" onClick={() => setPage("discover")}>
            <b>Jav</b>Jaeger
          </button>
          {navigation}
          <footer>
            <StatusDot ready>服务运行中</StatusDot>
            <Text>{version.version || "v1.0.0"}</Text>
          </footer>
        </aside>

        <section className="wb-shell">
          <header className="wb-mobile-header">
            <Button className="wb-mobile-menu" type="text" icon={<Glyph icon={icons.MenuOutlined} />} onClick={() => setMobileMenu(true)} />
            <strong>{title}</strong>
          </header>
          <main className="wb-main">{pages[page]}</main>
        </section>

        <div className="wb-bottom-nav">{navigation}</div>
        <Drawer title="JavJaeger" placement="left" open={mobileMenu} onClose={() => setMobileMenu(false)} width={280}>
          {navigation}
        </Drawer>
      </div>
    </ConfigProvider>
  );
}
