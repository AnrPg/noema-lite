;; A damped oscillator for wasm-module@1 (tests/activities_wasm.js). Assembled by watasm.py (wat2wasm accepts it too).
;; step(pin, nin, pout, nout): inputs f64[5] = k, c, x0, v0, dt; outputs f64[2n+1] = t[0..n-1], x[0..n-1], E (after n steps)
;;   semi-implicit Euler: a = -(k*x) - c*v;  v = v + a*dt;  x = x + v*dt;  E = 0.5*v*v + 0.5*k*x*x
;; spin(...): an endless loop (the runaway test) · grow(n): memory.grow (the memory limit test) · rnd(...): noema_random() per output
(module
  (import "noema" "noema_log" (func $log (param i32 i32)))
  (import "noema" "noema_random" (func $random (result f64)))
  (memory (export "memory") 1 2)
  (data (i32.const 16) "osc ready")
  (func $init (export "init") (param $seed i32)
    i32.const 16 i32.const 9 call $log)
  (func $step (export "step") (param $pin i32) (param $nin i32) (param $pout i32) (param $nout i32)
    (local $i i32) (local $n i32) (local $k f64) (local $c f64) (local $x f64) (local $v f64) (local $dt f64)
    local.get $pin f64.load local.set $k
    local.get $pin f64.load offset=8 local.set $c
    local.get $pin f64.load offset=16 local.set $x
    local.get $pin f64.load offset=24 local.set $v
    local.get $pin f64.load offset=32 local.set $dt
    local.get $nout i32.const 1 i32.sub i32.const 1 i32.shr_u local.set $n
    i32.const 0 local.set $i
    block $done
      loop $next
        local.get $i local.get $n i32.ge_s br_if $done
        local.get $pout local.get $i i32.const 3 i32.shl i32.add
        local.get $i f64.convert_i32_s local.get $dt f64.mul
        f64.store
        local.get $pout local.get $n local.get $i i32.add i32.const 3 i32.shl i32.add
        local.get $x
        f64.store
        local.get $k local.get $x f64.mul f64.neg local.get $c local.get $v f64.mul f64.sub
        local.get $dt f64.mul local.get $v f64.add local.set $v
        local.get $v local.get $dt f64.mul local.get $x f64.add local.set $x
        local.get $i i32.const 1 i32.add local.set $i
        br $next
      end
    end
    local.get $pout local.get $n i32.const 4 i32.shl i32.add
    f64.const 0.5 local.get $v f64.mul local.get $v f64.mul
    f64.const 0.5 local.get $k f64.mul local.get $x f64.mul local.get $x f64.mul
    f64.add
    f64.store)
  (func $spin (export "spin") (param i32 i32 i32 i32)
    loop $forever
      br $forever
    end)
  (func $grow (export "grow") (param $pages i32) (result i32)
    local.get $pages memory.grow)
  (func $rnd (export "rnd") (param $pin i32) (param $nin i32) (param $pout i32) (param $nout i32)
    (local $i i32)
    block $done
      loop $next
        local.get $i local.get $nout i32.ge_s br_if $done
        local.get $pout local.get $i i32.const 3 i32.shl i32.add
        call $random
        f64.store
        local.get $i i32.const 1 i32.add local.set $i
        br $next
      end
    end)
)
