#!/usr/bin/env python3
"""The expression language of sim-spec@1 — the Python twin of src/engines/kernel/simexpr.js (docs/adr/001 D5,
docs/INTERACTIVE_SIMEXPR.md). Standard library only.

Same grammar, same JSON-able tree (dicts), same error codes and messages, and the same IEEE doubles bit for bit as the
JS twin (tests/simexpr.js runs a shared corpus and a seeded fuzz through both). For that the transcendental functions
are not math.* (libm differs from browsers in the last bit) but ports of fdlibm written with + - * / and bit access;
sqrt, floor, ceil, trunc, fabs and fmod are exact in IEEE 754. `/` and `%` follow IEEE / JavaScript (no exceptions).

  parse(src, fns=None)                  -> tree (dict); raises ExprError(code, pos, msg)
  check(src, vars=None, fns=None, finite=False) -> [] or [{code, pos, msg}]   (finite: documentation only)
  compile(src_or_tree, fns=None)        -> callable(env) -> float | bool      (fns: {name: callable})
  evaluate(src_or_tree, env, fns=None)  -> float | bool
  print_ast(tree)                       -> canonical source

  python3 tools/simexpr.py "2*x+1" x=3        evaluate on the command line
  python3 tools/simexpr.py --batch < jobs.json  (used by tests/simexpr.js)

The function ports are adapted from fdlibm (http://www.netlib.org/fdlibm) via V8's src/base/ieee754.cc:
 ====================================================
 Copyright (C) 1993 by Sun Microsystems, Inc. All rights reserved.
 Developed at SunSoft, a Sun Microsystems, Inc. business.
 Permission to use, copy, modify, and distribute this
 software is freely granted, provided that this notice
 is preserved.
 ====================================================
"""
import json
import math
import re
import struct
import sys

LIMITS = {'src': 2000, 'nodes': 2000, 'depth': 64, 'args': 16}
NAN = float('nan')
INF = float('inf')

# ---------------------------------------------------------------- doubles, word by word
_D = struct.Struct('<d')
_Q = struct.Struct('<Q')


def _bits(x):
    return _Q.unpack(_D.pack(x))[0]


def hiw(x):   # high word, signed (C int32_t)
    h = _bits(x) >> 32
    return h - 0x100000000 if h & 0x80000000 else h


def low(x):   # low word, unsigned
    return _bits(x) & 0xFFFFFFFF


def words(h, l):
    return _D.unpack(_Q.pack(((h & 0xFFFFFFFF) << 32) | (l & 0xFFFFFFFF)))[0]


def set_low(x, l):
    return _D.unpack(_Q.pack((_bits(x) & 0xFFFFFFFF00000000) | (l & 0xFFFFFFFF)))[0]


def set_high(x, h):
    return _D.unpack(_Q.pack(((h & 0xFFFFFFFF) << 32) | (_bits(x) & 0xFFFFFFFF)))[0]


def _neg_zero(v):
    return v == 0 and math.copysign(1.0, v) < 0


def fdiv(a, b):   # IEEE division (Python raises on / 0)
    if b == 0:
        if a == 0 or a != a:
            return NAN
        return INF if (a > 0) == (math.copysign(1.0, b) > 0) else -INF
    return a / b


def frem(a, b):   # JavaScript % (C fmod), exact
    if a != a or b != b or a in (INF, -INF) or b == 0:
        return NAN
    if b in (INF, -INF) or a == 0:
        return a
    return math.fmod(a, b)


def fsqrt(x):
    if x != x or x < 0:
        return NAN
    if x == INF:
        return x
    return math.sqrt(x)


def _trunc(x):   # float trunc, keeps -0 (x finite)
    r = float(math.trunc(x))
    return -0.0 if r == 0 and (x < 0 or _neg_zero(x)) else r


def ftrunc(x):
    if x != x or x in (INF, -INF) or x == 0:
        return x
    return _trunc(x)


def ffloor(x):
    if x != x or x in (INF, -INF) or x == 0:
        return x
    return float(math.floor(x))


def fceil(x):
    if x != x or x in (INF, -INF) or x == 0:
        return x
    r = float(math.ceil(x))
    return -0.0 if r == 0 and x < 0 else r


def _itrunc(x):   # C (int)x for a finite double in range
    return int(x)


TWO1023 = words(0x7FE00000, 0)
TWOM969 = words(0x03600000, 0)


def scalbn(x, n):   # x * 2^n, rounded once (musl)
    y = x
    if n > 1023:
        y *= TWO1023
        n -= 1023
        if n > 1023:
            y *= TWO1023
            n -= 1023
            if n > 1023:
                n = 1023
    elif n < -1022:
        y *= TWOM969
        n += 969
        if n < -1022:
            y *= TWOM969
            n += 969
            if n < -1022:
                n = -1022
    return y * words((0x3FF + n) << 20, 0)


# ---------------------------------------------------------------- argument reduction for sin / cos / tan
TWO_OVER_PI = [
    0xA2F983, 0x6E4E44, 0x1529FC, 0x2757D1, 0xF534DD, 0xC0DB62, 0x95993C, 0x439041, 0xFE5163, 0xABDEBB, 0xC561B7, 0x246E3A,
    0x424DD2, 0xE00649, 0x2EEA09, 0xD1921C, 0xFE1DEB, 0x1CB129, 0xA73EE8, 0x8235F5, 0x2EBB44, 0x84E99C, 0x7026B4, 0x5F7E41,
    0x3991D6, 0x398353, 0x39F49C, 0x845F8B, 0xBDF928, 0x3B1FF8, 0x97FFDE, 0x05980F, 0xEF2F11, 0x8B5A0A, 0x6D1F6D, 0x367ECF,
    0x27CB09, 0xB74F46, 0x3F669E, 0x5FEA2D, 0x7527BA, 0xC7EBE5, 0xF17B3D, 0x0739F7, 0x8A5292, 0xEA6BFB, 0x5FB11F, 0x8D5D08,
    0x560330, 0x46FC7B, 0x6BABF0, 0xCFBC20, 0x9AF436, 0x1DA9E3, 0x91615E, 0xE61B08, 0x659985, 0x5F14A0, 0x68408D, 0xFFD880,
    0x4D7327, 0x310606, 0x1556CA, 0x73A8C9, 0x60E27B, 0xC08C6B]
NPIO2_HW = [
    0x3FF921FB, 0x400921FB, 0x4012D97C, 0x401921FB, 0x401F6A7A, 0x4022D97C, 0x4025FDBB, 0x402921FB, 0x402C463A, 0x402F6A7A,
    0x4031475C, 0x4032D97C, 0x40346B9C, 0x4035FDBB, 0x40378FDB, 0x403921FB, 0x403AB41B, 0x403C463A, 0x403DD85A, 0x403F6A7A,
    0x40407E4C, 0x4041475C, 0x4042106C, 0x4042D97C, 0x4043A28C, 0x40446B9C, 0x404534AC, 0x4045FDBB, 0x4046C6CB, 0x40478FDB,
    0x404858EB, 0x404921FB]
PIO2 = [1.57079625129699707031e+00, 7.54978941586159635335e-08, 5.39030252995776476554e-15, 3.28200341580791294123e-22,
        1.27065575308067607349e-29, 1.22933308981111328932e-36, 2.73370053816464559624e-44, 2.16741683877804819444e-51]


