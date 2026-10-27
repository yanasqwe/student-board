// Глянцевий 3D-об'єкт (WebGL raymarching без бібліотек) + курсор, годинник, появи при скролі
(() => {
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const coarse = matchMedia("(pointer: coarse)").matches;
  const root = document.documentElement;

  // ---------- Курсор: плавні --mx/--my для паралаксу та 3D ----------
  const mouse = { x: 0, y: 0, tx: 0, ty: 0 };
  if (!reduce && !coarse) {
    addEventListener("pointermove", (e) => {
      mouse.tx = (e.clientX / innerWidth) * 2 - 1;
      mouse.ty = (e.clientY / innerHeight) * 2 - 1;
    }, { passive: true });
  }

  // ---------- Годинник за Києвом ----------
  const kyiv = new Intl.DateTimeFormat("uk-UA", { timeZone: "Europe/Kyiv", hour: "2-digit", minute: "2-digit" });
  const tick = () => document.querySelectorAll("[data-kyiv-clock]").forEach((el) => { el.textContent = kyiv.format(new Date()); });
  tick(); setInterval(tick, 15_000);

  // ---------- Поява блоків при скролі ----------
  const io = "IntersectionObserver" in window
    ? new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) { e.target.classList.add("in"); io.unobserve(e.target); } }), { rootMargin: "0px 0px -8% 0px" })
    : null;
  const observe = () => document.querySelectorAll(".reveal:not(.in)").forEach((el) => (io ? io.observe(el) : el.classList.add("in")));
  observe();
  new MutationObserver(observe).observe(document.body, { childList: true, subtree: true });

  document.fonts?.ready.then(() => document.body.classList.add("ready"));
  setTimeout(() => document.body.classList.add("ready"), 1200);


  // ---------- Заголовок: літери з'являються в 3D (кожна окремо) ----------
  const title = document.querySelector(".hero-title");
  if (title && !reduce) {
    let ci = 0;
    const splitNode = (node) => {
      [...node.childNodes].forEach((ch) => {
        if (ch.nodeType === 3) {
          const frag = document.createDocumentFragment();
          ch.textContent.replace(/\u00AD/g, "").split(/(\s+)/).forEach((part) => {
            if (!part) return;
            if (/^\s+$/.test(part)) { frag.append(" "); return; }
            const w = document.createElement("span"); w.className = "w";
            for (const c of part) { const s = document.createElement("span"); s.className = "ch"; s.textContent = c; s.style.setProperty("--ci", ci++); w.append(s); }
            frag.append(w);
          });
          ch.replaceWith(frag);
        } else if (ch.nodeType === 1) splitNode(ch);
      });
    };
    title.querySelectorAll(".line > span").forEach((l, li) => { l.style.setProperty("--li", li); splitNode(l); });
    title.classList.add("split");
  }

  // ---------- WebGL ----------
  const VERT = `attribute vec2 p;void main(){gl_Position=vec4(p,0.,1.);}`;
  const FRAG = `
precision highp float;
uniform vec2 uRes; uniform float uTime; uniform vec2 uMouse; uniform float uRing;
const vec3 LIME = vec3(.59, .83, 1.); // небесно-блакитний акцент
mat2 rot(float a){ float c = cos(a), s = sin(a); return mat2(c, -s, s, c); }
float smin(float a, float b, float k){ float h = clamp(.5 + .5 * (b - a) / k, 0., 1.); return mix(b, a, h) - k * h * (1. - h); }
float sdTorus(vec3 p, vec2 t){ vec2 q = vec2(length(p.xz) - t.x, p.y); return length(q) - t.y; }
float map(vec3 p){
  float t = uTime * .5;
  p.xz *= rot(uMouse.x * .7 + t * .22);
  p.yz *= rot(uMouse.y * .45 - .3);
  float d = length(p) - 1.;
  d += .05 * sin(3.1 * p.x + t * 1.7) * sin(2.7 * p.y - t * 1.3) * sin(3.3 * p.z + t);
  vec3 a = vec3(sin(t * 1.1) * 1.2, cos(t * .9) * .55, cos(t * 1.1) * .6);
  vec3 b = vec3(-cos(t * .7) * .95, sin(t * 1.3) * .85, sin(t * .7) * .7);
  d = smin(d, length(p - a) - .42, .55);
  d = smin(d, length(p - b) - .3, .5);
  vec3 q = p; q.xy *= rot(.5); q.yz *= rot(.35 + sin(t * .6) * .15);
  if (uRing > .01) d = smin(d, sdTorus(q, vec2(1.55, .07 * uRing)), .22 * uRing);
  return d;
}
vec3 nrm(vec3 p){ vec2 e = vec2(.0015, 0.); return normalize(vec3(map(p + e.xyy) - map(p - e.xyy), map(p + e.yxy) - map(p - e.yxy), map(p + e.yyx) - map(p - e.yyx))); }
// Студійне оточення: темний простір, вузька лаймова смуга-софтбокс і білі блики
vec3 env(vec3 r){
  vec3 c = vec3(.009, .011, .015) + vec3(.026, .032, .042) * (r.y * .5 + .5);
  float k = r.y * .62 + r.x * .48 - .3;
  c += LIME * smoothstep(0., .06, k) * (1. - smoothstep(.1, .28, k)) * 2.3;
  c += LIME * smoothstep(.55, 1., -r.y * .8 + r.x * .25) * .5;
  c += vec3(1.) * pow(max(dot(r, normalize(vec3(-.6, .75, .45))), 0.), 46.) * 3.2;
  c += vec3(.92, .97, 1.) * pow(max(dot(r, normalize(vec3(.75, .35, .6))), 0.), 90.) * 2.2;
  return c;
}
void main(){
  vec2 uv = (gl_FragCoord.xy - .5 * uRes) / min(uRes.x, uRes.y);
  vec3 ro = vec3(0., 0., 7.1);
  vec3 rd = normalize(vec3(uv, -1.85));
  float t = 0., md = 1e3; bool hit = false;
  for (int i = 0; i < 96; i++) {
    vec3 p = ro + rd * t; float d = map(p);
    md = min(md, d);
    if (d < .001) { hit = true; break; }
    t += d * .9; if (t > 12.) break;
  }
  if (hit) {
    vec3 p = ro + rd * t, n = nrm(p), v = -rd, r = reflect(rd, n);
    float fres = pow(1. - max(dot(n, v), 0.), 3.);
    float ao = clamp(map(p + n * .3) / .3, 0., 1.);
    vec3 col = env(r) * (.3 + .7 * fres);
    col += vec3(.026, .032, .042) * max(dot(n, normalize(vec3(-.5, .8, .6))), 0.);
    col += LIME * pow(fres, 1.5) * .6;
    col *= .35 + .65 * ao;
    col = 1. - exp(-col * 1.35);
    gl_FragColor = vec4(col, 1.);
  } else {
    float g = exp(-md * 4.) * .2 * (1. - smoothstep(.28, .5, length(uv)));
    gl_FragColor = vec4(LIME * g, g);
  }
}`;


  // Інтро: кільце кулі спершу пролітає крізь заголовок і «одягається» на кулю
  const INTRO = { delay: 1.6, fly: 3.4, blend: 0.28 };
  const FRAG_RING = `
precision highp float;
uniform vec2 uRes; uniform float uTime; uniform vec2 uMouse; uniform float uFront;
uniform vec3 uC;      // центр (x, y) у одиницях полотна + масштаб
uniform float uExtra; // 1 → кільце повернуте «обличчям» до руху, 0 → нахил як у кулі
uniform float uFade;  // товщина під час переходу на кулю
uniform float uOn;
const vec3 LIME = vec3(.59, .83, 1.);
const float PROJ = 2.85 / 11.;
mat2 rot(float a){ float c = cos(a), s = sin(a); return mat2(c, -s, s, c); }
float sdTorus(vec3 p, vec2 t){ vec2 q = vec2(length(p.xz) - t.x, p.y); return length(q) - t.y; }
vec3 xf(vec3 p){
  p -= vec3(uC.xy, 0.); p /= uC.z;
  // додатковий поворот під час польоту (зникає до 0 біля кулі)
  p.xy *= rot(uExtra * 1.45); p.xz *= rot(uExtra * .95);
  // точно та сама орієнтація, що й у кільця кулі
  float t = uTime * .5;
  p.xz *= rot(uMouse.x * .7 + t * .22);
  p.yz *= rot(uMouse.y * .45 - .3);
  p.xy *= rot(.5); p.yz *= rot(.35 + sin(t * .6) * .15);
  return p;
}
float map(vec3 p){ return sdTorus(xf(p), vec2(1.55, .07 * uFade + .016 * uExtra)) * uC.z; }
vec3 nrm(vec3 p){ vec2 e = vec2(.002, 0.); return normalize(vec3(map(p + e.xyy) - map(p - e.xyy), map(p + e.yxy) - map(p - e.yxy), map(p + e.yyx) - map(p - e.yyx))); }
vec3 env(vec3 r){
  vec3 c = vec3(.009, .011, .015) + vec3(.026, .032, .042) * (r.y * .5 + .5);
  float k = r.y * .62 + r.x * .48 - .3;
  c += LIME * smoothstep(0., .06, k) * (1. - smoothstep(.1, .28, k)) * 2.3;
  c += LIME * smoothstep(.55, 1., -r.y * .8 + r.x * .25) * .5;
  c += vec3(1.) * pow(max(dot(r, normalize(vec3(-.6, .75, .45))), 0.), 46.) * 3.2;
  c += vec3(.92, .97, 1.) * pow(max(dot(r, normalize(vec3(.75, .35, .6))), 0.), 90.) * 2.2;
  return c;
}
void main(){
  if (uOn < .5) { gl_FragColor = vec4(0.); return; }
  vec2 uv = (gl_FragCoord.xy - .5 * uRes) / uRes.y;
  vec3 ro = vec3(0., 0., 11.), rd = normalize(vec3(uv, -2.85));
  float t = 0., md = 1e3; bool hit = false;
  for (int i = 0; i < 90; i++) { float d = map(ro + rd * t); md = min(md, d); if (d < .001) { hit = true; break; } t += d; if (t > 20.) break; }
  vec4 outc = vec4(0.);
  if (uFront < .5) {
    vec2 c = uC.xy * PROJ;
    float behind = c.x - uv.x;
    float trail = exp(-pow((uv.y - c.y) / (.07 + .03 * uC.z), 2.)) * smoothstep(0., .3, behind) * exp(-max(behind, 0.) * 2.4) * .6 * uExtra;
    float halo = exp(-md * 9.) * .16 * uExtra;
    vec2 q2 = gl_FragCoord.xy / uRes;
    float edge = smoothstep(0., .06, q2.x) * smoothstep(0., .06, 1. - q2.x) * smoothstep(0., .12, q2.y) * smoothstep(0., .12, 1. - q2.y);
    float g = clamp((trail + halo) * edge, 0., 1.);
    outc = vec4(LIME * g, g);
  }
  if (hit) {
    vec3 p = ro + rd * t;
    if ((uFront > .5) == (p.z > 0.)) {
      vec3 n = nrm(p), v = -rd, r = reflect(rd, n);
      float fres = pow(1. - max(dot(n, v), 0.), 3.);
      vec3 q = xf(p); float ang = atan(q.z, q.x);
      float run = pow(.5 + .5 * sin(ang * 3. - uTime * 7.), 14.) * uExtra;
      vec3 col = env(r) * (.3 + .7 * fres) + LIME * (pow(fres, 1.5) * .6 + run * 1.5);
      col = 1. - exp(-col * 1.35);
      outc = vec4(col, 1.);
    }
  }
  gl_FragColor = outc;
}`;

  const instances = [];
  function makeOrb(canvas) {
    const gl = canvas.getContext("webgl", { alpha: true, premultipliedAlpha: true, antialias: false, powerPreference: "high-performance" });
    if (!gl) return null;
    const sh = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s)); return s; };
    const prog = gl.createProgram();
    gl.attachShader(prog, sh(gl.VERTEX_SHADER, VERT));
    gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, canvas.dataset.ring ? FRAG_RING : FRAG));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return null;
    gl.useProgram(prog);
    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(prog, "p");
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    const u = { res: gl.getUniformLocation(prog, "uRes"), time: gl.getUniformLocation(prog, "uTime"), mouse: gl.getUniformLocation(prog, "uMouse") };
    const uf = gl.getUniformLocation(prog, "uFront"); if (uf) gl.uniform1f(uf, canvas.dataset.ring === "front" ? 1 : 0);
    for (const k of ["uC", "uExtra", "uFade", "uOn", "uRing"]) u[k] = gl.getUniformLocation(prog, k);
    const inst = { canvas, gl, u, visible: true, w: 0, h: 0, hero: canvas.matches(".hero > .orb") };
    // Роздільність: на телефонах щільність екрана до 2x (інакше куля пікселізується),
    // на десктопі до 1.25x; більша сторона буфера не більше 1100 px, щоб GPU не перевантажувався
    const resize = () => {
      const r = canvas.getBoundingClientRect();
      let s = Math.min(devicePixelRatio || 1, coarse ? 2 : 1.25);
      s = Math.min(s, 1100 / Math.max(1, r.width, r.height));
      inst.w = Math.max(1, Math.round(r.width * s));
      inst.h = Math.max(1, Math.round(r.height * s));
      canvas.width = inst.w; canvas.height = inst.h;
      gl.viewport(0, 0, inst.w, inst.h);
    };
    resize();
    new ResizeObserver(resize).observe(canvas);
    if (io) new IntersectionObserver(([e]) => { inst.visible = e.isIntersecting; }).observe(canvas);
    canvas.classList.add("live");
    return inst;
  }

  document.querySelectorAll("[data-orb]").forEach((c) => {
    try { const o = makeOrb(c); if (o) instances.push(o); } catch (e) { console.warn("orb", e); }
  });
  if (instances.length) root.classList.add("has-orb");

  // Стан інтро на кожен кадр (рахується в JS, щоб кільце точно «сіло» на кулю)
  const ringCanvas = document.querySelector(".ring-back");
  const heroOrb = document.querySelector(".hero > .orb");
  const chars = [...document.querySelectorAll(".hero-title .ch")];
  let charX = [];
  const measure = () => { charX = chars.map((c) => { const b = c.getBoundingClientRect(); return b.left + b.width / 2; }); };
  addEventListener("resize", () => setTimeout(measure, 100), { passive: true });
  setTimeout(measure, 2600); setTimeout(() => document.querySelector(".hero-title")?.classList.add("shown"), 2600);
  const intro = { on: false, cx: 0, cy: 0, s: 1, extra: 1, fade: 1, ring: reduce || !ringCanvas ? 1 : 0 };
  const ease = (x) => 1 - Math.pow(1 - x, 3);
  let waveOn = false;
  function updateIntro(time) {
    if (!ringCanvas || !heroOrb || reduce) { intro.on = false; intro.ring = 1; return; }
    const t = time - INTRO.delay;
    if (t < 0) { intro.on = false; intro.ring = 0; return; }
    const R = ringCanvas.getBoundingClientRect(), O = heroOrb.getBoundingClientRect();
    const ppu = R.height * 2.85 / 11;
    const rcx = R.left + R.width / 2, rcy = R.top + R.height / 2;
    const tx = (O.left + O.width / 2 - rcx) / ppu, ty = -(O.top + O.height / 2 - rcy) / ppu;
    const tS = (1.55 * Math.min(O.width, O.height) * 1.85 / 7.1) / ppu / 1.55;
    const sx = -(R.width / 2) / ppu - 2.2;
    const f = Math.min(t / INTRO.fly, 1), e = ease(f);
    intro.cx = sx + (tx - sx) * e;
    // спершу трохи вище, наприкінці м'яко «опускається» на кулю
    intro.cy = ty * e + Math.sin(Math.PI * f) * 0.45 + Math.pow(1 - e, 2) * 0.2 + Math.sin(Math.PI * Math.min(f * 1.25, 1)) * 0.0;
    intro.s = 0.95 + (tS - 0.95) * e;
    intro.extra = 1 - e;
    const b = Math.min(Math.max((t - INTRO.fly) / INTRO.blend, 0), 1);
    intro.fade = 1 - b; intro.ring = b; intro.on = b < 1;
    // хвиля по літерах
    if (charX.length && f < 1) {
      const rx = rcx + intro.cx * ppu, rad = 1.55 * intro.s * ppu * 0.75;
      chars.forEach((c, i) => { const d = (charX[i] - rx) / rad; c.style.setProperty("--k", Math.exp(-d * d * 2.2).toFixed(3)); });
      waveOn = true;
    } else if (waveOn) { chars.forEach((c) => c.style.setProperty("--k", 0)); waveOn = false; }
  }

  const draw = (o, time) => {
    if (!o.visible || !o.canvas.offsetParent) return;
    if (o.canvas.width === 0) return;
    o.gl.uniform2f(o.u.res, o.w, o.h);
    o.gl.uniform1f(o.u.time, time);
    o.gl.uniform2f(o.u.mouse, mouse.x, mouse.y);
    const g = o.gl;
    if (o.u.uRing) g.uniform1f(o.u.uRing, o.hero ? intro.ring : 1);
    if (o.u.uOn) { g.uniform1f(o.u.uOn, intro.on ? 1 : 0); g.uniform3f(o.u.uC, intro.cx, intro.cy, intro.s); g.uniform1f(o.u.uExtra, intro.extra); g.uniform1f(o.u.uFade, intro.fade); }
    o.gl.drawArrays(o.gl.TRIANGLES, 0, 3);
  };

  if (reduce) {
    // Один статичний кадр, повторно — лише коли з'являється прихований екран
    const still = () => instances.forEach((o) => draw(o, 3.2));
    still();
    new MutationObserver(still).observe(document.body, { attributes: true, subtree: true, attributeFilter: ["class"] });
    return;
  }


  const t0 = performance.now();
  const loop = (now) => {
    mouse.x += (mouse.tx - mouse.x) * 0.06;
    mouse.y += (mouse.ty - mouse.y) * 0.06;
    root.style.setProperty("--mx", mouse.x.toFixed(4));
    root.style.setProperty("--my", mouse.y.toFixed(4));
    if (!document.hidden) { const tm = (now - t0) / 1000; updateIntro(tm); instances.forEach((o) => draw(o, tm)); }
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
})();
