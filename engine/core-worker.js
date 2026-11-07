/* GENERATED from src/composition/worker.ts by esbuild (npm run build). Do not edit. */
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
  var OK_VOID = ok(void 0);

  // src/adapters/local/jobs.ts
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
  var cancelledError = (job) => new NoemaError("compute.cancelled", `the job ${job} was cancelled`, { params: { job } });
  var unknownJobError = (job) => new NoemaError("compute.unknown_job", "no such job: " + job, { params: { job } });
  var failedError = (job, thrown) => thrown instanceof NoemaError ? thrown : new NoemaError("compute.failed", `the job ${job} failed: ${thrown instanceof Error ? thrown.message : String(thrown)}`, { params: { job }, cause: thrown });

  // src/adapters/browser/worker-protocol.ts
  function serveJobs(registry, scope) {
    const running = /* @__PURE__ */ new Map();
    const fail = (id, e) => scope.postMessage({ t: "fail", id, error: e.toJSON() });
    scope.addEventListener("message", ({ data }) => {
      if (data.t === "cancel") {
        running.get(data.id)?.abort(cancelledError("#" + data.id));
        return;
      }
      const { id, job, input } = data;
      const handler = registry.get(job);
      if (!handler) return fail(id, unknownJobError(job));
      const ac = new AbortController();
      running.set(id, ac);
      const ctx = { signal: ac.signal, progress: (progress) => scope.postMessage({ t: "progress", id, progress }) };
      Promise.resolve().then(() => handler(input, ctx)).then(
        (value) => {
          try {
            scope.postMessage({ t: "done", id, value });
          } catch (e) {
            fail(id, failedError(job, e));
          }
        },
        (e) => fail(id, failedError(job, e))
      ).finally(() => running.delete(id));
    });
  }

  // src/composition/jobs.ts
  var JOB_REGISTRATIONS = [];
  function buildJobRegistry(extra = []) {
    const r = createJobRegistry(coreJobs());
    for (const register of [...JOB_REGISTRATIONS, ...extra]) register(r);
    return r;
  }

  // src/composition/worker.ts
  serveJobs(buildJobRegistry(), globalThis);
})();