def _kernel_rem_pio2(x, e0, nx):   # prec 2 (jk = 4), as V8 → (n & 7, y0, y1)
    two24 = 1.67772160000000000000e+07
    twon24 = 5.96046447753906250000e-08
    jk = 4
    jp = 4
    iq = [0] * 20
    f = [0.0] * 20
    fq = [0.0] * 20
    q = [0.0] * 20
    jx = nx - 1
    jv = _itrunc((e0 - 3) / 24)
    if jv < 0:
        jv = 0
    q0 = e0 - 24 * (jv + 1)
    j = jv - jx
    m = jx + jk
    for i in range(m + 1):
        f[i] = 0.0 if j < 0 else float(TWO_OVER_PI[j])
        j += 1
    for i in range(jk + 1):
        fw = 0.0
        for j in range(jx + 1):
            fw += x[j] * f[jx + i - j]
        q[i] = fw
    jz = jk
    while True:   # recompute:
        i = 0
        j = jz
        z = q[jz]
        while j > 0:
            fw = float(_itrunc(twon24 * z))
            iq[i] = _itrunc(z - two24 * fw)
            z = q[j - 1] + fw
            i += 1
            j -= 1
        z = scalbn(z, q0)
        z -= 8.0 * float(math.floor(z * 0.125))
        n = _itrunc(z)
        z -= float(n)
        ih = 0
        if q0 > 0:
            i = iq[jz - 1] >> (24 - q0)
            n += i
            iq[jz - 1] -= i << (24 - q0)
            ih = iq[jz - 1] >> (23 - q0)
        elif q0 == 0:
            ih = iq[jz - 1] >> 23
        elif z >= 0.5:
            ih = 2
        if ih > 0:
            n += 1
            carry = 0
            for i in range(jz):
                j = iq[i]
                if carry == 0:
                    if j != 0:
                        carry = 1
                        iq[i] = 0x1000000 - j
                else:
                    iq[i] = 0xFFFFFF - j
            if q0 > 0:
                if q0 == 1:
                    iq[jz - 1] &= 0x7FFFFF
                elif q0 == 2:
                    iq[jz - 1] &= 0x3FFFFF
            if ih == 2:
                z = 1.0 - z
                if carry != 0:
                    z -= scalbn(1.0, q0)
        if z == 0:
            j = 0
            for i in range(jz - 1, jk - 1, -1):
                j |= iq[i]
            if j == 0:
                k = 1
                while jk >= k and iq[jk - k] == 0:
                    k += 1
                for i in range(jz + 1, jz + k + 1):
                    f[jx + i] = float(TWO_OVER_PI[jv + i])
                    fw = 0.0
                    for j in range(jx + 1):
                        fw += x[j] * f[jx + i - j]
                    q[i] = fw
                jz += k
                continue
        break
    if z == 0:
        jz -= 1
        q0 -= 24
        while iq[jz] == 0:
            jz -= 1
            q0 -= 24
    else:
        z = scalbn(z, -q0)
        if z >= two24:
            fw = float(_itrunc(twon24 * z))
            iq[jz] = _itrunc(z - two24 * fw)
            jz += 1
            q0 += 24
            iq[jz] = _itrunc(fw)
        else:
            iq[jz] = _itrunc(z)
    fw = scalbn(1.0, q0)
    for i in range(jz, -1, -1):
        q[i] = fw * iq[i]
        fw *= twon24
    for i in range(jz, -1, -1):
        fw = 0.0
        k = 0
        while k <= jp and k <= jz - i:
            fw += PIO2[k] * q[i + k]
            k += 1
        fq[jz - i] = fw
    fw = 0.0
    for i in range(jz, -1, -1):
        fw += fq[i]
    y0 = fw if ih == 0 else -fw
    fw = fq[0] - fw
    for i in range(1, jz + 1):
        fw += fq[i]
    y1 = fw if ih == 0 else -fw
    return n & 7, y0, y1


def _rem_pio2(x):   # → (n, y0, y1) with x - n*pi/2 = y0 + y1
    invpio2 = 6.36619772367581382433e-01
    pio2_1 = 1.57079632673412561417e+00
    pio2_1t = 6.07710050650619224932e-11
    pio2_2 = 6.07710050630396597660e-11
    pio2_2t = 2.02226624879595063154e-21
    pio2_3 = 2.02226624871116645580e-21
    pio2_3t = 8.47842766036889956997e-32
    hx = hiw(x)
    ix = hx & 0x7FFFFFFF
    if ix <= 0x3FE921FB:
        return 0, x, 0.0
    if ix < 0x4002D97C:
        if hx > 0:
            z = x - pio2_1
            if ix != 0x3FF921FB:
                y0 = z - pio2_1t
                y1 = (z - y0) - pio2_1t
            else:
                z -= pio2_2
                y0 = z - pio2_2t
                y1 = (z - y0) - pio2_2t
            return 1, y0, y1
        z = x + pio2_1
        if ix != 0x3FF921FB:
            y0 = z + pio2_1t
            y1 = (z - y0) + pio2_1t
        else:
            z += pio2_2
            y0 = z + pio2_2t
            y1 = (z - y0) + pio2_2t
        return -1, y0, y1
    if ix <= 0x413921FB:
        t = math.fabs(x)
        n = _itrunc(t * invpio2 + 0.5)
        fn = float(n)
        r = t - fn * pio2_1
        w = fn * pio2_1t
        if n < 32 and ix != NPIO2_HW[n - 1]:
            y0 = r - w
        else:
            j = ix >> 20
            y0 = r - w
            i = j - ((hiw(y0) >> 20) & 0x7FF)
            if i > 16:
                t = r
                w = fn * pio2_2
                r = t - w
                w = fn * pio2_2t - ((t - r) - w)
                y0 = r - w
                i = j - ((hiw(y0) >> 20) & 0x7FF)
                if i > 49:
                    t = r
                    w = fn * pio2_3
                    r = t - w
                    w = fn * pio2_3t - ((t - r) - w)
                    y0 = r - w
        y1 = (r - y0) - w
        if hx < 0:
            return -n, -y0, -y1
        return n, y0, y1
    if ix >= 0x7FF00000:
        v = x - x
        return 0, v, v
    z = words(0, low(x))
    e0 = (ix >> 20) - 1046
    z = set_high(z, ix - (e0 << 20))
    tx = [0.0, 0.0, 0.0]
    for i in range(2):
        tx[i] = float(_itrunc(z))
        z = (z - tx[i]) * 1.67772160000000000000e+07
    tx[2] = z
    nx = 3
    while tx[nx - 1] == 0:
        nx -= 1
    n, y0, y1 = _kernel_rem_pio2(tx, e0, nx)
    if hx < 0:
        return -n, -y0, -y1
    return n, y0, y1


def _k_cos(x, y):
    C1 = 4.16666666666666019037e-02
    C2 = -1.38888888888741095749e-03
    C3 = 2.48015872894767294178e-05
    C4 = -2.75573143513906633035e-07
    C5 = 2.08757232129817482790e-09
    C6 = -1.13596475577881948265e-11
    ix = hiw(x) & 0x7FFFFFFF
    if ix < 0x3E400000:
        return 1.0
    z = x * x
    r = z * (C1 + z * (C2 + z * (C3 + z * (C4 + z * (C5 + z * C6)))))
    if ix < 0x3FD33333:
        return 1.0 - (0.5 * z - (z * r - x * y))
    qx = 0.28125 if ix > 0x3FE90000 else words(ix - 0x00200000, 0)
    iz = 0.5 * z - qx
    a = 1.0 - qx
    return a - (iz - (z * r - x * y))


def _k_sin(x, y, iy):
    S1 = -1.66666666666666324348e-01
    S2 = 8.33333333332248946124e-03
    S3 = -1.98412698298579493134e-04
    S4 = 2.75573137070700676789e-06
    S5 = -2.50507602534068634195e-08
    S6 = 1.58969099521155010221e-10
    ix = hiw(x) & 0x7FFFFFFF
    if ix < 0x3E400000:
        return x
    z = x * x
    v = z * x
    r = S2 + z * (S3 + z * (S4 + z * (S5 + z * S6)))
    if iy == 0:
        return x + v * (S1 + z * r)
    return x - ((z * (0.5 * y - v * r) - y) - v * S1)


TT = [3.33333333333334091986e-01, 1.33333333333201242699e-01, 5.39682539762260521377e-02, 2.18694882948595424599e-02,
      8.86323982359930005737e-03, 3.59207910759131235356e-03, 1.45620945432529025516e-03, 5.88041240820264096874e-04,
      2.46463134818469906812e-04, 7.81794442939557092300e-05, 7.14072491382608190305e-05, -1.85586374855275456654e-05,
      2.59073051863633712884e-05]


def _k_tan(x, y, iy):
    pio4 = 7.85398163397448278999e-01
    pio4lo = 3.06161699786838301793e-17
    hx = hiw(x)
    ix = hx & 0x7FFFFFFF
    if ix < 0x3E300000:
        if ((ix | low(x)) | (iy + 1)) == 0:
            return fdiv(1.0, math.fabs(x))
        if iy == 1:
            return x
        z = w = x + y
        z = set_low(z, 0)
        v = y - (z - x)
        t = a = fdiv(-1.0, w)
        t = set_low(t, 0)
        s = 1.0 + t * z
        return t + a * (s + t * v)
    if ix >= 0x3FE59428:
        if hx < 0:
            x = -x
            y = -y
        z = pio4 - x
        w = pio4lo - y
        x = z + w
        y = 0.0
    z = x * x
    w = z * z
    r = TT[1] + w * (TT[3] + w * (TT[5] + w * (TT[7] + w * (TT[9] + w * TT[11]))))
    v = z * (TT[2] + w * (TT[4] + w * (TT[6] + w * (TT[8] + w * (TT[10] + w * TT[12])))))
    s = z * x
    r = y + z * (s * (r + v) + y)
    r += TT[0] * s
    w = x + r
    if ix >= 0x3FE59428:
        v = float(iy)
        return float(1 - ((hx >> 30) & 2)) * (v - 2.0 * (x - (fdiv(w * w, w + v) - r)))
    if iy == 1:
        return w
    z = set_low(w, 0)
    v = r - (z - x)
    t = a = fdiv(-1.0, w)
    t = set_low(t, 0)
    s = 1.0 + t * z
    return t + a * (s + t * v)


def sin(x):
    ix = hiw(x) & 0x7FFFFFFF
    if ix <= 0x3FE921FB:
        return _k_sin(x, 0.0, 0)
    if ix >= 0x7FF00000:
        return x - x
    n, y0, y1 = _rem_pio2(x)
    n &= 3
    if n == 0:
        return _k_sin(y0, y1, 1)
    if n == 1:
        return _k_cos(y0, y1)
    if n == 2:
        return -_k_sin(y0, y1, 1)
    return -_k_cos(y0, y1)


