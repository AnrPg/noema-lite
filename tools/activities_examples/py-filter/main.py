"""py-filter — a moving-average or a first-order (RC-like) digital low-pass filter at fs = 8 kHz (py-module@1, numpy).
The app draws the controls, readouts and plots of spec.json; step() returns their numbers for the latest inputs."""
import numpy as np

FS = 8000.0                                   # the sampling rate (Hz)
F = np.logspace(1, np.log10(FS / 2), 240)     # 10 Hz … 4 kHz, the x axis of the gain plot
NSTEP = 40                                    # samples of the step response


def gain(kind, n, fc, f):
    """|H(f)| of the filter: the mean of the last n samples, or y[k] = y[k-1] + a·(x[k] − y[k-1])"""
    w = 2 * np.pi * np.asarray(f, dtype=float) / FS
    if kind == 0:
        k = np.arange(n)
        return np.abs(np.exp(-1j * np.outer(w, k)).sum(axis=1) / n)
    a = 1 - np.exp(-2 * np.pi * fc / FS)
    return np.abs(a / (1 - (1 - a) * np.exp(-1j * w)))


def db(m):
    return 20 * np.log10(np.maximum(m, 1e-6))   # an exact zero of the filter shows as −120 dB


def step(inputs, state):
    kind = int(round(inputs.get("kind", 0)))
    n = max(1, int(round(inputs.get("N", 4))))
    fc = float(inputs.get("fc", 500.0))
    g = db(gain(kind, n, fc, F))
    x = np.ones(NSTEP)
    if kind == 0:
        y = np.convolve(x, np.ones(n) / n)[:NSTEP]
    else:
        a = 1 - np.exp(-2 * np.pi * fc / FS)
        y = 1 - (1 - a) ** np.arange(1, NSTEP + 1)
    down = np.nonzero(g < -3.0103)[0]
    return {
        "f": F, "gain": g, "k": np.arange(NSTEP), "y": y,
        "att1k": float(db(gain(kind, n, fc, [1000.0]))[0]),
        "pass300": float(db(gain(kind, n, fc, [300.0]))[0]),
        "f3": float(F[down[0]]) if down.size else float("nan"),   # no −3 dB point up to fs/2 (N = 1, a fast first-order filter): the readout says so ("—")
    }
