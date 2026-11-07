/* GENERATED from src/composition/app.ts by esbuild (npm run build). Do not edit. */
"use strict";
(() => {
  // src/kernel/errors.ts
  var USER_ERROR_CODES = [
    // Supabase Auth
    "auth.invalid_credentials",
    "auth.email_not_confirmed",
    "auth.user_already_exists",
    "auth.email_exists",
    "auth.weak_password",
    "auth.weak_password_other",
    "auth.email_rate_limit",
    "auth.rate_limit",
    "auth.otp_expired",
    "auth.email_invalid",
    "auth.signup_disabled",
    "auth.user_banned",
    "auth.user_not_found",
    "auth.same_password",
    "auth.email_not_authorized",
    "auth.captcha_failed",
    "auth.session_expired",
    "auth.not_signed_in",
    "auth.network",
    "auth.server",
    "auth.unknown",
    // the cloud (PostgREST, Storage)
    "cloud.network",
    "cloud.storage_full",
    "cloud.keeps_changing",
    "cloud.schema_old",
    "cloud.permission",
    "cloud.too_large",
    "cloud.rate_limit",
    "cloud.server",
    "cloud.unknown",
    "cloud.selftest.value_missing",
    "cloud.selftest.row_missing",
    "cloud.selftest.column_missing",
    "cloud.selftest.not_listed",
    "cloud.selftest.content_differs",
    "cloud.selftest.public_unreadable",
    // sharing, files
    "share.invalid_email",
    "share.own_email",
    "files.too_big",
    "files.no_reader",
    "files.not_zip",
    "files.no_pack_json",
    "files.bad_pack_json",
    "files.no_writer",
    // AI (Claude, Gemini)
    "ai.unauthorized",
    "ai.unauthorized_short",
    "ai.forbidden",
    "ai.no_credit",
    "ai.no_credit_short",
    "ai.too_large",
    "ai.rate_limited",
    "ai.overloaded",
    "ai.http",
    "ai.api",
    "ai.aborted",
    "ai.network",
    "ai.no_connection",
    "ai.skill_unavailable",
    "ai.no_key.device",
    "ai.no_key.claude",
    "ai.no_key.gemini",
    "ai.no_key.any",
    "ai.api_claude",
    "ai.quota",
    "ai.api_gemini",
    "ai.network_gemini",
    "ai.not_json",
    "ai.invalid",
    "ai.job.too_long",
    "ai.job.budget",
    "ai.job.refused",
    "ai.job.stopped",
    // the picture service (/api/img, /api/file) and engine/claude.js pictures
    "img.method",
    "img.origin",
    "img.bad_origin",
    "img.no_query",
    "img.bad_url",
    "img.scheme",
    "img.blocked",
    "img.unreachable",
    "img.timeout",
    "img.upstream",
    "img.no_main_picture",
    "img.file_type",
    "img.not_picture",
    "img.not_picture_bytes",
    "img.too_large",
    "img.redirects",
    "img.http",
    "img.not_picture_page",
    "img.download_failed",
    "img.unreadable",
    "img.picture_too_large",
    "img.url_scheme"
  ];
  var INTERNAL_ERROR_CODES = [
    "storage.quota",
    // the browser's storage for this site is full (the storage-full signal)
    "storage.unavailable",
    // no localStorage / IndexedDB (private mode, blocked site data, a test context)
    "storage.corrupt",
    // a stored value is not what it should be (not JSON, wrong shape)
    "storage.failed",
    // a storage operation failed for another reason (a transaction error)
    "remote.conflict",
    // compare-and-swap refused: the row changed since the version the writer read
    "remote.unknown_collection",
    // a Remote collection the adapter has no table for
    "compute.timeout",
    // a job ran longer than its time limit (its Worker is stopped)
    "compute.cancelled",
    // a job was cancelled by its caller
    "compute.unknown_job",
    // no handler is registered for the job name
    "compute.failed",
    // the job's handler threw
    "compute.unavailable",
    // no Worker could be started (the inline fallback runs instead)
    "ai.unsupported",
    // the provider cannot do what the request asks (e.g. tools on a model without tools)
    "hlc.drift",
    // a remote hybrid-clock time is too far ahead of this device's clock
    "hlc.invalid",
    // a hybrid-clock time stamp that cannot be read
    "hlc.overflow",
    // more events in one millisecond than the counter holds (the physical clock stands still)
    "day.invalid",
    // not a calendar day "YYYY-MM-DD"
    "id.invalid",
    // not a valid id of its kind
    "container.unknown",
    // the composition root has no registration for a token
    "container.cycle",
    // registrations that depend on each other in a circle
    "container.frozen",
    // a registration after the container was frozen
    "invariant.failed",
    // a broken invariant: a bug
    "internal.unexpected"
    // something was thrown that is not a NoemaError (wrapped by NoemaError.from)
  ];
  var SEVERITIES = ["debug", "info", "warning", "error", "fatal"];
  var USER = new Set(USER_ERROR_CODES);
  var ALL = /* @__PURE__ */ new Set([...USER_ERROR_CODES, ...INTERNAL_ERROR_CODES]);
  var isErrorCode = (s) => typeof s === "string" && ALL.has(s);
  var NoemaError = class _NoemaError extends Error {
    code;
    params;
    retryable;
    status;
    constructor(code, message, options = {}) {
      super(message, options.cause === void 0 ? void 0 : { cause: options.cause });
      this.name = "NoemaError";
      this.code = code;
      this.params = Object.freeze({ ...options.params ?? {} });
      this.retryable = options.retryable ?? false;
      this.status = options.status;
    }
    toJSON() {
      return { code: this.code, params: this.params, message: this.message };
    }
    /** A NoemaError from anything thrown: a NoemaError as it is; an Error with a known `.code` (the old engine's coded
        errors, docs/i18n.md §6.1) keeps its code and params; anything else becomes `fallback` with the thrown thing as cause. */
    static from(thrown, fallback = "internal.unexpected") {
      if (thrown instanceof _NoemaError) return thrown;
      if (thrown && typeof thrown === "object") {
        const o = thrown;
        const message = typeof o.message === "string" ? o.message : String(thrown);
        const code = isErrorCode(o.code) ? o.code : fallback;
        const params = o.params && typeof o.params === "object" ? cleanParams(o.params) : {};
        return new _NoemaError(code, message, { params, cause: thrown, ...typeof o.status === "number" ? { status: o.status } : {} });
      }
      return new _NoemaError(fallback, String(thrown), { cause: thrown });
    }
    /** A NoemaError back from its serialised form (a Worker's answer). */
    static fromInfo(info, fallback = "internal.unexpected") {
      const code = isErrorCode(info.code) ? info.code : fallback;
      const params = info.params && typeof info.params === "object" ? cleanParams(info.params) : {};
      return new _NoemaError(code, typeof info.message === "string" ? info.message : code, { params });
    }
  };
  function cleanParams(p) {
    const out = {};
    for (const [k, v] of Object.entries(p)) if (typeof v === "string" || typeof v === "number" || typeof v === "boolean") out[k] = v;
    return out;
  }

  // src/kernel/result.ts
  var ok = (value) => Object.freeze({ ok: true, value });
  var err = (error) => Object.freeze({ ok: false, error });
  var OK_VOID = ok(void 0);

  // src/ports/storage.ts
  function isQuotaError(e2) {
    if (!e2 || typeof e2 !== "object") return false;
    const x = e2;
    return x.name === "QuotaExceededError" || x.name === "NS_ERROR_DOM_QUOTA_REACHED" || x.code === 22 || x.code === 1014;
  }

  // src/adapters/browser/storage.ts
  var APP_DB = Object.freeze({ name: "noema-lite", version: 1, collections: ["packs", "handles", "restore", "convos"] });
  var unavailable = (what, cause) => new NoemaError("storage.unavailable", `this browser gives no ${what} here`, cause === void 0 ? {} : { cause });
  function browserStorage(o = {}) {
    const now = o.now ?? Date.now;
    const g = globalThis;
    const getLS = o.localStorage ?? (() => g.localStorage);
    const getIDB = o.indexedDB ?? (() => g.indexedDB);
    const getSM = o.storageManager ?? (() => g.navigator?.storage);
    const listeners = /* @__PURE__ */ new Set();
    const signal = (store, key) => {
      const event = Object.freeze({ store, key, at: now() });
      for (const l of [...listeners]) l(event);
      return new NoemaError("storage.quota", "the browser storage for this site is full", { params: { key }, retryable: true });
    };
    const ls = () => {
      try {
        const s = getLS();
        return s ? ok(s) : err(unavailable("localStorage"));
      } catch (e2) {
        return err(unavailable("localStorage", e2));
      }
    };
    const kv = {
      get(key) {
        const s = ls();
        if (!s.ok) return s;
        try {
          return ok(s.value.getItem(key));
        } catch (e2) {
          return err(unavailable("localStorage", e2));
        }
      },
      set(key, value) {
        const s = ls();
        if (!s.ok) return s;
        try {
          s.value.setItem(key, value);
          return OK_VOID;
        } catch (e2) {
          return err(isQuotaError(e2) ? signal("kv", key) : new NoemaError("storage.failed", "localStorage refused a write", { cause: e2, params: { key } }));
        }
      },
      delete(key) {
        const s = ls();
        if (!s.ok) return s;
        try {
          s.value.removeItem(key);
          return OK_VOID;
        } catch (e2) {
          return err(unavailable("localStorage", e2));
        }
      },
      keys(prefix = "") {
        const s = ls();
        if (!s.ok) return s;
        try {
          const out = [];
          for (let i = 0; i < s.value.length; i++) {
            const k = s.value.key(i);
            if (k !== null && k.startsWith(prefix)) out.push(k);
          }
          return ok(out);
        } catch (e2) {
          return err(unavailable("localStorage", e2));
        }
      }
    };
    const docs = idbDocuments({
      name: o.dbName ?? APP_DB.name,
      version: o.dbVersion ?? APP_DB.version,
      collections: o.collections ?? APP_DB.collections,
      indexedDB: getIDB,
      onQuota: (key) => signal("docs", key)
    });
    return {
      kv,
      docs,
      async estimate() {
        const sm = getSM();
        if (!sm?.estimate) return ok({ usage: null, quota: null, persisted: false });
        try {
          const e2 = await sm.estimate();
          const persisted = sm.persisted ? await sm.persisted() : false;
          return ok({ usage: e2.usage ?? null, quota: e2.quota ?? null, persisted });
        } catch (e2) {
          return err(new NoemaError("storage.failed", "the storage estimate failed", { cause: e2 }));
        }
      },
      async persist() {
        const sm = getSM();
        if (!sm?.persist) return ok(false);
        try {
          return ok(await sm.persist());
        } catch (e2) {
          return err(new NoemaError("storage.failed", "the persist request failed", { cause: e2 }));
        }
      },
      onFull(listener) {
        listeners.add(listener);
        return () => {
          listeners.delete(listener);
        };
      }
    };
  }
  var req = (r) => new Promise((resolve, reject) => {
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
  function idbDocuments(o) {
    let opening = null;
    const open = () => {
      if (opening) return opening;
      opening = new Promise((resolve) => {
        let factory;
        try {
          factory = o.indexedDB();
        } catch (e2) {
          return resolve(err(unavailable("IndexedDB", e2)));
        }
        if (!factory) return resolve(err(unavailable("IndexedDB")));
        let r;
        try {
          r = factory.open(o.name, o.version);
        } catch (e2) {
          return resolve(err(unavailable("IndexedDB", e2)));
        }
        r.onupgradeneeded = () => {
          for (const c of o.collections) if (!r.result.objectStoreNames.contains(c)) r.result.createObjectStore(c);
        };
        r.onsuccess = () => {
          const db = r.result;
          db.onversionchange = () => {
            db.close();
            opening = null;
          };
          resolve(ok(db));
        };
        r.onerror = () => {
          opening = null;
          resolve(err(unavailable("IndexedDB", r.error)));
        };
      });
      return opening;
    };
    async function transaction(collections, mode, work) {
      const db = await open();
      if (!db.ok) return db;
      let t;
      try {
        t = db.value.transaction([...collections], mode);
      } catch (e2) {
        return err(new NoemaError("storage.failed", "could not start a transaction on " + collections.join(", "), { cause: e2 }));
      }
      let lastKey = collections.join(",");
      const store = (c) => t.objectStore(c);
      const tx = {
        get: (c, k) => req(store(c).get(k)),
        put: async (c, k, d) => {
          lastKey = c + "/" + k;
          await req(store(c).put(d, k));
        },
        delete: async (c, k) => {
          await req(store(c).delete(k));
        },
        list: (c, lo = {}) => new Promise((resolve, reject) => {
          const range = lo.prefix ? IDBKeyRange.bound(lo.prefix, lo.prefix + "\uFFFF") : void 0;
          const out = [];
          const cur = store(c).openCursor(range);
          cur.onsuccess = () => {
            const x = cur.result;
            if (!x || lo.limit !== void 0 && out.length >= lo.limit) return resolve(out);
            out.push([String(x.key), x.value]);
            x.continue();
          };
          cur.onerror = () => reject(cur.error);
        })
      };
      return new Promise((resolve) => {
        let value = null, failed = null;
        t.oncomplete = () => resolve(value ? ok(value.v) : err(new NoemaError("storage.failed", "the transaction ended without its work")));
        const fail = () => {
          const e2 = failed ?? t.error;
          resolve(err(isQuotaError(e2) ? o.onQuota(lastKey) : NoemaError.from(e2, "storage.failed")));
        };
        t.onabort = fail;
        t.onerror = (ev) => {
          failed = failed ?? t.error ?? ev.target?.error;
        };
        work(tx).then(
          (v) => {
            value = { v };
          },
          (e2) => {
            failed = failed ?? e2;
            try {
              t.abort();
            } catch {
              fail();
            }
          }
        );
      });
    }
    return {
      collections: [...o.collections],
      get: (c, k) => transaction([c], "readonly", (tx) => tx.get(c, k)),
      put: (c, k, d) => transaction([c], "readwrite", (tx) => tx.put(c, k, d)),
      delete: (c, k) => transaction([c], "readwrite", (tx) => tx.delete(c, k)),
      list: (c, lo) => transaction([c], "readonly", (tx) => tx.list(c, lo)),
      transaction
    };
  }

  // src/kernel/day.ts
  var FORMAT = /^(\d{4})-(\d{2})-(\d{2})$/;
  var pad = (n, w = 2) => String(n).padStart(w, "0");
  function dayOf(moment) {
    const d = moment instanceof Date ? moment : new Date(moment);
    if (Number.isNaN(d.getTime())) throw new NoemaError("day.invalid", "not a valid moment: " + String(moment));
    return `${pad(d.getFullYear(), 4)}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  }
  function parts(text) {
    const m = FORMAT.exec(text);
    if (!m) return null;
    const y = Number(m[1]), mo = Number(m[2]), d = Number(m[3]);
    if (mo < 1 || mo > 12 || d < 1) return null;
    const last = new Date(Date.UTC(y, mo, 0)).getUTCDate();
    return d > last ? null : [y, mo, d];
  }
  var isLocalDay = (x) => typeof x === "string" && parts(x) !== null;
  function parseDay(text) {
    return isLocalDay(text) ? ok(text) : err(new NoemaError("day.invalid", 'not a calendar day "YYYY-MM-DD": ' + JSON.stringify(String(text).slice(0, 40))));
  }
  function ymd(day2) {
    const p = parts(day2);
    if (!p) throw new NoemaError("day.invalid", 'not a calendar day "YYYY-MM-DD": ' + JSON.stringify(String(day2).slice(0, 40)));
    return p;
  }
  function noonOf(day2) {
    const [y, m, d] = ymd(day2);
    return new Date(y, m - 1, d, 12);
  }
  function addDays(day2, n) {
    if (!Number.isInteger(n)) throw new NoemaError("day.invalid", "a number of days must be whole: " + String(n));
    const d = noonOf(day2);
    d.setDate(d.getDate() + n);
    return dayOf(d);
  }
  function daysBetween(a, b) {
    const [ya, ma, da] = ymd(a), [yb, mb, db] = ymd(b);
    return Math.round((Date.UTC(yb, mb - 1, db) - Date.UTC(ya, ma - 1, da)) / 864e5);
  }
  var compareDays = (a, b) => a < b ? -1 : a > b ? 1 : 0;
  var weekdayOf = (day2) => noonOf(day2).getDay();
  function weekStart(day2, firstDay = 1) {
    return addDays(day2, -((weekdayOf(day2) - firstDay + 7) % 7));
  }

  // src/adapters/browser/clock.ts
  function systemClock(o = {}) {
    const now = o.now ?? Date.now;
    const T = globalThis;
    const dayListeners = /* @__PURE__ */ new Set();
    let timer = null;
    let last = null;
    const check = () => {
      const d = dayOf(now());
      if (last !== null && d !== last) for (const l of [...dayListeners]) l(d);
      last = d;
    };
    const doc = T.document;
    const onVisible = () => {
      if (doc?.visibilityState === "visible") check();
    };
    const clock = {
      now,
      today: () => dayOf(now()),
      timeZone() {
        try {
          return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
        } catch {
          return "UTC";
        }
      },
      setTimeout: (f, ms) => T.setTimeout(f, ms),
      clearTimeout: (h) => T.clearTimeout(h),
      setInterval: (f, ms) => T.setInterval(f, ms),
      clearInterval: (h) => T.clearInterval(h),
      sleep(ms, signal) {
        return new Promise((resolve, reject) => {
          if (signal?.aborted) return reject(signal.reason);
          const h = T.setTimeout(() => {
            signal?.removeEventListener("abort", onAbort);
            resolve();
          }, ms);
          const onAbort = () => {
            T.clearTimeout(h);
            reject(signal?.reason);
          };
          signal?.addEventListener("abort", onAbort, { once: true });
        });
      },
      onDayChange(listener) {
        dayListeners.add(listener);
        if (timer === null) {
          last = dayOf(now());
          timer = T.setInterval(check, o.dayCheckMs ?? 6e4);
          doc?.addEventListener("visibilitychange", onVisible);
        }
        return () => {
          dayListeners.delete(listener);
          if (!dayListeners.size && timer !== null) {
            T.clearInterval(timer);
            timer = null;
            doc?.removeEventListener("visibilitychange", onVisible);
          }
        };
      }
    };
    return clock;
  }

  // src/adapters/memory/i18n.ts
  var RTL = /^(ar|he|fa|ur)(-|$)|^ar-XB$/;
  function chainOf(tag) {
    const out = [tag], parts2 = tag.split("-");
    if (parts2.length > 1 && !/^zh-/i.test(tag) && parts2[0]) out.push(parts2[0]);
    if (!out.includes("en")) out.push("en");
    return out;
  }
  function formatSimple(message, params, locale) {
    const plural = /\{(\w+),\s*plural,\s*((?:[=\w]+\s*\{[^{}]*\}\s*)+)\}/g;
    const out = message.replace(plural, (_m, name, body) => {
      const n = Number(params[name] ?? 0);
      const forms = new Map([...body.matchAll(/([=\w]+)\s*\{([^{}]*)\}/g)].map((x) => [x[1] ?? "", x[2] ?? ""]));
      const form = forms.get("=" + n) ?? forms.get(new Intl.PluralRules(locale).select(n)) ?? forms.get("other") ?? "";
      return form.replace(/#/g, new Intl.NumberFormat(locale).format(n));
    });
    return out.replace(/\{(\w+)\}/g, (m, k) => params[k] === void 0 || params[k] === null ? m : String(params[k]));
  }
  function catalogI18n(catalogs, initialLocale = "en") {
    let locale = initialLocale;
    const listeners = /* @__PURE__ */ new Set();
    const source = (key) => {
      for (const l of chainOf(locale)) {
        const m = catalogs[l]?.[key];
        if (m !== void 0) return [m, l];
      }
      return null;
    };
    const t = (key, params = {}) => {
      const s = source(key);
      return s ? formatSimple(s[0], params, s[1]) : key.split(".").pop() ?? key;
    };
    const has = (key) => source(key) !== null;
    const asDate = (x) => x instanceof Date ? x : new Date(x);
    const format = {
      number: (n, o) => new Intl.NumberFormat(locale, o).format(n),
      percent: (x, o) => new Intl.NumberFormat(locale, { style: "percent", maximumFractionDigits: 0, ...o }).format(x),
      date: (d, o = { dateStyle: "medium" }) => {
        const x = asDate(d);
        return Number.isNaN(x.getTime()) ? "" : new Intl.DateTimeFormat(locale, o).format(x);
      },
      time: (d, o = { timeStyle: "short" }) => {
        const x = asDate(d);
        return Number.isNaN(x.getTime()) ? "" : new Intl.DateTimeFormat(locale, o).format(x);
      },
      relative: (v, unit) => new Intl.RelativeTimeFormat(locale, { numeric: "auto" }).format(v, unit),
      list: (items, o = { type: "conjunction" }) => new Intl.ListFormat(locale, o).format([...items]),
      compare: (a, b) => new Intl.Collator(locale, { sensitivity: "base", numeric: true }).compare(a, b)
    };
    return {
      t,
      has,
      err(e2) {
        if (e2 === null || e2 === void 0) return "";
        const x = typeof e2 === "object" && "error" in e2 && e2.error && typeof e2.error === "object" ? e2.error : e2;
        const code = typeof x.code === "string" ? x.code : null;
        if (code && has("err." + code)) return t("err." + code, x.params ?? {});
        return typeof x.message === "string" ? x.message : String(e2);
      },
      plural: (n) => new Intl.PluralRules(locale).select(n),
      locale: () => locale,
      dir: () => RTL.test(locale) ? "rtl" : "ltr",
      format,
      onChange(listener) {
        listeners.add(listener);
        return () => {
          listeners.delete(listener);
        };
      },
      use(l) {
        if (l !== locale) {
          locale = l;
          for (const f of [...listeners]) f(l);
        }
      }
    };
  }

  // src/adapters/browser/i18n.ts
  function noemaI18n(runtime = () => globalThis.NoemaI18n) {
    const fallback = catalogI18n({});
    const listeners = /* @__PURE__ */ new Set();
    let hooked = null;
    const rt = () => {
      const r = runtime();
      if (r && hooked !== r) {
        hooked = r;
        r.onChange((l) => {
          for (const f of [...listeners]) f(l);
        });
      }
      return r;
    };
    const format = {
      number: (n, o) => rt()?.fmt.number(n, o) ?? fallback.format.number(n, o),
      percent: (x, o) => rt()?.fmt.percent(x, o) ?? fallback.format.percent(x, o),
      date: (d, o) => rt()?.fmt.date(d, o) ?? fallback.format.date(d, o),
      time: (d, o) => rt()?.fmt.time(d, o) ?? fallback.format.time(d, o),
      relative: (v, u) => rt()?.fmt.relative(v, u) ?? fallback.format.relative(v, u),
      list: (items, o) => rt()?.fmt.list([...items], o) ?? fallback.format.list(items, o),
      compare: (a, b) => rt()?.fmt.compare(a, b) ?? fallback.format.compare(a, b)
    };
    return {
      t: (key, params) => rt()?.t(key, params) ?? fallback.t(key, params),
      has: (key) => rt()?.has(key) ?? false,
      err: (e2) => rt()?.err(e2) ?? fallback.err(e2),
      plural: (n) => rt()?.fmt.plural(n) ?? fallback.plural(n),
      locale: () => rt()?.locale ?? "en",
      dir: () => rt()?.dir ?? "ltr",
      format,
      onChange(listener) {
        listeners.add(listener);
        rt();
        return () => {
          listeners.delete(listener);
        };
      }
    };
  }

  // src/ports/notifier.ts
  var NOTIFIER_RULES = Object.freeze({
    /** At most this many notices on screen at once. */
    maxNotices: 2,
    toastMs: 2400,
    noticeMs: 4e3,
    alertMs: 12e3
  });

  // src/adapters/local/notifier-policy.ts
  function policyNotifier(surface, options = {}) {
    const R = { ...NOTIFIER_RULES, ...options.rules };
    const now = options.now ?? Date.now;
    let shown = [];
    let burstUntil = 0;
    const listeners = /* @__PURE__ */ new Set();
    return {
      toast(text, o = {}) {
        surface.show(text, "toast", o.ms ?? R.toastMs);
      },
      notice(text, o = {}) {
        const ms = o.ms ?? R.noticeMs, at = now();
        shown = shown.filter((x) => x.toast.isShown());
        if (shown.length >= R.maxNotices || at < burstUntil) {
          const moved = shown.splice(0);
          for (const x of moved) x.toast.remove();
          burstUntil = at + ms;
          const items = [...moved.map((x) => ({ text: x.text, at: x.at })), { text, at }];
          for (const l of [...listeners]) l(items);
          return;
        }
        shown.push({ toast: surface.show(text, "notice", ms), text, at });
      },
      alert(text, o = {}) {
        surface.show(text, "alert", o.ms ?? R.alertMs);
        surface.announce(text);
      },
      onOverflow(listener) {
        listeners.add(listener);
        return () => {
          listeners.delete(listener);
        };
      }
    };
  }

  // src/adapters/browser/notifier.ts
  var LIVE_REGION_ID = "noema-alert";
  var HIDDEN = "position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap";
  function domSurface(doc = () => globalThis.document, timers = { setTimeout: (f, ms) => globalThis.setTimeout(f, ms), clearTimeout: (h) => globalThis.clearTimeout(h) }) {
    const box = (d) => {
      let t = d.querySelector(".toasts");
      if (!t) {
        t = d.createElement("div");
        t.className = "toasts";
        d.body?.append(t);
      }
      return t;
    };
    return {
      show(text, kind, ms) {
        const d = doc();
        if (!d?.body) return { remove() {
        }, isShown: () => false };
        const x = d.createElement("div");
        x.className = kind === "notice" ? "toast notice" : kind === "alert" ? "toast alert" : "toast";
        if (kind === "notice") x.setAttribute("role", "status");
        x.textContent = text;
        box(d).append(x);
        const h = timers.setTimeout(() => x.remove(), ms);
        return { remove: () => {
          timers.clearTimeout(h);
          x.remove();
        }, isShown: () => x.isConnected };
      },
      announce(text) {
        const d = doc();
        if (!d?.body) return;
        let live = d.getElementById(LIVE_REGION_ID);
        if (!live) {
          live = d.createElement("div");
          live.id = LIVE_REGION_ID;
          live.setAttribute("role", "alert");
          live.setAttribute("aria-live", "assertive");
          live.style.cssText = HIDDEN;
          d.body.append(live);
        }
        const region = live;
        region.textContent = "";
        timers.setTimeout(() => {
          region.textContent = text;
        }, 50);
      }
    };
  }
  var browserNotifier = (surface = domSurface(), options = {}) => policyNotifier(surface, options);

  // src/adapters/local/jobs.ts
  var DEFAULT_TIMEOUT_MS = 6e4;
  function createJobRegistry(initial = {}) {
    const jobs = new Map(Object.entries(initial));
    return {
      get: (name) => jobs.get(name),
      names: () => [...jobs.keys()].sort(),
      register(name, handler) {
        if (jobs.has(name)) throw new NoemaError("invariant.failed", "a job is registered twice: " + name);
        jobs.set(name, handler);
      }
    };
  }
  function coreJobs() {
    return { "core.ping": (input) => ({ pong: input }) };
  }
  var timeoutError = (job, ms) => new NoemaError("compute.timeout", `the job ${job} took longer than ${ms} ms`, { params: { job, ms }, retryable: true });
  var cancelledError = (job) => new NoemaError("compute.cancelled", `the job ${job} was cancelled`, { params: { job } });
  var unknownJobError = (job) => new NoemaError("compute.unknown_job", "no such job: " + job, { params: { job } });
  var failedError = (job, thrown) => thrown instanceof NoemaError ? thrown : new NoemaError("compute.failed", `the job ${job} failed: ${thrown instanceof Error ? thrown.message : String(thrown)}`, { params: { job }, cause: thrown });
  function inlineCompute(registry, options = {}) {
    const st = options.setTimeout ?? ((f, ms) => globalThis.setTimeout(f, ms));
    const ct = options.clearTimeout ?? ((h) => globalThis.clearTimeout(h));
    const running = /* @__PURE__ */ new Set();
    return {
      run(job, input, o = {}) {
        const handler = registry.get(job);
        if (!handler) return Promise.resolve(err(unknownJobError(job)));
        if (o.signal?.aborted) return Promise.resolve(err(cancelledError(job)));
        const ms = o.timeoutMs ?? options.defaultTimeoutMs ?? DEFAULT_TIMEOUT_MS;
        const ac = new AbortController();
        running.add(ac);
        return new Promise((resolve) => {
          let settled = false;
          const finish = (r) => {
            if (settled) return;
            settled = true;
            ct(timer);
            o.signal?.removeEventListener("abort", onCancel);
            running.delete(ac);
            resolve(r);
          };
          const onCancel = () => {
            ac.abort(cancelledError(job));
            finish(err(cancelledError(job)));
          };
          const timer = st(() => {
            ac.abort(timeoutError(job, ms));
            finish(err(timeoutError(job, ms)));
          }, ms);
          o.signal?.addEventListener("abort", onCancel, { once: true });
          ac.signal.addEventListener("abort", () => finish(err(ac.signal.reason instanceof NoemaError ? ac.signal.reason : cancelledError(job))), { once: true });
          const ctx = { signal: ac.signal, progress: (p) => {
            if (!settled) o.onProgress?.(p);
          } };
          Promise.resolve().then(() => handler(structuredClone(input), ctx)).then((v) => finish(ok(v)), (e2) => finish(err(failedError(job, e2))));
        });
      },
      dispose() {
        for (const ac of [...running]) ac.abort(new NoemaError("compute.cancelled", "the compute service was stopped"));
      }
    };
  }

  // src/adapters/browser/compute.ts
  function workerCompute(o) {
    const max = Math.max(1, o.maxWorkers ?? 2);
    const slots = [];
    const waiting = [];
    const active = /* @__PURE__ */ new Set();
    let nextId = 1, broken = false;
    const spawn = () => {
      try {
        const s = { worker: o.createWorker(), busy: false };
        slots.push(s);
        return ok(s);
      } catch (e2) {
        broken = true;
        const ne = new NoemaError("compute.unavailable", "no Worker can start here: jobs run on the main thread", { cause: e2 });
        o.onUnavailable?.(ne);
        return err(ne);
      }
    };
    const drop = (s) => {
      s.worker.terminate();
      const i = slots.indexOf(s);
      if (i >= 0) slots.splice(i, 1);
      waiting.shift()?.();
    };
    const release = (s) => {
      s.busy = false;
      s.worker.onmessage = null;
      s.worker.onerror = null;
      waiting.shift()?.();
    };
    const acquire = async () => {
      for (; ; ) {
        const idle = slots.find((s) => !s.busy);
        if (idle) {
          idle.busy = true;
          return ok(idle);
        }
        if (slots.length < max) {
          const s = spawn();
          if (s.ok) s.value.busy = true;
          return s;
        }
        await new Promise((r) => waiting.push(r));
      }
    };
    return {
      async run(job, input, ro = {}) {
        if (broken) return o.fallback.run(job, input, ro);
        if (ro.signal?.aborted) return err(cancelledError(job));
        const got = await acquire();
        if (!got.ok) return o.fallback.run(job, input, ro);
        const slot = got.value, id = nextId++;
        const ms = ro.timeoutMs ?? o.defaultTimeoutMs ?? DEFAULT_TIMEOUT_MS;
        return new Promise((resolve) => {
          let done = false;
          const finish = (r, kill) => {
            if (done) return;
            done = true;
            active.delete(onAbort);
            clearTimeout(timer);
            ro.signal?.removeEventListener("abort", onAbort);
            if (kill) drop(slot);
            else release(slot);
            resolve(r);
          };
          const onAbort = () => finish(err(cancelledError(job)), true);
          const timer = setTimeout(() => finish(err(timeoutError(job, ms)), true), ms);
          ro.signal?.addEventListener("abort", onAbort, { once: true });
          active.add(onAbort);
          slot.worker.onmessage = ({ data }) => {
            if (data.id !== id) return;
            if (data.t === "progress") ro.onProgress?.(data.progress);
            else if (data.t === "done") finish(ok(data.value), false);
            else finish(err(NoemaError.fromInfo(data.error, "compute.failed")), false);
          };
          slot.worker.onerror = (ev) => finish(err(new NoemaError("compute.failed", `the Worker of ${job} stopped: ${ev.message ?? "error"}`, { params: { job } })), true);
          try {
            slot.worker.postMessage({ t: "run", id, job, input });
          } catch (e2) {
            finish(err(new NoemaError("compute.failed", `the input of ${job} cannot be sent to a Worker`, { cause: e2, params: { job } })), false);
          }
        });
      },
      dispose() {
        for (const cancel of [...active]) cancel();
        for (const s of [...slots]) drop(s);
        o.fallback.dispose();
      }
    };
  }

  // src/adapters/local/error-reporter.ts
  var NOTICE_KEYS = Object.freeze({
    "storage.quota": "loader.storage.full"
  });
  var JOURNAL_KEY = "noema-device:errors";
  var rank = (s) => SEVERITIES.indexOf(s);
  function cleanContext(c) {
    if (!c) return null;
    const out = {};
    for (const [k, v] of Object.entries(c)) if (v === null || ["string", "number", "boolean"].includes(typeof v)) out[k] = typeof v === "string" ? v.slice(0, 300) : v;
    return out;
  }
  function createErrorReporter(deps = {}) {
    const now = deps.now ?? Date.now;
    const max = deps.maxEntries ?? 200;
    const key = deps.journalKey ?? JOURNAL_KEY;
    const out = deps.console ?? globalThis.console;
    const listeners = /* @__PURE__ */ new Set();
    const lastNotice = /* @__PURE__ */ new Map();
    let entries = [];
    let busy = false;
    if (deps.journalStore) {
      const raw = deps.journalStore.get(key);
      if (raw.ok && raw.value) {
        try {
          const parsed = JSON.parse(raw.value);
          if (Array.isArray(parsed)) entries = parsed.slice(-max);
        } catch (e2) {
          entries = [entry(new NoemaError("storage.corrupt", "the error journal was not readable and starts again", { cause: e2 }), { where: "errors.journal", severity: "warning" })];
        }
      }
    }
    function entry(e2, o) {
      return Object.freeze({
        at: now(),
        code: e2.code,
        message: e2.message.slice(0, 1e3),
        params: e2.params,
        severity: o.severity ?? "error",
        where: o.where ?? null,
        context: cleanContext(o.context),
        stack: typeof e2.stack === "string" ? e2.stack.split("\n").slice(0, 6).join("\n") : null
      });
    }
    const save = () => {
      if (!deps.journalStore) return;
      deps.journalStore.set(key, JSON.stringify(entries));
    };
    function tell(e2, severity) {
      const { notifier, i18n } = deps;
      if (!notifier) return;
      const at = now(), last = lastNotice.get(e2.code);
      if (last !== void 0 && at - last < (deps.noticeEveryMs ?? 6e4)) return;
      lastNotice.set(e2.code, at);
      const k = NOTICE_KEYS[e2.code];
      const text = i18n ? k ? i18n.t(k) : i18n.err(e2) : e2.message;
      if (rank(severity) >= rank("error")) notifier.alert("\u26A0\uFE0F " + text);
      else notifier.toast(text);
    }
    const reporter = {
      report(thrown, o = {}) {
        const e2 = NoemaError.from(thrown);
        const severity = o.severity ?? "error";
        const x = entry(e2, o);
        entries.push(x);
        if (entries.length > max) entries = entries.slice(-max);
        if (busy) return x;
        busy = true;
        try {
          save();
          const line = `[noema] ${x.where ?? "error"}: ${e2.code}: ${e2.message}`;
          if (severity === "debug") out.debug(line);
          else if (severity === "info") out.info(line);
          else if (severity === "warning") out.warn(line, thrown);
          else out.error(line, thrown);
          deps.telemetry?.count("error." + e2.code);
          if (o.notify) tell(e2, severity);
          for (const l of [...listeners]) {
            try {
              l(x);
            } catch (le) {
              out.error("[noema] an error-journal listener failed", le);
            }
          }
        } finally {
          busy = false;
        }
        return x;
      },
      catcher(where, o = {}) {
        return (thrown) => {
          reporter.report(thrown, { ...o, where });
          return void 0;
        };
      },
      journal: () => [...entries],
      clearJournal() {
        entries = [];
        save();
      },
      onReport(listener) {
        listeners.add(listener);
        return () => {
          listeners.delete(listener);
        };
      }
    };
    return reporter;
  }

  // src/adapters/local/telemetry.ts
  var TELEMETRY_KEY = "noema-device:telemetry";
  function localTelemetry(o = {}) {
    const now = o.now ?? Date.now, max = o.maxEvents ?? 100, key = o.key ?? TELEMETRY_KEY;
    const st = o.setTimeout ?? ((f, ms) => typeof globalThis.setTimeout === "function" ? globalThis.setTimeout(f, ms) : f());
    let counters = {};
    let events = [];
    let pending = false;
    if (o.store) {
      const raw = o.store.get(key);
      if (raw.ok && raw.value) {
        try {
          const p = JSON.parse(raw.value);
          counters = { ...p.counters ?? {} };
          events = Array.isArray(p.events) ? p.events.slice(-max) : [];
        } catch {
          counters = {};
        }
      }
    }
    const save = () => {
      if (!o.store || pending) return;
      pending = true;
      st(() => {
        pending = false;
        o.store?.set(key, JSON.stringify({ counters, events }));
      }, o.saveEveryMs ?? 2e3);
    };
    return {
      count(name, by = 1) {
        counters[name] = (counters[name] ?? 0) + by;
        save();
      },
      event(name, data = {}) {
        events.push(Object.freeze({ at: now(), name, data: { ...data } }));
        if (events.length > max) events = events.slice(-max);
        save();
      },
      snapshot: () => ({ counters: { ...counters }, events: [...events] }),
      reset() {
        counters = {};
        events = [];
        save();
      }
    };
  }

  // src/adapters/local/http.ts
  async function* sseData(body, signal) {
    const reader = body.getReader();
    const dec = new TextDecoder();
    let buf = "";
    const flush = function* (final) {
      buf = buf.replace(/\r\n/g, "\n");
      let i;
      while ((i = buf.indexOf("\n\n")) >= 0 || final && buf.trim() && (i = buf.length) >= 0) {
        const event = buf.slice(0, i);
        buf = buf.slice(i + 2);
        const data = event.split("\n").filter((l) => l.startsWith("data:")).map((l) => l.slice(5).replace(/^ /, "")).join("\n");
        if (data) yield data;
        if (final && !buf.trim()) break;
      }
    };
    try {
      for (; ; ) {
        if (signal?.aborted) throw signal.reason;
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        yield* flush(false);
      }
      buf += dec.decode();
      yield* flush(true);
    } finally {
      reader.releaseLock();
    }
  }
  function backoffMs(attempt, retryAfter, baseMs = 2e3, capMs = 6e4) {
    const ra = Number(retryAfter);
    return ra > 0 ? Math.min(ra * 1e3, capMs) : Math.min(capMs, baseMs * 2 ** attempt);
  }
  var realSleep = (ms, signal) => new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(signal.reason);
    const h = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(h);
      reject(signal?.reason);
    };
    signal?.addEventListener("abort", onAbort, { once: true });
  });

  // src/adapters/claude/index.ts
  var CLAUDE_API_VERSION = "2023-06-01";
  function claudeError(status, type, message) {
    const m = message;
    const e2 = (msg, code, params = {}, retryable = false) => new NoemaError(code, msg, { params, status, retryable });
    if (status === 400 && /tool_choice|forced tool|not supported for this model|does not support tools/i.test(m)) return e2(m, "ai.unsupported", { detail: m });
    if (status === 401) return e2("The key was not accepted \u2014 check that you copied all of it (it starts with sk-ant-), or create a new one.", "ai.unauthorized");
    if (status === 403) return e2("This key is not allowed to do that (" + m + "). Use a key from your own workspace.", "ai.forbidden", { detail: m });
    if (/credit balance|billing|purchase credits/i.test(m)) return e2("Your Claude API account has no credit left. Add credit: platform.claude.com \u2192 Settings \u2192 Billing.", "ai.no_credit");
    if (status === 413) return e2("A file is too big for the Claude API (" + m + "). Split the PDF or attach fewer files.", "ai.too_large", { detail: m });
    if (status === 429) return e2("Too many requests or the spending limit was reached \u2014 waiting and trying again\u2026 (" + m + ")", "ai.rate_limited", { detail: m }, true);
    if (status === 529 || type === "overloaded_error") return e2("Claude is busy right now \u2014 trying again\u2026", "ai.overloaded", {}, true);
    return m ? e2(m, "ai.api", { status, detail: m }, status >= 500) : e2("HTTP " + status, "ai.http", { status }, status >= 500);
  }
  var aborted = () => new NoemaError("ai.aborted", "Stopped.");
  var noKey = () => new NoemaError("ai.no_key.device", "No Claude API key on this device.");
  function toBlock(p) {
    switch (p.type) {
      case "text":
        return { type: "text", text: p.text };
      case "image":
        return { type: "image", source: { type: "base64", media_type: p.mediaType, data: p.data } };
      case "document":
        return { type: "document", source: { type: "base64", media_type: p.mediaType, data: p.data }, ...p.title ? { title: p.title } : {} };
      case "tool_call":
        return { type: "tool_use", id: p.id, name: p.name, input: p.input };
      case "tool_result":
        return { type: "tool_result", tool_use_id: p.callId, content: p.content, ...p.isError ? { is_error: true } : {} };
    }
  }
  function claudeBody(r, model) {
    const jsonRule = r.json ? `

Answer with exactly one JSON value (no prose, no code fence)${r.jsonSchema ? ` that matches this JSON Schema:
${JSON.stringify(r.jsonSchema)}` : "."}` : "";
    const system = (r.system ?? "") + jsonRule;
    const body = {
      model,
      max_tokens: r.maxTokens ?? 16e3,
      stream: true,
      messages: r.messages.map((m) => ({ role: m.role, content: m.content.map(toBlock) }))
    };
    if (system) body["system"] = [{ type: "text", text: system, cache_control: { type: "ephemeral" } }];
    if (r.temperature !== void 0) body["temperature"] = r.temperature;
    if (r.tools?.length) body["tools"] = r.tools.map((t) => ({ name: t.name, description: t.description, input_schema: t.inputSchema }));
    if (r.toolChoice && r.tools?.length) {
      const c = r.toolChoice;
      body["tool_choice"] = typeof c === "object" ? { type: "tool", name: c.tool } : { type: c };
    }
    return body;
  }
  var STOPS = { end_turn: "end", stop_sequence: "end", max_tokens: "max_tokens", tool_use: "tool_call", refusal: "refused", pause_turn: "other" };
  async function readStream(res, r, model) {
    if (!res.body) throw new NoemaError("ai.api", "Claude sent an empty answer", { params: { status: res.status, detail: "empty body" } });
    const drafts = [];
    const usage = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 };
    let stop = "other", seenModel = model;
    for await (const data of sseData(res.body, r.signal)) {
      let d;
      try {
        d = JSON.parse(data);
      } catch {
        continue;
      }
      const t = d["type"];
      if (t === "message_start") {
        const m = d["message"];
        if (m?.model) seenModel = m.model;
        usage.input += m?.usage?.["input_tokens"] ?? 0;
        usage.cacheRead += m?.usage?.["cache_read_input_tokens"] ?? 0;
        usage.cacheWrite += m?.usage?.["cache_creation_input_tokens"] ?? 0;
        usage.output += m?.usage?.["output_tokens"] ?? 0;
      } else if (t === "content_block_start") {
        const b = d["content_block"];
        drafts[d["index"]] = { kind: b?.type === "text" ? "text" : b?.type === "tool_use" ? "tool" : "other", text: b?.text ?? "", id: b?.id ?? "", name: b?.name ?? "", json: "" };
      } else if (t === "content_block_delta") {
        const x = drafts[d["index"]], delta = d["delta"];
        if (!x || !delta) continue;
        if (delta.type === "text_delta" && delta.text) {
          x.text += delta.text;
          r.onDelta?.({ type: "text", text: delta.text });
        } else if (delta.type === "input_json_delta" && delta.partial_json) {
          x.json += delta.partial_json;
          r.onDelta?.({ type: "tool_input", callId: x.id, name: x.name, partialJson: delta.partial_json });
        }
      } else if (t === "message_delta") {
        const delta = d["delta"], u = d["usage"];
        if (delta?.stop_reason) stop = STOPS[delta.stop_reason] ?? "other";
        if (u?.output_tokens) usage.output = Math.max(usage.output, u.output_tokens);
      } else if (t === "error") {
        const e2 = d["error"];
        throw claudeError(0, e2?.type ?? "", e2?.message ?? "stream error");
      }
    }
    const content = [], toolCalls = [];
    for (const x of drafts) {
      if (!x) continue;
      if (x.kind === "text" && x.text) content.push({ type: "text", text: x.text });
      if (x.kind === "tool") {
        let input;
        try {
          input = x.json ? JSON.parse(x.json) : {};
        } catch (e2) {
          if (stop === "max_tokens") {
            input = null;
          } else throw new NoemaError("ai.not_json", "The answer was not valid JSON.", { cause: e2 });
        }
        content.push({ type: "tool_call", id: x.id, name: x.name, input });
        toolCalls.push({ id: x.id, name: x.name, input });
      }
    }
    const text = content.flatMap((p) => p.type === "text" ? [p.text] : []).join("");
    return { provider: "claude", model: seenModel, content, text, toolCalls, stop, usage };
  }
  function claudeAI(o) {
    const base = (o.baseUrl ?? "https://api.anthropic.com").replace(/\/+$/, "");
    const sleep = o.sleep ?? realSleep, maxRetries = o.maxRetries ?? 5;
    const headers = (json) => ({ "x-api-key": o.apiKey, "anthropic-version": CLAUDE_API_VERSION, "anthropic-dangerous-direct-browser-access": "true", ...json ? { "content-type": "application/json" } : {} });
    async function withRetries(signal, attempt) {
      for (let n = 0; ; n++) {
        if (signal?.aborted) return err(aborted());
        try {
          return ok(await attempt(n));
        } catch (e2) {
          if (signal?.aborted) return err(aborted());
          const ne = e2 instanceof NoemaError ? e2 : new NoemaError("ai.network", `No connection to Claude (${e2 instanceof Error ? e2.message : String(e2)}). Check the internet connection and press Resume.`, { params: { detail: e2 instanceof Error ? e2.message : String(e2) }, cause: e2, retryable: true });
          if (!ne.retryable || n >= maxRetries) return err(ne);
          try {
            await sleep(ne.code === "ai.network" ? Math.min(3e4, 1500 * 2 ** n) : backoffMs(n, ne.params["retryAfter"] ?? null), signal);
          } catch {
            return err(aborted());
          }
        }
      }
    }
    async function failure(res) {
      let type = "", msg = "";
      try {
        const j = await res.json();
        type = j.error?.type ?? "";
        msg = j.error?.message ?? "";
      } catch {
        msg = "";
      }
      const e2 = claudeError(res.status, type, msg);
      const ra = res.headers.get("retry-after");
      return ra && e2.retryable ? new NoemaError(e2.code, e2.message, { params: { ...e2.params, retryAfter: ra }, status: res.status, retryable: true }) : e2;
    }
    let chosen = null;
    const modelFor = async (r) => {
      if (r.model) return ok(r.model);
      if (o.defaultModel) return ok(o.defaultModel);
      const pick = chosen ??= ai.models().then((ms) => {
        if (!ms.ok) {
          chosen = null;
          return ms;
        }
        const id = (ms.value.find((m) => /sonnet/i.test(m.id)) ?? ms.value[0])?.id;
        return id ? ok(id) : err(new NoemaError("ai.api", "this key can use no model", { params: { status: 0, detail: "no models" } }));
      });
      return pick;
    };
    const ai = {
      provider: "claude",
      async chat(r) {
        if (!o.apiKey) return err(noKey());
        const m = await modelFor(r);
        if (!m.ok) return m;
        const model = m.value;
        const body = JSON.stringify(claudeBody(r, model));
        return withRetries(r.signal, async () => {
          const res = await o.fetch(base + "/v1/messages", { method: "POST", headers: headers(true), body, ...r.signal ? { signal: r.signal } : {} });
          if (!res.ok) throw await failure(res);
          return readStream(res, r, model);
        });
      },
      async models() {
        if (!o.apiKey) return err(noKey());
        return withRetries(void 0, async () => {
          const res = await o.fetch(base + "/v1/models?limit=100", { method: "GET", headers: headers(false) });
          if (!res.ok) throw await failure(res);
          const j = await res.json();
          return (j.data ?? []).map((m) => ({ id: m.id, name: m.display_name ?? m.id }));
        });
      }
    };
    return ai;
  }

  // src/adapters/gemini/index.ts
  var GEMINI_DEFAULT_MODEL = "gemini-flash-latest";
  function geminiModelScore(name) {
    const n = name.replace(/^models\//, "");
    if (/(image|tts|audio|live|embed|aqa|gemma|robotics|computer|native|veo|imagen|learnlm|nano|banana|thinking-exp|research|deep)/i.test(n)) return -1;
    if (!/gemini/i.test(n)) return -1;
    let s = 0;
    const v = /gemini-(\d+(?:\.\d+)?)/.exec(n);
    if (v?.[1]) s += parseFloat(v[1]) * 100;
    else if (/latest/.test(n)) s += 240;
    if (/flash/.test(n)) s += 60;
    if (/lite/.test(n)) s -= 45;
    if (/pro/.test(n)) s += 20;
    if (/preview|exp/.test(n)) s -= 8;
    if (/\d{2}-\d{2}|\d{3}$/.test(n)) s -= 3;
    return s;
  }
  function thinkingFor(model) {
    if (/gemini-3/.test(model)) return { thinkingLevel: "low" };
    if (/2\.5-flash/.test(model)) return { thinkingBudget: 0 };
    if (/2\.5-pro/.test(model)) return { thinkingBudget: 128 };
    return null;
  }
  var e = (msg, code, params = {}, status, retryable = false) => new NoemaError(code, msg, { params, retryable, ...status === void 0 ? {} : { status } });
  function geminiError(status, text) {
    if (status === 429) return e("Gemini\u2019s free quota is used up for now (429) \u2014 wait a minute or use Claude.", "ai.quota", {}, status, true);
    if (status === 400 && /function calling|tools? (is|are) not supported/i.test(text)) return e(text.slice(0, 200), "ai.unsupported", { detail: text.slice(0, 200) }, status);
    return e(`Gemini ${status}: ${text.slice(0, 200)}`, "ai.api_gemini", { status, detail: text.slice(0, 200) }, status, status >= 500);
  }
  var networkError = (cause) => {
    const detail = cause instanceof Error ? cause.message : String(cause);
    return new NoemaError("ai.no_connection", "No connection to Gemini: " + detail, { params: { provider: "Gemini", detail }, cause, retryable: true });
  };
  var aborted2 = () => e("Stopped.", "ai.aborted");
  var SCHEMA_KEYS = /* @__PURE__ */ new Set(["type", "format", "description", "nullable", "enum", "properties", "required", "items", "minItems", "maxItems", "minimum", "maximum", "minLength", "maxLength", "pattern", "anyOf", "propertyOrdering", "title"]);
  function geminiSchema(s) {
    if (Array.isArray(s)) return s.map(geminiSchema);
    if (!s || typeof s !== "object") return s;
    const out = {};
    for (const [k, v] of Object.entries(s)) {
      if (!SCHEMA_KEYS.has(k)) continue;
      if (k === "properties" && v && typeof v === "object" && !Array.isArray(v)) out[k] = Object.fromEntries(Object.entries(v).map(([p, x]) => [p, geminiSchema(x)]));
      else out[k] = k === "items" || k === "anyOf" ? geminiSchema(v) : v;
    }
    return out;
  }
  function toPart(p) {
    switch (p.type) {
      case "text":
        return { text: p.text };
      case "image":
      case "document":
        return { inlineData: { mimeType: p.mediaType, data: p.data } };
      case "tool_call":
        return { functionCall: { name: p.name, args: p.input } };
      case "tool_result":
        return { functionResponse: { name: p.name, response: { content: p.content, ...p.isError ? { isError: true } : {} } } };
    }
  }
  function geminiBody(r, model, thinking) {
    const gc = { maxOutputTokens: r.maxTokens ?? 65536 };
    if (r.temperature !== void 0) gc["temperature"] = r.temperature;
    if (r.json) {
      gc["responseMimeType"] = "application/json";
      if (r.jsonSchema) gc["responseSchema"] = geminiSchema(r.jsonSchema);
    }
    const th = thinking ? thinkingFor(model) : null;
    if (th) gc["thinkingConfig"] = th;
    const body = { contents: r.messages.map((m) => ({ role: m.role === "assistant" ? "model" : "user", parts: m.content.map(toPart) })), generationConfig: gc };
    if (r.system) body["systemInstruction"] = { parts: [{ text: r.system }] };
    if (r.tools?.length) {
      body["tools"] = [{ functionDeclarations: r.tools.map((t) => ({ name: t.name, description: t.description, parameters: geminiSchema(t.inputSchema) })) }];
      const c = r.toolChoice ?? "auto";
      body["toolConfig"] = { functionCallingConfig: typeof c === "object" ? { mode: "ANY", allowedFunctionNames: [c.tool] } : { mode: c === "any" ? "ANY" : c === "none" ? "NONE" : "AUTO" } };
    }
    return body;
  }
  var STOPS2 = { STOP: "end", MAX_TOKENS: "max_tokens", SAFETY: "refused", RECITATION: "refused", PROHIBITED_CONTENT: "refused", BLOCKLIST: "refused", SPII: "refused" };
  var Answer = class {
    text = "";
    calls = [];
    finish = null;
    blocked = false;
    usage = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 };
    model;
    r;
    constructor(model, r) {
      this.model = model;
      this.r = r;
    }
    add(c) {
      const cand = c.candidates?.[0];
      for (const p of cand?.content?.parts ?? []) {
        if (p.thought) continue;
        if (p.text) {
          this.text += p.text;
          this.r.onDelta?.({ type: "text", text: p.text });
        }
        if (p.functionCall) {
          const id = "call_" + this.calls.length, input = p.functionCall.args ?? {};
          this.calls.push({ id, name: p.functionCall.name, input });
          this.r.onDelta?.({ type: "tool_input", callId: id, name: p.functionCall.name, partialJson: JSON.stringify(input) });
        }
      }
      if (cand?.finishReason) this.finish = cand.finishReason;
      if (c.promptFeedback?.blockReason) this.blocked = true;
      if (c.modelVersion) this.model = c.modelVersion;
      const u = c.usageMetadata;
      if (u) this.usage = { input: u.promptTokenCount ?? 0, output: (u.candidatesTokenCount ?? 0) + (u.thoughtsTokenCount ?? 0), cacheRead: u.cachedContentTokenCount ?? 0, cacheWrite: 0 };
    }
    done() {
      const content = [...this.text ? [{ type: "text", text: this.text }] : [], ...this.calls.map((c) => ({ type: "tool_call", ...c }))];
      const stop = this.blocked ? "refused" : this.calls.length ? "tool_call" : STOPS2[this.finish ?? ""] ?? "other";
      return { provider: "gemini", model: this.model, content, text: this.text, toolCalls: this.calls, stop, usage: this.usage };
    }
  };
  function geminiAI(o) {
    const base = (o.baseUrl ?? "https://generativelanguage.googleapis.com/v1beta").replace(/\/+$/, "");
    const sleep = o.sleep ?? realSleep, maxRetries = o.maxRetries ?? 5;
    const noThinking = /* @__PURE__ */ new Set();
    const headers = { "content-type": "application/json", "x-goog-api-key": o.apiKey };
    return {
      provider: "gemini",
      async chat(r) {
        if (!o.apiKey) return err(e("No Gemini key (\u2699\uFE0F Settings).", "ai.no_key.gemini"));
        const model = r.model ?? o.defaultModel ?? GEMINI_DEFAULT_MODEL;
        const stream = !!r.onDelta;
        const url = `${base}/models/${encodeURIComponent(model)}:${stream ? "streamGenerateContent?alt=sse" : "generateContent"}`;
        for (let n = 0; ; n++) {
          if (r.signal?.aborted) return err(aborted2());
          let res;
          try {
            res = await o.fetch(url, { method: "POST", headers, body: JSON.stringify(geminiBody(r, model, !noThinking.has(model))), ...r.signal ? { signal: r.signal } : {} });
          } catch (x) {
            if (r.signal?.aborted) return err(aborted2());
            if (n >= maxRetries - 1) return err(networkError(x));
            try {
              await sleep(1500 * 2 ** n, r.signal);
            } catch {
              return err(aborted2());
            }
            continue;
          }
          if (!res.ok) {
            const t = await res.text().catch(() => "");
            if (res.status === 400 && /thinking/i.test(t) && !noThinking.has(model) && thinkingFor(model)) {
              noThinking.add(model);
              n--;
              continue;
            }
            const ge = geminiError(res.status, t);
            if (ge.retryable && n < maxRetries) {
              try {
                await sleep(backoffMs(n, res.headers.get("retry-after"), 4e3), r.signal);
              } catch {
                return err(aborted2());
              }
              continue;
            }
            return err(ge);
          }
          const a = new Answer(model, r);
          try {
            if (stream && res.body) {
              for await (const data of sseData(res.body, r.signal)) {
                let c;
                try {
                  c = JSON.parse(data);
                } catch {
                  continue;
                }
                a.add(c);
              }
            } else a.add(await res.json());
          } catch (x) {
            if (r.signal?.aborted) return err(aborted2());
            if (n < maxRetries - 1) continue;
            return err(networkError(x));
          }
          return ok(a.done());
        }
      },
      async models() {
        if (!o.apiKey) return err(e("No Gemini key (\u2699\uFE0F Settings).", "ai.no_key.gemini"));
        let res;
        try {
          res = await o.fetch(`${base}/models?pageSize=1000`, { method: "GET", headers: { "x-goog-api-key": o.apiKey } });
        } catch (x) {
          return err(networkError(x));
        }
        if (!res.ok) return err(geminiError(res.status, await res.text().catch(() => "")));
        const d = await res.json();
        return ok((d.models ?? []).filter((m) => (m.supportedGenerationMethods ?? []).includes("generateContent")).map((m) => ({ id: m.name.replace(/^models\//, ""), name: m.displayName ?? m.name.replace(/^models\//, "") })).filter((m) => geminiModelScore(m.id) >= 0).sort((a, b) => geminiModelScore(b.id) - geminiModelScore(a.id)));
      }
    };
  }

  // src/adapters/supabase/errors.ts
  var AUTH = {
    invalid_credentials: "auth.invalid_credentials",
    email_not_confirmed: "auth.email_not_confirmed",
    user_already_exists: "auth.user_already_exists",
    email_exists: "auth.email_exists",
    over_email_send_rate_limit: "auth.email_rate_limit",
    over_request_rate_limit: "auth.rate_limit",
    otp_expired: "auth.otp_expired",
    email_address_invalid: "auth.email_invalid",
    signup_disabled: "auth.signup_disabled",
    email_provider_disabled: "auth.signup_disabled",
    user_banned: "auth.user_banned",
    user_not_found: "auth.user_not_found",
    same_password: "auth.same_password",
    email_address_not_authorized: "auth.email_not_authorized",
    captcha_failed: "auth.captcha_failed",
    refresh_token_not_found: "auth.session_expired",
    refresh_token_already_used: "auth.session_expired",
    session_not_found: "auth.session_expired",
    session_expired: "auth.session_expired",
    bad_jwt: "auth.session_expired",
    no_authorization: "auth.session_expired"
  };
  var AUTH_MSG = [
    [/invalid login credentials/i, "invalid_credentials"],
    [/email not confirmed/i, "email_not_confirmed"],
    [/already (been )?registered/i, "user_already_exists"],
    [/password should|weak password/i, "weak_password"],
    [/email rate limit/i, "over_email_send_rate_limit"],
    [/rate limit/i, "over_request_rate_limit"],
    [/expired or is invalid|invalid or has expired/i, "otp_expired"],
    [/refresh token/i, "refresh_token_not_found"],
    [/signups? not allowed/i, "signup_disabled"],
    [/unable to validate email|email address .* is invalid/i, "email_address_invalid"],
    [/invalid jwt|jwt expired/i, "bad_jwt"]
  ];
  function serverMessage(body, status) {
    const o = body && typeof body === "object" ? body : {};
    for (const k of ["msg", "message", "error_description", "error"]) if (typeof o[k] === "string" && o[k]) return o[k];
    return typeof body === "string" && body ? body.slice(0, 300) : `HTTP ${status}`;
  }
  function classify(path, body, status, message) {
    const o = body && typeof body === "object" ? body : {};
    const oc = typeof o["code"] === "string" ? o["code"] : "";
    if (/^\/auth\/v1\//.test(path)) {
      let ec = typeof o["error_code"] === "string" ? o["error_code"] : oc || null;
      if (!(ec && ec in AUTH) && ec !== "weak_password") {
        const hit = AUTH_MSG.find(([re]) => re.test(message));
        ec = hit ? hit[1] : ec;
      }
      if (ec === "weak_password") {
        const min = Number((/at least (\d+) characters/i.exec(message) ?? [])[1]);
        return min ? ["auth.weak_password", { min }] : ["auth.weak_password_other", {}];
      }
      const mapped = ec ? AUTH[ec] : void 0;
      if (mapped) return [mapped, {}];
      if (status === 429) return ["auth.rate_limit", {}];
      if (status >= 500) return ["auth.server", { status }];
      return ["auth.unknown", { status, detail: message }];
    }
    if (/PGRST205|42P01/.test(oc) || /schema cache|does not exist|Bucket not found/i.test(message)) return ["cloud.schema_old", {}];
    if (status === 401 || /\bJWT\b/i.test(message)) return ["auth.session_expired", {}];
    if (oc === "42501" || status === 403 || /row-level security/i.test(message)) return ["cloud.permission", {}];
    if (status === 413 || /maximum allowed size|payload too large/i.test(message)) return ["cloud.too_large", {}];
    if (status === 429) return ["cloud.rate_limit", {}];
    if (status >= 500) return ["cloud.server", { status }];
    return ["cloud.unknown", { status, detail: message }];
  }
  var RETRYABLE = /* @__PURE__ */ new Set(["cloud.rate_limit", "cloud.server", "auth.rate_limit", "auth.server", "cloud.network", "auth.network"]);
  function failedAnswer(path, body, status) {
    const message = serverMessage(body, status), [code, params] = classify(path, body, status, message);
    return new NoemaError(code, message, { params, status, retryable: RETRYABLE.has(code) });
  }
  function networkError2(path, cause) {
    const detail = cause instanceof Error ? cause.message : String(cause);
    return new NoemaError(/^\/auth\//.test(path) ? "auth.network" : "cloud.network", `Network error \u2014 are you offline? (${detail})`, { params: { detail }, cause, retryable: true });
  }
  var notSignedIn = () => new NoemaError("auth.not_signed_in", "Not signed in");

  // src/adapters/supabase/auth.ts
  var str = (x) => typeof x === "string" && x ? x : null;
  function toUser(u) {
    const m = u.user_metadata ?? {};
    return Object.freeze({ id: u.id, email: u.email, name: str(m["name"]) ?? str(m["full_name"]), locale: str(m["locale"]) });
  }
  var toSession = (s) => Object.freeze({ user: toUser(s.user), expiresAt: s.expires_at * 1e3 });
  function supabaseAuth(client) {
    const listeners = /* @__PURE__ */ new Set();
    const emit = (e2) => {
      for (const l of [...listeners]) l(e2);
    };
    client.onSession = (s, why) => {
      if (s && why === "signed_in") emit({ type: "signed_in", session: toSession(s) });
      else if (s && why === "refreshed") emit({ type: "refreshed", session: toSession(s) });
      else if (!s) emit({ type: "signed_out", reason: why === "expired" ? "expired" : "user" });
    };
    const signedIn = (body) => {
      const s = client.setSession(body, "signed_in");
      return s ? ok(toSession(s)) : err(notSignedIn());
    };
    return {
      session() {
        const s = client.session();
        return s ? toSession(s) : null;
      },
      async signIn(email, password) {
        const r = await client.call("/auth/v1/token?grant_type=password", { method: "POST", auth: false, body: { email, password } });
        return r.ok ? signedIn(r.value.body) : r;
      },
      async signUp(input) {
        const data = {};
        if (input.name) data["name"] = input.name;
        if (input.locale) data["locale"] = input.locale;
        const r = await client.call("/auth/v1/signup", { method: "POST", auth: false, body: { email: input.email, password: input.password, data } });
        if (!r.ok) return r;
        const body = r.value.body;
        if (!body || typeof body.access_token !== "string") return ok(null);
        return signedIn(body);
      },
      async signOut() {
        if (client.session()) {
          await client.call("/auth/v1/logout", { method: "POST" });
        }
        client.setSession(null, "signed_out");
        return OK_VOID;
      },
      async refresh() {
        const s = client.session();
        if (!s) return err(notSignedIn());
        const r = await client.fresh();
        return r.ok ? ok(toSession(r.value)) : r;
      },
      onChange(listener) {
        listeners.add(listener);
        return () => {
          listeners.delete(listener);
        };
      }
    };
  }

  // src/adapters/supabase/client.ts
  var SESSION_KEY = "noema1:cloud:session";
  function versionAfter(previous, now) {
    const prev = previous ? Date.parse(previous) : NaN;
    return new Date(Math.max(now, (Number.isNaN(prev) ? 0 : prev) + 1)).toISOString();
  }
  var SupabaseClient = class {
    #c;
    #base;
    now;
    /** Called when the session changes here (sign-in, refresh, sign-out, expiry). */
    onSession = null;
    #refreshing = null;
    constructor(config) {
      this.#c = config;
      this.#base = config.url.replace(/\/+$/, "");
      this.now = config.now ?? Date.now;
    }
    get key() {
      return this.#c.sessionKey ?? SESSION_KEY;
    }
    session() {
      const raw = this.#c.store.get(this.key);
      if (!raw.ok || !raw.value) return null;
      try {
        const s = JSON.parse(raw.value);
        return s && typeof s.access_token === "string" && s.user && typeof s.user.id === "string" ? s : null;
      } catch {
        return null;
      }
    }
    /** Keeps a GoTrue session answer (or forgets the session: null). */
    setSession(answer, why) {
      if (!answer) {
        this.#c.store.delete(this.key);
        this.onSession?.(null, why);
        return null;
      }
      const a = answer;
      const s = {
        access_token: a.access_token,
        refresh_token: a.refresh_token,
        expires_at: a.expires_at ?? Math.floor(this.now() / 1e3) + (a.expires_in ?? 3600),
        user: { id: a.user.id, email: a.user.email ?? "", user_metadata: a.user.user_metadata ?? {} }
      };
      this.#c.store.set(this.key, JSON.stringify(s));
      this.onSession?.(s, why);
      return s;
    }
    /** The session, refreshed when it ends within a minute (one refresh at a time). */
    async fresh() {
      const s = this.session();
      if (!s) return err(notSignedIn());
      if (s.expires_at - 60 > this.now() / 1e3) return ok(s);
      if (!this.#refreshing) this.#refreshing = this.#refresh(s).finally(() => {
        this.#refreshing = null;
      });
      return this.#refreshing;
    }
    async #refresh(s) {
      const r = await this.call("/auth/v1/token?grant_type=refresh_token", { method: "POST", body: { refresh_token: s.refresh_token }, auth: false });
      if (!r.ok) {
        if (r.error.code === "auth.session_expired") this.setSession(null, "expired");
        return r;
      }
      const kept = this.setSession(r.value.body, "refreshed");
      return kept ? ok(kept) : err(notSignedIn());
    }
    async call(path, o = {}) {
      let bearer = /^sb_/.test(this.#c.key) ? null : this.#c.key;
      if (o.auth !== false) {
        const s = await this.fresh();
        if (!s.ok) return s;
        bearer = s.value.access_token;
      }
      const isBinary = o.body instanceof Blob || o.body instanceof Uint8Array;
      const headers = { apikey: this.#c.key, ...bearer ? { Authorization: "Bearer " + bearer } : {}, ...o.body !== void 0 && !isBinary && typeof o.body !== "string" ? { "Content-Type": "application/json" } : {}, ...o.headers };
      const body = o.body === void 0 ? null : o.body instanceof Blob || typeof o.body === "string" ? o.body : o.body instanceof Uint8Array ? new Blob([o.body]) : JSON.stringify(o.body);
      let response;
      try {
        response = await this.#c.fetch(this.#base + path, { method: o.method ?? "GET", headers, body, ...o.signal ? { signal: o.signal } : {} });
      } catch (e2) {
        return err(networkError2(path, e2));
      }
      const ct = response.headers.get("content-type") ?? "";
      if (!response.ok) {
        const text2 = await response.text().catch(() => "");
        let parsed = text2;
        try {
          parsed = text2 ? JSON.parse(text2) : null;
        } catch {
          parsed = text2;
        }
        return err(failedAnswer(path, parsed, response.status));
      }
      if (!/json/.test(ct)) return ok({ status: response.status, body: null, response });
      const text = await response.text();
      try {
        return ok({ status: response.status, body: text ? JSON.parse(text) : null, response });
      } catch (e2) {
        return err(new NoemaError("cloud.unknown", "the cloud answered something that is not JSON", { cause: e2, params: { status: response.status, detail: text.slice(0, 120) } }));
      }
    }
  };

  // src/adapters/supabase/remote.ts
  var TABLES = Object.freeze({
    kv: { table: "noema_kv", key: "key", value: "value", version: "updated_at" }
  });
  var BUCKETS = Object.freeze({ private: "noema-private", public: "noema-public", shared: "noema-shared" });
  var enc = encodeURIComponent;
  var encPath = (p) => p.split("/").map(enc).join("/");
  var likePrefix = (p) => enc(p.replace(/[\\%_*]/g, (m) => "\\" + m) + "*");
  var conflict = (collection, key) => new NoemaError("remote.conflict", `${collection}/${key} changed since it was read`, { params: { collection, key }, retryable: true });
  function supabaseRemote(client, o = {}) {
    const tables = o.tables ?? TABLES, buckets = o.buckets ?? BUCKETS;
    const tableOf = (c) => {
      const t = tables[c];
      return t ? ok(t) : err(new NoemaError("remote.unknown_collection", "no table for the collection " + c, { params: { collection: c } }));
    };
    const bucketOf = (b) => {
      const x = buckets[b];
      return x ? ok(x) : err(new NoemaError("remote.unknown_collection", "no bucket " + b, { params: { collection: b } }));
    };
    const toRow = (t, r) => Object.freeze({ key: String(r[t.key]), value: String(r[t.value] ?? ""), version: String(r[t.version]) });
    const rowsOf = (t, body) => Array.isArray(body) ? body.map((r) => toRow(t, r)) : [];
    const uid = () => client.session()?.user.id ?? null;
    const select = (t) => `select=${t.key},${t.value},${t.version}`;
    const rows = {
      async get(collection, key) {
        const t = tableOf(collection);
        if (!t.ok) return t;
        const r = await client.call(`/rest/v1/${t.value.table}?${select(t.value)}&${t.value.key}=eq.${enc(key)}`);
        return r.ok ? ok(rowsOf(t.value, r.value.body)[0] ?? null) : r;
      },
      async list(collection, lo = {}) {
        const t = tableOf(collection);
        if (!t.ok) return t;
        const T = t.value;
        let q = `/rest/v1/${T.table}?${select(T)}&order=${T.key}.asc`;
        if (lo.prefix) q += `&${T.key}=like.${likePrefix(lo.prefix)}`;
        if (lo.after) q += `&${T.version}=gt.${enc(lo.after)}`;
        if (lo.limit !== void 0) q += `&limit=${lo.limit}`;
        const r = await client.call(q);
        return r.ok ? ok(rowsOf(T, r.value.body).filter((x) => !lo.prefix || x.key.startsWith(lo.prefix))) : r;
      },
      async put(collection, key, value, { expected }) {
        const t = tableOf(collection);
        if (!t.ok) return t;
        const T = t.value, version = versionAfter(expected, client.now());
        if (expected === null) {
          const user2 = uid();
          const r2 = await client.call(`/rest/v1/${T.table}?on_conflict=user_id,${T.key}`, {
            method: "POST",
            body: [{ ...user2 ? { user_id: user2 } : {}, [T.key]: key, [T.value]: value, [T.version]: version }],
            headers: { Prefer: "resolution=ignore-duplicates,return=representation" }
          });
          if (!r2.ok) return r2;
          const got2 = rowsOf(T, r2.value.body)[0];
          return got2 ? ok(got2) : err(conflict(collection, key));
        }
        const user = uid();
        const r = await client.call(`/rest/v1/${T.table}?${user ? `user_id=eq.${enc(user)}&` : ""}${T.key}=eq.${enc(key)}&${T.version}=eq.${enc(expected)}`, {
          method: "PATCH",
          body: { [T.value]: value, [T.version]: version },
          headers: { Prefer: "return=representation" }
        });
        if (!r.ok) return r;
        const got = rowsOf(T, r.value.body)[0];
        return got ? ok(got) : err(conflict(collection, key));
      },
      async delete(collection, key, d = {}) {
        const t = tableOf(collection);
        if (!t.ok) return t;
        const T = t.value, user = uid();
        const r = await client.call(`/rest/v1/${T.table}?${user ? `user_id=eq.${enc(user)}&` : ""}${T.key}=eq.${enc(key)}${d.expected !== void 0 ? `&${T.version}=eq.${enc(d.expected)}` : ""}`, {
          method: "DELETE",
          headers: { Prefer: "return=representation" }
        });
        if (!r.ok) return r;
        if (d.expected === void 0 || rowsOf(T, r.value.body).length) return OK_VOID;
        const still = await rows.get(collection, key);
        if (!still.ok) return still;
        return still.value ? err(conflict(collection, key)) : OK_VOID;
      }
    };
    const objects = {
      async put(bucket, path, body, po = {}) {
        const b = bucketOf(bucket);
        if (!b.ok) return b;
        const r = await client.call(`/storage/v1/object/${b.value}/${encPath(path)}`, {
          method: "POST",
          body: typeof body === "string" ? new Blob([body], { type: po.contentType ?? "text/plain" }) : body,
          headers: { "Content-Type": po.contentType ?? "application/octet-stream", "x-upsert": po.upsert === false ? "false" : "true" }
        });
        return r.ok ? OK_VOID : r;
      },
      async get(bucket, path) {
        const b = bucketOf(bucket);
        if (!b.ok) return b;
        const r = await client.call(`/storage/v1/object/authenticated/${b.value}/${encPath(path)}`);
        if (!r.ok) return r.error.status === 404 || /not.?found/i.test(r.error.message) ? ok(null) : r;
        return ok(await r.value.response.blob());
      },
      async list(bucket, prefix) {
        const b = bucketOf(bucket);
        if (!b.ok) return b;
        const folder = prefix.replace(/\/+$/, "");
        const r = await client.call(`/storage/v1/object/list/${b.value}`, { method: "POST", body: { prefix: folder, limit: 1e3, offset: 0, sortBy: { column: "name", order: "asc" } } });
        if (!r.ok) return r;
        const items = Array.isArray(r.value.body) ? r.value.body : [];
        return ok(items.map((x) => Object.freeze({
          path: (folder ? folder + "/" : "") + String(x.name),
          size: typeof x.metadata?.size === "number" ? x.metadata.size : null,
          updatedAt: typeof x.updated_at === "string" ? x.updated_at : null
        })));
      },
      async remove(bucket, paths) {
        const b = bucketOf(bucket);
        if (!b.ok) return b;
        if (!paths.length) return OK_VOID;
        const r = await client.call(`/storage/v1/object/${b.value}`, { method: "DELETE", body: { prefixes: [...paths] } });
        return r.ok ? OK_VOID : r;
      }
    };
    return {
      rows,
      objects,
      async rpc(name, args) {
        const r = await client.call(`/rest/v1/rpc/${enc(name)}`, { method: "POST", body: args });
        return r.ok ? ok(r.value.body ?? null) : r;
      }
    };
  }

  // src/adapters/supabase/index.ts
  function createSupabase(config, options = {}) {
    const client = new SupabaseClient(config);
    return { auth: supabaseAuth(client), remote: supabaseRemote(client, options) };
  }

  // src/composition/container.ts
  var token = (key, description = key) => Object.freeze({ key, description });
  var Container = class {
    #entries = /* @__PURE__ */ new Map();
    #resolving = [];
    #frozen = false;
    register(t, factory, options = {}) {
      if (this.#frozen) throw new NoemaError("container.frozen", `cannot register ${t.key}: the container is frozen`, { params: { token: t.key } });
      if (this.#entries.has(t.key) && !options.replace) throw new NoemaError("invariant.failed", `invariant failed: ${t.key} is registered twice`, { params: { token: t.key } });
      this.#entries.set(t.key, { factory, made: false, value: void 0 });
      return this;
    }
    value(t, v, options = {}) {
      return this.register(t, () => v, options);
    }
    get(t) {
      const e2 = this.#entries.get(t.key);
      if (!e2) throw new NoemaError("container.unknown", `nothing is registered for ${t.key}`, { params: { token: t.key } });
      if (e2.made) return e2.value;
      if (this.#resolving.includes(t.key)) {
        const chain = [...this.#resolving.slice(this.#resolving.indexOf(t.key)), t.key].join(" \u2192 ");
        throw new NoemaError("container.cycle", "registrations depend on each other: " + chain, { params: { chain } });
      }
      this.#resolving.push(t.key);
      try {
        e2.value = e2.factory(this);
        e2.made = true;
        return e2.value;
      } finally {
        this.#resolving.pop();
      }
    }
    has(t) {
      return this.#entries.has(t.key);
    }
    /** The registered keys (for diagnostics). */
    keys() {
      return [...this.#entries.keys()].sort();
    }
    freeze() {
      this.#frozen = true;
      return this;
    }
    get frozen() {
      return this.#frozen;
    }
  };

  // src/composition/tokens.ts
  var CONFIG = token("core.config", "the deployment settings (config.js)");
  var STORAGE = token("core.storage", "this device's storage (Storage port)");
  var CLOCK = token("core.clock", "the time and the learner's day (Clock port)");
  var I18N = token("core.i18n", "the interface language (I18n port)");
  var NOTIFIER = token("core.notifier", "toasts, notices, alerts (Notifier port)");
  var TELEMETRY = token("core.telemetry", "local counters and events (Telemetry port)");
  var ERRORS = token("core.errors", "the error journal and the learner's warnings (ErrorReporter port)");
  var JOBS = token("core.jobs", "the Compute jobs by name");
  var COMPUTE = token("core.compute", "jobs off the main thread (Compute port)");
  var AI = token("core.ai", "makes the AI of a provider for a key (AI port)");
  var CLOUD = token("core.cloud", "Auth + Remote of the Supabase project, or null");

  // src/composition/bridge.ts
  var CORE_NAMES = /* @__PURE__ */ new Set(["version", "day", "clock", "errors", "storage", "notify", "i18n", "telemetry", "compute", "NoemaError"]);
  function day(x) {
    const r = parseDay(x);
    if (!r.ok) throw r.error;
    return r.value;
  }
  function buildBridge(r, extensions = []) {
    const clock = r.get(CLOCK), errors = r.get(ERRORS), storage = r.get(STORAGE);
    const told = /* @__PURE__ */ new Set();
    const failed = (e2, where) => {
      if (e2.code === "storage.quota" || told.has(e2.code)) return;
      told.add(e2.code);
      errors.report(e2, { where, severity: e2.code === "storage.unavailable" ? "info" : "warning" });
    };
    const bridge = {
      version: 1,
      day: Object.freeze({
        of: (moment) => moment === void 0 ? clock.today() : dayOf(moment instanceof Date || typeof moment === "number" ? moment : new Date(moment)),
        add: (d, n) => addDays(day(d), n),
        between: (a, b) => daysBetween(day(a), day(b)),
        weekStart: (d, firstDay = 1) => weekStart(day(d), firstDay),
        compare: (a, b) => compareDays(day(a), day(b)),
        is: isLocalDay
      }),
      clock: Object.freeze({
        now: () => clock.now(),
        today: () => clock.today(),
        timeZone: () => clock.timeZone(),
        onDayChange: (f) => clock.onDayChange(f)
      }),
      errors,
      storage: Object.freeze({
        kv: Object.freeze({
          get(key) {
            const x = storage.kv.get(key);
            if (x.ok) return x.value;
            failed(x.error, "storage.kv.get");
            return null;
          },
          set(key, value) {
            const x = storage.kv.set(key, String(value));
            if (!x.ok) failed(x.error, "storage.kv.set");
            return x.ok;
          },
          delete(key) {
            const x = storage.kv.delete(key);
            if (!x.ok) failed(x.error, "storage.kv.delete");
          },
          keys(prefix = "") {
            const x = storage.kv.keys(prefix);
            if (x.ok) return x.value;
            failed(x.error, "storage.kv.keys");
            return [];
          }
        }),
        async estimate() {
          const x = await storage.estimate();
          if (x.ok) return x.value;
          failed(x.error, "storage.estimate");
          return null;
        },
        async persist() {
          const x = await storage.persist();
          if (x.ok) return x.value;
          failed(x.error, "storage.persist");
          return false;
        }
      }),
      notify: r.get(NOTIFIER),
      i18n: r.get(I18N),
      telemetry: r.get(TELEMETRY),
      compute: Object.freeze({
        async run(job, input, options) {
          const x = await r.get(COMPUTE).run(job, input, options);
          if (x.ok) return x.value;
          throw x.error;
        }
      }),
      NoemaError
    };
    for (const ext of extensions) {
      if (CORE_NAMES.has(ext.name) || ext.name in bridge) throw new NoemaError("invariant.failed", `invariant failed: the bridge already has ${ext.name}`);
      bridge[ext.name] = ext.build(r);
    }
    return Object.freeze(bridge);
  }

  // src/composition/jobs.ts
  var JOB_REGISTRATIONS = [];
  function buildJobRegistry(extra = []) {
    const r = createJobRegistry(coreJobs());
    for (const register of [...JOB_REGISTRATIONS, ...extra]) register(r);
    return r;
  }

  // src/composition/browser.ts
  var APP_REGISTRATIONS = [];
  var BRIDGE_EXTENSIONS = [];
  var WORKER_SOURCE_ID = "noema-core-worker-src";
  function workerUrlNextTo(script) {
    return script && /core\.js(\?.*)?$/.test(script) ? script.replace(/core\.js(\?.*)?$/, "core-worker.js$1") : null;
  }
  function workerFactory(page, scriptUrl) {
    return () => {
      const W = page.Worker;
      if (!W) throw new NoemaError("compute.unavailable", "this browser has no Web Workers");
      const inline = page.document?.getElementById(WORKER_SOURCE_ID)?.textContent;
      if (inline && page.Blob && page.URL) return new W(page.URL.createObjectURL(new page.Blob([inline], { type: "text/javascript" })));
      if (page.location?.protocol === "file:") throw new NoemaError("compute.unavailable", "a page opened from a file cannot start Workers");
      if (!scriptUrl) throw new NoemaError("compute.unavailable", "engine/core-worker.js cannot be located");
      return new W(scriptUrl);
    };
  }
  var DIAGNOSTIC_KEYS = /* @__PURE__ */ new Set([JOURNAL_KEY, TELEMETRY_KEY]);
  function registerBrowser(c, page, scriptUrl) {
    const fetchOf = () => {
      const f = page.fetch;
      if (!f) throw new NoemaError("internal.unexpected", "this browser has no fetch");
      return (u, i) => f(u, i);
    };
    c.value(CONFIG, page.NOEMA_CONFIG ?? {});
    c.register(STORAGE, () => browserStorage());
    c.register(CLOCK, () => systemClock());
    c.register(I18N, () => noemaI18n());
    c.register(NOTIFIER, () => browserNotifier());
    c.register(TELEMETRY, (r) => localTelemetry({ store: r.get(STORAGE).kv }));
    c.register(ERRORS, (r) => {
      const errors = createErrorReporter({ notifier: r.get(NOTIFIER), i18n: r.get(I18N), journalStore: r.get(STORAGE).kv, telemetry: r.get(TELEMETRY) });
      r.get(STORAGE).onFull((e2) => {
        if (DIAGNOSTIC_KEYS.has(e2.key)) return;
        errors.report(new NoemaError("storage.quota", "the browser storage for this site is full", { params: { key: e2.key } }), { where: "storage." + e2.store, severity: "error", notify: true, context: { key: e2.key } });
      });
      return errors;
    });
    c.register(JOBS, () => buildJobRegistry());
    c.register(COMPUTE, (r) => {
      const errors = r.get(ERRORS), jobs = r.get(JOBS);
      return workerCompute({
        createWorker: workerFactory(page, scriptUrl),
        fallback: inlineCompute(jobs),
        onUnavailable: (e2) => {
          errors.report(e2, { where: "compute.worker", severity: "info" });
        }
      });
    });
    c.register(AI, (r) => {
      const cfg = r.get(CONFIG);
      const make = (provider, apiKey) => {
        const base = provider === "claude" ? cfg.anthropicBase : cfg.geminiBase;
        const o = { apiKey, fetch: fetchOf(), ...base ? { baseUrl: base } : {} };
        return provider === "claude" ? claudeAI(o) : geminiAI(o);
      };
      return make;
    });
    c.register(CLOUD, (r) => {
      const cfg = r.get(CONFIG);
      const key = cfg.supabaseKey || cfg.supabaseAnonKey || "";
      if (!cfg.supabaseUrl || !key) return null;
      return createSupabase({ url: cfg.supabaseUrl, key, fetch: fetchOf(), store: r.get(STORAGE).kv });
    });
  }
  function createAppContainer(page, scriptUrl, extra = []) {
    const c = new Container();
    registerBrowser(c, page, scriptUrl);
    for (const register of [...APP_REGISTRATIONS, ...extra]) register(c);
    return c.freeze();
  }
  function start(page = globalThis) {
    const existing = page.NoemaCore;
    if (existing) return existing;
    const scriptUrl = workerUrlNextTo(page.document?.currentScript?.src);
    const container = createAppContainer(page, scriptUrl);
    const core = buildBridge(container, BRIDGE_EXTENSIONS);
    Object.defineProperty(page, "NoemaCore", { value: core, writable: false, enumerable: false, configurable: false });
    return core;
  }

  // src/composition/app.ts
  start();
})();
