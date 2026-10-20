(() => {
  // frontend/src/design/support.js
  (() => {
    var __defProp = Object.defineProperty;
    var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
    var __publicField = (obj, key, value) => __defNormalProp(obj, typeof key !== "symbol" ? key + "" : key, value);
    function getReact() {
      const R = window.React;
      if (!R) throw new Error("dc-runtime: window.React is not available yet");
      return R;
    }
    function getReactDOM() {
      const RD = window.ReactDOM;
      if (!RD) throw new Error("dc-runtime: window.ReactDOM is not available yet");
      return RD;
    }
    var h = ((...args) => getReact().createElement(
      ...args
    ));
    function parseDcDocument(doc) {
      const dc = doc.querySelector("x-dc");
      if (!dc) return null;
      const scriptEl = doc.querySelector("script[data-dc-script]");
      const { props, preview } = parseDataProps(
        scriptEl?.getAttribute("data-props") ?? null
      );
      return {
        template: dc.innerHTML,
        js: scriptEl ? scriptEl.textContent || "" : "",
        props,
        preview
      };
    }
    function parseDcText(src) {
      const openMatch = /<x-dc(?:\s[^>]*)?>/.exec(src);
      if (!openMatch) return null;
      const close = src.lastIndexOf("</x-dc>");
      if (close === -1 || close < openMatch.index) return null;
      const template = src.slice(openMatch.index + openMatch[0].length, close);
      const doc = new DOMParser().parseFromString(src, "text/html");
      const scriptEl = doc.querySelector("script[data-dc-script]");
      const { props, preview } = parseDataProps(
        scriptEl?.getAttribute("data-props") ?? null
      );
      return {
        template,
        js: scriptEl ? scriptEl.textContent || "" : "",
        props,
        preview
      };
    }
    function parseDataProps(raw) {
      if (!raw) return { props: null, preview: null };
      let parsed;
      try {
        parsed = JSON.parse(raw);
      } catch {
        return { props: null, preview: null };
      }
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        return { props: null, preview: null };
      }
      const obj = parsed;
      const preview = obj.$preview && typeof obj.$preview === "object" ? obj.$preview : null;
      const rest = {};
      for (const k of Object.keys(obj)) {
        if (k[0] !== "$") rest[k] = obj[k];
      }
      return { props: Object.keys(rest).length ? rest : null, preview };
    }
    function dcNameFromPath(pathname) {
      let p = pathname || "";
      try {
        p = decodeURIComponent(p);
      } catch {
      }
      const base = p.split("/").pop() || "Root";
      return base.replace(/\.dc\.html$/, "").replace(/\.html?$/, "") || "Root";
    }
    var BASE_CSS = `
    .sc-placeholder{background:color-mix(in srgb,currentColor 8%,transparent);
      border:1px solid color-mix(in srgb,currentColor 50%,transparent);
      border-radius:2px;box-sizing:border-box;overflow:hidden}
    @keyframes sc-shine{0%{background-position:100% 50%}100%{background-position:0% 50%}}
    html.sc-dc-streaming .sc-placeholder,
    html.sc-dc-streaming .sc-interp.sc-missing{position:relative;
      background:color-mix(in srgb,currentColor 5%,transparent);
      border-color:transparent}
    html.sc-dc-streaming .sc-placeholder::before,
    html.sc-dc-streaming .sc-interp.sc-missing::before{content:'';
      position:absolute;inset:0;pointer-events:none;
      background:linear-gradient(90deg,rgba(217,119,87,0) 25%,rgba(247,225,211,.95) 37%,rgba(217,119,87,0) 63%);
      background-size:400% 100%;animation:sc-shine 1.4s ease infinite}
    html.sc-dc-streaming .sc-placeholder:nth-child(n+9 of .sc-placeholder)::before,
    html.sc-dc-streaming .sc-interp.sc-missing:nth-child(n+9 of .sc-interp.sc-missing)::before{animation:none;
      background:color-mix(in srgb,currentColor 8%,transparent)}
    .sc-placeholder-error{padding:4px 8px;font:11px/1.4 ui-monospace,monospace;
      color:color-mix(in srgb,currentColor 70%,transparent);word-break:break-word}
    .sc-interp.sc-missing{display:inline-block;width:2em;height:1em;overflow:hidden;
      vertical-align:text-bottom;background:rgba(255,255,255,.3);border:1px solid rgba(0,0,0,.5);
      border-radius:2px;box-sizing:border-box;color:transparent;
      user-select:none}
    .sc-interp.sc-unresolved{font-family:ui-monospace,monospace;font-size:.85em;
      color:color-mix(in srgb,currentColor 50%,transparent);
      background:color-mix(in srgb,currentColor 10%,transparent);border-radius:3px;
      padding:0 3px}
    .sc-host.sc-has-error{position:relative}
    .sc-logic-error{position:absolute;top:8px;left:8px;z-index:2147483647;max-width:60ch;
      padding:6px 10px;background:#b00020;color:#fff;font:12px/1.4 ui-monospace,monospace;
      border-radius:4px;white-space:pre-wrap;pointer-events:none}
    /* Mirrors PRINT_BASELINE_CSS in apps/web deck-stage-export.ts \u2014 keep both
       in sync until dc-runtime regains a build step. */
    @media print {
      @page { margin: 0.5cm; }
      figure, table { break-inside: avoid; }
      #dc-root, #dc-root > .sc-host { height: auto; }
      *, *::before, *::after {
        print-color-adjust: exact; -webkit-print-color-adjust: exact;
        backdrop-filter: none !important; -webkit-backdrop-filter: none !important;
        animation-delay: -99s !important; animation-duration: .001s !important;
        animation-iteration-count: 1 !important; animation-fill-mode: both !important;
        animation-play-state: running !important; transition-duration: 0s !important;
      }
    }
  `;
    var FULL_PAGE_CSS = "html,body{height:100%;margin:0}#dc-root,#dc-root>.sc-host{height:100%}";
    function rootNameForDocument(doc, loc) {
      let bootPath = loc.pathname || "";
      if (!/\.dc\.html?$/i.test(safeDecode(bootPath))) {
        try {
          bootPath = new URL(doc.baseURI || "/").pathname;
        } catch {
        }
      }
      return dcNameFromPath(bootPath);
    }
    function safeDecode(s) {
      try {
        return decodeURIComponent(s);
      } catch {
        return s;
      }
    }
    function boot(runtime, doc = document) {
      const parsed = parseDcDocument(doc);
      if (!parsed) return null;
      const React = getReact();
      const rootName = rootNameForDocument(doc, location);
      runtime.markFetched(rootName);
      runtime.setRootName(rootName);
      runtime.adoptParsed(rootName, parsed);
      if (!window.__resources) {
        fetch(location.href).then((res) => res.ok ? res.text() : "").then((t) => {
          const raw = t ? parseDcText(t) : null;
          if (raw?.template) runtime.updateHtml(rootName, raw.template);
        }).catch(() => {
        });
      }
      const dc = doc.querySelector("x-dc");
      const hostEl = doc.createElement("div");
      hostEl.id = "dc-root";
      dc.replaceWith(hostEl);
      if (!parsed.preview) {
        const s = doc.createElement("style");
        s.textContent = FULL_PAGE_CSS;
        doc.head.appendChild(s);
      }
      const Root = runtime.getDC(rootName);
      const entry = runtime.registry.get(rootName);
      function StandaloneRoot() {
        const [, setTick] = React.useState(0);
        React.useEffect(() => {
          const sub = () => setTick((n) => n + 1);
          entry.subs.add(sub);
          return () => {
            entry.subs.delete(sub);
          };
        }, []);
        const defaults = React.useMemo(() => {
          const d = {};
          for (const k in entry.propsMeta || {}) {
            const v = entry.propsMeta?.[k]?.default;
            if (v !== void 0) d[k] = v;
          }
          return d;
        }, [entry.propsMeta]);
        return h(Root, { ...defaults, ...entry.propOverrides || {} });
      }
      const ReactDOM = getReactDOM();
      if (ReactDOM.createRoot)
        ReactDOM.createRoot(hostEl).render(h(StandaloneRoot));
      else ReactDOM.render(h(StandaloneRoot), hostEl);
      return rootName;
    }
    var IDENT_RE = /^[A-Za-z_$][A-Za-z0-9_$]*/;
    var NUMBER_RE = /^-?\d+(\.\d+)?$/;
    function resolve(vals, src) {
      const expr = String(src).trim();
      if (!expr) return void 0;
      if (expr[0] === "(" && expr[expr.length - 1] === ")" && parensWrapWhole(expr)) {
        return resolve(vals, expr.slice(1, -1));
      }
      const eq = findTopLevelEquality(expr);
      if (eq) {
        const lv = resolve(vals, expr.slice(0, eq.index));
        const rv = resolve(vals, expr.slice(eq.index + eq.op.length));
        switch (eq.op) {
          case "===":
            return lv === rv;
          case "!==":
            return lv !== rv;
          case "==":
            return lv == rv;
          default:
            return lv != rv;
        }
      }
      if (expr[0] === "!") return !resolve(vals, expr.slice(1));
      if (expr === "true") return true;
      if (expr === "false") return false;
      if (expr === "null") return null;
      if (expr === "undefined") return void 0;
      if (NUMBER_RE.test(expr)) return Number(expr);
      if (expr.length >= 2 && (expr[0] === '"' || expr[0] === "'") && expr[expr.length - 1] === expr[0]) {
        return expr.slice(1, -1);
      }
      return resolvePath(vals, expr);
    }
    function parensWrapWhole(expr) {
      let depth = 0;
      for (let i = 0; i < expr.length - 1; i++) {
        if (expr[i] === "(") depth++;
        else if (expr[i] === ")") {
          depth--;
          if (depth === 0) return false;
        }
      }
      return true;
    }
    function findTopLevelEquality(expr) {
      let depth = 0;
      for (let i = 0; i < expr.length; i++) {
        const c = expr[i];
        if (c === "[" || c === "(") depth++;
        else if (c === "]" || c === ")") depth--;
        else if (depth === 0 && (c === "=" || c === "!") && expr[i + 1] === "=") {
          if (i > 0 && (expr[i - 1] === "=" || expr[i - 1] === "!")) continue;
          if (!expr.slice(0, i).trim()) continue;
          const op = expr[i + 2] === "=" ? c + "==" : c + "=";
          return { index: i, op };
        }
      }
      return null;
    }
    function resolvePath(vals, expr) {
      const head = expr.match(IDENT_RE);
      if (!head) return void 0;
      let cur = vals == null ? void 0 : vals[head[0]];
      let i = head[0].length;
      while (i < expr.length) {
        if (expr[i] === ".") {
          const m = expr.slice(i + 1).match(IDENT_RE) || expr.slice(i + 1).match(/^\d+/);
          if (!m) return void 0;
          cur = cur == null ? void 0 : cur[m[0]];
          i += 1 + m[0].length;
        } else if (expr[i] === "[") {
          let depth = 1;
          let j = i + 1;
          while (j < expr.length && depth > 0) {
            if (expr[j] === "[") depth++;
            else if (expr[j] === "]") {
              depth--;
              if (depth === 0) break;
            }
            j++;
          }
          if (depth !== 0) return void 0;
          const key = resolve(vals, expr.slice(i + 1, j));
          cur = cur == null ? void 0 : cur[key];
          i = j + 1;
        } else {
          return void 0;
        }
      }
      return cur;
    }
    var CAMEL_ATTR = "sc-camel-";
    var INLINE_TEXT_TAGS = new Set(
      "a abbr b bdi bdo br cite code del dfn em i ins kbd mark q s samp small span strike strong sub sup u var wbr".split(
        " "
      )
    );
    var RAW_WRAP = {
      select: "sc-raw-select",
      table: "sc-raw-table",
      tbody: "sc-raw-tbody",
      thead: "sc-raw-thead",
      tfoot: "sc-raw-tfoot",
      tr: "sc-raw-tr",
      td: "sc-raw-td",
      th: "sc-raw-th",
      caption: "sc-raw-caption"
    };
    var RAW_UNWRAP = Object.fromEntries(
      Object.entries(RAW_WRAP).map(([k, v]) => [v, k])
    );
    var EVENT_MAP = {
      onclick: "onClick",
      onchange: "onChange",
      oninput: "onInput",
      onsubmit: "onSubmit",
      onkeydown: "onKeyDown",
      onkeyup: "onKeyUp",
      onkeypress: "onKeyPress",
      onmousedown: "onMouseDown",
      onmouseup: "onMouseUp",
      onmouseenter: "onMouseEnter",
      onmouseleave: "onMouseLeave",
      onfocus: "onFocus",
      onblur: "onBlur",
      ondoubleclick: "onDoubleClick",
      oncontextmenu: "onContextMenu",
      onmousemove: "onMouseMove",
      onmouseover: "onMouseOver",
      onmouseout: "onMouseOut",
      onpointerdown: "onPointerDown",
      onpointerup: "onPointerUp",
      onpointermove: "onPointerMove",
      onpointerenter: "onPointerEnter",
      onpointerleave: "onPointerLeave",
      onpointercancel: "onPointerCancel",
      onpointerover: "onPointerOver",
      onpointerout: "onPointerOut",
      ongotpointercapture: "onGotPointerCapture",
      onlostpointercapture: "onLostPointerCapture",
      ontouchstart: "onTouchStart",
      ontouchend: "onTouchEnd",
      ontouchmove: "onTouchMove",
      ontouchcancel: "onTouchCancel",
      ondragstart: "onDragStart",
      ondragend: "onDragEnd",
      ondragenter: "onDragEnter",
      ondragleave: "onDragLeave",
      ondragover: "onDragOver",
      onanimationstart: "onAnimationStart",
      onanimationend: "onAnimationEnd",
      onanimationiteration: "onAnimationIteration",
      ontransitionend: "onTransitionEnd"
    };
    var ATTRS = `(?:[^>"']|"[^"]*"|'[^']*')*`;
    var IMPORT_SELF_CLOSE_RE = new RegExp(
      "<(x-import|dc-import)(" + ATTRS + ")/>",
      "gi"
    );
    var CAMEL_ATTR_RE = /(\s)([a-z]+[A-Z][A-Za-z0-9]*)(\s*=)/g;
    function encodeCamelAttrs(html) {
      return html.replace(
        CAMEL_ATTR_RE,
        (_, sp, name, eq) => sp + CAMEL_ATTR + name.replace(/[A-Z]/g, (c) => "-" + c.toLowerCase()) + eq
      );
    }
    function encodeCase(html) {
      html = html.replace(
        IMPORT_SELF_CLOSE_RE,
        (_, t, a) => "<" + t + a + "></" + t + ">"
      );
      html = html.replace(/<helmet(\s|>)/gi, "<sc-helmet$1");
      html = html.replace(/<\/helmet\s*>/gi, "</sc-helmet>");
      html = encodeCamelAttrs(html);
      for (const [real, alias] of Object.entries(RAW_WRAP)) {
        html = html.replace(
          new RegExp("(</?)" + real + "(?=[\\s>])", "gi"),
          "$1" + alias
        );
      }
      return html;
    }
    function kebabToCamel(s) {
      return s.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
    }
    function cssToObj(css) {
      const o = {};
      for (const decl of css.split(";")) {
        const i = decl.indexOf(":");
        if (i < 0) continue;
        const prop = decl.slice(0, i).trim();
        o[prop.startsWith("--") ? prop : kebabToCamel(prop)] = decl.slice(i + 1).trim();
      }
      return o;
    }
    function compileAttr(raw) {
      const whole = raw.match(/^\s*\{\{([\s\S]+?)\}\}\s*$/);
      if (whole) {
        const path = whole[1];
        return (vals) => resolve(vals, path);
      }
      if (raw.includes("{{")) {
        const parts = raw.split(/\{\{([\s\S]+?)\}\}/g);
        return (vals) => parts.map((s, i) => i & 1 ? resolve(vals, s) ?? "" : s).join("");
      }
      return () => raw;
    }
    function collectProps(node, kind, host) {
      const propGetters = [];
      const pseudoClasses = [];
      let hintSize = null;
      for (const { name, value } of [...node.attributes]) {
        if (name === "sc-name" || name === "data-dc-tpl") continue;
        let key = name;
        if (key.startsWith(CAMEL_ATTR))
          key = kebabToCamel(key.slice(CAMEL_ATTR.length));
        if (key === "hint-size") {
          hintSize = value;
          continue;
        }
        if (key.startsWith("style-")) {
          pseudoClasses.push(host.pseudoClass(key.slice(6), value));
          continue;
        }
        if (kind !== "dom") {
          if (key.includes("-") && !(kind === "x-import" && (key.startsWith("aria-") || key.startsWith("data-"))))
            key = kebabToCamel(key);
        } else {
          if (key === "class") key = "className";
          else if (key === "for") key = "htmlFor";
          else if (key.startsWith("on"))
            key = EVENT_MAP[key] || "on" + key[2].toUpperCase() + key.slice(3);
        }
        propGetters.push([key, compileAttr(value)]);
      }
      return { propGetters, pseudoClasses, hintSize };
    }
    var HOST_STYLE_PROPS = /* @__PURE__ */ new Set([
      "position",
      "left",
      "right",
      "top",
      "bottom",
      "inset",
      "width",
      "height",
      "z-index",
      "transform"
    ]);
    function hostPositionStyle(style) {
      const all = typeof style === "string" ? cssToObj(style) : style != null && typeof style === "object" ? style : null;
      if (!all) return void 0;
      const out = {};
      for (const [k, v] of Object.entries(all)) {
        const kebab = k.replace(/[A-Z]/g, (c) => "-" + c.toLowerCase());
        if (HOST_STYLE_PROPS.has(kebab)) out[k] = v;
      }
      return Object.keys(out).length ? out : void 0;
    }
    function compileTemplate(html, host) {
      const tpl = document.createElement("template");
      tpl.innerHTML = encodeCase(html);
      let tplN = 0;
      (function stamp(node) {
        if (node.nodeType === Node.ELEMENT_NODE) {
          node.setAttribute("data-dc-tpl", String(tplN++));
        }
        for (const c of node.childNodes) stamp(c);
      })(tpl.content);
      const builders = walkChildren(tpl.content, host);
      const render = ((vals, ctx) => builders.map((b, i) => b(vals || {}, ctx, i)));
      render.__annotated = tpl.innerHTML;
      return render;
    }
    function walkChildren(node, host) {
      return [...node.childNodes].map((c) => walk(c, host)).filter((b) => b != null);
    }
    var SLIDE_ID_VALUE_RE = /^[0-9a-f]{8}$/;
    var DECK_CONTROL_FLOW_RE = /^(sc-if|sc-for|sc-else|dc-import|x-import)$/;
    var DECK_AUX_RE = /^(template|script|style|sc-helmet|helmet)$/;
    function isDeckMountTag(el) {
      if (el.localName === "deck-stage") return true;
      return el.localName === "x-import" && (el.getAttribute("component-from-global-scope") || "") === "deck-stage";
    }
    function walkDeckChildren(el, host) {
      const pairs = [...el.childNodes].map((c) => ({ c, b: walk(c, host) })).filter((p) => p.b !== null);
      const kids = pairs.map((p) => p.b);
      const seen = /* @__PURE__ */ new Set();
      const wsSeen = /* @__PURE__ */ new Map();
      const keys = [];
      const nextSlideId = new Array(pairs.length);
      {
        let upcoming = null;
        for (let j = pairs.length - 1; j >= 0; j--) {
          const n = pairs[j].c;
          if (n.nodeType === Node.ELEMENT_NODE) {
            const t = n.localName;
            upcoming = !DECK_AUX_RE.test(t) && !DECK_CONTROL_FLOW_RE.test(t) ? n.getAttribute("data-om-slide-id") : null;
          }
          nextSlideId[j] = upcoming;
        }
      }
      for (let j = 0; j < pairs.length; j++) {
        const { c } = pairs[j];
        if (c.nodeType === Node.TEXT_NODE) {
          if ((c.nodeValue ?? "").trim() === "") {
            const base = nextSlideId[j] ? "omid-ws:" + nextSlideId[j] : "omid-ws:aux";
            const n = wsSeen.get(base) ?? 0;
            wsSeen.set(base, n + 1);
            keys.push(n === 0 ? base : base + ":" + n);
            continue;
          }
          return { kids, keys: null };
        }
        if (c.nodeType !== Node.ELEMENT_NODE) {
          keys.push(j);
          continue;
        }
        const child = c;
        const tag = child.localName;
        if (DECK_AUX_RE.test(tag)) {
          keys.push(j);
          continue;
        }
        if (DECK_CONTROL_FLOW_RE.test(tag)) return { kids, keys: null };
        const v = child.getAttribute("data-om-slide-id");
        if (!v || !SLIDE_ID_VALUE_RE.test(v) || seen.has(v)) {
          return { kids, keys: null };
        }
        seen.add(v);
        keys.push("omid:" + v);
      }
      return { kids, keys };
    }
    function renderDeckKids(kids, kidKeys, vals, ctx) {
      return kids.map((b, j) => {
        const k = kidKeys ? kidKeys[j] : j;
        const out = b(vals, ctx, k);
        return kidKeys != null && typeof out === "string" ? h(getReact().Fragment, { key: k }, out) : out;
      });
    }
    function walk(node, host) {
      if (node.nodeType === Node.TEXT_NODE) return walkText(node);
      if (node.nodeType !== Node.ELEMENT_NODE) return null;
      const el = node;
      const tag = el.tagName.toLowerCase();
      if (tag === "sc-for") return walkFor(el, host);
      if (tag === "sc-if") return walkIf(el, host);
      if (tag === "x-import") return walkXImport(el, host);
      if (tag === "sc-helmet") return host.helmet(el);
      if (tag === "dc-import") return walkComponent(el, host);
      return walkElement(el, host);
    }
    var warnedHoles = /* @__PURE__ */ new Set();
    function warnUnresolved(ctx, what) {
      const key = (ctx?.__name || "?") + "\0" + what;
      if (warnedHoles.has(key)) return;
      warnedHoles.add(key);
      console.warn("[dc-runtime] " + (ctx?.__name || "template") + ": " + what);
    }
    function walkText(node) {
      const txt = node.nodeValue ?? "";
      if (!txt.includes("{{")) {
        if (!txt.trim() && !txt.includes(" ")) return null;
        return () => txt;
      }
      const parts = txt.split(/\{\{([\s\S]+?)\}\}/g);
      return (vals, ctx, key) => h(
        getReact().Fragment,
        { key },
        ...parts.map((p, i) => {
          if (!(i & 1)) return p;
          const v = resolve(vals, p);
          if (v === void 0) {
            if (!ctx?.__streamingNow) {
              if (document.body?.hasAttribute("data-dc-editor-on")) {
                return h(
                  "span",
                  { key: i, className: "sc-interp sc-unresolved" },
                  "{{ " + p.trim() + " }}"
                );
              }
              warnUnresolved(
                ctx,
                "{{ " + p.trim() + " }} never resolved \u2014 rendered as empty"
              );
              return null;
            }
            return h(
              "span",
              { key: i, className: "sc-interp sc-missing" },
              p.trim()
            );
          }
          if (getReact().isValidElement(v) || Array.isArray(v)) {
            return h(getReact().Fragment, { key: i }, v);
          }
          if (v === null || typeof v === "boolean") return null;
          return h("span", { key: i, className: "sc-interp" }, String(v));
        })
      );
    }
    function walkFor(el, host) {
      const listGet = compileAttr(el.getAttribute("list") || "");
      const asName = el.getAttribute("as") || "item";
      const hintN = parseInt(el.getAttribute("hint-placeholder-count") || "0", 10);
      const kids = walkChildren(el, host);
      const listSrc = el.getAttribute("list") || "";
      return (vals, ctx, key) => {
        let list = listGet(vals);
        if (!Array.isArray(list)) {
          if (!ctx?.__streamingNow) {
            if (list !== void 0 && list !== null) {
              warnUnresolved(
                ctx,
                'sc-for list="' + listSrc + '" is not an array (' + typeof list + ")"
              );
            }
            list = [];
          } else {
            list = hintN > 0 ? Array(hintN).fill(void 0) : [];
          }
        }
        return h(
          getReact().Fragment,
          { key },
          list.map((item, i) => {
            const sub = { ...vals, [asName]: item, $index: i };
            return h(
              getReact().Fragment,
              { key: i },
              kids.map((b, j) => b(sub, ctx, j))
            );
          })
        );
      };
    }
    function walkIf(el, host) {
      const valGet = compileAttr(el.getAttribute("value") || "");
      const hintRaw = el.getAttribute("hint-placeholder-val");
      const hintGet = hintRaw != null ? compileAttr(hintRaw) : null;
      const kids = walkChildren(el, host);
      return (vals, ctx, key) => {
        let v = valGet(vals);
        if (v === void 0 && hintGet && ctx?.__streamingNow) v = hintGet(vals);
        return v ? h(
          getReact().Fragment,
          { key },
          kids.map((b, j) => b(vals, ctx, j))
        ) : null;
      };
    }
    function walkComponent(el, host) {
      const name = el.getAttribute("name") || el.getAttribute("component") || "";
      el.removeAttribute("name");
      el.removeAttribute("component");
      const tplId = el.getAttribute("data-dc-tpl");
      const styleRaw = el.getAttribute("style");
      el.removeAttribute("style");
      const styleGet = styleRaw != null ? compileAttr(styleRaw) : null;
      const { propGetters, hintSize } = collectProps(el, "dc-import", host);
      const kids = walkChildren(el, host);
      return (vals, ctx, key) => {
        const props = {
          key,
          __hintSize: hintSize,
          __tplId: tplId,
          __hostStyle: styleGet ? hostPositionStyle(styleGet(vals)) : void 0
        };
        for (const [k, g] of propGetters) {
          const v = g(vals);
          if (k === "dcProps") {
            if (v && typeof v === "object") Object.assign(props, v);
            continue;
          }
          props[k] = v;
        }
        if (kids.length) props.children = kids.map((b, j) => b(vals, ctx, j));
        return h(host.component(name), props);
      };
    }
    function walkXImport(el, host) {
      const globalNameGet = compileAttr(
        el.getAttribute("component-from-global-scope") || ""
      );
      const exportNameGet = compileAttr(
        el.getAttribute("component") || el.getAttribute("name") || ""
      );
      const fromRaw = el.getAttribute("from") || (el.getAttribute("component-from-global-scope") ? "" : el.getAttribute("src") || el.getAttribute("import") || "");
      const urls = fromRaw.trim() ? fromRaw.trim().split(/\s+/) : [];
      const url = urls.length ? urls[urls.length - 1] : "";
      const kindOf = (u) => /\.(jsx|tsx)(\?|#|$)/i.test(u) ? "jsx" : "js";
      const tplId = el.getAttribute("data-dc-tpl");
      const styleRaw = el.getAttribute("style");
      el.removeAttribute("style");
      const styleGet = styleRaw != null ? compileAttr(styleRaw) : null;
      const wrap = tplId != null || styleGet != null;
      const { propGetters, hintSize } = collectProps(el, "x-import", host);
      const hasContent = el.children.length > 0 || !!(el.textContent || "").trim();
      const deckKeyed = hasContent && isDeckMountTag(el) ? walkDeckChildren(el, host) : null;
      const kids = deckKeyed ? deckKeyed.kids : hasContent ? walkChildren(el, host) : [];
      const kidKeys = deckKeyed?.keys ?? null;
      const urlBindable = fromRaw.includes("{{");
      if (urls.length && !urlBindable) {
        let prev;
        for (const u of urls) prev = host.loadExternal(kindOf(u), u, prev);
      }
      const evalName = (g, vals) => {
        const v = g(vals);
        const s = v == null ? "" : String(v);
        return s.includes("{{") ? "" : s;
      };
      return (vals, ctx, key) => {
        const globalName = evalName(globalNameGet, vals);
        const name = globalName || evalName(exportNameGet, vals);
        const C = !name || urlBindable ? null : globalName ? host.resolveExternalGlobal(url, globalName) : host.resolveExternal(url, name);
        const hostStyle = styleGet ? hostPositionStyle(styleGet(vals)) : void 0;
        const wrapper = wrap ? {
          key,
          className: "sc-host-x",
          "data-dc-tpl": tplId,
          style: hostStyle || { display: "contents" }
        } : null;
        if (!C) {
          const error = urlBindable ? "x-import `from` cannot contain {{ \u2026 }} \u2014 module URLs are resolved at parse time; use a literal URL" : host.resolveExternalError(url, name);
          const ph = host.placeholder({
            key: wrapper ? void 0 : key,
            name,
            hintSize,
            error
          });
          return wrapper ? h("div", wrapper, ph) : ph;
        }
        const props = wrapper ? {} : { key };
        let unresolvedHole = false;
        for (const [k, g] of propGetters) {
          if (k === "component" || k === "componentFromGlobalScope" || k === "from") {
            continue;
          }
          const v = g(vals);
          if (v === void 0) unresolvedHole = true;
          if (k === "dcProps") {
            if (v && typeof v === "object") Object.assign(props, v);
            continue;
          }
          props[k] = v;
        }
        if (unresolvedHole && ctx?.__htmlStreamingNow) {
          const ph = host.placeholder({
            key: wrapper ? void 0 : key,
            name,
            hintSize,
            error: null
          });
          return wrapper ? h("div", wrapper, ph) : ph;
        }
        if (kids.length) {
          props.children = renderDeckKids(kids, kidKeys, vals, ctx);
        }
        return wrapper ? h("div", wrapper, h(C, props)) : h(C, props);
      };
    }
    function contentKey(el) {
      const clone = el.cloneNode(true);
      for (const d of clone.querySelectorAll("*")) {
        while (d.attributes.length) d.removeAttribute(d.attributes[0].name);
      }
      const s = clone.innerHTML;
      let h2 = 5381;
      for (let i = 0; i < s.length; i++) h2 = (h2 << 5) + h2 + s.charCodeAt(i) | 0;
      return s.length + "." + (h2 >>> 0).toString(36);
    }
    var NEVER_CONTENT_KEYED = new Set(
      "script style textarea option title select canvas iframe video audio".split(
        " "
      )
    );
    var NOT_INLINE_SELECTOR = ":not(" + [...INLINE_TEXT_TAGS].join(",") + ")";
    function walkElement(el, host) {
      const realTag = RAW_UNWRAP[el.localName] || el.localName;
      const tplId = el.getAttribute("data-dc-tpl");
      const inlineOnly = el.childNodes.length > 0 && !NEVER_CONTENT_KEYED.has(realTag) && el.querySelector(NOT_INLINE_SELECTOR) === null;
      const keySuffix = inlineOnly ? "|" + contentKey(el) : "";
      const { propGetters, pseudoClasses } = collectProps(el, "dom", host);
      const deckKeyed = isDeckMountTag(el) ? walkDeckChildren(el, host) : null;
      const kids = deckKeyed ? deckKeyed.kids : walkChildren(el, host);
      const kidKeys = deckKeyed?.keys ?? null;
      return (vals, ctx, key) => {
        const props = {
          key: key + keySuffix,
          "data-dc-tpl": tplId
        };
        for (const [k, g] of propGetters) {
          let v = g(vals);
          if (k === "style" && typeof v === "string") v = cssToObj(v);
          if ((k === "value" || k === "checked") && v === void 0) {
            v = k === "checked" ? false : "";
          }
          props[k] = v;
        }
        if (pseudoClasses.length) {
          props.className = [props.className, ...pseudoClasses].filter(Boolean).join(" ");
        }
        return h(realTag, props, ...renderDeckKids(kids, kidKeys, vals, ctx));
      };
    }
    var StreamableLogic = class {
      constructor(props) {
        __publicField(this, "props");
        __publicField(this, "state", {});
        __publicField(this, "__host");
        this.props = props || {};
      }
      setState(update, cb) {
        this.__host && this.__host.__setLogicState(update, cb);
      }
      forceUpdate() {
        this.__host && this.__host.forceUpdate();
      }
      componentDidMount() {
      }
      componentDidUpdate(_prevProps) {
      }
      componentWillUnmount() {
      }
      /** The flat object the template renders against (merged over props). */
      renderVals() {
        return {};
      }
    };
    function evalDcLogic(src) {
      const fn = new Function(
        "DCLogic",
        "StreamableLogic",
        "React",
        src + '\n;return (typeof Component!=="undefined"&&Component)||undefined;'
      );
      return fn(StreamableLogic, StreamableLogic, getReact());
    }
    function shallowEqual(a, b) {
      if (!b) return false;
      const ak = Object.keys(a).filter((k) => k !== "children");
      const bk = Object.keys(b).filter((k) => k !== "children");
      if (ak.length !== bk.length) return false;
      for (const k of ak) if (a[k] !== b[k]) return false;
      return true;
    }
    function Placeholder({
      name,
      hintSize,
      streaming,
      error
    }) {
      const [w, hgt] = (hintSize || "100%,60px").split(",");
      return h(
        "div",
        {
          className: "sc-placeholder" + (streaming ? " sc-streaming" : ""),
          style: { width: w.trim(), height: hgt && hgt.trim() },
          title: name
        },
        error ? h(
          "div",
          { className: "sc-placeholder-error" },
          (name ? name + ": " : "") + error
        ) : null
      );
    }
    function hintToMin(hint) {
      if (!hint) return void 0;
      const [w, hgt] = hint.split(",");
      return { minWidth: w.trim(), minHeight: hgt && hgt.trim() };
    }
    function createComponentFactory(registry, ensureFetched) {
      const React = getReact();
      const AncestorContext = React.createContext([]);
      class StreamableComponent extends React.Component {
        constructor(props) {
          super(props);
          __publicField(this, "__name");
          __publicField(this, "__sub");
          __publicField(this, "__needsDidMount", false);
          __publicField(this, "__streamingNow", false);
          __publicField(this, "__htmlStreamingNow", false);
          __publicField(this, "__failedLogic", null);
          __publicField(this, "__failedUserProps", null);
          __publicField(this, "__failedVer", -1);
          __publicField(this, "__ctorError", null);
          __publicField(this, "logic");
          this.__name = props.__name;
          this.state = { __v: 0, __err: null };
          this.__sub = () => {
            if (this.state.__err) this.setState({ __err: null });
            this.forceUpdate();
          };
          this.__makeLogic(registry.get(this.__name).Logic, null);
          ensureFetched(this.__name);
        }
        /** Error-boundary hook: a render crash anywhere in this DC's subtree
         *  (its own template, an x-import'd component, a child DC without its
         *  own deeper boundary) lands here instead of unmounting the page. */
        static getDerivedStateFromError(e) {
          return { __err: e instanceof Error && e.message ? e.message : String(e) };
        }
        componentDidCatch(e, info) {
          console.error(
            "[dc-runtime] render error in <" + this.__name + ">:",
            e,
            info?.componentStack || ""
          );
        }
        /** Instantiate the logic class (or the no-op base) and adopt `prevState`
         *  over its initial state — used both at mount and on hot-swap. */
        __makeLogic(Logic, prevState) {
          const L = Logic || StreamableLogic;
          try {
            this.logic = new L(this.__userProps());
            this.__failedLogic = null;
            this.__failedUserProps = null;
            this.__ctorError = null;
          } catch (e) {
            console.error(e);
            this.__failedLogic = Logic;
            this.__failedUserProps = this.__userProps();
            this.__failedVer = registry.get(this.__name).ver;
            this.__ctorError = this.__name + ": " + (e instanceof Error && e.message ? e.message : String(e));
            this.logic = new StreamableLogic(
              this.__userProps()
            );
          }
          this.logic.__host = this;
          if (prevState)
            this.logic.state = { ...this.logic.state || {}, ...prevState };
        }
        /** The props the author's logic + template see — internal __-prefixed
         *  wiring stripped. */
        __userProps() {
          const { __name, __hintSize, __tplId, __hostStyle, ...rest } = this.props;
          return rest;
        }
        __setLogicState(update, cb) {
          const prev = this.logic.state;
          const patch = typeof update === "function" ? update(prev) : update;
          this.logic.state = { ...prev, ...patch };
          this.setState((s) => ({ __v: s.__v + 1 }), cb);
        }
        /** Swap the logic instance when the registry's Logic class changed
         *  (streaming completion, hot reload). State carries over; didMount
         *  re-fires after the swap commits so refs exist. */
        __reconcileLogic() {
          const r = registry.get(this.__name);
          const Next = r.Logic;
          const Cur = this.logic.constructor;
          if (Next === Cur || !Next && Cur === StreamableLogic || Next === this.__failedLogic && r.ver === this.__failedVer && shallowEqual(this.__userProps(), this.__failedUserProps)) {
            return;
          }
          if (!this.__needsDidMount) {
            try {
              this.logic.componentWillUnmount();
            } catch (e) {
              console.error(e);
            }
          }
          this.__makeLogic(Next, this.logic.state);
          this.__needsDidMount = true;
        }
        componentDidMount() {
          registry.get(this.__name).subs.add(this.__sub);
          try {
            this.logic.componentDidMount();
          } catch (e) {
            console.error(e);
          }
        }
        componentDidUpdate(prevProps) {
          this.logic.props = this.__userProps();
          if (this.__needsDidMount) {
            if (this.state.__err || !registry.get(this.__name).tpl) return;
            this.__needsDidMount = false;
            try {
              this.logic.componentDidMount();
            } catch (e) {
              console.error(e);
            }
          } else {
            try {
              this.logic.componentDidUpdate(prevProps);
            } catch (e) {
              console.error(e);
            }
          }
        }
        componentWillUnmount() {
          registry.get(this.__name).subs.delete(this.__sub);
          if (!this.__needsDidMount) {
            try {
              this.logic.componentWillUnmount();
            } catch (e) {
              console.error(e);
            }
          }
        }
        render() {
          const r = registry.get(this.__name);
          const cls = "sc-host" + (r.htmlStreaming ? " sc-streaming-html" : "") + (r.jsStreaming ? " sc-streaming-js" : "");
          const hintStyle = r.htmlStreaming ? hintToMin(this.props.__hintSize) : void 0;
          const hostStyle = this.props.__hostStyle || hintStyle ? { ...hintStyle || {}, ...this.props.__hostStyle || {} } : void 0;
          const hostBase = {
            className: cls,
            style: hostStyle,
            "data-sc-name": this.__name,
            "data-dc-tpl": this.props.__tplId
          };
          const chain = Array.isArray(this.context) ? this.context : [];
          if (chain.includes(this.__name)) {
            const cycle = [
              ...chain.slice(chain.indexOf(this.__name)),
              this.__name
            ].join(" \u2192 ");
            return h(
              "div",
              { ...hostBase, className: cls + " sc-has-error" },
              h(Placeholder, {
                name: this.__name,
                hintSize: this.props.__hintSize,
                error: "circular import: " + cycle
              })
            );
          }
          if (this.state.__err) {
            return h(
              "div",
              { ...hostBase, className: cls + " sc-has-error" },
              h(
                "div",
                { className: "sc-logic-error", "data-omelette-chrome": "" },
                this.__name + ": " + this.state.__err
              ),
              h(Placeholder, {
                name: this.__name,
                hintSize: this.props.__hintSize,
                error: this.state.__err
              })
            );
          }
          this.__reconcileLogic();
          if (!r.tpl) {
            return h(
              "div",
              hostBase,
              h(Placeholder, { name: this.__name, hintSize: this.props.__hintSize })
            );
          }
          const userProps = this.__userProps();
          this.logic.props = userProps;
          let vals = userProps;
          let renderErr = r.logicError || this.__ctorError;
          try {
            vals = { ...userProps, ...this.logic.renderVals() || {} };
          } catch (e) {
            console.error(e);
            renderErr = this.__name + ".renderVals(): " + (e instanceof Error && e.message ? e.message : String(e));
          }
          this.__streamingNow = !!(r.htmlStreaming || r.jsStreaming);
          this.__htmlStreamingNow = !!r.htmlStreaming;
          return h(
            "div",
            { ...hostBase, className: cls + (renderErr ? " sc-has-error" : "") },
            renderErr && h(
              "div",
              { className: "sc-logic-error", "data-omelette-chrome": "" },
              renderErr
            ),
            h(
              AncestorContext.Provider,
              { value: [...chain, this.__name] },
              r.tpl(vals, this)
            )
          );
        }
      }
      __publicField(StreamableComponent, "contextType", AncestorContext);
      const named = /* @__PURE__ */ new Map();
      function getDC(name) {
        const hit = named.get(name);
        if (hit) return hit;
        function Dispatcher(p) {
          const [, setTick] = React.useState(0);
          React.useEffect(() => {
            const sub = () => setTick((n) => n + 1);
            registry.get(name).subs.add(sub);
            return () => {
              registry.get(name).subs.delete(sub);
            };
          }, []);
          ensureFetched(name);
          return h(StreamableComponent, { ...p, __name: name });
        }
        Dispatcher.displayName = name;
        named.set(name, Dispatcher);
        return Dispatcher;
      }
      return {
        getDC,
        StreamableComponent
      };
    }
    function bundledBlob(url) {
      const blobs = window.__resourceBlobs;
      const b = blobs ? blobs[url.split("#")[0]] : void 0;
      return b instanceof Blob ? b : null;
    }
    var REACT_URL = "https://unpkg.com/react@18.3.1/umd/react.production.min.js";
    var REACT_SRI = "sha384-DGyLxAyjq0f9SPpVevD6IgztCFlnMF6oW/XQGmfe+IsZ8TqEiDrcHkMLKI6fiB/Z";
    var REACT_DOM_URL = "https://unpkg.com/react-dom@18.3.1/umd/react-dom.production.min.js";
    var REACT_DOM_SRI = "sha384-gTGxhz21lVGYNMcdJOyq01Edg0jhn/c22nsx0kyqP0TxaV5WVdsSH1fSDUf5YJj1";
    var BABEL_URL = "https://unpkg.com/@babel/standalone@7.29.0/babel.min.js";
    var BABEL_SRI = "sha384-m08KidiNqLdpJqLq95G/LEi8Qvjl/xUYll3QILypMoQ65QorJ9Lvtp2RXYGBFj1y";
    function cdnScriptFor(url, sri) {
      const res = window.__resources;
      const v = res ? res[url] : void 0;
      return typeof v === "string" && v ? { src: v } : { src: url, integrity: sri };
    }
    var isCustomElementName = (n) => !n.includes(".") && n.includes("-");
    function isRenderableType(g) {
      if (typeof g === "function") return !isElementClass(g);
      return typeof g === "object" && g !== null && typeof g.$$typeof === "symbol";
    }
    function resolveDottedPath(root, name) {
      let cur = root;
      for (const seg of name.split(".")) {
        if (cur == null) return void 0;
        cur = cur[seg];
      }
      return cur;
    }
    var GLOBAL_POLL_INTERVAL_MS = 50;
    var GLOBAL_POLL_TIMEOUT_MS = 3e4;
    function createExternalModules(onResolved) {
      const cache = /* @__PURE__ */ new Map();
      let babelLoading = null;
      const reportedMissing = /* @__PURE__ */ new Map();
      const polling = /* @__PURE__ */ new Set();
      function ensureBabel() {
        if (window.Babel) return Promise.resolve();
        if (babelLoading) return babelLoading;
        const babel = cdnScriptFor(BABEL_URL, BABEL_SRI);
        babelLoading = new Promise((res, rej) => {
          const s = document.createElement("script");
          s.src = babel.src;
          if (babel.integrity) {
            s.integrity = babel.integrity;
            s.crossOrigin = "anonymous";
          }
          s.onload = () => res();
          s.onerror = rej;
          document.head.appendChild(s);
        });
        return babelLoading;
      }
      const pending = /* @__PURE__ */ new Map();
      function load(kind, url, after) {
        const existing = pending.get(url);
        if (existing) return existing;
        cache.set(url, null);
        console.info("[dc-runtime] x-import: loading", url, "(" + kind + ")");
        const ready = Promise.all([
          kind === "jsx" ? ensureBabel() : Promise.resolve(),
          after ?? Promise.resolve()
        ]);
        const p = ready.then(() => {
          const pre = bundledBlob(url);
          if (pre) return pre.text();
          return fetch(url).then((r) => {
            if (!r.ok) throw new Error("HTTP " + r.status);
            return r.text();
          });
        }).then((src) => {
          const code = kind === "jsx" ? window.Babel.transform(src, {
            filename: url,
            presets: ["react", "typescript"]
          }).code : src;
          const module = { exports: {} };
          const before = new Set(Object.keys(window));
          new Function("React", "module", "exports", "require", code)(
            getReact(),
            module,
            module.exports,
            () => ({})
          );
          const globals = {};
          for (const k of Object.keys(window)) {
            if (!before.has(k) && typeof window[k] === "function") {
              globals[k] = window[k];
            }
          }
          cache.set(url, { mod: module.exports, globals });
          console.info(
            "[dc-runtime] x-import: loaded",
            url,
            "\u2014 exports:",
            Object.keys(module.exports),
            "window globals:",
            Object.keys(globals)
          );
          onResolved();
        }).catch((e) => {
          cache.set(url, {
            mod: {},
            globals: {},
            error: "failed to load: " + (e instanceof Error && e.message ? e.message : String(e))
          });
          console.error(
            "[dc-runtime] x-import: FAILED to load",
            url,
            "(" + kind + ")",
            e
          );
          onResolved();
        });
        pending.set(url, p);
        return p;
      }
      function resolve2(url, name) {
        const entry = cache.get(url);
        if (!entry) return null;
        const { mod, globals } = entry;
        const C = mod && mod[name] || globals && globals[name] || typeof window !== "undefined" && window[name] || mod && mod.default;
        if (typeof C === "function") return C;
        const key = url + "\0" + name;
        if (!reportedMissing.has(key)) {
          reportedMissing.set(
            key,
            entry.error || 'no export named "' + name + '" (has: ' + Object.keys(mod).join(", ") + ")"
          );
          console.error(
            "[dc-runtime] x-import: module",
            url,
            "loaded but has no component named",
            JSON.stringify(name),
            "\u2014 available exports:",
            Object.keys(mod),
            "window globals:",
            Object.keys(globals),
            ". The module must `module.exports = {" + name + "}` or set `window." + name + "`."
          );
        }
        return null;
      }
      function waitForGlobal(name) {
        if (polling.has(name)) return;
        polling.add(name);
        const started = Date.now();
        const isCE = isCustomElementName(name);
        const tick = () => {
          const found = isCE ? customElements.get(name) : isRenderableType(resolveDottedPath(window, name));
          if (found) {
            polling.delete(name);
            onResolved();
            return;
          }
          if (Date.now() - started >= GLOBAL_POLL_TIMEOUT_MS) {
            console.warn(
              "[dc-runtime] x-import: global",
              JSON.stringify(name),
              "never appeared on window after " + GLOBAL_POLL_TIMEOUT_MS + "ms"
            );
            return;
          }
          setTimeout(tick, GLOBAL_POLL_INTERVAL_MS);
        };
        setTimeout(tick, GLOBAL_POLL_INTERVAL_MS);
      }
      function resolveGlobal(url, name) {
        const isCE = isCustomElementName(name);
        if (!url) {
          if (isCE) {
            if (customElements.get(name)) return name;
            waitForGlobal(name);
            return null;
          }
          const g2 = resolveDottedPath(window, name);
          if (isRenderableType(g2)) return g2;
          waitForGlobal(name);
          return null;
        }
        const entry = cache.get(url);
        if (!entry) return null;
        if (isCE && customElements.get(name)) return name;
        const g = entry.globals[name] ?? resolveDottedPath(window, name);
        if (isRenderableType(g)) return g;
        if (name.includes(".")) return null;
        const key = url + "\0global\0" + name;
        if (!reportedMissing.has(key)) {
          reportedMissing.set(key, null);
          if (isCE && !customElements.get(name)) {
            console.warn(
              "[dc-runtime] x-import:",
              url,
              "loaded but no custom element",
              JSON.stringify(name),
              "is registered and window." + name + " is not a function \u2014 rendering <" + name + "> as an unknown element."
            );
          }
        }
        return name;
      }
      function getError(url, name) {
        const entry = cache.get(url);
        if (entry?.error) return entry.error;
        return reportedMissing.get(url + "\0" + name) || null;
      }
      return { load, resolve: resolve2, resolveGlobal, getError };
    }
    function isElementClass(g) {
      try {
        return typeof g === "function" && typeof HTMLElement !== "undefined" && g.prototype instanceof HTMLElement;
      } catch {
        return false;
      }
    }
    var ATOMIC_CSS = (
      // layout
      ".fx{display:flex}.col{display:flex;flex-direction:column}.grid{display:grid}.ac{align-items:center}.jc{justify-content:center}.jb{justify-content:space-between}.f1{flex:1}.noshrink{flex-shrink:0}.wrap{flex-wrap:wrap}.fw5{font-weight:500}.fw6{font-weight:600}.fw7{font-weight:700}.fw8{font-weight:800}.fs11{font-size:11px}.fs12{font-size:12px}.fs13{font-size:13px}.fs14{font-size:14px}.fs15{font-size:15px}.fs16{font-size:16px}.fs20{font-size:20px}.fs22{font-size:22px}.upper{text-transform:uppercase}.tc{text-align:center}.nowrap{white-space:nowrap}.gap8{gap:8px}.gap10{gap:10px}.gap12{gap:12px}.gap16{gap:16px}.gap24{gap:24px}.m0{margin:0}.mt8{margin-top:8px}.mt12{margin-top:12px}.mt16{margin-top:16px}.mb8{margin-bottom:8px}.mb12{margin-bottom:12px}.mb16{margin-bottom:16px}.posrel{position:relative}.posabs{position:absolute}.round{border-radius:50%}.ohide{overflow:hidden}.bbox{box-sizing:border-box}.pointer{cursor:pointer}.w100{width:100%}.b0{border:none}"
    );
    var DESIGN_DOC_MODE_RE = /<meta\b[^>]*\bname\s*=\s*["']design_doc_mode["'][^>]*\b(?:content|value)\s*=\s*["'](\w+)["']/i;
    var CANVAS_BG_LIGHT = "#f0eee6";
    var CANVAS_BG_DARK = "#2e2c26";
    function createHelmetManager(doc, isStreaming) {
      const mounted = /* @__PURE__ */ new Set();
      const live = /* @__PURE__ */ new Map();
      let designDocMode = null;
      let canvasStyleEl = null;
      let appTheme = "light";
      try {
        const ds = doc.documentElement.dataset.theme;
        appTheme = ds === "dark" || ds === "light" ? ds : new URLSearchParams(doc.defaultView?.location.search ?? "").get(
          "theme"
        ) === "dark" ? "dark" : "light";
      } catch {
      }
      function applyCanvasBg() {
        if (!canvasStyleEl) return;
        const bg = appTheme === "dark" ? CANVAS_BG_DARK : CANVAS_BG_LIGHT;
        canvasStyleEl.textContent = `html,body{background:${bg}}#dc-root>.sc-host{position:relative}`;
      }
      function postDesignMode(mode) {
        if (window.parent === window) return;
        try {
          window.parent.postMessage({ type: "__dc_design_mode", mode }, "*");
        } catch {
        }
      }
      function setDesignDocMode(mode) {
        if (mode === designDocMode) return;
        designDocMode = mode;
        postDesignMode(mode);
        if (mode === "canvas") {
          doc.documentElement.setAttribute("data-dc-canvas", "");
          canvasStyleEl = doc.createElement("style");
          canvasStyleEl.setAttribute("data-dc-canvas", "");
          applyCanvasBg();
          doc.head.appendChild(canvasStyleEl);
        } else {
          doc.documentElement.removeAttribute("data-dc-canvas");
          canvasStyleEl?.remove();
          canvasStyleEl = null;
        }
      }
      window.addEventListener("message", (e) => {
        const type = e.data && e.data.type;
        if (type === "__dc_theme") {
          const t = e.data.theme;
          if (t === "light" || t === "dark") {
            appTheme = t;
            applyCanvasBg();
          }
          return;
        }
        if (!designDocMode || type !== "__dc_probe") return;
        postDesignMode(designDocMode);
      });
      function compile(node) {
        const raw = [...node.children];
        const helmetClosed = node.nextSibling != null || node.parentNode?.nextSibling != null;
        if (node.hasAttribute("data-dc-atomics") && !mounted.has("__dc-atomics")) {
          mounted.add("__dc-atomics");
          const el = doc.createElement("style");
          el.id = "__dc-atomics";
          el.textContent = ATOMIC_CSS;
          doc.head.appendChild(el);
        }
        return (_vals, ctx) => {
          const name = ctx && ctx.__name || "";
          const streaming = !!(name && isStreaming(name));
          for (let i = 0; i < raw.length; i++) {
            const child = raw[i];
            const tag = child.tagName;
            const mayBePartial = streaming && !helmetClosed && i === raw.length - 1;
            if (tag === "SCRIPT") {
              if (mayBePartial) continue;
              const key = "SCRIPT|" + (child.getAttribute("src") || child.textContent || "");
              if (mounted.has(key)) continue;
              mounted.add(key);
              const el = doc.createElement("script");
              for (const { name: an, value } of [...child.attributes])
                el.setAttribute(an, value);
              if (child.textContent) el.textContent = child.textContent;
              doc.head.appendChild(el);
            } else if (tag === "LINK" || tag === "META") {
              if (mayBePartial) continue;
              const key = tag + "|" + (child.getAttribute("href") || child.getAttribute("src") || child.outerHTML);
              if (mounted.has(key)) continue;
              mounted.add(key);
              if (tag === "LINK") {
                const rel = (child.getAttribute("rel") || "").toLowerCase().split(/\s+/);
                const href = (child.getAttribute("href") || "").trim();
                const res = window.__resources;
                const pre = res && rel.includes("stylesheet") && !rel.includes("alternate") ? res[href] : void 0;
                const blob = typeof pre === "string" && pre ? bundledBlob(pre) : null;
                if (blob) {
                  const el = doc.createElement("style");
                  if (child.hasAttribute("disabled")) {
                    el.setAttribute("media", "not all");
                  } else if (child.getAttribute("media")) {
                    el.setAttribute("media", child.getAttribute("media"));
                  }
                  if (child.getAttribute("title"))
                    el.setAttribute("title", child.getAttribute("title"));
                  void blob.text().then((css) => {
                    el.textContent = css;
                  });
                  doc.head.appendChild(el);
                  continue;
                }
              }
              doc.head.appendChild(child.cloneNode(true));
            } else {
              const key = name + "|" + i;
              let el = live.get(key);
              if (!el || el.tagName !== tag) {
                if (el) el.remove();
                el = doc.createElement(tag.toLowerCase());
                live.set(key, el);
                doc.head.appendChild(el);
              }
              for (const { name: an, value } of [...child.attributes]) {
                if (el.getAttribute(an) !== value) el.setAttribute(an, value);
              }
              if (el.textContent !== child.textContent)
                el.textContent = child.textContent;
            }
          }
          return null;
        };
      }
      return { compile, setDesignDocMode };
    }
    function scanUnquotedUrl(css, i) {
      if (css[i] !== "u" && css[i] !== "U" || css.slice(i, i + 4).toLowerCase() !== "url(" || /[a-z0-9_-]/i.test(css[i - 1] ?? "")) {
        return -1;
      }
      let j = i + 4;
      while (j < css.length && /\s/.test(css[j])) j++;
      if (css[j] === '"' || css[j] === "'") return -1;
      while (j < css.length && css[j] !== ")") {
        if (css[j] === "\\") j++;
        j++;
      }
      return j < css.length ? j + 1 : css.length;
    }
    function stripComments(css) {
      let out = "";
      let quote = "";
      for (let i = 0; i < css.length; i++) {
        const c = css[i];
        if (quote) {
          if (c === "\\") {
            out += c + (css[i + 1] ?? "");
            i++;
            continue;
          }
          if (c === quote) quote = "";
          out += c;
        } else if (c === "'" || c === '"') {
          quote = c;
          out += c;
        } else if (c === "/" && css[i + 1] === "*") {
          const end = css.indexOf("*/", i + 2);
          i = end === -1 ? css.length : end + 1;
          out += " ";
        } else {
          const end = scanUnquotedUrl(css, i);
          if (end === -1) out += c;
          else {
            out += css.slice(i, end);
            i = end - 1;
          }
        }
      }
      return out;
    }
    function importantify(css) {
      css = stripComments(css);
      const decls = [];
      let start = 0;
      let depth = 0;
      let quote = "";
      for (let i = 0; i < css.length; i++) {
        const c = css[i];
        if (quote) {
          if (c === "\\") i++;
          else if (c === quote) quote = "";
        } else if (c === "'" || c === '"') quote = c;
        else if (c === "(") depth++;
        else if (c === ")") depth = Math.max(0, depth - 1);
        else if (c === ";" && depth === 0) {
          decls.push(css.slice(start, i));
          start = i + 1;
        } else {
          const end = scanUnquotedUrl(css, i);
          if (end !== -1) i = end - 1;
        }
      }
      decls.push(css.slice(start));
      return decls.map((d) => d.trim()).filter(Boolean).map((d) => /!\s*important$/i.test(d) ? d : d + " !important").join(";");
    }
    function createPseudoSheet(doc) {
      let el = null;
      const cache = /* @__PURE__ */ new Map();
      let n = 0;
      return (pseudo, css) => {
        const k = pseudo + "|" + css;
        const hit = cache.get(k);
        if (hit) return hit;
        if (!el) {
          el = doc.createElement("style");
          doc.head.appendChild(el);
        }
        const cls = "scp" + (n++).toString(36);
        const isPseudoElement = pseudo === "before" || pseudo === "after";
        const sel = isPseudoElement ? "." + cls + "::" + pseudo : "." + cls + ":" + pseudo;
        el.sheet.insertRule(
          sel + "{" + (isPseudoElement ? css : importantify(css)) + "}",
          el.sheet.cssRules.length
        );
        cache.set(k, cls);
        return cls;
      };
    }
    function createRegistry() {
      const entries = /* @__PURE__ */ Object.create(null);
      function get(name) {
        return entries[name] || (entries[name] = {
          html: "",
          tpl: null,
          Logic: null,
          jsStreaming: false,
          htmlStreaming: false,
          ver: 0,
          subs: /* @__PURE__ */ new Set(),
          fetched: false
        });
      }
      function bump(name) {
        const r = get(name);
        r.ver++;
        for (const fn of r.subs) fn();
      }
      return {
        entries,
        get,
        bump,
        bumpAll() {
          for (const n in entries) bump(n);
        }
      };
    }
    var COMPONENT_DIR = ".";
    function createRuntime(doc = document) {
      const registry = createRegistry();
      const pseudoClass = createPseudoSheet(doc);
      const helmet = createHelmetManager(
        doc,
        (name) => registry.get(name).htmlStreaming
      );
      const external = createExternalModules(() => registry.bumpAll());
      const factory = createComponentFactory(registry, ensureFetched);
      const host = {
        component: (name) => factory.getDC(name),
        placeholder: (props) => h(Placeholder, props),
        helmet: (node) => helmet.compile(node),
        loadExternal: (kind, url, after) => external.load(kind, url, after),
        resolveExternal: (url, name) => external.resolve(url, name),
        resolveExternalGlobal: (url, name) => external.resolveGlobal(url, name),
        resolveExternalError: (url, name) => external.getError(url, name),
        pseudoClass
      };
      function ensureFetched(name) {
        const r = registry.get(name);
        if (r.fetched) return;
        r.fetched = true;
        const url = COMPONENT_DIR + "/" + encodeURIComponent(name) + ".dc.html";
        const res = window.__resources;
        const pre = res ? res[url] : void 0;
        const target = typeof pre === "string" && pre ? pre : url;
        const blob = bundledBlob(target);
        (blob ? blob.text() : fetch(target).then((res2) => {
          if (!res2.ok) {
            console.error(
              '[dc-runtime] sibling fetch for "' + name + '" failed:',
              url,
              "returned",
              res2.status,
              "\u2014 the reference renders as an empty placeholder."
            );
            return "";
          }
          return res2.text();
        })).then((t) => {
          if (!t) return;
          const parsed = parseDcText(t);
          if (!parsed) {
            console.error(
              '[dc-runtime] sibling fetch for "' + name + '":',
              url,
              "has no <x-dc> block \u2014 not a Design Component."
            );
            return;
          }
          if (parsed.props) r.propsMeta = parsed.props;
          if (parsed.preview) r.preview = parsed.preview;
          if (parsed.template && !r.html) updateHtml(name, parsed.template);
          if (parsed.js && !r.Logic) updateJs(name, parsed.js);
        }).catch(
          (e) => console.error(
            '[dc-runtime] sibling fetch for "' + name + '" threw:',
            url,
            e
          )
        );
      }
      let rootName = null;
      function updateHtml(name, html) {
        const r = registry.get(name);
        r.html = html;
        if (name === rootName) {
          const mode = DESIGN_DOC_MODE_RE.exec(html)?.[1] ?? null;
          if (mode || !r.htmlStreaming) helmet.setDesignDocMode(mode);
        }
        try {
          r.tpl = compileTemplate(html, host);
        } catch (e) {
          console.error("[dc-runtime] template compile FAILED for", name, e);
        }
        registry.bump(name);
      }
      function updateJs(name, src) {
        const r = registry.get(name);
        const seq = r.jsSeq = (r.jsSeq || 0) + 1;
        try {
          const Cls = evalDcLogic(src);
          if (r.jsSeq !== seq) return;
          if (typeof Cls !== "function") {
            r.logicError = name + ".dc.html: <script data-dc-script> must define `class Component extends DCLogic`";
          } else {
            r.logicError = null;
            r.Logic = Cls;
          }
        } catch (e) {
          if (r.jsSeq !== seq) return;
          console.error(
            "[dc-runtime] logic class eval FAILED for",
            name,
            "\u2014 the template renders with props only.",
            e
          );
          r.logicError = name + ": " + (e instanceof Error && e.message ? e.message : String(e));
        }
        registry.bump(name);
      }
      function setStreaming(name, kind, on) {
        const r = registry.get(name);
        if (kind === "html") r.htmlStreaming = !!on;
        else r.jsStreaming = !!on;
        let any = false;
        for (const n in registry.entries) {
          const e = registry.entries[n];
          if (e && (e.htmlStreaming || e.jsStreaming)) {
            any = true;
            break;
          }
        }
        doc.documentElement.classList.toggle("sc-dc-streaming", any);
        registry.bump(name);
      }
      function dcUpdate(name, kind, content, streaming) {
        if (streaming) registry.get(name).fetched = true;
        if (kind === "html") {
          setStreaming(name, "html", !!streaming);
          updateHtml(name, content);
        } else if (kind === "js") {
          setStreaming(name, "js", !!streaming);
          if (!streaming) updateJs(name, content);
        } else if (kind === "props") {
          const { props, preview } = parseDataProps(content);
          const r = registry.get(name);
          r.propsMeta = props ?? void 0;
          r.preview = preview;
          registry.bump(name);
        }
      }
      function setProps(name, overrides) {
        registry.get(name).propOverrides = overrides && typeof overrides === "object" ? { ...overrides } : null;
        registry.bump(name);
      }
      function adoptParsed(name, parsed) {
        if (!parsed) return;
        const r = registry.get(name);
        if (parsed.props) r.propsMeta = parsed.props;
        if (parsed.preview) r.preview = parsed.preview;
        if (parsed.template) updateHtml(name, parsed.template);
        if (parsed.js) updateJs(name, parsed.js);
      }
      return {
        registry,
        getDC: factory.getDC,
        updateHtml,
        updateJs,
        dcUpdate,
        setProps,
        adoptParsed,
        setRootName: (name) => {
          rootName = name;
        },
        markFetched: (name) => {
          registry.get(name).fetched = true;
        },
        annotatedTemplate: (name) => {
          const r = registry.get(name);
          return r.tpl && r.tpl.__annotated || null;
        },
        templateSource: (name) => registry.get(name).html || null,
        StreamableLogic
      };
    }
    function createStreamTracker(staleMs = 6e4, now = Date.now) {
      const since = /* @__PURE__ */ new Map();
      const liveOne = (n) => {
        const t = since.get(n);
        if (t === void 0) return false;
        if (now() - t > staleMs) {
          since.delete(n);
          return false;
        }
        return true;
      };
      return {
        push(name, streaming, viewportKey) {
          if (viewportKey === "dc-model") return;
          if (streaming) since.set(name, now());
          else since.delete(name);
        },
        live(name) {
          if (name !== void 0) return liveOne(name);
          for (const n of [...since.keys()]) if (liveOne(n)) return true;
          return false;
        }
      };
    }
    function hideRawTemplate() {
      const s = document.createElement("style");
      s.textContent = "x-dc{display:none!important}";
      document.head.appendChild(s);
    }
    function loadScript(src, integrity) {
      return new Promise((resolve2, reject) => {
        const s = document.createElement("script");
        s.src = src;
        if (integrity) {
          s.integrity = integrity;
          s.crossOrigin = "anonymous";
        }
        s.async = false;
        s.onload = () => resolve2();
        s.onerror = () => reject(new Error(`failed to load ${src}`));
        document.head.appendChild(s);
      });
    }
    function loadReactUmd() {
      const w = window;
      if (w.React && w.ReactDOM) return Promise.resolve();
      const react = cdnScriptFor(REACT_URL, REACT_SRI);
      const reactDom = cdnScriptFor(REACT_DOM_URL, REACT_DOM_SRI);
      return Promise.all([
        loadScript(react.src, react.integrity),
        loadScript(reactDom.src, reactDom.integrity)
      ]).then(() => void 0);
    }
    function init() {
      const runtime = createRuntime(document);
      let rootName = "Root";
      const baseCss = document.createElement("style");
      baseCss.textContent = BASE_CSS;
      document.head.prepend(baseCss);
      const notifyHost = () => {
        if (window.parent === window) return;
        const r = runtime.registry.entries[rootName];
        try {
          window.parent.postMessage(
            {
              type: "__dc_booted",
              rootName,
              propsMeta: r && r.propsMeta || null,
              preview: r && r.preview || null
            },
            "*"
          );
        } catch {
        }
      };
      const streams = createStreamTracker();
      const api = {
        __dcUpdate: (name, kind, content, streaming, viewportKey) => {
          streams.push(name, streaming, viewportKey);
          runtime.dcUpdate(name, kind, content, streaming);
          if (name === rootName && !streaming && kind === "props") notifyHost();
        },
        __dcStreaming: (name) => streams.live(name),
        __dcSetProps: (name, overrides) => runtime.setProps(name, overrides),
        /** Name of the component currently mounted as the page root — DC tools
         *  push their template-stream here when targeting "the open page". */
        __dcRootName: () => rootName,
        /** Editor bridge — the encoded, `data-dc-tpl`-annotated template source.
         *  The host editor parses this into its own template DOM so it can map a
         *  rendered node (carrying the same `data-dc-tpl`) back to the source
         *  node that emitted it. Returns the encoded form (`sc-camel-*` attrs,
         *  `<sc-raw-*>`/`<sc-helmet>` tags); the editor decodes on serialize. */
        __dcAnnotatedTemplate: (name) => runtime.annotatedTemplate(name),
        /** Editor bridge — the *original* (decoded) template source. */
        __dcTemplateSource: (name) => runtime.templateSource(name),
        __dcBoot: () => {
          rootName = boot(runtime, document) ?? rootName;
          notifyHost();
        },
        __dcRegistry: runtime.registry.entries,
        getDC: (name) => runtime.getDC(name),
        // `DCLogic` is the documented base class name; `StreamableLogic` is the
        // implementation alias kept for any project that already references it.
        DCLogic: runtime.StreamableLogic,
        StreamableLogic: runtime.StreamableLogic
      };
      Object.assign(window, api);
      window.__dcContentKeyed = true;
      if (document.readyState !== "loading") api.__dcBoot();
      else document.addEventListener("DOMContentLoaded", () => api.__dcBoot());
    }
    hideRawTemplate();
    loadReactUmd().then(init).catch((err) => {
      console.error("[dc] failed to load React or boot:", err);
      throw err;
    });
  })();

  // frontend/src/design/_ds/nocturne-a411c719-802a-43bb-be07-3768bc4bc706/_ds_bundle.js
  (() => {
    const __ds_ns = window.Nocturne_noctur = window.Nocturne_noctur || {};
    const __ds_scope = {};
    __ds_ns.__errors = __ds_ns.__errors || [];
  })();

  // frontend/src/design/JavJaeger.dc.html
  var JavJaeger_dc_default = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<script src="./support.js"><\/script>
</head>
<body>
<x-dc>
<helmet>
<link rel="stylesheet" href="_ds/nocturne-a411c719-802a-43bb-be07-3768bc4bc706/styles.css">
<link rel="stylesheet" href="https://unpkg.com/@phosphor-icons/web@2.1.1/src/regular/style.css">
<script src="_ds/nocturne-a411c719-802a-43bb-be07-3768bc4bc706/_ds_bundle.js"><\/script>
<style>
body{margin:0;-webkit-font-smoothing:antialiased;--bg:#161826;--hdr:#141622;--surf:#232532;--surf2:#1b1d2b;--ring:#3f424d;--fg:#e9e9ed;--elev:#1d1f2c;--elev2:#20222f;--elevr:#595d6c;--acc:#9184d9;--accd:#5d5294;--acc2:#b5abfc;--accs:#d2cefd;--acct:#e7e5fe;--accw:#efedff;--ok:#63b394;--warn:#c9a05e;--bad:#e08188;--onbad:#ffe3e5;--onok:#e6f2ec;--onwarn:#f6ecd8;--onacc:#e4e7f5;--onmut:#cfd3e5;--ph1:#2c2f42;--ph2:#1a1c28;--ph3:#191b26;--ph4:#1e2030;--av:#31344a;--av2:#2f3243;--sk:#282b3a;--sk2:#313443;--cd:#1c1e2c;--cd2:#1e2132;--cd3:#2f3350;--line:rgba(233,233,237,.13);--line2:rgba(233,233,237,.07);--dim:rgba(233,233,237,.55);--dim2:rgba(233,233,237,.38);--t03:rgba(233,233,237,.03);--t05:rgba(233,233,237,.05);--t08:rgba(233,233,237,.08);--t09:rgba(233,233,237,.09);--t18:rgba(233,233,237,.18);--t30:rgba(233,233,237,.3);--t32:rgba(233,233,237,.32);--t60:rgba(233,233,237,.6);--t62:rgba(233,233,237,.62);--t66:rgba(233,233,237,.66);--t68:rgba(233,233,237,.68);--t70:rgba(233,233,237,.7);--t72:rgba(233,233,237,.72);--t78:rgba(233,233,237,.78);--ovl:rgba(20,22,34,.66);--ovl6:rgba(20,22,34,.6);--ovl55:rgba(20,22,34,.55);--inset:rgba(20,22,34,.35);--scrim8:rgba(20,22,34,.8);--scrim9:rgba(20,22,34,.9);background:var(--bg);color:var(--fg)}
body:has([data-jjtheme="light"]){--color-bg:#f1f2f7;--color-surface:#ffffff;--color-text:#1a1c28;--color-accent:#5b4fa8;--color-accent-2:#6f68a8;--color-divider:color-mix(in srgb, #1a1c28 18%, transparent);--shadow-sm:0 0 0 1px #d7dae4;--shadow-md:0 0 0 1px #cbcfdd, 0 6px 18px rgba(26,28,40,.10);--shadow-lg:0 0 0 1px #c4c8d6, 0 16px 40px rgba(26,28,40,.18);--color-accent-800:#e5e2fb;--color-accent-100:#332b7d;--color-accent-2-800:#e4e3f3;--color-accent-2-100:#3b3766;--color-neutral-800:#e6e8f0;--color-neutral-100:#33384d;--color-neutral-900:#dcdfe9;--bg:#f1f2f7;--hdr:#ffffff;--surf:#ffffff;--surf2:#e9ebf2;--ring:#d7dae4;--fg:#1a1c28;--elev:#ffffff;--elev2:#ffffff;--elevr:#c4c8d6;--acc:#5b4fa8;--accd:#8d84c9;--acc2:#3d3382;--accs:#453b95;--acct:#2e2775;--accw:#332b7d;--ok:#2e7a5d;--warn:#9c6c17;--bad:#bd4450;--onbad:#7a2a31;--onok:#1e5843;--onwarn:#664611;--onacc:#2e2967;--onmut:#39405a;--ph1:#e1e4ee;--ph2:#c6cad9;--ph3:#ccd0de;--ph4:#dbdee9;--av:#dee1ec;--av2:#e2e5ee;--sk:#e5e7f0;--sk2:#dee0ea;--cd:#eef0f6;--cd2:#e9ebf3;--cd3:#dfe2f0;--line:rgba(26,28,40,.14);--line2:rgba(26,28,40,.07);--dim:rgba(26,28,40,.58);--dim2:rgba(26,28,40,.45);--t03:rgba(26,28,40,.035);--t05:rgba(26,28,40,.05);--t08:rgba(26,28,40,.07);--t09:rgba(26,28,40,.09);--t18:rgba(26,28,40,.16);--t30:rgba(26,28,40,.34);--t32:rgba(26,28,40,.36);--t60:rgba(26,28,40,.6);--t62:rgba(26,28,40,.62);--t66:rgba(26,28,40,.66);--t68:rgba(26,28,40,.68);--t70:rgba(26,28,40,.7);--t72:rgba(26,28,40,.74);--t78:rgba(26,28,40,.8);--ovl:rgba(48,50,68,.4);--ovl6:rgba(48,50,68,.36);--ovl55:rgba(48,50,68,.3);--inset:rgba(26,28,40,.04);--scrim8:rgba(246,247,251,.86);--scrim9:rgba(246,247,251,.95)}
.btn{white-space:nowrap;flex:none}
i.ph{display:inline-block;line-height:1}
a{color:var(--acc)}a:hover{color:var(--acc2)}
@keyframes jjspin{to{transform:rotate(360deg)}}
@keyframes jjbar{0%{transform:translateX(-100%)}100%{transform:translateX(240%)}}
@keyframes jjpulse{0%,100%{opacity:.45}50%{opacity:1}}
@keyframes jjrise{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}
@keyframes jjrise-c{from{opacity:0;transform:translate(-50%,6px)}to{opacity:1;transform:translate(-50%,0)}}
</style>
</helmet>
<div data-jjtheme="{{ theme }}" style="--mono:ui-monospace,'SF Mono',Menlo,Consolas,monospace;width:1440px;min-height:900px;background:var(--bg);color:var(--fg);font:400 14px/1.55 Inter,system-ui,sans-serif;position:relative;overflow:hidden">

  <sc-if value="{{ at.chrome }}">
  <header style="height:52px;display:flex;align-items:stretch;padding:0 18px 0 20px;gap:20px;background:var(--hdr);box-shadow:inset 0 -1px 0 var(--line)">
    <div style="display:flex;align-items:center;gap:9px;flex:none;padding-right:6px">
      <img src="static/logo.jpg" alt="JavJaeger" style="width:22px;height:22px;border-radius:5px;object-fit:cover;box-shadow:0 0 0 1px var(--line)">
      <span style="font:500 15px/1 Inter,sans-serif;letter-spacing:-.01em">JavJaeger</span>
      <span title="{{ sysInfo }}" style="font:400 10px/1 var(--mono);color:var(--dim2);padding-top:2px;cursor:default">v2.4.1</span>
    </div>
    <nav style="display:flex;align-items:stretch;gap:2px;flex:1;min-width:0">
      <sc-for list="{{ nav }}" as="n" hint-placeholder-count="8">
        <button onClick="{{ n.go }}" style="appearance:none;background:{{ n.bg }};border:0;box-shadow:inset 0 -2px 0 {{ n.ul }};color:{{ n.fg }};font:{{ n.fw }} 13.5px/1 Inter,sans-serif;padding:0 13px;cursor:pointer;display:flex;align-items:center;gap:6px;white-space:nowrap"><i class="ph {{ n.icon }}" style="font-size:15px;opacity:.85"></i>{{ n.label }}<span style="font:400 10px/1 var(--mono);color:{{ n.badgeFg }};background:{{ n.badgeBg }};padding:2px 4px;border-radius:3px">{{ n.badge }}</span></button>
      </sc-for>
    </nav>
    <div style="display:flex;align-items:center;gap:14px;flex:none">
      <sc-for list="{{ tools }}" as="t" hint-placeholder-count="3">
        <span title="{{ t.hint }}" style="display:inline-flex;align-items:center;gap:5px;font-size:11.5px;color:var(--dim)"><span style="width:6px;height:6px;border-radius:50%;background:{{ t.dot }};box-shadow:0 0 0 2px {{ t.halo }}"></span>{{ t.name }}</span>
      </sc-for>
      <button onClick="{{ bg.open }}" style="appearance:none;cursor:pointer;display:inline-flex;align-items:center;gap:7px;background:rgba(145,132,217,.12);border:1px solid rgba(145,132,217,.35);border-radius:6px;padding:4px 9px;color:var(--accs);font-size:11.5px">
        <span style="width:11px;height:11px;border-radius:50%;border:1.5px solid var(--accs);border-top-color:transparent;animation:jjspin 900ms linear infinite"></span>\u540E\u53F0 {{ bg.count }}
      </button>
    </div>
  </header>
  </sc-if>

  <sc-if value="{{ at.search }}" hint-placeholder-val="{{ true }}">
  <div style="display:flex;align-items:stretch;min-height:848px">
    <aside style="width:258px;flex:none;background:var(--surf2);box-shadow:inset -1px 0 0 var(--line2);padding:15px 14px 22px;display:flex;flex-direction:column;gap:12px;overflow:auto">
      <span style="font:600 10px/1 Inter,sans-serif;letter-spacing:.13em;text-transform:uppercase;color:var(--dim2)">\u68C0\u7D22\u65B9\u5F0F</span>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px">
        <sc-for list="{{ s.modes }}" as="m" hint-placeholder-count="4">
          <button onClick="{{ m.pick }}" style="appearance:none;cursor:pointer;text-align:left;background:{{ m.bg }};border:0;box-shadow:inset 0 0 0 1px {{ m.ring }};border-radius:6px;padding:7px 9px;color:{{ m.fg }};font:{{ m.fw }} 12.5px/1.3 Inter,sans-serif">{{ m.name }}</button>
        </sc-for>
      </div>
      <p style="margin:0;font-size:11px;color:var(--dim2);line-height:1.5">{{ s.modeHint }}</p>
      <hr class="hr" style="margin:1px 0">

      <sc-if value="{{ s.isCode }}">
        <div class="field"><label>\u756A\u53F7</label><input class="input" style="font-family:var(--mono);letter-spacing:.04em" placeholder="MIZ-812" value="{{ s.code }}" onChange="{{ s.setCode }}"><span style="font-size:10.5px;color:var(--dim2);margin-top:3px;display:block">\u76F4\u63A5\u6309\u756A\u53F7\u53D6\u5F71\u7247\u8BE6\u60C5\uFF0C\u547D\u4E2D\u5373\u4E00\u6761\u7ED3\u679C</span></div>
      </sc-if>

      <sc-if value="{{ s.isFilter }}">
        <div class="field"><label>\u7B5B\u9009\u7C7B\u578B</label><select class="input" value="{{ s.fType }}" onChange="{{ s.setFType }}"><option>\u6F14\u5458</option><option>\u7C7B\u522B</option><option>\u5BFC\u6F14</option><option>\u5236\u4F5C\u5546</option><option>\u53D1\u884C\u5546</option><option>\u7CFB\u5217</option></select></div>
        <div class="field"><label>\u7B5B\u9009\u503C<sc-if value="{{ s.canBrowse }}"><button class="btn btn-ghost" style="font-size:11px;padding:0 3px;margin-left:6px" onClick="{{ s.openBrowse }}">\u6D4F\u89C8</button></sc-if></label><input class="input" placeholder="\u7B5B\u9009\u4EE3\u7801\u6216\u540D\u79F0" value="{{ s.fValue }}" onChange="{{ s.setFValue }}"><span style="font-size:10.5px;color:var(--dim2);margin-top:3px;display:block">{{ s.fCatalogNote }}</span></div>
        <button class="btn btn-secondary btn-block" style="font-size:12.5px" onClick="{{ s.addFilter }}">\u6DFB\u52A0\u4E3A\u7B5B\u9009\u6761\u4EF6</button>
        <div class="field"><label>\u78C1\u529B</label>
          <div class="seg" style="width:100%">
            <label class="seg-opt" style="flex:1;justify-content:center"><input type="radio" name="jj-mag" checked="{{ s.magExist }}" onChange="{{ s.setMagExist }}"><span>\u6709\u78C1\u529B</span></label>
            <label class="seg-opt" style="flex:1;justify-content:center"><input type="radio" name="jj-mag" checked="{{ s.magAll }}" onChange="{{ s.setMagAll }}"><span>\u5168\u90E8</span></label>
          </div>
        </div>
        <div class="field"><label>\u5F71\u7247\u7C7B\u578B</label>
          <div class="seg" style="width:100%">
            <label class="seg-opt" style="flex:1;justify-content:center"><input type="radio" name="jj-kind" checked="{{ s.kindNormal }}" onChange="{{ s.setKindNormal }}"><span>\u6709\u7801</span></label>
            <label class="seg-opt" style="flex:1;justify-content:center"><input type="radio" name="jj-kind" checked="{{ s.kindUnc }}" onChange="{{ s.setKindUnc }}"><span>\u65E0\u7801</span></label>
          </div>
        </div>
        <div class="field"><label>\u6F14\u5458\u4EBA\u6570</label><select class="input" value="{{ s.actorCount }}" onChange="{{ s.setActorCount }}"><option>\u4E0D\u9650</option><option>1 \u4EBA</option><option>2 \u4EBA</option><option>3 \u4EBA</option><option>\u2264 2 \u4EBA</option><option>\u2264 3 \u4EBA</option><option>\u2265 3 \u4EBA</option><option>\u2265 4 \u4EBA</option></select></div>
        <div class="field"><label>\u4E2D\u6587\u5B57\u5E55</label>
          <div class="seg" style="width:100%">
            <label class="seg-opt" style="flex:1;justify-content:center"><input type="radio" name="jj-sub" checked="{{ s.sub0 }}" onChange="{{ s.setSub0 }}"><span>\u4E0D\u9650</span></label>
            <label class="seg-opt" style="flex:1;justify-content:center"><input type="radio" name="jj-sub" checked="{{ s.subTrue }}" onChange="{{ s.setSubTrue }}"><span>\u6709</span></label>
            <label class="seg-opt" style="flex:1;justify-content:center"><input type="radio" name="jj-sub" checked="{{ s.subFalse }}" onChange="{{ s.setSubFalse }}"><span>\u65E0</span></label>
          </div>
        </div>
        <label style="display:flex;align-items:center;gap:8px;font-size:13px;cursor:pointer;color:var(--dim)"><input type="checkbox" style="accent-color:var(--acc);width:14px;height:14px" checked="{{ s.excludeVr }}" onChange="{{ s.toggleExcludeVr }}">\u6392\u9664 VR \u5F71\u7247</label>
        <div class="field"><label>\u83B7\u53D6\u8303\u56F4</label>
          <div class="seg" style="width:100%">
            <label class="seg-opt" style="flex:1;justify-content:center"><input type="radio" name="jj-fetch" checked="{{ s.fetchPage }}" onChange="{{ s.setFetchPage }}"><span>\u5F53\u524D\u9875</span></label>
            <label class="seg-opt" style="flex:1;justify-content:center"><input type="radio" name="jj-fetch" checked="{{ s.fetchAll }}" onChange="{{ s.setFetchAll }}"><span>\u5168\u90E8\u9875</span></label>
          </div>
        </div>
        <sc-if value="{{ s.detailWarn }}">
          <div style="border-radius:6px;background:rgba(201,160,94,.07);box-shadow:inset 0 0 0 1px rgba(201,160,94,.3);padding:8px 10px;font-size:11px;line-height:1.55;color:var(--dim)">{{ s.detailWarnText }}</div>
        </sc-if>
      </sc-if>

      <sc-if value="{{ s.isMagnet }}">
        <div class="field"><label>\u756A\u53F7</label><input class="input" style="font-family:var(--mono);letter-spacing:.04em" placeholder="MIZ-812" value="{{ s.code }}" onChange="{{ s.setCode }}"></div>
        <div class="field"><label>\u6392\u5E8F\u5B57\u6BB5</label>
          <div class="seg" style="width:100%">
            <label class="seg-opt" style="flex:1;justify-content:center"><input type="radio" name="jj-sb" checked="{{ s.sortSize }}" onChange="{{ s.setSortSize }}"><span>\u4F53\u79EF</span></label>
            <label class="seg-opt" style="flex:1;justify-content:center"><input type="radio" name="jj-sb" checked="{{ s.sortDate }}" onChange="{{ s.setSortDate }}"><span>\u65E5\u671F</span></label>
          </div>
        </div>
        <div class="field"><label>\u6392\u5E8F\u65B9\u5411</label>
          <div class="seg" style="width:100%">
            <label class="seg-opt" style="flex:1;justify-content:center"><input type="radio" name="jj-so" checked="{{ s.orderDesc }}" onChange="{{ s.setOrderDesc }}"><span>\u964D\u5E8F</span></label>
            <label class="seg-opt" style="flex:1;justify-content:center"><input type="radio" name="jj-so" checked="{{ s.orderAsc }}" onChange="{{ s.setOrderAsc }}"><span>\u5347\u5E8F</span></label>
          </div>
        </div>
        <div class="field"><label>\u4E2D\u6587\u5B57\u5E55</label>
          <div class="seg" style="width:100%">
            <label class="seg-opt" style="flex:1;justify-content:center"><input type="radio" name="jj-sub" checked="{{ s.sub0 }}" onChange="{{ s.setSub0 }}"><span>\u4E0D\u9650</span></label>
            <label class="seg-opt" style="flex:1;justify-content:center"><input type="radio" name="jj-sub" checked="{{ s.subTrue }}" onChange="{{ s.setSubTrue }}"><span>\u6709</span></label>
            <label class="seg-opt" style="flex:1;justify-content:center"><input type="radio" name="jj-sub" checked="{{ s.subFalse }}" onChange="{{ s.setSubFalse }}"><span>\u65E0</span></label>
          </div>
        </div>
        <p style="margin:0;font-size:11px;color:var(--dim2);line-height:1.5">JavBus \u6765\u6E90\u9700\u8981\u5148\u53D6\u5F71\u7247\u7684 gid / uc \u53C2\u6570\uFF0C\u5176\u4ED6\u6765\u6E90\u76F4\u63A5\u6309\u756A\u53F7\u67E5\u8BE2\u3002</p>
      </sc-if>

      <sc-if value="{{ s.isRecognizeMode }}">
        <div class="field"><label>\u9875\u9762 HTML</label><textarea class="input" style="font-family:var(--mono);font-size:11.5px;min-height:150px" placeholder="\u7C98\u8D34 JavBus \u5217\u8868\u9875 HTML\uFF08\u542B videothumblist \u533A\u57DF\uFF09" value="{{ s.recogHtml }}" onChange="{{ s.setRecogHtml }}"></textarea></div>
        <div class="field"><label>\u4E2D\u6587\u5B57\u5E55</label>
          <div class="seg" style="width:100%">
            <label class="seg-opt" style="flex:1;justify-content:center"><input type="radio" name="jj-sub" checked="{{ s.sub0 }}" onChange="{{ s.setSub0 }}"><span>\u4E0D\u9650</span></label>
            <label class="seg-opt" style="flex:1;justify-content:center"><input type="radio" name="jj-sub" checked="{{ s.subTrue }}" onChange="{{ s.setSubTrue }}"><span>\u6709</span></label>
            <label class="seg-opt" style="flex:1;justify-content:center"><input type="radio" name="jj-sub" checked="{{ s.subFalse }}" onChange="{{ s.setSubFalse }}"><span>\u65E0</span></label>
          </div>
        </div>
      </sc-if>

      <hr class="hr" style="margin:1px 0">
      <div style="display:flex;align-items:baseline"><span style="font:600 10px/1 Inter,sans-serif;letter-spacing:.13em;text-transform:uppercase;color:var(--dim2)">\u4E0B\u8F7D\u5DE5\u5177</span><button class="btn btn-ghost" style="margin-left:auto;font-size:11px;padding:2px 4px" onClick="{{ s.openToolCfg }}">\u914D\u7F6E</button></div>
      <div class="seg" style="width:100%">
        <label class="seg-opt" style="flex:1;justify-content:center"><input type="radio" name="jj-dltool" checked="{{ s.toolPik }}" onChange="{{ s.setToolPik }}"><span>PikPak</span></label>
        <label class="seg-opt" style="flex:1;justify-content:center"><input type="radio" name="jj-dltool" checked="{{ s.tool115 }}" onChange="{{ s.setTool115 }}"><span>115</span></label>
        <label class="seg-opt" style="flex:1;justify-content:center"><input type="radio" name="jj-dltool" checked="{{ s.toolAria }}" onChange="{{ s.setToolAria }}"><span>\u76F4\u63A5\u4E0B\u8F7D</span></label>
      </div>
      <div style="display:flex;align-items:center;gap:6px;font-size:11.5px;color:{{ s.toolFg }}"><span style="width:6px;height:6px;border-radius:50%;background:{{ s.toolDot }}"></span>{{ s.toolStatus }}</div>
      <sc-if value="{{ s.autoDlAvailable }}">
        <div class="field"><label>\u547D\u4E2D\u540E\u52A8\u4F5C</label>
          <div class="seg" style="width:100%">
            <label class="seg-opt" style="flex:1;justify-content:center"><input type="radio" name="jj-autodl" checked="{{ s.autoOff }}" onChange="{{ s.setAutoOff }}"><span>{{ s.autoOffText }}</span></label>
            <label class="seg-opt" style="flex:1;justify-content:center"><input type="radio" name="jj-autodl" checked="{{ s.autoOn }}" onChange="{{ s.setAutoOn }}"><span>\u81EA\u52A8\u4E0B\u8F7D\u6700\u4F73</span></label>
          </div>
        </div>
      </sc-if>
      <hr class="hr" style="margin:1px 0">
      <span style="font:600 10px/1 Inter,sans-serif;letter-spacing:.13em;text-transform:uppercase;color:var(--dim2)">\u78C1\u529B\u8BBE\u7F6E</span>
      <div class="field"><label>\u78C1\u529B\u6765\u6E90</label><select class="input" value="{{ s.srcLabel }}" onChange="{{ s.setSrcSelect }}"><option>JavBus</option><option>Cilisousuo</option><option>YHG007</option></select></div>
      <label style="display:flex;align-items:center;gap:8px;font-size:13px;cursor:pointer;color:var(--dim)"><input type="checkbox" style="accent-color:var(--acc);width:14px;height:14px" checked="{{ s.exclude4k }}" onChange="{{ s.toggleExclude4k }}">\u5168\u5C40\u6392\u9664 4K \u8D44\u6E90</label>
      <span style="font-size:10.5px;color:var(--dim2);line-height:1.5">\u6539\u52A8\u540E\u4F1A\u6309\u5F53\u524D\u7ED3\u679C\u91CD\u65B0\u62C9\u53D6\u6700\u4F73\u78C1\u529B\u3002</span>
      <div style="display:flex;gap:7px;margin-top:4px">
        <button class="btn btn-primary" style="flex:1" onClick="{{ s.run }}">{{ s.runText }}</button>
        <button class="btn btn-secondary" style="font-size:12px" onClick="{{ s.reset }}">\u91CD\u7F6E</button>
      </div>
    </aside>

    <main style="flex:1;min-width:0;padding:14px 20px 26px;display:flex;flex-direction:column;gap:12px">
      <div style="display:flex;align-items:center;gap:14px;flex-wrap:wrap">
        <div style="display:flex;align-items:center;gap:10px">
          <h4 style="margin:0">{{ s.modeTitle }}</h4>
          <span style="display:inline-flex;align-items:center;gap:5px;font-size:11.5px;color:{{ s.srcFg }}"><span style="width:6px;height:6px;border-radius:50%;background:{{ s.srcDot }}"></span>\u78C1\u529B\u6765\u6E90 {{ s.srcLabel }} \xB7 {{ s.srcText }}</span>
          <sc-if value="{{ s.exclude4k }}"><span class="tag tag-outline" style="font-size:10.5px;padding:2px 6px">\u5DF2\u6392\u9664 4K</span></sc-if>
        </div>
        <div style="margin-left:auto;display:flex;align-items:center;gap:10px">
          <span style="font:400 11.5px/1.4 var(--mono);color:var(--dim2);text-align:right">{{ s.magnetProgress }}</span>
          <div class="seg">
            <label class="seg-opt" style="padding:6px 10px"><input type="radio" name="jj-view" checked="{{ s.viewGrid }}" onChange="{{ s.setViewGrid }}"><span>\u5C01\u9762</span></label>
            <label class="seg-opt" style="padding:6px 10px"><input type="radio" name="jj-view" checked="{{ s.viewList }}" onChange="{{ s.setViewList }}"><span>\u5217\u8868</span></label>
          </div>
          <button class="btn btn-secondary" onClick="{{ s.selectPage }}">\u5168\u9009\u672C\u9875</button>
          <button class="btn btn-primary" disabled="{{ s.noResults }}" onClick="{{ s.downloadAll }}">\u4E0B\u8F7D\u5168\u90E8\u7ED3\u679C</button>
        </div>
      </div>

      <div style="display:flex;align-items:center;gap:7px;flex-wrap:wrap;min-height:24px">
        <sc-for list="{{ s.chips }}" as="c" hint-placeholder-count="3">
          <span class="tag tag-neutral" style="gap:6px;padding:3px 7px 3px 9px">{{ c.text }}<button onClick="{{ c.remove }}" style="appearance:none;background:none;border:0;color:inherit;opacity:.6;cursor:pointer;font-size:12px;padding:0 1px;line-height:1">\xD7</button></span>
        </sc-for>
        <sc-if value="{{ s.hasChips }}"><button class="btn btn-ghost" style="font-size:11px;padding:2px 5px;white-space:nowrap" onClick="{{ s.clearFilters }}">\u6E05\u7A7A\u6761\u4EF6</button></sc-if>
        <span style="font-size:11.5px;color:var(--dim2)">{{ s.summary }}</span>
      </div>

      <sc-if value="{{ s.isRecognize }}">
        <div style="background:var(--surf);border-radius:8px;box-shadow:0 0 0 1px var(--ring);padding:13px 15px;display:flex;align-items:center;gap:14px;flex-wrap:wrap">
          <div style="font-size:12.5px;color:var(--dim)">\u4ECE\u7C98\u8D34\u7684 HTML \u4E2D\u89E3\u6790 <code style="font-family:var(--mono);font-size:11.5px;color:var(--accs)">videothumblist</code> \u533A\u57DF \xB7 \u8BC6\u522B {{ s.recogCount }} \u90E8\uFF0C\u6309\u9875\u9762\u6392\u540D\u6392\u5E8F</div>
          <sc-if value="{{ s.autoDownload }}"><span class="tag tag-accent" style="font-size:10.5px;padding:2px 6px">\u81EA\u52A8\u4E0B\u8F7D\u6700\u4F73 \xB7 {{ s.tool }}</span></sc-if>
          <span style="margin-left:auto;font:400 11.5px/1 var(--mono);color:var(--dim2)">{{ s.recogSkipped }}</span>
        </div>
      </sc-if>

      <sc-if value="{{ s.isMagnet }}">
        <div style="background:var(--surf);border-radius:8px;box-shadow:0 0 0 1px var(--ring);overflow:hidden">
          <div style="display:flex;align-items:center;gap:10px;padding:11px 14px;box-shadow:inset 0 -1px 0 var(--line2)">
            <h5 style="margin:0">\u78C1\u529B\u67E5\u8BE2 \xB7 {{ s.magCode }}</h5>
            <span style="font-size:11.5px;color:var(--dim2)">{{ s.magQueryNote }}</span>
          </div>
          <table class="table" style="font-size:12.5px">
            <thead><tr><th>\u8D44\u6E90\u540D</th><th style="width:82px">\u5927\u5C0F</th><th style="width:92px">\u4E2D\u6587\u5B57\u5E55</th><th style="width:86px">\u53D1\u5E03\u65E5\u671F</th><th style="width:96px">\u64CD\u4F5C</th></tr></thead>
            <tbody>
              <sc-for list="{{ s.magRows }}" as="g" hint-placeholder-count="5">
                <tr>
                  <td><div style="display:flex;align-items:center;gap:6px"><span style="font:400 11.5px/1.3 var(--mono);color:{{ g.fg }};max-width:420px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">{{ g.name }}</span><sc-for list="{{ g.flags }}" as="f" hint-placeholder-count="0"><span style="font:500 10px/1 Inter;padding:2px 4px;border-radius:3px;background:{{ f.bg }};color:{{ f.fg }}">{{ f.t }}</span></sc-for></div></td>
                  <td style="font-family:var(--mono);color:var(--dim)">{{ g.size }}</td>
                  <td><span style="font-size:11.5px;color:{{ g.subFg }}">{{ g.sub }}</span></td>
                  <td style="font-family:var(--mono);font-size:11.5px;color:var(--dim2)">{{ g.date }}</td>
                  <td><button class="btn btn-primary" style="font-size:11px;padding:3px 7px" onClick="{{ g.dispatch }}">\u6D3E\u53D1</button></td>
                </tr>
              </sc-for>
            </tbody>
          </table>
        </div>
      </sc-if>

      <sc-if value="{{ s.offline }}">
        <div style="background:rgba(224,129,136,.07);box-shadow:inset 0 0 0 1px rgba(224,129,136,.35);border-radius:8px;padding:22px 24px;display:flex;gap:16px;align-items:flex-start">
          <i class="ph ph-warning-circle" style="font-size:19px;color:var(--bad);flex:none;margin-top:1px"></i>
          <div style="flex:1">
            <h5 style="margin:0 0 4px;color:var(--bad)">YHG007 \u6765\u6E90\u4E0D\u53EF\u8FBE</h5>
            <p style="margin:0 0 12px;font-size:13px;color:var(--dim)">HTTPConnectionPool(host='yhg007.com', port=443)\uFF1A\u8FDE\u63A5\u8D85\u65F6 8s\u3002\u68C0\u67E5 <code style="font-family:var(--mono);font-size:12px;color:var(--accs)">javbus.proxy</code> \u662F\u5426\u8986\u76D6\u8BE5\u57DF\u540D\uFF0C\u6216\u5207\u6362\u5230\u5176\u4ED6\u78C1\u529B\u6765\u6E90\u3002\u5DF2\u4FDD\u7559\u4E0A\u4E00\u6B21 JavBus \u7ED3\u679C\u7F13\u5B58\u3002</p>
            <div style="display:flex;gap:8px"><button class="btn btn-primary" onClick="{{ s.run }}">\u91CD\u8BD5</button><button class="btn btn-secondary" onClick="{{ s.setSrcJav }}">\u5207\u56DE JavBus</button><button class="btn btn-ghost" onClick="{{ s.goSettings }}">\u6253\u5F00\u8BBE\u7F6E</button></div>
          </div>
        </div>
      </sc-if>

      <sc-if value="{{ s.loading }}">
        <div>
          <div style="height:2px;background:rgba(145,132,217,.15);border-radius:2px;overflow:hidden;margin-bottom:14px"><div style="width:40%;height:100%;background:var(--acc);animation:jjbar 1.1s ease-in-out infinite"></div></div>
          <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:14px">
            <sc-for list="{{ s.skeletons }}" as="k" hint-placeholder-count="8">
              <div style="background:var(--surf);border-radius:8px;box-shadow:0 0 0 1px var(--ring);overflow:hidden;animation:jjpulse 1.4s ease-in-out infinite">
                <div style="aspect-ratio:3/2;background:var(--sk)"></div>
                <div style="padding:10px 11px;display:flex;flex-direction:column;gap:7px"><div style="height:9px;width:40%;background:var(--sk2)60;border-radius:3px"></div><div style="height:9px;width:88%;background:var(--sk2);border-radius:3px"></div><div style="height:9px;width:60%;background:var(--sk2);border-radius:3px"></div></div>
              </div>
            </sc-for>
          </div>
        </div>
      </sc-if>

      <sc-if value="{{ s.empty }}">
        <div style="padding:76px 0;text-align:center">
          <div style="width:44px;height:44px;margin:0 auto 14px;border-radius:10px;box-shadow:inset 0 0 0 1px var(--line)"></div>
          <h5 style="margin:0 0 6px">{{ s.emptyTitle }}</h5>
          <p style="margin:0 auto 16px;max-width:420px;font-size:13px;color:var(--dim)">{{ s.emptyBody }}</p>
          <button class="btn btn-secondary" onClick="{{ s.reset }}">\u91CD\u7F6E\u6761\u4EF6</button>
        </div>
      </sc-if>

      <sc-if value="{{ s.showGrid }}">
        <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:14px">
          <sc-for list="{{ s.rows }}" as="m" hint-placeholder-count="8">
            <div style="background:var(--surf);border-radius:8px;box-shadow:0 0 0 1px {{ m.ring }};overflow:hidden;display:flex;flex-direction:column">
              <div style="position:relative;aspect-ratio:3/2;background:linear-gradient(142deg,var(--ph1),var(--ph2));display:grid;place-items:center;box-shadow:inset 0 -1px 0 var(--line2)">
                <span style="font:500 12px/1 var(--mono);letter-spacing:.16em;color:var(--t30)">{{ m.code }}</span>
                <span style="position:absolute;left:0;top:0;bottom:0;width:2px;background:{{ m.statusColor }}"></span>
                <label style="position:absolute;top:7px;left:8px;display:grid;place-items:center;cursor:pointer"><input type="checkbox" style="accent-color:var(--acc);width:15px;height:15px;margin:0" checked="{{ m.sel }}" onChange="{{ m.toggle }}"></label>
                <div style="position:absolute;top:7px;right:7px;display:flex;gap:4px">
                  <sc-for list="{{ m.badges }}" as="b" hint-placeholder-count="0"><span style="font:500 10px/1 Inter,sans-serif;padding:3px 5px;border-radius:3px;background:{{ b.bg }};color:{{ b.fg }}">{{ b.t }}</span></sc-for>
                </div>
                <span style="position:absolute;bottom:7px;right:8px;font:400 10.5px/1 var(--mono);color:rgba(233,233,237,.5)">{{ m.dur }}</span>
              </div>
              <div style="padding:9px 11px 11px;display:flex;flex-direction:column;gap:6px;flex:1">
                <div style="display:flex;align-items:baseline;gap:6px"><span style="font:500 11.5px/1 var(--mono);color:var(--acc);letter-spacing:.03em">{{ m.code }}</span><span style="font-size:10.5px;color:var(--dim2);margin-left:auto">{{ m.date }}</span></div>
                <div style="font:500 13px/1.35 Inter,sans-serif;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;min-height:35px">{{ m.title }}</div>
                <div style="font-size:11.5px;color:var(--dim);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">{{ m.actorText }}</div>
                <div style="display:flex;gap:4px;flex-wrap:wrap"><sc-for list="{{ m.tags }}" as="t" hint-placeholder-count="2"><span style="font-size:10.5px;padding:2px 6px;border-radius:3px;background:var(--t05);color:var(--dim)">{{ t.t }}</span></sc-for></div>
                <div style="margin-top:auto;padding-top:7px;box-shadow:inset 0 1px 0 var(--line2);display:flex;flex-direction:column;gap:5px">
                  <span style="display:inline-flex;align-items:center;gap:5px;font-size:11.5px;color:{{ m.statusColor }}"><span style="width:5px;height:5px;border-radius:50%;background:{{ m.statusColor }}"></span>{{ m.statusText }}</span>
                  <span style="font:400 11px/1.3 var(--mono);color:{{ m.magFg }};overflow:hidden;text-overflow:ellipsis;white-space:nowrap">{{ m.magText }}</span>
                </div>
                <div style="display:flex;gap:6px;padding-top:2px">
                  <button class="btn btn-primary" style="flex:1;font-size:12px;padding:5px 8px" disabled="{{ m.noMag }}" onClick="{{ m.dispatch }}">\u6D3E\u53D1</button>
                  <button class="btn btn-secondary" style="font-size:12px;padding:5px 8px" onClick="{{ m.open }}">\u8BE6\u60C5</button>
                </div>
              </div>
            </div>
          </sc-for>
        </div>
      </sc-if>

      <sc-if value="{{ s.showList }}">
        <div style="background:var(--surf);border-radius:8px;box-shadow:0 0 0 1px var(--ring);overflow:hidden">
          <table class="table">
            <thead><tr><th style="width:34px"></th><th style="width:86px">\u5C01\u9762</th><th style="width:104px">\u756A\u53F7</th><th>\u6807\u9898 / \u6807\u7B7E</th><th style="width:150px">\u6F14\u5458</th><th style="width:92px">\u53D1\u884C\u65E5\u671F</th><th style="width:104px">\u672C\u5730\u72B6\u6001</th><th style="width:210px">\u6700\u4F73\u78C1\u529B</th><th style="width:118px">\u64CD\u4F5C</th></tr></thead>
            <tbody>
              <sc-for list="{{ s.rows }}" as="m" hint-placeholder-count="6">
                <tr>
                  <td><input type="checkbox" style="accent-color:var(--acc);width:14px;height:14px" checked="{{ m.sel }}" onChange="{{ m.toggle }}"></td>
                  <td><div style="width:74px;aspect-ratio:3/2;border-radius:4px;background:linear-gradient(142deg,var(--ph1),var(--ph2));display:grid;place-items:center;font:500 9px/1 var(--mono);color:var(--t32);letter-spacing:.1em">{{ m.code }}</div></td>
                  <td><span style="font:500 12px/1 var(--mono);color:var(--acc)">{{ m.code }}</span></td>
                  <td><div style="font-size:13px;margin-bottom:3px;max-width:330px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">{{ m.title }}</div><div style="font-size:10.5px;color:var(--dim2)">{{ m.tagText }}</div></td>
                  <td style="font-size:12.5px;color:var(--dim)">{{ m.actorText }}</td>
                  <td style="font-family:var(--mono);font-size:12px;color:var(--dim)">{{ m.date }}</td>
                  <td><span style="font-size:11.5px;color:{{ m.statusColor }}">{{ m.statusText }}</span></td>
                  <td style="font:400 11px/1.35 var(--mono);color:{{ m.magFg }}">{{ m.magText }}</td>
                  <td><div style="display:flex;gap:5px"><button class="btn btn-primary" style="font-size:11.5px;padding:4px 7px" disabled="{{ m.noMag }}" onClick="{{ m.dispatch }}">\u6D3E\u53D1</button><button class="btn btn-secondary" style="font-size:11.5px;padding:4px 7px" onClick="{{ m.open }}">\u8BE6\u60C5</button></div></td>
                </tr>
              </sc-for>
            </tbody>
          </table>
        </div>
      </sc-if>

      <sc-if value="{{ s.showPager }}">
        <div style="display:flex;align-items:center;gap:12px;padding-top:2px">
          <span style="font-size:12px;color:var(--dim2)">{{ s.pagerText }}</span>
          <div style="margin-left:auto;display:flex;gap:6px;align-items:center">
            <button class="btn btn-secondary" style="font-size:12px;padding:4px 9px" disabled="{{ s.prevDisabled }}" onClick="{{ s.prevPage }}">\u4E0A\u4E00\u9875</button>
            <span class="tag tag-outline" style="padding:4px 10px;font-family:var(--mono)">\u7B2C {{ s.page }} \u9875</span>
            <button class="btn btn-secondary" style="font-size:12px;padding:4px 9px" disabled="{{ s.nextDisabled }}" onClick="{{ s.nextPage }}">\u4E0B\u4E00\u9875</button>
            <button class="btn btn-ghost" style="font-size:12px;padding:4px 8px" onClick="{{ s.setFetchAll }}">\u83B7\u53D6\u5168\u90E8\u9875</button>
          </div>
        </div>
      </sc-if>
    </main>
  </div>
  </sc-if>

  <sc-if value="{{ at.dispatch }}">
  <div style="display:flex;align-items:stretch;min-height:848px">
    <aside style="width:266px;flex:none;background:var(--surf2);box-shadow:inset -1px 0 0 var(--line2);padding:15px 14px 22px;display:flex;flex-direction:column;gap:14px;overflow:auto">
      <span style="font:600 10px/1 Inter,sans-serif;letter-spacing:.13em;text-transform:uppercase;color:var(--dim2)">\u4E0B\u8F7D\u5DE5\u5177</span>
      <sc-for list="{{ d.tools }}" as="t" hint-placeholder-count="3">
        <div style="border-radius:8px;background:{{ t.bg }};box-shadow:inset 0 0 0 1px {{ t.ring }};padding:10px 11px;display:flex;flex-direction:column;gap:7px;cursor:pointer" onClick="{{ t.pick }}">
          <div style="display:flex;align-items:center;gap:8px">
            <input type="radio" name="jj-tool" style="accent-color:var(--acc);width:13px;height:13px;margin:0" checked="{{ t.active }}" onChange="{{ t.pick }}">
            <span style="font:500 13.5px/1 Inter,sans-serif">{{ t.name }}</span>
            <span style="margin-left:auto;display:inline-flex;align-items:center;gap:5px;font-size:11px;color:{{ t.fg }}"><span style="width:6px;height:6px;border-radius:50%;background:{{ t.dot }}"></span>{{ t.status }}</span>
          </div>
          <div style="font:400 11px/1.45 var(--mono);color:var(--dim2);word-break:break-all">{{ t.meta }}</div>
          <sc-if value="{{ t.needsAction }}"><button class="btn btn-primary" style="font-size:11.5px;padding:4px 8px;align-self:flex-start" onClick="{{ t.action }}">{{ t.actionText }}</button></sc-if>
        </div>
      </sc-for>
      <hr class="hr" style="margin:2px 0">
      <span style="font:600 10px/1 Inter,sans-serif;letter-spacing:.13em;text-transform:uppercase;color:var(--dim2)">\u6D3E\u53D1\u8303\u56F4</span>
      <div class="seg" style="width:100%">
        <label class="seg-opt" style="flex:1;justify-content:center"><input type="radio" name="jj-scope" checked="{{ d.scope1 }}" onChange="{{ d.setScope1 }}"><span>\u672C\u9875</span></label>
        <label class="seg-opt" style="flex:1;justify-content:center"><input type="radio" name="jj-scope" checked="{{ d.scope2 }}" onChange="{{ d.setScope2 }}"><span>\u5DF2\u9009</span></label>
        <label class="seg-opt" style="flex:1;justify-content:center"><input type="radio" name="jj-scope" checked="{{ d.scope3 }}" onChange="{{ d.setScope3 }}"><span>\u756A\u53F7\u5217\u8868</span></label>
      </div>
      <div class="field"><label>\u6279\u91CF\u756A\u53F7\uFF08\u6BCF\u884C\u4E00\u4E2A\uFF09</label><textarea class="input" style="font-family:var(--mono);font-size:12px;min-height:96px;letter-spacing:.03em" value="{{ d.codes }}" onChange="{{ d.setCodes }}"></textarea></div>
      <span style="font:600 10px/1 Inter,sans-serif;letter-spacing:.13em;text-transform:uppercase;color:var(--dim2)">\u78C1\u529B\u7B56\u7565</span>
      <div class="field"><label>\u78C1\u529B\u6765\u6E90</label><select class="input" value="{{ d.src }}" onChange="{{ d.setSrc }}"><option>javbus</option><option>cilisousuo</option><option>yhg007</option></select></div>
      <label style="display:flex;align-items:center;gap:8px;font-size:13px;color:var(--dim);cursor:pointer"><input type="checkbox" style="accent-color:var(--acc);width:14px;height:14px" checked="{{ d.subOnly }}" onChange="{{ d.toggleSub }}">\u4EC5\u4E2D\u6587\u5B57\u5E55\u8D44\u6E90</label>
      <label style="display:flex;align-items:center;gap:8px;font-size:13px;color:var(--dim);cursor:pointer"><input type="checkbox" style="accent-color:var(--acc);width:14px;height:14px" checked="{{ d.no4k }}" onChange="{{ d.toggle4k }}">\u6392\u9664 4K\uFF08\u4F53\u79EF\u4F18\u5148\uFF09</label>
      <label style="display:flex;align-items:center;gap:8px;font-size:13px;color:var(--dim);cursor:pointer"><input type="checkbox" style="accent-color:var(--acc);width:14px;height:14px" checked="{{ d.skipLocal }}" onChange="{{ d.toggleSkipLocal }}">\u8DF3\u8FC7\u672C\u5730\u5E93\u5DF2\u6709\u5F71\u7247</label>
      <label style="display:flex;align-items:center;gap:8px;font-size:13px;color:var(--dim);cursor:pointer"><input type="checkbox" style="accent-color:var(--acc);width:14px;height:14px" checked="{{ d.skipTried }}" onChange="{{ d.toggleSkipTried }}">\u8DF3\u8FC7\u5386\u53F2\u5931\u8D25\u94FE\u63A5</label>
      <button class="btn btn-primary btn-block" onClick="{{ d.run }}">\u6D3E\u53D1 {{ d.runCount }} \u4E2A\u756A\u53F7</button>
    </aside>

    <main style="flex:1;min-width:0;padding:14px 20px 26px;display:flex;flex-direction:column;gap:14px;overflow:auto">
      <div style="display:flex;align-items:flex-end;gap:14px">
        <div><h4 style="margin:0 0 2px">\u4E0B\u8F7D\u6D3E\u53D1</h4><span style="font-size:12.5px;color:var(--dim)">\u5F53\u524D\u5DE5\u5177 {{ d.tool }} \xB7 \u78C1\u529B\u6765\u6E90 {{ d.src }} \xB7 \u6D3E\u53D1\u8BB0\u5F55\u5199\u5165 downloaded_movies.json</span></div>
        <button class="btn btn-secondary" style="margin-left:auto" onClick="{{ d.check }}">\u6838\u5BF9\u672C\u5730\u5E93</button>
        <button class="btn btn-secondary" onClick="{{ d.refresh }}">\u5237\u65B0\u5386\u53F2</button>
      </div>

      <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:12px">
        <sc-for list="{{ d.stats }}" as="k" hint-placeholder-count="4">
          <div style="background:var(--surf);border-radius:8px;box-shadow:0 0 0 1px var(--ring);padding:11px 13px">
            <div style="font-size:11.5px;color:var(--dim2);margin-bottom:4px">{{ k.label }}</div>
            <div style="font:500 24px/1 Inter,sans-serif;color:{{ k.color }};font-variant-numeric:tabular-nums">{{ k.value }}</div>
            <div style="font-size:11px;color:var(--dim2);margin-top:4px">{{ k.note }}</div>
          </div>
        </sc-for>
      </div>

      <div style="background:rgba(201,160,94,.06);box-shadow:inset 0 0 0 1px rgba(201,160,94,.32);border-radius:8px;padding:14px 16px">
        <div style="display:flex;align-items:baseline;gap:10px;margin-bottom:9px">
          <h5 style="margin:0;color:var(--warn)">\u4E0A\u4E00\u6279\u6D3E\u53D1\u90E8\u5206\u5931\u8D25</h5>
          <span style="font-size:12px;color:var(--dim)">\u6279\u6B21 b-20260723-1418 \xB7 \u63D0\u4EA4 29 \xB7 \u6210\u529F 24 \xB7 \u8DF3\u8FC7 3 \xB7 \u5931\u8D25 2</span>
          <button class="btn btn-ghost" style="margin-left:auto;font-size:12px" onClick="{{ d.retryAll }}">\u91CD\u65B0\u6D3E\u53D1\u5168\u90E8\u5931\u8D25</button>
        </div>
        <div style="border-radius:6px;overflow:hidden;background:var(--inset)">
          <table class="table" style="font-size:12.5px">
            <thead><tr><th style="width:96px">\u756A\u53F7</th><th>\u5931\u8D25\u539F\u56E0</th><th style="width:104px">\u5DE5\u5177</th><th style="width:120px">\u65F6\u95F4</th><th style="width:150px">\u64CD\u4F5C</th></tr></thead>
            <tbody>
              <sc-for list="{{ d.failed }}" as="f" hint-placeholder-count="2">
                <tr>
                  <td><span style="font:500 12px/1 var(--mono);color:var(--acc)">{{ f.code }}</span></td>
                  <td style="color:var(--dim)">{{ f.reason }}</td>
                  <td style="font-size:12px;color:var(--dim)">{{ f.tool }}</td>
                  <td style="font-family:var(--mono);font-size:11.5px;color:var(--dim2)">{{ f.time }}</td>
                  <td><div style="display:flex;gap:5px"><button class="btn btn-primary" style="font-size:11.5px;padding:3px 7px" disabled="{{ f.noRetry }}" onClick="{{ f.retry }}">\u6362\u78C1\u529B\u91CD\u6D3E</button><button class="btn btn-secondary" style="font-size:11.5px;padding:3px 7px" onClick="{{ f.skip }}">\u6807\u8BB0\u8DF3\u8FC7</button></div></td>
                </tr>
              </sc-for>
            </tbody>
          </table>
        </div>
      </div>

      <div style="background:var(--surf);border-radius:8px;box-shadow:0 0 0 1px var(--ring);overflow:hidden">
        <div style="display:flex;align-items:center;gap:12px;padding:11px 14px;box-shadow:inset 0 -1px 0 var(--line2)">
          <h5 style="margin:0">\u4E0B\u8F7D\u5386\u53F2</h5>
          <div class="seg" style="margin-left:4px">
            <label class="seg-opt" style="padding:5px 10px"><input type="radio" name="jj-hf" checked="{{ d.hf0 }}" onChange="{{ d.setHf0 }}"><span>\u5168\u90E8 128</span></label>
            <label class="seg-opt" style="padding:5px 10px"><input type="radio" name="jj-hf" checked="{{ d.hf1 }}" onChange="{{ d.setHf1 }}"><span>\u672A\u5165\u5E93 3</span></label>
            <label class="seg-opt" style="padding:5px 10px"><input type="radio" name="jj-hf" checked="{{ d.hf2 }}" onChange="{{ d.setHf2 }}"><span>\u5931\u8D25 2</span></label>
          </div>
          <span style="margin-left:auto;font-size:11.5px;color:var(--dim2)">{{ d.checkNote }}</span>
          <button class="btn btn-secondary" style="font-size:12px;padding:4px 9px" onClick="{{ d.clear }}">\u6E05\u7A7A\u5386\u53F2</button>
        </div>
        <table class="table">
          <thead><tr><th style="width:98px">\u756A\u53F7</th><th>\u6807\u9898 / \u8D44\u6E90\u540D</th><th style="width:104px">\u78C1\u529B\u6765\u6E90</th><th style="width:88px">\u5DE5\u5177</th><th style="width:132px">\u6D3E\u53D1\u65F6\u95F4</th><th style="width:92px">\u72B6\u6001</th><th style="width:112px">\u672C\u5730\u6838\u5BF9</th><th style="width:78px">\u64CD\u4F5C</th></tr></thead>
          <tbody>
            <sc-for list="{{ d.history }}" as="h" hint-placeholder-count="8">
              <tr>
                <td><span style="font:500 12px/1 var(--mono);color:var(--acc)">{{ h.code }}</span></td>
                <td><div style="font-size:13px;margin-bottom:2px">{{ h.title }}</div><div style="font:400 10.5px/1.3 var(--mono);color:var(--dim2);max-width:360px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">{{ h.res }}</div></td>
                <td style="font-size:12px;color:var(--dim)">{{ h.src }}</td>
                <td style="font-size:12px;color:var(--dim)">{{ h.tool }}</td>
                <td style="font-family:var(--mono);font-size:11.5px;color:var(--dim2)">{{ h.time }}</td>
                <td><span class="tag" style="background:{{ h.stBg }};color:{{ h.stFg }}">{{ h.status }}</span></td>
                <td><span style="font-size:11.5px;color:{{ h.localFg }}">{{ h.local }}</span></td>
                <td><button class="btn btn-ghost" style="font-size:11.5px;padding:2px 4px" onClick="{{ h.act }}">{{ h.actText }}</button></td>
              </tr>
            </sc-for>
          </tbody>
        </table>
      </div>
    </main>
  </div>
  </sc-if>

  <sc-if value="{{ at.transcode }}">
  <div style="display:flex;align-items:stretch;min-height:848px">
    <aside style="width:280px;flex:none;background:var(--surf2);box-shadow:inset -1px 0 0 var(--line2);padding:15px 14px 22px;display:flex;flex-direction:column;gap:13px;overflow:auto">
      <span style="font:600 10px/1 Inter,sans-serif;letter-spacing:.13em;text-transform:uppercase;color:var(--dim2)">\u8FD0\u884C\u73AF\u5883</span>
      <div style="display:flex;flex-direction:column;gap:8px">
        <sc-for list="{{ tc.caps }}" as="c" hint-placeholder-count="4">
          <div style="display:flex;align-items:baseline;gap:8px;font-size:12.5px">
            <span style="width:6px;height:6px;border-radius:50%;background:{{ c.dot }};flex:none;margin-top:6px"></span>
            <span style="color:var(--dim)">{{ c.label }}</span>
            <span style="margin-left:auto;font:400 11.5px/1.4 var(--mono);color:{{ c.fg }};text-align:right">{{ c.value }}</span>
          </div>
        </sc-for>
      </div>
      <div style="background:rgba(224,129,136,.07);box-shadow:inset 0 0 0 1px rgba(224,129,136,.3);border-radius:7px;padding:9px 11px;font-size:11.5px;line-height:1.5;color:var(--dim)">
        <b style="color:var(--bad);font-weight:500">AV1 \u4E0D\u53EF\u7528</b><br>av1_nvenc \u786C\u4EF6\u63A2\u9488\u5931\u8D25\uFF1A\u5F53\u524D\u9A71\u52A8 535.161 \u4E0D\u652F\u6301\u3002\u76F8\u5173\u9884\u8BBE\u5DF2\u7981\u7528\uFF0C\u4E0D\u4F1A\u56DE\u9000 CPU\u3002
      </div>
      <hr class="hr" style="margin:2px 0">
      <div style="display:flex;align-items:baseline"><span style="font:600 10px/1 Inter,sans-serif;letter-spacing:.13em;text-transform:uppercase;color:var(--dim2)">\u9884\u8BBE\u5305</span><span style="margin-left:auto;font-size:11px;color:var(--dim2)">\u5E76\u53D1\u4E0A\u9650 2</span></div>
      <sc-for list="{{ tc.presets }}" as="p" hint-placeholder-count="4">
        <div style="border-radius:7px;background:{{ p.bg }};box-shadow:inset 0 0 0 1px {{ p.ring }};padding:9px 11px;opacity:{{ p.op }}">
          <div style="display:flex;align-items:baseline;gap:7px;margin-bottom:3px"><span style="font:500 13px/1 Inter,sans-serif">{{ p.name }}</span><span class="tag" style="margin-left:auto;background:{{ p.tagBg }};color:{{ p.tagFg }};font-size:10px;padding:2px 6px">{{ p.tag }}</span></div>
          <div style="font-size:11.5px;color:var(--dim2);line-height:1.45">{{ p.desc }}</div>
          <div style="font:400 10.5px/1.4 var(--mono);color:{{ p.codecFg }};margin-top:4px">{{ p.codec }}</div>
        </div>
      </sc-for>
    </aside>

    <main style="flex:1;min-width:0;padding:14px 20px 26px;display:flex;flex-direction:column;gap:14px;overflow:auto">
      <div style="display:flex;align-items:flex-end;gap:14px">
        <div><h4 style="margin:0 0 2px">\u8F6C\u7801</h4><span style="font-size:12.5px;color:var(--dim)">\u4EC5\u5BF9\u5F71\u89C6\u5E93\u5DF2\u7D22\u5F15\u6587\u4EF6\u8F6C\u7801\uFF1B\u8F93\u51FA\u4F53\u79EF\u5FC5\u987B\u5C0F\u4E8E\u539F\u6587\u4EF6\u624D\u4F1A\u539F\u5B50\u66FF\u6362</span></div>
        <button class="btn btn-secondary" style="margin-left:auto" onClick="{{ tc.refresh }}">\u5237\u65B0</button>
        <button class="btn btn-secondary" onClick="{{ tc.clean }}">\u6E05\u7406\u5DF2\u5B8C\u6210\u8BB0\u5F55</button>
      </div>

      <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:12px">
        <sc-for list="{{ tc.stats }}" as="k" hint-placeholder-count="4">
          <div style="background:var(--surf);border-radius:8px;box-shadow:0 0 0 1px var(--ring);padding:11px 13px">
            <div style="font-size:11.5px;color:var(--dim2);margin-bottom:4px">{{ k.label }}</div>
            <div style="font:500 24px/1 Inter,sans-serif;color:{{ k.color }};font-variant-numeric:tabular-nums">{{ k.value }}</div>
            <div style="font-size:11px;color:var(--dim2);margin-top:4px">{{ k.note }}</div>
          </div>
        </sc-for>
      </div>

      <div style="background:var(--surf);border-radius:8px;box-shadow:0 0 0 1px var(--ring);overflow:hidden">
        <div style="display:flex;align-items:center;gap:12px;padding:11px 14px;box-shadow:inset 0 -1px 0 var(--line2)">
          <h5 style="margin:0">\u4EFB\u52A1\u961F\u5217</h5>
          <div class="seg">
            <label class="seg-opt" style="padding:5px 10px"><input type="radio" name="jj-tcf" checked="{{ tc.f0 }}" onChange="{{ tc.setF0 }}"><span>\u5168\u90E8 {{ tc.nAll }}</span></label>
            <label class="seg-opt" style="padding:5px 10px"><input type="radio" name="jj-tcf" checked="{{ tc.f1 }}" onChange="{{ tc.setF1 }}"><span>\u6D3B\u52A8 {{ tc.nActive }}</span></label>
            <label class="seg-opt" style="padding:5px 10px"><input type="radio" name="jj-tcf" checked="{{ tc.f2 }}" onChange="{{ tc.setF2 }}"><span>\u5B8C\u6210 {{ tc.nDone }}</span></label>
            <label class="seg-opt" style="padding:5px 10px"><input type="radio" name="jj-tcf" checked="{{ tc.f3 }}" onChange="{{ tc.setF3 }}"><span>\u5F02\u5E38 {{ tc.nBad }}</span></label>
          </div>
          <span style="margin-left:auto;font-size:11.5px;color:var(--dim2)">\u6BCF 2s \u8F6E\u8BE2 \xB7 \u6392\u961F\u4EFB\u52A1\u6309\u521B\u5EFA\u65F6\u95F4\u6267\u884C</span>
        </div>
        <table class="table">
          <thead><tr><th>\u5F71\u7247 / \u6587\u4EF6</th><th style="width:184px">\u9884\u8BBE / GPU</th><th style="width:124px">\u72B6\u6001</th><th style="width:206px">\u8FDB\u5EA6</th><th style="width:132px">\u5927\u5C0F</th><th style="width:158px">\u64CD\u4F5C</th></tr></thead>
          <tbody>
            <sc-for list="{{ tc.rows }}" as="t" hint-placeholder-count="6">
              <tr>
                <td><div style="display:flex;align-items:baseline;gap:7px;margin-bottom:3px"><span style="font:500 12px/1 var(--mono);color:var(--acc)">{{ t.code }}</span><span style="font-size:13px;max-width:230px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">{{ t.title }}</span></div><div style="font:400 10.5px/1.3 var(--mono);color:var(--dim2);max-width:330px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">{{ t.file }}</div></td>
                <td><div style="font-size:12.5px;margin-bottom:2px">{{ t.preset }}</div><div style="font:400 10.5px/1.3 var(--mono);color:var(--dim2)">{{ t.codec }}</div><span class="tag tag-accent" style="font-size:10px;padding:2px 5px;margin-top:3px">{{ t.gpu }}</span></td>
                <td><div style="display:inline-flex;align-items:center;gap:6px;font-size:12.5px;color:{{ t.stFg }}"><span style="width:6px;height:6px;border-radius:50%;background:{{ t.stFg }}"></span>{{ t.status }}</div><div style="font-size:11px;color:var(--dim2);margin-top:3px">{{ t.stage }}</div></td>
                <td><div style="height:4px;border-radius:2px;background:var(--t08);overflow:hidden;margin-bottom:5px"><div style="height:100%;width:{{ t.pct }}%;background:{{ t.stFg }}"></div></div><div style="font:400 10.5px/1.3 var(--mono);color:var(--dim2)">{{ t.progressMeta }}</div></td>
                <td style="font:400 11px/1.4 var(--mono);color:{{ t.sizeFg }}">{{ t.size }}</td>
                <td><div style="display:flex;gap:5px;flex-wrap:wrap">
                  <button class="btn btn-secondary" style="font-size:11.5px;padding:3px 7px" onClick="{{ t.detail }}">\u8BE6\u60C5</button>
                  <sc-if value="{{ t.canCancel }}"><button class="btn btn-primary" style="font-size:11.5px;padding:3px 7px;color:var(--bad);border-color:var(--bad)" onClick="{{ t.cancel }}">\u53D6\u6D88</button></sc-if>
                  <sc-if value="{{ t.canRetry }}"><button class="btn btn-primary" style="font-size:11.5px;padding:3px 7px" onClick="{{ t.retry }}">\u91CD\u8BD5</button></sc-if>
                  <sc-if value="{{ t.canDelete }}"><button class="btn btn-secondary" style="font-size:11.5px;padding:3px 7px" onClick="{{ t.del }}">\u5220\u9664</button></sc-if>
                </div></td>
              </tr>
            </sc-for>
          </tbody>
        </table>
      </div>
    </main>
  </div>
  </sc-if>

  <sc-if value="{{ tc.d }}">
    <div style="position:absolute;inset:0;background:var(--ovl6)" onClick="{{ tc.closeDetail }}"></div>
    <aside style="position:absolute;top:0;right:0;bottom:0;width:600px;background:var(--elev);box-shadow:-1px 0 0 var(--ring),-24px 0 60px rgba(0,0,0,.55);display:flex;flex-direction:column;animation:jjrise 180ms ease-out">
      <div style="display:flex;align-items:center;gap:12px;padding:14px 18px;box-shadow:inset 0 -1px 0 var(--line)">
        <h5 style="margin:0">\u8F6C\u7801\u4EFB\u52A1\u8BE6\u60C5</h5><span style="font:400 11.5px/1 var(--mono);color:var(--dim2)">{{ tc.d.id }}</span>
        <button class="btn btn-ghost" style="margin-left:auto" onClick="{{ tc.closeDetail }}">\u5173\u95ED</button>
      </div>
      <div style="flex:1;overflow:auto;padding:16px 18px 22px;display:flex;flex-direction:column;gap:14px">
        <div>
          <div style="display:flex;align-items:baseline;gap:8px;margin-bottom:6px"><span style="font-size:13px;color:{{ tc.d.stFg }}">{{ tc.d.status }} \xB7 {{ tc.d.stage }}</span><span style="margin-left:auto;font:400 12px/1 var(--mono)">{{ tc.d.pct }}%</span></div>
          <div style="height:5px;border-radius:3px;background:var(--t08);overflow:hidden"><div style="height:100%;width:{{ tc.d.pct }}%;background:{{ tc.d.stFg }}"></div></div>
        </div>
        <sc-if value="{{ tc.d.hasError }}">
          <div style="background:rgba(224,129,136,.07);box-shadow:inset 0 0 0 1px rgba(224,129,136,.32);border-radius:7px;padding:11px 13px">
            <div style="font-size:12.5px;color:var(--bad);margin-bottom:4px">\u4EFB\u52A1\u9519\u8BEF</div>
            <div style="font:400 11.5px/1.6 var(--mono);color:var(--dim);word-break:break-all">{{ tc.d.error }}</div>
          </div>
        </sc-if>
        <div style="display:grid;grid-template-columns:auto 1fr;gap:7px 14px;font-size:12.5px;align-content:start">
          <sc-for list="{{ tc.d.fields }}" as="f" hint-placeholder-count="10">
            <span style="color:var(--dim2)">{{ f.k }}</span><span style="font-family:{{ f.mono }};font-size:{{ f.fs }};word-break:break-all">{{ f.v }}</span>
          </sc-for>
        </div>
      </div>
      <div style="padding:12px 18px;box-shadow:inset 0 1px 0 var(--line);display:flex;gap:8px;justify-content:flex-end">
        <sc-if value="{{ tc.d.canRetry }}"><button class="btn btn-primary" onClick="{{ tc.d.retry }}">\u91CD\u8BD5\u4EFB\u52A1</button></sc-if>
        <sc-if value="{{ tc.d.canCancel }}"><button class="btn btn-primary" style="color:var(--bad);border-color:var(--bad)" onClick="{{ tc.d.cancel }}">\u53D6\u6D88\u4EFB\u52A1</button></sc-if>
        <button class="btn btn-secondary" onClick="{{ tc.d.copy }}">\u590D\u5236 ffmpeg \u547D\u4EE4</button>
      </div>
    </aside>
  </sc-if>

  <sc-if value="{{ at.scrape }}">
  <div style="display:flex;align-items:stretch;min-height:848px">
    <aside style="width:296px;flex:none;background:var(--surf2);box-shadow:inset -1px 0 0 var(--line2);padding:15px 14px 22px;display:flex;flex-direction:column;gap:13px;overflow:auto">
      <div style="display:flex;align-items:baseline"><span style="font:600 10px/1 Inter,sans-serif;letter-spacing:.13em;text-transform:uppercase;color:var(--dim2)">\u4EFB\u52A1\u6A21\u677F</span><button class="btn btn-ghost" style="margin-left:auto;font-size:11px;padding:2px 4px" onClick="{{ sc.saveTpl }}">\u53E6\u5B58\u4E3A</button></div>
      <sc-for list="{{ sc.templates }}" as="t" hint-placeholder-count="3">
        <div style="border-radius:7px;background:{{ t.bg }};box-shadow:inset 0 0 0 1px {{ t.ring }};padding:9px 11px">
          <div style="display:flex;align-items:baseline;gap:7px">
            <span onClick="{{ t.pick }}" style="cursor:pointer;font:500 13px/1 Inter,sans-serif">{{ t.name }}</span>
            <span style="margin-left:auto;font:400 10.5px/1 var(--mono);color:var(--dim2)">{{ t.used }}</span>
            <button class="btn btn-ghost" style="padding:0 3px;color:var(--bad)" title="\u5220\u9664\u8BE5\u6A21\u677F" onClick="{{ t.remove }}"><i class="ph ph-trash" style="font-size:13px"></i></button>
          </div>
          <div onClick="{{ t.pick }}" style="cursor:pointer;font:400 10.5px/1.45 var(--mono);color:var(--dim2);margin-top:4px;word-break:break-all">{{ t.path }}</div>
        </div>
      </sc-for>
      <hr class="hr" style="margin:2px 0">
      <div class="field"><label>\u626B\u63CF\u76EE\u5F55</label><input class="input" style="font-family:var(--mono);font-size:12px" value="{{ sc.scanDir }}" onChange="{{ sc.setScanDir }}"></div>
      <div class="field"><label>\u6574\u7406\u8F93\u51FA\u76EE\u5F55</label><input class="input" style="font-family:var(--mono);font-size:12px" value="{{ sc.outDir }}" onChange="{{ sc.setOutDir }}"></div>
      <div class="field"><label>\u6587\u4EF6\u5939\u547D\u540D\u89C4\u5219</label><input class="input" style="font-family:var(--mono);font-size:12px" value="{{ sc.folderRule }}" onChange="{{ sc.setFolderRule }}"><span style="font-size:10.5px;color:var(--dim2);margin-top:3px;display:block">\u53EF\u7528\u53D8\u91CF {code} {title} {actors} {studio} {label} {series} {year} {date}</span></div>
      <div class="field"><label>\u6587\u4EF6\u547D\u540D\u89C4\u5219<button class="btn btn-ghost" style="font-size:11px;padding:0 3px;margin-left:6px" onClick="{{ sc.openDesigner }}">\u8BBE\u8BA1\u5668</button></label><input class="input" style="font-family:var(--mono);font-size:12px" value="{{ sc.fileRule }}" onChange="{{ sc.setFileRule }}"><span style="font-size:10.5px;color:var(--dim2);margin-top:3px;display:block">\u591A\u5206\u6BB5\u5F71\u7247\u81EA\u52A8\u8FFD\u52A0 -CD1 / -CD2 \u540E\u7F00</span></div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:9px">
        <div class="field"><label>\u6700\u5927\u9012\u5F52\u6DF1\u5EA6</label><input class="input" style="font-family:var(--mono);font-size:12px" placeholder="\u4E0D\u9650" value="{{ sc.maxDepth }}" onChange="{{ sc.setMaxDepth }}"></div>
        <div class="field"><label>\u5E76\u53D1\u6570</label><input class="input" style="font-family:var(--mono);font-size:12px" value="{{ sc.concurrent }}" onChange="{{ sc.setConcurrent }}"></div>
      </div>
      <hr class="hr" style="margin:2px 0">
      <span style="font:600 10px/1 Inter,sans-serif;letter-spacing:.13em;text-transform:uppercase;color:var(--dim2)">\u522E\u524A\u9009\u9879</span>
      <sc-for list="{{ sc.opts }}" as="o" hint-placeholder-count="7">
        <label style="display:flex;align-items:flex-start;gap:8px;font-size:13px;color:{{ o.fg }};cursor:{{ o.cursor }}"><input type="checkbox" style="accent-color:var(--acc);width:14px;height:14px;margin-top:2px" checked="{{ o.on }}" disabled="{{ o.disabled }}" onChange="{{ o.toggle }}"><span>{{ o.label }}<span style="display:block;font-size:10.5px;color:var(--dim2);line-height:1.4">{{ o.hint }}</span></span></label>
      </sc-for>
      <button class="btn btn-primary btn-block" style="margin-top:4px" onClick="{{ sc.preview }}">\u751F\u6210\u9884\u89C8</button>
      <p style="margin:0;font-size:11px;color:var(--dim2);line-height:1.5">\u9884\u89C8\u9636\u6BB5\u4E0D\u4F1A\u79FB\u52A8\u4EFB\u4F55\u6587\u4EF6\u3002\u786E\u8BA4\u6267\u884C\u540E\u6309\u6279\u6B21\u5199\u5165\uFF0C\u53EF\u5728\u540E\u53F0\u4EFB\u52A1\u4E2D\u67E5\u770B\u8FDB\u5EA6\u3002</p>
    </aside>

    <main style="flex:1;min-width:0;padding:14px 20px 26px;display:flex;flex-direction:column;gap:13px;overflow:auto">
      <div style="display:flex;align-items:flex-end;gap:14px">
        <div><h4 style="margin:0 0 2px">\u672C\u5730\u522E\u524A</h4><span style="font-size:12.5px;color:var(--dim)">{{ sc.subtitle }}</span></div>
        <sc-if value="{{ sc.hasPreview }}"><button class="btn btn-secondary" style="margin-left:auto" onClick="{{ sc.reset }}">\u4E22\u5F03\u9884\u89C8</button></sc-if>
      </div>

      <sc-if value="{{ sc.idle }}">
        <div style="padding:96px 0;text-align:center">
          <div style="width:44px;height:44px;margin:0 auto 14px;border-radius:10px;box-shadow:inset 0 0 0 1px var(--line)"></div>
          <h5 style="margin:0 0 6px">\u5C1A\u672A\u751F\u6210\u9884\u89C8</h5>
          <p style="margin:0 auto;max-width:420px;font-size:13px;color:var(--dim)">\u9009\u62E9\u6A21\u677F\u5E76\u786E\u8BA4\u626B\u63CF\u76EE\u5F55\u540E\u70B9\u51FB\u300C\u751F\u6210\u9884\u89C8\u300D\u3002\u7CFB\u7EDF\u4F1A\u9012\u5F52\u8BC6\u522B\u756A\u53F7\u3001\u8054\u7F51\u83B7\u53D6\u5143\u6570\u636E\uFF0C\u5E76\u7ED9\u51FA\u76EE\u6807\u8DEF\u5F84\u4E0E\u51B2\u7A81\u6E05\u5355\uFF0C\u786E\u8BA4\u65E0\u8BEF\u518D\u6267\u884C\u3002</p>
        </div>
      </sc-if>

      <sc-if value="{{ sc.scanning }}">
        <div style="background:var(--surf);border-radius:8px;box-shadow:0 0 0 1px var(--ring);padding:18px 20px">
          <div style="display:flex;align-items:baseline;gap:10px;margin-bottom:10px"><h5 style="margin:0">\u6B63\u5728\u751F\u6210\u9884\u89C8</h5><span style="margin-left:auto;font:400 12px/1 var(--mono);color:var(--dim)">{{ sc.scanPct }}%</span></div>
          <div style="height:4px;border-radius:2px;background:var(--t08);overflow:hidden;margin-bottom:12px"><div style="height:100%;width:{{ sc.scanPct }}%;background:var(--acc)"></div></div>
          <div style="font:400 11.5px/1.9 var(--mono);color:var(--dim)">
            <sc-for list="{{ sc.scanLog }}" as="l" hint-placeholder-count="4"><div style="color:{{ l.fg }}">{{ l.t }}</div></sc-for>
          </div>
        </div>
      </sc-if>

      <sc-if value="{{ sc.hasPreview }}">
        <div style="display:grid;grid-template-columns:repeat(5,1fr);gap:11px">
          <sc-for list="{{ sc.stats }}" as="k" hint-placeholder-count="5">
            <div style="background:var(--surf);border-radius:8px;box-shadow:0 0 0 1px var(--ring);padding:10px 12px">
              <div style="font-size:11.5px;color:var(--dim2);margin-bottom:3px">{{ k.label }}</div>
              <div style="font:500 22px/1 Inter,sans-serif;color:{{ k.color }};font-variant-numeric:tabular-nums">{{ k.value }}</div>
            </div>
          </sc-for>
        </div>

        <div style="background:rgba(201,160,94,.06);box-shadow:inset 0 0 0 1px rgba(201,160,94,.32);border-radius:8px;padding:13px 15px;display:flex;align-items:center;gap:14px;flex-wrap:wrap">
          <div><h6 style="margin:0 0 2px;color:var(--warn)">3 \u4E2A\u6587\u4EF6\u51B2\u7A81\u9700\u8981\u5904\u7406</h6><span style="font-size:12px;color:var(--dim)">\u76EE\u6807\u8DEF\u5F84\u5DF2\u5B58\u5728\u540C\u540D\u6587\u4EF6\u3002\u6279\u91CF\u7B56\u7565\u5C06\u5957\u7528\u5230\u5168\u90E8\u51B2\u7A81\u9879\uFF0C\u4E5F\u53EF\u9010\u6761\u8986\u76D6\u3002</span></div>
          <div style="margin-left:auto;display:flex;align-items:center;gap:8px">
            <span style="font-size:11.5px;color:var(--dim2)">\u6279\u91CF\u7B56\u7565</span>
            <select class="input" style="width:auto;min-height:32px;font-size:12.5px" value="{{ sc.strategy }}" onChange="{{ sc.setStrategy }}">
              <option>auto_best \xB7 \u81EA\u52A8\u62E9\u4F18</option><option>skip \xB7 \u8DF3\u8FC7\u51B2\u7A81\u6587\u4EF6</option><option>keep_source \xB7 \u4FDD\u7559\u6E90\u6587\u4EF6</option><option>keep_target \xB7 \u4FDD\u7559\u76EE\u6807\u6587\u4EF6</option><option>keep_larger \xB7 \u4F53\u79EF\u66F4\u5927</option><option>keep_higher_resolution \xB7 \u5206\u8FA8\u7387\u66F4\u9AD8</option><option>keep_higher_bitrate \xB7 \u7801\u7387\u66F4\u9AD8</option><option>keep_newer \xB7 \u4FEE\u6539\u65F6\u95F4\u66F4\u65B0</option><option>keep_older \xB7 \u4FEE\u6539\u65F6\u95F4\u66F4\u65E7</option>
            </select>
            <button class="btn btn-secondary" style="font-size:12px" onClick="{{ sc.applyStrategy }}">\u5957\u7528\u5230\u5168\u90E8</button>
          </div>
        </div>

        <div style="background:var(--surf);border-radius:8px;box-shadow:0 0 0 1px var(--ring);overflow:hidden">
          <div style="display:flex;align-items:center;gap:12px;padding:11px 14px;box-shadow:inset 0 -1px 0 var(--line2)">
            <h5 style="margin:0">\u8BC6\u522B\u7ED3\u679C</h5>
            <div class="seg">
              <label class="seg-opt" style="padding:5px 10px"><input type="radio" name="jj-scf" checked="{{ sc.f0 }}" onChange="{{ sc.setF0 }}"><span>\u5168\u90E8 {{ sc.nAll }}</span></label>
              <label class="seg-opt" style="padding:5px 10px"><input type="radio" name="jj-scf" checked="{{ sc.f1 }}" onChange="{{ sc.setF1 }}"><span>\u51B2\u7A81 {{ sc.nConf }}</span></label>
              <label class="seg-opt" style="padding:5px 10px"><input type="radio" name="jj-scf" checked="{{ sc.f2 }}" onChange="{{ sc.setF2 }}"><span>\u5F02\u5E38 {{ sc.nErr }}</span></label>
            </div>
            <span style="margin-left:auto;font-size:11.5px;color:var(--dim2)">\u5DF2\u9009 {{ sc.selCount }} \u9879\u5C06\u6267\u884C</span>
          </div>
          <table class="table">
            <thead><tr><th style="width:34px"><input type="checkbox" style="accent-color:var(--acc);width:14px;height:14px" checked="{{ sc.allSel }}" onChange="{{ sc.toggleAll }}"></th><th>\u6E90\u6587\u4EF6</th><th style="width:96px">\u8BC6\u522B\u756A\u53F7</th><th>\u76EE\u6807\u8DEF\u5F84</th><th style="width:132px">\u72B6\u6001</th><th style="width:150px">\u5904\u7406</th></tr></thead>
            <tbody>
              <sc-for list="{{ sc.rows }}" as="r" hint-placeholder-count="8">
                <tr>
                  <td><input type="checkbox" style="accent-color:var(--acc);width:14px;height:14px" checked="{{ r.sel }}" disabled="{{ r.selDisabled }}" onChange="{{ r.toggle }}"></td>
                  <td><div style="font:400 11.5px/1.4 var(--mono);color:{{ r.srcFg }};max-width:300px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">{{ r.src }}</div><div style="font-size:10.5px;color:var(--dim2);margin-top:2px">{{ r.srcMeta }}</div></td>
                  <td><span style="font:500 12px/1 var(--mono);color:{{ r.codeFg }}">{{ r.code }}</span></td>
                  <td><div style="font:400 11.5px/1.4 var(--mono);color:{{ r.dstFg }};max-width:330px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">{{ r.dst }}</div><div style="font-size:10.5px;color:var(--dim2);margin-top:2px">{{ r.dstMeta }}</div></td>
                  <td><span style="display:inline-flex;align-items:center;gap:5px;font-size:12px;color:{{ r.stFg }}"><span style="width:5px;height:5px;border-radius:50%;background:{{ r.stFg }}"></span>{{ r.status }}</span><div style="font-size:10.5px;color:var(--dim2);margin-top:2px">{{ r.note }}</div></td>
                  <td><div style="display:flex;gap:5px;flex-wrap:wrap">
                    <sc-if value="{{ r.isConflict }}"><button class="btn btn-primary" style="font-size:11.5px;padding:3px 7px" onClick="{{ r.compare }}">\u5BF9\u6BD4\u6E90\u6587\u4EF6</button></sc-if>
                    <sc-if value="{{ r.isError }}"><button class="btn btn-primary" style="font-size:11.5px;padding:3px 7px" onClick="{{ r.fix }}">\u624B\u52A8\u6307\u5B9A\u756A\u53F7</button><button class="btn btn-secondary" style="font-size:11.5px;padding:3px 7px" onClick="{{ r.inspect }}">\u5F02\u5E38\u8BE6\u60C5</button></sc-if>
                    <sc-if value="{{ r.isOk }}"><span style="font-size:11.5px;color:var(--dim2)">{{ r.action }}</span></sc-if>
                  </div></td>
                </tr>
              </sc-for>
            </tbody>
          </table>
        </div>

        <div style="display:flex;align-items:center;gap:12px;background:var(--surf);border-radius:8px;box-shadow:0 0 0 1px var(--ring);padding:12px 15px">
          <span style="font-size:12.5px;color:var(--dim)">{{ sc.execNote }}</span>
          <button class="btn btn-secondary" onClick="{{ sc.dryRun }}">\u4EC5\u5199\u5165 NFO \u4E0E\u56FE\u7247</button>
          <button class="btn btn-primary" onClick="{{ sc.execute }}">\u786E\u8BA4\u6267\u884C {{ sc.selCount }} \u9879</button>
        </div>
      </sc-if>
    </main>
  </div>
  </sc-if>

  <sc-if value="{{ sc.designer }}">
    <div class="dialog-backdrop" style="position:absolute;background:var(--ovl)">
      <div class="dialog elev-lg" style="width:620px;animation:jjrise 160ms ease-out">
        <div class="dialog-title">\u547D\u540D\u89C4\u5219\u8BBE\u8BA1\u5668</div>
        <div class="dialog-body" style="margin-bottom:2px">\u70B9\u53D8\u91CF\u5361\u7247\u52A0\u5165\u89C4\u5219\uFF0C\u53F3\u4FA7\u5B9E\u65F6\u9884\u89C8\u4E00\u6761\u771F\u5B9E\u6587\u4EF6\u540D\u3002</div>
        <div style="display:flex;gap:7px;flex-wrap:wrap;min-height:34px;border-radius:7px;background:var(--surf2);box-shadow:inset 0 0 0 1px var(--line2);padding:9px 11px">
          <sc-for list="{{ sc.designer.parts }}" as="p" hint-placeholder-count="2">
            <span style="display:inline-flex;align-items:center;gap:6px;padding:4px 6px 4px 9px;border-radius:5px;background:rgba(145,132,217,.14);box-shadow:inset 0 0 0 1px rgba(145,132,217,.32);font:400 11.5px/1 var(--mono);color:var(--accs)">{{ p.t }}<button onClick="{{ p.remove }}" aria-label="\u79FB\u9664\u5361\u7247" style="appearance:none;background:none;border:0;color:inherit;opacity:.6;cursor:pointer;font-size:12px;line-height:1;padding:0 1px">\xD7</button></span>
          </sc-for>
          <sc-if value="{{ sc.designer.empty }}"><span style="font-size:12px;color:var(--dim2);line-height:20px">\u8FD8\u6CA1\u6709\u5361\u7247\uFF0C\u70B9\u4E0B\u65B9\u53D8\u91CF\u5F00\u59CB\u62FC\u88C5</span></sc-if>
        </div>
        <div style="display:flex;gap:6px;flex-wrap:wrap">
          <sc-for list="{{ sc.designer.vars }}" as="v" hint-placeholder-count="6">
            <button class="btn btn-secondary" style="font-size:11.5px;padding:4px 9px;font-family:var(--mono)" onClick="{{ v.add }}">{{ v.t }}</button>
          </sc-for>
        </div>
        <div style="border-radius:7px;background:var(--surf2);box-shadow:inset 0 0 0 1px var(--line2);padding:10px 12px">
          <div style="font-size:11px;color:var(--dim2);margin-bottom:5px">\u9884\u89C8</div>
          <div style="font:400 12px/1.5 var(--mono);color:var(--dim);word-break:break-all">{{ sc.designer.preview }}</div>
        </div>
        <div class="dialog-actions">
          <button class="btn btn-ghost" onClick="{{ sc.designer.reset }}">\u91CD\u7F6E</button>
          <button class="btn btn-secondary" onClick="{{ sc.closeDesigner }}">\u53D6\u6D88</button>
          <button class="btn btn-primary" onClick="{{ sc.designer.apply }}">\u5E94\u7528</button>
        </div>
      </div>
    </div>
  </sc-if>

  <sc-if value="{{ sc.inspect }}">
    <div class="dialog-backdrop" style="position:absolute;background:var(--ovl)">
      <div class="dialog elev-lg" style="width:560px;animation:jjrise 160ms ease-out">
        <div class="dialog-title">\u522E\u524A\u5F02\u5E38\u8BE6\u60C5</div>
        <div style="display:grid;grid-template-columns:auto 1fr;gap:6px 12px;font-size:12.5px">
          <sc-for list="{{ sc.inspect.fields }}" as="f" hint-placeholder-count="4"><span style="color:var(--dim2)">{{ f.k }}</span><span style="font-family:var(--mono);font-size:11.5px;word-break:break-all;color:{{ f.fg }}">{{ f.v }}</span></sc-for>
        </div>
        <div style="border-radius:7px;background:var(--surf2);box-shadow:inset 0 0 0 1px var(--line2);padding:10px 12px;font:400 11.5px/1.7 var(--mono);color:var(--dim);max-height:150px;overflow:auto">
          <sc-for list="{{ sc.inspect.log }}" as="l" hint-placeholder-count="3"><div style="color:{{ l.fg }}">{{ l.t }}</div></sc-for>
        </div>
        <div class="dialog-actions">
          <button class="btn btn-secondary" onClick="{{ sc.closeInspect }}">\u5173\u95ED</button>
          <button class="btn btn-primary" onClick="{{ sc.inspect.fix }}">\u624B\u52A8\u6307\u5B9A\u756A\u53F7</button>
        </div>
      </div>
    </div>
  </sc-if>

  <sc-if value="{{ sc.cmp }}">
    <div class="dialog-backdrop" style="position:absolute;background:var(--ovl)">
      <div class="dialog elev-lg" style="width:720px;animation:jjrise 160ms ease-out">
        <div class="dialog-title">\u6E90\u6587\u4EF6\u5BF9\u6BD4 \xB7 {{ sc.cmp.code }}</div>
        <div class="dialog-body" style="margin-bottom:2px">\u76EE\u6807\u8DEF\u5F84\u5DF2\u5B58\u5728\u540C\u540D\u6587\u4EF6\u3002\u9009\u62E9\u4FDD\u7559\u54EA\u4E00\u4E2A\uFF1B\u53E6\u4E00\u4E2A\u6309\u7B56\u7565\u5904\u7406\u3002</div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
          <sc-for list="{{ sc.cmp.sides }}" as="s" hint-placeholder-count="2">
            <div style="border-radius:8px;background:{{ s.bg }};box-shadow:inset 0 0 0 1px {{ s.ring }};padding:12px 13px">
              <div style="display:flex;align-items:baseline;gap:8px;margin-bottom:8px"><span style="font:500 12.5px/1 Inter,sans-serif;color:{{ s.titleFg }}">{{ s.title }}</span><sc-if value="{{ s.better }}"><span class="tag tag-accent" style="font-size:10px;padding:2px 5px;margin-left:auto">\u5EFA\u8BAE\u4FDD\u7559</span></sc-if></div>
              <div style="display:grid;grid-template-columns:auto 1fr;gap:5px 10px;font-size:12px">
                <sc-for list="{{ s.fields }}" as="f" hint-placeholder-count="6"><span style="color:var(--dim2)">{{ f.k }}</span><span style="font-family:var(--mono);font-size:11.5px;word-break:break-all;color:{{ f.fg }}">{{ f.v }}</span></sc-for>
              </div>
              <button class="btn btn-primary btn-block" style="margin-top:11px;font-size:12px" onClick="{{ s.keep }}">\u4FDD\u7559\u6B64\u6587\u4EF6</button>
            </div>
          </sc-for>
        </div>
        <div class="dialog-actions"><button class="btn btn-secondary" onClick="{{ sc.closeCmp }}">\u7A0D\u540E\u51B3\u5B9A</button><button class="btn btn-secondary" onClick="{{ sc.cmp.skip }}">\u8DF3\u8FC7\u8BE5\u6587\u4EF6</button></div>
      </div>
    </div>
  </sc-if>

  <sc-if value="{{ at.library }}">
  <div style="display:flex;align-items:stretch;min-height:848px">
    <aside style="width:250px;flex:none;background:var(--surf2);box-shadow:inset -1px 0 0 var(--line2);padding:15px 14px 22px;display:flex;flex-direction:column;gap:13px;overflow:auto">
      <div style="display:flex;align-items:baseline"><span style="font:600 10px/1 Inter,sans-serif;letter-spacing:.13em;text-transform:uppercase;color:var(--dim2)">\u7B5B\u9009</span><button class="btn btn-ghost" style="margin-left:auto;font-size:11px;padding:2px 4px" onClick="{{ lb.reset }}">\u91CD\u7F6E</button></div>
      <div class="field"><label>\u641C\u7D22</label>
        <div style="display:flex;gap:6px">
          <input class="input" style="flex:1" placeholder="\u756A\u53F7 / \u6807\u9898 / \u6F14\u5458" value="{{ lb.q }}" onChange="{{ lb.setQ }}">
          <button class="btn btn-secondary" style="flex:none;padding:6px 8px" title="\u6267\u884C\u641C\u7D22" onClick="{{ lb.runSearch }}"><i class="ph ph-magnifying-glass" style="font-size:14px"></i></button>
          <sc-if value="{{ lb.hasQ }}"><button class="btn btn-ghost" style="flex:none;padding:6px 7px" title="\u6E05\u7A7A\u5173\u952E\u8BCD" onClick="{{ lb.clearQ }}"><i class="ph ph-x" style="font-size:14px"></i></button></sc-if>
        </div>
      </div>
      <div class="field"><label>\u6F14\u5458</label><select class="input" value="{{ lb.actor }}" onChange="{{ lb.setActor }}"><option>\u5168\u90E8\u6F14\u5458</option><option>\u661F\u91CE \u672A\u6765</option><option>\u6850\u8C37 \u306A\u304E</option><option>\u4E09\u4E0A \u3072\u306A\u306E</option><option>\u6A58 \u3055\u3084\u304B</option><option>\u767D\u77F3 \u308B\u3044</option></select></div>
      <div class="field"><label>\u5236\u4F5C\u5546</label><select class="input" value="{{ lb.studio }}" onChange="{{ lb.setStudio }}"><option>\u5168\u90E8\u5236\u4F5C\u5546</option><option>Mizuho Pictures</option><option>Sakura Line</option><option>Kanade Works</option></select></div>
      <div class="field"><label>\u5206\u8FA8\u7387</label><select class="input" value="{{ lb.res }}" onChange="{{ lb.setRes }}"><option>\u5168\u90E8\u5206\u8FA8\u7387</option><option>2160p</option><option>1080p</option><option>720p \u53CA\u4EE5\u4E0B</option></select></div>
      <div class="field"><label>\u8D44\u6599\u5B8C\u6574\u5EA6</label>
        <div class="seg" style="width:100%">
          <label class="seg-opt" style="flex:1;justify-content:center"><input type="radio" name="jj-lbm" checked="{{ lb.m0 }}" onChange="{{ lb.setM0 }}"><span>\u4E0D\u9650</span></label>
          <label class="seg-opt" style="flex:1;justify-content:center"><input type="radio" name="jj-lbm" checked="{{ lb.m1 }}" onChange="{{ lb.setM1 }}"><span>\u5B8C\u6574</span></label>
          <label class="seg-opt" style="flex:1;justify-content:center"><input type="radio" name="jj-lbm" checked="{{ lb.m2 }}" onChange="{{ lb.setM2 }}"><span>\u7F3A\u8D44\u6599</span></label>
        </div>
      </div>
      <label style="display:flex;align-items:center;gap:8px;font-size:13px;color:var(--dim);cursor:pointer"><input type="checkbox" style="accent-color:var(--acc);width:14px;height:14px" checked="{{ lb.subOnly }}" onChange="{{ lb.toggleSub }}">\u4EC5\u542B\u4E2D\u6587\u5B57\u5E55\u6587\u4EF6</label>
      <label style="display:flex;align-items:center;gap:8px;font-size:13px;color:var(--dim);cursor:pointer"><input type="checkbox" style="accent-color:var(--acc);width:14px;height:14px" checked="{{ lb.missing }}" onChange="{{ lb.toggleMissing }}">\u4EC5\u6587\u4EF6\u7F3A\u5931\u8BB0\u5F55</label>
      <hr class="hr" style="margin:2px 0">
      <span style="font:600 10px/1 Inter,sans-serif;letter-spacing:.13em;text-transform:uppercase;color:var(--dim2)">\u5A92\u4F53\u5E93\u8DEF\u5F84</span>
      <sc-for list="{{ lb.paths }}" as="p" hint-placeholder-count="3">
        <div style="border-radius:6px;background:var(--t03);box-shadow:inset 0 0 0 1px var(--line2);padding:8px 10px">
          <div style="font:400 11px/1.4 var(--mono);word-break:break-all;color:{{ p.fg }}">{{ p.path }}</div>
          <div style="display:flex;align-items:baseline;gap:6px;margin-top:4px"><span style="font-size:10.5px;color:{{ p.stFg }}">{{ p.status }}</span><button class="btn btn-ghost" style="margin-left:auto;font-size:10.5px;padding:0 3px" onClick="{{ p.scan }}">\u626B\u63CF</button></div>
        </div>
      </sc-for>
      <button class="btn btn-secondary btn-block" style="font-size:12.5px" onClick="{{ lb.openPaths }}">\u8DEF\u5F84\u914D\u7F6E</button>
    </aside>

    <main style="flex:1;min-width:0;padding:14px 20px 26px;display:flex;flex-direction:column;gap:13px;overflow:auto">
      <div style="display:flex;align-items:flex-end;gap:14px;flex-wrap:wrap">
        <div><h4 style="margin:0 0 2px">\u5F71\u89C6\u5E93</h4><span style="font-size:12.5px;color:var(--dim)">\u6700\u8FD1\u626B\u63CF 07-23 09:12 \xB7 \u7D22\u5F15\u6765\u6E90 library.db</span></div>
        <div style="margin-left:auto;display:flex;align-items:center;gap:9px">
          <select class="input" style="width:auto;min-height:32px;font-size:13px" value="{{ lb.sort }}" onChange="{{ lb.setSort }}"><option>\u5165\u5E93\u65F6\u95F4 \u2193</option><option>\u53D1\u884C\u65E5\u671F \u2193</option><option>\u6587\u4EF6\u4F53\u79EF \u2193</option><option>\u756A\u53F7 A\u2192Z</option></select>
          <div class="seg">
            <label class="seg-opt" style="padding:6px 10px"><input type="radio" name="jj-lbv" checked="{{ lb.vList }}" onChange="{{ lb.setVList }}"><span>\u5217\u8868</span></label>
            <label class="seg-opt" style="padding:6px 10px"><input type="radio" name="jj-lbv" checked="{{ lb.vPoster }}" onChange="{{ lb.setVPoster }}"><span>\u6D77\u62A5</span></label>
            <label class="seg-opt" style="padding:6px 10px"><input type="radio" name="jj-lbv" checked="{{ lb.vActor }}" onChange="{{ lb.setVActor }}"><span>\u6F14\u5458</span></label>
          </div>
          <button class="btn btn-secondary" onClick="{{ lb.openCheck }}">\u8D44\u6599\u68C0\u67E5</button>
          <button class="btn btn-secondary" onClick="{{ lb.clean }}">\u6E05\u6D17\u65E0\u6548\u6587\u4EF6</button>
          <button class="btn btn-primary" onClick="{{ lb.scanAll }}">\u626B\u63CF\u5165\u5E93</button>
          <button class="btn btn-ghost" style="color:var(--bad)" onClick="{{ lb.purgeDb }}">\u6E05\u7A7A\u6570\u636E\u5E93</button>
        </div>
      </div>

      <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:12px">
        <sc-for list="{{ lb.stats }}" as="k" hint-placeholder-count="4">
          <div style="background:var(--surf);border-radius:8px;box-shadow:0 0 0 1px var(--ring);padding:11px 13px">
            <div style="font-size:11.5px;color:var(--dim2);margin-bottom:4px">{{ k.label }}</div>
            <div style="font:500 24px/1 Inter,sans-serif;color:{{ k.color }};font-variant-numeric:tabular-nums">{{ k.value }}</div>
            <div style="font-size:11px;color:var(--dim2);margin-top:4px">{{ k.note }}</div>
          </div>
        </sc-for>
      </div>

      <sc-if value="{{ lb.scanning }}">
        <div style="background:rgba(145,132,217,.07);box-shadow:inset 0 0 0 1px rgba(145,132,217,.32);border-radius:8px;padding:12px 15px;display:flex;align-items:center;gap:13px">
          <span style="width:13px;height:13px;border-radius:50%;border:1.5px solid var(--acc);border-top-color:transparent;animation:jjspin 900ms linear infinite;flex:none"></span>
          <div style="flex:1"><div style="font-size:12.5px;margin-bottom:5px">\u6B63\u5728\u626B\u63CF /media/JAV-2 \xB7 1,204 / 1,366 \u6587\u4EF6 \xB7 ffprobe \u8BFB\u53D6\u5A92\u4F53\u53C2\u6570</div><div style="height:3px;border-radius:2px;background:var(--t08);overflow:hidden"><div style="height:100%;width:88%;background:var(--acc)"></div></div></div>
          <button class="btn btn-secondary" style="font-size:12px" onClick="{{ lb.stopScan }}">\u505C\u6B62</button>
        </div>
      </sc-if>

      <sc-if value="{{ lb.showList }}">
        <div style="background:var(--surf);border-radius:8px;box-shadow:0 0 0 1px var(--ring);overflow:hidden">
          <table class="table">
            <thead><tr><th style="width:82px">\u5C01\u9762</th><th style="width:98px">\u756A\u53F7</th><th>\u6807\u9898</th><th style="width:140px">\u6F14\u5458</th><th style="width:150px">\u5A92\u4F53\u53C2\u6570</th><th style="width:96px">\u6587\u4EF6</th><th style="width:120px">\u8D44\u6599\u5B8C\u6574\u5EA6</th><th style="width:96px">\u64CD\u4F5C</th></tr></thead>
            <tbody>
              <sc-for list="{{ lb.rows }}" as="r" hint-placeholder-count="8">
                <tr>
                  <td><div style="width:70px;aspect-ratio:3/2;border-radius:4px;background:linear-gradient(142deg,var(--ph1),var(--ph2));display:grid;place-items:center;font:500 9px/1 var(--mono);color:var(--t32)">{{ r.code }}</div></td>
                  <td><span style="font:500 12px/1 var(--mono);color:var(--acc)">{{ r.code }}</span></td>
                  <td><div style="font-size:13px;max-width:280px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">{{ r.title }}</div><div style="font-size:10.5px;color:var(--dim2);margin-top:2px">{{ r.meta }}</div></td>
                  <td style="font-size:12.5px;color:var(--dim)">{{ r.actorText }}</td>
                  <td style="font:400 11px/1.4 var(--mono);color:var(--dim)">{{ r.mediaText }}</td>
                  <td><div style="font:400 11px/1.3 var(--mono);color:{{ r.fileFg }}">{{ r.fileText }}</div><div style="font-size:10.5px;color:var(--dim2)">{{ r.sizeText }}</div></td>
                  <td><div style="display:flex;align-items:center;gap:7px"><div style="flex:1;height:4px;border-radius:2px;background:var(--t08);overflow:hidden"><div style="height:100%;width:{{ r.completeness }}%;background:{{ r.cFg }}"></div></div><span style="font:400 11px/1 var(--mono);color:{{ r.cFg }}">{{ r.completeness }}%</span></div><div style="font-size:10.5px;color:var(--dim2);margin-top:3px">{{ r.cNote }}</div></td>
                  <td><button class="btn btn-secondary" style="font-size:11.5px;padding:3px 7px" onClick="{{ r.open }}">\u8BE6\u60C5</button></td>
                </tr>
              </sc-for>
            </tbody>
          </table>
        </div>
      </sc-if>

      <sc-if value="{{ lb.showPoster }}">
        <div style="display:grid;grid-template-columns:repeat(6,1fr);gap:13px">
          <sc-for list="{{ lb.rows }}" as="r" hint-placeholder-count="12">
            <div onClick="{{ r.open }}" style="cursor:pointer;background:var(--surf);border-radius:8px;box-shadow:0 0 0 1px var(--ring);overflow:hidden">
              <div style="position:relative;aspect-ratio:2/3;background:linear-gradient(160deg,var(--ph1),var(--ph3));display:grid;place-items:center">
                <span style="font:500 11px/1 var(--mono);letter-spacing:.14em;color:var(--t30)">{{ r.code }}</span>
                <sc-if value="{{ r.fileMissing }}"><span style="position:absolute;top:7px;left:7px;font:500 10px/1 Inter;padding:3px 5px;border-radius:3px;background:rgba(224,129,136,.3);color:var(--onbad)">\u6587\u4EF6\u7F3A\u5931</span></sc-if>
                <span style="position:absolute;bottom:0;left:0;right:0;padding:7px 8px;background:linear-gradient(transparent,var(--scrim9));font:400 10.5px/1 var(--mono);color:var(--t70)">{{ r.resText }}</span>
              </div>
              <div style="padding:8px 9px 10px"><div style="font:500 11px/1 var(--mono);color:var(--acc);margin-bottom:4px">{{ r.code }}</div><div style="font-size:12px;line-height:1.35;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;min-height:32px">{{ r.title }}</div></div>
            </div>
          </sc-for>
        </div>
      </sc-if>

      <sc-if value="{{ lb.showActor }}">
        <div style="display:grid;grid-template-columns:repeat(5,1fr);gap:13px">
          <sc-for list="{{ lb.actors }}" as="a" hint-placeholder-count="5">
            <div style="background:var(--surf);border-radius:8px;box-shadow:0 0 0 1px var(--ring);padding:14px;display:flex;gap:12px;align-items:center">
              <div style="width:52px;height:52px;border-radius:50%;background:linear-gradient(150deg,var(--av),var(--ph4));display:grid;place-items:center;font-size:16px;color:var(--dim2);flex:none">{{ a.initial }}</div>
              <div style="min-width:0"><div style="font-size:13.5px;margin-bottom:3px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">{{ a.name }}</div><div style="font:400 11px/1.4 var(--mono);color:var(--dim2)">{{ a.meta }}</div><div style="font-size:10.5px;color:{{ a.avatarFg }};margin-top:3px">{{ a.avatar }}</div></div>
            </div>
          </sc-for>
        </div>
      </sc-if>
    </main>
  </div>
  </sc-if>

  <sc-if value="{{ lb.pathCfg }}">
    <div style="position:absolute;inset:0;background:var(--ovl6)" onClick="{{ lb.closePaths }}"></div>
    <aside style="position:absolute;top:0;right:0;bottom:0;width:600px;background:var(--elev);box-shadow:-1px 0 0 var(--ring),-24px 0 60px rgba(0,0,0,.55);display:flex;flex-direction:column;animation:jjrise 180ms ease-out">
      <div style="display:flex;align-items:center;gap:12px;padding:14px 18px;box-shadow:inset 0 -1px 0 var(--line)">
        <h5 style="margin:0">\u5F71\u89C6\u5E93\u8DEF\u5F84\u914D\u7F6E</h5>
        <button class="btn btn-ghost" style="margin-left:auto" onClick="{{ lb.closePaths }}">\u5173\u95ED</button>
      </div>
      <div style="flex:1;overflow:auto;padding:16px 18px 22px;display:flex;flex-direction:column;gap:18px">
        <sc-for list="{{ lb.pathGroups }}" as="g" hint-placeholder-count="2">
          <div>
            <div style="display:flex;align-items:baseline;gap:10px;margin-bottom:9px">
              <h6 style="margin:0;color:var(--dim)">{{ g.name }}</h6>
              <span style="font-size:11px;color:var(--dim2)">{{ g.hint }}</span>
              <button class="btn btn-ghost" style="margin-left:auto;font-size:11.5px" onClick="{{ g.add }}"><i class="ph ph-plus" style="font-size:13px;margin-right:4px"></i>\u6DFB\u52A0</button>
            </div>
            <div style="display:flex;flex-direction:column;gap:7px">
              <sc-for list="{{ g.rows }}" as="r" hint-placeholder-count="3">
                <div style="display:flex;align-items:center;gap:8px">
                  <input class="input" style="flex:1;font-family:var(--mono);font-size:12px" value="{{ r.path }}">
                  <span style="font-size:11px;color:{{ r.stFg }};width:118px;text-align:right">{{ r.status }}</span>
                  <button class="btn btn-ghost" style="padding:0 4px;color:var(--bad)" title="\u79FB\u9664\u8BE5\u8DEF\u5F84" onClick="{{ r.remove }}"><i class="ph ph-trash" style="font-size:13px"></i></button>
                </div>
              </sc-for>
              <sc-if value="{{ g.empty }}"><span style="font-size:12px;color:var(--dim2)">{{ g.emptyText }}</span></sc-if>
            </div>
          </div>
        </sc-for>
        <div style="border-radius:7px;background:var(--surf2);box-shadow:inset 0 0 0 1px var(--line2);padding:11px 13px;font-size:11.5px;color:var(--dim);line-height:1.6">
          \u8DEF\u5F84\u53D8\u66F4\u4E0D\u4F1A\u7ACB\u5373\u626B\u63CF\u3002\u4FDD\u5B58\u540E\u7528\u300C\u626B\u63CF\u5165\u5E93\u300D\u91CD\u65B0\u7D22\u5F15\uFF1B\u88AB\u79FB\u9664\u7684\u8DEF\u5F84\u5176\u5F71\u7247\u8BB0\u5F55\u4F1A\u4FDD\u7559\uFF0C\u76F4\u5230\u6267\u884C\u300C\u6E05\u6D17\u65E0\u6548\u6587\u4EF6\u300D\u3002
        </div>
      </div>
      <div style="padding:12px 18px;box-shadow:inset 0 1px 0 var(--line);display:flex;gap:8px;justify-content:flex-end">
        <button class="btn btn-secondary" onClick="{{ lb.closePaths }}">\u53D6\u6D88</button>
        <button class="btn btn-primary" onClick="{{ lb.savePaths }}">\u4FDD\u5B58\u8DEF\u5F84\u914D\u7F6E</button>
      </div>
    </aside>
  </sc-if>

  <sc-if value="{{ lb.tcDialog }}">
    <div class="dialog-backdrop" style="position:absolute;background:var(--ovl)">
      <div class="dialog elev-lg" style="width:600px;animation:jjrise 160ms ease-out">
        <div class="dialog-title">\u8F6C\u7801 \xB7 {{ lb.tcDialog.code }}</div>
        <div class="dialog-body" style="margin-bottom:2px">{{ lb.tcDialog.file }}</div>
        <div style="display:grid;grid-template-columns:auto 1fr auto 1fr;gap:6px 12px;font-size:12.5px;border-radius:7px;background:var(--surf2);box-shadow:inset 0 0 0 1px var(--line2);padding:11px 13px">
          <sc-for list="{{ lb.tcDialog.src }}" as="f" hint-placeholder-count="6"><span style="color:var(--dim2)">{{ f.k }}</span><span style="font-family:var(--mono);font-size:11.5px">{{ f.v }}</span></sc-for>
        </div>
        <div style="display:flex;flex-direction:column;gap:8px">
          <sc-for list="{{ lb.tcDialog.presets }}" as="p" hint-placeholder-count="4">
            <label style="display:flex;align-items:flex-start;gap:9px;border-radius:7px;background:{{ p.bg }};box-shadow:inset 0 0 0 1px {{ p.ring }};padding:10px 12px;cursor:{{ p.cursor }};opacity:{{ p.op }}">
              <input type="radio" name="jj-tcpreset" style="accent-color:var(--acc);width:14px;height:14px;margin-top:2px" checked="{{ p.on }}" disabled="{{ p.disabled }}" onChange="{{ p.pick }}">
              <span style="flex:1">
                <span style="display:flex;align-items:baseline;gap:8px"><span style="font:500 13px/1 Inter,sans-serif">{{ p.name }}</span><span class="tag" style="margin-left:auto;background:{{ p.tagBg }};color:{{ p.tagFg }};font-size:10px;padding:2px 6px">{{ p.tag }}</span></span>
                <span style="display:block;font-size:11.5px;color:var(--dim2);margin-top:4px;line-height:1.45">{{ p.desc }}</span>
                <span style="display:block;font:400 10.5px/1.4 var(--mono);color:{{ p.codecFg }};margin-top:4px">{{ p.codec }} \xB7 \u9884\u8BA1\u8F93\u51FA {{ p.estimate }}</span>
              </span>
            </label>
          </sc-for>
        </div>
        <sc-if value="{{ lb.tcDialog.custom }}">
          <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:11px">
            <sc-for list="{{ lb.tcDialog.customFields }}" as="f" hint-placeholder-count="6">
              <div class="field"><label>{{ f.label }}</label>
                <sc-if value="{{ f.isSelect }}"><select class="input" value="{{ f.value }}"><sc-for list="{{ f.options }}" as="o" hint-placeholder-count="2"><option>{{ o.t }}</option></sc-for></select></sc-if>
                <sc-if value="{{ f.isText }}"><input class="input" style="font-family:var(--mono)" value="{{ f.value }}"></sc-if>
              </div>
            </sc-for>
          </div>
        </sc-if>
        <div style="font-size:11.5px;color:var(--dim);line-height:1.55">{{ lb.tcDialog.note }}</div>
        <div class="dialog-actions">
          <button class="btn btn-ghost" onClick="{{ lb.tcDialog.openPanel }}">\u6253\u5F00\u8F6C\u7801\u9762\u677F</button>
          <button class="btn btn-secondary" onClick="{{ lb.closeTc }}">\u53D6\u6D88</button>
          <button class="btn btn-primary" onClick="{{ lb.tcDialog.submit }}">\u52A0\u5165\u961F\u5217</button>
        </div>
      </div>
    </div>
  </sc-if>

  <sc-if value="{{ lb.checkCfg }}">
    <div class="dialog-backdrop" style="position:absolute;background:var(--ovl)">
      <div class="dialog elev-lg" style="width:520px;animation:jjrise 160ms ease-out">
        <div class="dialog-title">\u8D44\u6599\u68C0\u67E5\u9879</div>
        <div class="dialog-body" style="margin-bottom:2px">\u52FE\u9009\u8981\u68C0\u67E5\u7684\u8D44\u6599\uFF0C\u4F5C\u4E3A <code style="font-family:var(--mono);font-size:11.5px;color:var(--accs)">fields</code> \u53C2\u6570\u63D0\u4EA4\uFF1B\u672A\u52FE\u9009\u7684\u9879\u4E0D\u8BA1\u5165\u5B8C\u6574\u5EA6\u3002</div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:9px 16px">
          <sc-for list="{{ lb.checkItems }}" as="c" hint-placeholder-count="6">
            <label style="display:flex;align-items:flex-start;gap:8px;font-size:13px;color:var(--dim);cursor:pointer"><input type="checkbox" style="accent-color:var(--acc);width:14px;height:14px;margin-top:2px" checked="{{ c.on }}" onChange="{{ c.toggle }}"><span>{{ c.label }}<span style="display:block;font-size:10.5px;color:var(--dim2)">{{ c.hint }}</span></span></label>
          </sc-for>
        </div>
        <div class="dialog-actions">
          <button class="btn btn-secondary" onClick="{{ lb.closeCheck }}">\u53D6\u6D88</button>
          <button class="btn btn-primary" onClick="{{ lb.runCheck }}">\u5F00\u59CB\u68C0\u67E5</button>
        </div>
      </div>
    </div>
  </sc-if>

  <sc-if value="{{ lb.d }}">
    <div style="position:absolute;inset:0;background:var(--ovl6)" onClick="{{ lb.closeDetail }}"></div>
    <aside style="position:absolute;top:0;right:0;bottom:0;width:700px;background:var(--elev);box-shadow:-1px 0 0 var(--ring),-24px 0 60px rgba(0,0,0,.55);display:flex;flex-direction:column;animation:jjrise 180ms ease-out">
      <div style="display:flex;align-items:center;gap:12px;padding:14px 18px;box-shadow:inset 0 -1px 0 var(--line)">
        <span style="font:500 14px/1 var(--mono);color:var(--acc)">{{ lb.d.code }}</span>
        <span style="font-size:13px;color:var(--dim);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">{{ lb.d.title }}</span>
        <button class="btn btn-ghost" style="margin-left:auto" onClick="{{ lb.closeDetail }}">\u5173\u95ED</button>
      </div>
      <div style="flex:1;overflow:auto;padding:16px 18px 22px;display:flex;flex-direction:column;gap:16px">
        <div style="display:flex;gap:16px">
          <div style="width:186px;flex:none;aspect-ratio:2/3;border-radius:6px;background:linear-gradient(160deg,var(--ph1),var(--ph3));display:grid;place-items:center;font:500 11px/1 var(--mono);letter-spacing:.14em;color:var(--t30)">{{ lb.d.code }}</div>
          <div style="flex:1;display:grid;grid-template-columns:auto 1fr;gap:6px 12px;align-content:start;font-size:12.5px">
            <sc-for list="{{ lb.d.fields }}" as="f" hint-placeholder-count="9"><span style="color:var(--dim2)">{{ f.k }}</span><span style="font-family:{{ f.mono }};font-size:{{ f.fs }};color:{{ f.fg }}">{{ f.v }}</span></sc-for>
          </div>
        </div>
        <sc-if value="{{ lb.d.incomplete }}">
          <div style="background:rgba(201,160,94,.06);box-shadow:inset 0 0 0 1px rgba(201,160,94,.32);border-radius:7px;padding:11px 13px;display:flex;align-items:center;gap:12px">
            <div style="font-size:12.5px;color:var(--dim)"><b style="color:var(--warn);font-weight:500">\u8D44\u6599\u4E0D\u5B8C\u6574</b> \xB7 {{ lb.d.missingText }}</div>
            <button class="btn btn-primary" style="margin-left:auto;font-size:12px" onClick="{{ lb.d.complete }}">\u8054\u7F51\u8865\u5168</button>
          </div>
        </sc-if>
        <div><h6 style="margin:0 0 8px;color:var(--dim)">\u6F14\u5458</h6><div style="display:flex;gap:8px;flex-wrap:wrap"><sc-for list="{{ lb.d.actors }}" as="a" hint-placeholder-count="2"><span style="display:inline-flex;align-items:center;gap:7px;padding:4px 10px 4px 4px;border-radius:20px;background:var(--t05);font-size:12.5px"><span style="width:22px;height:22px;border-radius:50%;background:var(--av2);display:grid;place-items:center;font-size:10px;color:var(--dim2)">{{ a.initial }}</span>{{ a.name }}</span></sc-for></div></div>
        <div><h6 style="margin:0 0 8px;color:var(--dim)">\u6807\u7B7E</h6><div style="display:flex;gap:6px;flex-wrap:wrap"><sc-for list="{{ lb.d.tags }}" as="t" hint-placeholder-count="3"><span class="tag tag-neutral">{{ t.t }}</span></sc-for></div></div>
        <div>
          <h6 style="margin:0 0 8px;color:var(--dim)">\u672C\u5730\u6587\u4EF6</h6>
          <div style="border-radius:8px;box-shadow:0 0 0 1px var(--ring);overflow:hidden;background:var(--surf)">
            <table class="table" style="font-size:12.5px">
              <thead><tr><th>\u8DEF\u5F84</th><th style="width:78px">\u4F53\u79EF</th><th style="width:110px">\u7F16\u7801</th><th style="width:88px">\u72B6\u6001</th><th style="width:130px">\u64CD\u4F5C</th></tr></thead>
              <tbody>
                <sc-for list="{{ lb.d.files }}" as="f" hint-placeholder-count="2">
                  <tr>
                    <td><div style="font:400 11px/1.4 var(--mono);color:{{ f.fg }};max-width:250px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">{{ f.path }}</div></td>
                    <td style="font-family:var(--mono);color:var(--dim)">{{ f.size }}</td>
                    <td style="font-family:var(--mono);font-size:11px;color:var(--dim)">{{ f.codec }}</td>
                    <td><span style="font-size:11.5px;color:{{ f.stFg }}">{{ f.status }}</span></td>
                    <td><div style="display:flex;gap:5px"><button class="btn btn-secondary" style="font-size:11px;padding:3px 6px" disabled="{{ f.gone }}" onClick="{{ f.play }}">\u64AD\u653E</button><button class="btn btn-secondary" style="font-size:11px;padding:3px 6px" disabled="{{ f.gone }}" onClick="{{ f.transcode }}">\u8F6C\u7801</button></div></td>
                  </tr>
                </sc-for>
              </tbody>
            </table>
          </div>
        </div>
      </div>
      <div style="padding:12px 18px;box-shadow:inset 0 1px 0 var(--line);display:flex;gap:8px;align-items:center">
        <button class="btn btn-secondary" onClick="{{ lb.d.recheck }}">\u91CD\u65B0\u522E\u524A</button>
        <button class="btn btn-secondary" style="margin-left:auto" onClick="{{ lb.d.remove }}">\u79FB\u9664\u8BB0\u5F55</button>
        <button class="btn btn-primary" style="color:var(--bad);border-color:var(--bad)" onClick="{{ lb.d.purge }}">\u5F7B\u5E95\u5220\u9664</button>
      </div>
    </aside>
  </sc-if>

  <sc-if value="{{ at.cinema }}">
  <div style="--bg:#161826;--hdr:#141622;--surf:#232532;--surf2:#1b1d2b;--ring:#3f424d;--fg:#e9e9ed;--elev:#1d1f2c;--elev2:#20222f;--elevr:#595d6c;--acc:#9184d9;--accd:#5d5294;--acc2:#b5abfc;--accs:#d2cefd;--acct:#e7e5fe;--accw:#efedff;--ok:#63b394;--warn:#c9a05e;--bad:#e08188;--onbad:#ffe3e5;--onok:#e6f2ec;--onwarn:#f6ecd8;--onacc:#e4e7f5;--onmut:#cfd3e5;--ph1:#2c2f42;--ph2:#1a1c28;--ph3:#191b26;--ph4:#1e2030;--av:#31344a;--av2:#2f3243;--sk:#282b3a;--sk2:#313443;--cd:#1c1e2c;--cd2:#1e2132;--cd3:#2f3350;--line:rgba(233,233,237,.13);--line2:rgba(233,233,237,.07);--dim:rgba(233,233,237,.55);--dim2:rgba(233,233,237,.38);--t03:rgba(233,233,237,.03);--t05:rgba(233,233,237,.05);--t08:rgba(233,233,237,.08);--t09:rgba(233,233,237,.09);--t18:rgba(233,233,237,.18);--t30:rgba(233,233,237,.3);--t32:rgba(233,233,237,.32);--t60:rgba(233,233,237,.6);--t62:rgba(233,233,237,.62);--t66:rgba(233,233,237,.66);--t68:rgba(233,233,237,.68);--t70:rgba(233,233,237,.7);--t72:rgba(233,233,237,.72);--t78:rgba(233,233,237,.78);--ovl:rgba(20,22,34,.66);--ovl6:rgba(20,22,34,.6);--ovl55:rgba(20,22,34,.55);--inset:rgba(20,22,34,.35);--scrim8:rgba(20,22,34,.8);--scrim9:rgba(20,22,34,.9);position:absolute;inset:0;background:var(--bg);color:var(--fg);overflow:hidden;display:flex;flex-direction:column">
    <div style="position:absolute;inset:0;background:linear-gradient(118deg,var(--cd3) 0%,var(--cd2) 44%,var(--bg) 100%)"></div>
    <div style="position:absolute;top:0;right:0;width:62%;height:66%;background:radial-gradient(120% 90% at 78% 22%,rgba(145,132,217,.22),transparent 68%)"></div>
    <div style="position:absolute;inset:0;background:linear-gradient(90deg,var(--bg) 6%,rgba(22,24,38,.86) 40%,rgba(22,24,38,.1) 78%)"></div>
    <div style="position:absolute;left:0;right:0;bottom:0;height:52%;background:linear-gradient(transparent,var(--bg) 74%)"></div>

    <div style="position:relative;flex:none;height:56px;display:flex;align-items:center;gap:16px;padding:0 34px;background:linear-gradient(rgba(22,24,38,.78),transparent)">
      <img src="static/logo.jpg" alt="JavJaeger" style="width:20px;height:20px;border-radius:5px;object-fit:cover;opacity:.9">
      <span style="font:500 13px/1 Inter,sans-serif;letter-spacing:.16em;text-transform:uppercase;color:var(--t72)">\u5F71\u9662\u6A21\u5F0F</span>
      <div style="display:flex;gap:3px;margin-left:12px">
        <sc-for list="{{ cn.tabs }}" as="t" hint-placeholder-count="4">
          <button onClick="{{ t.pick }}" style="appearance:none;cursor:pointer;background:{{ t.bg }};border:0;border-radius:6px;padding:6px 12px;color:{{ t.fg }};font:{{ t.fw }} 13px/1 Inter,sans-serif">{{ t.name }}</button>
        </sc-for>
      </div>
      <span style="margin-left:auto;font:400 11.5px/1 var(--mono);color:var(--t62)">{{ cn.libMeta }}</span>
      <button class="btn btn-ghost" style="color:var(--t78)" onClick="{{ cn.exit }}"><i class="ph ph-sidebar" style="font-size:14px;margin-right:5px"></i>\u7BA1\u7406\u754C\u9762</button>
    </div>

    <sc-if value="{{ cn.showHero }}">
    <div style="position:relative;flex:0 0 auto;margin:34px 34px 0;width:560px;display:flex;flex-direction:column;gap:14px">
      <div style="display:flex;align-items:center;gap:9px">
        <span style="font:500 11px/1 var(--mono);letter-spacing:.14em;color:var(--acc2)">{{ cn.hero.code }}</span>
        <span style="width:22px;height:1px;background:rgba(181,171,252,.5)"></span>
        <span style="font-size:11.5px;color:var(--t66)">{{ cn.hero.kicker }}</span>
      </div>
      <h1 style="margin:0;font:400 {{ cn.heroTitleSize }}/1.16 Inter,sans-serif;letter-spacing:-.02em;text-wrap:pretty">{{ cn.hero.title }}</h1>
      <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">
        <sc-for list="{{ cn.hero.chips }}" as="c" hint-placeholder-count="4">
          <span style="font:400 11.5px/1 Inter,sans-serif;padding:4px 8px;border-radius:4px;background:{{ c.bg }};color:{{ c.fg }};box-shadow:inset 0 0 0 1px {{ c.ring }}">{{ c.t }}</span>
        </sc-for>
      </div>
      <p style="margin:0;font-size:13.5px;line-height:1.65;color:var(--t72);max-width:480px;text-wrap:pretty">{{ cn.hero.desc }}</p>
      <sc-if value="{{ cn.hero.resume }}">
        <div style="max-width:380px">
          <div style="display:flex;align-items:baseline;gap:8px;margin-bottom:6px"><span style="font-size:11.5px;color:var(--t66)">{{ cn.hero.resumeText }}</span><span style="margin-left:auto;font:400 11px/1 var(--mono);color:var(--t62)">{{ cn.hero.resumePctText }}</span></div>
          <div style="height:3px;border-radius:2px;background:var(--line);overflow:hidden"><div style="height:100%;width:{{ cn.hero.resumePct }}%;background:var(--acc2)"></div></div>
        </div>
      </sc-if>
      <div style="display:flex;align-items:center;gap:9px;padding-top:4px">
        <button class="btn btn-primary" style="padding:9px 20px;font-size:14px;background:rgba(145,132,217,.16)" onClick="{{ cn.play }}"><i class="ph ph-play" style="font-size:14px;margin-right:7px"></i>{{ cn.hero.playText }}</button>
        <button class="btn btn-secondary" style="padding:9px 15px" onClick="{{ cn.info }}">\u8BE6\u60C5</button>
        <button class="btn btn-ghost" style="padding:9px 12px;color:var(--t78)" onClick="{{ cn.transcode }}">\u8F6C\u7801</button>
        <span style="font:400 11.5px/1.5 var(--mono);color:{{ cn.hero.playFg }};max-width:190px">{{ cn.hero.playNote }}</span>
      </div>
    </div>
    </sc-if>

    <sc-if value="{{ cn.showShelves }}">
    <div style="position:relative;flex:1 1 auto;min-height:0;overflow:hidden;padding:20px 34px 26px;display:flex;flex-direction:column;justify-content:flex-end;gap:{{ cn.shelfGap }}">
      <sc-for list="{{ cn.shelves }}" as="sh" hint-placeholder-count="2">
        <div>
          <div style="display:flex;align-items:baseline;gap:10px;margin-bottom:9px">
            <span style="font:500 13.5px/1 Inter,sans-serif">{{ sh.name }}</span>
            <span style="font:400 11px/1 var(--mono);color:var(--t62)">{{ sh.meta }}</span>
          </div>
          <div style="display:flex;gap:11px;overflow:hidden">
            <sc-for list="{{ sh.items }}" as="it" hint-placeholder-count="7">
              <button onClick="{{ it.pick }}" style="appearance:none;cursor:pointer;text-align:left;flex:none;width:{{ sh.cardW }};background:none;border:0;padding:0;color:var(--fg);display:flex;flex-direction:column;gap:6px">
                <div style="position:relative;width:100%;aspect-ratio:16/10;border-radius:7px;background:linear-gradient(142deg,var(--av),var(--cd));box-shadow:0 0 0 {{ it.ringW }} {{ it.ring }};display:grid;place-items:center;overflow:hidden">
                  <span style="font:500 10.5px/1 var(--mono);letter-spacing:.14em;color:var(--t62)">{{ it.code }}</span>
                  <sc-if value="{{ it.playing }}"><span style="position:absolute;top:6px;left:7px;display:inline-flex;align-items:center;gap:4px;font:500 9.5px/1 Inter,sans-serif;padding:3px 5px;border-radius:3px;background:rgba(145,132,217,.42);color:var(--accw)">\u6B63\u5728\u89C2\u770B</span></sc-if>
                  <sc-if value="{{ it.gone }}"><span style="position:absolute;top:6px;left:7px;font:500 9.5px/1 Inter,sans-serif;padding:3px 5px;border-radius:3px;background:rgba(224,129,136,.36);color:var(--onbad)">\u6587\u4EF6\u7F3A\u5931</span></sc-if>
                  <span style="position:absolute;bottom:0;left:0;right:0;padding:14px 7px 5px;background:linear-gradient(transparent,rgba(22,24,38,.94));font:400 10px/1 var(--mono);color:var(--t60);display:flex;gap:6px"><span>{{ it.res }}</span><span style="margin-left:auto">{{ it.dur }}</span></span>
                  <sc-if value="{{ it.hasProgress }}"><span style="position:absolute;left:0;right:0;bottom:0;height:2px;background:rgba(233,233,237,.16)"><span style="display:block;height:100%;width:{{ it.progress }}%;background:var(--acc2)"></span></span></sc-if>
                </div>
                <div style="width:100%;min-width:0">
                  <div style="font:400 12.5px/1.35 Inter,sans-serif;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">{{ it.title }}</div>
                  <div style="font-size:10.5px;color:var(--t68);margin-top:2px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">{{ it.sub }}</div>
                </div>
              </button>
            </sc-for>
          </div>
        </div>
      </sc-for>
    </div>
    </sc-if>

    <sc-if value="{{ cn.showActors }}">
    <div style="position:relative;flex:1 1 auto;min-height:0;display:flex;flex-direction:column">
      <div style="flex:none;padding:8px 34px 14px;display:flex;align-items:baseline;gap:12px">
        <span style="font:400 13.5px/1 Inter,sans-serif;color:var(--color-text)">\u6F14\u5458</span>
        <span style="font:400 11.5px/1 var(--mono);color:var(--t62)">{{ cn.actorsMeta }}</span>
      </div>
      <div style="flex:1 1 auto;min-height:0;overflow:auto;padding:0 34px 26px">
        <div style="display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:16px">
          <sc-for list="{{ cn.actors }}" as="a" hint-placeholder-count="6">
            <button onClick="{{ a.open }}" style="appearance:none;cursor:pointer;text-align:left;background:none;border:0;padding:0;color:var(--color-text);display:flex;flex-direction:column;gap:9px;min-width:0;max-width:100%">
              <div style="position:relative;width:100%;aspect-ratio:1;border-radius:var(--radius-lg,10px);background:linear-gradient(152deg,var(--av),var(--cd));box-shadow:0 0 0 1px var(--t09);display:grid;place-items:center;overflow:hidden">
                <span style="font:400 30px/1 Inter,sans-serif;color:rgba(233,233,237,.5)">{{ a.initial }}</span>
                <sc-if value="{{ a.noAvatar }}"><span style="position:absolute;bottom:0;left:0;right:0;padding:4px 6px;background:rgba(22,24,38,.85);font:400 10px/1.3 Inter,sans-serif;color:var(--warn);text-align:center">\u5934\u50CF\u7F3A\u5931</span></sc-if>
              </div>
              <div style="width:100%;min-width:0">
                <div style="font:400 13.5px/1.3 Inter,sans-serif;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">{{ a.name }}</div>
                <div style="display:flex;align-items:baseline;gap:7px;margin-top:4px">
                  <span style="font:400 11px/1 var(--mono);color:var(--t68)">{{ a.count }}</span>
                  <span style="font:400 11px/1 var(--mono);color:var(--t62);margin-left:auto">{{ a.size }}</span>
                </div>
                <div style="font-size:10.5px;color:var(--t62);margin-top:3px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">{{ a.latest }}</div>
              </div>
            </button>
          </sc-for>
        </div>
      </div>
    </div>
    </sc-if>

    <sc-if value="{{ cn.showWall }}">
    <div style="position:relative;flex:1 1 auto;min-height:0;display:flex;flex-direction:column">
      <div style="flex:none;padding:8px 34px 12px;display:flex;flex-direction:column;gap:9px">
        <sc-if value="{{ cn.actorHeader }}">
          <div style="display:flex;align-items:center;gap:13px;padding-bottom:4px">
            <button class="btn btn-ghost" style="color:var(--t78)" onClick="{{ cn.backToActors }}"><i class="ph ph-arrow-left" style="font-size:14px;margin-right:6px"></i>\u5168\u90E8\u6F14\u5458</button>
            <div style="width:38px;height:38px;border-radius:50%;background:linear-gradient(152deg,var(--av),var(--cd));box-shadow:0 0 0 1px var(--t09);display:grid;place-items:center;font:400 15px/1 Inter,sans-serif;color:var(--t62)">{{ cn.actorHeader.initial }}</div>
            <div>
              <div style="font:400 16px/1.2 Inter,sans-serif">{{ cn.actorHeader.name }}</div>
              <div style="font:400 11.5px/1 var(--mono);color:var(--t62);margin-top:4px">{{ cn.actorHeader.meta }}</div>
            </div>
          </div>
        </sc-if>
        <sc-for list="{{ cn.filterGroups }}" as="g" hint-placeholder-count="5">
          <div style="display:flex;align-items:baseline;gap:10px">
            <span style="flex:none;width:64px;font:400 11.5px/22px Inter,sans-serif;color:var(--t62)">{{ g.name }}</span>
            <div style="display:flex;gap:6px;flex-wrap:wrap;flex:1">
              <sc-for list="{{ g.items }}" as="o" hint-placeholder-count="5">
                <button onClick="{{ o.toggle }}" style="appearance:none;cursor:pointer;background:{{ o.bg }};border:0;box-shadow:inset 0 0 0 1px {{ o.ring }};border-radius:5px;padding:4px 9px;color:{{ o.fg }};font:400 12px/1.3 Inter,sans-serif;display:inline-flex;align-items:baseline;gap:6px">{{ o.name }}<span style="font:400 10px/1 var(--mono);opacity:.6">{{ o.count }}</span></button>
              </sc-for>
            </div>
          </div>
        </sc-for>
        <div style="display:flex;align-items:center;gap:12px;padding-top:2px;box-shadow:inset 0 1px 0 var(--line2)">
          <span style="font:400 12px/1 Inter,sans-serif;color:var(--t72);padding-top:10px">{{ cn.wallMeta }}</span>
          <div style="margin-left:auto;display:flex;align-items:center;gap:8px;padding-top:8px">
            <span style="font-size:11.5px;color:var(--t62)">\u6392\u5E8F</span>
            <sc-for list="{{ cn.sorts }}" as="o" hint-placeholder-count="3">
              <button onClick="{{ o.pick }}" style="appearance:none;cursor:pointer;background:{{ o.bg }};border:0;box-shadow:inset 0 0 0 1px {{ o.ring }};border-radius:5px;padding:4px 9px;color:{{ o.fg }};font:400 12px/1.3 Inter,sans-serif">{{ o.name }}</button>
            </sc-for>
            <sc-if value="{{ cn.hasFilters }}"><button class="btn btn-ghost" style="font-size:11.5px;color:var(--t72)" onClick="{{ cn.clearFilters }}">\u6E05\u7A7A {{ cn.filterCount }} \u4E2A\u6761\u4EF6</button></sc-if>
          </div>
        </div>
      </div>
      <div style="flex:1 1 auto;min-height:0;overflow:auto;padding:0 34px 26px">
        <sc-if value="{{ cn.wallEmpty }}">
          <div style="padding:90px 0;text-align:center">
            <h5 style="margin:0 0 6px;color:rgba(233,233,237,.84)">\u6CA1\u6709\u7B26\u5408\u6761\u4EF6\u7684\u5F71\u7247</h5>
            <p style="margin:0 auto 16px;max-width:400px;font-size:13px;color:var(--t62)">\u5F53\u524D\u7EC4\u5408\u8FC7\u6EE4\u6389\u4E86\u5168\u90E8\u7ED3\u679C\u3002\u53BB\u6389\u4E00\u4E2A\u6761\u4EF6\uFF0C\u6216\u6E05\u7A7A\u540E\u91CD\u65B0\u9009\u62E9\u3002</p>
            <button class="btn btn-secondary" onClick="{{ cn.clearFilters }}">\u6E05\u7A7A\u6761\u4EF6</button>
          </div>
        </sc-if>
        <div style="display:grid;grid-template-columns:repeat(8,minmax(0,1fr));gap:14px">
          <sc-for list="{{ cn.wall }}" as="it" hint-placeholder-count="16">
            <button onClick="{{ it.open }}" style="appearance:none;cursor:pointer;text-align:left;background:none;border:0;padding:0;color:var(--fg);display:flex;flex-direction:column;gap:7px;min-width:0;max-width:100%">
              <div style="position:relative;width:100%;aspect-ratio:2/3;border-radius:7px;background:linear-gradient(158deg,var(--av),var(--cd));box-shadow:0 0 0 {{ it.ringW }} {{ it.ring }};display:grid;place-items:center;overflow:hidden">
                <span style="font:500 10px/1 var(--mono);letter-spacing:.13em;color:var(--t62)">{{ it.code }}</span>
                <div style="position:absolute;top:6px;left:6px;right:6px;display:flex;gap:4px;flex-wrap:wrap">
                  <sc-for list="{{ it.badges }}" as="b" hint-placeholder-count="0"><span style="font:500 9.5px/1 Inter,sans-serif;padding:3px 5px;border-radius:3px;background:{{ b.bg }};color:{{ b.fg }}">{{ b.t }}</span></sc-for>
                </div>
                <span style="position:absolute;bottom:0;left:0;right:0;padding:16px 7px 6px;background:linear-gradient(transparent,rgba(22,24,38,.94));font:400 10px/1 var(--mono);color:var(--t72);display:flex;gap:6px"><span>{{ it.res }}</span><span style="margin-left:auto">{{ it.size }}</span></span>
                <sc-if value="{{ it.hasProgress }}"><span style="position:absolute;left:0;right:0;bottom:0;height:2px;background:rgba(233,233,237,.16)"><span style="display:block;height:100%;width:{{ it.progress }}%;background:var(--acc2)"></span></span></sc-if>
              </div>
              <div style="width:100%;min-width:0">
                <div style="font:400 12px/1.35 Inter,sans-serif;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">{{ it.title }}</div>
                <div style="font-size:10.5px;color:var(--t68);margin-top:2px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">{{ it.sub }}</div>
              </div>
            </button>
          </sc-for>
        </div>
      </div>
    </div>
    </sc-if>
  </div>
  </sc-if>

  <sc-if value="{{ cn.player }}">
    <div style="position:absolute;inset:0;background:var(--bg);box-shadow:inset 0 0 240px 90px rgba(0,0,0,.55);display:flex;flex-direction:column;animation:jjrise 200ms ease-out">
      <div style="flex:1;position:relative;display:grid;place-items:center">
        <div style="text-align:center">
          <div style="font:500 12px/1 var(--mono);letter-spacing:.2em;color:var(--t66);margin-bottom:12px">{{ cn.player.code }}</div>
          <div style="font:400 26px/1.3 Inter,sans-serif;color:rgba(233,233,237,.84);max-width:640px">{{ cn.player.title }}</div>
        </div>
        <sc-if value="{{ cn.player.buffering }}">
          <div style="position:absolute;top:50%;left:50%;transform:translate(-50%,64px);display:flex;align-items:center;gap:9px;font-size:12.5px;color:var(--t68)"><span style="width:13px;height:13px;border-radius:50%;border:1.5px solid var(--acc2);border-top-color:transparent;animation:jjspin 900ms linear infinite"></span>{{ cn.player.bufferText }}</div>
        </sc-if>
        <div style="position:absolute;top:22px;left:26px;right:26px;display:flex;align-items:center;gap:12px">
          <span style="font:400 11.5px/1 var(--mono);color:var(--t68)">{{ cn.player.stream }}</span>
          <button class="btn btn-ghost" style="margin-left:auto;color:var(--t78)" onClick="{{ cn.closePlayer }}"><i class="ph ph-x" style="font-size:14px;margin-right:5px"></i>\u505C\u6B62\u64AD\u653E</button>
        </div>
      </div>
      <div style="padding:16px 26px 22px;background:linear-gradient(transparent,rgba(22,24,38,.92));display:flex;flex-direction:column;gap:12px">
        <div style="display:flex;align-items:center;gap:12px">
          <span style="font:400 11.5px/1 var(--mono);color:var(--dim);width:52px">{{ cn.player.at }}</span>
          <div style="flex:1;height:3px;border-radius:2px;background:rgba(233,233,237,.14);position:relative"><div style="height:100%;width:{{ cn.player.pct }}%;background:var(--acc2);border-radius:2px"></div><span style="position:absolute;top:50%;left:{{ cn.player.pct }}%;transform:translate(-50%,-50%);width:9px;height:9px;border-radius:50%;background:var(--fg)"></span></div>
          <span style="font:400 11.5px/1 var(--mono);color:var(--t60);width:52px;text-align:right">{{ cn.player.total }}</span>
        </div>
        <div style="display:flex;align-items:center;gap:8px">
          <sc-for list="{{ cn.player.controls }}" as="c" hint-placeholder-count="5">
            <button onClick="{{ c.act }}" title="{{ c.label }}" style="appearance:none;cursor:pointer;background:{{ c.bg }};border:0;box-shadow:inset 0 0 0 1px {{ c.ring }};border-radius:7px;width:{{ c.w }};height:34px;color:{{ c.fg }};display:inline-flex;align-items:center;justify-content:center;gap:6px;font:400 12px/1 Inter,sans-serif"><i class="ph {{ c.icon }}" style="font-size:15px"></i>{{ c.text }}</button>
          </sc-for>
          <span style="margin-left:auto;font:400 11.5px/1 var(--mono);color:var(--t62)">{{ cn.player.note }}</span>
        </div>
      </div>
    </div>
  </sc-if>

  <sc-if value="{{ at.auto }}">
  <div style="display:flex;align-items:stretch;min-height:848px">
    <aside style="width:272px;flex:none;background:var(--surf2);box-shadow:inset -1px 0 0 var(--line2);padding:15px 14px 22px;display:flex;flex-direction:column;gap:11px;overflow:auto">
      <div style="display:flex;align-items:baseline"><span style="font:600 10px/1 Inter,sans-serif;letter-spacing:.13em;text-transform:uppercase;color:var(--dim2)">\u81EA\u52A8\u4EFB\u52A1</span><button class="btn btn-ghost" style="margin-left:auto;font-size:11px;padding:2px 4px" onClick="{{ au.create }}">\u65B0\u5EFA</button></div>
      <sc-for list="{{ au.tasks }}" as="t" hint-placeholder-count="4">
        <div onClick="{{ t.pick }}" style="cursor:pointer;border-radius:7px;background:{{ t.bg }};box-shadow:inset 0 0 0 1px {{ t.ring }};padding:10px 11px">
          <div style="display:flex;align-items:center;gap:7px;margin-bottom:5px">
            <span style="width:6px;height:6px;border-radius:50%;background:{{ t.dot }};flex:none"></span>
            <span style="font:500 13px/1.3 Inter,sans-serif;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">{{ t.name }}</span>
            <span style="margin-left:auto;font-size:10.5px;color:{{ t.stFg }};flex:none">{{ t.status }}</span>
          </div>
          <div style="font:400 10.5px/1.5 var(--mono);color:var(--dim2)">{{ t.trigger }}<br>{{ t.last }}</div>
        </div>
      </sc-for>
      <hr class="hr" style="margin:4px 0">
      <span style="font:600 10px/1 Inter,sans-serif;letter-spacing:.13em;text-transform:uppercase;color:var(--dim2)">\u5168\u5C40</span>
      <div style="font-size:12px;color:var(--dim);line-height:1.7">
        \u8FD0\u884C\u4E2D\u4EFB\u52A1 2 / 4<br>
        \u4ECA\u65E5\u81EA\u52A8\u6D3E\u53D1 18 \u90E8<br>
        \u4ECA\u65E5\u8DF3\u8FC7 41 \xB7 \u9519\u8BEF 2
      </div>
      <label style="display:flex;align-items:center;gap:8px;font-size:13px;color:var(--dim);cursor:pointer"><input type="checkbox" style="accent-color:var(--acc);width:14px;height:14px" checked="{{ au.pauseAll }}" onChange="{{ au.togglePauseAll }}">\u6682\u505C\u5168\u90E8\u81EA\u52A8\u4EFB\u52A1</label>
      <sc-if value="{{ au.pauseAll }}"><div style="font-size:11px;color:var(--warn);line-height:1.5">\u5DF2\u6682\u505C\uFF1A\u5B9A\u65F6\u4E0E\u95F4\u9694\u89E6\u53D1\u4E0D\u518D\u6267\u884C\uFF0C\u624B\u52A8\u89E6\u53D1\u4ECD\u53EF\u7528\u3002</div></sc-if>
    </aside>

    <main style="flex:1;min-width:0;padding:14px 20px 26px;display:flex;flex-direction:column;gap:14px;overflow:auto">
      <div style="display:flex;align-items:flex-end;gap:12px;flex-wrap:wrap">
        <div>
          <div style="display:flex;align-items:center;gap:9px;margin-bottom:2px"><h4 style="margin:0">{{ au.cur.name }}</h4><span class="tag" style="background:{{ au.cur.tagBg }};color:{{ au.cur.tagFg }}">{{ au.cur.status }}</span></div>
          <span style="font-size:12.5px;color:var(--dim)">{{ au.cur.summary }}</span>
        </div>
        <div style="margin-left:auto;display:flex;gap:8px">
          <button class="btn btn-ghost" onClick="{{ au.autoLayout }}">\u81EA\u52A8\u6392\u7248</button>
          <button class="btn btn-secondary" onClick="{{ au.runNow }}">\u7ACB\u5373\u8FD0\u884C\u4E00\u6B21</button>
          <button class="btn btn-secondary" onClick="{{ au.save }}">\u4FDD\u5B58</button>
          <button class="btn btn-primary" style="color:{{ au.cur.toggleFg }};border-color:{{ au.cur.toggleFg }}" onClick="{{ au.toggleRun }}">{{ au.cur.toggleText }}</button>
          <button class="btn btn-ghost" style="color:var(--bad)" onClick="{{ au.remove }}">\u5220\u9664\u4EFB\u52A1</button>
        </div>
      </div>

      <div style="background:var(--surf);border-radius:8px;box-shadow:0 0 0 1px var(--ring);padding:16px 18px">
        <div style="display:flex;align-items:baseline;gap:10px;margin-bottom:14px"><h5 style="margin:0">\u6D41\u7A0B</h5><span style="font-size:11.5px;color:var(--dim2)">\u70B9\u51FB\u8282\u70B9\u7F16\u8F91\u914D\u7F6E \xB7 \u4E0A\u4E00\u6B21\u8FD0\u884C {{ au.cur.last }}</span></div>
        <div style="display:flex;align-items:stretch;gap:0">
          <sc-for list="{{ au.nodes }}" as="n" hint-placeholder-count="4">
            <div style="display:flex;align-items:stretch;flex:1;min-width:0">
              <div onClick="{{ n.pick }}" style="cursor:pointer;flex:1;min-width:0;border-radius:8px;background:{{ n.bg }};box-shadow:inset 0 0 0 1px {{ n.ring }};padding:12px 13px;display:flex;flex-direction:column;gap:7px">
                <div style="display:flex;align-items:center;gap:7px">
                  <span style="width:20px;height:20px;border-radius:5px;background:{{ n.iconBg }};color:{{ n.iconFg }};display:grid;place-items:center;font:500 10px/1 var(--mono);flex:none">{{ n.step }}</span>
                  <span style="font:500 13px/1 Inter,sans-serif">{{ n.title }}</span>
                  <span style="margin-left:auto;font-size:10.5px;color:{{ n.stFg }}">{{ n.badge }}</span>
                </div>
                <div style="font-size:11.5px;line-height:1.55;color:var(--dim)">{{ n.desc }}</div>
                <div style="margin-top:auto;font:400 10.5px/1.5 var(--mono);color:var(--dim2)">{{ n.meta }}</div>
              </div>
              <sc-if value="{{ n.hasArrow }}">
                <div style="width:34px;flex:none;display:grid;place-items:center;color:var(--dim2)"><i class="ph ph-arrow-right" style="font-size:15px"></i></div>
              </sc-if>
            </div>
          </sc-for>
        </div>
      </div>

      <sc-if value="{{ au.node }}">
        <div style="background:var(--surf);border-radius:8px;box-shadow:0 0 0 1px rgba(145,132,217,.4);padding:16px 18px">
          <div style="display:flex;align-items:baseline;gap:10px;margin-bottom:13px"><h5 style="margin:0">\u8282\u70B9\u914D\u7F6E \xB7 {{ au.node.title }}</h5><button class="btn btn-ghost" style="margin-left:auto;font-size:12px" onClick="{{ au.closeNode }}">\u6536\u8D77</button></div>
          <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:13px">
            <sc-for list="{{ au.node.fields }}" as="f" hint-placeholder-count="6">
              <div class="field"><label>{{ f.label }}</label>
                <sc-if value="{{ f.isSelect }}"><select class="input" value="{{ f.value }}" onChange="{{ f.set }}"><sc-for list="{{ f.options }}" as="o" hint-placeholder-count="3"><option>{{ o.t }}</option></sc-for></select></sc-if>
                <sc-if value="{{ f.isText }}"><input class="input" style="font-family:{{ f.mono }}" value="{{ f.value }}" onChange="{{ f.set }}"></sc-if>
                <sc-if value="{{ f.isCheck }}"><label style="display:flex;align-items:center;gap:8px;font-size:13px;color:var(--dim);cursor:pointer;min-height:34px"><input type="checkbox" style="accent-color:var(--acc);width:14px;height:14px" checked="{{ f.on }}" onChange="{{ f.set }}">{{ f.checkLabel }}</label></sc-if>
                <span style="font-size:10.5px;color:var(--dim2);margin-top:3px;display:block">{{ f.hint }}</span>
              </div>
            </sc-for>
          </div>
          <div style="display:flex;gap:8px;margin-top:14px;justify-content:flex-end"><button class="btn btn-secondary" onClick="{{ au.closeNode }}">\u53D6\u6D88</button><button class="btn btn-primary" onClick="{{ au.saveNode }}">\u4FDD\u5B58\u8282\u70B9</button></div>
        </div>
      </sc-if>

      <div style="background:var(--surf);border-radius:8px;box-shadow:0 0 0 1px var(--ring);overflow:hidden">
        <div style="display:flex;align-items:center;gap:12px;padding:11px 14px;box-shadow:inset 0 -1px 0 var(--line2)">
          <h5 style="margin:0">\u8FD0\u884C\u8BB0\u5F55</h5>
          <span style="font-size:11.5px;color:var(--dim2)">\u4FDD\u7559\u6700\u8FD1 50 \u6B21 \xB7 \u70B9\u51FB\u5C55\u5F00\u5F53\u6B21\u660E\u7EC6</span>
          <button class="btn btn-secondary" style="margin-left:auto;font-size:12px" onClick="{{ au.refresh }}">\u5237\u65B0</button>
        </div>
        <table class="table">
          <thead><tr><th style="width:150px">\u65F6\u95F4</th><th style="width:84px">\u89E6\u53D1</th><th style="width:80px">\u68C0\u7D22</th><th style="width:80px">\u5339\u914D</th><th style="width:80px">\u6D3E\u53D1</th><th style="width:80px">\u8DF3\u8FC7</th><th style="width:74px">\u9519\u8BEF</th><th>\u7ED3\u679C</th><th style="width:70px"></th></tr></thead>
          <tbody>
            <sc-for list="{{ au.runs }}" as="r" hint-placeholder-count="6">
              <tr>
                <td style="font-family:var(--mono);font-size:11.5px;color:var(--dim)">{{ r.time }}</td>
                <td style="font-size:12px;color:var(--dim)">{{ r.trigger }}</td>
                <td style="font-family:var(--mono);font-size:12px">{{ r.found }}</td>
                <td style="font-family:var(--mono);font-size:12px">{{ r.matched }}</td>
                <td style="font-family:var(--mono);font-size:12px;color:{{ r.dispatchFg }}">{{ r.dispatched }}</td>
                <td style="font-family:var(--mono);font-size:12px;color:var(--dim2)">{{ r.skipped }}</td>
                <td style="font-family:var(--mono);font-size:12px;color:{{ r.errFg }}">{{ r.errors }}</td>
                <td><div style="font-size:12px;color:{{ r.resFg }};max-width:380px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">{{ r.result }}</div></td>
                <td><button class="btn btn-ghost" style="font-size:11.5px;padding:2px 4px" onClick="{{ r.open }}">\u660E\u7EC6</button></td>
              </tr>
            </sc-for>
          </tbody>
        </table>
      </div>
    </main>
  </div>
  </sc-if>

  <sc-if value="{{ at.storage }}">
  <div style="display:flex;align-items:stretch;min-height:848px">
    <aside style="width:252px;flex:none;background:var(--surf2);box-shadow:inset -1px 0 0 var(--line2);padding:15px 14px 22px;display:flex;flex-direction:column;gap:12px;overflow:auto">
      <span style="font:600 10px/1 Inter,sans-serif;letter-spacing:.13em;text-transform:uppercase;color:var(--dim2)">\u5B58\u50A8\u6E90</span>
      <sc-for list="{{ fs.sources }}" as="s" hint-placeholder-count="3">
        <div style="border-radius:7px;background:{{ s.bg }};box-shadow:inset 0 0 0 1px {{ s.ring }};padding:10px 11px;opacity:{{ s.op }}">
          <div style="display:flex;align-items:center;gap:7px;margin-bottom:4px">
            <span style="width:6px;height:6px;border-radius:50%;background:{{ s.dot }};flex:none"></span>
            <span onClick="{{ s.pick }}" style="cursor:pointer;font:500 13px/1 Inter,sans-serif">{{ s.name }}</span>
            <span style="margin-left:auto;font-size:10.5px;color:{{ s.stFg }}">{{ s.status }}</span>
            <sc-if value="{{ s.needsCfg }}"><button class="btn btn-ghost" style="padding:0 3px;font-size:11px" title="\u524D\u5F80\u8BBE\u7F6E\u914D\u7F6E\u8FDE\u63A5" onClick="{{ s.config }}">\u914D\u7F6E</button></sc-if>
          </div>
          <div onClick="{{ s.pick }}" style="cursor:pointer;font:400 10.5px/1.5 var(--mono);color:var(--dim2);word-break:break-all">{{ s.meta }}</div>
        </div>
      </sc-for>
      <div style="display:flex;gap:6px">
        <button class="btn btn-secondary" style="flex:1;font-size:12px" onClick="{{ fs.browsePath }}"><i class="ph ph-folder-open" style="font-size:13px;margin-right:4px"></i>\u6D4F\u89C8\u670D\u52A1\u7AEF\u76EE\u5F55</button>
        <button class="btn btn-ghost" style="font-size:12px" onClick="{{ fs.goSettings }}">\u8FDE\u63A5\u914D\u7F6E</button>
      </div>
      <hr class="hr" style="margin:2px 0">
      <div class="field"><label>\u6587\u4EF6\u540D\u641C\u7D22</label><input class="input" placeholder="\u5173\u952E\u8BCD / \u756A\u53F7" value="{{ fs.q }}" onChange="{{ fs.setQ }}"></div>
      <label style="display:flex;align-items:center;gap:8px;font-size:13px;color:var(--dim);cursor:pointer"><input type="checkbox" style="accent-color:var(--acc);width:14px;height:14px" checked="{{ fs.videoOnly }}" onChange="{{ fs.toggleVideo }}">\u4EC5\u663E\u793A\u89C6\u9891\u6587\u4EF6</label>
      <div class="field"><label>\u6700\u5C0F\u4F53\u79EF min_file_size_mb</label><select class="input" value="{{ fs.minSize }}" onChange="{{ fs.setMinSize }}"><option>\u4E0D\u9650</option><option>\u5927\u4E8E 500 MB</option><option>\u5927\u4E8E 2 GB</option><option>\u5927\u4E8E 8 GB</option></select></div>
      <hr class="hr" style="margin:2px 0">
      <span style="font:600 10px/1 Inter,sans-serif;letter-spacing:.13em;text-transform:uppercase;color:var(--dim2)">Aria2</span>
      <div style="display:flex;align-items:center;gap:6px;font-size:12px;color:{{ fs.ariaFg }}"><span style="width:6px;height:6px;border-radius:50%;background:{{ fs.ariaDot }}"></span>{{ fs.ariaStatus }}</div>
      <div style="font-size:12px;color:var(--dim);line-height:1.7">{{ fs.ariaMeta }}</div>
      <sc-if value="{{ fs.ariaConnected }}">
        <button class="btn btn-secondary btn-block" style="font-size:12.5px" onClick="{{ fs.refreshAria }}">\u5237\u65B0\u4EFB\u52A1\u5217\u8868</button>
      </sc-if>
      <sc-if value="{{ fs.ariaDown }}">
        <button class="btn btn-primary btn-block" style="font-size:12.5px" onClick="{{ fs.connectAria }}">\u7528\u914D\u7F6E\u8FDE\u63A5</button>
      </sc-if>
    </aside>

    <main style="flex:1;min-width:0;padding:14px 20px 26px;display:flex;flex-direction:column;gap:13px;overflow:auto">
      <div style="display:flex;align-items:flex-end;gap:14px;flex-wrap:wrap">
        <div><h4 style="margin:0 0 2px">\u7F51\u76D8\u4E0E\u4E0B\u8F7D\u7BA1\u7406</h4><span style="font-size:12.5px;color:var(--dim)">{{ fs.subtitle }}</span></div>
      </div>

      <sc-if value="{{ fs.offline }}">
        <div style="background:rgba(224,129,136,.07);box-shadow:inset 0 0 0 1px rgba(224,129,136,.35);border-radius:8px;padding:20px 22px;display:flex;gap:15px;align-items:flex-start">
          <i class="ph ph-warning-circle" style="font-size:19px;color:var(--bad);flex:none;margin-top:1px"></i>
          <div style="flex:1">
            <h5 style="margin:0 0 4px;color:var(--bad)">115 \u7F51\u76D8\u672A\u914D\u7F6E</h5>
            <p style="margin:0 0 12px;font-size:13px;color:var(--dim)">\u7F3A\u5C11 Cookie\uFF0C\u65E0\u6CD5\u5217\u76EE\u5F55\u6216\u63D0\u4EA4\u79BB\u7EBF\u4EFB\u52A1\u3002\u5728\u8BBE\u7F6E\u4E2D\u586B\u5199 <code style="font-family:var(--mono);font-size:12px;color:var(--accs)">cookie_115</code> \u540E\u91CD\u65B0\u8FDE\u63A5\u3002</p>
            <button class="btn btn-primary" onClick="{{ fs.goSettings }}">\u524D\u5F80\u8BBE\u7F6E</button>
          </div>
        </div>
      </sc-if>

      <sc-if value="{{ fs.showFiles }}">
        <div style="display:flex;align-items:center;gap:8px;background:var(--surf);border-radius:8px;box-shadow:0 0 0 1px var(--ring);padding:9px 13px;flex-wrap:wrap">
          <sc-for list="{{ fs.crumbs }}" as="c" hint-placeholder-count="3">
            <button onClick="{{ c.go }}" style="appearance:none;background:none;border:0;cursor:pointer;font:400 12.5px/1 var(--mono);color:{{ c.fg }};padding:2px 3px">{{ c.name }}</button>
          </sc-for>
          <span style="margin-left:auto;font-size:11.5px;color:var(--dim2)">{{ fs.dirMeta }}</span>
        </div>

        <div style="background:var(--surf);border-radius:8px;box-shadow:0 0 0 1px var(--ring);overflow:hidden">
          <table class="table">
            <thead><tr><th style="width:34px"><input type="checkbox" style="accent-color:var(--acc);width:14px;height:14px" checked="{{ fs.allSel }}" onChange="{{ fs.toggleAll }}"></th><th>\u540D\u79F0</th><th style="width:96px">\u7C7B\u578B</th><th style="width:96px">\u4F53\u79EF</th><th style="width:132px">\u4FEE\u6539\u65F6\u95F4</th><th style="width:96px">\u64CD\u4F5C</th></tr></thead>
            <tbody>
              <sc-for list="{{ fs.rows }}" as="f" hint-placeholder-count="8">
                <tr>
                  <td><input type="checkbox" style="accent-color:var(--acc);width:14px;height:14px" checked="{{ f.sel }}" disabled="{{ f.isDir }}" onChange="{{ f.toggle }}"></td>
                  <td><div style="display:flex;align-items:center;gap:8px"><i class="ph {{ f.icon }}" style="color:{{ f.iconFg }};font-size:15px;flex:none"></i><span onClick="{{ f.open }}" style="cursor:{{ f.cursor }};font:400 12.5px/1.4 var(--mono);color:{{ f.fg }};max-width:520px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">{{ f.name }}</span></div></td>
                  <td style="font-size:12px;color:var(--dim)">{{ f.type }}</td>
                  <td style="font-family:var(--mono);font-size:12px;color:var(--dim)">{{ f.size }}</td>
                  <td style="font-family:var(--mono);font-size:11.5px;color:var(--dim2)">{{ f.date }}</td>
                  <td><button class="btn btn-secondary" style="font-size:11.5px;padding:3px 7px" disabled="{{ f.isDir }}" onClick="{{ f.send }}">\u53D1\u9001</button></td>
                </tr>
              </sc-for>
            </tbody>
          </table>
        </div>
      </sc-if>

      <sc-if value="{{ fs.jobs115 }}">
        <div style="background:var(--surf);border-radius:8px;box-shadow:0 0 0 1px var(--ring);overflow:hidden">
          <div style="display:flex;align-items:center;gap:12px;padding:11px 14px;box-shadow:inset 0 -1px 0 var(--line2)">
            <h5 style="margin:0">115 \u79BB\u7EBF\u4EFB\u52A1</h5>
            <span style="font-size:11.5px;color:var(--dim2)">\u6BCF 5s \u8F6E\u8BE2 \xB7 \u79BB\u7EBF\u76EE\u5F55 /JavJaeger</span>
            <button class="btn btn-secondary" style="margin-left:auto;font-size:12px" onClick="{{ fs.refreshJobs }}">\u5237\u65B0</button>
          </div>
          <table class="table">
            <thead><tr><th style="width:96px">\u756A\u53F7</th><th>\u4EFB\u52A1\u540D</th><th style="width:104px">\u72B6\u6001</th><th style="width:150px">\u8FDB\u5EA6</th><th style="width:96px">\u4F53\u79EF</th><th style="width:74px">\u64CD\u4F5C</th></tr></thead>
            <tbody>
              <sc-for list="{{ fs.jobs115 }}" as="j" hint-placeholder-count="3">
                <tr>
                  <td><span style="font:500 12px/1 var(--mono);color:var(--acc)">{{ j.code }}</span></td>
                  <td><div style="font:400 11.5px/1.4 var(--mono);max-width:420px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:{{ j.fg }}">{{ j.name }}</div></td>
                  <td><span style="display:inline-flex;align-items:center;gap:6px;font-size:12px;color:{{ j.stFg }}"><span style="width:5px;height:5px;border-radius:50%;background:{{ j.stFg }}"></span>{{ j.status }}</span></td>
                  <td><div style="height:4px;border-radius:2px;background:var(--t08);overflow:hidden;margin-bottom:4px"><div style="height:100%;width:{{ j.pct }}%;background:{{ j.stFg }}"></div></div><div style="font:400 10.5px/1.3 var(--mono);color:var(--dim2)">{{ j.pctText }}</div></td>
                  <td style="font-family:var(--mono);font-size:12px;color:var(--dim)">{{ j.size }}</td>
                  <td><button class="btn btn-secondary" style="font-size:11.5px;padding:3px 7px" onClick="{{ j.del }}">\u5220\u9664</button></td>
                </tr>
              </sc-for>
            </tbody>
          </table>
        </div>
      </sc-if>

      <div style="background:var(--surf);border-radius:8px;box-shadow:0 0 0 1px var(--ring);overflow:hidden">
        <div style="display:flex;align-items:center;gap:12px;padding:11px 14px;box-shadow:inset 0 -1px 0 var(--line2)">
          <h5 style="margin:0">Aria2 \u4EFB\u52A1</h5>
          <span style="font-size:11.5px;color:var(--dim2)">\u6BCF 1s \u8F6E\u8BE2 \xB7 \u5168\u5C40\u5E76\u53D1 5</span>
          <button class="btn btn-secondary" style="margin-left:auto;font-size:12px" onClick="{{ fs.pauseAll }}">\u5168\u90E8\u6682\u505C</button>
        </div>
        <table class="table">
          <thead><tr><th>\u4EFB\u52A1</th><th style="width:112px">\u72B6\u6001</th><th style="width:200px">\u8FDB\u5EA6</th><th style="width:104px">\u901F\u5EA6</th><th style="width:96px">\u5269\u4F59</th><th style="width:180px">\u64CD\u4F5C</th></tr></thead>
          <tbody>
            <sc-for list="{{ fs.tasks }}" as="t" hint-placeholder-count="4">
              <tr>
                <td><div style="font:400 12px/1.4 var(--mono);max-width:400px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:{{ t.fg }}">{{ t.name }}</div><div style="font-size:10.5px;color:var(--dim2);margin-top:2px">{{ t.dir }}</div></td>
                <td><span style="display:inline-flex;align-items:center;gap:6px;font-size:12px;color:{{ t.stFg }}"><span style="width:5px;height:5px;border-radius:50%;background:{{ t.stFg }}"></span>{{ t.status }}</span></td>
                <td><div style="height:4px;border-radius:2px;background:var(--t08);overflow:hidden;margin-bottom:4px"><div style="height:100%;width:{{ t.pct }}%;background:{{ t.stFg }}"></div></div><div style="font:400 10.5px/1.3 var(--mono);color:var(--dim2)">{{ t.sizeText }}</div></td>
                <td style="font-family:var(--mono);font-size:12px;color:var(--dim)">{{ t.speed }}</td>
                <td style="font-family:var(--mono);font-size:11.5px;color:var(--dim2)">{{ t.eta }}</td>
                <td><div style="display:flex;gap:5px">
                  <sc-if value="{{ t.canPause }}"><button class="btn btn-secondary" style="font-size:11.5px;padding:3px 7px" onClick="{{ t.pause }}">\u6682\u505C</button></sc-if>
                  <sc-if value="{{ t.canResume }}"><button class="btn btn-secondary" style="font-size:11.5px;padding:3px 7px" onClick="{{ t.resume }}">\u7EE7\u7EED</button></sc-if>
                  <button class="btn btn-primary" style="font-size:11.5px;padding:3px 7px;color:var(--bad);border-color:var(--bad)" onClick="{{ t.del }}">\u5220\u9664</button>
                </div></td>
              </tr>
            </sc-for>
          </tbody>
        </table>
      </div>
    </main>
  </div>
  </sc-if>

  <sc-if value="{{ fs.selCount }}">
    <div style="position:absolute;left:50%;transform:translateX(-50%);bottom:22px;display:flex;align-items:center;gap:14px;background:var(--elev2);border-radius:10px;box-shadow:0 0 0 1px var(--elevr),0 16px 40px rgba(0,0,0,.65);padding:10px 14px;animation:jjrise-c 160ms ease-out">
      <span style="font-size:13px">\u5DF2\u9009 <b style="color:var(--acc);font-family:var(--mono)">{{ fs.selCount }}</b> \u4E2A\u6587\u4EF6 \xB7 {{ fs.selSize }}</span>
      <span style="width:1px;height:20px;background:var(--line)"></span>
      <button class="btn btn-primary" onClick="{{ fs.sendSel }}">\u53D1\u9001\u5230 Aria2</button>
      <button class="btn btn-ghost" onClick="{{ fs.clearSel }}">\u53D6\u6D88\u9009\u62E9</button>
    </div>
  </sc-if>

  <sc-if value="{{ fs.addForm }}">
    <div class="dialog-backdrop" style="position:absolute;background:var(--ovl)">
      <div class="dialog elev-lg" style="width:452px;animation:jjrise 160ms ease-out">
        <div class="dialog-title">{{ fs.addForm.title }}</div>
        <div class="dialog-body" style="margin-bottom:2px">{{ fs.addForm.desc }}</div>
        <div style="display:flex;align-items:center;gap:7px;border-radius:6px;background:var(--surf2);box-shadow:inset 0 0 0 1px var(--line2);padding:8px 11px">
          <i class="ph ph-folder-open" style="font-size:14px;color:var(--acc)"></i>
          <span style="font:400 12px/1 var(--mono);color:var(--dim)">{{ fs.addForm.path }}</span>
        </div>
        <div style="border-radius:7px;box-shadow:inset 0 0 0 1px var(--line2);overflow:hidden;max-height:230px;overflow-y:auto">
          <sc-for list="{{ fs.addForm.entries }}" as="e" hint-placeholder-count="5">
            <div style="display:flex;align-items:center;gap:9px;padding:9px 12px;box-shadow:inset 0 -1px 0 var(--line2)">
              <i class="ph ph-folder" style="font-size:14px;color:var(--acc);flex:none"></i>
              <span style="font:400 12.5px/1 var(--mono)">{{ e.name }}</span>
              <span style="margin-left:auto;font-size:11px;color:var(--dim2)">{{ e.meta }}</span>
            </div>
          </sc-for>
        </div>
        <div class="dialog-actions">
          <button class="btn btn-secondary" onClick="{{ fs.closeAdd }}">\u53D6\u6D88</button>
          <button class="btn btn-primary" onClick="{{ fs.pickPath }}">\u4F7F\u7528\u8BE5\u76EE\u5F55</button>
        </div>
      </div>
    </div>
  </sc-if>

  <sc-if value="{{ at.settings }}">
  <div style="display:flex;align-items:stretch;min-height:848px">
    <aside style="width:222px;flex:none;background:var(--surf2);box-shadow:inset -1px 0 0 var(--line2);padding:15px 12px 22px;display:flex;flex-direction:column;gap:3px;overflow:auto">
      <span style="font:600 10px/1 Inter,sans-serif;letter-spacing:.13em;text-transform:uppercase;color:var(--dim2);padding:0 8px 8px">\u8BBE\u7F6E</span>
      <sc-for list="{{ se.tabs }}" as="t" hint-placeholder-count="9">
        <button onClick="{{ t.pick }}" style="appearance:none;cursor:pointer;text-align:left;background:{{ t.bg }};border:0;border-radius:6px;padding:8px 9px;display:flex;align-items:center;gap:8px;color:{{ t.fg }};font:{{ t.fw }} 13px/1.3 Inter,sans-serif">
          <span style="width:6px;height:6px;border-radius:50%;background:{{ t.dot }};flex:none"></span>{{ t.name }}
          <span style="margin-left:auto;font-size:10.5px;color:{{ t.stFg }}">{{ t.status }}</span>
        </button>
      </sc-for>
    </aside>

    <main style="flex:1;min-width:0;padding:16px 22px 26px;display:flex;flex-direction:column;gap:14px;overflow:auto">
      <div style="display:flex;align-items:flex-end;gap:14px">
        <div><h4 style="margin:0 0 2px">{{ se.cur.title }}</h4><span style="font-size:12.5px;color:var(--dim)">{{ se.cur.desc }}</span></div>
        <div style="margin-left:auto;display:flex;gap:8px">
          <sc-if value="{{ se.cur.canTest }}"><button class="btn btn-secondary" onClick="{{ se.test }}">\u6D4B\u8BD5\u8FDE\u63A5</button></sc-if>
          <button class="btn btn-secondary" onClick="{{ se.reload }}">\u91CD\u65B0\u8F7D\u5165</button>
          <button class="btn btn-ghost" onClick="{{ se.reset }}">\u91CD\u7F6E\u6539\u52A8</button>
          <button class="btn btn-primary" onClick="{{ se.save }}">\u4FDD\u5B58</button>
        </div>
      </div>

      <sc-if value="{{ se.isOverview }}">
        <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:12px">
          <sc-for list="{{ se.overview }}" as="o" hint-placeholder-count="9">
            <div style="background:var(--surf);border-radius:8px;box-shadow:0 0 0 1px {{ o.ring }};padding:13px 14px;display:flex;flex-direction:column;gap:6px">
              <div style="display:flex;align-items:center;gap:8px"><span style="width:6px;height:6px;border-radius:50%;background:{{ o.dot }}"></span><span style="font:500 13.5px/1 Inter,sans-serif">{{ o.name }}</span><span style="margin-left:auto;font-size:11px;color:{{ o.stFg }}">{{ o.status }}</span></div>
              <div style="font:400 11px/1.55 var(--mono);color:var(--dim2);word-break:break-all;min-height:34px">{{ o.meta }}</div>
              <button class="btn btn-secondary" style="font-size:11.5px;padding:4px 8px;align-self:flex-start" onClick="{{ o.go }}">{{ o.action }}</button>
            </div>
          </sc-for>
        </div>
      </sc-if>

      <sc-if value="{{ se.isAppearance }}">
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px">
          <sc-for list="{{ se.themes }}" as="t" hint-placeholder-count="2">
            <div onClick="{{ t.pick }}" style="cursor:pointer;background:var(--surf);border-radius:9px;box-shadow:0 0 0 1px {{ t.ringOuter }};padding:14px;display:flex;flex-direction:column;gap:11px">
              <div style="border-radius:7px;overflow:hidden;box-shadow:0 0 0 1px var(--line2);background:{{ t.bg }}">
                <div style="height:22px;display:flex;align-items:center;gap:5px;padding:0 9px;background:{{ t.surf }};box-shadow:inset 0 -1px 0 {{ t.ring }}">
                  <span style="width:8px;height:8px;border-radius:2px;background:{{ t.acc }}"></span>
                  <span style="width:30px;height:4px;border-radius:2px;background:{{ t.fg }};opacity:.7"></span>
                  <span style="width:18px;height:4px;border-radius:2px;background:{{ t.dim }}"></span>
                  <span style="margin-left:auto;width:12px;height:4px;border-radius:2px;background:{{ t.dim }}"></span>
                </div>
                <div style="display:flex;gap:8px;padding:10px 9px 12px">
                  <div style="width:46px;display:flex;flex-direction:column;gap:5px">
                    <span style="height:4px;border-radius:2px;background:{{ t.dim }}"></span>
                    <span style="height:20px;border-radius:3px;background:{{ t.surf }};box-shadow:inset 0 0 0 1px {{ t.ring }}"></span>
                    <span style="height:20px;border-radius:3px;background:{{ t.surf }};box-shadow:inset 0 0 0 1px {{ t.ring }}"></span>
                    <span style="height:9px;border-radius:3px;background:{{ t.acc }}"></span>
                  </div>
                  <div style="flex:1;display:flex;flex-direction:column;gap:6px">
                    <div style="display:flex;gap:6px">
                      <span style="flex:1;height:26px;border-radius:4px;background:{{ t.surf }};box-shadow:inset 0 0 0 1px {{ t.ring }}"></span>
                      <span style="flex:1;height:26px;border-radius:4px;background:{{ t.surf }};box-shadow:inset 0 0 0 1px {{ t.ring }}"></span>
                      <span style="flex:1;height:26px;border-radius:4px;background:{{ t.surf }};box-shadow:inset 0 0 0 1px {{ t.ring }}"></span>
                    </div>
                    <div style="border-radius:4px;background:{{ t.surf }};box-shadow:inset 0 0 0 1px {{ t.ring }};padding:7px 8px;display:flex;flex-direction:column;gap:5px">
                      <span style="height:4px;width:70%;border-radius:2px;background:{{ t.fg }};opacity:.75"></span>
                      <span style="height:4px;width:52%;border-radius:2px;background:{{ t.dim }}"></span>
                      <span style="height:4px;width:61%;border-radius:2px;background:{{ t.dim }}"></span>
                    </div>
                  </div>
                </div>
              </div>
              <div style="display:flex;align-items:baseline;gap:8px">
                <span style="font:500 14px/1 Inter,sans-serif">{{ t.name }}</span>
                <span class="tag" style="background:{{ t.badgeBg }};color:{{ t.badgeFg }};font-size:10.5px;padding:2px 6px">{{ t.badge }}</span>
              </div>
              <span style="font-size:12px;color:var(--dim);line-height:1.5">{{ t.desc }}</span>
            </div>
          </sc-for>
        </div>
        <div style="background:var(--surf);border-radius:8px;box-shadow:0 0 0 1px var(--ring);padding:13px 15px;display:flex;align-items:flex-start;gap:11px">
          <i class="ph ph-film-strip" style="font-size:17px;color:var(--acc);flex:none;margin-top:1px"></i>
          <div style="font-size:12.5px;color:var(--dim);line-height:1.6">\u5F71\u9662\u6A21\u5F0F\u59CB\u7EC8\u4FDD\u6301\u6697\u8272\u5F71\u5385\uFF0C\u4E0D\u968F\u6B64\u8BBE\u7F6E\u53D8\u5316 \u2014\u2014 \u89C2\u5F71\u754C\u9762\u4EE5\u6D77\u62A5\u4E0E\u753B\u9762\u4E3A\u4E3B\u4F53\uFF0C\u6D45\u8272\u5E95\u4F1A\u524A\u5F31\u5BF9\u6BD4\u3002<br>\u4E3B\u9898\u53EA\u5F71\u54CD\u7BA1\u7406\u754C\u9762\u7684\u4E5D\u4E2A\u6A21\u5757\uFF0C\u5207\u6362\u5373\u65F6\u751F\u6548\uFF0C\u504F\u597D\u968F\u8BBE\u7F6E\u4E00\u8D77\u4FDD\u5B58\u3002</div>
        </div>
      </sc-if>

      <sc-if value="{{ se.isSources }}">
        <div style="background:var(--surf);border-radius:8px;box-shadow:0 0 0 1px var(--ring);padding:16px 18px">
          <div style="display:flex;align-items:baseline;gap:10px;margin-bottom:12px"><h5 style="margin:0">\u522E\u524A\u6E90\u4F18\u5148\u7EA7</h5><button class="btn btn-ghost" style="font-size:11.5px;padding:2px 6px;order:3" onClick="{{ se.applyTestResults }}">\u6309\u6D4B\u8BD5\u7ED3\u679C\u5199\u56DE</button><span style="font-size:11.5px;color:var(--dim2)">\u6309\u987A\u5E8F\u4F9D\u6B21\u5C1D\u8BD5\uFF0C\u524D\u4E00\u4E2A\u5931\u8D25\u624D\u4F1A\u8BF7\u6C42\u4E0B\u4E00\u4E2A</span></div>
          <div style="display:flex;flex-direction:column;gap:8px">
            <sc-for list="{{ se.sources }}" as="s" hint-placeholder-count="4">
              <div style="display:flex;align-items:center;gap:12px;border-radius:7px;background:var(--t03);box-shadow:inset 0 0 0 1px {{ s.ring }};padding:11px 13px;opacity:{{ s.op }}">
                <span style="font:500 12px/1 var(--mono);color:var(--dim2);width:16px">{{ s.order }}</span>
                <div style="min-width:150px"><div style="font:500 13px/1 Inter,sans-serif;margin-bottom:3px">{{ s.name }}</div><div style="font:400 10.5px/1 var(--mono);color:var(--dim2)">{{ s.host }}</div></div>
                <div style="display:flex;align-items:center;gap:6px;min-width:140px"><span style="width:6px;height:6px;border-radius:50%;background:{{ s.dot }}"></span><span style="font-size:12px;color:{{ s.stFg }}">{{ s.status }}</span></div>
                <span style="font:400 11.5px/1 var(--mono);color:var(--dim);min-width:96px">{{ s.latency }}</span>
                <span style="font-size:11.5px;color:var(--dim2);flex:1">{{ s.note }}</span>
                <div style="display:flex;gap:5px">
                  <button class="btn btn-secondary" style="font-size:11.5px;padding:3px 7px" disabled="{{ s.upDisabled }}" onClick="{{ s.up }}">\u4E0A\u79FB</button>
                  <button class="btn btn-secondary" style="font-size:11.5px;padding:3px 7px" onClick="{{ s.test }}">\u6D4B\u8BD5</button>
                  <button class="btn btn-secondary" style="font-size:11.5px;padding:3px 7px" onClick="{{ s.toggle }}">{{ s.toggleText }}</button>
                </div>
              </div>
            </sc-for>
          </div>
        </div>
      </sc-if>

      <sc-if value="{{ se.isForm }}">
        <div style="background:var(--surf);border-radius:8px;box-shadow:0 0 0 1px var(--ring);padding:18px 20px">
          <sc-if value="{{ se.cur.banner }}">
            <div style="border-radius:7px;background:{{ se.cur.bannerBg }};box-shadow:inset 0 0 0 1px {{ se.cur.bannerRing }};padding:11px 13px;margin-bottom:16px;display:flex;align-items:center;gap:11px">
              <span style="width:6px;height:6px;border-radius:50%;background:{{ se.cur.bannerFg }};flex:none"></span>
              <span style="font-size:12.5px;color:var(--dim)">{{ se.cur.banner }}</span>
              <span style="margin-left:auto;font:400 11px/1 var(--mono);color:var(--dim2)">{{ se.cur.bannerMeta }}</span>
            </div>
          </sc-if>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:15px 20px">
            <sc-for list="{{ se.fields }}" as="f" hint-placeholder-count="6">
              <div class="field" style="grid-column:{{ f.span }}">
                <label>{{ f.label }}<span style="color:{{ f.reqFg }};margin-left:4px">{{ f.req }}</span></label>
                <sc-if value="{{ f.isText }}"><input class="input" style="font-family:{{ f.mono }};letter-spacing:{{ f.ls }}" placeholder="{{ f.placeholder }}" value="{{ f.value }}" onChange="{{ f.set }}"></sc-if>
                <sc-if value="{{ f.isSecret }}">
                  <div style="display:flex;gap:7px;align-items:center">
                    <input class="input" style="font-family:var(--mono);letter-spacing:.08em;flex:1" placeholder="{{ f.placeholder }}" value="{{ f.value }}" onChange="{{ f.set }}">
                    <button class="btn btn-secondary" style="font-size:11.5px;padding:6px 9px;flex:none" onClick="{{ f.reveal }}">{{ f.revealText }}</button>
                  </div>
                </sc-if>
                <sc-if value="{{ f.isSelect }}"><select class="input" value="{{ f.value }}" onChange="{{ f.set }}"><sc-for list="{{ f.options }}" as="o" hint-placeholder-count="3"><option>{{ o.t }}</option></sc-for></select></sc-if>
                <sc-if value="{{ f.isCheck }}"><label style="display:flex;align-items:flex-start;gap:8px;font-size:13px;color:var(--dim);cursor:pointer;min-height:34px"><input type="checkbox" style="accent-color:var(--acc);width:14px;height:14px;margin-top:2px" checked="{{ f.on }}" onChange="{{ f.set }}">{{ f.checkLabel }}</label></sc-if>
                <sc-if value="{{ f.isStatus }}"><div style="display:flex;align-items:center;gap:7px;min-height:34px"><span style="width:6px;height:6px;border-radius:50%;background:{{ f.statusFg }};flex:none"></span><span style="font:400 12.5px/1.4 var(--mono);color:{{ f.statusFg }}">{{ f.value }}</span></div></sc-if>
                <span style="font-size:11px;color:{{ f.hintFg }};margin-top:4px;display:block;line-height:1.5">{{ f.hint }}</span>
              </div>
            </sc-for>
          </div>
        </div>
      </sc-if>
    </main>
  </div>
  </sc-if>

  <sc-if value="{{ s.batchOpen }}">
    <div style="position:absolute;left:50%;transform:translateX(-50%);bottom:22px;display:flex;align-items:center;gap:14px;background:var(--elev2);border-radius:10px;box-shadow:0 0 0 1px var(--elevr),0 16px 40px rgba(0,0,0,.65);padding:10px 14px;animation:jjrise-c 160ms ease-out">
      <span style="font-size:13px">\u5DF2\u9009 <b style="color:var(--acc);font-family:var(--mono)">{{ s.selCount }}</b> \u90E8 \xB7 \u9884\u8BA1 {{ s.selSize }}</span>
      <span style="width:1px;height:20px;background:var(--line)"></span>
      <span style="font-size:11.5px;color:var(--dim)">{{ s.selNote }}</span>
      <button class="btn btn-primary" onClick="{{ s.batchDispatch }}">\u6279\u91CF\u6D3E\u53D1\u5230 {{ s.tool }}</button>
      <button class="btn btn-secondary" onClick="{{ s.batchAuto }}">\u52A0\u5165\u81EA\u52A8\u4EFB\u52A1</button>
      <button class="btn btn-ghost" onClick="{{ s.clearSel }}">\u53D6\u6D88\u9009\u62E9</button>
    </div>
  </sc-if>

  <sc-if value="{{ s.detail }}">
    <div style="position:absolute;inset:0;background:var(--ovl6)" onClick="{{ s.closeDetail }}"></div>
    <aside style="position:absolute;top:0;right:0;bottom:0;width:660px;background:var(--elev);box-shadow:-1px 0 0 var(--ring),-24px 0 60px rgba(0,0,0,.55);display:flex;flex-direction:column;animation:jjrise 180ms ease-out">
      <div style="display:flex;align-items:center;gap:12px;padding:14px 18px;box-shadow:inset 0 -1px 0 var(--line)">
        <span style="font:500 14px/1 var(--mono);color:var(--acc)">{{ s.d.code }}</span>
        <span style="font-size:13px;color:var(--dim);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">{{ s.d.title }}</span>
        <button class="btn btn-ghost" style="margin-left:auto" onClick="{{ s.closeDetail }}">\u5173\u95ED</button>
      </div>
      <div style="flex:1;overflow:auto;padding:16px 18px 22px;display:flex;flex-direction:column;gap:16px">
        <div style="display:flex;gap:16px">
          <div style="width:246px;flex:none;aspect-ratio:3/2;border-radius:6px;background:linear-gradient(142deg,var(--ph1),var(--ph2));display:grid;place-items:center;font:500 12px/1 var(--mono);letter-spacing:.16em;color:var(--t30)">{{ s.d.code }}</div>
          <div style="flex:1;display:grid;grid-template-columns:auto 1fr;gap:6px 12px;align-content:start;font-size:12.5px">
            <span style="color:var(--dim2)">\u53D1\u884C\u65E5\u671F</span><span style="font-family:var(--mono)">{{ s.d.date }}</span>
            <span style="color:var(--dim2)">\u65F6\u957F</span><span style="font-family:var(--mono)">{{ s.d.dur }}</span>
            <span style="color:var(--dim2)">\u5236\u4F5C\u5546</span><span>{{ s.d.studio }}</span>
            <span style="color:var(--dim2)">\u53D1\u884C\u5546</span><span>{{ s.d.label }}</span>
            <span style="color:var(--dim2)">\u7CFB\u5217</span><span>{{ s.d.series }}</span>
            <span style="color:var(--dim2)">\u5BFC\u6F14</span><span>{{ s.d.director }}</span>
            <span style="color:var(--dim2)">\u672C\u5730\u72B6\u6001</span><span style="color:{{ s.d.statusColor }}">{{ s.d.statusText }}</span>
          </div>
        </div>
        <div>
          <h6 style="margin:0 0 8px;color:var(--dim)">\u6F14\u5458</h6>
          <div style="display:flex;gap:8px;flex-wrap:wrap">
            <sc-for list="{{ s.d.actors }}" as="a" hint-placeholder-count="2">
              <span style="display:inline-flex;align-items:center;gap:7px;padding:4px 10px 4px 4px;border-radius:20px;background:var(--t05);font-size:12.5px"><span style="width:22px;height:22px;border-radius:50%;background:var(--av2);display:grid;place-items:center;font-size:10px;color:var(--dim2)">{{ a.initial }}</span>{{ a.name }}</span>
            </sc-for>
          </div>
        </div>
        <div>
          <h6 style="margin:0 0 8px;color:var(--dim)">\u6807\u7B7E</h6>
          <div style="display:flex;gap:6px;flex-wrap:wrap"><sc-for list="{{ s.d.tags }}" as="t" hint-placeholder-count="4"><span class="tag tag-neutral">{{ t.t }}</span></sc-for></div>
        </div>
        <div>
          <div style="display:flex;align-items:baseline;gap:10px;margin-bottom:8px">
            <h6 style="margin:0;color:var(--dim)">\u78C1\u529B\u5217\u8868</h6>
            <span style="font-size:11px;color:var(--dim2)">\u6765\u6E90 {{ s.srcLabel }} \xB7 \u5171 {{ s.d.magCount }} \u6761 \xB7 \u6309\u4F53\u79EF\u964D\u5E8F</span>
            <div class="seg" style="margin-left:auto">
              <label class="seg-opt" style="padding:4px 8px"><input type="radio" name="jj-dsb" checked="{{ s.sortSize }}" onChange="{{ s.setSortSize }}"><span>\u4F53\u79EF</span></label>
              <label class="seg-opt" style="padding:4px 8px"><input type="radio" name="jj-dsb" checked="{{ s.sortDate }}" onChange="{{ s.setSortDate }}"><span>\u65E5\u671F</span></label>
            </div>
          </div>
          <div style="border-radius:8px;box-shadow:0 0 0 1px var(--ring);overflow:hidden;background:var(--surf)">
            <table class="table" style="font-size:12.5px">
              <thead><tr><th>\u8D44\u6E90\u540D</th><th style="width:78px">\u5927\u5C0F</th><th style="width:88px">\u4E2D\u6587\u5B57\u5E55</th><th style="width:84px">\u53D1\u5E03\u65E5\u671F</th><th style="width:64px">\u64CD\u4F5C</th></tr></thead>
              <tbody>
                <sc-for list="{{ s.d.magnets }}" as="g" hint-placeholder-count="4">
                  <tr>
                    <td><div style="display:flex;align-items:center;gap:6px"><span style="font:400 11.5px/1.3 var(--mono);color:{{ g.fg }};max-width:250px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">{{ g.name }}</span><sc-for list="{{ g.flags }}" as="f" hint-placeholder-count="0"><span style="font:500 10px/1 Inter;padding:2px 4px;border-radius:3px;background:{{ f.bg }};color:{{ f.fg }}">{{ f.t }}</span></sc-for></div></td>
                    <td style="font-family:var(--mono);color:var(--dim)">{{ g.size }}</td>
                    <td><span style="font-size:11.5px;color:{{ g.subFg }}">{{ g.sub }}</span></td>
                    <td style="font-family:var(--mono);color:var(--dim2);font-size:11.5px">{{ g.date }}</td>
                    <td><button class="btn btn-primary" style="font-size:11px;padding:3px 7px" onClick="{{ g.dispatch }}">\u6D3E\u53D1</button></td>
                  </tr>
                </sc-for>
              </tbody>
            </table>
          </div>
        </div>
      </div>
      <div style="padding:12px 18px;box-shadow:inset 0 1px 0 var(--line);display:flex;gap:8px;align-items:center">
        <span style="font-size:11.5px;color:var(--dim2)">\u9ED8\u8BA4\u6D3E\u53D1\u5DE5\u5177 {{ s.tool }}</span>
        <button class="btn btn-primary" style="margin-left:auto" onClick="{{ s.d.dispatchBest }}">\u6D3E\u53D1\u6700\u4F73\u78C1\u529B</button>
        <button class="btn btn-secondary" onClick="{{ s.d.copy }}">\u590D\u5236\u756A\u53F7</button>
      </div>
    </aside>
  </sc-if>

  <sc-if value="{{ s.toolCfg }}">
    <div class="dialog-backdrop" style="position:absolute;background:var(--ovl)">
      <div class="dialog elev-lg" style="width:472px;animation:jjrise 160ms ease-out">
        <div class="dialog-title">\u4E0B\u8F7D\u5DE5\u5177 \xB7 {{ s.toolCfg.name }}</div>
        <div class="dialog-body" style="margin-bottom:2px">{{ s.toolCfg.desc }}</div>
        <div style="border-radius:8px;background:var(--surf2);box-shadow:inset 0 0 0 1px var(--line2);padding:12px 14px;display:flex;flex-direction:column;gap:9px">
          <div style="display:flex;align-items:center;gap:8px"><span style="width:6px;height:6px;border-radius:50%;background:{{ s.toolCfg.dot }}"></span><span style="font-size:12.5px;color:{{ s.toolCfg.fg }}">{{ s.toolCfg.status }}</span></div>
          <div style="display:grid;grid-template-columns:auto 1fr;gap:5px 12px;font-size:12px">
            <sc-for list="{{ s.toolCfg.fields }}" as="f" hint-placeholder-count="3"><span style="color:var(--dim2)">{{ f.k }}</span><span style="font-family:var(--mono);font-size:11.5px;word-break:break-all">{{ f.v }}</span></sc-for>
          </div>
        </div>
        <sc-if value="{{ s.toolCfg.qr }}">
          <div style="display:flex;gap:13px;align-items:center;border-radius:8px;background:var(--surf2);box-shadow:inset 0 0 0 1px var(--line2);padding:12px 14px">
            <div style="width:88px;height:88px;flex:none;border-radius:6px;background:repeating-conic-gradient(var(--av2) 0% 25%,var(--surf2) 0% 50%) 50%/12px 12px;box-shadow:inset 0 0 0 1px var(--line)"></div>
            <div style="font-size:12px;color:var(--dim);line-height:1.6">{{ s.toolCfg.qrText }}<br><span style="font:400 11px/1 var(--mono);color:var(--dim2)">{{ s.toolCfg.qrState }}</span></div>
          </div>
        </sc-if>
        <div class="dialog-actions">
          <button class="btn btn-ghost" onClick="{{ s.toolCfg.goSettings }}">\u6253\u5F00\u8BBE\u7F6E</button>
          <button class="btn btn-secondary" onClick="{{ s.closeToolCfg }}">\u5173\u95ED</button>
          <sc-if value="{{ s.toolCfg.canAct }}"><button class="btn btn-primary" style="color:{{ s.toolCfg.actFg }};border-color:{{ s.toolCfg.actFg }}" onClick="{{ s.toolCfg.act }}">{{ s.toolCfg.actText }}</button></sc-if>
        </div>
      </div>
    </div>
  </sc-if>

  <sc-if value="{{ s.browse }}">
    <div style="position:absolute;inset:0;background:var(--ovl)" onClick="{{ s.closeBrowse }}"></div>
    <div style="position:absolute;left:50%;top:64px;transform:translateX(-50%);width:820px;max-height:760px;background:var(--elev);border-radius:10px;box-shadow:0 0 0 1px var(--elevr),0 20px 50px rgba(0,0,0,.6);display:flex;flex-direction:column;animation:jjrise-c 160ms ease-out">
      <div style="display:flex;align-items:center;gap:12px;padding:13px 16px;box-shadow:inset 0 -1px 0 var(--line)">
        <h5 style="margin:0">{{ s.browse.title }}</h5>
        <span style="font-size:11.5px;color:var(--dim2)">{{ s.browse.note }}</span>
        <input class="input" style="margin-left:auto;width:210px;min-height:30px;font-size:12.5px" placeholder="\u641C\u7D22\u540D\u79F0\u6216\u4EE3\u7801" value="{{ s.browseQ }}" onChange="{{ s.setBrowseQ }}">
        <button class="btn btn-ghost" onClick="{{ s.closeBrowse }}">\u5173\u95ED</button>
      </div>
      <div style="flex:1;overflow:auto;padding:14px 16px 18px;display:flex;flex-direction:column;gap:14px">
        <sc-for list="{{ s.browse.groups }}" as="g" hint-placeholder-count="3">
          <div>
            <div style="display:flex;align-items:baseline;gap:8px;margin-bottom:8px"><h6 style="margin:0;color:var(--dim)">{{ g.name }}</h6><span style="font:400 10.5px/1 var(--mono);color:var(--dim2)">{{ g.count }}</span></div>
            <sc-if value="{{ g.isActor }}">
              <div style="display:grid;grid-template-columns:repeat(5,1fr);gap:9px">
                <sc-for list="{{ g.items }}" as="it" hint-placeholder-count="5">
                  <button onClick="{{ it.pick }}" style="appearance:none;cursor:pointer;text-align:left;background:{{ it.bg }};border:0;box-shadow:inset 0 0 0 1px {{ it.ring }};border-radius:8px;padding:10px;color:var(--fg);display:flex;flex-direction:column;gap:8px">
                    <div style="position:relative;width:100%;aspect-ratio:1;border-radius:6px;background:linear-gradient(150deg,var(--av),var(--ph4));display:grid;place-items:center;font:400 17px/1 Inter,sans-serif;color:var(--dim2);overflow:hidden">{{ it.initial }}
                      <sc-if value="{{ it.noAvatar }}"><span style="position:absolute;bottom:0;left:0;right:0;padding:3px 5px;background:var(--scrim8);font:400 9.5px/1.3 Inter,sans-serif;color:var(--warn);text-align:center">\u5934\u50CF\u7F3A\u5931</span></sc-if>
                    </div>
                    <div style="min-width:0">
                      <div style="font:400 12.5px/1.3 Inter,sans-serif;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">{{ it.name }}</div>
                      <div style="display:flex;align-items:baseline;gap:6px;margin-top:3px"><span style="font:400 10px/1 var(--mono);color:var(--acc)">{{ it.code }}</span><span style="font:400 10px/1 var(--mono);color:var(--dim2);margin-left:auto">{{ it.count }}</span></div>
                    </div>
                  </button>
                </sc-for>
              </div>
            </sc-if>
            <sc-if value="{{ g.isTag }}">
              <div style="display:flex;gap:7px;flex-wrap:wrap">
                <sc-for list="{{ g.items }}" as="it" hint-placeholder-count="6">
                  <button onClick="{{ it.pick }}" style="appearance:none;cursor:pointer;background:{{ it.bg }};border:0;box-shadow:inset 0 0 0 1px {{ it.ring }};border-radius:6px;padding:6px 10px;color:var(--fg);font:400 12.5px/1.3 Inter,sans-serif;display:flex;align-items:baseline;gap:7px">{{ it.name }}<span style="font:400 10.5px/1 var(--mono);color:var(--dim2)">{{ it.code }}</span></button>
                </sc-for>
              </div>
            </sc-if>
          </div>
        </sc-for>
        <sc-if value="{{ s.browse.empty }}">
          <div style="padding:48px 0;text-align:center;font-size:13px;color:var(--dim)">\u6CA1\u6709\u5339\u914D\u7684{{ s.browse.kind }}\u3002\u4E5F\u53EF\u4EE5\u76F4\u63A5\u5728\u7B5B\u9009\u503C\u91CC\u8F93\u5165\u4EE3\u7801\u3002</div>
        </sc-if>
      </div>
    </div>
  </sc-if>

  <sc-if value="{{ bg.open2 }}">
    <div style="position:absolute;inset:0;background:var(--ovl55)" onClick="{{ bg.close }}"></div>
    <aside style="position:absolute;top:52px;right:16px;width:392px;background:var(--elev);border-radius:10px;box-shadow:0 0 0 1px var(--elevr),0 18px 44px rgba(0,0,0,.6);padding:14px;animation:jjrise 150ms ease-out">
      <div style="display:flex;align-items:baseline;margin-bottom:11px"><h5 style="margin:0">\u540E\u53F0\u4EFB\u52A1</h5><span style="margin-left:auto;font-size:11px;color:var(--dim2)">\u6BCF 2s \u8F6E\u8BE2</span></div>
      <div style="display:flex;flex-direction:column;gap:9px">
        <sc-for list="{{ bg.items }}" as="b" hint-placeholder-count="3">
          <div style="background:var(--surf);border-radius:7px;padding:9px 10px;box-shadow:0 0 0 1px var(--line2)">
            <div style="display:flex;align-items:baseline;gap:8px;margin-bottom:5px"><span style="font-size:10px;letter-spacing:.1em;text-transform:uppercase;color:{{ b.fg }}">{{ b.kind }}</span><span style="font-size:12.5px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">{{ b.name }}</span><span style="margin-left:auto;font:400 11px/1 var(--mono);color:var(--dim)">{{ b.pctText }}</span></div>
            <div style="height:3px;border-radius:2px;background:var(--t08);overflow:hidden"><div style="height:100%;width:{{ b.pct }}%;background:{{ b.fg }}"></div></div>
            <div style="display:flex;gap:8px;margin-top:5px;font:400 10.5px/1.3 var(--mono);color:var(--dim2)"><span>{{ b.meta }}</span><button class="btn btn-ghost" style="margin-left:auto;font-size:10.5px;padding:0 3px" onClick="{{ b.go }}">\u67E5\u770B</button></div>
          </div>
        </sc-for>
      </div>
    </aside>
  </sc-if>

  <sc-if value="{{ dlg.open }}">
    <div class="dialog-backdrop" style="position:absolute;background:var(--ovl)">
      <div class="dialog elev-lg" style="width:452px;animation:jjrise 160ms ease-out">
        <div style="display:flex;gap:11px;align-items:flex-start">
          <i class="ph ph-warning-circle" style="font-size:20px;color:{{ dlg.color }};flex:none;margin-top:1px"></i>
          <div><div class="dialog-title" style="margin-bottom:5px">{{ dlg.title }}</div><div class="dialog-body">{{ dlg.body }}</div></div>
        </div>
        <sc-if value="{{ dlg.hasList }}">
          <div style="background:var(--surf2);border-radius:6px;padding:9px 11px;max-height:132px;overflow:auto;font:400 11.5px/1.7 var(--mono);color:var(--dim)">
            <sc-for list="{{ dlg.list }}" as="l" hint-placeholder-count="3"><div>{{ l.t }}</div></sc-for>
          </div>
        </sc-if>
        <sc-if value="{{ dlg.needsConfirm }}">
          <label style="display:flex;align-items:center;gap:8px;font-size:12.5px;color:var(--dim);cursor:pointer"><input type="checkbox" style="accent-color:{{ dlg.color }};width:14px;height:14px" checked="{{ dlg.acked }}" onChange="{{ dlg.ack }}">{{ dlg.ackText }}</label>
        </sc-if>
        <div class="dialog-actions">
          <button class="btn btn-secondary" onClick="{{ dlg.cancel }}">\u53D6\u6D88</button>
          <button class="btn btn-primary" style="color:{{ dlg.color }};border-color:{{ dlg.color }}" disabled="{{ dlg.blocked }}" onClick="{{ dlg.confirm }}">{{ dlg.okText }}</button>
        </div>
      </div>
    </div>
  </sc-if>

  <sc-if value="{{ toast.open }}">
    <div style="position:absolute;top:64px;left:50%;transform:translateX(-50%);display:flex;align-items:center;gap:9px;background:var(--elev2);border-radius:8px;box-shadow:0 0 0 1px {{ toast.color }},0 10px 30px rgba(0,0,0,.5);padding:9px 14px;font-size:13px;animation:jjrise-c 140ms ease-out;max-width:620px">
      <span style="width:6px;height:6px;border-radius:50%;background:{{ toast.color }};flex:none"></span>{{ toast.text }}
    </div>
  </sc-if>
</div>
</x-dc>
<script type="text/x-dc" data-dc-script data-props="{&quot;$preview&quot;:{&quot;width&quot;:1440,&quot;height&quot;:900},&quot;startRoute&quot;:{&quot;editor&quot;:&quot;enum&quot;,&quot;options&quot;:[&quot;cinema&quot;,&quot;search&quot;,&quot;dispatch&quot;,&quot;scrape&quot;,&quot;library&quot;,&quot;auto&quot;,&quot;transcode&quot;,&quot;storage&quot;,&quot;settings&quot;],&quot;default&quot;:&quot;cinema&quot;,&quot;tsType&quot;:&quot;string&quot;,&quot;section&quot;:&quot;\u6F14\u793A&quot;},&quot;theme&quot;:{&quot;editor&quot;:&quot;enum&quot;,&quot;options&quot;:[&quot;dark&quot;,&quot;light&quot;],&quot;default&quot;:&quot;dark&quot;,&quot;tsType&quot;:&quot;string&quot;,&quot;section&quot;:&quot;\u6F14\u793A&quot;},&quot;demoState&quot;:{&quot;editor&quot;:&quot;enum&quot;,&quot;options&quot;:[&quot;\u6B63\u5E38&quot;,&quot;\u68C0\u7D22\u6765\u6E90\u79BB\u7EBF&quot;,&quot;\u522E\u524A\u672A\u751F\u6210\u9884\u89C8&quot;,&quot;\u5168\u90E8\u5DE5\u5177\u5DF2\u8FDE\u63A5&quot;],&quot;default&quot;:&quot;\u6B63\u5E38&quot;,&quot;tsType&quot;:&quot;string&quot;,&quot;section&quot;:&quot;\u6F14\u793A&quot;},&quot;defaultTool&quot;:{&quot;editor&quot;:&quot;enum&quot;,&quot;options&quot;:[&quot;PikPak&quot;,&quot;115 \u7F51\u76D8&quot;,&quot;Aria2&quot;],&quot;default&quot;:&quot;PikPak&quot;,&quot;tsType&quot;:&quot;string&quot;,&quot;section&quot;:&quot;\u6F14\u793A&quot;}}">
const ACC = 'var(--acc)', OK = 'var(--ok)', WARN = 'var(--warn)', BAD = 'var(--bad)', DIM = 'var(--dim)', DIM2 = 'var(--dim2)';

const NAV = [
  { id: 'cinema', label: '\u5F71\u9662\u6A21\u5F0F', icon: 'ph-monitor-play' },
  { id: 'search', label: '\u5F71\u7247\u68C0\u7D22', icon: 'ph-magnifying-glass' },
  { id: 'dispatch', label: '\u4E0B\u8F7D\u6D3E\u53D1', icon: 'ph-download-simple' },
  { id: 'scrape', label: '\u672C\u5730\u522E\u524A', icon: 'ph-folders' },
  { id: 'library', label: '\u5F71\u89C6\u5E93', icon: 'ph-film-strip' },
  { id: 'auto', label: '\u81EA\u52A8\u6A21\u5F0F', icon: 'ph-flow-arrow' },
  { id: 'transcode', label: '\u8F6C\u7801', icon: 'ph-cpu' },
  { id: 'storage', label: '\u7F51\u76D8\u4E0E\u4E0B\u8F7D', icon: 'ph-cloud-arrow-down' },
  { id: 'settings', label: '\u8BBE\u7F6E', icon: 'ph-sliders-horizontal' },
];

const MOVIES = [
  { code: 'MIZ-812', title: '\u591C\u884C\u5217\u8ECA \u6700\u7D42\u7AE0 \u30C7\u30A3\u30EC\u30AF\u30BF\u30FC\u30BA\u30AB\u30C3\u30C8', actors: ['\u661F\u91CE \u672A\u6765'], tags: ['\u5355\u4F53\u4F5C\u54C1', '\u5267\u60C5', '\u4E2D\u6587\u5B57\u5E55'], date: '2026-07-18', dur: '148 \u5206', local: 'in', vr: false, sub: true, k4: true, studio: 'Mizuho Pictures', label: 'MIZUHO', series: '\u591C\u884C\u5217\u8ECA', director: '\u6CB3\u5408 \u5FB9', mag: 'MIZ-812-4K-C.mkv \xB7 12.4 GB \xB7 \u4E2D\u5B57', magCount: 6 },
  { code: 'SKR-940', title: '\u6D77\u8FBA\u306E\u8A18\u61B6 \u524D\u7DE8', actors: ['\u6850\u8C37 \u306A\u304E', '\u767D\u77F3 \u308B\u3044'], tags: ['\u5267\u60C5', '\u53CC\u4EBA', '\u4E2D\u6587\u5B57\u5E55'], date: '2026-07-11', dur: '126 \u5206', local: 'none', vr: false, sub: true, k4: false, studio: 'Sakura Line', label: 'SAKURA', series: '\u6D77\u8FBA\u306E\u8A18\u61B6', director: '\u68EE\u4E0B \u4EAE\u5E73', mag: 'SKR-940-UC-1080p.mp4 \xB7 6.2 GB \xB7 \u4E2D\u5B57', magCount: 5 },
  { code: 'KND-372', title: '\u9759\u304B\u306A\u5348\u5F8C \u7B2C\u4E09\u591C', actors: ['\u4E09\u4E0A \u3072\u306A\u306E'], tags: ['\u5355\u4F53\u4F5C\u54C1', '\u7EAA\u5F55'], date: '2026-07-04', dur: '112 \u5206', local: 'part', vr: false, sub: false, k4: false, studio: 'Kanade Works', label: 'KANADE', series: '\u9759\u304B\u306A\u5348\u5F8C', director: '\u6CB3\u5408 \u5FB9', mag: 'KND-372.mp4 \xB7 5.1 GB', magCount: 4 },
  { code: 'MIZ-806', title: '\u706F\u53F0\u306E\u4E0B\u3067\u5F85\u3064', actors: ['\u6A58 \u3055\u3084\u304B'], tags: ['\u5355\u4F53\u4F5C\u54C1', 'VR'], date: '2026-06-27', dur: '96 \u5206', local: 'none', vr: true, sub: false, k4: true, studio: 'Mizuho Pictures', label: 'MIZUHO', series: '\u591C\u884C\u5217\u8ECA', director: '\u68EE\u4E0B \u4EAE\u5E73', mag: 'MIZ-806-VR-2160p.mkv \xB7 24.8 GB', magCount: 3 },
  { code: 'SKR-928', title: '\u96E8\u306E\u65E5\u306E\u7D04\u675F', actors: ['\u767D\u77F3 \u308B\u3044'], tags: ['\u5267\u60C5', '\u4E2D\u6587\u5B57\u5E55'], date: '2026-06-20', dur: '134 \u5206', local: 'in', vr: false, sub: true, k4: false, studio: 'Sakura Line', label: 'SAKURA', series: '\u6D77\u8FBA\u306E\u8A18\u61B6', director: '\u6CB3\u5408 \u5FB9', mag: 'SKR-928-C-1080p.mp4 \xB7 7.4 GB \xB7 \u4E2D\u5B57', magCount: 7 },
  { code: 'KND-365', title: '\u590F\u306E\u7D42\u308F\u308A\u306B', actors: ['\u4E09\u4E0A \u3072\u306A\u306E', '\u661F\u91CE \u672A\u6765', '\u6A58 \u3055\u3084\u304B'], tags: ['\u591A\u4EBA', '\u5267\u60C5'], date: '2026-06-13', dur: '158 \u5206', local: 'none', vr: false, sub: false, k4: false, studio: 'Kanade Works', label: 'KANADE', series: '\u2014', director: '\u68EE\u4E0B \u4EAE\u5E73', mag: '', magCount: 0 },
  { code: 'MIZ-798', title: '\u9577\u3044\u5ECA\u4E0B\u306E\u5148', actors: ['\u6850\u8C37 \u306A\u304E'], tags: ['\u5355\u4F53\u4F5C\u54C1', '\u4E2D\u6587\u5B57\u5E55'], date: '2026-06-06', dur: '121 \u5206', local: 'none', vr: false, sub: true, k4: false, studio: 'Mizuho Pictures', label: 'MIZUHO', series: '\u2014', director: '\u6CB3\u5408 \u5FB9', mag: 'MIZ-798-C.mp4 \xB7 6.8 GB \xB7 \u4E2D\u5B57', magCount: 5 },
  { code: 'SKR-915', title: '\u7A93\u8FBA\u306E\u30B9\u30B1\u30C3\u30C1', actors: ['\u661F\u91CE \u672A\u6765'], tags: ['\u7EAA\u5F55'], date: '2026-05-30', dur: '105 \u5206', local: 'in', vr: false, sub: false, k4: false, studio: 'Sakura Line', label: 'SAKURA', series: '\u2014', director: '\u68EE\u4E0B \u4EAE\u5E73', mag: 'SKR-915.mp4 \xB7 4.9 GB', magCount: 4 },
  { code: 'KND-358', title: '\u5348\u524D\u56DB\u6642\u306E\u96FB\u8A71', actors: ['\u6A58 \u3055\u3084\u304B', '\u767D\u77F3 \u308B\u3044'], tags: ['\u5267\u60C5', '\u53CC\u4EBA', '\u4E2D\u6587\u5B57\u5E55'], date: '2026-05-23', dur: '142 \u5206', local: 'none', vr: false, sub: true, k4: true, studio: 'Kanade Works', label: 'KANADE', series: '\u2014', director: '\u6CB3\u5408 \u5FB9', mag: 'KND-358-4K-C.mkv \xB7 15.2 GB \xB7 \u4E2D\u5B57', magCount: 6 },
  { code: 'MIZ-790', title: '\u7802\u4E18\u306E\u8A18\u9332 \u5B8C\u5168\u7248', actors: ['\u4E09\u4E0A \u3072\u306A\u306E'], tags: ['\u7EAA\u5F55', 'VR'], date: '2026-05-16', dur: '88 \u5206', local: 'none', vr: true, sub: false, k4: false, studio: 'Mizuho Pictures', label: 'MIZUHO', series: '\u2014', director: '\u68EE\u4E0B \u4EAE\u5E73', mag: 'MIZ-790-VR.mkv \xB7 18.3 GB', magCount: 2 },
  { code: 'SKR-902', title: '\u785D\u5B50\u306E\u6E29\u5EA6', actors: ['\u6850\u8C37 \u306A\u304E'], tags: ['\u5355\u4F53\u4F5C\u54C1', '\u5267\u60C5'], date: '2026-05-09', dur: '117 \u5206', local: 'part', vr: false, sub: false, k4: false, studio: 'Sakura Line', label: 'SAKURA', series: '\u2014', director: '\u6CB3\u5408 \u5FB9', mag: 'SKR-902.mp4 \xB7 5.6 GB', magCount: 4 },
  { code: 'KND-351', title: '\u6D77\u9CF4\u308A\u306E\u8857', actors: ['\u767D\u77F3 \u308B\u3044'], tags: ['\u5267\u60C5', '\u4E2D\u6587\u5B57\u5E55'], date: '2026-05-02', dur: '129 \u5206', local: 'none', vr: false, sub: true, k4: false, studio: 'Kanade Works', label: 'KANADE', series: '\u2014', director: '\u68EE\u4E0B \u4EAE\u5E73', mag: 'KND-351-C.mp4 \xB7 6.1 GB \xB7 \u4E2D\u5B57', magCount: 5 },
];

const MAGNETS = [
  { name: 'MIZ-812-4K-C.mkv', size: '12.4 GB', sub: true, hd: true, date: '2026-07-19' },
  { name: 'MIZ-812-UC-1080p.mp4', size: '6.7 GB', sub: true, hd: true, date: '2026-07-19' },
  { name: 'MIZ812_FHD.mkv', size: '7.9 GB', sub: false, hd: true, date: '2026-07-18' },
  { name: 'MIZ-812.mp4', size: '5.2 GB', sub: false, hd: true, date: '2026-07-18' },
  { name: 'MIZ-812-C.mp4', size: '4.4 GB', sub: true, hd: false, date: '2026-07-18' },
  { name: 'miz812-hd-rip.mp4', size: '3.1 GB', sub: false, hd: false, date: '2026-07-18' },
];

const CN_ACTORS = [
  { name: '\u661F\u91CE \u672A\u6765', count: 86, size: '712 GB' },
  { name: '\u6850\u8C37 \u306A\u304E', count: 64, size: '538 GB' },
  { name: '\u4E09\u4E0A \u3072\u306A\u306E', count: 52, size: '441 GB', noAvatar: true },
  { name: '\u6A58 \u3055\u3084\u304B', count: 38, size: '402 GB' },
  { name: '\u767D\u77F3 \u308B\u3044', count: 31, size: '246 GB', noAvatar: true },
  { name: '\u5357\u91CE \u3042\u304B\u308A', count: 24, size: '198 GB' },
];

const CN_RESUME = { 'MIZ-812': 34, 'KND-358': 71, 'SKR-940': 12, 'MIZ-790': 88 };

const FILTER_DIMS = [
  { key: 'actor', name: '\u6F14\u5458', options: ['\u661F\u91CE \u672A\u6765', '\u6850\u8C37 \u306A\u304E', '\u4E09\u4E0A \u3072\u306A\u306E', '\u6A58 \u3055\u3084\u304B', '\u767D\u77F3 \u308B\u3044'], test: (m, v) => m.actors.includes(v) },
  { key: 'series', name: '\u7CFB\u5217', options: ['\u591C\u884C\u5217\u8ECA', '\u6D77\u8FBA\u306E\u8A18\u61B6', '\u9759\u304B\u306A\u5348\u5F8C'], test: (m, v) => m.series === v },
  { key: 'studio', name: '\u5236\u4F5C\u5546', options: ['Mizuho Pictures', 'Sakura Line', 'Kanade Works'], test: (m, v) => m.studio === v },
  { key: 'res', name: '\u5206\u8FA8\u7387', options: ['2160p', '1440p', '1080p', '720p'], test: (m, v) => m.res === v },
  { key: 'flag', name: '\u6807\u8BB0', options: ['\u4E2D\u6587\u5B57\u5E55', 'VR', '\u591A\u5206\u6BB5', '\u7F3A\u8D44\u6599', '\u6587\u4EF6\u7F3A\u5931', '\u672A\u770B\u5B8C'], test: (m, v) => {
    if (v === '\u591A\u5206\u6BB5') return m.files > 1;
    if (v === '\u7F3A\u8D44\u6599') return m.c < 100;
    if (v === '\u6587\u4EF6\u7F3A\u5931') return !!m.gone;
    if (v === '\u672A\u770B\u5B8C') return ['MIZ-812', 'KND-358', 'SKR-940', 'MIZ-790'].includes(m.code);
    return m.tags.includes(v);
  } },
];

const SEARCH_MODES = [
  { key: 'code', name: '\u756A\u53F7\u67E5\u8BE2', title: '\u756A\u53F7\u67E5\u8BE2', hint: '\u6309\u756A\u53F7\u53D6\u5355\u90E8\u5F71\u7247\u8BE6\u60C5\u4E0E\u6700\u4F73\u78C1\u529B\uFF08/api/movies/{\u756A\u53F7}\uFF09\u3002', run: '\u67E5\u8BE2\u756A\u53F7' },
  { key: 'filter', name: '\u6807\u7B7E\u7B5B\u9009', title: '\u6807\u7B7E\u7B5B\u9009', hint: '\u6309\u6F14\u5458\u3001\u7C7B\u522B\u3001\u5BFC\u6F14\u3001\u5236\u4F5C\u5546\u3001\u53D1\u884C\u5546\u3001\u7CFB\u5217\u7EC4\u5408\u7B5B\u9009\uFF0C\u591A\u6761\u4EF6\u4F1A\u9010\u7247\u6838\u5BF9\u8BE6\u60C5\u3002', run: '\u5F00\u59CB\u7B5B\u9009' },
  { key: 'magnet', name: '\u78C1\u529B\u67E5\u8BE2', title: '\u78C1\u529B\u67E5\u8BE2', hint: '\u53EA\u67E5\u4E00\u4E2A\u756A\u53F7\u7684\u5168\u90E8\u78C1\u529B\uFF0C\u53EF\u6307\u5B9A\u6392\u5E8F\u4E0E\u5B57\u5E55\u8FC7\u6EE4\u3002', run: '\u67E5\u8BE2\u78C1\u529B' },
  { key: 'recognize', name: '\u5F71\u7247\u8BC6\u522B', title: '\u5F71\u7247\u8BC6\u522B', hint: '\u7C98\u8D34 JavBus \u5217\u8868\u9875 HTML\uFF0C\u89E3\u6790\u5176\u4E2D\u7684\u756A\u53F7\u4E0E\u6807\u9898\u3002', run: '\u5F00\u59CB\u8BC6\u522B' },
];

const FILTER_TYPES = {
  \u6F14\u5458: { key: 'star', note: '\u6765\u81EA actors.json \xB7 2,146 \u4F4D\u6F14\u5458\uFF0C\u4E5F\u53EF\u76F4\u63A5\u8F93\u5165\u4EE3\u7801', browse: true },
  \u7C7B\u522B: { key: 'genre', note: '\u6765\u81EA categories.json \xB7 312 \u4E2A\u7C7B\u522B\uFF0C\u4E5F\u53EF\u76F4\u63A5\u8F93\u5165\u4EE3\u7801', browse: true },
  \u5BFC\u6F14: { key: 'director', note: '\u65E0\u9884\u8BBE\u76EE\u5F55\uFF1B\u8F93\u5165\u540D\u79F0\u540E\u9010\u7247\u6838\u5BF9\u8BE6\u60C5' },
  \u5236\u4F5C\u5546: { key: 'studio', note: '\u65E0\u9884\u8BBE\u76EE\u5F55\uFF1B\u8F93\u5165\u540D\u79F0\u540E\u9010\u7247\u6838\u5BF9\u8BE6\u60C5' },
  \u53D1\u884C\u5546: { key: 'label', note: '\u65E0\u9884\u8BBE\u76EE\u5F55\uFF1B\u8F93\u5165\u540D\u79F0\u540E\u9010\u7247\u6838\u5BF9\u8BE6\u60C5' },
  \u7CFB\u5217: { key: 'series', note: '\u65E0\u9884\u8BBE\u76EE\u5F55\uFF1B\u8F93\u5165\u540D\u79F0\u540E\u9010\u7247\u6838\u5BF9\u8BE6\u60C5' },
};

const ACTOR_CATALOG = [
  { name: '\u5E38\u7528', items: [['\u661F\u91CE \u672A\u6765', 'kxr', '86 \u90E8'], ['\u6850\u8C37 \u306A\u304E', '9wt', '64 \u90E8'], ['\u4E09\u4E0A \u3072\u306A\u306E', 'bk2', '52 \u90E8', true], ['\u6A58 \u3055\u3084\u304B', 'y7q', '38 \u90E8'], ['\u767D\u77F3 \u308B\u3044', '4mv', '31 \u90E8', true]] },
  { name: '\u6700\u8FD1\u68C0\u7D22', items: [['\u5357\u91CE \u3042\u304B\u308A', 'ra8', '24 \u90E8'], ['\u7BE0\u539F \u3086\u304D', 'j3c', '19 \u90E8'], ['\u6C34\u5CF6 \u3053\u3068\u306F', 'p6n', '12 \u90E8', true], ['\u4E00\u6761 \u307F\u304A', 'zt5', '9 \u90E8']] },
  { name: '\u5168\u90E8 A\u2013K', items: [['\u5929\u97F3 \u304B\u306A\u3067', 'q2h', '41 \u90E8'], ['\u4F0A\u85E4 \u307E\u308A\u3042', 'd8f', '33 \u90E8'], ['\u52A0\u85E4 \u3086\u3044', 'm4s', '28 \u90E8'], ['\u795E\u7530 \u308B\u306A', 'v9b', '17 \u90E8', true], ['\u6728\u4E0B \u3042\u3093\u306A', 'c7k', '6 \u90E8']] },
];

const GENRE_CATALOG = [
  { name: '\u5F71\u7247\u7C7B\u578B', items: [['\u5355\u4F53\u4F5C\u54C1', '1'], ['\u4F01\u753B', '2'], ['\u7EAA\u5F55', '3'], ['\u5267\u60C5', '4'], ['VR', '5t']] },
  { name: '\u5B57\u5E55\u4E0E\u753B\u8D28', items: [['\u4E2D\u6587\u5B57\u5E55', 'zh'], ['\u9AD8\u6E05', 'hd'], ['4K', '4k'], ['\u65E0\u7801\u6D41\u51FA', 'uc']] },
  { name: '\u6F14\u5458\u6784\u6210', items: [['\u5355\u4EBA\u4F5C\u54C1', 'so'], ['\u53CC\u4EBA', 'dp'], ['\u591A\u4EBA', 'mp']] },
];

const ACTOR_COUNTS = { '\u4E0D\u9650': '', '1 \u4EBA': '1', '2 \u4EBA': '2', '3 \u4EBA': '3', '\u2264 2 \u4EBA': '<=2', '\u2264 3 \u4EBA': '<=3', '\u2265 3 \u4EBA': '>=3', '\u2265 4 \u4EBA': '>=4' };

const BG = [
  { kind: '\u522E\u524A', name: '/media/inbox \u2192 /media/JAV', pct: 62, meta: '148 / 238 \u6587\u4EF6 \xB7 3 \u51B2\u7A81', route: 'scrape', fg: ACC },
  { kind: '\u8F6C\u7801', name: 'MIZ-812 hevc_nvenc', pct: 41, meta: '2.1x \xB7 \u5269\u4F59\u7EA6 18 \u5206', route: 'transcode', fg: OK },
  { kind: '\u626B\u63CF\u5165\u5E93', name: '/media/JAV-2 \u9012\u5F52\u626B\u63CF', pct: 88, meta: '1,204 / 1,366 \xB7 ffprobe \u4E2D', route: 'library', fg: WARN },
];

const HISTORY = [
  { code: 'MIZ-812', title: '\u591C\u884C\u5217\u8ECA \u6700\u7D42\u7AE0 \u30C7\u30A3\u30EC\u30AF\u30BF\u30FC\u30BA\u30AB\u30C3\u30C8', res: 'MIZ-812-4K-C.mkv \xB7 12.4 GB', src: 'javbus', tool: 'pikpak', time: '07-23 14:18:22', status: '\u6210\u529F', local: '\u5DF2\u5165\u5E93' },
  { code: 'SKR-940', title: '\u6D77\u8FBA\u306E\u8A18\u61B6 \u524D\u7DE8', res: 'SKR-940-UC-1080p.mp4 \xB7 6.2 GB', src: 'javbus', tool: 'pikpak', time: '07-23 14:18:19', status: '\u6210\u529F', local: '\u5DF2\u5165\u5E93' },
  { code: 'KND-372', title: '\u9759\u304B\u306A\u5348\u5F8C \u7B2C\u4E09\u591C', res: 'KND-372.mp4 \xB7 5.1 GB', src: 'cilisousuo', tool: 'aria2', time: '07-23 14:18:16', status: '\u4E0B\u8F7D\u4E2D', local: '\u5F85\u6838\u5BF9' },
  { code: 'MIZ-806', title: '\u706F\u53F0\u306E\u4E0B\u3067\u5F85\u3064', res: 'MIZ-806-VR-2160p.mkv \xB7 24.8 GB', src: 'javbus', tool: 'pikpak', time: '07-23 11:02:41', status: '\u6210\u529F', local: '\u672A\u5165\u5E93' },
  { code: 'KND-365', title: '\u590F\u306E\u7D42\u308F\u308A\u306B', res: 'KND-365-C.mp4 \xB7 \u5DF2\u5931\u6548', src: 'javbus', tool: 'pikpak', time: '07-23 11:02:38', status: '\u5931\u8D25', local: '\u672A\u5165\u5E93' },
  { code: 'MIZ-790', title: '\u7802\u4E18\u306E\u8A18\u9332 \u5B8C\u5168\u7248', res: 'MIZ-790-VR.mkv \xB7 18.3 GB', src: 'javbus', tool: 'pikpak', time: '07-23 11:02:35', status: '\u5931\u8D25', local: '\u672A\u5165\u5E93' },
  { code: 'SKR-928', title: '\u96E8\u306E\u65E5\u306E\u7D04\u675F', res: 'SKR-928-C-1080p.mp4 \xB7 7.4 GB', src: 'javbus', tool: 'pan115', time: '07-22 22:40:07', status: '\u8DF3\u8FC7', local: '\u5DF2\u5165\u5E93' },
  { code: 'SKR-915', title: '\u7A93\u8FBA\u306E\u30B9\u30B1\u30C3\u30C1', res: 'SKR-915.mp4 \xB7 4.9 GB', src: 'cilisousuo', tool: 'aria2', time: '07-22 22:39:58', status: '\u6210\u529F', local: '\u5DF2\u5165\u5E93' },
  { code: 'KND-358', title: '\u5348\u524D\u56DB\u6642\u306E\u96FB\u8A71', res: 'KND-358-4K-C.mkv \xB7 15.2 GB', src: 'javbus', tool: 'pikpak', time: '07-22 19:14:03', status: '\u6210\u529F', local: '\u5DF2\u5165\u5E93' },
  { code: 'SKR-902', title: '\u785D\u5B50\u306E\u6E29\u5EA6', res: 'SKR-902.mp4 \xB7 5.6 GB', src: 'javbus', tool: 'aria2', time: '07-22 19:13:55', status: '\u6210\u529F', local: '\u90E8\u5206\u5165\u5E93' },
];

const TC = [
  { id: 'tc-9f41a2', code: 'MIZ-812', title: '\u591C\u884C\u5217\u8ECA \u6700\u7D42\u7AE0', file: '/media/JAV/MIZ-812/MIZ-812 \u591C\u884C\u5217\u8ECA \u6700\u7D42\u7AE0.mkv', preset: 'keep_quality', codec: 'hevc_nvenc \xB7 CQ 24 \xB7 p5', gpu: 'NVIDIA \xB7 NVENC', status: 'running', stage: '\u7F16\u7801\u4E2D 00:52:18 / 02:28:04', pct: 41, speed: '2.14x', eta: '\u5269\u4F59\u7EA6 18 \u5206', elapsed: '\u5DF2\u7528 12 \u5206', inSize: '12.4 GB', outSize: '4.1 GB' },
  { id: 'tc-3b77c0', code: 'SKR-928', title: '\u96E8\u306E\u65E5\u306E\u7D04\u675F', file: '/media/JAV/SKR-928/SKR-928 \u96E8\u306E\u65E5\u306E\u7D04\u675F.mp4', preset: 'reduce_quality', codec: 'hevc_nvenc \xB7 CQ 30 \xB7 p4', gpu: 'NVIDIA \xB7 NVENC', status: 'running', stage: '\u7F16\u7801\u4E2D 00:18:44 / 02:14:12', pct: 14, speed: '2.63x', eta: '\u5269\u4F59\u7EA6 42 \u5206', elapsed: '\u5DF2\u7528 7 \u5206', inSize: '7.4 GB', outSize: '0.9 GB' },
  { id: 'tc-51ce8d', code: 'KND-358', title: '\u5348\u524D\u56DB\u6642\u306E\u96FB\u8A71', file: '/media/JAV/KND-358/KND-358 \u5348\u524D\u56DB\u6642\u306E\u96FB\u8A71 CD1.mkv', preset: 'keep_quality', codec: 'hevc_nvenc \xB7 CQ 24 \xB7 p5', gpu: 'NVIDIA \xB7 NVENC', status: 'queued', stage: '\u7B49\u5F85\u6267\u884C \xB7 \u961F\u5217\u7B2C 1 \u4F4D', pct: 0, speed: '', eta: '', elapsed: '', inSize: '15.2 GB', outSize: '\u2014' },
  { id: 'tc-8ad230', code: 'SKR-915', title: '\u7A93\u8FBA\u306E\u30B9\u30B1\u30C3\u30C1', file: '/media/JAV/SKR-915/SKR-915 \u7A93\u8FBA\u306E\u30B9\u30B1\u30C3\u30C1.mp4', preset: 'reduce_quality', codec: 'hevc_nvenc \xB7 CQ 30 \xB7 p4', gpu: 'NVIDIA \xB7 NVENC', status: 'completed', stage: '\u5DF2\u539F\u5B50\u66FF\u6362\u6E90\u6587\u4EF6', pct: 100, speed: '2.41x', eta: '', elapsed: '\u7528\u65F6 31 \u5206', inSize: '4.9 GB', outSize: '1.6 GB' },
  { id: 'tc-72b904', code: 'MIZ-798', title: '\u9577\u3044\u5ECA\u4E0B\u306E\u5148', file: '/media/JAV/MIZ-798/MIZ-798 \u9577\u3044\u5ECA\u4E0B\u306E\u5148.mp4', preset: 'keep_quality', codec: 'hevc_nvenc \xB7 CQ 24 \xB7 p5', gpu: 'NVIDIA \xB7 NVENC', status: 'completed', stage: '\u5DF2\u539F\u5B50\u66FF\u6362\u6E90\u6587\u4EF6', pct: 100, speed: '1.98x', eta: '', elapsed: '\u7528\u65F6 44 \u5206', inSize: '6.8 GB', outSize: '2.9 GB' },
  { id: 'tc-4e19f7', code: 'MIZ-806', title: '\u706F\u53F0\u306E\u4E0B\u3067\u5F85\u3064', file: '/media/JAV/VR/MIZ-806/MIZ-806 \u706F\u53F0\u306E\u4E0B\u3067\u5F85\u3064.mkv', preset: 'save_space', codec: 'av1_nvenc \xB7 CQ 32', gpu: 'NVIDIA \xB7 NVENC', status: 'failed', stage: '\u5DF2\u56DE\u6EDA\uFF0C\u539F\u6587\u4EF6\u4FDD\u7559', pct: 68, speed: '', eta: '', elapsed: '\u5DF2\u7528 26 \u5206', inSize: '24.8 GB', outSize: '\u2014', error: 'ffmpeg exited with code 234: [av1_nvenc @ 0x5f2a] No capable devices found \u2014 driver 535.161 lacks AV1 encode. Temporary output /media/JAV/VR/MIZ-806/.MIZ-806.transcode.tmp.mkv removed.' },
  { id: 'tc-1c66be', code: 'SKR-902', title: '\u785D\u5B50\u306E\u6E29\u5EA6', file: '/media/JAV/SKR-902/SKR-902 \u785D\u5B50\u306E\u6E29\u5EA6.mp4', preset: 'keep_quality', codec: 'hevc_nvenc \xB7 CQ 24 \xB7 p5', gpu: 'NVIDIA \xB7 NVENC', status: 'cancelled', stage: '\u7528\u6237\u53D6\u6D88\uFF0C\u4E34\u65F6\u8F93\u51FA\u5DF2\u6E05\u7406', pct: 22, speed: '', eta: '', elapsed: '\u5DF2\u7528 9 \u5206', inSize: '5.6 GB', outSize: '\u2014' },
];

const PRESETS = [
  { name: 'keep_quality \xB7 \u753B\u8D28\u57FA\u672C\u4FDD\u6301', tag: 'H.265', desc: '\u89C6\u89C9\u51E0\u4E4E\u65E0\u635F\uFF0C\u4F53\u79EF\u7EA6\u4E3A\u539F\u6587\u4EF6 35%\u201345%\u3002', codec: 'hevc_nvenc \xB7 CQ 24 \xB7 preset p5', ok: true },
  { name: 'reduce_quality \xB7 \u964D\u4F4E\u753B\u8D28', tag: 'H.265', desc: '\u53EF\u89C1\u8F7B\u5FAE\u8F6F\u5316\uFF0C\u4F53\u79EF\u7EA6\u4E3A\u539F\u6587\u4EF6 18%\u201325%\u3002', codec: 'hevc_nvenc \xB7 CQ 30 \xB7 preset p4', ok: true },
  { name: 'save_space \xB7 \u7701\u7A7A\u95F4 AV1', tag: 'GPU \u4E0D\u652F\u6301', desc: '\u540C\u753B\u8D28\u4E0B\u4F53\u79EF\u6700\u5C0F\uFF0C\u9700\u8981 AV1 \u786C\u4EF6\u7F16\u7801\u3002', codec: 'av1_nvenc \xB7 \u63A2\u9488\u5931\u8D25', ok: false },
  { name: 'custom \xB7 \u4E13\u4E1A\u53C2\u6570', tag: '\u624B\u52A8', desc: '\u8986\u76D6\u7F16\u7801\u5668\u3001CQ/\u7801\u7387\u3001\u5206\u8FA8\u7387\u3001\u5E27\u7387\u3001\u97F3\u9891\u4E0E\u5B57\u5E55\u4FDD\u7559\u3002', codec: 'TranscodingOptions \u5168\u91CF\u8986\u76D6', ok: true },
];

const SCRAPE_ROWS = [
  { src: '/media/inbox/MIZ-812 \u591C\u884C\u5217\u8ECA \u6700\u7D42\u7AE0.mkv', srcMeta: '12.4 GB \xB7 2160p \xB7 07-23 14:20', code: 'MIZ-812', dst: '/media/JAV/MIZ-812 \u591C\u884C\u5217\u8ECA \u6700\u7D42\u7AE0/MIZ-812 \u591C\u884C\u5217\u8ECA \u6700\u7D42\u7AE0.mkv', dstMeta: 'NFO + poster/fanart + 4 \u6837\u7247 + 1 \u6F14\u5458\u5934\u50CF', kind: 'ok', action: '\u79FB\u52A8\u5E76\u5199\u5165' },
  { src: '/media/inbox/skr940_uc_1080p.mp4', srcMeta: '6.2 GB \xB7 1080p \xB7 07-23 14:19', code: 'SKR-940', dst: '/media/JAV/SKR-940 \u6D77\u8FBA\u306E\u8A18\u61B6 \u524D\u7DE8/SKR-940 \u6D77\u8FBA\u306E\u8A18\u61B6 \u524D\u7DE8.mp4', dstMeta: 'NFO + poster/fanart + 4 \u6837\u7247 + 2 \u6F14\u5458\u5934\u50CF', kind: 'ok', action: '\u79FB\u52A8\u5E76\u5199\u5165' },
  { src: '/media/inbox/KND-372/KND-372.part1.mp4', srcMeta: '2.6 GB \xB7 1080p \xB7 CD1', code: 'KND-372', dst: '/media/JAV/KND-372 \u9759\u304B\u306A\u5348\u5F8C \u7B2C\u4E09\u591C/KND-372 \u9759\u304B\u306A\u5348\u5F8C \u7B2C\u4E09\u591C-CD1.mp4', dstMeta: 'file_index 1 \xB7 \u5408\u5E76\u4E3A\u540C\u4E00\u6761\u8BB0\u5F55', kind: 'ok', action: '\u79FB\u52A8\u5E76\u5199\u5165' },
  { src: '/media/inbox/KND-372/KND-372.part2.mp4', srcMeta: '2.5 GB \xB7 1080p \xB7 CD2', code: 'KND-372', dst: '/media/JAV/KND-372 \u9759\u304B\u306A\u5348\u5F8C \u7B2C\u4E09\u591C/KND-372 \u9759\u304B\u306A\u5348\u5F8C \u7B2C\u4E09\u591C-CD2.mp4', dstMeta: 'file_index 2 \xB7 \u5408\u5E76\u4E3A\u540C\u4E00\u6761\u8BB0\u5F55', kind: 'ok', action: '\u79FB\u52A8\u5E76\u5199\u5165' },
  { src: '/media/inbox/MIZ-806 VR 2160p.mkv', srcMeta: '24.8 GB \xB7 2160p \xB7 VR', code: 'MIZ-806', dst: '/media/JAV/VR/MIZ-806 \u706F\u53F0\u306E\u4E0B\u3067\u5F85\u3064/MIZ-806 \u706F\u53F0\u306E\u4E0B\u3067\u5F85\u3064.mkv', dstMeta: '\u6A21\u677F\u300CVR \u4E13\u7528\u300D\u7684\u76EE\u6807\u76EE\u5F55', kind: 'ok', action: '\u79FB\u52A8\u5E76\u5199\u5165' },
  { src: '/media/inbox/SKR-928 \u96E8\u306E\u65E5\u306E\u7D04\u675F.mp4', srcMeta: '7.4 GB \xB7 1080p \xB7 H.264', code: 'SKR-928', dst: '/media/JAV/SKR-928 \u96E8\u306E\u65E5\u306E\u7D04\u675F/SKR-928 \u96E8\u306E\u65E5\u306E\u7D04\u675F.mp4', dstMeta: '\u76EE\u6807\u5DF2\u5B58\u5728 6.9 GB H.265 \u6587\u4EF6', kind: 'conflict', note: 'auto_best \u5EFA\u8BAE keep_target', betterSide: 'existing', existing: { size: '6.9 GB', res: '1080p', codec: 'hevc', bitrate: '7.4 Mbps', date: '2026-06-21 03:12', dur: '134 \u5206 08 \u79D2', path: '/media/JAV/SKR-928 \u96E8\u306E\u65E5\u306E\u7D04\u675F/SKR-928 \u96E8\u306E\u65E5\u306E\u7D04\u675F.mp4' }, incoming: { size: '7.4 GB', res: '1080p', codec: 'h264', bitrate: '7.9 Mbps', date: '2026-07-23 11:40', dur: '134 \u5206 08 \u79D2', path: '/media/inbox/SKR-928 \u96E8\u306E\u65E5\u306E\u7D04\u675F.mp4' } },
  { src: '/media/inbox/KND-358-4K-C.mkv', srcMeta: '15.2 GB \xB7 2160p \xB7 \u4E2D\u5B57', code: 'KND-358', dst: '/media/JAV/KND-358 \u5348\u524D\u56DB\u6642\u306E\u96FB\u8A71/KND-358 \u5348\u524D\u56DB\u6642\u306E\u96FB\u8A71.mkv', dstMeta: '\u76EE\u6807\u5DF2\u5B58\u5728 9.1 GB 1080p \u6587\u4EF6', kind: 'conflict', note: 'auto_best \u5EFA\u8BAE keep_source', betterSide: 'incoming', existing: { size: '9.1 GB', res: '1080p', codec: 'hevc', bitrate: '9.0 Mbps', date: '2026-05-24 21:05', dur: '142 \u5206 31 \u79D2', path: '/media/JAV/KND-358 \u5348\u524D\u56DB\u6642\u306E\u96FB\u8A71/KND-358 \u5348\u524D\u56DB\u6642\u306E\u96FB\u8A71.mkv' }, incoming: { size: '15.2 GB', res: '2160p', codec: 'hevc', bitrate: '14.2 Mbps', date: '2026-07-22 19:44', dur: '142 \u5206 31 \u79D2', path: '/media/inbox/KND-358-4K-C.mkv' } },
  { src: '/media/inbox/SKR-915 \u7A93\u8FBA\u306E\u30B9\u30B1\u30C3\u30C1.mp4', srcMeta: '4.9 GB \xB7 1080p', code: 'SKR-915', dst: '/media/JAV/SKR-915 \u7A93\u8FBA\u306E\u30B9\u30B1\u30C3\u30C1/SKR-915 \u7A93\u8FBA\u306E\u30B9\u30B1\u30C3\u30C1.mp4', dstMeta: '\u76EE\u6807\u5DF2\u5B58\u5728\u540C\u4F53\u79EF\u540C\u7801\u7387\u6587\u4EF6', kind: 'conflict', note: 'auto_best \u65E0\u6CD5\u5224\u5B9A \xB7 \u9700\u4EBA\u5DE5', betterSide: 'existing', existing: { size: '4.9 GB', res: '1080p', codec: 'h264', bitrate: '6.2 Mbps', date: '2026-05-31 08:44', dur: '105 \u5206 12 \u79D2', path: '/media/JAV/SKR-915 \u7A93\u8FBA\u306E\u30B9\u30B1\u30C3\u30C1/SKR-915 \u7A93\u8FBA\u306E\u30B9\u30B1\u30C3\u30C1.mp4' }, incoming: { size: '4.9 GB', res: '1080p', codec: 'h264', bitrate: '6.2 Mbps', date: '2026-07-23 09:02', dur: '105 \u5206 12 \u79D2', path: '/media/inbox/SKR-915 \u7A93\u8FBA\u306E\u30B9\u30B1\u30C3\u30C1.mp4' } },
  { src: '/media/inbox/\u65B0\u5EFA\u6587\u4EF6\u5939/\u672A\u547D\u540D_20260719_002.mp4', srcMeta: '3.8 GB \xB7 1080p', code: '\u8BC6\u522B\u5931\u8D25', dst: '\u2014', dstMeta: '\u6587\u4EF6\u540D\u4E0E\u76EE\u5F55\u540D\u5747\u65E0\u53EF\u7528\u756A\u53F7', kind: 'error', note: '\u756A\u53F7\u6B63\u5219\u672A\u5339\u914D' },
  { src: '/media/inbox/MIZ-1099 \u7279\u5178\u6620\u50CF.mp4', srcMeta: '0.9 GB \xB7 720p', code: 'MIZ-1099', dst: '\u2014', dstMeta: '\u522E\u524A\u6E90\u5747\u8FD4\u56DE\u7A7A\u7ED3\u679C', kind: 'error', note: '\u8054\u7F51\u522E\u524A\u5931\u8D25' },
  { src: '/media/inbox/sample-KND-365.mp4', srcMeta: '86 MB \xB7 480p', code: 'KND-365', dst: '\u2014', dstMeta: '\u4F53\u79EF\u4F4E\u4E8E\u6700\u5C0F\u6587\u4EF6\u9608\u503C', kind: 'error', note: '\u5DF2\u6392\u9664\u4E3A\u6837\u7247' },
];

const LIB = [
  { code: 'MIZ-812', title: '\u591C\u884C\u5217\u8ECA \u6700\u7D42\u7AE0 \u30C7\u30A3\u30EC\u30AF\u30BF\u30FC\u30BA\u30AB\u30C3\u30C8', actors: ['\u661F\u91CE \u672A\u6765'], tags: ['\u5355\u4F53\u4F5C\u54C1', '\u5267\u60C5', '\u4E2D\u6587\u5B57\u5E55'], date: '2026-07-18', studio: 'Mizuho Pictures', label: 'MIZUHO', series: '\u591C\u884C\u5217\u8ECA', director: '\u6CB3\u5408 \u5FB9', res: '2160p', codec: 'hevc', dur: '148 \u5206', files: 1, size: '12.4 GB', c: 100, added: '2026-07-23 14:31' },
  { code: 'SKR-940', title: '\u6D77\u8FBA\u306E\u8A18\u61B6 \u524D\u7DE8', actors: ['\u6850\u8C37 \u306A\u304E', '\u767D\u77F3 \u308B\u3044'], tags: ['\u5267\u60C5', '\u53CC\u4EBA', '\u4E2D\u6587\u5B57\u5E55'], date: '2026-07-11', studio: 'Sakura Line', label: 'SAKURA', series: '\u6D77\u8FBA\u306E\u8A18\u61B6', director: '\u68EE\u4E0B \u4EAE\u5E73', res: '1080p', codec: 'h264', dur: '126 \u5206', files: 1, size: '6.2 GB', c: 100, added: '2026-07-23 14:30' },
  { code: 'KND-372', title: '\u9759\u304B\u306A\u5348\u5F8C \u7B2C\u4E09\u591C', actors: ['\u4E09\u4E0A \u3072\u306A\u306E'], tags: ['\u5355\u4F53\u4F5C\u54C1', '\u7EAA\u5F55'], date: '2026-07-04', studio: 'Kanade Works', label: 'KANADE', series: '\u9759\u304B\u306A\u5348\u5F8C', director: '\u6CB3\u5408 \u5FB9', res: '1080p', codec: 'h264', dur: '112 \u5206', files: 2, size: '5.1 GB', c: 72, added: '2026-07-22 20:11', missing: ['\u6837\u7247', '\u6F14\u5458\u5934\u50CF'] },
  { code: 'SKR-928', title: '\u96E8\u306E\u65E5\u306E\u7D04\u675F', actors: ['\u767D\u77F3 \u308B\u3044'], tags: ['\u5267\u60C5', '\u4E2D\u6587\u5B57\u5E55'], date: '2026-06-20', studio: 'Sakura Line', label: 'SAKURA', series: '\u6D77\u8FBA\u306E\u8A18\u61B6', director: '\u6CB3\u5408 \u5FB9', res: '1080p', codec: 'hevc', dur: '134 \u5206', files: 1, size: '6.9 GB', c: 100, added: '2026-06-21 03:12' },
  { code: 'KND-358', title: '\u5348\u524D\u56DB\u6642\u306E\u96FB\u8A71', actors: ['\u6A58 \u3055\u3084\u304B', '\u767D\u77F3 \u308B\u3044'], tags: ['\u5267\u60C5', '\u53CC\u4EBA', '\u4E2D\u6587\u5B57\u5E55'], date: '2026-05-23', studio: 'Kanade Works', label: 'KANADE', series: '\u2014', director: '\u6CB3\u5408 \u5FB9', res: '2160p', codec: 'hevc', dur: '142 \u5206', files: 1, size: '9.1 GB', c: 100, added: '2026-05-24 21:05' },
  { code: 'SKR-915', title: '\u7A93\u8FBA\u306E\u30B9\u30B1\u30C3\u30C1', actors: ['\u661F\u91CE \u672A\u6765'], tags: ['\u7EAA\u5F55'], date: '2026-05-30', studio: 'Sakura Line', label: 'SAKURA', series: '\u2014', director: '\u68EE\u4E0B \u4EAE\u5E73', res: '1080p', codec: 'h264', dur: '105 \u5206', files: 1, size: '4.9 GB', c: 88, added: '2026-05-31 08:44', missing: ['\u7CFB\u5217'] },
  { code: 'MIZ-798', title: '\u9577\u3044\u5ECA\u4E0B\u306E\u5148', actors: ['\u6850\u8C37 \u306A\u304E'], tags: ['\u5355\u4F53\u4F5C\u54C1', '\u4E2D\u6587\u5B57\u5E55'], date: '2026-06-06', studio: 'Mizuho Pictures', label: 'MIZUHO', series: '\u2014', director: '\u6CB3\u5408 \u5FB9', res: '1080p', codec: 'hevc', dur: '121 \u5206', files: 1, size: '2.9 GB', c: 100, added: '2026-06-07 19:20' },
  { code: 'SKR-902', title: '\u785D\u5B50\u306E\u6E29\u5EA6', actors: ['\u6850\u8C37 \u306A\u304E'], tags: ['\u5355\u4F53\u4F5C\u54C1', '\u5267\u60C5'], date: '2026-05-09', studio: 'Sakura Line', label: 'SAKURA', series: '\u2014', director: '\u6CB3\u5408 \u5FB9', res: '1080p', codec: 'h264', dur: '117 \u5206', files: 1, size: '5.6 GB', c: 64, added: '2026-05-10 12:03', missing: ['\u5C01\u9762', '\u6837\u7247', '\u6807\u7B7E'] },
  { code: 'KND-351', title: '\u6D77\u9CF4\u308A\u306E\u8857', actors: ['\u767D\u77F3 \u308B\u3044'], tags: ['\u5267\u60C5', '\u4E2D\u6587\u5B57\u5E55'], date: '2026-05-02', studio: 'Kanade Works', label: 'KANADE', series: '\u2014', director: '\u68EE\u4E0B \u4EAE\u5E73', res: '1080p', codec: 'h264', dur: '129 \u5206', files: 0, size: '\u2014', c: 92, added: '2026-05-03 10:14', gone: true },
  { code: 'MIZ-790', title: '\u7802\u4E18\u306E\u8A18\u9332 \u5B8C\u5168\u7248', actors: ['\u4E09\u4E0A \u3072\u306A\u306E'], tags: ['\u7EAA\u5F55', 'VR'], date: '2026-05-16', studio: 'Mizuho Pictures', label: 'MIZUHO', series: '\u2014', director: '\u68EE\u4E0B \u4EAE\u5E73', res: '1440p', codec: 'hevc', dur: '88 \u5206', files: 1, size: '18.3 GB', c: 100, added: '2026-05-17 06:31' },
  { code: 'MIZ-806', title: '\u706F\u53F0\u306E\u4E0B\u3067\u5F85\u3064', actors: ['\u6A58 \u3055\u3084\u304B'], tags: ['\u5355\u4F53\u4F5C\u54C1', 'VR'], date: '2026-06-27', studio: 'Mizuho Pictures', label: 'MIZUHO', series: '\u591C\u884C\u5217\u8ECA', director: '\u68EE\u4E0B \u4EAE\u5E73', res: '2160p', codec: 'hevc', dur: '96 \u5206', files: 1, size: '24.8 GB', c: 100, added: '2026-06-28 01:22' },
  { code: 'KND-365', title: '\u590F\u306E\u7D42\u308F\u308A\u306B', actors: ['\u4E09\u4E0A \u3072\u306A\u306E', '\u661F\u91CE \u672A\u6765', '\u6A58 \u3055\u3084\u304B'], tags: ['\u591A\u4EBA', '\u5267\u60C5'], date: '2026-06-13', studio: 'Kanade Works', label: 'KANADE', series: '\u2014', director: '\u68EE\u4E0B \u4EAE\u5E73', res: '720p', codec: 'h264', dur: '158 \u5206', files: 1, size: '2.1 GB', c: 56, added: '2026-06-14 22:47', missing: ['\u5C01\u9762', '\u6837\u7247', '\u6F14\u5458\u5934\u50CF', '\u5BFC\u6F14'] },
];

class Component extends DCLogic {
  constructor(props) {
    super(props);
    const demo = props.demoState;
    this.state = {
      ...this.state,
      route: props.startRoute || 'cinema',
      theme: props.theme === 'light' ? 'light' : 'dark',
      tool: props.defaultTool || 'PikPak',
      src: demo === '\u68C0\u7D22\u6765\u6E90\u79BB\u7EBF' ? 'yhg' : 'javbus',
      scPhase: demo === '\u522E\u524A\u672A\u751F\u6210\u9884\u89C8' ? 'idle' : 'preview',
    };
  }

  allConnected() { return this.props.demoState === '\u5168\u90E8\u5DE5\u5177\u5DF2\u8FDE\u63A5'; }

  state = {
    route: 'search',
    scPhase: 'preview', scTpl: '\u6807\u51C6\u6574\u7406\uFF08\u6709\u7801\uFF09', scScanDir: '/media/inbox', scOutDir: '/media/JAV',
    scFolderRule: '{code} {title}', scFileRule: '{code} {title}', scStrategy: 'auto_best \xB7 \u81EA\u52A8\u62E9\u4F18',
    scOpts: { recursive: true, scrape: true, organize: true, write_nfo: true, download_images: true, download_sample_images: true, download_actor_images: true, download_list_thumbnail: false, overwrite_existing: false },
    scMaxDepth: '', scConcurrent: '3',
    scF: '0', scSkip: [], scCmp: null, scPct: 0, scDesigner: false, scInspect: null,
    scParts: ['{code}', ' ', '{title}'],
    lbQ: '', lbActor: '\u5168\u90E8\u6F14\u5458', lbStudio: '\u5168\u90E8\u5236\u4F5C\u5546', lbRes: '\u5168\u90E8\u5206\u8FA8\u7387', lbM: '0',
    lbSubOnly: false, lbMissing: false, lbSort: '\u5165\u5E93\u65F6\u95F4 \u2193', lbView: 'list', lbDetail: null, lbScanning: false,
    lbCheckCfg: false, lbTc: null, lbTcPreset: 'keep_quality', lbPathCfg: false,
    lbPaths: ['/media/JAV', '/media/JAV-2', '/mnt/webdav/archive'], lbExcludes: ['/media/JAV/_manual', '/media/JAV/trailers'],
    lbCheckItems: { nfo: true, poster: true, fanart: true, sample: true, actor: true, meta: true, mediainfo: false, subtitle: false },
    fsAdd: null, fsAria: 'up',
    auTask: '\u6BCF\u65E5\u65B0\u7247\u8DDF\u8FDB', auNode: null, auPauseAll: false, auStopped: [],
    fsSrc: 'webdav', fsPath: ['WebDAV', 'downloads', '2026-07'], fsQ: '', fsVideoOnly: true, fsMinSize: '\u5927\u4E8E 500 MB', fsSel: [],
    seTab: '\u914D\u7F6E\u6982\u89C8', seReveal: [], theme: 'dark',
    cnTab: '\u63A8\u8350', cnHero: 'MIZ-812', cnPlaying: null, cnPaused: false, cnBuffering: false,
    cnF: { actor: [], series: [], studio: [], res: [], flag: [] }, cnSort: '\u5165\u5E93\u65F6\u95F4', cnActor: null,
    dScope: '1', dCodes: 'MIZ-812\\nSKR-940\\nKND-372\\nMIZ-806\\nKND-365', dSrc: 'javbus',
    dSubOnly: true, dNo4k: false, dSkipLocal: true, dSkipTried: true, dHf: '0', dChecked: false,
    tcF: '0', tcDetail: null,
    src: 'javbus', loading: false, view: 'grid',
    sMode: 'filter', code: 'MIZ-812',
    fType: '\u6F14\u5458', fValue: 'kxr', fLabel: '\u661F\u91CE \u672A\u6765', browse: null, browseQ: '',
    fList: [{ type: 'star', label: '\u6F14\u5458', value: 'kxr', name: '\u661F\u91CE \u672A\u6765' }],
    magParam: 'exist', kind: 'normal', actorCount: '\u4E0D\u9650', sub: '0', excludeVr: true, fetchMode: 'page',
    sortBy: 'size', sortOrder: 'desc', exclude4k: false, page: 1,
    recogHtml: '', autoDownload: false, toolCfg: null, pikLogged: true, qrState: 'waiting',
    sel: [], detail: null,
    tool: 'pikpak', dlg: null, dlgAck: false, toast: null, bgOpen: false,
  };

  toast(text, color) {
    if (this._tt) clearTimeout(this._tt);
    this.setState({ toast: { text, color: color || OK } });
    this._tt = setTimeout(() => this.setState({ toast: null }), 3200);
  }

  ask(cfg) { this.setState({ dlg: cfg, dlgAck: false }); }

  // \u4ECE\u67D0\u4E2A\u5F39\u7A97\u5185\u90E8\u5347\u7EA7\u4E3A\u4E8C\u6B21\u786E\u8BA4\uFF1A\u5148\u6536\u8D77\u7236\u5F39\u7A97\uFF0C\u53D6\u6D88\u65F6\u518D\u56DE\u5230\u5B83
  askFrom(key, value, cfg) {
    this.setState({ [key]: null });
    this.ask({ ...cfg, onCancel: () => this.setState({ [key]: value }) });
  }

  go(route) { return () => this.setState({ route, bgOpen: false, detail: null }); }

  runSearch = () => {
    this.setState({ loading: true, sel: [] });
    if (this._st) clearTimeout(this._st);
    this._st = setTimeout(() => this.setState({ loading: false }), 750);
  };

  setSrc(src) {
    return () => { this.setState({ src, detail: null }); if (src !== 'yhg') this.runSearch(); };
  }

  visible() {
    const st = this.state;
    if (st.sMode === 'code') return MOVIES.filter((m) => m.code.toLowerCase() === st.code.trim().toLowerCase());
    if (st.sMode === 'magnet') return [];
    let list = MOVIES.slice();
    if (st.sMode === 'recognize') return st.recogHtml.trim() ? list.slice(0, 8) : [];
    if (st.src === 'cili') list = list.slice(0, 5);
    st.fList.forEach((f) => {
      const v = f.name || f.value;
      if (f.type === 'star') list = list.filter((m) => m.actors.includes(v));
      if (f.type === 'genre') list = list.filter((m) => m.tags.includes(v) || (v === 'VR' && m.vr));
      if (f.type === 'director') list = list.filter((m) => m.director === v);
      if (f.type === 'studio') list = list.filter((m) => m.studio === v);
      if (f.type === 'label') list = list.filter((m) => m.label === v);
      if (f.type === 'series') list = list.filter((m) => m.series === v);
    });
    if (st.magParam === 'exist') list = list.filter((m) => m.mag);
    if (st.sub === 'true') list = list.filter((m) => m.sub);
    if (st.sub === 'false') list = list.filter((m) => !m.sub);
    if (st.excludeVr) list = list.filter((m) => !m.vr);
    const ac = ACTOR_COUNTS[st.actorCount];
    if (ac) list = list.filter((m) => {
      const n = m.actors.length;
      if (ac === '1' || ac === '2' || ac === '3') return n === Number(ac);
      if (ac === '<=2') return n <= 2;
      if (ac === '<=3') return n <= 3;
      if (ac === '>=3') return n >= 3;
      return n >= 4;
    });
    return list;
  }

  statusOf(m) {
    if (m.local === 'in') return { text: '\u5DF2\u5165\u5E93', color: OK };
    if (m.local === 'part') return { text: '\u90E8\u5206\u5165\u5E93 1/2', color: WARN };
    return { text: '\u672A\u5165\u5E93', color: DIM2 };
  }

  flagStyle(kind) {
    if (kind === 'a') return { bg: 'rgba(145,132,217,.22)', fg: 'var(--accs)' };
    if (kind === 'o') return { bg: 'rgba(99,179,148,.18)', fg: OK };
    if (kind === 'w') return { bg: 'rgba(201,160,94,.18)', fg: WARN };
    return { bg: 'var(--line2)', fg: DIM2 };
  }

  dispatchOne(m) {
    return () => {
      this.ask({
        kind: 'dispatch', title: \`\u6D3E\u53D1 \${m.code} \u5230 \${this.state.tool}\uFF1F\`,
        body: \`\u5C06\u628A\u6700\u4F73\u78C1\u529B\uFF08\${m.mag || '\u65E0'}\uFF09\u63D0\u4EA4\u5230 \${this.state.tool} \u79BB\u7EBF\u4E0B\u8F7D\u3002\u6D3E\u53D1\u8BB0\u5F55\u4F1A\u5199\u5165\u4E0B\u8F7D\u5386\u53F2\uFF0C\u7528\u4E8E\u540E\u7EED\u8DF3\u8FC7\u5931\u6548\u94FE\u63A5\u3002\`,
        list: [m.mag ? \`magnet:?xt=urn:btih:\${m.code.toLowerCase()}\u2026&dn=\${m.code}\` : ''],
        okText: '\u786E\u8BA4\u6D3E\u53D1', color: ACC,
        run: () => this.toast(\`\${m.code} \u5DF2\u63D0\u4EA4\u5230 \${this.state.tool} \xB7 \u4EFB\u52A1 ID p-4821\`, OK),
      });
    };
  }

  vDispatch() {
    const st = this.state;
    const codes = st.dCodes.split('\\n').map((c) => c.trim()).filter(Boolean);
    const runCount = st.dScope === '1' ? 12 : st.dScope === '2' ? Math.max(st.sel.length, 0) : codes.length;
    const ok115 = this.allConnected();
    const tools = [
      st.pikLogged
        ? { key: 'PikPak', name: 'PikPak', status: '\u5DF2\u767B\u5F55', dot: OK, fg: OK, meta: 'user@example.com \xB7 \u914D\u989D 1.78 TB / 2 TB \xB7 \u79BB\u7EBF\u4EFB\u52A1 4/5' }
        : { key: 'PikPak', name: 'PikPak', status: '\u672A\u767B\u5F55', dot: BAD, fg: BAD, meta: '\u767B\u5F55\u6001\u5DF2\u5931\u6548 \xB7 \u65E0\u6CD5\u63D0\u4EA4\u79BB\u7EBF\u4EFB\u52A1', needsAction: true, actionText: '\u91CD\u65B0\u767B\u5F55' },
      ok115
        ? { key: '115 \u7F51\u76D8', name: '115 \u7F51\u76D8', status: '\u5DF2\u767B\u5F55', dot: OK, fg: OK, meta: 'Cookie \u6709\u6548 \xB7 \u79BB\u7EBF\u76EE\u5F55 CID 2634891037465 \xB7 \u6279\u91CF 20' }
        : { key: '115 \u7F51\u76D8', name: '115 \u7F51\u76D8', status: '\u672A\u914D\u7F6E', dot: DIM2, fg: DIM2, meta: 'Cookie \u4E3A\u7A7A \xB7 \u65E0\u6CD5\u63D0\u4EA4\u79BB\u7EBF\u4EFB\u52A1', needsAction: true, actionText: '\u524D\u5F80\u8BBE\u7F6E' },
      { key: 'Aria2', name: 'Aria2', status: '\u5DF2\u8FDE\u63A5', dot: OK, fg: OK, meta: 'http://127.0.0.1:6800/jsonrpc \xB7 v1.37.0 \xB7 \u6D3B\u52A8 2 / \u5168\u5C40 5' },
    ];
    const failed = [
      { code: 'KND-365', reason: '\u78C1\u529B\u5DF2\u5931\u6548\uFF1Atracker \u8FD4\u56DE 0 seeder\uFF0CPikPak \u62D2\u7EDD\u4EFB\u52A1\uFF08invalid_resource\uFF09', tool: 'pikpak', time: '07-23 11:02:38', alt: true },
      { code: 'MIZ-790', reason: '\u8BE5\u756A\u53F7\u5728 JavBus \u4E0A\u4EC5\u5269 2 \u6761\u78C1\u529B\uFF0C\u5747\u5728\u5386\u53F2\u5931\u8D25\u5217\u8868\u4E2D', tool: 'pikpak', time: '07-23 11:02:35', alt: false },
    ];
    const stBg = { \u6210\u529F: 'rgba(99,179,148,.16)', \u4E0B\u8F7D\u4E2D: 'rgba(145,132,217,.18)', \u5931\u8D25: 'rgba(224,129,136,.16)', \u8DF3\u8FC7: 'var(--line2)' };
    const stFg = { \u6210\u529F: OK, \u4E0B\u8F7D\u4E2D: 'var(--accs)', \u5931\u8D25: BAD, \u8DF3\u8FC7: DIM2 };
    const localFg = { \u5DF2\u5165\u5E93: OK, \u672A\u5165\u5E93: DIM2, \u5F85\u6838\u5BF9: WARN, \u90E8\u5206\u5165\u5E93: WARN };
    let hist = HISTORY;
    if (st.dHf === '1') hist = HISTORY.filter((h) => h.local === '\u672A\u5165\u5E93');
    if (st.dHf === '2') hist = HISTORY.filter((h) => h.status === '\u5931\u8D25');
    return {
      tool: st.tool, src: st.dSrc,
      tools: tools.map((t) => ({
        ...t, active: st.tool === t.key,
        bg: st.tool === t.key ? 'rgba(145,132,217,.08)' : 'transparent',
        ring: st.tool === t.key ? 'rgba(145,132,217,.4)' : 'var(--t09)',
        pick: () => this.setState({ tool: t.key }),
        needsAction: !!t.needsAction, action: this.go('settings'),
      })),
      scope1: st.dScope === '1', scope2: st.dScope === '2', scope3: st.dScope === '3',
      setScope1: () => this.setState({ dScope: '1' }), setScope2: () => this.setState({ dScope: '2' }), setScope3: () => this.setState({ dScope: '3' }),
      codes: st.dCodes, setCodes: (e) => this.setState({ dCodes: e.target.value }),
      setSrc: (e) => this.setState({ dSrc: e.target.value }),
      subOnly: st.dSubOnly, toggleSub: () => this.setState({ dSubOnly: !st.dSubOnly }),
      no4k: st.dNo4k, toggle4k: () => this.setState({ dNo4k: !st.dNo4k }),
      skipLocal: st.dSkipLocal, toggleSkipLocal: () => this.setState({ dSkipLocal: !st.dSkipLocal }),
      skipTried: st.dSkipTried, toggleSkipTried: () => this.setState({ dSkipTried: !st.dSkipTried }),
      runCount,
      run: () => {
        if (st.tool === '115 \u7F51\u76D8' && !ok115) { this.toast('115 \u7F51\u76D8\u672A\u914D\u7F6E Cookie\uFF0C\u65E0\u6CD5\u6D3E\u53D1\u3002\u8BF7\u5148\u5728\u8BBE\u7F6E\u4E2D\u586B\u5199\u3002', BAD); return; }
        this.ask({
          title: \`\u6D3E\u53D1 \${runCount} \u4E2A\u756A\u53F7\u5230 \${st.tool}\uFF1F\`, color: ACC, okText: '\u5F00\u59CB\u6D3E\u53D1',
          body: \`\u6309 \${st.dSrc} \u7684\u6700\u4F73\u78C1\u529B\u9010\u6761\u63D0\u4EA4\${st.dSubOnly ? '\uFF08\u4EC5\u4E2D\u6587\u5B57\u5E55\uFF09' : ''}\u3002\${st.dSkipLocal ? '\u672C\u5730\u5DF2\u6709\u5F71\u7247\u5C06\u8DF3\u8FC7\uFF1B' : ''}\${st.dSkipTried ? '\u5386\u53F2\u5931\u8D25\u94FE\u63A5\u5C06\u8DF3\u8FC7\u3002' : ''}\`,
          list: codes.slice(0, 6).map((c) => \`\${c} \u2192 \u89E3\u6790\u78C1\u529B \u2026\`),
          run: () => this.toast(\`\u6279\u6B21 b-20260723-1602 \u5DF2\u521B\u5EFA \xB7 \u63D0\u4EA4 \${runCount} \u6761\uFF0C\u540E\u53F0\u6267\u884C\u4E2D\`, ACC),
        });
      },
      stats: [
        { label: '\u4ECA\u65E5\u6D3E\u53D1', value: '41', note: '\u6210\u529F 36 \xB7 \u8DF3\u8FC7 3 \xB7 \u5931\u8D25 2', color: 'var(--fg)' },
        { label: '\u4E0B\u8F7D\u4E2D', value: '7', note: 'PikPak 5 \xB7 Aria2 2', color: 'var(--accs)' },
        { label: '\u5F85\u6838\u5BF9\u672C\u5730\u5E93', value: '3', note: '\u8FDC\u7AEF\u5DF2\u5B8C\u6210\u4F46\u672C\u5730\u672A\u5165\u5E93', color: WARN },
        { label: '\u5386\u53F2\u5931\u8D25\u94FE\u63A5', value: '18', note: '\u5DF2\u52A0\u5165\u8DF3\u8FC7\u540D\u5355', color: BAD },
      ],
      failed: failed.map((f) => ({
        ...f, noRetry: !f.alt,
        retry: () => this.toast(\`\${f.code} \u5DF2\u6539\u7528\u6B21\u4F18\u78C1\u529B\u91CD\u65B0\u63D0\u4EA4\u5230 \${st.tool}\`, ACC),
        skip: () => this.toast(\`\${f.code} \u5DF2\u6807\u8BB0\u4E3A\u8DF3\u8FC7\uFF0C\u540E\u7EED\u6279\u91CF\u6D3E\u53D1\u4E0D\u518D\u5C1D\u8BD5\`, DIM),
      })),
      hf0: st.dHf === '0', hf1: st.dHf === '1', hf2: st.dHf === '2',
      setHf0: () => this.setState({ dHf: '0' }), setHf1: () => this.setState({ dHf: '1' }), setHf2: () => this.setState({ dHf: '2' }),
      checkNote: st.dChecked ? '\u6838\u5BF9\u5B8C\u6210 07-23 16:04 \xB7 3 \u90E8\u8FDC\u7AEF\u5DF2\u5B8C\u6210\u4F46\u672C\u5730\u7F3A\u5931' : '\u5C1A\u672A\u6838\u5BF9\u672C\u5730\u5E93',
      check: () => { this.setState({ dChecked: true }); this.toast('\u672C\u5730\u5E93\u6838\u5BF9\u5B8C\u6210\uFF1A128 \u6761\u5386\u53F2\u4E2D 3 \u90E8\u672A\u5165\u5E93\uFF0C\u5DF2\u5728\u4E0B\u65B9\u6807\u51FA', WARN); },
      refresh: () => this.toast('\u5DF2\u5237\u65B0\u4E0B\u8F7D\u5386\u53F2\uFF08128 \u6761\uFF09', ACC),
      clear: () => this.ask({
        title: '\u6E05\u7A7A\u5168\u90E8\u4E0B\u8F7D\u5386\u53F2\uFF1F', color: BAD, okText: '\u6E05\u7A7A 128 \u6761',
        body: '\u5C06\u5220\u9664 downloaded_movies.json \u4E2D\u7684\u5168\u90E8\u6D3E\u53D1\u8BB0\u5F55\u3002\u6E05\u7A7A\u540E\u5931\u8D25\u94FE\u63A5\u8DF3\u8FC7\u540D\u5355\u540C\u65F6\u5931\u6548\uFF0C\u6279\u91CF\u6D3E\u53D1\u53EF\u80FD\u91CD\u590D\u63D0\u4EA4\u5DF2\u5931\u6548\u78C1\u529B\u3002\u6B64\u64CD\u4F5C\u4E0D\u53EF\u64A4\u9500\u3002',
        ackText: '\u6211\u660E\u767D\u8DF3\u8FC7\u540D\u5355\u4F1A\u4E00\u8D77\u6E05\u7A7A', run: () => this.toast('\u4E0B\u8F7D\u5386\u53F2\u5DF2\u6E05\u7A7A', BAD),
      }),
      history: hist.map((h) => ({
        ...h, stBg: stBg[h.status], stFg: stFg[h.status], localFg: localFg[h.local] || DIM2,
        actText: h.status === '\u5931\u8D25' ? '\u91CD\u6D3E' : '\u8BE6\u60C5',
        act: () => h.status === '\u5931\u8D25' ? this.toast(\`\${h.code} \u5DF2\u91CD\u65B0\u52A0\u5165\u6D3E\u53D1\u961F\u5217\`, ACC) : this.setState({ route: 'search', detail: h.code }),
      })),
    };
  }

  vTranscode() {
    const st = this.state;
    const SFG = { running: OK, queued: DIM2, completed: 'var(--accs)', failed: BAD, cancelled: DIM2 };
    const STEXT = { running: '\u8FD0\u884C\u4E2D', queued: '\u6392\u961F\u4E2D', completed: '\u5DF2\u5B8C\u6210', failed: '\u5F02\u5E38', cancelled: '\u5DF2\u53D6\u6D88' };
    let rows = TC;
    if (st.tcF === '1') rows = TC.filter((t) => t.status === 'running' || t.status === 'queued');
    if (st.tcF === '2') rows = TC.filter((t) => t.status === 'completed');
    if (st.tcF === '3') rows = TC.filter((t) => t.status === 'failed' || t.status === 'cancelled');
    const wrap = (t) => ({
      ...t, status: STEXT[t.status], stFg: SFG[t.status],
      progressMeta: t.status === 'running' ? \`\${t.speed} \xB7 \${t.eta}\` : t.status === 'queued' ? '\u2014' : t.elapsed || '\u2014',
      size: \`\${t.inSize} \u2192 \${t.outSize}\`,
      sizeFg: t.status === 'completed' ? OK : DIM,
      canCancel: t.status === 'running' || t.status === 'queued',
      canRetry: t.status === 'failed' || t.status === 'cancelled',
      canDelete: t.status === 'completed' || t.status === 'cancelled',
      detail: () => this.setState({ tcDetail: t.id }),
      cancel: () => this.ask({
        title: \`\u53D6\u6D88\u8F6C\u7801 \${t.code}\uFF1F\`, color: BAD, okText: '\u53D6\u6D88\u4EFB\u52A1',
        body: '\u5C06\u7EC8\u6B62 ffmpeg \u8FDB\u7A0B\u5E76\u5220\u9664\u4E34\u65F6\u8F93\u51FA\u6587\u4EF6\u3002\u539F\u6587\u4EF6\u4E0D\u4F1A\u88AB\u4FEE\u6539\uFF0C\u5DF2\u5B8C\u6210\u7684\u7F16\u7801\u8FDB\u5EA6\u4F1A\u4E22\u5931\u3002',
        run: () => this.toast(\`\${t.code} \u8F6C\u7801\u4EFB\u52A1\u5DF2\u53D6\u6D88\uFF0C\u4E34\u65F6\u6587\u4EF6\u5DF2\u6E05\u7406\`, WARN),
      }),
      retry: () => this.toast(\`\${t.code} \u5DF2\u91CD\u65B0\u5165\u961F\uFF08\u9884\u8BBE\u6539\u4E3A hevc_nvenc CQ 24\uFF0C\u907F\u5F00\u4E0D\u53EF\u7528\u7684 AV1\uFF09\`, ACC),
      del: () => this.toast(\`\u5DF2\u5220\u9664\u4EFB\u52A1\u8BB0\u5F55 \${t.id}\`, DIM),
    });
    const dt = TC.find((t) => t.id === st.tcDetail);
    return {
      caps: [
        { label: 'FFmpeg', value: '7.0.2 \xB7 /usr/bin/ffmpeg', dot: OK, fg: DIM },
        { label: 'ffprobe', value: '7.0.2 \xB7 \u53EF\u7528', dot: OK, fg: DIM },
        { label: 'GPU', value: 'RTX 4070 \xB7 \u9A71\u52A8 535.161', dot: OK, fg: DIM },
        { label: 'NVENC H.265', value: 'hevc_nvenc \u53EF\u7528', dot: OK, fg: OK },
        { label: 'NVENC AV1', value: 'av1_nvenc \u63A2\u9488\u5931\u8D25', dot: BAD, fg: BAD },
      ],
      presets: PRESETS.map((p) => ({
        ...p, op: p.ok ? '1' : '.55',
        bg: p.ok ? 'var(--t03)' : 'rgba(224,129,136,.05)',
        ring: p.ok ? 'var(--t09)' : 'rgba(224,129,136,.25)',
        tagBg: p.ok ? 'rgba(145,132,217,.18)' : 'rgba(224,129,136,.16)',
        tagFg: p.ok ? 'var(--accs)' : BAD, codecFg: p.ok ? DIM2 : BAD,
      })),
      stats: [
        { label: '\u6D3B\u52A8\u4EFB\u52A1', value: '3', note: '\u8FD0\u884C 2 \xB7 \u6392\u961F 1', color: 'var(--fg)' },
        { label: '\u5DF2\u5B8C\u6210\uFF087 \u5929\uFF09', value: '46', note: '\u7D2F\u8BA1\u8282\u7701 312 GB', color: OK },
        { label: '\u5F02\u5E38', value: '1', note: 'AV1 \u786C\u4EF6\u7F16\u7801\u4E0D\u53EF\u7528', color: BAD },
        { label: '\u5E73\u5747\u538B\u7F29\u6BD4', value: '34%', note: '\u8F93\u51FA / \u8F93\u5165 \u4F53\u79EF', color: 'var(--accs)' },
      ],
      nAll: TC.length, nActive: 3, nDone: 2, nBad: 2,
      f0: st.tcF === '0', f1: st.tcF === '1', f2: st.tcF === '2', f3: st.tcF === '3',
      setF0: () => this.setState({ tcF: '0' }), setF1: () => this.setState({ tcF: '1' }), setF2: () => this.setState({ tcF: '2' }), setF3: () => this.setState({ tcF: '3' }),
      refresh: () => this.toast('\u8F6C\u7801\u961F\u5217\u5DF2\u5237\u65B0', ACC),
      clean: () => this.ask({
        title: '\u6E05\u7406\u5DF2\u5B8C\u6210\u7684\u8F6C\u7801\u8BB0\u5F55\uFF1F', color: WARN, okText: '\u6E05\u7406 46 \u6761',
        body: '\u9010\u6761\u8C03\u7528 DELETE tasks/{task_id} \u5220\u9664\u5DF2\u5B8C\u6210\u7684\u4EFB\u52A1\u8BB0\u5F55\uFF0C\u4E0D\u5F71\u54CD\u5DF2\u8F6C\u7801\u7684\u5A92\u4F53\u6587\u4EF6\u3002\u6E05\u7406\u540E\u65E0\u6CD5\u518D\u67E5\u770B\u8FD9\u4E9B\u4EFB\u52A1\u7684 ffmpeg \u53C2\u6570\u4E0E\u538B\u7F29\u6BD4\u3002',
        run: () => this.toast('\u5DF2\u6E05\u7406 46 \u6761\u5B8C\u6210\u8BB0\u5F55', ACC),
      }),
      rows: rows.map(wrap),
      closeDetail: () => this.setState({ tcDetail: null }),
      d: dt ? {
        id: dt.id, status: STEXT[dt.status], stFg: SFG[dt.status], stage: dt.stage, pct: dt.pct,
        hasError: !!dt.error, error: dt.error || '',
        canRetry: dt.status === 'failed' || dt.status === 'cancelled',
        canCancel: dt.status === 'running' || dt.status === 'queued',
        fields: [
          ['\u5F71\u7247', \`\${dt.code} \xB7 \${dt.title}\`, 0], ['\u8F93\u5165\u6587\u4EF6', dt.file, 1], ['\u9884\u8BBE', dt.preset, 0],
          ['\u7F16\u7801\u53C2\u6570', dt.codec, 1], ['\u786C\u4EF6', dt.gpu, 0],
          ['\u8F93\u5165\u5927\u5C0F', dt.inSize, 1], ['\u8F93\u51FA\u5927\u5C0F', dt.outSize, 1],
          ['\u901F\u5EA6', dt.speed || '\u2014', 1], ['\u8017\u65F6', dt.elapsed || '\u2014', 1],
          ['\u8F93\u51FA\u7B56\u7565', '\u4E34\u65F6\u6587\u4EF6 \u2192 \u6821\u9A8C\u4F53\u79EF\u66F4\u5C0F \u2192 \u539F\u5B50\u66FF\u6362\u6E90\u6587\u4EF6', 0],
          ['\u5F71\u89C6\u5E93\u8054\u52A8', '\u5B8C\u6210\u540E\u66F4\u65B0 library.db \u7684\u5A92\u4F53\u53C2\u6570\u4E0E\u6587\u4EF6\u5927\u5C0F', 0],
        ].map(([k, v, m]) => ({ k, v, mono: m ? 'var(--mono)' : 'inherit', fs: m ? '11.5px' : '12.5px' })),
        retry: () => { this.setState({ tcDetail: null }); this.toast(\`\${dt.code} \u5DF2\u91CD\u65B0\u5165\u961F\`, ACC); },
        cancel: () => { this.setState({ tcDetail: null }); this.toast(\`\${dt.code} \u8F6C\u7801\u4EFB\u52A1\u5DF2\u53D6\u6D88\`, WARN); },
        copy: () => this.toast('\u5DF2\u590D\u5236 ffmpeg \u547D\u4EE4\u5230\u526A\u8D34\u677F', ACC),
      } : null,
    };
  }

  vScrape() {
    const st = this.state;
    const o = st.scOpts;
    const toggleOpt = (k) => () => this.setState({ scOpts: { ...o, [k]: !o[k] } });
    const conflicts = SCRAPE_ROWS.filter((r) => r.kind === 'conflict');
    const errors = SCRAPE_ROWS.filter((r) => r.kind === 'error');
    let rows = SCRAPE_ROWS;
    if (st.scF === '1') rows = conflicts;
    if (st.scF === '2') rows = errors;
    const executable = SCRAPE_ROWS.filter((r) => r.kind !== 'error' && !st.scSkip.includes(r.src));
    const SFG = { ok: OK, conflict: WARN, error: BAD };
    const STXT = { ok: '\u53EF\u6267\u884C', conflict: '\u6587\u4EF6\u51B2\u7A81', error: '\u5F02\u5E38' };
    const cmp = SCRAPE_ROWS.find((r) => r.src === st.scCmp);
    return {
      subtitle: st.scPhase === 'preview' ? \`\u9884\u89C8\u751F\u6210\u4E8E 07-23 16:08 \xB7 \u626B\u63CF \${st.scScanDir} \xB7 \u5171 238 \u4E2A\u89C6\u9891\u6587\u4EF6\` : st.scPhase === 'scanning' ? '\u6B63\u5728\u9012\u5F52\u626B\u63CF\u5E76\u8054\u7F51\u522E\u524A\u2026' : '\u6A21\u677F\u300C' + st.scTpl + '\u300D\xB7 \u5C1A\u672A\u751F\u6210\u9884\u89C8',
      idle: st.scPhase === 'idle', scanning: st.scPhase === 'scanning', hasPreview: st.scPhase === 'preview',
      scanPct: st.scPct,
      scanLog: [
        { t: '[ 00:02 ] \u9012\u5F52\u626B\u63CF /media/inbox \u2026 \u53D1\u73B0 238 \u4E2A\u89C6\u9891\u6587\u4EF6', fg: DIM },
        { t: '[ 00:11 ] \u756A\u53F7\u8BC6\u522B 226 \u6210\u529F / 12 \u5931\u8D25', fg: DIM },
        { t: '[ 00:24 ] \u5143\u6570\u636E\u522E\u524A 218/226 \xB7 javbus \u2192 javdb \u56DE\u843D', fg: DIM },
        { t: '[ 00:29 ] ffprobe \u8BFB\u53D6\u5A92\u4F53\u53C2\u6570 \xB7 \u5E76\u53D1 3', fg: DIM },
        { t: '[ 00:31 ] \u68C0\u6D4B\u76EE\u6807\u8DEF\u5F84\u51B2\u7A81 \u2026 3 \u5904', fg: WARN },
      ],
      templates: [
        { name: '\u6807\u51C6\u6574\u7406\uFF08\u6709\u7801\uFF09', path: '/media/inbox \u2192 /media/JAV \xB7 {code} {title}', used: '\u7528\u8FC7 34 \u6B21' },
        { name: 'VR \u4E13\u7528', path: '/media/inbox/vr \u2192 /media/JAV/VR \xB7 {code} {actors}', used: '\u7528\u8FC7 6 \u6B21' },
        { name: '\u4EC5\u8865\u8D44\u6599\uFF08organize=false\uFF09', path: '\u539F\u5730\u5199\u5165 NFO / \u5C01\u9762 / \u6F14\u5458\u5934\u50CF', used: '\u7528\u8FC7 12 \u6B21' },
      ].map((t) => ({ ...t, bg: st.scTpl === t.name ? 'rgba(145,132,217,.08)' : 'transparent', ring: st.scTpl === t.name ? 'rgba(145,132,217,.4)' : 'var(--t09)',
        pick: () => this.setState({ scTpl: t.name }),
        remove: () => this.ask({ title: \`\u5220\u9664\u522E\u524A\u4EFB\u52A1\u6A21\u677F\u300C\${t.name}\u300D\uFF1F\`, color: BAD, okText: '\u5220\u9664\u6A21\u677F',
          body: '\u4EC5\u5220\u9664\u8FD9\u4EFD\u6A21\u677F\u914D\u7F6E\uFF0C\u5DF2\u6267\u884C\u8FC7\u7684\u522E\u524A\u7ED3\u679C\u4E0D\u53D7\u5F71\u54CD\u3002', run: () => this.toast(\`\u6A21\u677F\u300C\${t.name}\u300D\u5DF2\u5220\u9664\`, WARN) }),
      })),
      saveTpl: () => this.toast('\u5F53\u524D\u914D\u7F6E\u5DF2\u53E6\u5B58\u4E3A\u6A21\u677F\u300C\u6807\u51C6\u6574\u7406\uFF08\u6709\u7801\uFF09\u526F\u672C\u300D', ACC),
      openDesigner: () => this.setState({ scDesigner: true }),
      closeDesigner: () => this.setState({ scDesigner: false }),
      designer: st.scDesigner ? {
        parts: st.scParts.map((p, i) => ({ t: p === ' ' ? '\u7A7A\u683C' : p, remove: () => this.setState({ scParts: st.scParts.filter((_, j) => j !== i) }) })),
        empty: st.scParts.length === 0,
        vars: ['{code}', '{title}', '{actors}', '{studio}', '{label}', '{series}', '{year}', '{date}', ' ', '-'].map((v) => ({
          t: v === ' ' ? '\u7A7A\u683C' : v, add: () => this.setState({ scParts: st.scParts.concat(v) }),
        })),
        preview: st.scParts.length
          ? Object.entries({
              '{code}': 'MIZ-812', '{title}': '\u591C\u884C\u5217\u8ECA \u6700\u7D42\u7AE0 \u30C7\u30A3\u30EC\u30AF\u30BF\u30FC\u30BA\u30AB\u30C3\u30C8', '{actors}': '\u661F\u91CE \u672A\u6765',
              '{studio}': 'Mizuho Pictures', '{label}': 'MIZUHO', '{series}': '\u591C\u884C\u5217\u8ECA',
              '{year}': '2026', '{date}': '2026-07-18',
            }).reduce((acc, [k, v]) => acc.split(k).join(v), st.scParts.join('')) + '.mkv'
          : '\uFF08\u89C4\u5219\u4E3A\u7A7A\uFF0C\u5C06\u4F7F\u7528\u756A\u53F7\u4F5C\u4E3A\u6587\u4EF6\u540D\uFF09',
        reset: () => this.setState({ scParts: ['{code}', ' ', '{title}'] }),
        apply: () => { this.setState({ scFileRule: st.scParts.join('') || '{code}', scDesigner: false }); this.toast('\u547D\u540D\u89C4\u5219\u5DF2\u5E94\u7528\uFF0C\u4E0B\u6B21\u751F\u6210\u9884\u89C8\u751F\u6548', OK); },
      } : null,
      inspect: st.scInspect ? (() => {
        const r = SCRAPE_ROWS.find((x) => x.src === st.scInspect) || {};
        return {
          fields: [
            { k: '\u6E90\u6587\u4EF6', v: r.src || '\u2014', fg: 'var(--fg)' },
            { k: '\u6587\u4EF6\u4FE1\u606F', v: r.srcMeta || '\u2014', fg: DIM },
            { k: '\u8BC6\u522B\u756A\u53F7', v: r.code || '\u2014', fg: r.code === '\u8BC6\u522B\u5931\u8D25' ? BAD : ACC },
            { k: '\u5F02\u5E38\u7C7B\u578B', v: r.note || '\u2014', fg: BAD },
            { k: '\u5904\u7406\u7ED3\u679C', v: r.dstMeta || '\u2014', fg: DIM },
          ],
          log: [
            { t: '[ scan ] \u547D\u4E2D\u89C6\u9891\u6269\u5C55\u540D\uFF0C\u8FDB\u5165\u756A\u53F7\u8BC6\u522B', fg: DIM2 },
            { t: \`[ parse ] \u6B63\u5219\u672A\u5339\u914D \u2192 \u76EE\u5F55\u540D\u56DE\u9000 \u2192 \u5747\u5931\u8D25\`, fg: r.code === '\u8BC6\u522B\u5931\u8D25' ? BAD : DIM2 },
            { t: '[ scrape ] javbus 404 \u2192 javdb 404 \u2192 dmm \u7A7A\u7ED3\u679C', fg: (r.note || '').includes('\u8054\u7F51') ? BAD : DIM2 },
            { t: '[ result ] \u4FDD\u6301\u539F\u4F4D\uFF0C\u4E0D\u8BA1\u5165\u53EF\u6267\u884C\u9879', fg: WARN },
          ],
          fix: () => { this.setState({ scInspect: null }); this.toast('\u5DF2\u6253\u5F00\u624B\u52A8\u756A\u53F7\u8F93\u5165', ACC); },
        };
      })() : null,
      closeInspect: () => this.setState({ scInspect: null }),
      scanDir: st.scScanDir, setScanDir: (e) => this.setState({ scScanDir: e.target.value }),
      outDir: st.scOutDir, setOutDir: (e) => this.setState({ scOutDir: e.target.value }),
      folderRule: st.scFolderRule, setFolderRule: (e) => this.setState({ scFolderRule: e.target.value }),
      fileRule: st.scFileRule, setFileRule: (e) => this.setState({ scFileRule: e.target.value }),
      maxDepth: st.scMaxDepth, setMaxDepth: (e) => this.setState({ scMaxDepth: e.target.value }),
      concurrent: st.scConcurrent, setConcurrent: (e) => this.setState({ scConcurrent: e.target.value }),
      opts: [
        { key: 'recursive', label: '\u9012\u5F52\u626B\u63CF\u5B50\u76EE\u5F55', hint: 'recursive \xB7 \u914D\u5408\u6700\u5927\u6DF1\u5EA6\u9650\u5236\u5C42\u7EA7' },
        { key: 'scrape', label: '\u8054\u7F51\u522E\u524A\u5143\u6570\u636E', hint: 'scrape \xB7 \u5173\u95ED\u5219\u4EC5\u6309\u6587\u4EF6\u540D\u8BC6\u522B\u756A\u53F7' },
        { key: 'organize', label: '\u6574\u7406\u5230\u76EE\u6807\u76EE\u5F55', hint: 'organize \xB7 \u5173\u95ED\u5219\u53EA\u5728\u539F\u5730\u5199\u5165\u8D44\u6599' },
        { key: 'write_nfo', label: '\u5199\u5165 NFO', hint: 'write_nfo \xB7 \u542B fileinfo/streamdetails' },
        { key: 'download_images', label: '\u4E0B\u8F7D\u5C01\u9762', hint: 'download_images \xB7 poster + fanart' },
        { key: 'download_sample_images', label: '\u4E0B\u8F7D\u6837\u7247\u56FE', hint: 'download_sample_images \xB7 extrafanart/', dep: 'download_images' },
        { key: 'download_actor_images', label: '\u4E0B\u8F7D\u6F14\u5458\u5934\u50CF', hint: 'download_actor_images \xB7 .actors/', dep: 'download_images' },
        { key: 'download_list_thumbnail', label: '\u4E0B\u8F7D\u5217\u8868\u7F29\u7565\u56FE', hint: 'download_list_thumbnail', dep: 'download_images' },
        { key: 'overwrite_existing', label: '\u8986\u76D6\u5DF2\u6709\u8D44\u6599', hint: 'overwrite_existing \xB7 \u5DF2\u5B58\u5728\u7684 NFO / \u56FE\u7247\u4F1A\u88AB\u91CD\u5199' },
      ].map((x) => {
        const disabled = x.dep ? !o[x.dep] : (x.key !== 'recursive' && x.key !== 'scrape' && x.key !== 'organize' && x.key !== 'overwrite_existing' ? !o.scrape : false);
        return { label: x.label, hint: x.hint, on: !!o[x.key] && !disabled, disabled, fg: disabled ? DIM2 : DIM, cursor: disabled ? 'not-allowed' : 'pointer', toggle: disabled ? () => {} : toggleOpt(x.key) };
      }),
      preview: () => {
        this.setState({ scPhase: 'scanning', scPct: 12 });
        if (this._sc1) clearTimeout(this._sc1);
        if (this._sc2) clearTimeout(this._sc2);
        this._sc1 = setTimeout(() => this.setState({ scPct: 68 }), 400);
        this._sc2 = setTimeout(() => { this.setState({ scPhase: 'preview', scPct: 100 }); this.toast('\u9884\u89C8\u5DF2\u751F\u6210\uFF1A238 \u4E2A\u6587\u4EF6\uFF0C226 \u53EF\u6267\u884C\uFF0C3 \u51B2\u7A81\uFF0C12 \u5F02\u5E38', ACC); }, 950);
      },
      reset: () => this.setState({ scPhase: 'idle', scSkip: [], scPct: 0 }),
      stats: [
        { label: '\u626B\u63CF\u6587\u4EF6', value: '238', color: 'var(--fg)' },
        { label: '\u8BC6\u522B\u6210\u529F', value: '226', color: OK },
        { label: '\u6587\u4EF6\u51B2\u7A81', value: '3', color: WARN },
        { label: '\u5F02\u5E38', value: '12', color: BAD },
        { label: '\u9884\u8BA1\u79FB\u52A8', value: '1.42 TB', color: 'var(--accs)' },
      ],
      nAll: SCRAPE_ROWS.length, nConf: conflicts.length, nErr: errors.length,
      f0: st.scF === '0', f1: st.scF === '1', f2: st.scF === '2',
      setF0: () => this.setState({ scF: '0' }), setF1: () => this.setState({ scF: '1' }), setF2: () => this.setState({ scF: '2' }),
      strategy: st.scStrategy, setStrategy: (e) => this.setState({ scStrategy: e.target.value }),
      applyStrategy: () => this.toast(\`\u5DF2\u5BF9 3 \u4E2A\u51B2\u7A81\u9879\u5957\u7528\u300C\${st.scStrategy}\u300D\`, ACC),
      selCount: executable.length, allSel: st.scSkip.length === 0,
      toggleAll: () => this.setState({ scSkip: st.scSkip.length ? [] : SCRAPE_ROWS.filter((r) => r.kind !== 'error').map((r) => r.src) }),
      rows: rows.map((r) => ({
        src: r.src, srcMeta: r.srcMeta, code: r.code, dst: r.dst, dstMeta: r.dstMeta,
        srcFg: r.kind === 'error' ? DIM2 : 'var(--fg)', dstFg: r.kind === 'error' ? DIM2 : DIM,
        codeFg: r.kind === 'error' ? BAD : ACC,
        status: STXT[r.kind], stFg: SFG[r.kind], note: r.note || '',
        isConflict: r.kind === 'conflict', isError: r.kind === 'error', isOk: r.kind === 'ok',
        action: r.action || '', sel: r.kind !== 'error' && !st.scSkip.includes(r.src), selDisabled: r.kind === 'error',
        toggle: () => this.setState({ scSkip: st.scSkip.includes(r.src) ? st.scSkip.filter((s) => s !== r.src) : st.scSkip.concat(r.src) }),
        compare: () => this.setState({ scCmp: r.src }),
        fix: () => this.toast(\`\u5DF2\u4E3A \${r.src.split('/').pop()} \u6253\u5F00\u624B\u52A8\u756A\u53F7\u8F93\u5165\`, ACC),
        inspect: () => this.setState({ scInspect: r.src }),
      })),
      cmp: cmp ? {
        code: cmp.code,
        sides: [
          { key: 'existing', title: '\u76EE\u6807\u5DF2\u5B58\u5728\u6587\u4EF6', data: cmp.existing, better: cmp.betterSide === 'existing' },
          { key: 'incoming', title: '\u672C\u6B21\u5F85\u5165\u5E93\u6587\u4EF6', data: cmp.incoming, better: cmp.betterSide === 'incoming' },
        ].map((s) => ({
          title: s.title, better: s.better,
          bg: s.better ? 'rgba(145,132,217,.07)' : 'var(--t03)',
          ring: s.better ? 'rgba(145,132,217,.35)' : 'var(--t09)',
          titleFg: s.better ? 'var(--accs)' : DIM,
          fields: [['\u4F53\u79EF', s.data.size], ['\u5206\u8FA8\u7387', s.data.res], ['\u7F16\u7801', s.data.codec], ['\u7801\u7387', s.data.bitrate], ['\u65F6\u957F', s.data.dur], ['\u4FEE\u6539\u65F6\u95F4', s.data.date], ['\u8DEF\u5F84', s.data.path]].map(([k, v]) => ({ k, v, fg: DIM })),
          keep: () => { this.setState({ scCmp: null }); this.toast(\`\${cmp.code} \u4FDD\u7559\${s.title}\uFF08\${s.key === 'incoming' ? 'keep_source' : 'keep_target'}\uFF09\`, ACC); },
        })),
        skip: () => { this.setState({ scCmp: null }); this.toast(\`\${cmp.code} \u5DF2\u6807\u8BB0 skip\uFF0C\u6E90\u6587\u4EF6\u4FDD\u6301\u539F\u4F4D\`, WARN); },
      } : null,
      closeCmp: () => this.setState({ scCmp: null }),
      execNote: \`\u5C06\u6574\u7406 \${executable.length} \u4E2A\u6587\u4EF6\u5230 \${st.scOutDir} \xB7 3 \u4E2A\u51B2\u7A81\u6309\u300C\${st.scStrategy}\u300D\u5904\u7406 \xB7 12 \u4E2A\u5F02\u5E38\u6587\u4EF6\u4FDD\u6301\u539F\u4F4D\`,
      dryRun: () => this.toast('\u5DF2\u6309 organize=false \u5728\u539F\u5730\u5199\u5165 NFO \u4E0E\u56FE\u7247\uFF0C\u672A\u79FB\u52A8\u4EFB\u4F55\u6587\u4EF6', ACC),
      execute: () => this.ask({
        title: \`\u786E\u8BA4\u6267\u884C\u522E\u524A\u6574\u7406\uFF1F\`, color: WARN, okText: '\u5F00\u59CB\u6267\u884C',
        body: \`\u5C06\u79FB\u52A8 \${executable.length} \u4E2A\u6587\u4EF6\u5230 \${st.scOutDir}\uFF0C\u5E76\u6309\u89C4\u5219\u91CD\u547D\u540D\u3001\u5199\u5165 NFO \u4E0E\u56FE\u7247\u3002\u6587\u4EF6\u79FB\u52A8\u4E0D\u53EF\u81EA\u52A8\u64A4\u9500\u30023 \u4E2A\u51B2\u7A81\u9879\u6309\u300C\${st.scStrategy}\u300D\u5904\u7406\u3002\`,
        list: ['MIZ-812 \u2192 /media/JAV/MIZ-812 \u591C\u884C\u5217\u8ECA \u6700\u7D42\u7AE0/', 'SKR-940 \u2192 /media/JAV/SKR-940 \u6D77\u8FBA\u306E\u8A18\u61B6 \u524D\u7DE8/', 'KND-372 \u2192 2 \u4E2A\u5206\u6BB5\u5408\u5E76\u4E3A\u4E00\u6761\u8BB0\u5F55', '\u2026 \u5171 ' + executable.length + ' \u9879'],
        ackText: '\u6211\u5DF2\u786E\u8BA4\u76EE\u6807\u8DEF\u5F84\u4E0E\u547D\u540D\u89C4\u5219\u6B63\u786E',
        run: () => { this.setState({ scPhase: 'idle', scSkip: [] }); this.toast('\u522E\u524A\u4EFB\u52A1\u5DF2\u5728\u540E\u53F0\u542F\u52A8\uFF0C\u53EF\u5728\u540E\u53F0\u4EFB\u52A1\u4E2D\u67E5\u770B\u8FDB\u5EA6', ACC); },
      }),
    };
  }

  vLibrary() {
    const st = this.state;
    let rows = LIB.slice();
    if (st.lbQ) rows = rows.filter((r) => r.code.includes(st.lbQ.toUpperCase()) || r.title.includes(st.lbQ) || r.actors.some((a) => a.includes(st.lbQ)));
    if (st.lbActor !== '\u5168\u90E8\u6F14\u5458') rows = rows.filter((r) => r.actors.includes(st.lbActor));
    if (st.lbStudio !== '\u5168\u90E8\u5236\u4F5C\u5546') rows = rows.filter((r) => r.studio === st.lbStudio);
    if (st.lbRes !== '\u5168\u90E8\u5206\u8FA8\u7387') rows = rows.filter((r) => (st.lbRes === '720p \u53CA\u4EE5\u4E0B' ? r.res === '720p' : r.res === st.lbRes));
    if (st.lbM === '1') rows = rows.filter((r) => r.c === 100);
    if (st.lbM === '2') rows = rows.filter((r) => r.c < 100);
    if (st.lbSubOnly) rows = rows.filter((r) => r.tags.includes('\u4E2D\u6587\u5B57\u5E55'));
    if (st.lbMissing) rows = rows.filter((r) => r.gone);
    const dm = LIB.find((r) => r.code === st.lbDetail);
    return {
      q: st.lbQ, setQ: (e) => this.setState({ lbQ: e.target.value }),
      actor: st.lbActor, setActor: (e) => this.setState({ lbActor: e.target.value }),
      studio: st.lbStudio, setStudio: (e) => this.setState({ lbStudio: e.target.value }),
      res: st.lbRes, setRes: (e) => this.setState({ lbRes: e.target.value }),
      m0: st.lbM === '0', m1: st.lbM === '1', m2: st.lbM === '2',
      setM0: () => this.setState({ lbM: '0' }), setM1: () => this.setState({ lbM: '1' }), setM2: () => this.setState({ lbM: '2' }),
      subOnly: st.lbSubOnly, toggleSub: () => this.setState({ lbSubOnly: !st.lbSubOnly }),
      missing: st.lbMissing, toggleMissing: () => this.setState({ lbMissing: !st.lbMissing }),
      reset: () => this.setState({ lbQ: '', lbActor: '\u5168\u90E8\u6F14\u5458', lbStudio: '\u5168\u90E8\u5236\u4F5C\u5546', lbRes: '\u5168\u90E8\u5206\u8FA8\u7387', lbM: '0', lbSubOnly: false, lbMissing: false }),
      sort: st.lbSort, setSort: (e) => this.setState({ lbSort: e.target.value }),
      vList: st.lbView === 'list', vPoster: st.lbView === 'poster', vActor: st.lbView === 'actor',
      setVList: () => this.setState({ lbView: 'list' }), setVPoster: () => this.setState({ lbView: 'poster' }), setVActor: () => this.setState({ lbView: 'actor' }),
      showList: st.lbView === 'list', showPoster: st.lbView === 'poster', showActor: st.lbView === 'actor',
      paths: [
        { path: '/media/JAV', status: '\u5DF2\u7D22\u5F15 1,182 \u90E8 \xB7 07-23 09:12', fg: 'var(--fg)', stFg: OK },
        { path: '/media/JAV-2', status: '\u626B\u63CF\u4E2D 1,204 / 1,366', fg: 'var(--fg)', stFg: WARN },
        { path: '/mnt/webdav/archive', status: '\u79BB\u7EBF \xB7 \u6302\u8F7D\u70B9\u4E0D\u53EF\u8BFB', fg: DIM2, stFg: BAD },
      ].map((p) => ({ ...p, scan: () => this.toast(\`\u5DF2\u6392\u5165\u626B\u63CF\u961F\u5217\uFF1A\${p.path}\`, ACC) })),
      openPaths: () => this.setState({ lbPathCfg: true }),
      closePaths: () => this.setState({ lbPathCfg: false }),
      savePaths: () => { this.setState({ lbPathCfg: false }); this.toast(\`\u8DEF\u5F84\u914D\u7F6E\u5DF2\u4FDD\u5B58\uFF1A\${st.lbPaths.length} \u4E2A\u5A92\u4F53\u5E93\u8DEF\u5F84\u3001\${st.lbExcludes.length} \u4E2A\u6392\u9664\u76EE\u5F55\`, OK); },
      pathCfg: st.lbPathCfg,
      pathGroups: [
        { name: '\u5A92\u4F53\u5E93\u8DEF\u5F84', hint: '\u626B\u63CF\u5165\u5E93\u7684\u6839\u76EE\u5F55', key: 'lbPaths', list: st.lbPaths, emptyText: '\u8FD8\u6CA1\u6709\u5A92\u4F53\u5E93\u8DEF\u5F84\uFF0C\u6DFB\u52A0\u540E\u624D\u80FD\u626B\u63CF\u5165\u5E93' },
        { name: '\u6392\u9664\u76EE\u5F55', hint: '\u626B\u63CF\u65F6\u8DF3\u8FC7\uFF0C\u4E0D\u5199\u5165\u7D22\u5F15', key: 'lbExcludes', list: st.lbExcludes, emptyText: '\u6CA1\u6709\u6392\u9664\u76EE\u5F55\uFF0C\u5168\u90E8\u5B50\u76EE\u5F55\u90FD\u4F1A\u88AB\u626B\u63CF' },
      ].map((g) => ({
        name: g.name, hint: g.hint, empty: g.list.length === 0, emptyText: g.emptyText,
        add: () => this.setState({ [g.key]: g.list.concat('') }),
        rows: g.list.map((p, i) => {
          const st2 = g.key === 'lbExcludes' ? { text: '\u6392\u9664\u4E2D', fg: DIM2 }
            : p === '/media/JAV' ? { text: '\u5DF2\u7D22\u5F15 1,182 \u90E8', fg: OK }
            : p === '/media/JAV-2' ? { text: '\u626B\u63CF\u4E2D', fg: WARN }
            : { text: '\u79BB\u7EBF \xB7 \u4E0D\u53EF\u8BFB', fg: BAD };
          return { path: p, status: st2.text, stFg: st2.fg,
            remove: () => this.setState({ [g.key]: g.list.filter((_, j) => j !== i) }) };
        }),
      })),
      hasQ: !!st.lbQ,
      runSearch: () => this.toast(st.lbQ ? \`\u5DF2\u5728 library.db \u4E2D\u641C\u7D22\u300C\${st.lbQ}\u300D\` : '\u8BF7\u8F93\u5165\u5173\u952E\u8BCD', st.lbQ ? ACC : WARN),
      clearQ: () => this.setState({ lbQ: '' }),
      closeTc: () => this.setState({ lbTc: null }),
      tcDialog: st.lbTc ? (() => {
        const m = LIB.find((x) => x.code === st.lbTc.code) || LIB[0];
        const gbNum = parseFloat(m.size) || 6;
        const est = { keep_quality: 0.4, reduce_quality: 0.22, save_space: 0.16, custom: 0.35 };
        const P = [
          { key: 'keep_quality', name: 'keep_quality \xB7 \u753B\u8D28\u57FA\u672C\u4FDD\u6301', tag: 'H.265', desc: '\u89C6\u89C9\u51E0\u4E4E\u65E0\u635F\uFF0C\u9002\u5408\u957F\u671F\u7559\u5B58\u3002', codec: 'hevc_nvenc \xB7 CQ 24 \xB7 preset p5', ok: true },
          { key: 'reduce_quality', name: 'reduce_quality \xB7 \u964D\u4F4E\u753B\u8D28', tag: 'H.265', desc: '\u53EF\u89C1\u8F7B\u5FAE\u8F6F\u5316\uFF0C\u4F53\u79EF\u6700\u7701\u3002', codec: 'hevc_nvenc \xB7 CQ 30 \xB7 preset p4', ok: true },
          { key: 'save_space', name: 'save_space \xB7 \u7701\u7A7A\u95F4 AV1', tag: 'GPU \u4E0D\u652F\u6301', desc: '\u9700\u8981 AV1 \u786C\u4EF6\u7F16\u7801\uFF0C\u5F53\u524D\u9A71\u52A8\u4E0D\u53EF\u7528\u3002', codec: 'av1_nvenc \xB7 \u63A2\u9488\u5931\u8D25', ok: false },
          { key: 'custom', name: 'custom \xB7 \u4E13\u4E1A\u53C2\u6570', tag: '\u624B\u52A8', desc: '\u624B\u52A8\u8986\u76D6\u7F16\u7801\u5668\u3001CQ\u3001\u5206\u8FA8\u7387\u3001\u5E27\u7387\u4E0E\u97F3\u5B57\u5E55\u4FDD\u7559\u3002', codec: 'TranscodingOptions \u5168\u91CF\u8986\u76D6', ok: true },
        ];
        return {
          code: m.code, file: \`/media/JAV/\${m.code} \${m.title}/\${m.code} \${m.title}.\${m.codec === 'hevc' ? 'mkv' : 'mp4'}\`,
          src: [
            { k: '\u5206\u8FA8\u7387', v: m.res }, { k: '\u7F16\u7801', v: m.codec },
            { k: '\u65F6\u957F', v: m.dur }, { k: '\u4F53\u79EF', v: m.size },
            { k: '\u6587\u4EF6\u6570', v: \`\${m.files} \u4E2A\` }, { k: 'GPU', v: 'NVIDIA \xB7 NVENC' },
          ],
          presets: P.map((p) => ({
            name: p.name, tag: p.tag, desc: p.desc, codec: p.codec,
            estimate: p.ok ? \`\u7EA6 \${(gbNum * est[p.key]).toFixed(1)} GB\` : '\u4E0D\u53EF\u7528',
            on: st.lbTcPreset === p.key, disabled: !p.ok,
            cursor: p.ok ? 'pointer' : 'not-allowed', op: p.ok ? '1' : '.55',
            bg: st.lbTcPreset === p.key ? 'rgba(145,132,217,.09)' : 'var(--t03)',
            ring: st.lbTcPreset === p.key ? 'rgba(145,132,217,.45)' : 'var(--t09)',
            tagBg: p.ok ? 'rgba(145,132,217,.16)' : 'rgba(224,129,136,.16)',
            tagFg: p.ok ? 'var(--accs)' : BAD,
            codecFg: p.ok ? DIM2 : BAD,
            pick: p.ok ? () => this.setState({ lbTcPreset: p.key }) : () => {},
          })),
          custom: st.lbTcPreset === 'custom',
          customFields: [
            { label: '\u7F16\u7801\u5668', kind: 'select', value: 'hevc_nvenc', options: ['hevc_nvenc', 'h264_nvenc', 'libx265'] },
            { label: 'CQ', kind: 'text', value: '24' },
            { label: 'preset', kind: 'select', value: 'p5', options: ['p4', 'p5', 'p6'] },
            { label: '\u76EE\u6807\u5206\u8FA8\u7387', kind: 'select', value: '\u4FDD\u6301\u539F\u59CB', options: ['\u4FDD\u6301\u539F\u59CB', '1080p', '720p'] },
            { label: '\u5E27\u7387', kind: 'select', value: '\u4FDD\u6301\u539F\u59CB', options: ['\u4FDD\u6301\u539F\u59CB', '30', '60'] },
            { label: '\u97F3\u8F68\u4E0E\u5B57\u5E55', kind: 'select', value: '\u5168\u90E8\u4FDD\u7559', options: ['\u5168\u90E8\u4FDD\u7559', '\u4EC5\u7B2C\u4E00\u6761', '\u4E0D\u4FDD\u7559\u5B57\u5E55'] },
          ].map((f) => ({ label: f.label, value: f.value, isSelect: f.kind === 'select', isText: f.kind === 'text', options: (f.options || []).map((t) => ({ t })) })),
          note: m.files > 1
            ? \`\u8BE5\u5F71\u7247\u6709 \${m.files} \u4E2A\u5206\u6BB5\u6587\u4EF6\uFF0C\u4F1A\u6309 file_index \u751F\u6210 \${m.files} \u4E2A\u8F6C\u7801\u4EFB\u52A1\u3002\u53EA\u6709\u8F93\u51FA\u4F53\u79EF\u5C0F\u4E8E\u539F\u6587\u4EF6\u65F6\u624D\u539F\u5B50\u66FF\u6362\u3002\`
            : '\u8F6C\u7801\u5199\u5165\u4E34\u65F6\u6587\u4EF6\uFF0C\u4EC5\u5F53\u8F93\u51FA\u4F53\u79EF\u5C0F\u4E8E\u539F\u6587\u4EF6\u65F6\u624D\u539F\u5B50\u66FF\u6362\uFF1B\u5931\u8D25\u4F1A\u56DE\u6EDA\u5E76\u4FDD\u7559\u539F\u6587\u4EF6\u3002',
          openPanel: () => { this.setState({ lbTc: null, lbDetail: null, route: 'transcode' }); },
          submit: () => {
            this.setState({ lbTc: null, lbDetail: null, route: 'transcode' });
            this.toast(\`\${m.code} \u5DF2\u52A0\u5165\u8F6C\u7801\u961F\u5217\uFF08\${st.lbTcPreset}\uFF09\${m.files > 1 ? ' \xB7 ' + m.files + ' \u4E2A\u5206\u6BB5\u4EFB\u52A1' : ''}\`, ACC);
          },
        };
      })() : null,
      stats: [
        { label: '\u5F71\u7247', value: '1,182', note: '\u672C\u6708\u65B0\u589E 96', color: 'var(--fg)' },
        { label: '\u6587\u4EF6', value: '1,247', note: '\u542B 65 \u4E2A\u591A\u5206\u6BB5\u6587\u4EF6', color: 'var(--fg)' },
        { label: '\u5360\u7528\u5BB9\u91CF', value: '9.4 TB', note: '\u5E73\u5747 8.1 GB / \u90E8', color: 'var(--accs)' },
        { label: '\u8D44\u6599\u5B8C\u6574\u5EA6', value: '93%', note: '84 \u90E8\u7F3A\u5C01\u9762\u6216\u6837\u7247', color: WARN },
      ],
      scanning: st.lbScanning,
      scanAll: () => this.ask({
        title: '\u626B\u63CF\u5165\u5E93\uFF1F', color: ACC, okText: '\u5F00\u59CB\u626B\u63CF',
        body: '\u9012\u5F52\u626B\u63CF\u5DF2\u914D\u7F6E\u7684\u5A92\u4F53\u5E93\u8DEF\u5F84\uFF0C\u8BFB\u53D6 NFO \u4E0E ffprobe \u5A92\u4F53\u53C2\u6570\u5199\u5165 library.db\u3002\u4E0D\u4F1A\u79FB\u52A8\u6216\u5220\u9664\u4EFB\u4F55\u6587\u4EF6\uFF1B\u79BB\u7EBF\u8DEF\u5F84\u4F1A\u81EA\u52A8\u8DF3\u8FC7\u3002',
        list: ['/media/JAV \xB7 \u5DF2\u7D22\u5F15 1,182 \u90E8', '/media/JAV-2 \xB7 \u5F85\u626B\u63CF', '/mnt/webdav/archive \xB7 \u79BB\u7EBF\uFF0C\u5C06\u8DF3\u8FC7'],
        run: () => { this.setState({ lbScanning: true }); this.toast('\u626B\u63CF\u5DF2\u5728\u540E\u53F0\u542F\u52A8\uFF082 \u4E2A\u8DEF\u5F84\uFF09', ACC); },
      }),
      stopScan: () => { this.setState({ lbScanning: false }); this.toast('\u626B\u63CF\u5DF2\u505C\u6B62\uFF0C\u5DF2\u7D22\u5F15\u90E8\u5206\u4FDD\u7559', WARN); },
      openCheck: () => this.setState({ lbCheckCfg: true }),
      closeCheck: () => this.setState({ lbCheckCfg: false }),
      checkCfg: st.lbCheckCfg,
      checkItems: [
        { key: 'nfo', label: 'NFO \u6587\u4EF6', hint: '\u5B58\u5728\u4E14\u53EF\u89E3\u6790' },
        { key: 'poster', label: '\u5C01\u9762 poster', hint: 'poster.jpg' },
        { key: 'fanart', label: '\u80CC\u666F\u56FE fanart', hint: 'fanart.jpg' },
        { key: 'sample', label: '\u6837\u7247\u56FE', hint: 'extrafanart/ \u81F3\u5C11 1 \u5F20' },
        { key: 'actor', label: '\u6F14\u5458\u5934\u50CF', hint: '.actors/ \u8986\u76D6\u5168\u90E8\u6F14\u5458' },
        { key: 'meta', label: '\u5143\u6570\u636E\u5B57\u6BB5', hint: '\u6807\u9898 / \u7CFB\u5217 / \u5BFC\u6F14 / \u6807\u7B7E' },
        { key: 'mediainfo', label: '\u5A92\u4F53\u53C2\u6570', hint: 'ffprobe \u5206\u8FA8\u7387\u4E0E\u7F16\u7801' },
        { key: 'subtitle', label: '\u5916\u6302\u5B57\u5E55', hint: '\u540C\u540D .srt / .ass' },
      ].map((c) => ({ label: c.label, hint: c.hint, on: !!st.lbCheckItems[c.key],
        toggle: () => this.setState({ lbCheckItems: { ...st.lbCheckItems, [c.key]: !st.lbCheckItems[c.key] } }) })),
      runCheck: () => { const n = Object.values(st.lbCheckItems).filter(Boolean).length; this.setState({ lbCheckCfg: false }); this.toast(\`\u8D44\u6599\u68C0\u67E5\u5B8C\u6210\uFF08\${n} \u9879\uFF09\uFF1A84 \u90E8\u7F3A\u8D44\u6599\uFF0C\u5176\u4E2D 12 \u90E8\u53EF\u8054\u7F51\u8865\u5168\`, WARN); },
      clean: () => this.ask({
        title: '\u6E05\u6D17\u65E0\u6548\u6587\u4EF6\u8BB0\u5F55\uFF1F', color: WARN, okText: '\u6E05\u6D17\u8BB0\u5F55',
        body: '\u626B\u63CF library.db\uFF0C\u5220\u9664\u78C1\u76D8\u4E0A\u5DF2\u4E0D\u5B58\u5728\u7684\u6587\u4EF6\u8BB0\u5F55\u4E0E\u5176\u7A7A\u58F3\u5F71\u7247\u6761\u76EE\u3002\u4E0D\u4F1A\u5220\u9664\u4EFB\u4F55\u4ECD\u5B58\u5728\u7684\u6587\u4EF6\u3002',
        list: ['KND-351 \xB7 /media/JAV/KND-351 \u6D77\u9CF4\u308A\u306E\u8857/ \xB7 \u6587\u4EF6\u7F3A\u5931', '\u5171 1 \u6761\u5F71\u7247\u8BB0\u5F55\u30011 \u4E2A\u6587\u4EF6\u8BB0\u5F55'],
        run: () => this.toast('\u5DF2\u6E05\u6D17 1 \u6761\u65E0\u6548\u8BB0\u5F55', OK),
      }),
      purgeDb: () => this.ask({
        title: '\u6E05\u7A7A\u5F71\u89C6\u5E93\u6570\u636E\u5E93\uFF1F', color: BAD, okText: '\u6E05\u7A7A library.db',
        body: '\u5220\u9664\u5168\u90E8 1,182 \u6761\u5F71\u7247\u7D22\u5F15\u3001\u6F14\u5458\u4E0E\u6807\u7B7E\u6570\u636E\u3002\u78C1\u76D8\u4E0A\u7684\u5F71\u7247\u6587\u4EF6\u3001NFO \u4E0E\u56FE\u7247\u4E0D\u53D7\u5F71\u54CD\uFF0C\u9700\u8981\u91CD\u65B0\u626B\u63CF\u624D\u80FD\u6062\u590D\u7D22\u5F15\u3002',
        list: ['1,182 \u90E8\u5F71\u7247 \xB7 1,247 \u4E2A\u6587\u4EF6\u8BB0\u5F55', '2,146 \u4F4D\u6F14\u5458 \xB7 312 \u4E2A\u6807\u7B7E', '\u78C1\u76D8\u6587\u4EF6\u4E0D\u4F1A\u88AB\u5220\u9664'],
        ackText: '\u6211\u786E\u8BA4\u6E05\u7A7A\u5168\u90E8\u5F71\u89C6\u5E93\u7D22\u5F15',
        run: () => this.toast('library.db \u5DF2\u6E05\u7A7A\uFF0C\u8BF7\u91CD\u65B0\u626B\u63CF\u5165\u5E93', BAD),
      }),
      rows: rows.map((r) => ({
        code: r.code, title: r.title, meta: \`\${r.date} \xB7 \${r.studio} \xB7 \${r.dur}\`,
        actorText: r.actors.join(' / '), mediaText: \`\${r.res} \xB7 \${r.codec} \xB7 \${r.dur}\`,
        resText: \`\${r.res} \xB7 \${r.size}\`,
        fileText: r.gone ? '\u7F3A\u5931' : \`\${r.files} \u4E2A\`, fileFg: r.gone ? BAD : DIM,
        sizeText: r.size, fileMissing: !!r.gone,
        completeness: r.c, cFg: r.c === 100 ? OK : r.c >= 80 ? WARN : BAD,
        cNote: r.missing ? \`\u7F3A \${r.missing.join(' / ')}\` : '\u5B8C\u6574',
        open: () => this.setState({ lbDetail: r.code }),
      })),
      actors: [
        { name: '\u661F\u91CE \u672A\u6765', meta: '86 \u90E8 \xB7 712 GB', avatar: '\u5934\u50CF\u5DF2\u4E0B\u8F7D', ok: true },
        { name: '\u6850\u8C37 \u306A\u304E', meta: '64 \u90E8 \xB7 538 GB', avatar: '\u5934\u50CF\u5DF2\u4E0B\u8F7D', ok: true },
        { name: '\u4E09\u4E0A \u3072\u306A\u306E', meta: '52 \u90E8 \xB7 441 GB', avatar: '\u5934\u50CF\u7F3A\u5931', ok: false },
        { name: '\u6A58 \u3055\u3084\u304B', meta: '38 \u90E8 \xB7 402 GB', avatar: '\u5934\u50CF\u5DF2\u4E0B\u8F7D', ok: true },
        { name: '\u767D\u77F3 \u308B\u3044', meta: '31 \u90E8 \xB7 246 GB', avatar: '\u5934\u50CF\u7F3A\u5931', ok: false },
      ].map((a) => ({ ...a, initial: a.name.slice(0, 1), avatarFg: a.ok ? DIM2 : WARN })),
      closeDetail: () => this.setState({ lbDetail: null }),
      d: dm ? {
        code: dm.code, title: dm.title,
        incomplete: dm.c < 100, missingText: dm.missing ? \`\u7F3A\u5C11 \${dm.missing.join(' / ')}\` : '',
        fields: [
          ['\u53D1\u884C\u65E5\u671F', dm.date, 1], ['\u5165\u5E93\u65F6\u95F4', dm.added, 1], ['\u65F6\u957F', dm.dur, 1],
          ['\u5236\u4F5C\u5546', dm.studio, 0], ['\u53D1\u884C\u5546', dm.label, 0], ['\u7CFB\u5217', dm.series, 0], ['\u5BFC\u6F14', dm.director, 0],
          ['\u5206\u8FA8\u7387 / \u7F16\u7801', \`\${dm.res} \xB7 \${dm.codec}\`, 1], ['\u6587\u4EF6\u4F53\u79EF', dm.size, 1],
        ].map(([k, v, m]) => ({ k, v, mono: m ? 'var(--mono)' : 'inherit', fs: m ? '12px' : '12.5px', fg: 'var(--fg)' })),
        actors: dm.actors.map((a) => ({ name: a, initial: a.slice(0, 1) })),
        tags: dm.tags.map((t) => ({ t })),
        files: (dm.gone ? [{ idx: 0, path: \`/media/JAV/\${dm.code} \${dm.title}/\${dm.code}.mp4\`, size: '\u2014', codec: '\u2014', status: '\u6587\u4EF6\u7F3A\u5931', gone: true }]
          : dm.files === 2
            ? [{ idx: 0, path: \`/media/JAV/\${dm.code} \${dm.title}/\${dm.code}-CD1.mp4\`, size: '2.6 GB', codec: \`\${dm.codec} \xB7 \${dm.res}\`, status: '\u6B63\u5E38' }, { idx: 1, path: \`/media/JAV/\${dm.code} \${dm.title}/\${dm.code}-CD2.mp4\`, size: '2.5 GB', codec: \`\${dm.codec} \xB7 \${dm.res}\`, status: '\u6B63\u5E38' }]
            : [{ idx: 0, path: \`/media/JAV/\${dm.code} \${dm.title}/\${dm.code}.mkv\`, size: dm.size, codec: \`\${dm.codec} \xB7 \${dm.res}\`, status: '\u6B63\u5E38' }]
        ).map((f) => ({
          ...f, fg: f.gone ? DIM2 : 'var(--fg)', stFg: f.gone ? BAD : OK, gone: !!f.gone,
          play: () => this.toast(\`\u5DF2\u6309 file_index \${f.idx} \u6253\u5F00 \${f.path.split('/').pop()}\`, ACC),
          transcode: () => this.setState({ lbTc: { code: dm.code } }),
        })),
        complete: () => this.toast(\`\${dm.code} \u5DF2\u8054\u7F51\u8865\u5168\uFF1ANFO \u91CD\u5199 \xB7 poster/fanart 2 \xB7 \u6837\u7247 4 \xB7 \u6F14\u5458\u5934\u50CF 1\`, OK),
        recheck: () => this.toast(\`\${dm.code} \u5DF2\u91CD\u65B0\u522E\u524A\uFF0C\u5143\u6570\u636E\u4E0E NFO \u5DF2\u66F4\u65B0\`, ACC),
        remove: () => this.ask({
          title: \`\u79FB\u9664 \${dm.code} \u7684\u5E93\u8BB0\u5F55\uFF1F\`, color: WARN, okText: '\u79FB\u9664\u8BB0\u5F55',
          body: '\u4EC5\u4ECE library.db \u5220\u9664\u7D22\u5F15\uFF0C\u78C1\u76D8\u4E0A\u7684\u5F71\u7247\u6587\u4EF6\u3001NFO \u4E0E\u56FE\u7247\u4FDD\u6301\u4E0D\u52A8\u3002\u4E0B\u6B21\u626B\u63CF\u8BE5\u8DEF\u5F84\u65F6\u4F1A\u91CD\u65B0\u5165\u5E93\u3002',
          run: () => { this.setState({ lbDetail: null }); this.toast(\`\${dm.code} \u8BB0\u5F55\u5DF2\u79FB\u9664\`, WARN); },
        }),
        purge: () => this.ask({
          title: \`\u5F7B\u5E95\u5220\u9664 \${dm.code}\uFF1F\`, color: BAD, okText: '\u6C38\u4E45\u5220\u9664\u6587\u4EF6',
          body: \`\u5C06\u4ECE\u78C1\u76D8\u5220\u9664\u8BE5\u5F71\u7247\u7684\u5168\u90E8\u6587\u4EF6\u3001NFO\u3001\u5C01\u9762\u4E0E\u6837\u7247\u56FE\uFF0C\u5E76\u79FB\u9664\u5E93\u8BB0\u5F55\u3002\u6B64\u64CD\u4F5C\u4E0D\u53EF\u64A4\u9500\uFF0C\u4E5F\u4E0D\u8FDB\u5165\u56DE\u6536\u7AD9\u3002\`,
          list: [\`/media/JAV/\${dm.code} \${dm.title}/  \xB7 \${dm.size}\`, \`\${dm.files} \u4E2A\u89C6\u9891\u6587\u4EF6 \xB7 NFO \xB7 \u5C01\u9762 \xB7 \u6837\u7247\u56FE\`],
          ackText: \`\u6211\u786E\u8BA4\u6C38\u4E45\u5220\u9664 \${dm.code} \u7684\u5168\u90E8\u6587\u4EF6\`,
          run: () => { this.setState({ lbDetail: null }); this.toast(\`\${dm.code} \u5DF2\u5F7B\u5E95\u5220\u9664\uFF0C\u91CA\u653E \${dm.size}\`, BAD); },
        }),
      } : null,
    };
  }

  vAuto() {
    const st = this.state;
    const TASKS = [
      { name: '\u6BCF\u65E5\u65B0\u7247\u8DDF\u8FDB', trigger: '\u5B9A\u65F6 \xB7 03:00', last: '\u4E0A\u6B21 07-23 03:00 \xB7 \u6D3E\u53D1 6', running: true, summary: '\u5173\u6CE8 5 \u4F4D\u6F14\u5458\u7684\u65B0\u7247\uFF0C\u547D\u4E2D\u5373\u6309 4K + \u4E2D\u5B57\u4F18\u5148\u89C4\u5219\u6D3E\u53D1\u5230 PikPak' },
      { name: '\u4E2D\u5B57\u8865\u5168\uFF08\u5386\u53F2\u7247\uFF09', trigger: '\u95F4\u9694 \xB7 \u6BCF 360 \u5206\u949F', last: '\u4E0A\u6B21 07-23 12:00 \xB7 \u6D3E\u53D1 2', running: true, summary: '\u5BF9\u672C\u5730\u5DF2\u6709\u4F46\u65E0\u5B57\u5E55\u7684\u5F71\u7247\uFF0C\u68C0\u7D22\u4E2D\u6587\u5B57\u5E55\u7248\u672C\u5E76\u66FF\u6362' },
      { name: 'VR \u4E13\u533A\u6536\u96C6', trigger: '\u624B\u52A8\u89E6\u53D1', last: '\u4E0A\u6B21 07-21 19:42 \xB7 \u6D3E\u53D1 0', running: false, summary: '\u4EC5\u5728\u624B\u52A8\u89E6\u53D1\u65F6\u8FD0\u884C\uFF0C\u68C0\u7D22 VR \u7C7B\u522B 2160p \u8D44\u6E90' },
      { name: '\u7CFB\u5217\u8FFD\u66F4 \xB7 \u591C\u884C\u5217\u8ECA', trigger: '\u5B9A\u65F6 \xB7 05:00', last: '\u4E0A\u6B21 07-21 05:00 \xB7 \u9519\u8BEF 1', running: false, summary: '\u6309\u7CFB\u5217\u8FFD\u66F4\uFF0C\u78C1\u529B\u6765\u6E90\u4E0D\u53EF\u8FBE\u65F6\u4F1A\u8BB0\u5F55\u9519\u8BEF\u5E76\u8DF3\u8FC7\u672C\u6B21' },
    ];
    const cur = TASKS.find((t) => t.name === st.auTask) || TASKS[0];
    const running = cur.running && !st.auPauseAll && !st.auStopped.includes(cur.name);
    const NODES = [
      { key: 'trigger', step: '01', title: '\u89E6\u53D1', desc: '\u624B\u52A8 / \u5B9A\u65F6 / \u95F4\u9694\u4E09\u79CD\u65B9\u5F0F\uFF0C\u5B9A\u65F6\u53D6 HH:MM\uFF0C\u95F4\u9694\u6309\u5206\u949F\u3002', meta: 'schedule 03:00 \xB7 \u670D\u52A1\u7AEF\u65F6\u533A', badge: '\u5DF2\u914D\u7F6E' },
      { key: 'search', step: '02', title: '\u68C0\u7D22', desc: '\u590D\u7528\u5F71\u7247\u68C0\u7D22\u7684 filters \u4E0E\u5206\u9875\u53C2\u6570\u3002', meta: 'star \xD7 5 \xB7 magnet=exist \xB7 \u4E0A\u9650 40', badge: '\u5DF2\u914D\u7F6E' },
      { key: 'magnet', step: '03', title: '\u78C1\u529B', desc: '\u6309\u6E90\u4F18\u5148\u7EA7\u53D6\u78C1\u529B\uFF0C\u5E76\u5E94\u7528\u4E2D\u5B57\u4E0E 4K \u89C4\u5219\u3002', meta: 'javbus \u2192 cilisousuo \xB7 \u4E2D\u5B57\u5FC5\u9700', badge: '\u5DF2\u914D\u7F6E' },
      { key: 'download', step: '04', title: '\u4E0B\u8F7D', desc: '\u6D3E\u53D1\u5230\u6307\u5B9A\u5DE5\u5177\uFF0C\u8DF3\u8FC7\u672C\u5730\u5DF2\u6709\u4E0E\u5386\u53F2\u5931\u8D25\u94FE\u63A5\u3002', meta: 'pikpak \xB7 \u5355\u6B21\u4E0A\u9650 10', badge: '\u5DF2\u914D\u7F6E' },
    ];
    const FIELDS = {
      trigger: [
        { label: '\u89E6\u53D1\u65B9\u5F0F', kind: 'select', value: '\u5B9A\u65F6', options: ['\u624B\u52A8', '\u5B9A\u65F6', '\u95F4\u9694'], hint: 'manual / schedule / interval' },
        { label: '\u6267\u884C\u65F6\u95F4', kind: 'text', value: '03:00', mono: true, hint: 'HH:MM \xB7 \u4EC5\u5B9A\u65F6\u89E6\u53D1\u4F7F\u7528' },
        { label: '\u95F4\u9694\u5206\u949F', kind: 'text', value: '360', mono: true, hint: '\u4EC5\u95F4\u9694\u89E6\u53D1\u4F7F\u7528\uFF0C\u6700\u5C0F 5 \u5206\u949F' },
      ],
      search: [
        { label: '\u7B5B\u9009\u6761\u4EF6', kind: 'text', value: 'star:kxr, star:9wt, star:bk2, star:y7q, star:4mv', hint: '\u4E0E\u5F71\u7247\u68C0\u7D22\u4E00\u81F4\u7684 filters \u5217\u8868' },
        { label: '\u78C1\u529B', kind: 'select', value: '\u4EC5\u6709\u78C1\u529B', options: ['\u4EC5\u6709\u78C1\u529B', '\u5168\u90E8'], hint: 'magnet=exist / all' },
        { label: '\u5F71\u7247\u7C7B\u578B', kind: 'select', value: '\u6709\u7801', options: ['\u6709\u7801', '\u65E0\u7801'], hint: 'type=normal / uncensored' },
        { label: '\u6F14\u5458\u4EBA\u6570', kind: 'select', value: '\u4E0D\u9650', options: ['\u4E0D\u9650', '1 \u4EBA', '2 \u4EBA', '3 \u4EBA', '\u2264 2 \u4EBA', '\u2264 3 \u4EBA', '\u2265 3 \u4EBA', '\u2265 4 \u4EBA'], hint: 'actorCountFilter' },
        { label: '\u4E2D\u6587\u5B57\u5E55', kind: 'select', value: '\u6709', options: ['\u4E0D\u9650', '\u6709', '\u65E0'], hint: 'hasSubtitle' },
        { label: '\u6392\u9664 VR', kind: 'check', on: true, checkLabel: 'excludeVr', hint: '' },
        { label: '\u83B7\u53D6\u8303\u56F4', kind: 'select', value: '\u5F53\u524D\u9875', options: ['\u5F53\u524D\u9875', '\u5168\u90E8\u9875'], hint: 'fetchMode \xB7 \u5168\u90E8\u9875\u8017\u65F6\u8F83\u957F' },
        { label: '\u7ED3\u679C\u4E0A\u9650', kind: 'text', value: '40', mono: true, hint: '\u5355\u6B21\u8FD0\u884C\u6700\u591A\u5904\u7406\u7684\u756A\u53F7\u6570' },
      ],
      magnet: [
        { label: '\u78C1\u529B\u6E90\u987A\u5E8F', kind: 'select', value: 'javbus \u2192 cilisousuo', options: ['javbus \u2192 cilisousuo', '\u4EC5 javbus', 'cilisousuo \u2192 yhg007'], hint: '\u524D\u4E00\u4E2A\u65E0\u7ED3\u679C\u624D\u8BF7\u6C42\u4E0B\u4E00\u4E2A' },
        { label: '\u6392\u5E8F\u5B57\u6BB5', kind: 'select', value: '\u4F53\u79EF', options: ['\u4F53\u79EF', '\u65E5\u671F'], hint: 'sortBy \xB7 \u964D\u5E8F\u53D6\u7B2C\u4E00\u6761' },
        { label: '\u5B57\u5E55\u89C4\u5219', kind: 'select', value: '\u4E2D\u6587\u5B57\u5E55\u5FC5\u9700', options: ['\u4E0D\u9650', '\u4E2D\u6587\u5B57\u5E55\u4F18\u5148', '\u4E2D\u6587\u5B57\u5E55\u5FC5\u9700'], hint: '\u5FC5\u9700\u65F6\u65E0\u4E2D\u5B57\u5219\u8DF3\u8FC7\u8BE5\u756A\u53F7' },
        { label: '4K \u89C4\u5219', kind: 'select', value: '4K \u4F18\u5148', options: ['\u4E0D\u9650', '4K \u4F18\u5148', '4K \u5FC5\u9700', '\u6392\u9664 4K'], hint: '\u4F18\u5148\u65F6\u65E0 4K \u4F1A\u56DE\u843D 1080p' },
        { label: '\u5355\u6587\u4EF6\u4F53\u79EF\u4E0A\u9650', kind: 'text', value: '30 GB', mono: true, hint: '\u8D85\u8FC7\u5219\u8DF3\u8FC7\uFF0C\u907F\u514D VR \u5927\u5305\u5360\u6EE1\u914D\u989D' },
      ],
      download: [
        { label: '\u4E0B\u8F7D\u5DE5\u5177', kind: 'select', value: 'pikpak', options: ['pikpak', 'pan115', 'aria2'], hint: 'pan115 \u672A\u914D\u7F6E Cookie\uFF0C\u9009\u62E9\u540E\u65E0\u6CD5\u6D3E\u53D1' },
        { label: '\u5355\u6B21\u6D3E\u53D1\u4E0A\u9650', kind: 'text', value: '10', mono: true, hint: '\u8D85\u51FA\u7684\u756A\u53F7\u7559\u5230\u4E0B\u6B21\u8FD0\u884C' },
        { label: '\u8DF3\u8FC7\u672C\u5730\u5DF2\u6709', kind: 'check', on: true, checkLabel: '\u5F71\u89C6\u5E93\u4E2D\u5DF2\u5B58\u5728\u7684\u756A\u53F7\u4E0D\u518D\u6D3E\u53D1', hint: '' },
        { label: '\u8DF3\u8FC7\u5386\u53F2\u8BB0\u5F55', kind: 'check', on: true, checkLabel: '\u4E0B\u8F7D\u5386\u53F2\u4E2D\u5DF2\u6D3E\u53D1\u8FC7\u7684\u756A\u53F7\u8DF3\u8FC7', hint: '' },
        { label: '\u5931\u8D25\u5904\u7406', kind: 'select', value: '\u6362\u6B21\u4F18\u78C1\u529B\u91CD\u8BD5\u4E00\u6B21', options: ['\u76F4\u63A5\u8DF3\u8FC7', '\u6362\u6B21\u4F18\u78C1\u529B\u91CD\u8BD5\u4E00\u6B21', '\u6807\u8BB0\u5F85\u4EBA\u5DE5\u5904\u7406'], hint: '' },
      ],
    };
    const RUNS = [
      { time: '2026-07-23 03:00:04', trigger: '\u5B9A\u65F6', found: 34, matched: 9, dispatched: 6, skipped: 25, errors: 0, result: '6 \u90E8\u5DF2\u6D3E\u53D1\u5230 PikPak \xB7 3 \u90E8\u65E0\u4E2D\u5B57\u78C1\u529B\u8DF3\u8FC7' },
      { time: '2026-07-22 03:00:03', trigger: '\u5B9A\u65F6', found: 28, matched: 7, dispatched: 7, skipped: 21, errors: 0, result: '\u5168\u90E8\u6D3E\u53D1\u6210\u529F' },
      { time: '2026-07-21 19:42:18', trigger: '\u624B\u52A8', found: 12, matched: 2, dispatched: 0, skipped: 10, errors: 2, result: 'YHG007 \u8FDE\u63A5\u8D85\u65F6\uFF0C2 \u4E2A\u756A\u53F7\u672A\u53D6\u5230\u78C1\u529B' },
      { time: '2026-07-21 03:00:05', trigger: '\u5B9A\u65F6', found: 31, matched: 5, dispatched: 4, skipped: 26, errors: 1, result: 'MIZ-790 \u65E0\u4E2D\u5B57\u78C1\u529B\uFF0C\u5B57\u5E55\u89C4\u5219\u4E3A\u5FC5\u9700\u5DF2\u8DF3\u8FC7' },
      { time: '2026-07-20 03:00:02', trigger: '\u5B9A\u65F6', found: 26, matched: 4, dispatched: 4, skipped: 22, errors: 0, result: '\u5168\u90E8\u6D3E\u53D1\u6210\u529F' },
      { time: '2026-07-19 03:00:04', trigger: '\u5B9A\u65F6', found: 30, matched: 0, dispatched: 0, skipped: 30, errors: 0, result: '\u65E0\u65B0\u7247\u547D\u4E2D\u6761\u4EF6' },
    ];
    const nk = st.auNode;
    return {
      tasks: TASKS.map((t) => {
        const run = t.running && !st.auPauseAll && !st.auStopped.includes(t.name);
        return {
          name: t.name, trigger: t.trigger, last: t.last,
          dot: run ? OK : DIM2, status: run ? '\u8FD0\u884C\u4E2D' : st.auPauseAll ? '\u5DF2\u6682\u505C' : '\u5DF2\u505C\u6B62',
          stFg: run ? OK : st.auPauseAll ? WARN : DIM2,
          bg: st.auTask === t.name ? 'rgba(145,132,217,.08)' : 'transparent',
          ring: st.auTask === t.name ? 'rgba(145,132,217,.4)' : 'var(--t09)',
          pick: () => this.setState({ auTask: t.name, auNode: null }),
        };
      }),
      create: () => this.toast('\u5DF2\u521B\u5EFA\u7A7A\u767D\u81EA\u52A8\u4EFB\u52A1\u300C\u672A\u547D\u540D\u4EFB\u52A1\u300D\uFF0C\u8BF7\u914D\u7F6E\u89E6\u53D1\u4E0E\u68C0\u7D22\u8282\u70B9', ACC),
      autoLayout: () => this.toast('\u6D41\u7A0B\u8282\u70B9\u5DF2\u6309 \u89E6\u53D1 \u2192 \u68C0\u7D22 \u2192 \u78C1\u529B \u2192 \u4E0B\u8F7D \u91CD\u65B0\u6392\u7248', ACC),
      save: () => this.toast(\`\u300C\${cur.name}\u300D\u5DF2\u4FDD\u5B58 \xB7 \u4E0B\u6B21\u89E6\u53D1 07-24 03:00\`, OK),
      remove: () => this.ask({
        title: \`\u5220\u9664\u81EA\u52A8\u4EFB\u52A1\u300C\${cur.name}\u300D\uFF1F\`, color: BAD, okText: '\u5220\u9664\u4EFB\u52A1',
        body: '\u5220\u9664\u4EFB\u52A1\u53CA\u5176\u5168\u90E8\u8FD0\u884C\u8BB0\u5F55\u3002\u5DF2\u6D3E\u53D1\u7684\u4E0B\u8F7D\u4EFB\u52A1\u4E0D\u53D7\u5F71\u54CD\u3002',
        run: () => this.toast(\`\u300C\${cur.name}\u300D\u5DF2\u5220\u9664\`, BAD),
      }),
      pauseAll: st.auPauseAll, togglePauseAll: () => this.setState({ auPauseAll: !st.auPauseAll }),
      cur: {
        name: cur.name, summary: cur.summary, last: cur.last,
        status: running ? '\u8FD0\u884C\u4E2D' : st.auPauseAll ? '\u5168\u5C40\u6682\u505C' : '\u5DF2\u505C\u6B62',
        tagBg: running ? 'rgba(99,179,148,.16)' : st.auPauseAll ? 'rgba(201,160,94,.16)' : 'var(--line2)',
        tagFg: running ? OK : st.auPauseAll ? WARN : DIM2,
        toggleText: running ? '\u505C\u6B62\u4EFB\u52A1' : '\u542F\u52A8\u4EFB\u52A1', toggleFg: running ? BAD : ACC,
      },
      toggleRun: () => {
        if (running) {
          this.ask({
            title: \`\u505C\u6B62\u300C\${cur.name}\u300D\uFF1F\`, color: BAD, okText: '\u505C\u6B62\u4EFB\u52A1',
            body: '\u505C\u6B62\u540E\u5B9A\u65F6\u4E0E\u95F4\u9694\u89E6\u53D1\u4E0D\u518D\u6267\u884C\uFF0C\u5DF2\u6D3E\u53D1\u7684\u4E0B\u8F7D\u4EFB\u52A1\u4E0D\u53D7\u5F71\u54CD\u3002\u53EF\u4EE5\u968F\u65F6\u91CD\u65B0\u542F\u52A8\uFF0C\u6216\u7528\u300C\u7ACB\u5373\u8FD0\u884C\u4E00\u6B21\u300D\u624B\u52A8\u89E6\u53D1\u3002',
            run: () => { this.setState({ auStopped: st.auStopped.concat(cur.name) }); this.toast(\`\u300C\${cur.name}\u300D\u5DF2\u505C\u6B62\`, WARN); },
          });
        } else {
          this.setState({ auStopped: st.auStopped.filter((n) => n !== cur.name), auPauseAll: false });
          this.toast(\`\u300C\${cur.name}\u300D\u5DF2\u542F\u52A8 \xB7 \u4E0B\u6B21\u89E6\u53D1 07-24 03:00\`, OK);
        }
      },
      runNow: () => this.toast(\`\u300C\${cur.name}\u300D\u5DF2\u624B\u52A8\u89E6\u53D1\uFF0C\u68C0\u7D22\u4E2D\u2026\`, ACC),
      nodes: NODES.map((n, i) => ({
        step: n.step, title: n.title, desc: n.desc, meta: n.meta, badge: n.badge,
        hasArrow: i < NODES.length - 1,
        bg: nk === n.key ? 'rgba(145,132,217,.09)' : 'var(--t03)',
        ring: nk === n.key ? 'rgba(145,132,217,.45)' : 'var(--t09)',
        iconBg: nk === n.key ? 'rgba(145,132,217,.3)' : 'var(--line2)',
        iconFg: nk === n.key ? 'var(--acct)' : DIM2, stFg: DIM2,
        pick: () => this.setState({ auNode: nk === n.key ? null : n.key }),
      })),
      node: nk ? {
        title: NODES.find((n) => n.key === nk).title,
        fields: FIELDS[nk].map((f) => ({
          label: f.label, hint: f.hint || '',
          isSelect: f.kind === 'select', isText: f.kind === 'text', isCheck: f.kind === 'check',
          value: f.value || '', on: !!f.on, checkLabel: f.checkLabel || '',
          mono: f.mono ? 'var(--mono)' : 'inherit',
          options: (f.options || []).map((t) => ({ t })),
          set: () => {},
        })),
      } : null,
      closeNode: () => this.setState({ auNode: null }),
      saveNode: () => { this.setState({ auNode: null }); this.toast('\u8282\u70B9\u914D\u7F6E\u5DF2\u4FDD\u5B58\uFF0C\u4E0B\u6B21\u8FD0\u884C\u751F\u6548', OK); },
      refresh: () => this.toast('\u8FD0\u884C\u8BB0\u5F55\u5DF2\u5237\u65B0', ACC),
      runs: RUNS.map((r) => ({
        ...r, dispatchFg: r.dispatched ? OK : DIM2, errFg: r.errors ? BAD : DIM2,
        resFg: r.errors ? BAD : DIM,
        open: () => this.toast(\`\${r.time} \u8FD0\u884C\u660E\u7EC6\uFF1A\u68C0\u7D22 \${r.found} \xB7 \u5339\u914D \${r.matched} \xB7 \u6D3E\u53D1 \${r.dispatched} \xB7 \u8DF3\u8FC7 \${r.skipped} \xB7 \u9519\u8BEF \${r.errors}\`, r.errors ? WARN : ACC),
      })),
    };
  }

  vStorage() {
    const st = this.state;
    const SRC = [
      { key: 'webdav', name: 'WebDAV', status: '\u5DF2\u8FDE\u63A5', dot: OK, stFg: OK, meta: 'https://dav.example.net/media \xB7 \u53EA\u8BFB\u6302\u8F7D' },
      { key: 'local', name: '\u670D\u52A1\u7AEF\u672C\u5730', status: '\u53EF\u7528', dot: OK, stFg: OK, meta: '/media \xB7 /downloads \xB7 \u5269\u4F59 3.2 TB' },
      this.allConnected()
        ? { key: '115', name: '115 \u7F51\u76D8', status: '\u5DF2\u8FDE\u63A5', dot: OK, stFg: OK, meta: 'Cookie \u6709\u6548 \xB7 \u79BB\u7EBF\u76EE\u5F55 CID 2634891037465' }
        : { key: '115', name: '115 \u7F51\u76D8', status: '\u672A\u914D\u7F6E', dot: DIM2, stFg: DIM2, meta: 'Cookie \u4E3A\u7A7A \xB7 \u65E0\u6CD5\u5217\u76EE\u5F55' },
    ];
    const DIRS = {
      webdav: [
        { name: '..', type: '\u4E0A\u7EA7\u76EE\u5F55', size: '', date: '', dir: true },
        { name: 'MIZ-812/', type: '\u6587\u4EF6\u5939', size: '12.4 GB', date: '2026-07-23 14:31', dir: true },
        { name: 'SKR-940/', type: '\u6587\u4EF6\u5939', size: '6.2 GB', date: '2026-07-23 14:30', dir: true },
        { name: 'MIZ-812-4K-C.mkv', type: 'Matroska', size: '12.4 GB', date: '2026-07-23 14:22', video: true },
        { name: 'SKR-940-UC-1080p.mp4', type: 'MP4', size: '6.2 GB', date: '2026-07-23 14:19', video: true },
        { name: 'KND-372.mp4', type: 'MP4', size: '5.1 GB', date: '2026-07-22 20:04', video: true },
        { name: 'MIZ-806-VR-2160p.mkv', type: 'Matroska', size: '24.8 GB', date: '2026-07-23 11:08', video: true },
        { name: 'KND-358-4K-C.mkv', type: 'Matroska', size: '15.2 GB', date: '2026-07-22 19:44', video: true },
        { name: 'sample-KND-365.mp4', type: 'MP4', size: '86 MB', date: '2026-07-22 19:41', video: true, small: true },
        { name: 'MIZ-812.nfo', type: 'NFO', size: '4 KB', date: '2026-07-23 14:31' },
        { name: 'poster.jpg', type: 'JPEG', size: '412 KB', date: '2026-07-23 14:31' },
      ],
      '115': [
        { name: '..', type: '\u4E0A\u7EA7\u76EE\u5F55', size: '', date: '', dir: true },
        { name: 'JavJaeger/', type: '\u6587\u4EF6\u5939', size: '486 GB', date: '2026-07-23 15:12', dir: true },
        { name: 'SKR-928-C-1080p.mp4', type: 'MP4', size: '7.4 GB', date: '2026-07-22 22:41', video: true },
        { name: 'KND-351.mp4', type: 'MP4', size: '6.1 GB', date: '2026-07-21 18:30', video: true },
      ],
      local: [
        { name: '..', type: '\u4E0A\u7EA7\u76EE\u5F55', size: '', date: '', dir: true },
        { name: 'inbox/', type: '\u6587\u4EF6\u5939', size: '1.42 TB', date: '2026-07-23 16:02', dir: true },
        { name: 'aria2/', type: '\u6587\u4EF6\u5939', size: '86.4 GB', date: '2026-07-23 15:58', dir: true },
        { name: 'KND-372.part1.mp4', type: 'MP4', size: '2.6 GB', date: '2026-07-22 20:01', video: true },
        { name: 'KND-372.part2.mp4', type: 'MP4', size: '2.5 GB', date: '2026-07-22 20:03', video: true },
        { name: '\u672A\u547D\u540D_20260719_002.mp4', type: 'MP4', size: '3.8 GB', date: '2026-07-19 00:24', video: true },
      ],
    };
    const TASKS = [
      { name: 'MIZ-812-4K-C.mkv', dir: 'gid 8f2a41c9 \xB7 /downloads/aria2', status: 'active', pct: 68, done: '8.4 GB / 12.4 GB', speed: '11.2 MB/s', eta: '\u7EA6 6 \u5206' },
      { name: 'KND-358-4K-C.mkv', dir: 'gid 3b77c0d1 \xB7 /downloads/aria2', status: 'active', pct: 23, done: '3.5 GB / 15.2 GB', speed: '7.2 MB/s', eta: '\u7EA6 27 \u5206' },
      { name: 'MIZ-806-VR-2160p.mkv', dir: 'gid 51ce8d04 \xB7 /downloads/aria2', status: 'paused', pct: 41, done: '10.2 GB / 24.8 GB', speed: '\u2014', eta: '\u2014' },
      { name: 'SKR-902.mp4', dir: 'gid 8ad23077 \xB7 /downloads/aria2', status: 'waiting', pct: 0, done: '0 B / 5.6 GB', speed: '\u2014', eta: '\u2014' },
      { name: 'KND-365-C.mp4', dir: 'gid 72b904ae \xB7 /downloads/aria2', status: 'error', pct: 12, done: '0.4 GB / 3.4 GB', speed: '\u2014', eta: '\u2014' },
    ];
    const STXT = { active: '\u4E0B\u8F7D\u4E2D', paused: '\u5DF2\u6682\u505C', waiting: '\u7B49\u5F85\u4E2D', error: '\u9519\u8BEF' };
    const SFG = { active: OK, paused: WARN, waiting: DIM2, error: BAD };
    let rows = DIRS[st.fsSrc] || [];
    if (st.fsQ) rows = rows.filter((f) => f.dir || f.name.toLowerCase().includes(st.fsQ.toLowerCase()));
    if (st.fsVideoOnly) rows = rows.filter((f) => f.dir || f.video);
    if (st.fsMinSize !== '\u4E0D\u9650') {
      const min = st.fsMinSize === '\u5927\u4E8E 500 MB' ? 0.5 : st.fsMinSize === '\u5927\u4E8E 2 GB' ? 2 : 8;
      rows = rows.filter((f) => {
        if (f.dir) return true;
        const n = parseFloat(f.size);
        const gb = f.size.includes('TB') ? n * 1024 : f.size.includes('MB') ? n / 1024 : f.size.includes('KB') ? 0 : n;
        return gb >= min;
      });
    }
    const files = rows.filter((f) => !f.dir);
    const onStorage = st.route === 'storage';
    return {
      sources: SRC.map((s) => ({
        ...s, op: (s.key === '115' && !this.allConnected()) ? '.6' : '1', cursor: 'pointer',
        needsCfg: s.key !== 'local',
        config: () => this.setState({ route: 'settings', seTab: s.key === '115' ? '115 \u7F51\u76D8' : 'WebDAV' }),
        bg: st.fsSrc === s.key ? 'rgba(145,132,217,.08)' : 'transparent',
        ring: st.fsSrc === s.key ? 'rgba(145,132,217,.4)' : 'var(--t09)',
        pick: () => this.setState({ fsSrc: s.key, fsSel: [], fsPath: s.key === 'webdav' ? ['WebDAV', 'downloads', '2026-07'] : s.key === 'local' ? ['\u670D\u52A1\u7AEF', 'downloads'] : ['115 \u7F51\u76D8'] }),
      })),
      subtitle: (st.fsSrc === '115' && !this.allConnected()) ? '115 \u7F51\u76D8\u672A\u914D\u7F6E' : st.fsSrc === '115' ? '115 \u7F51\u76D8 \xB7 \u79BB\u7EBF\u76EE\u5F55 /JavJaeger' : st.fsSrc === 'webdav' ? 'WebDAV \xB7 dav.example.net \xB7 \u53EA\u8BFB\uFF0C\u53EF\u53D1\u9001\u5230 Aria2 \u4E0B\u8F7D\u5230\u672C\u5730' : '\u670D\u52A1\u7AEF\u672C\u5730\u76EE\u5F55 \xB7 \u53EF\u76F4\u63A5\u53D1\u9001\u5230 Aria2 \u505A\u6821\u9A8C\u4E0B\u8F7D',
      offline: st.fsSrc === '115' && !this.allConnected(),
      showFiles: !(st.fsSrc === '115' && !this.allConnected()),
      goSettings: this.go('settings'),
      q: st.fsQ, setQ: (e) => this.setState({ fsQ: e.target.value }),
      videoOnly: st.fsVideoOnly, toggleVideo: () => this.setState({ fsVideoOnly: !st.fsVideoOnly }),
      minSize: st.fsMinSize, setMinSize: (e) => this.setState({ fsMinSize: e.target.value }),
      crumbs: st.fsPath.map((p, i) => ({
        name: i === st.fsPath.length - 1 ? p : p + ' /',
        fg: i === st.fsPath.length - 1 ? 'var(--fg)' : ACC,
        go: () => this.setState({ fsPath: st.fsPath.slice(0, i + 1), fsSel: [] }),
      })),
      dirMeta: \`\${rows.filter((f) => f.dir && f.name !== '..').length} \u4E2A\u6587\u4EF6\u5939 \xB7 \${files.length} \u4E2A\u6587\u4EF6\`,
      allSel: files.length > 0 && st.fsSel.length === files.length,
      toggleAll: () => this.setState({ fsSel: st.fsSel.length === files.length ? [] : files.map((f) => f.name) }),
      rows: rows.map((f) => ({
        name: f.name, type: f.type, size: f.size || '\u2014', date: f.date || '\u2014',
        isDir: !!f.dir, icon: f.dir ? 'ph-folder' : f.video ? 'ph-film-slate' : 'ph-file',
        iconFg: f.dir ? ACC : f.video ? DIM : DIM2,
        fg: f.dir ? ACC : f.small ? DIM2 : 'var(--fg)',
        cursor: f.dir ? 'pointer' : 'default',
        sel: st.fsSel.includes(f.name),
        toggle: () => this.setState({ fsSel: st.fsSel.includes(f.name) ? st.fsSel.filter((n) => n !== f.name) : st.fsSel.concat(f.name) }),
        open: f.dir ? () => this.setState({ fsPath: f.name === '..' ? st.fsPath.slice(0, -1) : st.fsPath.concat(f.name.replace('/', '')), fsSel: [] }) : () => {},
        send: () => this.toast(st.fsSrc === '115' ? \`\${f.name} \u5DF2\u6309 pick_code \u53D6\u76F4\u94FE\u5E76\u53D1\u9001\u5230 Aria2\uFF08GID 8f2a41c9\uFF09\` : \`\${f.name} \u5DF2\u53D1\u9001\u5230 Aria2\uFF08GID 8f2a41c9\uFF09\`, ACC),
      })),
      selCount: onStorage ? st.fsSel.length : 0,
      selSize: \`\${(st.fsSel.length * 8.6).toFixed(1)} GB\`,
      clearSel: () => this.setState({ fsSel: [] }),
      sendSel: () => this.ask({
        title: \`\u53D1\u9001 \${st.fsSel.length} \u4E2A\u6587\u4EF6\u5230 Aria2\uFF1F\`, color: ACC, okText: '\u53D1\u9001',
        body: \`\u5C06\u6309 Aria2 \u5168\u5C40\u5E76\u53D1 5 \u6392\u961F\u4E0B\u8F7D\u5230 /downloads/aria2\u3002WebDAV \u6E90\u7B7E\u53D1\u5E26\u9274\u6743\u7684\u4E34\u65F6\u76F4\u94FE\uFF082 \u5C0F\u65F6\uFF09\uFF1B115 \u6E90\u6309 pick_code \u6362\u53D6\u4E0B\u8F7D\u5730\u5740\u3002\`,
        list: st.fsSel.slice(0, 6),
        run: () => this.toast(\`\u5DF2\u521B\u5EFA \${st.fsSel.length} \u4E2A Aria2 \u4EFB\u52A1\`, OK),
      }),
      refreshAria: () => this.toast('Aria2 \u4EFB\u52A1\u5217\u8868\u5DF2\u5237\u65B0', ACC),
      ariaConnected: st.fsAria === 'up', ariaDown: st.fsAria !== 'up',
      ariaStatus: st.fsAria === 'up' ? '\u5DF2\u8FDE\u63A5 v1.37.0' : '\u672A\u8FDE\u63A5 \xB7 JSON-RPC \u65E0\u54CD\u5E94',
      ariaDot: st.fsAria === 'up' ? OK : BAD, ariaFg: st.fsAria === 'up' ? DIM : BAD,
      ariaMeta: st.fsAria === 'up' ? '\u6D3B\u52A8 2 \xB7 \u7B49\u5F85 1 \xB7 \u5DF2\u5B8C\u6210 34\\n\u4E0B\u884C 18.4 MB/s' : '127.0.0.1:6800 \xB7 \u68C0\u67E5 aria2c \u662F\u5426\u5728\u8FD0\u884C',
      connectAria: () => { this.setState({ fsAria: 'up' }); this.toast('Aria2 \u8FDE\u63A5\u6210\u529F \xB7 v1.37.0', OK); },
      refreshJobs: () => this.toast('115 \u79BB\u7EBF\u4EFB\u52A1\u5217\u8868\u5DF2\u5237\u65B0', ACC),
      jobs115: this.allConnected() ? [
        { code: 'SKR-928', name: 'SKR-928-C-1080p.mp4', status: '\u79BB\u7EBF\u4E2D', pct: 74, size: '7.4 GB', st: 'run' },
        { code: 'KND-351', name: 'KND-351-C.mp4', status: '\u5DF2\u5B8C\u6210', pct: 100, size: '6.1 GB', st: 'ok' },
        { code: 'MIZ-790', name: 'MIZ-790-VR.mkv', status: '\u5931\u8D25 \xB7 \u8D44\u6E90\u5DF2\u5931\u6548', pct: 12, size: '18.3 GB', st: 'bad' },
      ].map((j) => ({
        code: j.code, name: j.name, status: j.status, pct: j.pct, pctText: \`\${j.pct}%\`, size: j.size,
        stFg: j.st === 'ok' ? OK : j.st === 'bad' ? BAD : ACC,
        fg: j.st === 'bad' ? DIM2 : 'var(--fg)',
        del: () => this.ask({ title: \`\u5220\u9664 115 \u79BB\u7EBF\u4EFB\u52A1\uFF1F\`, color: BAD, okText: '\u5220\u9664\u4EFB\u52A1',
          body: \`\u5C06\u4ECE 115 \u79BB\u7EBF\u5217\u8868\u79FB\u9664 \${j.name}\u3002\u5DF2\u4E0B\u8F7D\u5230\u7F51\u76D8\u7684\u6587\u4EF6\u4E0D\u4F1A\u88AB\u5220\u9664\u3002\`,
          run: () => this.toast(\`\${j.code} \u79BB\u7EBF\u4EFB\u52A1\u5DF2\u5220\u9664\`, WARN) }),
      })) : null,
      browsePath: () => this.setState({ fsAdd: 'browse' }),
      closeAdd: () => this.setState({ fsAdd: null }),
      addForm: st.fsAdd === 'browse' ? {
        title: '\u6D4F\u89C8\u670D\u52A1\u7AEF\u76EE\u5F55', desc: '\u5217\u51FA\u670D\u52A1\u7AEF\u53EF\u8BFB\u7684\u76EE\u5F55\uFF0C\u9009\u4E2D\u540E\u4F5C\u4E3A\u672C\u5730\u5B58\u50A8\u6E90\u7684\u6D4F\u89C8\u8D77\u70B9\u3002',
        path: '/media', crumbs: ['/', 'media'],
        entries: [
          { name: 'JAV', meta: '1,182 \u90E8 \xB7 \u5DF2\u7D22\u5F15', dir: true },
          { name: 'JAV-2', meta: '\u626B\u63CF\u4E2D 1,204 / 1,366', dir: true },
          { name: 'inbox', meta: '238 \u4E2A\u5F85\u6574\u7406\u6587\u4EF6 \xB7 1.42 TB', dir: true },
          { name: 'downloads', meta: 'Aria2 \u4E0B\u8F7D\u76EE\u5F55', dir: true },
          { name: '_manual', meta: '\u5F85\u4EBA\u5DE5\u5904\u7406', dir: true },
        ],
      } : null,
      pickPath: () => { this.setState({ fsAdd: null, fsSrc: 'local' }); this.toast('\u5DF2\u5207\u6362\u5230\u670D\u52A1\u7AEF\u672C\u5730\u76EE\u5F55 /media', ACC); },
      pauseAll: () => this.toast('\u5DF2\u9010\u6761\u6682\u505C 2 \u4E2A\u6D3B\u52A8\u4EFB\u52A1\uFF08pause/{gid}\uFF09', WARN),
      tasks: TASKS.map((t) => ({
        name: t.name, dir: t.dir, pct: t.pct, speed: t.speed, eta: t.eta,
        sizeText: t.status === 'error' ? \`\${t.done} \xB7 \u5206\u7247\u6821\u9A8C\u5931\u8D25\` : t.done,
        status: STXT[t.status], stFg: SFG[t.status], fg: t.status === 'error' ? DIM2 : 'var(--fg)',
        canPause: t.status === 'active', canResume: t.status === 'paused' || t.status === 'error',
        pause: () => this.toast(\`\${t.name} \u5DF2\u6682\u505C\`, WARN),
        resume: () => this.toast(\`\${t.name} \u5DF2\u7EE7\u7EED\u4E0B\u8F7D\`, OK),
        del: () => this.ask({
          title: \`\u5220\u9664 Aria2 \u4EFB\u52A1\uFF1F\`, color: BAD, okText: '\u5220\u9664\u4EFB\u52A1\u4E0E\u6587\u4EF6',
          body: \`\u5C06\u4ECE Aria2 \u79FB\u9664 \${t.name} \u5E76\u5220\u9664\u5DF2\u4E0B\u8F7D\u7684\u5206\u7247\uFF08\${t.done.split(' / ')[0]}\uFF09\u3002\u6B64\u64CD\u4F5C\u4E0D\u53EF\u64A4\u9500\u3002\`,
          run: () => this.toast(\`\${t.name} \u4EFB\u52A1\u4E0E\u5206\u7247\u5DF2\u5220\u9664\`, BAD),
        }),
      })),
    };
  }

  vSettings() {
    const st = this.state;
    const TABS = [
      { name: '\u914D\u7F6E\u6982\u89C8', status: '', dot: DIM2 },
      { name: '\u5916\u89C2', status: st.theme === 'light' ? '\u6D45\u8272' : '\u6DF1\u8272', dot: ACC },
      { name: 'JavBus API', status: '\u5DF2\u914D\u7F6E', dot: OK },
      { name: '\u522E\u524A\u6E90', status: '11/14 \u53EF\u7528', dot: WARN },
      { name: 'WebDAV', status: '\u5DF2\u8FDE\u63A5', dot: OK },
      { name: 'Aria2', status: '\u5DF2\u8FDE\u63A5', dot: OK },
      { name: 'PikPak', status: '\u5DF2\u767B\u5F55', dot: OK },
      { name: '115 \u7F51\u76D8', status: '\u672A\u914D\u7F6E', dot: DIM2 },
      { name: '\u78C1\u529B\u7B5B\u9009', status: '\u5DF2\u914D\u7F6E', dot: OK },
      { name: '\u8FD0\u884C\u5B89\u5168', status: '', dot: OK },
    ];
    const reveal = (k) => st.seReveal.includes(k);
    const secret = (k, masked, real) => reveal(k) ? real : masked;
    const F = {
      'JavBus API': {
        title: 'JavBus API', desc: '\u5F71\u7247\u68C0\u7D22\u4E0E\u5143\u6570\u636E\u7684\u4E3B\u6570\u636E\u6E90',
        canTest: true, banner: '\u6700\u8FD1\u4E00\u6B21\u6D4B\u8BD5\u6210\u529F \xB7 \u8FD4\u56DE 200\uFF0C\u6837\u672C 24 \u6761', bannerKind: 'ok', bannerMeta: '07-23 16:01 \xB7 \u5EF6\u8FDF 412ms',
        fields: [
          { label: 'API \u57FA\u5730\u5740', kind: 'text', value: 'https://api.javbus.internal', mono: true, req: true, hint: '\u79C1\u6709\u90E8\u7F72\u7684 JavBus API \u670D\u52A1\u5730\u5740' },
          { label: 'API Key', kind: 'secret', k: 'javbus', masked: '\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u20223f9a', real: 'sk_jb_7d21c4e8a09b3f9a', hint: '\u5DF2\u914D\u7F6E\u3002\u4FDD\u5B58\u540E\u4EC5\u663E\u793A\u540E 4 \u4F4D\u3002' },
          { label: '\u8BF7\u6C42\u95F4\u9694', kind: 'text', value: '0.5', mono: true, hint: '\u79D2\u3002\u8FC7\u4F4E\u4F1A\u89E6\u53D1\u4E0A\u6E38\u9650\u6D41' },
          { label: '\u7F13\u5B58 TTL', kind: 'text', value: '3600', mono: true, hint: '\u79D2\u3002\u68C0\u7D22\u7ED3\u679C\u4E0E\u5143\u6570\u636E\u7F13\u5B58\u65F6\u95F4' },
          { label: '\u4EE3\u7406', kind: 'text', value: 'socks5://127.0.0.1:1080', mono: true, hint: '\u7559\u7A7A\u8868\u793A\u76F4\u8FDE' },
          { label: '\u8D85\u65F6', kind: 'text', value: '8', mono: true, hint: '\u79D2' },
        ],
      },
      WebDAV: {
        title: 'WebDAV', desc: '\u8FDC\u7AEF\u5A92\u4F53\u76EE\u5F55\u6D4F\u89C8\u4E0E\u76F4\u94FE\u4E0B\u8F7D',
        canTest: true, banner: '\u8FDE\u63A5\u6210\u529F \xB7 PROPFIND \u8FD4\u56DE 207', bannerKind: 'ok', bannerMeta: '07-23 15:44 \xB7 \u5EF6\u8FDF 168ms',
        fields: [
          { label: '\u670D\u52A1\u5730\u5740', kind: 'text', value: 'https://dav.example.net/media', mono: true, req: true, hint: '' },
          { label: '\u7528\u6237\u540D', kind: 'text', value: 'jaeger', hint: '' },
          { label: '\u5BC6\u7801', kind: 'secret', k: 'dav', masked: '\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022', real: 'Dav#2026_media', hint: '\u5DF2\u914D\u7F6E' },
          { label: '\u6302\u8F7D\u6A21\u5F0F', kind: 'select', value: '\u53EA\u8BFB', options: ['\u53EA\u8BFB', '\u8BFB\u5199'], hint: '\u53EA\u8BFB\u6A21\u5F0F\u4E0B\u4E0D\u4F1A\u5728\u8FDC\u7AEF\u521B\u5EFA\u6216\u5220\u9664\u6587\u4EF6' },
          { label: '\u76F4\u94FE\u6709\u6548\u671F', kind: 'text', value: '7200', mono: true, hint: '\u79D2\u3002\u53D1\u9001\u5230 Aria2 \u65F6\u7B7E\u53D1\u7684\u4E34\u65F6\u76F4\u94FE' },
        ],
      },
      Aria2: {
        title: 'Aria2', desc: 'JSON-RPC \u4E0B\u8F7D\u5668\uFF0C\u7528\u4E8E\u7F51\u76D8\u76F4\u94FE\u4E0E\u78C1\u529B\u4E0B\u8F7D',
        canTest: true, banner: '\u8FDE\u63A5\u6210\u529F \xB7 aria2 1.37.0', bannerKind: 'ok', bannerMeta: '07-23 16:03 \xB7 \u5EF6\u8FDF 12ms',
        fields: [
          { label: 'RPC \u5730\u5740', kind: 'text', value: 'http://127.0.0.1:6800/jsonrpc', mono: true, req: true, hint: '' },
          { label: 'RPC Secret', kind: 'secret', k: 'aria2', masked: '\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022c41d', real: 'aria2_secret_9b0c41d', hint: '\u5DF2\u914D\u7F6E' },
          { label: '\u4E0B\u8F7D\u76EE\u5F55', kind: 'text', value: '/downloads/aria2', mono: true, req: true, hint: '\u9700\u4E0E\u522E\u524A\u626B\u63CF\u76EE\u5F55\u53EF\u4E92\u901A' },
          { label: '\u5168\u5C40\u5E76\u53D1', kind: 'text', value: '5', mono: true, hint: '\u540C\u65F6\u4E0B\u8F7D\u7684\u4EFB\u52A1\u6570' },
          { label: '\u5355\u4EFB\u52A1\u8FDE\u63A5\u6570', kind: 'text', value: '16', mono: true, hint: '' },
          { label: '\u5B8C\u6210\u540E\u52A8\u4F5C', kind: 'check', on: true, checkLabel: '\u4E0B\u8F7D\u5B8C\u6210\u540E\u5199\u5165\u4E0B\u8F7D\u5386\u53F2\u5E76\u6838\u5BF9\u672C\u5730\u5E93', hint: '' },
        ],
      },
      PikPak: {
        title: 'PikPak', desc: '\u78C1\u529B\u79BB\u7EBF\u4E0B\u8F7D\u7684\u9ED8\u8BA4\u5DE5\u5177',
        canTest: true, banner: '\u5DF2\u767B\u5F55 \xB7 \u914D\u989D 1.78 TB / 2 TB', bannerKind: 'ok', bannerMeta: '07-23 16:00 \xB7 \u79BB\u7EBF\u4EFB\u52A1 4/5',
        fields: [
          { label: '\u8D26\u53F7', kind: 'text', value: 'user@example.com', req: true, hint: '' },
          { label: '\u5BC6\u7801', kind: 'secret', k: 'pikpak', masked: '\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022', real: 'Pik#Pak_2026!x', hint: '\u5DF2\u914D\u7F6E' },
          { label: '\u79BB\u7EBF\u76EE\u5F55', kind: 'text', value: '/JavJaeger', mono: true, hint: '\u79BB\u7EBF\u4EFB\u52A1\u7684\u4FDD\u5B58\u8DEF\u5F84' },
          { label: '\u5355\u6B21\u6D3E\u53D1\u4E0A\u9650', kind: 'text', value: '10', mono: true, hint: '\u907F\u514D\u89E6\u53D1\u98CE\u63A7' },
          { label: '\u91CD\u590D\u4EFB\u52A1\u5904\u7406', kind: 'select', value: '\u8DF3\u8FC7', options: ['\u8DF3\u8FC7', '\u8986\u76D6', '\u65B0\u5EFA\u526F\u672C'], hint: '' },
        ],
      },
      '115 \u7F51\u76D8': {
        title: '115 \u7F51\u76D8', desc: '\u5907\u7528\u79BB\u7EBF\u4E0B\u8F7D\u5DE5\u5177',
        canTest: true, banner: '\u672A\u914D\u7F6E \xB7 Cookie \u4E3A\u7A7A\uFF0C\u6D3E\u53D1\u4E0E\u76EE\u5F55\u6D4F\u89C8\u5DF2\u7981\u7528', bannerKind: 'bad', bannerMeta: '\u4ECE\u672A\u6210\u529F\u8FDE\u63A5',
        fields: [
          { label: 'Cookie', kind: 'secret', k: '115', masked: '', real: '', req: true, placeholder: 'UID=\u2026; CID=\u2026; SEID=\u2026', hint: '\u5FC5\u586B\u3002\u53EF\u7C98\u8D34\u6D4F\u89C8\u5668 Cookie\uFF0C\u6216\u7528\u4E0B\u65B9\u626B\u7801\u767B\u5F55\u81EA\u52A8\u5199\u5165', hintBad: true },
          { label: '\u626B\u7801\u767B\u5F55', kind: 'check', on: false, checkLabel: '\u751F\u6210\u4E8C\u7EF4\u7801\uFF0C\u7528 115 App \u626B\u7801\u540E\u81EA\u52A8\u586B\u5165 Cookie', hint: '' },
          { label: '\u79BB\u7EBF\u76EE\u5F55 CID', kind: 'text', value: '', mono: true, placeholder: '2634891037465', hint: '\u7559\u7A7A\u5219\u4F7F\u7528\u7F51\u76D8\u6839\u76EE\u5F55' },
          { label: '\u6279\u91CF\u5927\u5C0F', kind: 'text', value: '20', mono: true, hint: '\u5355\u6B21\u8BF7\u6C42\u5408\u5E76\u7684\u78C1\u529B\u6761\u6570' },
        ],
      },
      \u78C1\u529B\u7B5B\u9009: {
        title: '\u78C1\u529B\u7B5B\u9009', desc: '\u51B3\u5B9A\u68C0\u7D22\u7ED3\u679C\u91CC\u300C\u6700\u4F73\u78C1\u529B\u300D\u5982\u4F55\u6311\u9009',
        canTest: false, banner: '\u5F53\u524D\u89C4\u5219\uFF1A\u4E2D\u5B57\u4F18\u5148 \xB7 \u6392\u9664 4K \u5173\u95ED \xB7 \u6309\u4F53\u79EF\u964D\u5E8F\u53D6\u7B2C\u4E00\u6761', bannerKind: 'ok', bannerMeta: '\u5F71\u54CD\u68C0\u7D22\u3001\u4E0B\u8F7D\u6D3E\u53D1\u4E0E\u81EA\u52A8\u6A21\u5F0F',
        fields: [
          { label: '\u9ED8\u8BA4\u78C1\u529B\u6765\u6E90', kind: 'select', value: 'javbus', options: ['javbus', 'cilisousuo', 'yhg007'], hint: '\u68C0\u7D22\u9875\u53EF\u4E34\u65F6\u5207\u6362' },
          { label: '\u6392\u5E8F\u5B57\u6BB5', kind: 'select', value: '\u4F53\u79EF', options: ['\u4F53\u79EF', '\u65E5\u671F'], hint: 'sortBy' },
          { label: '\u6392\u5E8F\u65B9\u5411', kind: 'select', value: '\u964D\u5E8F', options: ['\u964D\u5E8F', '\u5347\u5E8F'], hint: 'sortOrder' },
          { label: '\u4E2D\u6587\u5B57\u5E55', kind: 'select', value: '\u4F18\u5148', options: ['\u4E0D\u9650', '\u4F18\u5148', '\u5FC5\u9700'], hint: '\u5FC5\u9700\u65F6\u65E0\u4E2D\u5B57\u7684\u756A\u53F7\u4F1A\u88AB\u8DF3\u8FC7' },
          { label: '\u6392\u9664 4K', kind: 'check', on: false, checkLabel: '\u5168\u5C40\u6392\u9664\u6587\u4EF6\u540D\u542B 4K \u7684\u8D44\u6E90', hint: '\u68C0\u7D22\u9875\u9876\u90E8\u53EF\u4E34\u65F6\u5F00\u5173' },
          { label: '\u5355\u6587\u4EF6\u4F53\u79EF\u4E0A\u9650', kind: 'text', value: '30 GB', mono: true, hint: '\u8D85\u8FC7\u5219\u4E0D\u9009\u4E3A\u6700\u4F73\u78C1\u529B' },
        ],
      },
      \u8FD0\u884C\u5B89\u5168: {
        title: '\u8FD0\u884C\u5B89\u5168', desc: '\u5371\u9669\u64CD\u4F5C\u4E0E\u540E\u53F0\u4EFB\u52A1\u7684\u7EA6\u675F',
        canTest: false, banner: '', bannerKind: 'ok', bannerMeta: '',
        fields: [
          { label: '\u5220\u9664\u786E\u8BA4', kind: 'check', on: true, checkLabel: '\u5F7B\u5E95\u5220\u9664\u6587\u4EF6\u9700\u8981\u52FE\u9009\u786E\u8BA4', hint: '\u5173\u95ED\u540E\u4EC5\u9700\u5355\u6B21\u70B9\u51FB\uFF0C\u4E0D\u5EFA\u8BAE' },
          { label: '\u522E\u524A\u6267\u884C', kind: 'check', on: true, checkLabel: '\u522E\u524A\u6574\u7406\u5FC5\u987B\u5148\u751F\u6210\u9884\u89C8\u624D\u80FD\u6267\u884C', hint: '' },
          { label: '\u8F6C\u7801\u66FF\u6362', kind: 'check', on: true, checkLabel: '\u4EC5\u5F53\u8F93\u51FA\u4F53\u79EF\u5C0F\u4E8E\u539F\u6587\u4EF6\u65F6\u624D\u66FF\u6362\u6E90\u6587\u4EF6', hint: '\u5426\u5219\u4FDD\u7559\u539F\u6587\u4EF6\u5E76\u6807\u8BB0\u4EFB\u52A1\u5F02\u5E38' },
          { label: '\u8F6C\u7801\u5E76\u53D1', kind: 'text', value: '2', mono: true, hint: '\u540C\u65F6\u8FD0\u884C\u7684\u8F6C\u7801\u4EFB\u52A1\u6570' },
          { label: '\u522E\u524A\u5E76\u53D1', kind: 'text', value: '3', mono: true, hint: '\u522E\u524A\u4E0E\u626B\u63CF\u7684\u8BF7\u6C42\u5E76\u53D1' },
          { label: '\u65E5\u5FD7\u4FDD\u7559', kind: 'select', value: '30 \u5929', options: ['7 \u5929', '30 \u5929', '90 \u5929'], hint: '' },
          { label: '\u4F1A\u8BDD\u5BC6\u94A5', kind: 'status', value: '\u5DF2\u914D\u7F6E\uFF08\u6765\u81EA APP_SESSION_SECRET\uFF09', statusFg: OK, hint: '\u5BC6\u94A5\u503C\u4E0D\u4F1A\u56DE\u4F20\u5230\u754C\u9762\uFF0C\u53EA\u663E\u793A\u914D\u7F6E\u72B6\u6001' },
          { label: '\u654F\u611F\u5B57\u6BB5\u89C4\u5219', kind: 'check', on: true, checkLabel: '\u4FDD\u5B58\u65F6\u7559\u7A7A\u5219\u6CBF\u7528\u5DF2\u5B58\u503C\uFF0C\u4E0D\u4F1A\u88AB\u6E05\u7A7A', hint: '' },
          { label: '\u73AF\u5883\u53D8\u91CF\u8986\u76D6', kind: 'status', value: 'JAVBUS_BASE_URL \xB7 JAVBUS_PROXY', statusFg: WARN, hint: '\u8FD9\u4E9B\u5B57\u6BB5\u7531\u73AF\u5883\u53D8\u91CF\u63A5\u7BA1\uFF0C\u754C\u9762\u4FEE\u6539\u4E0D\u751F\u6548' },
        ],
      },
    };
    const cfg = F[st.seTab];
    const bannerColors = { ok: [OK, 'rgba(99,179,148,.06)', 'rgba(99,179,148,.28)'], bad: [BAD, 'rgba(224,129,136,.07)', 'rgba(224,129,136,.3)'] };
    const bc = cfg ? bannerColors[cfg.bannerKind] : bannerColors.ok;
    return {
      tabs: TABS.map((t) => ({
        name: t.name, status: t.status, dot: t.dot,
        bg: st.seTab === t.name ? 'rgba(145,132,217,.12)' : 'transparent',
        fg: st.seTab === t.name ? 'var(--fg)' : DIM, fw: st.seTab === t.name ? 500 : 400,
        stFg: t.dot === OK ? OK : t.dot === WARN ? WARN : DIM2,
        pick: () => this.setState({ seTab: t.name }),
      })),
      isOverview: st.seTab === '\u914D\u7F6E\u6982\u89C8', isSources: st.seTab === '\u522E\u524A\u6E90',
      isAppearance: st.seTab === '\u5916\u89C2', isForm: !!cfg,
      themes: [
        { key: 'dark', name: '\u6DF1\u8272', desc: '\u9ED8\u8BA4\u4E3B\u9898\uFF0C\u9002\u5408\u957F\u65F6\u95F4\u5728\u6697\u73AF\u5883\u4E2D\u503C\u5B88\u4E0E\u5DE1\u68C0\u3002', bg: '#161826', surf: '#232532', ring: '#3f424d', fg: '#e9e9ed', dim: 'rgba(233,233,237,.55)', acc: '#9184d9' },
        { key: 'light', name: '\u6D45\u8272', desc: '\u9002\u5408\u660E\u4EAE\u73AF\u5883\u4E0E\u6295\u5C4F\u6F14\u793A\uFF0C\u6B63\u6587\u5BF9\u6BD4\u5EA6\u66F4\u9AD8\u3002', bg: '#f1f2f7', surf: '#ffffff', ring: '#d7dae4', fg: '#1a1c28', dim: 'rgba(26,28,40,.58)', acc: '#5b4fa8' },
      ].map((t) => ({
        ...t, active: st.theme === t.key,
        ringOuter: st.theme === t.key ? 'var(--acc)' : 'var(--ring)',
        badge: st.theme === t.key ? '\u5F53\u524D\u4F7F\u7528' : '\u70B9\u51FB\u5207\u6362',
        badgeFg: st.theme === t.key ? 'var(--accs)' : 'var(--dim2)',
        badgeBg: st.theme === t.key ? 'rgba(145,132,217,.16)' : 'transparent',
        pick: () => { if (st.theme === t.key) return; this.setState({ theme: t.key }); this.toast(\`\u5DF2\u5207\u6362\u5230\${t.name}\u4E3B\u9898 \xB7 \u504F\u597D\u5DF2\u968F\u8BBE\u7F6E\u4FDD\u5B58\`, OK); },
      })),
      cur: cfg ? {
        title: cfg.title, desc: cfg.desc, canTest: cfg.canTest,
        banner: cfg.banner, bannerMeta: cfg.bannerMeta,
        bannerFg: bc[0], bannerBg: bc[1], bannerRing: bc[2],
      } : st.seTab === '\u522E\u524A\u6E90'
        ? { title: '\u522E\u524A\u6E90', desc: '\u5143\u6570\u636E\u4E0E\u78C1\u529B\u7684\u591A\u6E90\u56DE\u843D\u7B56\u7565', canTest: true }
        : st.seTab === '\u5916\u89C2'
        ? { title: '\u5916\u89C2', desc: '\u7BA1\u7406\u754C\u9762\u7684\u914D\u8272\u4E3B\u9898 \xB7 \u5F71\u9662\u6A21\u5F0F\u6052\u4E3A\u6697\u8272\u5F71\u5385', canTest: false }
        : { title: '\u914D\u7F6E\u6982\u89C8', desc: '\u6240\u6709\u5916\u90E8\u4F9D\u8D56\u7684\u914D\u7F6E\u4E0E\u8FDE\u63A5\u72B6\u6001', canTest: false },
      overview: [
        { name: '\u5916\u89C2', status: st.theme === 'light' ? '\u6D45\u8272' : '\u6DF1\u8272', dot: OK, meta: st.theme === 'light' ? '\u7BA1\u7406\u754C\u9762\u6D45\u8272 \xB7 \u5F71\u9662\u6A21\u5F0F\u4ECD\u4E3A\u6697\u8272\u5F71\u5385' : '\u7BA1\u7406\u754C\u9762\u6DF1\u8272 \xB7 \u4E0E\u5F71\u9662\u6A21\u5F0F\u4E00\u81F4', tab: '\u5916\u89C2' },
        { name: 'JavBus API', status: '\u5DF2\u914D\u7F6E', dot: OK, meta: 'https://api.javbus.internal \xB7 Key \u2022\u2022\u2022\u20223f9a \xB7 \u5EF6\u8FDF 412ms', tab: 'JavBus API' },
        { name: '\u522E\u524A\u6E90', status: '11/14 \u53EF\u7528', dot: WARN, meta: 'javbus / javdb / dmm \u7B49 11 \u4E2A\u53EF\u7528 \xB7 yhg007 \u8D85\u65F6 \xB7 2 \u4E2A\u5DF2\u7981\u7528', tab: '\u522E\u524A\u6E90' },
        { name: 'WebDAV', status: '\u5DF2\u8FDE\u63A5', dot: OK, meta: 'dav.example.net/media \xB7 \u53EA\u8BFB \xB7 \u5EF6\u8FDF 168ms', tab: 'WebDAV' },
        { name: 'Aria2', status: '\u5DF2\u8FDE\u63A5', dot: OK, meta: '127.0.0.1:6800 \xB7 v1.37.0 \xB7 \u5E76\u53D1 5', tab: 'Aria2' },
        { name: 'PikPak', status: '\u5DF2\u767B\u5F55', dot: OK, meta: 'user@example.com \xB7 1.78 TB / 2 TB', tab: 'PikPak' },
        { name: '115 \u7F51\u76D8', status: '\u672A\u914D\u7F6E', dot: DIM2, meta: 'Cookie \u4E3A\u7A7A \xB7 \u6D3E\u53D1\u4E0E\u76EE\u5F55\u6D4F\u89C8\u5DF2\u7981\u7528', tab: '115 \u7F51\u76D8' },
        { name: '\u78C1\u529B\u7B5B\u9009', status: '\u5DF2\u914D\u7F6E', dot: OK, meta: '\u4E2D\u5B57\u4F18\u5148 \xB7 \u6309\u4F53\u79EF\u964D\u5E8F \xB7 \u672A\u6392\u9664 4K', tab: '\u78C1\u529B\u7B5B\u9009' },
        { name: 'FFmpeg', status: '\u90E8\u5206\u53EF\u7528', dot: WARN, meta: '7.0.2 \xB7 hevc_nvenc \u53EF\u7528 \xB7 av1_nvenc \u4E0D\u53EF\u7528', tab: '\u8FD0\u884C\u5B89\u5168' },
        { name: '\u8FD0\u884C\u5B89\u5168', status: '\u5DF2\u542F\u7528', dot: OK, meta: '\u5220\u9664\u9700\u786E\u8BA4 \xB7 \u540E\u53F0\u5E76\u53D1 3 \xB7 \u4F59\u91CF\u9608\u503C 200 GB', tab: '\u8FD0\u884C\u5B89\u5168' },
      ].map((o) => ({
        ...o, stFg: o.dot === OK ? OK : o.dot === WARN ? WARN : DIM2,
        ring: o.dot === DIM2 ? 'rgba(224,129,136,.25)' : 'var(--ring)',
        action: o.dot === DIM2 ? '\u524D\u5F80\u914D\u7F6E' : '\u67E5\u770B',
        go: () => this.setState({ seTab: o.tab }),
      })),
      sources: [
        { name: 'javbus', host: 'api.javbus.internal', status: '\u53EF\u7528', dot: OK, latency: '412 ms', note: '\u5143\u6570\u636E + \u78C1\u529B\uFF0C\u8986\u76D6\u6700\u5168', on: true },
        { name: 'javdb', host: 'javdb.example', status: '\u53EF\u7528', dot: OK, latency: '682 ms', note: '\u5143\u6570\u636E\u56DE\u843D\uFF0C\u6807\u7B7E\u66F4\u7EC6', on: true },
        { name: 'dmm', host: 'dmm.example', status: '\u53EF\u7528', dot: OK, latency: '1.02 s', note: '\u5B98\u65B9\u5C01\u9762\u4E0E\u6837\u7247\u56FE\u8D28\u91CF\u6700\u597D', on: true },
        { name: 'cilisousuo', host: 'cilisousuo.example', status: '\u53EF\u7528', dot: OK, latency: '1.24 s', note: '\u4EC5\u78C1\u529B\uFF0C\u65E0\u5143\u6570\u636E', on: true },
        { name: 'yhg007', host: 'yhg007.com', status: '\u8FDE\u63A5\u8D85\u65F6', dot: BAD, latency: '\u2014 8 s \u8D85\u65F6', note: '\u6700\u8FD1 24h \u5931\u8D25 37 \u6B21\uFF0C\u5EFA\u8BAE\u5148\u68C0\u67E5\u4EE3\u7406', on: true },
        { name: 'mgstage', host: 'mgstage.example', status: '\u672A\u5B9E\u73B0', dot: DIM2, latency: '\u2014', note: 'implemented=false \xB7 \u4E0D\u53C2\u4E0E\u56DE\u843D', on: false },
      ].map((s, i) => ({
        ...s, order: String(i + 1), op: s.on ? '1' : '.55',
        ring: s.dot === BAD ? 'rgba(224,129,136,.3)' : 'var(--t09)',
        stFg: s.dot === OK ? OK : s.dot === BAD ? BAD : DIM2,
        upDisabled: i === 0, toggleText: s.on ? '\u7981\u7528' : '\u542F\u7528',
        up: () => this.toast(\`\${s.name} \u5DF2\u4E0A\u79FB\u5230\u7B2C \${i} \u4F4D\`, ACC),
        test: () => this.toast(s.dot === BAD ? \`\${s.name} \u6D4B\u8BD5\u5931\u8D25\uFF1A\u8FDE\u63A5\u8D85\u65F6 8s\` : \`\${s.name} \u6D4B\u8BD5\u6210\u529F \xB7 \u5EF6\u8FDF \${s.latency}\`, s.dot === BAD ? BAD : OK),
        toggle: () => this.toast(\`\${s.name} \u5DF2\${s.on ? '\u7981\u7528' : '\u542F\u7528'}\`, s.on ? WARN : OK),
      })),
      fields: cfg ? cfg.fields.map((f) => ({
        label: f.label, req: f.req ? '\u5FC5\u586B' : '', reqFg: f.req ? WARN : 'transparent',
        hint: f.hint || '', hintFg: f.hintBad ? BAD : DIM2,
        span: f.kind === 'secret' && f.k === '115' ? 'span 2' : 'auto',
        isText: f.kind === 'text', isSecret: f.kind === 'secret', isSelect: f.kind === 'select', isCheck: f.kind === 'check', isStatus: f.kind === 'status',
        statusFg: f.statusFg || DIM,
        value: f.kind === 'secret' ? secret(f.k, f.masked, f.real) : (f.value || ''),
        placeholder: f.placeholder || '', on: !!f.on, checkLabel: f.checkLabel || '',
        mono: f.mono ? 'var(--mono)' : 'inherit', ls: f.mono ? '.03em' : 'normal',
        options: (f.options || []).map((t) => ({ t })),
        revealText: f.k && reveal(f.k) ? '\u9690\u85CF' : '\u663E\u793A',
        reveal: () => this.setState({ seReveal: reveal(f.k) ? st.seReveal.filter((x) => x !== f.k) : st.seReveal.concat(f.k) }),
        set: () => {},
      })) : [],
      applyTestResults: () => this.toast('\u5DF2\u6309\u6D4B\u8BD5\u7ED3\u679C\u5199\u56DE\u522E\u524A\u6E90\u4F18\u5148\u7EA7\uFF1Ajavbus \u2192 javdb \u2192 dmm', OK),
      test: () => {
        if (st.seTab === '115 \u7F51\u76D8') { this.toast('115 \u7F51\u76D8\u6D4B\u8BD5\u5931\u8D25\uFF1ACookie \u4E3A\u7A7A', BAD); return; }
        if (st.seTab === '\u522E\u524A\u6E90') { this.toast('\u522E\u524A\u6E90\u6D4B\u8BD5\u5B8C\u6210\uFF1A11 \u4E2A\u53EF\u7528 \xB7 yhg007 \u8FDE\u63A5\u8D85\u65F6 \xB7 2 \u4E2A\u5DF2\u7981\u7528\u672A\u6D4B\u8BD5', WARN); return; }
        this.toast(\`\${st.seTab} \u8FDE\u63A5\u6D4B\u8BD5\u6210\u529F\`, OK);
      },
      save: () => this.toast(\`\${st.seTab} \u914D\u7F6E\u5DF2\u4FDD\u5B58\`, OK),
      reload: () => this.toast(\`\u5DF2\u4ECE config.json \u91CD\u65B0\u8F7D\u5165 \${st.seTab} \u914D\u7F6E\`, ACC),
      reset: () => this.ask({
        title: '\u91CD\u7F6E\u672A\u4FDD\u5B58\u7684\u6539\u52A8\uFF1F', color: WARN, okText: '\u91CD\u7F6E',
        body: \`\u4E22\u5F03\u300C\${st.seTab}\u300D\u5F53\u524D\u5206\u7EC4\u7684\u672A\u4FDD\u5B58\u6539\u52A8\uFF0C\u6062\u590D\u4E3A\u5DF2\u4FDD\u5B58\u7684\u503C\u3002\`,
        run: () => this.toast(\`\${st.seTab} \u5DF2\u6062\u590D\u4E3A\u5DF2\u4FDD\u5B58\u7684\u914D\u7F6E\`, WARN),
      }),
    };
  }

  vCinema() {
    const st = this.state;
    const RESUME = CN_RESUME;
    const hero = LIB.find((m) => m.code === st.cnHero) || LIB[0];
    const playing = st.cnPlaying ? LIB.find((m) => m.code === st.cnPlaying) : null;
    const resumePct = RESUME[hero.code];
    const mins = (s) => parseInt(s, 10) || 120;
    const hhmm = (m) => \`\${String(Math.floor(m / 60)).padStart(2, '0')}:\${String(m % 60).padStart(2, '0')}:00\`;
    const needsTranscode = (m) => m.res === '2160p' || m.codec === 'hevc';

    const card = (m) => ({
      code: m.code, title: m.title, res: \`\${m.res}\`, dur: m.dur,
      sub: m.actors.join(' / '),
      gone: !!m.gone, playing: st.cnPlaying === m.code,
      hasProgress: RESUME[m.code] !== undefined, progress: RESUME[m.code] || 0,
      ring: st.cnHero === m.code ? 'rgba(181,171,252,.75)' : 'var(--t08)',
      ringW: st.cnHero === m.code ? '2px' : '1px',
      pick: () => this.setState({ cnHero: m.code }),
    });

    const shelvesByTab = {
      \u63A8\u8350: [
        { name: '\u7EE7\u7EED\u89C2\u770B', meta: '\u6309\u6700\u8FD1\u64AD\u653E\u65F6\u95F4\u6392\u5E8F', items: Object.keys(RESUME).map((c) => LIB.find((m) => m.code === c)).filter(Boolean) },
        { name: '\u6700\u8FD1\u5165\u5E93', meta: '\u6765\u81EA library.db \xB7 \u672C\u6708\u65B0\u589E 96', items: LIB.slice(0, 7) },
      ],
      \u7CFB\u5217: [
        { name: '\u591C\u884C\u5217\u8ECA', meta: '2 \u90E8 \xB7 Mizuho Pictures', items: LIB.filter((m) => m.series === '\u591C\u884C\u5217\u8ECA') },
        { name: '\u6D77\u8FBA\u306E\u8A18\u61B6', meta: '2 \u90E8 \xB7 Sakura Line', items: LIB.filter((m) => m.series === '\u6D77\u8FBA\u306E\u8A18\u61B6') },
        { name: '\u9759\u304B\u306A\u5348\u5F8C', meta: '1 \u90E8 \xB7 Kanade Works', items: LIB.filter((m) => m.series === '\u9759\u304B\u306A\u5348\u5F8C') },
      ],
      VR: [
        { name: 'VR 2160p', meta: '\u9700 VR \u64AD\u653E\u5668 \xB7 \u8F6C\u7801\u4F1A\u4E22\u5931\u6295\u5F71\u5143\u6570\u636E', items: LIB.filter((m) => m.tags.includes('VR') && m.res === '2160p') },
        { name: 'VR 1440p', meta: '\u4F53\u79EF\u66F4\u5C0F\uFF0C\u9002\u5408\u65E0\u7EBF\u4E32\u6D41', items: LIB.filter((m) => m.tags.includes('VR') && m.res === '1440p') },
      ],
    };

    const chips = [];
    chips.push({ t: hero.date.slice(0, 4), bg: 'transparent', fg: 'var(--t60)', ring: 'var(--t18)' });
    chips.push({ t: hero.dur, bg: 'transparent', fg: 'var(--t60)', ring: 'var(--t18)' });
    chips.push({ t: \`\${hero.res} \xB7 \${hero.codec}\`, bg: 'rgba(145,132,217,.14)', fg: 'var(--accs)', ring: 'rgba(145,132,217,.3)' });
    if (hero.tags.includes('\u4E2D\u6587\u5B57\u5E55')) chips.push({ t: '\u4E2D\u6587\u5B57\u5E55', bg: 'rgba(99,179,148,.14)', fg: OK, ring: 'rgba(99,179,148,.3)' });
    if (hero.tags.includes('VR')) chips.push({ t: 'VR', bg: 'rgba(145,132,217,.2)', fg: 'var(--acct)', ring: 'rgba(145,132,217,.36)' });
    chips.push({ t: hero.size, bg: 'transparent', fg: 'var(--t60)', ring: 'var(--t18)' });

    const inActorTab = st.cnTab === '\u6F14\u5458';
    const actorWall = inActorTab && !!st.cnActor;
    const isWall = st.cnTab === '\u5168\u90E8\u5F71\u7247' || actorWall;
    const showActors = inActorTab && !st.cnActor;
    const activeFilters = FILTER_DIMS.filter((d) => !(actorWall && d.key === 'actor')).flatMap((d) => st.cnF[d.key].map((v) => \`\${d.name} \${v}\`));
    const dims = actorWall ? FILTER_DIMS.filter((d) => d.key !== 'actor') : FILTER_DIMS;
    let wallRows = LIB
      .filter((m) => !actorWall || m.actors.includes(st.cnActor))
      .filter((m) => dims.every((d) => !st.cnF[d.key].length || st.cnF[d.key].some((v) => d.test(m, v))));
    const gb = (x) => parseFloat(x) || 0;
    if (st.cnSort === '\u53D1\u884C\u65E5\u671F') wallRows = wallRows.slice().sort((a, b) => b.date.localeCompare(a.date));
    else if (st.cnSort === '\u4F53\u79EF') wallRows = wallRows.slice().sort((a, b) => gb(b.size) - gb(a.size));
    else if (st.cnSort === '\u756A\u53F7') wallRows = wallRows.slice().sort((a, b) => a.code.localeCompare(b.code));
    else wallRows = wallRows.slice().sort((a, b) => b.added.localeCompare(a.added));
    const shelfCount = (shelvesByTab[st.cnTab] || []).filter((x) => x.items.length).length;
    const dense = shelfCount > 2;
    const pc = playing ? (RESUME[playing.code] || 6) : 0;

    return {
      tabs: ['\u63A8\u8350', '\u5168\u90E8\u5F71\u7247', '\u7CFB\u5217', '\u6F14\u5458', 'VR'].map((t) => ({
        name: t, pick: () => this.setState({ cnTab: t, cnActor: null }),
        bg: st.cnTab === t ? 'rgba(233,233,237,.1)' : 'transparent',
        fg: st.cnTab === t ? 'var(--fg)' : 'var(--t66)',
        fw: st.cnTab === t ? 500 : 400,
      })),
      showHero: !isWall && !showActors, showShelves: !isWall && !showActors,
      showWall: isWall, showActors,
      actorsMeta: \`\${CN_ACTORS.length} \u4F4D \xB7 \u5934\u50CF\u6765\u81EA .actors/ \u76EE\u5F55 \xB7 \u70B9\u5934\u50CF\u67E5\u770B\u8BE5\u6F14\u5458\u7684\u5F71\u7247\`,
      actors: CN_ACTORS.map((a) => {
        const films = LIB.filter((m) => m.actors.includes(a.name));
        const latest = films.slice().sort((x, y) => y.date.localeCompare(x.date))[0];
        return {
          name: a.name, initial: a.name.slice(0, 1), noAvatar: !!a.noAvatar,
          count: \`\${a.count} \u90E8\`, size: a.size,
          latest: latest ? \`\u6700\u65B0 \${latest.code} \xB7 \${latest.date}\` : '\u672C\u5730\u6682\u65E0\u5F71\u7247',
          open: () => this.setState({ cnActor: a.name, cnF: { actor: [], series: [], studio: [], res: [], flag: [] } }),
        };
      }),
      actorHeader: actorWall ? {
        name: st.cnActor, initial: st.cnActor.slice(0, 1),
        meta: \`\u672C\u5730 \${LIB.filter((m) => m.actors.includes(st.cnActor)).length} \u90E8 \xB7 \${(CN_ACTORS.find((a) => a.name === st.cnActor) || {}).size || '\u2014'}\`,
      } : null,
      backToActors: () => this.setState({ cnActor: null, cnF: { actor: [], series: [], studio: [], res: [], flag: [] } }),
      libMeta: '1,182 \u90E8 \xB7 9.4 TB \xB7 \u6700\u8FD1\u626B\u63CF 07-23 09:12',
      filterGroups: dims.map((d) => ({
        name: d.name,
        items: d.options.map((o) => {
          const on = st.cnF[d.key].includes(o);
          const count = LIB.filter((m) => (!actorWall || m.actors.includes(st.cnActor)) && d.test(m, o)).length;
          return {
            name: o, count: String(count), 
            bg: on ? 'rgba(145,132,217,.2)' : 'var(--t05)',
            ring: on ? 'rgba(145,132,217,.5)' : 'rgba(233,233,237,.12)',
            fg: on ? 'var(--acct)' : 'var(--t78)',
            toggle: () => this.setState({ cnF: { ...st.cnF, [d.key]: on ? st.cnF[d.key].filter((x) => x !== o) : st.cnF[d.key].concat(o) } }),
          };
        }),
      })),
      sorts: ['\u5165\u5E93\u65F6\u95F4', '\u53D1\u884C\u65E5\u671F', '\u4F53\u79EF', '\u756A\u53F7'].map((o) => ({
        name: o, pick: () => this.setState({ cnSort: o }),
        bg: st.cnSort === o ? 'rgba(145,132,217,.2)' : 'var(--t05)',
        ring: st.cnSort === o ? 'rgba(145,132,217,.5)' : 'rgba(233,233,237,.12)',
        fg: st.cnSort === o ? 'var(--acct)' : 'var(--t78)',
      })),
      filterCount: activeFilters.length, hasFilters: activeFilters.length > 0,
      clearFilters: () => this.setState({ cnF: { actor: [], series: [], studio: [], res: [], flag: [] } }),
      wallMeta: actorWall && !activeFilters.length
        ? \`\${st.cnActor} \u7684 \${wallRows.length} \u90E8\u672C\u5730\u5F71\u7247\`
        : activeFilters.length
        ? \`\u547D\u4E2D \${wallRows.length} \u90E8 \xB7 \${activeFilters.join(' \xB7 ')}\`
        : \`\u5168\u90E8 \${wallRows.length} \u90E8\`,
      wallEmpty: wallRows.length === 0,
      wall: wallRows.map((m) => {
        const badges = [];
        if (m.res === '2160p') badges.push({ t: '4K', bg: 'rgba(22,24,38,.72)', fg: 'var(--onmut)' });
        if (m.tags.includes('VR')) badges.push({ t: 'VR', bg: 'rgba(145,132,217,.4)', fg: 'var(--accw)' });
        if (m.tags.includes('\u4E2D\u6587\u5B57\u5E55')) badges.push({ t: '\u4E2D\u5B57', bg: 'rgba(99,179,148,.32)', fg: 'var(--onok)' });
        if (m.gone) badges.push({ t: '\u6587\u4EF6\u7F3A\u5931', bg: 'rgba(224,129,136,.4)', fg: 'var(--onbad)' });
        if (m.c < 100) badges.push({ t: '\u7F3A\u8D44\u6599', bg: 'rgba(201,160,94,.34)', fg: 'var(--onwarn)' });
        return {
          code: m.code, title: m.title, sub: m.actors.join(' / '), res: m.res, size: m.size, badges,
          hasProgress: RESUME[m.code] !== undefined, progress: RESUME[m.code] || 0,
          ring: st.cnHero === m.code ? 'rgba(181,171,252,.75)' : 'var(--t08)',
          ringW: st.cnHero === m.code ? '2px' : '1px',
          open: () => this.setState({ cnHero: m.code, cnTab: '\u63A8\u8350', cnActor: null }),
        };
      }),
      heroTitleSize: dense ? '34px' : '44px',
      shelfGap: dense ? '14px' : '18px',
      exit: () => this.setState({ route: 'search', cnPlaying: null }),
      hero: {
        code: hero.code, title: hero.title,
        kicker: \`\${hero.studio}\${hero.series !== '\u2014' ? ' \xB7 ' + hero.series : ''}\`,
        chips,
        desc: hero.gone
          ? '\u5E93\u8BB0\u5F55\u5B58\u5728\uFF0C\u4F46\u78C1\u76D8\u4E0A\u7684\u6587\u4EF6\u5DF2\u4E0D\u5728\u539F\u8DEF\u5F84\u3002\u53EF\u4EE5\u5728\u5F71\u89C6\u5E93\u4E2D\u91CD\u65B0\u626B\u63CF\u8BE5\u8DEF\u5F84\uFF0C\u6216\u79FB\u9664\u8FD9\u6761\u8BB0\u5F55\u3002'
          : \`\${hero.actors.join(' / ')} \u4E3B\u6F14\uFF0C\${hero.director} \u6267\u5BFC\u3002\${hero.files > 1 ? \`\u672C\u5730\u4E3A \${hero.files} \u4E2A\u5206\u6BB5\u6587\u4EF6\uFF0C\u64AD\u653E\u65F6\u6309 file_index \u987A\u5E8F\u8FDE\u7EED\u64AD\u653E\u3002\` : \`\u672C\u5730\u5355\u6587\u4EF6 \${hero.size}\uFF0C\${needsTranscode(hero) ? '\u5BA2\u6237\u7AEF\u4E0D\u652F\u6301 hevc \u65F6\u4F1A\u5B9E\u65F6\u8F6C\u7801\u3002' : '\u53EF\u76F4\u8FDE\u64AD\u653E\u3002'}\`}\`,
        resume: resumePct !== undefined && !hero.gone,
        resumePct, resumePctText: \`\u5DF2\u770B \${resumePct}%\`,
        resumeText: \`\u7EE7\u7EED\u89C2\u770B \xB7 \u4E0A\u6B21\u505C\u5728 \${hhmm(Math.round(mins(hero.dur) * (resumePct || 0) / 100))}\`,
        playText: hero.gone ? '\u6587\u4EF6\u7F3A\u5931' : resumePct !== undefined ? '\u7EE7\u7EED\u89C2\u770B' : '\u64AD\u653E',
        playNote: hero.gone ? '\u65E0\u6CD5\u64AD\u653E\uFF1A\u672C\u5730\u6587\u4EF6\u7F3A\u5931' : needsTranscode(hero) ? \`\${hero.codec} \${hero.res} \xB7 \u6309\u9700\u8F6C\u7801\` : \`\${hero.codec} \${hero.res} \xB7 \u76F4\u8FDE\u64AD\u653E\`,
        playFg: hero.gone ? BAD : needsTranscode(hero) ? WARN : 'var(--t62)',
      },
      play: () => {
        if (hero.gone) { this.toast(\`\${hero.code} \u672C\u5730\u6587\u4EF6\u7F3A\u5931\uFF0C\u65E0\u6CD5\u64AD\u653E\`, BAD); return; }
        this.setState({ cnPlaying: hero.code, cnPaused: false, cnBuffering: needsTranscode(hero) });
        if (this._bt) clearTimeout(this._bt);
        if (needsTranscode(hero)) this._bt = setTimeout(() => this.setState({ cnBuffering: false }), 1400);
      },
      info: () => this.setState({ route: 'library', lbDetail: hero.code }),
      transcode: () => { this.setState({ route: 'transcode' }); this.toast(\`\${hero.code} \u5DF2\u52A0\u5165\u8F6C\u7801\u961F\u5217\uFF08keep_quality\uFF09\`, ACC); },
      shelves: (shelvesByTab[st.cnTab] || []).filter((s) => s.items.length).map((s) => ({
        name: s.name, meta: s.meta, cardW: dense ? '132px' : '158px', items: s.items.map(card),
      })),
      player: playing ? {
        code: playing.code, title: playing.title,
        stream: \`\${playing.res} \xB7 \${playing.codec} \xB7 \${playing.size}\${needsTranscode(playing) ? ' \u2192 hevc_nvenc \u5B9E\u65F6\u8F6C\u7801' : ' \xB7 \u76F4\u8FDE'}\`,
        buffering: st.cnBuffering, bufferText: '\u6B63\u5728\u5EFA\u7ACB\u8F6C\u7801\u6D41 \xB7 hevc_nvenc',
        pct: pc, at: hhmm(Math.round(mins(playing.dur) * pc / 100)), total: hhmm(mins(playing.dur)),
        note: playing.files > 1 ? \`\u5206\u6BB5 CD1 / \${playing.files} \xB7 \u64AD\u5B8C\u81EA\u52A8\u7EED\u4E0B\u4E00\u6BB5\` : '\u5355\u6587\u4EF6\u64AD\u653E',
        controls: [
          { label: '\u540E\u9000 10 \u79D2', icon: 'ph-arrow-counter-clockwise', text: '', w: '34px', act: () => this.toast('\u540E\u9000 10 \u79D2', ACC) },
          st.cnPaused
            ? { label: '\u64AD\u653E', icon: 'ph-play', text: '', w: '34px', act: () => this.setState({ cnPaused: false }), primary: true }
            : { label: '\u6682\u505C', icon: 'ph-pause', text: '', w: '34px', act: () => this.setState({ cnPaused: true }), primary: true },
          { label: '\u524D\u8FDB 30 \u79D2', icon: 'ph-arrow-clockwise', text: '', w: '34px', act: () => this.toast('\u524D\u8FDB 30 \u79D2', ACC) },
          { label: '\u5B57\u5E55', icon: 'ph-subtitles', text: playing.tags.includes('\u4E2D\u6587\u5B57\u5E55') ? '\u4E2D\u6587\u5B57\u5E55' : '\u65E0\u5B57\u5E55', w: 'auto', act: () => this.toast(playing.tags.includes('\u4E2D\u6587\u5B57\u5E55') ? '\u5B57\u5E55\u8F68\uFF1A\u4E2D\u6587\uFF08\u5185\u5C01\uFF09' : '\u8BE5\u6587\u4EF6\u6CA1\u6709\u5B57\u5E55\u8F68', playing.tags.includes('\u4E2D\u6587\u5B57\u5E55') ? ACC : WARN) },
          { label: '\u97F3\u8F68', icon: 'ph-speaker-high', text: '\u65E5\u8BED AAC', w: 'auto', act: () => this.toast('\u97F3\u8F68\uFF1A\u65E5\u8BED AAC 2.0', ACC) },
          { label: '\u753B\u8D28', icon: 'ph-gear', text: needsTranscode(playing) ? '\u8F6C\u7801 1080p' : '\u539F\u753B', w: 'auto', act: () => this.toast(needsTranscode(playing) ? '\u5DF2\u5207\u6362\u4E3A\u539F\u753B\u76F4\u8FDE\uFF08\u5BA2\u6237\u7AEF\u9700\u652F\u6301 hevc\uFF09' : '\u5F53\u524D\u4E3A\u539F\u753B\u76F4\u8FDE', ACC) },
        ].map((c) => ({
          ...c,
          bg: c.primary ? 'rgba(145,132,217,.2)' : 'var(--t05)',
          ring: c.primary ? 'rgba(145,132,217,.42)' : 'rgba(233,233,237,.12)',
          fg: c.primary ? 'var(--acct)' : 'rgba(233,233,237,.82)',
          text: c.text || '',
        })),
      } : null,
      closePlayer: () => this.setState({ cnPlaying: null, cnBuffering: false }),
    };
  }

  renderVals() {
    const st = this.state;
    const list = this.visible();
    const rows = list.map((m) => {
      const s = this.statusOf(m);
      const sel = st.sel.includes(m.code);
      const badges = [];
      if (m.vr) badges.push({ t: 'VR', bg: 'rgba(145,132,217,.3)', fg: 'var(--acct)' });
      if (m.sub) badges.push({ t: '\u4E2D\u5B57', bg: 'rgba(99,179,148,.25)', fg: 'var(--onacc)' });
      return {
        code: m.code, title: m.title, date: m.date, dur: m.dur,
        actorText: m.actors.join(' / ') + (m.actors.length > 1 ? \` \xB7 \${m.actors.length} \u4EBA\` : ''),
        tags: m.tags.slice(0, 3).map((t) => ({ t })), tagText: m.tags.join(' \xB7 '),
        statusText: s.text, statusColor: s.color, badges,
        magText: m.mag ? \`\u6700\u4F73 \${m.mag}\` : '\u65E0\u53EF\u7528\u78C1\u529B \xB7 \u5168\u90E8\u5DF2\u5C1D\u8BD5\u5931\u6548',
        magFg: m.mag ? DIM : BAD, noMag: !m.mag,
        sel, ring: sel ? ACC : 'var(--ring)',
        toggle: () => this.setState({ sel: sel ? st.sel.filter((c) => c !== m.code) : st.sel.concat(m.code) }),
        open: () => this.setState({ detail: m.code }),
        dispatch: this.dispatchOne(m),
      };
    });

    const offline = st.src === 'yhg';
    const showResults = !offline && !st.loading && rows.length > 0 && st.sMode !== 'magnet';
    const dm = MOVIES.find((m) => m.code === st.detail);
    const dlg = st.dlg;
    const srcName = st.src === 'javbus' ? 'JavBus' : st.src === 'cili' ? 'Cilisousuo' : 'YHG007';

    const mode = SEARCH_MODES.find((m) => m.key === st.sMode) || SEARCH_MODES[1];
    const ok115t = this.allConnected();
    const toolStates = {
      'PikPak': st.pikLogged
        ? { status: '\u5DF2\u767B\u5F55 \xB7 \u914D\u989D 1.78 TB / 2 TB', dot: OK, fg: DIM }
        : { status: '\u672A\u767B\u5F55 \xB7 \u65E0\u6CD5\u63D0\u4EA4\u79BB\u7EBF\u4EFB\u52A1', dot: BAD, fg: BAD },
      '115 \u7F51\u76D8': ok115t
        ? { status: 'Cookie \u6709\u6548 \xB7 \u79BB\u7EBF\u76EE\u5F55\u5DF2\u8BBE\u7F6E', dot: OK, fg: DIM }
        : { status: '\u672A\u914D\u7F6E Cookie \xB7 \u53EF\u626B\u7801\u767B\u5F55', dot: DIM2, fg: DIM2 },
      'Aria2': { status: '\u5DF2\u8FDE\u63A5 \xB7 127.0.0.1:6800', dot: OK, fg: DIM },
    };
    const toolState = toolStates[st.tool];
    const cfgKey = st.toolCfg;
    const toolCfg = cfgKey ? {
      'PikPak': {
        name: 'PikPak', desc: '\u78C1\u529B\u79BB\u7EBF\u4E0B\u8F7D\u7684\u9ED8\u8BA4\u5DE5\u5177\uFF0C\u767B\u5F55\u6001\u4FDD\u5B58\u5728\u670D\u52A1\u7AEF\u3002',
        status: toolStates['PikPak'].status, dot: toolStates['PikPak'].dot, fg: toolStates['PikPak'].fg,
        fields: [{ k: '\u8D26\u53F7', v: st.pikLogged ? 'user@example.com' : '\u2014' }, { k: '\u79BB\u7EBF\u76EE\u5F55', v: '/JavJaeger' }, { k: '\u79BB\u7EBF\u4EFB\u52A1', v: '4 / 5' }],
        canAct: true, actText: '\u7528\u914D\u7F6E\u767B\u5F55', actFg: ACC,
        act: () => { this.setState({ pikLogged: true }); this.toast('\u5DF2\u7528\u8BBE\u7F6E\u4E2D\u4FDD\u5B58\u7684\u8D26\u53F7\u5BC6\u7801\u91CD\u65B0\u767B\u5F55 PikPak', OK); },
      },
      '115 \u7F51\u76D8': {
        name: '115 \u7F51\u76D8', desc: 'Cookie \u53EF\u624B\u52A8\u7C98\u8D34\uFF0C\u4E5F\u53EF\u7528 115 App \u626B\u7801\u767B\u5F55\u540E\u81EA\u52A8\u5199\u5165\u3002',
        status: toolStates['115 \u7F51\u76D8'].status, dot: toolStates['115 \u7F51\u76D8'].dot, fg: toolStates['115 \u7F51\u76D8'].fg,
        fields: [{ k: 'Cookie', v: ok115t ? '\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u20223f9a' : '\u672A\u914D\u7F6E' }, { k: '\u79BB\u7EBF\u76EE\u5F55 CID', v: ok115t ? '2634891037465' : '\u2014' }, { k: '\u6279\u91CF\u5927\u5C0F', v: '20' }],
        qr: !ok115t, qrText: '\u7528 115 App \u626B\u7801\u540E\u81EA\u52A8\u5199\u5165 Cookie\uFF0C\u4E8C\u7EF4\u7801 3 \u5206\u949F\u5185\u6709\u6548\u3002',
        qrState: st.qrState === 'scanned' ? '\u72B6\u6001\uFF1A\u5DF2\u626B\u7801\uFF0C\u7B49\u5F85\u624B\u673A\u7AEF\u786E\u8BA4' : '\u72B6\u6001\uFF1A\u7B49\u5F85\u626B\u7801',
        canAct: !ok115t, actText: st.qrState === 'scanned' ? '\u91CD\u65B0\u751F\u6210\u4E8C\u7EF4\u7801' : '\u6211\u5DF2\u626B\u7801', actFg: ACC,
        act: () => {
          if (st.qrState === 'scanned') { this.setState({ qrState: 'waiting' }); this.toast('\u5DF2\u751F\u6210\u65B0\u7684\u767B\u5F55\u4E8C\u7EF4\u7801', ACC); }
          else { this.setState({ qrState: 'scanned' }); this.toast('\u5DF2\u68C0\u6D4B\u5230\u626B\u7801\uFF0C\u8BF7\u5728\u624B\u673A\u4E0A\u786E\u8BA4\u767B\u5F55', ACC); }
        },
      },
      'Aria2': {
        name: 'Aria2\uFF08\u76F4\u63A5\u4E0B\u8F7D\uFF09', desc: '\u901A\u8FC7 JSON-RPC \u76F4\u63A5\u4E0B\u8F7D\u78C1\u529B\u4E0E\u7F51\u76D8\u76F4\u94FE\u5230\u670D\u52A1\u7AEF\u672C\u5730\u3002',
        status: toolStates['Aria2'].status, dot: OK, fg: DIM,
        fields: [{ k: 'RPC \u5730\u5740', v: 'http://127.0.0.1:6800/jsonrpc' }, { k: '\u4E0B\u8F7D\u76EE\u5F55', v: '/downloads/aria2' }, { k: '\u5168\u5C40\u5E76\u53D1', v: '5' }],
        canAct: true, actText: '\u91CD\u65B0\u8FDE\u63A5', actFg: ACC,
        act: () => { this.setState({ toolCfg: null }); this.toast('Aria2 \u91CD\u65B0\u8FDE\u63A5\u6210\u529F \xB7 v1.37.0', OK); },
      },
    }[cfgKey] : null;
    if (toolCfg) toolCfg.goSettings = () => this.setState({ toolCfg: null, route: 'settings', seTab: cfgKey === 'Aria2' ? 'Aria2' : cfgKey });
    const bq = st.browseQ.trim().toLowerCase();
    const bcat = st.browse === 'star' ? ACTOR_CATALOG : st.browse === 'genre' ? GENRE_CATALOG : null;
    const isActorBrowse = st.browse === 'star';
    const bgroups = bcat ? bcat.map((g) => ({
      name: g.name, count: \`\${g.items.length} \u9879\`,
      isActor: isActorBrowse, isTag: !isActorBrowse,
      items: g.items.filter(([n, c]) => !bq || n.toLowerCase().includes(bq) || c.includes(bq)).map(([n, c, cnt, noAvatar]) => ({
        name: n, code: c, count: cnt || '', initial: n.slice(0, 1), noAvatar: !!noAvatar,
        bg: st.fValue === c ? 'rgba(145,132,217,.14)' : 'var(--t03)',
        ring: st.fValue === c ? 'rgba(145,132,217,.45)' : 'var(--t09)',
        pick: () => this.setState({ fValue: c, fLabel: n, browse: null }),
      })),
    })).filter((g) => g.items.length) : [];
    const browseCfg = bcat ? {
      title: st.browse === 'star' ? '\u6D4F\u89C8\u6F14\u5458' : '\u6D4F\u89C8\u7C7B\u522B',
      note: isActorBrowse ? '\u5934\u50CF\u6765\u81EA .actors/ \u76EE\u5F55\uFF0C\u9009\u4E2D\u540E\u56DE\u586B\u4EE3\u7801\u4E0E\u540D\u79F0' : '\u6309\u5206\u7EC4\u5C55\u793A categories.json\uFF0C\u9009\u4E2D\u540E\u56DE\u586B\u4EE3\u7801',
      kind: st.browse === 'star' ? '\u6F14\u5458' : '\u7C7B\u522B',
      groups: bgroups, empty: bgroups.length === 0,
    } : null;
    const magReady = list.filter((m) => m.mag).length;
    const reasons = [];
    if (st.fList.length > 1) reasons.push('\u591A\u6761\u4EF6\u7B5B\u9009');
    if (ACTOR_COUNTS[st.actorCount]) reasons.push('\u6F14\u5458\u4EBA\u6570');
    if (st.excludeVr) reasons.push('\u6392\u9664 VR');
    if (st.sub !== '0') reasons.push('\u5B57\u5E55\u8FC7\u6EE4');
    const needsDetail = st.sMode === 'filter' && reasons.length > 0;
    const needsDetailReason = reasons.join('\u3001');

    const chips = [];
    if (st.sMode === 'filter') {
      st.fList.forEach((f) => chips.push({
        text: \`\${f.label}\uFF1A\${f.name || f.value}\`,
        remove: () => this.setState({ fList: st.fList.filter((x) => !(x.type === f.type && x.value === f.value)), page: 1 }),
      }));
      if (st.magParam === 'exist') chips.push({ text: '\u6709\u78C1\u529B', remove: () => this.setState({ magParam: 'all' }) });
      if (st.kind === 'uncensored') chips.push({ text: '\u65E0\u7801', remove: () => this.setState({ kind: 'normal' }) });
      if (ACTOR_COUNTS[st.actorCount]) chips.push({ text: \`\u6F14\u5458\u4EBA\u6570 \${st.actorCount}\`, remove: () => this.setState({ actorCount: '\u4E0D\u9650' }) });
      if (st.sub === 'true') chips.push({ text: '\u6709\u4E2D\u6587\u5B57\u5E55', remove: () => this.setState({ sub: '0' }) });
      if (st.sub === 'false') chips.push({ text: '\u65E0\u4E2D\u6587\u5B57\u5E55', remove: () => this.setState({ sub: '0' }) });
      if (st.excludeVr) chips.push({ text: '\u6392\u9664 VR', remove: () => this.setState({ excludeVr: false }) });
      if (st.fetchMode === 'all') chips.push({ text: '\u5168\u90E8\u9875', remove: () => this.setState({ fetchMode: 'page' }) });
    }
    const summary = offline ? ''
      : st.sMode === 'code' ? \`\u6309\u756A\u53F7 \${st.code || '\u2014'} \u67E5\u8BE2\`
      : st.sMode === 'magnet' ? ''
      : st.sMode === 'recognize' ? '\u89E3\u6790\u7ED3\u679C\u6309\u9875\u9762\u6392\u540D\u6392\u5E8F'
      : st.fetchMode === 'all' ? \`\u5168\u90E8\u9875\u5171 \${list.length} \u90E8\uFF08\u5DF2\u6293\u53D6 54 \u9875\uFF09\` : \`\u672C\u9875\u547D\u4E2D \${list.length} \u90E8 \xB7 \u6765\u6E90 \${srcName}\`;

    const selSizeGb = st.sel.length * 7.4;

    return {
      sysInfo: 'JavJaeger v2.4.1 \xB7 \u6784\u5EFA 3944cc7 \xB7 FastAPI 0.115 \xB7 Python 3.12 \xB7 \u670D\u52A1\u7AEF\u65F6\u533A Asia/Shanghai',
      at: {
        search: st.route === 'search', dispatch: st.route === 'dispatch', transcode: st.route === 'transcode',
        scrape: st.route === 'scrape', library: st.route === 'library',
        auto: st.route === 'auto', storage: st.route === 'storage', settings: st.route === 'settings',
        cinema: st.route === 'cinema', chrome: st.route !== 'cinema',
        stub: false,
      },
      cn: this.vCinema(),
      d: this.vDispatch(), tc: this.vTranscode(), sc: this.vScrape(), lb: this.vLibrary(),
      au: this.vAuto(), fs: this.vStorage(), se: this.vSettings(),
      theme: st.theme,
      nav: NAV.map((n) => {
        const on = st.route === n.id;
        const badge = n.id === 'transcode' ? '2' : n.id === 'auto' ? '3' : '';
        return {
          label: n.label, go: this.go(n.id), icon: n.icon,
          bg: on ? 'rgba(145,132,217,.10)' : 'transparent',
          ul: on ? ACC : 'transparent', fg: on ? 'var(--fg)' : DIM,
          fw: on ? 500 : 400, badge,
          badgeBg: badge ? 'rgba(145,132,217,.2)' : 'transparent',
          badgeFg: badge ? 'var(--accs)' : 'transparent',
        };
      }),
      tools: [
        st.pikLogged
          ? { name: 'PikPak', dot: OK, halo: 'rgba(99,179,148,.18)', hint: '\u5DF2\u767B\u5F55 \xB7 \u914D\u989D 1.8 TB / 2 TB' }
          : { name: 'PikPak', dot: BAD, halo: 'rgba(224,129,136,.18)', hint: '\u672A\u767B\u5F55' },
        this.allConnected()
          ? { name: '115', dot: OK, halo: 'rgba(99,179,148,.18)', hint: '\u5DF2\u767B\u5F55 \xB7 Cookie \u6709\u6548' }
          : { name: '115', dot: DIM2, halo: 'transparent', hint: '\u672A\u914D\u7F6E Cookie' },
        { name: 'Aria2', dot: OK, halo: 'rgba(99,179,148,.18)', hint: 'http://127.0.0.1:6800/jsonrpc \u5DF2\u8FDE\u63A5' },
      ],
      bg: {
        count: BG.length, open: () => this.setState({ bgOpen: true }), open2: st.bgOpen,
        close: () => this.setState({ bgOpen: false }),
        items: BG.map((b) => ({ ...b, pctText: \`\${b.pct}%\`, go: this.go(b.route) })),
      },
      s: {
        modes: SEARCH_MODES.map((m) => ({
          name: m.name, pick: () => this.setState({ sMode: m.key, sel: [], page: 1, detail: null }),
          bg: st.sMode === m.key ? 'rgba(145,132,217,.12)' : 'transparent',
          ring: st.sMode === m.key ? 'rgba(145,132,217,.45)' : 'var(--t09)',
          fg: st.sMode === m.key ? 'var(--fg)' : DIM, fw: st.sMode === m.key ? 500 : 400,
        })),
        modeHint: mode.hint, modeTitle: mode.title, runText: mode.run,
        isCode: st.sMode === 'code', isFilter: st.sMode === 'filter',
        isMagnet: st.sMode === 'magnet',
        isRecognizeMode: st.sMode === 'recognize',
        isRecognize: st.sMode === 'recognize' && !!st.recogHtml.trim(),
        code: st.code, setCode: (e) => this.setState({ code: e.target.value.toUpperCase() }),
        fType: st.fType, setFType: (e) => this.setState({ fType: e.target.value, fValue: '', fLabel: '' }),
        fValue: st.fValue, setFValue: (e) => this.setState({ fValue: e.target.value, fLabel: e.target.value }),
        fCatalogNote: FILTER_TYPES[st.fType].note,
        canBrowse: !!FILTER_TYPES[st.fType].browse,
        openBrowse: () => this.setState({ browse: FILTER_TYPES[st.fType].key, browseQ: '' }),
        closeBrowse: () => this.setState({ browse: null }),
        browseQ: st.browseQ, setBrowseQ: (e) => this.setState({ browseQ: e.target.value }),
        browse: browseCfg,
        addFilter: () => {
          const type = FILTER_TYPES[st.fType].key;
          const value = st.fValue.trim();
          if (!value) { this.toast('\u8BF7\u9009\u62E9\u7B5B\u9009\u7C7B\u578B\u5E76\u586B\u5199\u7B5B\u9009\u4EE3\u7801\u6216\u540D\u79F0', WARN); return; }
          const label = st.fLabel || value;
          if (st.fList.some((f) => f.type === type && (f.value === value || (f.name || f.value) === label))) { this.toast('\u8BE5\u6761\u4EF6\u5DF2\u5728\u7B5B\u9009\u5217\u8868\u4E2D', WARN); return; }
          this.setState({ fList: st.fList.concat({ type, label: st.fType, value, name: label }), page: 1 });
        },
        magExist: st.magParam === 'exist', magAll: st.magParam === 'all',
        setMagExist: () => this.setState({ magParam: 'exist' }), setMagAll: () => this.setState({ magParam: 'all' }),
        kindNormal: st.kind === 'normal', kindUnc: st.kind === 'uncensored',
        setKindNormal: () => this.setState({ kind: 'normal' }), setKindUnc: () => this.setState({ kind: 'uncensored' }),
        actorCount: st.actorCount, setActorCount: (e) => this.setState({ actorCount: e.target.value, page: 1 }),
        sub0: st.sub === '0', subTrue: st.sub === 'true', subFalse: st.sub === 'false',
        setSub0: () => this.setState({ sub: '0' }), setSubTrue: () => this.setState({ sub: 'true' }), setSubFalse: () => this.setState({ sub: 'false' }),
        excludeVr: st.excludeVr, toggleExcludeVr: () => this.setState({ excludeVr: !st.excludeVr, page: 1 }),
        fetchPage: st.fetchMode === 'page', fetchAll: st.fetchMode === 'all',
        setFetchPage: () => this.setState({ fetchMode: 'page' }),
        setFetchAll: () => { this.setState({ fetchMode: 'all', page: 1 }); this.toast('\u5DF2\u5207\u6362\u4E3A\u83B7\u53D6\u5168\u90E8\u9875\uFF1A\u4F1A\u9010\u9875\u6293\u53D6\u76F4\u5230\u6CA1\u6709\u4E0B\u4E00\u9875\uFF0C\u8017\u65F6\u8F83\u957F', WARN); },
        detailWarn: needsDetail, detailWarnText: \`\u5F53\u524D\u6761\u4EF6\u9700\u8981\u9010\u7247\u8BF7\u6C42\u5F71\u7247\u8BE6\u60C5\uFF08\${needsDetailReason}\uFF09\uFF0C\u5E76\u53D1 3\uFF0C\u7ED3\u679C\u4F1A\u5206\u6279\u8FD4\u56DE\u3002\`,
        sortSize: st.sortBy === 'size', sortDate: st.sortBy === 'date',
        setSortSize: () => this.setState({ sortBy: 'size' }), setSortDate: () => this.setState({ sortBy: 'date' }),
        orderDesc: st.sortOrder === 'desc', orderAsc: st.sortOrder === 'asc',
        setOrderDesc: () => this.setState({ sortOrder: 'desc' }), setOrderAsc: () => this.setState({ sortOrder: 'asc' }),
        recogHtml: st.recogHtml, setRecogHtml: (e) => this.setState({ recogHtml: e.target.value }),
        autoDownload: st.autoDownload, toggleAutoDownload: () => this.setState({ autoDownload: !st.autoDownload }),
        recogCount: 8, recogSkipped: '2 \u6761\u65E0 id \u5B57\u6BB5\u5DF2\u8DF3\u8FC7',
        toolPik: st.tool === 'PikPak', tool115: st.tool === '115 \u7F51\u76D8', toolAria: st.tool === 'Aria2',
        setToolPik: () => this.setState({ tool: 'PikPak' }), setTool115: () => this.setState({ tool: '115 \u7F51\u76D8' }), setToolAria: () => this.setState({ tool: 'Aria2' }),
        toolStatus: toolState.status, toolDot: toolState.dot, toolFg: toolState.fg,
        openToolCfg: () => this.setState({ toolCfg: st.tool, qrState: 'waiting' }),
        closeToolCfg: () => this.setState({ toolCfg: null }),
        toolCfg: st.toolCfg ? toolCfg : null,
        autoDlAvailable: st.sMode === 'recognize' || st.sMode === 'filter',
        autoOff: !st.autoDownload, autoOn: st.autoDownload,
        autoOffText: st.sMode === 'recognize' ? '\u4EC5\u8BC6\u522B' : '\u4EC5\u641C\u7D22',
        setAutoOff: () => this.setState({ autoDownload: false }), setAutoOn: () => this.setState({ autoDownload: true }),
        exclude4k: st.exclude4k,
        toggleExclude4k: () => { this.setState({ exclude4k: !st.exclude4k }); this.toast(st.exclude4k ? '\u5DF2\u53D6\u6D88\u6392\u9664 4K\uFF0C\u6B63\u5728\u91CD\u65B0\u62C9\u53D6\u6700\u4F73\u78C1\u529B' : '\u5DF2\u6392\u9664 4K \u8D44\u6E90\uFF0C\u6B63\u5728\u91CD\u65B0\u62C9\u53D6\u6700\u4F73\u78C1\u529B', ACC); },
        reset: () => this.setState({ code: '', fList: [], fValue: '', fLabel: '', magParam: 'exist', kind: 'normal', actorCount: '\u4E0D\u9650', sub: '0', excludeVr: true, fetchMode: 'page', exclude4k: false, sel: [], page: 1 }),
        run: this.runSearch,
        srcLabel: srcName, setSrcSelect: (e) => this.setSrc(e.target.value === 'JavBus' ? 'javbus' : e.target.value === 'Cilisousuo' ? 'cili' : 'yhg')(),
        setSrcJav: this.setSrc('javbus'),
        srcDot: offline ? BAD : OK, srcFg: offline ? BAD : DIM,
        srcText: offline ? '\u8FDE\u63A5\u8D85\u65F6' : st.src === 'cili' ? '\u53EF\u7528 \xB7 \u5EF6\u8FDF 1.2s' : '\u53EF\u7528 \xB7 \u5EF6\u8FDF 0.4s',
        magnetProgress: showResults ? \`\u6700\u4F73\u78C1\u529B \${rows.length} / \${rows.length} \u5DF2\u52A0\u8F7D \xB7 \${magReady} \u90E8\u6709\u53EF\u7528\u78C1\u529B\` : '',
        noResults: !showResults,
        downloadAll: () => this.ask({
          title: \`\u4E0B\u8F7D\u5168\u90E8\u7ED3\u679C\u5230 \${st.tool}\uFF1F\`, color: ACC, okText: '\u5F00\u59CB\u6D3E\u53D1',
          body: \`\u5C06\u5BF9 \${rows.length} \u90E8\u7ED3\u679C\u5404\u53D6\u7B2C\u4E00\u6761\u78C1\u529B\u63D0\u4EA4\u3002\u5DF2\u5165\u5E93\u3001\u5DF2\u4E0B\u8F7D\u8FC7\u7684\u5F71\u7247\u4F1A\u8DF3\u8FC7\uFF1B\u6CA1\u6709\u78C1\u529B\u7684\u5F71\u7247\u4E0D\u4F1A\u8BA1\u5165\u3002\`,
          list: list.filter((m) => m.mag && m.local !== 'in').slice(0, 6).map((m) => \`\${m.code} \u2192 \${m.mag}\`),
          run: () => this.toast(\`\u5DF2\u63D0\u4EA4 \${magReady - 2} \u6761 \xB7 \u8DF3\u8FC7 2 \u90E8\u5DF2\u5165\u5E93\`, OK),
        }),
        viewGrid: st.view === 'grid', viewList: st.view === 'list',
        setViewGrid: () => this.setState({ view: 'grid' }), setViewList: () => this.setState({ view: 'list' }),
        selectPage: () => this.setState({ sel: list.map((m) => m.code) }),
        chips, hasChips: chips.length > 0,
        clearFilters: () => this.setState({ fList: [], page: 1 }),
        summary, loading: st.loading, offline,
        empty: !offline && !st.loading && rows.length === 0 && st.sMode !== 'magnet',
        emptyTitle: st.sMode === 'recognize' ? '\u7B49\u5F85\u7C98\u8D34\u9875\u9762 HTML' : st.sMode === 'code' ? \`\u672A\u627E\u5230\u756A\u53F7 \${st.code || '\u2014'}\` : '\u6CA1\u6709\u5339\u914D\u7684\u5F71\u7247',
        emptyBody: st.sMode === 'recognize'
          ? '\u628A JavBus \u5217\u8868\u9875\u7684 HTML \u7C98\u8D34\u5230\u5DE6\u4FA7\uFF0C\u4F1A\u89E3\u6790 videothumblist \u533A\u57DF\u5185\u7684\u756A\u53F7\u4E0E\u6807\u9898\uFF0C\u518D\u9010\u6761\u53D6\u6700\u4F73\u78C1\u529B\u3002'
          : st.sMode === 'code'
            ? 'JavBus \u8FD4\u56DE 404\u3002\u786E\u8BA4\u756A\u53F7\u62FC\u5199\uFF0C\u6216\u6362\u7528\u6807\u7B7E\u7B5B\u9009\u6309\u6F14\u5458\u3001\u7CFB\u5217\u67E5\u627E\u3002'
            : \`\${needsDetail ? '\u8BE6\u60C5\u6838\u5BF9\u540E' : ''}\u5F53\u524D\u6761\u4EF6\u7EC4\u5408\u6CA1\u6709\u7ED3\u679C\u3002\u53EF\u4EE5\u53BB\u6389\u4E00\u4E2A\u7B5B\u9009\u6761\u4EF6\u3001\u653E\u5BBD\u6F14\u5458\u4EBA\u6570\uFF0C\u6216\u5173\u95ED\u300C\u6392\u9664 VR\u300D\u3002\`,
        showGrid: showResults && st.view === 'grid', showList: showResults && st.view === 'list',
        showPager: showResults && st.sMode === 'filter' && st.fetchMode === 'page',
        pagerText: \`\u672C\u9875 \${rows.length} \u90E8 \xB7 \u6BCF\u9875 30 \u6761\uFF0C\u4E0D\u8DB3 30 \u6761\u5373\u65E0\u4E0B\u4E00\u9875\uFF08\u7B5B\u9009\u540E\u8BA1\u6570\u6309\u8BE6\u60C5\u6838\u5BF9\u7ED3\u679C\u91CD\u7B97\uFF09\`,
        page: st.page, prevDisabled: st.page <= 1, nextDisabled: rows.length < 30,
        prevPage: () => { this.setState({ page: Math.max(1, st.page - 1) }); this.runSearch(); },
        nextPage: () => { this.setState({ page: st.page + 1 }); this.runSearch(); },
        magCode: st.code || '\u2014',
        magQueryNote: st.src === 'javbus' ? '\u5DF2\u53D6\u5230 gid / uc \u53C2\u6570 \xB7 \u6309\u4F53\u79EF\u964D\u5E8F \xB7 \u5171 6 \u6761' : '\u6309\u756A\u53F7\u76F4\u63A5\u67E5\u8BE2 \xB7 \u5171 6 \u6761',
        magRows: MAGNETS.filter((g) => st.sub === '0' || (st.sub === 'true') === g.sub)
          .filter((g) => !st.exclude4k || !g.name.includes('4K'))
          .map((g) => ({
            name: g.name, size: g.size, date: g.date, fg: 'var(--fg)',
            sub: g.sub ? '\u6709' : '\u65E0', subFg: g.sub ? OK : DIM2,
            flags: g.hd ? [{ t: 'HD', bg: 'rgba(145,132,217,.22)', fg: 'var(--accs)' }] : [],
            dispatch: () => this.toast(\`\${st.code} \xB7 \${g.name} \u5DF2\u63D0\u4EA4\u5230 \${st.tool}\`, OK),
          })),
        skeletons: [1, 2, 3, 4, 5, 6, 7, 8].map((k) => ({ k })),
        rows, tool: st.tool,
        selCount: st.sel.length, batchOpen: st.sel.length > 0,
        selSize: \`\${selSizeGb.toFixed(1)} GB\`,
        selNote: st.sel.length > 2 ? '\u5176\u4E2D 1 \u90E8\u5DF2\u5165\u5E93\uFF0C\u5C06\u81EA\u52A8\u8DF3\u8FC7' : '\u5747\u672A\u5165\u5E93',
        clearSel: () => this.setState({ sel: [] }),
        batchAuto: () => this.toast(\`\u5DF2\u628A \${st.sel.length} \u4E2A\u756A\u53F7\u5199\u5165\u81EA\u52A8\u4EFB\u52A1\u300C\u6BCF\u65E5\u65B0\u7247\u8DDF\u8FDB\u300D\u7684\u68C0\u7D22\u767D\u540D\u5355\`, ACC),
        batchDispatch: () => this.ask({
          kind: 'batch', title: \`\u6279\u91CF\u6D3E\u53D1 \${st.sel.length} \u90E8\u5230 \${st.tool}\uFF1F\`, color: ACC, okText: '\u5F00\u59CB\u6D3E\u53D1',
          body: \`\u5C06\u6309\u6700\u4F73\u78C1\u529B\u9010\u6761\u63D0\u4EA4\u3002\u5DF2\u5165\u5E93\u5F71\u7247\u548C\u4E0B\u8F7D\u5386\u53F2\u4E2D\u5DF2\u5C1D\u8BD5\u8FC7\u7684\u94FE\u63A5\u4F1A\u88AB\u8DF3\u8FC7\uFF1B115 \u4F1A\u6309 batch_size=20 \u5408\u5E76\u8BF7\u6C42\u3002\`,
          list: st.sel.map((c) => \`\${c} \u2192 magnet:?xt=urn:btih:\${c.toLowerCase()}\u2026\`),
          run: () => { this.setState({ route: 'dispatch' }); this.toast(\`\u5DF2\u63D0\u4EA4 \${st.sel.length} \u6761 \xB7 2 \u6761\u5931\u8D25\uFF0C\u89C1\u4E0B\u8F7D\u6D3E\u53D1\u9875\`, WARN); },
        }),
        detail: !!dm, closeDetail: () => this.setState({ detail: null }),
        goSettings: this.go('settings'),
        d: dm ? {
          code: dm.code, title: dm.title, date: dm.date, dur: dm.dur, studio: dm.studio,
          label: dm.label, series: dm.series, director: dm.director,
          statusText: this.statusOf(dm).text, statusColor: this.statusOf(dm).color,
          actors: dm.actors.map((a) => ({ name: a, initial: a.slice(0, 1) })),
          tags: dm.tags.map((t) => ({ t })), magCount: dm.magCount,
          magnets: MAGNETS.filter((g) => !st.exclude4k || !g.name.includes('4K')).map((g) => ({
            name: g.name, size: g.size, date: g.date, fg: 'var(--fg)',
            sub: g.sub ? '\u6709' : '\u65E0', subFg: g.sub ? OK : DIM2,
            flags: g.hd ? [{ t: 'HD', bg: 'rgba(145,132,217,.22)', fg: 'var(--accs)' }] : [],
            dispatch: this.dispatchOne(dm),
          })),
          dispatchBest: this.dispatchOne(dm),
          copy: () => this.toast(\`\u5DF2\u590D\u5236\u756A\u53F7 \${dm.code}\`, ACC),
        } : null,
      },
      dlg: {
        open: !!dlg, title: dlg ? dlg.title : '', body: dlg ? dlg.body : '',
        color: dlg ? dlg.color : ACC, okText: dlg ? dlg.okText : '\u786E\u8BA4',
        hasList: !!(dlg && dlg.list && dlg.list.filter(Boolean).length),
        list: dlg && dlg.list ? dlg.list.filter(Boolean).map((t) => ({ t })) : [],
        needsConfirm: !!(dlg && dlg.ackText), ackText: dlg ? dlg.ackText : '',
        acked: st.dlgAck, ack: () => this.setState({ dlgAck: !st.dlgAck }),
        blocked: !!(dlg && dlg.ackText && !st.dlgAck),
        cancel: () => { const d = st.dlg; this.setState({ dlg: null, dlgAck: false }); if (d && d.onCancel) d.onCancel(); },
        confirm: () => { const d = st.dlg; this.setState({ dlg: null, dlgAck: false }); if (d && d.run) d.run(); },
      },
      toast: { open: !!st.toast, text: st.toast ? st.toast.text : '', color: st.toast ? st.toast.color : ACC },
    };
  }
}
<\/script>
</body>
</html>
`;

  // frontend/src/design/static/logo.jpg
  var logo_default = "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/4gKgSUNDX1BST0ZJTEUAAQEAAAKQbGNtcwQwAABtbnRyUkdCIFhZWiAAAAAAAAAAAAAAAABhY3NwQVBQTAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA9tYAAQAAAADTLWxjbXMAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAtkZXNjAAABCAAAADhjcHJ0AAABQAAAAE53dHB0AAABkAAAABRjaGFkAAABpAAAACxyWFlaAAAB0AAAABRiWFlaAAAB5AAAABRnWFlaAAAB+AAAABRyVFJDAAACDAAAACBnVFJDAAACLAAAACBiVFJDAAACTAAAACBjaHJtAAACbAAAACRtbHVjAAAAAAAAAAEAAAAMZW5VUwAAABwAAAAcAHMAUgBHAEIAIABiAHUAaQBsAHQALQBpAG4AAG1sdWMAAAAAAAAAAQAAAAxlblVTAAAAMgAAABwATgBvACAAYwBvAHAAeQByAGkAZwBoAHQALAAgAHUAcwBlACAAZgByAGUAZQBsAHkAAAAAWFlaIAAAAAAAAPbWAAEAAAAA0y1zZjMyAAAAAAABDEoAAAXj///zKgAAB5sAAP2H///7ov///aMAAAPYAADAlFhZWiAAAAAAAABvlAAAOO4AAAOQWFlaIAAAAAAAACSdAAAPgwAAtr5YWVogAAAAAAAAYqUAALeQAAAY3nBhcmEAAAAAAAMAAAACZmYAAPKnAAANWQAAE9AAAApbcGFyYQAAAAAAAwAAAAJmZgAA8qcAAA1ZAAAT0AAACltwYXJhAAAAAAADAAAAAmZmAADypwAADVkAABPQAAAKW2Nocm0AAAAAAAMAAAAAo9cAAFR7AABMzQAAmZoAACZmAAAPXP/bAEMABQMEBAQDBQQEBAUFBQYHDAgHBwcHDwsLCQwRDxISEQ8RERMWHBcTFBoVEREYIRgaHR0fHx8TFyIkIh4kHB4fHv/bAEMBBQUFBwYHDggIDh4UERQeHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHv/CABEIAZABkAMBIgACEQEDEQH/xAAcAAACAwEBAQEAAAAAAAAAAAACAwEEBQAGBwj/xAAUAQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIQAxAAAAHQ7uDkZOmSIPuOmeImeOEoI7pIgoILhOjAxT1efmY5tlhcekteV49g/wAQR72fE+kL6zWAlqRKGpEodWJiICCBOXInSPBcPHt5EiSiQyHgugjpgie7jhkA+GSejiPJanlRpA4Tl+h9GeE3LdEdiXwKzUcMNNk3r3ltguodWFJakTVsVQh4CRjiBgSeDhkDx7wltCmOCIZC6OC6OClchLJQwkkGhmaeWz3Zpf8AXU/TjbIkVvNeuzjxk3RKdfQqlEbNI0NPz+qb6SWKS5AipaqExwnB0EBwndEB8MH0BqGjIEgpDgpDhkhwXLENXJH8jhtCznHkXUPWm1odolQ2kQDklHI3Fnncv0eAVcqxSL9mjZPQnlaJyWKE1LVQ4OE4eAgeEKB4KOg9+5TA5GSeiSY7juiCQECV8obCYG+Z9B5s897zw+8ep1fDXD2Hnm1TF9B1sKLlMPz2pnnl6ephl1uew3NTH0C8I8BSt1AVkIIzAIkJHdx3dx79iyDkZD6OJ6BJVyQhSsYoEjurCWs1yzH9d5ffKnFYNcPQMPm9/Sk63f0jAxfU+aMjxfvPFCLlbQLOljwaV3C3galqoCMiDHQDHcdHcd3ce+KDJKCJnuBWyuBWKqSuACVySRFYcKrlH3/zb6CRacZ6cKlgzSgS1D1lHK2KxjeL915Ix9HP4d0JNLV87vDad2kLGQOGYB7oOiOCGYPoTIM4u46JAGsdYr13IOWKyVEsgJA5cqM/3HkPTmri6HnyxTXsnpVZ9k3XZFwfnW6R5PIs+aGIZBeinulK5ZsB1LueLGYIjoOGQI6YOmIPpDFNC6OOSxJXrPQJU2uVo6AQJZASJCWADuYdgvYuxnFy5asGBV9nnmncxbJo0RzjA816nyhImwexYjDqOPSVkvFAcAd3AgYHRMHRIn0h1dozh4iu5BXS6uLrOrleOghZgAEgCMiRVtJHaHmdMZcqEeuPMqFo8FZuKztQo1/YelPBZGvXPIWduwZt/mlObVQBbAB7oIAhI6JOEoPoZqMbKyIQ5JXSxRWQ2uKiRIUxQISBwdBwxBTiygh1Ey4tBhm6+d7c/qIr5DqeUOTNcsgBiq9lBZS1pRXprM6LiiqLFkdHEjMH0Mu4khIhTVFRTllOrbqihkDlkIoTWCtiiBGBqwAjmmK0qNkue7d9EGeN9B8bM9tK0AvlE2KjxilsGtU0akkFg1mLpWBM3nIJiRPo8TBMiRyWpKoOQV6lusVxkThYsSpqwFNULSxJDqok+l8r7sX6mh9ANS8jwRg+bKmDYWAIcoM0MLyqF0fIQAVDQLMTXO7jAz9gTHi5SPpETBxCYKH1xSyUJq3KpTW5RKyESLVClMWJSdYlZQWLNdBs/e/zj64+t/HtXECzblEtA3ijB1iblNxYr6WMasCJmbODullkLLAlwuDELL0qx7Lu4himgpcJTW+sLr2EFa1R0DODbyiqi1WK62oKqy4CGGK2KP1c8r5L7J8pLBDAebo5hpdEFatYASyANVVe8VSYoxtXKA9SfnGG+eBYNjs28SqxB6qYkghkmCriqLKQ3S87olfPtZxu2aPoTyNXRygKligQUGLs1LxvfX/kX1U8983v546V8Hl6eaakQRTSwRLAMuZetBC6zSrXuZxdIHEtcITxgsnWk9kaGnEshmXeqnk6fsMM87qv9IYejdgp7znHnvH+58MJrsA5ynlTRzr5v+0+Z3TNs1XhT0BUrtYtuqXDMVbSVXcstXMsDRr6FERn6NMVcz2mi+k40Tq3AJMj0hARxpIYliithX/Kl9yOPbI8j6wZeqPE+D9v4UTANBsKYVbVawMFLBzkvD7uCS4SvqYu0VEPrHJakv1bzzM0a7zJp7OQVOIC1cy3Gs7Ltl1lNh7AluAmIOCQKPlPc+QEVCulj0fm/YAloZRR8j9E8eefsIcWBagUdeSyaWjjSQ9iDGklxk7uLqgUdCqVoMCxdqcX5puLPn9+meeWcEEElh1cy0dTj6C2sY2FwOgZJ7pPP5HtqQnR8ZdPTrztcveN9X4oyDBhfoamQJsrsFc5IJtZo81MDfWslBqDNBLFCVsAuxLykTIGOr2Dz9D0WAAM8FZqGXV2bJ6Y6xjxXw8lGN4eOzrmKLj3Pzs9P6Omk8zRSRmPr2zRxNjEG3aLzRFLRUOgUfSHYq2DOggNQFPEDyi/YrXRIWhKpks7B38syIMSGraWTED1h1zHyri0dZhZlABeb2cA+tYGjslT5fueYCEqgu/T0CMXTyi5NgCHVJL0IMKOgc2pYDmDKOpg7AFS/QLF3OcaXVXBBKTqrxMFTAIcp43u49Ga4GioCyVSC6qoodU4jX9Z810itVkTqLFlrSp2zOqzYNDmgVxtSUZcIDRMEu4YREYd9CTco2VC+7jrNTjWLPeGm0swK29ii7CLBNqbBdglgqJQQjBIyBFSyACxrmkKQEWqOuWBbSM/awfTnVq8lo6zQkMgiegFg8NMDKeVt5BdsZO2JPjFC4RLgEuszbBYo2DMG1eUWqWhRNVTUilNUQJAcJAQswAQ5ZXW5JG/g7wzKu5Yv03nPVGFYKCYZwHcssCmQ+GSzMOAz9YDzWxQE3KmhWK8VhLEVILiq9gbaiQlJkv51+kf/8QALhAAAgIBAwMDBAICAwEBAAAAAQIAAxEEECEFEjEgIjITIzBBFDMGQhUkQCU0/9oACAEBAAEFAthviYmPwY9RIAfVViXa4LP+RsyOoW5XqRi9Rqg11BgvpaDB3MMMMMaH0GH/ANJIE1XUAC9ltkp7e26xe4Kce4QcgDIxMmV32IdNqktBhhhhMMaH0H8Y/MZrdS1rBYqktqGKr2MYvcsoCsrojKfa3dOMFYq+7T3cQxjDDGh/9I9HUr+1DmBsmo4ZKGvevSIianS+5D9OE82KGBVxA07pW4jHnRuzIYYYY0P5BuPwHYb3P9Oq1+5nJMp7rDo9N2iqsLMS1MzXUcD3DDLDzCIVhOJW4M0fttYwwwxofyDcfhMEzMzqJ/61r4jsXbp2n+mtWIDARCZeuRqavpspBjqJ+7pnuiHBrf3wwxo0Ox3PrH4zCYJmZmv501xGOmVfUuqEA2UGdhhQxqpqNN2MU7pdxHOaj8x4qOJS2UMMMaNsdj+AfizCYZmZmZrLe0atsnpNWNNUk7RjAgIEa6tYdVVGuVifcpXnX8OGxGPvrbhWmlb3ZGxjR4IfxD8Z3zMzqL5tv5bS6uimpeoUmV6kMGs9msveBdTdZpun6nFmksSJlSfPUv7beDYeVbipua2wwbnMMaPBD/4zMwmEzMzMzV83sv3R0+xwenWpKGZJXYTLRzTalU/5aisr1LTXS9sRWaXfc1WtTBY85gM0/MUHOxj+Yf8AxEzMJhMJmZmd01GBYyAXPrFrNvVh3Jcts0NXeNbSRPpu1t2jr1M0/TNOE/g9kartXTr97Xr9h/KxFyKvil6gW294XhDH8w7n8xMJhMJhMJmZmd0f3L3Zs/jgPZRW7rSJ0+vtpvQMt9Ha1XbKMiHxb8VyJqfGoX3qpiDAz2w2EytS5UAKY/kQ/iHqMJhMYzMzCZmZmYTHbFr/ABxkovu064SyNglaVnxneZYTLBhrQuOoJgpnNi9ieaQZWytK+QY/n8Y9JjGMYxh2JhOxhhzL/NDF6FXErYK1OpXA1FBmsxKLMzMaftxxeyqNdgrS/aLLC0UfarlQlT8GWefxj0kxzGMO53Ox5lqmdMP/AESZrHtWfyiUooZrtLVY1eGqeuzIzGxLjhOruQrsrJcMEHl3xFErU5o7lfOZZ5/EIPQYxjGGGEzMPoPgNwXzOmn/AKXdNdf9RkpswK2rg6g1a/zBaEOIGmZqfh1CzNQJEzMjKnJ0uDGZFZLlaNLPP4hB6GjRoY8Ox2OxhEIE0D5q11hARwJS1pi6fVvL6dUDU1qWaU5q7oGmqf2ale6WDsbM5ldbEd5SfyGYU2e6tu5bPP4lg3MaNDDHh2MO5h201n07NYvcmnp5TVpUF16OFcMNRWpFDFV753zUPLjxcfuhGMHAFmBnMxzUMyjzZ5/EINzDGhhj+g+r6k0uqylbe28ZOnWadPbcvaqNBbHuhyRYDjovSn11rJWp1lKlOZVRZYf+PlNC1p2Mrv59B/ANjGhjQx/QYfSyjtSU24hfJrY5r1OF1WoafW4+oZTyR46d0u3qB6z9HQ6IxxkClM/oPiB8wx/SfwDYxoYY0bcw+o8xhgzvlTz6hwbSYHiGacTpPTH1J+1pNN1LVHVapjyTBD4I4B9wEZZgw/lMaNDGh9B2Ox2MPMK8lWyAwna7T6FkroAlVXu6R0pnsrRKa/8AIup/XcGMZmZ4/wBRGHu/QmIRCBGSEfjaNDGh9DbHY+hsCZmYMyt+6BST0Tpx7qa1qT/Ieo9gvbNn+pMMzFjHcQGOYoGzCWp+IxoY0b0HcwwwGM0xksoUUJ3qKzKUd7OldJ7TQi1r1bVjSaW5y7Lyc4BmdqDLT2ssEBh4APedmc57si1cfhaNDGjb4hh2Oxh2U4lj9x6UmT1PStRf0TQisUriMQidZ1h1WqvbFdXh/AMaZ4QxlDBON72wK5mM2J3K07EhQ4YEfgMYQwx4YNjDsYYYdi0UZPTylFek1Y6nqdLXiIMD/IupZhPOpb2VfBzDyAeSZX5tZ0uQ5BmZefvVw+O0sfowV4gBExkW1esxoY0aNu25hhhhhmnX7movaw6G5tNd0y+rVafres/iaRmyxmpieGEMzMyk861Pbp24MPEPNlXxnjY8TmftvFybjYxtjDGjekwwxodv2pxD5DNOg9UbQ3dX1/8AN1OeDNT/AGL8f04n7PMs4rGLKiDXaORZ8B86PA4UeR48w7E5DQbDdow2MaHEbTH6UIhhhhjzExFE8Hpum/kX9R0SrptP5XxP3qf7V+JjRliwGab2zVrk1cC34eDRaBO8GBp3zundDtiDYbmNDs01A+3or+5LdP3F1wTDDGh8w+Kxwylz0PQinSaqgfTKBbB4i+dR/anxMYQ+AJ4LWfTgcWgrgv4sGCIjEQ2GJYZ3MYjGK2ZxMCDYbmNLjhNK+Y4BDeT3adtLqfqTV15jQwyw7vKxx0tQbqcLT/kGq+lQuxgl/wA6/i8bZX5/f0hZVWzIytkNL14SBYFE+nyogiwGAwemxlWPcktvHboNUqvfb3mwuY9oM0TZCL3JrU+nYTGMc7JG+SeOkf8A62bC9X1P8jWjcTUfKgfbs4jGDxxFErOJqqe+JmGWfHwQeFgxj9jx4g2HorZA/WrNP9H+XgX6pnCBmZa9QBXoWtn/ABVPbptG1UpM6ov2mjT9mL8R8k8dJIGt6zqfo6ZeWO4moE0v9bjhtjFlr4lTZF1fY0MccgxTMwRRmFdwYN2jIphqrnU+wJoyoi9jrXV9OC7tsqsDk4mvGaDH2MbiquLEcpZ1DVPqHXznnYTU+NGfY0cbMsTiagZWmwiIcrYCrGWbKYsEQzMExvmAw7aluymsV2UvWVNWrImjsqKaite+luyAkzUL9h/J2Hm7+tJngnZIPO37u5XSHk+G8xoIi96W1Sk82KHQ8R40ERopzBAYGgPoEO3U2IqHcrV3iWKrzTm4NWrzGIrCauzFbnb9IMtqvCz9LsvoEsHtoOLT4bczTn2EZhr5SahI8O4MV4GndFb0nbXV/UpDYjqrj3pNJYxlb3MniZAmqRnW0Yn7Hin5ar5TPA2EB3zAeM9t3dlX5h87IcRH4LQYyRNQvY53EEUwNO+AzO536hUarKvcf49hmmreu2nVlmYKFewd2l913VK8ajajzqv7MxOTBBBBsDF5mp4sqYFGhhGyj2zmZ5zNSnekOwgPoBmZn0kAjV6HJDWVPpXyq29sa/IVZovnq3+pc3ylAmp/slYAH7zAYIIDAYJrPGjbKND4O1XxI2ESfrVV4fcRNsbZ/BqQhrSxlPe5mlhmuYaPQ/p/mJT8bubRPb2f69sxiLBB4WCavxVWamOxglHhhCOfEEEvXuDDB3UxACAggP4MzXN9nW6Y1Jpz3LVjGlq+mnUNQdTqT4PySDhW+S+Vxk4x2wrMQQRdrj95zi1eRDtVxtiETMDRuZqF926efB+sYDMzMzBsIYZ1Fvbq6BqOkaZux+l6Qkde1eFEY+2VeX4SV8t+w0B9A8KRk4mD9TUqRKTlWjweU34hWYxPM1K+hPMIzAYDsINhDGnUG56T93omh6UBqNZcuno1NhssEuPtWVTUHCSjznB7oGmYdhBjHExLhmrStDH2UxdjCYcTM1HxO9e4gmZmAwGd0ZozTV8n/H7f/k6m2qidX1P1XJ5EuPKyoTV+JowMCsMe30NMNhM7DMPxHtsRshhwRz+g0DTuzO2MCIsu5Q+dk8ejMzMzundGeM0v+HSNX9F/8j7HquO2Yxy6xPGrMqXub+MBqLqUF3b2wrMbCLMRZzOZeCG07ZU+G2zMyt4GySBgiGXJ2tsu1aQeJmZmZ3TuhaGGMrKh1b3VHkmO0q5ZV58DUHLaStrLNR7j+iJjgrP1iCfpeJ+pqRzQ2Cp4byZ+v0DiB4rT9Yly9wde0iCVJO6fo75mdzLO6fyMr9TMWOeGlAiyxuH+XSUdtTqirX7mGDYbCZmpHHgraxHPasImIRsJmBoeZamYBhqhliMBvP6MMPoO9iQGIZa21Y9o8XNG89LwqWMxfMUmd3G4hg3uBw6yo4ZcMMYgI9HiBoH4DbdglP8AYx4PJ/1MMPqOziZxGMX5J8TwLTMZOgwKMOYPHadwYDsYN8Ey6ueDpmyGSeDmZmdjjZMnZWBijFp8Z5/1MPrMOzQiL8x4sJjeU+XTe7+PmLiGBYQd+6EiLBBP23jUDB09nay+5dSvt7oWnfO+d0RS0xgfpwVKNkywc//EABQRAQAAAAAAAAAAAAAAAAAAAJD/2gAIAQMBAT8BHH//xAAUEQEAAAAAAAAAAAAAAAAAAACQ/9oACAECAQE/ARx//8QAMRAAAQMCAwcDAwQDAQAAAAAAAQACESExEBIgAyIwQEFRYRMyUEJxgQQUI3IzUqFi/9oACAEBAAY/AuVqqGVSF7QrBbzFVrguq94VD8PVZdjXypc4qHg1VFIVlVThdS0qtHfDFrTDF2UBZVN1lMqUQLhUoqqgVMMrz8J6bTU3Vl5VBmP/ABVUQpARYeqnDurQq4w42+CLuyLiaqQaLIxVvoltxh40SFBRHf4IqgQCBIrqzgUOMKFC8oEX+COHqGw1wRRZmqLLssyKnAfAweqpZNPfRdVIVMIwheMYUfAkIJrT0CuqHA5St0lbzsKnBmIqiFmVPgCgPKlTMqCoVcN58KBtBKpgR/oxTog4Tz/qd0z+6DOvZFh2blmClUVfaE36YWX3Kjjg90e6QvtjKlVuoFAgO3PQtnNw5eqIzLM5klbrQEMN1VCoMIR7tcjNjolewLeICgc/PlDANxgq2MrOPyvCzBCqIm6nDsp56+Gz8twzn8K69wlZ26qp33UHD7og4R8BszgINEWzBKG0a90/db6g6WnsV4Kpg0eFPVUVZVjz0IDyVVZWWVroEKEJxqii0qmEqVvKo/KFBPfn7JzeqACklbjXlZhsiPyqgFQ4IYnCithNFRQQq/AeMMxVSAokqgUxrthTA/AnsvSf+CowGFdT9rtNz9Ps6uciNm0BqL2iowtA7r/L/wAUXVLH4GuiJ0x7Nl9Tls/0P6YZW41E/CRoOMYZniGBdGtaEdr06ao+DiFZQF2VSoaKqdooFAF6GyO4L+eLTn6YQ0SVJv1PZBrLL9tsjvH3KOLbCRzdVRQgxl0H7QiSg1ogIv8AqNk7aONSiVXgHD7Y1wnm2oQKPshtHDeOBc6wRM7gtwPOiJwrhvGqoVF1bmvU2lgsjmgBlsf2uxP9jhGiMa8CuJBqt3mAsv0pu2b0Tdrsze6Me91Ai52A0wgs2AwlRhGqRzXfZn3NWcHdFsRp8ppUd9M67cXO2vE8BFzRUKcYQ1QoU4HCqpptxaLKVLVHBaGipVRUog2hOa00nhtVcL43134BIVpVYRav/KgLOOCJCaFkF3ahorhCg4zx6lXR3SVlsv41Je0KH7Sfwt2AoXjgNwNd0ahrzt5H+SyBZcFe1RC3ZX+o8qu3WVriXd0byFaFPAZKPc2UniBQOSqAV/jag0ABCFD7LdMt0O4DXA2K3nSBbijCD1Uci53hMe9+ZxuFm2ayuUTVU64u4VtRGuVC88iB3UtVcAGSVO0ridIHAvxcw5Ax0rhIV1DfcoewjCyOkcrCjkJaN0qJhUgoOLSsjtnKsrISKJ8d+StwPPIbwBWbY08KHSFXCMC42aE93c6pOu3BtpnkSXAK+FV5K9P634HE4QbqMvXgQgM1b4X5tj4uFKsv3G26WRcTTppJwqrcAIHRfiyOGExwvlWVeptfwF6DNJ4d0SpQ4FOU2f8AVO22170Cnqi49dZ4NsY5xjOsoeoYVLYxpMmKI186acC3NMYfaSmBRrA7oMzZG907I8lnTk7cGTwg3ughnNuBDb9Ex7ny6Kjtzk8OR0UOHBztaXZKwnEAj78O+MBqrfiDiyOC9xDz/W6L59x5m6nQOMNLpedkZo4KDbi24saBxhpeWOaDP1WRngX4OYa6YSNH/8QAKBAAAwACAgICAwACAwEBAAAAAAERITEQQVFhIHGBkaEwscHR4fDx/9oACAEBAAE/IXwhCFC4YQhCEIQREJwvotmSMGVBlXhD0hyBo6f2Nk69/qaQI6h+xoaEEE+Eb4NyYuKPhMouKX40YvjUbREVInNb1RFb2AsJIM3UbVWxdBgCFlsSBTAT0y8Ywww/Ew2BilKMNlKUpRvhCNPivhfQn8HSVb0NC/7zDtfkUk0voyIy5InXotihpCIQIlmGfkPIq0/hGwoeQNSb9MrEvTG+RsPwbImNjY+GxsvLFrlcr4sbG412U/abaQyPFQyCV8hTqd7WhgOK+DASiloDoTodrIMTSho4o5YoO9pPBVKeUPdj1frkb4VaHvijZRsvDfxafJPkxhDFuw9hUMKI2NOUiZvwM5CG9Ck0OpXcRo+zFxQs4qHab/gpN5cGMEFWRoLq+QbcRSjYyl4o38KNObzSjYw3Js32hWo2/Jabd6EZAiIsiF2dJCH0ZiCKIlEaollZJ3YOzJozU/yNS5h4MRxNlTVu0Nyd/hU6G+LfyXilLy3E2B8GF+hSnTAAu3BmzrQ30egeWjcsOlRCdgj70hCLs2PEXFFwQZDEmYb4RcmHxffLKN8L8aXwNkobeShC5ShX8Axl5CltC8QavA1yh/yiO6X7N2XoZMcRSaEbHzcjFaGdTVEOoxtUWxR7+MMUYx83nThcrmjY2MMo+Byl6wNAhpWjomfpwYQ3faG2kCW/ZMxkIVv7N4QdOoL+ZMYNmiIBKYYpPlsZoRnjvk35Ly/iti/wNjcj3c32FhSEu7xEa2kxBAYuaEVkayF1bSJC/UEWaeTMcM3GsH/yCmOLD4SszDJWCEOlmQ2msPHMXJ8N/HsWhF+LfAynh9p9z78ETZeA4UlkJhmdEIoCdw9iGWo1Do6LTybQnxtLFX80cZJ4phIIACWjmQ04MME7soy4Moo0kO8gtf4xMvKfDf8AgNRv3PsPR2iKChGwd0E7/WxHP0orDRkyMomBNcvCkTzlHTGRUswuq+MyEkL7TGSzC2h/kzX5TAwElD9G/wAYf+EhE4Y3wt+w+UZ+xg2KSr6sikw0VBIqmtiIpiYahVVBjMGUwjqGGGTt6+Ri1sOl6YlDDpxhtxdbIxqGwjD7z8G/EhsY/wDEXOhLnckXmKMS1KPktB9khiLMBC5hRSmgnohhf3iKTVsm98EbTiRHVEifjLiGligpNHaDVtlWQ8itDX2qLaz/AD5R6+aQglnm/AJsDeBscbKMMSWqhrKR+LT9D4Uf1BUqpsiAf2MgmOHBRbbMGslB0W9jVJoMk2P9l1wxSJ6DXsjjFaYzaX9BrkkfaH4P4PilG6vmMHx0oYfD3xQbCOgX6PrwNFlhnRh/EMcqvDFlln6NNZN5Ma9i8gyNS12YxsETYkUmNYMyf7OgX6MaV4QyxGWgzdrxyMe+GX/CMYbhsaDcnwYwm7GNBCVYOnbyN9g/gGjBL9hq/YCGwiqbyONswGkIHin5gaBUTSvRFXkHDA9bCBJrrkfLH8mnLDcN+Ghtwww2XgxTKdsMyiYlzpzyRP0C4M8LIYFX0TH6KbyzWJmCUYmiKN6NCwnSMRl9DVnexJhH5Qrs/fwHw/8AAL5Yw+B8Pgxsb4cSrGz0RyTr/wDIhUbFCHt6GOU8FUSTfgRulXhjCebHQ5h6D36Xs6q6wTsKo/R/oxD2BXShuvPbg1yZN2+Lo750+LEyjDY3Df4N74fwux8VUkkIrSnsZLQli8JmOo1g/kb4KmaUZ5mRoShu+n+IhrLP/o2cltPsQpAfghnbjt7Nt8PluHyxFGLzOzQYfHwOMYx8YIQkWCyQ1eTZRKk2PY3hKDLaMbwHzQvuf3CWgO/A4G9ChktGFCXgMQ00xj0S6Efjhj4fFGxMQnw3BjU3+Fs1+BhswE7IsyohBmd2EpFl3lfsIczfgQ0fbCwhOfpfZgOtljq2wYDJsfke4twGawIdIWBO0RcqifCG3ow5DVtPh8snCfDE4N8Nl+AxilvDq3x+jHR1jQsEpho0qPq6ehFUQ+5QTIvgOrJ6Gwctj++CZpVobOE9HY+yXkYWiBD2v4JXwXyuGh1w05mPkxjfAGJxCFbMhroyIVrgSK27GsojxoSTWV0tSjaTzNjffl4FHTH5IbELLR+RHbWWeTaFTYZUuDIdDMmEJv7FoEYIaDXN5XDfDY15HyTg+D4NOE5wZuNW3xCCyL1ik0NmSzMTpqxSg/JXU6qeQq4MmrEJ7JFtBfK8fXC14aeD0M6aHhIFv+wWg0gxy04fxfGQuORuDG4P4jTFwKOxJJ1llEoscQ+sVav9GgYKMwGrI/2dD8pBiVERGhGyYdPhSNmazIWsWPfE7ZCMVr7MrUXAiGU4QxcPsaMasmcNXwReDyxrkcYbip00iYvDSP8A0+oQ+mjwxVgFjhW3WQ80bWmAe+yqQ/uDyoUmPFKZS0QbyOw7QaoN4RfSiJ6KwjHhWZ7HbgQC0Pgtcj4KKJyycNuDDZ42JGkYDSacFd198/oxzC1TINgbCYoOYQybG4pGSQ23KY+EEc7Drkp3nA7WLYn2DUxs6Ml9B5b4X0MwIRps0HxWhiEBrmyZYvUJwJx3+EcKjH0Zg0PyK7xMtAjbdVwWyGwf8Iygx+jI1GAl1ljwNof0NoX6HQZwpe3sxzj2S/YhK1Ce7Q08irehXP8AsddjR57NR6N+UFg+djTekI1tMZTTKGoYIpLIxzIQ34PEZDPIH3tBUebH9ryMDy8P3i03g8wwiT2WB3TMh4EZHMrya5NUZewsFPi3nsRdou5x+0P6DYohpwnwZjCj5jFkS5IRUDUSsNZIf2RQz2afAFkSrG64E8vQsR0Ku9Q37N6MlCl7OziNjY76MrohKMceA6aJ9GR1RsmNvpHYEvsQMbE0RDVti+ENmCNGHSRpyhKmrV+RHTMVwRjk8CUp/wBjCnXYglBEwZRka5dhPDRiwhM0ayKEwsVRvRJeCYCZnhWUKQF6QzD1qV8NCFHTRuGITvSGTsZtdD2BPgaYwxsDJuhL0GsMjFd2ma8ofVipH6I1mkf4ItH4KZHfoTLfYF9V+EObyeYwVpv7jdUFP0n2GHngWMzOxA1W7Fo2LG2GnQjqQtPgyzEDtgadwxJkfQnP2JIyHR7FqHIT7F+RP5HvYpdjFmCUg98DYKJmh/bxHQ/QWCPogpMAU7bn+yg08Fwkhl6FTPjsJZNhOA0JAOwRU9WcKIUFs2+CPoaFEvkoNYMBTDXZoYyCQFAThkIa4GHaHr7FayyHiHjji4L4H4cibwMxHeorgwI0K2SPIiSiKmVox1fRgH4y9TBUYGFCmsMvdGjop6iqF9Ef0J2kAewXIgmMogiYWCOCQ1UfEytpeCdjMj0LS1HkmjFliFmj3m4Fw7xYuT8oY0c52NuPDOJoRxkP/ooZMKmkIVvRsG88gw4DG5nW2LBWMce6JDFxmUYiiTTZa+ijaaZ6IhshKG4jHHZdSPtyo9djezGJGI1eJgnDFHdwWamqShCMqpcSsLA9wTY8QQxZGO0xcBRkSxwp7FkcYy4jKhYbKPghba7FkJFdBcsFej8Dc4IQRpI8xFkw32ODKNwhtkexZcWhSjcbw8l2PpGyg7P8opHjPyKywgRhHSFC1VC3wgb+BipFyN0N9jLyMX0IFeWBc0ED6KXSETEuie2V7Ea7LhGhNDv4I6ZWfQdTj5NwZZor8nsNNn2KXhE9+AE4JxCBZdjqNGKMQ8vYixmcxF7ZBY6nGCjZ8MQV5UQ9hkY7ERvPAeaIddmJGz0eogmdHRM0Yq2hXXIV2+GOhSVYfLGGyMZp9i+yi1zR6GuUXgk00p5zKt29iPCSoZSXee35GLMSfjxCCaP2/wCFfgZU/QoVOzzKqwRvpiY3gyRFkYlKVGmzaHeIvV4PRDpQnZDXCGvf8EtwYBjHwxPZmT55S42XInwmN8Isk9uGvhDvBEW9jECSSoywxMcNqEr4rU2SIZ5RFYST6GnSTMmkYJ5zwRJbHrlPUGxS0NYCKlJOuMWwzRqH2zPSETIowMXhj9RiqD51mbJLfI+xsMJ8jQwifdgijFWPY6YhKwab32NSTC2IHeRyaHKZOqDMdoqWBlgYFtDThS0H0aLg2ATRa9jvZGIpMtCcxB10hex5KYHoGvh4EdDAuBsbghhohkUEMv0EaHeqnRDHGNyHAmSiX2K21I1GR5F+SfyaN0sWilmstTRfAJLRTlOjU3RpYd8ITd6H4R9hPzREswRpMeIzLQlHf4kNgY+wvY9p7Rex7z2m51RSqWkSMm/ZsGOslOB4JwtJvDcXYUFNBM1hCq6E6JcFsIScbR1IdDQj2G+sgI1g8VwN3WT7F6eCyjNGR8JOHYtC1yL4G9oid7KFc72NiXlHla4xzTIGbMR0nscVFr7eDywc0K06O09GZ7PZHgeUE7TJ5kjZQkjIzctiuyCfoYWYhKTgncCdoRuodlXOnOtgNjH3PufYZY+xyHWD0KKlzaxDZDQwQU/BLwpUetDN2vie6LRglH5UKS2QVRPB4DaJHl2K+BSOFOwZbE3ZHhEdsGBUe0Sz2Y/Q3CGhkxC+ZGhaDDY2PgYxh0SYw48n7EzRKIZClsNXsfs8oQLhBeNJwesblbUvVFs68Gm0KeFPo+x+CkRoOdQ0MhNRKMjJ8hFENM0XaltwURvA6EH2I0KMR0+uDjcvg2M6EltGLZXAsuEVPUdSGDYpX1DWM0x1lSkRA2UlMDy7MO+OuhqYQ7H2o2Q2S+zxOGl4pEZ2ZHyW2GdscgeWCB4FNw/0cm3wezfBsS8pHQynZQXshgo98NpPMBb6HmDhiakFWh26wVb/AOSCEbHSuvyMns2oJZtHsENfY9J0AxraHYQbjz2ybgvsboNztjs7Ptm5Giybhssh/wAOGw9jGUY+RsReOSXJEPcmPBTeN7l69meAbyGqKCVqJ6E2lYJfIxoQMn2hPrgqeSEdZ2A8OxuDo+/KY6mbaxwCWhVDMo2za2TH/9oADAMBAAIAAwAAABCRSySACghSBiShDQRxxCChhSASDSRDBAhjzRAhjQihgTBgRjyhByyhQBgQiSAxyTBhRyyAwBBjSRxhzwAyTSTwRiiihCgRSggywSTAAhDhDyTxBDxRTCyigRBgBgAATTihwBSCBCASDSxyyxhzTihiDCSCzBCASRRTAShASCCCAQABxSRQghQwjgwxhAyjACAyiTigSjAByhACDzBBRTAwCDRzCzhijhSygDCRyRgiwTTBRDQRyDgRCQDCijCggCTgRghzRhTyhBCxATxwhByADABQQAAwxwgwjCiQjAizgxRRgCRADhDgjwSAjhCzRwAhzxSQRRARhQQDiwAAhBjiDDggjQDwSyhygDRQgSCSCARhTDxSDQgxiQwCDDiACCQwSjizhBQiggSggQyijBBRBDihBRzRSRiAQwiwQyAxgRgwyCxwCTCgRSgSiRwxjDABCiiyRwCgBACxjSSDDBxDABhgTSAhjCTTwChTCgwBAjwwQTjhCTSzjBiADjyDiCxQggSQhDAjDzARwBCADgzCRwiAACgggCQwgwBDwRDAgRCQBQwTgAiiABhgRRSQByxAyBQBgThBwThjTRBgATgCwBBgASQjRBCSiCAQRAhDBgBjiRgD/8QAFBEBAAAAAAAAAAAAAAAAAAAAkP/aAAgBAwEBPxAcf//EABQRAQAAAAAAAAAAAAAAAAAAAJD/2gAIAQIBAT8QHH//xAAmEAEAAgICAgICAwEBAQAAAAABABEhMUFREGFxgZGxIKHB0eHx/9oACAEBAAE/EHAgPguEOuGEDz41gYmsxMB5KkpKKjFR0lYb7jDcHWpYbHWd+5iq39zTI6m0HxT/ACfn8w/qNAK+4e/uYmJz0zDIcAhEJIa8MJmg+LIEUWbeVjXgPjJdwYLiFnMuD5tMSOLOPChuG0nlWMXhhWvqPxu64SlWFh9Tms4SHqVhOqf6hfgrIdzcoNyq2E1doWCB1x9k1n2vl9RAuLuWyol0qh4kzQhnWDLow8pWVlJVDML/AABZOYLGwZcWMrosvw5oAtfUKCGsbnZQccmdzL7SmcEA5OUVeQ4ivN+7pIOp9cCfEZfMIYBkjbDvzLUKLiK0puOkTvlxFEuo6hm4sRpfx9MaxajmpfuAly47hghcvLg+A0wR1Dw6JmmCUsDlCTUMuxD6Xyyy0cs8TdSwcD/kuUbX45fMDFvrG+rhGEMTL+Jdv/I4c3C+PuXhL+5+EHmMPxD3LtwgCrV3L24dVMbrHOqOhjtuXXHsmkeY4cXGM8fCIF8w8FeDBCV4Gp2SxgY634F1MyZpkYPfEaES1i8gM9EI0ql+/mK3shoI7XLubWK+wyvLSvUNBySi8Qq20ah29mjDH7T+UY0P9Qr6MMyBOqSHSua9V4HZNGOPDHnG1GEVLo6jLA+F8Jp/AMuEXL8CMcxxQluPAx6CrG9w8OVs6+pmqVU/4Tk4iyg4O4P4AIptDTWQByj6hml7jBh8nJ8RSxhcOnPcJdw7+TmUwpCj4xjZFQ2SXHsiWcLCBEU+GkbwcRYjbyFiy5cKDHiXBqDjwtvxJylxaix7rw3NRcdlwr8MZZw4i+rBxcK2qLRDJArVyiAOEtIdjBKwXcLTXg18RGPhgvyX/JtaqPMcigx+ITtmxiTfEFjZhIlyyPc0YsxiRceAjlxEWeGu/CwqDBl1LOpbC7uDmNcRpEIqeKQZDDAYkjnX/wBj1wWhqc2Df7zKjBKmGbfhOKSYUTGcKSHAEsZeU1DUhHDMbkVYz9kseY/40rK0n6hHuiWlR5IupZI/JWY8MzVNJvHmOmc3B8FgW1GH8Z1LzF8D8aR5gKlWpeY4gPrtgaRYJMnQmPSJ61gO3Y4i83Sgrl6q+bTdVcMo+KssHPBKzK8szF//ADREvtqAkbQCNLm0A0Md+NOsoTsQDdOZ4Dw4jN78Fm2H+W4MzD+F1DPCqDKdxaLdTFzG+5q/xMhCwYWbQXXGambyRzlHUPvE+Z5mVw6yyQWZwY5+5eqrpJczGwguRX7NsZtqT8xXKahxKimMzJXfDw+oSsBqAWmjNy83KW8Tx4Pg8y4r+JDgO4K8wqXLi+OrxAmeHvwvaGksdBvXCEvOBx3bcOKo7TNBZKGIUafyl5cNXG6yWnAAsO3cvVCxjJMh23fK4drY07VK2Dh2fl4AJpe0/ExvUauYj6SOHZbJxUH3FsCaV5WFgWBYmOH4VixPHm5fgxMUEMG2XRLItSuUkKHMmJWX4lxoaQeeBi+4GUJvq0GEcLG84Ja8KvEL21Kt4FOWfzCZ0W/Mrkme7fMvFEx0YS51sRyt8MdGlsbRltoC68PMA5zeI5hQJs7SINHNQ02HrzCqBdG/qF4FbbZjUl6xNRsY6irvw+bIXLeBuFNyg1NZVKh8zdzF5M0Z7omBGxXYoh8MaDhUr3A6sdx8hKCalEZNaorYPcaSiQamGWLw9ypuOZlP06Rye496BOrmIAUamci8RiVQldwvvdn1cXj2yU2Jl6UDB4a68Th1Lnw08q8S2XEhUFwMw1/Eh6jR5YHUI1EWJhuIbaCj0lr6UwvF/wBTmsTkyf8AZnTpFt59paiTh1CAdiUQfUryRc8eyBS5txMX35iAeZSvuKVvI8kdQwrFwSmhHxEeQofIQopDsjfomKMCGYQ8xaYvmWLLdwbl0zH4n3lRxEVKyWCxuJZnNWV6jsqYwlxykiTubwF7JczY/wAyRTIpjzvphgYQHD6hdi8rP3LJYJRHs8j6hMd6iiphGW7eYjfKc56emyGmBL9MT8CxV3BNxKX8rNbFq8DDZx6e5tdM/CA5A3ogWlxxYscR3LbloIhYJSoYmYRLJUMwCCRI7lwlRUbMwGMuLHDbVuIt/wBpScbo0+45ziP5jeEcrEe4oeVhlz0mfKtYY7GhuLFY0lwwHUITCX3kjatU/wBS5lRb9R1uniG5T14iBf0BipSPaEl0Fs/8sbAqnZergqs4RXhLjLrzMqIuWRS5csJQI8QyxAmkxRYsxSgnPHyqOWFRl9OoxdJKOFt0jiYGHZ9Tla89sUazm6k+ZZcNpH7YasXkLV9z9Uxi2kahSC3/ADAA6RD4OZiOWkX7pcgCoJV+1Rqh7dyq3BqpS7Avf6MSeG9xy+Vbj/IEZUTZFnxbxypXwUeJhZ8DLX8D9Md72bE6mf5lcblhoGpAEx1olvknkBd9JeOtRcwWSEWbWzMtO9iqEXQM4litk3AOgy/afb5C8Cio0jSUAopr2x4AxGbeNZzHyx1FjwuO49zaOi5m8V5jfhrHiYpdFY06AtmNABy79QG9wftEbkcQ7guVppznKYqEHKG9pLUSIuGYCSKu2pXejhuFeU8X7X9QuYaOTRq3uZyOK0nslbVTBDObwhKwc7Z/9QR2b/6S9YnufMNwEkP8wwiDqWxpVFmOLPxMWPGI4WOOLEWMOOSo2vOfzFvov9R6MZqHfwL3LzUVWVXB1DHJUfuHOxzC2MGJsgb8M5Ae2Q32r3xAtWqm3tXKub8EWnCpYoXZGCKqh1tqhjOIDq0peLxHT4ZgjHDycF4kTvL+I5qYbK2xanaNUfEfcYZNzMl1uMV6dw6Oa5i09TM0YMHywR6BbGNoplebBiL8kbfDOY/8Mjh/8y7bF4uv9Y7uVJ0alnwhiupViAIPiK3lGehEAZKj8IKYtQk0m/jeX4VMqxHGIOZdHjwPxHeI4jlnF4lmRcblEswxQDvRpj4BczWObIyWly6Fm2FfSc2xl+uGpgnqBlWG/UNcOM9nomzQ/i2sOBVUcj/INTWI7jhKlZHRwvUSxtBBajiTzOIX7Jc3Al4NkTjSOWsmoHh58m2WhjxDXjcSwzFHmY3FjqNnwXNRYrxyx5eE1iZ7lB3FJsh+oweUrmI8GgOZlNS8g6PaV0Z9r2sv/pnHUY7KM/MoMDDM9RaH8QBTHUMrIVJMLM/EfoZzK7o2+IyGIh2Js4SWFy3Dm/nMPYdRe/cTbfnaVKhlRguVGMuAk7nPw18GyGo7ZQTJiq4AZ8RGK83HV5wTf/1Hc0qZUxTiZUqAyPR/2cDECF6geWrzE5qv7ZdmV3hoDLxMdTNsrqGnUVyAu/iLbxpLnB2kBhFLKhpUJEUeqcr5ZeDc/Ed4My+KLgVzvDXcG9eGj4Y2XMUpTFcvSZXC5hmHwqJszaDExnK/Au22BV0lddI4shF/EHsJdOWb28zoQinCCze94CK9P4dHMfh8IEU2cx6qIYlNnPUVrqyhskIhYdwzhFytX2RvnLBqtLwygW0YdViLLDxU9o6h9YGGblhhQMU0u0UJnCMIeBtqXo118Q5ZRFmOi5dEXN4sRx+CxhDIxBywLyX5YdyBfK+4DmBqZCOZu9lh23bC7xqVpeiXvVCfgwRbdwsOLJVOVmitaPiOEoRqr4IIQ7YZLSXHBWobeL1OPOp3BzOUeDANEvcxqHVyznHUbGnHk38axkI87q9QeFzmMYWIYVRcR48WeZKhuMWLWzCEtcM3+oU/MRW4ztqyMLMfSbPctiertWMk5Ee+9Gg9kYvQiCfcs3qTcxJmzKrlZxYgpsnyFTHbguWXcuI6W+YXzs/UNT3MKO1wNwIFuepRAUNyoRZ5jHU8zPx7zdNZeo7l5eSoSLeIDEYVKjTMeamMPFysY74hgj4UuLgc/OpQADGMgrW+HuE6OuOu4hL6mMmM5lnahR+o1btM0i7GoBzhzC84rUNq1Jj2LUZ34sEIqd8EZH9sEL7P/I7qoGrnMpXUKN5e4XN5PUOG3bMQlbjS/U8OszZu8bWWLmK3wFsNJVbULVjlJrmYJghz5TtomlviVgkHYE7v58Qu63joiS6oHL7mM45meZMD2IpTgjovSV2hUiNQGa4mXrm5UMN58eoKrVFQc3qMxCzRMVgYUSHlCuYwEMUYVLbXz1KoaOoa/LmGtdNwi/k1xwYkFJzI0CtkSwInLK/xLPBiMzNqJQ+TEqJuhhRbBNIUoxUMcgQNQVazub5QW+Jf4sH3L5nCPO0lhMjm5tl57KgprIhHghprE5MkBN8scfKw42WQurxMyqQ3pMQQwvAh3FEuKzDDgwzjKdzDd3iX7+k2ddHjqyAXDwwKjLXMyCEdd5thvWUfcbDTZpYnEQ8YTSk4w8scOqJdExcYQTACFCET7zYlWOaWKyzLm9r3BwcHkiFXMYUYQiedyt3FTZNIxSGpC2IlKT+8xrUS3FtZKqUjkqO+1uZwtUrU+FVrlqEXAkUXIaJlMDzAbuYBeJzBWFGE8dPgUOb3vaYb4WEgSR4lRoPPU1W9ukJkSPhtCC/uHBFX5Pue3QTIYaMzJ4tjXE+DRqMu0SzE4D9RhMmpxiZ8anXFV1ruNBrNSzQjE6cypeiMP5hJwSN3K4ZTGUSjo3MI9kCNA6dyonKNXlxXLDS8wktjKzZMJLoYexpfUsAM1zKGUXiOBxBub0zF5sPcwyMDyjuHXppIA/0KWItzOQQ5hXkHeaX8ktwo1ocVowhWpHWyt+BQrxOMueZ8YsqEDWEjDR3cybytqxSdFv4g3VtF0Yw3yzH9JmXqGjqiuNVxEKGHPMqHJDexxUShl89MqmkZ+/E3AQQHCOwQYOm5cSnqYbBW7p3KjTbmBWYG8wcS+Mawk7SiYFwPpGpQ5QQ2keWDP0VfUQqA4sh7j4u1C2YMyzMfiP8AoLmOImbrwYyye4DL7jgJfEgwfgfqI9GIZaEu7xL9JBhO4g9JlPRqUMYEIprMqqRn6TEnc7NjKjonM2MBzmKxOLLaS6Dapll25dBzNRDcdEGytS6Wyg4g8ZRiXExZirCIFk+ZjkGnVxNVRmoFcXvVzNIFXlArrlUFaBB3khpyZZDqXuZQUkoIwyYKHuFBQmSLXkqBuHiZFpcKfMrs2iATSFC5SgN3GIrKYkjhcEbDoxKmpCOg9EP4R3MT00x66JjwVwhtylTlMVFdx1VhHvBgUXgyeAy5xGlXLpaDZpV8YriRC55uMWF6qB3SonENWcmEx8Y12jMY4vcZ2yCZX23LpAyjDFWQUEpXhvCNQoe2IvFClU27lAAh/R6jd5fMNtyMwClw+VTcKZxCbTqGTELWiESWRG7IwOSXd9CFw7cAqtrl8hBqCNQyyGYgwhMS/wBTaUhmWgnUoIZz1EnuuJU2bMK2rHEvdTjsNh3CG0LpM2ae4XFR9ROu4E2HG45Wks+ExDOqP3wQDlmEAxxp2TK6jbUgRczWEnOBjeFr3EQZtCIqm0tXGUoMGYEHmIOdyxi1DphHZHcdLWRFbLjcHFsqZYImMLlkVXh3mUZaRMwVNSgaDuO2Mo8HqM/3UE4SEwI54gK6ao6lwST24EmcFStJSxDUqgRm0wDqEqoKrRLFYdWmFhEGt7fcaFEcjHUApBAOURSSVmSMt4dwtLEBwEajIG4j/aGDY7hPtIKDNfMrfOiFO0mRUqjwUagUSnwADmBklMGcy3FJtK/TptE/MXhfqXfBhuCNq4Uh8yWVfzYLNM/uamv7CVdoyncr+KE/FAWbj3UU4CypnMflA64lUupxFP04hLjCMb0YAzbvGJY7wqZ/5TgeZnXtBaEGMhcQLBMJgjQozFdDLnqYuOrVxuJ41bgMkSmNfcLwVRao2xuKywgy9VxKxaZWrio48CVALIgcjgRigAcrO8j70y1ttUIs9zgZZLDKHEpzMdhKXqFCbvB4meY5GYN8XO0Lw3REroguNI3KbiNnDA4vj5hMzYgW/wBIXDJGrH5RNh3cB3kgltkCx0RFw3cDBp8RW+kR+KN8BlzMJdoZvfuA+Ja8DJdgy5lcXE1x/kz+76JgENmGERTGvbDRD+D9zVwlwEVN9QkfcYSHL0Ru8YvbssJHv1MAg6iuADHGaJfWdJdOiMLjvSOA1VGX5VzZC4WVbbEEKYaX3cqa2uZnM7iKyR2O4p8po8QIGiMHQqIcHjlxKpmZQ0A9SxWLMQwmsEKZf4XzFFsE1Q/RLXgj3RM+g0Bu5VK3T9sN0K4wUptn1OFW+4tJWmhBaXtYUa4g8vcIgbb9oh1zEJsuJFdxHR3D1gOY6swqWbz9QY0UtmMcIZcxcstRjNkbn2x0jD1L3ZMwojxyLzLTKKm/cSrYrY0S7YbvFU2UUXQGdE4GOOWYgZIoWWAfUOYt/wBFSxJktwXua3Kpv2K5hgWINQ9oATmGNYS5ghEPsuNAYXC4yxBtQg3E5+TLKqGHYErrkgiJvGyhBELisMuXLCGk3uuNenqGmj4nLVxtUu47cTUtnD2dSo2iWyggtWVN4KfjylbAQMARUxYMlM9MvMB06glV0LTMSi/d5TIPMZmOE1pcsLiRDMW8o+5xHQ1Zn9Q86JdDBmJe5c5iUvB9zpirj2UgXdkwkMXuWBkQV7MA7UKx2zcIn3iVqYRmKrIdE+UPEtfMKWah0ZIAXiASZoYaQxaY5lS8END8EcUNytw4AlSM6ihUUFldxQo16LM4Fth1UVa4YRa3MKtJfSdkJj6ljA60EX1GpE7wvZDmHhJ0y/UOlvBW2pV4m+YBLyqEc7I0aRqsLd6oM1jcAY2iP2ne0UQEMED0Y4X9RsYJG0arBTcsHP1LBwwDujZwMaWAShUmVol4fWQH4SGHiVcCCGkMRyHYjogofMuLDqncLK231iKq5ZQcqYm9mq6RTzUdwNULDlTIHtjaiLooqmFKWXbR2olcznKVPgwS/DKyFWyAnYiDKaAUKjB4lHqS22XUqC07nurzLDsQo5ErQOY2glPMobUXxG2/COhYyoMFIRLoh2+klV9dx/jPBV5+zGvgjGEFYh27+7xEbiMhjM5EYXmFcEuYTf3CdnS0a6Y4I9c5H5l8aI99yzGGQM7iaFSBnvBmnJYDTeBGVSwtHWyWncMtzVoZe/chOvEqCswolzAnE3l40dT31cSrArOpesooWRMLBzBUoDTLqvMCvh/qbzNMlRZceIm6lUYwkczmO6yQ82KyI0+zFeR1ZjNBs4D4D7vD8dwaTHGtPPuWzTdjku5lj64gVziGa89MQsQPyRIztBcDLEhZiN2ZmLAAaMt9hiTVrWMsYclvctqZIoUbgBwHhCB2IhPwR53biZvdgsDUK8HkR2ev6m838L4WiOGowlW4PtQUmQkFEdwgmKWD6l7AxCUgAMo1sdQosCnWXLXuHUZiDgRrqwQVhIqVzfcsdOobKd5l1bHKGEGVZ6YwRwqPMMbshE9KZRBa5b0OY3PKK9eibrQRZ6XAW7R8M8wu5gcxQBsNxrVeIDauIRsxiNDS5/X/AKivfk7x1EMqzDU5sWIWoi4q1C4O5r4KrGRgdzqE6rh4WrQGizLU2GvqVo6mWnUM5EsFcJSWVz/YmCwMpPiMXgIqC2vqZfjFBsY5raOZow0vsz7yK6hakpLdxCzrh90qaUhowOZdZMQCUNoQQq3jqk//2Q==";

  // frontend/src/utils/theme.js
  var APP_THEME_KEY = "javjaeger.theme";
  var loadAppTheme = () => {
    try {
      return window.localStorage.getItem(APP_THEME_KEY) === "light" ? "light" : "dark";
    } catch {
      return "dark";
    }
  };
  var saveAppTheme = (mode) => {
    try {
      window.localStorage.setItem(APP_THEME_KEY, mode);
    } catch {
    }
  };

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

  // frontend/src/utils/localScrapeResults.mjs
  var isConformingLocalScrapeItem = (item) => item?.scrape_status === "found";
  var FALLBACK_SCRAPE_REASONS = {
    recognized: "\u5DF2\u8BC6\u522B\u756A\u53F7\uFF0C\u4F46\u5F53\u524D\u9884\u89C8\u672A\u542F\u7528\u5143\u6570\u636E\u522E\u524A",
    unrecognized: "\u6587\u4EF6\u540D\u672A\u5339\u914D\u5230\u652F\u6301\u7684\u756A\u53F7\u683C\u5F0F",
    not_found: "\u5DF2\u8BC6\u522B\u756A\u53F7\uFF0C\u4F46\u5143\u6570\u636E\u6E90\u672A\u8FD4\u56DE\u5F71\u7247\u4FE1\u606F",
    failed: "\u522E\u524A\u8FC7\u7A0B\u4E2D\u53D1\u751F\u5F02\u5E38"
  };
  var getLocalScrapeIssueReason = (item) => {
    if (!item || isConformingLocalScrapeItem(item)) {
      return "";
    }
    const explicitReason = String(item.scrape_reason || item.scrape_error || item.error || "").trim();
    if (explicitReason) {
      return explicitReason;
    }
    return FALLBACK_SCRAPE_REASONS[item.scrape_status] || "\u8BE5\u6587\u4EF6\u672A\u6EE1\u8DB3\u53EF\u522E\u524A\u6761\u4EF6";
  };

  // frontend/src/utils/systemSettings.mjs
  var withSecretPlaceholders = (payload = {}) => ({
    javbus: payload.javbus || {},
    scrapers: {
      ...payload.scrapers || {},
      javstash: { ...payload.scrapers?.javstash || {}, api_key: "" }
    },
    webdav: { ...payload.webdav || {}, password: "" },
    aria2: { ...payload.aria2 || {}, secret: "" },
    pikpak: { ...payload.pikpak || {}, password: "" },
    pan115: { ...payload.pan115 || {}, cookie: "" },
    magnet_health: payload.magnet_health || {}
  });
  var buildSettingsPayload = (values = {}) => {
    const payload = {
      javbus: { ...values.javbus || {} },
      scrapers: { ...values.scrapers || {} },
      webdav: { ...values.webdav || {} },
      aria2: { ...values.aria2 || {} },
      pikpak: { ...values.pikpak || {} },
      pan115: { ...values.pan115 || {} },
      magnet_health: { ...values.magnet_health || {} }
    };
    if (!payload.webdav.password) {
      delete payload.webdav.password;
    }
    if (!payload.aria2.secret) {
      delete payload.aria2.secret;
    }
    if (!payload.pikpak.password) {
      delete payload.pikpak.password;
    }
    if (!payload.pan115.cookie) {
      delete payload.pan115.cookie;
    }
    payload.scrapers.javstash = { ...payload.scrapers.javstash || {} };
    if (!payload.scrapers.javstash.api_key) {
      delete payload.scrapers.javstash.api_key;
    }
    return payload;
  };

  // frontend/src/utils/automationTask.mjs
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

  // frontend/src/utils/historyRedispatch.mjs
  var normalizeSource = (source, fallbackSource = "") => {
    const value = String(source || "").trim().toLowerCase();
    return value || String(fallbackSource || "").trim().toLowerCase();
  };
  var normalizeLink = (link) => String(link || "").trim();
  var selectHistoryRedispatchResource = (record, fallbackSource = "") => {
    const resources = record?.failed_resources?.length ? record.failed_resources : Array.isArray(record?.download_resources) ? record.download_resources : [];
    for (let index = resources.length - 1; index >= 0; index -= 1) {
      const resource = resources[index];
      const link = normalizeLink(resource?.link || resource?.magnet || resource?.download_link || resource?.magnet_link);
      if (link) {
        return {
          link,
          source: normalizeSource(resource?.source || resource?.magnet_source || resource?.download_source, fallbackSource)
        };
      }
    }
    const links = Array.isArray(record?.download_links) ? record.download_links : [];
    for (let index = links.length - 1; index >= 0; index -= 1) {
      const link = normalizeLink(links[index]);
      if (link) {
        return {
          link,
          source: normalizeSource(record?.source || record?.magnet_source || record?.download_source, fallbackSource)
        };
      }
    }
    const singleLink = normalizeLink(record?.download_link || record?.magnet_link || record?.link || record?.magnet);
    if (singleLink) {
      return {
        link: singleLink,
        source: normalizeSource(record?.source || record?.magnet_source || record?.download_source, fallbackSource)
      };
    }
    return null;
  };

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
    const id2 = String(template.id || "").trim();
    if (!id2) {
      return null;
    }
    return {
      id: id2,
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
  var deleteLocalScrapeTaskTemplate = (storage = globalThis.window?.localStorage, id2) => {
    if (!storage) {
      return [];
    }
    const targetId = String(id2 || "").trim();
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
  var fieldById = new Map(LOCAL_SCRAPE_NAMING_FIELDS.map((field) => [field.id, field]));
  var separatorById = new Map(LOCAL_SCRAPE_NAMING_SEPARATORS.map((separator) => [separator.id, separator]));
  var separatorByValue = new Map(LOCAL_SCRAPE_NAMING_SEPARATORS.map((separator) => [separator.value, separator]));

  // frontend/src/design/integration.mjs
  var designDataExports = "\nComponent.data = { MOVIES, MAGNETS, LIB, CN_ACTORS, CN_RESUME, FILTER_DIMS, ACTOR_CATALOG, GENRE_CATALOG, BG, HISTORY, TC, PRESETS, SCRAPE_ROWS };";
  function adaptDesignScript(script) {
    for (const [key, route, method] of [["cn", "cinema", "vCinema"], ["d", "dispatch", "vDispatch"], ["tc", "transcode", "vTranscode"], ["sc", "scrape", "vScrape"], ["lb", "library", "vLibrary"], ["au", "auto", "vAuto"], ["fs", "storage", "vStorage"], ["se", "settings", "vSettings"]]) {
      script = script.replace(`${key}: this.${method}()`, `${key}: (st.route === '${route}'${key === "fs" ? " || st.fsAdd" : ""}) ? this.${method}() : {}`);
    }
    return script.replace("r.res === '720p' : r.res === st.lbRes", "(parseInt(r.res) > 0 && parseInt(r.res) <= 720) : r.res === st.lbRes").replace("const dm = LIB.find((r) => r.code === st.lbDetail);", `const sortField = st.lbSort.startsWith('\u53D1\u884C') ? 'date' : st.lbSort.startsWith('\u756A\u53F7') ? 'code' : st.lbSort.includes('\u4F53\u79EF') ? 'total_size' : 'added';
    rows.sort((a, b) => sortField === 'total_size' ? Number(b.raw.total_size || 0) - Number(a.raw.total_size || 0) : sortField === 'code' ? a.code.localeCompare(b.code) : String(b[sortField]).localeCompare(String(a[sortField])));
    const libraryPage = this.pageItems(rows, 'lbPage', [st.lbQ, st.lbActor, st.lbStudio, st.lbRes, st.lbM, st.lbSubOnly, st.lbMissing, st.lbSort]);
    const dm = LIB.find((r) => r.code === st.lbDetail);`).replace("rows: rows.map((r) => ({\n        code: r.code, title: r.title, meta:", "paging: libraryPage.paging,\n      rows: libraryPage.items.map((r) => ({\n        code: r.code, title: r.title, meta:").replace(/const shelvesByTab = \{[\s\S]*?\n    \};\n\n    const chips/, "const shelvesByTab = {};\n\n    const chips").replace(/wall: wallRows\.map\(\(m\) => \{[\s\S]*?\n      \}\),\n      heroTitleSize:/, "wall: wallRows,\n      heroTitleSize:").replace("const list = this.visible();", "const list = st.route === 'search' ? this.visible() : [];").replace("const dm = MOVIES.find((m) => m.code === st.detail);", "const dm = this.searchByCode.get(st.detail);").replace("const magReady = list.filter((m) => m.mag).length;", "const magReady = 0;").replace("const rows = list.map((m) => {", "const rows = this.pageItems(list, 'searchPage', []).items.map((m) => {").replace("actors: CN_ACTORS.map((a) => {", "actors: (showActors ? CN_ACTORS : []).map((a) => {").replace(/const films = LIB.filter\(\(m\) => m.actors.includes\(a.name\)\);\s*const latest = films.slice\(\).sort\(\(x, y\) => y.date.localeCompare\(x.date\)\)\[0\];/, "const latest = this.latestByActor.get(a.name);").replace("let wallRows = LIB\n", `const cinemaQuery = (st.cnQ || '').trim().toLowerCase();
    let wallRows = (isWall ? LIB : []).filter(m => !cinemaQuery || [m.code, m.title, ...m.actors].join(' ').toLowerCase().includes(cinemaQuery))
`).replace("filterGroups: dims.map((d) => ({", `filterGroups: (isWall && st.cnFiltersOpen ? dims : []).map((d) => {
        const query = (st.cnFacetQueries[d.key] || '').trim().toLowerCase();
        const options = query ? d.options.filter(option => String(option).toLowerCase().includes(query)) : d.options;
        const facetPage = this.pageItems(options, 'cnFacetPage_' + d.key, [query, st.cnActor, this._facetRevision]);
        return {
        query: st.cnFacetQueries[d.key] || '', paging: facetPage.paging, empty: !options.length,
        setQuery: event => this.setState({ cnFacetQueries: { ...st.cnFacetQueries, [d.key]: event.target.value } }),`).replace("items: d.options.map((o) => {", "items: facetPage.items.map((o) => {").replace("      })),\n      sorts:", "      }; }),\n      sorts:").replace("const o = st.scOpts;", "const o = st.scOpts, skipped = new Set(st.scSkip);").replaceAll("st.scSkip.includes(", "skipped.has(").replace("LIB.filter((m) => (!actorWall || m.actors.includes(st.cnActor)) && d.test(m, o)).length", "this.cinemaCounts(actorWall ? st.cnActor : null).get(d.key).get(o) || 0").replace("gb(b.size) - gb(a.size)", "Number(b.raw.total_size || 0) - Number(a.raw.total_size || 0)");
  }
  var ACC = "var(--acc)";
  var OK = "var(--ok)";
  var WARN = "var(--warn)";
  var BAD = "var(--bad)";
  var DIM = "var(--dim)";
  var DIM2 = "var(--dim2)";
  var id = encodeURIComponent;
  var sourceKey = (value) => ({ cili: "cilisousuo", yhg: "yhg007" })[value] || value;
  var toolName = (value) => ({ pikpak: "PikPak", pan115: "115 \u7F51\u76D8", aria2: "Aria2" })[value] || value;
  var runStatus = (value) => ({ running: "\u8FD0\u884C\u4E2D", success: "\u5DF2\u5B8C\u6210", partial: "\u90E8\u5206\u5B8C\u6210", failed: "\u5931\u8D25", noop: "\u65E0\u65B0\u4E0B\u8F7D" })[value] || value;
  var toolKey = (value) => ({ PikPak: "pikpak", "115 \u7F51\u76D8": "pan115", Aria2: "aria2" })[value] || value;
  var names = (values) => (Array.isArray(values) ? values : []).map((value) => typeof value === "string" ? value : value.name).filter(Boolean);
  var size = (bytes) => {
    if (!Number.isFinite(Number(bytes)) || Number(bytes) <= 0) return "0 B";
    const unit = Math.min(4, Math.floor(Math.log(Number(bytes)) / Math.log(1024)));
    return `${Number((Number(bytes) / 1024 ** unit).toFixed(1))} ${["B", "KB", "MB", "GB", "TB"][unit]}`;
  };
  var stat = (label, value, note = "", color = "var(--fg)") => ({ label, value: String(value), note, color });
  var safeText = (value, fallback = "\u64CD\u4F5C\u5931\u8D25\uFF0C\u8BF7\u68C0\u67E5\u914D\u7F6E\u6216\u7A0D\u540E\u91CD\u8BD5") => {
    const text = String(value || "");
    return !text || /password|secret|token|cookie|authorization|https?:\/\/[^\s]*@/i.test(text) ? fallback : text.slice(0, 240);
  };
  var imageSource = (url) => !url ? "" : url.startsWith("/api/") ? url : `/api/image-proxy?url=${id(url)}`;
  var jobStorage = { scrapeTask: "localScrapeActiveTask", scanTask: "localLibraryActiveTask", dispatchTask: "pan115ActiveDispatch", informationTask: "localLibraryInformationTask", cleanupTask: "localLibraryCleanupTask" };
  var taskListUrls = ["/api/movies/transcoding/tasks", "/api/automation/tasks"];
  var jobFinished = (task) => task && ["success", "completed", "failed"].includes(task.status);
  var informationSummary = (task) => {
    if (task.status === "failed") return safeText(task.message, "\u8D44\u6599\u4EFB\u52A1\u5931\u8D25\uFF0C\u8BF7\u91CD\u65B0\u68C0\u67E5");
    if (!jobFinished(task)) return safeText(task.message, "\u540E\u53F0\u8FD0\u884C\u4E2D\uFF0C\u53EF\u79BB\u5F00\u9875\u9762");
    const result = task.result || {};
    return task.operation === "check" ? `\u8D44\u6599\u68C0\u67E5\u5B8C\u6210\uFF1A${result.total_movies || 0} \u90E8\u5DF2\u68C0\u67E5\uFF0C${result.incomplete_count || 0} \u90E8\u5F85\u8865\u5168` : `\u8D44\u6599\u8865\u5168\u5B8C\u6210\uFF1A${result.updated_count || 0} \u6210\u529F\uFF0C${result.failed_count || 0} \u5931\u8D25\uFF0C\u5269\u4F59 ${result.information_check?.incomplete_count || 0} \u90E8\u5F85\u8865\u5168`;
  };
  var scrapeConfigKeys = ["scScanDir", "scOutDir", "scFolderRule", "scFileRule", "scMaxDepth", "scConcurrent", "scOpts", "scOverrides"];
  var libraryColumns = [["\u5C01\u9762", 152, 104], ["\u756A\u53F7", 104, 88], ["\u6807\u9898", 256, 160], ["\u6F14\u5458", 232, 120], ["\u5A92\u4F53\u53C2\u6570", 140, 100], ["\u6587\u4EF6", 80, 64], ["\u8D44\u6599\u5B8C\u6574\u5EA6", 112, 104], ["\u64CD\u4F5C", 74, 64]];
  var libraryWidthsKey = "javjaeger.libraryColumnWidths";
  function movieView(record, local = false) {
    const metadata = record.metadata || {}, media = record.media_info || metadata.media_info || {};
    const tags = names(record.genres || metadata.genres);
    if (record.is_vr && !tags.includes("VR")) tags.push("VR");
    const files = Array.isArray(record.files) ? record.files : [];
    const code = record.movie_id || record.id || record.code || "";
    return {
      raw: record,
      code,
      title: record.title || metadata.title || code,
      actors: names(record.stars || metadata.stars),
      tags,
      date: String(record.date || metadata.date || ""),
      dur: `${record.duration || record.videoLength || metadata.duration || metadata.videoLength || Math.round((media.duration_seconds || 0) / 60) || "\u2014"} \u5206`,
      studio: record.producer?.name || record.producer || record.studio?.name || record.studio || metadata.producer?.name || metadata.producer || metadata.studio?.name || metadata.studio || "\u2014",
      label: record.publisher?.name || record.publisher || record.label?.name || metadata.publisher?.name || metadata.publisher || metadata.label?.name || "\u2014",
      series: record.series?.name || record.series || metadata.series?.name || metadata.series || "\u2014",
      director: record.director?.name || record.director || metadata.director?.name || metadata.director || "\u2014",
      local: local || record.in_local_library ? "in" : "none",
      vr: tags.includes("VR"),
      sub: tags.includes("\u4E2D\u6587\u5B57\u5E55"),
      k4: Number(media.height) >= 2160,
      res: media.height ? `${media.height}p` : "\u2014",
      codec: media.codec || media.video_codec || "\u2014",
      files: record.file_count ?? files.length,
      size: size(record.total_size || files.reduce((sum, file) => sum + Number(file.size || 0), 0)),
      c: record.information_complete === false ? 0 : 100,
      added: String(record.updated_at || record.added_at || record.created_at || ""),
      gone: local && ((record.file_count ?? files.length) === 0 || files.some((file) => file.exists === false)),
      mag: "",
      magCount: 0,
      cover: imageSource(local && (record.thumbnail_url || metadata.list_thumbnail_url) || record.poster_url || record.cover_url || record.img || metadata.cover_url || metadata.img || "")
    };
  }
  function connectDesign(Base) {
    const data = Base.data;
    for (const table of Object.values(data)) {
      if (Array.isArray(table)) table.splice(0);
      else for (const key of Object.keys(table)) delete table[key];
    }
    return class ConnectedDesign extends Base {
      constructor(props) {
        super(props);
        const session = loadPikPakSession();
        this.auth = session.credentials;
        this.state = {
          ...this.state,
          theme: loadAppTheme(),
          route: "cinema",
          cnHero: "",
          cnPlaying: null,
          cnDetail: null,
          cnDetailFile: 0,
          cnQ: "",
          cnFiltersOpen: false,
          cnFacetQueries: {},
          code: "",
          sMode: "code",
          fValue: "",
          fLabel: "",
          fList: [],
          dCodes: "",
          dScope: "3",
          pikLogged: session.isLoggedIn,
          fsAria: "down",
          fsPath: [],
          fsSrc: "local",
          scPhase: "idle",
          scScanDir: "",
          scOutDir: "",
          lbSource: "",
          lbPaths: [],
          lbExcludes: [],
          auTask: "",
          settings: {},
          settingsDraft: {},
          cacheSettings: null,
          cacheDraft: null,
          imageCacheSettings: null,
          imageCacheDraft: null,
          connections: {},
          clientConfig: {},
          tasks: [],
          fileRows: [],
          tcCaps: {},
          searchError: "",
          searchDone: false,
          loading: false,
          libraryLoaded: false,
          scanTask: null,
          scrapeTask: null,
          scrapeResult: null,
          checkResult: null,
          informationTask: null,
          infoStarting: false,
          tool: "PikPak",
          autoDraft: null,
          directory: "",
          directories: [],
          browserTarget: null,
          qr: null,
          sourcesResult: [],
          scrapeTemplates: loadLocalScrapeTaskTemplates(),
          pathEdits: {},
          tcOptions: {},
          fsMinSize: "\u4E0D\u9650",
          fsVideoOnly: false,
          infoFields: ["title", "date", "stars", "genres", "cover_url", "nfo", "poster_file"],
          lbWidths: []
        };
        try {
          const widths = JSON.parse(window.localStorage.getItem(libraryWidthsKey));
          if (Array.isArray(widths) && widths.length === libraryColumns.length && widths.every(Number.isFinite)) {
            this.state.lbWidths = widths.map((width, i) => Math.max(libraryColumns[i][2], Math.min(1200, width)));
          }
        } catch {
        }
        this.magnets = /* @__PURE__ */ new Map();
        this.searchByCode = /* @__PURE__ */ new Map();
        this.libraryByCode = /* @__PURE__ */ new Map();
        this.latestByActor = /* @__PURE__ */ new Map();
        this.pendingRequests = /* @__PURE__ */ new Map();
        this.taskEtags = /* @__PURE__ */ new Map();
        this.taskReadVersions = /* @__PURE__ */ new Map();
        try {
          window.localStorage.removeItem("javjaeger.movieMetadata.v1");
          window.localStorage.removeItem("javjaeger.movieCacheSettings.v1");
        } catch {
        }
        this._readGeneration = 0;
        this.requestVersion = 0;
        this._disposed = false;
        for (const [key, storageKey] of Object.entries(jobStorage)) {
          try {
            const saved = JSON.parse(window.sessionStorage.getItem(storageKey) || "null");
            if (!saved?.taskId) continue;
            if (key === "scrapeTask") {
              for (const field of scrapeConfigKeys) if (saved.config?.[field] !== void 0) this.state[field] = saved.config[field];
              this.state.scPhase = "scanning";
              this.scrapePreviewConfig = JSON.stringify(this.scrapePayload());
            } else if (key === "scanTask") this.state.lbScanning = true;
            if (key === "informationTask" && saved.config?.fields?.length) this.state.infoFields = saved.config.fields;
            this.state[key] = { id: saved.taskId, operation: saved.type, status: "running", payload: saved.config, preflight: saved.preflight || [] };
          } catch {
            window.sessionStorage.removeItem(storageKey);
          }
        }
      }
      setState(update, callback) {
        const patch = typeof update === "function" ? update(this.state) : { ...update };
        for (const [page, filters] of [
          ["lbPage", ["lbQ", "lbActor", "lbStudio", "lbRes", "lbM", "lbSubOnly", "lbMissing", "lbSort"]],
          ["cnPage", ["cnTab", "cnActor", "cnF", "cnSort", "cnQ"]],
          ["cnShelfPage", ["cnTab"]],
          ["catalogPage", ["browse", "browseQ"]],
          ["searchPage", ["sMode", "code", "page", "fList"]],
          ["historyPage", ["dHf"]],
          ["tcPage", ["tcF"]],
          ["scPage", ["scF", "scPhase"]],
          ["scOutcomePage", ["scrapeResult"]],
          ["fsPage", ["fsQ", "fsSrc", "directory", "fsVideoOnly", "fsMinSize"]],
          ["directoryPage", ["browsePath"]],
          ["dlgPage", ["dlg"]]
        ]) {
          if (filters.some((key) => key in patch && patch[key] !== this.state[key])) patch[page] = null;
        }
        const cinemaNavigation = this.state.route === "cinema" && ["cnTab", "cnActor", "cnQ", "cnF", "cnSort", "cnPage", "cnShelfPage", "cnActorPage"].some((key) => key in patch && patch[key] !== this.state[key]);
        super.setState(patch, cinemaNavigation ? () => {
          document.querySelector(".jj-cinema-content")?.scrollTo({ top: 0 });
          callback?.();
        } : callback);
      }
      async request(url, method = "GET", body, conditional = false) {
        const saved = this.taskEtags.get(url);
        const validator = conditional && method === "GET" && saved?.generation === this._readGeneration ? saved.value : null;
        const key = JSON.stringify([method, url, body instanceof FormData ? [...body.entries()] : body, method === "GET" ? this._readGeneration : null, conditional, validator]);
        if (this.pendingRequests.has(key)) return this.pendingRequests.get(key);
        if (method !== "GET") this._readGeneration++;
        const pending = this.fetchJSON(url, method, body, validator);
        this.pendingRequests.set(key, pending);
        try {
          return await pending;
        } finally {
          this.pendingRequests.delete(key);
          if (method !== "GET") this._readGeneration++;
        }
      }
      async fetchJSON(url, method, body, validator = null) {
        const options = { method }, generation = this._readGeneration;
        const taskList = method === "GET" && taskListUrls.includes(url);
        const version = taskList ? (this.taskReadVersions.get(url) || 0) + 1 : 0;
        if (taskList) this.taskReadVersions.set(url, version);
        if (taskList) options.cache = "no-store";
        if (body !== void 0) {
          if (body instanceof FormData) options.body = body;
          else {
            options.headers = { "Content-Type": "application/json" };
            options.body = JSON.stringify(body);
          }
        }
        if (validator) options.headers = { ...options.headers, "If-None-Match": validator };
        const response = await fetch(url, options);
        if (response.status === 304 && validator) return null;
        if (!response.ok) {
          const result2 = await response.json().catch(() => null), detail = result2?.detail;
          const error = new Error(safeText(detail?.message || (typeof detail === "string" ? detail : "") || result2?.message, `\u8BF7\u6C42\u5931\u8D25\uFF08HTTP ${response.status}\uFF09`));
          error.status = response.status;
          error.result = result2;
          throw error;
        }
        const result = await response.json();
        if (taskList && (generation !== this._readGeneration || version !== this.taskReadVersions.get(url))) return null;
        if (taskList && !Array.isArray(result?.tasks)) throw new Error("\u4EFB\u52A1\u5217\u8868\u54CD\u5E94\u65E0\u6548\uFF0C\u8BF7\u91CD\u8BD5");
        if (result?.success === false || result?.error && !result.status) {
          const error = new Error(safeText(result.message || result.error));
          error.result = result;
          throw error;
        }
        if (taskList && generation === this._readGeneration) {
          const value = response.headers?.get("ETag");
          if (value) this.taskEtags.set(url, { value, generation });
          else this.taskEtags.delete(url);
        }
        return result;
      }
      async perform(action, success) {
        try {
          const result = await action();
          if (success && !this._disposed) this.toast(success, OK);
          return result;
        } catch (error) {
          if (!this._disposed) this.toast(safeText(error.message), BAD);
          return null;
        }
      }
      async copyText(text) {
        if (navigator.clipboard?.writeText) {
          try {
            await navigator.clipboard.writeText(text);
            return;
          } catch {
          }
        }
        const previous = document.activeElement, field = document.createElement("textarea");
        field.value = text;
        field.style.cssText = "position:fixed;opacity:0;pointer-events:none";
        document.body.append(field);
        field.select();
        try {
          if (!document.execCommand("copy")) throw new Error("\u590D\u5236\u5931\u8D25\uFF0C\u8BF7\u624B\u52A8\u9009\u62E9\u5E76\u590D\u5236\u6587\u672C");
        } finally {
          field.remove();
          previous?.focus({ preventScroll: true });
        }
      }
      componentDidMount() {
        this._keyboard = (event) => {
          if (event.key === "Escape") {
            if (this.state.dlg) this.renderVals().dlg.cancel();
            else for (const key of ["fsAdd", "toolCfg", "browse", "scRepair", "scDesigner", "scCmp", "scInspect", "lbTc", "lbCheckCfg", "lbPathCfg", "lbDetail", "detail", "tcDetail", "bgOpen", "cnPlaying", "cnDetail"]) {
              if (this.state[key]) {
                this.setState({ [key]: null });
                break;
              }
            }
          }
          if (["Enter", " "].includes(event.key) && event.target.matches('[role="button"]')) {
            event.preventDefault();
            event.target.click();
          }
          if (event.key === "Tab" && this._activeDialog) {
            const controls = [...this._activeDialog.querySelectorAll('button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex="0"]')].filter((control) => control.getClientRects().length);
            const first = controls[0], last = controls.at(-1);
            if (first && event.shiftKey && document.activeElement === first) {
              event.preventDefault();
              last.focus();
            } else if (last && !event.shiftKey && document.activeElement === last) {
              event.preventDefault();
              first.focus();
            }
          }
        };
        document.addEventListener("keydown", this._keyboard);
        this._dialogObserver = new MutationObserver(() => {
          const dialogs = [...document.querySelectorAll('[role="dialog"]')].filter((dialog) => dialog.getClientRects().length);
          dialogs.sort((a, b) => Number(getComputedStyle(a.closest(".dialog-backdrop") || a).zIndex) - Number(getComputedStyle(b.closest(".dialog-backdrop") || b).zIndex));
          const next = dialogs.at(-1);
          if (next === this._activeDialog) return;
          if (next) {
            if (!this._activeDialog) this._focusBeforeDialog = document.activeElement;
            const target = next.querySelector("input:not(:disabled), select:not(:disabled), button:not(:disabled)");
            target?.focus({ preventScroll: true });
          } else if (this._focusBeforeDialog?.isConnected) {
            const previous = this._focusBeforeDialog;
            const target = previous.closest("details:not([open])")?.querySelector("summary") || previous;
            target?.focus({ preventScroll: true });
          }
          this._activeDialog = next;
        });
        this._dialogObserver.observe(document.body, { childList: true, subtree: true });
        this.perform(async () => {
          await Promise.all([() => this.loadLibrary(), () => this.loadSettings(), () => this.loadConnections(), () => this.loadHistory(), () => this.loadTasks(), () => this.loadTranscodes(), () => this.loadCatalogs()].map((load) => this.perform(load)));
          const config = this.state.clientConfig;
          for (const key of ["webdav", "aria2", "pikpak"]) {
            if (config[key]?.configured && (config[key].auto_connect || config[key].auto_login)) await this.perform(() => this.connect(key, true));
          }
        });
        this._poll = setInterval(() => this.perform(() => this.poll()), 3e3);
      }
      componentWillUnmount() {
        this._disposed = true;
        this._cancelLibraryResize?.();
        clearInterval(this._poll);
        if (this._keyboard) document.removeEventListener("keydown", this._keyboard);
        this._dialogObserver?.disconnect();
        for (const key of ["_tt", "_st", "_sc1", "_sc2", "_bt"]) clearTimeout(this[key]);
      }
      allConnected() {
        return Boolean(this.state.connections.pan115);
      }
      go(route) {
        return () => {
          this.setState({ route, bgOpen: false, detail: null, lbDetail: null, cnPlaying: null, cnDetail: null, lbTc: null, lbPathCfg: false, lbCheckCfg: false, toolCfg: null, fsAdd: null });
          this.perform(async () => {
            if (["cinema", "library"].includes(route) && (!this.state.libraryLoaded || Date.now() - this._libraryLoadedAt >= 3e4)) await this.loadLibrary();
            if (route === "storage") await this.loadFiles(this.state.fsSrc, this.state.directory);
            if (route === "transcode") await this.loadTranscodes(true);
            if (route === "auto") await this.loadTasks();
            if (route === "dispatch") await this.loadHistory();
          });
        };
      }
      async loadConnections() {
        const [config, connection, pan115] = await Promise.all([
          this.request("/api/client-config"),
          this.request("/api/webdav/status"),
          this.request("/api/115/status")
        ]);
        this.setState({ clientConfig: config, connections: { ...connection, pan115: Boolean(pan115.connected) }, fsAria: connection.aria2_connected ? "up" : "down" });
      }
      async loadSettings() {
        const payload = await this.request("/api/system/settings");
        this.setState({ settings: payload, settingsDraft: withSecretPlaceholders(payload), sourcesResult: [] });
      }
      async loadCacheSettings(images = false) {
        const result = await this.request(images ? "/api/image-cache" : "/api/metadata-cache");
        this.setState({ [images ? "imageCacheSettings" : "cacheSettings"]: result, [images ? "imageCacheDraft" : "cacheDraft"]: { ...result.settings } });
      }
      async loadCatalogs() {
        for (const [url, table] of [["/static/actors.json", data.ACTOR_CATALOG], ["/static/categories.json", data.GENRE_CATALOG]]) {
          const groups = await this.request(url);
          table.splice(0, table.length, ...Object.entries(groups).map(([name, items]) => ({
            name,
            items: (Array.isArray(items) ? items : Object.entries(items || {}).map(([code, label]) => ({ id: code, name: label }))).map((item) => [String(item.name || item.title || ""), String(item.id || item.code || ""), "", true])
          })));
        }
        this.forceUpdate?.();
      }
      async loadLibrary() {
        const [library, settings, actors] = await Promise.all([
          this.request("/api/movies/local-library?compact=true"),
          this.request("/api/movies/local-library/settings"),
          this.request("/api/movies/local-library/actors?compact=true")
        ]);
        data.LIB.splice(0, data.LIB.length, ...(library.records || library.movies || []).map((record) => movieView(record, true)));
        this.libraryByCode = new Map(data.LIB.map((movie) => [movie.code, movie]));
        this.latestByActor.clear();
        this._cinemaCounts = null;
        this._facetRevision = (this._facetRevision || 0) + 1;
        for (const movie of data.LIB) for (const actor of movie.actors) {
          if (!this.latestByActor.has(actor) || movie.date > this.latestByActor.get(actor).date) this.latestByActor.set(actor, movie);
        }
        data.CN_ACTORS.splice(0, data.CN_ACTORS.length, ...(actors.actors || []).map((actor) => ({ ...actor, count: actor.movie_count, size: size(actor.total_size), noAvatar: !actor.avatar_url })));
        const dims = [["actor", "\u6F14\u5458", "actors"], ["series", "\u7CFB\u5217", "series"], ["studio", "\u5236\u4F5C\u5546", "studio"], ["res", "\u5206\u8FA8\u7387", "res"], ["flag", "\u6807\u8BB0", "tags"]];
        data.FILTER_DIMS.splice(0, data.FILTER_DIMS.length, ...dims.map(([key, name, field]) => ({
          key,
          name,
          options: [...new Set(data.LIB.flatMap((movie) => movie[field]))].filter((value) => value && value !== "\u2014"),
          test: (movie, value) => Array.isArray(movie[field]) ? movie[field].includes(value) : movie[field] === value
        })));
        this.applyLibrarySettings(settings);
        this.setState({
          libraryLoaded: true,
          librarySummary: library,
          cnHero: data.LIB.some((movie) => movie.code === this.state.cnHero) ? this.state.cnHero : data.LIB[0]?.code || ""
        });
        this._libraryLoadedAt = Date.now();
        await this.checkInformation();
      }
      applyLibrarySettings(settings, saved = false) {
        const st = this.state, source = settings.source_directory || "", target = settings.directories?.[0] || "";
        this.setState({
          librarySettings: settings,
          ...saved ? { seSource: void 0, seTarget: void 0 } : {},
          ...!st.lbPathCfg || saved ? { lbSource: source, lbPaths: settings.directories || [], lbExcludes: settings.ignored_paths || [] } : {},
          ...st.scPhase === "idle" && (!st.scrapeTask || jobFinished(st.scrapeTask)) ? { scScanDir: saved ? source : st.scScanDir || source, scOutDir: saved ? target : st.scOutDir || target } : {}
        });
      }
      openLibraryPaths() {
        const settings = this.state.librarySettings || {};
        this.setState({ lbPathCfg: true, lbSource: settings.source_directory || "", lbPaths: settings.directories || [], lbExcludes: settings.ignored_paths || [] });
      }
      async saveLibraryPaths(values) {
        const source = (values.source_directory || "").trim(), directories = (values.directories || []).map((path) => path.trim()).filter(Boolean);
        if (!source || !directories.length) throw new Error("\u8BF7\u9009\u62E9\u5F85\u522E\u524A\u76EE\u5F55\u548C\u5F71\u89C6\u5E93\u76EE\u5F55");
        const settings = await this.request("/api/movies/local-library/settings", "PUT", { source_directory: source, directories, ignored_paths: (values.ignored_paths || []).map((path) => path.trim()).filter(Boolean) });
        this.applyLibrarySettings(settings, true);
        return settings;
      }
      async checkInformation(refreshFiles = false) {
        const result = await this.request("/api/movies/local-library/information/check?fields=" + id(this.state.infoFields.join(",")) + "&refresh_files=" + refreshFiles);
        if (refreshFiles) this._readGeneration++;
        this.applyInformationCheck(result);
      }
      applyInformationCheck(result) {
        const incomplete = new Map((result.incomplete_records || []).map((record) => [record.movie_id, record]));
        for (const movie of data.LIB) {
          const missing = incomplete.get(movie.code);
          movie.c = missing ? Math.max(0, Math.round(100 * (1 - (missing.missing_fields?.length || missing.missing_labels?.length || 1) / Math.max(1, result.fields?.length || this.state.infoFields.length)))) : 100;
          movie.missing = missing?.missing_labels;
          movie.unchecked = Boolean(missing?.unchecked_fields?.length);
        }
        this.setState({ checkResult: result });
      }
      async loadHistory() {
        const history = await this.request("/api/history");
        data.HISTORY.splice(0, data.HISTORY.length, ...Array.isArray(history) ? history : history.records || history.history || []);
        this.forceUpdate?.();
      }
      async loadTasks(conditional = false) {
        const result = await this.request("/api/automation/tasks", "GET", void 0, conditional);
        if (result === null) return;
        const tasks = result.tasks || [];
        if (JSON.stringify(tasks) === JSON.stringify(this.state.tasks)) return;
        const running = new Set(this.state.tasks.flatMap((task) => (task.runs || []).filter((run) => run.status === "running").map((run) => run.id)));
        for (const task of tasks) for (const run of task.runs || []) if (running.has(run.id) && run.status !== "running") this.toast(`${task.name}\uFF1A${safeText(run.error || run.message, runStatus(run.status))}`, ["failed", "partial"].includes(run.status) ? WARN : OK);
        this.setState({ tasks, auTask: tasks.some((task) => task.id === this.state.auTask) ? this.state.auTask : tasks[0]?.id || "" });
      }
      async loadTranscodes(capabilities = false, conditional = false) {
        const payload = await this.request("/api/movies/transcoding/tasks", "GET", void 0, conditional);
        const snapshot = payload === null ? this._transcodeSnapshot : JSON.stringify(payload.tasks || []), changed = snapshot !== this._transcodeSnapshot;
        this._transcodeSnapshot = snapshot;
        if (changed) {
          data.TC.splice(0, data.TC.length, ...(payload.tasks || []).map((task) => ({
            ...task,
            raw: task,
            code: task.movie_id,
            title: task.movie_title,
            file: task.source_path,
            preset: task.preset_name,
            codec: task.options?.video_codec || "",
            gpu: task.gpu_name || task.hardware_backend,
            pct: task.progress,
            eta: task.eta_seconds == null ? "\u2014" : `${Math.ceil(task.eta_seconds / 60)} \u5206`,
            elapsed: `${task.elapsed_seconds || 0} \u79D2`,
            inSize: size(task.input_size),
            outSize: size(task.output_size)
          })));
        }
        if (capabilities) {
          this.setState({ tcCaps: {} });
          this.setState({ tcCaps: await this.request("/api/movies/transcoding/presets") });
        }
        if (changed) this.forceUpdate?.();
      }
      applyMovieDetails(movie, detail) {
        const previousCode = movie.code;
        const raw = { ...movie.raw, ...Object.fromEntries(Object.entries(detail).filter(([, value]) => value != null && value !== "")) };
        Object.assign(movie, movieView(raw), { mag: movie.mag, magCount: movie.magCount, detailsLoaded: true, detailError: "" });
        if (previousCode !== movie.code) this.searchByCode.delete(previousCode);
        this.searchByCode.set(movie.code, movie);
      }
      async loadMovieDetails(movie, version = this.requestVersion) {
        if (movie.detailsLoaded) return;
        movie.detailsLoading = true;
        try {
          const detail = await this.request(`/api/movies/${id(movie.code)}`);
          if (version === this.requestVersion && !this._disposed) {
            this.applyMovieDetails(movie, detail);
          }
        } catch (error) {
          if (version === this.requestVersion && !this._disposed) {
            movie.detailError = safeText(error.message);
            throw error;
          }
        } finally {
          if (version === this.requestVersion && !this._disposed) {
            movie.detailsLoading = false;
            this.forceUpdate?.();
          }
        }
      }
      async getMagnets(movie, source = this.state.src) {
        const query = new URLSearchParams({ source: sourceKey(source), sortBy: this.state.sortBy, sortOrder: this.state.sortOrder, exclude4k: String(this.state.exclude4k) });
        if (this.state.sub !== "0") query.set("hasSubtitle", this.state.sub);
        if (sourceKey(source) === "javbus") {
          if (movie.raw.gid) query.set("gid", movie.raw.gid);
          if (movie.raw.uc !== void 0) query.set("uc", movie.raw.uc);
        }
        const result = await this.request(`/api/magnets/${id(movie.code)}?${query}`);
        const magnets = Array.isArray(result) ? result : result.magnets || [];
        return magnets.map((magnet) => ({ ...magnet, name: magnet.title || magnet.name || movie.code, source: magnet.source || sourceKey(source), movie_id: movie.code }));
      }
      runSearch = async () => {
        const version = ++this.requestVersion, st = { ...this.state };
        data.MOVIES.splice(0);
        this.magnets.clear();
        this.searchByCode.clear();
        this.setState({ loading: true, sel: [], detail: null, searchError: "", searchDone: false, nextPage: false, searchPage: null });
        try {
          let payload;
          if (st.sMode === "recognize") payload = await this.request("/api/movies/recognize", "POST", { html_content: st.recogHtml, auto_download: false, magnet_source: sourceKey(st.src), has_subtitle_filter: st.sub === "0" ? null : st.sub, exclude_4k: st.exclude4k });
          else if (st.sMode === "filter") {
            const query = new URLSearchParams({ filters: JSON.stringify(st.fList.map(({ type, value }) => ({ type, value }))), magnet: st.magParam, type: st.kind, page: String(st.page), excludeVr: String(st.excludeVr) });
            if (st.sub !== "0") query.set("hasSubtitle", st.sub);
            const count = { "1 \u4EBA": "1", "2 \u4EBA": "2", "3 \u4EBA": "3", "\u2264 2 \u4EBA": "<=2", "\u2264 3 \u4EBA": "<=3", "\u2265 3 \u4EBA": ">=3", "\u2265 4 \u4EBA": ">=4" }[st.actorCount];
            if (count) query.set("actorCountFilter", count);
            payload = await this.request(`/api/movies${st.fetchMode === "all" ? "/all" : ""}?${query}`);
          } else {
            if (!st.code.trim()) throw new Error("\u8BF7\u586B\u5199\u756A\u53F7");
            payload = { movies: [st.sMode === "magnet" && sourceKey(st.src) !== "javbus" ? { id: st.code.trim() } : await this.request(`/api/movies/${id(st.code.trim())}`)] };
          }
          if (version !== this.requestVersion || this._disposed) return;
          const detailsLoaded = st.sMode === "code" || st.sMode === "magnet" && sourceKey(st.src) === "javbus";
          const movies = (payload.movies || []).map((movie) => ({ ...movieView(movie), magnetsLoading: true, detailsLoaded, detailsLoading: !detailsLoaded && st.sMode !== "magnet" }));
          data.MOVIES.splice(0, data.MOVIES.length, ...movies);
          this.searchByCode = new Map(movies.map((movie) => [movie.code, movie]));
          this.magnets.clear();
          this.setState({ loading: false, magnetsLoading: true, searchDone: true, nextPage: Boolean(payload.pagination?.hasNextPage ?? payload.pagination?.nextPage ?? payload.has_next_page ?? movies.length >= 30) });
          for (let offset = 0; offset < movies.length; offset += 4) {
            await Promise.all(movies.slice(offset, offset + 4).map(async (movie) => {
              try {
                if (st.sMode !== "magnet") {
                  try {
                    await this.loadMovieDetails(movie, version);
                  } catch {
                  }
                }
                if (version !== this.requestVersion || this._disposed) return;
                const magnets = await this.getMagnets(movie, st.src);
                if (version !== this.requestVersion || this._disposed) return;
                this.magnets.set(movie.code, magnets);
                movie.mag = magnets[0] ? `${magnets[0].name} \xB7 ${magnets[0].size}` : "";
                movie.magCount = magnets.length;
              } catch (error) {
                movie.mag = "";
                movie.magnetError = safeText(error.message);
                if (st.sMode === "magnet") throw error;
              } finally {
                movie.magnetsLoading = false;
              }
            }));
            if (version !== this.requestVersion || this._disposed) return;
            this.forceUpdate?.();
          }
          if (st.autoDownload && st.sMode !== "magnet") this.confirmDispatch(movies.map((movie) => movie.code));
        } catch (error) {
          if (version === this.requestVersion && !this._disposed) {
            this.setState({ searchError: safeText(error.message), searchDone: true });
            this.toast(safeText(error.message), BAD);
          }
        }
        if (version === this.requestVersion && !this._disposed) this.setState({ loading: false, magnetsLoading: false });
      };
      clearSearch() {
        ++this.requestVersion;
        data.MOVIES.splice(0);
        this.magnets.clear();
        this.searchByCode.clear();
        this.setState({ loading: false, magnetsLoading: false, searchDone: false, searchError: "", nextPage: false, sel: [], detail: null });
      }
      visible() {
        return this.state.sMode === "magnet" ? [] : data.MOVIES;
      }
      setSrc(src) {
        return () => {
          this.setState({ src });
          if (this.state.searchDone || this.state.loading) void this.runSearch();
        };
      }
      dispatchOne(movie) {
        return () => this.confirmDispatch([movie.code]);
      }
      async finishDispatch(result, tool, preflight = []) {
        const results = [...preflight, ...result.results || []];
        this.setState({ dispatchResult: { ...result, results }, dispatchTool: tool, failedPage: null });
        await this.perform(() => this.loadHistory());
        const failed = results.filter((item) => item.success === false && !item.skipped).length;
        if (failed) throw new Error(`\u6709 ${failed} \u9879\u672A\u6210\u529F\u63D0\u4EA4\uFF0C\u8BF7\u5230\u4E0B\u8F7D\u6D3E\u53D1\u9875\u67E5\u770B\u5E76\u91CD\u8BD5`);
        if (!results.length || results.every((item) => item.skipped)) {
          this.toast("\u5168\u90E8\u8D44\u6E90\u5DF2\u8DF3\u8FC7\uFF0C\u6CA1\u6709\u65B0\u589E\u4E0B\u8F7D\u4EFB\u52A1", WARN);
          return;
        }
        this.toast("\u4E0B\u8F7D\u4EFB\u52A1\u5DF2\u63D0\u4EA4", OK);
      }
      confirmDispatch(codes, magnets, destination) {
        codes = [...new Set(codes.map((code) => String(code).trim().toUpperCase()).filter(Boolean))];
        if (!codes.length) {
          this.toast("\u8BF7\u9009\u62E9\u5F71\u7247\u6216\u586B\u5199\u756A\u53F7", WARN);
          return;
        }
        const st = { ...this.state, tool: destination || this.state.tool }, chosen = magnets || (st.route === "search" ? codes.flatMap((code) => (this.magnets.get(code) || []).slice(0, 1)) : null);
        this.ask({
          title: `\u6D3E\u53D1 ${codes.length} \u90E8\u5230 ${st.tool}\uFF1F`,
          color: ACC,
          okText: "\u5F00\u59CB\u6D3E\u53D1",
          body: "\u5C06\u63D0\u4EA4\u771F\u5B9E\u4E0B\u8F7D\u4EFB\u52A1\uFF1B\u672C\u5730\u5DF2\u6709\u5F71\u7247\u4E0E\u5DF2\u5C1D\u8BD5\u94FE\u63A5\u7531\u540E\u7AEF\u68C0\u67E5\u3002",
          list: codes,
          run: () => this.perform(async () => {
            const tool = toolKey(st.tool);
            if (tool === "pan115" && this.state.dispatchTask && !["completed", "failed"].includes(this.state.dispatchTask.status)) throw new Error("\u5DF2\u6709 115 \u6D3E\u53D1\u4EFB\u52A1\u8FD0\u884C\u4E2D\uFF0C\u8BF7\u7B49\u5F85\u5B8C\u6210");
            let entries = chosen, preflight = [];
            if (!entries) {
              const payload = await this.request("/api/movies/batch", "POST", {
                movie_ids: codes,
                magnet_source: sourceKey(st.route === "dispatch" ? st.dSrc : st.src),
                has_subtitle_filter: st.route === "dispatch" ? st.dSubOnly ? "true" : null : st.sub === "0" ? null : st.sub,
                exclude_4k: st.route === "dispatch" ? st.dNo4k : st.exclude4k
              });
              entries = [];
              for (const item of payload.results || []) {
                if (item.in_local_library) preflight.push({ movie_id: item.movie_id, success: false, skipped: true, reason: "already_exists", message: "\u5F71\u7247\u5DF2\u5728\u672C\u5730\u5E93\u4E2D" });
                else if (item.best_magnet?.link) entries.push({ ...item.best_magnet, movie_id: item.movie_id });
                else preflight.push({ movie_id: item.movie_id, success: false, error: item.error || "no_magnet", message: safeText(item.error, "\u6CA1\u6709\u7B26\u5408\u6761\u4EF6\u7684\u78C1\u529B\uFF0C\u8BF7\u8C03\u6574\u6765\u6E90\u6216\u7B5B\u9009\u6761\u4EF6") });
              }
            }
            const usable = entries.filter((item) => item.link || item.magnet_link);
            if (!usable.length) {
              if (!preflight.length) preflight = codes.map((movie_id) => ({ movie_id, success: false, error: "no_magnet", message: "\u6CA1\u6709\u7B26\u5408\u6761\u4EF6\u7684\u78C1\u529B" }));
              await this.finishDispatch({ results: [] }, st.tool, preflight);
              return;
            }
            const body = { magnet_links: usable.map((item) => item.link || item.magnet_link), movie_ids: usable.map((item) => item.movie_id || codes[0]), magnet_sources: usable.map((item) => item.source || sourceKey(st.route === "dispatch" ? st.dSrc : st.src)) };
            if (tool === "pikpak" && this.auth && !this.auth.fromConfig) Object.assign(body, { username: this.auth.username, password: this.auth.password });
            if (tool === "pan115") {
              const job = await this.request("/api/115/download-jobs", "POST", body);
              window.sessionStorage.setItem(jobStorage.dispatchTask, JSON.stringify({ taskId: job.job_id, type: "dispatch", preflight }));
              this.setState({ dispatchTask: { ...job, id: job.job_id, preflight }, dispatchTool: st.tool });
              this.toast("115 \u6D3E\u53D1\u5DF2\u5728\u540E\u53F0\u542F\u52A8\uFF0C\u53EF\u5728\u540E\u53F0\u4EFB\u52A1\u4E2D\u67E5\u770B\u8FDB\u5EA6", OK);
              return;
            }
            let result;
            try {
              result = await this.request(tool === "pikpak" ? "/api/pikpak/download" : "/api/aria2/download-magnets", "POST", body);
            } catch (error) {
              if (!error.result?.results) throw error;
              result = error.result;
            }
            await this.finishDispatch(result, st.tool, preflight);
          })
        });
      }
      async poll() {
        if (this._polling || this._disposed) return;
        this._polling = true;
        try {
          const pending = [];
          if (["transcode", "library", "cinema"].includes(this.state.route) || data.TC.some((task) => ["running", "queued"].includes(task.status))) pending.push(this.perform(() => this.loadTranscodes(false, true)));
          if (this.state.route === "storage" && this.state.connections.aria2_connected) pending.push(this.perform(() => this.loadAria()));
          if (this.state.route === "auto" || this.state.tasks.some((task) => task.runs?.some((run) => run.status === "running"))) pending.push(this.perform(() => this.loadTasks(true)));
          pending.push(this.perform(() => this.pollInformation()));
          for (const [key, prefix] of [["scanTask", "/api/movies/local-library/scan/jobs/"], ["scrapeTask", "/api/movies/local-scrape/jobs/"], ["dispatchTask", "/api/115/download-jobs/"], ["cleanupTask", "/api/movies/local-library/clean-invalid/jobs/"]]) {
            const current = this.state[key];
            if (!current || ["success", "completed", "failed"].includes(current.status)) continue;
            pending.push(this.perform(async () => {
              let task;
              try {
                task = await this.request(prefix + id(current.id));
              } catch (error) {
                if (error.status === 404) {
                  window.sessionStorage.removeItem(jobStorage[key]);
                  this.setState({ [key]: { ...current, status: "failed", message: "\u540E\u53F0\u4EFB\u52A1\u5DF2\u5931\u6548\uFF0C\u670D\u52A1\u53EF\u80FD\u5DF2\u91CD\u542F\uFF0C\u8BF7\u6838\u5BF9\u7ED3\u679C\u540E\u91CD\u65B0\u64CD\u4F5C" }, ...key === "scrapeTask" ? { scPhase: "idle" } : key === "scanTask" ? { lbScanning: false } : {} });
                  throw new Error(key === "dispatchTask" ? "115 \u540E\u53F0\u4EFB\u52A1\u5DF2\u5931\u6548\uFF0C\u8BF7\u5148\u6838\u5BF9\u4E0B\u8F7D\u5386\u53F2\u548C\u7F51\u76D8\u4EFB\u52A1\uFF0C\u518D\u91CD\u8BD5\u672A\u63D0\u4EA4\u9879" : "\u540E\u53F0\u4EFB\u52A1\u5DF2\u5931\u6548\uFF0C\u670D\u52A1\u53EF\u80FD\u5DF2\u91CD\u542F\uFF0C\u8BF7\u91CD\u65B0\u626B\u63CF\u6216\u751F\u6210\u9884\u89C8");
                }
                throw error;
              }
              this.setState({ [key]: { ...current, ...task, id: current.id, operation: current.operation } });
              if (key === "cleanupTask") {
                if (jobFinished(task)) {
                  await this.perform(() => this.loadLibrary());
                  this.toast(safeText(task.result?.message || task.message, "\u6E05\u6D17\u4EFB\u52A1\u7ED3\u675F\uFF0C\u53EF\u5728\u540E\u53F0\u4EFB\u52A1\u4E2D\u67E5\u770B\u7ED3\u679C"), task.status === "failed" || task.result?.failed_files?.length ? WARN : OK);
                }
                return;
              }
              if (key === "dispatchTask") {
                if (["completed", "failed"].includes(task.status)) {
                  if (!task.result) throw new Error("115 \u6D3E\u53D1\u5931\u8D25\uFF0C\u8BF7\u68C0\u67E5\u8FDE\u63A5\u4E0E\u4E0B\u8F7D\u5386\u53F2");
                  await this.perform(() => this.finishDispatch(task.result, "115 \u7F51\u76D8", current.preflight || []));
                }
                return;
              }
              if (key === "scanTask" && task.result && ["success", "completed", "failed"].includes(task.status)) {
                this.setState({ lbScanning: false, scanResult: task.result });
                await this.perform(() => this.loadLibrary());
                const message = safeText(task.message || task.result.message, "\u626B\u63CF\u5DF2\u5B8C\u6210");
                this.toast(message, task.status === "failed" ? WARN : OK);
                return;
              }
              if (key === "scrapeTask" && current.operation === "apply" && task.result && ["success", "completed", "failed"].includes(task.status)) {
                this.setState({ scPhase: "idle", scrapeResult: task.result });
                data.SCRAPE_ROWS.splice(0);
                await this.perform(() => this.loadLibrary());
                this.toast(`\u522E\u524A\u6267\u884C\u5B8C\u6210\uFF1A${task.result.success_count || 0} \u6210\u529F\uFF0C${task.result.failed_count || 0} \u5931\u8D25`, task.status === "failed" ? WARN : OK);
              } else if (["success", "completed"].includes(task.status)) {
                if (key === "scanTask") {
                  this.setState({ lbScanning: false });
                  await this.loadLibrary();
                } else this.applyScrapeResult(task.result);
              } else if (task.status === "failed") {
                this.setState(key === "scrapeTask" ? { scPhase: "idle" } : { lbScanning: false });
                throw new Error(safeText(task.message || task.error));
              } else if (key === "scrapeTask") this.setState({ scPct: task.percent || 0 });
            }));
          }
          if (this.state.qr?.session_id) pending.push(this.perform(() => this.pollQr()));
          await Promise.all(pending);
        } finally {
          this._polling = false;
        }
      }
      async startJob(key, url, payload, operation = "preview") {
        this._startingJobs ||= /* @__PURE__ */ new Set();
        if (this._startingJobs.has(key) || this.state[key] && !jobFinished(this.state[key])) throw new Error("\u540C\u7C7B\u540E\u53F0\u4EFB\u52A1\u6B63\u5728\u8FD0\u884C\uFF0C\u8BF7\u7B49\u5F85\u5B8C\u6210");
        this._startingJobs.add(key);
        try {
          const config = key === "scrapeTask" ? Object.fromEntries(scrapeConfigKeys.map((field) => [field, this.state[field]])) : payload;
          const task = await this.request(url, "POST", payload);
          window.sessionStorage.setItem(jobStorage[key], JSON.stringify({ taskId: task.task_id, type: operation, config }));
          this.setState({ [key]: { id: task.task_id, status: "running", operation, payload: config } });
          return task;
        } finally {
          this._startingJobs.delete(key);
        }
      }
      showBackgroundResult(key) {
        const task = this.state[key];
        if (!task) return;
        if (key === "scrapeTask" && task.result && (task.operation === "apply" || task.status !== "failed")) {
          this.go("scrape")();
          return;
        }
        if (!jobFinished(task)) {
          this.go(key === "dispatchTask" ? "dispatch" : key === "scrapeTask" ? "scrape" : "library")();
          return;
        }
        this.setState({ bgOpen: false });
        const result = task.result || {}, failed = task.status === "failed";
        const rows = key === "scanTask" ? result.scans || [result] : key === "cleanupTask" ? [...(result.deleted_files || []).map((row) => ({ ...row, message: "\u5DF2\u6E05\u6D17" })), ...result.failed_files || []] : result.results || [];
        this.ask({
          title: key === "scanTask" ? "\u626B\u63CF\u5165\u5E93\u7ED3\u679C" : key === "cleanupTask" ? "\u6E05\u6D17\u7ED3\u679C" : key === "dispatchTask" ? "115 \u6D3E\u53D1\u7ED3\u679C" : "\u522E\u524A\u4EFB\u52A1\u5931\u8D25",
          body: safeText(result.message || task.message, failed ? "\u4EFB\u52A1\u5931\u8D25\uFF0C\u8BF7\u4FEE\u6B63\u914D\u7F6E\u540E\u91CD\u8BD5" : "\u4EFB\u52A1\u5DF2\u5B8C\u6210"),
          color: failed ? WARN : ACC,
          list: rows.map((row) => `${row.path || row.directory || row.movie_id || ""} ${safeText(row.message || row.error, row.success === false ? "\u5931\u8D25" : "\u5DF2\u5B8C\u6210")}`),
          okText: "\u67E5\u770B\u5BF9\u5E94\u9875\u9762",
          run: () => {
            this.dismissBackgroundTask(key);
            this.go(key === "dispatchTask" ? "dispatch" : key === "scrapeTask" ? "scrape" : "library")();
          }
        });
      }
      dismissBackgroundTask(key) {
        window.sessionStorage.removeItem(jobStorage[key]);
        this.setState({ [key]: null });
      }
      startInformationJob(operation, payload) {
        return this.perform(async () => {
          if (this.state.infoStarting || this.state.informationTask && !jobFinished(this.state.informationTask)) {
            this.toast("\u8D44\u6599\u4EFB\u52A1\u6B63\u5728\u540E\u53F0\u8FD0\u884C\uFF0C\u8BF7\u5728\u540E\u53F0\u4EFB\u52A1\u4E2D\u67E5\u770B\u8FDB\u5EA6", WARN);
            return;
          }
          if (!payload.fields?.length) throw new Error("\u8BF7\u81F3\u5C11\u9009\u62E9\u4E00\u9879\u68C0\u67E5\u5185\u5BB9");
          this.setState({ infoStarting: true });
          try {
            const url = `/api/movies/local-library/information/${operation}/jobs` + (operation === "check" ? "?fields=" + id(payload.fields.join(",")) : "");
            await this.startJob("informationTask", url, payload, operation);
            this.setState({ lbCheckCfg: false });
            this.toast(`\u8D44\u6599${operation === "check" ? "\u68C0\u67E5" : "\u8865\u5168"}\u5DF2\u5728\u540E\u53F0\u542F\u52A8\uFF0C\u53EF\u5728\u540E\u53F0\u4EFB\u52A1\u4E2D\u67E5\u770B\u8FDB\u5EA6`, OK);
          } finally {
            this.setState({ infoStarting: false });
          }
        });
      }
      async pollInformation() {
        const current = this.state.informationTask;
        if (!current || jobFinished(current)) return;
        let task;
        try {
          task = await this.request("/api/movies/local-library/information/jobs/" + id(current.id));
        } catch (error) {
          if (error.status !== 404) throw error;
          task = { status: "failed", message: "\u8D44\u6599\u4EFB\u52A1\u5DF2\u5931\u6548\uFF0C\u670D\u52A1\u53EF\u80FD\u5DF2\u91CD\u542F\u6216\u7ED3\u679C\u5DF2\u8FC7\u671F\uFF0C\u8BF7\u91CD\u65B0\u68C0\u67E5" };
        }
        const next = { ...current, ...task };
        this.setState({ informationTask: next });
        if (!jobFinished(next)) return;
        this.toast(informationSummary(next) + "\uFF1B\u53EF\u5728\u540E\u53F0\u4EFB\u52A1\u4E2D\u67E5\u770B\u7ED3\u679C", next.status === "failed" || next.result?.failed_count ? WARN : OK);
        if (next.result) {
          this._readGeneration++;
          await this.perform(() => this.loadLibrary());
          const check = next.operation === "check" ? next.result : next.result.information_check;
          if (check) this.applyInformationCheck(check);
        }
      }
      showInformationResult() {
        const task = this.state.informationTask;
        this.setState({ bgOpen: false });
        if (!jobFinished(task)) {
          this.setState({ bgOpen: true });
          return;
        }
        const check = task.operation === "check" ? task.result : task.result?.information_check;
        const missing = check?.incomplete_records || [];
        this.ask({
          title: task.operation === "check" ? "\u8D44\u6599\u68C0\u67E5\u7ED3\u679C" : "\u8D44\u6599\u8865\u5168\u7ED3\u679C",
          body: informationSummary(task),
          color: task.status === "failed" || task.result?.failed_count ? WARN : ACC,
          list: [
            ...(task.result?.results || []).filter((row) => !row.success).map((row) => `${row.movie_id}\uFF1A\u8865\u5168\u5931\u8D25\uFF0C${safeText(row.asset_error || row.error, "\u8BF7\u68C0\u67E5\u522E\u524A\u6E90\u6216\u6587\u4EF6\u5199\u5165\u6743\u9650")}`),
            ...missing.map((row) => `${row.movie_id}\uFF1A${row.missing_labels?.join("\u3001") || row.missing_fields?.join("\u3001") || "\u672C\u5730\u6587\u4EF6\u5F85\u6838\u9A8C"}`)
          ],
          okText: task.status === "failed" ? "\u91CD\u65B0\u68C0\u67E5" : missing.length ? task.operation === "check" ? "\u5F00\u59CB\u8865\u5168" : "\u7EE7\u7EED\u8865\u5168" : "\u5B8C\u6210",
          run: () => task.status === "failed" ? this.startInformationJob("check", { fields: task.payload?.fields || this.state.infoFields }) : missing.length ? this.completeInformation(missing.map((row) => row.movie_id), true, check.fields) : this.dismissInformationTask()
        });
      }
      dismissInformationTask() {
        window.sessionStorage.removeItem(jobStorage.informationTask);
        this.setState({ informationTask: null });
      }
      cinemaCounts(actor) {
        if (this._cinemaCounts?.actor === actor) return this._cinemaCounts.counts;
        const counts = new Map(data.FILTER_DIMS.map((dim) => [dim.key, /* @__PURE__ */ new Map()]));
        for (const movie of data.LIB) {
          if (actor && !movie.actors.includes(actor)) continue;
          for (const [key, field] of [["actor", "actors"], ["series", "series"], ["studio", "studio"], ["res", "res"], ["flag", "tags"]]) {
            for (const value of new Set(Array.isArray(movie[field]) ? movie[field] : [movie[field]])) {
              const group = counts.get(key);
              group.set(value, (group.get(value) || 0) + 1);
            }
          }
        }
        this._cinemaCounts = { actor, counts };
        return counts;
      }
      pageItems(items, key, filters, limit = 60) {
        const signature = JSON.stringify(filters), saved = this.state[key];
        const pages = Math.max(1, Math.ceil(items.length / limit));
        const index = Math.min(saved?.signature === signature ? saved.index : 0, pages - 1);
        return { items: items.slice(index * limit, (index + 1) * limit), paging: {
          visible: pages > 1,
          text: `\u7B2C ${index + 1} / ${pages} \u9875 \xB7 \u5171 ${items.length} \u9879`,
          first: index === 0,
          last: index === pages - 1,
          prev: () => this.setState({ [key]: { signature, index: Math.max(0, index - 1) } }),
          next: () => this.setState({ [key]: { signature, index: Math.min(pages - 1, index + 1) } })
        } };
      }
      playCinema(code, fileIndex) {
        const files = this.libraryByCode.get(code)?.raw.files || [];
        const index = fileIndex ?? files.findIndex((file) => file.exists !== false);
        if (!Number.isInteger(index) || !files[index] || files[index].exists === false) {
          this.toast("\u672C\u5730\u6587\u4EF6\u7F3A\u5931\uFF0C\u8BF7\u91CD\u65B0\u626B\u63CF\u5F71\u89C6\u5E93", WARN);
          return;
        }
        this.setState({ cnPlaying: code, playerIndex: index, cnPaused: false, cnBuffering: false });
      }
      vCinema() {
        const st = this.state;
        const clearFacets = () => ({ actor: [], series: [], studio: [], res: [], flag: [] });
        const browse = (filters) => this.setState({ cnTab: "\u5168\u90E8\u5F71\u7247", cnActor: null, cnDetail: null, cnQ: "", cnF: { ...clearFacets(), ...filters } });
        const controls = {
          query: st.cnQ,
          hasQuery: Boolean(st.cnQ),
          hasLibrary: Boolean(data.LIB.length),
          filtersOpen: st.cnFiltersOpen,
          toggleFilters: (event) => {
            const open2 = event.currentTarget.open;
            if (open2 !== this.state.cnFiltersOpen) this.setState({ cnFiltersOpen: open2 });
          },
          setQuery: (event) => this.setState({ cnQ: event.target.value, cnTab: "\u5168\u90E8\u5F71\u7247", cnActor: null }),
          clearQuery: () => this.setState({ cnQ: "" }),
          browseAll: () => browse(),
          closeDetail: () => this.setState({ cnDetail: null }),
          detailOpen: Boolean(st.cnDetail || st.cnPlaying),
          playing: Boolean(st.cnPlaying),
          exit: this.go("library"),
          imageError: (event) => {
            event.currentTarget.hidden = true;
          },
          closePlayer: () => this.setState({ cnPlaying: null })
        };
        if (!data.LIB.length) return { ...controls, tabs: [], showHero: false, showShelves: false, showWall: true, showActors: false, wall: [], wallEmpty: true, wallTitle: "\u4F60\u7684\u5F71\u9662", wallMeta: "\u672C\u5730\u5F71\u7247\u6536\u85CF", emptyTitle: st.libraryLoaded ? "\u5F00\u59CB\u5EFA\u7ACB\u4F60\u7684\u5F71\u9662" : "\u6B63\u5728\u8BFB\u53D6\u5F71\u89C6\u5E93\u2026", emptyBody: "\u6DFB\u52A0\u5A92\u4F53\u8DEF\u5F84\u5E76\u626B\u63CF\u5165\u5E93\u540E\uFF0C\u5373\u53EF\u5728\u8FD9\u91CC\u6D4F\u89C8\u548C\u64AD\u653E\u3002", clearText: "\u914D\u7F6E\u5F71\u89C6\u5E93", clearFilters: this.go("library"), filterGroups: [], sorts: [], filterCount: 0, hasFilters: false };
        const view = Object.assign(super.vCinema(), controls);
        const open = (code) => this.setState({ cnHero: code, cnDetail: code, cnDetailFile: Math.max(0, this.libraryByCode.get(code)?.raw.files?.findIndex((file) => file.exists !== false) ?? 0) });
        const presentation = (movie) => ({
          code: movie.code,
          title: movie.title,
          cover: movie.cover,
          backdrop: imageSource(movie.raw.backdrop_url || movie.raw.metadata?.backdrop_url || movie.raw.cover_url || movie.raw.metadata?.cover_url || "") || movie.cover,
          meta: [movie.code, movie.date.slice(0, 4), movie.dur.startsWith("\u2014") ? "" : movie.dur, movie.res, movie.codec.toUpperCase()].filter((value) => value && value !== "\u2014").join(" \xB7 "),
          desc: movie.raw.plot || movie.raw.description || movie.raw.metadata?.plot || movie.raw.metadata?.description || [movie.actors.join(" / "), movie.studio === "\u2014" ? "" : movie.studio, movie.series === "\u2014" ? "" : movie.series].filter(Boolean).join(" \xB7 ") || "\u6682\u65E0\u5F71\u7247\u7B80\u4ECB\uFF0C\u53EF\u5728\u5F71\u89C6\u5E93\u4E2D\u8865\u5168\u8D44\u6599\u3002",
          unavailable: !(movie.raw.files || []).some((file) => file.exists !== false)
        });
        const card = (movie) => ({
          code: movie.code,
          title: movie.title,
          cover: movie.cover,
          res: movie.res === "\u2014" ? "" : movie.res,
          caption: [movie.code, movie.date.slice(0, 4)].filter(Boolean).join(" \xB7 "),
          unavailable: !(movie.raw.files || []).some((file) => file.exists !== false),
          open: () => open(movie.code)
        });
        view.tabs = view.tabs.map((tab) => ({ ...tab, current: tab.name === st.cnTab ? "page" : void 0, pick: () => this.setState({ cnTab: tab.name, cnActor: null, cnQ: "" }) }));
        const hero = this.libraryByCode.get(view.hero.code);
        Object.assign(view.hero, presentation(hero));
        view.hero.playText = view.hero.unavailable ? "\u6587\u4EF6\u7F3A\u5931" : "\u64AD\u653E";
        view.showHero = st.cnTab === "\u63A8\u8350";
        view.play = () => this.playCinema(hero.code);
        view.info = () => open(hero.code);
        view.transcode = () => this.openTranscode(hero.code);
        view.libMeta = `${data.LIB.length} \u90E8`;
        view.sort = st.cnSort;
        view.setSort = (event) => this.setState({ cnSort: event.target.value });
        view.wallTitle = view.actorHeader?.name || (st.cnQ.trim() ? "\u641C\u7D22\u7ED3\u679C" : "\u5168\u90E8\u5F71\u7247");
        view.wallMeta = st.cnQ.trim() ? `\u547D\u4E2D ${view.wall.length} \u90E8 \xB7 \u201C${st.cnQ.trim()}\u201D` : view.wallMeta;
        view.emptyTitle = "\u6CA1\u6709\u7B26\u5408\u6761\u4EF6\u7684\u5F71\u7247";
        view.emptyBody = "\u8BD5\u8BD5\u5176\u4ED6\u5173\u952E\u8BCD\uFF0C\u6216\u79FB\u9664\u7B5B\u9009\u6761\u4EF6\u3002";
        view.clearText = "\u6E05\u7A7A\u6761\u4EF6";
        view.clearFilters = () => this.setState({ cnQ: "", cnF: clearFacets(), cnFacetQueries: {}, ...Object.fromEntries(data.FILTER_DIMS.map((dim) => ["cnFacetPage_" + dim.key, null])) });
        view.activeFilters = data.FILTER_DIMS.flatMap((dim) => (view.actorHeader && dim.key === "actor" ? [] : st.cnF[dim.key]).map((value) => ({ text: `${dim.name} \xB7 ${value}`, remove: () => this.setState({ cnF: { ...st.cnF, [dim.key]: st.cnF[dim.key].filter((item) => item !== value) } }) })));
        for (const group of view.filterGroups) {
          const dim = data.FILTER_DIMS.find((dim2) => dim2.name === group.name);
          for (const item of group.items) item.on = st.cnF[dim.key].includes(item.name);
        }
        if (st.cnDetail && this.libraryByCode.has(st.cnDetail)) {
          const movie = this.libraryByCode.get(st.cnDetail), files = movie.raw.files || [];
          const index = st.cnDetailFile, file = files[index];
          view.detail = {
            ...presentation(movie),
            fileIndex: String(index),
            playText: file && file.exists !== false ? "\u64AD\u653E" : "\u6587\u4EF6\u7F3A\u5931",
            unavailable: !file || file.exists === false,
            fields: [["\u53D1\u884C\u65E5\u671F", movie.date], ["\u5236\u4F5C\u5546", movie.studio], ["\u7CFB\u5217", movie.series], ["\u5BFC\u6F14", movie.director], ["\u672C\u5730\u6587\u4EF6", `${files.length} \u4E2A \xB7 ${movie.size}`]].filter(([, value]) => value && value !== "\u2014").map(([name, value]) => ({ name, value })),
            actors: movie.actors.map((name) => ({ name, open: () => {
              this.setState({ cnTab: "\u6F14\u5458", cnActor: name, cnDetail: null, cnQ: "", cnF: clearFacets() });
            } })),
            tags: movie.tags.map((name) => ({ name, open: () => browse({ flag: [name] }) })),
            noTags: !movie.actors.length && !movie.tags.length,
            files: files.map((file2, i) => ({ value: String(i), label: `${i + 1}. ${file2.file_name || file2.path.split(/[\\/]/).pop()}${file2.exists === false ? "\uFF08\u6587\u4EF6\u7F3A\u5931\uFF09" : ""}`, missing: file2.exists === false })),
            fileMeta: file ? [size(file.size), file.media_info?.codec || movie.codec, file.media_info?.height ? `${file.media_info.height}p` : movie.res].join(" \xB7 ") : "\u6CA1\u6709\u53EF\u7528\u6587\u4EF6",
            selectFile: (event) => {
              const index2 = Number(event.target.value);
              if (files[index2] && files[index2].exists !== false) this.setState({ cnDetailFile: index2 });
            },
            play: () => this.playCinema(movie.code, index),
            manage: () => this.setState({ route: "library", lbDetail: movie.code, cnDetail: null })
          };
        }
        if (view.player) {
          const playing = this.libraryByCode.get(st.cnPlaying), files = playing.raw.files || [];
          view.player.url = `/api/movies/local-library/${id(st.cnPlaying)}/play?file_index=${st.playerIndex || 0}`;
          view.player.error = () => this.toast("\u6D4F\u89C8\u5668\u65E0\u6CD5\u64AD\u653E\u6B64\u6587\u4EF6\uFF0C\u53EF\u4ECE\u5F71\u7247\u8BE6\u60C5\u521B\u5EFA\u786C\u4EF6\u8F6C\u7801\u4EFB\u52A1", WARN);
          view.player.files = files.map((file, index) => ({ value: String(index), label: `${index + 1}. ${file.path.split(/[\\/]/).pop()}`, missing: file.exists === false }));
          view.player.fileIndex = String(st.playerIndex || 0);
          view.player.selectFile = (event) => this.playCinema(playing.code, Number(event.target.value));
          view.player.ended = () => {
            const next = files.findIndex((file, index) => index > (this.state.playerIndex || 0) && file.exists !== false);
            if (next >= 0) this.playCinema(playing.code, next);
          };
        }
        const shelf = (name, movies, filters) => ({
          name,
          meta: `${movies.length} \u90E8`,
          openAll: () => browse(filters),
          items: movies.slice(0, 12).map(card),
          previous: (event) => scrollShelf(event, -1),
          next: (event) => scrollShelf(event, 1)
        });
        const scrollShelf = (event, direction) => {
          const track = event.currentTarget.closest(".jj-cinema-shelf").querySelector(".jj-cinema-shelf-track");
          track.scrollBy({ left: direction * track.clientWidth * 0.85, behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth" });
        };
        if (st.cnTab === "\u63A8\u8350") {
          const recent = [...data.LIB].sort((a, b) => b.added.localeCompare(a.added));
          view.shelves = [shelf("\u6700\u8FD1\u5165\u5E93", recent), shelf("\u9AD8\u6E05\u6536\u85CF", recent.filter((movie) => parseInt(movie.res) >= 1080), { res: [...new Set(recent.filter((movie) => parseInt(movie.res) >= 1080).map((movie) => movie.res))] }), shelf("VR \u5F71\u5385", recent.filter((movie) => movie.vr), { flag: ["VR"] })].filter((shelf2) => shelf2.items.length);
        }
        if (["\u7CFB\u5217", "VR"].includes(st.cnTab)) {
          const vr = st.cnTab === "VR", groups = /* @__PURE__ */ new Map();
          for (const movie of data.LIB) {
            if (vr ? !movie.vr : movie.series === "\u2014") continue;
            const key = vr ? movie.res : movie.series;
            if (!groups.has(key)) groups.set(key, []);
            groups.get(key).push(movie);
          }
          view.shelves = [...groups].map(([key, movies]) => shelf(vr ? `VR ${key}` : key, movies, vr ? { res: [key], flag: ["VR"] } : { series: [key] }));
        }
        view.sectionTitle = st.cnTab === "\u7CFB\u5217" ? "\u7CFB\u5217\u6536\u85CF" : st.cnTab === "VR" ? "VR \u5F71\u5385" : "";
        view.sectionMeta = `${view.shelves.length} \u4E2A\u5206\u533A`;
        view.shelvesEmpty = !view.shelves.length;
        view.sectionEmpty = st.cnTab === "VR" ? "\u6682\u65E0 VR \u5F71\u7247" : "\u6682\u65E0\u7CFB\u5217\u6536\u85CF";
        const shelves = this.pageItems(view.shelves, "cnShelfPage", [st.cnTab], 6);
        view.shelves = shelves.items;
        view.shelfPaging = shelves.paging;
        const wall = this.pageItems(view.wall, "cnPage", [st.cnTab, st.cnActor, st.cnF, st.cnSort, st.cnQ]);
        view.wall = wall.items.map((row) => card(this.libraryByCode.get(row.code)));
        view.paging = wall.paging;
        const actors = this.pageItems(view.actors, "cnActorPage", []);
        view.actors = actors.items;
        view.actorPaging = actors.paging;
        view.actorsMeta = `${data.CN_ACTORS.length} \u4F4D\u672C\u5730\u6F14\u5458`;
        view.actorsEmpty = !data.CN_ACTORS.length;
        const avatars = new Map(data.CN_ACTORS.map((actor) => [actor.name, actor.avatar_url]));
        for (const actor of view.actors) actor.avatarUrl = avatars.get(actor.name) || "";
        return view;
      }
      saveLibraryWidths(widths) {
        this.setState({ lbWidths: widths });
        try {
          window.localStorage.setItem(libraryWidthsKey, JSON.stringify(widths));
        } catch {
        }
      }
      resizeLibraryColumn(event, index) {
        const handle = event.currentTarget, table = handle.closest("table");
        const headers = [...table.querySelectorAll("th")];
        const widths = headers.map((header) => header.getBoundingClientRect().width);
        const clamp = (width) => Math.max(libraryColumns[index][2], Math.min(1200, width));
        if (event.type === "keydown") {
          if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
          event.preventDefault();
          widths[index] = clamp(event.key === "Home" ? 0 : event.key === "End" ? 1200 : widths[index] + (event.key === "ArrowRight" ? 16 : -16));
          this.saveLibraryWidths(widths);
          return;
        }
        if (event.button !== 0 || !event.isPrimary) return;
        event.preventDefault();
        this._cancelLibraryResize?.();
        handle.focus({ preventScroll: true });
        const startX = event.clientX, startWidth = widths[index], previousWidth = table.style.width;
        const previousHeaders = headers.map((header) => header.style.width), previousValue = handle.getAttribute("aria-valuenow");
        const move = (next) => {
          widths[index] = clamp(startWidth + next.clientX - startX);
          headers.forEach((header, i) => {
            header.style.width = `${widths[i]}px`;
          });
          table.style.width = `${widths.reduce((sum, width) => sum + width, 0)}px`;
          handle.setAttribute("aria-valuenow", Math.round(widths[index]));
        };
        const finish = (commit) => {
          handle.removeEventListener("pointermove", move);
          handle.removeEventListener("pointerup", done);
          handle.removeEventListener("pointercancel", cancel);
          handle.removeEventListener("lostpointercapture", cancel);
          this._cancelLibraryResize = null;
          if (handle.hasPointerCapture(event.pointerId)) handle.releasePointerCapture(event.pointerId);
          table.classList.remove("jj-resizing");
          if (commit) this.saveLibraryWidths(widths);
          else {
            table.style.width = previousWidth;
            headers.forEach((header, i) => {
              header.style.width = previousHeaders[i];
            });
            handle.setAttribute("aria-valuenow", previousValue);
          }
        };
        const done = () => finish(true), cancel = () => finish(false);
        this._cancelLibraryResize = cancel;
        table.classList.add("jj-resizing");
        handle.setPointerCapture(event.pointerId);
        handle.addEventListener("pointermove", move);
        handle.addEventListener("pointerup", done);
        handle.addEventListener("pointercancel", cancel);
        handle.addEventListener("lostpointercapture", cancel);
      }
      vLibrary() {
        const view = super.vLibrary(), st = this.state;
        view.tableWidth = st.lbWidths.length ? `${st.lbWidths.reduce((sum, width) => sum + width, 0)}px` : "max(100%, 1150px)";
        view.columns = libraryColumns.map(([label, width, min], index) => ({
          label,
          width: st.lbWidths[index] || width,
          min,
          cssWidth: st.lbWidths.length ? `${st.lbWidths[index]}px` : { 2: "auto", 3: "24%" }[index] || `${width}px`,
          resize: (event) => this.resizeLibraryColumn(event, index)
        }));
        view.resetWidths = () => this.saveLibraryWidths([]);
        const totalSize = data.LIB.reduce((sum, movie) => sum + Number(movie.raw.total_size || 0), 0);
        view.stats = [stat("\u5F71\u7247", data.LIB.length), stat("\u6587\u4EF6", data.LIB.reduce((sum, movie) => sum + movie.files, 0)), stat("\u5360\u7528\u5BB9\u91CF", size(totalSize), "", ACC), stat("\u5F85\u8865\u8D44\u6599", st.checkResult?.incomplete_count ?? "\u5F85\u68C0\u67E5", "", WARN)];
        view.paths = st.lbPaths.map((path) => ({ path, status: "\u5DF2\u914D\u7F6E", fg: "var(--fg)", stFg: DIM, scan: () => this.scanLibrary([path]) }));
        view.sourceDirectory = st.librarySettings?.source_directory || "\u5C1A\u672A\u914D\u7F6E";
        view.sourcePath = st.lbSource;
        view.setSourcePath = (event) => this.setState({ lbSource: event.target.value });
        view.browseSource = () => this.perform(() => this.browseDirectory(st.lbSource, { key: "lbSource" }));
        view.openScrape = this.go("scrape");
        view.openPaths = () => this.openLibraryPaths();
        view.closePaths = () => this.setState({ lbPathCfg: false, lbSource: st.librarySettings?.source_directory || "", lbPaths: st.librarySettings?.directories || [], lbExcludes: st.librarySettings?.ignored_paths || [] });
        view.pathGroups = [["\u5F71\u89C6\u5E93\u76EE\u5F55\uFF08\u522E\u524A\u8F93\u51FA\uFF09", "lbPaths", "\u7B2C\u4E00\u9879\u4F5C\u4E3A\u9ED8\u8BA4\u8F93\u51FA\u76EE\u5F55\uFF0C\u4FDD\u5B58\u540E\u540C\u6B65\u5230\u672C\u5730\u522E\u524A"], ["\u6392\u9664\u76EE\u5F55", "lbExcludes", "\u626B\u63CF\u5F71\u89C6\u5E93\u65F6\u8DF3\u8FC7\u8FD9\u4E9B\u8DEF\u5F84"]].map(([name, key, hint]) => ({
          name,
          hint,
          empty: !st[key].length,
          emptyText: "\u5C1A\u672A\u6DFB\u52A0\u8DEF\u5F84",
          add: () => this.setState({ [key]: [...st[key], ""] }),
          rows: st[key].map((path, index) => ({
            path,
            status: "",
            stFg: DIM2,
            change: (event) => this.setState({ [key]: st[key].map((value, i) => i === index ? event.target.value : value) }),
            browse: () => this.perform(() => this.browseDirectory(path, { key, index })),
            remove: () => this.setState({ [key]: st[key].filter((_, i) => i !== index) })
          }))
        }));
        view.savePaths = () => this.perform(async () => {
          await this.saveLibraryPaths({ source_directory: st.lbSource, directories: st.lbPaths, ignored_paths: st.lbExcludes });
          this.setState({ lbPathCfg: false });
        }, "\u8DEF\u5F84\u914D\u7F6E\u5DF2\u4FDD\u5B58");
        view.scanAll = () => this.scanLibrary(st.librarySettings?.directories || st.lbPaths);
        view.refresh = () => this.perform(() => this.loadLibrary(), "\u5F71\u89C6\u5E93\u5DF2\u5237\u65B0");
        view.stopScan = () => this.toast("\u5F53\u524D\u626B\u63CF\u7531\u540E\u7AEF\u8FD0\u884C\uFF0C\u5B8C\u6210\u540E\u4F1A\u81EA\u52A8\u66F4\u65B0", WARN);
        view.runSearch = () => this.forceUpdate?.();
        view.checkItems = [["title", "\u6807\u9898"], ["date", "\u53D1\u884C\u65E5\u671F"], ["stars", "\u6F14\u5458"], ["genres", "\u6807\u7B7E"], ["cover_url", "\u5C01\u9762\u94FE\u63A5"], ["nfo", "NFO \u6587\u4EF6"], ["poster_file", "\u672C\u5730\u5C01\u9762"]].map(([key, label]) => ({ label, hint: "", on: st.infoFields.includes(key), toggle: () => this.setState({ infoFields: st.infoFields.includes(key) ? st.infoFields.filter((value) => value !== key) : [...st.infoFields, key] }) }));
        view.scanMessage = st.scanTask?.message || "\u626B\u63CF\u4EFB\u52A1\u8FD0\u884C\u4E2D\uFF0C\u5B8C\u6210\u540E\u81EA\u52A8\u66F4\u65B0";
        view.scanPercent = st.scanTask?.percent || 0;
        for (const row of view.rows) {
          const movie = this.libraryByCode.get(row.code);
          row.cover = movie?.cover;
          row.cNote = movie?.unchecked ? "\u672C\u5730\u6587\u4EF6\u5F85\u6838\u9A8C" : st.checkResult ? row.cNote : "\u5F85\u68C0\u67E5";
          row.completeness = st.checkResult && !movie?.unchecked ? row.completeness : "\u2014";
        }
        view.actorOptions = ["\u5168\u90E8\u6F14\u5458", ...new Set(data.LIB.flatMap((movie) => movie.actors))].map((t) => ({ t }));
        view.studioOptions = ["\u5168\u90E8\u5236\u4F5C\u5546", ...new Set(data.LIB.map((movie) => movie.studio))].map((t) => ({ t }));
        view.checkBusy = st.infoStarting || Boolean(st.informationTask && !jobFinished(st.informationTask));
        view.configureCheck = () => this.setState({ lbCheckCfg: true });
        view.openCheck = view.runCheck = () => this.startInformationJob("check", { fields: [...st.infoFields] });
        view.clean = () => this.ask({
          title: "\u6E05\u6D17\u65E0\u6548\u5A92\u4F53\u6587\u4EF6\uFF1F",
          body: "\u53EA\u5220\u9664\u786E\u8BA4\u4E3A\u7A7A\u6587\u4EF6\u6216\u4E0D\u542B\u89C6\u9891\u6D41\u7684\u6587\u4EF6\u3002\u8D85\u65F6\u3001\u8BFB\u53D6\u5931\u8D25\u7B49\u65E0\u6CD5\u786E\u8BA4\u7684\u6587\u4EF6\u4F1A\u4FDD\u7559\uFF1B\u5220\u9664\u540E\u540C\u6B65\u66F4\u65B0\u7D22\u5F15\u3002\u6B64\u64CD\u4F5C\u4E0D\u53EF\u64A4\u9500\u3002",
          ackText: "\u6211\u786E\u8BA4\u6C38\u4E45\u5220\u9664\u65E0\u6548\u89C6\u9891\u6587\u4EF6",
          color: BAD,
          okText: "\u6E05\u6D17",
          run: () => this.perform(() => this.startJob("cleanupTask", "/api/movies/local-library/clean-invalid/jobs", void 0, "cleanup"), "\u6E05\u6D17\u5DF2\u5728\u540E\u53F0\u542F\u52A8\uFF0C\u53EF\u5728\u540E\u53F0\u4EFB\u52A1\u4E2D\u67E5\u770B\u8FDB\u5EA6")
        });
        view.purgeDb = () => this.ask({
          title: "\u6E05\u7A7A\u5F71\u89C6\u5E93\u7D22\u5F15\uFF1F",
          body: "\u53EA\u6E05\u9664\u5F71\u89C6\u5E93\u7D22\u5F15\uFF0C\u4FDD\u7559\u5A92\u4F53\u6587\u4EF6\u3002",
          ackText: "\u6211\u786E\u8BA4\u6E05\u7A7A\u5168\u90E8\u7D22\u5F15",
          color: BAD,
          okText: "\u6E05\u7A7A",
          run: () => this.perform(async () => {
            await this.request("/api/movies/local-library", "DELETE");
            await this.loadLibrary();
          }, "\u5F71\u89C6\u5E93\u7D22\u5F15\u5DF2\u6E05\u7A7A")
        });
        view.actors = data.CN_ACTORS.map((actor) => ({ ...actor, avatarUrl: actor.avatar_url || "", initial: actor.name.slice(0, 1), meta: `${actor.count} \u90E8`, avatar: actor.noAvatar ? "\u6682\u65E0\u5934\u50CF" : "\u672C\u5730\u5934\u50CF", avatarFg: DIM2, open: () => this.setState({ lbActor: actor.name, lbView: "list" }) }));
        if (view.showActor) {
          const actors = this.pageItems(view.actors, "lbActorPage", []);
          view.actors = actors.items;
          view.paging = actors.paging;
        }
        view.empty = !(view.showActor ? view.actors.length : view.rows.length);
        view.showList = view.showList && !view.empty;
        view.showPoster = view.showPoster && !view.empty;
        view.emptyTitle = !st.libraryLoaded ? "\u6B63\u5728\u8BFB\u53D6\u5F71\u89C6\u5E93\u2026" : !data.LIB.length ? "\u5F00\u59CB\u5EFA\u7ACB\u4F60\u7684\u5F71\u89C6\u5E93" : view.showActor ? "\u6682\u65E0\u6F14\u5458\u4FE1\u606F" : "\u6CA1\u6709\u7B26\u5408\u6761\u4EF6\u7684\u5F71\u7247";
        view.emptyBody = !st.libraryLoaded ? "\u6B63\u5728\u52A0\u8F7D\u5F71\u7247\u4E0E\u5A92\u4F53\u4FE1\u606F\u3002" : !data.LIB.length ? "\u914D\u7F6E\u5F85\u522E\u524A\u76EE\u5F55\u548C\u5F71\u89C6\u5E93\u76EE\u5F55\uFF0C\u518D\u5230\u672C\u5730\u522E\u524A\u751F\u6210\u9884\u89C8\u5E76\u6574\u7406\u5165\u5E93\u3002\u5DF2\u6709\u6536\u85CF\u53EF\u76F4\u63A5\u626B\u63CF\u5F71\u89C6\u5E93\u76EE\u5F55\u3002" : view.showActor ? "\u626B\u63CF\u6216\u8865\u5168\u5F71\u7247\u8D44\u6599\u540E\uFF0C\u6F14\u5458\u4F1A\u51FA\u73B0\u5728\u8FD9\u91CC\u3002" : "\u8BD5\u8BD5\u5176\u4ED6\u5173\u952E\u8BCD\uFF0C\u6216\u6E05\u9664\u7B5B\u9009\u67E5\u770B\u5168\u90E8\u5F71\u7247\u3002";
        view.emptyActionText = data.LIB.length ? "\u6E05\u9664\u7B5B\u9009" : "\u914D\u7F6E\u5A92\u4F53\u76EE\u5F55";
        view.emptyAction = data.LIB.length ? view.reset : view.openPaths;
        view.showEmptyAction = st.libraryLoaded && (!view.showActor || !data.LIB.length);
        const record = data.LIB.find((movie) => movie.code === st.lbDetail);
        if (view.d && record) {
          view.d.cover = record.cover;
          view.d.fields = [["\u53D1\u884C\u65E5\u671F", record.date], ["\u5236\u4F5C\u5546", record.studio], ["\u53D1\u884C\u5546", record.label], ["\u7CFB\u5217", record.series], ["\u5206\u8FA8\u7387 / \u7F16\u7801", `${record.res} \xB7 ${record.codec}`], ["\u4F53\u79EF", record.size]].map(([k, v]) => ({ k, v, fg: "var(--fg)", mono: "inherit", fs: "12px" }));
          view.d.files = (record.raw.files || []).map((file, index) => ({
            idx: index,
            path: file.path,
            size: size(file.size),
            codec: file.media_info?.codec || record.codec,
            status: file.exists === false ? "\u6587\u4EF6\u7F3A\u5931" : "\u5DF2\u7D22\u5F15",
            stFg: file.exists === false ? BAD : OK,
            fg: "var(--fg)",
            gone: file.exists === false,
            play: () => this.setState({ cnPlaying: record.code, playerIndex: index, route: "cinema", lbDetail: null }),
            transcode: () => this.openTranscode(record.code, index)
          }));
          view.d.complete = () => this.completeInformation([record.code], true);
          view.d.recheck = () => this.completeInformation([record.code], false);
          view.d.remove = () => this.deleteMovie(record, false);
          view.d.purge = () => this.deleteMovie(record, true);
        }
        if (st.lbTc) view.tcDialog = this.transcodeDialog(st.lbTc);
        return view;
      }
      deleteMovie(movie, files) {
        this.ask({
          title: `${files ? "\u5F7B\u5E95\u5220\u9664" : "\u79FB\u9664"} ${movie.code}\uFF1F`,
          color: files ? BAD : WARN,
          okText: files ? "\u6C38\u4E45\u5220\u9664\u6587\u4EF6" : "\u79FB\u9664\u8BB0\u5F55",
          body: files ? "\u6C38\u4E45\u5220\u9664\u5DF2\u767B\u8BB0\u7684\u5A92\u4F53\u53CA\u914D\u5957\u6587\u4EF6\uFF0C\u5E76\u79FB\u9664\u7D22\u5F15\u3002\u6B64\u64CD\u4F5C\u4E0D\u53EF\u64A4\u9500\u3002" : "\u4EC5\u79FB\u9664\u7D22\u5F15\uFF0C\u4FDD\u7559\u786C\u76D8\u6587\u4EF6\u3002",
          ackText: files ? "\u6211\u786E\u8BA4\u6C38\u4E45\u5220\u9664\u8FD9\u4E9B\u6587\u4EF6" : "",
          list: files ? (movie.raw.files || []).map((file) => file.path) : [],
          run: () => this.perform(async () => {
            await this.request(`/api/movies/local-library/${id(movie.code)}${files ? "/files" : ""}`, "DELETE");
            this.setState({ lbDetail: null });
            await this.loadLibrary();
          }, files ? "\u6587\u4EF6\u5DF2\u5220\u9664" : "\u8BB0\u5F55\u5DF2\u79FB\u9664")
        });
      }
      completeInformation(codes, onlyMissing, fields = this.state.infoFields) {
        return this.startInformationJob("download", { movie_ids: codes, fields, only_missing: onlyMissing, write_nfo: true, download_images: true, overwrite_existing: !onlyMissing });
      }
      scanLibrary(paths) {
        const directories = paths.map((path) => path.trim()).filter(Boolean);
        if (!directories.length) {
          this.setState({ lbPathCfg: true });
          return;
        }
        this.ask({
          title: "\u626B\u63CF\u5165\u5E93\uFF1F",
          body: "\u626B\u63CF\u5F71\u89C6\u5E93\u76EE\u5F55\u5E76\u5BFC\u5165\u5A92\u4F53\u4E0E NFO \u4FE1\u606F\uFF0C\u8DF3\u8FC7\u5F85\u522E\u524A\u76EE\u5F55\u3002",
          list: directories,
          color: ACC,
          okText: "\u5F00\u59CB\u626B\u63CF",
          run: () => this.perform(async () => {
            await this.startJob("scanTask", "/api/movies/local-library/scan/jobs", { directories, ignored_paths: this.state.lbExcludes, recursive: true, probe_media: true }, "scan");
            this.setState({ lbScanning: true });
          }, "\u540E\u53F0\u626B\u63CF\u5DF2\u542F\u52A8")
        });
      }
      openTranscode(code, fileIndex = 0) {
        return this.perform(async () => {
          const selection = { code, fileIndex };
          this.setState({ route: "library", lbTc: selection, tcCaps: {}, tcOptions: {}, lbTcPreset: "", tcCapsLoading: true });
          try {
            await this.loadTranscodes(true);
            if (this.state.lbTc !== selection || this._disposed) return;
            const preset = this.state.tcCaps.presets?.find((item) => item.id === "adaptive_h265" && item.available !== false) || this.state.tcCaps.presets?.find((item) => item.available !== false);
            this.setState({ lbTcPreset: preset?.id || "" });
          } finally {
            this.setState({ tcCapsLoading: false });
          }
        });
      }
      transcodeDialog(selection) {
        const movie = data.LIB.find((item) => item.code === selection.code);
        if (!movie) return null;
        const caps = this.state.tcCaps, presets = caps.presets || [], st = this.state;
        const preset = presets.find((item) => item.id === st.lbTcPreset);
        return {
          code: movie.code,
          file: movie.raw.files?.[selection.fileIndex]?.path || "",
          src: [{ k: "\u7F16\u7801", v: movie.codec }, { k: "\u5206\u8FA8\u7387", v: movie.res }, { k: "\u4F53\u79EF", v: movie.size }],
          presets: presets.map((item) => ({
            name: item.name,
            tag: item.available === false ? "\u4E0D\u53EF\u7528" : item.options?.video_codec || "",
            desc: item.description,
            codec: item.options?.video_codec,
            estimate: "",
            on: st.lbTcPreset === item.id,
            disabled: item.available === false || !caps.gpu_available,
            cursor: "pointer",
            op: item.available === false ? ".5" : "1",
            bg: st.lbTcPreset === item.id ? "rgba(145,132,217,.09)" : "var(--t03)",
            ring: st.lbTcPreset === item.id ? ACC : "var(--t09)",
            tagFg: ACC,
            tagBg: "var(--t08)",
            codecFg: DIM,
            pick: () => this.setState({ lbTcPreset: item.id, tcOptions: {} })
          })),
          custom: Boolean(preset) && !preset.adaptive,
          canSubmit: !st.tcCapsLoading && caps.gpu_available && preset?.available !== false && Boolean(preset),
          customFields: [
            this.formField("\u7F16\u7801\u5668", st.tcOptions.video_codec ?? preset?.options?.video_codec ?? "", (value) => this.setState({ tcOptions: { ...st.tcOptions, video_codec: value } }), "select", caps.available_encoders || []),
            this.formField("CQ / CRF", st.tcOptions.crf ?? preset?.options?.crf ?? 24, (value) => this.setState({ tcOptions: { ...st.tcOptions, crf: Number(value) } })),
            this.formField("\u6700\u5927\u9AD8\u5EA6\uFF08\u7559\u7A7A\u4FDD\u6301\u539F\u59CB\uFF09", st.tcOptions.max_height ?? "", (value) => this.setState({ tcOptions: { ...st.tcOptions, max_height: value ? Number(value) : null } })),
            ...[["quality_mode", "\u8D28\u91CF\u6A21\u5F0F", "select", ["crf", "bitrate"]], ["video_bitrate_kbps", "\u89C6\u9891\u7801\u7387 kbps", "number"], ["speed_preset", "\u901F\u5EA6\u9884\u8BBE", "select", ["ultrafast", "superfast", "veryfast", "faster", "fast", "medium", "slow", "slower", "veryslow"]], ["frame_rate", "\u5E27\u7387", "number"], ["pixel_format", "\u50CF\u7D20\u683C\u5F0F", "select", ["auto", "yuv420p", "yuv420p10le"]], ["audio_codec", "\u97F3\u9891\u7F16\u7801", "select", caps.audio_codecs || ["copy", "aac"]], ["audio_bitrate_kbps", "\u97F3\u9891\u7801\u7387 kbps", "number"], ["audio_channels", "\u97F3\u9891\u58F0\u9053", "number"], ["copy_subtitles", "\u4FDD\u7559\u5B57\u5E55", "check"], ["copy_metadata", "\u4FDD\u7559\u5143\u6570\u636E", "check"], ["deinterlace", "\u53BB\u9694\u884C", "check"]].map(([key, label, kind, options]) => this.formField(label, st.tcOptions[key] ?? preset?.options?.[key] ?? "", (value) => this.setState({ tcOptions: { ...st.tcOptions, [key]: value === "" || kind === "number" && value === 0 ? null : value } }), kind, options))
          ],
          note: st.tcCapsLoading ? "\u6B63\u5728\u68C0\u6D4B GPU \u548C\u53EF\u7528\u8F6C\u7801\u9884\u8BBE\u2026" : caps.gpu_available ? "\u4EC5\u5BF9\u5F53\u524D\u9009\u4E2D\u6587\u4EF6\u521B\u5EFA\u786C\u4EF6\u8F6C\u7801\u4EFB\u52A1\uFF0C\u8F93\u51FA\u66F4\u5C0F\u65F6\u624D\u66FF\u6362\u3002" : "\u672A\u68C0\u6D4B\u5230\u53EF\u7528 GPU\uFF0C\u65E0\u6CD5\u521B\u5EFA\u8F6C\u7801\u4EFB\u52A1\u3002",
          openPanel: this.go("transcode"),
          submit: () => this.perform(async () => {
            if (!caps.gpu_available || !preset || preset.available === false) throw new Error("\u6CA1\u6709\u53EF\u7528\u7684 GPU \u8F6C\u7801\u9884\u8BBE");
            await this.request("/api/movies/transcoding/tasks", "POST", { movie_id: movie.code, file_index: selection.fileIndex, preset_id: st.lbTcPreset, options: preset.adaptive ? {} : st.tcOptions });
            this.setState({ lbTc: null, lbDetail: null, route: "transcode" });
            await this.loadTranscodes();
          }, "\u8F6C\u7801\u4EFB\u52A1\u5DF2\u521B\u5EFA")
        };
      }
      transcodeAction(task, action, method = "POST") {
        return this.perform(async () => {
          await this.request(`/api/movies/transcoding/tasks/${id(task.id)}${action ? "/" + action : ""}`, method);
          await this.loadTranscodes();
        }, "\u8F6C\u7801\u4EFB\u52A1\u5DF2\u66F4\u65B0");
      }
      vTranscode() {
        const view = super.vTranscode(), caps = this.state.tcCaps;
        const page = this.pageItems(view.rows, "tcPage", [this.state.tcF]);
        view.rows = page.items;
        view.paging = page.paging;
        const active = data.TC.filter((task) => ["running", "queued"].includes(task.status)), done = data.TC.filter((task) => task.status === "completed"), bad = data.TC.filter((task) => ["failed", "cancelled"].includes(task.status));
        view.stats = [stat("\u6D3B\u52A8\u4EFB\u52A1", active.length), stat("\u5DF2\u5B8C\u6210", done.length, "", OK), stat("\u5F02\u5E38 / \u53D6\u6D88", bad.length, "", WARN), stat("\u8282\u7701\u7A7A\u95F4", size(done.reduce((sum, task) => sum + Math.max(0, task.raw.input_size - task.raw.output_size), 0)), "", ACC)];
        view.nActive = active.length;
        view.nDone = done.length;
        view.nBad = bad.length;
        view.maxConcurrent = caps.max_concurrent_tasks ?? "\u2014";
        view.hardwareMessage = caps.gpu_error ? safeText(caps.gpu_error) : caps.gpu_available ? "\u786C\u4EF6\u68C0\u6D4B\u901A\u8FC7\uFF1B\u53EA\u63D0\u4F9B\u5F53\u524D\u8BBE\u5907\u53EF\u7528\u7684\u9884\u8BBE\u3002" : "\u672A\u68C0\u6D4B\u5230\u53EF\u7528\u7684 GPU \u786C\u4EF6\u7F16\u7801\u5668\uFF0C\u8BF7\u68C0\u67E5 FFmpeg \u548C\u663E\u5361\u9A71\u52A8\u3002";
        view.caps = [["FFmpeg", caps.ffmpeg_available], ["ffprobe", caps.ffprobe_available], ["GPU", caps.gpu_available]].map(([label, available]) => ({ label, value: available === void 0 ? "\u5F85\u68C0\u6D4B" : available ? "\u53EF\u7528" : "\u4E0D\u53EF\u7528", dot: available ? OK : DIM2, fg: DIM }));
        view.presets = (caps.presets || []).map((preset) => ({ name: preset.name, desc: preset.description, codec: preset.options?.video_codec, op: preset.available === false ? ".5" : "1", bg: "var(--t03)", ring: "var(--t09)", tagBg: "var(--t08)", tagFg: ACC, codecFg: DIM, tag: preset.available === false ? "\u4E0D\u53EF\u7528" : "\u53EF\u7528" }));
        view.refresh = () => this.perform(() => this.loadTranscodes(true), "\u8F6C\u7801\u961F\u5217\u5DF2\u5237\u65B0");
        view.clean = () => this.ask({ title: "\u6E05\u7406\u5B8C\u6210\u8BB0\u5F55\uFF1F", body: "\u4EC5\u79FB\u9664\u5DF2\u5B8C\u6210\u4EFB\u52A1\u7684\u8BB0\u5F55\uFF0C\u4FDD\u7559\u5A92\u4F53\u6587\u4EF6\u3002", color: WARN, okText: "\u6E05\u7406", run: () => this.perform(async () => {
          for (const task of done) await this.request(`/api/movies/transcoding/tasks/${id(task.id)}`, "DELETE");
          await this.loadTranscodes();
        }, "\u5B8C\u6210\u8BB0\u5F55\u5DF2\u6E05\u7406") });
        for (const row of view.rows) {
          const task = data.TC.find((item) => item.id === row.id);
          row.canDelete = ["completed", "failed", "cancelled"].includes(task.status);
          row.cancel = () => this.ask({ title: `\u53D6\u6D88 ${task.code} \u8F6C\u7801\uFF1F`, body: "\u7EC8\u6B62\u7F16\u7801\u5E76\u4FDD\u7559\u539F\u6587\u4EF6\u3002", color: WARN, okText: "\u53D6\u6D88\u4EFB\u52A1", run: () => this.transcodeAction(task, "cancel") });
          row.retry = () => this.transcodeAction(task, "retry");
          row.del = () => this.transcodeAction(task, "", "DELETE");
        }
        if (view.d) {
          const task = data.TC.find((item) => item.id === this.state.tcDetail);
          view.d.fields = [["\u6587\u4EF6", task.file], ["\u7F16\u7801\u5668", task.codec], ["\u786C\u4EF6", task.gpu], ["\u8F93\u5165\u5927\u5C0F", task.inSize], ["\u8F93\u51FA\u5927\u5C0F", task.outSize]].map(([k, v]) => ({ k, v, mono: "inherit", fs: "12px" }));
          view.d.retry = () => this.transcodeAction(task, "retry");
          view.d.cancel = () => this.transcodeAction(task, "cancel");
          view.d.copy = () => this.perform(() => this.copyText(JSON.stringify(task.raw.options, null, 2)), "\u8F6C\u7801\u53C2\u6570\u5DF2\u590D\u5236");
        }
        return view;
      }
      scrapePayload() {
        const st = this.state, opts = { ...st.scOpts };
        for (const key of ["write_nfo", "download_images", "download_sample_images", "download_actor_images", "download_list_thumbnail"]) opts[key] = Boolean(opts[key] && opts.scrape && (["write_nfo", "download_images"].includes(key) || opts.download_images));
        return {
          ...opts,
          directory: st.scScanDir,
          target_directory: st.scOutDir || null,
          code_overrides: st.scOverrides || {},
          folder_template: st.scFolderRule,
          naming_template: st.scFileRule,
          max_depth: st.scMaxDepth === "" ? null : Number(st.scMaxDepth),
          concurrent: Number(st.scConcurrent)
        };
      }
      previewScrape() {
        return this.perform(async () => {
          if (this.state.scPhase === "scanning") throw new Error("\u5F53\u524D\u4EFB\u52A1\u8FD0\u884C\u4E2D\uFF0C\u8BF7\u7B49\u5F85\u5B8C\u6210");
          if (!this.state.scScanDir.trim()) throw new Error("\u8BF7\u586B\u5199\u626B\u63CF\u76EE\u5F55");
          if (this.state.scOpts.organize && !this.state.scOutDir.trim()) throw new Error("\u8BF7\u9009\u62E9\u5F71\u89C6\u5E93\u76EE\u5F55\uFF1B\u5982\u9700\u539F\u5730\u522E\u524A\uFF0C\u8BF7\u5173\u95ED\u201C\u6574\u7406\u5230\u76EE\u6807\u76EE\u5F55\u201D");
          const payload = this.scrapePayload();
          if (!Number.isInteger(payload.concurrent) || payload.concurrent < 1 || payload.concurrent > 5) throw new Error("\u5E76\u53D1\u6570\u5E94\u4E3A 1\u20135 \u7684\u6574\u6570");
          if (payload.max_depth !== null && (!Number.isInteger(payload.max_depth) || payload.max_depth < 0)) throw new Error("\u9012\u5F52\u6DF1\u5EA6\u5E94\u4E3A\u975E\u8D1F\u6574\u6570\u6216\u7559\u7A7A");
          const task = await this.startJob("scrapeTask", "/api/movies/local-scrape/preview/jobs", payload);
          this.scrapePreviewConfig = JSON.stringify(payload);
          this.setState({ scPhase: "scanning", scPct: 0, scRepair: null });
          return task;
        });
      }
      applyScrapeResult(result) {
        if (!result || result.success === false) {
          this.setState({ scPhase: "idle" });
          throw new Error("\u522E\u524A\u4EFB\u52A1\u5931\u8D25");
        }
        this.setState({ scrapeResult: result, scPhase: "preview", scPct: 100, scSkip: [], pathEdits: {}, scCmp: null, scInspect: null });
        const side = (file) => ({ size: size(file?.size), res: file?.height ? `${file.height}p` : "\u2014", codec: file?.codec || "\u2014", bitrate: file?.bitrate || "\u2014", dur: file?.duration_seconds || "\u2014", date: file?.modified_at || "\u2014", path: file?.path || "\u2014" });
        data.SCRAPE_ROWS.splice(0, data.SCRAPE_ROWS.length, ...(result.items || []).map((item) => ({
          raw: item,
          src: item.source_path,
          srcMeta: size(item.size || item.source_file?.size),
          code: item.code || "\u672A\u8BC6\u522B",
          dst: item.target_video_path || item.target_path || "\u2014",
          dstMeta: "",
          kind: item.target_duplicate || !(isConformingLocalScrapeItem(item) || !this.state.scOpts.scrape && item.scrape_status === "recognized" && item.code) ? "error" : item.target_exists ? "conflict" : "ok",
          note: item.target_duplicate ? "\u591A\u4E2A\u6E90\u6587\u4EF6\u6307\u5411\u540C\u4E00\u76EE\u6807\uFF0C\u8BF7\u4FEE\u6539\u547D\u540D\u89C4\u5219" : getLocalScrapeIssueReason(item),
          existing: side(item.target_file),
          incoming: side(item.source_file),
          betterSide: ""
        })));
      }
      executeScrape(organize = this.state.scOpts.organize) {
        if (this.scrapePreviewConfig !== JSON.stringify(this.scrapePayload())) {
          this.toast("\u914D\u7F6E\u5DF2\u6539\u53D8\uFF0C\u8BF7\u91CD\u65B0\u751F\u6210\u9884\u89C8\u540E\u6267\u884C", WARN);
          return;
        }
        const skipped = new Set(this.state.scSkip), rows = data.SCRAPE_ROWS.filter((row) => row.kind !== "error" && !skipped.has(row.src));
        if (!rows.length) {
          this.toast("\u8BF7\u5148\u751F\u6210\u9884\u89C8\u5E76\u9009\u62E9\u53EF\u6267\u884C\u6587\u4EF6", WARN);
          return;
        }
        this.ask({
          title: "\u6267\u884C\u522E\u524A\u6574\u7406\uFF1F",
          color: WARN,
          okText: "\u5F00\u59CB\u6267\u884C",
          ackText: organize ? "\u6211\u5DF2\u786E\u8BA4\u76EE\u6807\u8DEF\u5F84\u4E0E\u51B2\u7A81\u5904\u7406\u89C4\u5219" : "",
          body: organize ? "\u4F1A\u6309\u9884\u89C8\u79FB\u52A8\u6216\u66FF\u6362\u6587\u4EF6\uFF0C\u8BF7\u786E\u8BA4\u51B2\u7A81\u5904\u7406\u3002" : "\u5728\u539F\u76EE\u5F55\u5199\u5165\u5143\u6570\u636E\u4E0E\u56FE\u7247\uFF0C\u4E0D\u79FB\u52A8\u89C6\u9891\u3002",
          list: rows.map((row) => row.src),
          run: () => this.perform(async () => {
            const payload = { ...this.scrapePayload(), organize, items: rows.map((row) => ({ source_path: row.src, target_video_path: organize ? row.raw.target_video_path : void 0, code: row.raw.code, metadata: row.raw.metadata, conflict_resolution: this.state.pathEdits[row.src] || (row.kind === "conflict" ? null : void 0) })) };
            if (organize && rows.some((row) => row.kind === "conflict" && !this.state.pathEdits[row.src])) throw new Error("\u8BF7\u5148\u4E3A\u51B2\u7A81\u6587\u4EF6\u9009\u62E9\u4FDD\u7559\u7B56\u7565");
            await this.startJob("scrapeTask", "/api/movies/local-scrape/apply/jobs", payload, "apply");
            this.setState({ scPhase: "scanning" });
          }, "\u522E\u524A\u6267\u884C\u5DF2\u542F\u52A8")
        });
      }
      vScrape() {
        const view = super.vScrape(), st = this.state, rows = data.SCRAPE_ROWS;
        view.namingFields = LOCAL_SCRAPE_NAMING_FIELDS.map((field) => field.placeholder).join(" ");
        view.browseSource = () => this.perform(() => this.browseDirectory(st.scScanDir, { key: "scScanDir" }));
        view.browseTarget = () => this.perform(() => this.browseDirectory(st.scOutDir, { key: "scOutDir" }));
        view.configurePaths = () => {
          this.openLibraryPaths();
          this.setState({ route: "library" });
        };
        const outcome = st.scPhase === "idle" && st.scrapeResult?.results ? this.pageItems(st.scrapeResult.results, "scOutcomePage", []) : null;
        view.outcome = outcome ? {
          summary: `${st.scrapeResult.success_count || 0} \u6210\u529F\uFF0C${st.scrapeResult.failed_count || 0} \u5931\u8D25${st.scrapeResult.library_failed_count ? `\uFF0C${st.scrapeResult.library_failed_count} \u4E2A\u76EE\u5F55\u5165\u5E93\u5931\u8D25\uFF0C\u8BF7\u5230\u5F71\u89C6\u5E93\u91CD\u65B0\u626B\u63CF` : ""}`,
          rows: outcome.items.map((item) => ({ path: item.target_video_path || item.source_path, status: item.success ? item.skipped ? "\u5DF2\u8DF3\u8FC7" : "\u5DF2\u5B8C\u6210" : "\u5931\u8D25", note: safeText(item.message || item.error || item.image_error, ""), fg: item.success ? OK : BAD })),
          paging: outcome.paging
        } : null;
        if (view.outcome) view.idle = false;
        view.setScanDir = (event) => this.setState({ scScanDir: event.target.value, scOverrides: {} });
        view.repair = st.scRepair ? {
          src: st.scRepair.src,
          code: st.scRepair.code,
          setCode: (event) => this.setState({ scRepair: { ...st.scRepair, code: event.target.value.toUpperCase() } }),
          cancel: () => this.setState({ scRepair: null }),
          submit: () => this.perform(async () => {
            if (!st.scRepair.code.trim()) throw new Error("\u8BF7\u586B\u5199\u6B63\u786E\u756A\u53F7");
            this.setState({ scOverrides: { ...st.scOverrides, [st.scRepair.src]: st.scRepair.code.trim() } });
            return this.previewScrape();
          })
        } : null;
        view.openDesigner = () => this.setState({ scDesigner: true, scParts: st.scFileRule.match(/\{[^}]+\}|[^{}]+/g) || [] });
        if (view.designer) {
          view.designer.vars = [...LOCAL_SCRAPE_NAMING_FIELDS.map((field) => field.placeholder), " ", "-"].map((value) => ({ t: value === " " ? "\u7A7A\u683C" : value, add: () => this.setState({ scParts: [...st.scParts, value] }) }));
          view.designer.preview = LOCAL_SCRAPE_NAMING_FIELDS.reduce((text, field) => text.replaceAll(field.placeholder, field.sample), st.scParts.join("")) + ".mkv";
        }
        view.subtitle = st.scPhase === "preview" ? `\u626B\u63CF ${st.scScanDir} \xB7 ${rows.length} \u4E2A\u6587\u4EF6` : st.scPhase === "scanning" ? "\u540E\u53F0\u4EFB\u52A1\u8FD0\u884C\u4E2D" : "\u914D\u7F6E\u626B\u63CF\u8DEF\u5F84\u540E\u751F\u6210\u9884\u89C8";
        view.scanLog = (st.scrapeTask?.logs || []).map((entry) => ({ t: safeText(typeof entry === "string" ? entry : entry.message), fg: DIM }));
        view.stats = [stat("\u626B\u63CF\u6587\u4EF6", st.scrapeResult?.total_files ?? rows.length), stat("\u53EF\u6267\u884C", rows.filter((row) => row.kind === "ok").length, "", OK), stat("\u6587\u4EF6\u51B2\u7A81", rows.filter((row) => row.kind === "conflict").length, "", WARN), stat("\u5F02\u5E38", rows.filter((row) => row.kind === "error").length, "", BAD)];
        const optionNames = { writeNfo: "write_nfo", downloadImages: "download_images", downloadSampleImages: "download_sample_images", downloadActorImages: "download_actor_images", downloadListThumbnail: "download_list_thumbnail", overwriteExisting: "overwrite_existing", recursive: "recursive", scrape: "scrape", organize: "organize" };
        view.templates = st.scrapeTemplates.map((template) => ({
          name: template.name,
          path: `${template.values.directory} \u2192 ${template.values.targetDirectory || "\u539F\u76EE\u5F55"}`,
          used: "",
          bg: "transparent",
          ring: "var(--t09)",
          pick: () => this.setState({ scScanDir: template.values.directory, scOutDir: template.values.targetDirectory || "", scFolderRule: template.values.folderTemplate, scFileRule: template.values.namingTemplate, scMaxDepth: template.values.maxDepth ?? "", scConcurrent: template.values.concurrent, scOpts: Object.fromEntries(Object.entries(optionNames).map(([key, name]) => [name, template.values[key]])) }),
          remove: () => this.setState({ scrapeTemplates: deleteLocalScrapeTaskTemplate(window.localStorage, template.id) })
        }));
        view.saveTpl = () => this.perform(async () => {
          saveLocalScrapeTaskTemplate(window.localStorage, `\u522E\u524A\u6A21\u677F ${st.scrapeTemplates.length + 1}`, { directory: st.scScanDir, targetDirectory: st.scOutDir, folderTemplate: st.scFolderRule, namingTemplate: st.scFileRule, maxDepth: st.scMaxDepth, concurrent: st.scConcurrent, ...Object.fromEntries(Object.entries(optionNames).map(([key, name]) => [key, st.scOpts[name]])) });
          this.setState({ scrapeTemplates: loadLocalScrapeTaskTemplates() });
        }, "\u6A21\u677F\u5DF2\u4FDD\u5B58");
        view.preview = () => this.previewScrape();
        view.reset = () => {
          if (st.scPhase === "scanning") {
            this.toast("\u540E\u53F0\u4EFB\u52A1\u8FD0\u884C\u4E2D\uFF0C\u8BF7\u7B49\u5F85\u5B8C\u6210", WARN);
            return;
          }
          this.dismissBackgroundTask("scrapeTask");
          data.SCRAPE_ROWS.splice(0);
          this.scrapePreviewConfig = null;
          this.setState({ scPhase: "idle", scrapeResult: null, scSkip: [], scPct: 0, pathEdits: {}, scScanDir: st.librarySettings?.source_directory || st.scScanDir, scOutDir: st.librarySettings?.directories?.[0] || st.scOutDir });
        };
        view.applyStrategy = () => {
          const strategy = st.scStrategy.split(" ")[0];
          this.setState({ pathEdits: { ...st.pathEdits, ...Object.fromEntries(rows.filter((row) => row.kind === "conflict").map((row) => [row.src, strategy])) } });
          this.toast("\u5DF2\u4E3A\u51B2\u7A81\u9879\u8BBE\u7F6E\u5904\u7406\u7B56\u7565");
        };
        view.execute = () => this.executeScrape();
        view.dryRun = () => this.executeScrape(false);
        const skipped = new Set(st.scSkip);
        view.execNote = `${rows.filter((row) => row.kind !== "error" && !skipped.has(row.src)).length} \u4E2A\u5F85\u5904\u7406\u6587\u4EF6`;
        if (view.cmp) {
          view.cmp.sides.forEach((side, index) => {
            side.better = false;
            side.keep = () => this.setState({ pathEdits: { ...st.pathEdits, [st.scCmp]: index === 0 ? "keep_target" : "keep_source" }, scCmp: null });
          });
          view.cmp.skip = () => this.setState({ scSkip: [...st.scSkip, st.scCmp], scCmp: null });
        }
        const page = this.pageItems(view.rows, "scPage", [st.scF, st.scPhase]);
        view.rows = page.items;
        view.paging = page.paging;
        for (const row of view.rows) {
          if (st.pathEdits[row.src]) row.note = `\u5904\u7406\u7B56\u7565\uFF1A${st.pathEdits[row.src]}`;
          row.inspect = () => this.ask({ title: row.code, body: rows.find((item) => item.src === row.src)?.note || row.src, color: DIM, okText: "\u5173\u95ED" });
          row.fix = () => this.setState({ scRepair: { src: row.src, code: rows.find((item) => item.src === row.src)?.raw.code || "" } });
        }
        return view;
      }
      vDispatch() {
        const st = this.state, codes = [...new Set((st.dScope === "1" ? data.MOVIES.map((movie) => movie.code) : st.dScope === "2" ? st.sel : st.dCodes.split(/[\s,，]+/)).map((code) => code.trim().toUpperCase()).filter(Boolean))];
        const failureMap = /* @__PURE__ */ new Map();
        for (const record of data.HISTORY) for (const resource of record.failed_resources || []) {
          const result = { movie_id: record.movie_id, magnet: resource.link, source: resource.source, tool: toolName(resource.tool), success: false, message: "\u4E0A\u6B21\u6D3E\u53D1\u672A\u6210\u529F\u63D0\u4EA4\uFF0C\u53EF\u91CD\u8BD5\u6B64\u8D44\u6E90" };
          failureMap.set(`${result.movie_id}:${result.magnet}`, result);
        }
        for (const result of st.dispatchResult?.results || []) if (result.success === false && !result.skipped) failureMap.set(`${result.movie_id}:${result.magnet || ""}`, { ...result, tool: st.dispatchTool });
        const failed = [...failureMap.values()], failures = this.pageItems(failed, "failedPage", []);
        const failedRows = failures.items.map((result) => ({
          code: result.movie_id || "",
          reason: safeText(result.message || result.error),
          tool: result.tool,
          time: "",
          raw: result,
          noRetry: !result.movie_id,
          retry: () => this.confirmDispatch([result.movie_id], result.magnet ? [{ link: result.magnet, movie_id: result.movie_id, source: result.source }] : void 0, result.tool),
          skip: () => this.perform(async () => {
            if (result.movie_id && result.magnet) await this.request(`/api/history/${id(result.movie_id)}/dismiss-failure`, "POST", { link: result.magnet });
            this.setState({ dispatchResult: { ...st.dispatchResult, results: (st.dispatchResult?.results || []).filter((item) => !(item.movie_id === result.movie_id && item.magnet === result.magnet)) } });
            await this.loadHistory();
          }, "\u5DF2\u5FFD\u7565\u8BE5\u5931\u8D25\u9879")
        }));
        const history = data.HISTORY;
        const page = this.pageItems(history.filter((record) => st.dHf === "0" || (st.dHf === "1" ? record.needs_reselect : record.status === "failed")), "historyPage", [st.dHf]);
        const historyRows = page.items.map((record) => {
          const resource = selectHistoryRedispatchResource(record);
          return {
            raw: record,
            code: record.movie_id || record.id || "",
            title: record.title || "",
            res: resource?.link || "",
            src: resource?.source || "",
            tool: record.download_tool || record.tool || "",
            time: record.timestamp || record.download_time || record.date || "",
            status: { submitted: "\u5DF2\u63D0\u4EA4", failed: "\u6D3E\u53D1\u5931\u8D25", ignored: "\u5DF2\u5FFD\u7565" }[record.status] || record.status || "\u5DF2\u8BB0\u5F55",
            local: record.in_local_library ? "\u5DF2\u5165\u5E93" : record.needs_reselect ? "\u672A\u5165\u5E93" : "\u5F85\u6838\u5BF9",
            stBg: "var(--t08)",
            stFg: DIM,
            localFg: DIM2,
            actText: "\u91CD\u65B0\u6D3E\u53D1",
            act: () => {
              const resource2 = selectHistoryRedispatchResource(record, sourceKey(st.dSrc));
              this.confirmDispatch([record.movie_id || record.id], resource2 ? [{ ...resource2, movie_id: record.movie_id || record.id }] : void 0);
            }
          };
        });
        return {
          tool: st.tool,
          src: st.dSrc,
          tools: this.toolStates().map((tool) => ({ ...tool, key: tool.name, status: tool.hint, meta: "", active: st.tool === tool.name, bg: st.tool === tool.name ? "var(--t08)" : "transparent", ring: "var(--t09)", needsAction: !tool.connected, actionText: "\u914D\u7F6E", pick: () => this.setState({ tool: tool.name }), action: () => this.setState({ route: "settings", seTab: tool.name }) })),
          scope1: st.dScope === "1",
          scope2: st.dScope === "2",
          scope3: st.dScope === "3",
          setScope1: () => this.setState({ dScope: "1" }),
          setScope2: () => this.setState({ dScope: "2" }),
          setScope3: () => this.setState({ dScope: "3" }),
          codes: st.dCodes,
          setCodes: (event) => this.setState({ dCodes: event.target.value }),
          setSrc: (event) => this.setState({ dSrc: event.target.value }),
          subOnly: st.dSubOnly,
          toggleSub: () => this.setState({ dSubOnly: !st.dSubOnly }),
          no4k: st.dNo4k,
          toggle4k: () => this.setState({ dNo4k: !st.dNo4k }),
          skipLocal: true,
          toggleSkipLocal: () => {
          },
          skipTried: true,
          toggleSkipTried: () => {
          },
          runCount: codes.length,
          run: () => this.confirmDispatch(codes),
          stats: [stat("\u5386\u53F2\u8BB0\u5F55", history.length), stat("PikPak", st.pikLogged ? "\u5DF2\u767B\u5F55" : "\u672A\u767B\u5F55"), stat("Aria2", st.connections.aria2_connected ? "\u5DF2\u8FDE\u63A5" : "\u672A\u8FDE\u63A5"), stat("115 \u7F51\u76D8", this.allConnected() ? "\u5DF2\u914D\u7F6E" : "\u672A\u914D\u7F6E")],
          failed: failedRows,
          failedPaging: failures.paging,
          hasFailed: failed.length > 0,
          batchSummary: `\u5931\u8D25 ${failed.length} \u9879`,
          retryAll: () => this.confirmDispatch(failed.map((item) => item.movie_id).filter(Boolean), failed.every((item) => item.magnet) ? failed.map((item) => ({ link: item.magnet, movie_id: item.movie_id, source: item.source })) : void 0),
          historyCount: history.length,
          missingCount: history.filter((item) => item.needs_reselect).length,
          failureCount: history.filter((item) => item.status === "failed").length,
          hf0: st.dHf === "0",
          hf1: st.dHf === "1",
          hf2: st.dHf === "2",
          setHf0: () => this.setState({ dHf: "0" }),
          setHf1: () => this.setState({ dHf: "1" }),
          setHf2: () => this.setState({ dHf: "2" }),
          checkNote: st.dChecked ? "\u5DF2\u6838\u5BF9\u672C\u5730\u5E93" : "\u5C1A\u672A\u6838\u5BF9\u672C\u5730\u5E93",
          check: () => this.perform(async () => {
            const result = await this.request("/api/history/check-local-library", "POST");
            data.HISTORY.splice(0, data.HISTORY.length, ...result.records || []);
            this.setState({ dChecked: true });
          }, "\u672C\u5730\u5E93\u6838\u5BF9\u5B8C\u6210"),
          refresh: () => this.perform(() => this.loadHistory(), "\u5386\u53F2\u8BB0\u5F55\u5DF2\u5237\u65B0"),
          clear: () => this.ask({ title: "\u6E05\u7A7A\u4E0B\u8F7D\u5386\u53F2\uFF1F", body: "\u5C06\u540C\u65F6\u6E05\u7A7A\u5DF2\u5C1D\u8BD5\u94FE\u63A5\uFF0C\u540E\u7EED\u6D3E\u53D1\u53EF\u80FD\u518D\u6B21\u5C1D\u8BD5\u65E7\u94FE\u63A5\u3002", ackText: "\u6211\u786E\u8BA4\u6E05\u7A7A\u5386\u53F2\u8BB0\u5F55", color: BAD, okText: "\u6E05\u7A7A", run: () => this.perform(async () => {
            await this.request("/api/history", "DELETE");
            await this.loadHistory();
          }, "\u4E0B\u8F7D\u5386\u53F2\u5DF2\u6E05\u7A7A") }),
          history: historyRows,
          paging: page.paging
        };
      }
      formField(label, value, update, kind = "text", options = [], hint = "") {
        const revealed = this.state.seReveal.includes(label);
        return {
          label,
          value: value ?? "",
          on: Boolean(value),
          checkLabel: label,
          hint,
          hintFg: DIM2,
          span: "auto",
          mono: "inherit",
          ls: "normal",
          isText: kind === "text" || kind === "number",
          isPath: kind === "path",
          isTextarea: kind === "textarea",
          isSecret: kind === "secret",
          isSelect: kind === "select",
          isCheck: kind === "check",
          isStatus: kind === "status",
          inputType: kind === "secret" && !revealed ? "password" : kind === "number" ? "number" : "text",
          statusFg: DIM,
          options: options.map((option) => ({ t: String(option) })),
          set: (event) => update(kind === "check" ? event.target.checked : kind === "number" ? Number(event.target.value) : event.target.value),
          revealText: revealed ? "\u9690\u85CF" : "\u663E\u793A",
          reveal: () => this.setState({ seReveal: revealed ? this.state.seReveal.filter((key) => key !== label) : [...this.state.seReveal, label] })
        };
      }
      createAuto(codes = []) {
        const draft = buildDefaultTask();
        if (codes.length) Object.assign(draft.nodes.find((node) => node.type === "search").config, { mode: "codes", codes: codes.join("\n") });
        this.setState({ route: "auto", auTask: "", autoDraft: draft, auNode: "search", autoFiltersText: null, nodeBeforeEdit: structuredClone(draft) });
      }
      editAuto(update) {
        this.setState({ autoDraft: { ...this.state.autoDraft || this.state.tasks.find((task) => task.id === this.state.auTask), ...update } });
      }
      async saveAuto() {
        this.applyAutoFilters();
        const task = this.state.autoDraft || this.state.tasks.find((task2) => task2.id === this.state.auTask);
        if (!task?.name.trim()) throw new Error("\u8BF7\u5148\u521B\u5EFA\u4EFB\u52A1\u5E76\u586B\u5199\u540D\u79F0");
        if (task.trigger.type === "scheduled" && !/^([01]\d|2[0-3]):[0-5]\d$/.test(task.trigger.scheduled_time || "")) throw new Error("\u8BF7\u586B\u5199\u6709\u6548\u7684\u6267\u884C\u65F6\u95F4 HH:MM");
        if (task.trigger.type === "interval" && (!Number.isInteger(task.trigger.interval_minutes) || task.trigger.interval_minutes < 1)) throw new Error("\u95F4\u9694\u5206\u949F\u5FC5\u987B\u4E3A\u6B63\u6574\u6570");
        const result = await this.request(`/api/automation/tasks${task.id ? "/" + id(task.id) : ""}`, task.id ? "PUT" : "POST", task);
        await this.loadTasks();
        this.setState({ autoDraft: null, auNode: null, autoFiltersText: null, nodeBeforeEdit: null, auTask: result.id || result.task?.id || task.id || this.state.auTask });
        return result.task || result;
      }
      applyAutoFilters() {
        if (this.state.autoFiltersText == null) return;
        let filters;
        try {
          filters = JSON.parse(this.state.autoFiltersText);
        } catch {
          throw new Error("\u7B5B\u9009\u6761\u4EF6 JSON \u683C\u5F0F\u9519\u8BEF");
        }
        if (!Array.isArray(filters) || filters.some((item) => !item?.type || !item?.value)) throw new Error("\u7B5B\u9009\u6761\u4EF6\u987B\u4E3A\u542B type \u548C value \u7684\u6570\u7EC4");
        const task = this.state.autoDraft || this.state.tasks.find((item) => item.id === this.state.auTask);
        if (task) this.editAuto({ nodes: task.nodes.map((item) => item.id === this.state.auNode ? { ...item, config: { ...item.config, filters } } : item) });
        this.setState({ autoFiltersText: null });
      }
      vAuto() {
        const st = this.state, task = st.autoDraft || st.tasks.find((item) => item.id === st.auTask), titles = { trigger: "\u89E6\u53D1", search: "\u68C0\u7D22", magnet: "\u78C1\u529B", download: "\u4E0B\u8F7D" };
        const node = task?.nodes.find((item) => item.id === st.auNode);
        const triggerText = (trigger) => trigger?.type === "scheduled" ? `\u5B9A\u65F6 ${trigger.scheduled_time}` : trigger?.type === "interval" ? `\u95F4\u9694 ${trigger.interval_minutes} \u5206\u949F` : "\u81EA\u52A8\u8FD0\u884C";
        const today = (/* @__PURE__ */ new Date()).toDateString(), runsToday = st.tasks.flatMap((item) => item.runs || []).filter((run) => new Date(run.started_at).toDateString() === today);
        const errorCount = (run) => Math.max(run.error ? 1 : 0, (run.items || []).filter((item) => item.status === "dispatch_failed").length);
        const nodeSummary = (item) => item.type === "trigger" ? triggerText(task.trigger) : item.type === "download" ? { pikpak: "PikPak", pan115: "115 \u7F51\u76D8", aria2: "Aria2" }[item.config.tool] || "\u9009\u62E9\u4E0B\u8F7D\u5DE5\u5177" : item.type === "magnet" ? `${item.config.source || "javbus"} \xB7 ${item.config.exclude_4k ? "\u6392\u9664 4K" : "\u5141\u8BB8 4K"}` : item.config.mode === "codes" ? `\u6307\u5B9A ${String(item.config.codes || "").split(/[\s,，;；]+/).filter(Boolean).length} \u4E2A\u756A\u53F7` : item.config.mode === "filter" ? `${item.config.filters?.length || 0} \u4E2A\u7B5B\u9009\u6761\u4EF6` : item.config.keyword || "\u586B\u5199\u68C0\u7D22\u5173\u952E\u8BCD";
        const field = (label, key, kind = "text", options = []) => this.formField(label, node?.type === "trigger" ? task.trigger[key] : node?.config[key], (value) => {
          if (node.type === "trigger") this.editAuto({ trigger: { ...task.trigger, [key]: value || null } });
          else this.editAuto({ nodes: task.nodes.map((item) => item.id === node.id ? { ...item, config: { ...item.config, [key]: value } } : item) });
        }, kind, options);
        let fields = [];
        if (node?.type === "trigger") fields = [field("\u89E6\u53D1\u65B9\u5F0F", "type", "select", ["auto", "scheduled", "interval"]), field("\u6267\u884C\u65F6\u95F4 HH:MM", "scheduled_time"), field("\u95F4\u9694\u5206\u949F", "interval_minutes", "number")];
        if (node?.type === "search") fields = [
          field("\u68C0\u7D22\u65B9\u5F0F", "mode", "select", ["keyword", "filter", "codes"]),
          field("\u5173\u952E\u8BCD", "keyword"),
          field("\u756A\u53F7\u5217\u8868", "codes", "textarea"),
          this.formField("\u7B5B\u9009\u6761\u4EF6 JSON", st.autoFiltersText ?? JSON.stringify(node.config.filters || []), (value) => this.setState({ autoFiltersText: value }), "textarea"),
          field("\u7ED3\u679C\u4E0A\u9650", "max_results", "number"),
          field("\u78C1\u529B", "magnet", "select", ["exist", "all"]),
          field("\u7C7B\u578B", "type", "select", ["normal", "uncensored"]),
          field("\u8DF3\u8FC7\u672C\u5730\u5DF2\u6709", "skip_existing", "check")
        ];
        if (node?.type === "magnet") fields = [field("\u78C1\u529B\u6765\u6E90", "source", "select", ["javbus", "cilisousuo", "yhg007"]), field("\u5B57\u5E55\u7B5B\u9009", "has_subtitle", "select", ["", "true", "false"]), field("\u6392\u9664 4K", "exclude_4k", "check"), field("\u5141\u8BB8\u4E2D\u6587\u5B57\u5E55", "allow_chinese_subtitles", "check")];
        if (node?.type === "download") fields = [field("\u4E0B\u8F7D\u5DE5\u5177", "tool", "select", ["pikpak", "pan115", "aria2"])];
        return {
          tasks: st.tasks.map((item) => ({
            name: item.name,
            trigger: triggerText(item.trigger),
            last: item.last_run_at || "\u5C1A\u672A\u8FD0\u884C",
            status: item.enabled ? "\u5DF2\u542F\u7528" : "\u5DF2\u505C\u7528",
            dot: item.enabled ? OK : DIM2,
            stFg: item.enabled ? OK : DIM2,
            bg: item.id === task?.id ? "rgba(145,132,217,.08)" : "transparent",
            ring: item.id === task?.id ? ACC : "var(--t09)",
            pick: () => this.setState({ auTask: item.id, autoDraft: null, auNode: null, autoFiltersText: null })
          })),
          create: () => this.createAuto(),
          hasTask: Boolean(task),
          taskCount: st.tasks.length,
          enabledCount: st.tasks.filter((item) => item.enabled).length,
          dispatchedToday: runsToday.reduce((sum, run) => sum + (run.dispatched_count || 0), 0),
          skippedToday: runsToday.reduce((sum, run) => sum + (run.skipped_count || 0), 0),
          errorsToday: runsToday.reduce((sum, run) => sum + errorCount(run), 0),
          cur: { name: task?.name || "\u521B\u5EFA\u81EA\u52A8\u4EFB\u52A1", setName: (event) => this.editAuto({ name: event.target.value }), summary: task ? triggerText(task.trigger) : "\u70B9\u51FB\u65B0\u5EFA\u5F00\u59CB\u914D\u7F6E", last: task?.last_run_at || "\u5C1A\u672A\u8FD0\u884C", status: task?.enabled ? "\u5DF2\u542F\u7528" : "\u5DF2\u505C\u7528", tagBg: "var(--t08)", tagFg: task?.enabled ? OK : DIM2, toggleText: task?.enabled ? "\u505C\u7528\u4EFB\u52A1" : "\u542F\u7528\u4EFB\u52A1", toggleFg: task?.enabled ? WARN : ACC },
          save: () => this.perform(() => this.saveAuto(), "\u81EA\u52A8\u4EFB\u52A1\u5DF2\u4FDD\u5B58"),
          remove: () => {
            if (task?.id) this.ask({ title: `\u5220\u9664 ${task.name}\uFF1F`, body: "\u5220\u9664\u4EFB\u52A1\u548C\u8FD0\u884C\u8BB0\u5F55\uFF0C\u5DF2\u6D3E\u53D1\u7684\u4E0B\u8F7D\u4E0D\u53D7\u5F71\u54CD\u3002", color: BAD, okText: "\u5220\u9664\u4EFB\u52A1", run: () => this.perform(async () => {
              await this.request(`/api/automation/tasks/${id(task.id)}`, "DELETE");
              this.setState({ autoDraft: null });
              await this.loadTasks();
            }, "\u4EFB\u52A1\u5DF2\u5220\u9664") });
            else this.setState({ autoDraft: null });
          },
          toggleRun: () => this.perform(async () => {
            if (!task) throw new Error("\u8BF7\u5148\u521B\u5EFA\u4EFB\u52A1");
            this.editAuto({ enabled: !task.enabled });
            await this.saveAuto();
          }, "\u4EFB\u52A1\u72B6\u6001\u5DF2\u4FDD\u5B58"),
          runNow: () => {
            if (task) this.ask({ title: `\u8FD0\u884C ${task.name}\uFF1F`, body: "\u5C06\u4FDD\u5B58\u5F53\u524D\u914D\u7F6E\u5E76\u6267\u884C\u771F\u5B9E\u68C0\u7D22\u548C\u4E0B\u8F7D\u6D3E\u53D1\u3002", color: ACC, okText: "\u7ACB\u5373\u8FD0\u884C", run: () => this.perform(async () => {
              const saved = await this.saveAuto();
              this.toast("\u81EA\u52A8\u4EFB\u52A1\u6B63\u5728\u8FD0\u884C\uFF0C\u53EF\u5728\u8FD0\u884C\u8BB0\u5F55\u4E2D\u67E5\u770B\u8FDB\u5EA6", ACC);
              const run = await this.request(`/api/automation/tasks/${id(saved.id)}/run?background=true`, "POST");
              await this.loadTasks();
              if (["failed", "partial"].includes(run.status)) throw new Error("\u8FD0\u884C\u5B58\u5728\u5931\u8D25\u9879\uFF0C\u8BF7\u5C55\u5F00\u8FD0\u884C\u8BB0\u5F55\u67E5\u770B");
              this.toast(run.status === "noop" ? safeText(run.message, "\u6CA1\u6709\u65B0\u5F71\u7247\u9700\u8981\u4E0B\u8F7D") : run.status === "success" ? "\u8FD0\u884C\u5DF2\u5B8C\u6210" : "\u8FD0\u884C\u5DF2\u63D0\u4EA4", OK);
            }) });
          },
          pauseAll: st.tasks.length > 0 && st.tasks.every((item) => !item.enabled),
          togglePauseAll: () => this.ask({ title: "\u505C\u7528\u5168\u90E8\u81EA\u52A8\u4EFB\u52A1\uFF1F", body: "\u5173\u95ED\u540E\u7EED\u81EA\u52A8\u89E6\u53D1\uFF0C\u5DF2\u8FD0\u884C\u4EFB\u52A1\u4E0D\u53D7\u5F71\u54CD\u3002\u6062\u590D\u65F6\u8BF7\u9010\u9879\u542F\u7528\u3002", color: WARN, okText: "\u505C\u7528\u5168\u90E8", run: () => this.perform(async () => {
            for (const item of st.tasks.filter((item2) => item2.enabled)) await this.request(`/api/automation/tasks/${id(item.id)}`, "PUT", { enabled: false });
            await this.loadTasks();
          }, "\u81EA\u52A8\u4EFB\u52A1\u5DF2\u505C\u7528") }),
          nodes: (task?.nodes || []).map((item, index) => ({
            title: titles[item.type],
            step: String(index + 1).padStart(2, "0"),
            desc: titles[item.type],
            meta: nodeSummary(item),
            badge: "",
            hasArrow: index < task.nodes.length - 1,
            bg: "var(--t03)",
            ring: item.id === st.auNode ? ACC : "var(--t09)",
            iconBg: "var(--t08)",
            iconFg: ACC,
            stFg: DIM2,
            pick: () => this.setState({ auNode: item.id, autoFiltersText: null, nodeBeforeEdit: structuredClone(task) })
          })),
          node: node ? { title: titles[node.type], fields } : null,
          closeNode: () => this.setState({ auNode: null, autoDraft: st.nodeBeforeEdit || st.autoDraft, autoFiltersText: null }),
          saveNode: () => this.perform(async () => {
            this.applyAutoFilters();
            this.setState({ auNode: null });
          }, "\u8282\u70B9\u5DF2\u66F4\u65B0\uFF0C\u4FDD\u5B58\u4EFB\u52A1\u540E\u751F\u6548"),
          refresh: () => this.perform(() => this.loadTasks()),
          runs: (task?.runs || []).map((run) => ({
            time: run.started_at,
            trigger: runStatus(run.status),
            found: run.found_count,
            matched: run.magnet_count,
            dispatched: run.dispatched_count,
            skipped: run.skipped_count,
            errors: errorCount(run),
            result: safeText(run.error || run.message, runStatus(run.status)),
            dispatchFg: OK,
            errFg: BAD,
            resFg: DIM,
            open: () => this.ask({ title: `\u8FD0\u884C ${run.started_at}`, body: safeText(run.error || run.message, runStatus(run.status)), list: (run.items || []).map((item) => `${item.movie_id}: ${item.status} ${safeText(item.message, "")}`), color: ACC, okText: "\u5173\u95ED" })
          }))
        };
      }
      async connect(key, fromConfig = false) {
        const values = this.state.settingsDraft[key] || {};
        try {
          if (key === "pikpak") {
            const result = await this.request(`/api/pikpak/login${fromConfig ? "-config" : ""}`, "POST", fromConfig ? void 0 : { username: values.username, password: values.password });
            this.auth = fromConfig ? { username: result.username, fromConfig: true } : { username: values.username, password: values.password };
            persistPikPakSession(this.auth);
            this.setState({ pikLogged: true });
          } else if (key === "pan115") {
            if (values.cookie) await this.request("/api/115/cookie", "POST", { cookie: values.cookie, enabled: values.enabled !== false });
            const result = await this.request("/api/115/status");
            if (!result.connected) throw new Error("115 \u8FDE\u63A5\u5931\u8D25\uFF0C\u8BF7\u91CD\u65B0\u626B\u7801\u767B\u5F55");
          } else {
            const form = new FormData();
            let credentials = values;
            if (!fromConfig) {
              form.set(`${key}_url`, values.url || "");
              const saved = key === "webdav" ? loadWebDavSettings() : loadAria2Settings();
              const sameAccount = saved.url === values.url && (key !== "webdav" || saved.username === values.username);
              if (key === "webdav") {
                credentials = { ...values, password: values.password || (sameAccount ? saved.password : "") || "" };
                form.set("username", values.username || "");
                form.set("password", credentials.password);
              } else {
                credentials = { ...values, secret: values.secret || (sameAccount ? saved.secret : "") || "" };
                form.set("aria2_secret", credentials.secret);
              }
            }
            await this.request(`/api/${key}/connect${fromConfig ? "-config" : ""}`, "POST", fromConfig ? void 0 : form);
            if (!fromConfig) (key === "webdav" ? saveWebDavSettings : saveAria2Settings)(credentials);
          }
        } catch (error) {
          await this.perform(() => this.loadConnections());
          throw error;
        }
        await this.loadConnections();
      }
      async startQr() {
        const qr = await this.request("/api/115/qrcode/start", "POST", { app: this.state.settingsDraft.pan115?.login_app || "wechatmini" });
        this.setState({ qr, toolCfg: "115 \u7F51\u76D8" });
      }
      async pollQr() {
        const qr = this.state.qr;
        if (!qr || [2, -1, -2].includes(Number(qr.status))) return;
        const result = await this.request(`/api/115/qrcode/${id(qr.session_id)}/status`);
        this.setState({ qr: { ...qr, ...result } });
        if (Number(result.status) === 2) {
          await this.loadSettings();
          await this.loadConnections();
          this.toast("115 \u626B\u7801\u767B\u5F55\u6210\u529F", OK);
        }
      }
      async loadFiles(source = this.state.fsSrc, path = this.state.directory) {
        const version = this.fileRequestVersion = (this.fileRequestVersion || 0) + 1;
        let payload;
        if (source === "115") {
          const items = [];
          let offset = 0;
          do {
            payload = await this.request(`/api/115/files?cid=${id(path || "0")}&offset=${offset}&limit=200`);
            items.push(...payload.items || []);
            offset += (payload.items || []).length;
          } while ((payload.items || []).length && offset < Number(payload.count || 0));
          payload.entries = items;
        } else payload = await this.request(`/api/${source === "local" ? "system" : "webdav"}/files?path=${id(path || (source === "local" ? "" : "/"))}`);
        if (version !== this.fileRequestVersion || this._disposed) return;
        this.setState({ fsSrc: source, directory: payload.current_path ?? path, directoryParent: payload.parent_path, fileRows: payload.entries || payload.files || [], fsSel: [] });
        if (this.state.connections.aria2_connected) await this.loadAria();
      }
      async loadAria() {
        const payload = await this.request("/api/aria2/downloads"), tasks = payload.downloads || [];
        if (JSON.stringify(tasks) !== JSON.stringify(this.state.ariaTasks)) this.setState({ ariaTasks: tasks });
      }
      ariaAction(task, action) {
        return this.perform(async () => {
          await this.request(`/api/aria2/${action}/${id(task.gid)}`, action === "remove" ? "DELETE" : "POST");
          await this.loadAria();
        }, "\u4E0B\u8F7D\u4EFB\u52A1\u5DF2\u66F4\u65B0");
      }
      async browseDirectory(path = "", target = null) {
        const result = await this.request(`/api/system/directories?path=${id(path)}`);
        this.setState({ fsAdd: "browse", browserTarget: target, browsePath: result.current_path || "", directories: result.directories || result.entries || [], browseParent: result.parent_path });
      }
      minFileSize() {
        return { "\u4E0D\u9650": 0, "\u5927\u4E8E 500 MB": 500, "\u5927\u4E8E 2 GB": 2048, "\u5927\u4E8E 8 GB": 8192 }[this.state.fsMinSize] || 0;
      }
      sendFiles(files) {
        if (this.state.fsSrc === "local") {
          this.toast("\u672C\u5730\u76EE\u5F55\u7528\u4E8E\u6D4F\u89C8\uFF0C\u8FDC\u7A0B\u6587\u4EF6\u53EF\u53D1\u9001\u5230 Aria2", WARN);
          return;
        }
        if (!files.length || !this.state.connections.aria2_connected) {
          this.toast("\u8BF7\u8FDE\u63A5 Aria2 \u5E76\u9009\u62E9\u6587\u4EF6\u6216\u76EE\u5F55", WARN);
          return;
        }
        const source = this.state.fsSrc, videoFilter = this.state.fsVideoOnly, minSize = this.minFileSize();
        this.ask({ title: `\u53D1\u9001 ${files.length} \u4E2A\u6587\u4EF6\u5230 Aria2\uFF1F`, body: "\u4ECE\u5F53\u524D\u7F51\u76D8\u4E0B\u8F7D\u5230\u5DF2\u8FDE\u63A5\u7684 Aria2\u3002", list: files.map((file) => file.name), color: ACC, okText: "\u53D1\u9001", run: () => this.perform(async () => {
          let result;
          try {
            result = await this.request("/api/webdav/download", "POST", { files: files.map((file) => ({ ...file, path: file.path || file.id, is_directory: file.is_directory || file.kind === "folder", source_type: source === "115" ? "pan115" : "webdav" })), video_filter: videoFilter, min_file_size_mb: minSize });
          } catch (error) {
            if (!error.result?.results) throw error;
            result = error.result;
          }
          const rows = result.results || [], failed = rows.filter((item) => item.success === false && !item.skipped), successful = rows.filter((item) => item.success), skipped = rows.filter((item) => item.skipped);
          if (!failed.length) this.setState({ fsSel: [] });
          await this.perform(() => this.loadAria());
          if (failed.length || skipped.length) {
            this.ask({
              title: "\u7F51\u76D8\u53D1\u9001\u7ED3\u679C",
              body: `${successful.length} \u6210\u529F\uFF0C${failed.length} \u5931\u8D25\uFF0C${skipped.length} \u8DF3\u8FC7\u3002` + (failed.length ? "\u8BF7\u6309\u660E\u7EC6\u91CD\u8BD5\u5931\u8D25\u6587\u4EF6\uFF0C\u907F\u514D\u91CD\u590D\u53D1\u9001\u6574\u4E2A\u76EE\u5F55\u3002" : "\u90E8\u5206\u6587\u4EF6\u4E0D\u7B26\u5408\u7B5B\u9009\u6761\u4EF6\uFF0C\u8BF7\u67E5\u770B\u660E\u7EC6\u3002"),
              color: WARN,
              list: rows.map((item) => `${item.filename}\uFF1A${item.skipped ? "\u5DF2\u8DF3\u8FC7" : item.success ? "\u6210\u529F" : "\u5931\u8D25"} ${safeText(item.message, "")}`),
              okText: "\u67E5\u770B\u4E0B\u8F7D\u4EFB\u52A1",
              run: () => this.go("storage")()
            });
            return;
          }
          this.toast(successful.length ? "\u5DF2\u53D1\u9001\u5230 Aria2" : "\u6CA1\u6709\u7B26\u5408\u6761\u4EF6\u7684\u6587\u4EF6\uFF0C\u6CA1\u6709\u65B0\u589E\u4E0B\u8F7D\u4EFB\u52A1", successful.length ? OK : WARN);
        }) });
      }
      vStorage() {
        const st = this.state, connected = st.fsSrc === "local" || (st.fsSrc === "115" ? this.allConnected() : st.connections.webdav_connected);
        const canSend = st.fsSrc !== "local" && connected && Boolean(st.connections.aria2_connected);
        const rows = st.fileRows.filter((file) => (!st.fsQ || file.name.toLowerCase().includes(st.fsQ.toLowerCase())) && (file.is_directory || file.kind === "folder" || (!st.fsVideoOnly || /\.(mp4|mkv|avi|wmv|mov|m4v|ts|flv|webm|3gp|3g2|asf|rm|rmvb|vob|mts|m2ts|divx|xvid|ogv|f4v|mpg|mpeg|m1v|m2v|mpe|mpv|mp2|mpa|mpu|mpg2)$/i.test(file.name)) && Number(file.size) >= this.minFileSize() * 1024 ** 2));
        const selectedKeys = new Set(st.fsSel), selected = rows.filter((file) => selectedKeys.has(file.path || file.id)), tasks = st.ariaTasks || [];
        const page = this.pageItems(rows, "fsPage", [st.fsQ, st.fsSrc, st.directory, st.fsVideoOnly, st.fsMinSize]);
        const taskPage = this.pageItems(tasks, "fsTaskPage", []);
        const directories = this.pageItems([...st.browseParent != null ? [{ name: "..", path: st.browseParent }] : [], ...st.directories], "directoryPage", [st.browsePath]);
        return {
          paging: page.paging,
          taskPaging: taskPage.paging,
          directoryPaging: directories.paging,
          sources: [["local", "\u670D\u52A1\u7AEF\u672C\u5730", true], ["webdav", "WebDAV", st.connections.webdav_connected], ["115", "115 \u7F51\u76D8", this.allConnected()]].map(([key, name, up]) => ({ key, name, status: up ? "\u53EF\u7528" : "\u672A\u8FDE\u63A5", dot: up ? OK : DIM2, stFg: up ? OK : DIM2, meta: "", op: 1, cursor: "pointer", needsCfg: key !== "local", bg: key === st.fsSrc ? "rgba(145,132,217,.08)" : "transparent", ring: key === st.fsSrc ? ACC : "var(--t09)", config: () => this.setState({ route: "settings", seTab: name }), pick: () => {
            this.fileRequestVersion = (this.fileRequestVersion || 0) + 1;
            this.setState({ fsSrc: key, fileRows: [], directory: "", directoryTrail: [] });
            if (up) this.perform(() => this.loadFiles(key, ""));
          } })),
          subtitle: st.fsSrc === "local" ? "\u670D\u52A1\u7AEF\u672C\u5730\u76EE\u5F55" : "\u8FDC\u7A0B\u76EE\u5F55 \xB7 \u53EF\u53D1\u9001\u5230 Aria2",
          offline: !connected,
          showFiles: connected,
          goSettings: () => this.setState({ route: "settings", seTab: st.fsSrc === "115" ? "115 \u7F51\u76D8" : "WebDAV" }),
          q: st.fsQ,
          setQ: (event) => this.setState({ fsQ: event.target.value }),
          videoOnly: st.fsVideoOnly,
          toggleVideo: () => this.setState({ fsVideoOnly: !st.fsVideoOnly }),
          minSize: st.fsMinSize,
          setMinSize: (event) => this.setState({ fsMinSize: event.target.value }),
          crumbs: [{ name: "\u6839\u76EE\u5F55 / ", fg: ACC, go: () => this.perform(() => this.loadFiles(st.fsSrc, "")) }, { name: st.directory || "/", fg: DIM, go: () => this.perform(() => this.loadFiles()) }, { name: "\u4E0A\u4E00\u7EA7", fg: ACC, go: () => this.perform(() => {
            const trail = st.directoryTrail || [];
            const parent = st.fsSrc === "115" ? trail.at(-1) || "" : st.directoryParent ?? (st.directory.replace(/[\\/][^\\/]+[\\/]?$/, "") || "/");
            this.setState({ directoryTrail: trail.slice(0, -1) });
            return this.loadFiles(st.fsSrc, parent);
          }) }],
          dirMeta: `${rows.length} \u9879`,
          allSel: rows.length > 0 && selected.length === rows.length,
          toggleAll: () => this.setState({ fsSel: selected.length === rows.length ? [] : rows.map((file) => file.path || file.id) }),
          rows: page.items.map((file) => {
            const dir = file.is_directory || file.kind === "folder", key = file.path || file.id;
            return {
              ...file,
              isDir: dir,
              canSend,
              type: dir ? "\u6587\u4EF6\u5939" : file.kind || "\u6587\u4EF6",
              size: size(file.size),
              date: file.modified || file.modified_time || file.mtime || "\u2014",
              icon: dir ? "ph-folder" : "ph-file",
              iconFg: dir ? ACC : DIM,
              fg: dir ? ACC : "var(--fg)",
              cursor: dir ? "pointer" : "default",
              sel: selectedKeys.has(key),
              toggle: () => this.setState({ fsSel: selectedKeys.has(key) ? st.fsSel.filter((value) => value !== key) : [...st.fsSel, key] }),
              open: () => {
                if (dir) {
                  this.setState({ directoryTrail: [...st.directoryTrail || [], st.directory] });
                  return this.perform(() => this.loadFiles(st.fsSrc, key));
                }
              },
              send: () => this.sendFiles([file])
            };
          }),
          selCount: st.route === "storage" ? selected.length : 0,
          selSize: size(selected.reduce((sum, file) => sum + Number(file.size || 0), 0)),
          clearSel: () => this.setState({ fsSel: [] }),
          sendSel: () => this.sendFiles(selected),
          canSend,
          refreshAria: () => this.perform(() => this.loadAria()),
          ariaConnected: st.connections.aria2_connected,
          ariaDown: !st.connections.aria2_connected,
          ariaStatus: st.connections.aria2_connected ? "\u5DF2\u8FDE\u63A5" : "\u672A\u8FDE\u63A5",
          ariaDot: st.connections.aria2_connected ? OK : DIM2,
          ariaFg: DIM,
          ariaMeta: `${tasks.length} \u4E2A\u4EFB\u52A1`,
          connectAria: () => this.perform(() => this.connect("aria2", true), "Aria2 \u5DF2\u8FDE\u63A5"),
          jobs115: null,
          browsePath: () => this.perform(() => this.browseDirectory()),
          closeAdd: () => this.setState({ fsAdd: null }),
          addForm: st.fsAdd === "browse" ? { title: "\u6D4F\u89C8\u670D\u52A1\u7AEF\u76EE\u5F55", desc: "\u9009\u62E9\u670D\u52A1\u7AEF\u53EF\u8BBF\u95EE\u7684\u76EE\u5F55", path: st.browsePath, entries: directories.items.map((entry) => ({ name: entry.name || entry.path, meta: entry.path, open: () => this.perform(() => this.browseDirectory(entry.path, st.browserTarget)) })) } : null,
          pickPath: () => {
            const target = st.browserTarget;
            this.setState({ fsAdd: null });
            if (target) this.setState({ [target.key]: target.index === void 0 ? st.browsePath : st[target.key].map((value, index) => index === target.index ? st.browsePath : value), ...target.key === "scScanDir" ? { scOverrides: {} } : {} });
            else this.perform(() => this.loadFiles("local", st.browsePath));
          },
          pauseAll: () => this.ask({ title: "\u6682\u505C\u5168\u90E8\u4E0B\u8F7D\uFF1F", body: "\u6682\u505C\u5F53\u524D\u6D3B\u52A8\u53CA\u7B49\u5F85\u4E2D\u7684 Aria2 \u4EFB\u52A1\u3002", color: WARN, okText: "\u6682\u505C", run: () => this.perform(async () => {
            for (const task of tasks.filter((task2) => ["active", "waiting"].includes(task2.status))) await this.request(`/api/aria2/pause/${id(task.gid)}`, "POST");
            await this.loadAria();
          }, "\u4E0B\u8F7D\u5DF2\u6682\u505C") }),
          tasks: taskPage.items.map((task) => ({ name: task.name, dir: task.gid, pct: Number(task.totalLength) ? Math.round(100 * Number(task.completedLength) / Number(task.totalLength)) : 0, speed: `${size(task.downloadSpeed)}/s`, eta: "\u2014", sizeText: `${size(task.completedLength)} / ${size(task.totalLength)}`, status: task.status, stFg: task.status === "error" ? BAD : DIM, fg: "var(--fg)", canPause: ["active", "waiting"].includes(task.status), canResume: task.status === "paused", pause: () => this.ariaAction(task, "pause"), resume: () => this.ariaAction(task, "resume"), del: () => this.ask({ title: "\u5220\u9664 Aria2 \u4EFB\u52A1\uFF1F", body: `\u4ECE Aria2 \u79FB\u9664 ${task.name} \u4E0B\u8F7D\u4EFB\u52A1\uFF0C\u4FDD\u7559\u5DF2\u4E0B\u8F7D\u6587\u4EF6\u3002`, color: BAD, okText: "\u5220\u9664", run: () => this.ariaAction(task, "remove") }) }))
        };
      }
      vSettings() {
        const st = this.state, sectionMap = { "JavBus API": "javbus", "\u522E\u524A\u6E90": "scrapers", WebDAV: "webdav", Aria2: "aria2", PikPak: "pikpak", "115 \u7F51\u76D8": "pan115", \u78C1\u529B\u7B5B\u9009: "magnet_health" }, key = sectionMap[st.seTab];
        const values = st.settingsDraft[key] || {}, update = (field, value) => this.setState({ settingsDraft: { ...st.settingsDraft, [key]: { ...values, [field]: value } } });
        const labels = { enabled: "\u542F\u7528", base_url: "\u57FA\u5730\u5740", url: "\u670D\u52A1\u5730\u5740", username: "\u7528\u6237\u540D", password: "\u5BC6\u7801", secret: "RPC Secret", cookie: "Cookie", timeout_seconds: "\u8BF7\u6C42\u8D85\u65F6\uFF08\u79D2\uFF09", proxy: "\u4EE3\u7406", request_interval_seconds: "\u8BF7\u6C42\u95F4\u9694\uFF08\u79D2\uFF09", cache_expire_seconds: "\u7F13\u5B58\u6709\u6548\u671F\uFF08\u79D2\uFF09", cache_max_size: "\u7F13\u5B58\u6761\u76EE\u4E0A\u9650", image_retry_attempts: "\u56FE\u7247\u91CD\u8BD5\u6B21\u6570", image_retry_backoff_seconds: "\u56FE\u7247\u91CD\u8BD5\u95F4\u9694", auto_connect: "\u81EA\u52A8\u8FDE\u63A5", auto_login: "\u81EA\u52A8\u767B\u5F55", save_dir_id: "\u79BB\u7EBF\u76EE\u5F55 CID", login_app: "\u767B\u5F55 App", batch_size: "\u6279\u91CF\u5927\u5C0F", batch_interval_seconds: "\u6279\u6B21\u95F4\u9694\uFF08\u79D2\uFF09", jitter_seconds: "\u968F\u673A\u5EF6\u65F6\uFF08\u79D2\uFF09", probe_with_aria2: "\u4F7F\u7528 Aria2 \u63A2\u6D4B", min_seeders: "\u6700\u5C11\u505A\u79CD\u6570", min_peers: "\u6700\u5C11\u8282\u70B9\u6570", min_availability: "\u6700\u4F4E\u53EF\u7528\u7387", min_score: "\u6700\u4F4E\u8BC4\u5206", probe_timeout_seconds: "\u63A2\u6D4B\u8D85\u65F6\uFF08\u79D2\uFF09", allow_unknown: "\u5141\u8BB8\u672A\u77E5\u5065\u5EB7\u5EA6" };
        const isMedia = st.seTab === "\u5A92\u4F53\u76EE\u5F55", media = st.librarySettings || {}, isImages = st.seTab === "\u56FE\u7247\u7F13\u5B58", isCache = st.seTab === "\u7F13\u5B58" || isImages;
        const savedKey = isImages ? "imageCacheSettings" : "cacheSettings", draftKey = isImages ? "imageCacheDraft" : "cacheDraft", cacheSaved = st[savedKey], cache = st[draftKey] || {};
        const tabs = ["\u914D\u7F6E\u6982\u89C8", "\u5916\u89C2", "\u5A92\u4F53\u76EE\u5F55", "\u7F13\u5B58", "\u56FE\u7247\u7F13\u5B58", ...Object.keys(sectionMap), "\u8FD0\u884C\u5B89\u5168"];
        const status = (name) => name === "WebDAV" ? st.connections.webdav_connected ? "\u5DF2\u8FDE\u63A5" : "\u672A\u8FDE\u63A5" : this.toolStates().find((tool) => tool.name === name)?.hint || "";
        let fields = key && key !== "scrapers" ? Object.entries(values).filter(([field, value]) => labels[field] && typeof value !== "object").map(([field, value]) => this.formField(labels[field], value, (value2) => update(field, value2), ["password", "secret", "cookie"].includes(field) ? "secret" : typeof value === "boolean" ? "check" : typeof value === "number" ? "number" : "text", [], ["password", "secret", "cookie"].includes(field) ? "\u7559\u7A7A\u4FDD\u7559\u670D\u52A1\u7AEF\u5DF2\u5B58\u503C\uFF1B\u4FDD\u5B58\u4F1A\u5199\u5165\u670D\u52A1\u7AEF\u914D\u7F6E\u3002" : "")) : [];
        if (isMedia) fields = [
          ["\u5F85\u522E\u524A\u76EE\u5F55", "seSource", media.source_directory || "", "\u5B58\u653E\u5C1A\u672A\u6574\u7406\u7684\u539F\u7247\uFF0C\u626B\u63CF\u5F71\u89C6\u5E93\u65F6\u4F1A\u8DF3\u8FC7\u6B64\u76EE\u5F55\u3002"],
          ["\u5F71\u89C6\u5E93\u76EE\u5F55", "seTarget", media.directories?.[0] || "", "\u522E\u524A\u7ED3\u679C\u7684\u9ED8\u8BA4\u5B58\u653E\u4F4D\u7F6E\uFF1B\u5176\u4ED6\u5F71\u89C6\u5E93\u8DEF\u5F84\u548C\u6392\u9664\u76EE\u5F55\u4FDD\u6301\u539F\u914D\u7F6E\u3002"]
        ].map(([label, stateKey, fallback, hint]) => ({
          ...this.formField(label, st[stateKey] ?? fallback, (value) => this.setState({ [stateKey]: value }), "path", [], hint),
          span: "1 / -1",
          browse: () => this.perform(() => this.browseDirectory(st[stateKey] ?? fallback, { key: stateKey }))
        }));
        if (isCache && !isImages) fields = [
          this.formField("\u7F13\u5B58\u6E05\u7406\u65B9\u5F0F", cache.mode === "size" ? "\u6309\u5360\u7528\u7A7A\u95F4" : "\u6309\u7F13\u5B58\u5929\u6570", (value) => this.setState({ cacheDraft: { ...cache, mode: value === "\u6309\u5360\u7528\u7A7A\u95F4" ? "size" : "days" } }), "select", ["\u6309\u7F13\u5B58\u5929\u6570", "\u6309\u5360\u7528\u7A7A\u95F4"]),
          cache.mode === "size" ? this.formField("\u6700\u591A\u5360\u7528\u7A7A\u95F4\uFF08MB\uFF09", cache.mb, (value) => this.setState({ cacheDraft: { ...cache, mb: value } }), "number", [], "\u6309\u670D\u52A1\u7AEF\u7F13\u5B58\u6587\u4EF6\u7684\u5B9E\u9645\u5927\u5C0F\u8BA1\u7B97\uFF0C\u8D85\u9650\u65F6\u4F18\u5148\u6E05\u7406\u6700\u65E9\u7F13\u5B58\u7684\u8D44\u6599\u3002") : this.formField("\u6700\u591A\u7F13\u5B58\u5929\u6570", cache.days, (value) => this.setState({ cacheDraft: { ...cache, days: value } }), "number", [], "\u4ECE\u8D44\u6599\u8865\u5168\u65F6\u95F4\u8D77\u8BA1\u7B97\uFF0C\u8D85\u8FC7\u540E\u5728\u4E0B\u6B21\u641C\u7D22\u65F6\u91CD\u65B0\u83B7\u53D6\u3002"),
          this.formField("\u5F53\u524D\u7F13\u5B58", `${st.cacheSettings?.count || 0} \u90E8 \xB7 ${size(st.cacheSettings?.size_bytes || 0)}`, () => {
          }, "status", [], "\u4EC5\u4FDD\u5B58\u516C\u5F00\u5F71\u7247\u8D44\u6599\u548C\u5C01\u9762\u5730\u5740\uFF0C\u4E0D\u5305\u542B\u5C01\u9762\u56FE\u7247\u3002")
        ];
        if (isImages) fields = [
          this.formField("\u56FE\u7247\u7F13\u5B58\u4E0A\u9650\uFF08MB\uFF09", cache.mb, (value) => this.setState({ imageCacheDraft: { mb: value } }), "number", [], "\u6309\u56FE\u7247\u7F13\u5B58\u6587\u4EF6\u7684\u5B9E\u9645\u5927\u5C0F\u8BA1\u7B97\uFF0C\u8D85\u9650\u65F6\u4F18\u5148\u6E05\u7406\u8F83\u4E45\u672A\u4F7F\u7528\u7684\u56FE\u7247\u3002"),
          this.formField("\u5F53\u524D\u56FE\u7247\u7F13\u5B58", `${cacheSaved?.count || 0} \u5F20 \xB7 ${size(cacheSaved?.size_bytes || 0)}`, () => {
          }, "status", [], "\u5355\u72EC\u8BA1\u7B97\u7A7A\u95F4\uFF0C\u4E0D\u5360\u7528\u5F71\u7247\u8D44\u6599\u7F13\u5B58\u7684\u4E0A\u9650\u3002\u5355\u5F20\u56FE\u7247\u8D85\u8FC7\u603B\u4E0A\u9650\u65F6\uFF0C\u4EC5\u663E\u793A\uFF0C\u4E0D\u7F13\u5B58\u3002")
        ];
        if (isCache && !cacheSaved) fields = [this.formField("\u670D\u52A1\u7AEF\u7F13\u5B58", "\u5C1A\u672A\u8F7D\u5165", () => {
        }, "status", [], "\u70B9\u51FB\u91CD\u65B0\u8F7D\u5165\uFF0C\u8BFB\u53D6\u670D\u52A1\u5668\u4E0A\u7684\u7F13\u5B58\u8BBE\u7F6E\u3002")];
        if (st.seTab === "\u8FD0\u884C\u5B89\u5168") fields = [this.formField("\u4F1A\u8BDD\u5BC6\u94A5", st.settings.security?.session_secret_configured ? "\u5DF2\u914D\u7F6E" : "\u672A\u914D\u7F6E", () => {
        }, "status"), this.formField("\u73AF\u5883\u53D8\u91CF\u8986\u76D6", Object.entries(st.settings.environment_overrides?.javbus || {}).filter(([, value]) => value).map(([name]) => name).join(" \xB7 ") || "\u65E0", () => {
        }, "status")];
        const sources = st.settingsDraft.scrapers || {}, priority = sources.priority || [], providers = [.../* @__PURE__ */ new Set([...priority, ...Object.keys(sources).filter((name) => name !== "priority")])];
        const updateSource = (name, updates) => this.setState({ settingsDraft: { ...st.settingsDraft, scrapers: { ...sources, [name]: { ...sources[name], ...updates } } } });
        const requireSavedSources = () => {
          const stored = withSecretPlaceholders(st.settings);
          if (JSON.stringify(st.settingsDraft.scrapers) !== JSON.stringify(stored.scrapers) || JSON.stringify(st.settingsDraft.javbus) !== JSON.stringify(stored.javbus)) throw new Error("\u522E\u524A\u6E90\u914D\u7F6E\u5DF2\u4FEE\u6539\uFF0C\u8BF7\u5148\u4FDD\u5B58\uFF0C\u518D\u6D4B\u8BD5\u8FDE\u63A5");
        };
        const testSources = (providers2) => this.perform(async () => {
          requireSavedSources();
          const result = await this.request("/api/movies/metadata-scrapers/test", "POST", { providers: providers2, concurrent: 3, apply_results: false });
          if (st.settings !== this.state.settings) throw new Error("\u914D\u7F6E\u5DF2\u91CD\u65B0\u8F7D\u5165\uFF0C\u8BF7\u91CD\u65B0\u6D4B\u8BD5\u522E\u524A\u6E90");
          this.setState((current) => ({ sourcesResult: [...current.sourcesResult.filter((item) => !providers2.includes(item.provider || item.name)), ...result.results || []] }));
        }, "\u522E\u524A\u6E90\u6D4B\u8BD5\u5DF2\u5B8C\u6210");
        const openTab = (name) => () => {
          this.setState({ seTab: name });
          if (["\u7F13\u5B58", "\u56FE\u7247\u7F13\u5B58"].includes(name)) return this.perform(() => this.loadCacheSettings(name === "\u56FE\u7247\u7F13\u5B58"));
        };
        return {
          saveDisabled: st.seTab === "\u914D\u7F6E\u6982\u89C8" || isCache && !cacheSaved,
          tabs: tabs.map((name) => ({ name, status: status(name), dot: status(name) === "\u5DF2\u8FDE\u63A5" ? OK : DIM2, stFg: DIM2, bg: name === st.seTab ? "rgba(145,132,217,.12)" : "transparent", fg: name === st.seTab ? "var(--fg)" : DIM, fw: name === st.seTab ? 500 : 400, pick: openTab(name) })),
          isOverview: st.seTab === "\u914D\u7F6E\u6982\u89C8",
          isAppearance: st.seTab === "\u5916\u89C2",
          isSources: key === "scrapers",
          isForm: isCache || isMedia || Boolean(key && key !== "scrapers") || st.seTab === "\u8FD0\u884C\u5B89\u5168",
          fields,
          cur: { title: st.seTab, desc: isImages ? "\u5C01\u9762\u56FE\u7247\u7EDF\u4E00\u7F13\u5B58\u5728\u670D\u52A1\u5668\uFF0C\u6240\u6709\u8BBE\u5907\u5171\u7528\u3002\u5BB9\u91CF\u72EC\u7ACB\u8BA1\u7B97\uFF0C\u4FDD\u5B58\u540E\u7ACB\u5373\u6E05\u7406\u8D85\u9650\u56FE\u7247\u3002" : isCache ? "\u7F13\u5B58\u4E0E\u6E05\u7406\u8BBE\u7F6E\u7EDF\u4E00\u4FDD\u5B58\u5728\u670D\u52A1\u5668\uFF0C\u6240\u6709\u8BBE\u5907\u548C\u6D4F\u89C8\u5668\u5171\u7528\u3002\u4FDD\u5B58\u540E\u7ACB\u5373\u751F\u6548\u3002" : isMedia ? "\u7EDF\u4E00\u914D\u7F6E\u522E\u524A\u8F93\u5165\u548C\u5F71\u89C6\u5E93\u8F93\u51FA\uFF0C\u4FDD\u5B58\u540E\u540C\u6B65\u5230\u5F71\u89C6\u5E93\u4E0E\u672C\u5730\u522E\u524A\u3002\u4FDD\u5B58\u4E0D\u4F1A\u79FB\u52A8\u6587\u4EF6\u6216\u542F\u52A8\u626B\u63CF\u3002" : st.seTab === "\u5916\u89C2" ? "\u7BA1\u7406\u754C\u9762\u914D\u8272\u4E3B\u9898" : "\u914D\u7F6E\u73B0\u6709\u670D\u52A1\u4E0E\u8FDE\u63A5", canTest: ["webdav", "aria2", "pikpak", "pan115", "scrapers", "javbus"].includes(key), banner: status(st.seTab), bannerFg: DIM, bannerBg: "var(--t03)", bannerRing: "var(--t09)", bannerMeta: "" },
          overview: tabs.filter((name) => !["\u914D\u7F6E\u6982\u89C8", "\u5916\u89C2"].includes(name)).map((name) => ({ name, status: status(name) || "\u67E5\u770B\u914D\u7F6E", dot: DIM2, stFg: DIM, ring: "var(--ring)", meta: "", action: "\u67E5\u770B", go: openTab(name) })),
          themes: [{ key: "dark", name: "\u6DF1\u8272", desc: "\u6DF1\u8272\u4E3B\u9898", bg: "#161826", surf: "#232532", ring: "#3f424d", fg: "#e9e9ed", dim: "#92939b", acc: "#9184d9" }, { key: "light", name: "\u6D45\u8272", desc: "\u6D45\u8272\u4E3B\u9898", bg: "#f1f2f7", surf: "#ffffff", ring: "#d7dae4", fg: "#1a1c28", dim: "#676977", acc: "#5b4fa8" }].map((theme) => ({ ...theme, active: st.theme === theme.key, ringOuter: st.theme === theme.key ? ACC : "var(--ring)", badge: st.theme === theme.key ? "\u5F53\u524D\u4F7F\u7528" : "\u70B9\u51FB\u5207\u6362", badgeFg: ACC, badgeBg: "var(--t08)", pick: () => {
            saveAppTheme(theme.key);
            this.setState({ theme: theme.key });
          } })),
          sources: providers.map((name, index) => {
            const source = sources[name] || {}, result = st.sourcesResult.find((item) => item.provider === name || item.name === name);
            return {
              name,
              host: name === "javbus" ? st.settingsDraft.javbus?.base_url || st.settings.javbus?.base_url || "" : source.base_url || "",
              status: source.implemented === false ? "\u672A\u5B9E\u73B0" : result ? result.success ? "\u6D4B\u8BD5\u6210\u529F" : "\u6D4B\u8BD5\u5931\u8D25" : "\u5F85\u6D4B\u8BD5",
              latency: result?.duration_ms != null ? `${result.duration_ms} ms` : "",
              note: [name === "javbus" ? "\u5171\u7528 JavBus \u8BBF\u95EE\u8BBE\u7F6E\uFF1B\u4FEE\u6539\u540E\u5148\u4FDD\u5B58\u518D\u6D4B\u8BD5" : "\u6D4B\u8BD5\u4F7F\u7528\u5DF2\u4FDD\u5B58\u914D\u7F6E", safeText(result?.error_message, "")].filter(Boolean).join(" \xB7 "),
              on: source.enabled,
              order: index + 1,
              op: source.enabled ? 1 : 0.55,
              ring: "var(--t09)",
              stFg: DIM,
              dot: DIM2,
              upDisabled: index === 0,
              toggleText: source.enabled ? "\u7981\u7528" : "\u542F\u7528",
              toggle: () => updateSource(name, { enabled: !source.enabled }),
              test: () => testSources([name]),
              up: () => {
                const next = [...providers];
                [next[index - 1], next[index]] = [next[index], next[index - 1]];
                this.setState({ settingsDraft: { ...st.settingsDraft, scrapers: { ...sources, priority: next } } });
              },
              fields: Object.entries(name === "javbus" ? {} : source).filter(([field]) => ["language", "request_delay", "base_url", "api_key"].includes(field)).map(([field, value]) => this.formField(field, value, (value2) => updateSource(name, { [field]: value2 }), field === "api_key" ? "secret" : typeof value === "number" ? "number" : "text"))
            };
          }),
          test: () => key === "scrapers" || key === "javbus" ? testSources(key === "javbus" ? ["javbus"] : providers) : this.perform(() => this.connect(key, !values.password && !values.secret && !values.cookie && Object.entries(values).every(([field, value]) => ["password", "secret", "cookie"].includes(field) || st.settings[key]?.[field] === value)), "\u8FDE\u63A5\u6210\u529F"),
          applyTestResults: () => this.perform(async () => {
            requireSavedSources();
            if (!st.sourcesResult.length) throw new Error("\u8BF7\u5148\u8FD0\u884C\u6D4B\u8BD5");
            await this.request("/api/movies/metadata-scrapers/apply-test-results", "POST", { results: st.sourcesResult });
            await this.loadSettings();
          }, "\u5DF2\u6309\u6D4B\u8BD5\u7ED3\u679C\u66F4\u65B0\u914D\u7F6E"),
          save: () => this.perform(async () => {
            if (isCache) {
              if (!cacheSaved) throw new Error("\u8BF7\u5148\u8F7D\u5165\u670D\u52A1\u7AEF\u7F13\u5B58\u8BBE\u7F6E");
              const result = await this.request(isImages ? "/api/image-cache" : "/api/metadata-cache", "PUT", cache);
              this.setState({ [savedKey]: result, [draftKey]: { ...result.settings } });
              return;
            }
            if (isMedia) return this.saveLibraryPaths({ ...media, source_directory: st.seSource ?? media.source_directory, directories: [st.seTarget ?? media.directories?.[0] ?? "", ...(media.directories || []).slice(1)] });
            if (st.seTab === "\u5916\u89C2") {
              saveAppTheme(st.theme);
              return;
            }
            await this.request("/api/system/settings", "PUT", buildSettingsPayload(st.settingsDraft));
            await this.loadSettings();
            await this.loadConnections();
          }, "\u8BBE\u7F6E\u5DF2\u4FDD\u5B58"),
          reload: () => this.perform(async () => {
            if (isCache) await this.loadCacheSettings(isImages);
            else if (isMedia) this.applyLibrarySettings(await this.request("/api/movies/local-library/settings"), true);
            else await this.loadSettings();
          }, "\u914D\u7F6E\u5DF2\u91CD\u65B0\u8F7D\u5165"),
          reset: () => isCache ? this.setState({ [draftKey]: cacheSaved ? { ...cacheSaved.settings } : null }) : isMedia ? this.setState({ seSource: void 0, seTarget: void 0 }) : this.setState({ settingsDraft: withSecretPlaceholders(st.settings), sourcesResult: [] }),
          startQr: () => this.perform(() => this.startQr()),
          showQrLogin: key === "pan115",
          logout: () => {
            clearPikPakSession();
            this.auth = null;
            this.setState({ pikLogged: false });
          },
          showLogout: key === "pikpak" && st.pikLogged
        };
      }
      renderVals() {
        const view = super.renderVals(), st = this.state;
        view.sysInfo = `JavJaeger ${window.versionInfo?.version || ""}`;
        for (const nav of view.nav) nav.badge = nav.label === "\u8F6C\u7801" ? String(data.TC.filter((task) => ["running", "queued"].includes(task.status)).length || "") : nav.label === "\u81EA\u52A8\u6A21\u5F0F" ? String(st.tasks.filter((task) => task.enabled).length || "") : "";
        view.tools = this.toolStates();
        view.bg.items = data.TC.filter((task) => ["running", "queued"].includes(task.status)).map((task) => ({ kind: "\u8F6C\u7801", name: task.code, pct: task.pct, pctText: `${task.pct}%`, meta: task.stage, fg: ACC, go: this.go("transcode") }));
        for (const [key, kind] of [["scanTask", "\u626B\u63CF\u5165\u5E93"], ["scrapeTask", "\u522E\u524A"], ["cleanupTask", "\u6E05\u6D17\u65E0\u6548\u6587\u4EF6"]]) if (st[key]) {
          const task = st[key], finished = jobFinished(task);
          view.bg.items.push({
            kind,
            name: safeText(task.message, finished ? "\u4EFB\u52A1\u5DF2\u7ED3\u675F\uFF0C\u70B9\u51FB\u67E5\u770B\u7ED3\u679C" : "\u540E\u53F0\u8FD0\u884C\u4E2D"),
            pct: task.percent || 0,
            pctText: finished ? task.status === "failed" ? "\u5931\u8D25" : "\u5DF2\u5B8C\u6210" : "",
            meta: finished ? "\u7ED3\u679C\u4FDD\u7559\uFF0C\u70B9\u51FB\u67E5\u770B\u4E0B\u4E00\u6B65" : "\u670D\u52A1\u7AEF\u540E\u53F0\u6267\u884C",
            fg: task.status === "failed" ? WARN : finished ? OK : ACC,
            finished,
            go: () => this.showBackgroundResult(key)
          });
        }
        if (st.dispatchTask) {
          const job = st.dispatchTask, pct = Math.round(100 * (job.completed_count || 0) / Math.max(1, job.total_count || 1));
          view.bg.items.push({ kind: "115 \u6D3E\u53D1", name: `\u6279\u6B21 ${job.current_batch || 0}/${job.total_batches || "\u5F85\u8BA1\u7B97"}`, pct, pctText: jobFinished(job) ? "\u67E5\u770B\u7ED3\u679C" : `${pct}%`, meta: `${job.completed_count || 0}/${job.total_count || 0} \u9879\u5DF2\u5904\u7406`, fg: job.status === "failed" ? WARN : ACC, finished: jobFinished(job), go: () => this.showBackgroundResult("dispatchTask") });
        }
        for (const task of st.tasks) for (const run of task.runs || []) if (run.status === "running") view.bg.items.push({ kind: "\u81EA\u52A8\u4EFB\u52A1", name: task.name, pct: 0, pctText: "", meta: run.message || "\u8FD0\u884C\u4E2D", fg: ACC, go: this.go("auto") });
        const activeCount = view.bg.items.filter((item) => !item.finished).length + Number(Boolean(st.informationTask && !jobFinished(st.informationTask)));
        if (st.informationTask) {
          const task = st.informationTask, finished = jobFinished(task);
          view.bg.items.unshift({
            kind: task.operation === "check" ? "\u8D44\u6599\u68C0\u67E5" : "\u8D44\u6599\u8865\u5168",
            name: informationSummary(task),
            pct: task.percent || 0,
            pctText: finished ? task.status === "failed" ? "\u5931\u8D25" : task.result?.failed_count ? "\u90E8\u5206\u5B8C\u6210" : "\u5DF2\u5B8C\u6210" : "",
            meta: finished ? "\u70B9\u51FB\u67E5\u770B\u7ED3\u679C\uFF0C\u7EE7\u7EED\u8865\u5168\u6216\u5904\u7406\u5931\u8D25\u9879" : "\u670D\u52A1\u7AEF\u540E\u53F0\u6267\u884C\uFF0C\u53EF\u79BB\u5F00\u6216\u5237\u65B0\u9875\u9762",
            fg: task.status === "failed" || task.result?.failed_count ? WARN : finished ? OK : ACC,
            go: () => this.showInformationResult()
          });
        }
        view.bg.count = view.bg.items.length;
        view.bg.animation = activeCount ? "jjspin 900ms linear infinite" : "none";
        const background = this.pageItems(view.bg.items, "bgPage", [], 6);
        view.bg.items = background.items;
        view.bg.paging = background.paging;
        const confirmation = this.pageItems(view.dlg.list, "dlgPage", []);
        view.dlg.list = confirmation.items;
        view.dlg.paging = confirmation.paging;
        const search = view.s, movies = st.route === "search" ? this.visible() : [];
        const movieIndex = this.searchByCode;
        search.paging = this.pageItems(movies, "searchPage", []).paging;
        search.selectPage = () => this.setState({ sel: [.../* @__PURE__ */ new Set([...st.sel, ...search.rows.map((row) => row.code)])] });
        Object.assign(search, {
          offline: Boolean(st.searchError),
          error: st.searchError,
          srcText: st.searchError ? "\u67E5\u8BE2\u5931\u8D25" : st.searchDone ? "\u5DF2\u83B7\u53D6\u7ED3\u679C" : "\u5F85\u67E5\u8BE2",
          srcDot: st.searchError ? BAD : DIM2,
          srcFg: DIM,
          showGrid: !st.loading && movies.length > 0 && st.view === "grid",
          showList: !st.loading && movies.length > 0 && st.view === "list",
          empty: !st.loading && !st.searchError && movies.length === 0 && st.sMode !== "magnet",
          emptyTitle: st.searchDone ? "\u6CA1\u6709\u5339\u914D\u7684\u5F71\u7247" : "\u5F00\u59CB\u68C0\u7D22",
          emptyBody: "\u586B\u5199\u6761\u4EF6\u540E\u67E5\u8BE2\u771F\u5B9E\u5F71\u7247\u6570\u636E\u3002",
          showPager: !st.loading && !st.searchError && st.searchDone && st.sMode === "filter" && st.fetchMode === "page",
          pagerText: `\u672C\u9875 ${movies.length} \u90E8 \xB7 \u662F\u5426\u6709\u4E0B\u4E00\u9875\u4EE5\u6765\u6E90\u8FD4\u56DE\u7ED3\u679C\u4E3A\u51C6`,
          magnetProgress: st.searchDone ? `\u5DF2\u67E5\u8BE2 ${this.magnets.size} / ${data.MOVIES.length} \u90E8\u5F71\u7247\u7684\u78C1\u529B` : "",
          nextDisabled: !st.nextPage,
          noResults: !movies.length,
          summary: `${movies.length} \u90E8`,
          recogCount: movies.length,
          recogSkipped: "",
          selSize: "",
          selNote: "",
          fCatalogNote: "\u53EF\u8F93\u5165\u4EE3\u7801\u6216\u4ECE\u76EE\u5F55\u9009\u62E9",
          magQueryNote: `${this.magnets.get(st.code)?.length || 0} \u6761\u78C1\u529B`,
          downloadAll: () => this.confirmDispatch(movies.map((movie) => movie.code)),
          batchDispatch: () => this.confirmDispatch(st.sel),
          batchAuto: () => this.createAuto(st.sel),
          toggleExclude4k: () => {
            this.setState({ exclude4k: !st.exclude4k });
            if (st.searchDone || st.loading) void this.runSearch();
          },
          toolStatus: this.toolStates().find((tool) => tool.name === st.tool)?.hint || "\u672A\u8FDE\u63A5",
          toolCfg: this.toolConfig(st.toolCfg)
        });
        const reset = search.reset;
        search.reset = () => {
          reset();
          this.clearSearch();
          this.setState({ recogHtml: "" });
        };
        for (const mode of search.modes) {
          const pick = mode.pick;
          mode.pick = () => {
            pick();
            this.clearSearch();
          };
        }
        for (const key of ["setSortSize", "setSortDate", "setOrderDesc", "setOrderAsc", "setSub0", "setSubTrue", "setSubFalse"]) {
          const change = search[key];
          search[key] = () => {
            change();
            if (st.searchDone || st.loading) void this.runSearch();
          };
        }
        search.magRows = this.magnetRows(st.code);
        const activeTool = this.toolStates().find((tool) => tool.name === st.tool);
        search.toolDot = activeTool?.dot;
        search.toolFg = activeTool?.fg;
        for (const row of search.rows) {
          const movie = movieIndex.get(row.code);
          row.cover = movie?.cover;
          if (!movie?.actors.length) row.actorText = movie?.detailsLoading ? "\u8D44\u6599\u8865\u5168\u4E2D\u2026" : movie?.detailError ? "\u8D44\u6599\u8865\u5168\u5931\u8D25\uFF0C\u70B9\u51FB\u8BE6\u60C5\u91CD\u8BD5" : "";
          if (!movie?.mag) row.magText = movie?.magnetsLoading ? "\u6B63\u5728\u67E5\u8BE2\u78C1\u529B\u2026" : movie?.magnetError ? `\u78C1\u529B\u83B7\u53D6\u5931\u8D25\uFF1A${movie.magnetError}` : "\u5F53\u524D\u6761\u4EF6\u4E0B\u6CA1\u6709\u53EF\u7528\u78C1\u529B";
        }
        for (const row of search.rows) row.open = () => this.perform(async () => {
          const version = this.requestVersion;
          const original = movieIndex.get(row.code);
          this.setState({ detail: row.code });
          await this.loadMovieDetails(original, version);
          if (version !== this.requestVersion || this._disposed) return;
          const magnets = await this.getMagnets(original);
          if (version !== this.requestVersion || this._disposed) return;
          this.magnets.set(row.code, magnets);
          original.mag = magnets[0] ? `${magnets[0].name} \xB7 ${magnets[0].size}` : "";
          original.magCount = magnets.length;
          this.forceUpdate?.();
        });
        if (search.d) {
          search.d.cover = movieIndex.get(st.detail)?.cover;
          search.d.magnets = this.magnetRows(st.detail);
          search.d.magCount = search.d.magnets.length;
          search.d.copy = () => this.perform(() => this.copyText(st.detail), "\u756A\u53F7\u5DF2\u590D\u5236");
        }
        if (search.browse) {
          const groups = search.browse.groups;
          const page = this.pageItems(groups.flatMap((group) => group.items), "catalogPage", [st.browse, st.browseQ]);
          const visible = new Set(page.items);
          search.browse.groups = groups.map((group) => ({ ...group, items: group.items.filter((item) => visible.has(item)) })).filter((group) => group.items.length);
          search.browse.paging = page.paging;
        }
        view.version = window.versionInfo?.version || "";
        return view;
      }
      magnetRows(code) {
        return (this.magnets.get(code) || []).map((magnet) => ({ ...magnet, date: magnet.shareDate || magnet.date || "", fg: "var(--fg)", sub: magnet.hasSubtitle || magnet.has_subtitle || magnet.subtitle ? "\u6709" : "\u65E0", subFg: DIM, flags: [], dispatch: () => this.confirmDispatch([code], [magnet]) }));
      }
      toolStates() {
        return [
          { name: "PikPak", connected: this.state.pikLogged },
          { name: "115 \u7F51\u76D8", connected: this.allConnected() },
          { name: "Aria2", connected: this.state.connections.aria2_connected }
        ].map((tool) => ({ ...tool, dot: tool.connected ? OK : DIM2, fg: tool.connected ? OK : DIM2, halo: "transparent", hint: tool.connected ? "\u5DF2\u8FDE\u63A5" : "\u672A\u8FDE\u63A5" }));
      }
      toolConfig(name) {
        if (!name) return null;
        const tool = this.toolStates().find((item) => item.name === name);
        return {
          name,
          desc: "\u8FDE\u63A5\u5F53\u524D\u6D4F\u89C8\u5668\u4F1A\u8BDD\u7684\u4E0B\u8F7D\u5DE5\u5177",
          status: tool.hint,
          dot: tool.dot,
          fg: tool.fg,
          fields: [],
          canAct: true,
          actText: name === "115 \u7F51\u76D8" ? "\u751F\u6210\u767B\u5F55\u4E8C\u7EF4\u7801" : "\u7528\u914D\u7F6E\u8FDE\u63A5",
          actFg: ACC,
          act: () => this.perform(() => name === "115 \u7F51\u76D8" ? this.startQr() : this.connect(toolKey(name), true), "\u64CD\u4F5C\u5B8C\u6210"),
          qr: Boolean(name === "115 \u7F51\u76D8" && this.state.qr),
          qrImage: this.state.qr?.qrcode_image_url,
          qrText: this.state.qr?.message || "\u8BF7\u4F7F\u7528 115 App \u626B\u7801",
          qrState: this.state.qr?.state || "",
          goSettings: () => this.setState({ toolCfg: null, route: "settings", seTab: name })
        };
      }
    };
  }

  // frontend/src/design/cinema.mjs
  var icon = (name) => `<i aria-hidden="true" class="ph ph-${name}"></i>`;
  var artwork = (key, className, loading = "lazy") => `<div class="${className}"><span>${icon("film-strip")}<small>{{ ${key}.code }}</small></span><sc-if value="{{ ${key}.cover }}"><img src="{{ ${key}.cover }}" alt="" loading="${loading}" onError="{{ cn.imageError }}"></sc-if></div>`;
  var cards = (list) => `<sc-for list="{{ ${list} }}" as="it"><button class="jj-cinema-card" onClick="{{ it.open }}" aria-label="\u67E5\u770B {{ it.code }} \u8BE6\u60C5" title="{{ it.title }}">
  <div class="jj-cinema-card-art">${artwork("it", "jj-cinema-poster")}<span class="jj-cinema-card-overlay">${icon("info")}</span><sc-if value="{{ it.unavailable }}"><span class="jj-cinema-badge">\u6587\u4EF6\u7F3A\u5931</span></sc-if><span class="jj-cinema-card-quality">{{ it.res }}</span></div>
  <span class="jj-cinema-card-title">{{ it.title }}</span><span class="jj-cinema-card-meta">{{ it.caption }}</span>
</button></sc-for>`;
  var pager = (key) => `<sc-if value="{{ ${key}.visible }}"><nav class="jj-pager" aria-label="\u5206\u9875"><button class="btn btn-secondary" disabled="{{ ${key}.first }}" onClick="{{ ${key}.prev }}">\u4E0A\u4E00\u9875</button><span role="status">{{ ${key}.text }}</span><button class="btn btn-secondary" disabled="{{ ${key}.last }}" onClick="{{ ${key}.next }}">\u4E0B\u4E00\u9875</button></nav></sc-if>`;
  var backdrop = (key) => `<sc-if value="{{ ${key}.backdrop }}"><img class="jj-cinema-backdrop" src="{{ ${key}.backdrop }}" alt="" onError="{{ cn.imageError }}"></sc-if>`;
  var cinemaTemplate = `<sc-if value="{{ at.cinema }}"><div class="jj-cinema">
  <header class="jj-cinema-bar" aria-hidden="{{ cn.detailOpen }}">
    <span class="jj-cinema-brand">JavJaeger</span>
    <nav aria-label="\u5F71\u9662\u5BFC\u822A"><sc-for list="{{ cn.tabs }}" as="t"><button aria-current="{{ t.current }}" onClick="{{ t.pick }}">{{ t.name }}</button></sc-for></nav>
    <div class="jj-cinema-search">${icon("magnifying-glass")}<input type="search" aria-label="\u5F71\u9662\u641C\u7D22" placeholder="\u641C\u7D22\u5F71\u7247\u3001\u756A\u53F7\u3001\u6F14\u5458" value="{{ cn.query }}" onChange="{{ cn.setQuery }}"><sc-if value="{{ cn.hasQuery }}"><button aria-label="\u6E05\u7A7A\u5F71\u9662\u641C\u7D22" onClick="{{ cn.clearQuery }}">${icon("x")}</button></sc-if></div>
    <button class="btn btn-secondary jj-cinema-exit" onClick="{{ cn.exit }}">\u7BA1\u7406\u754C\u9762</button>
  </header>
  <main class="jj-cinema-content" aria-label="\u5F71\u9662\u5185\u5BB9" aria-hidden="{{ cn.detailOpen }}">
    <sc-if value="{{ cn.showHero }}"><section class="jj-cinema-hero" aria-label="\u7CBE\u9009\u5F71\u7247">
      ${backdrop("cn.hero")}
      <div class="jj-cinema-hero-copy"><h1 title="{{ cn.hero.title }}">{{ cn.hero.title }}</h1><p class="jj-cinema-meta">{{ cn.hero.meta }}</p><p class="jj-cinema-synopsis">{{ cn.hero.desc }}</p>
        <div class="jj-cinema-actions"><button class="btn btn-primary" disabled="{{ cn.hero.unavailable }}" onClick="{{ cn.play }}">${icon("play")} {{ cn.hero.playText }}</button><button class="btn btn-secondary" onClick="{{ cn.info }}">\u5F71\u7247\u8BE6\u60C5</button></div>
      </div>${artwork("cn.hero", "jj-cinema-feature-poster", "eager")}
    </section></sc-if>
    <sc-if value="{{ cn.showShelves }}"><div class="jj-cinema-shelves">
      <sc-if value="{{ cn.sectionTitle }}"><div class="jj-cinema-section-heading"><div><h1>{{ cn.sectionTitle }}</h1><p>{{ cn.sectionMeta }}</p></div></div></sc-if>
      <sc-for list="{{ cn.shelves }}" as="sh"><section class="jj-cinema-shelf"><div class="jj-cinema-section-heading"><h2>{{ sh.name }} <small>{{ sh.meta }}</small></h2><div class="jj-cinema-shelf-controls"><button class="btn btn-ghost" onClick="{{ sh.openAll }}">\u67E5\u770B\u5168\u90E8</button><button class="btn btn-secondary jj-cinema-arrow" aria-label="\u4E0A\u4E00\u7EC4 {{ sh.name }}" onClick="{{ sh.previous }}">${icon("caret-left")}</button><button class="btn btn-secondary jj-cinema-arrow" aria-label="\u4E0B\u4E00\u7EC4 {{ sh.name }}" onClick="{{ sh.next }}">${icon("caret-right")}</button></div></div><div class="jj-cinema-shelf-track" tabIndex="0" aria-label="{{ sh.name }}\u6D77\u62A5">${cards("sh.items")}</div></section></sc-for>
      ${pager("cn.shelfPaging")}
      <sc-if value="{{ cn.shelvesEmpty }}"><div class="jj-cinema-empty">${icon("film-strip")}<h2>{{ cn.sectionEmpty }}</h2><p>\u626B\u63CF\u6216\u8865\u5168\u5F71\u7247\u8D44\u6599\u540E\uFF0C\u5728\u8FD9\u91CC\u6D4F\u89C8\u4F60\u7684\u6536\u85CF\u3002</p><button class="btn btn-secondary" onClick="{{ cn.browseAll }}">\u6D4F\u89C8\u5168\u90E8\u5F71\u7247</button></div></sc-if>
    </div></sc-if>
    <sc-if value="{{ cn.showActors }}"><section class="jj-cinema-browse"><div class="jj-cinema-section-heading"><div><h1>\u6F14\u5458</h1><p>{{ cn.actorsMeta }}</p></div></div><div class="jj-cinema-actors"><sc-for list="{{ cn.actors }}" as="a"><button class="jj-cinema-actor" onClick="{{ a.open }}"><span class="jj-cinema-avatar">{{ a.initial }}<sc-if value="{{ a.avatarUrl }}"><img src="{{ a.avatarUrl }}" alt="" loading="lazy" onError="{{ cn.imageError }}"></sc-if></span><strong>{{ a.name }}</strong><span>{{ a.count }}</span></button></sc-for></div>${pager("cn.actorPaging")}<sc-if value="{{ cn.actorsEmpty }}"><div class="jj-cinema-empty"><h2>\u6682\u65E0\u6F14\u5458\u4FE1\u606F</h2><p>\u8865\u5168\u5F71\u7247\u8D44\u6599\u540E\uFF0C\u6F14\u5458\u4F1A\u51FA\u73B0\u5728\u8FD9\u91CC\u3002</p></div></sc-if></section></sc-if>
    <sc-if value="{{ cn.showWall }}"><section class="jj-cinema-browse">
      <sc-if value="{{ cn.actorHeader }}"><button class="btn btn-ghost jj-cinema-back" onClick="{{ cn.backToActors }}">${icon("arrow-left")} \u5168\u90E8\u6F14\u5458</button></sc-if>
      <div class="jj-cinema-section-heading"><div><h1>{{ cn.wallTitle }}</h1><p role="status">{{ cn.wallMeta }}</p></div><sc-if value="{{ cn.hasLibrary }}"><label class="jj-cinema-sort">\u6392\u5E8F<select class="input" aria-label="\u5F71\u9662\u6392\u5E8F" value="{{ cn.sort }}" onChange="{{ cn.setSort }}"><sc-for list="{{ cn.sorts }}" as="o"><option>{{ o.name }}</option></sc-for></select></label></sc-if></div>
      <sc-if value="{{ cn.hasLibrary }}"><details class="jj-cinema-filters" open="{{ cn.filtersOpen }}" onToggle="{{ cn.toggleFilters }}"><summary>${icon("sliders-horizontal")} \u7B5B\u9009\u5F71\u7247 <span>{{ cn.filterCount }}</span></summary><sc-if value="{{ cn.filtersOpen }}"><div><sc-for list="{{ cn.filterGroups }}" as="g"><div class="jj-cinema-filter-group" role="group" aria-label="{{ g.name }}\u7B5B\u9009"><strong>{{ g.name }}</strong><div><input class="input" type="search" aria-label="\u641C\u7D22{{ g.name }}\u9009\u9879" placeholder="\u641C\u7D22{{ g.name }}\u9009\u9879" value="{{ g.query }}" onChange="{{ g.setQuery }}" style="flex-basis:100%;width:min(100%,240px)"><sc-for list="{{ g.items }}" as="o"><button aria-pressed="{{ o.on }}" onClick="{{ o.toggle }}">{{ o.name }} <small>{{ o.count }}</small></button></sc-for><sc-if value="{{ g.empty }}"><span role="status">\u6CA1\u6709\u5339\u914D\u9009\u9879</span></sc-if><div style="flex-basis:100%">${pager("g.paging")}</div></div></div></sc-for></div></sc-if></details></sc-if>
      <sc-if value="{{ cn.hasFilters }}"><div class="jj-cinema-active-filters"><sc-for list="{{ cn.activeFilters }}" as="f"><button class="btn btn-secondary" aria-label="\u79FB\u9664 {{ f.text }}" onClick="{{ f.remove }}">{{ f.text }} ${icon("x")}</button></sc-for><button class="btn btn-ghost" onClick="{{ cn.clearFilters }}">\u6E05\u7A7A {{ cn.filterCount }} \u4E2A\u6761\u4EF6</button></div></sc-if>
      <sc-if value="{{ cn.wallEmpty }}"><div class="jj-cinema-empty">${icon("film-strip")}<h2>{{ cn.emptyTitle }}</h2><p>{{ cn.emptyBody }}</p><button class="btn btn-secondary" onClick="{{ cn.clearFilters }}">{{ cn.clearText }}</button></div></sc-if>
      <div class="jj-cinema-wall">${cards("cn.wall")}</div>${pager("cn.paging")}
    </section></sc-if>
  </main>
  <sc-if value="{{ cn.detail }}"><section class="jj-cinema-detail" aria-hidden="{{ cn.playing }}" role="dialog" aria-modal="true" aria-label="\u5F71\u7247\u8BE6\u60C5">
    <div class="jj-cinema-detail-nav"><button class="btn btn-secondary" onClick="{{ cn.closeDetail }}">${icon("arrow-left")} \u8FD4\u56DE\u6D4F\u89C8</button><span>{{ cn.detail.code }}</span><button class="btn btn-ghost" aria-label="\u5173\u95ED\u5F71\u7247\u8BE6\u60C5" onClick="{{ cn.closeDetail }}">${icon("x")}</button></div>
    <div class="jj-cinema-detail-body">${backdrop("cn.detail")}<div class="jj-cinema-detail-intro">${artwork("cn.detail", "jj-cinema-detail-poster", "eager")}<div class="jj-cinema-detail-copy"><h1>{{ cn.detail.title }}</h1><p class="jj-cinema-meta">{{ cn.detail.meta }}</p><div class="jj-cinema-actions"><button class="btn btn-primary" disabled="{{ cn.detail.unavailable }}" onClick="{{ cn.detail.play }}">${icon("play")} {{ cn.detail.playText }}</button><button class="btn btn-secondary" onClick="{{ cn.detail.manage }}">\u5728\u5F71\u89C6\u5E93\u4E2D\u7BA1\u7406</button></div><p class="jj-cinema-detail-synopsis">{{ cn.detail.desc }}</p><dl class="jj-cinema-facts"><sc-for list="{{ cn.detail.fields }}" as="f"><div><dt>{{ f.name }}</dt><dd>{{ f.value }}</dd></div></sc-for></dl></div></div>
    <div class="jj-cinema-detail-sections"><section><h2>\u6F14\u5458\u4E0E\u6807\u7B7E</h2><div class="jj-cinema-tags"><sc-for list="{{ cn.detail.actors }}" as="a"><button class="btn btn-secondary" onClick="{{ a.open }}">${icon("user")} {{ a.name }}</button></sc-for><sc-for list="{{ cn.detail.tags }}" as="g"><button class="btn btn-secondary" onClick="{{ g.open }}">{{ g.name }}</button></sc-for><sc-if value="{{ cn.detail.noTags }}"><span>\u6682\u65E0\u6F14\u5458\u4E0E\u6807\u7B7E\u8D44\u6599</span></sc-if></div></section>
    <section class="jj-cinema-files"><h2>\u64AD\u653E\u6587\u4EF6</h2><label>\u9009\u62E9\u7248\u672C\u6216\u5206\u6BB5<select class="input" aria-label="\u8BE6\u60C5\u64AD\u653E\u6587\u4EF6" value="{{ cn.detail.fileIndex }}" onChange="{{ cn.detail.selectFile }}"><sc-for list="{{ cn.detail.files }}" as="f"><option value="{{ f.value }}" disabled="{{ f.missing }}">{{ f.label }}</option></sc-for></select></label><p>{{ cn.detail.fileMeta }}</p><button class="btn btn-primary" disabled="{{ cn.detail.unavailable }}" onClick="{{ cn.detail.play }}">${icon("play")} \u64AD\u653E\u6240\u9009\u6587\u4EF6</button><span>\u4F7F\u7528\u6D4F\u89C8\u5668\u64AD\u653E\u539F\u6587\u4EF6\uFF1B\u591A\u6BB5\u5F71\u7247\u4F1A\u6309\u987A\u5E8F\u64AD\u653E\u53EF\u7528\u6587\u4EF6\u3002</span></section></div></div>
  </section></sc-if>
</div></sc-if>`;

  // frontend/src/design/template.mjs
  function adaptTemplate(source, logo) {
    let html = source.replaceAll("<i class=", '<i aria-hidden="true" class=').replace(/<link[^>]*href="_ds\/[^"]*"[^>]*>/g, "").replace(/<script src="_ds\/[^"]*"><\/script>/g, "").replaceAll('src="static/logo.jpg"', `src="${logo}"`).replace(">v2.4.1</span>", ">{{ version }}</span>").replace('animation:jjspin 900ms linear infinite"></span>\u540E\u53F0', 'animation:{{ bg.animation }}"></span>\u540E\u53F0').replace("width:1440px;min-height:900px;", "width:100%;min-height:100vh;").replace('value="{{ r.path }}">', 'value="{{ r.path }}" onChange="{{ r.change }}" aria-label="\u8DEF\u5F84"><button class="btn btn-secondary" onClick="{{ r.browse }}">\u6D4F\u89C8</button>').replaceAll('value="{{ f.value }}">', 'value="{{ f.value }}" onChange="{{ f.set }}">').replace('placeholder="{{ f.placeholder }}" value="{{ f.value }}" onChange="{{ f.set }}">\n                    <button', 'type="{{ f.inputType }}" autoComplete="off" placeholder="{{ f.placeholder }}" value="{{ f.value }}" onChange="{{ f.set }}">\n                    <button').replace('<h4 style="margin:0">{{ au.cur.name }}</h4>', '<input class="input" aria-label="\u4EFB\u52A1\u540D\u79F0" value="{{ au.cur.name }}" onChange="{{ au.cur.setName }}">').replace('<div style="display:flex;align-items:center;gap:9px;padding:9px 12px;box-shadow:inset 0 -1px 0 var(--line2)">', '<button class="btn btn-ghost" style="display:flex;width:100%;align-items:center;gap:9px;padding:9px 12px;box-shadow:inset 0 -1px 0 var(--line2)" onClick="{{ e.open }}">').replace("{{ e.meta }}</span>\n            </div>", "{{ e.meta }}</span>\n            </button>").replace('onClick="{{ fs.sendSel }}"', 'disabled="{{ !fs.canSend }}" onClick="{{ fs.sendSel }}"').replace('disabled="{{ f.isDir }}" onClick="{{ f.send }}"', 'disabled="{{ !f.canSend }}" onClick="{{ f.send }}"').replace('disabled="{{ f.isDir }}" onChange="{{ f.toggle }}"', 'onChange="{{ f.toggle }}"').replace('onChange="{{ d.toggleSkipLocal }}"', 'disabled="{{ true }}" onChange="{{ d.toggleSkipLocal }}"').replace('onChange="{{ d.toggleSkipTried }}"', 'disabled="{{ true }}" onChange="{{ d.toggleSkipTried }}"').replace('<button class="btn btn-secondary" style="font-size:12px" onClick="{{ lb.stopScan }}">\u505C\u6B62</button>', '<span style="font-size:12px;color:var(--dim)">\u540E\u53F0\u6267\u884C\u4E2D</span>');
    html = html.replace("<label>\u626B\u63CF\u76EE\u5F55</label>", "<label>\u5F85\u522E\u524A\u76EE\u5F55</label>").replace("<label>\u6574\u7406\u8F93\u51FA\u76EE\u5F55</label>", "<label>\u5F71\u89C6\u5E93\u76EE\u5F55</label>").replace('onChange="{{ sc.setScanDir }}"></div>', 'aria-label="\u5F85\u522E\u524A\u76EE\u5F55" onChange="{{ sc.setScanDir }}"><button class="btn btn-secondary" onClick="{{ sc.browseSource }}">\u6D4F\u89C8\u5F85\u522E\u524A\u76EE\u5F55</button></div>').replace('onChange="{{ sc.setOutDir }}"></div>', 'aria-label="\u5F71\u89C6\u5E93\u76EE\u5F55" onChange="{{ sc.setOutDir }}"><button class="btn btn-secondary" onClick="{{ sc.browseTarget }}">\u6D4F\u89C8\u5F71\u89C6\u5E93\u76EE\u5F55</button><span class="jj-path-hint">\u8BFB\u53D6\u5F85\u522E\u524A\u76EE\u5F55\uFF0C\u6309\u9884\u89C8\u6574\u7406\u5230\u5F71\u89C6\u5E93\u76EE\u5F55\u3002\u672C\u9875\u4FEE\u6539\u4EC5\u7528\u4E8E\u672C\u6B21\u4EFB\u52A1\u3002</span><button class="btn btn-ghost" onClick="{{ sc.configurePaths }}">\u914D\u7F6E\u9ED8\u8BA4\u76EE\u5F55</button></div>').replace('<h5 style="margin:0">\u5F71\u89C6\u5E93\u8DEF\u5F84\u914D\u7F6E</h5>', '<h5 style="margin:0">\u5A92\u4F53\u76EE\u5F55\u914D\u7F6E</h5>').replace('<sc-for list="{{ lb.pathGroups }}"', `<div class="field"><label for="jj-source-directory">\u5F85\u522E\u524A\u76EE\u5F55</label><span class="jj-path-hint">\u4E0B\u8F7D\u5B8C\u6210\u3001\u5C1A\u672A\u6574\u7406\u7684\u539F\u7247\u653E\u5728\u8FD9\u91CC\u3002\u626B\u63CF\u5F71\u89C6\u5E93\u65F6\u4F1A\u8DF3\u8FC7\u6B64\u76EE\u5F55\u3002</span><div class="jj-path-input"><input id="jj-source-directory" class="input" aria-label="\u5F85\u522E\u524A\u76EE\u5F55" value="{{ lb.sourcePath }}" onChange="{{ lb.setSourcePath }}"><button class="btn btn-secondary" onClick="{{ lb.browseSource }}">\u6D4F\u89C8</button></div></div>
        <sc-for list="{{ lb.pathGroups }}"`).replace("\u8DEF\u5F84\u53D8\u66F4\u4E0D\u4F1A\u7ACB\u5373\u626B\u63CF\u3002\u4FDD\u5B58\u540E\u7528\u300C\u626B\u63CF\u5165\u5E93\u300D\u91CD\u65B0\u7D22\u5F15\uFF1B\u88AB\u79FB\u9664\u7684\u8DEF\u5F84\u5176\u5F71\u7247\u8BB0\u5F55\u4F1A\u4FDD\u7559\uFF0C\u76F4\u5230\u6267\u884C\u300C\u6E05\u6D17\u65E0\u6548\u6587\u4EF6\u300D\u3002", "\u4FDD\u5B58\u540E\uFF0C\u672C\u5730\u522E\u524A\u4F1A\u4F7F\u7528\u8FD9\u4E24\u4E2A\u9ED8\u8BA4\u76EE\u5F55\u3002\u751F\u6210\u9884\u89C8\u540E\uFF0C\u786E\u8BA4\u6267\u884C\u624D\u4F1A\u79FB\u52A8\u6587\u4EF6\uFF1B\u626B\u63CF\u5165\u5E93\u53EA\u8BFB\u53D6\u5F71\u89C6\u5E93\u76EE\u5F55\u3002\u4FEE\u6539\u8DEF\u5F84\u4E0D\u4F1A\u5220\u9664\u5DF2\u6709\u7D22\u5F15\u6216\u7ACB\u5373\u626B\u63CF\u3002");
    html = html.replace(">\u5A92\u4F53\u5E93\u8DEF\u5F84</span>", ">\u5F71\u89C6\u5E93\u76EE\u5F55</span>").replace('<button class="btn btn-secondary btn-block" style="font-size:12.5px" onClick="{{ lb.openPaths }}">', '<div class="jj-path-hint">\u5F85\u522E\u524A\u76EE\u5F55<div class="jj-path-value">{{ lb.sourceDirectory }}</div></div><button class="btn btn-ghost" onClick="{{ lb.openScrape }}">\u524D\u5F80\u672C\u5730\u522E\u524A</button><button class="btn btn-secondary btn-block" style="font-size:12.5px" onClick="{{ lb.openPaths }}">').replace('<span style="font-size:11px;color:{{ r.stFg }};width:118px;text-align:right">{{ r.status }}</span>', "").replace("\u9009\u62E9\u6A21\u677F\u5E76\u786E\u8BA4\u626B\u63CF\u76EE\u5F55\u540E\u70B9\u51FB\u300C\u751F\u6210\u9884\u89C8\u300D\u3002", "\u786E\u8BA4\u5F85\u522E\u524A\u76EE\u5F55\u548C\u5F71\u89C6\u5E93\u76EE\u5F55\u540E\u70B9\u51FB\u300C\u751F\u6210\u9884\u89C8\u300D\u3002");
    const start = html.indexOf('  <sc-if value="{{ cn.player }}">');
    const end = html.indexOf('  <sc-if value="{{ at.auto }}">', start);
    html = html.slice(0, start) + `
  <sc-if value="{{ cn.player }}">
    <div class="jj-player" role="dialog" aria-modal="true" aria-label="\u672C\u5730\u5F71\u7247\u64AD\u653E">
      <div style="display:flex;align-items:center;flex-wrap:wrap;gap:12px;padding:16px 26px"><span>{{ cn.player.code }} \xB7 {{ cn.player.title }}</span><select class="input" aria-label="\u64AD\u653E\u6587\u4EF6" value="{{ cn.player.fileIndex }}" onChange="{{ cn.player.selectFile }}"><sc-for list="{{ cn.player.files }}" as="f"><option value="{{ f.value }}" disabled="{{ f.missing }}">{{ f.label }}</option></sc-for></select><button class="btn btn-secondary" style="margin-left:auto" onClick="{{ cn.closePlayer }}">\u505C\u6B62\u64AD\u653E</button></div>
      <video src="{{ cn.player.url }}" controls="{{ true }}" autoPlay="{{ true }}" playsInline="{{ true }}" onEnded="{{ cn.player.ended }}" onError="{{ cn.player.error }}" style="width:100%;min-height:0;flex:1;background:#000"></video>
    </div>
  </sc-if>

` + html.slice(end);
    html = html.replace('<sc-if value="{{ se.cur.canTest }}">', '<sc-if value="{{ se.showQrLogin }}"><button class="btn btn-secondary" onClick="{{ se.startQr }}">\u626B\u7801\u767B\u5F55</button></sc-if><sc-if value="{{ se.showLogout }}"><button class="btn btn-secondary" onClick="{{ se.logout }}">\u9000\u51FA\u767B\u5F55</button></sc-if><sc-if value="{{ se.cur.canTest }}">').replaceAll('class="dialog elev-lg"', 'class="dialog elev-lg" role="dialog" aria-modal="true"').replace('<sc-if value="{{ dlg.open }}">\n    <div class="dialog-backdrop"', '<sc-if value="{{ dlg.open }}">\n    <div class="dialog-backdrop jj-confirm"');
    html = html.replace(/(onChange="{{ lb.setActor }}">)[\s\S]*?(<\/select>)/, '$1<sc-for list="{{ lb.actorOptions }}" as="o"><option>{{ o.t }}</option></sc-for>$2').replace(/(onChange="{{ lb.setStudio }}">)[\s\S]*?(<\/select>)/, '$1<sc-for list="{{ lb.studioOptions }}" as="o"><option>{{ o.t }}</option></sc-for>$2').replace("\u6700\u8FD1\u626B\u63CF 07-23 09:12 \xB7 \u7D22\u5F15\u6765\u6E90 library.db", "\u5DF2\u7D22\u5F15\u7684\u672C\u5730\u5F71\u7247").replace("\u6B63\u5728\u626B\u63CF /media/JAV-2 \xB7 1,204 / 1,366 \u6587\u4EF6 \xB7 ffprobe \u8BFB\u53D6\u5A92\u4F53\u53C2\u6570", "{{ lb.scanMessage }}").replace("width:88%;background:var(--acc)", "width:{{ lb.scanPercent }}%;background:var(--acc)").replace(/<div style="width:88px;height:88px;flex:none;[^>]*><\/div>/, '<img src="{{ s.toolCfg.qrImage }}" alt="115 \u767B\u5F55\u4E8C\u7EF4\u7801" style="width:180px;height:180px;flex:none;background:#fff;border-radius:6px">').replace("padding:9px 14px;font-size:13px;animation:jjrise-c", "padding:9px 14px;font-size:13px;z-index:150;animation:jjrise-c");
    html = html.replace("{{ s.toggleText }}</button>\n                </div>\n              </div>", `{{ s.toggleText }}</button>
                </div>
                <div class="jj-provider-fields"><sc-for list="{{ s.fields }}" as="f"><div class="field"><label>{{ f.label }}</label><input class="input" aria-label="{{ f.label }}" type="{{ f.inputType }}" value="{{ f.value }}" onChange="{{ f.set }}"></div></sc-for></div>
              </div>`);
    html = html.replace('<sc-if value="{{ f.isSecret }}">', '<sc-if value="{{ f.isPath }}"><div class="jj-path-input"><input class="input" style="font-family:var(--mono)" value="{{ f.value }}" onChange="{{ f.set }}"><button class="btn btn-secondary" aria-label="\u6D4F\u89C8{{ f.label }}" onClick="{{ f.browse }}">\u6D4F\u89C8</button></div></sc-if><sc-if value="{{ f.isSecret }}">');
    html = html.replaceAll('value="{{ f.value }}"', 'aria-label="{{ f.label }}" value="{{ f.value }}"').replace('<sc-if value="{{ f.isText }}"><input class="input" style="font-family:{{ f.mono }}', '<sc-if value="{{ f.isText }}"><input type="{{ f.inputType }}" class="input" style="font-family:{{ f.mono }}').replace('<sc-if value="{{ f.isText }}"><input class="input" style="font-family:var(--mono)"', '<sc-if value="{{ f.isCheck }}"><label><input type="checkbox" checked="{{ f.on }}" onChange="{{ f.set }}">{{ f.label }}</label></sc-if><sc-if value="{{ f.isText }}"><input type="{{ f.inputType }}" class="input" style="font-family:var(--mono)"');
    html = html.replace(/批次 b-20260723-1418[^<]+/, "{{ d.batchSummary }}").replace("\u5168\u90E8 128", "\u5168\u90E8 {{ d.historyCount }}").replace("\u672A\u5165\u5E93 3", "\u672A\u5165\u5E93 {{ d.missingCount }}").replace("\u5931\u8D25 2</span>", "\u5931\u8D25 {{ d.failureCount }}</span>").replace('<div style="background:rgba(201,160,94,.06);', '<sc-if value="{{ d.hasFailed }}"><div style="background:rgba(201,160,94,.06);').replace('      <div style="background:var(--surf);border-radius:8px;box-shadow:0 0 0 1px var(--ring);overflow:hidden">\n        <div style="display:flex;align-items:center;gap:12px;padding:11px 14px;box-shadow:inset 0 -1px 0 var(--line2)">\n          <h5 style="margin:0">\u4E0B\u8F7D\u5386\u53F2', '      </sc-if><div style="background:var(--surf);border-radius:8px;box-shadow:0 0 0 1px var(--ring);overflow:hidden">\n        <div style="display:flex;align-items:center;gap:12px;padding:11px 14px;box-shadow:inset 0 -1px 0 var(--line2)">\n          <h5 style="margin:0">\u4E0B\u8F7D\u5386\u53F2').replace("\u6807\u8BB0\u8DF3\u8FC7</button>", "\u5FFD\u7565\u6B64\u9879</button>").replace("\u590D\u5236 ffmpeg \u547D\u4EE4", "\u590D\u5236\u8F6C\u7801\u53C2\u6570").replace('<button class="btn btn-ghost" onClick="{{ au.autoLayout }}">\u81EA\u52A8\u6392\u7248</button>', "").replace("\u8FD0\u884C\u4E2D\u4EFB\u52A1 2 / 4", "\u5DF2\u542F\u7528\u4EFB\u52A1 {{ au.enabledCount }} / {{ au.taskCount }}").replace("\u4ECA\u65E5\u81EA\u52A8\u6D3E\u53D1 18 \u90E8", "\u4ECA\u65E5\u81EA\u52A8\u6D3E\u53D1 {{ au.dispatchedToday }} \u90E8").replace("\u4ECA\u65E5\u8DF3\u8FC7 41 \xB7 \u9519\u8BEF 2", "\u4ECA\u65E5\u8DF3\u8FC7 {{ au.skippedToday }} \xB7 \u9519\u8BEF {{ au.errorsToday }}").replace('<b style="color:var(--bad);font-weight:500">AV1 \u4E0D\u53EF\u7528</b><br>av1_nvenc \u786C\u4EF6\u63A2\u9488\u5931\u8D25\uFF1A\u5F53\u524D\u9A71\u52A8 535.161 \u4E0D\u652F\u6301\u3002\u76F8\u5173\u9884\u8BBE\u5DF2\u7981\u7528\uFF0C\u4E0D\u4F1A\u56DE\u9000 CPU\u3002', "{{ tc.hardwareMessage }}").replace("\u5E76\u53D1\u4E0A\u9650 2", "\u5E76\u53D1\u4E0A\u9650 {{ tc.maxConcurrent }}").replaceAll(/每 [125]s 轮询/g, "\u6BCF 3s \u66F4\u65B0").replace(" \xB7 \u5168\u5C40\u5E76\u53D1 5", "").replace("\u53EF\u7528\u53D8\u91CF {code} {title} {actors} {studio} {label} {series} {year} {date}", "\u53EF\u7528\u53D8\u91CF {{ sc.namingFields }}").replace('onClick="{{ s.run }}">{{ s.runText }}', 'disabled="{{ s.loading }}" onClick="{{ s.run }}">{{ s.runText }}').replace('onClick="{{ sc.preview }}"', 'disabled="{{ sc.scanning }}" onClick="{{ sc.preview }}"').replace('onClick="{{ sc.reset }}"', 'disabled="{{ sc.scanning }}" onClick="{{ sc.reset }}"').replace('onClick="{{ d.run }}"', 'disabled="{{ !d.runCount }}" onClick="{{ d.run }}"');
    html = html.replace("YHG007 \u6765\u6E90\u4E0D\u53EF\u8FBE", "\u67E5\u8BE2\u5931\u8D25").replace(/HTTPConnectionPool\(host='yhg007.com'[\s\S]*?已保留上一次 JavBus 结果缓存。/, "{{ s.error }}\u3002\u53EF\u91CD\u8BD5\u6216\u68C0\u67E5\u6765\u6E90\u8BBE\u7F6E\u3002").replace("3 \u4E2A\u6587\u4EF6\u51B2\u7A81\u9700\u8981\u5904\u7406", "{{ sc.nConf }} \u4E2A\u6587\u4EF6\u51B2\u7A81\u9700\u8981\u5904\u7406").replace("115 \u7F51\u76D8\u672A\u914D\u7F6E", "\u5F53\u524D\u7F51\u76D8\u672A\u8FDE\u63A5").replace(/缺少 Cookie，无法列目录或提交离线任务。[\s\S]*?后重新连接。/, "\u8BF7\u5230\u8BBE\u7F6E\u4E2D\u8FDE\u63A5\u5F53\u524D\u7F51\u76D8\uFF0C\u518D\u6D4F\u89C8\u76EE\u5F55\u3002").replace('onClick="{{ sc.applyStrategy }}"', 'disabled="{{ !sc.nConf }}" onClick="{{ sc.applyStrategy }}"').replace('onChange="{{ au.togglePauseAll }}"', 'disabled="{{ au.pauseAll }}" onChange="{{ au.togglePauseAll }}"').replace('onClick="{{ se.save }}"', 'disabled="{{ se.saveDisabled }}" onClick="{{ se.save }}"');
    html = html.replace('      <sc-if value="{{ sc.hasPreview }}">\n', `<sc-if value="{{ sc.outcome }}"><div style="background:var(--surf);border-radius:8px;padding:16px"><h5>\u6267\u884C\u7ED3\u679C \xB7 {{ sc.outcome.summary }}</h5><p>\u5931\u8D25\u9879\u53EF\u4FEE\u6B63\u914D\u7F6E\u540E\u91CD\u65B0\u751F\u6210\u9884\u89C8\uFF1B\u5DF2\u5B8C\u6210\u7684\u6587\u4EF6\u65E0\u9700\u91CD\u590D\u5904\u7406\u3002</p><button class="btn btn-secondary" onClick="{{ sc.reset }}">\u5B8C\u6210</button><sc-for list="{{ sc.outcome.rows }}" as="r"><div style="padding:8px 0;border-bottom:1px solid var(--line2);overflow-wrap:anywhere"><span style="color:{{ r.fg }}">{{ r.status }}</span> \xB7 {{ r.path }}<div style="color:var(--dim)">{{ r.note }}</div></div></sc-for></div></sc-if><sc-if value="{{ sc.hasPreview }}">`);
    for (const action of ["au.save", "au.runNow", "au.toggleRun", "au.remove"]) html = html.replace(`onClick="{{ ${action} }}"`, `disabled="{{ !au.hasTask }}" onClick="{{ ${action} }}"`);
    html = html.replace(/(<sc-for list="{{ lb.actors }}"[^>]*>\s*)<div ([\s\S]*?)<\/div>\s*<\/sc-for>/, '$1<button class="jj-actor-card" onClick="{{ a.open }}" $2</button>\n          </sc-for>').replace('flex:none">{{ a.initial }}</div>', 'flex:none;position:relative;overflow:hidden">{{ a.initial }}<sc-if value="{{ a.avatarUrl }}"><img src="{{ a.avatarUrl }}" alt="" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover"></sc-if></div>').replace(/<aside style="position:absolute;top:0;right:0;bottom:0;/g, '<aside class="jj-drawer" role="dialog" aria-modal="true" aria-label="\u8BE6\u60C5\u4E0E\u914D\u7F6E" style="position:fixed;top:0;right:0;bottom:0;').replace(/<div style="position:absolute;inset:0;background:([^\"]+)" onClick=/g, '<div class="jj-scrim" style="position:fixed;inset:0;background:$1" onClick=').replaceAll('style="position:absolute;left:50%;transform:translateX(-50%);bottom:22px;', 'class="jj-selection" style="position:fixed;left:50%;transform:translateX(-50%);bottom:22px;');
    const poster = (key, fit = "cover") => `<sc-if value="{{ ${key}.cover }}"><img src="{{ ${key}.cover }}" alt="" loading="lazy" style="position:absolute;inset:0;width:100%;height:100%;object-fit:${fit}"></sc-if>`;
    html = html.replace(/(<div style="width:70px;aspect-ratio:3\/2;[^"]*)">{{ r.code }}<\/div>/, `$1;position:relative;overflow:hidden">${poster("r")}{{ r.code }}</div>`).replace(/(<div style="width:74px;aspect-ratio:3\/2;[^"]*)">{{ m.code }}<\/div>/, `$1;position:relative;overflow:hidden">${poster("m")}{{ m.code }}</div>`).replace(/(<div style="width:246px;flex:none;aspect-ratio:3\/2;[^"]*)">{{ s.d.code }}<\/div>/, `$1;position:relative;overflow:hidden;align-self:flex-start">${poster("s.d", "contain")}{{ s.d.code }}</div>`).replace('position:relative;aspect-ratio:2/3;background:linear-gradient(160deg,var(--ph1),var(--ph3));display:grid;place-items:center">', `position:relative;aspect-ratio:2/3;background:linear-gradient(160deg,var(--ph1),var(--ph3));display:grid;place-items:center">${poster("r")}`);
    html = html.replace('box-shadow:inset 0 -1px 0 var(--line2)">\n                <span', `box-shadow:inset 0 -1px 0 var(--line2)">${poster("m")}
                <span`).replace("\u53F3\u4FA7\u5B9E\u65F6\u9884\u89C8\u4E00\u6761\u771F\u5B9E\u6587\u4EF6\u540D", "\u53F3\u4FA7\u4F7F\u7528\u793A\u4F8B\u5143\u6570\u636E\u9884\u89C8\u547D\u540D\u89C4\u5219");
    html = html.replace('  <sc-if value="{{ at.auto }}">', `
  <sc-if value="{{ sc.repair }}">
    <div class="dialog-backdrop" style="background:var(--ovl)"><div class="dialog elev-lg" role="dialog" aria-modal="true" aria-label="\u624B\u52A8\u6307\u5B9A\u756A\u53F7" style="width:480px">
      <div class="dialog-title">\u624B\u52A8\u6307\u5B9A\u756A\u53F7</div><p style="overflow-wrap:anywhere">{{ sc.repair.src }}</p>
      <input class="input" aria-label="\u6B63\u786E\u756A\u53F7" value="{{ sc.repair.code }}" onChange="{{ sc.repair.setCode }}" placeholder="ABP-123">
      <p>\u91CD\u65B0\u8BC6\u522B\u5E76\u751F\u6210\u9884\u89C8\uFF0C\u786E\u8BA4\u6267\u884C\u524D\u4E0D\u4F1A\u4FEE\u6539\u6E90\u6587\u4EF6\u3002</p>
      <div class="dialog-actions"><button class="btn btn-secondary" onClick="{{ sc.repair.cancel }}">\u53D6\u6D88</button><button class="btn btn-primary" onClick="{{ sc.repair.submit }}">\u91CD\u65B0\u751F\u6210\u9884\u89C8</button></div>
    </div></div>
  </sc-if>
  <sc-if value="{{ at.auto }}">`);
    html = html.replace('onClick="{{ s.openBrowse }}"', 'aria-label="\u6D4F\u89C8\u7B5B\u9009\u76EE\u5F55" onClick="{{ s.openBrowse }}"');
    html = html.replace('<div style="position:absolute;left:50%;top:64px;', '<div class="jj-catalog" role="dialog" aria-modal="true" aria-label="\u7B5B\u9009\u76EE\u5F55" style="position:fixed;left:50%;top:64px;').replace('<aside style="position:absolute;top:52px;right:16px;', '<aside class="jj-popover" role="dialog" aria-label="\u540E\u53F0\u4EFB\u52A1" style="position:fixed;top:52px;right:16px;').replace('<div style="position:absolute;top:64px;left:50%;', '<div class="jj-toast" role="status" aria-live="polite" style="position:fixed;top:64px;left:50%;');
    html = html.replace(/<(div|span)([^>]*onClick="{{ (?:n.pick|a.open|f.open|c.go|t.pick|it.pick|t.go)[^>]*?)>/g, '<$1 role="button" tabIndex="0"$2>');
    html = html.replace('<div style="display:flex;align-items:stretch;gap:0">', '<div class="jj-auto-flow" style="display:flex;align-items:stretch;gap:0">').replace('<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:13px">', '<div class="jj-auto-fields" style="display:grid;grid-template-columns:repeat(3,1fr);gap:13px">');
    html = html.replace(/<input([^>]*value="{{ f.value }}"[^>]*)>/g, (input, attrs) => /\btype=/.test(attrs) ? input : `<input type="{{ f.inputType }}"${attrs}>`);
    html = html.replaceAll('<sc-if value="{{ f.isSelect }}">', '<sc-if value="{{ f.isTextarea }}"><textarea class="input" aria-label="{{ f.label }}" rows="3" value="{{ f.value }}" onChange="{{ f.set }}"></textarea></sc-if><sc-if value="{{ f.isSelect }}">');
    const pager2 = (key, label = "\u5206\u9875") => `<sc-if value="{{ ${key}.visible }}"><nav class="jj-pager" aria-label="${label}"><button class="btn btn-secondary" disabled="{{ ${key}.first }}" onClick="{{ ${key}.prev }}">\u4E0A\u4E00\u9875</button><span role="status">{{ ${key}.text }}</span><button class="btn btn-secondary" disabled="{{ ${key}.last }}" onClick="{{ ${key}.next }}">\u4E0B\u4E00\u9875</button></nav></sc-if>`;
    html = html.replace('<sc-for list="{{ sc.outcome.rows }}"', `${pager2("sc.outcome.paging", "\u6267\u884C\u7ED3\u679C\u5206\u9875")}<sc-for list="{{ sc.outcome.rows }}"`).replace(/(<sc-if value="{{ d.hasFailed }}">[\s\S]*?)(<table class="table")/, `$1${pager2("d.failedPaging", "\u5931\u8D25\u8D44\u6E90\u5206\u9875")}$2`);
    html = html.replace('<sc-if value="{{ dlg.hasList }}">', `${pager2("dlg.paging")}<sc-if value="{{ dlg.hasList }}">`).replace('<sc-for list="{{ bg.items }}"', `${pager2("bg.paging")}<sc-for list="{{ bg.items }}"`);
    for (const [route, key] of [["dispatch", "d"], ["transcode", "tc"], ["scrape", "sc"]]) {
      html = html.replace(new RegExp(`(<sc-if value="{{ at.${route} }}">[\\s\\S]*?)(<\\/main>)`), `$1${pager2(key + ".paging")}$2`);
    }
    html = html.replace(/(<sc-if value="{{ at.storage }}">[\s\S]*?)(<table)/, `$1${pager2("fs.paging")}$2`).replace(/(<h5 style="margin:0">Aria2 任务<\/h5>[\s\S]*?<\/div>\s*)(<table)/, `$1${pager2("fs.taskPaging")}$2`).replace('<sc-for list="{{ fs.addForm.entries }}"', `${pager2("fs.directoryPaging")}<sc-for list="{{ fs.addForm.entries }}"`);
    html = html.replace(/(<sc-if value="{{ at.library }}">[\s\S]*?)(<\/main>)/, `$1${pager2("lb.paging")}$2`).replace(/(<sc-if value="{{ at.search }}"[^>]*>[\s\S]*?)(<\/main>)/, `$1${pager2("s.paging")}$2`).replace('<sc-for list="{{ s.browse.groups }}"', `${pager2("s.browse.paging")}<sc-for list="{{ s.browse.groups }}"`).replace('<button class="btn btn-secondary" onClick="{{ lb.openCheck }}">', '<button class="btn btn-secondary" onClick="{{ lb.refresh }}">\u5237\u65B0\u5F71\u89C6\u5E93</button><button class="btn btn-ghost" onClick="{{ lb.configureCheck }}">\u68C0\u67E5\u9879\u8BBE\u7F6E</button><button class="btn btn-secondary" disabled="{{ lb.checkBusy }}" onClick="{{ lb.openCheck }}">').replace('onClick="{{ lb.runCheck }}"', 'disabled="{{ lb.checkBusy }}" onClick="{{ lb.runCheck }}"').replace('\u52FE\u9009\u8981\u68C0\u67E5\u7684\u8D44\u6599\uFF0C\u4F5C\u4E3A <code style="font-family:var(--mono);font-size:11.5px;color:var(--accs)">fields</code> \u53C2\u6570\u63D0\u4EA4\uFF1B\u672A\u52FE\u9009\u7684\u9879\u4E0D\u8BA1\u5165\u5B8C\u6574\u5EA6\u3002', "\u9009\u62E9\u68C0\u67E5\u5185\u5BB9\uFF0C\u672A\u52FE\u9009\u7684\u9879\u4E0D\u8BA1\u5165\u5B8C\u6574\u5EA6\u3002\u68C0\u67E5\u5728\u540E\u53F0\u8FD0\u884C\uFF0C\u5B8C\u6210\u540E\u53EF\u4ECE\u540E\u53F0\u4EFB\u52A1\u67E5\u770B\u7ED3\u679C\u5E76\u5F00\u59CB\u8865\u5168\u3002").replace('value="{{ lb.q }}"', 'aria-label="\u5F71\u89C6\u5E93\u641C\u7D22" value="{{ lb.q }}"').replace('onClick="{{ lb.tcDialog.submit }}"', 'disabled="{{ !lb.tcDialog.canSubmit }}" onClick="{{ lb.tcDialog.submit }}"');
    html = html.replace(/<sc-if value="{{ at.library }}">[\s\S]*?<\/main>\s*<\/div>\s*<\/sc-if>/, (library) => library.replace('<div style="display:flex;align-items:stretch;min-height:848px">', '<div class="jj-library" style="display:flex;align-items:stretch;min-height:848px">').replace("<aside style=", '<aside class="jj-library-sidebar" aria-label="\u5F71\u89C6\u5E93\u7B5B\u9009" style=').replace("<main style=", '<main class="jj-library-main" aria-label="\u5F71\u89C6\u5E93\u5185\u5BB9" style=').replace('<select class="input" style="width:auto;', '<select aria-label="\u5F71\u89C6\u5E93\u6392\u5E8F" class="input" style="width:auto;').replace('<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:12px">', '<div class="jj-library-stats" style="display:grid;grid-template-columns:repeat(4,1fr);gap:12px">').replace('<div style="background:var(--surf);border-radius:8px;box-shadow:0 0 0 1px var(--ring);overflow:hidden">', '<div class="jj-library-table" style="background:var(--surf);border-radius:8px;box-shadow:0 0 0 1px var(--ring);overflow:hidden">').replace('<sc-if value="{{ lb.showList }}">', '<sc-if value="{{ lb.showList }}"><div class="jj-library-table-tools"><span>\u62D6\u52A8\u8868\u5934\u5206\u9694\u7EBF\u8C03\u6574\u5217\u5BBD</span><button class="btn btn-ghost" onClick="{{ lb.resetWidths }}">\u6062\u590D\u9ED8\u8BA4\u5217\u5BBD</button></div>').replace('<table class="table">', '<table class="table" style="width:{{ lb.tableWidth }}">').replace(/<thead>[\s\S]*?<\/thead>/, '<thead><tr><sc-for list="{{ lb.columns }}" as="c"><th scope="col" style="width:{{ c.cssWidth }}">{{ c.label }}<span class="jj-column-resize" role="separator" tabIndex="0" aria-label="\u8C03\u6574{{ c.label }}\u5217\u5BBD" aria-orientation="vertical" aria-valuemin="{{ c.min }}" aria-valuemax="1200" aria-valuenow="{{ c.width }}" title="\u62D6\u52A8\u8C03\u6574\u5217\u5BBD\uFF1B\u65B9\u5411\u952E\u5FAE\u8C03\uFF0CHome \u6700\u7A84\uFF0CEnd \u6700\u5BBD" onPointerDown="{{ c.resize }}" onKeyDown="{{ c.resize }}"></span></th></sc-for></tr></thead>').replace('<div style="width:70px;aspect-ratio:3/2;', '<div class="jj-library-list-cover" style="width:100%;aspect-ratio:2/3;').replace('<div style="display:grid;grid-template-columns:repeat(6,1fr);gap:13px">', '<div class="jj-library-posters" style="display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:13px">').replace('<div style="font-size:13px;max-width:280px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">', '<div class="jj-library-list-title" title="{{ r.title }}" style="font-size:13px">').replace('<td style="font-size:12.5px;color:var(--dim)">{{ r.actorText }}</td>', '<td class="jj-library-list-actors" title="{{ r.actorText }}" style="font-size:12.5px;color:var(--dim)">{{ r.actorText }}</td>').replace(/<div onClick="{{ r.open }}"([^>]*)>([\s\S]*?)\s*<\/div>\s*<\/sc-for>/, '<button class="jj-library-card" aria-label="\u67E5\u770B {{ r.code }} \u8BE6\u60C5" title="{{ r.title }}" onClick="{{ r.open }}"$1>$2\n</button></sc-for>').replace("background:linear-gradient(transparent,var(--scrim9))", "background:linear-gradient(transparent,rgba(12,14,24,.94))").replace('color:var(--t70)">{{ r.resText }}', 'color:#eeeef4">{{ r.resText }}').replace('<sc-if value="{{ lb.scanning }}">', '<sc-if value="{{ lb.empty }}"><div class="jj-library-empty"><i aria-hidden="true" class="ph ph-film-strip"></i><h2>{{ lb.emptyTitle }}</h2><p>{{ lb.emptyBody }}</p><sc-if value="{{ lb.showEmptyAction }}"><button class="btn btn-secondary" onClick="{{ lb.emptyAction }}">{{ lb.emptyActionText }}</button></sc-if></div></sc-if><sc-if value="{{ lb.scanning }}">'));
    html = html.replace('<div style="width:186px;flex:none;aspect-ratio:2/3;', '<div class="jj-library-detail-cover" style="position:relative;overflow:hidden;width:186px;flex:none;aspect-ratio:2/3;').replace('color:var(--t30)">{{ lb.d.code }}</div>', `color:var(--t30)">${poster("lb.d")}{{ lb.d.code }}</div>`);
    html = html.replace(/<sc-if value="{{ lb.d }}">[\s\S]*?<\/aside>/, (detail) => detail.replace('class="jj-drawer"', 'class="jj-drawer jj-library-detail"').replace('<table class="table"', '<table class="table jj-library-files"'));
    const cinemaStart = html.indexOf('  <sc-if value="{{ at.cinema }}">');
    const cinemaEnd = html.indexOf('  <sc-if value="{{ cn.player }}">', cinemaStart);
    html = html.slice(0, cinemaStart) + cinemaTemplate + "\n" + html.slice(cinemaEnd);
    return html;
  }

  // frontend/src/main.jsx
  function mountApp() {
    if (!window.__dcUpdate) {
      document.getElementById("root").textContent = "\u754C\u9762\u4F9D\u8D56\u52A0\u8F7D\u5931\u8D25\uFF0C\u8BF7\u68C0\u67E5\u7F51\u7EDC\u540E\u5237\u65B0\u9875\u9762\u3002";
      return;
    }
    const name = "JavJaeger";
    window.__dcUpdate(name, "html", adaptTemplate(JavJaeger_dc_default.match(/<x-dc>([\s\S]*?)<\/x-dc>/)[1], logo_default), false);
    window.__dcUpdate(name, "js", adaptDesignScript(JavJaeger_dc_default.match(/<script[^>]*data-dc-script[^>]*>([\s\S]*?)<\/script>/)[1]) + designDataExports, false);
    const entry = window.__dcRegistry[name];
    entry.Logic = connectDesign(entry.Logic);
    entry.fetched = true;
    window.ReactDOM.createRoot(document.getElementById("root")).render(window.React.createElement(window.getDC(name)));
  }
  Promise.resolve().then(() => {
    if (window.__dcUpdate || document.readyState === "complete") mountApp();
    else window.addEventListener("load", mountApp, { once: true });
  });
})();
//! nosemgrep: direct-inner-html-assignment
//! nosemgrep: eval-and-function-constructor
//! nosemgrep: create-script-element
