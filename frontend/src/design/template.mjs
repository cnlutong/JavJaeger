import { cinemaTemplate } from './cinema.mjs';

// Keep the imported design unchanged; host layout and API controls live here.
export function adaptTemplate(source, logo) {
    let html = source.replaceAll('<i class=', '<i aria-hidden="true" class=')
        .replace(/<link[^>]*href="_ds\/[^"]*"[^>]*>/g, '')
        .replace(/<script src="_ds\/[^"]*"><\/script>/g, '')
        .replaceAll('src="static/logo.jpg"', `src="${logo}"`)
        .replace('>v2.4.1</span>', '>{{ version }}</span>')
        .replace('animation:jjspin 900ms linear infinite"></span>后台', 'animation:{{ bg.animation }}"></span>后台')
        .replace('width:1440px;min-height:900px;', 'width:100%;min-height:100vh;')
        .replace('value="{{ r.path }}">', 'value="{{ r.path }}" onChange="{{ r.change }}" aria-label="路径"><button class="btn btn-secondary" onClick="{{ r.browse }}">浏览</button>')
        .replaceAll('value="{{ f.value }}">', 'value="{{ f.value }}" onChange="{{ f.set }}">')
        .replace('placeholder="{{ f.placeholder }}" value="{{ f.value }}" onChange="{{ f.set }}">\n                    <button', 'type="{{ f.inputType }}" autoComplete="off" placeholder="{{ f.placeholder }}" value="{{ f.value }}" onChange="{{ f.set }}">\n                    <button')
        .replace('<h4 style="margin:0">{{ au.cur.name }}</h4>', '<input class="input" aria-label="任务名称" value="{{ au.cur.name }}" onChange="{{ au.cur.setName }}">')
        .replace('<div style="display:flex;align-items:center;gap:9px;padding:9px 12px;box-shadow:inset 0 -1px 0 var(--line2)">', '<button class="btn btn-ghost" style="display:flex;width:100%;align-items:center;gap:9px;padding:9px 12px;box-shadow:inset 0 -1px 0 var(--line2)" onClick="{{ e.open }}">')
        .replace('{{ e.meta }}</span>\n            </div>', '{{ e.meta }}</span>\n            </button>')
        .replace('onClick="{{ fs.sendSel }}"', 'disabled="{{ !fs.canSend }}" onClick="{{ fs.sendSel }}"')
        .replace('disabled="{{ f.isDir }}" onClick="{{ f.send }}"', 'disabled="{{ !f.canSend }}" onClick="{{ f.send }}"')
        .replace('disabled="{{ f.isDir }}" onChange="{{ f.toggle }}"', 'onChange="{{ f.toggle }}"')
        .replace('onChange="{{ d.toggleSkipLocal }}"', 'disabled="{{ true }}" onChange="{{ d.toggleSkipLocal }}"')
        .replace('onChange="{{ d.toggleSkipTried }}"', 'disabled="{{ true }}" onChange="{{ d.toggleSkipTried }}"')
        .replace('<button class="btn btn-secondary" style="font-size:12px" onClick="{{ lb.stopScan }}">停止</button>', '<span style="font-size:12px;color:var(--dim)">后台执行中</span>');
    html = html.replace('<label>扫描目录</label>', '<label>待刮削目录</label>')
        .replace('<label>整理输出目录</label>', '<label>影视库目录</label>')
        .replace('onChange="{{ sc.setScanDir }}"></div>', 'aria-label="待刮削目录" onChange="{{ sc.setScanDir }}"><button class="btn btn-secondary" onClick="{{ sc.browseSource }}">浏览待刮削目录</button></div>')
        .replace('onChange="{{ sc.setOutDir }}"></div>', 'aria-label="影视库目录" onChange="{{ sc.setOutDir }}"><button class="btn btn-secondary" onClick="{{ sc.browseTarget }}">浏览影视库目录</button><span class="jj-path-hint">读取待刮削目录，按预览整理到影视库目录。本页修改仅用于本次任务。</span><button class="btn btn-ghost" onClick="{{ sc.configurePaths }}">配置默认目录</button></div>')
        .replace('<h5 style="margin:0">影视库路径配置</h5>', '<h5 style="margin:0">媒体目录配置</h5>')
        .replace('<sc-for list="{{ lb.pathGroups }}"', `<div class="field"><label for="jj-source-directory">待刮削目录</label><span class="jj-path-hint">下载完成、尚未整理的原片放在这里。扫描影视库时会跳过此目录。</span><div class="jj-path-input"><input id="jj-source-directory" class="input" aria-label="待刮削目录" value="{{ lb.sourcePath }}" onChange="{{ lb.setSourcePath }}"><button class="btn btn-secondary" onClick="{{ lb.browseSource }}">浏览</button></div></div>
        <sc-for list="{{ lb.pathGroups }}"`)
        .replace('路径变更不会立即扫描。保存后用「扫描入库」重新索引；被移除的路径其影片记录会保留，直到执行「清洗无效文件」。', '保存后，本地刮削会使用这两个默认目录。生成预览后，确认执行才会移动文件；扫描入库只读取影视库目录。修改路径不会删除已有索引或立即扫描。');
    html = html.replace('>媒体库路径</span>', '>影视库目录</span>')
        .replace('<button class="btn btn-secondary btn-block" style="font-size:12.5px" onClick="{{ lb.openPaths }}">', '<div class="jj-path-hint">待刮削目录<div class="jj-path-value">{{ lb.sourceDirectory }}</div></div><button class="btn btn-ghost" onClick="{{ lb.openScrape }}">前往本地刮削</button><button class="btn btn-secondary btn-block" style="font-size:12.5px" onClick="{{ lb.openPaths }}">')
        .replace('<span style="font-size:11px;color:{{ r.stFg }};width:118px;text-align:right">{{ r.status }}</span>', '')
        .replace('选择模板并确认扫描目录后点击「生成预览」。', '确认待刮削目录和影视库目录后点击「生成预览」。');
    const start = html.indexOf('  <sc-if value="{{ cn.player }}">');
    const end = html.indexOf('  <sc-if value="{{ at.auto }}">', start);
    html = html.slice(0, start) + `
  <sc-if value="{{ cn.player }}">
    <div class="jj-player" role="dialog" aria-modal="true" aria-label="本地影片播放">
      <div style="display:flex;align-items:center;flex-wrap:wrap;gap:12px;padding:16px 26px"><span>{{ cn.player.code }} · {{ cn.player.title }}</span><select class="input" aria-label="播放文件" value="{{ cn.player.fileIndex }}" onChange="{{ cn.player.selectFile }}"><sc-for list="{{ cn.player.files }}" as="f"><option value="{{ f.value }}" disabled="{{ f.missing }}">{{ f.label }}</option></sc-for></select><button class="btn btn-secondary" style="margin-left:auto" onClick="{{ cn.closePlayer }}">停止播放</button></div>
      <video src="{{ cn.player.url }}" controls="{{ true }}" autoPlay="{{ true }}" playsInline="{{ true }}" onEnded="{{ cn.player.ended }}" onError="{{ cn.player.error }}" style="width:100%;min-height:0;flex:1;background:#000"></video>
    </div>
  </sc-if>

` + html.slice(end);
    html = html.replace('<sc-if value="{{ se.cur.canTest }}">', '<sc-if value="{{ se.showQrLogin }}"><button class="btn btn-secondary" onClick="{{ se.startQr }}">扫码登录</button></sc-if><sc-if value="{{ se.showLogout }}"><button class="btn btn-secondary" onClick="{{ se.logout }}">退出登录</button></sc-if><sc-if value="{{ se.cur.canTest }}">')
        .replaceAll('class="dialog elev-lg"', 'class="dialog elev-lg" role="dialog" aria-modal="true"')
        .replace('<sc-if value="{{ dlg.open }}">\n    <div class="dialog-backdrop"', '<sc-if value="{{ dlg.open }}">\n    <div class="dialog-backdrop jj-confirm"');
    html = html
        .replace(/(onChange="{{ lb.setActor }}">)[\s\S]*?(<\/select>)/, '$1<sc-for list="{{ lb.actorOptions }}" as="o"><option>{{ o.t }}</option></sc-for>$2')
        .replace(/(onChange="{{ lb.setStudio }}">)[\s\S]*?(<\/select>)/, '$1<sc-for list="{{ lb.studioOptions }}" as="o"><option>{{ o.t }}</option></sc-for>$2')
        .replace('最近扫描 07-23 09:12 · 索引来源 library.db', '已索引的本地影片')
        .replace('正在扫描 /media/JAV-2 · 1,204 / 1,366 文件 · ffprobe 读取媒体参数', '{{ lb.scanMessage }}')
        .replace('width:88%;background:var(--acc)', 'width:{{ lb.scanPercent }}%;background:var(--acc)')
        .replace(/<div style="width:88px;height:88px;flex:none;[^>]*><\/div>/, '<img src="{{ s.toolCfg.qrImage }}" alt="115 登录二维码" style="width:180px;height:180px;flex:none;background:#fff;border-radius:6px">')
        .replace('padding:9px 14px;font-size:13px;animation:jjrise-c', 'padding:9px 14px;font-size:13px;z-index:150;animation:jjrise-c');
    // Per-provider configuration was a non-editable summary in the prototype.
    html = html.replace('{{ s.toggleText }}</button>\n                </div>\n              </div>', `{{ s.toggleText }}</button>
                </div>
                <div class="jj-provider-fields"><sc-for list="{{ s.fields }}" as="f"><div class="field"><label>{{ f.label }}</label><input class="input" aria-label="{{ f.label }}" type="{{ f.inputType }}" value="{{ f.value }}" onChange="{{ f.set }}"></div></sc-for></div>
              </div>`);
    html = html.replace('<sc-if value="{{ f.isSecret }}">', '<sc-if value="{{ f.isPath }}"><div class="jj-path-input"><input class="input" style="font-family:var(--mono)" value="{{ f.value }}" onChange="{{ f.set }}"><button class="btn btn-secondary" aria-label="浏览{{ f.label }}" onClick="{{ f.browse }}">浏览</button></div></sc-if><sc-if value="{{ f.isSecret }}">');
    html = html.replaceAll('value="{{ f.value }}"', 'aria-label="{{ f.label }}" value="{{ f.value }}"')
        .replace('<sc-if value="{{ f.isText }}"><input class="input" style="font-family:{{ f.mono }}', '<sc-if value="{{ f.isText }}"><input type="{{ f.inputType }}" class="input" style="font-family:{{ f.mono }}')
        .replace('<sc-if value="{{ f.isText }}"><input class="input" style="font-family:var(--mono)"', '<sc-if value="{{ f.isCheck }}"><label><input type="checkbox" checked="{{ f.on }}" onChange="{{ f.set }}">{{ f.label }}</label></sc-if><sc-if value="{{ f.isText }}"><input type="{{ f.inputType }}" class="input" style="font-family:var(--mono)"');
    html = html.replace(/批次 b-20260723-1418[^<]+/, '{{ d.batchSummary }}')
        .replace('全部 128', '全部 {{ d.historyCount }}').replace('未入库 3', '未入库 {{ d.missingCount }}').replace('失败 2</span>', '失败 {{ d.failureCount }}</span>')
        .replace('<div style="background:rgba(201,160,94,.06);', '<sc-if value="{{ d.hasFailed }}"><div style="background:rgba(201,160,94,.06);')
        .replace('      <div style="background:var(--surf);border-radius:8px;box-shadow:0 0 0 1px var(--ring);overflow:hidden">\n        <div style="display:flex;align-items:center;gap:12px;padding:11px 14px;box-shadow:inset 0 -1px 0 var(--line2)">\n          <h5 style="margin:0">下载历史', '      </sc-if><div style="background:var(--surf);border-radius:8px;box-shadow:0 0 0 1px var(--ring);overflow:hidden">\n        <div style="display:flex;align-items:center;gap:12px;padding:11px 14px;box-shadow:inset 0 -1px 0 var(--line2)">\n          <h5 style="margin:0">下载历史')
        .replace('标记跳过</button>', '忽略此项</button>')
        .replace('复制 ffmpeg 命令', '复制转码参数')
        .replace('<button class="btn btn-ghost" onClick="{{ au.autoLayout }}">自动排版</button>', '')
        .replace('运行中任务 2 / 4', '已启用任务 {{ au.enabledCount }} / {{ au.taskCount }}')
        .replace('今日自动派发 18 部', '今日自动派发 {{ au.dispatchedToday }} 部')
        .replace('今日跳过 41 · 错误 2', '今日跳过 {{ au.skippedToday }} · 错误 {{ au.errorsToday }}')
        .replace('<b style="color:var(--bad);font-weight:500">AV1 不可用</b><br>av1_nvenc 硬件探针失败：当前驱动 535.161 不支持。相关预设已禁用，不会回退 CPU。', '{{ tc.hardwareMessage }}')
        .replace('并发上限 2', '并发上限 {{ tc.maxConcurrent }}')
        .replaceAll(/每 [125]s 轮询/g, '每 3s 更新')
        .replace(' · 全局并发 5', '')
        .replace('可用变量 {code} {title} {actors} {studio} {label} {series} {year} {date}', '可用变量 {{ sc.namingFields }}')
        .replace('onClick="{{ s.run }}">{{ s.runText }}', 'disabled="{{ s.loading }}" onClick="{{ s.run }}">{{ s.runText }}')
        .replace('onClick="{{ sc.preview }}"', 'disabled="{{ sc.scanning }}" onClick="{{ sc.preview }}"')
        .replace('onClick="{{ sc.reset }}"', 'disabled="{{ sc.scanning }}" onClick="{{ sc.reset }}"')
        .replace('onClick="{{ d.run }}"', 'disabled="{{ !d.runCount }}" onClick="{{ d.run }}"');
    html = html.replace('YHG007 来源不可达', '查询失败')
        .replace(/HTTPConnectionPool\(host='yhg007.com'[\s\S]*?已保留上一次 JavBus 结果缓存。/, '{{ s.error }}。可重试或检查来源设置。')
        .replace('3 个文件冲突需要处理', '{{ sc.nConf }} 个文件冲突需要处理')
        .replace('115 网盘未配置', '当前网盘未连接')
        .replace(/缺少 Cookie，无法列目录或提交离线任务。[\s\S]*?后重新连接。/, '请到设置中连接当前网盘，再浏览目录。')
        .replace('onClick="{{ sc.applyStrategy }}"', 'disabled="{{ !sc.nConf }}" onClick="{{ sc.applyStrategy }}"')
        .replace('onChange="{{ au.togglePauseAll }}"', 'disabled="{{ au.pauseAll }}" onChange="{{ au.togglePauseAll }}"')
        .replace('onClick="{{ se.save }}"', 'disabled="{{ se.saveDisabled }}" onClick="{{ se.save }}"');
    html = html.replace('      <sc-if value="{{ sc.hasPreview }}">\n', `<sc-if value="{{ sc.outcome }}"><div style="background:var(--surf);border-radius:8px;padding:16px"><h5>执行结果 · {{ sc.outcome.summary }}</h5><p>失败项可修正配置后重新生成预览；已完成的文件无需重复处理。</p><button class="btn btn-secondary" onClick="{{ sc.reset }}">完成</button><sc-for list="{{ sc.outcome.rows }}" as="r"><div style="padding:8px 0;border-bottom:1px solid var(--line2);overflow-wrap:anywhere"><span style="color:{{ r.fg }}">{{ r.status }}</span> · {{ r.path }}<div style="color:var(--dim)">{{ r.note }}</div></div></sc-for></div></sc-if><sc-if value="{{ sc.hasPreview }}">`);
    for (const action of ['au.save', 'au.runNow', 'au.toggleRun', 'au.remove']) html = html.replace(`onClick="{{ ${action} }}"`, `disabled="{{ !au.hasTask }}" onClick="{{ ${action} }}"`);
    html = html.replace(/(<sc-for list="{{ lb.actors }}"[^>]*>\s*)<div ([\s\S]*?)<\/div>\s*<\/sc-for>/, '$1<button class="jj-actor-card" onClick="{{ a.open }}" $2</button>\n          </sc-for>')
        .replace('flex:none">{{ a.initial }}</div>', 'flex:none;position:relative;overflow:hidden">{{ a.initial }}<sc-if value="{{ a.avatarUrl }}"><img src="{{ a.avatarUrl }}" alt="" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover"></sc-if></div>')
        .replace(/<aside style="position:absolute;top:0;right:0;bottom:0;/g, '<aside class="jj-drawer" role="dialog" aria-modal="true" aria-label="详情与配置" style="position:fixed;top:0;right:0;bottom:0;')
        .replace(/<div style="position:absolute;inset:0;background:([^\"]+)" onClick=/g, '<div class="jj-scrim" style="position:fixed;inset:0;background:$1" onClick=')
        .replaceAll('style="position:absolute;left:50%;transform:translateX(-50%);bottom:22px;', 'class="jj-selection" style="position:fixed;left:50%;transform:translateX(-50%);bottom:22px;');
    const poster = (key, fit = 'cover') => `<sc-if value="{{ ${key}.cover }}"><img src="{{ ${key}.cover }}" alt="" loading="lazy" style="position:absolute;inset:0;width:100%;height:100%;object-fit:${fit}"></sc-if>`;
    html = html.replace(/(<div style="width:70px;aspect-ratio:3\/2;[^"]*)">{{ r.code }}<\/div>/, `$1;position:relative;overflow:hidden">${poster('r')}{{ r.code }}</div>`)
        .replace(/(<div style="width:74px;aspect-ratio:3\/2;[^"]*)">{{ m.code }}<\/div>/, `$1;position:relative;overflow:hidden">${poster('m')}{{ m.code }}</div>`)
        .replace(/(<div style="width:246px;flex:none;aspect-ratio:3\/2;[^"]*)">{{ s.d.code }}<\/div>/, `$1;position:relative;overflow:hidden;align-self:flex-start">${poster('s.d', 'contain')}{{ s.d.code }}</div>`)
        .replace('position:relative;aspect-ratio:2/3;background:linear-gradient(160deg,var(--ph1),var(--ph3));display:grid;place-items:center">', `position:relative;aspect-ratio:2/3;background:linear-gradient(160deg,var(--ph1),var(--ph3));display:grid;place-items:center">${poster('r')}`);
    html = html.replace('box-shadow:inset 0 -1px 0 var(--line2)">\n                <span', `box-shadow:inset 0 -1px 0 var(--line2)">${poster('m')}\n                <span`)
        .replace('右侧实时预览一条真实文件名', '右侧使用示例元数据预览命名规则');
    html = html.replace('  <sc-if value="{{ at.auto }}">', `
  <sc-if value="{{ sc.repair }}">
    <div class="dialog-backdrop" style="background:var(--ovl)"><div class="dialog elev-lg" role="dialog" aria-modal="true" aria-label="手动指定番号" style="width:480px">
      <div class="dialog-title">手动指定番号</div><p style="overflow-wrap:anywhere">{{ sc.repair.src }}</p>
      <input class="input" aria-label="正确番号" value="{{ sc.repair.code }}" onChange="{{ sc.repair.setCode }}" placeholder="ABP-123">
      <p>重新识别并生成预览，确认执行前不会修改源文件。</p>
      <div class="dialog-actions"><button class="btn btn-secondary" onClick="{{ sc.repair.cancel }}">取消</button><button class="btn btn-primary" onClick="{{ sc.repair.submit }}">重新生成预览</button></div>
    </div></div>
  </sc-if>
  <sc-if value="{{ at.auto }}">`);
    html = html.replace('onClick="{{ s.openBrowse }}"', 'aria-label="浏览筛选目录" onClick="{{ s.openBrowse }}"');
    html = html.replace('<div style="position:absolute;left:50%;top:64px;', '<div class="jj-catalog" role="dialog" aria-modal="true" aria-label="筛选目录" style="position:fixed;left:50%;top:64px;')
        .replace('<aside style="position:absolute;top:52px;right:16px;', '<aside class="jj-popover" role="dialog" aria-label="后台任务" style="position:fixed;top:52px;right:16px;')
        .replace('<div style="position:absolute;top:64px;left:50%;', '<div class="jj-toast" role="status" aria-live="polite" style="position:fixed;top:64px;left:50%;');
    html = html.replace(/<(div|span)([^>]*onClick="{{ (?:n.pick|a.open|f.open|c.go|t.pick|it.pick|t.go)[^>]*?)>/g, '<$1 role="button" tabIndex="0"$2>');
    html = html.replace('<div style="display:flex;align-items:stretch;gap:0">', '<div class="jj-auto-flow" style="display:flex;align-items:stretch;gap:0">')
        .replace('<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:13px">', '<div class="jj-auto-fields" style="display:grid;grid-template-columns:repeat(3,1fr);gap:13px">');
    html = html.replace(/<input([^>]*value="{{ f.value }}"[^>]*)>/g, (input, attrs) => /\btype=/.test(attrs) ? input : `<input type="{{ f.inputType }}"${attrs}>`);
    html = html.replaceAll('<sc-if value="{{ f.isSelect }}">', '<sc-if value="{{ f.isTextarea }}"><textarea class="input" aria-label="{{ f.label }}" rows="3" value="{{ f.value }}" onChange="{{ f.set }}"></textarea></sc-if><sc-if value="{{ f.isSelect }}">');
    const pager = (key, label = '分页') => `<sc-if value="{{ ${key}.visible }}"><nav class="jj-pager" aria-label="${label}"><button class="btn btn-secondary" disabled="{{ ${key}.first }}" onClick="{{ ${key}.prev }}">上一页</button><span role="status">{{ ${key}.text }}</span><button class="btn btn-secondary" disabled="{{ ${key}.last }}" onClick="{{ ${key}.next }}">下一页</button></nav></sc-if>`;
    html = html.replace('<sc-for list="{{ sc.outcome.rows }}"', `${pager('sc.outcome.paging', '执行结果分页')}<sc-for list="{{ sc.outcome.rows }}"`)
        .replace(/(<sc-if value="{{ d.hasFailed }}">[\s\S]*?)(<table class="table")/, `$1${pager('d.failedPaging', '失败资源分页')}$2`);
    html = html.replace('<sc-if value="{{ dlg.hasList }}">', `${pager('dlg.paging')}<sc-if value="{{ dlg.hasList }}">`)
        .replace('<sc-for list="{{ bg.items }}"', `${pager('bg.paging')}<sc-for list="{{ bg.items }}"`);
    for (const [route, key] of [['dispatch', 'd'], ['transcode', 'tc'], ['scrape', 'sc']]) {
        html = html.replace(new RegExp(`(<sc-if value="{{ at.${route} }}">[\\s\\S]*?)(<\\/main>)`), `$1${pager(key + '.paging')}$2`);
    }
    html = html.replace(/(<sc-if value="{{ at.storage }}">[\s\S]*?)(<table)/, `$1${pager('fs.paging')}$2`)
        .replace(/(<h5 style="margin:0">Aria2 任务<\/h5>[\s\S]*?<\/div>\s*)(<table)/, `$1${pager('fs.taskPaging')}$2`)
        .replace('<sc-for list="{{ fs.addForm.entries }}"', `${pager('fs.directoryPaging')}<sc-for list="{{ fs.addForm.entries }}"`);
    html = html.replace(/(<sc-if value="{{ at.library }}">[\s\S]*?)(<\/main>)/, `$1${pager('lb.paging')}$2`)
        .replace(/(<sc-if value="{{ at.search }}"[^>]*>[\s\S]*?)(<\/main>)/, `$1${pager('s.paging')}$2`)
        .replace('<sc-for list="{{ s.browse.groups }}"', `${pager('s.browse.paging')}<sc-for list="{{ s.browse.groups }}"`)
        .replace('<button class="btn btn-secondary" onClick="{{ lb.openCheck }}">', '<button class="btn btn-secondary" onClick="{{ lb.refresh }}">刷新影视库</button><button class="btn btn-ghost" onClick="{{ lb.configureCheck }}">检查项设置</button><button class="btn btn-secondary" disabled="{{ lb.checkBusy }}" onClick="{{ lb.openCheck }}">')
        .replace('onClick="{{ lb.runCheck }}"', 'disabled="{{ lb.checkBusy }}" onClick="{{ lb.runCheck }}"')
        .replace('勾选要检查的资料，作为 <code style="font-family:var(--mono);font-size:11.5px;color:var(--accs)">fields</code> 参数提交；未勾选的项不计入完整度。', '选择检查内容，未勾选的项不计入完整度。检查在后台运行，完成后可从后台任务查看结果并开始补全。')
        .replace('value="{{ lb.q }}"', 'aria-label="影视库搜索" value="{{ lb.q }}"')
        .replace('onClick="{{ lb.tcDialog.submit }}"', 'disabled="{{ !lb.tcDialog.canSubmit }}" onClick="{{ lb.tcDialog.submit }}"');
    // Preserve the library views while adapting table space and accessible controls.
    html = html.replace(/<sc-if value="{{ at.library }}">[\s\S]*?<\/main>\s*<\/div>\s*<\/sc-if>/, library => library
        .replace('<div style="display:flex;align-items:stretch;min-height:848px">', '<div class="jj-library" style="display:flex;align-items:stretch;min-height:848px">')
        .replace('<aside style=', '<aside class="jj-library-sidebar" aria-label="影视库筛选" style=')
        .replace('<main style=', '<main class="jj-library-main" aria-label="影视库内容" style=')
        .replace('<select class="input" style="width:auto;', '<select aria-label="影视库排序" class="input" style="width:auto;')
        .replace('<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:12px">', '<div class="jj-library-stats" style="display:grid;grid-template-columns:repeat(4,1fr);gap:12px">')
        .replace('<div style="background:var(--surf);border-radius:8px;box-shadow:0 0 0 1px var(--ring);overflow:hidden">', '<div class="jj-library-table" style="background:var(--surf);border-radius:8px;box-shadow:0 0 0 1px var(--ring);overflow:hidden">')
        .replace('<sc-if value="{{ lb.showList }}">', '<sc-if value="{{ lb.showList }}"><div class="jj-library-table-tools"><span>拖动表头分隔线调整列宽</span><button class="btn btn-ghost" onClick="{{ lb.resetWidths }}">恢复默认列宽</button></div>')
        .replace('<table class="table">', '<table class="table" style="width:{{ lb.tableWidth }}">')
        .replace(/<thead>[\s\S]*?<\/thead>/, '<thead><tr><sc-for list="{{ lb.columns }}" as="c"><th scope="col" style="width:{{ c.cssWidth }}">{{ c.label }}<span class="jj-column-resize" role="separator" tabIndex="0" aria-label="调整{{ c.label }}列宽" aria-orientation="vertical" aria-valuemin="{{ c.min }}" aria-valuemax="1200" aria-valuenow="{{ c.width }}" title="拖动调整列宽；方向键微调，Home 最窄，End 最宽" onPointerDown="{{ c.resize }}" onKeyDown="{{ c.resize }}"></span></th></sc-for></tr></thead>')
        .replace('<div style="width:70px;aspect-ratio:3/2;', '<div class="jj-library-list-cover" style="width:100%;aspect-ratio:2/3;')
        .replace('<div style="display:grid;grid-template-columns:repeat(6,1fr);gap:13px">', '<div class="jj-library-posters" style="display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:13px">')
        .replace('<div style="font-size:13px;max-width:280px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">', '<div class="jj-library-list-title" title="{{ r.title }}" style="font-size:13px">')
        .replace('<td style="font-size:12.5px;color:var(--dim)">{{ r.actorText }}</td>', '<td class="jj-library-list-actors" title="{{ r.actorText }}" style="font-size:12.5px;color:var(--dim)">{{ r.actorText }}</td>')
        .replace(/<div onClick="{{ r.open }}"([^>]*)>([\s\S]*?)\s*<\/div>\s*<\/sc-for>/, '<button class="jj-library-card" aria-label="查看 {{ r.code }} 详情" title="{{ r.title }}" onClick="{{ r.open }}"$1>$2\n</button></sc-for>')
        .replace('background:linear-gradient(transparent,var(--scrim9))', 'background:linear-gradient(transparent,rgba(12,14,24,.94))')
        .replace('color:var(--t70)">{{ r.resText }}', 'color:#eeeef4">{{ r.resText }}')
        .replace('<sc-if value="{{ lb.scanning }}">', '<sc-if value="{{ lb.empty }}"><div class="jj-library-empty"><i aria-hidden="true" class="ph ph-film-strip"></i><h2>{{ lb.emptyTitle }}</h2><p>{{ lb.emptyBody }}</p><sc-if value="{{ lb.showEmptyAction }}"><button class="btn btn-secondary" onClick="{{ lb.emptyAction }}">{{ lb.emptyActionText }}</button></sc-if></div></sc-if><sc-if value="{{ lb.scanning }}">'));
    html = html.replace('<div style="width:186px;flex:none;aspect-ratio:2/3;', '<div class="jj-library-detail-cover" style="position:relative;overflow:hidden;width:186px;flex:none;aspect-ratio:2/3;')
        .replace('color:var(--t30)">{{ lb.d.code }}</div>', `color:var(--t30)">${poster('lb.d')}{{ lb.d.code }}</div>`);
    html = html.replace(/<sc-if value="{{ lb.d }}">[\s\S]*?<\/aside>/, detail => detail
        .replace('class="jj-drawer"', 'class="jj-drawer jj-library-detail"')
        .replace('<table class="table"', '<table class="table jj-library-files"'));
    const cinemaStart = html.indexOf('  <sc-if value="{{ at.cinema }}">');
    const cinemaEnd = html.indexOf('  <sc-if value="{{ cn.player }}">', cinemaStart);
    html = html.slice(0, cinemaStart) + cinemaTemplate + '\n' + html.slice(cinemaEnd);
    return html;
}
