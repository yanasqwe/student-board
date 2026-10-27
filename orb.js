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

  // ---------- WebGL ----------
  const VERT = `attribute vec2 p;void main(){gl_Position=vec4(p,0.,1.);}`;
  const FRAG = `
precision highp float;
uniform vec2 uRes; uniform float uTime; uniform vec2 uMouse;
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
  d = smin(d, sdTorus(q, vec2(1.55, .07)), .22);
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

  const instances = [];
  function makeOrb(canvas) {
    const gl = canvas.getContext("webgl", { alpha: true, premultipliedAlpha: true, antialias: false, powerPreference: "high-performance" });
    if (!gl) return null;
    const sh = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s)); return s; };
    const prog = gl.createProgram();
    gl.attachShader(prog, sh(gl.VERTEX_SHADER, VERT));
    gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, FRAG));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return null;
    gl.useProgram(prog);
    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(prog, "p");
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    const u = { res: gl.getUniformLocation(prog, "uRes"), time: gl.getUniformLocation(prog, "uTime"), mouse: gl.getUniformLocation(prog, "uMouse") };
    const inst = { canvas, gl, u, visible: true, w: 0, h: 0 };
    // Внутрішня роздільність нижча за екранну: форма м'яка, а GPU не перевантажується
    const quality = coarse ? 0.6 : 1;
    const resize = () => {
      const r = canvas.getBoundingClientRect();
      const s = Math.min(devicePixelRatio || 1, 1.25) * quality;
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

  const draw = (o, time) => {
    if (!o.visible || !o.canvas.offsetParent) return;
    if (o.canvas.width === 0) return;
    o.gl.uniform2f(o.u.res, o.w, o.h);
    o.gl.uniform1f(o.u.time, time);
    o.gl.uniform2f(o.u.mouse, mouse.x, mouse.y);
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
    if (!document.hidden) instances.forEach((o) => draw(o, (now - t0) / 1000));
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
})();
