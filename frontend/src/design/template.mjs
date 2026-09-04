// Keep the imported file unchanged. Adapt only host integration and controls
// whose prototype behavior cannot operate the existing backend.
export function adaptTemplate(source, logo) {
    let html = source.replaceAll('<i class=', '<i aria-hidden="true" class=')
        .replace(/<link[^>]*href="_ds\/[^"]*"[^>]*>/g, '')
        .replace(/<script src="_ds\/[^"]*"><\/script>/g, '')
        .replaceAll('src="static/logo.jpg"', `src="${logo}"`)
        .replace('>v2.4.1</span>', '>{{ version }}</span>')
        .replace('width:1440px;min-height:900px;', 'width:100%;min-height:100vh;')
        .replace('value="{{ r.path }}">', 'value="{{ r.path }}" onChange="{{ r.change }}" aria-label="路径"><button class="btn btn-secondary" onClick="{{ r.browse }}">浏览</button>')
        .replaceAll('value="{{ f.value }}">', 'value="{{ f.value }}" onChange="{{ f.set }}">')
        .replace('placeholder="{{ f.placeholder }}" value="{{ f.value }}" onChange="{{ f.set }}">\n                    <button', 'type="{{ f.inputType }}" autoComplete="off" placeholder="{{ f.placeholder }}" value="{{ f.value }}" onChange="{{ f.set }}">\n                    <button')
        .replace('<h4 style="margin:0">{{ au.cur.name }}</h4>', '<input class="input" aria-label="任务名称" value="{{ au.cur.name }}" onChange="{{ au.cur.setName }}">')
        .replace('<div style="display:flex;align-items:center;gap:9px;padding:9px 12px;box-shadow:inset 0 -1px 0 var(--line2)">', '<button class="btn btn-ghost" style="display:flex;width:100%;align-items:center;gap:9px;padding:9px 12px;box-shadow:inset 0 -1px 0 var(--line2)" onClick="{{ e.open }}">')
        .replace('{{ e.meta }}</span>\n            </div>', '{{ e.meta }}</span>\n            </button>')
        .replace('onClick="{{ fs.sendSel }}"', 'disabled="{{ !fs.canSend }}" onClick="{{ fs.sendSel }}"')
        .replace('onClick="{{ f.send }}"', 'disabled="{{ !fs.canSend }}" onClick="{{ f.send }}"')
        .replace('onChange="{{ d.toggleSkipLocal }}"', 'disabled="{{ true }}" onChange="{{ d.toggleSkipLocal }}"')
        .replace('onChange="{{ d.toggleSkipTried }}"', 'disabled="{{ true }}" onChange="{{ d.toggleSkipTried }}"')
        .replace('onClick="{{ lb.stopScan }}"', 'disabled="{{ true }}" title="扫描完成后自动更新" onClick="{{ lb.stopScan }}"');
    const start = html.indexOf('  <sc-if value="{{ cn.player }}">');
    const end = html.indexOf('  <sc-if value="{{ at.auto }}">', start);
    html = html.slice(0, start) + `
  <sc-if value="{{ cn.player }}">
    <div class="jj-player" role="dialog" aria-label="本地影片播放">
      <div style="display:flex;align-items:center;gap:12px;padding:16px 26px"><span>{{ cn.player.code }} · {{ cn.player.title }}</span><button class="btn btn-secondary" style="margin-left:auto" onClick="{{ cn.closePlayer }}">停止播放</button></div>
      <video src="{{ cn.player.url }}" controls="{{ true }}" autoPlay="{{ true }}" playsInline="{{ true }}" onError="{{ cn.player.error }}" style="width:100%;min-height:0;flex:1;background:#000"></video>
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
    html = html.replaceAll('value="{{ f.value }}"', 'aria-label="{{ f.label }}" value="{{ f.value }}"')
        .replace('<sc-if value="{{ f.isText }}"><input class="input" style="font-family:var(--mono)"', '<sc-if value="{{ f.isCheck }}"><label><input type="checkbox" checked="{{ f.on }}" onChange="{{ f.set }}">{{ f.label }}</label></sc-if><sc-if value="{{ f.isText }}"><input type="{{ f.inputType }}" class="input" style="font-family:var(--mono)"');
    html = html.replace('没有符合条件的影片</h5>', '{{ cn.emptyTitle }}</h5>')
        .replace('当前组合过滤掉了全部结果。去掉一个条件，或清空后重新选择。', '{{ cn.emptyBody }}')
        .replace('onClick="{{ cn.clearFilters }}">清空条件', 'onClick="{{ cn.clearFilters }}">{{ cn.clearText }}');
    const poster = key => `<sc-if value="{{ ${key}.cover }}"><img src="{{ ${key}.cover }}" alt="" loading="lazy" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover"></sc-if>`;
    html = html.replace(/(<div style="width:70px;aspect-ratio:3\/2;[^"]*)">{{ r.code }}<\/div>/, `$1;position:relative;overflow:hidden">${poster('r')}{{ r.code }}</div>`)
        .replace('position:relative;aspect-ratio:2/3;background:linear-gradient(160deg,var(--ph1),var(--ph3));display:grid;place-items:center">', `position:relative;aspect-ratio:2/3;background:linear-gradient(160deg,var(--ph1),var(--ph3));display:grid;place-items:center">${poster('r')}`);
    html = html.replace('box-shadow:inset 0 -1px 0 var(--line2)">\n                <span', `box-shadow:inset 0 -1px 0 var(--line2)">${poster('m')}\n                <span`)
        .replaceAll('display:grid;place-items:center;overflow:hidden">\n                  <span', `display:grid;place-items:center;overflow:hidden">${poster('it')}\n                  <span`)
        .replaceAll('display:grid;place-items:center;overflow:hidden">\n                <span', `display:grid;place-items:center;overflow:hidden">${poster('it')}\n                <span`)
        .replace('<div style="position:absolute;top:0;right:0;width:62%;height:66%;', '<sc-if value="{{ cn.hero.cover }}"><img src="{{ cn.hero.cover }}" alt="" style="position:absolute;top:0;right:0;width:65%;height:75%;object-fit:cover;opacity:.5"></sc-if><div style="position:absolute;top:0;right:0;width:62%;height:66%;')
        .replaceAll('手动指定番号', '修复说明')
        .replace('右侧实时预览一条真实文件名', '右侧使用示例元数据预览命名规则');
    html = html.replace('<div style="position:relative;flex:none;height:56px;', '<div class="jj-cinema-bar" style="position:relative;flex:none;height:56px;')
        .replace('<div style="position:relative;flex:0 0 auto;margin:34px 34px 0;width:560px;', '<div class="jj-cinema-hero" style="position:relative;flex:0 0 auto;margin:34px 34px 0;width:560px;')
        .replaceAll('display:flex;gap:11px;overflow:hidden', 'display:flex;gap:11px;overflow-x:auto')
        .replace('style="font:400 10px/1 var(--mono);color:var(--dim2);padding-top:2px;cursor:default"', 'style="font:400 10px/1 var(--mono);color:var(--dim2);padding-top:2px;cursor:default;max-width:65px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap"');
    return html;
}
