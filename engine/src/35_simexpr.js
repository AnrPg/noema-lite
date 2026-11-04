/* ===================== interactive activities — the expression language of sim-spec@1 (docs/adr/001 D5, docs/activities-dev/simexpr.md) =====================
   A tiny, safe language for the formulas of declarative simulations: numbers, booleans, variables, + - * / % ^, comparisons,
   && || !, c ? a : b and a fixed list of math functions. No eval, no new Function, no property access, no strings, no loops:
   a hand-written lexer and recursive-descent (precedence-climbing) parser build a JSON-able tree, a validator checks it, and
   compile() turns it into a tree of closures. Each evaluation visits each node at most once (≤ 2000 nodes).
   Twin: tools/simexpr.py — the same grammar, tree, error codes and messages, and the same doubles bit for bit
   (tests/simexpr.js runs a shared corpus and a seeded fuzz through both). For that the transcendental functions are not the
   platform's Math (each browser and libm differ in the last bit) but ports of fdlibm, written with + - * / and bit access only;
   sqrt, floor, ceil, trunc, abs and % are exact in IEEE 754 and so the same everywhere.

   The function ports are adapted from fdlibm (http://www.netlib.org/fdlibm) via V8's src/base/ieee754.cc:
   ====================================================
   Copyright (C) 1993 by Sun Microsystems, Inc. All rights reserved.
   Developed at SunSoft, a Sun Microsystems, Inc. business.
   Permission to use, copy, modify, and distribute this
   software is freely granted, provided that this notice
   is preserved.
   ==================================================== */