def cos(x):
    ix = hiw(x) & 0x7FFFFFFF
    if ix <= 0x3FE921FB:
        return _k_cos(x, 0.0)
    if ix >= 0x7FF00000:
        return x - x
    n, y0, y1 = _rem_pio2(x)
    n &= 3
    if n == 0:
        return _k_cos(y0, y1)
    if n == 1:
        return -_k_sin(y0, y1, 1)
    if n == 2:
        return -_k_cos(y0, y1)
    return _k_sin(y0, y1, 1)


def tan(x):
    ix = hiw(x) & 0x7FFFFFFF
    if ix <= 0x3FE921FB:
        return _k_tan(x, 0.0, 1)
    if ix >= 0x7FF00000:
        return x - x
    n, y0, y1 = _rem_pio2(x)
    return _k_tan(y0, y1, 1 - ((n & 1) << 1))


# ---------------------------------------------------------------- inverse trigonometric
pS0 = 1.66666666666666657415e-01
pS1 = -3.25565818622400915405e-01
pS2 = 2.01212532134862925881e-01
pS3 = -4.00555345006794114027e-02
pS4 = 7.91534994289814532176e-04
pS5 = 3.47933107596021167570e-05
qS1 = -2.40339491173441421878e+00
qS2 = 2.02094576023350569471e+00
qS3 = -6.88283971605453293030e-01
qS4 = 7.70381505559019352791e-02
PIO2_HI = 1.57079632679489655800e+00
PIO2_LO = 6.12323399573676603587e-17
PIO4_HI = 7.85398163397448278999e-01
PI_D = 3.14159265358979311600e+00


def asin(x):
    t = 0.0
    hx = hiw(x)
    ix = hx & 0x7FFFFFFF
    if ix >= 0x3FF00000:
        if ((ix - 0x3FF00000) | low(x)) == 0:
            return x * PIO2_HI + x * PIO2_LO
        return NAN
    elif ix < 0x3FE00000:
        if ix < 0x3E400000:
            if 1.0e300 + x > 1.0:
                return x
        else:
            t = x * x
        p = t * (pS0 + t * (pS1 + t * (pS2 + t * (pS3 + t * (pS4 + t * pS5)))))
        q = 1.0 + t * (qS1 + t * (qS2 + t * (qS3 + t * qS4)))
        w = p / q
        return x + x * w
    w = 1.0 - math.fabs(x)
    t = w * 0.5
    p = t * (pS0 + t * (pS1 + t * (pS2 + t * (pS3 + t * (pS4 + t * pS5)))))
    q = 1.0 + t * (qS1 + t * (qS2 + t * (qS3 + t * qS4)))
    s = fsqrt(t)
    if ix >= 0x3FEF3333:
        w = p / q
        t = PIO2_HI - (2.0 * (s + s * w) - PIO2_LO)
    else:
        w = set_low(s, 0)
        c = (t - w * w) / (s + w)
        r = p / q
        p = 2.0 * s * r - (PIO2_LO - 2.0 * c)
        q = PIO4_HI - 2.0 * w
        t = PIO4_HI - (p - q)
    return t if hx > 0 else -t


def acos(x):
    hx = hiw(x)
    ix = hx & 0x7FFFFFFF
    if ix >= 0x3FF00000:
        if ((ix - 0x3FF00000) | low(x)) == 0:
            return 0.0 if hx > 0 else PI_D + 2.0 * PIO2_LO
        return NAN
    if ix < 0x3FE00000:
        if ix <= 0x3C600000:
            return PIO2_HI + PIO2_LO
        z = x * x
        p = z * (pS0 + z * (pS1 + z * (pS2 + z * (pS3 + z * (pS4 + z * pS5)))))
        q = 1.0 + z * (qS1 + z * (qS2 + z * (qS3 + z * qS4)))
        r = p / q
        return PIO2_HI - (x - (PIO2_LO - x * r))
    elif hx < 0:
        z = (1.0 + x) * 0.5
        p = z * (pS0 + z * (pS1 + z * (pS2 + z * (pS3 + z * (pS4 + z * pS5)))))
        q = 1.0 + z * (qS1 + z * (qS2 + z * (qS3 + z * qS4)))
        s = fsqrt(z)
        r = p / q
        w = r * s - PIO2_LO
        return PI_D - 2.0 * (s + w)
    z = (1.0 - x) * 0.5
    s = fsqrt(z)
    df = set_low(s, 0)
    c = (z - df * df) / (s + df)
    p = z * (pS0 + z * (pS1 + z * (pS2 + z * (pS3 + z * (pS4 + z * pS5)))))
    q = 1.0 + z * (qS1 + z * (qS2 + z * (qS3 + z * qS4)))
    r = p / q
    w = r * s + c
    return 2.0 * (df + w)


ATANHI = [4.63647609000806093515e-01, 7.85398163397448278999e-01, 9.82793723247329054082e-01, 1.57079632679489655800e+00]
ATANLO = [2.26987774529616870924e-17, 3.06161699786838301793e-17, 1.39033110312309984516e-17, 6.12323399573676603587e-17]
AT = [3.33333333333329318027e-01, -1.99999999998764832476e-01, 1.42857142725034663711e-01, -1.11111104054623557880e-01,
      9.09088713343650656196e-02, -7.69187620504482999495e-02, 6.66107313738753120669e-02, -5.83357013379057348645e-02,
      4.97687799461593236017e-02, -3.65315727442169155270e-02, 1.62858201153657823623e-02]


def atan(x):
    hx = hiw(x)
    ix = hx & 0x7FFFFFFF
    if ix >= 0x44100000:
        if x != x:
            return x + x
        return ATANHI[3] + ATANLO[3] if hx > 0 else -ATANHI[3] - ATANLO[3]
    if ix < 0x3FDC0000:
        if ix < 0x3E400000:
            if 1.0e300 + x > 1.0:
                return x
        idx = -1
    else:
        x = math.fabs(x)
        if ix < 0x3FF30000:
            if ix < 0x3FE60000:
                idx = 0
                x = (2.0 * x - 1.0) / (2.0 + x)
            else:
                idx = 1
                x = (x - 1.0) / (x + 1.0)
        elif ix < 0x40038000:
            idx = 2
            x = (x - 1.5) / (1.0 + 1.5 * x)
        else:
            idx = 3
            x = -1.0 / x
    z = x * x
    w = z * z
    s1 = z * (AT[0] + w * (AT[2] + w * (AT[4] + w * (AT[6] + w * (AT[8] + w * AT[10])))))
    s2 = w * (AT[1] + w * (AT[3] + w * (AT[5] + w * (AT[7] + w * AT[9]))))
    if idx < 0:
        return x - x * (s1 + s2)
    z = ATANHI[idx] - ((x * (s1 + s2) - ATANLO[idx]) - x)
    return -z if hx < 0 else z


def atan2(y, x):
    tiny = 1.0e-300
    pi_o_4 = 7.8539816339744827900E-01
    pi_o_2 = 1.5707963267948965580E+00
    pi = 3.1415926535897931160E+00
    pi_lo = 1.2246467991473531772E-16
    if x != x or y != y:
        return x + y
    hx = hiw(x)
    lx = low(x)
    ix = hx & 0x7FFFFFFF
    hy = hiw(y)
    ly = low(y)
    iy = hy & 0x7FFFFFFF
    if x == 1.0:
        return atan(y)
    m = ((hy >> 31) & 1) | ((hx >> 30) & 2)
    if (iy | ly) == 0:
        if m in (0, 1):
            return y
        return pi + tiny if m == 2 else -pi - tiny
    if (ix | lx) == 0:
        return -pi_o_2 - tiny if hy < 0 else pi_o_2 + tiny
    if ix == 0x7FF00000:
        if iy == 0x7FF00000:
            return [pi_o_4 + tiny, -pi_o_4 - tiny, 3.0 * pi_o_4 + tiny, -3.0 * pi_o_4 - tiny][m]
        return [0.0, -0.0, pi + tiny, -pi - tiny][m]
    if iy == 0x7FF00000:
        return -pi_o_2 - tiny if hy < 0 else pi_o_2 + tiny
    k = (iy - ix) >> 20
    if k > 60:
        z = pi_o_2 + 0.5 * pi_lo
        m &= 1
    elif hx < 0 and k < -60:
        z = 0.0
    else:
        z = atan(math.fabs(y / x))
    if m == 0:
        return z
    if m == 1:
        return -z
    if m == 2:
        return pi - (z - pi_lo)
    return (z - pi_lo) - pi


# ---------------------------------------------------------------- exponential and logarithms
P1 = 1.66666666666666019037e-01
P2 = -2.77777777770155933842e-03
P3 = 6.61375632143793436117e-05
P4 = -1.65339022054652515390e-06
P5 = 4.13813679705723846039e-08
LN2_HI = 6.93147180369123816490e-01
LN2_LO = 1.90821492927058770002e-10
INVLN2 = 1.44269504088896338700e+00
TWO54 = 1.80143985094819840000e+16
Lg1 = 6.666666666666735130e-01
Lg2 = 3.999999999940941908e-01
Lg3 = 2.857142874366239149e-01
Lg4 = 2.222219843214978396e-01
Lg5 = 1.818357216161805012e-01
Lg6 = 1.531383769920937332e-01
Lg7 = 1.479819860511658591e-01


