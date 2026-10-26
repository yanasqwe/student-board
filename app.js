(() => {
  const STORAGE_KEY = "student-board:me";
  const DAY_NAMES = ["Неділя", "Понеділок", "Вівторок", "Середа", "Четвер", "П'ятниця", "Субота"];
  const DAY_SHORT = ["Нд", "Пн", "Вт", "Ср", "Чт", "Пт", "Сб"];
  const MONTHS = ["січня", "лютого", "березня", "квітня", "травня", "червня", "липня", "серпня", "вересня", "жовтня", "листопада", "грудня"];
  const TYPES = {
    "Л": { label: "Лекція", cls: "lec" },
    "Пр": { label: "Практика", cls: "pr" },
    "ЗАЛ": { label: "Залік", cls: "exam", exam: true },
    "КР": { label: "Контрольна робота", cls: "exam", exam: true },
  };

  // Усі звичайні пари (лекції й практики) — один синій; червоний — тільки заліки/КР
  const COLOR_LESSON = "#38bdf8";
  const COLOR_EXAM = "#ff4d5e";

  const ICON_TEACHER = '<svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 3.6-7 8-7s8 3 8 7"/></svg>';
  const ICON_CLOCK = '<svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>';
  const ICON_VIDEO = '<svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><rect x="2" y="6" width="14" height="12" rx="3"/><path d="M16 10l6-3v10l-6-3"/></svg>';
  const ICON_COPY = '<svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><rect x="9" y="9" width="12" height="12" rx="3"/><path d="M5 15V5a2 2 0 0 1 2-2h10"/></svg>';
  const ICON_CHECK = '<svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12l5 5 9-10"/></svg>';
  const ICON_TG = '<svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M21 4L3 11l6 2.5M21 4l-3 16-9-6.5M21 4L9 13.5V19l3-3.5"/></svg>';
  const ICON_ALERT = '<svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3l10 18H2L12 3z"/><path d="M12 10v5M12 18v.01"/></svg>';

  // ?now=2026-11-02T16:00 — щоб перевірити, як виглядає сайт в інший момент часу
  const nowOverride = new URLSearchParams(location.search).get("now");
  const now = () => (nowOverride ? new Date(nowOverride) : new Date());

  const $ = (s) => document.querySelector(s);
  const norm = (s) => s.toLowerCase().replace(/[`'’ʼ]/g, "'").replace(/\s+/g, " ").trim();

  const parseDate = (iso, time = "00:00") => {
    const [y, m, d] = iso.split("-").map(Number);
    const [hh, mm] = time.split(":").map(Number);
    return new Date(y, m - 1, d, hh, mm);
  };
  const isoOf = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const addDays = (d, n) => { const r = new Date(d); r.setDate(r.getDate() + n); return r; };
  const mondayOf = (d) => { const r = new Date(d.getFullYear(), d.getMonth(), d.getDate()); return addDays(r, -((r.getDay() + 6) % 7)); };
  const fmtShort = (d) => `${String(d.getDate()).padStart(2, "0")}.${String(d.getMonth() + 1).padStart(2, "0")}`;
  const fmtLong = (d) => `${d.getDate()} ${MONTHS[d.getMonth()]}`;

  // ---------- Часові пояси ----------
  // Розклад записаний за київським часом; показуємо в поясі браузера користувача
  const USER_TZ = Intl.DateTimeFormat().resolvedOptions().timeZone || "";
  const tzOffsetMin = (date, tz) => {
    const p = Object.fromEntries(new Intl.DateTimeFormat("en-US", {
      timeZone: tz, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit",
    }).formatToParts(date).map((x) => [x.type, x.value]));
    return (Date.UTC(+p.year, p.month - 1, +p.day, +p.hour, +p.minute) - Math.floor(date / 6e4) * 6e4) / 6e4;
  };
  // "2026-10-26" + "15:20" за Києвом → точний момент часу
  const parseInTz = (iso, time, tz) => {
    const [y, m, d] = iso.split("-").map(Number);
    const [hh, mm] = time.split(":").map(Number);
    const wall = Date.UTC(y, m - 1, d, hh, mm);
    let t = wall - tzOffsetMin(new Date(wall), tz) * 6e4;
    t = wall - tzOffsetMin(new Date(t), tz) * 6e4; // уточнення біля переходу на літній/зимовий час
    return new Date(t);
  };
  const hhmm = (d) => `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  // Різниця "мій час − Київ" у хвилинах (0 — якщо користувач у Києві)
  const diffFromKyiv = (d = new Date()) => -d.getTimezoneOffset() - tzOffsetMin(d, SCHEDULE_TZ);
  const fmtDiff = (min) => {
    const sign = min > 0 ? "+" : "−";
    const a = Math.abs(min), h = Math.floor(a / 60), m = a % 60;
    return `${sign}${h}${m ? `:${String(m).padStart(2, "0")}` : ""} год`;
  };

  const hue = (str) => [...str].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 360, 7);
  const initials = (name) => { const [last, first = ""] = name.split(" "); return (first[0] || "") + last[0]; };
  const firstName = (name) => name.split(" ")[1] || name;
  const avatarStyle = (name) => { const h = hue(name); return `background:linear-gradient(135deg,hsl(${h} 80% 62%),hsl(${(h + 50) % 360} 75% 48%))`; };

  // Збагачені пари з розкладу
  const LESSONS = SCHEDULE.map(([date, slot, key, type, teacher, note]) => {
    const subj = SUBJECTS[key];
    const [kyivFrom, kyivTo] = SLOTS[slot];
    const start = parseInTz(date, kyivFrom, SCHEDULE_TZ);
    const end = parseInTz(date, kyivTo, SCHEDULE_TZ);
    return {
      date: isoOf(start), // день за часом користувача
      slot, key, type, note, kyivFrom, kyivTo,
      from: hhmm(start),
      to: hhmm(end),
      shifted: diffFromKyiv(start) !== 0,
      subject: subj,
      teacher: teacher || subj.teacher,
      start, end,
      exam: !!TYPES[type]?.exam,
      links: (subj.links || []).filter((x) => !x.teacher || (teacher || subj.teacher).includes(x.teacher)),
    };
  }).sort((a, b) => a.start - b.start);

  const isMine = (key, student) => SUBJECTS[key].common || SUBJECTS[key].students.includes(student);
  const mySubjects = (student) => Object.keys(SUBJECTS).filter((k) => isMine(k, student));

  const FIRST_WEEK = mondayOf(LESSONS[0].start);
  const LAST_WEEK = mondayOf(LESSONS[LESSONS.length - 1].start);

  const state = {
    me: null,
    mode: "mine",
    week: null,
    day: null,
    tab: "schedule",
  };

  // ---------- Екран вибору ----------
  function renderPicker(filter = "") {
    const q = norm(filter);
    const list = STUDENTS.filter((s) => !q || norm(s).includes(q));
    $("#student-list").innerHTML = list.length
      ? list.map((s, i) => `
          <button class="student" data-name="${s}" style="--i:${i}">
            <span class="avatar" style="${avatarStyle(s)}">${initials(s)}</span>
            <span class="student-name"><b>${s.split(" ")[0]}</b> ${s.split(" ").slice(1).join(" ")}</span>
            <svg class="arrow" viewBox="0 0 24 24"><path d="M9 6l6 6-6 6"/></svg>
          </button>`).join("")
      : `<p class="empty-search">Нікого не знайдено 🤷</p>`;
  }

  function choose(name) {
    state.me = name;
    localStorage.setItem(STORAGE_KEY, name);
    const n = now();
    let wk = mondayOf(n);
    if (wk < FIRST_WEEK) wk = FIRST_WEEK;
    if (wk > LAST_WEEK) wk = LAST_WEEK;
    state.week = wk;
    state.day = isoOf(n >= wk && n < addDays(wk, 7) ? n : wk);
    $("#picker").classList.add("hidden");
    $("#board").classList.remove("hidden");
    window.scrollTo(0, 0);
    renderBoard();
  }

  function logout() {
    localStorage.removeItem(STORAGE_KEY);
    state.me = null;
    $("#board").classList.add("hidden");
    $("#picker").classList.remove("hidden");
    $("#search").value = "";
    renderPicker();
  }

  // ---------- Кабінет ----------
  function renderBoard() {
    const me = state.me;
    $("#me-avatar").textContent = initials(me);
    $("#me-avatar").setAttribute("style", avatarStyle(me));
    $("#me-name").textContent = me;
    const n = now();
    $("#today-label").textContent = `${DAY_NAMES[n.getDay()]}, ${fmtLong(n)}`;
    $("#greeting").innerHTML = `Привіт, ${firstName(me)}!`;
    const diff = diffFromKyiv(n);
    const city = USER_TZ.split("/").pop().replace(/_/g, " ");
    $("#tz-note").innerHTML = diff
      ? `${ICON_CLOCK}<span>Час пар показано за твоїм поясом${city ? ` (${city})` : ""} · <b>Київ ${fmtDiff(-diff)}</b></span>`
      : `${ICON_CLOCK}<span>Час пар за Києвом</span>`;
    // кожен блок окремо: помилка в одному не ламає інші
    [renderNext, renderSchedule, renderExams, renderSubjects].forEach((fn) => {
      try { fn(); } catch (e) { console.error(fn.name, e); }
    });
  }

  function relDay(d) {
    const today = parseDate(isoOf(now()));
    const diff = Math.round((parseDate(isoOf(d)) - today) / 864e5);
    if (diff === 0) return "Сьогодні";
    if (diff === 1) return "Завтра";
    return `${DAY_SHORT[d.getDay()]}, ${fmtLong(d)}`;
  }

  function humanIn(ms) {
    const min = Math.max(1, Math.round(ms / 6e4));
    const d = Math.floor(min / 1440), h = Math.floor((min % 1440) / 60), m = min % 60;
    if (d > 0) return `через ${d} дн ${h} год`;
    if (h > 0) return `через ${h} год ${m} хв`;
    return `через ${m} хв`;
  }

  function renderNext() {
    const n = now();
    const mine = LESSONS.filter((l) => isMine(l.key, state.me) && l.end > n);
    const el = $("#next-card");
    if (!mine.length) {
      el.innerHTML = `<div class="next-inner"><p class="eyebrow">Семестр</p><h3>Пари в цьому розкладі закінчились 🎉</h3></div>`;
      el.style.setProperty("--c", "#a78bfa");
      return;
    }
    const l = mine[0];
    const live = l.start <= n;
    const progress = live ? Math.round(((n - l.start) / (l.end - l.start)) * 100) : 0;
    const t = TYPES[l.type];
    el.className = `next-card${l.exam ? " exam" : ""}${live ? " live" : ""}`;
    el.style.setProperty("--c", l.exam ? COLOR_EXAM : COLOR_LESSON);
    el.innerHTML = `
      <div class="next-inner">
        <div class="next-head">
          <span class="eyebrow">${live ? '<span class="pulse"></span>Зараз іде' : "Наступна пара"}</span>
          <span class="next-when">${ICON_CLOCK}${relDay(l.start)} · ${l.from}–${l.to}</span>
        </div>
        <h3>${l.subject.name}</h3>
        <div class="next-meta">
          <span class="badge ${t.cls}">${l.exam ? ICON_ALERT : ""}${t.label}</span>
          ${teacherHtml(l.teacher)}
        </div>
        ${linksDropdown(l)}
        ${live
          ? `<div class="progress"><span style="width:${progress}%"></span></div><p class="next-foot">Закінчиться о ${l.to}</p>`
          : `<p class="next-foot">${humanIn(l.start - n)}</p>`}
      </div>`;
  }

  // Викладач + контакти (TEACHERS у data.js)
  function teacherHtml(name) {
    const contacts = Object.entries(TEACHERS)
      .filter(([t]) => name.includes(t))
      .flatMap(([, c]) => (c.telegram ? [`<a class="contact tg" href="https://t.me/${c.telegram}" target="_blank" rel="noopener" title="Написати в Telegram">${ICON_TG}@${c.telegram}</a>`] : []));
    return `<div class="teacher-row"><span class="teacher">${ICON_TEACHER}<span>${name}</span></span>${contacts.join("")}</div>`;
  }

  const copyRow = (label, value) => `
    <div class="copy-row">
      <span class="copy-label">${label}</span>
      <code>${value}</code>
      <button class="copy-btn" data-copy="${value.replace(/ /g, "")}" title="Скопіювати" aria-label="Скопіювати ${label}">${ICON_COPY}</button>
    </div>`;

  function linksDropdown(l) {
    if (!l.links.length) return "";
    return l.links.map((x) => {
      return `
        <details class="meet">
          <summary>${ICON_VIDEO}<span>Zoom${l.links.length > 1 && x.teacher ? ` · ${x.teacher}` : ""}</span><svg class="chev" viewBox="0 0 24 24"><path d="M7 10l5 5 5-5"/></svg></summary>
          <div class="meet-body">
            <a class="join" href="${x.url}" target="_blank" rel="noopener">${ICON_VIDEO}Приєднатися до пари</a>
            ${x.passcode ? copyRow("Код", x.passcode) : ""}
          </div>
        </details>`;
    }).join("");
  }

  function lessonCard(l, { dimOther = false } = {}) {
    const n = now();
    const t = TYPES[l.type] || { label: l.type, cls: "" };
    const mine = isMine(l.key, state.me);
    const cls = ["lesson"];
    if (l.exam) cls.push("exam");
    if (l.end < n) cls.push("past");
    if (l.start <= n && l.end > n) cls.push("now");
    if (dimOther && !mine) cls.push("other");
    return `
      <article class="${cls.join(" ")}" style="--c:${l.exam ? COLOR_EXAM : COLOR_LESSON}">
        <div class="time">
          <span class="num">${l.slot}</span>
          <b>${l.from}</b>
          <span class="to">${l.to}</span>
          ${l.shifted ? `<span class="kyiv" title="За київським часом">Київ ${l.kyivFrom}</span>` : ""}
        </div>
        <div class="body">
          <div class="tags">
            <span class="badge ${t.cls}">${l.exam ? ICON_ALERT : ""}${t.label}</span>
            ${l.subject.common ? "" : '<span class="badge soft">вибіркова</span>'}
            ${cls.includes("now") ? '<span class="badge live"><span class="pulse"></span>зараз</span>' : ""}
            ${dimOther && !mine ? '<span class="badge soft">не твоя</span>' : ""}
          </div>
          <h4>${l.subject.name}</h4>
          ${teacherHtml(l.teacher)}
          ${l.note ? `<p class="note">${l.note}</p>` : ""}
          ${linksDropdown(l)}
        </div>
      </article>`;
  }

  function renderSchedule() {
    const wk = state.week;
    const days = [...Array(7)].map((_, i) => addDays(wk, i));
    const todayIso = isoOf(now());
    const all = state.mode === "all";
    const visible = (l) => all || isMine(l.key, state.me);

    $("#week-label").innerHTML = `<b>${fmtShort(days[0])} – ${fmtShort(days[6])}</b><span>${weekNumber(wk)} тиждень</span>`;
    $("#prev-week").disabled = wk <= FIRST_WEEK;
    $("#next-week").disabled = wk >= LAST_WEEK;

    $("#day-strip").innerHTML = days.map((d) => {
      const iso = isoOf(d);
      const ls = LESSONS.filter((l) => l.date === iso && visible(l));
      const exam = ls.some((l) => l.exam && isMine(l.key, state.me));
      return `
        <button class="day-pill${iso === state.day ? " active" : ""}${iso === todayIso ? " today" : ""}${iso < todayIso ? " past" : ""}" data-day="${iso}">
          <span>${DAY_SHORT[d.getDay()]}</span>
          <b>${d.getDate()}</b>
          <i class="dots">${ls.length ? `<em class="${exam ? "red" : ""}"></em>` : ""}</i>
        </button>`;
    }).join("");

    $("#week").innerHTML = days.map((d) => {
      const iso = isoOf(d);
      const ls = LESSONS.filter((l) => l.date === iso && visible(l));
      const isToday = iso === todayIso;
      return `
        <div class="day${iso === state.day ? " active" : ""}${isToday ? " is-today" : ""}" data-day="${iso}">
          <div class="day-head">
            <h3>${DAY_NAMES[d.getDay()]}</h3>
            <span>${fmtLong(d)}${isToday ? ' · <em>сьогодні</em>' : ""}</span>
            <span class="count">${ls.length ? `${ls.length} ${plural(ls.length, ["пара", "пари", "пар"])}` : ""}</span>
          </div>
          ${ls.length
            ? `<div class="lessons">${ls.map((l) => lessonCard(l, { dimOther: all })).join("")}</div>`
            : `<div class="free"><svg viewBox="0 0 24 24"><path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z"/></svg><span>Пар немає — відпочивай</span></div>`}
        </div>`;
    }).join("");
  }

  const weekNumber = (wk) => Math.round((wk - FIRST_WEEK) / (7 * 864e5)) + 1;
  const plural = (n, [one, few, many]) => {
    const m10 = n % 10, m100 = n % 100;
    if (m10 === 1 && m100 !== 11) return one;
    if (m10 >= 2 && m10 <= 4 && (m100 < 10 || m100 >= 20)) return few;
    return many;
  };

  function renderExams() {
    const n = now();
    const today = parseDate(isoOf(n));
    const exams = LESSONS.filter((l) => l.exam && isMine(l.key, state.me));
    $("#tab-exams").innerHTML = exams.length
      ? `<div class="exam-list">${exams.map((l) => {
          const days = Math.round((parseDate(l.date) - today) / 864e5);
          const past = l.end < n;
          const when = past ? "минув" : days === 0 ? "сьогодні" : days === 1 ? "завтра" : `через ${days} ${plural(days, ["день", "дні", "днів"])}`;
          return `
            <article class="exam-item${past ? " past" : ""}">
              <div class="date-block">
                <b>${l.start.getDate()}</b>
                <span>${MONTHS[l.start.getMonth()].slice(0, 3)}</span>
              </div>
              <div class="body">
                <div class="tags"><span class="badge exam">${ICON_ALERT}${TYPES[l.type].label}</span><span class="badge soft">${DAY_SHORT[l.start.getDay()]} · ${l.from}–${l.to}</span></div>
                <h4>${l.subject.name}</h4>
                ${teacherHtml(l.teacher)}
              </div>
              <span class="countdown">${when}</span>
            </article>`;
        }).join("")}</div>`
      : `<div class="free big"><span>Заліків у розкладі поки немає</span></div>`;
  }

  function renderSubjects() {
    const n = now();
    const keys = mySubjects(state.me);
    const card = (k) => {
      const s = SUBJECTS[k];
      const ls = LESSONS.filter((l) => l.key === k);
      const left = ls.filter((l) => l.end > n && !l.exam).length;
      const exam = ls.find((l) => l.exam);
      const next = ls.find((l) => l.end > n);
      return `
        <article class="subject" style="--c:${s.color}">
          <div class="tags"><span class="badge soft">${s.common ? "загальна" : "вибіркова"}</span></div>
          <h4>${s.name}</h4>
          ${teacherHtml(s.teacher)}
          <div class="subject-foot">
            <span>${left} ${plural(left, ["пара", "пари", "пар"])} попереду</span>
            ${next ? `<span>наступна ${fmtShort(next.start)}</span>` : ""}
            ${exam ? `<span class="red">залік ${fmtShort(exam.start)}</span>` : ""}
          </div>
        </article>`;
    };
    const common = keys.filter((k) => SUBJECTS[k].common);
    const electives = keys.filter((k) => !SUBJECTS[k].common);
    $("#tab-subjects").innerHTML = `
      <h3 class="section-title">Мої вибіркові</h3>
      <div class="subject-grid">${electives.map(card).join("")}</div>
      <h3 class="section-title">Загальні для групи</h3>
      <div class="subject-grid">${common.map(card).join("")}</div>`;
  }

  // ---------- Події ----------
  $("#search").addEventListener("input", (e) => renderPicker(e.target.value));
  $("#search").addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      const first = document.querySelector(".student");
      if (first) choose(first.dataset.name);
    }
  });
  $("#student-list").addEventListener("click", (e) => {
    const b = e.target.closest(".student");
    if (b) choose(b.dataset.name);
  });
  $("#me-btn").addEventListener("click", logout);

  $("#tabs").addEventListener("click", (e) => {
    const b = e.target.closest("button[data-tab]");
    if (!b) return;
    state.tab = b.dataset.tab;
    document.querySelectorAll("#tabs button").forEach((x) => x.classList.toggle("active", x === b));
    document.querySelectorAll(".tab-panel").forEach((p) => p.classList.toggle("hidden", p.id !== `tab-${state.tab}`));
  });

  $("#mode-seg").addEventListener("click", (e) => {
    const b = e.target.closest("button[data-mode]");
    if (!b) return;
    state.mode = b.dataset.mode;
    document.querySelectorAll("#mode-seg button").forEach((x) => x.classList.toggle("active", x === b));
    renderSchedule();
  });

  const shiftWeek = (delta) => {
    const next = addDays(state.week, delta * 7);
    if (next < FIRST_WEEK || next > LAST_WEEK) return;
    const dayIdx = Math.round((parseDate(state.day) - state.week) / 864e5);
    state.week = next;
    state.day = isoOf(addDays(next, dayIdx));
    renderSchedule();
  };
  $("#prev-week").addEventListener("click", () => shiftWeek(-1));
  $("#next-week").addEventListener("click", () => shiftWeek(1));
  $("#today-btn").addEventListener("click", () => {
    const n = now();
    let wk = mondayOf(n);
    if (wk < FIRST_WEEK) wk = FIRST_WEEK;
    if (wk > LAST_WEEK) wk = LAST_WEEK;
    state.week = wk;
    state.day = isoOf(n >= wk && n < addDays(wk, 7) ? n : wk);
    renderSchedule();
  });

  $("#day-strip").addEventListener("click", (e) => {
    const b = e.target.closest(".day-pill");
    if (!b) return;
    state.day = b.dataset.day;
    renderSchedule();
  });

  // Свайп днів на телефоні
  const moveDay = (delta) => {
    const d = addDays(parseDate(state.day), delta);
    if (d < state.week) { if (state.week > FIRST_WEEK) { state.week = addDays(state.week, -7); } else return; }
    if (d >= addDays(state.week, 7)) { if (state.week < LAST_WEEK) { state.week = addDays(state.week, 7); } else return; }
    state.day = isoOf(d);
    renderSchedule();
  };
  let touch = null;
  $("#week").addEventListener("touchstart", (e) => { touch = { x: e.touches[0].clientX, y: e.touches[0].clientY }; }, { passive: true });
  $("#week").addEventListener("touchend", (e) => {
    if (!touch) return;
    const dx = e.changedTouches[0].clientX - touch.x;
    const dy = e.changedTouches[0].clientY - touch.y;
    touch = null;
    if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) moveDay(dx < 0 ? 1 : -1);
  });

  // Копіювання ID / коду доступу
  async function copyText(text) {
    try { await navigator.clipboard.writeText(text); return true; } catch {}
    const t = document.createElement("textarea");
    t.value = text; t.style.position = "fixed"; t.style.opacity = "0";
    document.body.appendChild(t); t.select();
    const ok = document.execCommand("copy");
    t.remove();
    return ok;
  }
  document.addEventListener("click", async (e) => {
    const b = e.target.closest(".copy-btn");
    if (!b) return;
    if (await copyText(b.dataset.copy)) {
      b.classList.add("done");
      b.innerHTML = ICON_CHECK;
      setTimeout(() => { b.classList.remove("done"); b.innerHTML = ICON_COPY; }, 1500);
    }
  });

  // Оновлювати "зараз" / таймер щохвилини
  setInterval(() => {
    if (!state.me) return;
    if (!document.querySelector("#next-card details[open]")) renderNext(); // не закривати відкритий Zoom
  }, 60_000);

  // ---------- Старт ----------
  renderPicker();
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved && STUDENTS.includes(saved)) choose(saved);
})();
