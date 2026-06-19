const React = window.React;
const antd = window.antd;
const icons = window.icons || {};

const { Button, Empty, Input, List, Modal, Space, Typography, message } = antd;
const { Text } = Typography;
const { ArrowUpOutlined, FolderOpenOutlined, HomeOutlined } = icons;

const Icon = ({ as: Component }) => Component ? <Component /> : null;

const fetchDirectories = async (path) => {
    const query = path ? `?path=${encodeURIComponent(path)}` : "";
    const response = await fetch(`/api/system/directories${query}`);
    const data = await response.json();
    if (!response.ok || !data.success) {
        throw new Error(data.message || `HTTP ${response.status}`);
    }
    return data;
};

export default function DirectoryInput({ value, onChange, placeholder, disabled }) {
    const [open, setOpen] = React.useState(false);
    const [loading, setLoading] = React.useState(false);
    const [browser, setBrowser] = React.useState({ current_path: "", parent_path: null, entries: [] });

    const loadPath = async (path) => {
        setLoading(true);
        try {
            const data = await fetchDirectories(path);
            setBrowser(data);
        } catch (error) {
            message.error(`加载目录失败：${error.message}`);
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

    return (
        <>
            <Space.Compact block>
                <Input
                    value={value}
                    disabled={disabled}
                    placeholder={placeholder}
                    onChange={(event) => onChange?.(event.target.value)}
                />
                <Button
                    htmlType="button"
                    disabled={disabled}
                    icon={<Icon as={FolderOpenOutlined} />}
                    onClick={openBrowser}
                >
                    浏览
                </Button>
            </Space.Compact>
            <Modal
                title="选择服务端目录"
                open={open}
                onCancel={() => setOpen(false)}
                onOk={chooseCurrentPath}
                okText="选择当前目录"
                cancelText="取消"
                okButtonProps={{ disabled: !browser.current_path }}
                width={720}
            >
                <Space style={{ width: "100%", marginBottom: 12 }} wrap>
                    <Button
                        htmlType="button"
                        icon={<Icon as={HomeOutlined} />}
                        onClick={() => loadPath("")}
                    >
                        根目录
                    </Button>
                    <Button
                        htmlType="button"
                        icon={<Icon as={ArrowUpOutlined} />}
                        disabled={!browser.parent_path}
                        onClick={() => loadPath(browser.parent_path)}
                    >
                        上一级
                    </Button>
                    <Text copyable={!!browser.current_path} ellipsis style={{ maxWidth: 470 }}>
                        {browser.current_path || "选择一个起始位置"}
                    </Text>
                </Space>
                <List
                    bordered
                    loading={loading}
                    dataSource={browser.entries || []}
                    locale={{ emptyText: <Empty description="没有可进入的目录" /> }}
                    renderItem={(entry) => (
                        <List.Item
                            actions={[
                                <Button
                                    key="open"
                                    htmlType="button"
                                    size="small"
                                    onClick={() => loadPath(entry.path)}
                                >
                                    打开
                                </Button>,
                            ]}
                        >
                            <List.Item.Meta
                                avatar={<Icon as={FolderOpenOutlined} />}
                                title={<a onClick={() => loadPath(entry.path)}>{entry.name}</a>}
                                description={entry.path}
                            />
                        </List.Item>
                    )}
                />
            </Modal>
        </>
    );
}
