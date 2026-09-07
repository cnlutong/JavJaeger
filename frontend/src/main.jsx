import './design/support.js';
import './design/_ds/nocturne-a411c719-802a-43bb-be07-3768bc4bc706/_ds_bundle.js';
import './design/_ds/nocturne-a411c719-802a-43bb-be07-3768bc4bc706/styles.css';
import './design/host.css';
import source from './design/JavJaeger.dc.html';
import logo from './design/static/logo.jpg';
import { connectDesign, designDataExports, adaptDesignScript } from './design/integration.mjs';
import { adaptTemplate } from './design/template.mjs';

function mountApp() {
    if (!window.__dcUpdate) {
        document.getElementById('root').textContent = '界面依赖加载失败，请检查网络后刷新页面。';
        return;
    }
    const name = 'JavJaeger';
    window.__dcUpdate(name, 'html', adaptTemplate(source.match(/<x-dc>([\s\S]*?)<\/x-dc>/)[1], logo), false);
    window.__dcUpdate(name, 'js', adaptDesignScript(source.match(/<script[^>]*data-dc-script[^>]*>([\s\S]*?)<\/script>/)[1]) + designDataExports, false);
    const entry = window.__dcRegistry[name];
    entry.Logic = connectDesign(entry.Logic);
    entry.fetched = true;
    window.ReactDOM.createRoot(document.getElementById('root')).render(window.React.createElement(window.getDC(name)));
}

// The runtime initializes after React; its fallback scripts may still be loading.
Promise.resolve().then(() => {
    if (window.__dcUpdate || document.readyState === 'complete') mountApp();
    else window.addEventListener('load', mountApp, { once: true });
});