(function (root) {
  /* i18n-ignore-start */   // code and developer-facing diagnostics, not UI text
  'use strict';
  const LIMITS = Object.freeze({ src: 2000, nodes: 2000, depth: 64, args: 16 });

  // ---------------------------------------------------------------- doubles, word by word
  const F64 = new Float64Array(1), U32 = new Uint32Array(F64.buffer), I32 = new Int32Array(F64.buffer);
  F64[0] = 1; const HI = U32[1] === 0x3FF00000 ? 1 : 0, LO = 1 - HI;
  const hiw = x => { F64[0] = x; return I32[HI]; };                       // high word, signed (C int32_t)
  const low = x => { F64[0] = x; return U32[LO]; };                       // low word, unsigned
  const words = (h, l) => { I32[HI] = h | 0; U32[LO] = l >>> 0; return F64[0]; };
  const setLow = (x, l) => { F64[0] = x; U32[LO] = l >>> 0; return F64[0]; };
  const setHigh = (x, h) => { F64[0] = x; I32[HI] = h | 0; return F64[0]; };
  const fabs = Math.abs, sqrt = Math.sqrt, trunc = Math.trunc;
  const TWO1023 = words(0x7FE00000, 0), TWOM969 = words(0x03600000, 0);   // 2^1023, 2^-969

  function scalbn(x, n) {   // x * 2^n, rounded once (musl)
    let y = x;
    if (n > 1023) { y *= TWO1023; n -= 1023; if (n > 1023) { y *= TWO1023; n -= 1023; if (n > 1023) n = 1023; } }
    else if (n < -1022) { y *= TWOM969; n += 969; if (n < -1022) { y *= TWOM969; n += 969; if (n < -1022) n = -1022; } }
    return y * words((0x3FF + n) << 20, 0);
  }

  // ---------------------------------------------------------------- argument reduction for sin / cos / tan
  const TWO_OVER_PI = [
    0xA2F983, 0x6E4E44, 0x1529FC, 0x2757D1, 0xF534DD, 0xC0DB62, 0x95993C, 0x439041, 0xFE5163, 0xABDEBB, 0xC561B7, 0x246E3A,
    0x424DD2, 0xE00649, 0x2EEA09, 0xD1921C, 0xFE1DEB, 0x1CB129, 0xA73EE8, 0x8235F5, 0x2EBB44, 0x84E99C, 0x7026B4, 0x5F7E41,
    0x3991D6, 0x398353, 0x39F49C, 0x845F8B, 0xBDF928, 0x3B1FF8, 0x97FFDE, 0x05980F, 0xEF2F11, 0x8B5A0A, 0x6D1F6D, 0x367ECF,
    0x27CB09, 0xB74F46, 0x3F669E, 0x5FEA2D, 0x7527BA, 0xC7EBE5, 0xF17B3D, 0x0739F7, 0x8A5292, 0xEA6BFB, 0x5FB11F, 0x8D5D08,
    0x560330, 0x46FC7B, 0x6BABF0, 0xCFBC20, 0x9AF436, 0x1DA9E3, 0x91615E, 0xE61B08, 0x659985, 0x5F14A0, 0x68408D, 0xFFD880,
    0x4D7327, 0x310606, 0x1556CA, 0x73A8C9, 0x60E27B, 0xC08C6B];
  const NPIO2_HW = [
    0x3FF921FB, 0x400921FB, 0x4012D97C, 0x401921FB, 0x401F6A7A, 0x4022D97C, 0x4025FDBB, 0x402921FB, 0x402C463A, 0x402F6A7A,
    0x4031475C, 0x4032D97C, 0x40346B9C, 0x4035FDBB, 0x40378FDB, 0x403921FB, 0x403AB41B, 0x403C463A, 0x403DD85A, 0x403F6A7A,
    0x40407E4C, 0x4041475C, 0x4042106C, 0x4042D97C, 0x4043A28C, 0x40446B9C, 0x404534AC, 0x4045FDBB, 0x4046C6CB, 0x40478FDB,
    0x404858EB, 0x404921FB];
  const PIO2 = [1.57079625129699707031e+00, 7.54978941586159635335e-08, 5.39030252995776476554e-15, 3.28200341580791294123e-22,
    1.27065575308067607349e-29, 1.22933308981111328932e-36, 2.73370053816464559624e-44, 2.16741683877804819444e-51];
  const Y = [0, 0];   // the reduced argument y0 + y1

  function kernelRemPio2(x, e0, nx) {   // prec 2 (jk = 4), as V8
    const two24 = 1.67772160000000000000e+07, twon24 = 5.96046447753906250000e-08, jk = 4, jp = 4;
    const iq = new Array(20).fill(0), f = new Array(20).fill(0), fq = new Array(20).fill(0), q = new Array(20).fill(0);
    const jx = nx - 1;
    let jv = trunc((e0 - 3) / 24); if (jv < 0) jv = 0;
    let q0 = e0 - 24 * (jv + 1);
    let i, j, k, z, fw, n, ih, carry;
    j = jv - jx; const m = jx + jk;
    for (i = 0; i <= m; i++, j++) f[i] = j < 0 ? 0 : TWO_OVER_PI[j];
    for (i = 0; i <= jk; i++) { for (j = 0, fw = 0; j <= jx; j++) fw += x[j] * f[jx + i - j]; q[i] = fw; }
    let jz = jk;
    for (;;) {   // recompute:
      for (i = 0, j = jz, z = q[jz]; j > 0; i++, j--) { fw = trunc(twon24 * z); iq[i] = trunc(z - two24 * fw); z = q[j - 1] + fw; }
      z = scalbn(z, q0);
      z -= 8.0 * Math.floor(z * 0.125);
      n = trunc(z);
      z -= n;
      ih = 0;
      if (q0 > 0) { i = iq[jz - 1] >> (24 - q0); n += i; iq[jz - 1] -= i << (24 - q0); ih = iq[jz - 1] >> (23 - q0); }
      else if (q0 === 0) ih = iq[jz - 1] >> 23;
      else if (z >= 0.5) ih = 2;
      if (ih > 0) {
        n += 1; carry = 0;
        for (i = 0; i < jz; i++) {
          j = iq[i];
          if (carry === 0) { if (j !== 0) { carry = 1; iq[i] = 0x1000000 - j; } } else iq[i] = 0xFFFFFF - j;
        }
        if (q0 > 0) { if (q0 === 1) iq[jz - 1] &= 0x7FFFFF; else if (q0 === 2) iq[jz - 1] &= 0x3FFFFF; }
        if (ih === 2) { z = 1.0 - z; if (carry !== 0) z -= scalbn(1.0, q0); }
      }
      if (z === 0) {
        j = 0;
        for (i = jz - 1; i >= jk; i--) j |= iq[i];
        if (j === 0) {
          for (k = 1; jk >= k && iq[jk - k] === 0; k++) { /* k = number of terms needed */ }
          for (i = jz + 1; i <= jz + k; i++) { f[jx + i] = TWO_OVER_PI[jv + i]; for (j = 0, fw = 0; j <= jx; j++) fw += x[j] * f[jx + i - j]; q[i] = fw; }
          jz += k;
          continue;
        }
      }
      break;
    }
    if (z === 0) { jz -= 1; q0 -= 24; while (iq[jz] === 0) { jz--; q0 -= 24; } }
    else {
      z = scalbn(z, -q0);
      if (z >= two24) { fw = trunc(twon24 * z); iq[jz] = trunc(z - two24 * fw); jz += 1; q0 += 24; iq[jz] = fw; }
      else iq[jz] = trunc(z);
    }
    fw = scalbn(1.0, q0);
    for (i = jz; i >= 0; i--) { q[i] = fw * iq[i]; fw *= twon24; }
    for (i = jz; i >= 0; i--) { for (fw = 0, k = 0; k <= jp && k <= jz - i; k++) fw += PIO2[k] * q[i + k]; fq[jz - i] = fw; }
    fw = 0;
    for (i = jz; i >= 0; i--) fw += fq[i];
    Y[0] = ih === 0 ? fw : -fw;
    fw = fq[0] - fw;
    for (i = 1; i <= jz; i++) fw += fq[i];
    Y[1] = ih === 0 ? fw : -fw;
    return n & 7;
  }

  function remPio2(x) {   // → n, with x - n*pi/2 = Y[0] + Y[1]
    const invpio2 = 6.36619772367581382433e-01, pio2_1 = 1.57079632673412561417e+00, pio2_1t = 6.07710050650619224932e-11,
      pio2_2 = 6.07710050630396597660e-11, pio2_2t = 2.02226624879595063154e-21, pio2_3 = 2.02226624871116645580e-21,
      pio2_3t = 8.47842766036889956997e-32;
    const hx = hiw(x), ix = hx & 0x7FFFFFFF;
    let z, w, t, r, fn, n, i, j;
    if (ix <= 0x3FE921FB) { Y[0] = x; Y[1] = 0; return 0; }
    if (ix < 0x4002D97C) {
      if (hx > 0) {
        z = x - pio2_1;
        if (ix !== 0x3FF921FB) { Y[0] = z - pio2_1t; Y[1] = (z - Y[0]) - pio2_1t; }
        else { z -= pio2_2; Y[0] = z - pio2_2t; Y[1] = (z - Y[0]) - pio2_2t; }
        return 1;
      }
      z = x + pio2_1;
      if (ix !== 0x3FF921FB) { Y[0] = z + pio2_1t; Y[1] = (z - Y[0]) + pio2_1t; }
      else { z += pio2_2; Y[0] = z + pio2_2t; Y[1] = (z - Y[0]) + pio2_2t; }
      return -1;
    }
    if (ix <= 0x413921FB) {
      t = fabs(x);
      n = trunc(t * invpio2 + 0.5);
      fn = n;
      r = t - fn * pio2_1;
      w = fn * pio2_1t;
      if (n < 32 && ix !== NPIO2_HW[n - 1]) Y[0] = r - w;
      else {
        j = ix >> 20;
        Y[0] = r - w;
        i = j - ((hiw(Y[0]) >> 20) & 0x7FF);
        if (i > 16) {
          t = r; w = fn * pio2_2; r = t - w; w = fn * pio2_2t - ((t - r) - w); Y[0] = r - w;
          i = j - ((hiw(Y[0]) >> 20) & 0x7FF);
          if (i > 49) { t = r; w = fn * pio2_3; r = t - w; w = fn * pio2_3t - ((t - r) - w); Y[0] = r - w; }
        }
      }
      Y[1] = (r - Y[0]) - w;
      if (hx < 0) { Y[0] = -Y[0]; Y[1] = -Y[1]; return -n; }
      return n;
    }
    if (ix >= 0x7FF00000) { Y[0] = Y[1] = x - x; return 0; }
    z = words(0, low(x));
    const e0 = (ix >> 20) - 1046;
    z = setHigh(z, ix - (e0 << 20));
    const tx = [0, 0, 0];
    for (i = 0; i < 2; i++) { tx[i] = trunc(z); z = (z - tx[i]) * 1.67772160000000000000e+07; }
    tx[2] = z;
    let nx = 3;
    while (tx[nx - 1] === 0) nx--;
    n = kernelRemPio2(tx, e0, nx);
    if (hx < 0) { Y[0] = -Y[0]; Y[1] = -Y[1]; return -n; }
    return n;
  }

  function kCos(x, y) {
    const C1 = 4.16666666666666019037e-02, C2 = -1.38888888888741095749e-03, C3 = 2.48015872894767294178e-05,
      C4 = -2.75573143513906633035e-07, C5 = 2.08757232129817482790e-09, C6 = -1.13596475577881948265e-11;
    const ix = hiw(x) & 0x7FFFFFFF;
    if (ix < 0x3E400000) return 1.0;   // |x| < 2^-27
    const z = x * x;
    const r = z * (C1 + z * (C2 + z * (C3 + z * (C4 + z * (C5 + z * C6)))));
    if (ix < 0x3FD33333) return 1.0 - (0.5 * z - (z * r - x * y));
    const qx = ix > 0x3FE90000 ? 0.28125 : words(ix - 0x00200000, 0);
    const iz = 0.5 * z - qx, a = 1.0 - qx;
    return a - (iz - (z * r - x * y));
  }

  function kSin(x, y, iy) {
    const S1 = -1.66666666666666324348e-01, S2 = 8.33333333332248946124e-03, S3 = -1.98412698298579493134e-04,
      S4 = 2.75573137070700676789e-06, S5 = -2.50507602534068634195e-08, S6 = 1.58969099521155010221e-10;
    const ix = hiw(x) & 0x7FFFFFFF;
    if (ix < 0x3E400000) return x;   // |x| < 2^-27
    const z = x * x, v = z * x, r = S2 + z * (S3 + z * (S4 + z * (S5 + z * S6)));
    if (iy === 0) return x + v * (S1 + z * r);
    return x - ((z * (0.5 * y - v * r) - y) - v * S1);
  }

  const TT = [3.33333333333334091986e-01, 1.33333333333201242699e-01, 5.39682539762260521377e-02, 2.18694882948595424599e-02,
    8.86323982359930005737e-03, 3.59207910759131235356e-03, 1.45620945432529025516e-03, 5.88041240820264096874e-04,
    2.46463134818469906812e-04, 7.81794442939557092300e-05, 7.14072491382608190305e-05, -1.85586374855275456654e-05,
    2.59073051863633712884e-05];
  function kTan(x, y, iy) {
    const pio4 = 7.85398163397448278999e-01, pio4lo = 3.06161699786838301793e-17;
    const hx = hiw(x), ix = hx & 0x7FFFFFFF;
    let z, r, v, w, s, a, t;
    if (ix < 0x3E300000) {   // |x| < 2^-28
      if (((ix | low(x)) | (iy + 1)) === 0) return 1.0 / fabs(x);
      if (iy === 1) return x;
      z = w = x + y; z = setLow(z, 0); v = y - (z - x);
      t = a = -1.0 / w; t = setLow(t, 0); s = 1.0 + t * z;
      return t + a * (s + t * v);
    }
    if (ix >= 0x3FE59428) {   // |x| >= 0.6744
      if (hx < 0) { x = -x; y = -y; }
      z = pio4 - x; w = pio4lo - y; x = z + w; y = 0.0;
    }
    z = x * x; w = z * z;
    r = TT[1] + w * (TT[3] + w * (TT[5] + w * (TT[7] + w * (TT[9] + w * TT[11]))));
    v = z * (TT[2] + w * (TT[4] + w * (TT[6] + w * (TT[8] + w * (TT[10] + w * TT[12])))));
    s = z * x;
    r = y + z * (s * (r + v) + y);
    r += TT[0] * s;
    w = x + r;
    if (ix >= 0x3FE59428) { v = iy; return (1 - ((hx >> 30) & 2)) * (v - 2.0 * (x - (w * w / (w + v) - r))); }
    if (iy === 1) return w;
    z = setLow(w, 0); v = r - (z - x);
    t = a = -1.0 / w; t = setLow(t, 0); s = 1.0 + t * z;
    return t + a * (s + t * v);
  }

  function sin(x) {
    const ix = hiw(x) & 0x7FFFFFFF;
    if (ix <= 0x3FE921FB) return kSin(x, 0, 0);
    if (ix >= 0x7FF00000) return x - x;
    const n = remPio2(x);
    switch (n & 3) { case 0: return kSin(Y[0], Y[1], 1); case 1: return kCos(Y[0], Y[1]); case 2: return -kSin(Y[0], Y[1], 1); default: return -kCos(Y[0], Y[1]); }
  }
  function cos(x) {
    const ix = hiw(x) & 0x7FFFFFFF;
    if (ix <= 0x3FE921FB) return kCos(x, 0);
    if (ix >= 0x7FF00000) return x - x;
    const n = remPio2(x);
    switch (n & 3) { case 0: return kCos(Y[0], Y[1]); case 1: return -kSin(Y[0], Y[1], 1); case 2: return -kCos(Y[0], Y[1]); default: return kSin(Y[0], Y[1], 1); }
  }
  function tan(x) {
    const ix = hiw(x) & 0x7FFFFFFF;
    if (ix <= 0x3FE921FB) return kTan(x, 0, 1);
    if (ix >= 0x7FF00000) return x - x;
    const n = remPio2(x);
    return kTan(Y[0], Y[1], 1 - ((n & 1) << 1));
  }

  // ---------------------------------------------------------------- inverse trigonometric
  const pS0 = 1.66666666666666657415e-01, pS1 = -3.25565818622400915405e-01, pS2 = 2.01212532134862925881e-01,
    pS3 = -4.00555345006794114027e-02, pS4 = 7.91534994289814532176e-04, pS5 = 3.47933107596021167570e-05,
    qS1 = -2.40339491173441421878e+00, qS2 = 2.02094576023350569471e+00, qS3 = -6.88283971605453293030e-01,
    qS4 = 7.70381505559019352791e-02;
  const PIO2_HI = 1.57079632679489655800e+00, PIO2_LO = 6.12323399573676603587e-17, PIO4_HI = 7.85398163397448278999e-01,
    PI_D = 3.14159265358979311600e+00;

  function asin(x) {
    let t = 0, w, p, q, c, r, s;
    const hx = hiw(x), ix = hx & 0x7FFFFFFF;
    if (ix >= 0x3FF00000) {
      if (((ix - 0x3FF00000) | low(x)) === 0) return x * PIO2_HI + x * PIO2_LO;
      return NaN;
    } else if (ix < 0x3FE00000) {
      if (ix < 0x3E400000) { if (1.0e300 + x > 1.0) return x; }
      else t = x * x;
      p = t * (pS0 + t * (pS1 + t * (pS2 + t * (pS3 + t * (pS4 + t * pS5)))));
      q = 1.0 + t * (qS1 + t * (qS2 + t * (qS3 + t * qS4)));
      w = p / q;
      return x + x * w;
    }
    w = 1.0 - fabs(x);
    t = w * 0.5;
    p = t * (pS0 + t * (pS1 + t * (pS2 + t * (pS3 + t * (pS4 + t * pS5)))));
    q = 1.0 + t * (qS1 + t * (qS2 + t * (qS3 + t * qS4)));
    s = sqrt(t);
    if (ix >= 0x3FEF3333) { w = p / q; t = PIO2_HI - (2.0 * (s + s * w) - PIO2_LO); }
    else {
      w = setLow(s, 0);
      c = (t - w * w) / (s + w);
      r = p / q;
      p = 2.0 * s * r - (PIO2_LO - 2.0 * c);
      q = PIO4_HI - 2.0 * w;
      t = PIO4_HI - (p - q);
    }
    return hx > 0 ? t : -t;
  }

  function acos(x) {
    let z, p, q, r, w, s, c, df;
    const hx = hiw(x), ix = hx & 0x7FFFFFFF;
    if (ix >= 0x3FF00000) {
      if (((ix - 0x3FF00000) | low(x)) === 0) return hx > 0 ? 0.0 : PI_D + 2.0 * PIO2_LO;
      return NaN;
    }
    if (ix < 0x3FE00000) {
      if (ix <= 0x3C600000) return PIO2_HI + PIO2_LO;
      z = x * x;
      p = z * (pS0 + z * (pS1 + z * (pS2 + z * (pS3 + z * (pS4 + z * pS5)))));
      q = 1.0 + z * (qS1 + z * (qS2 + z * (qS3 + z * qS4)));
      r = p / q;
      return PIO2_HI - (x - (PIO2_LO - x * r));
    } else if (hx < 0) {
      z = (1.0 + x) * 0.5;
      p = z * (pS0 + z * (pS1 + z * (pS2 + z * (pS3 + z * (pS4 + z * pS5)))));
      q = 1.0 + z * (qS1 + z * (qS2 + z * (qS3 + z * qS4)));
      s = sqrt(z);
      r = p / q;
      w = r * s - PIO2_LO;
      return PI_D - 2.0 * (s + w);
    }
    z = (1.0 - x) * 0.5;
    s = sqrt(z);
    df = setLow(s, 0);
    c = (z - df * df) / (s + df);
    p = z * (pS0 + z * (pS1 + z * (pS2 + z * (pS3 + z * (pS4 + z * pS5)))));
    q = 1.0 + z * (qS1 + z * (qS2 + z * (qS3 + z * qS4)));
    r = p / q;
    w = r * s + c;
    return 2.0 * (df + w);
  }

  const ATANHI = [4.63647609000806093515e-01, 7.85398163397448278999e-01, 9.82793723247329054082e-01, 1.57079632679489655800e+00];
  const ATANLO = [2.26987774529616870924e-17, 3.06161699786838301793e-17, 1.39033110312309984516e-17, 6.12323399573676603587e-17];
  const AT = [3.33333333333329318027e-01, -1.99999999998764832476e-01, 1.42857142725034663711e-01, -1.11111104054623557880e-01,
    9.09088713343650656196e-02, -7.69187620504482999495e-02, 6.66107313738753120669e-02, -5.83357013379057348645e-02,
    4.97687799461593236017e-02, -3.65315727442169155270e-02, 1.62858201153657823623e-02];
  function atan(x) {
    let w, s1, s2, z, id;
    const hx = hiw(x), ix = hx & 0x7FFFFFFF;
    if (ix >= 0x44100000) {   // |x| >= 2^66
      if (x !== x) return x + x;
      return hx > 0 ? ATANHI[3] + ATANLO[3] : -ATANHI[3] - ATANLO[3];
    }
    if (ix < 0x3FDC0000) {   // |x| < 0.4375
      if (ix < 0x3E400000) { if (1.0e300 + x > 1.0) return x; }
      id = -1;
    } else {
      x = fabs(x);
      if (ix < 0x3FF30000) {
        if (ix < 0x3FE60000) { id = 0; x = (2.0 * x - 1.0) / (2.0 + x); }
        else { id = 1; x = (x - 1.0) / (x + 1.0); }
      } else if (ix < 0x40038000) { id = 2; x = (x - 1.5) / (1.0 + 1.5 * x); }
      else { id = 3; x = -1.0 / x; }
    }
    z = x * x;
    w = z * z;
    s1 = z * (AT[0] + w * (AT[2] + w * (AT[4] + w * (AT[6] + w * (AT[8] + w * AT[10])))));
    s2 = w * (AT[1] + w * (AT[3] + w * (AT[5] + w * (AT[7] + w * AT[9]))));
    if (id < 0) return x - x * (s1 + s2);
    z = ATANHI[id] - ((x * (s1 + s2) - ATANLO[id]) - x);
    return hx < 0 ? -z : z;
  }

  function atan2(y, x) {
    const tiny = 1.0e-300, pi_o_4 = 7.8539816339744827900E-01, pi_o_2 = 1.5707963267948965580E+00,
      pi = 3.1415926535897931160E+00, pi_lo = 1.2246467991473531772E-16;
    if (x !== x || y !== y) return x + y;
    const hx = hiw(x), lx = low(x), ix = hx & 0x7FFFFFFF, hy = hiw(y), ly = low(y), iy = hy & 0x7FFFFFFF;
    if (x === 1.0) return atan(y);
    let m = ((hy >> 31) & 1) | ((hx >> 30) & 2);
    if ((iy | ly) === 0) {   // y = ±0
      switch (m) { case 0: case 1: return y; case 2: return pi + tiny; default: return -pi - tiny; }
    }
    if ((ix | lx) === 0) return hy < 0 ? -pi_o_2 - tiny : pi_o_2 + tiny;   // x = ±0
    if (ix === 0x7FF00000) {
      if (iy === 0x7FF00000) {
        switch (m) { case 0: return pi_o_4 + tiny; case 1: return -pi_o_4 - tiny; case 2: return 3.0 * pi_o_4 + tiny; default: return -3.0 * pi_o_4 - tiny; }
      }
      switch (m) { case 0: return 0.0; case 1: return -0.0; case 2: return pi + tiny; default: return -pi - tiny; }
    }
    if (iy === 0x7FF00000) return hy < 0 ? -pi_o_2 - tiny : pi_o_2 + tiny;
    const k = (iy - ix) >> 20;
    let z;
    if (k > 60) { z = pi_o_2 + 0.5 * pi_lo; m &= 1; }
    else if (hx < 0 && k < -60) z = 0.0;
    else z = atan(fabs(y / x));
    switch (m) { case 0: return z; case 1: return -z; case 2: return pi - (z - pi_lo); default: return (z - pi_lo) - pi; }
  }

  // ---------------------------------------------------------------- exponential and logarithms
  const P1 = 1.66666666666666019037e-01, P2 = -2.77777777770155933842e-03, P3 = 6.61375632143793436117e-05,
    P4 = -1.65339022054652515390e-06, P5 = 4.13813679705723846039e-08;
  const LN2_HI = 6.93147180369123816490e-01, LN2_LO = 1.90821492927058770002e-10, INVLN2 = 1.44269504088896338700e+00;
  const TWO54 = 1.80143985094819840000e+16;
  const Lg1 = 6.666666666666735130e-01, Lg2 = 3.999999999940941908e-01, Lg3 = 2.857142874366239149e-01,
    Lg4 = 2.222219843214978396e-01, Lg5 = 1.818357216161805012e-01, Lg6 = 1.531383769920937332e-01, Lg7 = 1.479819860511658591e-01;

  function exp(x) {
    const o_threshold = 7.09782712893383973096e+02, u_threshold = -7.45133219101941108420e+02, E = 2.718281828459045,
      huge = 1.0e+300, twom1000 = 9.33263618503218878990e-302, two1023 = 8.988465674311579539e307;
    let hi = 0.0, lo = 0.0, k = 0, t, y, c;
    let hx = hiw(x);
    const xsb = (hx >>> 31) & 1;
    hx &= 0x7FFFFFFF;
    if (hx >= 0x40862E42) {
      if (hx >= 0x7FF00000) { if (((hx & 0xFFFFF) | low(x)) !== 0) return x + x; return xsb === 0 ? x : 0.0; }
      if (x > o_threshold) return huge * huge;
      if (x < u_threshold) return twom1000 * twom1000;
    }
    if (hx > 0x3FD62E42) {
      if (hx < 0x3FF0A2B2) {
        if (x === 1.0) return E;
        hi = x - (xsb ? -LN2_HI : LN2_HI); lo = xsb ? -LN2_LO : LN2_LO; k = 1 - xsb - xsb;
      } else {
        k = trunc(INVLN2 * x + (xsb ? -0.5 : 0.5));
        t = k; hi = x - t * LN2_HI; lo = t * LN2_LO;
      }
      x = hi - lo;
    } else if (hx < 0x3E300000) { if (huge + x > 1.0) return 1.0 + x; }
    else k = 0;
    t = x * x;
    const twopk = k >= -1021 ? words(0x3FF00000 + (k << 20), 0) : words(0x3FF00000 + ((k + 1000) << 20), 0);
    c = x - t * (P1 + t * (P2 + t * (P3 + t * (P4 + t * P5))));
    if (k === 0) return 1.0 - ((x * c) / (c - 2.0) - x);
    y = 1.0 - ((lo - (x * c) / (2.0 - c)) - hi);
    if (k >= -1021) { if (k === 1024) return y * 2.0 * two1023; return y * twopk; }
    return y * twopk * twom1000;
  }

  function expm1(x) {
    const o_threshold = 7.09782712893383973096e+02, huge = 1.0e+300, tiny = 1.0e-300,
      Q1 = -3.33333333333331316428e-02, Q2 = 1.58730158725481460165e-03, Q3 = -7.93650757867487942473e-05,
      Q4 = 4.00821782732936239552e-06, Q5 = -2.01099218183624371326e-07;
    let hi, lo, c = 0, k, t, e, y;
    let hx = hiw(x);
    const xsb = hx & 0x80000000;
    hx &= 0x7FFFFFFF;
    if (hx >= 0x4043687A) {   // |x| >= 56 ln2
      if (hx >= 0x40862E42) {
        if (hx >= 0x7FF00000) { if (((hx & 0xFFFFF) | low(x)) !== 0) return x + x; return xsb === 0 ? x : -1.0; }
        if (x > o_threshold) return huge * huge;
      }
      if (xsb !== 0) { if (x + tiny < 0.0) return tiny - 1.0; }
    }
    if (hx > 0x3FD62E42) {
      if (hx < 0x3FF0A2B2) {
        if (xsb === 0) { hi = x - LN2_HI; lo = LN2_LO; k = 1; } else { hi = x + LN2_HI; lo = -LN2_LO; k = -1; }
      } else {
        k = trunc(INVLN2 * x + (xsb === 0 ? 0.5 : -0.5));
        t = k; hi = x - t * LN2_HI; lo = t * LN2_LO;
      }
      x = hi - lo;
      c = (hi - x) - lo;
    } else if (hx < 0x3C900000) { t = huge + x; return x - (t - (huge + x)); }
    else k = 0;
    const hfx = 0.5 * x, hxs = x * hfx;
    const r1 = 1.0 + hxs * (Q1 + hxs * (Q2 + hxs * (Q3 + hxs * (Q4 + hxs * Q5))));
    t = 3.0 - r1 * hfx;
    e = hxs * ((r1 - t) / (6.0 - x * t));
    if (k === 0) return x - (x * e - hxs);
    const twopk = words(0x3FF00000 + (k << 20), 0);
    e = (x * (e - c) - c);
    e -= hxs;
    if (k === -1) return 0.5 * (x - e) - 0.5;
    if (k === 1) { if (x < -0.25) return -2.0 * (e - (x + 0.5)); return 1.0 + 2.0 * (x - e); }
    if (k <= -2 || k > 56) {
      y = 1.0 - (e - x);
      y = k === 1024 ? y * 2.0 * 8.98846567431158e+307 : y * twopk;
      return y - 1.0;
    }
    if (k < 20) { t = words(0x3FF00000 - (0x200000 >> k), 0); y = t - (e - x); y = y * twopk; }
    else { t = words((0x3FF - k) << 20, 0); y = x - (e + t); y += 1.0; y = y * twopk; }
    return y;
  }

  function log(x) {
    let hx = hiw(x), k = 0;
    const lx = low(x);
    if (hx < 0x00100000) {
      if (((hx & 0x7FFFFFFF) | lx) === 0) return -Infinity;
      if (hx < 0) return NaN;
      k -= 54; x *= TWO54; hx = hiw(x);
    }
    if (hx >= 0x7FF00000) return x + x;
    k += (hx >> 20) - 1023;
    hx &= 0x000FFFFF;
    let i = (hx + 0x95F64) & 0x100000;
    x = setHigh(x, hx | (i ^ 0x3FF00000));
    k += i >> 20;
    const f = x - 1.0;
    let dk, R;
    if ((0x000FFFFF & (2 + hx)) < 3) {
      if (f === 0) { if (k === 0) return 0; dk = k; return dk * LN2_HI + dk * LN2_LO; }
      R = f * f * (0.5 - 0.33333333333333333 * f);
      if (k === 0) return f - R;
      dk = k; return dk * LN2_HI - ((R - dk * LN2_LO) - f);
    }
    const s = f / (2.0 + f);
    dk = k;
    const z = s * s;
    i = hx - 0x6147A;
    const w = z * z;
    const j = 0x6B851 - hx;
    const t1 = w * (Lg2 + w * (Lg4 + w * Lg6)), t2 = z * (Lg1 + w * (Lg3 + w * (Lg5 + w * Lg7)));
    i |= j;
    R = t2 + t1;
    if (i > 0) {
      const hfsq = 0.5 * f * f;
      if (k === 0) return f - (hfsq - s * (hfsq + R));
      return dk * LN2_HI - ((hfsq - (s * (hfsq + R) + dk * LN2_LO)) - f);
    }
    if (k === 0) return f - s * (f - R);
    return dk * LN2_HI - ((s * (f - R) - dk * LN2_LO) - f);
  }

  function kLog1p(f) {
    const s = f / (2.0 + f), z = s * s, w = z * z;
    const t1 = w * (Lg2 + w * (Lg4 + w * Lg6)), t2 = z * (Lg1 + w * (Lg3 + w * (Lg5 + w * Lg7)));
    const R = t2 + t1, hfsq = 0.5 * f * f;
    return s * (hfsq + R);
  }

  function log2(x) {
    const ivln2hi = 1.44269504072144627571e+00, ivln2lo = 1.67517131648865118353e-10;
    let hx = hiw(x), k = 0;
    const lx = low(x);
    if (hx < 0x00100000) {
      if (((hx & 0x7FFFFFFF) | lx) === 0) return -Infinity;
      if (hx < 0) return NaN;
      k -= 54; x *= TWO54; hx = hiw(x);
    }
    if (hx >= 0x7FF00000) return x + x;
    if (hx === 0x3FF00000 && lx === 0) return 0.0;
    k += (hx >> 20) - 1023;
    hx &= 0x000FFFFF;
    const i = (hx + 0x95F64) & 0x100000;
    x = setHigh(x, hx | (i ^ 0x3FF00000));
    k += i >> 20;
    const y = k, f = x - 1.0, hfsq = 0.5 * f * f, r = kLog1p(f);
    const hi = setLow(f - hfsq, 0);
    const lo = (f - hi) - hfsq + r;
    let val_hi = hi * ivln2hi, val_lo = (lo + hi) * ivln2lo + lo * ivln2hi;
    const w = y + val_hi;
    val_lo += (y - w) + val_hi;
    val_hi = w;
    return val_lo + val_hi;
  }

  function log10(x) {
    const ivln10 = 4.34294481903251816668e-01, log10_2hi = 3.01029995663611771306e-01, log10_2lo = 3.69423907715893078616e-13;
    let hx = hiw(x), lx = low(x), k = 0;
    if (hx < 0x00100000) {
      if (((hx & 0x7FFFFFFF) | lx) === 0) return -Infinity;
      if (hx < 0) return NaN;
      k -= 54; x *= TWO54; hx = hiw(x); lx = low(x);
    }
    if (hx >= 0x7FF00000) return x + x;
    if (hx === 0x3FF00000 && lx === 0) return 0.0;
    k += (hx >> 20) - 1023;
    const i = k < 0 ? 1 : 0;
    hx = (hx & 0x000FFFFF) | ((0x3FF - i) << 20);
    const y = k + i;
    x = words(hx, lx);
    const z = y * log10_2lo + ivln10 * log(x);
    return z + y * log10_2hi;
  }

  function cbrt(x) {
    const B1 = 715094163, B2 = 696219795, P0 = 1.87595182427177009643, PP1 = -1.88497979543377169875,
      PP2 = 1.621429720105354466140, PP3 = -0.758397934778766047437, PP4 = 0.145996192886612446982;
    let hx = hiw(x) >>> 0;
    const lw = low(x), sign = hx & 0x80000000;
    hx = (hx ^ sign) >>> 0;
    if (hx >= 0x7FF00000) return x + x;
    let t = 0.0, r, s, w;
    if (hx < 0x00100000) {
      if ((hx | lw) === 0) return x;
      t = words(0x43500000, 0);
      t *= x;
      const high = hiw(t) >>> 0;
      t = words(sign | (Math.floor((high & 0x7FFFFFFF) / 3) + B2), 0);
    } else t = words(sign | (Math.floor(hx / 3) + B1), 0);
    r = (t * t) * (t / x);
    t = t * ((P0 + r * (PP1 + r * PP2)) + ((r * r) * r) * (PP3 + r * PP4));
    // round t away from zero to 23 bits: bits = (bits + 0x80000000) & 0xFFFFFFFFC0000000
    let th = hiw(t) >>> 0, tl = low(t) + 0x80000000;
    if (tl >= 0x100000000) { tl -= 0x100000000; th = (th + 1) >>> 0; }
    t = words(th, (tl & 0xC0000000) >>> 0);
    s = t * t;
    r = x / s;
    w = t + t;
    r = (r - t) / (w + r);
    t = t + t * r;
    return t;
  }

  // ---------------------------------------------------------------- power
  function pow(x, y) {
    const bp = [1.0, 1.5], dp_h = [0.0, 5.84962487220764160156e-01], dp_l = [0.0, 1.35003920212974897128e-08],
      two53 = 9007199254740992.0, huge = 1.0e300, tiny = 1.0e-300,
      L1 = 5.99999999999994648725e-01, L2 = 4.28571428578550184252e-01, L3 = 3.33333329818377432918e-01,
      L4 = 2.72728123808534006489e-01, L5 = 2.30660745775561754067e-01, L6 = 2.06975017800338417784e-01,
      lg2 = 6.93147180559945286227e-01, lg2_h = 6.93147182464599609375e-01, lg2_l = -1.90465429995776804525e-09,
      ovt = 8.0085662595372944372e-0017, cp = 9.61796693925975554329e-01, cp_h = 9.61796700954437255859e-01,
      cp_l = -7.02846165095275826516e-09, ivln2 = 1.44269504088896338700e+00, ivln2_h = 1.44269502162933349609e+00,
      ivln2_l = 1.92596299112661746887e-08;
    let z, ax, z_h, z_l, p_h, p_l, y1, t1, t2, r, s, t, u, v, w, i, j, k, n;
    const hx = hiw(x), lx = low(x), hy = hiw(y), ly = low(y);
    let ix = hx & 0x7FFFFFFF;
    const iy = hy & 0x7FFFFFFF;
    if ((iy | ly) === 0) return 1.0;
    if (x !== x || y !== y) return x + y;
    let yisint = 0;
    if (hx < 0) {
      if (iy >= 0x43400000) yisint = 2;
      else if (iy >= 0x3FF00000) {
        k = (iy >> 20) - 0x3FF;
        if (k > 20) { j = ly >>> (52 - k); if ((j << (52 - k)) === (ly | 0)) yisint = 2 - (j & 1); }
        else if (ly === 0) { j = iy >> (20 - k); if ((j << (20 - k)) === iy) yisint = 2 - (j & 1); }
      }
    }
    if (ly === 0) {
      if (iy === 0x7FF00000) {   // y = ±inf
        if (((ix - 0x3FF00000) | lx) === 0) return y - y;
        if (ix >= 0x3FF00000) return hy >= 0 ? y : 0.0;
        return hy < 0 ? -y : 0.0;
      }
      if (iy === 0x3FF00000) return hy < 0 ? 1.0 / x : x;
      if (hy === 0x40000000) return x * x;
      if (hy === 0x3FE00000 && hx >= 0) return sqrt(x);
    }
    ax = fabs(x);
    if (lx === 0 && (ix === 0x7FF00000 || ix === 0 || ix === 0x3FF00000)) {
      z = ax;
      if (hy < 0) z = 1.0 / z;
      if (hx < 0) {
        if (((ix - 0x3FF00000) | yisint) === 0) z = NaN;
        else if (yisint === 1) z = -z;
      }
      return z;
    }
    n = (hx >> 31) + 1;
    if ((n | yisint) === 0) return NaN;
    s = 1.0;
    if ((n | (yisint - 1)) === 0) s = -1.0;
    if (iy > 0x41E00000) {   // |y| > 2^31
      if (iy > 0x43F00000) {
        if (ix <= 0x3FEFFFFF) return hy < 0 ? huge * huge : tiny * tiny;
        if (ix >= 0x3FF00000) return hy > 0 ? huge * huge : tiny * tiny;
      }
      if (ix < 0x3FEFFFFF) return hy < 0 ? s * huge * huge : s * tiny * tiny;
      if (ix > 0x3FF00000) return hy > 0 ? s * huge * huge : s * tiny * tiny;
      t = ax - 1.0;
      w = (t * t) * (0.5 - t * (0.3333333333333333333333 - t * 0.25));
      u = ivln2_h * t;
      v = t * ivln2_l - w * ivln2;
      t1 = setLow(u + v, 0);
      t2 = v - (t1 - u);
    } else {
      let ss, s2, s_h, s_l, t_h, t_l;
      n = 0;
      if (ix < 0x00100000) { ax *= two53; n -= 53; ix = hiw(ax); }
      n += (ix >> 20) - 0x3FF;
      j = ix & 0x000FFFFF;
      ix = j | 0x3FF00000;
      if (j <= 0x3988E) k = 0;
      else if (j < 0xBB67A) k = 1;
      else { k = 0; n += 1; ix -= 0x00100000; }
      ax = setHigh(ax, ix);
      u = ax - bp[k];
      v = 1.0 / (ax + bp[k]);
      ss = u * v;
      s_h = setLow(ss, 0);
      t_h = words(((ix >> 1) | 0x20000000) + 0x00080000 + (k << 18), 0);
      t_l = ax - (t_h - bp[k]);
      s_l = v * ((u - s_h * t_h) - s_h * t_l);
      s2 = ss * ss;
      r = s2 * s2 * (L1 + s2 * (L2 + s2 * (L3 + s2 * (L4 + s2 * (L5 + s2 * L6)))));
      r += s_l * (s_h + ss);
      s2 = s_h * s_h;
      t_h = setLow(3.0 + s2 + r, 0);
      t_l = r - ((t_h - 3.0) - s2);
      u = s_h * t_h;
      v = s_l * t_h + t_l * ss;
      p_h = setLow(u + v, 0);
      p_l = v - (p_h - u);
      z_h = cp_h * p_h;
      z_l = cp_l * p_h + p_l * cp + dp_l[k];
      t = n;
      t1 = setLow(((z_h + z_l) + dp_h[k]) + t, 0);
      t2 = z_l - (((t1 - t) - dp_h[k]) - z_h);
    }
    y1 = setLow(y, 0);
    p_l = (y - y1) * t1 + y * t2;
    p_h = y1 * t1;
    z = p_l + p_h;
    j = hiw(z); i = low(z);
    if (j >= 0x40900000) {
      if (((j - 0x40900000) | i) !== 0) return s * huge * huge;
      if (p_l + ovt > z - p_h) return s * huge * huge;
    } else if ((j & 0x7FFFFFFF) >= 0x4090CC00) {
      if (((j - 0xC090CC00) | i) !== 0) return s * tiny * tiny;
      if (p_l <= z - p_h) return s * tiny * tiny;
    }
    i = j & 0x7FFFFFFF;
    k = (i >> 20) - 0x3FF;
    n = 0;
    if (i > 0x3FE00000) {
      n = j + (0x00100000 >> (k + 1));
      k = ((n & 0x7FFFFFFF) >> 20) - 0x3FF;
      t = words(n & ~(0x000FFFFF >> k), 0);
      n = ((n & 0x000FFFFF) | 0x00100000) >> (20 - k);
      if (j < 0) n = -n;
      p_h -= t;
    }
    t = setLow(p_l + p_h, 0);
    u = t * lg2_h;
    v = (p_l - (t - p_h)) * lg2 + t * lg2_l;
    z = u + v;
    w = v - (z - u);
    t = z * z;
    t1 = z - t * (P1 + t * (P2 + t * (P3 + t * (P4 + t * P5))));
    r = (z * t1) / ((t1 - 2.0) - (w + z * w));
    z = 1.0 - (r - z);
    j = hiw(z);
    j += n << 20;
    if ((j >> 20) <= 0) z = scalbn(z, n);
    else z = setHigh(z, hiw(z) + (n << 20));
    return s * z;
  }

  // ---------------------------------------------------------------- hyperbolic
  function sinh(x) {
    const KSINH_OVERFLOW = 710.4758600739439, TWO_M28 = 3.725290298461914e-9, LOG_MAXD = 709.7822265625, shuge = 1.0e307;
    const h = x < 0 ? -0.5 : 0.5, ax = fabs(x);
    if (ax < 22) {
      if (ax < TWO_M28) return x;
      const t = expm1(ax);
      if (ax < 1) return h * (2 * t - t * t / (t + 1));
      return h * (t + t / (t + 1));
    }
    if (ax < LOG_MAXD) return h * exp(ax);
    if (ax <= KSINH_OVERFLOW) { const w = exp(0.5 * ax), t = h * w; return t * w; }
    return x * shuge;
  }
  function cosh(x) {
    const KCOSH_OVERFLOW = 710.4758600739439, huge = 1.0e+300;
    const ix = hiw(x) & 0x7FFFFFFF;
    if (ix < 0x3FD62E43) { const t = expm1(fabs(x)), w = 1.0 + t; if (ix < 0x3C800000) return w; return 1.0 + (t * t) / (w + w); }
    if (ix < 0x40360000) { const t = exp(fabs(x)); return 0.5 * t + 0.5 / t; }
    if (ix < 0x40862E42) return 0.5 * exp(fabs(x));
    if (fabs(x) <= KCOSH_OVERFLOW) { const w = exp(0.5 * fabs(x)), t = 0.5 * w; return t * w; }
    if (ix >= 0x7FF00000) return x * x;
    return huge * huge;
  }
  function tanh(x) {
    const tiny = 1.0e-300, huge = 1.0e300;
    const jx = hiw(x), ix = jx & 0x7FFFFFFF;
    let t, z;
    if (ix >= 0x7FF00000) return jx >= 0 ? 1.0 / x + 1.0 : 1.0 / x - 1.0;
    if (ix < 0x40360000) {
      if (ix < 0x3E300000) { if (huge + x > 1.0) return x; }
      if (ix >= 0x3FF00000) { t = expm1(2.0 * fabs(x)); z = 1.0 - 2.0 / (t + 2.0); }
      else { t = expm1(-2.0 * fabs(x)); z = -t / (t + 2.0); }
    } else z = 1.0 - tiny;
    return jx >= 0 ? z : -z;
  }

  // ---------------------------------------------------------------- the exact ones and the small helpers
  const isNegZero = v => v === 0 && 1 / v < 0;
  function round(x) {   // half away from zero; keeps the sign of a zero result (round(-0.3) = -0)
    if (!isFinite(x) || x === 0) return x;
    const t = trunc(x), d = x - t;   // x - t is exact
    if (d >= 0.5) return t + 1;
    if (d <= -0.5) return t - 1;
    return t;
  }
  const sign = x => (x !== x || x === 0) ? x : (x > 0 ? 1 : -1);
  function min(...a) { let r = a[0]; for (let i = 1; i < a.length; i++) { const v = a[i]; if (v !== v || r !== r) r = NaN; else if (v < r || (v === 0 && r === 0 && isNegZero(v))) r = v; } return r; }
  function max(...a) { let r = a[0]; for (let i = 1; i < a.length; i++) { const v = a[i]; if (v !== v || r !== r) r = NaN; else if (v > r || (v === 0 && r === 0 && isNegZero(r))) r = v; } return r; }
  function hypot(...a) {
    let inf = false, nan = false, m = 0;
    for (const v of a) { const x = fabs(v); if (x === Infinity) inf = true; else if (x !== x) nan = true; else if (x > m) m = x; }
    if (inf) return Infinity;
    if (nan) return NaN;
    if (m === 0) return 0;
    let s = 0;
    for (const v of a) { const r = fabs(v) / m; s += r * r; }
    return m * sqrt(s);
  }
  const PI = 3.141592653589793, E_ = 2.718281828459045;

  const fnDef = (fn, mn, mx) => Object.freeze({ fn, min: mn, max: mx === undefined ? mn : mx });
  const FUNCS = Object.freeze(Object.assign(Object.create(null), {
    sin: fnDef(sin, 1), cos: fnDef(cos, 1), tan: fnDef(tan, 1), asin: fnDef(asin, 1), acos: fnDef(acos, 1), atan: fnDef(atan, 1),
    atan2: fnDef(atan2, 2), sinh: fnDef(sinh, 1), cosh: fnDef(cosh, 1), tanh: fnDef(tanh, 1), exp: fnDef(exp, 1), log: fnDef(log, 1),
    log10: fnDef(log10, 1), log2: fnDef(log2, 1), sqrt: fnDef(x => sqrt(x), 1), cbrt: fnDef(cbrt, 1), abs: fnDef(x => fabs(x), 1),
    sign: fnDef(sign, 1), min: fnDef(min, 1, 16), max: fnDef(max, 1, 16), floor: fnDef(x => Math.floor(x), 1),
    ceil: fnDef(x => Math.ceil(x), 1), round: fnDef(round, 1), trunc: fnDef(x => trunc(x), 1), pow: fnDef(pow, 2),
    hypot: fnDef(hypot, 1, 16), clamp: fnDef((x, lo, hi) => min(max(x, lo), hi), 3), lerp: fnDef((a, b, t) => a + (b - a) * t, 3),
    step: fnDef((edge, x) => (x < edge ? 0 : 1), 2),
  }));
  const CONSTS = Object.freeze({ pi: PI, e: E_ });
  const hasOwn = (o, k) => Object.prototype.hasOwnProperty.call(o, k);

  // ---------------------------------------------------------------- errors
  function fail(code, pos, msg) { const e = new Error(msg); e.code = code; e.pos = pos; return e; }
  const DEPTH_MSG = 'the expression is nested more than ' + LIMITS.depth + ' levels deep';
  const NODES_MSG = 'the expression has more than ' + LIMITS.nodes + ' parts';
  const FORBIDDEN = new Set(['constructor', 'prototype', 'this', 'new', 'function', 'return', 'var', 'let', 'const', 'class',
    'typeof', 'void', 'delete', 'in', 'instanceof', 'null', 'undefined', 'NaN', 'Infinity', 'eval', 'arguments', 'globalThis',
    'window', 'self', 'import', 'export', 'with', 'yield', 'await', 'if', 'else', 'for', 'while', 'do', 'super', 'None', 'True',
    'False', 'and', 'or', 'not', 'is', 'lambda']);
  const isForbidden = name => name.startsWith('__') || FORBIDDEN.has(name);
  const IDENT = /^[A-Za-z_][A-Za-z0-9_]*$/;
  const validName = n => typeof n === 'string' && IDENT.test(n) && !isForbidden(n) && n !== 'true' && n !== 'false';
  const arityMsg = (name, mn, mx, got) => mn === mx
    ? name + '() takes ' + mn + ' argument' + (mn === 1 ? '' : 's') + ', not ' + got
    : name + '() takes ' + mn + ' to ' + mx + ' arguments, not ' + got;

  // ---------------------------------------------------------------- lexer
  const isDigit = c => c !== undefined && c >= '0' && c <= '9';
  const isIdStart = c => c !== undefined && ((c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') || c === '_');
  const isIdChar = c => isIdStart(c) || isDigit(c);
  const ONE = new Set(['+', '-', '*', '/', '%', '^', '(', ')', ',', '?', ':', '<', '>', '!']);
  const TWO = new Set(['<=', '>=', '==', '!=', '&&', '||']);
  function charMsg(src, i) {
    const c = src[i];
    if (c === '=') return "'=' (assignment) is not allowed; use == to compare";
    if (c === '.') return "'.' (property access) is not allowed";
    if (c === '[' || c === ']') return "'" + c + "' (indexing) is not allowed";
    if (c === '"' || c === "'" || c === '`') return 'strings are not allowed';
    if (c === '&') return "use && for 'and'";
    if (c === '|') return "use || for 'or'";
    const cp = src.codePointAt(i);
    if (cp > 0x20 && cp < 0x7F) return "unexpected character '" + c + "'";
    return 'unexpected character U+' + cp.toString(16).toUpperCase().padStart(4, '0');
  }
  function lex(src) {
    const out = [], n = src.length;
    let i = 0;
    while (i < n) {
      const c = src[i];
      if (c === ' ' || c === '\t' || c === '\n' || c === '\r') { i++; continue; }
      if (isDigit(c) || (c === '.' && isDigit(src[i + 1]))) {
        let j = i;
        while (isDigit(src[j])) j++;
        if (src[j] === '.') { j++; while (isDigit(src[j])) j++; }
        if (src[j] === 'e' || src[j] === 'E') { let k = j + 1; if (src[k] === '+' || src[k] === '-') k++; if (isDigit(src[k])) { while (isDigit(src[k])) k++; j = k; } }
        if (isIdChar(src[j]) || src[j] === '.') throw fail('E_NUMBER', i, 'malformed number');
        const text = src.slice(i, j), v = Number(text);
        if (!isFinite(v)) throw fail('E_NUMBER', i, 'the number ' + text + ' is too large');
        out.push({ k: 'num', v, text, pos: i }); i = j; continue;
      }
      if (isIdStart(c)) {
        let j = i + 1;
        while (isIdChar(src[j])) j++;
        const name = src.slice(i, j);
        if (isForbidden(name)) throw fail('E_FORBIDDEN', i, "the name '" + name + "' is not allowed");
        if (name === 'true' || name === 'false') out.push({ k: 'bool', v: name === 'true', text: name, pos: i });
        else out.push({ k: 'id', v: name, text: name, pos: i });
        i = j; continue;
      }
      const two = src.slice(i, i + 2);
      if (TWO.has(two)) { out.push({ k: 'op', v: two, text: two, pos: i }); i += 2; continue; }
      if (ONE.has(c)) { out.push({ k: 'op', v: c, text: c, pos: i }); i++; continue; }
      throw fail('E_CHAR', i, charMsg(src, i));
    }
    out.push({ k: 'end', v: '', text: '', pos: n });
    return out;
  }

  // ---------------------------------------------------------------- parser (syntax and the size limits)
  function parseSyntax(src) {
    if (typeof src !== 'string') throw fail('E_SOURCE', 0, 'the expression must be a string');
    if (src.length > LIMITS.src) throw fail('E_TOO_LONG', LIMITS.src, 'the expression is longer than ' + LIMITS.src + ' characters');
    const toks = lex(src);
    if (toks.length === 1) throw fail('E_EMPTY', 0, 'the expression is empty');
    let p = 0, level = 0, count = 0;
    const depth = new Map();
    const isOp = v => toks[p].k === 'op' && toks[p].v === v;
    const mk = (node, kids) => {
      let d = 0;
      for (const kid of kids) { const kd = depth.get(kid); if (kd > d) d = kd; }
      d += 1;
      if (d > LIMITS.depth) throw fail('E_DEPTH', node.pos, DEPTH_MSG);
      if (++count > LIMITS.nodes) throw fail('E_TOO_BIG', node.pos, NODES_MSG);
      depth.set(node, d);
      return node;
    };
    const enter = pos => { if (++level > LIMITS.depth) throw fail('E_DEPTH', pos, DEPTH_MSG); };
    const unexpected = t => t.k === 'end' ? fail('E_SYNTAX', t.pos, 'unexpected end of the expression') : fail('E_SYNTAX', t.pos, "unexpected '" + t.text + "'");
    function ternary() {
      enter(toks[p].pos);
      let node = binary(2);
      if (isOp('?')) {
        const pos = toks[p++].pos;
        const a = ternary();
        if (!isOp(':')) throw fail('E_SYNTAX', toks[p].pos, "expected ':'");
        p++;
        const b = ternary();
        node = mk({ t: 'cond', c: node, a, b, pos }, [node, a, b]);
      }
      level--;
      return node;
    }
    // precedence climbing over || (2) && (3) == != (4) < <= > >= (5) + - (6) * / % (7): left-assoc, comparisons not chained
    const binPrec = t => (t.k === 'op' && t.v !== '^' && hasOwn(PREC, t.v) ? PREC[t.v] : 0);
    function binary(minPrec) {
      let left = unary();
      for (;;) {
        const t = toks[p], prec = binPrec(t);
        if (prec === 0 || prec < minPrec) return left;
        p++;
        const right = binary(prec + 1);
        left = mk({ t: 'bin', op: t.v, a: left, b: right, pos: t.pos }, [left, right]);
        if ((prec === 4 || prec === 5) && binPrec(toks[p]) === prec) throw fail('E_SYNTAX', toks[p].pos, 'comparisons cannot be chained (use && between them)');
      }
    }
    function unary() {
      const t = toks[p];
      if (t.k === 'op' && (t.v === '-' || t.v === '+' || t.v === '!')) {
        p++; enter(t.pos);
        const a = unary();
        level--;
        return mk({ t: 'un', op: t.v, a, pos: t.pos }, [a]);
      }
      return power();
    }
    function power() {   // primary ('^' unary)?  — right-assoc, tighter than a unary minus on its left: -2^2 = -(2^2)
      const base = primary();
      if (!isOp('^')) return base;
      const t = toks[p++];
      enter(t.pos);
      const ex = unary();
      level--;
      return mk({ t: 'bin', op: '^', a: base, b: ex, pos: t.pos }, [base, ex]);
    }
    function primary() {
      const t = toks[p];
      if (t.k === 'num') { p++; return mk({ t: 'num', v: t.v, pos: t.pos }, []); }
      if (t.k === 'bool') { p++; return mk({ t: 'bool', v: t.v, pos: t.pos }, []); }
      if (t.k === 'id') {
        p++;
        if (isOp('(')) {
          p++;
          const args = [];
          if (!isOp(')')) {
            for (;;) {
              args.push(ternary());
              if (isOp(',')) { p++; continue; }
              if (isOp(')')) break;
              throw fail('E_SYNTAX', toks[p].pos, "expected ',' or ')'");
            }
          }
          p++;
          return mk({ t: 'call', fn: t.v, args, pos: t.pos }, args);
        }
        if (hasOwn(CONSTS, t.v)) return mk({ t: 'const', name: t.v, pos: t.pos }, []);
        return mk({ t: 'var', name: t.v, pos: t.pos }, []);
      }
      if (isOp('(')) {
        p++;
        const node = ternary();
        if (!isOp(')')) throw fail('E_SYNTAX', toks[p].pos, "expected ')'");
        p++;
        return node;
      }
      throw unexpected(t);
    }
    const ast = ternary();
    if (toks[p].k !== 'end') throw unexpected(toks[p]);
    return ast;
  }

  // ---------------------------------------------------------------- a tree from outside (JSON): checked node by node
  const UN_OPS = new Set(['-', '+', '!']);
  const PREC = { '||': 2, '&&': 3, '==': 4, '!=': 4, '<': 5, '<=': 5, '>': 5, '>=': 5, '+': 6, '-': 6, '*': 7, '/': 7, '%': 7, '^': 9 };
  const BIN_OPS = new Set(Object.keys(PREC));
  const posOf = n => (n && typeof n === 'object' && Number.isInteger(n.pos) && n.pos >= 0) ? n.pos : -1;
  function validateAst(rootNode) {
    let count = 0;
    const bad = (node, why) => fail('E_AST', posOf(node), 'malformed expression tree: ' + why);
    function walk(node, d) {
      if (d > LIMITS.depth) throw fail('E_DEPTH', posOf(node), DEPTH_MSG);
      if (++count > LIMITS.nodes) throw fail('E_TOO_BIG', posOf(node), NODES_MSG);
      if (node === null || typeof node !== 'object' || Array.isArray(node)) throw bad(node, 'a node is not an object');
      if (node.pos !== undefined && posOf(node) < 0) throw bad(node, "'pos' must be a whole number >= 0");
      switch (node.t) {
        case 'num':
          if (typeof node.v !== 'number' || !isFinite(node.v) || node.v < 0 || isNegZero(node.v)) throw bad(node, 'a number must be finite and not negative');
          return;
        case 'bool': if (typeof node.v !== 'boolean') throw bad(node, "'v' of a bool must be true or false"); return;
        case 'const': if (node.name !== 'pi' && node.name !== 'e') throw bad(node, 'the constants are pi and e'); return;
        case 'var': if (!validName(node.name) || hasOwn(CONSTS, node.name)) throw bad(node, 'a variable needs a valid name'); return;
        case 'un': if (!UN_OPS.has(node.op)) throw bad(node, 'unknown unary operator'); walk(node.a, d + 1); return;
        case 'bin': if (!BIN_OPS.has(node.op)) throw bad(node, 'unknown binary operator'); walk(node.a, d + 1); walk(node.b, d + 1); return;
        case 'cond': walk(node.c, d + 1); walk(node.a, d + 1); walk(node.b, d + 1); return;
        case 'call':
          if (!validName(node.fn)) throw bad(node, 'a function needs a valid name');
          if (!Array.isArray(node.args)) throw bad(node, "'args' must be a list");
          for (const a of node.args) walk(a, d + 1);
          return;
        default: throw bad(node, 'unknown node type');
      }
    }
    walk(rootNode, 1);
    return rootNode;
  }

  // ---------------------------------------------------------------- meaning: functions, arity, variables
  function extraNames(list) {
    const s = new Set();
    for (const name of list || []) {
      if (!validName(name)) throw fail('E_FORBIDDEN', -1, "the name '" + String(name) + "' is not allowed for a function");
      s.add(name);
    }
    return s;
  }
  function semantic(ast, vars, extra) {   // → [{code, pos, msg}] sorted by pos
    const errs = [];
    (function walk(n) {
      switch (n.t) {
        case 'var': if (vars && !vars.has(n.name)) errs.push({ code: 'E_UNKNOWN_VAR', pos: posOf(n), msg: "unknown variable '" + n.name + "'" }); return;
        case 'un': walk(n.a); return;
        case 'bin': walk(n.a); walk(n.b); return;
        case 'cond': walk(n.c); walk(n.a); walk(n.b); return;
        case 'call': {
          const def = FUNCS[n.fn];
          const mn = def ? def.min : 0, mx = def ? def.max : LIMITS.args;
          if (!def && !extra.has(n.fn)) errs.push({ code: 'E_UNKNOWN_FN', pos: posOf(n), msg: "unknown function '" + n.fn + "'" });
          else if (n.args.length < mn || n.args.length > mx) errs.push({ code: 'E_ARITY', pos: posOf(n), msg: arityMsg(n.fn, mn, mx, n.args.length) });
          for (const a of n.args) walk(a);
          return;
        }
        default: return;
      }
    })(ast);
    return errs.sort((a, b) => a.pos - b.pos);
  }
  const throwFirst = errs => { if (errs.length) throw fail(errs[0].code, errs[0].pos, errs[0].msg); };

  /** parse(src, {fns?: [extra function names]}) → the tree; throws Error {code, pos} */
  function parse(src, opts) {
    const ast = parseSyntax(src);
    throwFirst(semantic(ast, null, extraNames(opts && opts.fns)));
    return ast;
  }
  /** check(src, {vars?: [names], fns?: [extra names], finite?}) → [] or [{code, pos, msg}] (finite is documentation only) */
  function check(src, opts) {
    opts = opts || {};
    let ast;
    try { ast = parseSyntax(src); } catch (e) { if (e && e.code) return [{ code: e.code, pos: e.pos, msg: e.message }]; throw e; }
    const vars = Array.isArray(opts.vars) ? new Set(opts.vars.filter(v => typeof v === 'string')) : null;
    let extra;
    try { extra = extraNames(opts.fns); } catch (e) { return [{ code: e.code, pos: e.pos, msg: e.message }]; }
    return semantic(ast, vars, extra);
  }

  // ---------------------------------------------------------------- evaluation: a tree of closures
  const num = v => (typeof v === 'boolean' ? (v ? 1 : 0) : v);
  const truthy = v => (typeof v === 'boolean' ? v : (v !== 0 && v === v));
  function build(node, ext) {
    const pos = posOf(node);
    switch (node.t) {
      case 'num': case 'bool': { const v = node.v; return () => v; }
      case 'const': { const v = CONSTS[node.name]; return () => v; }
      case 'var': {
        const name = node.name;
        return env => {
          if (!hasOwn(env, name)) throw fail('E_UNKNOWN_VAR', pos, "unknown variable '" + name + "'");
          const v = env[name];
          if (typeof v === 'number' || typeof v === 'boolean') return v;
          throw fail('E_VALUE', pos, "the variable '" + name + "' is not a number or a boolean");
        };
      }
      case 'un': {
        const a = build(node.a, ext);
        if (node.op === '-') return env => -num(a(env));
        if (node.op === '+') return env => num(a(env));
        return env => !truthy(a(env));
      }
      case 'cond': { const c = build(node.c, ext), a = build(node.a, ext), b = build(node.b, ext); return env => (truthy(c(env)) ? a(env) : b(env)); }
      case 'bin': {
        const a = build(node.a, ext), b = build(node.b, ext);
        switch (node.op) {
          case '&&': return env => (truthy(a(env)) ? truthy(b(env)) : false);
          case '||': return env => (truthy(a(env)) ? true : truthy(b(env)));
          case '+': return env => num(a(env)) + num(b(env));
          case '-': return env => num(a(env)) - num(b(env));
          case '*': return env => num(a(env)) * num(b(env));
          case '/': return env => num(a(env)) / num(b(env));
          case '%': return env => num(a(env)) % num(b(env));
          case '^': return env => { const x = num(a(env)); return pow(x, num(b(env))); };
          case '<': return env => num(a(env)) < num(b(env));
          case '<=': return env => num(a(env)) <= num(b(env));
          case '>': return env => num(a(env)) > num(b(env));
          case '>=': return env => num(a(env)) >= num(b(env));
          case '==': return env => num(a(env)) === num(b(env));
          default: return env => num(a(env)) !== num(b(env));   // '!='
        }
      }
      case 'call': {
        const args = node.args.map(x => build(x, ext)), name = node.fn;
        const def = FUNCS[name];
        if (def) {
          const f = def.fn;
          if (args.length === 1) { const a0 = args[0]; return env => f(num(a0(env))); }
          if (args.length === 2) { const a0 = args[0], a1 = args[1]; return env => { const x = num(a0(env)); return f(x, num(a1(env))); }; }
          return env => f(...args.map(g => num(g(env))));
        }
        const f = ext[name];
        return env => {
          const r = f(...args.map(g => num(g(env))));
          if (typeof r === 'number' || typeof r === 'boolean') return r;
          throw fail('E_VALUE', pos, "the function '" + name + "' did not return a number or a boolean");
        };
      }
    }
    throw fail('E_AST', pos, 'malformed expression tree: unknown node type');
  }
  /** compile(src | tree, {fns?: {name: function}}) → (env) => number | boolean */
  function compile(input, opts) {
    const given = (opts && opts.fns) || {};
    const ext = Object.create(null);
    for (const k of Object.keys(given)) if (typeof given[k] === 'function') ext[k] = given[k];
    const extra = extraNames(Object.keys(ext));
    const ast = typeof input === 'string' ? parseSyntax(input) : validateAst(input);
    throwFirst(semantic(ast, null, extra));
    const run = build(ast, ext);
    return function evaluateCompiled(env) {
      if (env === undefined || env === null) env = {};
      if (typeof env !== 'object') throw fail('E_ENV', 0, 'the variables must be given as an object');
      return run(env);
    };
  }
  const evaluate = (input, env, opts) => compile(input, opts)(env);

  // ---------------------------------------------------------------- printer: the canonical source of a tree
  const precOf = n => (n.t === 'cond' ? 1 : n.t === 'bin' ? PREC[n.op] : n.t === 'un' ? 8 : 10);
  function pr(n) {
    switch (n.t) {
      case 'num': return String(n.v);
      case 'bool': return n.v ? 'true' : 'false';
      case 'const': case 'var': return n.name;
      case 'call': return n.fn + '(' + n.args.map(pr).join(', ') + ')';
      case 'un': return n.op + wrap(n.a, 8);
      case 'cond': return wrap(n.c, 2) + ' ? ' + pr(n.a) + ' : ' + pr(n.b);
      default: {
        const p = PREC[n.op];
        if (n.op === '^') return wrap(n.a, 10) + '^' + wrap(n.b, 8);
        if (p === 4 || p === 5) return wrap(n.a, p + 1) + ' ' + n.op + ' ' + wrap(n.b, p + 1);
        return wrap(n.a, p) + ' ' + n.op + ' ' + wrap(n.b, p + 1);
      }
    }
  }
  const wrap = (n, minPrec) => (precOf(n) >= minPrec ? pr(n) : '(' + pr(n) + ')');
  /** print(tree) → source that parses back to the same tree (only the brackets it needs) */
  const print = ast => pr(validateAst(ast));

  root.NoemaExpr = Object.freeze({ parse, check, compile, evaluate, print, FUNCS, CONSTS, LIMITS });
  /* i18n-ignore-end */
})(typeof window !== 'undefined' ? window : globalThis);