def exp(x):
    o_threshold = 7.09782712893383973096e+02
    u_threshold = -7.45133219101941108420e+02
    E = 2.718281828459045
    huge = 1.0e+300
    twom1000 = 9.33263618503218878990e-302
    two1023 = 8.988465674311579539e307
    hi = 0.0
    lo = 0.0
    k = 0
    hx = hiw(x)
    xsb = (hx >> 31) & 1
    hx &= 0x7FFFFFFF
    if hx >= 0x40862E42:
        if hx >= 0x7FF00000:
            if ((hx & 0xFFFFF) | low(x)) != 0:
                return x + x
            return x if xsb == 0 else 0.0
        if x > o_threshold:
            return huge * huge
        if x < u_threshold:
            return twom1000 * twom1000
    if hx > 0x3FD62E42:
        if hx < 0x3FF0A2B2:
            if x == 1.0:
                return E
            hi = x - (-LN2_HI if xsb else LN2_HI)
            lo = -LN2_LO if xsb else LN2_LO
            k = 1 - xsb - xsb
        else:
            k = _itrunc(INVLN2 * x + (-0.5 if xsb else 0.5))
            t = float(k)
            hi = x - t * LN2_HI
            lo = t * LN2_LO
        x = hi - lo
    elif hx < 0x3E300000:
        if huge + x > 1.0:
            return 1.0 + x
    else:
        k = 0
    t = x * x
    twopk = words(0x3FF00000 + (k << 20), 0) if k >= -1021 else words(0x3FF00000 + ((k + 1000) << 20), 0)
    c = x - t * (P1 + t * (P2 + t * (P3 + t * (P4 + t * P5))))
    if k == 0:
        return 1.0 - ((x * c) / (c - 2.0) - x)
    y = 1.0 - ((lo - (x * c) / (2.0 - c)) - hi)
    if k >= -1021:
        if k == 1024:
            return y * 2.0 * two1023
        return y * twopk
    return y * twopk * twom1000


def expm1(x):
    o_threshold = 7.09782712893383973096e+02
    huge = 1.0e+300
    tiny = 1.0e-300
    Q1 = -3.33333333333331316428e-02
    Q2 = 1.58730158725481460165e-03
    Q3 = -7.93650757867487942473e-05
    Q4 = 4.00821782732936239552e-06
    Q5 = -2.01099218183624371326e-07
    c = 0.0
    hx = hiw(x)
    xsb = hx & 0x80000000
    hx &= 0x7FFFFFFF
    if hx >= 0x4043687A:
        if hx >= 0x40862E42:
            if hx >= 0x7FF00000:
                if ((hx & 0xFFFFF) | low(x)) != 0:
                    return x + x
                return x if xsb == 0 else -1.0
            if x > o_threshold:
                return huge * huge
        if xsb != 0:
            if x + tiny < 0.0:
                return tiny - 1.0
    if hx > 0x3FD62E42:
        if hx < 0x3FF0A2B2:
            if xsb == 0:
                hi = x - LN2_HI
                lo = LN2_LO
                k = 1
            else:
                hi = x + LN2_HI
                lo = -LN2_LO
                k = -1
        else:
            k = _itrunc(INVLN2 * x + (0.5 if xsb == 0 else -0.5))
            t = float(k)
            hi = x - t * LN2_HI
            lo = t * LN2_LO
        x = hi - lo
        c = (hi - x) - lo
    elif hx < 0x3C900000:
        t = huge + x
        return x - (t - (huge + x))
    else:
        k = 0
    hfx = 0.5 * x
    hxs = x * hfx
    r1 = 1.0 + hxs * (Q1 + hxs * (Q2 + hxs * (Q3 + hxs * (Q4 + hxs * Q5))))
    t = 3.0 - r1 * hfx
    e = hxs * ((r1 - t) / (6.0 - x * t))
    if k == 0:
        return x - (x * e - hxs)
    twopk = words(0x3FF00000 + (k << 20), 0)
    e = (x * (e - c) - c)
    e -= hxs
    if k == -1:
        return 0.5 * (x - e) - 0.5
    if k == 1:
        if x < -0.25:
            return -2.0 * (e - (x + 0.5))
        return 1.0 + 2.0 * (x - e)
    if k <= -2 or k > 56:
        y = 1.0 - (e - x)
        y = y * 2.0 * 8.98846567431158e+307 if k == 1024 else y * twopk
        return y - 1.0
    if k < 20:
        t = words(0x3FF00000 - (0x200000 >> k), 0)
        y = t - (e - x)
        y = y * twopk
    else:
        t = words((0x3FF - k) << 20, 0)
        y = x - (e + t)
        y += 1.0
        y = y * twopk
    return y


def log(x):
    hx = hiw(x)
    lx = low(x)
    k = 0
    if hx < 0x00100000:
        if ((hx & 0x7FFFFFFF) | lx) == 0:
            return -INF
        if hx < 0:
            return NAN
        k -= 54
        x *= TWO54
        hx = hiw(x)
    if hx >= 0x7FF00000:
        return x + x
    k += (hx >> 20) - 1023
    hx &= 0x000FFFFF
    i = (hx + 0x95F64) & 0x100000
    x = set_high(x, hx | (i ^ 0x3FF00000))
    k += i >> 20
    f = x - 1.0
    if (0x000FFFFF & (2 + hx)) < 3:
        if f == 0:
            if k == 0:
                return 0.0
            dk = float(k)
            return dk * LN2_HI + dk * LN2_LO
        R = f * f * (0.5 - 0.33333333333333333 * f)
        if k == 0:
            return f - R
        dk = float(k)
        return dk * LN2_HI - ((R - dk * LN2_LO) - f)
    s = f / (2.0 + f)
    dk = float(k)
    z = s * s
    i = hx - 0x6147A
    w = z * z
    j = 0x6B851 - hx
    t1 = w * (Lg2 + w * (Lg4 + w * Lg6))
    t2 = z * (Lg1 + w * (Lg3 + w * (Lg5 + w * Lg7)))
    i |= j
    R = t2 + t1
    if i > 0:
        hfsq = 0.5 * f * f
        if k == 0:
            return f - (hfsq - s * (hfsq + R))
        return dk * LN2_HI - ((hfsq - (s * (hfsq + R) + dk * LN2_LO)) - f)
    if k == 0:
        return f - s * (f - R)
    return dk * LN2_HI - ((s * (f - R) - dk * LN2_LO) - f)


def _k_log1p(f):
    s = f / (2.0 + f)
    z = s * s
    w = z * z
    t1 = w * (Lg2 + w * (Lg4 + w * Lg6))
    t2 = z * (Lg1 + w * (Lg3 + w * (Lg5 + w * Lg7)))
    R = t2 + t1
    hfsq = 0.5 * f * f
    return s * (hfsq + R)


def log2(x):
    ivln2hi = 1.44269504072144627571e+00
    ivln2lo = 1.67517131648865118353e-10
    hx = hiw(x)
    lx = low(x)
    k = 0
    if hx < 0x00100000:
        if ((hx & 0x7FFFFFFF) | lx) == 0:
            return -INF
        if hx < 0:
            return NAN
        k -= 54
        x *= TWO54
        hx = hiw(x)
    if hx >= 0x7FF00000:
        return x + x
    if hx == 0x3FF00000 and lx == 0:
        return 0.0
    k += (hx >> 20) - 1023
    hx &= 0x000FFFFF
    i = (hx + 0x95F64) & 0x100000
    x = set_high(x, hx | (i ^ 0x3FF00000))
    k += i >> 20
    y = float(k)
    f = x - 1.0
    hfsq = 0.5 * f * f
    r = _k_log1p(f)
    hi = set_low(f - hfsq, 0)
    lo = (f - hi) - hfsq + r
    val_hi = hi * ivln2hi
    val_lo = (lo + hi) * ivln2lo + lo * ivln2hi
    w = y + val_hi
    val_lo += (y - w) + val_hi
    val_hi = w
    return val_lo + val_hi


def log10(x):
    ivln10 = 4.34294481903251816668e-01
    log10_2hi = 3.01029995663611771306e-01
    log10_2lo = 3.69423907715893078616e-13
    hx = hiw(x)
    lx = low(x)
    k = 0
    if hx < 0x00100000:
        if ((hx & 0x7FFFFFFF) | lx) == 0:
            return -INF
        if hx < 0:
            return NAN
        k -= 54
        x *= TWO54
        hx = hiw(x)
        lx = low(x)
    if hx >= 0x7FF00000:
        return x + x
    if hx == 0x3FF00000 and lx == 0:
        return 0.0
    k += (hx >> 20) - 1023
    i = 1 if k < 0 else 0
    hx = (hx & 0x000FFFFF) | ((0x3FF - i) << 20)
    y = float(k + i)
    x = words(hx, lx)
    z = y * log10_2lo + ivln10 * log(x)
    return z + y * log10_2hi


