const React = window.React;
const { Typography, Tag } = window.antd;
const { Title, Text } = Typography;

export function PageIntro({ title, description, actions }) {
  return (
    <header className="wb-page-intro">
      <div>
        <Title level={2}>{title}</Title>
        <Text type="secondary">{description}</Text>
      </div>
      {actions ? <div className="wb-page-actions">{actions}</div> : null}
    </header>
  );
}

export function StatusDot({ ready, children }) {
  return <span className={`wb-status ${ready ? "is-ready" : ""}`}><i />{children}</span>;
}

export function StageRail({ active = 1 }) {
  return (
    <div className="wb-stage-rail" aria-label="自动化工作流进度">
      {[
        ["发现", "搜索影片与条件"],
        ["资源", "选择最佳磁力"],
        ["派发", "发送到下载器"],
        ["入库", "扫描整理与命名"],
      ].map(([label, note], index) => (
        <div key={label} className={`wb-stage ${index + 1 <= active ? "is-active" : ""}`}>
          <span>{index + 1}</span>
          <div><strong>{label}</strong><small>{note}</small></div>
        </div>
      ))}
    </div>
  );
}

export function EmptyBlock({ title, description }) {
  return (
    <div className="wb-empty">
      <Tag>JAVJAEGER</Tag>
      <strong>{title}</strong>
      <Text type="secondary">{description}</Text>
    </div>
  );
}
