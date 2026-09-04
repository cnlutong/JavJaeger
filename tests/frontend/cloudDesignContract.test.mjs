import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import test from 'node:test';

const main = readFileSync(new URL('../../frontend/src/main.jsx', import.meta.url), 'utf8');
const template = readFileSync(new URL('../../templates/index.html', import.meta.url), 'utf8');

test('runtime directly uses the imported Claude Design template and support runtime', () => {
    assert.match(main, /import source from '.\/design\/JavJaeger.dc.html'/);
    assert.match(main, /import '.\/design\/support.js'/);
    assert.doesNotMatch(main, /nocturne.css|components\/JavPage/);
    assert.match(template, /\/static\/app.js/);
    assert.match(template, /\/static\/app.css/);
    assert.doesNotMatch(template, /\/static\/(style|webdav).css|antd/);
});

test('all five supplied files are preserved verbatim from Claude Design MCP', () => {
    const files = {
        'JavJaeger.dc.html': 'AD6232DC9772730B8D7E9EC706F8AFCE914DD3C1424C0FE66DC649D3A57F0FE9',
        'support.js': '8FE7DF74405F3C55F49B7249C74EA1397E65D07DEA2B1BD3B4A489BEC2E28CBE',
        '_ds/nocturne-a411c719-802a-43bb-be07-3768bc4bc706/styles.css': '6FEA354710EC4E3B2B979B723ED37D8E8959BB7D9137425D0D562B4AD8733CDA',
        '_ds/nocturne-a411c719-802a-43bb-be07-3768bc4bc706/_ds_bundle.js': 'ACEB66BFEA8C86F6EBF519525C4669E2D6BDA22791FDF24DB8F2CFF09DEABFB0',
        'static/logo.jpg': '00F13AFC38A7E6353759BBB96F898562D7DCA8583F74A1FC10AB2A00582CE27D',
    };
    for (const [file, sha] of Object.entries(files)) assert.equal(createHash('sha256').update(readFileSync(new URL('../../frontend/src/design/' + file, import.meta.url))).digest('hex').toUpperCase(), sha, file);
});