def cbrt(x):
    B1 = 715094163
    B2 = 696219795
    P0 = 1.87595182427177009643
    PP1 = -1.88497979543377169875
    PP2 = 1.621429720105354466140
    PP3 = -0.758397934778766047437
    PP4 = 0.145996192886612446982
    hx = hiw(x) & 0xFFFFFFFF
    lw = low(x)
    sign = hx & 0x80000000
    hx ^= sign
    if hx >= 0x7FF00000:
        return x + x
    if hx < 0x00100000:
        if (hx | lw) == 0:
            return x
        t = words(0x43500000, 0)
        t *= x
        high = hiw(t) & 0xFFFFFFFF
        t = words(sign | ((high & 0x7FFFFFFF) // 3 + B2), 0)
    else:
        t = words(sign | (hx // 3 + B1), 0)
    r = (t * t) * (t / x)
    t = t * ((P0 + r * (PP1 + r * PP2)) + ((r * r) * r) * (PP3 + r * PP4))
    b = ((_bits(t) + 0x80000000) & 0xFFFFFFFFC0000000) & 0xFFFFFFFFFFFFFFFF
    t = _D.unpack(_Q.pack(b))[0]
    s = t * t
    r = x / s
    w = t + t
    r = (r - t) / (w + r)
    t = t + t * r
    return t


# ---------------------------------------------------------------- power
def pow(x, y):
    bp = (1.0, 1.5)
    dp_h = (0.0, 5.84962487220764160156e-01)
    dp_l = (0.0, 1.35003920212974897128e-08)
    two53 = 9007199254740992.0
    huge = 1.0e300
    tiny = 1.0e-300
    L1 = 5.99999999999994648725e-01
    L2 = 4.28571428578550184252e-01
    L3 = 3.33333329818377432918e-01
    L4 = 2.72728123808534006489e-01
    L5 = 2.30660745775561754067e-01
    L6 = 2.06975017800338417784e-01
    lg2 = 6.93147180559945286227e-01
    lg2_h = 6.93147182464599609375e-01
    lg2_l = -1.90465429995776804525e-09
    ovt = 8.0085662595372944372e-0017
    cp = 9.61796693925975554329e-01
    cp_h = 9.61796700954437255859e-01
    cp_l = -7.02846165095275826516e-09
    ivln2 = 1.44269504088896338700e+00
    ivln2_h = 1.44269502162933349609e+00
    ivln2_l = 1.92596299112661746887e-08
    hx = hiw(x)
    lx = low(x)
    hy = hiw(y)
    ly = low(y)
    ix = hx & 0x7FFFFFFF
    iy = hy & 0x7FFFFFFF
    if (iy | ly) == 0:
        return 1.0
    if x != x or y != y:
        return x + y
    yisint = 0
    if hx < 0:
        if iy >= 0x43400000:
            yisint = 2
        elif iy >= 0x3FF00000:
            k = (iy >> 20) - 0x3FF
            if k > 20:
                j = ly >> (52 - k)
                if ((j << (52 - k)) & 0xFFFFFFFF) == ly:
                    yisint = 2 - (j & 1)
            elif ly == 0:
                j = iy >> (20 - k)
                if (j << (20 - k)) == iy:
                    yisint = 2 - (j & 1)
    if ly == 0:
        if iy == 0x7FF00000:
            if ((ix - 0x3FF00000) | lx) == 0:
                return y - y
            if ix >= 0x3FF00000:
                return y if hy >= 0 else 0.0
            return -y if hy < 0 else 0.0
        if iy == 0x3FF00000:
            return fdiv(1.0, x) if hy < 0 else x
        if hy == 0x40000000:
            return x * x
        if hy == 0x3FE00000 and hx >= 0:
            return fsqrt(x)
    ax = math.fabs(x)
    if lx == 0 and (ix == 0x7FF00000 or ix == 0 or ix == 0x3FF00000):
        z = ax
        if hy < 0:
            z = fdiv(1.0, z)
        if hx < 0:
            if ((ix - 0x3FF00000) | yisint) == 0:
                z = NAN
            elif yisint == 1:
                z = -z
        return z
    n = (hx >> 31) + 1
    if (n | yisint) == 0:
        return NAN
    s = 1.0
    if (n | (yisint - 1)) == 0:
        s = -1.0
    if iy > 0x41E00000:
        if iy > 0x43F00000:
            if ix <= 0x3FEFFFFF:
                return huge * huge if hy < 0 else tiny * tiny
            if ix >= 0x3FF00000:
                return huge * huge if hy > 0 else tiny * tiny
        if ix < 0x3FEFFFFF:
            return s * huge * huge if hy < 0 else s * tiny * tiny
        if ix > 0x3FF00000:
            return s * huge * huge if hy > 0 else s * tiny * tiny
        t = ax - 1.0
        w = (t * t) * (0.5 - t * (0.3333333333333333333333 - t * 0.25))
        u = ivln2_h * t
        v = t * ivln2_l - w * ivln2
        t1 = set_low(u + v, 0)
        t2 = v - (t1 - u)
    else:
        n = 0
        if ix < 0x00100000:
            ax *= two53
            n -= 53
            ix = hiw(ax)
        n += (ix >> 20) - 0x3FF
        j = ix & 0x000FFFFF
        ix = j | 0x3FF00000
        if j <= 0x3988E:
            k = 0
        elif j < 0xBB67A:
            k = 1
        else:
            k = 0
            n += 1
            ix -= 0x00100000
        ax = set_high(ax, ix)
        u = ax - bp[k]
        v = 1.0 / (ax + bp[k])
        ss = u * v
        s_h = set_low(ss, 0)
        t_h = words(((ix >> 1) | 0x20000000) + 0x00080000 + (k << 18), 0)
        t_l = ax - (t_h - bp[k])
        s_l = v * ((u - s_h * t_h) - s_h * t_l)
        s2 = ss * ss
        r = s2 * s2 * (L1 + s2 * (L2 + s2 * (L3 + s2 * (L4 + s2 * (L5 + s2 * L6)))))
        r += s_l * (s_h + ss)
        s2 = s_h * s_h
        t_h = set_low(3.0 + s2 + r, 0)
        t_l = r - ((t_h - 3.0) - s2)
        u = s_h * t_h
        v = s_l * t_h + t_l * ss
        p_h = set_low(u + v, 0)
        p_l = v - (p_h - u)
        z_h = cp_h * p_h
        z_l = cp_l * p_h + p_l * cp + dp_l[k]
        t = float(n)
        t1 = set_low(((z_h + z_l) + dp_h[k]) + t, 0)
        t2 = z_l - (((t1 - t) - dp_h[k]) - z_h)
    y1 = set_low(y, 0)
    p_l = (y - y1) * t1 + y * t2
    p_h = y1 * t1
    z = p_l + p_h
    j = hiw(z)
    i = low(z)
    if j >= 0x40900000:
        if ((j - 0x40900000) | i) != 0:
            return s * huge * huge
        if p_l + ovt > z - p_h:
            return s * huge * huge
    elif (j & 0x7FFFFFFF) >= 0x4090CC00:
        if (((j - 0xC090CC00) & 0xFFFFFFFF) | i) != 0:
            return s * tiny * tiny
        if p_l <= z - p_h:
            return s * tiny * tiny
    i = j & 0x7FFFFFFF
    k = (i >> 20) - 0x3FF
    n = 0
    if i > 0x3FE00000:
        n = j + (0x00100000 >> (k + 1))
        k = ((n & 0x7FFFFFFF) >> 20) - 0x3FF
        t = words(n & ~(0x000FFFFF >> k), 0)
        n = ((n & 0x000FFFFF) | 0x00100000) >> (20 - k)
        if j < 0:
            n = -n
        p_h -= t
    t = set_low(p_l + p_h, 0)
    u = t * lg2_h
    v = (p_l - (t - p_h)) * lg2 + t * lg2_l
    z = u + v
    w = v - (z - u)
    t = z * z
    t1 = z - t * (P1 + t * (P2 + t * (P3 + t * (P4 + t * P5))))
    r = fdiv(z * t1, (t1 - 2.0) - (w + z * w))
    z = 1.0 - (r - z)
    j = hiw(z)
    j += n << 20
    if (j >> 20) <= 0:
        z = scalbn(z, n)
    else:
        z = set_high(z, hiw(z) + (n << 20))
    return s * z


# ---------------------------------------------------------------- hyperbolic
def sinh(x):
    KSINH_OVERFLOW = 710.4758600739439
    TWO_M28 = 3.725290298461914e-9
    LOG_MAXD = 709.7822265625
    shuge = 1.0e307
    h = -0.5 if x < 0 else 0.5
    ax = math.fabs(x)
    if ax < 22:
        if ax < TWO_M28:
            return x
        t = expm1(ax)
        if ax < 1:
            return h * (2 * t - t * t / (t + 1))
        return h * (t + t / (t + 1))
    if ax < LOG_MAXD:
        return h * exp(ax)
    if ax <= KSINH_OVERFLOW:
        w = exp(0.5 * ax)
        t = h * w
        return t * w
    return x * shuge


def cosh(x):
    KCOSH_OVERFLOW = 710.4758600739439
    huge = 1.0e+300
    ix = hiw(x) & 0x7FFFFFFF
    if ix < 0x3FD62E43:
        t = expm1(math.fabs(x))
        w = 1.0 + t
        if ix < 0x3C800000:
            return w
        return 1.0 + (t * t) / (w + w)
    if ix < 0x40360000:
        t = exp(math.fabs(x))
        return 0.5 * t + 0.5 / t
    if ix < 0x40862E42:
        return 0.5 * exp(math.fabs(x))
    if math.fabs(x) <= KCOSH_OVERFLOW:
        w = exp(0.5 * math.fabs(x))
        t = 0.5 * w
        return t * w
    if ix >= 0x7FF00000:
        return x * x
    return huge * huge


def tanh(x):
    tiny = 1.0e-300
    huge = 1.0e300
    jx = hiw(x)
    ix = jx & 0x7FFFFFFF
    if ix >= 0x7FF00000:
        return 1.0 / x + 1.0 if jx >= 0 else 1.0 / x - 1.0
    if ix < 0x40360000:
        if ix < 0x3E300000:
            if huge + x > 1.0:
                return x
        if ix >= 0x3FF00000:
            t = expm1(2.0 * math.fabs(x))
            z = 1.0 - 2.0 / (t + 2.0)
        else:
            t = expm1(-2.0 * math.fabs(x))
            z = -t / (t + 2.0)
    else:
        z = 1.0 - tiny
    return z if jx >= 0 else -z


# ---------------------------------------------------------------- the exact ones and the small helpers
def fround(x):   # half away from zero; keeps the sign of a zero result (round(-0.3) = -0)
    if x != x or x in (INF, -INF) or x == 0:
        return x
    t = _trunc(x)
    d = x - t
    if d >= 0.5:
        return t + 1.0
    if d <= -0.5:
        return t - 1.0
    return t


def fsign(x):
    if x != x or x == 0:
        return x
    return 1.0 if x > 0 else -1.0


def fmin(*a):
    r = a[0]
    for v in a[1:]:
        if v != v or r != r:
            r = NAN
        elif v < r or (v == 0 and r == 0 and _neg_zero(v)):
            r = v
    return r


def fmax(*a):
    r = a[0]
    for v in a[1:]:
        if v != v or r != r:
            r = NAN
        elif v > r or (v == 0 and r == 0 and _neg_zero(r)):
            r = v
    return r


def hypot(*a):
    inf = False
    nan = False
    m = 0.0
    for v in a:
        x = math.fabs(v)
        if x == INF:
            inf = True
        elif x != x:
            nan = True
        elif x > m:
            m = x
    if inf:
        return INF
    if nan:
        return NAN
    if m == 0:
        return 0.0
    s = 0.0
    for v in a:
        r = math.fabs(v) / m
        s += r * r
    return m * fsqrt(s)


PI = 3.141592653589793
E = 2.718281828459045

FUNCS = {   # name -> (min args, max args, function)
    'sin': (1, 1, sin), 'cos': (1, 1, cos), 'tan': (1, 1, tan), 'asin': (1, 1, asin), 'acos': (1, 1, acos),
    'atan': (1, 1, atan), 'atan2': (2, 2, atan2), 'sinh': (1, 1, sinh), 'cosh': (1, 1, cosh), 'tanh': (1, 1, tanh),
    'exp': (1, 1, exp), 'log': (1, 1, log), 'log10': (1, 1, log10), 'log2': (1, 1, log2), 'sqrt': (1, 1, fsqrt),
    'cbrt': (1, 1, cbrt), 'abs': (1, 1, math.fabs), 'sign': (1, 1, fsign), 'min': (1, 16, fmin), 'max': (1, 16, fmax),
    'floor': (1, 1, ffloor), 'ceil': (1, 1, fceil), 'round': (1, 1, fround), 'trunc': (1, 1, ftrunc), 'pow': (2, 2, pow),
    'hypot': (1, 16, hypot), 'clamp': (3, 3, lambda x, lo, hi: fmin(fmax(x, lo), hi)),
    'lerp': (3, 3, lambda a, b, t: a + (b - a) * t), 'step': (2, 2, lambda edge, x: 0.0 if x < edge else 1.0),
}
CONSTS = {'pi': PI, 'e': E}


# ---------------------------------------------------------------- errors
class ExprError(ValueError):
    def __init__(self, code, pos, msg):
        super().__init__(msg)
        self.code = code
        self.pos = pos
        self.msg = msg

    def as_dict(self):
        return {'code': self.code, 'pos': self.pos, 'msg': self.msg}


DEPTH_MSG = 'the expression is nested more than %d levels deep' % LIMITS['depth']
NODES_MSG = 'the expression has more than %d parts' % LIMITS['nodes']
FORBIDDEN = {'constructor', 'prototype', 'this', 'new', 'function', 'return', 'var', 'let', 'const', 'class',
             'typeof', 'void', 'delete', 'in', 'instanceof', 'null', 'undefined', 'NaN', 'Infinity', 'eval', 'arguments',
             'globalThis', 'window', 'self', 'import', 'export', 'with', 'yield', 'await', 'if', 'else', 'for', 'while', 'do',
             'super', 'None', 'True', 'False', 'and', 'or', 'not', 'is', 'lambda'}
_IDENT = re.compile(r'[A-Za-z_][A-Za-z0-9_]*')


def _is_forbidden(name):
    return name.startswith('__') or name in FORBIDDEN


def _valid_name(n):
    return isinstance(n, str) and _IDENT.fullmatch(n) is not None and not _is_forbidden(n) and n not in ('true', 'false')


def _arity_msg(name, mn, mx, got):
    if mn == mx:
        return '%s() takes %d argument%s, not %d' % (name, mn, '' if mn == 1 else 's', got)
    return '%s() takes %d to %d arguments, not %d' % (name, mn, mx, got)


# ---------------------------------------------------------------- lexer
def _digit(c):
    return '0' <= c <= '9' and c != ''


def _id_start(c):
    return c != '' and ('a' <= c <= 'z' or 'A' <= c <= 'Z' or c == '_')


def _id_char(c):
    return _id_start(c) or _digit(c)


_ONE = set('+-*/%^(),?:<>!')
_TWO = {'<=', '>=', '==', '!=', '&&', '||'}


def _char_msg(src, i):
    c = src[i]
    if c == '=':
        return "'=' (assignment) is not allowed; use == to compare"
    if c == '.':
        return "'.' (property access) is not allowed"
    if c in '[]':
        return "'" + c + "' (indexing) is not allowed"
    if c in '"\'`':
        return 'strings are not allowed'
    if c == '&':
        return "use && for 'and'"
    if c == '|':
        return "use || for 'or'"
    cp = ord(c)
    if 0x20 < cp < 0x7F:
        return "unexpected character '" + c + "'"
    return 'unexpected character U+%04X' % cp


def _lex(src):
    out = []
    n = len(src)
    ch = lambda k: src[k] if k < n else ''
    i = 0
    while i < n:
        c = src[i]
        if c in ' \t\n\r':
            i += 1
            continue
        if _digit(c) or (c == '.' and _digit(ch(i + 1))):
            j = i
            while _digit(ch(j)):
                j += 1
            if ch(j) == '.':
                j += 1
                while _digit(ch(j)):
                    j += 1
            if ch(j) in ('e', 'E'):
                k = j + 1
                if ch(k) in ('+', '-'):
                    k += 1
                if _digit(ch(k)):
                    while _digit(ch(k)):
                        k += 1
                    j = k
            if _id_char(ch(j)) or ch(j) == '.':
                raise ExprError('E_NUMBER', i, 'malformed number')
            text = src[i:j]
            v = float(text)
            if v in (INF, -INF):
                raise ExprError('E_NUMBER', i, 'the number ' + text + ' is too large')
            out.append(('num', v, text, i))
            i = j
            continue
        if _id_start(c):
            j = i + 1
            while _id_char(ch(j)):
                j += 1
            name = src[i:j]
            if _is_forbidden(name):
                raise ExprError('E_FORBIDDEN', i, "the name '" + name + "' is not allowed")
            if name in ('true', 'false'):
                out.append(('bool', name == 'true', name, i))
            else:
                out.append(('id', name, name, i))
            i = j
            continue
        two = src[i:i + 2]
        if two in _TWO:
            out.append(('op', two, two, i))
            i += 2
            continue
        if c in _ONE:
            out.append(('op', c, c, i))
            i += 1
            continue
        raise ExprError('E_CHAR', i, _char_msg(src, i))
    out.append(('end', '', '', n))
    return out


# ---------------------------------------------------------------- parser (syntax and the size limits)
def _utf16_len(s):
    return len(s) + sum(1 for c in s if ord(c) > 0xFFFF)


class _Parser:
    def __init__(self, toks):
        self.toks = toks
        self.p = 0
        self.level = 0
        self.count = 0
        self.depth = {}

    def is_op(self, v):
        t = self.toks[self.p]
        return t[0] == 'op' and t[1] == v

    def mk(self, node, kids):
        d = 0
        for kid in kids:
            kd = self.depth[id(kid)]
            if kd > d:
                d = kd
        d += 1
        if d > LIMITS['depth']:
            raise ExprError('E_DEPTH', node['pos'], DEPTH_MSG)
        self.count += 1
        if self.count > LIMITS['nodes']:
            raise ExprError('E_TOO_BIG', node['pos'], NODES_MSG)
        self.depth[id(node)] = d
        return node

    def enter(self, pos):
        self.level += 1
        if self.level > LIMITS['depth']:
            raise ExprError('E_DEPTH', pos, DEPTH_MSG)

    def unexpected(self, t):
        if t[0] == 'end':
            return ExprError('E_SYNTAX', t[3], 'unexpected end of the expression')
        return ExprError('E_SYNTAX', t[3], "unexpected '" + t[2] + "'")

    def ternary(self):
        self.enter(self.toks[self.p][3])
        node = self.binary(2)
        if self.is_op('?'):
            pos = self.toks[self.p][3]
            self.p += 1
            a = self.ternary()
            if not self.is_op(':'):
                raise ExprError('E_SYNTAX', self.toks[self.p][3], "expected ':'")
            self.p += 1
            b = self.ternary()
            node = self.mk({'t': 'cond', 'c': node, 'a': a, 'b': b, 'pos': pos}, [node, a, b])
        self.level -= 1
        return node

    # precedence climbing over || (2) && (3) == != (4) < <= > >= (5) + - (6) * / % (7): left-assoc, comparisons not chained
    @staticmethod
    def bin_prec(t):
        return PREC[t[1]] if t[0] == 'op' and t[1] != '^' and t[1] in PREC else 0

    def binary(self, min_prec):
        left = self.unary()
        while True:
            t = self.toks[self.p]
            prec = self.bin_prec(t)
            if prec == 0 or prec < min_prec:
                return left
            self.p += 1
            right = self.binary(prec + 1)
            left = self.mk({'t': 'bin', 'op': t[1], 'a': left, 'b': right, 'pos': t[3]}, [left, right])
            if prec in (4, 5) and self.bin_prec(self.toks[self.p]) == prec:
                raise ExprError('E_SYNTAX', self.toks[self.p][3], 'comparisons cannot be chained (use && between them)')

    def unary(self):
        t = self.toks[self.p]
        if t[0] == 'op' and t[1] in ('-', '+', '!'):
            self.p += 1
            self.enter(t[3])
            a = self.unary()
            self.level -= 1
            return self.mk({'t': 'un', 'op': t[1], 'a': a, 'pos': t[3]}, [a])
        return self.power()

    def power(self):
        base = self.primary()
        if not self.is_op('^'):
            return base
        t = self.toks[self.p]
        self.p += 1
        self.enter(t[3])
        ex = self.unary()
        self.level -= 1
        return self.mk({'t': 'bin', 'op': '^', 'a': base, 'b': ex, 'pos': t[3]}, [base, ex])

    def primary(self):
        t = self.toks[self.p]
        if t[0] == 'num':
            self.p += 1
            return self.mk({'t': 'num', 'v': t[1], 'pos': t[3]}, [])
        if t[0] == 'bool':
            self.p += 1
            return self.mk({'t': 'bool', 'v': t[1], 'pos': t[3]}, [])
        if t[0] == 'id':
            self.p += 1
            if self.is_op('('):
                self.p += 1
                args = []
                if not self.is_op(')'):
                    while True:
                        args.append(self.ternary())
                        if self.is_op(','):
                            self.p += 1
                            continue
                        if self.is_op(')'):
                            break
                        raise ExprError('E_SYNTAX', self.toks[self.p][3], "expected ',' or ')'")
                self.p += 1
                return self.mk({'t': 'call', 'fn': t[1], 'args': args, 'pos': t[3]}, args)
            if t[1] in CONSTS:
                return self.mk({'t': 'const', 'name': t[1], 'pos': t[3]}, [])
            return self.mk({'t': 'var', 'name': t[1], 'pos': t[3]}, [])
        if self.is_op('('):
            self.p += 1
            node = self.ternary()
            if not self.is_op(')'):
                raise ExprError('E_SYNTAX', self.toks[self.p][3], "expected ')'")
            self.p += 1
            return node
        raise self.unexpected(t)


def _parse_syntax(src):
    if not isinstance(src, str):
        raise ExprError('E_SOURCE', 0, 'the expression must be a string')
    if _utf16_len(src) > LIMITS['src']:
        raise ExprError('E_TOO_LONG', LIMITS['src'], 'the expression is longer than %d characters' % LIMITS['src'])
    toks = _lex(src)
    if len(toks) == 1:
        raise ExprError('E_EMPTY', 0, 'the expression is empty')
    p = _Parser(toks)
    ast = p.ternary()
    if toks[p.p][0] != 'end':
        raise p.unexpected(toks[p.p])
    return ast


# ---------------------------------------------------------------- a tree from outside (JSON): checked node by node
_UN_OPS = {'-', '+', '!'}
PREC = {'||': 2, '&&': 3, '==': 4, '!=': 4, '<': 5, '<=': 5, '>': 5, '>=': 5, '+': 6, '-': 6, '*': 7, '/': 7, '%': 7, '^': 9}


def _is_int(v):
    return (isinstance(v, int) and not isinstance(v, bool)) or (isinstance(v, float) and v == v and v not in (INF, -INF) and v == int(v))


def _pos_of(n):
    if isinstance(n, dict):
        p = n.get('pos')
        if _is_int(p) and p >= 0:
            return int(p)
    return -1


def _validate_ast(root):
    count = [0]

    def bad(node, why):
        return ExprError('E_AST', _pos_of(node), 'malformed expression tree: ' + why)

    def walk(node, d):
        if d > LIMITS['depth']:
            raise ExprError('E_DEPTH', _pos_of(node), DEPTH_MSG)
        count[0] += 1
        if count[0] > LIMITS['nodes']:
            raise ExprError('E_TOO_BIG', _pos_of(node), NODES_MSG)
        if not isinstance(node, dict):
            raise bad(node, 'a node is not an object')
        if 'pos' in node and _pos_of(node) < 0:
            raise bad(node, "'pos' must be a whole number >= 0")
        t = node.get('t')
        if t == 'num':
            v = node.get('v')
            if isinstance(v, bool) or not isinstance(v, (int, float)) or v != v or v in (INF, -INF) or v < 0 or _neg_zero(v):
                raise bad(node, 'a number must be finite and not negative')
        elif t == 'bool':
            if not isinstance(node.get('v'), bool):
                raise bad(node, "'v' of a bool must be true or false")
        elif t == 'const':
            if node.get('name') not in ('pi', 'e'):
                raise bad(node, 'the constants are pi and e')
        elif t == 'var':
            if not _valid_name(node.get('name')) or node.get('name') in CONSTS:
                raise bad(node, 'a variable needs a valid name')
        elif t == 'un':
            if node.get('op') not in _UN_OPS:
                raise bad(node, 'unknown unary operator')
            walk(node.get('a'), d + 1)
        elif t == 'bin':
            if node.get('op') not in PREC:
                raise bad(node, 'unknown binary operator')
            walk(node.get('a'), d + 1)
            walk(node.get('b'), d + 1)
        elif t == 'cond':
            walk(node.get('c'), d + 1)
            walk(node.get('a'), d + 1)
            walk(node.get('b'), d + 1)
        elif t == 'call':
            if not _valid_name(node.get('fn')):
                raise bad(node, 'a function needs a valid name')
            if not isinstance(node.get('args'), list):
                raise bad(node, "'args' must be a list")
            for a in node['args']:
                walk(a, d + 1)
        else:
            raise bad(node, 'unknown node type')

    walk(root, 1)
    return root


# ---------------------------------------------------------------- meaning: functions, arity, variables
def _extra_names(names):
    s = set()
    for name in names or []:
        if not _valid_name(name):
            raise ExprError('E_FORBIDDEN', -1, "the name '" + str(name) + "' is not allowed for a function")
        s.add(name)
    return s


def _semantic(ast, vars_, extra):
    errs = []

    def walk(n):
        t = n['t']
        if t == 'var':
            if vars_ is not None and n['name'] not in vars_:
                errs.append({'code': 'E_UNKNOWN_VAR', 'pos': _pos_of(n), 'msg': "unknown variable '" + n['name'] + "'"})
        elif t == 'un':
            walk(n['a'])
        elif t == 'bin':
            walk(n['a'])
            walk(n['b'])
        elif t == 'cond':
            walk(n['c'])
            walk(n['a'])
            walk(n['b'])
        elif t == 'call':
            d = FUNCS.get(n['fn'])
            mn, mx = (d[0], d[1]) if d else (0, LIMITS['args'])
            if not d and n['fn'] not in extra:
                errs.append({'code': 'E_UNKNOWN_FN', 'pos': _pos_of(n), 'msg': "unknown function '" + n['fn'] + "'"})
            elif len(n['args']) < mn or len(n['args']) > mx:
                errs.append({'code': 'E_ARITY', 'pos': _pos_of(n), 'msg': _arity_msg(n['fn'], mn, mx, len(n['args']))})
            for a in n['args']:
                walk(a)

    walk(ast)
    errs.sort(key=lambda e: e['pos'])
    return errs


def _throw_first(errs):
    if errs:
        raise ExprError(errs[0]['code'], errs[0]['pos'], errs[0]['msg'])


def parse(src, fns=None):
    """→ the tree (dicts); raises ExprError(code, pos, msg). fns: extra function names allowed."""
    ast = _parse_syntax(src)
    _throw_first(_semantic(ast, None, _extra_names(fns)))
    return ast


def check(src, vars=None, fns=None, finite=False):
    """→ [] or [{code, pos, msg}]. vars: the known variable names (None: not checked); finite is documentation only."""
    try:
        ast = _parse_syntax(src)
    except ExprError as e:
        return [e.as_dict()]
    vs = None if vars is None else {v for v in vars if isinstance(v, str)}
    try:
        extra = _extra_names(fns)
    except ExprError as e:
        return [e.as_dict()]
    return _semantic(ast, vs, extra)


# ---------------------------------------------------------------- evaluation: a tree of closures
def _num(v):
    if v is True:
        return 1.0
    if v is False:
        return 0.0
    return v


def _truthy(v):
    if isinstance(v, bool):
        return v
    return v != 0 and v == v


def _build(node, ext):
    pos = _pos_of(node)
    t = node['t']
    if t in ('num', 'bool'):
        v = node['v'] if t == 'bool' else float(node['v'])
        return lambda env: v
    if t == 'const':
        v = CONSTS[node['name']]
        return lambda env: v
    if t == 'var':
        name = node['name']

        def var(env):
            if name not in env:
                raise ExprError('E_UNKNOWN_VAR', pos, "unknown variable '" + name + "'")
            v = env[name]
            if isinstance(v, bool):
                return v
            if isinstance(v, (int, float)):
                try:
                    return float(v)
                except OverflowError:
                    pass
            raise ExprError('E_VALUE', pos, "the variable '" + name + "' is not a number or a boolean")
        return var
    if t == 'un':
        a = _build(node['a'], ext)
        op = node['op']
        if op == '-':
            return lambda env: -_num(a(env))
        if op == '+':
            return lambda env: _num(a(env))
        return lambda env: not _truthy(a(env))
    if t == 'cond':
        c = _build(node['c'], ext)
        a = _build(node['a'], ext)
        b = _build(node['b'], ext)
        return lambda env: a(env) if _truthy(c(env)) else b(env)
    if t == 'bin':
        a = _build(node['a'], ext)
        b = _build(node['b'], ext)
        op = node['op']
        if op == '&&':
            return lambda env: _truthy(b(env)) if _truthy(a(env)) else False
        if op == '||':
            return lambda env: True if _truthy(a(env)) else _truthy(b(env))
        f = _BIN[op]

        def binop(env):
            x = _num(a(env))
            return f(x, _num(b(env)))
        return binop
    if t == 'call':
        args = [_build(x, ext) for x in node['args']]
        name = node['fn']
        d = FUNCS.get(name)
        if d:
            f = d[2]
            return lambda env: f(*[_num(g(env)) for g in args])
        f = ext[name]

        def call(env):
            r = f(*[_num(g(env)) for g in args])
            if isinstance(r, bool):
                return r
            if isinstance(r, (int, float)):
                return float(r)
            raise ExprError('E_VALUE', pos, "the function '" + name + "' did not return a number or a boolean")
        return call
    raise ExprError('E_AST', pos, 'malformed expression tree: unknown node type')


_BIN = {
    '+': lambda x, y: x + y, '-': lambda x, y: x - y, '*': lambda x, y: x * y, '/': fdiv, '%': frem, '^': pow,
    '<': lambda x, y: x < y, '<=': lambda x, y: x <= y, '>': lambda x, y: x > y, '>=': lambda x, y: x >= y,
    '==': lambda x, y: x == y, '!=': lambda x, y: x != y,
}


def compile(src_or_tree, fns=None):   # noqa: A001  (the twin of NoemaExpr.compile)
    """→ callable(env) -> float | bool. fns: {name: callable} host functions (the built-ins win)."""
    ext = {k: v for k, v in (fns or {}).items() if callable(v)}
    extra = _extra_names(list(ext))
    ast = _parse_syntax(src_or_tree) if isinstance(src_or_tree, str) else _validate_ast(src_or_tree)
    _throw_first(_semantic(ast, None, extra))
    run = _build(ast, ext)

    def evaluate_compiled(env=None):
        if env is None:
            env = {}
        if not isinstance(env, dict):
            raise ExprError('E_ENV', 0, 'the variables must be given as an object')
        return run(env)
    return evaluate_compiled


def evaluate(src_or_tree, env=None, fns=None):
    return compile(src_or_tree, fns)(env)


# ---------------------------------------------------------------- printer: the canonical source of a tree
def js_number(v):
    """The shortest round-trip text of a double, formatted as JavaScript's String(v) (v finite, >= 0)."""
    if v == 0:
        return '0'
    r = repr(float(v))
    m = re.fullmatch(r'(\d+)(?:\.(\d+))?(?:e([+-]\d+))?', r)
    ip, fp, ex = m.group(1), m.group(2) or '', int(m.group(3) or 0)
    digits = ip + fp
    point = len(ip) + ex
    stripped = digits.lstrip('0')
    point -= len(digits) - len(stripped)
    digits = stripped.rstrip('0')
    k, n = len(digits), point
    if k <= n <= 21:
        return digits + '0' * (n - k)
    if 0 < n <= 21:
        return digits[:n] + '.' + digits[n:]
    if -6 < n <= 0:
        return '0.' + '0' * (-n) + digits
    e = n - 1
    es = ('+' if e >= 0 else '-') + str(abs(e))
    return digits + 'e' + es if k == 1 else digits[0] + '.' + digits[1:] + 'e' + es


def _prec_of(n):
    t = n['t']
    if t == 'cond':
        return 1
    if t == 'bin':
        return PREC[n['op']]
    if t == 'un':
        return 8
    return 10


def _pr(n):
    t = n['t']
    if t == 'num':
        return js_number(n['v'])
    if t == 'bool':
        return 'true' if n['v'] else 'false'
    if t in ('const', 'var'):
        return n['name']
    if t == 'call':
        return n['fn'] + '(' + ', '.join(_pr(a) for a in n['args']) + ')'
    if t == 'un':
        return n['op'] + _wrap(n['a'], 8)
    if t == 'cond':
        return _wrap(n['c'], 2) + ' ? ' + _pr(n['a']) + ' : ' + _pr(n['b'])
    p = PREC[n['op']]
    if n['op'] == '^':
        return _wrap(n['a'], 10) + '^' + _wrap(n['b'], 8)
    if p in (4, 5):
        return _wrap(n['a'], p + 1) + ' ' + n['op'] + ' ' + _wrap(n['b'], p + 1)
    return _wrap(n['a'], p) + ' ' + n['op'] + ' ' + _wrap(n['b'], p + 1)


def _wrap(n, min_prec):
    return _pr(n) if _prec_of(n) >= min_prec else '(' + _pr(n) + ')'


def print_ast(ast):
    """→ source that parses back to the same tree (only the brackets it needs). The twin of NoemaExpr.print."""
    return _pr(_validate_ast(ast))


# ---------------------------------------------------------------- the command line and the test batch
def encode(v):
    """A value for JSON: numbers as they are, and the ones JSON cannot hold as strings (NaN, Infinity, -Infinity, -0)."""
    if isinstance(v, bool):
        return v
    if v != v:
        return 'NaN'
    if v == INF:
        return 'Infinity'
    if v == -INF:
        return '-Infinity'
    if _neg_zero(v):
        return '-0'
    return float(v)


def decode(v):
    if isinstance(v, str):
        return {'NaN': NAN, 'Infinity': INF, '-Infinity': -INF, '-0': -0.0}.get(v, v)
    return v


def _job(j):
    k = j.get('k')
    if k == 'fn':
        d = FUNCS[j['fn']]
        return {'value': encode(d[2](*[float(decode(a)) for a in j['args']]))}
    out = {}
    env = {name: decode(v) for name, v in (j.get('env') or {}).items()}
    if k == 'ast':
        try:
            out['print'] = print_ast(j['ast'])
        except ExprError as e:
            out['print'] = {'error': e.as_dict()}
        target = j['ast']
    else:
        src = j['src']
        try:
            ast = parse(src)
            out['ast'] = ast
            out['print'] = print_ast(ast)
        except ExprError as e:
            out['ast'] = {'error': e.as_dict()}
        out['check'] = check(src, vars=j.get('vars'))
        target = src
    try:
        out['value'] = encode(evaluate(target, env))
    except ExprError as e:
        out['value'] = {'error': e.as_dict()}
    return out


def main(argv):
    if argv[1:2] == ['--batch']:
        jobs = json.load(sys.stdin)
        json.dump([_job(j) for j in jobs], sys.stdout, allow_nan=False)
        return 0
    if len(argv) < 2:
        print(__doc__)
        return 2
    env = {}
    for a in argv[2:]:
        name, _, v = a.partition('=')
        env[name] = {'true': True, 'false': False}.get(v) if v in ('true', 'false') else float(v)
    try:
        print(encode(evaluate(argv[1], env)))
    except ExprError as e:
        print('%s at %d: %s' % (e.code, e.pos, e.msg), file=sys.stderr)
        return 1
    return 0


if __name__ == '__main__':
    sys.exit(main(sys.argv))
